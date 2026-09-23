import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { Customer, Product, WaybillItem, WaybillType } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { CustomerSelectorModal } from '../../common/CustomerSelectorModal';
import { ProductSelectorModal } from '../../common/ProductSelectorModal';
import { QuickCustomerCreateModal } from '../../common/QuickCustomerCreateModal';
import { QuickProductCreateModal } from '../../common/QuickProductCreateModal';
import { Plus, Trash2, Truck, Search, Package, Building } from 'lucide-react';

interface WaybillModalProps {
  isOpen: boolean;
  onClose: () => void;
  waybillType?: WaybillType;
}

export const WaybillModal: React.FC<WaybillModalProps> = ({
  isOpen,
  onClose,
  waybillType = 'SALES_DESPATCH',
}) => {
  const { showToast } = useToast();
  const { triggerRefresh, openPrintModal } = useApp();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shipmentDate, setShipmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [carrierTitle, setCarrierTitle] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<WaybillItem[]>([]);

  // Modals state
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [isQuickProductOpen, setIsQuickProductOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setSelectedCustomer(null);
    setDate(new Date().toISOString().split('T')[0]);
    setShipmentDate(new Date().toISOString().split('T')[0]);
    setCarrierTitle('');
    setPlateNumber('');
    setDriverName('');
    setNotes('');
    setItems([]);
  };

  const handleAddProductToItems = (p: Product) => {
    const unitPrice = waybillType === 'SALES_DESPATCH' ? p.salePrice : p.purchasePrice;
    const lineTotal = unitPrice;

    const existingIndex = items.findIndex(it => it.productId === p.id);
    if (existingIndex >= 0) {
      const updated = [...items];
      const existing = updated[existingIndex];
      const newQty = (existing.quantity || 1) + 1;
      updated[existingIndex] = {
        ...existing,
        quantity: newQty,
        lineTotal: newQty * existing.unitPrice,
      };
      setItems(updated);
      showToast(`"${p.name}" miktarı artırıldı: ${newQty} ${p.unit}`, 'info');
      return;
    }

    const vRate = p.vatRate || 20;
    const newItem: WaybillItem = {
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      quantity: 1,
      unit: p.unit,
      unitPrice,
      discount1: 0,
      discount2: 0,
      vatRate: vRate,
      lineTotal,
      lineGrandTotal: lineTotal * (1 + vRate / 100),
    };
    setItems(prev => [...prev, newItem]);
    showToast(`"${p.name}" irsaliyeye eklendi.`, 'success');
  };


  const handleUpdateItem = (index: number, field: keyof WaybillItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    item.lineTotal = qty * price;

    updated[index] = item;
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const grandTotal = items.reduce((sum, it) => sum + it.lineTotal, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      showToast('Lütfen sevk edilecek cariyi seçiniz.', 'warning');
      setIsCustomerSelectorOpen(true);
      return;
    }
    if (items.length === 0) {
      showToast('En az bir ürün satırı eklemelisiniz.', 'warning');
      setIsProductSelectorOpen(true);
      return;
    }

    try {
      const res = await api.createWaybill({
        type: waybillType,
        customerId: selectedCustomer.id,
        date,
        shipmentDate,
        carrierTitle,
        plateNumber,
        driverName,
        notes,
        items,
      });

      if (res.success && res.waybill) {
        showToast(res.message, 'success');
        triggerRefresh();
        onClose();
        openPrintModal('WAYBILL', `Sevk İrsaliyesi (${res.waybill.waybillNo})`, res.waybill);
      }
    } catch (err: any) {
      showToast(err.message || 'İrsaliye kaydedilemedi.', 'error');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`🚚 Yeni ${waybillType === 'SALES_DESPATCH' ? 'Sevk İrsaliyesi (Müşteriye)' : 'Alış İrsaliyesi (Tedarikçiden)'} Oluştur`}
        size="full"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              💡 İrsaliye kaydedildiğinde ilgili ürünlerin stok çıkışı/girişi otomatik gerçekleşir.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                İptal
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSubmit}>
                <Truck size={14} />
                <span>İrsaliyeyi Kaydet & Yazdır</span>
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Üst Paneller */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
            {/* Cari Seçim */}
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={16} />
                  Sevk Edilecek Muhatap Cari
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setIsCustomerSelectorOpen(true)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    <Search size={13} /> Cari Seç
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsQuickCustomerOpen(true)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    <Plus size={13} /> Yeni Cari
                  </button>
                </div>
              </div>

              {selectedCustomer ? (
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {selectedCustomer.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Kod: <strong>{selectedCustomer.code}</strong> | Tel: {selectedCustomer.phone || '-'} | {selectedCustomer.city || 'Şehir Yok'}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setIsCustomerSelectorOpen(true)}
                  style={{
                    border: '2px dashed var(--border-color)',
                    borderRadius: '6px',
                    padding: '14px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Search size={20} style={{ margin: '0 auto 4px auto', opacity: 0.6 }} />
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>Cari Kart Seçmek İçin Tıklayın</div>
                </div>
              )}
            </div>

            {/* Tarihler & Lojistik */}
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label required">İrsaliye Tarihi</label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Fiili Sevk Tarihi</label>
                <input
                  type="date"
                  className="form-input"
                  value={shipmentDate}
                  onChange={e => setShipmentDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Taşıyıcı Firma / Araç</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Örn: Aras Kargo / Öz Mal"
                  value={carrierTitle}
                  onChange={e => setCarrierTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Araç Plakası / Şoför</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Örn: 34 ABC 123"
                  value={plateNumber}
                  onChange={e => setPlateNumber(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Kalemler Tablosu */}
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>Sevk Kalemleri ({items.length})</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setIsProductSelectorOpen(true)}>
                  <Package size={14} />
                  <span>📦 Ürünler Penceresinden Ekle</span>
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsQuickProductOpen(true)}>
                  <Plus size={14} />
                  <span>+ Yeni Ürün</span>
                </button>
              </div>
            </div>

            <table className="datagrid-table" style={{ width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '100px' }}>Stok Kodu</th>
                  <th>Mal / Malzeme Cinsi</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>Miktar</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Birim</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Birim Fiyat</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Tutar</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      İrsaliyeye malzeme eklemek için <strong>"Ürünler Penceresinden Ekle"</strong> butonuna tıklayın.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                        {item.productCode}
                      </td>
                      <td style={{ fontWeight: 600 }}>{item.productName}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '12px' }}
                          value={item.quantity}
                          onChange={e => handleUpdateItem(idx, 'quantity', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>{item.unit}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          style={{ width: '100%', padding: '4px', textAlign: 'right', fontSize: '12px' }}
                          value={item.unitPrice}
                          onChange={e => handleUpdateItem(idx, 'unitPrice', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {item.lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="form-group" style={{ flex: 1, maxWidth: '500px' }}>
              <label className="form-label">İrsaliye Özel Notu / Teslimat Açıklaması</label>
              <input
                type="text"
                className="form-input"
                placeholder="Örn: Saat 14:00'e kadar arka kapıdan teslim edilecek."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <div style={{ background: 'var(--bg-surface-secondary)', padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Toplam Sevk Tutarı</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>
                {grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Ortak Modallar */}
      <CustomerSelectorModal
        isOpen={isCustomerSelectorOpen}
        onClose={() => setIsCustomerSelectorOpen(false)}
        onSelect={cust => setSelectedCustomer(cust)}
        filterType={waybillType === 'PURCHASE_DESPATCH' ? 'SUPPLIER' : 'CUSTOMER'}
      />

      <ProductSelectorModal
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onSelect={handleAddProductToItems}
        priceType={waybillType === 'PURCHASE_DESPATCH' ? 'PURCHASE' : 'SALE'}
      />

      <QuickCustomerCreateModal
        isOpen={isQuickCustomerOpen}
        onClose={() => setIsQuickCustomerOpen(false)}
        onCustomerCreated={cust => setSelectedCustomer(cust)}
        defaultType={waybillType === 'PURCHASE_DESPATCH' ? 'SUPPLIER' : 'CUSTOMER'}
      />

      <QuickProductCreateModal
        isOpen={isQuickProductOpen}
        onClose={() => setIsQuickProductOpen(false)}
        onProductCreated={handleAddProductToItems}
      />
    </>
  );
};

