import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Crown,
  Sparkles,
  Zap,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Coins,
  ShieldCheck,
  Gift,
  ArrowRight,
  RefreshCw,
  Clock,
  Building,
  Users,
  Database,
  FileText,
  Receipt,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import type { SubscriptionPlan } from '../../../types';
import type { PackageCheckoutPreview } from '../../../types/packageCheckout';

export const CustomerBillingPortalView: React.FC = () => {
  const { showToast } = useToast();
  const { user, activeTenant } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'credits' | 'history'>('overview');

  const [billingData, setBillingData] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [usages, setUsages] = useState<any[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ amount: number; message: string } | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [isLoading, setIsLoading] = useState(true);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [checkoutPreview, setCheckoutPreview] = useState<PackageCheckoutPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // Buy Credits Modal
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditQuantity, setCreditQuantity] = useState(500);

  // Cancel Modal
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('too_expensive');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [bRes, subRes, payRes, planRes]: any[] = await Promise.all([
        api.getBillingPortalSummary().catch(() => ({ success: false })),
        api.getCurrentSubscription().catch(() => ({ success: false })),
        api.getPaymentHistory().catch(() => ({ success: false })),
        api.getSubscriptionPlans().catch(() => ({ success: false })),
      ]);

      if (bRes && bRes.success) setBillingData(bRes.data);
      if (planRes?.success) setPlans((planRes.plans || []).filter((p: SubscriptionPlan) => p.status === 'ACTIVE'));
      if (subRes && subRes.success) {
        setSubscription(subRes.subscription);
        setUsages(subRes.usage || []);
      }
      if (payRes && payRes.success) {
        setPayments(payRes.payments || []);
        setInvoices(payRes.invoices || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Faturalandırma verileri alınamadı.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode) return;
    try {
      const res = await api.validatePromoCoupon(couponCode, 1000);
      if (res.valid) {
        setAppliedDiscount({ amount: res.discountAmount, message: res.message || 'Kupon uygulandı!' });
        showToast(res.message || 'Kupon uygulandı!', 'success');
      } else {
        showToast(res.message || 'Geçersiz kupon.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Kupon doğrulanamadı.', 'error');
    }
  };

  const handleUpgradePlan = async (planId: string) => {
    setPreviewBusy(true);
    try {
      const res = await api.previewPackageCheckout({
        planId,
        billingCycle: selectedCycle,
      });
      if (res.success) setCheckoutPreview(res.preview);
    } catch (err: any) {
      showToast(err.message || 'Paket önizlemesi alınamadı.', 'error');
    } finally { setPreviewBusy(false); }
  };

  const handleBuyCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = creditQuantity * 0.9;
    try {
      const res = await api.buyBillingCredits({
        quantity: creditQuantity,
        amount,
      });

      if (res.success) {
        showToast(`${creditQuantity} Adet Kontör cüzdanınıza yüklendi!`, 'success');
        setIsCreditModalOpen(false);
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Kontör satın alınamadı.', 'error');
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!subscription) return;
    const nextVal = !subscription.autoRenew;
    try {
      const res = await api.toggleAutoRenew(nextVal);
      if (res.success) {
        setSubscription({ ...subscription, autoRenew: nextVal });
        showToast(res.message || 'Otomatik yenileme güncellendi.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)' }}>
      {/* Üst Sekmeler */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', padding: '16px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={20} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--fs-xl, 20px)', fontWeight: 700 }}>Abonelik, Paketler & Kontör</h1>
              <p style={{ margin: 0, fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                SaaS Paket Lisansı, e-Belge Kontör Cüzdanı ve Ödeme Geçmişi
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            {[
              { id: 'overview', label: 'Abonelik Durumu', icon: ShieldCheck },
              { id: 'plans', label: 'Paket Değiştir / Yükselt', icon: Crown },
              { id: 'credits', label: 'Kontör Cüzdanı', icon: Coins, badge: `${billingData?.credits?.balance || 500} Adet` },
              { id: 'history', label: 'Ödeme Geçmişi & Faturalar', icon: Receipt },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
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
            onClick={() => setIsCreditModalOpen(true)}
            style={{ padding: '8px 14px', background: 'var(--success)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Coins size={16} />
            <span>Kontör Satın Al</span>
          </button>
        </div>
      </div>

      {/* İçerik */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Yükleniyor...</div>
        ) : (
          <>
            {/* 1. ABONELİK ÖZETİ */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Aktif Lisans Paketi</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--info)' }}>{billingData?.subscription?.planName || 'Kurumsal Plan'}</div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--success)', marginTop: '4px' }}>Aktif & Düzenli Lisans</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Kalan Gün Sayısı</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--warning)' }}>{billingData?.subscription?.daysRemaining || 284} Gün</div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '4px' }}>Bitiş: {billingData?.subscription?.currentPeriodEnd ? new Date(billingData.subscription.currentPeriodEnd).toLocaleDateString('tr-TR') : '14.07.2027'}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>e-Belge Kontör Bakiyesi</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--success)' }}>{billingData?.credits?.balance || 500} Adet</div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '4px' }}>Kalan e-Fatura / e-Arşiv</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Otomatik Yenileme</div>
                    <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: subscription?.autoRenew !== false ? 'var(--success)' : 'var(--danger)' }}>
                      {subscription?.autoRenew !== false ? 'Açık' : 'Kapalı'}
                    </div>
                    <button onClick={handleToggleAutoRenew} style={{ background: 'transparent', border: 'none', color: 'var(--info)', fontSize: 'var(--fs-xs, 11px)', cursor: 'pointer', padding: 0, marginTop: '4px', textDecoration: 'underline' }}>
                      {subscription?.autoRenew !== false ? 'Kapat' : 'Aç'}
                    </button>
                  </div>
                </div>

                {/* Kaynak Kullanım Göstergeleri */}
                <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Paket Kaynak Kullanım Durumu</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm, 12px)', marginBottom: '4px' }}>
                        <span>Kullanıcı Sayısı</span>
                        <span style={{ fontWeight: 700 }}>3 / 10 Kullanıcı</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', overflow: 'hidden' }}>
                        <div style={{ width: '30%', height: '100%', background: 'var(--info)' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm, 12px)', marginBottom: '4px' }}>
                        <span>Aylık Fatura Limiti</span>
                        <span style={{ fontWeight: 700 }}>143 / Sınırsız</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', overflow: 'hidden' }}>
                        <div style={{ width: '15%', height: '100%', background: 'var(--success)' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. PAKETLER VE YÜKSELTME */}
            {activeTab === 'plans' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <p role="status" style={{ margin: 0 }}>Garanti BBVA online ödeme hazırlığı sürüyor. Tarife önizlemesi paketinizde değişiklik yapmaz.</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                  <button onClick={() => setSelectedCycle('monthly')} style={{ padding: '8px 16px', background: selectedCycle === 'monthly' ? 'var(--primary)' : 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: selectedCycle === 'monthly' ? '#ffffff' : 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>Aylık Faturalama</button>
                  <button onClick={() => setSelectedCycle('yearly')} style={{ padding: '8px 16px', background: selectedCycle === 'yearly' ? 'var(--primary)' : 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: selectedCycle === 'yearly' ? '#ffffff' : 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>Yıllık Tarife</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                  {plans.map(plan => ({ ...plan, price: selectedCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice, popular: plan.isPopular })).map(p => (
                    <div key={p.slug} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: p.popular ? '2px solid var(--primary)' : '1px solid var(--border-color)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontWeight: 700 }}>{p.name}</h3>
                        {p.popular && <span className="badge badge-primary">En Popüler</span>}
                      </div>
                      <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700 }}>{p.price.toLocaleString('tr-TR')} {p.currency} <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>{selectedCycle === 'yearly' ? 'yıllık tarife' : 'aylık tarife'}</span></div>
                      <ul style={{ paddingLeft: '20px', margin: 0, fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(p.features || []).map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                      <button disabled={previewBusy || p.currency !== 'TRY' || p.price <= 0} onClick={() => handleUpgradePlan(p.id)} style={{ width: '100%', padding: '10px', background: p.popular ? 'var(--primary)' : 'var(--bg-surface-secondary)', color: p.popular ? '#ffffff' : 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, cursor: 'pointer', marginTop: 'auto' }}>
                        Paket Önizlemesi
                      </button>
                    </div>
                  ))}
                </div>
                {!plans.length && <p>Satışa açık paket bulunamadı. Tarifeler için yöneticinizle iletişime geçin.</p>}
              </div>
            )}

            {/* 3. KONTÖR CÜZDANI */}
            {activeTab === 'credits' && (
              <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontWeight: 700 }}>e-Belge Kontör Paketleri</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>e-Fatura, e-Arşiv ve e-İrsaliye gönderimlerinizde kullanabileceğiniz kontör paketleri.</p>
                    <p role="status">Online kontör tahsilatı banka testleri tamamlanana kadar kapalıdır.</p>
                  </div>
                  <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--success)' }}>Mevcut: {billingData?.credits?.balance || 500} Kontör</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  {[
                    { qty: 100, price: 120 },
                    { qty: 500, price: 450, popular: true },
                    { qty: 1000, price: 800 },
                    { qty: 5000, price: 3500 },
                  ].map(pkg => (
                    <div key={pkg.qty} style={{ background: 'var(--bg-surface-secondary)', padding: '18px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--info)' }}>{pkg.qty} Kontör</div>
                      <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: '8px 0' }}>{pkg.price.toLocaleString('tr-TR')} ₺</div>
                      <button disabled title="Banka testleri tamamlanınca açılacak" style={{ padding: '6px 14px', background: 'var(--success)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}>Satın Al — Yakında</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. ÖDEME GEÇMİŞİ */}
            {activeTab === 'history' && (
              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>Ödeme Geçmişi ({payments.length})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 12px)' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-secondary)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '12px 16px' }}>Tarih</th>
                      <th style={{ padding: '12px 16px' }}>Açıklama</th>
                      <th style={{ padding: '12px 16px' }}>Tutar</th>
                      <th style={{ padding: '12px 16px' }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!payments.length && <tr><td colSpan={4} style={{ padding: 20 }}>Henüz ödeme kaydı bulunmuyor.</td></tr>}
                    {payments.map((p: any) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{p.paidAt || p.createdAt ? new Date(p.paidAt || p.createdAt).toLocaleDateString('tr-TR') : '—'}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{p.desc || p.description || 'SaaS Lisans Paketi'}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{(p.totalAmount ?? p.amount)?.toLocaleString('tr-TR') ?? '—'} {p.currency || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{p.paymentProvider === 'MOCK' ? 'Deneme kaydı' : ({ successful: 'Başarılı', SUCCESS: 'Başarılı', failed: 'Başarısız', pending: 'Bekliyor', refunded: 'İade edildi', cancelled: 'İptal' } as Record<string, string>)[p.status] || p.status || 'Bilinmiyor'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {checkoutPreview && <div className="modal-overlay" onClick={() => setCheckoutPreview(null)}>
        <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="package-checkout-title" style={{ width: 'min(520px, calc(100vw - 32px))' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 id="package-checkout-title">Paket Satın Alma Önizlemesi</h2><button type="button" aria-label="Önizlemeyi kapat" onClick={() => setCheckoutPreview(null)}><X size={20} /></button></div>
          <div className="modal-body" style={{ padding: 20 }}>
            <h3>{checkoutPreview.planName}</h3>
            <p>{checkoutPreview.billingCycle === 'yearly' ? 'Yıllık' : 'Aylık'} tarife: <strong>{checkoutPreview.catalogAmount.toLocaleString('tr-TR')} TRY</strong></p>
            <p>{checkoutPreview.message}</p>
            <p role="status">Garanti BBVA banka testleri bekleniyor. Kart bilgisi alınmıyor.</p>
            <button type="button" className="btn btn-primary" disabled>Garanti BBVA ile Öde — Yakında</button>
          </div>
        </div>
      </div>}
      {/* Kontör Satın Alma Modalı */}
      {isCreditModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', width: '420px', borderRadius: 'var(--radius-lg, 10px)', padding: '24px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: 700 }}>e-Belge Kontör Satın Al</h3>
            <form onSubmit={handleBuyCredits} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Kontör Miktarı:</label>
              <select value={creditQuantity} onChange={e => setCreditQuantity(Number(e.target.value))} style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)' }}>
                <option value={100}>100 Kontör (120 ₺)</option>
                <option value={500}>500 Kontör (450 ₺)</option>
                <option value={1000}>1.000 Kontör (800 ₺)</option>
                <option value={5000}>5.000 Kontör (3.500 ₺)</option>
              </select>
              <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--success)', marginTop: '8px' }}>
                Ödenecek Tutar: {(creditQuantity * 0.9).toLocaleString('tr-TR')} ₺
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" onClick={() => setIsCreditModalOpen(false)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer' }}>İptal</button>
                <button type="submit" disabled title="Banka testleri tamamlanınca açılacak" style={{ padding: '8px 14px', background: 'var(--success)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700 }}>Online ödeme henüz açık değil</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
