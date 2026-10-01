import React, { useState } from 'react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { ExternalCustomer } from '../../../types';
import { Search, Building, CheckCircle2, AlertCircle, Plus, X } from 'lucide-react';

/**
 * 2026-10-01 — İLK MÜKELLEF BOOTSTRAP AKIŞI.
 *
 * NEDEN: Panel sıfır kayıtla açıldığında "HB'den Güncelle" hiçbir şey
 * yapamıyordu ve ilk kaydı oluşturacak yol yoktu (çıkmaz). Hızlı Bilişim'de
 * "tüm mükellefleri listele" ucu YOK; tek gerçek yol VKN/TCKN ile tek tek
 * sorgulamaktır (`MusteriGetir?vergikimlikno=`).
 *
 * AKIŞ: VKN/TCKN gir → Hızlı Bilişim'de Sorgula (YAZMAZ) → gerçek bilgileri
 * önizle → kullanıcı onaylarsa İŞBEY portföyüne Ekle (MUTASYON).
 * Kullanıcı unvan/şehir DÜZENLEYEMEZ; kayıt sağlayıcıdan geldiği gibi yazılır.
 */
export const HizliMukellefEkleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}> = ({ isOpen, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [vkn, setVkn] = useState('');
  const [sorguluyor, setSorguluyor] = useState(false);
  const [ekliyor, setEkliyor] = useState(false);
  const [sonuc, setSonuc] = useState<{
    durum: 'BULUNDU' | 'BULUNAMADI' | 'HATA' | 'GECERSIZ';
    musteri?: ExternalCustomer;
    mevcutKayit?: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const sifirla = () => { setVkn(''); setSonuc(null); };

  const kapat = () => { sifirla(); onClose(); };

  const sorgula = async () => {
    const temiz = vkn.replace(/[^0-9]/g, '');
    if (!temiz) { showToast('VKN veya TCKN giriniz.', 'warning'); return; }
    setSorguluyor(true);
    setSonuc(null);
    try {
      const res = await api.sorgulaHizliMukellef(temiz);
      setSonuc({
        durum: res.durum,
        musteri: res.musteri,
        mevcutKayit: res.mevcutKayit,
        message: res.message,
      });
    } catch (err: any) {
      setSonuc({ durum: 'HATA', message: err.message || 'Sorgu tamamlanamadı.' });
    } finally {
      setSorguluyor(false);
    }
  };

  const ekle = async () => {
    const temiz = vkn.replace(/[^0-9]/g, '');
    setEkliyor(true);
    try {
      const res = await api.ekleHizliMukellef(temiz);
      if (res.success) {
        showToast(res.message, res.durum === 'MEVCUT' ? 'info' : 'success');
        onSuccess?.();
        kapat();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Kayıt eklenemedi.', 'error');
    } finally {
      setEkliyor(false);
    }
  };

  const fieldStyle: React.CSSProperties = {
    background: 'var(--bg-app)', border: '1px solid var(--border-strong)',
    borderRadius: '8px', padding: '9px 12px', fontSize: '13px',
    color: 'var(--text-main)', outline: 'none', width: '100%',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11.5px', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '4px',
  };

  const bulundu = sonuc?.durum === 'BULUNDU' && !!sonuc.musteri;
  const zatenVar = bulundu && sonuc?.mevcutKayit;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10, 15, 30, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl, 12px)', width: '560px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontWeight: 700, fontSize: 'var(--fs-lg, 16px)', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Plus size={16} style={{ color: 'var(--primary)' }} /> Hızlı Bilişim'den Mükellef Ekle
          </h4>
          <button onClick={kapat} aria-label="Kapat" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Hızlı Bilişim'de kayıtlı bir mükellefi VKN/TCKN ile sorgulayın. Bulunan gerçek bilgiler
            gösterilir; onayladığınızda İŞBEY portföyünüze eklenir.
          </p>

          <div>
            <label style={labelStyle}>VKN / TCKN</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                style={fieldStyle}
                value={vkn}
                onChange={e => { setVkn(e.target.value); setSonuc(null); }}
                onKeyDown={e => { if (e.key === 'Enter') sorgula(); }}
                placeholder="10 veya 11 hane..."
                inputMode="numeric"
              />
              <button type="button" className="btn btn-primary" onClick={sorgula} disabled={sorguluyor}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontWeight: 700 }}>
                <Search size={14} /> {sorguluyor ? 'Sorgulanıyor...' : 'Sorgula'}
              </button>
            </div>
          </div>

          {/* ── Bulunamadı / geçersiz / hata — açık mesaj ── */}
          {sonuc && !bulundu && (
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '11px 14px',
              background: 'rgba(239,83,80,0.08)', border: '1px solid var(--danger)',
              borderRadius: '8px', fontSize: '12.5px',
            }}>
              <AlertCircle size={15} color="var(--danger)" style={{ marginTop: '1px', flexShrink: 0 }} />
              <div>{sonuc.message}</div>
            </div>
          )}

          {/* ── Bulundu — gerçek önizleme ── */}
          {bulundu && sonuc?.musteri && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{
                padding: '10px 14px', background: 'rgba(16,185,129,0.08)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 700,
              }}>
                <CheckCircle2 size={15} color="var(--success)" />
                {zatenVar ? 'Bu mükellef zaten portföyünüzde' : 'Mükellef bulundu'}
              </div>
              <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>FİRMA / TİCARİ UNVAN</div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Building size={13} /> {sonuc.musteri.companyName || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>VKN / TCKN</div>
                  <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{sonuc.musteri.taxNumber}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>VERGİ DAİRESİ</div>
                  <div>{sonuc.musteri.taxOffice || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>YETKİLİ</div>
                  <div>{sonuc.musteri.contactName || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ŞEHİR / İLÇE</div>
                  <div>{[sonuc.musteri.city, sonuc.musteri.district].filter(Boolean).join(' / ') || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>İLETİŞİM</div>
                  <div>{sonuc.musteri.phone || sonuc.musteri.email || '—'}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={sifirla}>Temizle</button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={kapat}>Kapat</button>
            <button type="button" className="btn btn-success btn-sm" onClick={ekle}
              disabled={!bulundu || zatenVar || ekliyor}
              title={zatenVar ? 'Bu mükellef zaten portföyünüzde.' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
              <Plus size={13} /> {ekliyor ? 'Ekleniyor...' : 'İŞBEY Portföyüne Ekle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
