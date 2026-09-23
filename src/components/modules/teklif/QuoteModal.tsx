import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { Customer, Product, QuoteItem } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { CustomerSelectorModal } from '../../common/CustomerSelectorModal';
import { ProductSelectorModal } from '../../common/ProductSelectorModal';
import { QuickCustomerCreateModal } from '../../common/QuickCustomerCreateModal';
import { QuickProductCreateModal } from '../../common/QuickProductCreateModal';
import { Plus, Trash2, Search, Package, Building } from 'lucide-react';

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteType?: 'SALES_QUOTE' | 'PURCHASE_QUOTE';
}

export const QuoteModal: React.FC<QuoteModalProps> = ({
  isOpen,
  onClose,
  quoteType = 'SALES_QUOTE',
}) => {
  const { showToast } = useToast();
  const { triggerRefresh, openPrintModal } = useApp();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]
  );
  const [termsAndConditions, setTermsAndConditions] = useState(
    '1. Fiyatlarımıza KDV dahildir.\n2. Teklifimiz 15 gün süreyle geçerlidir.\n3. Ödeme peşin veya 30 gün vadeli çek ile yapılacaktır.'
  );
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([]);

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
    setValidUntil(new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]);
    setNotes('');
    setItems([]);
  };

  const handleAddProductToItems = (p: Product) => {
    const unitPrice = quoteType === 'SALES_QUOTE' ? p.salePrice : p.purchasePrice;
    const vatRate = p.vatRate || 20;
    const lineTotal = unitPrice;
    const vatAmount = lineTotal * (vatRate / 100);

    const existingIndex = items.findIndex(it => it.productId === p.id);
    if (existingIndex >= 0) {
      const updated = [...items];
      const existing = updated[existingIndex];
      const newQty = (existing.quantity || 1) + 1;
      const base = newQty * existing.unitPrice;
      const discounted = base * (1 - (existing.discount1 || 0) / 100);
      const vAmount = discounted * (existing.vatRate / 100);
      updated[existingIndex] = {
        ...existing,
        quantity: newQty,
        lineTotal: discounted,
        vatAmount: vAmount,
        lineGrandTotal: discounted + vAmount,
      };
      setItems(updated);
      showToast(`"${p.name}" miktarı artırıldı: ${newQty} ${p.unit}`, 'info');
      return;
    }

    const newItem: QuoteItem = {
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      quantity: 1,
      unit: p.unit,
      unitPrice,
      discount1: 0,
      discount2: 0,
      vatRate,
      vatAmount,
      lineTotal,
      lineGrandTotal: lineTotal + vatAmount,
    };
    setItems(prev => [...prev, newItem]);
    showToast(`"${p.name}" teklife eklendi.`, 'success');
  };

  const handleUpdateItem = (index: number, field: keyof QuoteItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    const d1 = Number(item.discount1) || 0;
    const d2 = Number(item.discount2) || 0;
    const vatRate = Number(item.vatRate) || 0;

    const base = qty * price;
    const afterD1 = base * (1 - d1 / 100);
    const afterD2 = afterD1 * (1 - d2 / 100);
    const lineTotal = afterD2;
    const vatAmount = lineTotal * (vatRate / 100);

    item.lineTotal = lineTotal;
    item.vatAmount = vatAmount;
    item.lineGrandTotal = lineTotal + vatAmount;

    updated[index] = item;
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subTotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const totalDiscount = items.reduce((sum, it) => sum + ((it.quantity * it.unitPrice) - it.lineTotal), 0);
  const totalVat = items.reduce((sum, it) => sum + it.vatAmount, 0);
  const grandTotal = subTotal - totalDiscount + totalVat;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      showToast('Lütfen teklif verilecek cariyi seçiniz.', 'warning');
      setIsCustomerSelectorOpen(true);
      return;
    }
    if (items.length === 0) {
      showToast('En az bir ürün kalemi eklemelisiniz.', 'warning');
      setIsProductSelectorOpen(true);
      return;
    }

    try {
      const res = await api.createQuote({
        type: quoteType,
        customerId: selectedCustomer.id,
        date,
        validUntil,
        termsAndConditions,
        notes,
        items,
      });

      if (res.success && res.quote) {
        showToast(res.message, 'success');
        triggerRefresh();
        onClose();
        openPrintModal('QUOTE', `Fiyat Teklifi (${res.quote.quoteNo})`, res.quote);
      }
    } catch (err: any) {
      showToast(err.message || 'Teklif kaydedilemedi.', 'error');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`📄 Yeni ${quoteType === 'SALES_QUOTE' ? 'Satış Teklifi (Müşteriye)' : 'Alış Teklifi (Tedarikçiden)'} Hazırla`}
        size="full"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              💡 Merkezi Cari ve Ürün pencereleri ile tek tıkla teklif oluşturun.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                İptal
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSubmit}>
                Teklifi Kaydet & Yazdır
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Cari & Tarih Paneli */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px' }}>
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={16} />
                  Muhatap Cari Kart
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

            {/* Tarihler & Proje Notu */}
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label required">Teklif Tarihi</label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Geçerlilik Tarihi</label>
                <input
                  type="date"
                  className="form-input"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Teklif Notu / Proje Başlığı</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Örn: 2026 Ofis Yenileme Paketi"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Kalemler Tablosu */}
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>Teklif Kalemleri ({items.length})</span>
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
                  <th>Ürün / Hizmet Açıklaması</th>
                  <th style={{ width: '85px', textAlign: 'center' }}>Miktar</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>Birim</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Birim Fiyat</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>İsk %</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>KDV %</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Net Tutar</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Toplam (KDV Dahil)</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      Teklif kalemi eklemek için yukarıdaki <strong>"Ürünler Penceresinden Ekle"</strong> butonuna tıklayın.
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
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="form-input"
                          style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '12px' }}
                          value={item.discount1}
                          onChange={e => handleUpdateItem(idx, 'discount1', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '12px' }}
                          value={item.vatRate}
                          onChange={e => handleUpdateItem(idx, 'vatRate', Number(e.target.value))}
                        >
                          <option value="0">%0</option>
                          <option value="1">%1</option>
                          <option value="10">%10</option>
                          <option value="20">%20</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {item.lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                        {item.lineGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
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

          {/* Şartname & Toplamlar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Teklif Şartnamesi & Genel Koşullar</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={termsAndConditions}
                onChange={e => setTermsAndConditions(e.target.value)}
              />
            </div>

            <div style={{ background: 'var(--bg-surface-secondary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span>Ara Toplam:</span>
                <strong>{subTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
              </div>
              {totalDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: '#ef4444' }}>
                  <span>Toplam İskonto:</span>
                  <strong>-{totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span>Toplam KDV:</span>
                <strong>+{totalVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: 'var(--primary)', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                <span>GENEL TOPLAM:</span>
                <span>{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
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
        filterType={quoteType === 'PURCHASE_QUOTE' ? 'SUPPLIER' : 'CUSTOMER'}
      />

      <ProductSelectorModal
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onSelect={handleAddProductToItems}
        priceType={quoteType === 'PURCHASE_QUOTE' ? 'PURCHASE' : 'SALE'}
      />

      <QuickCustomerCreateModal
        isOpen={isQuickCustomerOpen}
        onClose={() => setIsQuickCustomerOpen(false)}
        onCustomerCreated={cust => setSelectedCustomer(cust)}
        defaultType={quoteType === 'PURCHASE_QUOTE' ? 'SUPPLIER' : 'CUSTOMER'}
      />

      <QuickProductCreateModal
        isOpen={isQuickProductOpen}
        onClose={() => setIsQuickProductOpen(false)}
        onProductCreated={handleAddProductToItems}
      />
    </>
  );
};

