/**
 * UBL-TR BELGE ÇÖZÜMLEYİCİ (anlam katmanı)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 — Gelen e-Fatura / e-İrsaliye içeri aktarma için yazıldı.
 *
 * NE YAPAR: `parseUblTree` ile kurulan ham ağacı UBL-TR iş nesnesine çevirir:
 * taraf (VKN/unvan), ETTN, belge no, tarih, kalemler (miktar, birim, birim
 * fiyat, KDV oranı ve tutarı) ve belge toplamları.
 *
 * NEDEN GEREKLİYDİ: Bu modülden önce gelen bir e-Fatura TEK SATIRA indiriliyor,
 * adı "Gelen Mal / Hizmet Kalemi", miktarı 1, KDV'si sabit %20 yazılıyordu.
 * Yani 10 kalemli, %1/%10 KDV'li bir faturanın içeriği tamamen kayboluyordu.
 * Artık gerçek kalemler belgeden okunur.
 *
 * İÇERİK DOĞRULAMASI (önemli): Belgenin kendi bildirdiği `PayableAmount`, kalem
 * toplamlarından hesaplananla karşılaştırılır. Tutmazsa ayrıştırma SESSİZ
 * KALMAZ; `warnings` alanına yazılır ve kullanıcı onay ekranında görür. Aksi
 * hâlde yanlış okunmuş bir belge, doğru sanılarak muhasebeye işlenirdi.
 *
 * KURAL: Bu modül HİÇBİR ŞEY YAZMAZ (ne DB ne dosya). Saf dönüşümdür; yan
 * etkiler çağırana aittir.
 */
import {
  attrOf, childOf, childrenOf, decodeXmlText, findFirst, formatAmount,
  parseUblTree, textOf, type XmlNode,
} from './ublTree';

export type UblDocumentKind = 'INVOICE' | 'DESPATCH';

export interface ParsedUblParty {
  /** VKN veya TCKN. */
  taxNumber: string;
  /** `schemeID` — 'VKN' | 'TCKN' | ''. */
  scheme: string;
  title: string;
  taxOffice?: string;
  city?: string;
  district?: string;
}

export interface ParsedUblLine {
  /** Belgedeki sıra numarası (`cbc:ID`). */
  lineNo: string;
  /** Satıcının ürün kodu — stok eşleştirmesi bununla yapılır. */
  sellerProductCode?: string;
  /** Satıcının ürün kodu (alıcınınki varsa) — bazı profillerde `BuyersItemIdentification`. */
  buyerProductCode?: string;
  /** Barkod (varsa). */
  barcode?: string;
  name: string;
  quantity: number;
  /** UBL birim kodu (`C62`). */
  unitCode?: string;
  /** Çözülmüş birim adı (`Adet`). */
  unitName: string;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  /** KDV hariç satır tutarı. */
  lineTotal: number;
  /** KDV dahil satır tutarı. */
  grossLineTotal: number;
}

export interface ParsedUblDocument {
  kind: UblDocumentKind;
  /** ETTN. Boşsa belge içeri aktarılamaz (bkz. `canIngest`). */
  uuid: string;
  documentNo: string;
  issueDate: string;
  currency: string;
  profile?: string;
  /** SATIS / IADE / SEVK / TEMELFATURA gibi profil-tip kodu. */
  typeCode?: string;
  supplier: ParsedUblParty;
  customer: ParsedUblParty;
  lines: ParsedUblLine[];
  /** Kalemlerden hesaplanan KDV hariç toplam. */
  subTotal: number;
  /** Kalemlerden hesaplanan toplam KDV. */
  vatTotal: number;
  /** Kalemlerden hesaplanan KDV dahil toplam. */
  grandTotal: number;
  /** Belgenin kendi bildirdiği ödenecek tutar (varsa). */
  declaredPayable?: number;
  /** Belgenin kendi bildirdiği KDV hariç toplam (varsa). */
  declaredSubTotal?: number;
  /** Belgenin kendi bildirdiği toplam KDV (varsa). */
  declaredVatTotal?: number;
  /**
   * İçeri aktarmayı engelleyen durumlar (ETTN yok, kalem yok, bozuk XML).
   * Boş dizi = belge kullanılabilir.
   */
  errors: string[];
  /** Engellemeyen ama kullanıcıya gösterilmesi gereken durumlar. */
  warnings: string[];
}

/** UBL birim kodu → Türkçe birim adı. `mapUnitToUbl`'in tersidir. */
const UBL_UNIT_TO_NAME: Record<string, string> = {
  C62: 'Adet', NAR: 'Adet', KGM: 'Kg', GRM: 'Gram', LTR: 'Litre', MTR: 'Metre',
  BX: 'Kutu', PK: 'Paket', TNE: 'Ton', DAY: 'Gün', HUR: 'Saat', MON: 'Ay',
  SET: 'Set', KWH: 'kWh', MTK: 'm²', MTQ: 'm³', CMT: 'Santimetre', MLT: 'Mililitre',
};

/** UBL birim kodunu okunabilir ada çevirir; bilinmeyen kod olduğu gibi kalır. */
export function unitNameFromUbl(code?: string): string {
  if (!code) return 'Adet';
  return UBL_UNIT_TO_NAME[code.toUpperCase()] || code;
}

/**
 * Sayı metnini okur. Geçersiz/boş → undefined (0'a düşürmek sessiz yanlış üretir).
 *
 * BİÇİM NOTU: UBL `5.00` (nokta) kullanır ama Türkçe hazırlanmış belgelerde
 * `5.000,50` görülebilir. İkisi de doğru okunmalı; bu yüzden virgül/nokta
 * ayrımı KONUMA göre yapılır: en sağdaki ayraç ondalık kabul edilir, ondan
 * önceki ayraçlar binlik ayraç sayılır. Basit `replace(',', '.')` yaklaşımı
 * `5.000,50` gibi bir değeri sessizce NaN yapıyordu.
 */
function toNum(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  let s = raw.replace(/\s/g, '').replace(/[₺$€]/g, '');
  if (s === '') return undefined;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Her ikisi de var: sağdaki ondalıktır, soldaki binlik ayraçtır.
    if (lastComma > lastDot) {
      s = s.slice(0, lastComma).replace(/\./g, '') + '.' + s.slice(lastComma + 1);
    } else {
      s = s.slice(0, lastDot).replace(/,/g, '') + '.' + s.slice(lastDot + 1);
    }
  } else if (lastComma > -1) {
    // Yalnız virgül. `1,234` Türkçe'de ondalıktır (binlik nokta ile yazılır).
    s = s.replace(',', '.');
  }
  const value = Number(s);
  return Number.isFinite(value) ? value : undefined;
}

/** `cac:Party` düğümünden taraf bilgisini çıkarır. */
function parseParty(partyNode: XmlNode | undefined): ParsedUblParty {
  const empty: ParsedUblParty = { taxNumber: '', scheme: '', title: '' };
  if (!partyNode) return empty;

  const idNode = childOf(childOf(partyNode, 'PartyIdentification'), 'ID');
  const city = textOf(childOf(partyNode, 'PostalAddress'), 'CityName');
  const district = textOf(childOf(partyNode, 'PostalAddress'), 'CitySubdivisionName');
  const taxOffice = textOf(childOf(childOf(partyNode, 'PartyTaxScheme'), 'TaxScheme'), 'Name');

  return {
    taxNumber: (idNode?.text || '').replace(/\s/g, ''),
    scheme: attrOf(idNode || { attrs: {} } as XmlNode, 'schemeID') || '',
    title: textOf(childOf(partyNode, 'PartyName'), 'Name') || '',
    ...(taxOffice ? { taxOffice } : {}),
    ...(city ? { city } : {}),
    ...(district ? { district } : {}),
  };
}

/**
 * Tek bir belge satırını (InvoiceLine / DespatchLine) çözer.
 *
 * DİKKAT — KDV arama sırası: `Percent` BULUNAMAZSA oran, tutar/matrah
 * oranından türetilir. Hiçbiri yoksa 0 yazılır ve uyarı eklenir; uydurma bir
 * oran (eski davranıştaki sabit %20) ATANMAZ.
 */
function parseLine(line: XmlNode, kind: UblDocumentKind, warnings: string[]): ParsedUblLine {
  const qtyTag = kind === 'INVOICE' ? 'InvoicedQuantity' : 'DeliveredQuantity';
  const qtyNode = childOf(line, qtyTag);
  const quantity = toNum(qtyNode?.text) ?? 0;
  const unitCode = attrOf(qtyNode || { attrs: {} } as XmlNode, 'unitCode');

  // Kalemin KENDİ TaxTotal'ı — belgeninkinden ayrıdır, karıştırılmamalı.
  const lineTaxTotal = childOf(line, 'TaxTotal');
  const sub = childOf(lineTaxTotal, 'TaxSubtotal');
  const vatAmount = toNum(textOf(lineTaxTotal, 'TaxAmount')) ?? 0;
  const lineTotal = toNum(textOf(line, 'LineExtensionAmount')) ?? 0;

  let vatRate = toNum(textOf(sub, 'Percent'));
  if (vatRate === undefined && lineTotal > 0 && vatAmount > 0) {
    vatRate = Math.round((vatAmount / lineTotal) * 100 * 100) / 100;
  }
  if (vatRate === undefined) {
    vatRate = 0;
    // İrsaliyede vergi bilgisi taşınmaz (sevk belgesidir); faturada ise
    // okunamayan bir oran gerçek bir eksikliktir ve kullanıcı görmelidir.
    if (kind === 'INVOICE' && (lineTotal > 0 || vatAmount > 0)) {
      warnings.push(
        `Kalem "${textOf(childOf(line, 'Item'), 'Name') || line.text}" için KDV oranı belgede yok; %0 kabul edildi, lütfen kontrol edin.`
      );
    }
  }

  const item = childOf(line, 'Item');
  const name = textOf(item, 'Name') || '';
  const sellerCode = textOf(childOf(item, 'SellersItemIdentification'), 'ID');
  const buyerCode = textOf(childOf(item, 'BuyersItemIdentification'), 'ID');
  // `textOf` DEĞİL: burada istenen, `ID` düğümünün KENDİ metnidir, çocuğunun değil.
  const barcode = childOf(childOf(item, 'StandardItemIdentification'), 'ID')?.text;

  // Birim fiyat yoksa satır tutarından türetilir (miktar 0 ise 0).
  let unitPrice = toNum(textOf(childOf(line, 'Price'), 'PriceAmount'));
  if (unitPrice === undefined) {
    unitPrice = quantity > 0 ? Math.round((lineTotal / quantity) * 100) / 100 : lineTotal;
  }

  if (!name) warnings.push(`${textOf(line, 'ID') || '?'} numaralı satırda ürün adı boş.`);
  if (quantity <= 0) warnings.push(`Kalem "${name || '?'}" için miktar sıfır veya okunamadı.`);
  // İrsaliyede birim fiyat zorunlu değildir; faturada 0 ise gerçek bir eksikliktir.
  if (kind === 'INVOICE' && unitPrice === 0 && lineTotal > 0) {
    warnings.push(`Kalem "${name || '?'}" için birim fiyat okunamadı (satır tutarı ${formatAmount(lineTotal)}).`);
  }

  return {
    lineNo: textOf(line, 'ID') || '',
    ...(sellerCode ? { sellerProductCode: sellerCode } : {}),
    ...(buyerCode ? { buyerProductCode: buyerCode } : {}),
    ...(barcode ? { barcode } : {}),
    name,
    quantity,
    ...(unitCode ? { unitCode } : {}),
    unitName: unitNameFromUbl(unitCode),
    unitPrice,
    vatRate,
    vatAmount,
    lineTotal,
    grossLineTotal: Math.round((lineTotal + vatAmount) * 100) / 100,
  };
}

/**
 * UBL-TR belgesini (Invoice veya DespatchAdvice) çözer.
 *
 * `input` ham XML metnidir. Bozuk belge yarım sonuç ÜRETMEZ: `errors` dolar ve
 * `lines` boş kalır; çağıran `errors.length > 0` ise içeri aktarmamalıdır.
 */
export function parseUblDocument(input: string): ParsedUblDocument {
  const emptyResult = (error: string): ParsedUblDocument => ({
    kind: 'INVOICE',
    uuid: '', documentNo: '', issueDate: '', currency: 'TRY',
    supplier: { taxNumber: '', scheme: '', title: '' },
    customer: { taxNumber: '', scheme: '', title: '' },
    lines: [], subTotal: 0, vatTotal: 0, grandTotal: 0,
    errors: [error], warnings: [],
  });

  const tree = parseUblTree(input);
  if (!tree.ok || !tree.root) {
    const where = tree.line ? ` (satır ${tree.line}, kolon ${tree.column})` : '';
    return emptyResult(`${tree.error || 'Belge ayrıştırılamadı.'}${where}`);
  }

  const root = tree.root;
  const kind: UblDocumentKind = root.name === 'DespatchAdvice' ? 'DESPATCH' : 'INVOICE';
  if (root.name !== 'Invoice' && root.name !== 'DespatchAdvice') {
    return emptyResult(`Beklenmeyen belge kökü: <${root.rawName}>. e-Fatura veya e-İrsaliye bekleniyordu.`);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const uuid = (textOf(root, 'UUID') || '').trim();
  const documentNo = (textOf(root, 'ID') || '').trim();
  const issueDate = (textOf(root, 'IssueDate') || '').trim();
  const currency = (textOf(root, 'DocumentCurrencyCode') || 'TRY').trim();
  const profile = textOf(root, 'ProfileID');
  const typeCode = kind === 'INVOICE'
    ? textOf(root, 'InvoiceTypeCode')
    : textOf(root, 'DespatchAdviceTypeCode');

  if (!uuid) errors.push('Belgede ETTN (UUID) yok; mükerrerlik denetimi yapılamaz ve içeri aktarılamaz.');
  if (!documentNo) warnings.push('Belge numarası (ID) boş.');
  if (!issueDate) warnings.push('Belge tarihi (IssueDate) boş.');

  const supplierNode = kind === 'INVOICE'
    ? childOf(root, 'AccountingSupplierParty')
    : childOf(root, 'DespatchSupplierParty');
  const customerNode = kind === 'INVOICE'
    ? childOf(root, 'AccountingCustomerParty')
    : childOf(root, 'DeliveryCustomerParty');

  const supplier = parseParty(childOf(supplierNode, 'Party'));
  const customer = parseParty(childOf(customerNode, 'Party'));

  if (!supplier.taxNumber) errors.push('Satıcı VKN/TCKN okunamadı.');
  if (!supplier.title) warnings.push('Satıcı unvanı boş.');

  // Kalemler: yalnız kökün doğrudan çocukları. Sarmalayıcı yapıya tolerans için
  // doğrudan bulunamazsa derin arama yapılır.
  const lineTag = kind === 'INVOICE' ? 'InvoiceLine' : 'DespatchLine';
  let lineNodes = childrenOf(root, lineTag);
  if (lineNodes.length === 0) {
    const deep = findFirst(root, lineTag);
    if (deep) lineNodes = [deep];
  }
  const lines = lineNodes.map(l => parseLine(l, kind, warnings));
  if (lines.length === 0) errors.push('Belgede hiç kalem (satır) bulunamadı.');

  const subTotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const vatTotal = Math.round(lines.reduce((s, l) => s + l.vatAmount, 0) * 100) / 100;
  const grandTotal = Math.round((subTotal + vatTotal) * 100) / 100;

  const monetary = childOf(root, 'LegalMonetaryTotal');
  const declaredPayable = toNum(textOf(monetary, 'PayableAmount'))
    ?? toNum(textOf(monetary, 'TaxInclusiveAmount'));
  const declaredSubTotal = toNum(textOf(monetary, 'LineExtensionAmount'))
    ?? toNum(textOf(monetary, 'TaxExclusiveAmount'));
  const declaredVatTotal = toNum(textOf(findFirst(root, 'TaxTotal'), 'TaxAmount'));

  // ── İÇERİK DOĞRULAMASI ────────────────────────────────────────────────────
  // Belgenin bildirdiği tutar ile kalemlerden hesaplanan tutar tutmalı. Aksi
  // hâlde ayrıştırma bir yeri kaçırmış demektir (ör. okunamayan bir kalem, çok
  // satırlı KDV dilimi). Sessizce devam etmek yanlış muhasebe kaydı üretir.
  const oneKurus = 0.011;
  if (declaredPayable !== undefined && Math.abs(declaredPayable - grandTotal) > oneKurus) {
    warnings.push(
      `Belgenin bildirdiği ödenecek tutar (${formatAmount(declaredPayable)}) ile kalemlerden hesaplanan tutar (${formatAmount(grandTotal)}) uyuşmuyor. İçeri aktarmadan önce kontrol edin.`
    );
  }
  if (declaredSubTotal !== undefined && Math.abs(declaredSubTotal - subTotal) > oneKurus) {
    warnings.push(
      `KDV hariç toplam uyuşmuyor: belge ${formatAmount(declaredSubTotal)}, hesaplanan ${formatAmount(subTotal)}.`
    );
  }
  if (declaredVatTotal !== undefined && Math.abs(declaredVatTotal - vatTotal) > oneKurus) {
    warnings.push(
      `Toplam KDV uyuşmuyor: belge ${formatAmount(declaredVatTotal)}, hesaplanan ${formatAmount(vatTotal)}.`
    );
  }

  return {
    kind,
    uuid,
    documentNo,
    issueDate,
    currency,
    ...(profile ? { profile } : {}),
    ...(typeCode ? { typeCode } : {}),
    supplier,
    customer,
    lines,
    subTotal,
    vatTotal,
    grandTotal,
    ...(declaredPayable !== undefined ? { declaredPayable } : {}),
    ...(declaredSubTotal !== undefined ? { declaredSubTotal } : {}),
    ...(declaredVatTotal !== undefined ? { declaredVatTotal } : {}),
    errors,
    warnings,
  };
}

/**
 * Belgenin ayrıştırılabilir olduğunu ve içeri aktarılmaya uygunluğunu söyler.
 * Onay ekranındaki "içeri al" düğmesi bunu kullanır.
 */
export function canIngest(doc: ParsedUblDocument): { ok: boolean; reason?: string } {
  if (doc.errors.length > 0) return { ok: false, reason: doc.errors[0] };
  if (doc.lines.length === 0) return { ok: false, reason: 'Belgede kalem yok.' };
  return { ok: true };
}

/** Kısa özet — log ve denetim kaydı için. */
export function summarize(doc: ParsedUblDocument): string {
  return `${doc.kind === 'INVOICE' ? 'Fatura' : 'İrsaliye'} ${doc.documentNo || '(no yok)'} · ` +
    `${doc.supplier.title || 'unvan yok'} (${doc.supplier.taxNumber || 'VKN yok'}) · ` +
    `${doc.lines.length} kalem · ${formatAmount(doc.grandTotal)} ${doc.currency}`;
}

// Kullanılmayan import uyarısını önlemek için decodeXmlText burada dışa aktarılır.
export { decodeXmlText };
