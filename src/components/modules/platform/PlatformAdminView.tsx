import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Activity,
  Megaphone,
  Crown,
  Coins,
  Edit,
  Plus,
  Network,
  Building,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { GarantiPosPreparation } from './GarantiPosPreparation';
import { useToast } from '../../../context/ToastContext';
import type { SubscriptionPlan, CreditPackage, Dealer, DealerCommission, Payment } from '../../../types';

export const PlatformAdminView: React.FC<{ embedded?: boolean; onOpenCompanies?: () => void }> = ({ embedded = false, onOpenCompanies }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'creditPackages' | 'dealers' | 'pos'>('overview');

  const [metrics, setMetrics] = useState<any>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [commissions, setCommissions] = useState<DealerCommission[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);


  // Announcement Modal
  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    targetAudience: 'ALL',
    priority: 'NORMAL',
  });

  // Edit Plan Modal
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);

  // New Credit Package Modal
  const [isCreditPkgModalOpen, setIsCreditPkgModalOpen] = useState(false);
  const [newPkg, setNewPkg] = useState({
    name: '',
    quantity: 500,
    price: 750,
    vatRate: 20,
    isPopular: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [mRes, planRes, cpRes, dealerRes]: any[] = await Promise.all([
        api.getPlatformMetrics().catch(() => ({ success: false })),
        api.getSubscriptionPlans().catch(() => ({ success: false })),
        api.getCreditPackages().catch(() => ({ success: false })),
        api.getAdminDealers().catch(() => ({ success: false })),
      ]);

      if (mRes && mRes.success) setMetrics(mRes);
      if (planRes && planRes.success) setPlans(planRes.plans || []);
      if (cpRes && cpRes.success) setCreditPackages(cpRes.packages || []);
      if (dealerRes && dealerRes.success) {
        setDealers(dealerRes.dealers || []);
        setCommissions(dealerRes.commissions || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Platform verileri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createPlatformAnnouncement(announcementForm);
      if (res.success) {
        showToast('Duyuru tüm hedef kullanıcılara iletildi.', 'success');
        setIsAnnounceModalOpen(false);
        setAnnouncementForm({ title: '', content: '', targetAudience: 'ALL', priority: 'NORMAL' });
      }
    } catch (err: any) {
      showToast(err.message || 'Duyuru oluşturulamadı.', 'error');
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    try {
      const res = await api.updateAdminPlan(editingPlan.id, editingPlan);
      if (res.success) {
        showToast(res.message || 'Paket güncellendi.', 'success');
        setEditingPlan(null);
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Paket güncellenemedi.', 'error');
    }
  };

  const handleCreateCreditPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createAdminCreditPackage(newPkg);
      if (res.success) {
        showToast(res.message || 'Kontör paketi oluşturuldu.', 'success');
        setIsCreditPkgModalOpen(false);
        setNewPkg({ name: '', quantity: 500, price: 750, vatRate: 20, isPopular: false });
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Paket oluşturulamadı.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)' }}>
      {/* Üst Bar */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', padding: '16px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: embedded ? 'none' : 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={20} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--fs-xl, 20px)', fontWeight: 700 }}>Süper Admin & SaaS Platform Masası</h1>
              <p style={{ margin: 0, fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                Multi-Tenant Firmalar, SaaS Gelirleri, Paketler ve Platform Sağlığı
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            {[
              { id: 'overview', label: 'Platform Özeti', icon: Activity },
              ...(onOpenCompanies ? [{ id: 'companies', label: 'Firma Listesini Aç', icon: Building, badge: '' }] : []),
              { id: 'plans', label: 'Paket Tarifeleri', icon: Crown, badge: String(plans.length) },
              { id: 'pos', label: 'Sanal POS', icon: ShieldAlert },
              { id: 'creditPackages', label: 'Kontör Paketleri', icon: Coins, badge: String(creditPackages.length) },
              { id: 'dealers', label: 'Bayi Ağı & Komisyon', icon: Network, badge: String(dealers.length) },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => t.id === 'companies' ? onOpenCompanies?.() : setActiveTab(t.id as any)}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  background: activeTab === t.id ? 'var(--bg-surface-secondary)' : 'transparent',
                  borderTopLeftRadius: 'var(--radius-sm, 6px)',
                  borderTopRightRadius: 'var(--radius-sm, 6px)',
                  borderBottom: activeTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                  color: activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: activeTab === t.id ? 700 : 600,
                  fontSize: 'var(--fs-sm, 12px)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <t.icon size={15} />
                <span>{t.label}</span>
                {t.badge && (
                  <span style={{ fontSize: 'var(--fs-xs, 11px)', padding: '1px 6px', borderRadius: 'var(--radius-sm, 6px)', background: activeTab === t.id ? 'var(--primary-light)' : 'var(--bg-surface-secondary)', color: activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', paddingBottom: '12px' }}>
          <button
            onClick={() => setIsAnnounceModalOpen(true)}
            style={{ padding: '8px 14px', background: 'var(--info)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Megaphone size={16} />
            <span>Sistem Duyurusu Yayınla</span>
          </button>
          <button
            onClick={() => setIsCreditPkgModalOpen(true)}
            style={{ padding: '8px 14px', background: 'var(--success)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>Yeni Kontör Paketi</span>
          </button>
        </div>
      </div>

      {/* İçerik */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Yükleniyor...</div>
        ) : (
          <>
            {/* 1. ÖZET PANEL */}
            {activeTab === 'pos' && <GarantiPosPreparation />}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Aylık Düzenli Gelir (MRR)</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--success)' }}>{metrics ? Number(metrics.mrr ?? 0).toLocaleString('tr-TR') + ' ₺' : 'Alınamadı'}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Kayıtlı Firmalar</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--info)' }}>{metrics ? metrics.totalTenants : 'Alınamadı'}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Aktif Bayi Ağı</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--warning)' }}>{metrics ? metrics.activeDealersCount : 'Alınamadı'}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>e-Belge Kaydı</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700 }}>{metrics ? metrics.totalEDocuments : 'Alınamadı'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. SAAS PAKETLERİ */}
            {activeTab === 'plans' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                {plans.map(p => (
                  <div key={p.id} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--info)' }}>{p.name}</h3>
                      <button onClick={() => setEditingPlan(p)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Edit size={16} /></button>
                    </div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)' }}>{p.monthlyPrice.toLocaleString('tr-TR')} ₺ <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>/ ay</span></div>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Maksimum {p.maxUsers} Kullanıcı, {p.maxInvoicesPerMonth} Fatura/Ay</div>
                  </div>
                ))}
              </div>
            )}

            {/* 4. KONTÖR PAKETLERİ */}
            {activeTab === 'creditPackages' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                {creditPackages.map(pkg => (
                  <div key={pkg.id} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--success)' }}>{pkg.quantity} Kontör</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: '8px 0' }}>{pkg.price.toLocaleString('tr-TR')} ₺</div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{pkg.name}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 5. BAYİ AĞI VE KOMİSYONLAR */}
            {activeTab === 'dealers' && (
              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: 'var(--fs-lg, 16px)' }}>Sistem Bayileri ({dealers.length})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-secondary)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)' }}>
                      <th style={{ padding: '12px 16px' }}>Bayi Adı</th>
                      <th style={{ padding: '12px 16px' }}>Yetkili</th>
                      <th style={{ padding: '12px 16px' }}>Komisyon</th>
                      <th style={{ padding: '12px 16px' }}>Cüzdan Bakiyesi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealers.map(d => (
                      <tr key={d.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{d.name}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{d.contactPerson || d.email}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--warning)' }}>%{d.commissionRate}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--success)' }}>{((d as any).walletBalance || (d as any).currentBalance || 0).toLocaleString('tr-TR')} ₺</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Duyuru Modalı */}
      {isAnnounceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', width: '480px', borderRadius: 'var(--radius-lg, 10px)', padding: '24px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Platform Duyurusu Yayınla</h3>
              <button onClick={() => setIsAnnounceModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Duyuru Başlığı" value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })} required style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <textarea placeholder="Duyuru İçeriği..." value={announcementForm.content} onChange={e => setAnnouncementForm({ ...announcementForm, content: e.target.value })} required rows={4} style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <button type="submit" style={{ padding: '10px', background: 'var(--info)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--fs-sm, 12px)' }}>Duyuruyu Yayınla</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
