import React, { useState, useEffect } from 'react';
import {
  FileText,
  Lock,
  Download,
  CheckCircle2,
  AlertTriangle,
  Building,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { api } from '../services/api';

export const PublicDocumentSharePage: React.FC<{ token: string }> = ({ token }) => {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<any>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    resolve();
  }, [token]);

  const resolve = async (pass?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.resolvePublicShareToken(token, pass);
      if (res.requiresPassword) {
        setRequiresPassword(true);
      } else {
        setRequiresPassword(false);
        setData(res);
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı geçersiz veya süresi dolmuş.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolve(password);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-surface-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', color: 'var(--text-main)', fontFamily: 'system-ui' }}>
      <div style={{ width: '100%', maxWidth: '560px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '32px', boxShadow: 'var(--shadow-xl)' }}>
        {/* Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <FileText size={28} color="#fff" />
          </div>
          <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
            İŞBEY <span style={{ color: 'var(--primary)' }}>CLOUD</span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>
            Güvenli Belge ve Ekstre Paylaşım Portalı
          </p>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-md, 8px)', padding: '16px', color: 'var(--danger-text)', fontSize: 'var(--fs-base, 13px)', textAlign: 'center', marginBottom: '16px' }}>
            <AlertTriangle size={24} style={{ margin: '0 auto 6px' }} />
            <div>{error}</div>
          </div>
        )}

        {requiresPassword && (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ textAlign: 'center', fontSize: 'var(--fs-md, 14px)', color: 'var(--text-muted)' }}>
              Bu belge parola ile korunmaktadır. Lütfen erişim şifresini giriniz:
            </div>
            <input
              type="password"
              required
              placeholder="Belge Parolası"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-md, 14px)' }}
            />
            <button
              type="submit"
              style={{ padding: '12px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-base, 13px)', cursor: 'pointer' }}
            >
              Belgeyi Görüntüle
            </button>
          </form>
        )}

        {data && data.data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'var(--bg-surface-secondary)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--success)', fontWeight: 700 }}>Doğrulanmış Resmi Belge</div>
              <h3 style={{ margin: '6px 0', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
                {data.token?.title || 'Paylaşılan Belge'}
              </h3>
              <div style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>
                Geçerlilik: {new Date(data.token?.expiresAt).toLocaleDateString('tr-TR')}
              </div>
            </div>

            <button
              onClick={() => window.open(data.data.fileUrl || '#', '_blank')}
              style={{ padding: '14px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-md, 8px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-md, 14px)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Download size={20} />
              <span>Belgeyi İndir / Önizle</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
