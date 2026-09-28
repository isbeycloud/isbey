/**
 * GELEN BELGE EŞLEŞTİRİCİ
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 — Gelen e-Fatura / e-İrsaliye içeri aktarma için yazıldı.
 *
 * NE YAPAR: `ublParser` çıktısını (saf belge) İŞBEY'nin kendi kayıtlarına
 * bağlar. İki yönlü eşleştirme yapar ama HİÇBİR ŞEY YARATMAZ:
 *
 *   1. Belgedeki tedarikçi VKN'si → mevcut cari kartı (yoksa "yeni gerekli")
 *   2. Belgedeki satıcı ürün kodu/barkod → mevcut stok kartı
 *
 * TASARIM KURALI — SADECE ÖNERİR, YARATMAZ: Eşleşmeyen tedarikçi veya ürün
 * için otomatik kayıt AÇILMAZ (eski davranış "Genel Ticari Mal Alışı" adında
 * uydurma kart açıyordu). Öneri listesi onay ekranına gider; kart açma kararı
 * kullanıcınındır.
 *
 * TASARIM KURALI — STOK/CARİ YAZMAZ: Bu modül saf fonksiyonlardan oluşur.
 * Stok ve cari yalnız onay anında `DocumentConversionService.createInvoice`
 * üzerinden hareket görür (bkz. `incomingInvoiceService`).
 */
import type { Customer, Product, Tenant } from '../../db/schema';
import type { ParsedUblDocument, ParsedUblLine } from './ublParser';

/** Onay ekranında kullanıcıya sunulan eşleştirme önerisi. */
export interface PartyMatchSuggestion {
  /** Kesin eşleşme var mı (VKN birebir). */
  exact: boolean;
  /** Önerilen cari kartı. */
  customer?: Customer;
  /** Belgedeki VKN ile eşleşen başka kayıt yoksa doldurulur. */
  reason?: string;
}

export interface LineMatchSuggestion {
  line: ParsedUblLine;
  /** Önerilen stok kartı (kod/barkod eşleşmesi). */
  product?: Product;
  /** Eşleşme yöntemi — kullanıcı neden bu kartın önerildiğini görsün. */
  matchedBy?: 'SELLER_CODE' | 'BARCODE' | 'BUYER_CODE' | 'NAME';
  /** Hiçbir kart bulunamadıysa `true`; onay ekranı "yeni kart aç" sunar. */
  needsNewProduct: boolean;
}

export interface IngestionPlan {
  document: ParsedUblDocument;
  party: PartyMatchSuggestion;
  lines: LineMatchSuggestion[];
  /**
   * Toplamlar. `*Computed` kalemlerden hesaplanır, `*Declared` belgenin kendi
   * bildirdiğidir. Onay ekranı ikisini gösterir; fark `document.warnings`'te.
   */
  totals: {
    computedSubTotal: number;
    computedVatTotal: number;
    computedGrandTotal: number;
    declaredSubTotal?: number;
    declaredVatTotal?: number;
    declaredPayable?: number;
  };
  /** İçeri aktarma engelliyse neden (boş = aktarılabilir). */
  blockedReason?: string;
}

/** Karşılaştırma için VKN/TCKN'yi sadeleştirir (boşluk, nokta, tire atılır). */
function normalizeTaxNumber(raw: string | undefined): string {
  return (raw || '').replace(/[^0-9]/g, '');
}

/** Karşılaştırma için ürün kodunu sadeleştirir. */
function normalizeCode(raw: string | undefined): string {
  return (raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Ürün adını karşılaştırmaya hazırlar (Türkçe küçük harf + boşluk sadeleştirme). */
function normalizeName(raw: string | undefined): string {
  return (raw || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:()\[\]'"]/g, '');
}

/**
 * Belgedeki tedarikçiyi mevcut cari kartlarıyla eşleştirir.
 *
 * Önce VKN birebir aranır (kesin eşleşme). Bulunamazsa unvan benzerliğine
 * bakılır — ama bu ÖNERİ sınıfındadır (`exact: false`) ve kullanıcı onayı
 * olmadan kullanılmaz; yanlış cariye borç yazmak ciddi bir hatadır.
 */
export function matchSupplier(
  doc: ParsedUblDocument,
  customers: Customer[],
  tenantId: string
): PartyMatchSuggestion {
  const own = customers.filter(c => c.tenantId === tenantId || c.tenantId === undefined);
  const vkn = normalizeTaxNumber(doc.supplier.taxNumber);

  if (vkn) {
    const byTax = own.find(c => normalizeTaxNumber(c.taxNumber) === vkn);
    if (byTax) return { exact: true, customer: byTax };
  }

  const titleKey = normalizeName(doc.supplier.title);
  if (titleKey) {
    const byName = own.find(c => normalizeName(c.title) === titleKey);
    if (byName) {
      return {
        exact: false,
        customer: byName,
        reason: 'VKN eşleşmedi; unvan benzerliğine göre önerildi. Lütfen doğrulayın.',
      };
    }
  }

  return {
    exact: false,
    reason: `"${doc.supplier.title || 'Unvansız'}" (${doc.supplier.taxNumber || 'VKN yok'}) için kayıtlı cari bulunamadı. Yeni tedarikçi kartı açmanız gerekecek.`,
  };
}

/**
 * Tek bir belge satırını stok kartlarıyla eşleştirir.
 *
 * SIRA ÖNEMLİ: satıcı ürün kodu → barkod → alıcı kodu → ad. İlk üçü kesin
 * kimliktir. Ada göre eşleşme DOĞASI GEREĞİ zayıftır (aynı adı taşıyan iki
 * farklı ürün olabilir) ve yalnızca SON ÇARE olarak önerilir.
 */
export function matchLine(
  line: ParsedUblLine,
  products: Product[],
  tenantId: string
): LineMatchSuggestion {
  const own = products.filter(p => (p.tenantId === tenantId || p.tenantId === undefined) && !p.deletedAt);

  const seller = normalizeCode(line.sellerProductCode);
  if (seller) {
    const hit = own.find(p => normalizeCode(p.code) === seller);
    if (hit) return { line, product: hit, matchedBy: 'SELLER_CODE', needsNewProduct: false };
  }

  const barcode = normalizeCode(line.barcode);
  if (barcode) {
    const hit = own.find(p => normalizeCode(p.barcode) === barcode);
    if (hit) return { line, product: hit, matchedBy: 'BARCODE', needsNewProduct: false };
  }

  const buyer = normalizeCode(line.buyerProductCode);
  if (buyer) {
    const hit = own.find(p => normalizeCode(p.code) === buyer);
    if (hit) return { line, product: hit, matchedBy: 'BUYER_CODE', needsNewProduct: false };
  }

  const nameKey = normalizeName(line.name);
  if (nameKey) {
    const hit = own.find(p => normalizeName(p.name) === nameKey);
    if (hit) return { line, product: hit, matchedBy: 'NAME', needsNewProduct: false };
  }

  return { line, needsNewProduct: true };
}

/**
 * Çözümlenmiş bir belgeden tam içeri aktarma planı çıkarır.
 *
 * `blockedReason` doluysa onay ekranı "içeri al" düğmesini KAPALI tutmalıdır.
 * Zorunlu koşullar: okunabilir belge, ETTN, en az bir kalem, tedarikçi VKN.
 */
export function buildIngestionPlan(
  doc: ParsedUblDocument,
  ctx: { customers: Customer[]; products: Product[]; tenantId: string }
): IngestionPlan {
  const party = matchSupplier(doc, ctx.customers, ctx.tenantId);
  const lines = doc.lines.map(l => matchLine(l, ctx.products, ctx.tenantId));

  return {
    document: doc,
    party,
    lines,
    totals: {
      computedSubTotal: doc.subTotal,
      computedVatTotal: doc.vatTotal,
      computedGrandTotal: doc.grandTotal,
      ...(doc.declaredSubTotal !== undefined ? { declaredSubTotal: doc.declaredSubTotal } : {}),
      ...(doc.declaredVatTotal !== undefined ? { declaredVatTotal: doc.declaredVatTotal } : {}),
      ...(doc.declaredPayable !== undefined ? { declaredPayable: doc.declaredPayable } : {}),
    },
    ...(doc.errors.length > 0 ? { blockedReason: doc.errors[0] } : {}),
  };
}

/**
 * Belgeden yeni stok kartı taslağı üretir (KAYDETMEZ).
 *
 * Onay ekranında "yeni kart aç" seçildiğinde kullanıcıya GÖSTERİLECEK değerler
 * buradan gelir. Kaydetme kararı ve işlemi çağıranındır. Alış fiyatı belgedeki
 * birim fiyattır; satış fiyatı UYDURULMAZ (boş bırakılır, kullanıcı girer).
 */
export function draftProductFromLine(line: ParsedUblLine): Partial<Product> {
  return {
    code: line.sellerProductCode || line.barcode || '',
    name: line.name,
    unit: line.unitName,
    purchasePrice: line.unitPrice,
    vatRate: line.vatRate,
    currentStock: 0,
    stock: 0,
    criticalStock: 0,
    warehouseId: 'wh-default',
    active: true,
  };
}

/**
 * Belgeden yeni tedarikçi cari kartı taslağı üretir (KAYDETMEZ).
 *
 * Unvan/VKN doğrudan belgeden gelir; vergi dairesi ve adres belgede varsa
 * kullanılır. Cari tipi `SUPPLIER`'dır — alış faturası tedarikçi borcunu
 * büyütür.
 */
export function draftSupplierFromDocument(doc: ParsedUblDocument, tenant: Tenant): Partial<Customer> {
  return {
    tenantId: tenant.id,
    title: doc.supplier.title || `Tedarikçi ${doc.supplier.taxNumber}`,
    taxNumber: doc.supplier.taxNumber,
    taxOffice: doc.supplier.taxOffice || '',
    city: doc.supplier.city || '',
    district: doc.supplier.district || '',
    type: 'SUPPLIER',
    currency: doc.currency || 'TRY',
    balance: 0,
    totalDebit: 0,
    totalCredit: 0,
    active: true,
  };
}
