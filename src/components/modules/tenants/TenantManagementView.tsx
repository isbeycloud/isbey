import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Tenant, TenantPlan, TenantStatus } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { NewTenantModal } from './NewTenantModal';
import { TenantEditModal } from './TenantEditModal';
import { AddCreditsModal } from './AddCreditsModal';
import {
  Building,
  Plus,
  ArrowRightLeft,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Coins,
  Users,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

export const TenantManagementView: React.FC = () => {
  const { showToast } = useToast();
  const { activeTenantId, switchTenant, triggerRefresh, refreshKey } = useApp();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [planFilter, setPlanFilter] = useState<string>('ALL');

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [creditingTenant, setCreditingTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    loadTenantsData();
  }, [statusFilter, planFilter, refreshKey]);

  const loadTenantsData = async () => {
    setLoading(true);
    try {
      const res = await api.getTenants({
        status: statusFilter,
        plan: planFilter,
      });
      if (res.success) {
        setTenants(res.tenants);
        setSummary(res.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchTenant = async (tenant: Tenant) => {
    if (tenant.status === 'SUSPENDED') {
      showToast('Bu kiracı şirket askıya alınmıştır, giriş yapılamaz.', 'error');
      return;
    }
    const success = await switchTenant(tenant.id);
    if (success) {
      showToast(`"${tenant.name}" çalışma ortamına geçildi.`, 'success');
      loadTenantsData();
    }
  };

  const handleDeleteTenant = async (tenant: Tenant) => {
    if (tenant.id === 'tnt-isbey') {
      showToast('Merkez ana kiracı şirketi silinemez!', 'warning');
      return;
    }
    if (!window.confirm(`"${tenant.name}" kiracı şirketini silmek istediğinize emin misiniz?`)) return;

    try {
      const res = await api.deleteTenant(tenant.id);
      if (res.success) {
        showToast(res.message, 'success');
        loadTenantsData();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Silme işlemi başarısız.', 'error');
    }
  };

  const filteredTenants = tenants.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.taxNumber.includes(q) ||
      t.ownerName.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q)
    );
  });

  const planBadges: Record<TenantPlan, { label: string; bg: string; color: string }> = {
    FREE: { label: 'Free Deneme', bg: '#f1f5f9', color: '#475569' },
    STARTER: { label: 'Starter Plan', bg: '#e0f2fe', color: '#0369a1' },
    PRO: { label: 'Pro Plan', bg: '#dcfce7', color: '#15803d' },
    PROFESSIONAL: { label: 'Professional Plan', bg: '#dcfce7', color: '#15803d' },
    ENTERPRISE: { label: 'Enterprise Kurumsal', bg: '#f3e8ff', color: '#7e22ce' },
  };

  const statusBadges: Record<TenantStatus, { label: string; color: string; icon: any }> = {
    ACTIVE: { label: 'Aktif', color: 'badge-success', icon: CheckCircle2 },
    INACTIVE: { label: 'Pasif', color: 'badge-danger', icon: AlertCircle },
    TRIAL: { label: 'Deneme', color: 'badge-warning', icon: Clock },
    SUSPENDED: { label: 'Askıda', color: 'badge-danger', icon: AlertCircle },
    EXPIRED: { label: 'Süresi Doldu', color: 'badge-secondary', icon: AlertCircle },
  };

  const columns: Column<Tenant>[] = [
    {
      key: 'name',
      title: 'Kiracı Şirket & Unvan',
      render: t => {
        const isCurrent = t.id === activeTenantId;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: isCurrent ? 'var(--primary)' : 'var(--bg-surface-secondary)',
              color: isCurrent ? '#fff' : 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '13px',
              border: isCurrent ? '2px solid #60a5fa' : '1px solid var(--border-color)',
              flexShrink: 0,
              boxShadow: isCurrent ? '0 0 0 2px rgba(26,86,219,0.3)' : 'none',
            }}>
              {t.logoUrl ? (
                <img src={t.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                t.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-main)' }}>{t.name}</span>
                {isCurrent && (
                  <span style={{
                    fontSize: '9.5px',
                    fontWeight: 800,
                    background: 'var(--primary)',
                    color: '#fff',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    letterSpacing: '0.3px',
                  }}>
                    AKTİF ÇALIŞILAN
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {t.title}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'taxNumber',
      title: 'VKN & Şehir',
      width: '140px',
      render: t => (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{t.taxNumber}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
            {t.taxOffice} • {t.city || 'İstanbul'}
          </div>
        </div>
      ),
    },
    {
      key: 'plan',
      title: 'Paket / Plan',
      width: '130px',
      render: t => {
        const pb = planBadges[t.plan] || planBadges.PRO;
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            background: pb.bg,
            color: pb.color,
            fontWeight: 700,
            fontSize: '11px',
          }}>
            {pb.label}
          </span>
        );
      },
    },
    {
      key: 'status',
      title: 'Durum',
      width: '100px',
      render: t => {
        const sb = statusBadges[t.status] || statusBadges.ACTIVE;
        return (
          <span className={`badge ${sb.color}`} style={{ fontSize: '10.5px' }}>
            {sb.label}
          </span>
        );
      },
    },
    {
      key: 'eInvoiceCredits',
      title: 'e-Kontör Bakiyesi',
      width: '140px',
      numeric: true,
      render: t => {
        const credits = t.eInvoiceCredits || 0;
        const isLow = credits < 100;
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
            <span style={{
              fontWeight: 800,
              fontSize: '12.5px',
              fontFamily: 'var(--font-mono)',
              color: isLow ? 'var(--danger)' : 'var(--success)'
            }}>
              {credits.toLocaleString('tr-TR')}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={e => {
                e.stopPropagation();
                setCreditingTenant(t);
              }}
              title="+ Kontör Yükle"
              style={{ color: 'var(--primary)', padding: '1px 4px' }}
            >
              <Plus size={13} />
            </button>
          </div>
        );
      },
    },
    {
      key: 'currentUsers',
      title: 'Kullanıcı Kotası',
      width: '110px',
      render: t => (
        <div style={{ fontSize: '11.5px' }}>
          <span style={{ fontWeight: 700 }}>{t.currentUsers || 1}</span> / {t.maxUsers} Kullanıcı
        </div>
      ),
    },
    {
      key: 'id',
      title: 'Eylemler & Hızlı Geçiş',
      width: '190px',
      render: t => {
        const isCurrent = t.id === activeTenantId;
        return (
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
            {!isCurrent ? (
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => handleSwitchTenant(t)}
                title="Bu şirketin çalışma ortamına geçiş yap"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
              >
                <ArrowRightLeft size={12} />
                <span>Geçiş Yap</span>
              </button>
            ) : (
              <span className="badge badge-success" style={{ fontSize: '10px', padding: '3px 6px' }}>
                ✓ Aktif
              </span>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setCreditingTenant(t)}
              title="Kontör Yükle"
            >
              <Coins size={12} />
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setEditingTenant(t)}
              title="Kiracı Ayarlarını Düzenle"
            >
              <Edit2 size={12} />
            </button>

            {t.id !== 'tnt-isbey' && (
              <button
                type="button"
                className="btn btn-danger btn-xs"
                onClick={() => handleDeleteTenant(t)}
                title="Kiracı Şirketi Sil"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="view-content-container">
      {/* ─── 1. Üst Başlık & Yeni Kiracı Butonu ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
            <Building size={20} color="var(--primary)" />
            <span>Multi-Tenant (Çoklu Şirket & Kiracı) Yönetim Konsolu</span>
          </h2>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Sistemdeki tüm işletmeleri, şubeleri, lisans paketlerini ve e-fatura kontör havuzlarını tek noktadan yönetin.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadTenantsData}
            title="Yenile"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Yenile</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setIsNewModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} />
            <span>+ Yeni Kiracı / Şirket Başlat</span>
          </button>
        </div>
      </div>

      {/* ─── 2. KPI Gösterge Kartları ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
        <div className="kpi-card">
          <div className="kpi-title">
            <Building size={14} color="var(--primary)" /> Toplam Kiracı
          </div>
          <div className="kpi-value" style={{ color: 'var(--primary)' }}>
            {summary?.totalTenants || tenants.length}
          </div>
          <div className="kpi-sub">
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>{summary?.activeTenants || 0} Aktif</span> • {summary?.trialTenants || 0} Deneme
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <CheckCircle2 size={14} color="var(--success)" /> Aktif Abonelikler
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>
            {summary?.activeTenants || 0}
          </div>
          <div className="kpi-sub">Kesintisiz çalışan şirketler</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <Users size={14} color="#0284c7" /> Toplam Kullanıcı
          </div>
          <div className="kpi-value" style={{ color: '#0284c7' }}>
            {summary?.totalUsers || 0}
          </div>
          <div className="kpi-sub">Aktif lisanslı kullanıcılar</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <Coins size={14} color="#eab308" /> e-Kontör Havuzu
          </div>
          <div className="kpi-value" style={{ color: '#ca8a04' }}>
            {(summary?.totalCredits || 0).toLocaleString('tr-TR')}
          </div>
          <div className="kpi-sub">Kalan e-Fatura / e-İrsaliye</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <DollarSign size={14} color="#8b5cf6" /> Tahmini Gelir (MRR)
          </div>
          <div className="kpi-value" style={{ color: '#7c3aed' }}>
            {(summary?.totalMRR || 0).toLocaleString('tr-TR')} ₺
          </div>
          <div className="kpi-sub">Aylık yinelenen lisans hacmi</div>
        </div>
      </div>

      {/* ─── 3. Arama & Filtreleme Çubuğu ─── */}
      <div className="card-panel" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface-secondary)', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', flex: 1, maxWidth: '360px' }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Şirket adı, VKN, yetkili veya e-posta ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '12px', color: 'var(--text-main)' }}
            />
          </div>

          {/* Durum Filtresi */}
          <select
            className="form-select"
            style={{ width: '140px', padding: '4px 8px', fontSize: '11.5px' }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="ACTIVE">Aktif Şirketler</option>
            <option value="TRIAL">Deneme Sürecinde</option>
            <option value="SUSPENDED">Askıya Alınanlar</option>
          </select>

          {/* Plan Filtresi */}
          <select
            className="form-select"
            style={{ width: '140px', padding: '4px 8px', fontSize: '11.5px' }}
            value={planFilter}
            onChange={e => setPlanFilter(e.target.value)}
          >
            <option value="ALL">Tüm Paketler</option>
            <option value="ENTERPRISE">Enterprise Plan</option>
            <option value="PRO">Pro Plan</option>
            <option value="STARTER">Starter Plan</option>
            <option value="FREE">Free Deneme</option>
          </select>
        </div>

        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
          Toplam <strong>{filteredTenants.length}</strong> kiracı şirket listeleniyor
        </div>
      </div>

      {/* ─── 4. Kiracılar DataGrid Tablosu ─── */}
      <div className="card-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <DataGrid
          data={filteredTenants}
          columns={columns}
          loading={loading}
          emptyMessage="Kriterlere uygun kiracı şirket bulunamadı."
        />
      </div>

      {/* ─── 5. Modallar ─── */}
      <NewTenantModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreated={() => {
          loadTenantsData();
          triggerRefresh();
        }}
      />

      <TenantEditModal
        isOpen={!!editingTenant}
        onClose={() => setEditingTenant(null)}
        tenant={editingTenant}
        onUpdated={() => {
          loadTenantsData();
          triggerRefresh();
        }}
      />

      <AddCreditsModal
        isOpen={!!creditingTenant}
        onClose={() => setCreditingTenant(null)}
        tenant={creditingTenant}
        onCreditsAdded={() => {
          loadTenantsData();
          triggerRefresh();
        }}
      />
    </div>
  );
};
