import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { Product, Warehouse } from '../../../types';
import { api } from '../../../services/api';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
}

export const StockMovementModal: React.FC<StockMovementModalProps> = ({ isOpen, onClose, product }) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [productId, setProductId] = useState(product?.id || '');
  const [warehouseId, setWarehouseId] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = useState<number | string>('');
  const [unitPrice, setUnitPrice] = useState<number | string>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadMeta();
      if (product) {
        setProductId(product.id);
        setUnitPrice(product.purchasePrice);
      }
    }
  }, [isOpen, product]);

  const loadMeta = async () => {
    try {
      const [pRes, mRes] = await Promise.all([api.getProducts(), api.getProductMeta()]);
      if (pRes.success) setProducts(pRes.products);
      if (mRes.success) {
        setWarehouses(mRes.warehouses);
        if (mRes.warehouses.length > 0) setWarehouseId(mRes.warehouses[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectedProduct = products.find(p => p.id === productId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!productId || qty <= 0) {
      showToast('Lütfen geçerli bir ürün ve miktar giriniz.', 'warning');
      return;
    }

    try {
      const res = await api.adjustStock({
        productId,
        warehouseId,
        type: direction,
        quantity: qty,
        unitPrice: Number(unitPrice) || selectedProduct?.purchasePrice || 0,
        notes,
      });

      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Stok hareketi işlenemedi.', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={direction === 'IN' ? 'Manuel Stok Girişi (Mal Girişi / Sayım Artışı)' : 'Manuel Stok Çıkışı (Zayi / İade / Düzeltme)'}
      size="medium"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            İptal
          </button>
          <button
            type="button"
            className={`btn ${direction === 'IN' ? 'btn-success' : 'btn-danger'}`}
            onClick={handleSubmit}
          >
            {direction === 'IN' ? 'Stok Girişini Kaydet' : 'Stok Çıkışını Kaydet'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label required">İşlem Yönü</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn ${direction === 'IN' ? 'btn-success' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setDirection('IN')}
            >
              (+) Stok Girişi
            </button>
            <button
              type="button"
              className={`btn ${direction === 'OUT' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setDirection('OUT')}
            >
              (-) Stok Çıkışı
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label required">Ürün / Stok Kartı</label>
          <select
            className="form-select"
            required
            value={productId}
            onChange={e => {
              setProductId(e.target.value);
              const p = products.find(x => x.id === e.target.value);
              if (p) setUnitPrice(p.purchasePrice);
            }}
          >
            <option value="">-- Ürün Seçiniz --</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code}) - Mevcut Stok: {p.currentStock} {p.unit}
              </option>
            ))}
          </select>
        </div>

        {selectedProduct && (
          <div style={{ background: 'var(--bg-surface-secondary)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Mevcut Stok: <strong>{selectedProduct.currentStock} {selectedProduct.unit}</strong></span>
            <span>Kritik Eşik: <strong>{selectedProduct.criticalStock} {selectedProduct.unit}</strong></span>
          </div>
        )}

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label required">Miktar</label>
            <input
              type="number"
              min="1"
              className="form-input"
              required
              placeholder="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              style={{ fontSize: '16px', fontWeight: 'bold' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Birim Maliyet (TL)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={unitPrice}
              onChange={e => setUnitPrice(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label required">Depo</label>
          <select
            className="form-select"
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Açıklama / Belge Referansı</label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: Yıl sonu sayım farkı, hasarlı ürün fire kaydı"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
};
