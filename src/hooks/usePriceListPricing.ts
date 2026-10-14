/**
 * İŞBEY CLOUD — Fiyat Listesi Fiyatlama Hook'u
 * ============================================
 * 2026-10-12: Fiyat listesi mantığının TEK istemci kopyası.
 *
 * NEDEN HOOK: Aynı davranış beş ayrı belge ekranında gerekir (fatura, teklif,
 * sipariş, irsaliye, POS). Kopyalansaydı "cari değişince fiyat yenilenir mi",
 * "elle girilen fiyat korunur mu" gibi kararlar ekran ekran kayabilir ve aynı
 * cari farklı belgelerde farklı fiyat görebilirdi.
 *
 * SORUMLULUKLAR:
 *  - Tenant'ın aktif fiyat listelerini yükler (hata belgeyi ENGELLEMEZ).
 *  - Bir satır eklendiğinde doğru birim fiyatı çözer (bkz. utils/priceResolver).
 *  - Cari/liste değişince, kullanıcının ELLE DOKUNMADIĞI satırları yeniden
 *    fiyatlar; elle düzenlenen fiyat asla sessizce ezilmez.
 *
 * ELLE DÜZENLEME ÖLÇÜTÜ: Satırın birim fiyatı, eklendiği andaki çözülmüş
 * fiyattan farklıysa satır "elle düzenlenmiş" sayılır ve yeniden fiyatlanmaz.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Customer, PriceList, Product, ProductVariant } from '../types';
import { api } from '../services/api';
import { resolveUnitPrice } from '../utils/priceResolver';

interface UsePriceListPricingParams {
  /** Modal açık mı — liste yükleme ve iz sıfırlama buna bağlıdır. */
  isOpen: boolean;
  /** Seçili cari; carinin `priceListId` alanı fiyatı belirler. */
  customer: Customer | null;
  /** Alış belgesi mi? true ise fiyat listesi UYGULANMAZ. */
  isPurchase?: boolean;
}

interface UsePriceListPricingResult {
  priceLists: PriceList[];
  /**
   * Belgeye eklenen ürün için birim fiyatı çözer (2026-10-12: varyant dahil).
   * Dönen `priceListId` satıra İZ olarak yazılabilir.
   */
  resolvePrice: (product: Product, variant?: ProductVariant | null) => { unitPrice: number; priceListId?: string; discountRate: number };
  /**
   * Sepete eklenen ürünlerin "el değmemiş" fiyatını kaydeder.
   * Satır eklendikten SONRA çağrılmalıdır.
   */
  trackProduct: (product: Product, unitPrice: number, variant?: ProductVariant | null) => void;
  /**
   * Cari veya liste değişiminde uygulanacak yeniden fiyatlama fonksiyonu.
   * Belge kendi satır tipini bilir; bu yüzden satır güncellemesi dışarıdan
   * verilir (satır biçimleri belgeye göre farklı: InvoiceItem/QuoteItem/…).
   */
  repriceItems: <T extends { productId: string; variantId?: string; unitPrice: number }>(
    items: T[],
    applyPrice: (item: T, unitPrice: number, priceListId?: string) => T
  ) => T[];
}

export function usePriceListPricing({
  isOpen,
  customer,
  isPurchase = false,
}: UsePriceListPricingParams): UsePriceListPricingResult {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);

  /** Sepete giren ürünler (ref: effect içinde bayat closure olmasın). */
  const knownProductsRef = useRef<Record<string, Product>>({});
  /** Satırın varyantı (satır anahtarı ürün+varyant). */
  const knownVariantsRef = useRef<Record<string, ProductVariant | undefined>>({});
  /** Satırın eklendiği andaki çözülmüş fiyatı — elle düzenlemeyi ayırt eder. */
  const pristinePricesRef = useRef<Record<string, number>>({});
  const previousKeyRef = useRef<string | null>(null);

  /**
   * 2026-10-12: Satır anahtarı ürün+varyanttır. Aynı ürün farklı varyantla
   * ayrı satır olur; yeniden fiyatlamada varyant karışmaz.
   */
  const rowKey = (productId: string, variantId?: string) =>
    variantId ? `${productId}::${variantId}` : productId;

  useEffect(() => {
    if (!isOpen) return;
    // Fiyat listesi yükleme hatası belge kesmeyi ENGELLEMEZ: liste yoksa
    // satırlar ürünün taban fiyatından fiyatlanır (mevcut davranış korunur).
    api.getPriceLists({ activeOnly: true })
      .then(res => { if (res.success) setPriceLists(res.priceLists); })
      .catch(err => console.error(err));
  }, [isOpen]);

  // Yeni belge açılışında izleri sıfırla; aksi hâlde önceki oturumun kaydı
  // yanlış satırı "el değmemiş" sayıp fiyatını ezebilirdi.
  useEffect(() => {
    if (isOpen) return;
    knownProductsRef.current = {};
    knownVariantsRef.current = {};
    pristinePricesRef.current = {};
    previousKeyRef.current = null;
  }, [isOpen]);

  const resolvePrice = useCallback(
    (product: Product, variant?: ProductVariant | null) => {
      const resolved = resolveUnitPrice(product, priceLists, customer, isPurchase, variant);
      return {
        unitPrice: resolved.unitPrice,
        priceListId: resolved.priceListId,
        discountRate: resolved.discountRate,
      };
    },
    [priceLists, customer, isPurchase]
  );

  const trackProduct = useCallback((product: Product, unitPrice: number, variant?: ProductVariant | null) => {
    knownProductsRef.current[product.id] = product;
    const key = rowKey(product.id, variant?.id);
    knownProductsRef.current[key] = product;
    knownVariantsRef.current[key] = variant || undefined;
    pristinePricesRef.current[key] = unitPrice;
  }, []);

  const repriceItems = useCallback(
    <T extends { productId: string; variantId?: string; unitPrice: number }>(
      items: T[],
      applyPrice: (item: T, unitPrice: number, priceListId?: string) => T
    ): T[] => {
      // Cari VEYA fiyat listesi değişmediyse hiçbir şey yapma (yan etki yok).
      const key = `${customer?.id ?? ''}|${customer?.priceListId ?? ''}|${priceLists.length}`;
      if (previousKeyRef.current === key) return items;
      const previousKey = previousKeyRef.current;
      previousKeyRef.current = key;

      // Belge ilk açıldığında (cari yokken) yeniden fiyatlama yapılmaz.
      if (previousKey === null && !customer) return items;

      let changed = false;
      const next = items.map(item => {
        // 2026-10-12: Varyantlı satır kendi anahtarıyla izlenir.
        const key = rowKey(item.productId, item.variantId);
        const product = knownProductsRef.current[key] || knownProductsRef.current[item.productId];
        if (!product) return item;
        const variant = knownVariantsRef.current[key];

        // Elle düzenlenmiş satıra DOKUNMA: kullanıcı iskontoyu/fiyatı bilerek
        // girmiş olabilir; cari değişti diye sessizce ezilemez.
        const pristine = pristinePricesRef.current[key];
        if (pristine !== undefined && Math.abs(item.unitPrice - pristine) > 0.0001) return item;

        const resolved = resolveUnitPrice(product, priceLists, customer, isPurchase, variant);
        if (Math.abs(resolved.unitPrice - item.unitPrice) < 0.0001) return item;

        pristinePricesRef.current[key] = resolved.unitPrice;
        changed = true;
        return applyPrice(item, resolved.unitPrice, resolved.priceListId);
      });

      return changed ? next : items;
    },
    [customer, priceLists, isPurchase]
  );

  return { priceLists, resolvePrice, trackProduct, repriceItems };
}
