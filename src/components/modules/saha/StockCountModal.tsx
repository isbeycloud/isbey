import React, { useState, useEffect } from 'react';
import {
  X,
  Scan,
  Package,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Building,
  Save,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { Product, StockCountItem } from '../../../types';

interface StockCountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const StockCountModal: React.FC<StockCountModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<StockCountItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('wh-merkez');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    try {
      const res = await api.getProducts();
      if (res.success) setProducts(res.products || []);
    } catch {
      // ignore
    }
  };

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const matched = products.find(
      p => p.barcode === barcodeInput.trim() || p.code.toLowerCase() === barcodeInput.trim().toLowerCase()
    );

    if (matched) {
      const existingIdx = items.findIndex(i => i.productId === matched.id);
      if (existingIdx >= 0) {
        const updated = [...items];
        updated[existingIdx].countedQuantity += 1;
        updated[existingIdx].variance = updated[existingIdx].countedQuantity - updated[existingIdx].systemQuantity;
        setItems(updated);
      } else {
        setItems([
          ...items,
          {
            productId: matched.id,
            productCode: matched.code,
            productName: matched.name,
            barcode: matched.barcode || matched.code,
            systemQuantity: matched.currentStock || 0,
            countedQuantity: 1,
            variance: 1 - (matched.currentStock || 0),
            unit: matched.unit || 'ADET',
          },
        ]);
      }
      setBarcodeInput('');
      showToast(`Ürün okutuldu: ${matched.name}`, 'success');
    } else {
      showToast('Barkod veritabanında bulunamadı.', 'error');
    }
  };

  const handleUpdateCount = (productId: string, val: number) => {
    const updated = items.map(i => {
      if (i.productId === productId) {
        const counted = Math.max(0, val);
        return {
          ...i,
          countedQuantity: counted,
          variance: counted - i.systemQuantity,
        };
      }
      return i;
    });
    setItems(updated);
  };

  const handleRemove = (productId: string) => {
    setItems(items.filter(i => i.productId !== productId));
  };

  const handleSubmitCount = async () => {
    if (items.length === 0) {
      showToast('Lütfen en az bir ürün okutunuz.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // Sync through mobile sync engine
      const res = await api.syncMobileData({
        operations: [
          {
            clientTransactionId: `stk-cnt-${Date.now()}`,
            operationType: 'STOCK_COUNT',
            payload: {
              warehouseId: selectedWarehouseId,
              warehouseName: selectedWarehouseId === 'wh-merkez' ? 'Merkez Depo' : 'Şube Depo',
              items,
              notes: 'Mobil kamera barkod sayımı tamamlandı.',
            },
            clientTimestamp: new Date().toISOString(),
          },
        ],
      });

      if (res.success) {
        showToast('Depo stok sayımı başarıyla kaydedildi ve senkronize edildi.', 'success');
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Sayım kaydedilemedi.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // 2026-09-13: Karartma rengi satır içi koyu-lacivert yerine .modal-overlay sınıfından
  // gelir; sınıf zaten açık tema karartmasını tanımlar. Satır içi blur da kaldırıldı,
  // çünkü index.css'te glassmorphism efekti tasarımdan çıkarılmıştı.
  return (
    <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '95vw', maxWidth: '640px', maxHeight: '90vh', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scan size={22} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Mobil Barkodlu Stok Sayımı</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Depo ve Barkod Okuyucu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Sayım Yapılan Depo</label>
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
            >
              <option value="wh-merkez">Merkez Ana Depo</option>
              <option value="wh-sube">Kadıköy Şube Deposu</option>
              <option value="wh-saha">Saha Araç Deposu</option>
            </select>
          </div>

          <form onSubmit={handleBarcodeScan} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Barkod okutun veya ürün kodu yazıp Enter'a basın..."
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              autoFocus
              style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-surface-secondary)', border: '2px solid var(--info)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)', fontWeight: 600 }}
            />
            <button
              type="submit"
              style={{ padding: '0 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              Ekle
            </button>
          </form>
        </div>

        {/* Sayılan Ürünler Listesi */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '10px', marginBottom: '16px' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
              Henüz ürün okutulmadı. Barkod okuyucu veya kamera ile ürün ekleyebilirsiniz.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map(item => (
                <div key={item.productId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm, 6px)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}>{item.productName}</div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>Kod: {item.productCode} | Sistem: {item.systemQuantity} {item.unit}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>Sayılan:</span>
                      <input
                        type="number"
                        min="0"
                        value={item.countedQuantity}
                        onChange={e => handleUpdateCount(item.productId, Number(e.target.value))}
                        style={{ width: '60px', padding: '4px 6px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs, 4px)', color: 'var(--info)', fontWeight: 700, textAlign: 'center' }}
                      />
                    </div>

                    <div style={{ width: '65px', textAlign: 'right', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: item.variance === 0 ? 'var(--success)' : item.variance > 0 ? 'var(--info)' : 'var(--danger)' }}>
                      {item.variance > 0 ? `+${item.variance}` : item.variance} {item.unit}
                    </div>

                    <button
                      onClick={() => handleRemove(item.productId)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alt Butonlar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
            Toplam <b>{items.length}</b> çeşit ürün sayıldı.
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}
            >
              İptal
            </button>
            <button
              onClick={handleSubmitCount}
              disabled={isSubmitting || items.length === 0}
              style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Sayımı Onayla & Bitir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
