import { BrandLogo } from '../components/common/BrandLogo';
import { ProductPreview } from '../components/common/ProductPreview';
import React, { useState } from 'react';
import { User, Mail, Phone, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface RegisterPageProps {
  onLoginClick: () => void;
  onLandingClick: () => void;
  onSuccessRegister: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onLoginClick, onLandingClick, onSuccessRegister }) => {
  // 2026-10-16 (kayıt akışı): firma bilgisi Hızlı Bilişim'den VKN ile ÇEKİLİR —
  // kullanıcı firma ünvanı/şifre YAZMAZ. Geçici şifre e-posta ile gider.
  // Eski manuel kayıt (`register`) korunur ama bu formda kullanılmaz.
  const { registerByVkn } = useAuth();
  const [vknTckn, setVknTckn] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ username: string; mailStatus: string; trialDays: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const vkn = vknTckn.replace(/\D/g, '');
    if (!vkn || !fullName.trim() || !email.trim()) {
      setErrorMessage('Lütfen zorunlu alanları (VKN/TCKN, Ad Soyad ve E-Posta) doldurunuz.');
      return;
    }

    if (!/^\d{10,11}$/.test(vkn)) {
      setErrorMessage('Geçerli bir VKN (10 hane) veya TCKN (11 hane) giriniz.');
      return;
    }

    if (!termsAccepted) {
      setErrorMessage('Lütfen kullanım şartları ve gizlilik politikasını onaylayınız.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await registerByVkn({
        vknTckn: vkn,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });

      if (res.success) {
        // Başarıda form KAPANIR, bilgi ekranı açılır: kullanıcı adı + mail durumu.
        // Şifre ASLA ekranda gösterilmez — e-posta ile gider.
        setSuccessInfo({ username: res.username || email.trim(), mailStatus: res.mailStatus || 'QUEUED', trialDays: res.trialDays || 14 });
        onSuccessRegister();
      } else {
        setErrorMessage(res.message || 'Kayıt sırasında bir hata oluştu.');
      }
    } catch (err: any) {
      // Sunucu hata kodu korunur (ApiError.code): VKN bulunamadı / Hızlı Bilişim
      // hatası / mükerrer kayıt ayrımı kullanıcıya AYNEN taşınır.
      setErrorMessage(err.message || 'Kayıt sırasında bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundImage: 'radial-gradient(ellipse at top right, #fce4e9, transparent 65%)',
        backgroundColor: 'var(--bg-surface-secondary)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px 16px',
        fontFamily: "'Poppins', 'Inter', -apple-system, sans-serif",
      }}
    >
      {/* Üst Geri Dön Butonu */}
      <div style={{ position: 'fixed', top: '20px', left: '24px', zIndex: 10 }}>
        <button
          onClick={onLandingClick}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
            padding: '8px 16px',
            borderRadius: 'var(--radius-pill, 9999px)',
            fontSize: 'var(--fs-base, 13px)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <ArrowLeft size={16} />
          <span>Ana Sayfaya Dön</span>
        </button>
      </div>

      {/* Ana Metronic Split Container */}
      <div className="brand-auth-card"
        style={{
          width: '100%',
          maxWidth: '1020px',
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 580px) minmax(320px, 440px)',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg, 10px)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border-color)',
          margin: '20px auto',
        }}
      >
        {/* Sol Kolon: Kayıt Formu */}
        <div style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <BrandLogo width={280} style={{ marginBottom: 16 }} />
            <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.5px', margin: 0 }}>
              14 Gün Ücretsiz <span style={{ color: 'var(--primary)' }}>Deneyin</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', marginTop: '4px' }}>
              1 dakikada hesabınızı açın, 100 hediye e-belge kontörü ile hemen başlayın!
            </p>
          </div>

          {errorMessage && (
            <div
              style={{
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger-text)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--fs-sm, 12px)',
                marginBottom: '16px',
                fontWeight: 500,
              }}
            >
              {errorMessage}
            </div>
          )}

          {successInfo ? (
            <div role="status" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border, var(--border-color))', color: 'var(--text-main)', padding: '16px', borderRadius: 'var(--radius-md, 8px)', fontSize: 'var(--fs-base, 13px)', lineHeight: 1.6 }}>
              <strong>Hesabınız oluşturuldu.</strong>
              <br />
              Kullanıcı adınız: <strong>{successInfo.username}</strong>
              <br />
              Geçici şifreniz e-posta adresinize gönderildi
              {successInfo.mailStatus !== 'SENT' ? ' (e-posta kuyruğa alındı, kısa süre içinde ulaşacak)' : ''}.
              <br />
              {successInfo.trialDays} gün boyunca ön muhasebeyi hemen kullanabilirsiniz.
            </div>
          ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* 1. Sıra: VKN / TCKN — firma Hızlı Bilişim'den ÇEKİLİR, yazılmaz */}
            <div>
              <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                VKN / TCKN *
              </label>
              <input
                type="text"
                required
                inputMode="numeric"
                value={vknTckn}
                onChange={e => setVknTckn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="10 veya 11 hane"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-pill, 9999px)',
                  background: 'var(--bg-surface-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: 'var(--fs-base, 13px)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              />
              <p style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                Firma bilgileriniz vergi numaranızla otomatik alınır; ayrıca firma adı yazmanız gerekmez.
              </p>
            </div>
            {/* 2. Sıra: Ad Soyad & Telefon */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Ad Soyad *
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Ahmet Yılmaz"
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 38px',
                      borderRadius: 'var(--radius-pill, 9999px)',
                      background: 'var(--bg-surface-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontSize: 'var(--fs-base, 13px)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Telefon
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="0532 000 00 00"
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 38px',
                      borderRadius: 'var(--radius-pill, 9999px)',
                      background: 'var(--bg-surface-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontSize: 'var(--fs-base, 13px)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
              </div>
            </div>

            {/* 2. Sıra: E-Posta */}
            <div>
              <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                E-Posta (Giriş Kullanıcı Adı) *
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ornek@sirketiniz.com"
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: 'var(--radius-pill, 9999px)',
                    background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    fontSize: 'var(--fs-base, 13px)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>
            </div>

            {/* 3. Sıra: bilgi notu — şifre e-posta ile gider, formda şifre YOK */}
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', padding: '10px 14px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Şifrenizi siz belirlemezsiniz: güvenli bir geçici şifre üretilip e-posta adresinize gönderilir. İlk girişte değiştirebilirsiniz.
            </div>

            {/* Onay Kutusu */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '4px' }}>
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                style={{ marginTop: '3px', accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <label htmlFor="terms" style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', lineHeight: 1.4, cursor: 'pointer' }}>
                İŞBEY CLOUD Hizmet Sözleşmesi ve KVKK Aydınlatma Metnini okudum, kabul ediyorum.
              </label>
            </div>

            {/* Gönder Butonu */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: 'var(--radius-pill, 9999px)',
                background: 'var(--primary)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 'var(--fs-lg, 16px)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '6px',
                opacity: isLoading ? 0.7 : 1,
                transition: 'all 150ms ease',
              }}
            >
              {isLoading ? 'Hesabınız Oluşturuluyor...' : '14 Günlük Ücretsiz Denemeyi Başlat'}
              {!isLoading && <ArrowRight size={17} />}
            </button>
          </form>
          )}

          {/* Giriş Yap Yönlendirmesi */}
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>
            Zaten bir hesabınız var mı?{' '}
            <button
              type="button"
              onClick={onLoginClick}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Giriş Yapın
            </button>
          </div>
        </div>

        {/* Sağ Kolon: İŞBEY CLOUD Tanıtım & Özellikler (Metronic v5) */}
        <div
          style={{
            background: 'var(--bg-surface-secondary)',
            borderLeft: '1px solid var(--border-color)',
            padding: '36px 30px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
              Bulut Ön Muhasebe & ERP
            </h3>
            <p style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Kredi kartı gerekmez. Hesabınızı açın ve hemen fatura kesmeye başlayın.
            </p>
          </div>

          <div style={{ width: '100%', maxWidth: '340px', margin: '16px 0' }}>
            <ProductPreview compact />
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                <CheckCircle2 size={14} />
              </div>
              <span>100 Adet Hediye e-Fatura / e-Arşiv Kontörü</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                <CheckCircle2 size={14} />
              </div>
              <span>Sınırsız Cari & Stok Kartı Yönetimi</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                <CheckCircle2 size={14} />
              </div>
              <span>Mali Müşavir Portalı ile Otomatik Entegrasyon</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
