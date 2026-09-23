import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { Product, Warehouse } from '../../../types';
import { api } from '../../../services/api';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { ArrowRightLeft } from 'lucide-react';

interface WarehouseTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WarehouseTransferModal: React.FC<WarehouseTransferModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [productId, setProductId] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [quantity, setQuantity] = useState<number | string>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadMeta();
    }
  }, [isOpen]);

  const loadMeta = async () => {
    try {
      const [pRes, mRes] = await Promise.all([api.getProducts(), api.getProductMeta()]);
      if (pRes.success) {
        setProducts(pRes.products);
        if (pRes.products.length > 0) setProductId(pRes.products[0].id);
      }
      if (mRes.success && mRes.warehouses.length >= 2) {
        setWarehouses(mRes.warehouses);
        setFromWarehouseId(mRes.warehouses[0].id);
        setToWarehouseId(mRes.warehouses[1].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectedProduct = products.find(p => p.id === productId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!productId || fromWarehouseId === toWarehouseId || qty <= 0) {
      showToast('Lütfen geçerli bir ürün, farklı kaynak/hedef depoları ve miktar giriniz.', 'warning');
      return;
    }

    try {
      const res = await api.transferStock({
        productId,
        fromWarehouseId,
        toWarehouseId,
        quantity: qty,
        notes,
      });

      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Transfer başarısız oldu.', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Depolar Arası Stok Transferi (Virman)"
      size="medium"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            İptal
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            <ArrowRightLeft size={14} />
            <span>Transferi Tamamla</span>
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label required">Transfer Edilecek Ürün</label>
          <select
            className="form-select"
            required
            value={productId}
            onChange={e => setProductId(e.target.value)}
          >
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code}) - Mevcut: {p.currentStock} {p.unit}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label required">Kaynak Depo (Çıkış)</label>
            <select
              className="form-select"
              value={fromWarehouseId}
              onChange={e => setFromWarehouseId(e.target.value)}
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label required">Hedef Depo (Giriş)</label>
            <select
              className="form-select"
              value={toWarehouseId}
              onChange={e => setToWarehouseId(e.target.value)}
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label required">Transfer Edilecek Miktar ({selectedProduct?.unit || 'Adet'})</label>
          <input
            type="number"
            min="1"
            max={selectedProduct?.currentStock}
            className="form-input"
            required
            placeholder="1"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            style={{ fontSize: '16px', fontWeight: 'bold' }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Transfer Açıklaması / Sevk Notu</label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: Şube ikmali, acil sevkiyat transferi"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
};
