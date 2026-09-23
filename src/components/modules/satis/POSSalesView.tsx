import React, { useState, useEffect, useRef } from 'react';
import {
  Barcode,
  Search,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  CreditCard,
  DollarSign,
  User,
  ShoppingBag,
  UserPlus,
  ChevronDown,
  Building,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { Product, Customer, InvoiceItem } from '../../../types';
import { api } from '../../../services/api';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { soundFX } from '../../../utils/sound';
import { CustomerSelectorModal } from '../../common/CustomerSelectorModal';
import { QuickCustomerCreateModal } from '../../common/QuickCustomerCreateModal';
import { ProductImageEditModal } from '../../common/ProductImageEditModal';


export const POSSalesView: React.FC = () => {
  const { showToast } = useToast();
  const { openPrintModal, triggerRefresh } = useApp();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [isQuickCustomerCreateOpen, setIsQuickCustomerCreateOpen] = useState(false);
  const [editingImageProduct, setEditingImageProduct] = useState<Product | null>(null);

  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [basket, setBasket] = useState<InvoiceItem[]>([]);

  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT_CARD' | 'OPEN_ACCOUNT'>('CASH');
  const [tenderedAmount, setTenderedAmount] = useState<number | string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    focusBarcodeInput();
  }, []);

  // F2: Hızlı Cari Seçiciyi Aç
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setIsCustomerSelectorOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadData = async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        api.getProducts(),
        api.getCustomers({ type: 'CUSTOMER' }),
      ]);
      if (pRes.success) setProducts(pRes.products);
      if (cRes.success) {
        setCustomers(cRes.customers);
        if (cRes.customers.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(cRes.customers[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null;

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    if (!customers.some(c => c.id === customer.id)) {
      setCustomers(prev => [customer, ...prev]);
    }
    setIsCustomerSelectorOpen(false);
    showToast(`Cari seçildi: ${customer.title}`, 'info');
    focusBarcodeInput();
  };

  const handleQuickCustomerCreated = (customer: Customer) => {
    setCustomers(prev => [customer, ...prev]);
    setSelectedCustomerId(customer.id);
    setIsQuickCustomerCreateOpen(false);
    showToast(`Yeni cari oluşturuldu ve seçildi: ${customer.title}`, 'success');
    focusBarcodeInput();
  };

  const handleProductImageUpdated = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const focusBarcodeInput = () => {
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  // Add Product to Basket (or increment if already exists)
  const addProductToBasket = (product: Product) => {
    soundFX.playBeep();
    if (product.currentStock <= 0) {
      showToast(`Uyarı: "${product.name}" için mevcut stok 0'dır!`, 'warning');
    }


    setBasket(prev => {
      const existingIndex = prev.findIndex(item => item.productId === product.id);
      if (existingIndex > -1) {
        // Increment quantity
        const updated = [...prev];
        const item = updated[existingIndex];
        const newQty = item.quantity + 1;
        const lineGross = newQty * item.unitPrice * (1 - item.discount1 / 100);
        const lineNet = lineGross / (1 + item.vatRate / 100);

        updated[existingIndex] = {
          ...item,
          quantity: newQty,
          lineTotal: Math.round(lineNet * 100) / 100,
          lineGrandTotal: Math.round(lineGross * 100) / 100,
        };
        return updated;
      } else {
        // Add new line
        const vatRate = product.vatRate || 20;
        const unitPrice = product.salePrice;
        const lineGross = unitPrice;
        const lineNet = lineGross / (1 + vatRate / 100);

        const newItem: InvoiceItem = {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          barcode: product.barcode,
          quantity: 1,
          unit: product.unit,
          unitPrice,
          discount1: 0,
          discount2: 0,
          discountAmount: 0,
          vatRate,
          vatAmount: Math.round((lineGross - lineNet) * 100) / 100,
          vatIncluded: true,
          lineTotal: Math.round(lineNet * 100) / 100,
          lineGrandTotal: Math.round(lineGross * 100) / 100,
        };
        return [...prev, newItem];
      }
    });

    showToast(`"${product.name}" sepete eklendi.`, 'success');
  };

  // Barcode enter trigger
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const query = barcodeInput.trim().toLowerCase();
    const product = products.find(
      p => p.barcode === query || p.code.toLowerCase() === query || p.name.toLowerCase().includes(query)
    );

    if (product) {
      addProductToBasket(product);
      setBarcodeInput('');
    } else {
      showToast(`"${barcodeInput}" barkoduna sahip ürün bulunamadı.`, 'error');
    }
  };

  const updateItemQuantity = (index: number, delta: number) => {
    setBasket(prev => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== index);
      }
      const lineGross = newQty * item.unitPrice * (1 - item.discount1 / 100);
      const lineNet = lineGross / (1 + item.vatRate / 100);
      updated[index] = {
        ...item,
        quantity: newQty,
        lineTotal: Math.round(lineNet * 100) / 100,
        lineGrandTotal: Math.round(lineGross * 100) / 100,
      };
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setBasket(prev => prev.filter((_, i) => i !== index));
  };

  // Basket calculations
  const grandTotal = basket.reduce((sum, item) => sum + item.lineGrandTotal, 0);
  const netTotal = basket.reduce((sum, item) => sum + item.lineTotal, 0);
  const totalVat = grandTotal - netTotal;

  const numTendered = Number(tenderedAmount) || grandTotal;
  const changeDue = Math.max(0, numTendered - grandTotal);

  // Complete Checkout
  const handleCompleteSale = async () => {
    if (basket.length === 0) {
      showToast('Lütfen sepete en az bir ürün ekleyiniz.', 'warning');
      return;
    }
    if (!selectedCustomerId) {
      showToast('Lütfen bir müşteri seçiniz.', 'warning');
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        type: 'RETAIL_POS',
        customerId: selectedCustomerId,
        items: basket,
        paymentType,
        paidAmount: paymentType === 'OPEN_ACCOUNT' ? 0 : grandTotal,
        date: new Date().toISOString().split('T')[0],
      };

      const res = await api.createInvoice(payload);
      if (res.success && res.invoice) {
        soundFX.playSuccess();
        // Confetti celebration
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch (e) {}


        showToast(`Satış tamamlandı! Fiş No: ${res.invoice.invoiceNo}`, 'success');

        // Automatically open thermal receipt preview
        openPrintModal('THERMAL_80MM', `POS Satış Fişi (${res.invoice.invoiceNo})`, res.invoice);

        // Reset basket
        setBasket([]);
        setTenderedAmount('');
        triggerRefresh();
        focusBarcodeInput();
      }
    } catch (err: any) {
      showToast(err.message || 'Satış kaydedilemedi.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = searchQuery.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery)
      )
    : products;

  return (
    <div className="view-content-container" style={{ padding: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px', height: 'calc(100vh - 180px)' }}>
        
        {/* SOL BÖLÜM: BARKOD GİRİŞİ & SEPET LİSTESİ */}
        <div className="card-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          
          {/* Barkod Giriş ve Gelişmiş Cari Seçim Çubuğu */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Barkod Alanı */}
            <form onSubmit={handleBarcodeSubmit} style={{ flex: 1, minWidth: '220px', display: 'flex', gap: '6px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Barcode size={18} color="var(--primary)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  className="form-input"
                  placeholder="Barkod Okutun veya Enter'a Basın..."
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  style={{ paddingLeft: '34px', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, height: '36px' }}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ height: '36px', padding: '0 14px' }}>
                <span>Ekle</span>
              </button>
            </form>

            <div style={{ width: '1px', height: '28px', background: 'var(--border-color)' }} />

            {/* Cari Seçici & Yeni Cari Ekleme Grubu */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Seçili Cari Kartı / Seç Butonu */}
              <div
                onClick={() => setIsCustomerSelectorOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  height: '36px',
                  minWidth: '200px',
                  maxWidth: '280px',
                  transition: 'all 0.15s ease',
                }}
                title="Cari Değiştir / Ara (F2)"
              >
                <div style={{
                  width: '24px', height: '24px', borderRadius: '4px',
                  background: 'var(--primary-light)', color: 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Building size={14} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedCustomer?.title || 'Cari Seçilmedi'}
                  </div>
                  <div style={{ fontSize: 'var(--fs-2xs, 10px)', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                    <span>{selectedCustomer?.code || '-'}</span>
                    {selectedCustomer && (
                      <span style={{ color: (selectedCustomer.balance || 0) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                        {Math.abs(selectedCustomer.balance || 0).toLocaleString('tr-TR')} ₺ {(selectedCustomer.balance || 0) > 0 ? '(B)' : '(A)'}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </div>

              {/* Yeni Cari Ekle Butonu */}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsQuickCustomerCreateOpen(true)}
                style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '4px', color: '#fff' }}
                title="Hızlı Yeni Cari Oluştur"
              >
                <UserPlus size={14} />
                <span>+ Yeni</span>
              </button>
            </div>
          </div>

          {/* Sepet Tablosu */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table className="datagrid-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th style={{ textAlign: 'center', width: '120px' }}>Miktar</th>
                  <th style={{ textAlign: 'right', width: '100px' }}>Birim Fiyat</th>
                  <th style={{ textAlign: 'right', width: '100px' }}>Toplam</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {basket.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                      <ShoppingBag size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                      <div style={{ fontSize: 'var(--fs-md, 14px)', fontWeight: 600 }}>Sepetiniz Boş</div>
                      <div style={{ fontSize: 'var(--fs-sm, 12px)', marginTop: '4px' }}>Barkod okutun veya sağdaki listeden ürün seçin</div>
                    </td>
                  </tr>
                ) : (
                  basket.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.productName}</div>
                        <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                          {item.barcode ? `Barkod: ${item.barcode} | ` : ''}KDV: %{item.vatRate}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-surface-secondary)', borderRadius: '6px', padding: '2px 4px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 6px' }}
                            onClick={() => updateItemQuantity(idx, -1)}
                          >
                            <Minus size={12} />
                          </button>
                          <span style={{ fontWeight: 700, minWidth: '24px' }}>{item.quantity}</span>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 6px' }}
                            onClick={() => updateItemQuantity(idx, 1)}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {item.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                        {item.lineGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </td>
                      <td>
                        <button
                          onClick={() => removeItem(idx)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                          title="Sil"
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

          {/* Sepet Dip Toplamları ve Hızlı Ödeme Butonu */}
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-base, 13px)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Ara Toplam (Net):</span>
              <span>{netTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-base, 13px)', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Toplam KDV:</span>
              <span>{totalVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, borderTop: '2px solid var(--border-color)', paddingTop: '8px' }}>
              <span>Genel Toplam:</span>
              <span style={{ color: 'var(--primary)' }}>{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
          </div>
        </div>

        {/* SAĞ BÖLÜM: ÜRÜN KATALOĞU & ÖDEME PANELİ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
          
          {/* Hızlı Ödeme Türü ve Para Üstü Hesabı */}
          <div className="card-panel" style={{ padding: '14px' }}>
            <div style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 700, marginBottom: '10px' }}>Ödeme Türü & Tahsilat</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <button
                type="button"
                className={`btn ${paymentType === 'CASH' ? 'btn-success' : 'btn-secondary'}`}
                onClick={() => setPaymentType('CASH')}
                style={{ padding: '12px 6px', display: 'flex', flexDirection: 'column', gap: '4px' }}
              >
                <DollarSign size={20} />
                <span>Nakit</span>
              </button>
              <button
                type="button"
                className={`btn ${paymentType === 'CREDIT_CARD' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPaymentType('CREDIT_CARD')}
                style={{ padding: '12px 6px', display: 'flex', flexDirection: 'column', gap: '4px' }}
              >
                <CreditCard size={20} />
                <span>Kredi Kartı</span>
              </button>
              <button
                type="button"
                className={`btn ${paymentType === 'OPEN_ACCOUNT' ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => setPaymentType('OPEN_ACCOUNT')}
                style={{ padding: '12px 6px', display: 'flex', flexDirection: 'column', gap: '4px' }}
              >
                <User size={20} />
                <span>Veresiye</span>
              </button>
            </div>

            {/* Görsel Nakit & Para Üstü Bölümü */}
            {paymentType === 'CASH' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                {/* Görsel TL Banknot Seçim Çubuğu */}
                <div>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Hızlı Banknot Seçimi:</span>
                    <span style={{ fontSize: 'var(--fs-2xs, 10px)', color: 'var(--primary)' }}>Tıklayarak ekleyin</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {/* 2026-09-13 (tasarım sadeleştirmesi): bu gradyanlar KORUNDU — dekoratif
                        değil, gerçek TL banknot renklerini (mor/mavi/turuncu/yeşil/kırmızı-sarı)
                        temsil ediyor; kupür ayrımını taşıyan işlevsel renk kodlaması. */}
                    {[
                      { amt: 200, bg: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', text: '#fff', label: '200 ₺', sub: 'Mor Banknot' },
                      { amt: 100, bg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', text: '#fff', label: '100 ₺', sub: 'Mavi Banknot' },
                      { amt: 50, bg: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', text: '#fff', label: '50 ₺', sub: 'Turuncu Banknot' },
                      { amt: 20, bg: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', text: '#fff', label: '20 ₺', sub: 'Yeşil Banknot' },
                      { amt: 10, bg: 'linear-gradient(135deg, #ca8a04 0%, #a16207 100%)', text: '#fff', label: '10 ₺', sub: 'Kırmızı/Sarı' },
                    ].map(note => (
                      <button
                        key={note.amt}
                        type="button"
                        onClick={() => {
                          soundFX.playBeep();
                          setTenderedAmount(prev => {
                            const current = typeof prev === 'number' ? prev : Number(prev) || 0;
                            return current + note.amt;
                          });
                        }}
                        style={{
                          background: note.bg,
                          color: note.text,
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 4px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: 'var(--shadow-sm)',
                          transition: 'all 0.12s ease',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                        title={`+${note.amt} ₺ Ekle`}
                        className="banknote-btn"
                      >
                        <div style={{ fontSize: '8px', opacity: 0.8, letterSpacing: '0.5px' }}>Türkiye</div>
                        <div style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{note.amt} ₺</div>
                      </button>
                    ))}
                  </div>

                  {/* Yardımcı Aksiyon Butonları (Tam Tutar & Temizle) */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, fontSize: 'var(--fs-xs, 11px)', fontWeight: 600 }}
                      onClick={() => setTenderedAmount(grandTotal)}
                    >
                      Tam Tutar ({grandTotal.toLocaleString('tr-TR')} ₺)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--danger)' }}
                      onClick={() => setTenderedAmount('')}
                    >
                      Sıfırla
                    </button>
                  </div>
                </div>

                {/* Görsel Para Üstü Hesap Kartı */}
                <div style={{
                  background: changeDue >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-lg, 10px)',
                  border: changeDue >= 0 ? '1.5px solid var(--success-border)' : '1.5px solid var(--danger-border)',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: changeDue >= 0 ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>Alınan Nakit Tutar</span>
                      </div>
                      <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Ödenecek: <strong>{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
                      </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="0,00"
                        value={tenderedAmount}
                        onChange={e => setTenderedAmount(e.target.value)}
                        style={{
                          width: '130px',
                          fontWeight: 700,
                          fontSize: 'var(--fs-lg, 16px)',
                          textAlign: 'right',
                          color: 'var(--text-main)',
                          background: 'var(--bg-surface)',
                          borderColor: changeDue >= 0 ? 'var(--success-border)' : 'var(--danger-border)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Para Üstü Sonucu & Görsel İllüstrasyon */}
                  <div style={{
                    borderTop: '1px dashed ' + (changeDue >= 0 ? 'var(--success-border)' : 'var(--danger-border)'),
                    paddingTop: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '8px',
                        background: changeDue > 0 ? 'var(--success)' : changeDue === 0 ? 'var(--info)' : 'var(--danger)',
                        color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px',
                        boxShadow: 'var(--shadow-sm)',
                      }}>
                        {changeDue > 0 ? '🪙' : changeDue === 0 ? '✔️' : '⚠️'}
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--fs-2xs, 10px)', fontWeight: 700, color: changeDue >= 0 ? 'var(--success-text)' : 'var(--danger-text)', letterSpacing: '0.4px' }}>
                          {changeDue > 0 ? 'Müşteriye Verilecek Para Üstü' : changeDue === 0 ? 'Tam Ödeme Alındı' : 'Kalan Eksik Tutar'}
                        </div>
                        <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: changeDue >= 0 ? 'var(--success-text)' : 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
                          {Math.abs(changeDue).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </div>
                      </div>
                    </div>

                    {/* Dinamik Banknot/Bozuk Para Dağılım Rozeti */}
                    {changeDue > 0 && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '2px',
                        fontSize: 'var(--fs-2xs, 10px)',
                        color: 'var(--success-text)',
                        background: 'var(--success-bg)',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--success-border)',
                      }}>
                        <span style={{ fontWeight: 700 }}>Para Dağılımı:</span>
                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {(() => {
                            let rem = Math.floor(changeDue);
                            const notes: string[] = [];
                            [200, 100, 50, 20, 10, 5].forEach(n => {
                              const count = Math.floor(rem / n);
                              if (count > 0) {
                                notes.push(`${count}x${n}₺`);
                                rem %= n;
                              }
                            });
                            const kurus = Math.round((changeDue - Math.floor(changeDue)) * 100);
                            if (kurus > 0) notes.push(`${kurus}kr`);
                            return notes.slice(0, 3).map((nt, idx) => (
                              <span key={idx} style={{ background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 'var(--radius-xs, 4px)', fontWeight: 600, border: '1px solid var(--success-border)' }}>
                                {nt}
                              </span>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SATIŞI ONAYLA BUTONU */}
            <button
              className="btn btn-success btn-lg"
              style={{ width: '100%', padding: '14px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, letterSpacing: '0.5px' }}
              disabled={basket.length === 0 || isProcessing}
              onClick={handleCompleteSale}
            >
              <CheckCircle size={22} />
              <span>Satışı Tamamla & Fiş Yazdır</span>
            </button>
          </div>

          {/* Hızlı Ürün Seçim Listesi */}
          <div className="card-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface-secondary)' }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Hızlı ürün ara (kod, isim, barkod)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: 'var(--fs-sm, 12px)' }}
              />
              <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-light)', whiteSpace: 'nowrap' }}>
                {filteredProducts.length} Ürün
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', alignContent: 'start' }}>
              {filteredProducts.map(p => (
                <div
                  key={p.id}
                  onClick={() => addProductToBasket(p)}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                  }}
                  className="kpi-card"
                  title={`${p.name} - ${p.salePrice.toLocaleString('tr-TR')} ₺ (Sepete Ekle)`}
                >
                  {/* Ürün Görseli Alanı */}
                  <div style={{
                    width: '100%',
                    height: '80px',
                    background: 'var(--bg-surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                    borderBottom: '1px solid var(--border-light)',
                  }}>
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          // Fallback to placeholder icon on image load error
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', color: 'var(--text-light)' }}>
                        <ImageIcon size={26} style={{ opacity: 0.4 }} />
                        <span style={{ fontSize: '9px', opacity: 0.6 }}>Resim Yok</span>
                      </div>
                    )}

                    {/* Resim Ekle / Değiştir Hızlı Butonu */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingImageProduct(p);
                      }}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'rgba(0, 0, 0, 0.55)',
                        color: '#fff',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'transform 0.12s ease, background 0.12s ease',
                        // 2026-09-13 (tasarım sadeleştirmesi): backdropFilter: blur(2px) kaldırıldı
                        // (glassmorphism yasak). Düz yarı saydam siyah zemin korunuyor.
                      }}
                      title="Ürün Görseli Ekle / Değiştir"
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--primary)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                    >
                      <Camera size={12} />
                    </button>
                  </div>

                  {/* Ürün Detayları */}
                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
                    <div style={{
                      fontSize: '11.5px',
                      fontWeight: 600,
                      lineHeight: 1.25,
                      color: 'var(--text-main)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      height: '28px',
                      marginBottom: '4px',
                    }}>
                      {p.name}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid var(--border-light)', paddingTop: '4px' }}>
                      <span style={{ fontSize: 'var(--fs-2xs, 10px)', color: p.currentStock <= p.criticalStock ? 'var(--danger)' : 'var(--text-muted)', fontWeight: p.currentStock <= p.criticalStock ? 700 : 500 }}>
                        Stok: {p.currentStock}
                      </span>
                      <span style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                        {p.salePrice.toLocaleString('tr-TR')} ₺
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Cari Seçici Modalı (F2) */}
      <CustomerSelectorModal
        isOpen={isCustomerSelectorOpen}
        onClose={() => {
          setIsCustomerSelectorOpen(false);
          focusBarcodeInput();
        }}
        onSelect={handleSelectCustomer}
        filterType="CUSTOMER"
        title="🛒 POS Satış — Cari Hesap Seçimi"
      />

      {/* Hızlı Yeni Cari Ekleme Modalı */}
      <QuickCustomerCreateModal
        isOpen={isQuickCustomerCreateOpen}
        onClose={() => {
          setIsQuickCustomerCreateOpen(false);
          focusBarcodeInput();
        }}
        onCustomerCreated={handleQuickCustomerCreated}
        defaultType="CUSTOMER"
      />

      {/* Ürün Görseli Ekleme & Düzenleme Modalı */}
      <ProductImageEditModal
        isOpen={!!editingImageProduct}
        onClose={() => setEditingImageProduct(null)}
        product={editingImageProduct}
        onImageUpdated={handleProductImageUpdated}
      />
    </div>
  );
};
