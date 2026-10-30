import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from './Modal';
import type { Product, ProductGroup, ProductVariant } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { QuickProductCreateModal } from './QuickProductCreateModal';
import { Search, Plus, Barcode, Check, Package, Layers, AlertTriangle, ArrowUpDown } from 'lucide-react';

export interface ProductSelection { product: Product; variant?: ProductVariant }

interface ProductSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * 2026-10-12: Varyantlı üründe ikinci parametre seçili varyanttır.
   * Varyantsız üründe undefined olur — mevcut arayanlar bozulmaz.
   */
  onSelect: (product: Product, variant?: ProductVariant) => void;
  onSelectMany?: (selection: ProductSelection[]) => void;
  priceType?: 'SALE' | 'PURCHASE';
  title?: string;
}

export const ProductSelectorModal: React.FC<ProductSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  onSelectMany,
  priceType = 'SALE',
  title = '📦 Ürün & Stok Kartı Seçimi',
}) => {
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [groupError, setGroupError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'CRITICAL' | 'OUT_OF_STOCK'>('ALL');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  // 2026-10-12: Varyant seçim adımı. Varyantlı ürün seçilince tablo yerine
  // varyant listesi gösterilir; geri dönülebilir.
  const [variantStepProduct, setVariantStepProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ProductSelection[]>([]);
  const [queueVariant, setQueueVariant] = useState(false);

  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
      setSearchQuery('');
      setBarcodeInput('');
      setSelectedProductId(null);
      setVariantStepProduct(null);
      setSelectedVariantId(null);
      setSelection([]);
      setQueueVariant(false);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const loadProducts = async () => {
    setLoading(true);
    setLoadError('');
    setGroupError('');
    setProducts([]);
    setGroups([]);
    try {
      const [productResult, metaResult] = await Promise.allSettled([api.getProducts(), api.getProductMeta()]);
      if (productResult.status === 'rejected') throw productResult.reason;
      if (!productResult.value.success || !Array.isArray(productResult.value.products)) throw new Error('Ürün listesi alınamadı.');
      setProducts(productResult.value.products);
      if (metaResult.status === 'fulfilled' && metaResult.value.success) setGroups(metaResult.value.groups || []);
      else setGroupError('Ürün grupları alınamadı. Ürün adı veya barkod ile seçim yapabilirsiniz.');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Ürün listesi alınamadı. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedGroupId !== 'ALL') {
      result = result.filter(p => p.groupId === selectedGroupId);
    }

    if (stockFilter === 'IN_STOCK') {
      result = result.filter(p => (p.currentStock || 0) > 0);
    } else if (stockFilter === 'CRITICAL') {
      result = result.filter(p => (p.currentStock || 0) > 0 && (p.currentStock || 0) <= (p.criticalStock || 5));
    } else if (stockFilter === 'OUT_OF_STOCK') {
      result = result.filter(p => (p.currentStock || 0) <= 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().replace(/İ/g, 'i').replace(/I/g, 'ı').trim();
      result = result.filter(p => {
        const nameNorm = p.name.toLowerCase().replace(/İ/g, 'i').replace(/I/g, 'ı');
        const codeNorm = p.code.toLowerCase();
        const barcodeNorm = (p.barcode || '').toLowerCase();

        // Direct matching
        if (nameNorm.includes(q) || codeNorm.includes(q) || barcodeNorm.includes(q)) return true;
        if (p.groupName?.toLowerCase().includes(q)) return true;

        // Smart Acronym / Initial matching (e.g. "SGA" or "SGA55" matches "Samsung Galaxy A55 256 GB")
        const words = nameNorm.split(/[\s\-_\/,\.]+/).filter(w => w.length > 0);
        const initials = words.map(w => w[0]).join('');
        if (initials.includes(q) || initials.startsWith(q)) return true;

        // Alphanumeric initials (e.g. "SGA55")
        let tokenAcronym = '';
        for (const w of words) {
          if (/\d/.test(w)) tokenAcronym += w;
          else tokenAcronym += w[0];
        }
        if (tokenAcronym.includes(q) || tokenAcronym.startsWith(q)) return true;

        return false;
      });
    }

    return result;
  }, [products, searchQuery, selectedGroupId, stockFilter]);


  // Handle direct barcode search (e.g. from scanner or fast barcode enter)
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const b = barcodeInput.trim();
    // 2026-10-12: Varyant barkodları da aranır. Varyant barkodu okutulursa
    // ürün + varyant birlikte seçilir (kasiyer varyant seçmek zorunda kalmaz).
    let foundProduct: Product | undefined;
    let foundVariant: ProductVariant | undefined;
    for (const p of products) {
      if (p.barcode === b || p.code.toLowerCase() === b.toLowerCase()) {
        foundProduct = p;
        break;
      }
      const v = (p.variants || []).find(vv => vv.barcode === b);
      if (v) {
        foundProduct = p;
        foundVariant = v;
        break;
      }
    }
    if (foundProduct) {
      showToast(`Barkod okundu: ${foundVariant ? `${foundProduct.name} (${foundVariant.name})` : foundProduct.name}`, 'success');
      if (onSelectMany && selection.length) {
        if (foundVariant) queueProducts([{ product: foundProduct, variant: foundVariant }]);
        else handleSelectProduct(foundProduct, true);
        setBarcodeInput('');
        return;
      }
      onSelect(foundProduct, foundVariant);
      onClose();
    } else {
      showToast(`"${b}" barkoduna ait ürün bulunamadı. Yeni ürün ekleyebilirsiniz.`, 'warning');
      setIsQuickCreateOpen(true);
    }
  };

  const queueProducts = (entries: ProductSelection[]) => setSelection(previous => {
    const next = [...previous];
    for (const entry of entries) if (!next.some(item => item.product.id === entry.product.id && item.variant?.id === entry.variant?.id)) next.push(entry);
    return next;
  });

  const handleSelectProduct = (product: Product, queue = false) => {
    const shouldQueue = !!onSelectMany && (queue || selection.length > 0);
    // 2026-10-12: Varyantlı üründe önce VARYANT seçilir. Varyantsız üründe
    // doğrudan seçilir (mevcut davranış korunur).
    const activeVariants = (product.variants || []).filter(v => v.active !== false);
    if (activeVariants.length > 0) {
      setQueueVariant(shouldQueue);
      setVariantStepProduct(product);
      setSelectedVariantId(activeVariants.length === 1 ? activeVariants[0].id : null);
      return;
    }
    if (shouldQueue) { queueProducts([{ product }]); return; }
    onSelect(product);
    onClose();
  };

  const handleConfirmVariant = (variantId = selectedVariantId) => {
    if (!variantStepProduct || !variantId) return;
    const variant = (variantStepProduct.variants || []).find(v => v.id === variantId);
    if (!variant) return;
    if (queueVariant) queueProducts([{ product: variantStepProduct, variant }]);
    else onSelect(variantStepProduct, variant);
    setVariantStepProduct(null);
    setSelectedVariantId(null);
    if (!queueVariant) onClose();
  };

  const handleQuickCreated = (newProduct: Product) => {
    setProducts(prev => [newProduct, ...prev]);
    if (onSelectMany && selection.length) { queueProducts([{ product: newProduct }]); return; }
    onSelect(newProduct);
    onClose();
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="large" footer={onSelectMany && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
        <span role="status" style={{ marginRight: 'auto' }}>{selection.length} ürün / varyant seçildi</span>
        <button type="button" className="btn btn-secondary" disabled={!selection.length} onClick={() => setSelection([])}>Seçimi Temizle</button>
        <button type="button" className="btn btn-primary" disabled={!selection.length || loading || !!loadError} onClick={() => { onSelectMany(selection); onClose(); }}>Seçilenleri Ekle ({selection.length})</button>
      </div>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loadError && <div role="alert">{loadError} <button type="button" className="btn btn-secondary btn-sm" onClick={loadProducts}>Tekrar Dene</button></div>}
          {groupError && !loadError && <p role="status">{groupError}</p>}
          
          {/* Top Controls: Search, Barcode scanner bar, Filters & + Yeni Ürün */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '10px', alignItems: 'center' }}>
            {/* Metin Arama */}
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                ref={searchInputRef}
                type="text"
                className="form-input"
                style={{ paddingLeft: '32px' }}
                placeholder="Ürün adı, stok kodu veya marka ile ara... (F3)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Hızlı Barkod Okuyucu Çubuğu */}
            <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', gap: '6px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Barcode size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '32px' }}
                  placeholder="Barkod okutun + Enter..."
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-secondary btn-sm" title="Barkod ile ara">
                Bul
              </button>
            </form>

            {/* + Yeni Ürün Ekle Butonu */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsQuickCreateOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Plus size={16} />
              <span>+ Yeni Ürün</span>
            </button>
          </div>

          {/* Filters Bar: Kategori & Stok Durumu */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-surface-secondary)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Kategori:</span>
              <select
                className="form-select"
                style={{ padding: '3px 8px', fontSize: '12px', width: '160px' }}
                value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value)}
              >
                <option value="ALL">Tüm Kategoriler ({groups.length})</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Stok Durumu:</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className={`btn ${stockFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setStockFilter('ALL')}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  className={`btn ${stockFilter === 'IN_STOCK' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setStockFilter('IN_STOCK')}
                >
                  Stokta Var
                </button>
                <button
                  type="button"
                  className={`btn ${stockFilter === 'CRITICAL' ? 'btn-warning' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setStockFilter('CRITICAL')}
                >
                  Kritik
                </button>
              </div>
            </div>

            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
              <strong>{filteredProducts.length}</strong> ürün listeleniyor
            </div>
          </div>

          {onSelectMany && selection.length > 0 && <details><summary>Seçilen ürünleri göster ({selection.length})</summary><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 100, overflow: 'auto', paddingTop: 8 }}>
            {selection.map(item => {
              const label = item.variant ? `${item.product.name} (${item.variant.name})` : item.product.name;
              return <button key={JSON.stringify([item.product.id, item.variant?.id])} type="button" className="btn btn-secondary btn-sm" aria-label={`${label} seçimini kaldır`} onClick={() => setSelection(previous => previous.filter(entry => entry.product.id !== item.product.id || entry.variant?.id !== item.variant?.id))}>{label} ×</button>;
            })}
          </div></details>}

          {/* Ürünler Tablosu */}
          <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface-secondary)', borderBottom: '2px solid var(--border-color)', zIndex: 2 }}>
                <tr>
                  {onSelectMany && <th style={{ padding: '8px 10px', width: 40 }}><input type="checkbox" aria-label="Listelenen varyantsız ürünlerin tümünü seç" disabled={loading || !!loadError || !filteredProducts.some(p => !(p.variants || []).some(v => v.active !== false))}
                    checked={filteredProducts.some(p => !(p.variants || []).some(v => v.active !== false)) && filteredProducts.filter(p => !(p.variants || []).some(v => v.active !== false)).every(p => selection.some(item => item.product.id === p.id && !item.variant))}
                    onChange={event => {
                      const visible = filteredProducts.filter(p => !(p.variants || []).some(v => v.active !== false));
                      if (event.target.checked) queueProducts(visible.map(product => ({ product })));
                      else setSelection(previous => previous.filter(item => !visible.some(p => p.id === item.product.id)));
                    }} /></th>}
                  <th style={{ padding: '8px 10px', width: '100px' }}>Stok Kodu</th>
                  <th style={{ padding: '8px 10px' }}>Ürün / Hizmet Adı</th>
                  <th style={{ padding: '8px 10px', width: '110px' }}>Barkod</th>
                  <th style={{ padding: '8px 10px', width: '110px' }}>Kategori</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>Mevcut Stok</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: '110px' }}>
                    {priceType === 'PURCHASE' ? 'Alış Fiyatı' : 'Satış Fiyatı'}
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: '70px' }}>KDV</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: '80px' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={onSelectMany ? 9 : 8} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Ürünler yükleniyor...
                    </td>
                  </tr>
                ) : loadError ? null : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={onSelectMany ? 9 : 8} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div>Aradığınız kriterlere uygun ürün bulunamadı.</div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: '10px' }}
                        onClick={() => setIsQuickCreateOpen(true)}
                      >
                        <Plus size={14} /> Yeni Ürün Oluştur
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(p => {
                    const isSelected = selection.some(item => item.product.id === p.id) || selectedProductId === p.id;
                    const stock = p.currentStock || 0;
                    const critical = p.criticalStock || 5;
                    const isOut = stock <= 0;
                    const isCritical = stock > 0 && stock <= critical;
                    const price = priceType === 'PURCHASE' ? p.purchasePrice : p.salePrice;

                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedProductId(p.id)}
                        onDoubleClick={() => handleSelectProduct(p)}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--primary-light)' : 'transparent',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        {onSelectMany && <td style={{ padding: '8px 10px' }}><input type="checkbox" aria-label={`${p.name} seç`} checked={selection.some(item => item.product.id === p.id)} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onChange={event => {
                          if (event.target.checked) handleSelectProduct(p, true);
                          else setSelection(previous => previous.filter(item => item.product.id !== p.id));
                        }} /></td>}
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--primary)' }}>
                          {p.code}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }}
                              />
                            ) : (
                              <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', flexShrink: 0, color: 'var(--text-light)', fontSize: '10px' }}>
                                📦
                              </div>
                            )}
                            <div>
                              <div>{p.name}</div>
                              {/* 2026-10-12: Varyantlı ürün rozeti — kasiyer varyant
                                  seçeceğini önceden görür. */}
                              {(p.variants || []).filter(v => v.active !== false).length > 0 && (
                                <div style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 600 }}>
                                  <Layers size={10} /> {(p.variants || []).filter(v => v.active !== false).length} varyant
                                </div>
                              )}
                              {p.description && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.description}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {p.barcode || '-'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                          {p.groupName || 'Genel'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <span className={`badge ${isOut ? 'badge-danger' : isCritical ? 'badge-warning' : 'badge-success'}`}>
                            {stock} {p.unit}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                            {Number.isFinite(price) ? `${price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺` : 'Fiyat tanımlı değil'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          %{p.vatRate}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            onClick={e => {
                              e.stopPropagation();
                              handleSelectProduct(p);
                            }}
                          >
                            <Check size={12} /> Seç
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom helper */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>{onSelectMany ? 'Kutuları işaretleyip Seçilenleri Ekle düğmesine basın. Başka bir varyant eklemek için ürünün Seç düğmesini kullanın.' : <>💡 İpucu: Listeden bir ürüne <strong>çift tıklayarak</strong> da doğrudan faturaya aktarabilirsiniz.</>}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>
      </Modal>

      {/* 2026-10-12: VARYANT SEÇİM ADIMI — varyantlı ürün seçilince açılır. */}
      <Modal
        isOpen={isOpen && !!variantStepProduct}
        onClose={() => { setVariantStepProduct(null); setSelectedVariantId(null); }}
        title={variantStepProduct ? `Varyant Seçin: ${variantStepProduct.name}` : 'Varyant Seçin'}
        size="medium"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setVariantStepProduct(null); setSelectedVariantId(null); }}
            >
              ← Ürünlere Dön
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedVariantId}
              onClick={() => handleConfirmVariant()}
            >
              <Check size={13} /> {queueVariant ? 'Varyantı Seç' : 'Varyantı Ekle'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto' }}>
          {(variantStepProduct?.variants || [])
            .filter(v => v.active !== false)
            .map(v => {
              const selected = selectedVariantId === v.id;
              const stock = Number(v.currentStock) || 0;
              const price = priceType === 'PURCHASE'
                ? (v.purchasePrice ?? variantStepProduct!.purchasePrice)
                : (v.salePrice ?? variantStepProduct!.salePrice);
              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  onDoubleClick={() => handleConfirmVariant(v.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: selected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    background: selected ? 'var(--primary-light)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {v.imageUrl || variantStepProduct?.imageUrl ? (
                    <img
                      src={v.imageUrl || variantStepProduct?.imageUrl}
                      alt={v.name}
                      style={{ width: '34px', height: '34px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }}
                    />
                  ) : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{v.name}</div>
                    {v.barcode && (
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {v.barcode}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${stock <= 0 ? 'badge-danger' : 'badge-success'}`}>
                    {stock} {variantStepProduct?.unit}
                  </span>
                  <span style={{ fontWeight: 700, minWidth: '90px', textAlign: 'right' }}>
                    {Number(price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                </div>
              );
            })}
        </div>
      </Modal>

      {/* Hızlı Yeni Ürün Modalı */}
      <QuickProductCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        onProductCreated={handleQuickCreated}
        initialBarcode={barcodeInput}
        initialName={searchQuery}
      />
    </>
  );
};
