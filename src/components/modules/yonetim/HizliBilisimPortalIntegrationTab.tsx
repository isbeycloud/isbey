import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import { Modal } from '../../common/Modal';
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Building,
  Key,
  ShieldCheck,
  Coins,
  Send,
  Download,
  Sliders,
  ExternalLink,
  Check,
  X,
  FileText,
  Clock,
  Layers,
  ArrowRightLeft,
  Server,
  Filter,
  Eye,
  Info,
  Sparkles,
} from 'lucide-react';

interface MappingItem {
  companyId: string;
  companyCode: string;
  companyName: string;
  title: string;
  taxNumber: string;
  taxOffice?: string;
  city?: string;
  plan: string;
  status: string;
  isMatched: boolean;
  matchedCustomer: {
    id: string;
    externalId: string;
    companyName: string;
    status: string;
    syncedAt?: string;
  } | null;
  portalConfig: {
    apiKey: string;
    gbUrn: string;
    pkUrn: string;
    isTestMode: boolean;
    autoCheckGibUser: boolean;
    defaultProfile: string;
    customUsername?: string;
  };
  services: {
    eFatura: boolean;
    eArsiv: boolean;
    eIrsaliye: boolean;
    eDefter: boolean;
    eMustahsil: boolean;
  };
  credits: {
    total: number;
    remaining: number;
    used: number;
  };
  stats: {
    outgoingInvoices: number;
    incomingInvoices: number;
    syncedEInvoices: number;
    lastSyncAt?: string;
  };
}

export const HizliBilisimPortalIntegrationTab: React.FC = () => {
  const { showToast } = useToast();
  const { switchTenant, triggerRefresh } = useApp();

  const [matrix, setMatrix] = useState<MappingItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMatched, setFilterMatched] = useState<'ALL' | 'MATCHED' | 'UNMATCHED'>('ALL');

  // Action loadings
  const [autoMatching, setAutoMatching] = useState(false);
  const [syncingInvoices, setSyncingInvoices] = useState(false);

  // Edit Mapping Modal
  const [editingItem, setEditingItem] = useState<MappingItem | null>(null);
  const [editApiKey, setEditApiKey] = useState('');
  const [editGbUrn, setEditGbUrn] = useState('');
  const [editPkUrn, setEditPkUrn] = useState('');
  const [editDefaultProfile, setEditDefaultProfile] = useState('TEMELFATURA');
  const [editCredits, setEditCredits] = useState(250);
  const [editServices, setEditServices] = useState({
    eFatura: true,
    eArsiv: true,
    eIrsaliye: true,
    eDefter: true,
    eMustahsil: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Mükellef Sorgulama Modalı
  const [isGibModalOpen, setIsGibModalOpen] = useState(false);
  const [gibQueryVkn, setGibQueryVkn] = useState('');
  const [gibQueryLoading, setGibQueryLoading] = useState(false);
  const [gibQueryResult, setGibQueryResult] = useState<any>(null);

  useEffect(() => {
    loadMatrix();
  }, []);

  const loadMatrix = async () => {
    setLoading(true);
    try {
      const res = await api.getHizliPortalMappingMatrix();
      if (res.success) {
        setMatrix(res.matrix);
        setSummary(res.summary);
      }
    } catch (err: any) {
      showToast(err.message || 'Portal eşleme matrisi yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 1. Otomatik Eşleme (Auto Match VKN)
  const handleAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const res = await api.autoMatchPortalMatrix();
      if (res.success) {
        showToast(res.message, 'success');
        loadMatrix();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Otomatik eşleme başarısız.', 'error');
    } finally {
      setAutoMatching(false);
    }
  };

  // 2. Canlı Fatura & Durum Senkronizasyonu
  const handleSyncInvoices = async () => {
    setSyncingInvoices(true);
    try {
      const res = await api.syncPortalInvoices();
      if (res.success) {
        showToast(res.message, 'success');
        loadMatrix();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Fatura senkronizasyonu başarısız.', 'error');
    } finally {
      setSyncingInvoices(false);
    }
  };

  // 3. Firma Portal Eşleme Modalı Aç
  const handleOpenEdit = (item: MappingItem) => {
    setEditingItem(item);
    setEditApiKey(item.portalConfig.apiKey || '');
    // 2026-09-12 (uydurma temizliği): Kayıtlı URN yoksa sabit
    // `defaultgb@hizlibilisimteknolojileri.net` atanıyordu. Kullanıcı hiçbir şey
    // değiştirmeden kaydettiğinde bu sabit URN firmaya YAZILIYOR ve firma "posta
    // kutusu atanmış" gibi görünüyordu. Artık boş bırakılır.
    setEditGbUrn(item.portalConfig.gbUrn || '');
    setEditPkUrn(item.portalConfig.pkUrn || '');
    setEditDefaultProfile(item.portalConfig.defaultProfile || 'TEMELFATURA');
    // Kontör bilinmiyorsa (null) `|| 250` ile uydurma bakiye gösteriliyordu ve
    // kullanıcı kaydederse bu 250 gerçek değer olarak yazılırdı. Boş → 0 ile
    // temsil edilir; kullanıcı bilinçli olarak girmelidir.
    setEditCredits(typeof item.credits.remaining === 'number' ? item.credits.remaining : 0);
    setEditServices({ ...item.services });
  };

  // 4. Firma Portal Ayarlarını Kaydet
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setSavingEdit(true);
    try {
      const res = await api.mapCompanyPortal({
        companyId: editingItem.companyId,
        apiKey: editApiKey,
        gbUrn: editGbUrn,
        pkUrn: editPkUrn,
        defaultProfile: editDefaultProfile,
        eInvoiceCredits: Number(editCredits),
        services: editServices,
      });

      if (res.success) {
        showToast(res.message, 'success');
        setEditingItem(null);
        loadMatrix();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Kayıt başarısız.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // 5. GİB Mükellef Sorgulama
  const handleQueryGib = async (vknToQuery?: string) => {
    const vkn = vknToQuery || gibQueryVkn;
    if (!vkn) {
      showToast('Lütfen bir VKN veya TCKN girin.', 'warning');
      return;
    }
    setGibQueryLoading(true);
    setGibQueryResult(null);
    try {
      const res = await api.checkGibUser(vkn);
      setGibQueryResult(res);
      if (res.isEInvoiceUser) {
        showToast(`Mükellef Kayıtlı: ${res.title || 'e-Fatura Kullanıcısı'}`, 'success');
      } else {
        showToast('Mükellef e-Fatura kullanıcısı değil (e-Arşiv kapsamındadır).', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Sorgulama hatası.', 'error');
    } finally {
      setGibQueryLoading(false);
    }
  };

  const handleQuickGibCheck = (vkn: string) => {
    setGibQueryVkn(vkn);
    setIsGibModalOpen(true);
    handleQueryGib(vkn);
  };

  // Filter matrix
  const filteredMatrix = matrix.filter(item => {
    if (filterMatched === 'MATCHED' && !item.isMatched) return false;
    if (filterMatched === 'UNMATCHED' && item.isMatched) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.companyName.toLowerCase().includes(q) ||
        item.companyCode.toLowerCase().includes(q) ||
        item.taxNumber.includes(q) ||
        (item.matchedCustomer?.companyName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const columns: Column<MappingItem>[] = [
    {
      key: 'companyCode',
      title: 'Firma / Kod',
      width: '180px',
      render: item => (
        <div>
          <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building size={14} color="var(--primary)" />
            <span>{item.companyName}</span>
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
            {item.companyCode} · <span className="badge badge-secondary" style={{ fontSize: '9px', padding: '1px 5px' }}>{item.plan}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'taxNumber',
      title: 'VKN / TCKN',
      width: '130px',
      render: item => (
        <div>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px', color: 'var(--primary)' }}>
            {item.taxNumber}
          </span>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{item.taxOffice || item.city || 'Merkez'}</div>
        </div>
      ),
    },
    {
      key: 'isMatched',
      title: 'Hızlı Portal Eşleşmesi',
      width: '200px',
      render: item => (
        <div>
          {item.isMatched ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="badge badge-success" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={11} /> Eşleşti
              </span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                {item.matchedCustomer?.externalId}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="badge badge-warning" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px', background: '#854d0e', color: '#fef08a' }}>
                <AlertCircle size={11} /> Eşleşmedi
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleOpenEdit(item)}
                style={{ fontSize: '10px', padding: '2px 6px', height: '22px' }}
              >
                Eşle
              </button>
            </div>
          )}
          {item.matchedCustomer && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
              {item.matchedCustomer.companyName}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'portalConfig',
      title: 'Posta Kutusu URN (GB / PK)',
      width: '210px',
      render: item => (
        <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)' }}>
          <div style={{ color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={item.portalConfig.gbUrn}>
            <strong>GB:</strong> {item.portalConfig.gbUrn.replace('urn:mail:', '')}
          </div>
          <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={item.portalConfig.pkUrn}>
            <strong>PK:</strong> {item.portalConfig.pkUrn.replace('urn:mail:', '')}
          </div>
        </div>
      ),
    },
    {
      key: 'services',
      title: 'Aktif e-Hizmetler',
      width: '180px',
      render: item => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {item.services.eFatura && <span className="badge badge-info" style={{ fontSize: '9px', padding: '1px 5px' }}>e-Fatura</span>}
          {item.services.eArsiv && <span className="badge badge-success" style={{ fontSize: '9px', padding: '1px 5px' }}>e-Arşiv</span>}
          {item.services.eIrsaliye && <span className="badge badge-secondary" style={{ fontSize: '9px', padding: '1px 5px' }}>e-İrsaliye</span>}
          {item.services.eDefter && <span className="badge badge-warning" style={{ fontSize: '9px', padding: '1px 5px' }}>e-Defter</span>}
        </div>
      ),
    },
    {
      key: 'credits',
      title: 'Kontör Bakiyesi',
      width: '140px',
      render: item => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800 }}>
            <span style={{ color: item.credits.remaining < 50 ? '#dc2626' : 'var(--success)' }}>
              {item.credits.remaining} Kalan
            </span>
            <span style={{ color: 'var(--text-muted)' }}>/ {item.credits.total}</span>
          </div>
          <div style={{ width: '100%', height: '5px', background: 'var(--border-color)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.round((item.credits.remaining / (item.credits.total || 1)) * 100))}%`,
                height: '100%',
                background: item.credits.remaining < 50 ? '#dc2626' : 'var(--success)',
                borderRadius: '3px',
              }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      title: 'İşlemler',
      width: '140px',
      render: item => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpenEdit(item)}
            title="Portal Eşleme Ayarları"
            style={{ padding: '4px 7px' }}
          >
            <Sliders size={13} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleQuickGibCheck(item.taxNumber)}
            title="Portaldan Mükellefiyet Sorgula"
            style={{ padding: '4px 7px' }}
          >
            <Search size={13} />
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              await switchTenant(item.companyId);
              showToast(`"${item.companyName}" firmasına geçiş yapıldı.`, 'success');
            }}
            title="Bu Firmaya Geçiş Yap"
            style={{ padding: '4px 7px' }}
          >
            <ArrowRightLeft size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* ─── 1. CANLI PORTAL DURUM BANDI ─── */}
      <div
        style={{
          // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz ikincil yüzey token'ı.
          background: 'var(--bg-surface-secondary)',
          border: '1.5px solid var(--primary)',
          borderRadius: '10px',
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'var(--primary)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
            }}
          >
            <Zap size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>
                Hızlı Bilişim e-Connect Entegrasyon & Portal Eşleme Merkezi
              </h3>
              <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                CANLI PORTAL BAĞLANTISI AKTİF
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
              Protokol: <code>UtilEncrypt + Login + Bearer Token</code> · Uç Nokta: <code>https://econnect.hizliteknoloji.com.tr</code> · Otomatik Mukellef/Şube Eşleme
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsGibModalOpen(true)}
            style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Search size={14} /> GİB Mükellef Sorgula
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSyncInvoices}
            disabled={syncingInvoices}
            style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <RefreshCw size={14} className={syncingInvoices ? 'animate-spin' : ''} />
            {syncingInvoices ? 'Senkronize Ediliyor...' : 'Faturaları & GİB Durumlarını Senkronize Et'}
          </button>
        </div>
      </div>

      {/* ─── 2. KPI METRİK KARTLARI ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <div className="card-panel" style={{ padding: '14px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>TOPLAM FİRMA / EŞLEŞME</span>
            <Building size={16} color="var(--primary)" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)', marginTop: '4px' }}>
            {summary?.matchedCompanies || 0} <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>/ {summary?.totalCompanies || 0} Eşleşti</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700, marginTop: '2px' }}>
            {summary?.unmappedCompanies ? `● ${summary.unmappedCompanies} firma eşleme bekliyor` : '✓ Tüm firmalar portala bağlı'}
          </div>
        </div>

        <div className="card-panel" style={{ padding: '14px', borderLeft: '4px solid #16a34a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>TOPLAM HAVUZ KONTÖRÜ</span>
            <Coins size={16} color="#16a34a" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#16a34a', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            {summary?.totalRemainingCredits?.toLocaleString('tr-TR') || 0} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Kontör</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            e-Fatura / e-Arşiv / e-İrsaliye ortak havuzu
          </div>
        </div>

        <div className="card-panel" style={{ padding: '14px', borderLeft: '4px solid #7c3aed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>SENKRONİZE E-BELGELER</span>
            <FileText size={16} color="#7c3aed" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#7c3aed', marginTop: '4px' }}>
            {summary?.totalSyncedDocs || 0} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Adet Belge</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Giden & Gelen GİB Onaylı Faturalar
          </div>
        </div>

        <div className="card-panel" style={{ padding: '14px', borderLeft: '4px solid #d97706' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>PORTAL ÇALIŞMA MODU</span>
            <Server size={16} color="#d97706" />
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
            {summary?.isTestMode ? 'TEST / ENTEGRASYON' : 'CANLI / PRODUCTION'}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Son Senkronizasyon: {summary?.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleTimeString('tr-TR') : 'Şimdi'}
          </div>
        </div>
      </div>

      {/* ─── 3. TOOLBAR VE AKSİYONLAR ─── */}
      <div className="card-panel" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Firma Adı, VKN veya Kod ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`btn btn-sm ${filterMatched === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterMatched('ALL')}
              style={{ fontSize: '11.5px' }}
            >
              Tümü ({matrix.length})
            </button>
            <button
              className={`btn btn-sm ${filterMatched === 'MATCHED' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterMatched('MATCHED')}
              style={{ fontSize: '11.5px' }}
            >
              Eşleşenler ({matrix.filter(m => m.isMatched).length})
            </button>
            <button
              className={`btn btn-sm ${filterMatched === 'UNMATCHED' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterMatched('UNMATCHED')}
              style={{ fontSize: '11.5px' }}
            >
              Eşleşmeyenler ({matrix.filter(m => !m.isMatched).length})
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-warning btn-sm"
            onClick={handleAutoMatch}
            disabled={autoMatching}
            style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Sparkles size={14} />
            {autoMatching ? 'Eşleştiriliyor...' : 'Portaldaki Müşterilerle Otomatik Eşle (VKN)'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadMatrix}
            style={{ fontSize: '11.5px' }}
          >
            <RefreshCw size={13} /> Yenile
          </button>
        </div>
      </div>

      {/* ─── 4. EŞLEME MATRİS TABLOSU ─── */}
      <div style={{ flex: 1, minHeight: '350px' }}>
        <DataGrid<MappingItem>
          data={filteredMatrix}
          columns={columns}
          loading={loading}
          rowKey="companyId"
          emptyMessage="Eşleşme kriterine uygun firma bulunamadı."
        />
      </div>

      {/* ─── 5. FİRMA PORTAL EŞLEME DÜZENLEME MODALI ─── */}
      {editingItem && (
        <Modal
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          title={`e-Fatura Portal Eşleme: ${editingItem.companyName}`}
          size="large"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'var(--bg-surface-secondary)', padding: '10px 14px', borderRadius: '6px', fontSize: '12px' }}>
              <strong>Firma:</strong> {editingItem.companyName} ({editingItem.companyCode}) · <strong>VKN:</strong> {editingItem.taxNumber}
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>
                Hızlı Bilişim API Anahtarı (ApiKey)
              </label>
              <input
                type="text"
                className="form-control"
                value={editApiKey}
                onChange={e => setEditApiKey(e.target.value)}
                placeholder="API Key"
              />
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                Firma için atanmış özel ApiKey veya genel entegratör anahtarı.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>
                  Gönderici Birim (GB) Posta Kutusu URN
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editGbUrn}
                  onChange={e => setEditGbUrn(e.target.value)}
                  placeholder="urn:mail:defaultgb@..."
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>
                  Posta Kutusu (PK) URN
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editPkUrn}
                  onChange={e => setEditPkUrn(e.target.value)}
                  placeholder="urn:mail:defaultpk@..."
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>
                  Varsayılan Fatura Profili
                </label>
                <select
                  className="form-control"
                  value={editDefaultProfile}
                  onChange={e => setEditDefaultProfile(e.target.value)}
                >
                  <option value="TEMELFATURA">TEMELFATURA (Temel Fatura)</option>
                  <option value="TICARIFATURA">TICARIFATURA (Ticari Fatura)</option>
                  <option value="KAMU">KAMU (Kamu Faturası)</option>
                  <option value="IHRACAT">IHRACAT (İhracat Faturası)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>
                  Tahsis Edilen Kontör Bakiyesi
                </label>
                <input
                  type="number"
                  className="form-control"
                  value={editCredits}
                  onChange={e => setEditCredits(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Aktif E-Hizmetler Switchleri */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>
                Aktif e-Dönüşüm Modülleri
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '6px' }}>
                {[
                  { k: 'eFatura', l: 'e-Fatura' },
                  { k: 'eArsiv', l: 'e-Arşiv Fatura' },
                  { k: 'eIrsaliye', l: 'e-İrsaliye' },
                  { k: 'eDefter', l: 'e-Defter' },
                  { k: 'eMustahsil', l: 'e-Müstahsil' },
                ].map(({ k, l }) => (
                  <label
                    key={k}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      background: 'var(--bg-surface-secondary)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={(editServices as any)[k]}
                      onChange={e => setEditServices(prev => ({ ...prev, [k]: e.target.checked }))}
                    />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setEditingItem(null)}>
                İptal
              </button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? 'Kaydediliyor...' : 'Portal Eşlemesini Kaydet'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── 6. GİB MÜKELLEF SORGULAMA MODALI ─── */}
      <Modal
        isOpen={isGibModalOpen}
        onClose={() => {
          setIsGibModalOpen(false);
          setGibQueryResult(null);
        }}
        title="Hızlı Bilişim / GİB Canlı Mükellef Sorgulama"
        size="medium"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Sorgulanacak VKN veya TCKN girin (10 veya 11 hane)..."
              value={gibQueryVkn}
              onChange={e => setGibQueryVkn(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQueryGib()}
            />
            <button
              className="btn btn-primary"
              onClick={() => handleQueryGib()}
              disabled={gibQueryLoading}
            >
              {gibQueryLoading ? 'Sorgulanıyor...' : 'Sorgula'}
            </button>
          </div>

          {gibQueryResult && (
            <div
              style={{
                background: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {gibQueryResult.isEInvoiceUser ? (
                  <span className="badge badge-success" style={{ fontSize: '11px' }}>
                    ✓ e-Fatura Mükellefi
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                    ● e-Arşiv Kapsamında (e-Fatura Kaydı Yok)
                  </span>
                )}
              </div>

              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
                {gibQueryResult.title || 'Mükellef Unvanı'}
              </div>

              {gibQueryResult.aliasPk && (
                <div style={{ fontSize: '11.5px' }}>
                  <strong>PK Posta Kutusu:</strong> <code>{gibQueryResult.aliasPk}</code>
                </div>
              )}

              {gibQueryResult.aliasGb && (
                <div style={{ fontSize: '11.5px' }}>
                  <strong>GB Posta Kutusu:</strong> <code>{gibQueryResult.aliasGb}</code>
                </div>
              )}

              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {gibQueryResult.message || 'Canlı GİB sorgusu tamamlandı.'}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
