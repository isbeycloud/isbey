import React, { useState } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { Key, Copy, Check, Lock, Send, RefreshCw, ShieldCheck } from 'lucide-react';
import type { User } from '../../../types';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'LINK' | 'DIRECT'>('LINK');
  const [newPassword, setNewPassword] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const res = await api.resetUserPassword(user.id);
      if (res.success && res.resetLink) {
        setResetLink(res.resetLink);
        showToast('Tek kullanımlık şifre sıfırlama bağlantısı üretildi.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Bağlantı üretilemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || newPassword.length < 4) {
      showToast('Şifre en az 4 karakter olmalıdır.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const res = await api.resetUserPassword(user.id, newPassword.trim());
      if (res.success) {
        showToast(`"${user.fullName}" kullanıcısının şifresi başarıyla güncellendi.`, 'success');
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Şifre güncellenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    showToast('Sıfırlama bağlantısı panoya kopyalandı.', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Güvenli Şifre Yönetimi — ${user.fullName} (@${user.username})`}
      size="medium"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Seçenek Sekmeleri */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          <button
            type="button"
            className={`btn ${mode === 'LINK' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setMode('LINK')}
          >
            <Send size={13} />
            <span>Tek Kullanımlık Sıfırlama Bağlantısı</span>
          </button>
          <button
            type="button"
            className={`btn ${mode === 'DIRECT' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setMode('DIRECT')}
          >
            <Lock size={13} />
            <span>Doğrudan Yeni Şifre Belirle</span>
          </button>
        </div>

        {mode === 'LINK' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              background: 'rgba(2, 132, 199, 0.08)',
              border: '1px solid rgba(2, 132, 199, 0.25)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '12px',
              lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={16} />
                <span>Güvenli Sıfırlama Mekanizması</span>
              </div>
              <div style={{ marginTop: '4px', color: 'var(--text-main)' }}>
                Kullanıcı için 24 saat geçerli, kriptografik olarak imzalanmış tek kullanımlık bir bağlantı üretilir. Şifre açık metin olarak gösterilmez veya saklanmaz.
              </div>
            </div>

            {!resetLink ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateLink}
                disabled={loading}
                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
                <span>Sıfırlama Bağlantısı Oluştur</span>
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Üretilen Güvenli Bağlantı (24 Saat Geçerli):
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    value={resetLink}
                    className="form-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--bg-surface-secondary)' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCopy}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                  >
                    {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                    <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleDirectReset} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Yönetici olarak bu kullanıcının şifresini anında güncelleyebilirsiniz. Güncelleme sonrası kullanıcının mevcut aktif oturumları güvenlik amacıyla sonlandırılır.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Yeni Şifre:
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Yeni şifreyi giriniz (min 4 karakter)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                İptal
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
