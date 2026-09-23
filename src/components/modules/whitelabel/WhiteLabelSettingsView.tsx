import React, { useState, useEffect } from 'react';
import {
  Palette,
  Globe,
  Mail,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Eye,
  Save,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { WhiteLabelBrandProfile } from '../../../types';

export const WhiteLabelSettingsView: React.FC = () => {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<WhiteLabelBrandProfile>({
    id: '',
    tenantId: 'tnt-isbey',
    brandName: 'İŞBEY Cloud',
    primaryColor: '#0284c7',
    accentColor: '#38bdf8',
    supportEmail: 'destek@isbey.cloud',
    supportPhone: '+90 216 555 0123',
    loginScreenMessage: 'İşletmenizin Yeni Nesil Akıllı Bulut ERP ve Muhasebe Platformu',
    isActive: true,
  });

  const [customDomainInput, setCustomDomainInput] = useState('muhasebe.sirketim.com');
  const [domainVerification, setDomainVerification] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const res = await api.getWhiteLabelProfile();
      if (res.success && res.profile) setProfile(res.profile);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.saveWhiteLabelProfile(profile);
      if (res.success) {
        showToast('Marka ayarlarınız başarıyla kaydedildi.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Marka ayarları kaydedilemedi.', 'error');
    }
  };

  const handleVerifyDomain = async () => {
    if (!customDomainInput) return;
    setIsVerifying(true);
    try {
      const res = await api.verifyWhiteLabelDomain(customDomainInput);
      if (res.success) {
        setDomainVerification(res.verification);
        showToast(res.message, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Domain doğrulanamadı.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Palette size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  White-Label Özel Marka & Domain
                </h1>
                <span className="badge badge-primary">
                  Enterprise
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Kendi kurumsal logonuz, tema renkleriniz ve özel alan adınızla (CNAME) platformu sunun
              </p>
            </div>
          </div>
        </div>

        {/* 2 Kolon: Sol Form / Sağ Canlı Önizleme */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
          {/* Sol: Marka ve Domain Formu */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Marka Kimliği */}
            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>1. Marka ve Renk Kimliği</h3>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Marka / Portal Adı</label>
                  <input
                    type="text"
                    required
                    value={profile.brandName}
                    onChange={e => setProfile({ ...profile, brandName: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Ana Tema Rengi</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={profile.primaryColor}
                        onChange={e => setProfile({ ...profile, primaryColor: e.target.value })}
                        style={{ width: '38px', height: '38px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={profile.primaryColor}
                        onChange={e => setProfile({ ...profile, primaryColor: e.target.value })}
                        style={{ flex: 1, padding: '8px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Vurgu Rengi (Accent)</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={profile.accentColor}
                        onChange={e => setProfile({ ...profile, accentColor: e.target.value })}
                        style={{ width: '38px', height: '38px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={profile.accentColor}
                        onChange={e => setProfile({ ...profile, accentColor: e.target.value })}
                        style={{ flex: 1, padding: '8px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Giriş Ekranı Karşılama Mesajı</label>
                  <input
                    type="text"
                    value={profile.loginScreenMessage || ''}
                    onChange={e => setProfile({ ...profile, loginScreenMessage: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button type="submit" style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Save size={16} />
                    <span>Kaydet</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Custom Domain Doğrulama */}
            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>2. Özel Alan Adı (Custom Domain)</h3>
              <p style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', margin: '0 0 14px' }}>
                DNS panelinizden alan adınızı <b>cname.isbey.cloud</b> adresine CNAME kaydı olarak yönlendiriniz.
              </p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="muhasebe.sirketim.com"
                  value={customDomainInput}
                  onChange={e => setCustomDomainInput(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
                <button
                  type="button"
                  onClick={handleVerifyDomain}
                  disabled={isVerifying}
                  style={{ padding: '0 16px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer' }}
                >
                  {isVerifying ? 'Doğrulanıyor...' : 'Doğrula & SSL Kur'}
                </button>
              </div>

              {domainVerification && (
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--success-bg)', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--success-border)', color: 'var(--success-text)', fontSize: 'var(--fs-sm, 12px)' }}>
                  ✓ <b>{domainVerification.domain}</b> alan adı DNS ve Let's Encrypt SSL sertifikası başarıyla aktif edildi!
                </div>
              )}
            </div>
          </div>

          {/* Sağ: Canlı Giriş Ekranı Önizlemesi */}
          <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Eye size={18} color="var(--info)" />
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Canlı Giriş Ekranı Önizlemesi</h3>
            </div>

            {/* 2026-09-13: Önizleme yüzeyi kiracının seçtiği marka rengini taşır; iç yüzeyler tema token'ına çevrildi, marka renkleri veri olarak korundu. */}
            <div style={{ flex: 1, background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', padding: '30px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-sm, 6px)', background: profile.primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-xl, 20px)', marginBottom: '14px' }}>
                {profile.brandName.slice(0, 1)}
              </div>

              <h2 style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
                {profile.brandName}
              </h2>
              <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', maxWidth: '280px' }}>
                {profile.loginScreenMessage}
              </p>

              <div style={{ width: '100%', maxWidth: '260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ height: '36px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)' }} />
                <div style={{ height: '36px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)' }} />
                <button style={{ height: '38px', background: profile.primaryColor, border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)' }}>
                  Giriş Yap
                </button>
              </div>

              <div style={{ marginTop: '20px', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                Destek: {profile.supportEmail} | {profile.supportPhone}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
