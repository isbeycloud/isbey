import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import type { Product } from '../../types';
import { Image, Upload, Link, Check, Trash2, Sparkles, RefreshCw } from 'lucide-react';

interface ProductImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onImageUpdated: (updatedProduct: Product) => void;
}

const PRESET_IMAGES = [
  { label: 'Mouse / Aksesuar', url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Klavye', url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Monitör / Ekran', url: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Kulaklık', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Dizüstü Bilgisayar', url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Kırtasiye / Kağıt', url: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Kablo / Ağ', url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'SSD / Donanım', url: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Ofis Koltuğu', url: 'https://images.unsplash.com/photo-1580481077197-28d844196160?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Yazıcı / Kartuş', url: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Kahve / İçecek', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&h=400&fit=crop&auto=format&q=80' },
  { label: 'Kutu / Paket', url: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&h=400&fit=crop&auto=format&q=80' },
];

export const ProductImageEditModal: React.FC<ProductImageEditModalProps> = ({
  isOpen,
  onClose,
  product,
  onImageUpdated,
}) => {
  const { showToast } = useToast();
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'PRESETS' | 'URL' | 'UPLOAD'>('PRESETS');

  useEffect(() => {
    if (product) {
      setImageUrl(product.imageUrl || '');
    }
  }, [product, isOpen]);

  if (!product) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Lütfen geçerli bir resim dosyası seçin (PNG, JPG, WebP).', 'warning');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Resim boyutu 2MB dan küçük olmalıdır.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImageUrl(base64);
      showToast('Resim başarıyla yüklendi.', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.updateProduct(product.id, {
        ...product,
        imageUrl: imageUrl.trim() || undefined,
      });

      if (res.success && res.product) {
        showToast('Ürün görseli başarıyla güncellendi.', 'success');
        onImageUpdated(res.product);
        onClose();
      } else {
        showToast('Görsel güncellenemedi.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Bir hata oluştu.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = async () => {
    setImageUrl('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`🖼️ Ürün Görseli — ${product.name}`}
      size="medium"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Ürün ve Önizleme Başlığı */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', background: 'var(--bg-surface-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{
            width: '70px', height: '70px', borderRadius: '8px',
            background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0, position: 'relative'
          }}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => {
                  showToast('Görsel URL geçersiz veya yüklenemedi.', 'warning');
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '10px' }}>
                <Image size={24} style={{ margin: '0 auto', opacity: 0.5 }} />
                <span>Görsel Yok</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {product.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Kod: <strong style={{ color: 'var(--text-main)' }}>{product.code}</strong> | Barkod: {product.barcode}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>
              {product.salePrice.toLocaleString('tr-TR')} ₺
            </div>
          </div>

          {imageUrl && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRemoveImage}
              style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Görseli Kaldır"
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
            <span>Örnek Resimler</span>
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
            <span>Resim Bağlantısı (URL)</span>
          </button>
        </div>

        {/* 1. Örnek Resimler Galerisi */}
        {activeTab === 'PRESETS' && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Aşağıdaki hazır ürün kategorisi görsellerinden birine tıklayarak anında seçebilirsiniz:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxHeight: '220px', overflowY: 'auto', padding: '2px' }}>
              {PRESET_IMAGES.map((img, idx) => {
                const isSelected = imageUrl === img.url;
                return (
                  <div
                    key={idx}
                    onClick={() => setImageUrl(img.url)}
                    style={{
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: 'var(--bg-surface)',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 0 2px var(--primary-light)' : 'none',
                    }}
                  >
                    <img
                      src={img.url}
                      alt={img.label}
                      style={{ width: '100%', height: '65px', objectFit: 'cover' }}
                    />
                    <div style={{ padding: '4px', fontSize: '10px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {img.label}
                    </div>
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: '4px', right: '4px',
                        background: 'var(--primary)', color: '#fff',
                        borderRadius: '50%', width: '18px', height: '18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <Check size={12} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. Bilgisayardan Yükle */}
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
              id="product-image-file-input"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <label htmlFor="product-image-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Upload size={32} color="var(--primary)" />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Görsel Seçmek İçin Tıklayın</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PNG, JPG, WebP (Maks. 2MB)</div>
            </label>
          </div>
        )}

        {/* 3. URL Girişi */}
        {activeTab === 'URL' && (
          <div className="form-group">
            <label className="form-label">Resim Web Bağlantısı (URL)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com/urun-gorseli.jpg"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Doğrudan resim bağlantısı (.jpg, .png, .webp) yapıştırabilirsiniz.
            </p>
          </div>
        )}

        {/* Alt Kaydet Butonları */}
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
            <span>Görseli Kaydet</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
