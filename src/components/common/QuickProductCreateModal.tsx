import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import type { Product, ProductGroup, Warehouse } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PackagePlus, Save, Barcode, Hash } from 'lucide-react';

interface QuickProductCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: (product: Product) => void;
  initialBarcode?: string;
  initialName?: string;
}

export const QuickProductCreateModal: React.FC<QuickProductCreateModalProps> = ({
  isOpen,
  onClose,
  onProductCreated,
  initialBarcode = '',
  initialName = '',
}) => {
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [groupId, setGroupId] = useState('');
  const [unit, setUnit] = useState('Adet');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>(0);
  const [salePrice, setSalePrice] = useState<number | ''>(0);
  const [vatRate, setVatRate] = useState<number>(20);
  const [criticalStock, setCriticalStock] = useState<number>(5);
  const [warehouseId, setWarehouseId] = useState('wh-1');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setBarcode(initialBarcode);
      setCode('STK-' + Date.now().toString().slice(-4));
      setPurchasePrice(0);
      setSalePrice(0);
      setVatRate(20);
      setCriticalStock(5);
      setDescription('');
      loadMeta();
    }
  }, [isOpen, initialBarcode, initialName]);

  const loadMeta = async () => {
    try {
      const res = await api.getProductMeta();
      if (res.success) {
        setGroups(res.groups);
        setWarehouses(res.warehouses);
        if (res.groups.length > 0) setGroupId(res.groups[0].id);
        if (res.warehouses.length > 0) setWarehouseId(res.warehouses[0].id);
      }
    } catch (err) {
      console.error('Error loading product meta:', err);
    }
  };

  const handleGenerateBarcode = () => {
    const randomEan = '869' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
    setBarcode(randomEan);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Lütfen ürün adını giriniz.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || 'STK-' + Date.now().toString().slice(-4),
        barcode: barcode.trim(),
        groupId: groupId || 'grp-1',
        unit,
        purchasePrice: Number(purchasePrice) || 0,
        salePrice: Number(salePrice) || 0,
        vatRate: Number(vatRate) || 20,
        criticalStock: Number(criticalStock) || 5,
        warehouseId: warehouseId || 'wh-1',
        description: description.trim(),
        imageUrl: imageUrl.trim() || undefined,
        initialStock: 0,
      };

      const res = await api.createProduct(payload);
      if (res.success && res.product) {
        showToast(`"${res.product.name}" başarıyla oluşturuldu ve seçildi.`, 'success');
        onProductCreated(res.product);
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Ürün oluşturulurken hata oluştu.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚡ Hızlı Yeni Ürün / Stok Kartı Ekle"
      size="medium"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ background: 'var(--primary-light)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PackagePlus size={18} color="var(--primary)" />
          <span style={{ fontSize: '12px', color: 'var(--text-main)' }}>
            Kaydettiğiniz yeni ürün otomatik olarak faturaya/belgeye aktarılacaktır.
          </span>
        </div>

        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 700 }}>
            Ürün / Hizmet Adı <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: 27 inç 144Hz IPS Monitör veya A4 Kağıdı"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Stok Kodu</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Hash size={15} color="var(--text-muted)" />
              <input
                type="text"
                className="form-input"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="STK-XXXX"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Barkod (EAN-13 / Code128)</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="form-input"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="8690000000000"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleGenerateBarcode}
                title="Otomatik Barkod Üret"
                style={{ whiteSpace: 'nowrap', padding: '0 8px' }}
              >
                <Barcode size={14} /> Üret
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Kategori / Grup</label>
            <select
              className="form-select"
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
              {groups.length === 0 && <option value="grp-1">Genel</option>}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Birim</label>
            <select
              className="form-select"
              value={unit}
              onChange={e => setUnit(e.target.value)}
            >
              <option value="Adet">Adet</option>
              <option value="Koli">Koli</option>
              <option value="Paket">Paket</option>
              <option value="Kg">Kg</option>
              <option value="Metre">Metre</option>
              <option value="Litre">Litre</option>
              <option value="Hizmet">Hizmet</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">KDV Oranı (%)</label>
            <select
              className="form-select"
              value={vatRate}
              onChange={e => setVatRate(Number(e.target.value))}
            >
              <option value={20}>%20 (Standart)</option>
              <option value={10}>%10 (Gıda vb.)</option>
              <option value={1}>%1 (Özel)</option>
              <option value={0}>%0 (Muaf)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Alış Fiyatı (KDV Hariç)</label>
            <input
              type="number"
              className="form-input"
              step="0.01"
              min="0"
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0.00"
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700, color: 'var(--primary)' }}>
              Satış Fiyatı (KDV Hariç)
            </label>
            <input
              type="number"
              className="form-input"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={e => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0.00"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Kritik Stok Uyarısı</label>
            <input
              type="number"
              className="form-input"
              min="0"
              value={criticalStock}
              onChange={e => setCriticalStock(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Giriş Yapılacak Varsayılan Depo</label>
          <select
            className="form-select"
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
            ))}
            {warehouses.length === 0 && <option value="wh-1">Merkez Depo</option>}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Ürün Görseli (URL)</label>
          <input
            type="url"
            className="form-input"
            placeholder="https://images.unsplash.com/... (İsteğe bağlı)"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            İptal
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <Save size={16} />
            <span>{submitting ? 'Kaydediliyor...' : 'Kaydet ve Belgeye Ekle'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
