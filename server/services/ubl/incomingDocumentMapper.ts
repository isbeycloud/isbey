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
import type { Customer, Product, Tenant, ProductSupplierMapping } from '../../db/schema';
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

/**
 * Eşleşme yöntemi — kullanıcı "bu kart neden önerildi?" sorusunun cevabını
 * görsün. Sıra, `matchLine` içindeki arama sırasıdır ve GÜVENİ azalan sırada
 * değildir: barkod/satıcı kodu ve ÖĞRENİLMİŞ eşleştirme kesin sayılır; ad
 * benzerliği yalnız öneridir.
 */
export type LineMatchMethod =
  /** Kullanıcının daha önce bu tedarikçi için kaydettiği eşleştirme. */
  | 'SAVED_MAPPING'
  | 'BARCODE'
  | 'SELLER_CODE'
  | 'BUYER_CODE'
  | 'MANUFACTURER_CODE'
  | 'NAME';

export interface LineMatchSuggestion {
  line: ParsedUblLine;
  /** Önerilen stok kartı (kod/barkod/eşleştirme hafızası). */
  product?: Product;
  matchedBy?: LineMatchMethod;
  /**
   * Eşleşmenin GÜVENİLİRLİĞİ. `HIGH` ise toplu eşleştirmede "tümünü seç"
   * kapsamına girer; `SUGGESTION` yalnız kullanıcı onayıyla uygulanır.
   *
   * ⚠️ `matchedBy: 'NAME'` DAİMA `SUGGESTION`'dır — aynı adı taşıyan iki farklı
   * ürün olabilir ve sessiz otomatik eşleştirme yanlış stoğa mal girişi yapar.
   */
  confidence: 'HIGH' | 'SUGGESTION';
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
    /**
     * 2026-09-29 — ÖDENECEK toplam: KDV dahil toplam + KDV dışı vergiler.
     * **Alış faturasının yazacağı tutar budur.** Onay özeti bunu gösterir;
     * `computedGrandTotal` göstermek ÖTV'li belgede yanlış borç vaat ederdi.
     */
    computedPayableTotal?: number;
    /** KDV dışı vergilerin toplamı — yalnız varsa yazılır. */
    otherTaxTotal?: number;
    declaredSubTotal?: number;
    declaredVatTotal?: number;
    declaredPayable?: number;
  };
  /**
   * 2026-09-29 — Toplu eşleştirme sayaçları. Arayüz "42 / 47 eşleşti"
   * bilgisini BUNDAN üretir; kendi sayımını yaparsa iki yer ayrışabilir.
   */
  matchSummary?: {
    total: number;
    matched: number;
    /** Barkod/kod/eşleştirme hafızası ile KESİN eşleşenler — toplu seçim kapsamı. */
    highConfidence: number;
    pending: number;
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
 * SIRA ÖNEMLİ (2026-09-29'da genişletildi):
 *   1. ÖĞRENİLMİŞ EŞLEŞTİRME — kullanıcı bu tedarikçi+ürün kodu için daha önce
 *      karar verdi. En güvenilir kaynak: insan kararı.
 *   2. BARKOD — ürünün kimliği; üretici/global benzersiz.
 *   3. SATICI ÜRÜN KODU — tedarikçinin kendi kataloğundaki kod.
 *   4. ALICI (bizim eski) KODU.
 *   5. ÜRETİCİ KODU.
 *   6. AD — DOĞASI GEREĞİ zayıf; aynı adı taşıyan iki farklı ürün olabilir.
 *
 * ⚠️ `SAVED_MAPPING`ın barkoddan ÖNCE gelmesinin nedeni: eşleştirme hafızası
 * kullanıcının AÇIK kararıdır, otomatik bir sezgiden üstündür. Örneğin tedarikçi
 * barkodu yanlış yazmışsa (ya da barkod alanını kendi koduyla doldurmuşsa),
 * kullanıcı bir kez doğru kartı seçmiştir ve bu karar kalıcı olmalıdır.
 *
 * `supplierTaxNumber` verilmezse hafıza kademesi atlanır — başka bir
 * tedarikçinin öğrenilmiş eşleştirmesi BURADA KULLANILMAZ (tedarikçi kapsamlı).
 */
export function matchLine(
  line: ParsedUblLine,
  products: Product[],
  tenantId: string,
  savedMappings?: ProductSupplierMapping[],
  supplierTaxNumber?: string
): LineMatchSuggestion {
  const own = products.filter(p => (p.tenantId === tenantId || p.tenantId === undefined) && !p.deletedAt);

  // ── 1. Öğrenilmiş eşleştirme (tedarikçi + ürün kodu) ─────────────────────
  const vkn = normalizeTaxNumber(supplierTaxNumber);
  const seller = normalizeCode(line.sellerProductCode);
  if (vkn && (savedMappings || []).length > 0) {
    const kodlar = [
      line.sellerProductCode, line.barcode, line.buyerProductCode, line.manufacturerProductCode,
    ].filter((k): k is string => !!k && k.trim() !== '');

    for (const kod of kodlar) {
      const hedef = normalizeCode(kod);
      const kayit = (savedMappings || []).find(
        m =>
          (m.tenantId === tenantId || m.tenantId === undefined) &&
          normalizeTaxNumber(m.supplierTaxNumber) === vkn &&
          (normalizeCode(m.supplierProductCode) === hedef ||
            (m.barcode ? normalizeCode(m.barcode) === hedef : false))
      );
      if (!kayit) continue;
      const hit = own.find(p => p.id === kayit.localProductId);
      // Ürün silinmişse hafıza kaydı GEÇERSİZ sayılır; kullanıcıya eski bir
      // kart önermek, olmayan bir ürüne mal girişi denemesi demektir.
      if (hit) {
        return { line, product: hit, matchedBy: 'SAVED_MAPPING', confidence: 'HIGH', needsNewProduct: false };
      }
    }
  }

  // ── 2. Barkod ───────────────────────────────────────────────────────────
  const barcode = normalizeCode(line.barcode);
  if (barcode) {
    const hit = own.find(p => normalizeCode(p.barcode) === barcode);
    if (hit) return { line, product: hit, matchedBy: 'BARCODE', confidence: 'HIGH', needsNewProduct: false };
  }

  // ── 3. Satıcı ürün kodu ─────────────────────────────────────────────────
  if (seller) {
    const hit = own.find(p => normalizeCode(p.code) === seller);
    if (hit) return { line, product: hit, matchedBy: 'SELLER_CODE', confidence: 'HIGH', needsNewProduct: false };
  }

  // ── 4. Alıcı kodu ───────────────────────────────────────────────────────
  const buyer = normalizeCode(line.buyerProductCode);
  if (buyer) {
    const hit = own.find(p => normalizeCode(p.code) === buyer);
    if (hit) return { line, product: hit, matchedBy: 'BUYER_CODE', confidence: 'HIGH', needsNewProduct: false };
  }

  // ── 5. Üretici kodu (2026-09-29) ────────────────────────────────────────
  const uretici = normalizeCode(line.manufacturerProductCode);
  if (uretici) {
    const hit = own.find(
      p => normalizeCode(p.code) === uretici || normalizeCode(p.barcode) === uretici
    );
    if (hit) return { line, product: hit, matchedBy: 'MANUFACTURER_CODE', confidence: 'HIGH', needsNewProduct: false };
  }

  // ── 6. Ad — yalnız ÖNERİ ────────────────────────────────────────────────
  const nameKey = normalizeName(line.name);
  if (nameKey) {
    const hit = own.find(p => normalizeName(p.name) === nameKey);
    if (hit) return { line, product: hit, matchedBy: 'NAME', confidence: 'SUGGESTION', needsNewProduct: false };
  }

  return { line, confidence: 'SUGGESTION', needsNewProduct: true };
}

/**
 * Öğrenilmiş eşleştirme kaydının kimliği: tedarikçi VKN + ürün kodu.
 *
 * ⚠️ KAPSAM: Anahtar tedarikçiyi İÇERİR. Aynı ürün kodu iki farklı tedarikçide
 * farklı ürünlere karşılık gelebilir (ör. "1001"); global bir eşleştirme
 * hafızası bir tedarikçinin kararını diğerine uygular ve yanlış stoğa mal
 * girişi yapardı. Bu yüzden arama daima `supplierTaxNumber` ile birlikte yapılır.
 */
export interface MappingDecision {
  lineNo: string;
  supplierItemCode: string;
  barcode?: string;
  productId: string;
}

/**
 * Onaylanan kararlardan YAZILACAK eşleştirme kayıtlarını üretir (SAF).
 *
 * Yalnız kullanıcının AÇIKÇA bir ürün seçtiği satırlar öğrenilir. Otomatik
 * eşleşen satırlar öğrenilmez — aksi hâlde bir kez yapılan yanlış otomatik
 * eşleşme hafızaya yazılır ve KALICI hâle gelirdi.
 *
 * Mevcut kayıtlar güncellenir (aynı tedarikçi + kod → yeni ürün).
 */
export function buildMappingRecords(
  decisions: MappingDecision[],
  existing: ProductSupplierMapping[],
  ctx: { tenantId: string; supplierTaxNumber: string; now: string }
): ProductSupplierMapping[] {
  const vkn = normalizeTaxNumber(ctx.supplierTaxNumber);
  if (!vkn) return [];

  const out: ProductSupplierMapping[] = [];
  for (const d of decisions) {
    const kod = normalizeCode(d.supplierItemCode);
    if (!kod || !d.productId) continue;

    const mevcut = existing.find(
      m =>
        (m.tenantId === ctx.tenantId || m.tenantId === undefined) &&
        normalizeTaxNumber(m.supplierTaxNumber) === vkn &&
        normalizeCode(m.supplierProductCode) === kod
    );

    if (mevcut) {
      // Yalnız gerçekten değişen kayıtlar yazılır (gereksiz yazma = gereksiz
      // disk turu ve CRLF/format gürültüsü).
      if (mevcut.localProductId !== d.productId) {
        out.push({ ...mevcut, localProductId: d.productId, updatedAt: ctx.now });
      }
      continue;
    }

    out.push({
      id: `psm-${vkn}-${kod}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: ctx.tenantId,
      supplierTaxNumber: vkn,
      supplierProductCode: kod,
      ...(d.barcode ? { barcode: d.barcode } : {}),
      localProductId: d.productId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  }
  return out;
}

/**
 * Çözümlenmiş bir belgeden tam içeri aktarma planı çıkarır.
 *
 * `blockedReason` doluysa onay ekranı "içeri al" düğmesini KAPALI tutmalıdır.
 * Zorunlu koşullar: okunabilir belge, ETTN, en az bir kalem, tedarikçi VKN.
 */
export function buildIngestionPlan(
  doc: ParsedUblDocument,
  ctx: {
    customers: Customer[];
    products: Product[];
    tenantId: string;
    /** 2026-09-29: öğrenilmiş tedarikçi-ürün eşleştirmeleri (varsa). */
    savedMappings?: ProductSupplierMapping[];
  }
): IngestionPlan {
  const party = matchSupplier(doc, ctx.customers, ctx.tenantId);
  const lines = doc.lines.map(l =>
    matchLine(l, ctx.products, ctx.tenantId, ctx.savedMappings, doc.supplier.taxNumber)
  );

  // ── Toplu eşleştirme sayaçları (2026-09-29) ─────────────────────────────
  // Onay ekranı "42 / 47 eşleşti, 5 eşleşme bekliyor" bilgisini bundan üretir;
  // arayüzün kendi sayımı yapması iki yerde ayrışma riski taşırdı.
  const matchedCount = lines.filter(l => !!l.product).length;
  const highConfidenceCount = lines.filter(l => l.confidence === 'HIGH' && !!l.product).length;

  // ── DÖVİZ KAPISI (2026-09-29) ───────────────────────────────────────────
  // ⚠️ NEDEN ENGELLENİR: Alış faturası motoru (`DocumentConversionService
  // .createInvoice`) tutarları ve `currency` alanını TRY olarak yazar; kur
  // parametresi ALMAZ. 1.000 USD'lik bir belgeyi olduğu gibi geçirmek, cari
  // borcu ve stok maliyetini "1.000 TL" olarak diske yazardı — belgede yazan
  // para biriminden kat kat farklı, üstelik SESSİZ bir muhasebe hatası.
  //
  // Kur UYDURULMAZ (CLAUDE.md md.1: sahte başarı yok) ve muhasebe motoru
  // DEĞİŞTİRİLMEZ (md.3: muhasebe mantığı dokunulmaz). Doğru davranış, belgeyi
  // eksiksiz GÖSTERMEK ama TRY karşılığı doğrulanmadan içeri ALMAMAKTIR.
  //
  // Belge yine de tam okunur: para birimi, tutarlar ve kalemler detay
  // ekranında GERÇEK hâliyle görünür. Engellenen yalnız "içeri al" adımıdır.
  const doviz = (doc.currency || 'TRY').trim().toUpperCase();
  const dovizEngeli =
    doc.kind === 'INVOICE' && doviz !== 'TRY' && (doc.payableTotal > 0 || doc.grandTotal > 0)
      ? `Belge ${doviz} para biriminde düzenlenmiş. Alış faturası TL olarak kaydedildiği için, ` +
        `belgedeki tutarın TL karşılığı doğrulanmadan içeri alınamaz — aksi hâlde ${doviz} tutarı ` +
        `TL gibi yazılır ve tedarikçi borcu yanlış oluşur. Belgeyi TL karşılığı üzerinden elle ` +
        `faturalandırın veya entegratörden TL düzenlenmiş belgeyi çekin.`
      : undefined;

  return {
    document: doc,
    party,
    lines,
    totals: {
      computedSubTotal: doc.subTotal,
      computedVatTotal: doc.vatTotal,
      computedGrandTotal: doc.grandTotal,
      // ⚠️ Cari borcun yazılacağı tutar: KDV dışı vergiler DAHİL (ÖTV, damga).
      computedPayableTotal: doc.payableTotal,
      ...(doc.declaredSubTotal !== undefined ? { declaredSubTotal: doc.declaredSubTotal } : {}),
      ...(doc.declaredVatTotal !== undefined ? { declaredVatTotal: doc.declaredVatTotal } : {}),
      ...(doc.declaredPayable !== undefined ? { declaredPayable: doc.declaredPayable } : {}),
      ...(doc.taxBreakdown && doc.taxBreakdown.otherTaxes.length > 0
        ? { otherTaxTotal: Math.round(doc.taxBreakdown.otherTaxes.reduce((s, t) => s + t.amount, 0) * 100) / 100 }
        : {}),
    },
    matchSummary: {
      total: lines.length,
      matched: matchedCount,
      highConfidence: highConfidenceCount,
      pending: lines.length - matchedCount,
    },
    // Engelleme nedeni: önce belgenin kendi okunamama hatası (daha temel),
    // yoksa döviz kapısı. İkisi birden varsa kullanıcıya ÖNCE belgenin kendi
    // sorunu söylenir; döviz notu ondan sonra anlamlıdır.
    ...(doc.errors.length > 0
      ? { blockedReason: doc.errors[0] }
      : dovizEngeli
      ? { blockedReason: dovizEngeli }
      : {}),
  };
}

/**
 * Belgedeki iskontoyu, fatura motorunun anlayacağı YÜZDEye çevirir.
 *
 * ⚠️ NEDEN GEREKLİ: `DocumentConversionService.createInvoice` satır netini
 * `miktar × birimFiyat` üzerinden KENDİ hesaplar ve iskontoyu yüzde olarak
 * bekler. Belgede iskonto varsa ve biz yalnız brüt birim fiyatı geçirsek, fatura
 * motoru iskontosuz hesap yapar → alış faturası tedarikçi belgesinden DAHA
 * YÜKSEK çıkar. Cari borç ve stok maliyeti şişer, dönem sonu bilanço tutmaz.
 *
 * Yüzde, belgenin KENDİ tutarlarından türetilir (`iskonto / brüt`); uydurma
 * bir oran atanmaz. Yuvarlama 6 hanede tutulur ki yuvarlama hatası bir kuruşun
 * altında kalsın.
 *
 * Belgede iskonto yoksa `undefined` döner — fatura motorunun varsayılanı (0)
 * uygulanır, yani hiçbir şey değişmez.
 */
export function discountPercentForLine(line: ParsedUblLine): number | undefined {
  if (line.discountAmount === undefined || line.discountAmount <= 0) return undefined;
  const brut = line.grossBeforeDiscount ?? (line.lineTotal + line.discountAmount);
  if (!brut || brut <= 0) return undefined;
  const yuzde = Math.round((line.discountAmount / brut) * 100 * 1e6) / 1e6;
  return yuzde > 0 ? yuzde : undefined;
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
  // 2026-09-29: adres/telefon/e-posta da belgeden taşınır — tedarikçi kartını
  // elle doldurmak zorunda kalmak, gerçek veriyi girmeyi atlatmanın en kolay
  // yoludur. Belgede YOKSA alan yazılmaz; boş dize uydurulmaz (aksi hâlde
  // "belgeden geldi" sanılan ama aslında boş olan alanlar oluşurdu).
  const p = doc.supplier;
  const adres = [p.street, p.postalZone, p.district, p.city].filter(Boolean).join(' ');
  return {
    tenantId: tenant.id,
    title: p.title || `Tedarikçi ${p.taxNumber}`,
    taxNumber: p.taxNumber,
    taxOffice: p.taxOffice || '',
    city: p.city || '',
    district: p.district || '',
    ...(adres ? { address: adres } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.email ? { email: p.email } : {}),
    type: 'SUPPLIER',
    currency: doc.currency || 'TRY',
    balance: 0,
    totalDebit: 0,
    totalCredit: 0,
    active: true,
  };
}
