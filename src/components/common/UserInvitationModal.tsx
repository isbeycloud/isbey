import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Mail,
  User,
  Shield,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../services/api';
import type { Role, Invitation } from '../../types';

interface UserInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const UserInvitationModal: React.FC<UserInvitationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'invite' | 'pending'>('invite');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleSlug, setRoleSlug] = useState('employee');
  const [roles, setRoles] = useState<Role[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [roleRes, invRes] = await Promise.all([
        api.getRoles(),
        api.getInvitations(),
      ]);
      if (roleRes.success && roleRes.roles) setRoles(roleRes.roles);
      if (invRes.success && invRes.invitations) setInvitations(invRes.invitations);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    try {
      const res = await api.createInvitation({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        roleSlug,
      });

      if (res.success && res.invitation) {
        setCreatedInvite(res.invitation);
        setEmail('');
        setFullName('');
        loadData();
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      alert(err.message || 'Davet gönderilemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = (tokenPlain: string) => {
    const fullUrl = `${window.location.origin}/accept-invite?token=${tokenPlain}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  // 2026-09-13: Koyu overlay literali .modal-overlay sınıfına bırakıldı (tek kaynak, açık tema uyumlu).
  return (
    <div className="modal-overlay">
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: 'var(--shadow-xl)' }}>
        {/* Modal Başlık */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--info-bg)', color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                Kullanıcı Davet Et & Yönet
              </h3>
              <p style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Şirketinize yeni personel veya mali müşavir ekleyin
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Menü */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <button
            onClick={() => { setActiveTab('invite'); setCreatedInvite(null); }}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: 'none',
              background: activeTab === 'invite' ? 'var(--info)' : 'var(--bg-surface-secondary)',
              color: activeTab === 'invite' ? '#fff' : 'var(--text-muted)',
              fontWeight: '700',
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
            }}
          >
            Yeni Davet Gönder
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: 'none',
              background: activeTab === 'pending' ? 'var(--info)' : 'var(--bg-surface-secondary)',
              color: activeTab === 'pending' ? '#fff' : 'var(--text-muted)',
              fontWeight: '700',
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Bekleyen Davetler ({invitations.filter(i => !i.acceptedAt).length})
          </button>
        </div>

        {activeTab === 'invite' ? (
          <div>
            {createdInvite ? (
              <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm, 6px)', padding: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success-text)', fontWeight: '700', fontSize: 'var(--fs-md, 14px)' }}>
                  <CheckCircle2 size={18} /> Davet Başarıyla Oluşturuldu!
                </div>
                <p style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--success-text)', margin: '8px 0 12px 0' }}>
                  <b>{createdInvite.email}</b> adresi için katılım bağlantısı üretildi. Bu linki kopyalayıp kullanıcıya iletebilirsiniz:
                </p>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/accept-invite?token=${createdInvite.tokenPlain}`}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-sm, 12px)', background: 'var(--bg-surface)' }}
                  />
                  <button
                    onClick={() => handleCopyLink(createdInvite.tokenPlain)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: 'none',
                      background: copied ? 'var(--success)' : 'var(--info)',
                      color: '#fff',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'Kopyalandı' : 'Kopyala'}
                  </button>
                </div>

                <div style={{ marginTop: '14px', textAlign: 'right' }}>
                  <button
                    onClick={() => setCreatedInvite(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--info)', cursor: 'pointer', fontSize: 'var(--fs-base, 13px)', fontWeight: '600' }}
                  >
                    + Başka Bir Kullanıcı Daha Davet Et
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                    E-Posta Adresi *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                    <input
                      type="email"
                      required
                      placeholder="personel@sirketiniz.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-md, 14px)' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                    Ad Soyad (Opsiyonel)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Ahmet Yılmaz"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-md, 14px)' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                    Rol / Yetki Seviyesi *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Shield size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                    <select
                      value={roleSlug}
                      onChange={e => setRoleSlug(e.target.value)}
                      style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-md, 14px)', background: 'var(--bg-surface)' }}
                    >
                      {roles.map(r => (
                        <option key={r.id} value={r.slug}>
                          {r.name} ({r.permissions.length} İzin)
                        </option>
                      ))}
                    </select>
                  </div>
                  <p style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Kullanıcı daveti kabul ettikten sonra belirlediğiniz rolün yetkileriyle sisteme giriş yapacaktır.
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{ padding: '10px 18px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', fontWeight: '700' }}
                  >
                    Kapat
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{ padding: '10px 22px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: 'var(--info)', color: '#fff', cursor: 'pointer', fontWeight: '700', opacity: isLoading ? 0.7 : 1 }}
                  >
                    {isLoading ? 'Davet Oluşturuluyor...' : 'Davet Linki Oluştur'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div>
            {invitations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                Henüz gönderilmiş bir davet bulunmuyor.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {invitations.map(inv => {
                  const isAccepted = !!inv.acceptedAt;
                  const isExpired = new Date(inv.expiresAt) < new Date();
                  return (
                    <div
                      key={inv.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        borderRadius: 'var(--radius-md, 8px)',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface-secondary)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: 'var(--fs-md, 14px)' }}>
                          {inv.fullName ? `${inv.fullName} (${inv.email})` : inv.email}
                        </div>
                        <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '12px' }}>
                          <span>Rol: <b>{inv.roleSlug}</b></span>
                          <span>Gönderen: {inv.createdBy}</span>
                          <span>Tarih: {new Date(inv.createdAt).toLocaleDateString('tr-TR')}</span>
                        </div>
                      </div>

                      <div>
                        {isAccepted ? (
                          <span style={{ fontSize: 'var(--fs-sm, 12px)', background: 'var(--success-bg)', color: 'var(--success-text)', padding: '4px 8px', borderRadius: 'var(--radius-sm, 6px)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={14} /> Katıldı
                          </span>
                        ) : isExpired ? (
                          <span style={{ fontSize: 'var(--fs-sm, 12px)', background: 'var(--danger-bg)', color: 'var(--danger-text)', padding: '4px 8px', borderRadius: 'var(--radius-sm, 6px)', fontWeight: '600' }}>
                            Süresi Doldu
                          </span>
                        ) : (
                          <span style={{ fontSize: 'var(--fs-sm, 12px)', background: 'var(--warning-bg)', color: 'var(--warning-text)', padding: '4px 8px', borderRadius: 'var(--radius-sm, 6px)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={14} /> Beklemede
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserInvitationModal;
