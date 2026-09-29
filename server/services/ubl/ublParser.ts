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
  /**
   * 2026-09-29 eklendi — yeni tedarikçi kartı taslağını belgeden doldurmak için.
   * Belgede YOKSA alan hiç yazılmaz (boş dize uydurulmaz).
   */
  street?: string;
  postalZone?: string;
  /** `cac:Contact/cbc:Telephone`. */
  phone?: string;
  /** `cac:Contact/cbc:ElectronicMail`. */
  email?: string;
}

/**
 * KDV DIŞI vergi kalemi (ÖTV, damga vergisi, TÜBİTAK kesintisi…).
 *
 * 2026-09-29 eklendi: bu tutarlar belgede gerçekten vardır ve ödenecek tutarın
 * içindedir; okunmazsa "belge toplamı uyuşmuyor" uyarısı çıkar ya da daha kötüsü
 * eksik bir maliyet kaydı oluşur. Tutar belgeden gelir, HESAPLANMAZ.
 */
export interface ParsedUblOtherTax {
  /** Vergi adı (`TaxScheme/Name`, ör. "Özel Tüketim Vergisi"). */
  name: string;
  /** Vergi kodu (`TaxScheme/Code`, ör. "0071"). */
  code?: string;
  amount: number;
  /** Oran (%) — belgede varsa. */
  rate?: number;
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
  /**
   * 2026-09-29 eklendi — üreticinin ürün kodu (`ManufacturersItemIdentification`).
   * Eşleştirme sırasında barkod/satıcı kodundan SONRA gelir (bkz. `matchLine`).
   */
  manufacturerProductCode?: string;
  name: string;
  quantity: number;
  /** UBL birim kodu (`C62`). */
  unitCode?: string;
  /** Çözülmüş birim adı (`Adet`). */
  unitName: string;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  /**
   * KDV hariç NET satır tutarı (`LineExtensionAmount`). UBL'de bu değer
   * iskonto SONRASI tutardır — brüt değildir.
   */
  lineTotal: number;
  /** KDV dahil satır tutarı (KDV dışı vergiler HARİÇ — bkz. `otherTaxes`). */
  grossLineTotal: number;
  /**
   * 2026-09-29 eklendi — satır iskontosu. Belgede yoksa alan YAZILMAZ
   * (0 yazmak "iskonto yok" ile "iskonto okunamadı"yı karıştırırdı).
   */
  discountAmount?: number;
  /** İskonto oranı (%, `MultiplierFactorNumeric`). Belgede yoksa yazılmaz. */
  discountRate?: number;
  /**
   * İskonto ÖNCESİ brüt tutar (birim fiyat × miktar). Yalnız belgede iskonto
   * varsa hesaplanır; aksi hâlde `lineTotal` ile aynı olacağından yazılmaz.
   */
  grossBeforeDiscount?: number;
  /** KDV dışı vergiler (satır düzeyinde) — belgede varsa. */
  otherTaxes?: ParsedUblOtherTax[];
}

/**
 * `LegalMonetaryTotal` bloğunun ham okuması.
 *
 * 2026-09-29 eklendi: detay ekranı "mal/hizmet toplamı, iskonto, vergi, KDV,
 * vergi dahil toplam, ödenecek" satırlarını gösterir. Her alan belgeden
 * OKUNUR; belgede yoksa `undefined` kalır ve arayüz "—" yazar. Hesaplanan
 * değerlerle karıştırılmaması için ayrı bir blokta tutulur.
 */
export interface ParsedUblMonetaryTotals {
  /** Mal/hizmet toplamı (iskonto sonrası). */
  lineExtensionAmount?: number;
  /** Toplam iskonto. */
  allowanceTotalAmount?: number;
  /** Vergi hariç toplam. */
  taxExclusiveAmount?: number;
  /** Vergi dahil toplam. */
  taxInclusiveAmount?: number;
  /** Ödenecek tutar. */
  payableAmount?: number;
}

/**
 * Belge düzeyindeki KDV dışı vergiler ve toplam KDV.
 *
 * ⚠️ Belge düzeyindeki `TaxTotal` blokları KDV'yi VE diğer vergileri (ÖTV,
 * damga) birlikte taşır. İkisini toplamak ödenecek tutarı şişirir; bu yüzden
 * ayrıştırma `TaxScheme/Code` üzerinden yapılır ve belirsizlik `warnings`'e
 * yazılır.
 */
export interface ParsedUblTaxBreakdown {
  /** KDV toplamı (yalnız KDV şemalı `TaxSubtotal`'lar). */
  vatTotal: number;
  /**
   * Belgede en az bir KDV şemalı `TaxSubtotal` bulundu mu?
   *
   * ⚠️ `vatTotal === 0` iki farklı durumu anlatır: "KDV yok" ve "vergi bloğu
   * hiç okunamadı". Çağıran ikisini karıştırırsa vergi toplamını yanlış
   * kaynaktan okur (bkz. `parseUblDocument` içindeki geri düşüş).
   */
  hasVatSubtotal: boolean;
  /** KDV dışı vergiler. */
  otherTaxes: ParsedUblOtherTax[];
  /** KDV + diğer vergiler. */
  grandTaxTotal: number;
  /** Belirsiz şema nedeniyle sınıflandırılamayan vergi tutarı (varsa). */
  unclassifiedTaxTotal?: number;
}

export interface ParsedUblDocument {
  kind: UblDocumentKind;
  /** ETTN. Boşsa belge içeri aktarılamaz (bkz. `canIngest`). */
  uuid: string;
  documentNo: string;
  issueDate: string;
  /** Belge saati (`cbc:IssueTime`, `HH:mm:ss`). Belgede yoksa yazılmaz. */
  issueTime?: string;
  currency: string;
  profile?: string;
  /** SATIS / IADE / SEVK / TEMELFATURA gibi profil-tip kodu. */
  typeCode?: string;
  /**
   * Senaryo (`cbc:ProfileID` zaten `profile` alanındadır). Bu alan belgedeki
   * `cbc:Note` senaryo notunu taşır — ör. "Ticari Fatura Senaryosu".
   */
  scenarioNote?: string;
  supplier: ParsedUblParty;
  customer: ParsedUblParty;
  lines: ParsedUblLine[];
  /** Kalemlerden hesaplanan KDV hariç toplam. */
  subTotal: number;
  /** Kalemlerden hesaplanan toplam KDV. */
  vatTotal: number;
  /**
   * Kalemlerden hesaplanan KDV dahil toplam (KDV DIŞI vergiler hariç).
   * Geriye dönük uyumluluk için korunur; cari borç için `payableTotal` kullan.
   */
  grandTotal: number;
  /**
   * 2026-09-29 — ÖDENECEK toplam: KDV dahil toplam + KDV dışı vergiler
   * (ÖTV, damga…). **Alış faturası bu tutar üzerinden borç yazar**; aksi hâlde
   * ÖTV'li belgelerde cari borç eksik oluşur ve bilanço tutmaz.
   */
  payableTotal: number;
  /**
   * 2026-09-29 eklendi — belgenin KENDİ `LegalMonetaryTotal` bloğu ham olarak.
   * Detay ekranı bu alanları gösterir. Hiçbiri hesaplanmaz, doğrudan okunur.
   */
  monetaryTotals?: ParsedUblMonetaryTotals;
  /**
   * 2026-09-29 eklendi — KDV / diğer vergi ayrımı. Ödenecek tutarın doğru
   * okunması buna bağlıdır (bkz. `ParsedUblTaxBreakdown`).
   */
  taxBreakdown?: ParsedUblTaxBreakdown;
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

/**
 * `cac:Party` düğümünden taraf bilgisini çıkarır.
 *
 * ⚠️ 2026-09-29 DÜZELTME — VKN SEÇİMİ: Bir tarafta BİRDEN FAZLA
 * `cac:PartyIdentification` olabilir (`VKN`, `TCKN`, `MERSISNO`, `TICARETSICILNO`).
 * Önceki sürüm YALNIZ İLKİNİ okuyordu; MERSIS numarası önce gelirse VKN yerine
 * 16 haneli bir numara okunur ve tedarikçi eşleştirmesi sessizce başarısız olur
 * (ya da daha kötüsü, yanlış cariye borç yazılır). Artık `schemeID` ve hane
 * sayısına göre VKN/TCKN aranır; bulunamazsa ilk kimlik geri düşüş olarak
 * kullanılır ve durum `scheme` alanından görülebilir.
 */
function parseParty(partyNode: XmlNode | undefined): ParsedUblParty {
  const empty: ParsedUblParty = { taxNumber: '', scheme: '', title: '' };
  if (!partyNode) return empty;

  const idNodes = childrenOf(partyNode, 'PartyIdentification')
    .map(n => childOf(n, 'ID'))
    .filter((n): n is XmlNode => !!n);

  // VKN (10 hane) / TCKN (11 hane) — schemeID doğru olanı önceler.
  const vergiNo = idNodes.find(n => {
    const scheme = (attrOf(n, 'schemeID') || '').toUpperCase();
    const digits = (n.text || '').replace(/[^0-9]/g, '');
    return (scheme === 'VKN' || scheme === 'TCKN') && digits.length >= 10 && digits.length <= 11;
  }) || idNodes.find(n => {
    const digits = (n.text || '').replace(/[^0-9]/g, '');
    return digits.length === 10 || digits.length === 11;
  }) || idNodes[0];

  const address = childOf(partyNode, 'PostalAddress');
  const city = textOf(address, 'CityName');
  const district = textOf(address, 'CitySubdivisionName');
  const street = textOf(address, 'StreetName');
  const postalZone = textOf(address, 'PostalZone');
  const taxOffice = textOf(childOf(childOf(partyNode, 'PartyTaxScheme'), 'TaxScheme'), 'Name');
  const contact = childOf(partyNode, 'Contact');
  const phone = textOf(contact, 'Telephone');
  const email = textOf(contact, 'ElectronicMail');

  return {
    taxNumber: (vergiNo?.text || '').replace(/[^0-9]/g, ''),
    scheme: attrOf(vergiNo || { attrs: {} } as XmlNode, 'schemeID') || '',
    title: textOf(childOf(partyNode, 'PartyName'), 'Name') || '',
    ...(taxOffice ? { taxOffice } : {}),
    ...(city ? { city } : {}),
    ...(district ? { district } : {}),
    ...(street ? { street } : {}),
    ...(postalZone ? { postalZone } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
  };
}

/**
 * Bir `TaxSubtotal` düğümünün KDV mi yoksa KDV dışı vergi mi olduğunu söyler.
 *
 * ⚠️ NEDEN GEREKLİ: Belge düzeyindeki `TaxTotal` bloğu KDV ile ÖTV/damga
 * vergisini BİRLİKTE taşır. Hepsini "KDV" saymak ödenecek tutarı şişirir;
 * hiçbirini saymamak eksik kayıt üretir. Ayrım `TaxScheme/Code` ve
 * `TaxScheme/Name` üzerinden yapılır:
 *   • KDV: kod `0015` (KDV), `KDV`, ve isim "Katma Değer Vergisi" / "KDV".
 *   • Diğer: `0071` (ÖTV), `0073` (TÜBİTAK), `0059` (damga) vb.
 * Şema hiç okunamazsa `undefined` döner; çağıran bunu `unclassifiedTaxTotal`
 * olarak raporlar ve sessizce KDV'ye katmaz.
 */
function vergiSemasi(sub: XmlNode | undefined): XmlNode | undefined {
  if (!sub) return undefined;
  // ⚠️ UBL'de `TaxScheme` doğrudan `TaxSubtotal`'ın çocuğu DEĞİLDİR:
  // `TaxSubtotal > TaxCategory > TaxScheme` yolundadır. Doğrudan aramak,
  // gerçek belgelerin (ve İŞBEY'in kendi builder'ının) vergisini hiç
  // bulamaz ve her tutar "sınıflandırılamadı" olurdu. İkisini de destekle.
  return childOf(childOf(sub, 'TaxCategory'), 'TaxScheme') || childOf(sub, 'TaxScheme');
}

function classifyTaxScheme(sub: XmlNode | undefined): 'VAT' | 'OTHER' | undefined {
  const scheme = vergiSemasi(sub);
  if (!scheme) return undefined;

  // KDV kodu iki biçimde yazılır: `cbc:Code` (genel UBL) veya
  // `cbc:TaxTypeCode` (İŞBEY builder'ı ve bazı entegratörler).
  const code = ((textOf(scheme, 'Code') || textOf(scheme, 'TaxTypeCode')) || '').trim();
  const name = (textOf(scheme, 'Name') || '').trim().toLocaleUpperCase('tr-TR');
  if (!code && !name) return undefined;

  const isVatCode = code === '0015' || code.toUpperCase() === 'KDV' || code === 'KDV';
  const isVatName = name.includes('KATMA DEĞER') || name === 'KDV';
  if (isVatCode || isVatName) return 'VAT';
  // Kod/ad okunabildi ve KDV değil → diğer vergi (ÖTV 0071, damga 0059…).
  return 'OTHER';
}

/** Bir `TaxSubtotal` düğümünü `ParsedUblOtherTax`'a çevirir. */
function parseOtherTax(sub: XmlNode): ParsedUblOtherTax {
  const scheme = vergiSemasi(sub);
  const code = (textOf(scheme, 'Code') || textOf(scheme, 'TaxTypeCode') || '').trim();
  const name = (textOf(scheme, 'Name') || '').trim();
  const rate = toNum(textOf(sub, 'Percent'));
  return {
    name: name || code || 'Vergi',
    ...(code ? { code } : {}),
    amount: toNum(textOf(sub, 'TaxAmount')) ?? 0,
    ...(rate !== undefined ? { rate } : {}),
  };
}

/**
 * Belge düzeyindeki vergi bloklarını sınıflandırır: KDV / diğer vergiler.
 *
 * KDV toplamı, `LineExtensionAmount` + KDV = `TaxInclusiveAmount` eşitliğini
 * korumak için belgedeki KDV'li `TaxSubtotal`'lardan okunur. Birden çok
 * `TaxTotal` bloğu varsa (KDV + ÖTV ayrı bloklarda) hepsi gezilir.
 */
function parseDocumentTaxes(root: XmlNode): ParsedUblTaxBreakdown {
  let vatTotal = 0;
  let vatSubtotalCount = 0;
  let unclassified = 0;
  const otherTaxes: ParsedUblOtherTax[] = [];

  for (const taxTotal of childrenOf(root, 'TaxTotal')) {
    for (const sub of childrenOf(taxTotal, 'TaxSubtotal')) {
      const kind = classifyTaxScheme(sub);
      if (kind === 'VAT') {
        vatTotal += toNum(textOf(sub, 'TaxAmount')) ?? 0;
        vatSubtotalCount++;
      } else if (kind === 'OTHER') {
        otherTaxes.push(parseOtherTax(sub));
      } else {
        // Sınıflandırılamayan: KDV toplamına EKLENMEZ, ayrı raporlanır.
        unclassified += toNum(textOf(sub, 'TaxAmount')) ?? 0;
      }
    }
  }

  const hasVatSubtotal = vatSubtotalCount > 0;
  vatTotal = Math.round(vatTotal * 100) / 100;
  const otherTotal = Math.round(otherTaxes.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  unclassified = Math.round(unclassified * 100) / 100;

  return {
    vatTotal,
    hasVatSubtotal,
    otherTaxes,
    grandTaxTotal: Math.round((vatTotal + otherTotal) * 100) / 100,
    ...(unclassified > 0 ? { unclassifiedTaxTotal: unclassified } : {}),
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

  // ── Satır düzeyi KDV DIŞI vergiler (2026-09-29) ─────────────────────────
  // Aynı `TaxTotal` bloğunda KDV ile birlikte gelebilirler; ayırmazsak
  // satır KDV'si şişer ve maliyet yanlış hesaplanır.
  const satirDigerVergiler: ParsedUblOtherTax[] = [];
  for (const sub2 of childrenOf(lineTaxTotal, 'TaxSubtotal')) {
    if (classifyTaxScheme(sub2) === 'OTHER') satirDigerVergiler.push(parseOtherTax(sub2));
  }

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
  // 2026-09-29: üretici kodu — eşleştirmede barkod/satıcı kodundan sonra gelir.
  const manufacturerCode = textOf(childOf(item, 'ManufacturersItemIdentification'), 'ID');
  // `textOf` DEĞİL: burada istenen, `ID` düğümünün KENDİ metnidir, çocuğunun değil.
  const barcode = childOf(childOf(item, 'StandardItemIdentification'), 'ID')?.text;

  // Birim fiyat yoksa satır tutarından türetilir (miktar 0 ise 0).
  let unitPrice = toNum(textOf(childOf(line, 'Price'), 'PriceAmount'));
  if (unitPrice === undefined) {
    unitPrice = quantity > 0 ? Math.round((lineTotal / quantity) * 100) / 100 : lineTotal;
  }

  // ── Satır iskontosu (2026-09-29) ────────────────────────────────────────
  // `ChargeIndicator=false` iskonto, `true` masraf demektir. Yalnız iskonto
  // okunur. ⚠️ `LineExtensionAmount` UBL'de İSKONTO SONRASI net tutardır;
  // iskontoyu düşerek `lineTotal`'ı yeniden hesaplamak ÇİFT İNDİRİM olur ve
  // belgeyi kalemlerden hesaplanan toplamla uyuşmaz hâle getirirdi. Bu yüzden
  // brüt tutar yalnız GÖSTERİM için türetilir.
  let discountAmount: number | undefined;
  let discountRate: number | undefined;
  for (const ac of childrenOf(line, 'AllowanceCharge')) {
    const isCharge = (textOf(ac, 'ChargeIndicator') || '').trim().toLowerCase() === 'true';
    const tutar = toNum(textOf(ac, 'Amount'));
    if (isCharge) {
      if (tutar !== undefined && tutar !== 0) {
        warnings.push(
          `Kalem "${name || '?'}" için masraf (${formatAmount(tutar)}) var; satır tutarı belgedeki gibidir, masraf ayrıca eklenmedi.`
        );
      }
      continue;
    }
    if (tutar === undefined) continue;
    discountAmount = Math.round(((discountAmount || 0) + tutar) * 100) / 100;
    const oran = toNum(textOf(ac, 'MultiplierFactorNumeric'));
    if (oran !== undefined) discountRate = oran;
  }

  if (!name) warnings.push(`${textOf(line, 'ID') || '?'} numaralı satırda ürün adı boş.`);
  if (quantity <= 0) warnings.push(`Kalem "${name || '?'}" için miktar sıfır veya okunamadı.`);
  // İrsaliyede birim fiyat zorunlu değildir; faturada 0 ise gerçek bir eksikliktir.
  if (kind === 'INVOICE' && unitPrice === 0 && lineTotal > 0) {
    warnings.push(`Kalem "${name || '?'}" için birim fiyat okunamadı (satır tutarı ${formatAmount(lineTotal)}).`);
  }

  // Brüt (iskonto öncesi) tutar — yalnız iskonto VARSA gösterilir.
  const grossBeforeDiscount =
    discountAmount !== undefined && discountAmount > 0
      ? Math.round((lineTotal + discountAmount) * 100) / 100
      : undefined;

  return {
    lineNo: textOf(line, 'ID') || '',
    ...(sellerCode ? { sellerProductCode: sellerCode } : {}),
    ...(buyerCode ? { buyerProductCode: buyerCode } : {}),
    ...(manufacturerCode ? { manufacturerProductCode: manufacturerCode } : {}),
    ...(barcode ? { barcode } : {}),
    name,
    quantity,
    ...(unitCode ? { unitCode } : {}),
    unitName: unitNameFromUbl(unitCode),
    unitPrice,
    vatRate,
    vatAmount,
    lineTotal,
    ...(discountAmount !== undefined && discountAmount > 0 ? { discountAmount } : {}),
    ...(discountRate !== undefined ? { discountRate } : {}),
    ...(grossBeforeDiscount !== undefined ? { grossBeforeDiscount } : {}),
    ...(satirDigerVergiler.length > 0 ? { otherTaxes: satirDigerVergiler } : {}),
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
    lines: [], subTotal: 0, vatTotal: 0, grandTotal: 0, payableTotal: 0,
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
  // 2026-09-29: belge SAATİ ve senaryo notu — detay ekranı ikisini de gösterir.
  const issueTime = (textOf(root, 'IssueTime') || '').trim() || undefined;
  const currency = (textOf(root, 'DocumentCurrencyCode') || 'TRY').trim();
  const profile = textOf(root, 'ProfileID');
  const typeCode = kind === 'INVOICE'
    ? textOf(root, 'InvoiceTypeCode')
    : textOf(root, 'DespatchAdviceTypeCode');
  const scenarioNote = (textOf(root, 'Note') || '').trim() || undefined;

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

  // ── VERGİ AYRIMI (2026-09-29) ────────────────────────────────────────────
  // Belgedeki `TaxTotal` blokları KDV'yi ve KDV DIŞI vergileri (ÖTV, damga)
  // birlikte taşır. Hepsini "KDV" saymak ödenecek tutarı şişirirdi.
  const taxBreakdown = parseDocumentTaxes(root);
  // KDV şemalı bir `TaxSubtotal` bulunduysa O değer esastır. Bulunmadıysa
  // (ör. kod/şema beklenmedik) ilk `TaxTotal/TaxAmount` geri düşüş olarak
  // okunur — "KDV yok" ile "vergi okunamadı" karıştırılmaz.
  const declaredVatTotal = taxBreakdown.hasVatSubtotal
    ? taxBreakdown.vatTotal
    : toNum(textOf(findFirst(root, 'TaxTotal'), 'TaxAmount'));

  // Ham `LegalMonetaryTotal` — detay ekranı bu alanları DOĞRUDAN gösterir.
  // Yalnız belgede VAR OLAN alanlar yazılır; olmayan "0,00" diye gösterilmez.
  const monetaryTotals: ParsedUblMonetaryTotals = {};
  const ekle = (anahtar: keyof ParsedUblMonetaryTotals, etiket: string) => {
    const v = toNum(textOf(monetary, etiket));
    if (v !== undefined) monetaryTotals[anahtar] = v;
  };
  ekle('lineExtensionAmount', 'LineExtensionAmount');
  ekle('allowanceTotalAmount', 'AllowanceTotalAmount');
  ekle('taxExclusiveAmount', 'TaxExclusiveAmount');
  ekle('taxInclusiveAmount', 'TaxInclusiveAmount');
  ekle('payableAmount', 'PayableAmount');

  // ── İÇERİK DOĞRULAMASI ────────────────────────────────────────────────────
  // Belgenin bildirdiği tutar ile kalemlerden hesaplanan tutar tutmalı. Aksi
  // hâlde ayrıştırma bir yeri kaçırmış demektir (ör. okunamayan bir kalem, çok
  // satırlı KDV dilimi). Sessizce devam etmek yanlış muhasebe kaydı üretir.
  //
  // ⚠️ 2026-09-29: Ödenecek tutar karşılaştırmasına KDV DIŞI vergiler de
  // eklenir — aksi hâlde ÖTV'li (ör. akaryakıt, beyaz eşya) her fatura
  // "tutar uyuşmuyor" uyarısı üretir ve uyarı okunmaz hâle gelirdi.
  // ⚠️ 2026-09-29 — TOPLAM TANIMI: `grandTotal` "KDV hariç + KDV"dır. Belgenin
  // ÖDENECEK tutarı ise KDV dışı vergileri de içerir. İkisini aynı saymak
  // ÖTV'li her faturada yanlış (düşük) bir cari borç yazardı. Kanonik alan bu
  // yüzden `payableTotal`'dır; `grandTotal` geriye dönük uyumluluk için kalır.
  const otherTaxTotal = Math.round(taxBreakdown.otherTaxes.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const payableTotal = Math.round((grandTotal + otherTaxTotal) * 100) / 100;

  const oneKurus = 0.011;
  const beklenenToplam = payableTotal;
  if (declaredPayable !== undefined && Math.abs(declaredPayable - beklenenToplam) > oneKurus) {
    warnings.push(
      `Belgenin bildirdiği ödenecek tutar (${formatAmount(declaredPayable)}) ile kalemlerden hesaplanan tutar (${formatAmount(beklenenToplam)}) uyuşmuyor. İçeri aktarmadan önce kontrol edin.`
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
  // Sınıflandırılamayan vergi varsa KDV'ye KATILMAZ; kullanıcı bilmelidir.
  if (taxBreakdown.unclassifiedTaxTotal !== undefined) {
    warnings.push(
      `Belgede şeması okunamayan ${formatAmount(taxBreakdown.unclassifiedTaxTotal)} tutarında vergi var; KDV toplamına EKLENMEDİ, lütfen kontrol edin.`
    );
  }
  if (taxBreakdown.otherTaxes.length > 0) {
    warnings.push(
      `Belgede KDV dışı vergi var (${taxBreakdown.otherTaxes.map(t => `${t.name} ${formatAmount(t.amount)}`).join(', ')}). Alış faturasında maliyete dâhil edildiğini doğrulayın.`
    );
  }

  return {
    kind,
    uuid,
    documentNo,
    issueDate,
    ...(issueTime ? { issueTime } : {}),
    currency,
    ...(profile ? { profile } : {}),
    ...(typeCode ? { typeCode } : {}),
    ...(scenarioNote ? { scenarioNote } : {}),
    supplier,
    customer,
    lines,
    subTotal,
    vatTotal,
    grandTotal,
    payableTotal,
    ...(Object.keys(monetaryTotals).length > 0 ? { monetaryTotals } : {}),
    taxBreakdown,
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
