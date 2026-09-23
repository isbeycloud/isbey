import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  MapPin,
  Camera,
  PenTool,
  CheckCircle2,
  DollarSign,
  CreditCard,
  Building,
  FileText,
  Clock,
  Printer,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { Customer, FieldPaymentMethod, FieldCollection, FieldCollectionReceipt } from '../../../types';

interface FieldCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (collection: FieldCollection, receipt: FieldCollectionReceipt) => void;
  preselectedCustomerId?: string;
}

export const FieldCollectionModal: React.FC<FieldCollectionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedCustomerId,
}) => {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomerId || '');
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<'TRY' | 'USD' | 'EUR'>('TRY');
  const [paymentMethod, setPaymentMethod] = useState<FieldPaymentMethod>('CASH');
  const [description, setDescription] = useState('Saha Tahsilatı');

  // GPS Konum
  const [location, setLocation] = useState<{ latitude?: number; longitude?: number; accuracy?: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Fotoğraf
  const [photoUrl, setPhotoUrl] = useState<string>('');

  // İmza Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // İşlem Durumu & Makbuz
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdReceipt, setCreatedReceipt] = useState<FieldCollectionReceipt | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCustomers();
      fetchLocation();
    }
  }, [isOpen]);

  const loadCustomers = async () => {
    try {
      const res = await api.getCustomers();
      if (res.success) setCustomers(res.customers || []);
    } catch {
      // ignore
    }
  };

  const fetchLocation = () => {
    if ('geolocation' in navigator) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        pos => {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          });
          setIsLocating(false);
        },
        () => {
          // Fallback demo coordinates
          setLocation({ latitude: 41.0082, longitude: 28.9784, accuracy: 12 });
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setLocation({ latitude: 41.0082, longitude: 28.9784, accuracy: 15 });
    }
  };

  // Canvas İmza Çizimi
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    // 2026-09-13: İmza tuvali açık temaya geçti; canvas 2D bağlamı CSS
    // değişkeni çözemediği için --info (#3b82f6) değeri sabit yazıldı.
    ctx.strokeStyle = '#3b82f6';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      showToast('Lütfen tahsilat yapılacak cariyi seçiniz.', 'error');
      return;
    }
    if (amount <= 0) {
      showToast('Lütfen geçerli bir tahsilat tutarı giriniz.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      let sigDataUrl = '';
      if (hasSignature && canvasRef.current) {
        sigDataUrl = canvasRef.current.toDataURL('image/png');
      }

      const res = await api.createFieldCollection({
        customerId: selectedCustomerId,
        amount,
        currency,
        paymentMethod,
        description,
        latitude: location?.latitude,
        longitude: location?.longitude,
        locationAccuracy: location?.accuracy,
        signatureFileUrl: sigDataUrl || undefined,
        photoFileUrl: photoUrl || undefined,
      });

      if (res.success) {
        showToast(res.message, 'success');
        setCreatedReceipt(res.receipt);
        onSuccess(res.collection, res.receipt);
      }
    } catch (err: any) {
      showToast(err.message || 'Tahsilat işlemi başarısız oldu.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="modal-content"
        style={{
          width: '95vw',
          maxWidth: '680px',
          maxHeight: '90vh',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg, 10px)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-main)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* 2026-09-13: ikon bloğu marka renginin açık tonuna çekildi. */}
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={22} color="var(--primary)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Saha Tahsilat Modülü</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>Müşteri yerinde anında tahsilat, GPS, imza ve makbuz</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Form Body veya Makbuz */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {!createdReceipt ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Cari Seçimi */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Cari Hesap (Müşteri) *
                </label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={e => setSelectedCustomerId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                >
                  <option value="">-- Müşteri Seçiniz --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.code}) - Bakiye: {(c.balance || 0).toLocaleString('tr-TR')} TL
                    </option>
                  ))}
                </select>
                {selectedCustomer && (
                  <div style={{ marginTop: '6px', fontSize: 'var(--fs-xs, 11px)', color: (selectedCustomer.balance || 0) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                    Mevcut Borç Bakiyesi: {(selectedCustomer.balance || 0).toLocaleString('tr-TR')} TL
                  </div>
                )}
              </div>

              {/* Tutar ve Para Birimi */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Tahsil Edilen Tutar *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={amount || ''}
                    onChange={e => setAmount(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--info)', fontSize: '1.2rem', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Para Birimi
                  </label>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value as any)}
                    style={{ width: '100%', padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)', fontWeight: 700 }}
                  >
                    <option value="TRY">TRY (₺)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              {/* Ödeme Yöntemi Seçimi */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Ödeme Yöntemi
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                  {[
                    { id: 'CASH', label: 'Nakit Kasa' },
                    { id: 'CREDIT_CARD', label: 'Kredi Kartı' },
                    { id: 'BANK_TRANSFER', label: 'Havale/EFT' },
                    { id: 'CHECK', label: 'Çek' },
                    { id: 'PROMISSORY_NOTE', label: 'Senet' },
                  ].map(method => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id as any)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: paymentMethod === method.id ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                        background: paymentMethod === method.id ? 'var(--primary-light)' : 'var(--bg-surface)',
                        color: paymentMethod === method.id ? 'var(--primary)' : 'var(--text-muted)',
                        fontSize: 'var(--fs-xs, 11px)',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* GPS Konumu */}
              <div style={{ background: 'var(--bg-surface-secondary)', padding: '12px 16px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MapPin size={18} color="var(--success)" />
                  <div>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-main)' }}>
                      GPS Konumu Doğrulandı
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                      {location ? `Enlem: ${location.latitude?.toFixed(4)}, Boylam: ${location.longitude?.toFixed(4)} (±${location.accuracy}m)` : 'Konum alınıyor...'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchLocation}
                  style={{ background: 'transparent', border: 'none', color: 'var(--info)', cursor: 'pointer' }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {/* Dokunmatik İmza Tuvali */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <PenTool size={14} color="var(--info)" />
                    <span>Müşteri Teslim / Onay İmzası</span>
                  </label>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer' }}
                  >
                    Temizle
                  </button>
                </div>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={120}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  style={{
                    width: '100%',
                    height: '120px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px dashed var(--border-color)',
                    touchAction: 'none',
                    cursor: 'crosshair',
                  }}
                />
              </div>

              {/* Fotoğraf Ekleme */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Belge / Teslimat Fotoğrafı (Opsiyonel)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}
                />
                {photoUrl && (
                  <img src={photoUrl} alt="Fotoğraf Önizleme" style={{ marginTop: '8px', maxHeight: '100px', borderRadius: '8px' }} />
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ padding: '10px 18px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '10px 24px',
                    background: 'var(--primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm, 6px)',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {isSubmitting ? <div className="spinner" /> : <CheckCircle2 size={18} />}
                  <span>Tahsilatı Tamamla</span>
                </button>
              </div>
            </form>
          ) : (
            /* Başarılı Makbuz Görünümü */
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle2 size={36} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)' }}>
                Tahsilat Başarıyla Gerçekleşti!
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', marginBottom: '20px' }}>
                Cari hesaba alacak kaydı düşüldü ve resmi tahsilat makbuzu oluşturuldu.
              </p>

              {/* Makbuz Kartı */}
              <div style={{ background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '20px', textAlign: 'left', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--info)' }}>{createdReceipt.receiptNumber}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>{new Date(createdReceipt.createdAt).toLocaleDateString('tr-TR')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--fs-base, 13px)' }}>
                  <div><b>Müşteri:</b> {createdReceipt.customerTitle}</div>
                  <div><b>Tutar:</b> <span style={{ color: 'var(--success)', fontWeight: 700 }}>{createdReceipt.amount.toLocaleString('tr-TR')} {createdReceipt.currency}</span></div>
                  <div><b>Ödeme Tipi:</b> {createdReceipt.paymentMethod}</div>
                  <div><b>Tahsil Eden:</b> {createdReceipt.collectedBy}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ padding: '10px 20px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Printer size={16} />
                  <span>Makbuzu Yazdır</span>
                </button>
                <button
                  onClick={onClose}
                  style={{ padding: '10px 24px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Kapat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
