/**
 * Görsel Tasarım Modeli
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: XSLT Stüdyosu'nun "Görsel Tasarım" modu için yazıldı.
 *
 * TEMEL KARAR — NEDEN SERBEST PİKSEL DEĞİL:
 * Kullanıcı sınırlı bir "section / row / column / block" modeliyle çalışır.
 * Serbest konumlandırma (absolute px) mevcut UBL/XSLT yapısını kırar: ürün
 * tablosu `cac:InvoiceLine` döngüsüdür ve kaç satır geleceği belgede belli
 * olur, sabit yükseklik varsayımı kısa/uzun faturalarda taşma veya boşluk
 * üretir. Bu model akışkan (flow) tabanlıdır; üretilen HTML tablo/akış
 * düzenidir ve her zaman gerçek faturaya göre akar.
 *
 * BAĞLAYICI ALANLAR: Bir "block" ne göstereceğini `bind` alanıyla seçer.
 * Bunlar UBL-TR'de sabit yollar (aşağıdaki UBL_BINDINGS) ve üretilen XSLT'te
 * `*[local-name()='X']` biçiminde yazılır. Böylece şablonun kendi ad alanı
 * önekleri ne olursa olsun (n1:, cac:, cbc: ...) doğru düğüm bulunur.
 *
 * ÜRÜN TABLOSU: `invoice-table` bloğunun sütunları özelleştirilebilir, ancak
 * satır üretimi HER ZAMAN `cac:InvoiceLine` (ve e-İrsaliye'de
 * `cac:DespatchLine`) döngüsüdür. Bu korunur — sütun eklemek/çıkarmak döngüyü
 * bozmaz, yalnız `<td>` üretimini değiştirir.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────────────────────────

export type BlockKind =
  | 'text'
  | 'field'
  | 'divider'
  | 'spacer'
  | 'image'
  | 'invoice-table'
  | 'totals-table'
  | 'bank-table'
  | 'qr'
  | 'barcode'
  | 'signature'
  | 'conditional-note';

export interface BlockStyle {
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  marginTop?: number;
  marginBottom?: number;
  padding?: number;
  background?: string;
  borderTop?: boolean;
  borderBottom?: boolean;
  widthPercent?: number;
}

export interface VisualBlock {
  id: string;
  kind: BlockKind;
  /** `field` / `text` / `conditional-note` için UBL bağlayıcısı. */
  bind?: string;
  /** `text` için sabit metin; `conditional-note` için gösterilecek söz. */
  text?: string;
  label?: string;
  /** `image` için kaynak (logo / imza). */
  src?: string;
  /** `text` bloğunda bind doluysa metinden ÖNCE mi SONRA mı gelsin. */
  textBefore?: boolean;
  style?: BlockStyle;
  /** `conditional-note` koşulu: bağlı alan boş değilse göster. */
  visibleWhen?: 'bound-not-empty' | 'always';
}

export interface VisualColumn {
  id: string;
  /** Sütun genişliği (yüzde) — akışkan düzeni korur. */
  widthPercent: number;
  blocks: VisualBlock[];
}

export interface VisualRow {
  id: string;
  columns: VisualColumn[];
  style?: {
    gap?: number;
    borderTop?: boolean;
    borderBottom?: boolean;
    background?: string;
    padding?: number;
  };
}

export interface VisualSection {
  id: string;
  title: string;
  /** Sayfa kırılması: bu bölümden sonra yeni A4 sayfası. */
  pageBreakAfter?: boolean;
  /** Ürün tablosunu bölümden SONRA bas (uzun faturalarda başlık tekrarlanır). */
  style?: { padding?: number; background?: string };
  rows: VisualRow[];
}

export interface ProductTableColumn {
  /** Sabit kimlik — UBL yolunu ve döngüyü bozmaz. */
  key: string;
  label: string;
  widthPercent: number;
  align: 'left' | 'center' | 'right';
  enabled: boolean;
}

export interface VisualDesignDoc {
  /** Belge geneli tipografi (basılı çıktı; uygulama teması değil). */
  base: {
    fontFamily: string;
    fontSize: number;
    color: string;
    primaryColor: string;
    secondaryColor: string;
    pagePadding: number;
  };
  sections: VisualSection[];
  productColumns: ProductTableColumn[];
  /** Ürün tablosunun üretileceği yer (section id). */
  productTableSectionId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UBL Bağlayıcıları — gerçek UBL-TR düğüm adları
// ─────────────────────────────────────────────────────────────────────────────

export interface UblBinding {
  key: string;
  label: string;
  category: 'Firma' | 'Müşteri' | 'Belge' | 'İçerik' | 'Toplamlar' | 'Diğer';
  /** UBL düğüm yolu (yerel adlar). */
  path: string;
  detail: string;
}

export const UBL_BINDINGS: UblBinding[] = [
  // ── Firma (satıcı)
  { key: 'supplier.name', label: 'Firma Ünvanı', category: 'Firma', path: "AccountingSupplierParty/Party/PartyName/Name", detail: 'Satıcı ünvanı' },
  { key: 'supplier.taxNumber', label: 'Firma VKN', category: 'Firma', path: "AccountingSupplierParty/Party/PartyIdentification/ID", detail: 'Satıcı vergi kimlik no' },
  { key: 'supplier.taxOffice', label: 'Firma Vergi Dairesi', category: 'Firma', path: "AccountingSupplierParty/Party/PartyTaxScheme/TaxScheme/Name", detail: 'Vergi dairesi' },
  { key: 'supplier.address', label: 'Firma Adresi', category: 'Firma', path: "AccountingSupplierParty/Party/PostalAddress/StreetName", detail: 'Açık adres' },
  { key: 'supplier.city', label: 'Firma Şehir', category: 'Firma', path: "AccountingSupplierParty/Party/PostalAddress/CityName", detail: 'Şehir' },
  { key: 'supplier.phone', label: 'Firma Telefon', category: 'Firma', path: "AccountingSupplierParty/Party/Contact/Telephone", detail: 'İletişim telefonu' },
  { key: 'supplier.email', label: 'Firma E-Posta', category: 'Firma', path: "AccountingSupplierParty/Party/Contact/ElectronicMail", detail: 'E-posta' },

  // ── Müşteri (alıcı)
  { key: 'customer.name', label: 'Müşteri Ünvanı', category: 'Müşteri', path: "AccountingCustomerParty/Party/PartyName/Name", detail: 'Alıcı ünvanı' },
  { key: 'customer.taxNumber', label: 'Müşteri VKN/TCKN', category: 'Müşteri', path: "AccountingCustomerParty/Party/PartyIdentification/ID", detail: 'Alıcı vergi kimlik no' },
  { key: 'customer.taxOffice', label: 'Müşteri Vergi Dairesi', category: 'Müşteri', path: "AccountingCustomerParty/Party/PartyTaxScheme/TaxScheme/Name", detail: 'Alıcı vergi dairesi' },
  { key: 'customer.address', label: 'Müşteri Adresi', category: 'Müşteri', path: "AccountingCustomerParty/Party/PostalAddress/StreetName", detail: 'Alıcı adresi' },
  { key: 'customer.city', label: 'Müşteri Şehir', category: 'Müşteri', path: "AccountingCustomerParty/Party/PostalAddress/CityName", detail: 'Alıcı şehri' },

  // ── Belge
  { key: 'doc.number', label: 'Fatura No', category: 'Belge', path: "ID", detail: 'Belge numarası' },
  { key: 'doc.uuid', label: 'ETTN', category: 'Belge', path: "UUID", detail: 'Elektronik belge kimliği' },
  { key: 'doc.date', label: 'Fatura Tarihi', category: 'Belge', path: "IssueDate", detail: 'Düzenleme tarihi' },
  { key: 'doc.time', label: 'Fatura Saati', category: 'Belge', path: "IssueTime", detail: 'Düzenleme saati' },
  { key: 'doc.type', label: 'Fatura Tipi', category: 'Belge', path: "InvoiceTypeCode", detail: 'SATIS / IADE vb.' },
  { key: 'doc.profile', label: 'Senaryo', category: 'Belge', path: "ProfileID", detail: 'TEMELFATURA / TICARIFATURA vb.' },
  { key: 'doc.currency', label: 'Döviz', category: 'Belge', path: "DocumentCurrencyCode", detail: 'Belge para birimi' },
  { key: 'doc.note', label: 'Belge Notu', category: 'Belge', path: "Note", detail: 'Fatura notu' },

  // ── Toplamlar
  { key: 'total.lineExtension', label: 'Mal Hizmet Toplam', category: 'Toplamlar', path: "LegalMonetaryTotal/LineExtensionAmount", detail: 'Satırlar toplamı' },
  { key: 'total.taxExclusive', label: 'Vergi Hariç Toplam', category: 'Toplamlar', path: "LegalMonetaryTotal/TaxExclusiveAmount", detail: 'KDV hariç' },
  { key: 'total.taxInclusive', label: 'Vergi Dahil Toplam', category: 'Toplamlar', path: "LegalMonetaryTotal/TaxInclusiveAmount", detail: 'KDV dahil' },
  { key: 'total.allowance', label: 'İskonto Toplamı', category: 'Toplamlar', path: "LegalMonetaryTotal/AllowanceTotalAmount", detail: 'Toplam iskonto' },
  { key: 'total.payable', label: 'Ödenecek Tutar', category: 'Toplamlar', path: "LegalMonetaryTotal/PayableAmount", detail: 'Genel toplam' },
  { key: 'total.vat', label: 'KDV Toplamı', category: 'Toplamlar', path: "TaxTotal/TaxAmount", detail: 'Hesaplanan KDV' },

  // ── İçerik
  { key: 'line.count', label: 'Satır Sayısı', category: 'İçerik', path: "LineCountNumeric", detail: 'Kalem sayısı' },
];

export const BINDING_CATEGORIES: UblBinding['category'][] = ['Firma', 'Müşteri', 'Belge', 'Toplamlar', 'İçerik', 'Diğer'];

export function findBinding(key: string | undefined): UblBinding | undefined {
  return key ? UBL_BINDINGS.find(b => b.key === key) : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ürün tablosu sütunları — her biri gerçek UBL yoluna bağlı
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductColumnDef {
  key: string;
  label: string;
  align: 'left' | 'center' | 'right';
  /** Satır döngüsü içinden göreli XPath (yerel adlarla). */
  xpath: string;
  /** Sütunun e-Fatura karşılığı var mı (e-İrsaliye'de yoksa uyarı gösterilir). */
  invoiceOnly?: boolean;
}

/**
 * Ürün tablosu sütun tanımları.
 *
 * DİKKAT: `xpath` değerleri `cac:InvoiceLine` düğümüne GÖRELİDİR. Döngünün
 * kendisi (`cac:InvoiceLine` / `cac:DespatchLine` seçimi) burada değil,
 * derleyicide üretilir — yani sütun değiştirmek döngüyü bozmaz.
 */
export const PRODUCT_COLUMN_DEFS: ProductColumnDef[] = [
  { key: 'lineNumber', label: 'Sıra', align: 'center', xpath: "ID" },
  { key: 'productCode', label: 'Ürün Kodu', align: 'left', xpath: "Item/SellersItemIdentification/ID" },
  { key: 'barcode', label: 'Barkod', align: 'left', xpath: "Item/StandardItemIdentification/ID" },
  { key: 'name', label: 'Ürün Adı', align: 'left', xpath: "Item/Name" },
  { key: 'description', label: 'Açıklama', align: 'left', xpath: "Item/Description" },
  { key: 'quantity', label: 'Miktar', align: 'right', xpath: "InvoicedQuantity | DeliveredQuantity" },
  { key: 'unit', label: 'Birim', align: 'center', xpath: "InvoicedQuantity/@unitCode | DeliveredQuantity/@unitCode" },
  { key: 'unitPrice', label: 'Birim Fiyat', align: 'right', xpath: "Price/PriceAmount" },
  { key: 'discount', label: 'İskonto', align: 'right', xpath: "AllowanceCharge/Amount" },
  { key: 'vatRate', label: 'KDV %', align: 'center', xpath: "TaxTotal/TaxSubtotal/Percent" },
  { key: 'vatAmount', label: 'KDV Tutarı', align: 'right', xpath: "TaxTotal/TaxAmount" },
  { key: 'lineTotal', label: 'Satır Tutarı', align: 'right', xpath: "LineExtensionAmount" },
];

export function defaultProductColumns(): ProductTableColumn[] {
  const on = new Set(['lineNumber', 'productCode', 'name', 'quantity', 'unit', 'unitPrice', 'vatRate', 'lineTotal']);
  const per = 100 / PRODUCT_COLUMN_DEFS.filter(d => on.has(d.key)).length;
  return PRODUCT_COLUMN_DEFS.map(d => ({
    key: d.key,
    label: d.label,
    align: d.align,
    enabled: on.has(d.key),
    widthPercent: Math.round(per * 10) / 10,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Yeni düğüm üreticileri
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0;
export function newId(prefix = 'n'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function makeBlock(kind: BlockKind): VisualBlock {
  switch (kind) {
    case 'field':
      return { id: newId('f'), kind, bind: 'doc.number', style: { fontSize: 11 } };
    case 'text':
      return { id: newId('t'), kind, text: 'Metin', style: { fontSize: 11 } };
    case 'divider':
      return { id: newId('d'), kind, style: { borderBottom: true, marginTop: 6, marginBottom: 6 } };
    case 'spacer':
      return { id: newId('s'), kind, style: { marginTop: 8 } };
    case 'image':
      return { id: newId('i'), kind, src: 'logo', style: { widthPercent: 100 } };
    case 'invoice-table':
      return { id: newId('it'), kind };
    case 'totals-table':
      return { id: newId('tt'), kind };
    case 'bank-table':
      return { id: newId('bt'), kind };
    case 'qr':
      return { id: newId('q'), kind };
    case 'barcode':
      return { id: newId('bc'), kind };
    case 'signature':
      return { id: newId('sg'), kind };
    case 'conditional-note':
      return { id: newId('cn'), kind, bind: 'doc.note', visibleWhen: 'bound-not-empty', style: { fontSize: 10 } };
    default:
      return { id: newId('x'), kind: 'text', text: 'Metin' };
  }
}

export function makeColumn(widthPercent = 100): VisualColumn {
  return { id: newId('c'), widthPercent, blocks: [] };
}

export function makeRow(): VisualRow {
  return { id: newId('r'), columns: [makeColumn(100)] };
}

export function makeSection(title: string): VisualSection {
  return { id: newId('sec'), title, rows: [makeRow()] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Varsayılan şablon — mevcut general.xslt çıktısının düzenini taklit eder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Varsayılan görsel tasarım.
 *
 * NEDEN BU DÜZEN: Mevcut `general.xslt` çıktısıyla aynı bilgi mimarisini
 * kurar (başlık + logo, satıcı/alıcı iki kolon, belge künyesi, ürün tablosu,
 * toplamlar, not, IBAN, imza, QR). Amaç aynı görünmek değil, kullanıcının
 * ALIŞTIĞI yapıyı kaybetmeden düzenleyebilmesidir.
 */
export function defaultVisualDesign(): VisualDesignDoc {
  return {
    base: {
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      color: '#111827',
      primaryColor: '#0284c7',
      secondaryColor: '#1e293b',
      pagePadding: 24,
    },
    sections: [
      {
        id: newId('sec'),
        title: 'Başlık',
        rows: [
          {
            id: newId('r'),
            columns: [
              {
                id: newId('c'),
                widthPercent: 62,
                blocks: [
                  { id: newId('i'), kind: 'image', src: 'logo', style: { widthPercent: 100 } },
                  { id: newId('f'), kind: 'field', bind: 'supplier.name', style: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' } },
                  { id: newId('f'), kind: 'field', bind: 'supplier.address', style: { fontSize: 9.5 } },
                  { id: newId('f'), kind: 'field', bind: 'supplier.taxOffice', style: { fontSize: 9.5 } },
                ],
              },
              {
                id: newId('c'),
                widthPercent: 38,
                blocks: [
                  { id: newId('f'), kind: 'field', bind: 'doc.type', style: { fontSize: 17, fontWeight: 'bold', textAlign: 'right', color: '#0284c7' } },
                  { id: newId('f'), kind: 'field', bind: 'doc.number', style: { fontSize: 11, textAlign: 'right', fontWeight: 'bold' } },
                  { id: newId('f'), kind: 'field', bind: 'doc.date', style: { fontSize: 10, textAlign: 'right' } },
                  { id: newId('f'), kind: 'field', bind: 'doc.time', style: { fontSize: 10, textAlign: 'right' } },
                ],
              },
            ],
          },
        ],
      },
      {
        id: newId('sec'),
        title: 'Taraflar',
        style: { padding: 8, background: '#f8fafc' },
        rows: [
          {
            id: newId('r'),
            style: { gap: 12 },
            columns: [
              {
                id: newId('c'),
                widthPercent: 50,
                blocks: [
                  { id: newId('t'), kind: 'text', text: 'SATICI', style: { fontSize: 10, fontWeight: 'bold', color: '#0284c7' } },
                  { id: newId('f'), kind: 'field', bind: 'supplier.name', style: { fontSize: 11, fontWeight: 'bold' } },
                  { id: newId('f'), kind: 'field', bind: 'supplier.taxNumber', style: { fontSize: 10 } },
                  { id: newId('f'), kind: 'field', bind: 'supplier.city', style: { fontSize: 10 } },
                ],
              },
              {
                id: newId('c'),
                widthPercent: 50,
                blocks: [
                  { id: newId('t'), kind: 'text', text: 'ALICI', style: { fontSize: 10, fontWeight: 'bold', color: '#0284c7' } },
                  { id: newId('f'), kind: 'field', bind: 'customer.name', style: { fontSize: 11, fontWeight: 'bold' } },
                  { id: newId('f'), kind: 'field', bind: 'customer.taxNumber', style: { fontSize: 10 } },
                  { id: newId('f'), kind: 'field', bind: 'customer.address', style: { fontSize: 10 } },
                  { id: newId('f'), kind: 'field', bind: 'customer.city', style: { fontSize: 10 } },
                ],
              },
            ],
          },
          {
            id: newId('r'),
            columns: [
              {
                id: newId('c'),
                widthPercent: 100,
                blocks: [
                  { id: newId('f'), kind: 'field', bind: 'doc.uuid', style: { fontSize: 9, color: '#6b7280' } },
                ],
              },
            ],
          },
        ],
      },
      {
        id: newId('sec'),
        title: 'Ürün Tablosu',
        rows: [
          {
            id: newId('r'),
            columns: [{ id: newId('c'), widthPercent: 100, blocks: [{ id: newId('it'), kind: 'invoice-table' }] }],
          },
        ],
      },
      {
        id: newId('sec'),
        title: 'Toplamlar',
        rows: [
          {
            id: newId('r'),
            columns: [
              { id: newId('c'), widthPercent: 58, blocks: [{ id: newId('cn'), kind: 'conditional-note', bind: 'doc.note', visibleWhen: 'bound-not-empty', style: { fontSize: 9.5 } }] },
              { id: newId('c'), widthPercent: 42, blocks: [{ id: newId('tt'), kind: 'totals-table' }] },
            ],
          },
        ],
      },
      {
        id: newId('sec'),
        title: 'Banka & İmza',
        rows: [
          {
            id: newId('r'),
            style: { gap: 12 },
            columns: [
              { id: newId('c'), widthPercent: 62, blocks: [{ id: newId('bt'), kind: 'bank-table' }] },
              { id: newId('c'), widthPercent: 38, blocks: [{ id: newId('sg'), kind: 'signature' }, { id: newId('q'), kind: 'qr' }] },
            ],
          },
        ],
      },
    ],
    productColumns: defaultProductColumns(),
  };
}
