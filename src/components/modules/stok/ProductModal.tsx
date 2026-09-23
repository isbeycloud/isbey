import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { Product, ProductGroup, Warehouse } from '../../../types';
import { api } from '../../../services/api';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { RefreshCw } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
}

export const ProductModal: React.FC<ProductModalProps> = ({ isOpen, onClose, productToEdit }) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [formData, setFormData] = useState({
    code: '',
    barcode: '',
    name: '',
    groupId: '',
    unit: 'Adet',
    purchasePrice: 0,
    salePrice: 0,
    vatRate: 20,
    criticalStock: 5,
    initialStock: 0,
    warehouseId: '',
    description: '',
    imageUrl: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadMeta();
      if (productToEdit) {
        setFormData({
          code: productToEdit.code,
          barcode: productToEdit.barcode,
          name: productToEdit.name,
          groupId: productToEdit.groupId,
          unit: productToEdit.unit,
          purchasePrice: productToEdit.purchasePrice,
          salePrice: productToEdit.salePrice,
          vatRate: productToEdit.vatRate,
          criticalStock: productToEdit.criticalStock,
          initialStock: productToEdit.currentStock,
          warehouseId: productToEdit.warehouseId,
          description: productToEdit.description || '',
          imageUrl: productToEdit.imageUrl || '',
        });
      } else {
        generateRandomBarcode();
      }
    }
  }, [isOpen, productToEdit]);

  const loadMeta = async () => {
    try {
      const res = await api.getProductMeta();
      if (res.success) {
        setGroups(res.groups);
        setWarehouses(res.warehouses);
        if (!productToEdit) {
          setFormData(prev => ({
            ...prev,
            groupId: res.groups[0]?.id || '',
            warehouseId: res.warehouses[0]?.id || '',
          }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const generateRandomBarcode = () => {
    const random10 = Math.floor(1000000000 + Math.random() * 9000000000);
    setFormData(prev => ({ ...prev, barcode: `869${random10}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Lütfen ürün adını giriniz.', 'warning');
      return;
    }

    try {
      if (productToEdit) {
        const res = await api.updateProduct(productToEdit.id, formData);
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      } else {
        const res = await api.createProduct(formData);
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Ürün kaydedilemedi.', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={productToEdit ? `Stok Kartı Düzenle: ${productToEdit.name}` : 'Yeni Stok Kartı Oluştur'}
      size="large"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            İptal
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            {productToEdit ? 'Güncelle' : 'Kaydet'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-grid-3">
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label required">Ürün / Hizmet Adı</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Örn: 27 inç IPS Monitör"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Stok Kodu</label>
            <input
              type="text"
              className="form-input"
              placeholder="Otomatik: STK-00X"
              value={formData.code}
              onChange={e => setFormData({ ...formData, code: e.target.value })}
            />
          </div>
        </div>

        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label">Barkod (EAN-13)</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="8690000000000"
                value={formData.barcode}
                onChange={e => setFormData({ ...formData, barcode: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={generateRandomBarcode}
                title="Yeni Barkod Üret"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label required">Ürün Grubu / Kategori</label>
            <select
              className="form-select"
              value={formData.groupId}
              onChange={e => setFormData({ ...formData, groupId: e.target.value })}
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label required">Birim</label>
            <select
              className="form-select"
              value={formData.unit}
              onChange={e => setFormData({ ...formData, unit: e.target.value })}
            >
              <option value="Adet">Adet</option>
              <option value="Koli">Koli</option>
              <option value="Kg">Kg</option>
              <option value="Paket">Paket</option>
              <option value="Metre">Metre</option>
              <option value="Litre">Litre</option>
            </select>
          </div>
        </div>

        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label">Alış Fiyatı (TL)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={formData.purchasePrice}
              onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
            />
          </div>

          <div className="form-group">
            <label className="form-label required">Satış Fiyatı (TL)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              required
              value={formData.salePrice}
              onChange={e => setFormData({ ...formData, salePrice: Number(e.target.value) })}
              style={{ fontWeight: 'bold', color: 'var(--primary)' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label required">KDV Oranı</label>
            <select
              className="form-select"
              value={formData.vatRate}
              onChange={e => setFormData({ ...formData, vatRate: Number(e.target.value) })}
            >
              <option value="0">%0</option>
              <option value="1">%1</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
          </div>
        </div>

        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label">Kritik Stok Uyarısı</label>
            <input
              type="number"
              className="form-input"
              value={formData.criticalStock}
              onChange={e => setFormData({ ...formData, criticalStock: Number(e.target.value) })}
            />
          </div>

          {!productToEdit && (
            <div className="form-group">
              <label className="form-label">Açılış Devir Stoğu</label>
              <input
                type="number"
                className="form-input"
                value={formData.initialStock}
                onChange={e => setFormData({ ...formData, initialStock: Number(e.target.value) })}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Bulunduğu Depo</label>
            <select
              className="form-select"
              value={formData.warehouseId}
              onChange={e => setFormData({ ...formData, warehouseId: e.target.value })}
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
          <label className="form-label">Ürün Görseli (URL)</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {formData.imageUrl ? (
              <img
                src={formData.imageUrl}
                alt="Önizleme"
                style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
            ) : null}
            <input
              type="url"
              className="form-input"
              placeholder="https://images.unsplash.com/... (İsteğe bağlı)"
              value={formData.imageUrl}
              onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Ürün Açıklaması / Özellikler</label>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder="Teknik özellikler, model veya raf bilgisi"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
      </form>
    </Modal>
  );
};
