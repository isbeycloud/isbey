import { BrandLogo } from '../components/common/BrandLogo';
import React, { useState, useEffect } from 'react';
import {
  Building2,
  Lock,
  User,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const AcceptInvitePage: React.FC = () => {
  const { login } = useAuth();
  const [token, setToken] = useState('');
  const [invitation, setInvitation] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawToken = params.get('token');
    if (!rawToken) {
      setError('Geçersiz davet bağlantısı. Lütfen linkinizi kontrol edin.');
      setIsLoading(false);
      return;
    }
    setToken(rawToken);
    verifyToken(rawToken);
  }, []);

  const verifyToken = async (tok: string) => {
    try {
      const res = await api.verifyInvitation(tok);
      if (res.success && res.invitation) {
        setInvitation(res.invitation);
        setFullName(res.invitation.fullName || '');
      } else {
        setError(res.message || 'Davet bulunamadı veya süresi dolmuş.');
      }
    } catch (err: any) {
      setError(err.message || 'Davet bağlantısı doğrulanamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Girdiğiniz şifreler birbiriyle eşleşmiyor.');
      return;
    }
    if (password.length < 6) {
      setError('Şifreniz en az 6 karakter olmalıdır.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.acceptInvitation({
        token,
        fullName: fullName.trim(),
        password,
      });

      if (res.success && res.token) {
        localStorage.setItem('isbey_token', res.token);
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Hesap aktivasyonu başarısız.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface-secondary)', padding: '20px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', width: '100%', maxWidth: '480px', padding: '36px', boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <BrandLogo width={280} style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 6px 0' }}>
            İŞBEY CLOUD Daveti
          </h2>
          <p style={{ fontSize: 'var(--fs-md, 14px)', color: 'var(--text-muted)', margin: 0 }}>
            Firma hesabına katılmak için şifrenizi belirleyin
          </p>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            Davet bilgileri doğrulanıyor...
          </div>
        ) : error ? (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-md, 8px)', padding: '16px', color: 'var(--danger-text)', fontSize: 'var(--fs-md, 14px)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        ) : success ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <CheckCircle2 size={32} />
            </div>
            <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: '700', color: 'var(--success-text)', marginBottom: '8px' }}>
              Hesabınız Başarıyla Aktifleştirildi!
            </h3>
            <p style={{ fontSize: 'var(--fs-md, 14px)', color: 'var(--text-muted)' }}>
              İŞBEY çalışma alanınıza yönlendiriliyorsunuz...
            </p>
          </div>
        ) : (
          <div>
            {/* Davet Eden Firma Bilgi Kartı */}
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', padding: '14px', marginBottom: '20px' }}>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.5px' }}>
                Davet Eden Şirket
              </div>
              <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: '700', color: 'var(--text-main)', marginTop: '2px' }}>
                {invitation?.tenantName}
              </div>
              <div style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--info)', marginTop: '4px', fontWeight: '500' }}>
                E-Posta: {invitation?.email} | Rol: {invitation?.roleSlug}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  Adınız ve Soyadınız *
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    placeholder="Ad Soyad"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-md, 14px)' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  Yeni Şifre Belirleyin *
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="password"
                    required
                    placeholder="En az 6 karakter"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-md, 14px)' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  Şifre Tekrar *
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="password"
                    required
                    placeholder="Şifrenizi tekrar girin"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-md, 14px)' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#fff',
                  fontSize: 'var(--fs-lg, 16px)',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? 'Hesap Aktifleştiriliyor...' : 'Daveti Kabul Et ve Başla'}
                <ArrowRight size={18} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptInvitePage;
