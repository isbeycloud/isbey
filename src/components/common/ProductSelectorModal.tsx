import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from './Modal';
import type { Product, ProductGroup, ProductVariant } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { QuickProductCreateModal } from './QuickProductCreateModal';
import { Search, Plus, Barcode, Check, Package, Layers, AlertTriangle, ArrowUpDown } from 'lucide-react';

interface ProductSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * 2026-10-12: Varyantlı üründe ikinci parametre seçili varyanttır.
   * Varyantsız üründe undefined olur — mevcut arayanlar bozulmaz.
   */
  onSelect: (product: Product, variant?: ProductVariant) => void;
  priceType?: 'SALE' | 'PURCHASE';
  title?: string;
}

export const ProductSelectorModal: React.FC<ProductSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  priceType = 'SALE',
  title = '📦 Ürün & Stok Kartı Seçimi',
}) => {
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'CRITICAL' | 'OUT_OF_STOCK'>('ALL');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  // 2026-10-12: Varyant seçim adımı. Varyantlı ürün seçilince tablo yerine
  // varyant listesi gösterilir; geri dönülebilir.
  const [variantStepProduct, setVariantStepProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

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
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([api.getProducts(), api.getProductMeta()]);
      if (pRes.success) setProducts(pRes.products);
      if (mRes.success) setGroups(mRes.groups);
    } catch (err) {
      console.error('Error loading products:', err);
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
      onSelect(foundProduct, foundVariant);
      onClose();
    } else {
      showToast(`"${b}" barkoduna ait ürün bulunamadı. Yeni ürün ekleyebilirsiniz.`, 'warning');
      setIsQuickCreateOpen(true);
    }
  };

  const handleSelectProduct = (product: Product) => {
    // 2026-10-12: Varyantlı üründe önce VARYANT seçilir. Varyantsız üründe
    // doğrudan seçilir (mevcut davranış korunur).
    const activeVariants = (product.variants || []).filter(v => v.active !== false);
    if (activeVariants.length > 0) {
      setVariantStepProduct(product);
      setSelectedVariantId(activeVariants.length === 1 ? activeVariants[0].id : null);
      return;
    }
    onSelect(product);
    onClose();
  };

  const handleConfirmVariant = () => {
    if (!variantStepProduct || !selectedVariantId) return;
    const variant = (variantStepProduct.variants || []).find(v => v.id === selectedVariantId);
    if (!variant) return;
    onSelect(variantStepProduct, variant);
    onClose();
  };

  const handleQuickCreated = (newProduct: Product) => {
    setProducts(prev => [newProduct, ...prev]);
    onSelect(newProduct);
    onClose();
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="large">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Top Controls: Search, Barcode scanner bar, Filters & + Yeni Ürün */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: '10px', alignItems: 'center' }}>
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

          {/* Ürünler Tablosu */}
          <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface-secondary)', borderBottom: '2px solid var(--border-color)', zIndex: 2 }}>
                <tr>
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
                    <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Ürünler yükleniyor...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                    const isSelected = selectedProductId === p.id;
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
                          {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
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
            <span>💡 İpucu: Listeden bir ürüne <strong>çift tıklayarak</strong> da doğrudan faturaya aktarabilirsiniz.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>
      </Modal>

      {/* 2026-10-12: VARYANT SEÇİM ADIMI — varyantlı ürün seçilince açılır. */}
      <Modal
        isOpen={!!variantStepProduct}
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
              onClick={handleConfirmVariant}
            >
              <Check size={13} /> Varyantı Ekle
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
                  onDoubleClick={() => { setSelectedVariantId(v.id); setTimeout(handleConfirmVariant, 0); }}
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
