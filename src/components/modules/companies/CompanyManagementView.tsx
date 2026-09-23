import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Tenant, TenantPlan, TenantStatus } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { NewCompanyModal } from './NewCompanyModal';
import { CompanyDetailModal } from './CompanyDetailModal';
import { CompanyDeleteConfirmModal } from './CompanyDeleteConfirmModal';
import {
  Building,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Shield,
  Layers,
  ArrowRightLeft,
  Users,
  Coins,
  DollarSign,
  TrendingUp,
  Sliders,
  Power,
  ExternalLink,
  Crown,
  Key,
} from 'lucide-react';

export const CompanyManagementView: React.FC = () => {
  const { showToast } = useToast();
  const { activeTenantId, switchTenant, triggerRefresh, refreshKey } = useApp();
  const { user, switchCompany } = useAuth();

  const [companies, setCompanies] = useState<Tenant[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [planFilter, setPlanFilter] = useState<string>('ALL');

  // Selected companies for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [detailCompanyId, setDetailCompanyId] = useState<string | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Tenant | null>(null);

  useEffect(() => {
    loadData();
  }, [statusFilter, planFilter, refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getCompanies({
        status: statusFilter,
        plan: planFilter,
        search: searchQuery,
      });
      if (res.success) {
        setCompanies(res.companies);
        setKpis(res.kpis);
      }
    } catch (err: any) {
      showToast(err.message || 'Firma listesi yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleSwitch = async (comp: Tenant) => {
    if (comp.status === 'SUSPENDED') {
      showToast('Bu firma askıya alınmıştır, giriş yapılamaz.', 'error');
      return;
    }
    try {
      const ok = await switchCompany(comp.id);
      if (ok) {
        showToast(`"${comp.name}" çalışma ortamına geçildi.`, 'success');
        triggerRefresh();
        loadData();
      } else {
        showToast('Geçiş başarısız.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Geçiş başarısız.', 'error');
    }
  };

  const handleToggleStatus = async (comp: Tenant) => {
    const nextStatus = comp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await api.updateCompanyStatus(comp.id, nextStatus);
      if (res.success) {
        showToast(res.message, 'success');
        loadData();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Durum güncellenemedi.', 'error');
    }
  };

  const handleBulkAction = async (action: 'ACTIVATE' | 'DEACTIVATE') => {
    if (selectedIds.length === 0) return;
    try {
      const res = await api.bulkCompanyAction({
        companyIds: selectedIds,
        action,
      });
      if (res.success) {
        showToast(res.message, 'success');
        setSelectedIds([]);
        loadData();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Toplu işlem başarısız.', 'error');
    }
  };

  const statusBadge = (st: TenantStatus) => {
    switch (st) {
      case 'ACTIVE':
        return <span className="badge badge-success" style={{ fontSize: '10px' }}>✓ Aktif</span>;
      case 'INACTIVE':
        return <span className="badge badge-danger" style={{ fontSize: '10px' }}>Pasif</span>;
      case 'SUSPENDED':
        return <span className="badge badge-danger" style={{ fontSize: '10px', background: '#991b1b' }}>Askıda</span>;
      case 'TRIAL':
        return <span className="badge badge-warning" style={{ fontSize: '10px', background: '#854d0e', color: '#fef08a' }}>⏳ Deneme</span>;
      case 'EXPIRED':
        return <span className="badge badge-danger" style={{ fontSize: '10px' }}>Süresi Doldu</span>;
      default:
        return <span className="badge badge-secondary" style={{ fontSize: '10px' }}>{st}</span>;
    }
  };

  const planBadge = (plan: TenantPlan) => {
    switch (plan) {
      case 'ENTERPRISE':
        // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil token (rozet).
        return <span className="badge badge-primary" style={{ background: 'var(--primary)', color: '#fff', fontSize: '10px', fontWeight: 800 }}>ENTERPRISE</span>;
      case 'PRO':
      case 'PROFESSIONAL':
        return <span className="badge badge-info" style={{ background: '#0284c7', color: '#fff', fontSize: '10px', fontWeight: 700 }}>PRO</span>;
      case 'STARTER':
        return <span className="badge badge-secondary" style={{ fontSize: '10px' }}>STARTER</span>;
      default:
        return <span className="badge badge-secondary" style={{ fontSize: '10px' }}>{plan}</span>;
    }
  };

  const columns: Column<Tenant>[] = [
    {
      key: 'companyCode',
      title: 'Firma Kodu',
      width: '120px',
      render: c => (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          color: 'var(--primary)',
          fontSize: '11.5px',
          background: 'rgba(26,86,219,0.06)',
          padding: '2px 6px',
          borderRadius: '4px',
          border: '1px solid rgba(26,86,219,0.15)',
        }}>
          {c.companyCode || 'ISB-000000'}
        </span>
      ),
    },
    {
      key: 'name',
      title: 'Firma & Unvan',
      render: c => {
        const isCurrent = c.id === activeTenantId;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil token (aktif firma avatarı).
              background: isCurrent ? 'var(--primary)' : 'var(--bg-surface-secondary)',
              border: isCurrent ? '1.5px solid #3b82f6' : '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '12px', color: isCurrent ? '#fff' : 'var(--text-main)',
              flexShrink: 0,
            }}>
              {c.logoUrl ? (
                <img src={c.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '6px' }} />
              ) : (
                c.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--text-main)' }}>{c.name}</span>
                {isCurrent && (
                  <span className="badge badge-success" style={{ fontSize: '9px', padding: '1px 5px' }}>
                    AKTİF ÇALIŞMA ORTAMI
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.title}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'taxNumber',
      title: 'Vergi No / Daire',
      width: '140px',
      render: c => (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '11.5px' }}>{c.taxNumber}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{c.taxOffice} V.D.</div>
        </div>
      ),
    },
    {
      key: 'ownerName',
      title: 'Yetkili & İletişim',
      width: '150px',
      render: c => (
        <div>
          <div style={{ fontWeight: 700, fontSize: '11.5px' }}>{c.authorizedPerson?.firstName || c.ownerName} {c.authorizedPerson?.lastName || ''}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{c.authorizedPerson?.phone || c.phone || c.email}</div>
        </div>
      ),
    },
    {
      key: 'plan',
      title: 'Paket',
      width: '110px',
      render: c => planBadge(c.plan),
    },
    {
      key: 'status',
      title: 'Durum',
      width: '100px',
      render: c => statusBadge(c.status),
    },
    {
      key: 'currentUsers',
      title: 'Kullanıcı',
      width: '85px',
      render: c => (
        <span style={{ fontSize: '11.5px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          {c.stats?.userCount || c.currentUsers || 1} / {c.maxUsers}
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '210px',
      render: c => {
        const isCurrent = c.id === activeTenantId;
        return (
          <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
            <button
              className="btn btn-primary btn-sm"
              title="Firma Yönetim Detayı (11 Sekme)"
              onClick={() => setDetailCompanyId(c.id)}
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              <Sliders size={11} />
              <span>Yönet</span>
            </button>

            {!isCurrent ? (
              <button
                className="btn btn-secondary btn-sm"
                title="Çalışma Ortamına Geç"
                onClick={() => handleSwitch(c)}
              >
                <ArrowRightLeft size={11} color="#0284c7" />
              </button>
            ) : (
              <span className="btn btn-secondary btn-sm disabled" style={{ opacity: 0.5 }}>
                <CheckCircle2 size={11} color="#16a34a" />
              </span>
            )}

            <button
              className="btn btn-secondary btn-sm"
              title={c.status === 'ACTIVE' ? 'Pasife Al' : 'Aktifleştir'}
              onClick={() => handleToggleStatus(c)}
            >
              <Power size={11} color={c.status === 'ACTIVE' ? '#ef4444' : '#16a34a'} />
            </button>

            {c.id !== 'tnt-isbey' && (
              <button
                className="btn btn-secondary btn-sm"
                title="Firmayı Sil / Arşivle"
                onClick={() => setDeletingCompany(c)}
              >
                <Trash2 size={11} color="#dc2626" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="view-content-container">
      {/* ─── Üst KPI Paneli (SuperAdmin Dash) ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '10px',
        marginBottom: '14px',
      }}>
        {[
          { label: 'TOPLAM FİRMA', val: kpis?.totalCompanies || 0, icon: <Building size={16} />, color: '#1a56db' },
          { label: 'AKTİF FİRMA', val: kpis?.activeCompanies || 0, icon: <CheckCircle2 size={16} />, color: '#16a34a' },
          { label: 'PASİF / ASKIDA', val: kpis?.passiveCompanies || 0, icon: <XCircle size={16} />, color: '#dc2626' },
          { label: 'DENEME HESABI', val: kpis?.trialCompanies || 0, icon: <Clock size={16} />, color: '#d97706' },
          { label: 'AKTİF KULLANICI', val: kpis?.totalActiveUsers || 0, icon: <Users size={16} />, color: '#7c3aed' },
          { label: 'BU AY YENİ FİRMA', val: kpis?.newThisMonth || 0, icon: <TrendingUp size={16} />, color: '#0284c7' },
        ].map((kpi, i) => (
          <div key={i} className="card-panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>{kpi.label}</span>
              <span style={{ color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: kpi.color, fontFamily: 'var(--font-mono)' }}>
              {kpi.val}
            </div>
          </div>
        ))}
      </div>

      {/* ─── İşlem Çubuğu & Filtreler ─── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '14px',
        flexWrap: 'wrap',
      }}>
        {/* Sol: Yeni Firma & Toplu İşlemler */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={() => setIsNewModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontWeight: 800,
              // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil token.
              background: 'var(--primary)',
              padding: '9px 16px',
            }}
          >
            <Plus size={15} />
            <span>+ Yeni Firma Kaydı</span>
          </button>

          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'var(--bg-surface-secondary)', padding: '4px 8px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700 }}>{selectedIds.length} Seçili:</span>
              <button className="btn btn-secondary btn-sm" onClick={() => handleBulkAction('ACTIVATE')}>
                Toplu Aktifleştir
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleBulkAction('DEACTIVATE')}>
                Toplu Pasife Al
              </button>
            </div>
          )}
        </div>

        {/* Sağ: Arama & Filtreler */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Kod, firma adı, VKN, yetkili ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '260px', paddingLeft: '30px' }}
            />
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
          </div>

          <select
            className="form-input"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ width: '130px', fontSize: '12px' }}
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Pasif</option>
            <option value="TRIAL">Deneme</option>
            <option value="SUSPENDED">Askıda</option>
            <option value="EXPIRED">Süresi Dolmuş</option>
          </select>

          <select
            className="form-input"
            value={planFilter}
            onChange={e => setPlanFilter(e.target.value)}
            style={{ width: '130px', fontSize: '12px' }}
          >
            <option value="ALL">Tüm Paketler</option>
            <option value="STARTER">Starter</option>
            <option value="PRO">Pro</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>

          <button type="submit" className="btn btn-secondary btn-sm" title="Yenile">
            <RefreshCw size={13} />
          </button>
        </form>
      </div>

      {/* ─── DataGrid Tablosu ─── */}
      <div className="card-panel" style={{ padding: '0' }}>
        <DataGrid
          columns={columns}
          data={companies}
          rowKey="id"
          loading={loading}
          emptyMessage="Kriterlere uygun kayıtlı firma bulunamadı."
          onRowClick={row => setDetailCompanyId(row.id)}
        />
      </div>

      {/* ─── MODALLAR ─── */}
      {/* 1. Yeni Firma Kayıt Sihirbazı */}
      <NewCompanyModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={() => { loadData(); triggerRefresh(); }}
      />

      {/* 2. Firma 11-Sekme Yönetim Detayı */}
      <CompanyDetailModal
        isOpen={!!detailCompanyId}
        onClose={() => setDetailCompanyId(null)}
        companyId={detailCompanyId}
        onRefresh={() => { loadData(); triggerRefresh(); }}
      />

      {/* 3. Güvenli Silme / Arşivleme Doğrulaması */}
      <CompanyDeleteConfirmModal
        isOpen={!!deletingCompany}
        onClose={() => setDeletingCompany(null)}
        company={deletingCompany}
        onConfirm={async (confirmCode, hardDelete) => {
          if (!deletingCompany) return;
          try {
            const res = await api.deleteCompany(deletingCompany.id, { confirmCode, hardDelete });
            if (res.success) {
              showToast(res.message, 'success');
              loadData();
              triggerRefresh();
            }
          } catch (err: any) {
            showToast(err.message || 'Silme başarısız.', 'error');
          }
        }}
      />
    </div>
  );
};
