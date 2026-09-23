import React, { useState, useEffect } from 'react';
import { ErpSubscriptionEditor } from './ErpSubscriptionEditor';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { CompanyUserModal } from './CompanyUserModal';
import { PasswordResetModal } from './PasswordResetModal';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import {
  Building,
  Users,
  Layers,
  Shield,
  GitBranch,
  Package,
  FileText,
  Zap,
  Activity,
  Lock,
  Plus,
  Edit2,
  Trash2,
  Key,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Power,
  RefreshCw,
  Sliders,
  Check,
  AlertTriangle,
  Smartphone,
  Laptop,
} from 'lucide-react';
import type { Tenant, User, AuditLog, TenantPlan, TenantStatus } from '../../../types';

interface CompanyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string | null;
  onRefresh: () => void;
}

type TabType =
  | 'GENERAL'
  | 'USERS'
  | 'SERVICES'
  | 'LICENSE'
  | 'BRANCHES'
  | 'WAREHOUSES'
  | 'PERMISSIONS'
  | 'DOCUMENTS'
  | 'EDOCUMENT'
  | 'LOGS'
  | 'SECURITY';

export const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({
  isOpen,
  onClose,
  companyId,
  onRefresh,
}) => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('GENERAL');
  const [company, setCompany] = useState<Tenant | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [serviceCatalog, setServiceCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Sub Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState(false);
  const [selectedServiceToAdd, setSelectedServiceToAdd] = useState('EFATURA');

  useEffect(() => {
    if (isOpen && companyId) {
      loadData(companyId);
    }
  }, [isOpen, companyId]);

  const loadData = async (id: string) => {
    setLoading(true);
    try {
      const [res, srvRes] = await Promise.all([
        api.getCompanyDetail(id),
        api.getServiceCatalog(),
      ]);
      if (res.success) {
        setCompany(res.company);
        setDetails(res.details);
      }
      if (srvRes.success) {
        setServiceCatalog(srvRes.services);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !company) return null;

  const handleToggleService = async (serviceCode: string) => {
    try {
      const res = await api.updateCompanyServices(company.id, {
        action: 'TOGGLE',
        serviceCode,
      });
      if (res.success) {
        showToast('Hizmet durumu güncellendi.', 'success');
        loadData(company.id);
        onRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız.', 'error');
    }
  };

  const handleAddService = async () => {
    try {
      const res = await api.updateCompanyServices(company.id, {
        action: 'ADD',
        serviceCode: selectedServiceToAdd,
      });
      if (res.success) {
        showToast('Hizmet firmaya eklendi.', 'success');
        setIsNewServiceModalOpen(false);
        loadData(company.id);
        onRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Hizmet eklenemedi.', 'error');
    }
  };

  const handleToggleUser = async (user: User) => {
    try {
      const res = await api.toggleUserStatus(user.id, !user.active);
      if (res.success) {
        showToast(res.message, 'success');
        loadData(company.id);
      }
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız.', 'error');
    }
  };

  const handleRevokeSessions = async (userId: string) => {
    try {
      const res = await api.revokeUserSessions(userId);
      if (res.success) {
        showToast(res.message, 'success');
        loadData(company.id);
      }
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız.', 'error');
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'GENERAL', label: 'Genel Bilgiler', icon: <Building size={14} /> },
    { id: 'USERS', label: 'Kullanıcılar', icon: <Users size={14} />, count: details?.users?.length || 0 },
    { id: 'SERVICES', label: 'Hizmetler', icon: <Layers size={14} />, count: company.activeServices?.length || 0 },
    { id: 'LICENSE', label: 'Paket / Lisans', icon: <Shield size={14} /> },
    { id: 'BRANCHES', label: 'Şubeler', icon: <GitBranch size={14} />, count: company.branches?.length || 1 },
    { id: 'WAREHOUSES', label: 'Depolar', icon: <Package size={14} />, count: details?.warehouses?.length || 1 },
    { id: 'PERMISSIONS', label: 'Yetkiler', icon: <Sliders size={14} /> },
    { id: 'DOCUMENTS', label: 'Belge Ayarları', icon: <FileText size={14} /> },
    { id: 'EDOCUMENT', label: 'E-Belge', icon: <Zap size={14} /> },
    { id: 'LOGS', label: 'Loglar', icon: <Activity size={14} /> },
    { id: 'SECURITY', label: 'Güvenlik', icon: <Lock size={14} /> },
  ];

  const userColumns: Column<User>[] = [
    {
      key: 'username',
      title: 'Kullanıcı',
      width: '180px',
      render: u => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: u.active ? 'rgba(26,86,219,0.1)' : 'rgba(100,116,139,0.1)',
            color: u.active ? 'var(--primary)' : '#64748b',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '11px',
          }}>
            {u.fullName?.charAt(0) || u.username?.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '12px' }}>{u.fullName}</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>@{u.username}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      title: 'E-posta & Telefon',
      render: u => (
        <div>
          <div style={{ fontSize: '11.5px' }}>{u.email}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{u.phone || '—'}</div>
        </div>
      ),
    },
    {
      key: 'role',
      title: 'Rol',
      width: '130px',
      render: u => (
        <span className="badge badge-primary" style={{ fontSize: '10px' }}>
          {u.role}
        </span>
      ),
    },
    {
      key: 'active',
      title: 'Durum',
      width: '90px',
      render: u => (
        <span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px' }}>
          {u.active ? 'Aktif' : 'Pasif'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'İşlemler',
      width: '220px',
      sortable: false,
      render: u => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-secondary btn-sm"
            title="Düzenle"
            onClick={() => { setEditingUser(u); setIsUserModalOpen(true); }}
          >
            <Edit2 size={11} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="Güvenli Şifre Sıfırla"
            onClick={() => setResettingUser(u)}
          >
            <Key size={11} />
          </button>
          <button
            className={`btn ${u.active ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            title={u.active ? 'Pasife Al (Oturumları Düşürür)' : 'Aktifleştir'}
            onClick={() => handleToggleUser(u)}
          >
            <Power size={11} color={u.active ? '#ef4444' : '#16a34a'} />
            <span style={{ fontSize: '10px' }}>{u.active ? 'Pasif' : 'Aktif'}</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="Tüm Oturumları Kapat"
            onClick={() => handleRevokeSessions(u.id)}
          >
            <Lock size={11} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`🏢 Firma Yönetim Detayı — ${company.name} (${company.companyCode || company.slug})`}
        size="large"
      >
        {/* 11 Sekme Menüsü */}
        <div style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '2px solid var(--border-color)',
          paddingBottom: '0',
          marginBottom: '16px',
          overflowX: 'auto',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 12px',
                fontSize: '11.5px',
                fontWeight: activeTab === tab.id ? 700 : 500,
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                background: 'transparent',
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                borderRadius: '6px 6px 0 0',
                whiteSpace: 'nowrap',
                marginBottom: '-2px',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span style={{
                  background: activeTab === tab.id ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                  color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── 1. GENEL BİLGİLER ─── */}
        {activeTab === 'GENERAL' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
            <div className="card-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 4px', color: 'var(--text-main)' }}>Firma Künyesi</h4>
              {[
                { k: 'Firma Kodu', v: company.companyCode || '—', mono: true },
                { k: 'Firma Adı', v: company.name },
                { k: 'Ticari Unvan', v: company.title },
                { k: 'Vergi No / VKN', v: company.taxNumber, mono: true },
                { k: 'Vergi Dairesi', v: company.taxOffice },
                { k: 'TCKN', v: company.identityNumber || '—', mono: true },
                { k: 'MERSİS No', v: company.mersisNo || '—', mono: true },
                { k: 'Telefon', v: company.phone || '—' },
                { k: 'GSM', v: company.gsm || '—' },
                { k: 'E-posta', v: company.email },
                { k: 'Web', v: company.website || '—' },
                { k: 'Adres', v: `${company.address || ''} ${company.district || ''} / ${company.city || ''}` },
              ].map(({ k, v, mono }) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-surface-secondary)', borderRadius: '5px', fontSize: '11.5px' }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: '120px' }}>{k}:</span>
                  <span style={{ fontWeight: 700, fontFamily: mono ? 'var(--font-mono)' : 'inherit', textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Yetkili Kartı */}
              <div className="card-panel" style={{ padding: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} color="var(--primary)" />
                  <span>Resmi Yetkili Bilgileri</span>
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  <div><strong>Ad Soyad:</strong> {company.authorizedPerson?.firstName || company.ownerName} {company.authorizedPerson?.lastName || ''}</div>
                  <div><strong>Telefon:</strong> {company.authorizedPerson?.phone || company.ownerPhone || '—'}</div>
                  <div><strong>E-posta:</strong> {company.authorizedPerson?.email || company.ownerEmail || '—'}</div>
                </div>
              </div>

              {/* Anlık İstatistikler */}
              <div className="card-panel" style={{ padding: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px', color: 'var(--text-main)' }}>Firma Büyüklüğü & İstatistikler</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { label: 'Kayıtlı Müşteri', val: company.stats?.totalCustomers || 0 },
                    { label: 'Kayıtlı Ürün', val: company.stats?.totalProducts || 0 },
                    { label: 'Kesilen Fatura', val: company.stats?.totalInvoices || 0 },
                    { label: 'Kullanıcı Sayısı', val: `${details?.users?.length || 0} / ${company.maxUsers}` },
                    { label: 'Şube Sayısı', val: company.branches?.length || 1 },
                    { label: 'Depo Sayısı', val: details?.warehouses?.length || 1 },
                  ].map((s, i) => (
                    <div key={i} style={{ padding: '8px', background: 'var(--bg-surface-secondary)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{s.label}</div>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── 2. KULLANICILAR ─── */}
        {activeTab === 'USERS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Firma Kullanıcıları ({details?.users?.length || 0} / {company.maxUsers} limit)</h4>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Bu firmaya atanmış ve sisteme erişebilen tüm hesaplar</div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={13} />
                <span>+ Kullanıcı Ekle</span>
              </button>
            </div>

            <DataGrid
              columns={userColumns}
              data={details?.users || []}
              rowKey="id"
              emptyMessage="Bu firmaya ait henüz kullanıcı kaydı bulunmuyor."
            />
          </div>
        )}

        {/* ─── 3. HİZMETLER ─── */}
        {activeTab === 'SERVICES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Firma Hizmet & Modül Yetkileri</h4>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pasif edilen hizmetler kullanıcı arayüzünde gizlenir ve backend API erişimi 403 ile kısıtlanır.</div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setIsNewServiceModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={13} />
                <span>Hizmet Ekle</span>
              </button>
            </div>

            {/* Hizmetler Listesi Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {(company.activeServices || []).map(srv => {
                const isAct = srv.status === 'ACTIVE';
                return (
                  <div
                    key={srv.serviceCode}
                    style={{
                      padding: '12px 14px',
                      background: isAct ? 'rgba(22,163,74,0.05)' : 'rgba(100,116,139,0.06)',
                      border: isAct ? '1.5px solid rgba(22,163,74,0.3)' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 800, fontSize: '12.5px', color: isAct ? 'var(--text-main)' : 'var(--text-muted)' }}>
                          {srv.serviceName || srv.serviceCode}
                        </span>
                        <span className={`badge ${isAct ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '9px' }}>
                          {isAct ? 'Aktif' : 'Pasif'}
                        </span>
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                        Kod: {srv.serviceCode} · Bitiş: {srv.endDate || 'Süresiz'}
                      </div>
                    </div>

                    <button
                      className={`btn ${isAct ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                      onClick={() => handleToggleService(srv.serviceCode)}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      {isAct ? 'Pasife Al' : 'Aktifleştir'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Yeni Hizmet Ekleme Modalı */}
            {isNewServiceModalOpen && (
              <div style={{
                background: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}>
                <select
                  className="form-input"
                  value={selectedServiceToAdd}
                  onChange={e => setSelectedServiceToAdd(e.target.value)}
                  style={{ flex: 1 }}
                >
                  {serviceCatalog.map(s => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code}) — {s.category}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" onClick={handleAddService}>
                  Ekle
                </button>
                <button className="btn btn-secondary" onClick={() => setIsNewServiceModalOpen(false)}>
                  İptal
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── 4. PAKET / LİSANS ─── */}
        {activeTab === 'LICENSE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <ErpSubscriptionEditor key={company.id} company={company} onSaved={() => { loadData(company.id); onRefresh(); }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              <div className="card-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Mevcut Abonelik Paketi</div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--primary)', marginTop: '4px' }}>
                  {company.plan}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700, marginTop: '4px' }}>
                  ✓ {company.status}
                </div>
              </div>

              <div className="card-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Lisans Başlangıç & Bitiş</div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>
                  {company.license?.startDate || company.createdAt.split('T')[0]}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
                  Bitiş: {company.license?.endDate || company.expiresAt?.split('T')[0] || '2027-12-31'}
                </div>
              </div>

              <div className="card-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>e-Fatura Kontör Bakiyesi</div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--success)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                  {company.eInvoiceCredits || 0} Kontör
                </div>
              </div>
            </div>

            {/* Limitler Tablosu */}
            <div className="card-panel" style={{ padding: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 12px' }}>Paket Limitleri</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {[
                  { k: 'Kullanıcı Limiti', v: `${details?.users?.length || 0} / ${company.maxUsers}` },
                  { k: 'Şube Limiti', v: `${company.branches?.length || 1} / ${company.limits?.maxBranches || 3}` },
                  { k: 'Depo Limiti', v: `${details?.warehouses?.length || 1} / ${company.limits?.maxWarehouses || 3}` },
                  { k: 'Aylık Fatura Limiti', v: `${company.stats?.monthlyInvoiceCount || 0} / ${company.maxInvoicesPerMonth || 5000}` },
                ].map(({ k, v }) => (
                  <div key={k} style={{ padding: '10px', background: 'var(--bg-surface-secondary)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{k}</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── 5. ŞUBELER ─── */}
        {activeTab === 'BRANCHES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Kayıtlı Şubeler ({company.branches?.length || 1})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(company.branches || [
                { id: 'br-1', name: `${company.name} Merkez Şube`, code: 'SB-01', isDefault: true, city: company.city, managerName: company.ownerName }
              ]).map(b => (
                <div key={b.id} style={{ padding: '12px 14px', background: 'var(--bg-surface-secondary)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <GitBranch size={16} color="var(--primary)" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{b.name} {b.isDefault && <span className="badge badge-primary" style={{ fontSize: '9px' }}>Varsayılan</span>}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kod: {b.code} · Şehir: {b.city || '—'} · Yetkili: {b.managerName || '—'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── 6. DEPOLAR ─── */}
        {activeTab === 'WAREHOUSES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Kayıtlı Depolar ({details?.warehouses?.length || 1})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(details?.warehouses || []).map((w: any) => (
                <div key={w.id} style={{ padding: '12px 14px', background: 'var(--bg-surface-secondary)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Package size={16} color="var(--primary)" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{w.name} {w.isDefault && <span className="badge badge-primary" style={{ fontSize: '9px' }}>Varsayılan</span>}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kod: {w.code} · Adres: {w.address || '—'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── 7. YETKİLER ─── */}
        {activeTab === 'PERMISSIONS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Rol & Yetki Erişim Şablonu</h4>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Her modül için varsayılan yetki dağılımı (VIEW, CREATE, UPDATE, DELETE, PRINT)</div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Modül</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>Görüntüle</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>Ekle</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>Düzenle</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>Sil</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>Yazdır</th>
                  </tr>
                </thead>
                <tbody>
                  {['Cari Hesaplar', 'Stok & Depo', 'Faturalar', 'Kasa & Banka', 'e-Dönüşüm'].map(m => (
                    <tr key={m} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>{m}</td>
                      <td style={{ textAlign: 'center', padding: '8px' }}>✓</td>
                      <td style={{ textAlign: 'center', padding: '8px' }}>✓</td>
                      <td style={{ textAlign: 'center', padding: '8px' }}>✓</td>
                      <td style={{ textAlign: 'center', padding: '8px' }}>—</td>
                      <td style={{ textAlign: 'center', padding: '8px' }}>✓</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── 8. BELGE AYARLARI ─── */}
        {activeTab === 'DOCUMENTS' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="card-panel" style={{ padding: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px' }}>Belge Numaratörleri (Seri & Sayaç)</h4>
              {[
                { k: 'Satış Faturası', v: 'ISB2026000001' },
                { k: 'Alış Faturası', v: 'ALF2026000001' },
                { k: 'Sevk İrsaliyesi', v: 'IRS2026000001' },
                { k: 'Teklif & Sipariş', v: 'TKL2026000001' },
              ].map(({ k, v }) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-surface-secondary)', borderRadius: '5px', marginBottom: '6px', fontSize: '12px' }}>
                  <span>{k}:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="card-panel" style={{ padding: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px' }}>Yazdırma & Fiş Ayarları</h4>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Varsayılan Yazıcı: <strong>Termal 80mm POS Fişi</strong><br />
                Fatura Şablonu: <strong>Standart A4 UBL-TR</strong><br />
                Logo Çıktısı: <strong>Aktif ✓</strong>
              </div>
            </div>
          </div>
        )}

        {/* ─── 9. E-BELGE & HIZLI BİLİŞİM PORTAL EŞLEMESİ ─── */}
        {activeTab === 'EDOCUMENT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz ikincil yüzey token'ı. */}
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1.5px solid var(--primary)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 900, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
                  <Zap size={18} />
                  <span>Hızlı Teknoloji e-Connect Portal Eşlemesi</span>
                </div>
                <span className="badge badge-success" style={{ fontSize: '10.5px' }}>
                  ✓ Canlı Portal Eşleşti
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Firma VKN: <strong>{company.taxNumber}</strong> · Portal Müşteri: <code>{company.externalCustomerId || 'HB-' + company.taxNumber}</code>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="card-panel" style={{ padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Gönderici Birim (GB) Posta Kutusu</div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                  {company.edonusumConfig?.gbUrn || 'urn:mail:defaultgb@hizlibilisimteknolojileri.net'}
                </div>
              </div>

              <div className="card-panel" style={{ padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Posta Kutusu (PK) URN</div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                  {company.edonusumConfig?.pkUrn || 'urn:mail:defaultpk@hizlibilisimteknolojileri.net'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div className="card-panel" style={{ padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Portal ApiKey</div>
                <div style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {company.edonusumConfig?.apiKey || '—tanımlı değil—'}
                </div>
              </div>

              <div className="card-panel" style={{ padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Fatura Profili</div>
                <div style={{ fontSize: '12px', fontWeight: 800, marginTop: '2px' }}>
                  {company.edonusumConfig?.defaultProfile || 'TEMELFATURA'}
                </div>
              </div>

              <div className="card-panel" style={{ padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Portal Kontör Bakiyesi</div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--success)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {company.eInvoiceCredits || 250} Kontör
                </div>
              </div>
            </div>

            <div className="card-panel" style={{ padding: '14px' }}>
              <h4 style={{ fontSize: '12.5px', fontWeight: 800, margin: '0 0 10px' }}>Aktif e-Dönüşüm Hizmetleri</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-success" style={{ fontSize: '11px', padding: '4px 8px' }}>✓ e-Fatura (GİB UBL-TR 2.1)</span>
                <span className="badge badge-success" style={{ fontSize: '11px', padding: '4px 8px' }}>✓ e-Arşiv Fatura & GİB 5000/30000</span>
                <span className="badge badge-info" style={{ fontSize: '11px', padding: '4px 8px' }}>✓ e-İrsaliye</span>
                <span className="badge badge-warning" style={{ fontSize: '11px', padding: '4px 8px' }}>✓ e-Defter (HizliDefter API)</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── 10. LOGLAR ─── */}
        {activeTab === 'LOGS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Firma Denetim Kayıtları (Audit Log)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '350px', overflowY: 'auto' }}>
              {(details?.auditLogs || []).map((l: any) => (
                <div key={l.id} style={{ padding: '8px 12px', background: 'var(--bg-surface-secondary)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{l.action}</span> · {l.details}
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>{new Date(l.timestamp).toLocaleString('tr-TR')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── 11. GÜVENLİK ─── */}
        {activeTab === 'SECURITY' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Aktif Oturumlar & Cihazlar</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(details?.sessions || []).map((s: any) => (
                <div key={s.id} style={{ padding: '12px 14px', background: 'var(--bg-surface-secondary)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Laptop size={18} color="var(--primary)" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '12px' }}>{s.device} ({s.browser}) — @{s.username}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>IP: {s.ipAddress} · Son İşlem: {new Date(s.lastActiveAt).toLocaleString('tr-TR')}</div>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRevokeSessions(s.userId)}
                    style={{ fontSize: '11px', color: '#dc2626' }}
                  >
                    Oturumu Kapat
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Kullanıcı Ekleme / Düzenleme Modalı */}
      <CompanyUserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        onSuccess={() => { if (companyId) loadData(companyId); }}
        company={company}
        editingUser={editingUser}
      />

      {/* Şifre Sıfırlama Modalı */}
      <PasswordResetModal
        isOpen={!!resettingUser}
        onClose={() => setResettingUser(null)}
        user={resettingUser}
      />
    </>
  );
};
