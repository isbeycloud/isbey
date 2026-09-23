import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import {
  Zap, RefreshCw, Search, CheckCircle2, XCircle,
  Clock, AlertTriangle, ChevronRight, X
} from 'lucide-react';

// â”€â”€â”€ Tipler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type IntegrationStatus = 'ACTIVE' | 'PASSIVE' | 'PENDING' | 'ERROR';

interface IntegrationRow {
  tenantId: string;
  tenantName: string;
  taxNumber: string;
  city: string;
  status: string;
  dealerId: string | null;
  dealerName: string;
  provider: string | null;
  environment: string | null;
  integrationEnabled: boolean;
  integrationStatus: IntegrationStatus;
  einvoiceStatus: string | null;
  lastSyncedAt: string | null;
  integrationEnabledAt: string | null;
  integrationDisabledAt: string | null;
}

interface Summary {
  total: number;
  active: number;
  passive: number;
  pending: number;
  error: number;
  dealerCount: number;
}

// â”€â”€â”€ YardÄ±mcÄ±: durum badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_CONFIG: Record<IntegrationStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ACTIVE:  { label: 'Aktif',     color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   icon: <CheckCircle2 size={11} /> },
  PASSIVE: { label: 'Pasif',     color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: <XCircle size={11} /> },
  PENDING: { label: 'Beklemede', color: '#d97706', bg: 'rgba(217,119,6,0.1)',   icon: <Clock size={11} /> },
  ERROR:   { label: 'Hata',      color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   icon: <AlertTriangle size={11} /> },
};

function StatusBadge({ status }: { status: IntegrationStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', fontWeight: 700, padding: '2px 8px',
      borderRadius: '20px', color: cfg.color,
      background: cfg.bg, border: `1px solid ${cfg.color}30`,
      whiteSpace: 'nowrap',
    }}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ToggleSwitch({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <div style={{
      width: '36px', height: '20px', borderRadius: '10px',
      background: on ? '#16a34a' : '#cbd5e1',
      position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{
        position: 'absolute', top: '3px',
        left: on ? '19px' : '3px',
        width: '14px', height: '14px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
      }} />
    </div>
  );
}

// â”€â”€â”€ Onay ModalÄ± â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ConfirmModalProps {
  row: IntegrationRow;
  targetEnabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}
function ConfirmModal({ row, targetEnabled, onConfirm, onCancel, loading }: ConfirmModalProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '12px',
        padding: '24px', width: '420px', maxWidth: '95vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        border: '1px solid var(--border-color)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {targetEnabled
              ? <CheckCircle2 size={20} color="#16a34a" />
              : <XCircle size={20} color="#dc2626" />}
            <span style={{ fontWeight: 700, fontSize: '15px' }}>
              {targetEnabled ? 'Entegrasyonu AÃ§' : 'Entegrasyonu Kapat'}
            </span>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{
          background: 'var(--bg-surface-secondary)', borderRadius: '8px',
          padding: '12px 14px', marginBottom: '16px', fontSize: '13px',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>{row.tenantName}</div>
          <div>VKN: {row.taxNumber}</div>
          {targetEnabled
            ? <div style={{ marginTop: '8px', color: '#16a34a' }}>Ä°ÅBEY ERP kullanÄ±cÄ± entegrasyonu aktif edilecek.</div>
            : <div style={{ marginTop: '8px', color: '#dc2626' }}>Entegrasyon durdurulacak. <strong>Mevcut kullanÄ±cÄ±lar silinmeyecek.</strong></div>
          }
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>VazgeÃ§</button>
          <button
            className={`btn ${targetEnabled ? 'btn-primary' : 'btn-danger'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Ä°ÅŸleniyor...' : targetEnabled ? 'Entegrasyonu AÃ§' : 'Entegrasyonu Kapat'}
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Detay Paneli â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DetailPanel({ row, onClose }: { row: IntegrationRow; onClose: () => void }) {
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('tr-TR') : 'â€”';
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: '340px', background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border-color)',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
      zIndex: 500, overflowY: 'auto', padding: '20px',
      display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: '14px' }}>Firma DetayÄ±</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={18} />
        </button>
      </div>
      <StatusBadge status={row.integrationStatus} />
      {[
        { k: 'Firma', v: row.tenantName },
        { k: 'VKN', v: row.taxNumber || 'â€”' },
        { k: 'Åehir', v: row.city || 'â€”' },
        { k: 'Durum', v: row.status },
        { k: 'Bayi', v: row.dealerName },
        { k: 'Provider', v: row.provider || 'â€”' },
        { k: 'Ortam', v: row.environment || 'â€”' },
        { k: 'e-Fatura Durumu', v: row.einvoiceStatus || 'â€”' },
        { k: 'Son Senkronizasyon', v: fmt(row.lastSyncedAt) },
        { k: 'Entegrasyon AÃ§Ä±ldÄ±', v: fmt(row.integrationEnabledAt) },
        { k: 'Entegrasyon KapatÄ±ldÄ±', v: fmt(row.integrationDisabledAt) },
      ].map(({ k, v }) => (
        <div key={k} style={{
          display: 'flex', flexDirection: 'column', gap: '2px',
          padding: '8px 10px', background: 'var(--bg-surface-secondary)',
          borderRadius: '6px',
        }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k}</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// â”€â”€â”€ Ana bileÅŸen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const HizliIntegrationManagementTab: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDealer, setFilterDealer] = useState<string>('ALL');

  const [selectedRow, setSelectedRow] = useState<IntegrationRow | null>(null);
  const [confirmState, setConfirmState] = useState<{ row: IntegrationRow; targetEnabled: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await (api as any).getHizliIntegrations?.();
      if (res?.success) {
        setIntegrations(res.integrations || []);
        setSummary(res.summary || null);
      } else {
        setError('Entegrasyon listesi alÄ±namadÄ±.');
      }
    } catch (err: any) {
      setError('Sunucuya ulaÅŸÄ±lamadÄ±. LÃ¼tfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtreli liste
  const filtered = integrations.filter(r => {
    if (filterStatus !== 'ALL' && r.integrationStatus !== filterStatus) return false;
    if (filterDealer !== 'ALL' && r.dealerId !== filterDealer) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.tenantName.toLowerCase().includes(q) && !r.taxNumber.includes(q)) return false;
    }
    return true;
  });

  const dealers = Array.from(new Map(integrations.map(r => [r.dealerId, r.dealerName])).entries());

  const handleToggleClick = (row: IntegrationRow) => {
    if (!isSuperAdmin) return;
    setConfirmState({ row, targetEnabled: !row.integrationEnabled });
  };

  const handleConfirm = async () => {
    if (!confirmState) return;
    setToggling(true);
    try {
      const res = await (api as any).setHizliIntegration?.(confirmState.row.tenantId, confirmState.targetEnabled);
      if (res?.success) {
        setIntegrations(prev => prev.map(r =>
          r.tenantId === confirmState.row.tenantId
            ? {
                ...r,
                integrationEnabled: confirmState.targetEnabled,
                integrationStatus: confirmState.targetEnabled
                  ? (r.einvoiceStatus === 'ACTIVE' ? 'ACTIVE' : 'PENDING')
                  : 'PASSIVE',
              }
            : r
        ));
        setConfirmState(null);
        // Tam veriyi yenile
        await load();
      } else {
        setError(res?.message || 'Entegrasyon durumu gÃ¼ncellenemedi. LÃ¼tfen tekrar deneyin.');
        setConfirmState(null);
      }
    } catch {
      setError('Ä°ÅŸlem baÅŸarÄ±sÄ±z oldu. LÃ¼tfen tekrar deneyin.');
      setConfirmState(null);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* BaÅŸlÄ±k */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Zap size={15} color="#0284c7" />
            HÄ±zlÄ± BiliÅŸim EntegrasyonlarÄ±
          </h3>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
            HÄ±zlÄ± BiliÅŸim Ã¼zerinden Ä°ÅBEY ERP kullanan bayi ve firmalarÄ±n entegrasyon durumlarÄ±nÄ± yÃ¶netin.
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          <span>Yenile</span>
        </button>
      </div>

      {/* Ã–zet */}
      {summary && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Toplam Firma', value: summary.total, color: '#0284c7' },
            { label: 'Aktif', value: summary.active, color: '#16a34a' },
            { label: 'Pasif', value: summary.passive, color: '#64748b' },
            { label: 'Beklemede', value: summary.pending, color: '#d97706' },
            { label: 'Hata', value: summary.error, color: '#dc2626' },
          ].map(s => (
            <div key={s.label} style={{
              padding: '8px 16px', background: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-color)', borderRadius: '8px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '80px',
            }}>
              <span style={{ fontSize: '20px', fontWeight: 900, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</span>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filtreler */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Firma adÄ± veya VKN..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px 7px 30px',
              border: '1px solid var(--border-color)', borderRadius: '6px',
              background: 'var(--bg-surface)', fontSize: '12px',
              color: 'var(--text-main)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-surface)', fontSize: '12px', color: 'var(--text-main)' }}
        >
          <option value="ALL">TÃ¼m Durumlar</option>
          <option value="ACTIVE">Aktif</option>
          <option value="PASSIVE">Pasif</option>
          <option value="PENDING">Beklemede</option>
          <option value="ERROR">Hata</option>
        </select>
        {dealers.length > 1 && (
          <select
            value={filterDealer}
            onChange={e => setFilterDealer(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-surface)', fontSize: '12px', color: 'var(--text-main)' }}
          >
            <option value="ALL">TÃ¼m Bayiler</option>
            {dealers.map(([id, name]) => <option key={id || 'null'} value={id || ''}>{name}</option>)}
          </select>
        )}
      </div>

      {/* Hata bandÄ± */}
      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '6px', fontSize: '12.5px', color: '#dc2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
        </div>
      )}

      {/* Tablo */}
      <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '2px solid var(--border-color)' }}>
                {['Bayi', 'Firma', 'VKN', 'Ortam', 'Entegrasyon', 'Durum', 'Ä°ÅŸlemler'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>YÃ¼kleniyor...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {integrations.length === 0 ? 'HÄ±zlÄ± BiliÅŸim entegrasyonu bulunan kiracÄ± yok.' : 'Filtre sonucu bulunamadÄ±.'}
                </td></tr>
              )}
              {!loading && filtered.map(row => (
                <tr
                  key={row.tenantId}
                  style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  onClick={() => setSelectedRow(selectedRow?.tenantId === row.tenantId ? null : row)}
                >
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                    {row.dealerName}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{row.tenantName}</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{row.city}</div>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {row.taxNumber || 'â€”'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {row.environment
                      ? <span style={{ fontSize: '11px', fontWeight: 700, color: row.environment === 'PRODUCTION' ? '#16a34a' : '#d97706' }}>{row.environment}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>â€”</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusBadge status={row.integrationStatus} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isSuperAdmin ? 'pointer' : 'default' }}
                      onClick={e => { e.stopPropagation(); handleToggleClick(row); }}
                    >
                      <ToggleSwitch on={row.integrationEnabled} disabled={!isSuperAdmin} />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.integrationEnabled ? 'AÃ§Ä±k' : 'KapalÄ±'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={e => { e.stopPropagation(); setSelectedRow(selectedRow?.tenantId === row.tenantId ? null : row); }}
                    >
                      <ChevronRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)' }}>
            {filtered.length} firma gÃ¶steriliyor{filtered.length !== integrations.length ? ` (toplam ${integrations.length})` : ''}
            {!isSuperAdmin && <span style={{ marginLeft: '12px', color: '#d97706' }}>AÃ§ma/kapatma iÃ§in SUPER_ADMIN yetkisi gereklidir.</span>}
          </div>
        )}
      </div>

      {/* Onay ModalÄ± */}
      {confirmState && (
        <ConfirmModal
          row={confirmState.row}
          targetEnabled={confirmState.targetEnabled}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmState(null)}
          loading={toggling}
        />
      )}

      {/* Detay Paneli */}
      {selectedRow && (
        <DetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
};
