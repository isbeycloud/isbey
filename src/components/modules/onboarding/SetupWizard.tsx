import React, { useState } from 'react';
import {
  Building2,
  Zap,
  Wallet,
  Palette,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Upload,
  Layers,
  FileText,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';

interface SetupWizardProps {
  onComplete: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const { activeTenant, user } = useAuth();
  const { addToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [companyTitle, setCompanyTitle] = useState(activeTenant?.title || activeTenant?.name || '');
  const [taxNumber, setTaxNumber] = useState(activeTenant?.taxNumber || '');
  const [taxOffice, setTaxOffice] = useState(activeTenant?.taxOffice || '');
  const [phone, setPhone] = useState(activeTenant?.phone || '');
  const [email, setEmail] = useState(activeTenant?.email || user?.email || '');
  const [city, setCity] = useState(activeTenant?.city || 'İstanbul');

  // e-Dönüşüm
  const [isEInvoiceUser, setIsEInvoiceUser] = useState(true);
  const [defaultProfile, setDefaultProfile] = useState('TICARIFATURA');

  // Kasa / Banka
  const [cashRegisterName, setCashRegisterName] = useState('Merkez TL Kasası');
  const [bankName, setBankName] = useState('Garanti BBVA');
  const [iban, setIban] = useState('TR00 0000 0000 0000 0000 0000 00');

  // Tasarım
  const [selectedTheme, setSelectedTheme] = useState<'MODERN' | 'CLASSIC' | 'CORPORATE' | 'PROFESSIONAL'>('MODERN');

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
      if (currentStep === 4) {
        triggerConfetti();
      }
    } else {
      addToast('Tebrikler! Kurulum sihirbazı tamamlandı, İŞBEY CLOUD kullanıma hazır.', 'success');
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        /* 2026-09-13: Sihirbaz tam ekran bir örtü katmanıdır; açık temada
           uygulamanın üstünü karartmak için örtü nötr koyu kalır. Cam
           efekti (backdrop-filter) projede tasarım sadeleştirmesinde
           kaldırılmıştı, burada da kullanılmaz. */
        background: 'rgba(10, 15, 30, 0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        color: 'var(--text-main)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg, 10px)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Üst İlerleme Çubuğu */}
        <div style={{ background: 'var(--bg-surface-secondary)', padding: '20px 28px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} color="var(--primary)" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 'var(--fs-lg, 16px)' }}>İŞBEY CLOUD Hızlı Kurulum Sihirbazı</span>
            </div>
            <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--info)', fontWeight: 600 }}>Adım {currentStep} / 5</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {[1, 2, 3, 4, 5].map(step => (
              <div
                key={step}
                style={{
                  flex: 1,
                  height: '6px',
                  borderRadius: 'var(--radius-xs, 4px)',
                  background: step <= currentStep ? 'var(--primary)' : 'var(--border-color)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Gövde */}
        <div style={{ padding: '32px 36px', minHeight: '340px' }}>
          {/* ADIM 1: Firma & Vergi Bilgileri */}
          {currentStep === 1 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Building2 size={22} color="var(--primary)" />
                <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, margin: 0 }}>Firma & Vergi Bilgilerini Doğrulayın</h2>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', marginBottom: '22px' }}>
                Faturalarınızda ve resmi e-belgelerinizde yer alacak temel kurumsal bilgileri kontrol ediniz.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Firma Resmi Ünvanı</label>
                  <input
                    type="text"
                    value={companyTitle}
                    onChange={e => setCompanyTitle(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Vergi No (VKN / TCKN)</label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={e => setTaxNumber(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Vergi Dairesi</label>
                  <input
                    type="text"
                    value={taxOffice}
                    onChange={e => setTaxOffice(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Telefon</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Şehir</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ADIM 2: e-Dönüşüm Ayarları */}
          {currentStep === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Zap size={22} color="var(--warning)" />
                <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, margin: 0 }}>GİB e-Dönüşüm Tercihleri</h2>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', marginBottom: '22px' }}>
                e-Fatura ve e-Arşiv modülünüzün varsayılan davranışlarını belirleyin.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-base, 13px)' }}>e-Fatura Mükellefiyet Kontrolü</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>Cari VKN girildiğinde GİB sisteminden otomatik sorgulansın.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEInvoiceUser}
                    onChange={e => setIsEInvoiceUser(e.target.checked)}
                    style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>Varsayılan Fatura Senaryosu</label>
                  <select
                    value={defaultProfile}
                    onChange={e => setDefaultProfile(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                  >
                    <option value="TICARIFATURA">Ticari Fatura (Onay/Red Mekanizmalı)</option>
                    <option value="TEMELFATURA">Temel Fatura (Doğrudan Kabul)</option>
                    <option value="EARSIVFATURA">e-Arşiv Fatura</option>
                  </select>
                </div>

                <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', padding: '12px 16px', borderRadius: 'var(--radius-md, 8px)', color: 'var(--success-text)', fontSize: 'var(--fs-base, 13px)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} />
                  <span>100 Adet Hediye e-Belge Kontörünüz hesabınıza yüklendi.</span>
                </div>
              </div>
            </div>
          )}

          {/* ADIM 3: Kasa & Banka */}
          {currentStep === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Wallet size={22} color="var(--success)" />
                <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, margin: 0 }}>Kasa & Banka Hesapları</h2>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', marginBottom: '22px' }}>
                Tahsilat ve ödemelerinizi işleyeceğiniz ilk kasa ve banka hesabınızı tanımlayın.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Varsayılan Nakit Kasası Adı</label>
                  <input
                    type="text"
                    value={cashRegisterName}
                    onChange={e => setCashRegisterName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Banka Adı</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>IBAN Numarası</label>
                    <input
                      type="text"
                      value={iban}
                      onChange={e => setIban(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ADIM 4: Fatura Tasarımı */}
          {currentStep === 4 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Palette size={22} color="var(--primary)" />
                <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, margin: 0 }}>Fatura Tasarım Temanızı Seçin</h2>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', marginBottom: '22px' }}>
                Müşterilerinize göndereceğiniz e-fatura ve PDF çıktılarında kullanılacak XSLT şablonu.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { id: 'MODERN', name: 'Standart Modern', desc: 'Mavi vurgulu, şık ve ferah kurumsal düzen', color: '#0284c7' },
                  { id: 'CLASSIC', name: 'Klasik Resmi', desc: 'Geleneksel matbu fatura formatı, net çizgiler', color: '#475569' },
                  { id: 'CORPORATE', name: 'Kurumsal Premium', desc: 'Koyu başlık bantlı, prestijli iş dünyası tasarımı', color: '#16a34a' },
                  { id: 'PROFESSIONAL', name: 'Kompakt Profesyonel', desc: 'Çok satırlı faturalar için optimize edilmiş yerleşim', color: '#7c3aed' },
                ].map(theme => (
                  <div
                    key={theme.id}
                    onClick={() => setSelectedTheme(theme.id as any)}
                    style={{
                      background: selectedTheme === theme.id ? 'var(--primary-light)' : 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md, 8px)',
                      padding: '16px',
                      border: selectedTheme === theme.id ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)' }}>{theme.name}</span>
                      {/* 2026-09-13: Renk noktası veri değeri — ilgili fatura
                          şablonunun gerçek paletini gösterir, token'a çevrilmez. */}
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: theme.color }} />
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', margin: 0 }}>{theme.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ADIM 5: Tebrikler / Tamamlandı */}
          {currentStep === 5 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}
              >
                <CheckCircle2 size={36} color="#fff" />
              </div>
              <h2 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, marginBottom: '8px' }}>Kurulum Başarıyla Tamamlandı</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.5 }}>
                {companyTitle || 'Firmanız'} için İŞBEY CLOUD ön muhasebe ve e-Dönüşüm ortamı hazırlandı. Hemen ilk faturanızı kesmeye başlayabilirsiniz.
              </p>

              <div style={{ background: 'var(--bg-surface-secondary)', padding: '16px 20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', display: 'inline-flex', gap: '24px', textAlign: 'left' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>Firma Kodu</div>
                  <div style={{ fontWeight: 700, color: 'var(--info)' }}>{activeTenant?.companyCode || 'ISB-000001'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>E-Belge Kontörü</div>
                  <div style={{ fontWeight: 700, color: 'var(--success)' }}>100 Adet Aktif</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>Paket</div>
                  <div style={{ fontWeight: 700, color: 'var(--warning)' }}>14 Gün Deneme</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Alt Butonlar */}
        <div style={{ background: 'var(--bg-surface-secondary)', padding: '16px 28px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {currentStep > 1 && currentStep < 5 ? (
            <button
              type="button"
              onClick={handleBack}
              style={{
                background: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                padding: '9px 18px',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--fs-base, 13px)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ArrowLeft size={16} />
              Geri
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={handleNext}
            style={{
              background: currentStep === 5 ? 'var(--success)' : 'var(--primary)',
              border: 'none',
              color: '#fff',
              padding: '10px 24px',
              borderRadius: 'var(--radius-md, 8px)',
              fontSize: 'var(--fs-base, 13px)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {currentStep === 5 ? 'İŞBEY CLOUD’a Başla' : 'Devam Et'}
            {currentStep < 5 && <ArrowRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};
