import { BrandLogo } from '../components/common/BrandLogo';
import { ProductPreview } from '../components/common/ProductPreview';
import React, { useState } from 'react';
import { Lock, User, ArrowRight, Eye, EyeOff, CheckCircle2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  onRegisterClick: () => void;
  onLandingClick: () => void;
  onSuccessLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onRegisterClick, onLandingClick, onSuccessLogin }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      setErrorMessage('Lütfen kullanıcı adı / e-posta ve şifrenizi giriniz.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await login({ username: identifier, password });
      if (res.success) {
        onSuccessLogin();
      } else {
        setErrorMessage(res.message || 'Geçersiz kullanıcı adı veya şifre.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Giriş sırasında bir hata oluştu.');
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
          maxWidth: '920px',
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 480px) minmax(320px, 420px)',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg, 10px)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border-color)',
          margin: '20px auto',
        }}
      >
        {/* Sol Kolon: Giriş Formu */}
        <div style={{ padding: '44px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <BrandLogo width={280} style={{ marginBottom: 16 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', marginTop: '6px' }}>
              Ön Muhasebe & ERP Portalına Giriş Yapın
            </p>
          </div>

          {errorMessage && (
            <div
              style={{
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger-text)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--fs-base, 13px)',
                marginBottom: '20px',
                fontWeight: 500,
              }}
            >
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Kullanıcı Adı veya E-Posta
              </label>
              <div style={{ position: 'relative' }}>
                <User size={17} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="admin veya e-posta"
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 44px',
                    borderRadius: 'var(--radius-pill, 9999px)',
                    background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    fontSize: 'var(--fs-md, 14px)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border 150ms ease',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Şifre
                </label>
                <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700 }}>
                  Şifremi Unuttum?
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={17} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '12px 44px 12px 44px',
                    borderRadius: 'var(--radius-pill, 9999px)',
                    background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    fontSize: 'var(--fs-md, 14px)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border 150ms ease',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

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
                marginTop: '4px',
                opacity: isLoading ? 0.7 : 1,
                transition: 'all 150ms ease',
              }}
            >
              {isLoading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
              {!isLoading && <ArrowRight size={17} />}
            </button>

            {/* Hızlı Test Giriş Butonu */}
            {import.meta.env.DEV && <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  setIdentifier('admin');
                  setPassword('admin123');
                  setErrorMessage('');
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-pill, 9999px)',
                  background: 'var(--bg-surface-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--fs-sm, 12px)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              >
                <span>Test Girişi Doldur (admin / admin123)</span>
              </button>
            </div>}
          </form>

          {/* Kayıt Ol Yönlendirmesi */}
          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>
            Henüz bir İŞBEY hesabınız yok mu?{' '}
            <button
              type="button"
              onClick={onRegisterClick}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              14 Gün Ücretsiz Deneyin
            </button>
          </div>
        </div>

        {/* Sağ Kolon: İŞBEY CLOUD Tanıtım & Özellikler (Metronic v5) */}
        <div
          style={{
            background: 'var(--bg-surface-secondary)',
            borderLeft: '1px solid var(--border-color)',
            padding: '40px 32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
              Bulut Ön Muhasebe & ERP
            </h3>
            <p style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Fatura, stok, cari ve e-dönüşüm süreçlerinizi tek merkezden kolayca yönetin.
            </p>
          </div>

          <div style={{ width: '100%', maxWidth: '340px', margin: '20px 0' }}>
            <ProductPreview compact />
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                <CheckCircle2 size={14} />
              </div>
              <span>GİB onaylı e-Fatura, e-Arşiv & e-İrsaliye</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                <CheckCircle2 size={14} />
              </div>
              <span>Yapay zeka asistanı ile akıllı muhasebe</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                <CheckCircle2 size={14} />
              </div>
              <span>Mobil, tablet ve web'den 7/24 kesintisiz erişim</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
