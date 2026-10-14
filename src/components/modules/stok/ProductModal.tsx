import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../../common/Modal';
import type { Product, ProductGroup, PriceList, ProductPriceEntry, ProductVariant, VariantOption, Warehouse } from '../../../types';
import { api } from '../../../services/api';
import { downscaleImageFile } from '../../../utils/imageClient';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { RefreshCw, Star, Upload, X } from 'lucide-react';

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
  // 2026-10-12: Tenant'ın fiyat listeleri (Perakende, Toptan, Bayi…).
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  /**
   * Liste bazlı satış fiyatları: `{ [priceListId]: { salePrice, discountRate } }`.
   * Boş bırakılan liste için ürün fiyatı KAYDEDİLMEZ (taban `salePrice` geçerli
   * kalır) — böylece "0 TL" ile "tanımsız" karışmaz.
   */
  const [listPrices, setListPrices] = useState<Record<string, { salePrice: number | ''; discountRate: number | '' }>>({});
  // 2026-10-12: Sunucuya görsel yükleme durumu.
  const imageFileRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageInfo, setImageInfo] = useState('');
  const [imageUrlDraft, setImageUrlDraft] = useState('');

  // 2026-10-12: VARYANTLAR. Ürünün kullandığı özellikler + varyant satırları.
  // Varyant YOKSA mevcut davranış aynen korunur (tek stok/fiyat/barkod).
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [variants, setVariants] = useState<Array<{
    id?: string;
    attributes: Record<string, string>;
    name: string;
    barcode: string;
    currentStock: number | '';
    salePrice: number | '';
  }>>([]);

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
        // 2026-10-12: Kayıtlı liste fiyatlarını forma yükle. Kaydı olmayan
        // listeler boş kalır — kullanıcı "boş = taban fiyat geçerli" görür.
        const existing: Record<string, { salePrice: number | ''; discountRate: number | '' }> = {};
        for (const entry of productToEdit.salePrices || []) {
          existing[entry.priceListId] = {
            salePrice: entry.salePrice,
            discountRate: entry.discountRate ?? '',
          };
        }
        setListPrices(existing);
      } else {
        setListPrices({});
        setSelectedOptionIds([]);
        setVariants([]);
        generateRandomBarcode();
      }
      setImageInfo('');
      setImageUrlDraft(productToEdit?.imageUrl && !productToEdit.imageUrl.startsWith('/uploads/') ? productToEdit.imageUrl : '');
    }
  }, [isOpen, productToEdit]);

  const loadMeta = async () => {
    try {
      const [metaRes, listRes, variantRes] = await Promise.all([
        api.getProductMeta(),
        api.getPriceLists({ activeOnly: true }),
        // Varyant özelliği yükleme hatası ürün kaydını ENGELLEMEZ.
        api.getVariantOptions({ activeOnly: true }).catch(() => ({ success: false as const, variantOptions: [] as VariantOption[] })),
      ]);
      if (metaRes.success) {
        setGroups(metaRes.groups);
        setWarehouses(metaRes.warehouses);
        if (!productToEdit) {
          setFormData(prev => ({
            ...prev,
            groupId: metaRes.groups[0]?.id || '',
            warehouseId: metaRes.warehouses[0]?.id || '',
          }));
        }
      }
      if (listRes.success) {
        setPriceLists(listRes.priceLists);
      }
      if (variantRes.success) {
        setVariantOptions(variantRes.variantOptions);
        // Düzenlemede ürünün özellik + varyant seçimini forma yükle.
        if (productToEdit) {
          setSelectedOptionIds(productToEdit.variantOptionIds || []);
          setVariants(
            (productToEdit.variants || []).map(v => ({
              id: v.id,
              attributes: Object.fromEntries(v.attributes.map(a => [a.optionId, a.valueId])),
              name: v.name,
              barcode: v.barcode || '',
              currentStock: v.currentStock,
              salePrice: v.salePrice ?? '',
            }))
          );
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * 2026-10-12: Seçili özelliklerden TÜM kombinasyonları üretir.
   * Mevcut varyant satırları (aynı kombinasyon) KORUNUR — fiyat/stok girilmiş
   * satırlar özellik değişince kaybolmaz. Yeni kombinasyonlar boş satır olur.
   */
  const generateVariants = () => {
    const selected = variantOptions.filter(o => selectedOptionIds.includes(o.id) && o.values.length > 0);
    if (selected.length === 0) {
      setVariants([]);
      return;
    }
    const combos: Array<Record<string, string>> = [{}];
    for (const opt of selected) {
      const next: Array<Record<string, string>> = [];
      for (const base of combos) {
        for (const val of opt.values) {
          next.push({ ...base, [opt.id]: val.id });
        }
      }
      combos.splice(0, combos.length, ...next);
    }
    if (combos.length > 200) {
      showToast(`Çok fazla kombinasyon (${combos.length}). En fazla 200 varyant oluşturulabilir.`, 'warning');
      return;
    }
    const keyOf = (attrs: Record<string, string>) =>
      selected.map(o => `${o.id}=${attrs[o.id] || ''}`).join('|');
    const existingByKey = new Map(variants.map(v => [keyOf(v.attributes), v]));
    const valueName = (optionId: string, valueId: string) =>
      variantOptions.find(o => o.id === optionId)?.values.find(v => v.id === valueId)?.name || '';

    setVariants(
      combos.map(attrs => {
        const key = keyOf(attrs);
        const existing = existingByKey.get(key);
        if (existing) return existing;
        return {
          attributes: attrs,
          name: selected.map(o => valueName(o.id, attrs[o.id])).filter(Boolean).join(' / '),
          barcode: '',
          currentStock: '' as number | '',
          salePrice: '' as number | '',
        };
      })
    );
  };

  const updateVariant = (index: number, patch: Partial<{ name: string; barcode: string; currentStock: number | ''; salePrice: number | '' }>) => {
    setVariants(prev => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const removeVariantRow = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * 2026-10-12: Formdaki varyantları gövdeye çevirir. Eksik seçimli satır
   * ATLANIR (sessizce bozuk varyant yazılmaz). Varyant yoksa undefined döner
   * — sunucu ürünü varyantsız kabul eder.
   */
  const buildVariants = (): ProductVariant[] | undefined => {
    if (selectedOptionIds.length === 0 || variants.length === 0) return undefined;
    const out: ProductVariant[] = [];
    for (const v of variants) {
      const attrs = selectedOptionIds
        .map(optionId => ({ optionId, valueId: v.attributes[optionId] || '' }))
        .filter(a => a.valueId);
      if (attrs.length !== selectedOptionIds.length) continue;
      const stock = v.currentStock === '' ? 0 : Number(v.currentStock);
      const price = v.salePrice === '' ? undefined : Number(v.salePrice);
      out.push({
        id: v.id || `var-${Date.now()}-${out.length}`,
        attributes: attrs,
        name: v.name.trim() || attrs.map(a => {
          const opt = variantOptions.find(o => o.id === a.optionId);
          return opt?.values.find(val => val.id === a.valueId)?.name || '';
        }).filter(Boolean).join(' / '),
        barcode: v.barcode.trim() || undefined,
        currentStock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
        salePrice: price !== undefined && Number.isFinite(price) ? price : undefined,
        active: true,
      });
    }
    return out.length > 0 ? out : undefined;
  };

  /**
   * 2026-10-12: Formdaki liste fiyatlarını gövdeye çevirir.
   * Boş bırakılan liste SATIRA ALINMAZ; böylece kullanıcı bir listeyi temizlerse
   * kayıt gerçekten silinir (0 TL yazılmaz). Geçersiz sayılar atlanır.
   */
  const buildSalePrices = (): ProductPriceEntry[] => {
    const entries: ProductPriceEntry[] = [];
    for (const [priceListId, value] of Object.entries(listPrices)) {
      if (value.salePrice === '' || value.salePrice === undefined || value.salePrice === null) continue;
      const sale = Number(value.salePrice);
      if (!Number.isFinite(sale)) continue;
      const discount = value.discountRate === '' || value.discountRate === undefined
        ? undefined
        : Number(value.discountRate);
      entries.push({
        priceListId,
        salePrice: sale,
        discountRate: Number.isFinite(discount as number) ? (discount as number) : undefined,
      });
    }
    return entries;
  };

  const generateRandomBarcode = () => {
    const random10 = Math.floor(1000000000 + Math.random() * 9000000000);
    setFormData(prev => ({ ...prev, barcode: `869${random10}` }));
  };

  /**
   * 2026-10-12: Dosya seçilince önce İSTEMCİDE küçültülür (en uzun kenar
   * 1200px, JPEG 0.82), sonra sunucuya yüklenir. Böylece 8 MB'lık telefon
   * fotoğrafı ~150-300 KB olarak gider: hem yükleme hızlı hem disk korunur.
   * Küçültme başarısız olursa (canvas yoksa) ORİJİNAL dosya gönderilir —
   * sunucu 5 MB/4096px kapılarını zaten zorlar.
   */
  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Yalnız görsel dosyası seçin (JPG, PNG, WebP, GIF).', 'warning');
      return;
    }
    setImageUploading(true);
    setImageInfo('');
    try {
      let toUpload: File = file;
      let note = '';
      try {
        const result = await downscaleImageFile(file, 1200, 0.82);
        toUpload = result.file;
        if (result.resized) {
          note = ` (${result.originalWidth}×${result.originalHeight} → ${result.width}×${result.height} küçültüldü)`;
        }
      } catch {
        // Canvas kullanılamazsa orijinal gönderilir; sunucu kapıları korur.
      }
      const res = await api.uploadProductImage(toUpload);
      setFormData(prev => ({ ...prev, imageUrl: res.url }));
      setImageUrlDraft('');
      const kb = Math.round(toUpload.size / 1024);
      setImageInfo(`Yüklendi: ${kb} KB${note}`);
      showToast(res.message, 'success');
    } catch (err: any) {
      showToast(err.message || 'Görsel yüklenemedi.', 'error');
    } finally {
      setImageUploading(false);
    }
  };

  /** Görseli formdan kaldırır; sunucudaki dosyayı da siler (kullanılmıyorsa). */
  const handleRemoveImage = async () => {
    const url = formData.imageUrl;
    setFormData(prev => ({ ...prev, imageUrl: '' }));
    setImageUrlDraft('');
    setImageInfo('');
    // Sunucuya yüklenmiş dosyaysa sil (dış URL'lere dokunulmaz).
    if (url && url.startsWith('/uploads/')) {
      try {
        await api.deleteProductImage(url);
      } catch {
        // Dosya silinemezse sessiz geç: ürün kaydı yine temiz kalır.
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Lütfen ürün adını giriniz.', 'warning');
      return;
    }

    // 2026-10-12: Yalnız fiyat listesi fiyatı girilmişse taban fiyat zorunlu
    // değildir; sunucu bu durumda tabanı liste fiyatının en düşüğüne çeker.
    const salePrices = buildSalePrices();
    if (!Number(formData.salePrice) && salePrices.length === 0) {
      showToast('En az bir satış fiyatı girin (taban fiyat veya bir fiyat listesi).', 'warning');
      return;
    }

    const payload = {
      ...formData,
      salePrices,
      // 2026-10-12: Varyantlar. Özellik seçilmediyse alanlar gönderilmez —
      // sunucu ürünü varyantsız kabul eder (mevcut davranış korunur).
      variantOptionIds: selectedOptionIds.length > 0 ? selectedOptionIds : undefined,
      variants: buildVariants(),
    };

    try {
      if (productToEdit) {
        const res = await api.updateProduct(productToEdit.id, payload);
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      } else {
        const res = await api.createProduct(payload);
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
            {/* 2026-10-12: `required` kaldırıldı — ürün yalnız fiyat listesi
                fiyatlarıyla da tanımlanabilir. Zorunluluk artık "iki kanaldan
                en az biri dolu" biçiminde ve handleSubmit'te denetleniyor. */}
            <label className="form-label">Taban Satış Fiyatı (TL)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={formData.salePrice}
              onChange={e => setFormData({ ...formData, salePrice: Number(e.target.value) })}
              style={{ fontWeight: 'bold', color: 'var(--primary)' }}
            />
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
              Fiyat listesi seçilmemiş cariler için geçerli
            </span>
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

        {/* 2026-10-12: FİYAT LİSTESİ FİYATLARI
            Yalnız tenant'ın tanımlı listeleri gösterilir. Boş bırakılan liste
            için fiyat KAYDEDİLMEZ ve o cariler taban satış fiyatından alır. */}
        {priceLists.length > 0 && (
          <div className="form-group" style={{ marginTop: '4px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Satış Fiyat Listeleri
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', fontWeight: 400 }}>
                (boş bırakılan liste için taban fiyat geçerli olur)
              </span>
            </label>
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  gap: '8px',
                  padding: '5px 8px',
                  background: 'var(--bg-surface-secondary)',
                  fontSize: 'var(--fs-2xs)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                }}
              >
                <span>Fiyat Listesi</span>
                <span style={{ textAlign: 'right' }}>Satış Fiyatı (TL)</span>
                <span style={{ textAlign: 'right' }}>İskonto (%)</span>
              </div>
              {priceLists.map(list => (
                <div
                  key={list.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr',
                    gap: '8px',
                    padding: '4px 8px',
                    alignItems: 'center',
                    borderTop: '1px solid var(--border-light)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: 'var(--fs-sm)' }}>
                    {list.name}
                    {list.isDefault && (
                      <span title="Varsayılan liste">
                        <Star size={11} style={{ color: 'var(--primary)' }} />
                      </span>
                    )}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    style={{ textAlign: 'right' }}
                    placeholder="—"
                    value={listPrices[list.id]?.salePrice ?? ''}
                    onChange={e => {
                      const raw = e.target.value;
                      setListPrices(prev => ({
                        ...prev,
                        [list.id]: {
                          salePrice: raw === '' ? '' : Number(raw),
                          discountRate: prev[list.id]?.discountRate ?? '',
                        },
                      }));
                    }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="form-input"
                    style={{ textAlign: 'right' }}
                    placeholder="—"
                    value={listPrices[list.id]?.discountRate ?? ''}
                    onChange={e => {
                      const raw = e.target.value;
                      setListPrices(prev => ({
                        ...prev,
                        [list.id]: {
                          salePrice: prev[list.id]?.salePrice ?? '',
                          discountRate: raw === '' ? '' : Number(raw),
                        },
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2026-10-12: VARYANTLAR
            Ürünün özelliklerini seçin (Renk, Ebat…), kombinasyonları üretin,
            her varyanta stok + fiyat + barkod girin. Varyantlı üründe ürün
            stoğu = varyant toplamıdır. Özellik seçilmezse bölüm kapalı kalır
            ve ürün varyantsız kaydedilir. */}
        <div className="form-group" style={{ marginTop: '4px' }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Varyantlar
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', fontWeight: 400 }}>
              (isteğe bağlı — örn. Renk × Ebat)
            </span>
          </label>
          {variantOptions.length === 0 ? (
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
              Henüz varyant özelliği tanımlanmadı. Önce Ürünler &gt; Varyantlar sekmesinden özellik ekleyin (örn. Renk, Ebat).
            </span>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {variantOptions.map(opt => {
                  const selected = selectedOptionIds.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setSelectedOptionIds(prev =>
                          prev.includes(opt.id) ? prev.filter(id => id !== opt.id) : [...prev, opt.id]
                        );
                      }}
                      title={`${opt.values.length} değer: ${opt.values.map(v => v.name).join(', ')}`}
                    >
                      {opt.name} ({opt.values.length})
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={generateVariants}
                  disabled={selectedOptionIds.length === 0}
                  title="Seçili özelliklerden tüm kombinasyonları üret"
                >
                  Kombinasyonları Üret
                </button>
              </div>
              {variants.length > 0 && (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 0.7fr 0.9fr 28px',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'var(--bg-surface-secondary)',
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>Varyant</span>
                    <span>Barkod</span>
                    <span style={{ textAlign: 'right' }}>Stok</span>
                    <span style={{ textAlign: 'right' }}>Satış Fiyatı (TL)</span>
                    <span />
                  </div>
                  {variants.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 0.7fr 0.9fr 28px',
                        gap: '8px',
                        padding: '4px 8px',
                        alignItems: 'center',
                        borderTop: '1px solid var(--border-light)',
                      }}
                    >
                      <input
                        type="text"
                        className="form-input"
                        value={v.name}
                        onChange={e => updateVariant(i, { name: e.target.value })}
                        title={selectedOptionIds.map(optionId => {
                          const opt = variantOptions.find(o => o.id === optionId);
                          const val = opt?.values.find(val => val.id === v.attributes[optionId]);
                          return `${opt?.name}: ${val?.name}`;
                        }).join(' • ')}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="—"
                        value={v.barcode}
                        onChange={e => updateVariant(i, { barcode: e.target.value })}
                      />
                      <input
                        type="number"
                        className="form-input"
                        style={{ textAlign: 'right' }}
                        placeholder="0"
                        value={v.currentStock}
                        onChange={e => updateVariant(i, { currentStock: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        style={{ textAlign: 'right' }}
                        placeholder="Taban fiyat"
                        value={v.salePrice}
                        onChange={e => updateVariant(i, { salePrice: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => removeVariantRow(i)}
                        title="Varyantı kaldır"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {variants.length > 0 && (
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                  {variants.length} varyant • Toplam stok: {variants.reduce((s, v) => s + (Number(v.currentStock) || 0), 0)} • Boş fiyat = taban satış fiyatı geçerli
                </span>
              )}
            </>
          )}
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

        {/* 2026-10-12: ÜRÜN GÖRSELİ — SUNUCUYA YÜKLEME
            Dış URL yerine dosya seçilir; sunucu `data/uploads/products/`
            altına kaydeder. Yükleme ÖNCESİ istemcide küçültülür (en uzun kenar
            1200px, JPEG kalite 0.82): hem disk hem bant genişliği korunur.
            Eski dış URL'ler hâlâ çalışır (geriye dönük uyum). */}
        <div className="form-group">
          <label className="form-label">Ürün Görseli</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {formData.imageUrl ? (
              <img
                src={formData.imageUrl}
                alt="Önizleme"
                style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
            ) : null}
            <input
              ref={imageFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void handleImageFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => imageFileRef.current?.click()}
              disabled={imageUploading}
              title="Bilgisayarınızdan görsel seçin (otomatik küçültülür)"
            >
              <Upload size={13} />
              {imageUploading ? 'Yükleniyor…' : formData.imageUrl ? 'Görseli Değiştir' : 'Görsel Yükle'}
            </button>
            {formData.imageUrl && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleRemoveImage}
                title="Görseli kaldır"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {imageUploading && (
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
              Görsel küçültülüp yükleniyor…
            </span>
          )}
          {!formData.imageUrl && (
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
              Öneri: 1200px altı JPG/PNG. Dış URL de yapıştırılabilir:
            </span>
          )}
          {!formData.imageUrl && (
            <input
              type="url"
              className="form-input"
              style={{ marginTop: '4px' }}
              placeholder="https://… (isteğe bağlı, dış bağlantı)"
              value={imageUrlDraft}
              onChange={e => setImageUrlDraft(e.target.value)}
              onBlur={() => {
                if (imageUrlDraft.trim()) {
                  setFormData(prev => ({ ...prev, imageUrl: imageUrlDraft.trim() }));
                }
              }}
            />
          )}
          {imageInfo && (
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
              {imageInfo}
            </span>
          )}
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
