import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';
import type { Company } from '../../types';
import { Building, Upload, Link, Check, Trash2, Sparkles, RefreshCw } from 'lucide-react';

interface CompanyLogoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLogoUrl?: string;
  onLogoUpdated?: (logoUrl: string) => void;
}

const PRESET_LOGOS = [
  { label: 'İŞBEY Kurumsal Kırmızı', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&h=200&fit=crop&auto=format&q=80' },
  { label: 'Kurumsal Mavi Amblem', url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=200&h=200&fit=crop&auto=format&q=80' },
  { label: 'Zümrüt Yeşil Logo', url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=200&h=200&fit=crop&auto=format&q=80' },
  { label: 'Antrasit Geometrik', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=200&h=200&fit=crop&auto=format&q=80' },
  { label: 'Teknoloji & Yazılım', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop&auto=format&q=80' },
  { label: 'Lojistik & Ticaret', url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=200&h=200&fit=crop&auto=format&q=80' },
];

export const CompanyLogoModal: React.FC<CompanyLogoModalProps> = ({
  isOpen,
  onClose,
  currentLogoUrl = '',
  onLogoUpdated,
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl);
  const [company, setCompany] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'PRESETS' | 'UPLOAD' | 'URL'>('PRESETS');

  useEffect(() => {
    if (isOpen) {
      loadCompany();
    }
  }, [isOpen]);

  const loadCompany = async () => {
    try {
      const res = await api.getCompany();
      if (res.success && res.company) {
        setCompany(res.company);
        setLogoUrl(res.company.logoUrl || currentLogoUrl || '');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Lütfen geçerli bir görsel dosyası seçin (PNG, JPG, SVG, WebP).', 'warning');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo dosyası boyutu 2MB dan küçük olmalıdır.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setLogoUrl(base64);
      showToast('Amblem görseli yüklendi.', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);
    try {
      const updatedCompany: Company = {
        ...company,
        logoUrl: logoUrl.trim() || undefined,
      };

      const res = await api.updateCompany(updatedCompany);
      if (res.success) {
        showToast('Firma amblemi / logosu başarıyla kaydedildi.', 'success');
        if (onLogoUpdated) onLogoUpdated(logoUrl.trim());
        triggerRefresh();
        onClose();
      } else {
        showToast('Amblem kaydedilemedi.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Bir hata oluştu.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🏢 Firma Amblemi & Kurumsal Logo Yükleme"
      size="medium"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Önizleme Alanı */}
        <div style={{
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          background: 'var(--bg-surface-secondary)',
          padding: '14px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '8px',
            background: '#ffffff',
            border: '2px dashed var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Firma Logosu"
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
                onError={() => showToast('Görsel bağlantısı geçersiz.', 'warning')}
              />
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '10px' }}>
                <Building size={28} style={{ margin: '0 auto', opacity: 0.4 }} />
                <span>Logo Yok</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {company?.name || 'Firma Adı'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {company?.title || 'Resmi Ticari Unvan'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '4px', fontWeight: 600 }}>
              {logoUrl ? '✓ Amblem aktif' : '⚠️ Henüz amblem eklenmemiş'}
            </div>
          </div>

          {logoUrl && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRemoveLogo}
              style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Amblemi Kaldır"
            >
              <Trash2 size={14} />
              <span>Kaldır</span>
            </button>
          )}
        </div>

        {/* Sekmeler */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '4px' }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'PRESETS' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('PRESETS')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Sparkles size={14} />
            <span>Hazır Şablonlar</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'UPLOAD' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('UPLOAD')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Upload size={14} />
            <span>Bilgisayardan Yükle</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'URL' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('URL')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Link size={14} />
            <span>Logo Web Bağlantısı (URL)</span>
          </button>
        </div>

        {/* 1. Hazır Kurumsal Amblemler */}
        {activeTab === 'PRESETS' && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Kurumsal renk ve sektörünüze uygun hazır bir amblem seçebilirsiniz:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {PRESET_LOGOS.map((preset, idx) => {
                const isSelected = logoUrl === preset.url;
                return (
                  <div
                    key={idx}
                    onClick={() => setLogoUrl(preset.url)}
                    style={{
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '8px',
                      cursor: 'pointer',
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      position: 'relative',
                      boxShadow: isSelected ? '0 0 0 2px var(--primary-light)' : 'none',
                    }}
                  >
                    <img
                      src={preset.url}
                      alt={preset.label}
                      style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                    />
                    <span style={{ fontSize: '10px', fontWeight: 600, textAlign: 'center', color: '#1f2937' }}>
                      {preset.label}
                    </span>
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: '4px', right: '4px',
                        background: 'var(--primary)', color: '#fff',
                        borderRadius: '50%', width: '16px', height: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <Check size={10} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. Dosya Yükle */}
        {activeTab === 'UPLOAD' && (
          <div style={{
            border: '2px dashed var(--border-color)',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
            background: 'var(--bg-surface-secondary)',
            cursor: 'pointer',
          }}>
            <input
              type="file"
              accept="image/*"
              id="company-logo-file-input"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <label htmlFor="company-logo-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Upload size={32} color="var(--primary)" />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Amblem / Logo Dosyası Seçin</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PNG, JPG, SVG, WebP (Şeffaf arka plan önerilir, Maks. 2MB)</div>
            </label>
          </div>
        )}

        {/* 3. URL Girişi */}
        {activeTab === 'URL' && (
          <div className="form-group">
            <label className="form-label">Logo Web URL Bağlantısı</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://sirketiniz.com/logo.png"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Web sitenizdeki kurumsal logonuzun doğrudan görsel adresini yapıştırabilirsiniz.
            </p>
          </div>
        )}

        {/* Alt Butonlar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            İptal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {saving ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
            <span>Amblemi Kaydet</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
