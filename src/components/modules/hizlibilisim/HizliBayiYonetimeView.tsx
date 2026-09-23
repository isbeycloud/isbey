import React, { useState, useEffect } from 'react';
import {
  Building,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  Search,
  Zap,
  Shield,
  Key,
  ExternalLink,
  Edit2,
  Lock,
  ChevronRight,
  Filter,
  Check,
  X,
  AlertCircle,
  FileText,
  UserCheck,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { HizliBilisimCustomerListView } from './HizliBilisimCustomerListView';

interface DealerItem {
  id: string;
  companyName: string;
  title: string;
  taxNumber: string;
  taxOffice: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  customerType: string;
  status: string;
  wsUsername: string;
  hasWsPassword: boolean;
  connectionStatus: 'ACTIVE' | 'ERROR' | 'PENDING';
  tokenStatus: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NONE';
  tokenExpiresAt: string | null;
  lastLoginAt: string | null;
  isbeyStatus: 'ACTIVE' | 'PENDING' | 'NONE';
  isbeyCompanyId: string | null;
  createdAt: string;
}

interface DealerKPIs {
  total: number;
  activeIntegration: number;
  tokenIssue: number;
  pendingSetup: number;
}

export const HizliBayiYonetimeView: React.FC = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'DEALERS' | 'PORTFOLIO' | 'LOGS'>('DEALERS');
  const [dealers, setDealers] = useState<DealerItem[]>([]);
  const [kpis, setKpis] = useState<DealerKPIs>({
    total: 0,
    activeIntegration: 0,
    tokenIssue: 0,
    pendingSetup: 0,
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ERROR' | 'PENDING'>('ALL');

  // Modallar
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDealer, setEditingDealer] = useState<DealerItem | null>(null);

  // Yeni Firma Formu
  const [addForm, setAddForm] = useState({
    companyName: '',
    title: '',
    taxNumber: '',
    taxOffice: '',
    contactName: '',
    phone: '',
    email: '',
    // 2026-09-12: 'ADANA' varsayılanı kaldırıldı — kullanıcı şehir girmemişse
    // kayda uydurma şehir yazılıyordu.
    city: '',
    district: '',
    address: '',
    wsUsername: '',
    wsPassword: '',
    createIsbeyAccount: true,
  });

  // Düzenleme Formu
  const [editForm, setEditForm] = useState({
    companyName: '',
    title: '',
    taxOffice: '',
    contactName: '',
    phone: '',
    email: '',
    city: '',
    district: '',
    address: '',
    wsUsername: '',
    wsPassword: '',
  });

  // Test & Refresh işlemleri yükleniyor durumu (id bazlı)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [inlineTestResult, setInlineTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Loglar
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    loadDealers();
  }, []);

  const loadDealers = async () => {
    setLoading(true);
    try {
      const res = await api.getHizliDealers();
      if (res.success) {
        setDealers(res.dealers || []);
        if (res.kpis) setKpis(res.kpis);
      }
    } catch (err: any) {
      showToast(err.message || 'Mükellef listesi yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await api.getHizliDealerLogs();
      if (res.success) {
        setLogs(res.logs || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Loglar yüklenemedi.', 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleTabChange = (tab: 'DEALERS' | 'PORTFOLIO' | 'LOGS') => {
    setActiveTab(tab);
    if (tab === 'LOGS') {
      loadLogs();
    } else if (tab === 'DEALERS') {
      loadDealers();
    }
  };

  // ─── Satır Eylemi: Canlı Bağlantıyı Test Et (UtilEncrypt + Login) ───
  const handleTestConnection = async (dealer: DealerItem) => {
    setActionLoadingId(dealer.id);
    try {
      const res = await api.testDealerConnection({ id: dealer.id });
      if (res.success) {
        showToast(`${dealer.companyName}: Bağlantı ve 24 saatlik token alımı başarılı.`, 'success');
        loadDealers();
      } else {
        showToast(`${dealer.companyName}: ${res.message}`, 'error');
        loadDealers();
      }
    } catch (err: any) {
      showToast(err.message || 'Bağlantı testi sırasında hata oluştu.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ─── Satır Eylemi: Token Yenile (Login) ───
  const handleRefreshToken = async (dealer: DealerItem) => {
    setActionLoadingId(dealer.id);
    try {
      const res = await api.refreshDealerToken(dealer.id);
      if (res.success) {
        showToast(`${dealer.companyName}: Token 24 saatlik süreyle başarıyla yenilendi.`, 'success');
        loadDealers();
      } else {
        showToast(`${dealer.companyName}: ${res.message}`, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Token yenileme hatası.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ─── Yeni Firma Modalı İçinde Anında Test ───
  const handleTestInModal = async () => {
    if (!addForm.wsUsername || !addForm.wsPassword) {
      showToast('Lütfen önce Web Servis Kullanıcı Adı ve Şifresini girin.', 'warning');
      return;
    }
    setActionLoadingId('MODAL_TEST');
    setInlineTestResult(null);
    try {
      const res = await api.testDealerConnection({
        wsUsername: addForm.wsUsername,
        wsPassword: addForm.wsPassword,
      });
      setInlineTestResult({
        success: res.success,
        message: res.message,
      });
      if (res.success) {
        showToast('Hızlı Bilişim bağlantısı doğrulandı.', 'success');
      } else {
        showToast(`Doğrulama başarısız: ${res.message}`, 'error');
      }
    } catch (err: any) {
      setInlineTestResult({ success: false, message: err.message || 'Test hatası' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // ─── Yeni Firma Kaydet ───
  const handleCreateDealer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.companyName || !addForm.taxNumber) {
      showToast('Firma Ünvanı ve VKN/TCKN zorunludur.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const res = await api.createHizliDealer(addForm);
      if (res.success) {
        showToast('Firma başarıyla kaydedildi.', 'success');
        setIsAddModalOpen(false);
        setAddForm({
          companyName: '',
          title: '',
          taxNumber: '',
          taxOffice: '',
          contactName: '',
          phone: '',
          email: '',
          city: '',
          district: '',
          address: '',
          wsUsername: '',
          wsPassword: '',
          createIsbeyAccount: true,
        });
        setInlineTestResult(null);
        loadDealers();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Kayıt başarısız oldu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Düzenle Modalı Aç ───
  const openEditModal = (dealer: DealerItem) => {
    setEditingDealer(dealer);
    setEditForm({
      companyName: dealer.companyName,
      title: dealer.title,
      taxOffice: dealer.taxOffice,
      contactName: dealer.contactName,
      phone: dealer.phone,
      email: dealer.email,
      city: dealer.city,
      district: dealer.district,
      address: '',
      wsUsername: dealer.wsUsername,
      wsPassword: '', // Şifre asla geri döndürülmez
    });
    setIsEditModalOpen(true);
  };

  // ─── Düzenle Kaydet ───
  const handleUpdateDealer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDealer) return;
    setLoading(true);
    try {
      const res = await api.updateHizliDealer(editingDealer.id, editForm);
      if (res.success) {
        showToast('Firma bilgileri başarıyla güncellendi.', 'success');
        setIsEditModalOpen(false);
        setEditingDealer(null);
        loadDealers();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Güncelleme hatası.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // VKN maskeleme (123••••)
  const maskTaxNumber = (vkn: string) => {
    if (!vkn || vkn.length < 4) return vkn || '—';
    return `${vkn.slice(0, 3)}••••${vkn.length > 7 ? vkn.slice(-2) : ''}`;
  };

  // Filtreleme
  const filteredDealers = dealers.filter(d => {
    const matchesSearch =
      d.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.taxNumber.includes(searchQuery) ||
      d.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.wsUsername.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    return d.connectionStatus === statusFilter;
  });

  return (
    <div className="m3-dashboard-canvas">
      {/* ─── ÜST BAŞLIK VE AKSİYONLAR ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                fontSize: 'var(--fs-xs, 11px)',
                fontWeight: 700,
                color: 'var(--primary)',
                background: 'var(--primary-light)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm, 6px)',
                letterSpacing: '0.04em',
              }}
            >
              Hızlı Bilişim E-Dönüşüm
            </span>
            <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>•</span>
            <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Plan B Çoklu Mükellef Mimarisi</span>
          </div>
          <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
            Hızlı Bilişim Bayi / Mükellef Yönetimi
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => (activeTab === 'DEALERS' ? loadDealers() : activeTab === 'LOGS' ? loadLogs() : undefined)}
            disabled={activeTab === 'PORTFOLIO' || loading || logsLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm, 6px)',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-sm, 12px)',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <RefreshCw size={15} className={loading || logsLoading ? 'animate-spin' : ''} />
            <span>Yenile</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              background: 'var(--primary)',
              border: 'none',
              borderRadius: 'var(--radius-sm, 6px)',
              color: '#ffffff',
              fontSize: 'var(--fs-sm, 12px)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Yeni Firma / Mükellef Ekle</span>
          </button>
        </div>
      </div>

      {/* ─── 4 GENEL BAKIŞ KPI KARTI ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '18px',
          marginBottom: '24px',
        }}
      >
        {/* Toplam Firma */}
        <div className="m3-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building size={20} />
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)' }}>Toplam Firma</div>
              <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)' }}>{kpis.total}</div>
            </div>
          </div>
        </div>

        {/* Aktif Entegrasyon */}
        <div className="m3-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)' }}>Aktif Entegrasyon</div>
              <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--success)' }}>{kpis.activeIntegration}</div>
            </div>
          </div>
        </div>

        {/* Token Sorunu Olanlar */}
        <div className="m3-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)' }}>Token Sorunu Olanlar</div>
              <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--warning)' }}>{kpis.tokenIssue}</div>
            </div>
          </div>
        </div>

        {/* Kurulum Bekleyenler */}
        <div className="m3-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)' }}>Kurulum Bekleyenler</div>
              <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--primary)' }}>{kpis.pendingSetup}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SEKME SEÇİCİ ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        <button
          onClick={() => handleTabChange('DEALERS')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            fontSize: 'var(--fs-base, 13px)',
            fontWeight: 700,
            cursor: 'pointer',
            color: activeTab === 'DEALERS' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'DEALERS' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Building size={16} />
          <span>Alt Bayiler / Firmalar ({dealers.length})</span>
        </button>

        <button
          onClick={() => handleTabChange('PORTFOLIO')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            fontSize: 'var(--fs-base, 13px)',
            fontWeight: 700,
            cursor: 'pointer',
            color: activeTab === 'PORTFOLIO' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'PORTFOLIO' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <UserCheck size={16} />
          <span>Portföy → İŞBEY</span>
        </button>

        <button
          onClick={() => handleTabChange('LOGS')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            fontSize: 'var(--fs-base, 13px)',
            fontWeight: 700,
            cursor: 'pointer',
            color: activeTab === 'LOGS' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'LOGS' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FileText size={16} />
          <span>Entegrasyon Logları</span>
        </button>
      </div>

      {/* Portföydeki firmalar burada İŞBEY şirketi ve seçilen yetkilisiyle
          birlikte kurulabilir. Ekranın kendi senkronizasyon ve dönüştürme
          aksiyonları vardır; bu sayfa yalnız bileşeni görünür kılar. */}
      {activeTab === 'PORTFOLIO' && <HizliBilisimCustomerListView />}

      {/* ─── SEKME 1: ALT BAYİLER / FİRMALAR ─── */}
      {activeTab === 'DEALERS' && (
        <div className="m3-card" style={{ padding: '20px' }}>
          {/* Arama & Filtre Çubuğu */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm, 6px)',
                padding: '8px 14px',
                width: '320px',
              }}
            >
              <Search size={16} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Firma ünvanı, VKN veya WS kullanıcı ara..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: 'var(--fs-base, 13px)',
                  width: '100%',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', fontWeight: 600 }}>Durum:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  fontSize: 'var(--fs-sm, 12px)',
                  color: 'var(--text-main)',
                  outline: 'none',
                }}
              >
                <option value="ALL">Tümü</option>
                <option value="ACTIVE">Aktif Bağlantı</option>
                <option value="ERROR">Hatalı Bağlantı</option>
                <option value="PENDING">Kurulum Bekleyen</option>
              </select>
            </div>
          </div>

          {/* Tablo */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 14px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>Firma</th>
                  <th style={{ padding: '12px 14px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>VKN</th>
                  <th style={{ padding: '12px 14px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>WS Durumu</th>
                  <th style={{ padding: '12px 14px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>Token</th>
                  <th style={{ padding: '12px 14px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>Son Bağlantı</th>
                  <th style={{ padding: '12px 14px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>İŞBEY</th>
                  <th style={{ padding: '12px 14px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredDealers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
                      Kriterlere uygun firma kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredDealers.map((d, idx) => {
                    const isBusy = actionLoadingId === d.id;
                    return (
                      <tr
                        key={d.id}
                        style={{
                          borderBottom: idx < filteredDealers.length - 1 ? '1px solid var(--border-light)' : 'none',
                          transition: 'background 120ms ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Firma Bilgisi */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}>
                            {d.companyName}
                          </div>
                          <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {d.city} · WS: {d.wsUsername || 'Tanımsız'}
                          </div>
                        </td>

                        {/* VKN */}
                        <td style={{ padding: '12px 14px', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {maskTaxNumber(d.taxNumber)}
                        </td>

                        {/* WS Durumu */}
                        <td style={{ padding: '12px 14px' }}>
                          {d.connectionStatus === 'ACTIVE' ? (
                            <span className="m3-pill m3-pill-success">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
                              Aktif
                            </span>
                          ) : d.connectionStatus === 'ERROR' ? (
                            <span className="m3-pill m3-pill-danger">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--danger)' }} />
                              Hatalı
                            </span>
                          ) : (
                            <span className="m3-pill m3-pill-warning">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning)' }} />
                              Bekliyor
                            </span>
                          )}
                        </td>

                        {/* Token Durumu */}
                        <td style={{ padding: '12px 14px' }}>
                          {d.tokenStatus === 'VALID' ? (
                            <span className="m3-pill m3-pill-success">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
                              Geçerli
                            </span>
                          ) : d.tokenStatus === 'EXPIRING' ? (
                            <span className="m3-pill m3-pill-warning">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning)' }} />
                              Yenilenecek
                            </span>
                          ) : d.tokenStatus === 'EXPIRED' ? (
                            <span className="m3-pill m3-pill-danger">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--danger)' }} />
                              Süresi Doldu
                            </span>
                          ) : (
                            <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        {/* Son Bağlantı */}
                        <td style={{ padding: '12px 14px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                          {d.lastLoginAt ? new Date(d.lastLoginAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Hiç bağlanmadı'}
                        </td>

                        {/* İŞBEY Durumu */}
                        <td style={{ padding: '12px 14px' }}>
                          {d.isbeyStatus === 'ACTIVE' ? (
                            <span style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-main)' }}>Aktif</span>
                          ) : (
                            <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Bekliyor</span>
                          )}
                        </td>

                        {/* İşlemler */}
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={() => handleTestConnection(d)}
                              disabled={isBusy}
                              title="Hızlı Bilişim UtilEncrypt + Login bağlantısını test et"
                              style={{
                                padding: '5px 10px',
                                background: 'var(--bg-surface-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm, 6px)',
                                fontSize: 'var(--fs-xs, 11px)',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {isBusy ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}
                            </button>

                            <button
                              onClick={() => handleRefreshToken(d)}
                              disabled={isBusy}
                              title="24 saatlik token'ı yeniden al"
                              style={{
                                padding: '5px 10px',
                                background: 'var(--bg-surface-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm, 6px)',
                                fontSize: 'var(--fs-xs, 11px)',
                                fontWeight: 600,
                                color: 'var(--info)',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Token Yenile
                            </button>

                            <button
                              onClick={() => openEditModal(d)}
                              title="Firma ve WS Bilgilerini Düzenle"
                              style={{
                                padding: '5px 8px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── SEKME 2: ENTEGRASYON LOGLARI ─── */}
      {activeTab === 'LOGS' && (
        <div className="m3-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Son Entegrasyon &amp; Oturum Olayları
            </h3>
            <button
              onClick={loadLogs}
              style={{ background: 'transparent', border: 'none', color: 'var(--info)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, cursor: 'pointer' }}
            >
              Yenile
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 12px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>Tarih</th>
                  <th style={{ padding: '10px 12px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>Eylem</th>
                  <th style={{ padding: '10px 12px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>Açıklama</th>
                  <th style={{ padding: '10px 12px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)' }}>Kullanıcı</th>
                  <th style={{ padding: '10px 12px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
                      Henüz log kaydı bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  logs.map((l, i) => (
                    <tr key={l.id || i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 12px', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                        {l.createdAt ? new Date(l.createdAt).toLocaleString('tr-TR') : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-main)' }}>
                        {l.action}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                        {l.details}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                        {l.username || 'Sistem'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {l.status === 'SUCCESS' ? (
                          <span className="m3-pill m3-pill-success">Başarılı</span>
                        ) : (
                          <span className="m3-pill m3-pill-danger">Hata</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── YENİ FİRMA / MÜKELLEF EKLE MODALI ─── */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            /* 2026-09-13 (tasarım sadeleştirmesi): Karartma .modal-overlay ile
               aynı tona çekildi; bulanık arka plan (glassmorphism) kaldırıldı. */
            background: 'rgba(10, 15, 30, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg, 10px)',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-color)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                Yeni Mükellef / Firma Ekle
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateDealer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Bölüm 1: Firma Bilgileri */}
              <div style={{ padding: '14px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={15} color="var(--primary)" />
                  <span>1. Firma &amp; Vergi Bilgileri</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Ticari Ünvan *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: ABC Ltd. Şti."
                      value={addForm.companyName}
                      onChange={e => setAddForm({ ...addForm, companyName: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      VKN / TCKN *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={11}
                      placeholder="10 veya 11 hane"
                      value={addForm.taxNumber}
                      onChange={e => setAddForm({ ...addForm, taxNumber: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Vergi Dairesi
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: Ziyapaşa V.D."
                      value={addForm.taxOffice}
                      onChange={e => setAddForm({ ...addForm, taxOffice: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Yetkili Adı Soyadı
                    </label>
                    <input
                      type="text"
                      placeholder="Ahmet Yılmaz"
                      value={addForm.contactName}
                      onChange={e => setAddForm({ ...addForm, contactName: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Telefon
                    </label>
                    <input
                      type="text"
                      placeholder="0532..."
                      value={addForm.phone}
                      onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Bölüm 2: Hızlı Bilişim WS Kimlik Bilgileri */}
              <div style={{ padding: '14px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={15} color="var(--primary)" />
                  <span>2. Hızlı Bilişim Web Servis Bilgileri</span>
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  Resmi dokümantasyona göre kullanıcı adı ve şifre `UtilEncrypt` ile hazırlanır, ardından `Login` çağrısı yapılır.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      WS Kullanıcı Adı
                    </label>
                    <input
                      type="text"
                      placeholder="WS Kullanıcı"
                      value={addForm.wsUsername}
                      onChange={e => setAddForm({ ...addForm, wsUsername: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      WS Şifresi
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={addForm.wsPassword}
                      onChange={e => setAddForm({ ...addForm, wsPassword: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                    />
                  </div>
                </div>

                {/* Entegrasyonu Test Et Butonu */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
                  <button
                    type="button"
                    onClick={handleTestInModal}
                    disabled={actionLoadingId === 'MODAL_TEST'}
                    style={{
                      padding: '7px 14px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm, 6px)',
                      fontSize: 'var(--fs-sm, 12px)',
                      fontWeight: 700,
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Zap size={14} color="var(--primary)" />
                    <span>{actionLoadingId === 'MODAL_TEST' ? 'Test ediliyor...' : 'Entegrasyonu Test Et'}</span>
                  </button>

                  {inlineTestResult && (
                    <span
                      style={{
                        fontSize: 'var(--fs-xs, 11px)',
                        fontWeight: 700,
                        color: inlineTestResult.success ? 'var(--success)' : 'var(--danger)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {inlineTestResult.success ? <Check size={14} /> : <AlertCircle size={14} />}
                      {inlineTestResult.success ? 'Bağlantı Başarılı' : 'Bağlantı Hatası'}
                    </span>
                  )}
                </div>
              </div>

              {/* İŞBEY Hesabı Onayı */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={addForm.createIsbeyAccount}
                  onChange={e => setAddForm({ ...addForm, createIsbeyAccount: e.target.checked })}
                  style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                />
                <span>Bu firma için İŞBEY hesabı (Tenant / Şirket) da otomatik oluşturulsun</span>
              </label>

              {/* Düğmeler */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '9px 16px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: 'var(--fs-sm, 12px)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '9px 20px',
                    background: 'var(--primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: 'var(--fs-sm, 12px)',
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Kaydediliyor...' : 'Firmayı Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DÜZENLE MODALI ─── */}
      {isEditModalOpen && editingDealer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            /* 2026-09-13 (tasarım sadeleştirmesi): Karartma .modal-overlay ile
               aynı tona çekildi; bulanık arka plan (glassmorphism) kaldırıldı. */
            background: 'rgba(10, 15, 30, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg, 10px)',
              width: '100%',
              maxWidth: '540px',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-color)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                Firma &amp; WS Bilgilerini Düzenle
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateDealer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Firma Ünvanı
                </label>
                <input
                  type="text"
                  required
                  value={editForm.companyName}
                  onChange={e => setEditForm({ ...editForm, companyName: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Yetkili Kişi
                  </label>
                  <input
                    type="text"
                    value={editForm.contactName}
                    onChange={e => setEditForm({ ...editForm, contactName: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Telefon
                  </label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>
              </div>

              {/* WS Kullanıcı Adı */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Hızlı Bilişim WS Kullanıcı Adı
                </label>
                <input
                  type="text"
                  value={editForm.wsUsername}
                  onChange={e => setEditForm({ ...editForm, wsUsername: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              {/* WS Şifresi */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Yeni WS Şifresi (Değiştirmek istemiyorsanız boş bırakın)
                </label>
                <input
                  type="password"
                  placeholder="Mevcut şifre korunuyor"
                  value={editForm.wsPassword}
                  onChange={e => setEditForm({ ...editForm, wsPassword: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: 'var(--fs-sm, 12px)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '8px 20px',
                    background: 'var(--primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: 'var(--fs-sm, 12px)',
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Kaydediliyor...' : 'Güncelle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
