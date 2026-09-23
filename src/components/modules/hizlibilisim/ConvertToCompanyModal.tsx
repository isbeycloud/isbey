import React, { useState } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { ExternalCustomer, TenantPlan } from '../../../types';
import {
  Building,
  UserCheck,
  Zap,
  Mail,
  ShieldCheck,
  Copy,
  Check,
  Sparkles,
  Layers,
  Phone,
  MapPin,
  FileText,
  AlertCircle
} from 'lucide-react';

interface ConvertToCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: ExternalCustomer | null;
  onSuccess: () => void;
}

export const ConvertToCompanyModal: React.FC<ConvertToCompanyModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    company: any;
    user?: any;
    activationLink?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form State
  const [plan, setPlan] = useState<TenantPlan>('PRO');
  const [isTrial, setIsTrial] = useState(false);
  const [trialDays, setTrialDays] = useState(14);
  const [createAdminUser, setCreateAdminUser] = useState(true);
  const [customAdminFullName, setCustomAdminFullName] = useState(customer?.contactName || '');
  const [customAdminEmail, setCustomAdminEmail] = useState(customer?.email || '');
  const [customAdminPhone, setCustomAdminPhone] = useState(customer?.phone || '');
  const [customUsername, setCustomUsername] = useState('');

  if (!customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await api.convertHizliToCompany({
        customerId: customer.id,
        plan,
        isTrial,
        trialDays,
        createAdminUser,
        customAdminUsername: customUsername || undefined,
        customAdminFullName: customAdminFullName || undefined,
        customAdminEmail: customAdminEmail || undefined,
        customAdminPhone: customAdminPhone || undefined,
      });

      if (res.success) {
        showToast(res.message, 'success');
        setCreatedResult({
          company: res.company,
          user: res.user,
          activationLink: res.activationLink,
        });
        triggerRefresh();
        onSuccess();
      }
    } catch (err: any) {
      showToast(err.message || 'Firma oluşturulamadı.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdResult?.activationLink) return;
    const fullUrl = `${window.location.origin}${createdResult.activationLink}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    showToast('Aktivasyon bağlantısı panoya kopyalandı.', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCloseAll = () => {
    setCreatedResult(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseAll}
      title={createdResult ? '🎉 İŞBEY Firması ve Kullanıcısı Başarıyla Kuruldu' : `⚡ Hızlı Bilişim → İŞBEY Firması Oluştur`}
      size="large"
    >
      {createdResult ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 0' }}>
          {/* Başarı Kutusu */}
          <div style={{
            // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz başarı token'ı.
            background: 'var(--success-bg)',
            border: '1px solid rgba(22,163,74,0.3)',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: '#16a34a', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <Check size={26} />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: 'var(--text-main)' }}>
              {createdResult.company.name}
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
              Firma Kodu: <strong style={{ color: 'var(--primary)' }}>{createdResult.company.companyCode}</strong> · Paket: <strong>{createdResult.company.plan}</strong>
            </p>
          </div>

          {/* Kullanıcı ve Aktivasyon Kartı */}
          {createdResult.user && (
            <div style={{
              background: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
                <UserCheck size={18} style={{ color: '#16a34a' }} />
                <span>Oluşturulan Company Admin Hesabı</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                <div><strong>Kullanıcı Adı:</strong> @{createdResult.user.username}</div>
                <div><strong>Yetkili:</strong> {createdResult.user.fullName}</div>
                <div><strong>E-Posta:</strong> {createdResult.user.email}</div>
                <div><strong>Rol:</strong> <span className="badge badge-primary">{createdResult.user.role}</span></div>
              </div>

              {createdResult.activationLink && (
                <div style={{ marginTop: '8px', background: 'var(--bg-surface)', padding: '12px', borderRadius: '6px', border: '1px dashed var(--border-color)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={14} style={{ color: 'var(--primary)' }} />
                    <span>Kullanıcı Güvenli Aktivasyon & Şifre Belirleme Bağlantısı (24 Saat Geçerli):</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      readOnly
                      value={`${window.location.origin}${createdResult.activationLink}`}
                      style={{ fontSize: '12px', background: 'var(--bg-surface-secondary)' }}
                    />
                    <button
                      type="button"
                      className={`btn ${copied ? 'btn-success' : 'btn-primary'}`}
                      onClick={handleCopyLink}
                      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copied ? 'Kopyalandı' : 'Linki Kopyala'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button type="button" className="btn btn-primary" onClick={handleCloseAll}>
              Tamamla ve Listeye Dön
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Müşteri Bilgi Özeti Banner */}
          <div style={{
            // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz ikincil yüzey token'ı.
            background: 'var(--bg-surface-secondary)',
            border: '1px solid rgba(26,86,219,0.2)',
            borderRadius: '8px',
            padding: '12px 14px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
            fontSize: '12.5px',
          }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Hızlı Bilişim No:</div>
              <strong style={{ color: 'var(--primary)' }}>{customer.externalId}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Firma / Unvan:</div>
              <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{customer.companyName}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Vergi No:</div>
              <strong>{customer.taxNumber} ({customer.taxOffice})</strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Yetkili:</div>
              <strong>{customer.contactName}</strong>
            </div>
          </div>

          {/* Otomatik Doldurulan Bilgiler */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Firma Adı</label>
              <input type="text" className="form-input" value={customer.companyName} readOnly style={{ background: 'var(--bg-surface-secondary)' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ticari Unvan</label>
              <input type="text" className="form-input" value={customer.title || customer.companyName} readOnly style={{ background: 'var(--bg-surface-secondary)' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">E-Posta</label>
              <input type="text" className="form-input" value={customer.email} readOnly style={{ background: 'var(--bg-surface-secondary)' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Telefon</label>
              <input type="text" className="form-input" value={customer.phone} readOnly style={{ background: 'var(--bg-surface-secondary)' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Şehir / İlçe</label>
              <input type="text" className="form-input" value={`${customer.city || '—'} / ${customer.district || '—'}`} readOnly style={{ background: 'var(--bg-surface-secondary)' }} />
            </div>
          </div>

          {/* İŞBEY Abonelik & Paket Seçimi */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
            <label className="form-label" style={{ fontWeight: 700, marginBottom: '8px' }}>
              İŞBEY Abonelik Paketi & Lisans
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[
                { id: 'STARTER' as TenantPlan, title: 'Starter', desc: '3 Kullanıcı · 1.000 Fatura/Ay', price: '950 ₺/ay' },
                { id: 'PRO' as TenantPlan, title: 'Pro (Tavsiye Edilen)', desc: '10 Kullanıcı · 3.000 Fatura/Ay', price: '2.450 ₺/ay' },
                { id: 'ENTERPRISE' as TenantPlan, title: 'Enterprise', desc: '25 Kullanıcı · 10.000 Fatura/Ay', price: '6.900 ₺/ay' },
              ].map(p => {
                const isSelected = plan === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setPlan(p.id)}
                    style={{
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      background: isSelected ? 'rgba(26,86,219,0.06)' : 'var(--bg-surface-secondary)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13px', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>{p.title}</strong>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a' }}>{p.price}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{p.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kullanıcı Oluşturma ve Aktivasyon Seçenekleri */}
          <div style={{
            background: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={createAdminUser}
                onChange={e => setCreateAdminUser(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span>☑ Şirket Yetkilisi Adına <strong>Company Admin</strong> Kullanıcısı Oluştur</span>
            </label>

            {createAdminUser && (
              <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label required">İŞBEY Yetkilisi</label>
                    <input className="form-input" value={customAdminFullName} required
                      onChange={e => setCustomAdminFullName(e.target.value)} placeholder="Ad Soyad" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label required">Yetkili E-Postası</label>
                    <input type="email" className="form-input" value={customAdminEmail} required
                      onChange={e => setCustomAdminEmail(e.target.value)} placeholder="yetkili@firma.com" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Telefon</label>
                    <input className="form-input" value={customAdminPhone}
                      onChange={e => setCustomAdminPhone(e.target.value)} placeholder="Telefon" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Kullanıcı adı (isteğe bağlı)</label>
                    <input className="form-input" value={customUsername}
                      onChange={e => setCustomUsername(e.target.value)} placeholder="Otomatik oluşturulur" />
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  Rol: <span className="badge badge-primary">COMPANY_ADMIN</span> · Sistem 24 saatlik tek kullanımlık aktivasyon bağlantısı üretir. Bağlantı otomatik e-posta göndermez; yetkili kanaldan paylaşılır.
                </div>
              </div>
            )}
          </div>

          {/* Butonlar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              İptal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontWeight: 700 }}
            >
              <Sparkles size={16} />
              <span>{submitting ? 'İŞBEY Kuruluyor...' : 'FİRMA + KULLANICI OLUŞTUR'}</span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
