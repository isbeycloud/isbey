import React, { useState } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import {
  Building,
  User,
  Shield,
  Upload,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  Zap,
  DollarSign,
  Lock,
  Globe,
  Mail,
  Phone,
  MapPin,
  FileText,
  Clock,
  Trash2,
} from 'lucide-react';
import type { TenantPlan } from '../../../types';

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewCompanyModal: React.FC<NewCompanyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [activeStep, setActiveStep] = useState<'INFO' | 'AUTHORIZED' | 'LICENSE' | 'SETUP'>('INFO');
  const [loading, setLoading] = useState(false);

  // Form State
  const [form, setForm] = useState({
    // Firma Bilgileri
    companyCode: '',
    name: '',
    title: '',
    taxOffice: 'Kadıköy',
    taxNumber: '',
    identityNumber: '',
    mersisNo: '',
    phone: '',
    gsm: '',
    email: '',
    website: '',
    address: '',
    city: 'İstanbul',
    district: 'Kadıköy',
    postalCode: '',
    logoUrl: '',

    // Yetkili Bilgileri
    authorizedPerson: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
    },

    // Sistem & Lisans Bilgileri
    plan: 'PRO' as TenantPlan,
    isTrial: false,
    trialDays: 14,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    maxUsers: 10,
    maxBranches: 3,
    maxWarehouses: 3,
    maxInvoicesPerMonth: 5000,

    // Otomatik Kurulum
    createAdminUser: true,
    adminUsername: '',
    adminPassword: '123',
    createDefaultCash: true,
    createDefaultBank: true,
    createDefaultWarehouse: true,
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/(png|jpe?g|webp|svg\+xml)/)) {
      showToast('Lütfen geçerli bir logo formatı seçiniz (PNG, JPG, WEBP, SVG).', 'warning');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo dosya boyutu 2 MB\'den küçük olmalıdır.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm(prev => ({ ...prev, logoUrl: reader.result as string }));
      showToast('Firma logosu yüklendi.', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handlePlanChange = (plan: TenantPlan) => {
    let users = 5, branches = 2, warehouses = 2, invoices = 2500;
    if (plan === 'STARTER') {
      users = 2; branches = 1; warehouses = 1; invoices = 500;
    } else if (plan === 'PRO' || plan === 'PROFESSIONAL') {
      users = 10; branches = 3; warehouses = 3; invoices = 5000;
    } else if (plan === 'ENTERPRISE') {
      users = 50; branches = 15; warehouses = 15; invoices = 50000;
    }
    setForm(prev => ({
      ...prev,
      plan,
      maxUsers: users,
      maxBranches: branches,
      maxWarehouses: warehouses,
      maxInvoicesPerMonth: invoices,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.taxNumber.trim()) {
      showToast('Firma adı ve Vergi Numarası zorunludur.', 'warning');
      setActiveStep('INFO');
      return;
    }

    setLoading(true);
    try {
      const res = await api.createCompany(form);
      if (res.success) {
        showToast(res.message || 'Firma başarıyla oluşturuldu.', 'success');
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Firma kaydı başarısız.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🏢 Yeni Kurumsal Firma Kaydı & Otomatik Kurulum Sihirbazı"
      size="large"
    >
      {/* Adım Sekmeleri */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '6px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '10px',
        marginBottom: '16px',
      }}>
        {[
          { id: 'INFO', label: '1. Firma Bilgileri', icon: <Building size={14} /> },
          { id: 'AUTHORIZED', label: '2. Yetkili Bilgileri', icon: <User size={14} /> },
          { id: 'LICENSE', label: '3. Paket & Lisans', icon: <Shield size={14} /> },
          { id: 'SETUP', label: '4. Kurulum & Onay', icon: <CheckCircle2 size={14} /> },
        ].map(step => (
          <button
            key={step.id}
            type="button"
            className={`btn ${activeStep === step.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveStep(step.id as any)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11.5px' }}
          >
            {step.icon}
            <span>{step.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* ─── ADIM 1: FİRMA BİLGİLERİ ─── */}
        {activeStep === 'INFO' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Firma Kodu
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Otomatik (ISB-XXXXXX)"
                  value={form.companyCode}
                  onChange={e => setForm({ ...form, companyCode: e.target.value.toUpperCase() })}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Firma Adı (Kısa İsim) <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Örn: ABC Teknoloji"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Resmi Ticari Unvan
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Örn: ABC Teknoloji ve Bilişim Hizmetleri Ltd. Şti."
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Vergi Numarası (VKN) <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="10 Haneli VKN"
                  value={form.taxNumber}
                  onChange={e => setForm({ ...form, taxNumber: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  maxLength={11}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Vergi Dairesi
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Örn: Kadıköy"
                  value={form.taxOffice}
                  onChange={e => setForm({ ...form, taxOffice: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  T.C. Kimlik No (TCKN)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="11 Haneli TCKN"
                  value={form.identityNumber}
                  onChange={e => setForm({ ...form, identityNumber: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  maxLength={11}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  MERSİS Numarası
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="16 Haneli MERSİS"
                  value={form.mersisNo}
                  onChange={e => setForm({ ...form, mersisNo: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Sabit Telefon
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="+90 (216) 000 00 00"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  GSM / Mobil
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0532 000 00 00"
                  value={form.gsm}
                  onChange={e => setForm({ ...form, gsm: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Kurumsal E-posta
                </label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="info@firma.com.tr"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Web Sitesi
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://firma.com.tr"
                  value={form.website}
                  onChange={e => setForm({ ...form, website: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 100px', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Açık Adres
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Cadde, Sokak, No, Kat vb."
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  İl
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={form.city}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  İlçe
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={form.district}
                  onChange={e => setForm({ ...form, district: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Posta Kodu
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="34000"
                  value={form.postalCode}
                  onChange={e => setForm({ ...form, postalCode: e.target.value })}
                />
              </div>
            </div>

            {/* Logo Yükleme Alanı */}
            <div style={{
              background: 'var(--bg-surface-secondary)',
              border: '1.5px dashed var(--border-color)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain', background: '#fff', padding: '4px', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '6px', background: 'rgba(2,132,199,0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building size={24} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700 }}>Firma Logosu (PNG, JPG, WEBP, SVG)</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Fatura, teklif, irsaliye ve PDF çıktılarında otomatik kullanılır.</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {form.logoUrl && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, logoUrl: '' })}>
                    <Trash2 size={12} />
                    <span>Logoyu Kaldır</span>
                  </button>
                )}
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Upload size={12} />
                  <span>Logo Seç</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoUpload} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ─── ADIM 2: YETKİLİ BİLGİLERİ ─── */}
        {activeStep === 'AUTHORIZED' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              background: 'rgba(2,132,199,0.06)',
              border: '1px solid rgba(2,132,199,0.2)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '12px',
              lineHeight: 1.5,
            }}>
              Firma adına resmi muhatap olacak yönetici/yetkili bilgilerini giriniz. Bu kişi için otomatik yönetici hesabı oluşturulacaktır.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Yetkili Adı <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Örn: Ahmet"
                  value={form.authorizedPerson.firstName}
                  onChange={e => setForm({
                    ...form,
                    authorizedPerson: { ...form.authorizedPerson, firstName: e.target.value },
                  })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Yetkili Soyadı <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Örn: Yılmaz"
                  value={form.authorizedPerson.lastName}
                  onChange={e => setForm({
                    ...form,
                    authorizedPerson: { ...form.authorizedPerson, lastName: e.target.value },
                  })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Yetkili Telefon / GSM
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0532 100 20 30"
                  value={form.authorizedPerson.phone}
                  onChange={e => setForm({
                    ...form,
                    authorizedPerson: { ...form.authorizedPerson, phone: e.target.value },
                  })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Yetkili E-posta
                </label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="yetkili@firma.com"
                  value={form.authorizedPerson.email}
                  onChange={e => setForm({
                    ...form,
                    authorizedPerson: { ...form.authorizedPerson, email: e.target.value },
                  })}
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── ADIM 3: PAKET & LİSANS ─── */}
        {activeStep === 'LICENSE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700 }}>Abonelik Paketi Seçimi:</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[
                { code: 'STARTER' as TenantPlan, title: 'Başlangıç Paketi', price: '950 ₺ / ay', desc: 'Cari, Stok, Fatura, Kasa (2 Kullanıcı)' },
                { code: 'PRO' as TenantPlan, title: 'Profesyonel Paket', price: '2.450 ₺ / ay', desc: 'Finans, e-Fatura, Teklif, Sipariş (10 Kullanıcı)', popular: true },
                { code: 'ENTERPRISE' as TenantPlan, title: 'Kurumsal Paket', price: '6.900 ₺ / ay', desc: 'Tüm modüller, API, AI Asistanı (50 Kullanıcı)' },
              ].map(p => (
                <div
                  key={p.code}
                  onClick={() => handlePlanChange(p.code)}
                  style={{
                    border: form.plan === p.code ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    background: form.plan === p.code ? 'rgba(26,86,219,0.06)' : 'var(--bg-surface)',
                    borderRadius: '10px',
                    padding: '14px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.15s',
                  }}
                >
                  {p.popular && (
                    <span style={{ position: 'absolute', top: '-10px', right: '10px', background: 'var(--primary)', color: '#fff', fontSize: '9.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>
                      POPÜLER
                    </span>
                  )}
                  <div style={{ fontWeight: 800, fontSize: '13px', color: form.plan === p.code ? 'var(--primary)' : 'var(--text-main)' }}>
                    {p.title}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--success)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                    {p.price}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {p.desc}
                  </div>
                </div>
              ))}
            </div>

            {/* Deneme Hesabı Seçeneği */}
            <div style={{ background: 'var(--bg-surface-secondary)', padding: '12px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px' }}>
                  <input
                    type="checkbox"
                    checked={form.isTrial}
                    onChange={e => setForm({ ...form, isTrial: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>☑ Deneme Hesabı Olarak Aç (Trial Mode)</span>
                </label>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '24px' }}>
                  Belirtilen süre sonunda lisans otomatik olarak süresi dolmuş (EXPIRED) durumuna geçer.
                </div>
              </div>

              {form.isTrial && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600 }}>Süre:</span>
                  <select
                    className="form-input"
                    value={form.trialDays}
                    onChange={e => setForm({ ...form, trialDays: Number(e.target.value) })}
                    style={{ width: '110px' }}
                  >
                    <option value={7}>7 Gün</option>
                    <option value={14}>14 Gün</option>
                    <option value={30}>30 Gün</option>
                    <option value={60}>60 Gün</option>
                  </select>
                </div>
              )}
            </div>

            {/* Limitler & Tarihler */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>
                  Kullanıcı Limiti
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.maxUsers}
                  onChange={e => setForm({ ...form, maxUsers: Number(e.target.value) })}
                  min={1}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>
                  Şube Limiti
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.maxBranches}
                  onChange={e => setForm({ ...form, maxBranches: Number(e.target.value) })}
                  min={1}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>
                  Depo Limiti
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.maxWarehouses}
                  onChange={e => setForm({ ...form, maxWarehouses: Number(e.target.value) })}
                  min={1}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>
                  Aylık Fatura Limiti
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.maxInvoicesPerMonth}
                  onChange={e => setForm({ ...form, maxInvoicesPerMonth: Number(e.target.value) })}
                  step={500}
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── ADIM 4: OTOMATİK KURULUM & ONAY ─── */}
        {activeStep === 'SETUP' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz başarı token'ı.
              background: 'var(--success-bg)',
              border: '1.5px solid var(--success)',
              borderRadius: '10px',
              padding: '14px 16px',
            }}>
              <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} />
                <span>Tek Tıkla Tam Otomatik Kurulum Mimarisi</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', lineHeight: 1.5 }}>
                Firma kaydı yapıldığında tüm bileşenler atomik bir <strong>Database Transaction</strong> içinde oluşturulacaktır. Herhangi bir adımda hata oluşursa işlem geri alınır (Rollback) ve yarım veri kalmaz.
              </div>
            </div>

            {/* Otomatik Kurulacak Bileşenler Listesi */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { label: 'Varsayılan Şirket Ayarları & Belge Numaratörleri', desc: 'Fatura, irsaliye, teklif otomatik sayaçları', checked: true },
                { label: 'Varsayılan Merkez Depo (DEP-01)', desc: 'Ana stok ve sayım alanı', checked: form.createDefaultWarehouse },
                { label: 'Varsayılan Merkez Kasa (TL Kasası)', desc: 'Nakit giriş/çıkış kasası', checked: form.createDefaultCash },
                { label: 'Varsayılan Banka Hesabı (Ziraat Bankası)', desc: 'Ticari vadesiz TL hesabı', checked: form.createDefaultBank },
                { label: 'Pakete Uygun Varsayılan Hizmetler', desc: `${form.plan} paketindeki tüm hizmetler aktif edilir`, checked: true },
                { label: 'Yönetici Kullanıcı Hesabı', desc: 'İlk giriş yapacak admin kullanıcısı', checked: form.createAdminUser },
              ].map((item, i) => (
                <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-surface-secondary)', borderRadius: '6px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.label}</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Yönetici Giriş Bilgileri */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>İlk Yönetici Giriş Bilgileri:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kullanıcı Adı:</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Otomatik (örn: isb000001_admin)"
                    value={form.adminUsername}
                    onChange={e => setForm({ ...form, adminUsername: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Şifre:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.adminPassword}
                    onChange={e => setForm({ ...form, adminPassword: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Alt Butonlar ─── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
          <div>
            {activeStep !== 'INFO' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (activeStep === 'SETUP') setActiveStep('LICENSE');
                  else if (activeStep === 'LICENSE') setActiveStep('AUTHORIZED');
                  else if (activeStep === 'AUTHORIZED') setActiveStep('INFO');
                }}
              >
                ← Geri
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Vazgeç
            </button>
            {activeStep !== 'SETUP' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (activeStep === 'INFO') {
                    if (!form.name.trim() || !form.taxNumber.trim()) {
                      showToast('Firma adı ve Vergi Numarası zorunludur.', 'warning');
                      return;
                    }
                    setActiveStep('AUTHORIZED');
                  } else if (activeStep === 'AUTHORIZED') {
                    setActiveStep('LICENSE');
                  } else if (activeStep === 'LICENSE') {
                    setActiveStep('SETUP');
                  }
                }}
              >
                İleri →
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ background: 'var(--primary)', border: 'none', fontWeight: 800 }}
              >
                {loading ? 'Firma ve Sistem Kuruluyor...' : '✓ Firmayı ve Sistemi Başlat'}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
};
