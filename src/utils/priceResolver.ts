/**
 * İŞBEY CLOUD — Fiyat Çözümleyici (Fiyat Listesi Mantığı)
 * ======================================================
 * 2026-10-12: Belge satırlarının birim fiyatını TEK yerden çözer.
 *
 * NEDEN TEK KAYNAK: Fiyat ataması eskiden her belgede ayrı ayrı yazılıydı
 * (`NewInvoiceModal`, `QuoteModal`, `WaybillModal`, `POSSalesView`,
 * `HizliInvoiceCreateModal`). Fiyat listesi mantığı bu noktalara kopyalansaydı
 * beş ayrı yerde kayabilir ve farklı belgeler aynı cariye farklı fiyat
 * verebilirdi. Bu modül tek karar noktasıdır.
 *
 * KURAL SIRASI (ilk bulunan kazanır):
 *   1. Cariye bağlı fiyat listesinde ürünün fiyatı varsa → o fiyat
 *   2. Cariye bağlı liste yoksa, VARSAYILAN listede ürünün fiyatı varsa → o fiyat
 *   3. Hiçbiri yoksa → ürünün taban `salePrice`'ı (mevcut davranış)
 *
 * Alış belgelerinde (`purchasePrice`) fiyat listesi UYGULANMAZ: satış fiyat
 * listesi alış fiyatını belirlemez. Alışta yalnız ürünün alış fiyatı kullanılır.
 */

import type { Customer, PriceList, Product, ProductPriceEntry, ProductVariant } from '../types';

export interface ResolvedPrice {
  /** Satırda kullanılacak birim fiyat (KDV hariç). */
  unitPrice: number;
  /** Fiyatın hangi listeden geldiği (yoksa undefined = taban fiyat). */
  priceListId?: string;
  /** Listeye özel iskonto (%) — satırda ön doldurulur. */
  discountRate: number;
  /** Fiyatın kaynağı — arayüzde "neden bu fiyat" göstergesi için. */
  source: 'VARIANT_LIST' | 'VARIANT_PRICE' | 'PRICE_LIST' | 'DEFAULT_LIST' | 'BASE_PRICE';
}

/** Ürünün verilen listedeki fiyat girdisini bulur. */
function findEntry(product: Product, priceListId: string | undefined): ProductPriceEntry | undefined {
  if (!priceListId) return undefined;
  return (product.salePrices || []).find(e => e.priceListId === priceListId);
}

/**
 * Cariye, ürüne ve VARYANTA göre satır fiyatını çözer.
 *
 * KURAL SIRASI (ilk bulunan kazanır) — 2026-10-12 varyant genişletmesi:
 *   0. Varyantın listeye özel fiyatı → `VARIANT_LIST`
 *   1. Varyantın kendi fiyatı → `VARIANT_PRICE`
 *   2. Ürünün carinin listesindeki fiyatı → `PRICE_LIST`
 *   3. Ürünün varsayılan listedeki fiyatı → `DEFAULT_LIST`
 *   4. Ürünün taban `salePrice`'ı → `BASE_PRICE` (mevcut davranış)
 *
 * @param product      Belgeye eklenen ürün.
 * @param priceLists   Tenant'ın fiyat listeleri (varsayılan arama için).
 * @param customer     Seçili cari (yoksa taban fiyat kullanılır).
 * @param isPurchase   Alış belgesi mi? true ise fiyat listesi UYGULANMAZ.
 * @param variant      Seçili varyant (yoksa ürün seviyesinden çözülür).
 */
export function resolveUnitPrice(
  product: Product,
  priceLists: PriceList[],
  customer?: Customer | null,
  isPurchase = false,
  variant?: ProductVariant | null
): ResolvedPrice {
  const basePrice = isPurchase
    ? (variant?.purchasePrice ?? product.purchasePrice)
    : (variant?.salePrice ?? product.salePrice);

  // Alış: fiyat listesi satış fiyatıdır, alışı belirlemez.
  if (isPurchase) {
    return {
      unitPrice: Number(basePrice) || 0,
      discountRate: 0,
      source: variant ? 'VARIANT_PRICE' : 'BASE_PRICE',
    };
  }

  // 0) Varyantın listeye özel fiyatı (varyant × liste matrisi)
  if (variant) {
    const variantEntry = (variant.salePrices || []).find(e => e.priceListId === customer?.priceListId);
    if (variantEntry && customer?.priceListId) {
      return {
        unitPrice: Number(variantEntry.salePrice) || 0,
        priceListId: variantEntry.priceListId,
        discountRate: Number(variantEntry.discountRate) || 0,
        source: 'VARIANT_LIST',
      };
    }
    const defaultList = priceLists.find(l => l.isDefault && l.active !== false);
    if (defaultList) {
      const variantDefault = (variant.salePrices || []).find(e => e.priceListId === defaultList.id);
      if (variantDefault) {
        return {
          unitPrice: Number(variantDefault.salePrice) || 0,
          priceListId: variantDefault.priceListId,
          discountRate: Number(variantDefault.discountRate) || 0,
          source: 'VARIANT_LIST',
        };
      }
    }

    // 1) Varyantın kendi fiyatı
    if (variant.salePrice !== undefined && variant.salePrice !== null) {
      return {
        unitPrice: Number(variant.salePrice) || 0,
        discountRate: 0,
        source: 'VARIANT_PRICE',
      };
    }
  }

  // 2) Carinin kendi listesi (ürün seviyesi)
  const customerEntry = findEntry(product, customer?.priceListId);
  if (customerEntry) {
    return {
      unitPrice: Number(customerEntry.salePrice) || 0,
      priceListId: customerEntry.priceListId,
      discountRate: Number(customerEntry.discountRate) || 0,
      source: 'PRICE_LIST',
    };
  }

  // 3) Varsayılan liste (yalnız aktifler)
  const defaultList = priceLists.find(l => l.isDefault && l.active !== false);
  if (defaultList) {
    const defaultEntry = findEntry(product, defaultList.id);
    if (defaultEntry) {
      return {
        unitPrice: Number(defaultEntry.salePrice) || 0,
        priceListId: defaultEntry.priceListId,
        discountRate: Number(defaultEntry.discountRate) || 0,
        source: 'DEFAULT_LIST',
      };
    }
  }

  // 4) Taban fiyat — mevcut davranış korunur
  return {
    unitPrice: Number(basePrice) || 0,
    discountRate: 0,
    source: 'BASE_PRICE',
  };
}

/**
 * Belirli bir listedeki fiyatı doğrudan okur (kullanıcı satırda listeyi elle
 * değiştirdiğinde kullanılır). Liste fiyatı yoksa taban fiyata düşer.
 */
export function resolvePriceForList(
  product: Product,
  priceListId: string | undefined,
  isPurchase = false
): ResolvedPrice {
  if (isPurchase || !priceListId) {
    return {
      unitPrice: Number(isPurchase ? product.purchasePrice : product.salePrice) || 0,
      discountRate: 0,
      source: 'BASE_PRICE',
    };
  }

  const entry = findEntry(product, priceListId);
  if (entry) {
    return {
      unitPrice: Number(entry.salePrice) || 0,
      priceListId: entry.priceListId,
      discountRate: Number(entry.discountRate) || 0,
      source: 'PRICE_LIST',
    };
  }

  return {
    unitPrice: Number(product.salePrice) || 0,
    discountRate: 0,
    source: 'BASE_PRICE',
  };
}

/** Bir listenin para birimi/etiketi için okunabilir ad (arayüz gösterimi). */
export function priceListName(priceLists: PriceList[], priceListId?: string): string {
  if (!priceListId) return 'Taban Fiyat';
  return priceLists.find(l => l.id === priceListId)?.name || 'Bilinmeyen Liste';
}
