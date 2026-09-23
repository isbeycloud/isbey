import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Users,
  DollarSign,
  TrendingUp,
  Plus,
  Building,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck,
  UserPlus,
  Award,
  CreditCard,
  Network,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { Dealer, DealerCommission, PartnerNode, CommissionPayoutTx } from '../../../types';

export const DealerPortalView: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'customers' | 'network' | 'commissions'>('dashboard');

  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [partners, setPartners] = useState<PartnerNode[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [subDealers, setSubDealers] = useState<Dealer[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [recentCommissions, setRecentCommissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Customer Modal
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    companyName: '',
    title: '',
    taxNumber: '',
    taxOffice: '',
    city: 'İstanbul',
    phone: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
    planSlug: 'PRO',
  });

  // New Partner / Sub-Dealer Modal
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState({
    parentPartnerId: '',
    role: 'DEALER' as 'DEALER' | 'SUB_DEALER',
    code: '',
    name: '',
    contactName: '',
    email: '',
    phone: '',
    city: 'İstanbul',
    taxNumber: '',
    defaultCommissionRate: 20,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dashRes, custRes, subRes, comRes, pRes]: any[] = await Promise.all([
        api.getSaasDealerDashboard().catch(() => ({ success: false })),
        api.getSaasDealerCustomers().catch(() => ({ success: false })),
        api.getSaasDealerSubDealers().catch(() => ({ success: false })),
        api.getDealerCommissions().catch(() => ({ success: false })),
        api.getDealerPartners().catch(() => ({ success: false })),
      ]);

      if (dashRes && dashRes.success) {
        setDealer(dashRes.dealer);
        setMetrics(dashRes.metrics);
        setRecentCommissions(dashRes.recentCommissions || []);
      }
      if (custRes && custRes.success) setCustomers(custRes.customers || []);
      if (subRes && subRes.success) setSubDealers(subRes.subDealers || []);
      if (comRes && comRes.success) setCommissions(comRes.commissions || []);
      if (pRes && pRes.success) setPartners(pRes.partners || []);
    } catch (err: any) {
      showToast(err.message || 'Bayi verileri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createSaasDealerCustomer(newCustomer);
      if (res.success) {
        showToast(res.message || 'Müşteri başarıyla kaydedildi.', 'success');
        setIsCustomerModalOpen(false);
        setNewCustomer({
          companyName: '',
          title: '',
          taxNumber: '',
          taxOffice: '',
          city: 'İstanbul',
          phone: '',
          adminFullName: '',
          adminEmail: '',
          adminPassword: '',
          planSlug: 'PRO',
        });
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Müşteri kaydedilemedi.', 'error');
    }
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createDealerPartner(partnerForm);
      if (res.success) {
        showToast('Yeni bayi/alt bayi başarıyla kaydedildi.', 'success');
        setIsPartnerModalOpen(false);
        setPartnerForm({
          parentPartnerId: '',
          role: 'DEALER',
          code: '',
          name: '',
          contactName: '',
          email: '',
          phone: '',
          city: 'İstanbul',
          taxNumber: '',
          defaultCommissionRate: 20,
        });
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Bayi oluşturulamadı.', 'error');
    }
  };

  const handleApproveCommission = async (id: string) => {
    try {
      const res = await api.approveDealerCommission(id);
      if (res.success) {
        showToast(res.message || 'Komisyon onaylandı.', 'success');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Komisyon onaylanamadı.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)' }}>
      {/* Üst Başlık & Sekmeler */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', padding: '16px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={20} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--fs-xl, 20px)', fontWeight: 700 }}>Bayi & Partner Masası</h1>
              <p style={{ margin: 0, fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                Müşteri Portföyü, Alt Bayi Ağı ve Komisyon Hakedişleri
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            {[
              { id: 'dashboard', label: 'Özet Panel', icon: TrendingUp },
              { id: 'customers', label: 'Müşteri Portföyü', icon: Building, badge: String(customers.length) },
              { id: 'network', label: 'Bayi & Alt Bayi Ağı', icon: Network, badge: String(partners.length || subDealers.length) },
              { id: 'commissions', label: 'Komisyon Hakedişleri', icon: DollarSign, badge: String(commissions.length) },
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
            onClick={() => setIsCustomerModalOpen(true)}
            style={{ padding: '8px 14px', background: 'var(--info)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <UserPlus size={16} />
            <span>Yeni Müşteri Kaydı</span>
          </button>
          <button
            onClick={() => setIsPartnerModalOpen(true)}
            style={{ padding: '8px 14px', background: 'var(--primary)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>Yeni Alt Bayi Ekle</span>
          </button>
        </div>
      </div>

      {/* İçerik Alanı */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Veriler yükleniyor...</div>
        ) : (
          <>
            {/* 1. DASHBOARD SEKMESİ */}
            {activeTab === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Bayi Cüzdan Bakiyesi</div>
                    {/* 2026-09-12 (uydurma temizliği): `|| 14250` fallback'i
                        kaldırıldı. Daha önemlisi: bu kart `metrics.walletBalance`
                        okuyordu ama `/v1/dealers/dashboard` bu alanı HİÇ
                        döndürmüyor (gerçek alan `currentBalance`) — yani kart
                        her zaman 14.250 ₺ gösteriyordu. Doğru alan adına bağlandı. */}
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--success)' }}>
                      {typeof metrics?.currentBalance === 'number'
                        ? `${metrics.currentBalance.toLocaleString('tr-TR')} ₺`
                        : '—'}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Toplam Komisyon Kazancı</div>
                    {/* Aynı hata: `metrics.totalEarnings` diye bir alan yok.
                        Gerçek alan `totalCommissionEarned`. Sabit 48.500 ₺
                        gösteriliyordu. */}
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--info)' }}>
                      {typeof metrics?.totalCommissionEarned === 'number'
                        ? `${metrics.totalCommissionEarned.toLocaleString('tr-TR')} ₺`
                        : '—'}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Kayıtlı Müşteri Şirketler</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--primary)' }}>{customers.length} Firma</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '6px' }}>Alt Bayi Ağı</div>
                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--warning)' }}>{partners.length || subDealers.length} Alt Bayi</div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. MÜŞTERİ PORTFÖYÜ SEKMESİ */}
            {activeTab === 'customers' && (
              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: 'var(--fs-lg, 16px)' }}>Kayıtlı Müşteriler ({customers.length})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-secondary)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)' }}>
                      <th style={{ padding: '12px 16px' }}>Firma Ünvanı</th>
                      <th style={{ padding: '12px 16px' }}>Vergi No / Şehir</th>
                      <th style={{ padding: '12px 16px' }}>Paket Planı</th>
                      <th style={{ padding: '12px 16px' }}>Durum</th>
                      <th style={{ padding: '12px 16px' }}>Aylık Lisans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c: any) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{c.companyName || c.title}</td>
                        {/* 2026-09-12: `c.city || 'İstanbul'` sabit şehir fallback'i
                            kaldırıldı — adres girilmemiş kayda uydurma şehir yazıyordu. */}
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{c.taxNumber || '—'} / {c.city || '—'}</td>
                        <td style={{ padding: '12px 16px' }}><span className="badge badge-info">{c.planSlug || '—'}</span></td>
                        {/* 2026-09-12: Durum sabit "Aktif" yazılıyordu — pasif/askıdaki
                            bir firma da aktif görünüyordu. Gerçek alan yoksa "—". */}
                        <td style={{ padding: '12px 16px' }}>
                          {c.status === 'ACTIVE' || c.status === 'AKTIF'
                            ? <span className="badge badge-success">Aktif</span>
                            : c.status
                              ? <span className="badge badge-warning">{c.status}</span>
                              : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          {typeof c.monthlyPrice === 'number' ? `${c.monthlyPrice.toLocaleString('tr-TR')} ₺` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. BAYİ & ALT BAYİ AĞI SEKMESİ */}
            {activeTab === 'network' && (
              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: 'var(--fs-lg, 16px)' }}>Bayi Ağı & Alt Bayiler ({partners.length || subDealers.length})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-secondary)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)' }}>
                      <th style={{ padding: '12px 16px' }}>Bayi Adı / Kod</th>
                      <th style={{ padding: '12px 16px' }}>Rol</th>
                      <th style={{ padding: '12px 16px' }}>Yetkili & İletişim</th>
                      <th style={{ padding: '12px 16px' }}>Komisyon Oranı</th>
                      <th style={{ padding: '12px 16px' }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(partners.length ? partners : subDealers).map((p: any) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{p.name} <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>({p.code || 'DEALER'})</span></td>
                        <td style={{ padding: '12px 16px' }}><span className={p.role === 'DEALER' ? 'badge badge-warning' : 'badge badge-primary'}>{p.role || 'ALT BAYİ'}</span></td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{p.contactName || p.contactPerson || 'Yetkili'} ({p.email})</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--success)' }}>%{p.defaultCommissionRate || p.commissionRate || 20}</td>
                        <td style={{ padding: '12px 16px' }}><span className="badge badge-success">Aktif</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 4. KOMİSYON HAKEDİŞLERİ SEKMESİ */}
            {activeTab === 'commissions' && (
              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: 'var(--fs-lg, 16px)' }}>Komisyon Hakediş Kayıtları ({commissions.length})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-secondary)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)' }}>
                      <th style={{ padding: '12px 16px' }}>Tarih / İşlem ID</th>
                      <th style={{ padding: '12px 16px' }}>Müşteri / Kaynak</th>
                      <th style={{ padding: '12px 16px' }}>İşlem Tutarı</th>
                      <th style={{ padding: '12px 16px' }}>Komisyon</th>
                      <th style={{ padding: '12px 16px' }}>Durum / Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((c: any) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('tr-TR') : '—'}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{c.customerTitle || c.description || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {typeof c.amount === 'number' ? `${c.amount.toLocaleString('tr-TR')} ₺` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--success)' }}>
                          {typeof c.commissionAmount === 'number' ? `${c.commissionAmount.toLocaleString('tr-TR')} ₺` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {c.status === 'APPROVED' ? (
                            <span className="badge badge-success">Ödendi</span>
                          ) : (
                            <button
                              onClick={() => handleApproveCommission(c.id)}
                              style={{ padding: '4px 10px', background: 'var(--success)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Onayla
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Yeni Müşteri Modalı */}
      {isCustomerModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', width: '480px', borderRadius: 'var(--radius-lg, 10px)', padding: '24px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Müşteri Şirket Kaydı</h3>
              <button onClick={() => setIsCustomerModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Firma Ünvanı" value={newCustomer.companyName} onChange={e => setNewCustomer({ ...newCustomer, companyName: e.target.value })} required style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <input type="text" placeholder="Vergi No / TCKN" value={newCustomer.taxNumber} onChange={e => setNewCustomer({ ...newCustomer, taxNumber: e.target.value })} required style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <input type="email" placeholder="Yönetici E-posta" value={newCustomer.adminEmail} onChange={e => setNewCustomer({ ...newCustomer, adminEmail: e.target.value })} required style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <select value={newCustomer.planSlug} onChange={e => setNewCustomer({ ...newCustomer, planSlug: e.target.value })} style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }}>
                <option value="STARTER">Starter Plan (490 ₺/ay)</option>
                <option value="PRO">Pro Plan (1.490 ₺/ay)</option>
                <option value="KURUMSAL">Kurumsal Plan (2.990 ₺/ay)</option>
              </select>
              <button type="submit" style={{ padding: '10px', background: 'var(--info)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }}>Müşteriyi Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {/* Yeni Partner Modalı */}
      {isPartnerModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', width: '480px', borderRadius: 'var(--radius-lg, 10px)', padding: '24px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Alt Bayi / Partner Kaydı</h3>
              <button onClick={() => setIsPartnerModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreatePartner} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Bayi Adı" value={partnerForm.name} onChange={e => setPartnerForm({ ...partnerForm, name: e.target.value })} required style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <input type="text" placeholder="Yetkili Kişi" value={partnerForm.contactName} onChange={e => setPartnerForm({ ...partnerForm, contactName: e.target.value })} required style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <input type="email" placeholder="E-posta" value={partnerForm.email} onChange={e => setPartnerForm({ ...partnerForm, email: e.target.value })} required style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <input type="number" placeholder="Komisyon Oranı (%)" value={partnerForm.defaultCommissionRate} onChange={e => setPartnerForm({ ...partnerForm, defaultCommissionRate: Number(e.target.value) })} required style={{ padding: '10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }} />
              <button type="submit" style={{ padding: '10px', background: 'var(--primary)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }}>Bayiyi Kaydet</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
