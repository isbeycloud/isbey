// Form Designer Frontend Types
// Bu dosya server/db/schema.ts'deki FormDesign interface'lerinin
// frontend kopyasıdır.

export type FormDocumentType =
  | 'INVOICE_SALES'
  | 'INVOICE_PURCHASE'
  | 'WAYBILL'
  | 'QUOTE'
  | 'ORDER'
  | 'STATEMENT'
  | 'RECEIPT'
  | 'EXPENSE'
  | 'CHEQUE';

export const DOCUMENT_TYPE_LABELS: Record<FormDocumentType, string> = {
  INVOICE_SALES: 'Satış Faturası',
  INVOICE_PURCHASE: 'Alış Faturası',
  WAYBILL: 'İrsaliye',
  QUOTE: 'Teklif',
  ORDER: 'Sipariş',
  STATEMENT: 'Ekstre / Hesap Özeti',
  RECEIPT: 'Fiş / Makbuz',
  EXPENSE: 'Gider',
  CHEQUE: 'Çek / Senet',
};

export type FormElementType =
  | 'LABEL'
  | 'TEXTBOX'
  | 'NUMBERBOX'
  | 'DATEPICKER'
  | 'COMBOBOX'
  | 'CHECKBOX'
  | 'CUSTOMER_FIELD'
  | 'PRODUCT_TABLE'
  | 'TOTALS_TABLE'
  | 'IMAGE'
  | 'LOGO'
  | 'QRCODE'
  | 'SIGNATURE'
  | 'DIVIDER'
  | 'GROUP_BOX'
  | 'SPACER';

export const ELEMENT_TYPE_LABELS: Record<FormElementType, string> = {
  LABEL: 'Etiket',
  TEXTBOX: 'Metin Kutusu',
  NUMBERBOX: 'Sayı Kutusu',
  DATEPICKER: 'Tarih',
  COMBOBOX: 'Açılır Liste',
  CHECKBOX: 'Onay Kutusu',
  CUSTOMER_FIELD: 'Cari Alanı',
  PRODUCT_TABLE: 'Ürün Tablosu',
  TOTALS_TABLE: 'Toplam Tablosu',
  IMAGE: 'Resim',
  LOGO: 'Logo',
  QRCODE: 'QR Kod',
  SIGNATURE: 'İmza / Kaşe',
  DIVIDER: 'Ayırıcı Çizgi',
  GROUP_BOX: 'Grup Kutusu',
  SPACER: 'Boşluk',
};

export type FormSectionType =
  | 'HEADER'
  | 'CUSTOMER'
  | 'LINES'
  | 'TOTALS'
  | 'PAYMENT'
  | 'FOOTER'
  | 'CUSTOM';

export const SECTION_TYPE_LABELS: Record<FormSectionType, string> = {
  HEADER: 'Başlık',
  CUSTOMER: 'Müşteri / Cari Bilgileri',
  LINES: 'Ürün Kalemleri',
  TOTALS: 'Toplamlar',
  PAYMENT: 'Ödeme Bilgileri',
  FOOTER: 'Alt Bilgi',
  CUSTOM: 'Özel Bölüm',
};

export interface FormElementProps {
  label?: string;
  placeholder?: string;
  value?: string;
  dataBinding?: string;
  format?: string;
  required?: boolean;
  readOnly?: boolean;
  visible?: boolean;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | '500' | '600' | '700';
  fontAlign?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
  border?: string;
  borderRadius?: number;
  paddingH?: number;
  paddingV?: number;
  src?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineThickness?: number;
  lineColor?: string;
  qrData?: string;
  title?: string;
}

export interface FormElement {
  id: string;
  type: FormElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  props: FormElementProps;
  zIndex?: number;
  locked?: boolean;
}

export interface FormSection {
  id: string;
  type: FormSectionType;
  label: string;
  order: number;
  height: number;
  visible: boolean;
  isBuiltIn?: boolean;
  elements: FormElement[];
  backgroundColor?: string;
  paddingH?: number;
  paddingV?: number;
}

export interface FormDesign {
  id: string;
  name: string;
  documentType: FormDocumentType;
  description?: string;
  version: number;
  isDefault: boolean;
  isBuiltIn: boolean;
  paperSize: 'A4' | 'A5' | 'THERMAL_80';
  orientation: 'portrait' | 'landscape';
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  sections: FormSection[];
  metadata?: {
    primaryColor?: string;
    showPageNumbers?: boolean;
    showWatermark?: boolean;
    watermarkText?: string;
  };
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// ─── Data Binding Tree ────────────────────────────────────────────────────

export interface DataBindingNode {
  path: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
  children?: DataBindingNode[];
  format?: string;
  description?: string;
}

export const DATA_BINDING_TREE: DataBindingNode[] = [
  {
    path: 'company',
    label: 'Şirket',
    type: 'object',
    children: [
      { path: 'company.name', label: 'Kısa Ad', type: 'string' },
      { path: 'company.title', label: 'Ticari Ünvan', type: 'string' },
      { path: 'company.taxNumber', label: 'Vergi No', type: 'string' },
      { path: 'company.taxOffice', label: 'Vergi Dairesi', type: 'string' },
      { path: 'company.taxInfo', label: 'VD + VKN (hazır)', type: 'string' },
      { path: 'company.address', label: 'Adres', type: 'string' },
      { path: 'company.city', label: 'Şehir', type: 'string' },
      { path: 'company.phone', label: 'Telefon', type: 'string' },
      { path: 'company.email', label: 'E-posta', type: 'string' },
    ],
  },
  {
    path: 'customer',
    label: 'Müşteri / Cari',
    type: 'object',
    children: [
      { path: 'customer.code', label: 'Cari Kodu', type: 'string' },
      { path: 'customer.title', label: 'Ünvan', type: 'string' },
      { path: 'customer.contactName', label: 'Yetkili Adı', type: 'string' },
      { path: 'customer.taxNumber', label: 'Vergi No', type: 'string' },
      { path: 'customer.taxOffice', label: 'Vergi Dairesi', type: 'string' },
      { path: 'customer.taxInfo', label: 'VD + VKN (hazır)', type: 'string' },
      { path: 'customer.phone', label: 'Telefon', type: 'string' },
      { path: 'customer.email', label: 'E-posta', type: 'string' },
      { path: 'customer.address', label: 'Adres', type: 'string' },
      { path: 'customer.city', label: 'Şehir', type: 'string' },
      { path: 'customer.iban', label: 'IBAN', type: 'string' },
    ],
  },
  {
    path: 'invoice',
    label: 'Fatura / Belge',
    type: 'object',
    children: [
      { path: 'invoice.no', label: 'Belge No', type: 'string' },
      { path: 'invoice.date', label: 'Tarih', type: 'date', format: 'DATE_TR' },
      { path: 'invoice.dueDate', label: 'Vade Tarihi', type: 'date', format: 'DATE_TR' },
      { path: 'invoice.type', label: 'Tür', type: 'string' },
      { path: 'invoice.subtotal', label: 'Ara Toplam', type: 'number', format: 'TR_CURRENCY' },
      { path: 'invoice.vatTotal', label: 'KDV Toplam', type: 'number', format: 'TR_CURRENCY' },
      { path: 'invoice.discountTotal', label: 'İskonto', type: 'number', format: 'TR_CURRENCY' },
      { path: 'invoice.grandTotal', label: 'Genel Toplam', type: 'number', format: 'TR_CURRENCY' },
      { path: 'invoice.grandTotalText', label: 'Toplam (Yazıyla)', type: 'string' },
      { path: 'invoice.paymentMethod', label: 'Ödeme Yöntemi', type: 'string' },
      { path: 'invoice.notes', label: 'Notlar', type: 'string' },
    ],
  },
  {
    path: 'invoice.lines',
    label: 'Fatura Kalemleri (tablo)',
    type: 'array',
    children: [
      { path: 'invoice.lines[].productCode', label: 'Ürün Kodu', type: 'string' },
      { path: 'invoice.lines[].productName', label: 'Ürün Adı', type: 'string' },
      { path: 'invoice.lines[].quantity', label: 'Miktar', type: 'number' },
      { path: 'invoice.lines[].unitPrice', label: 'Birim Fiyat', type: 'number', format: 'TR_CURRENCY' },
      { path: 'invoice.lines[].discountRate', label: 'İskonto %', type: 'number' },
      { path: 'invoice.lines[].vatRate', label: 'KDV %', type: 'number' },
      { path: 'invoice.lines[].lineTotal', label: 'Satır Toplam', type: 'number', format: 'TR_CURRENCY' },
    ],
  },
];

// ─── Toolbox Item Definitions ─────────────────────────────────────────────

export interface ToolboxItem {
  type: FormElementType;
  label: string;
  icon: string;
  defaultWidth: number;
  defaultHeight: number;
  defaultProps: Partial<FormElementProps>;
  group: 'BASIC' | 'ERP' | 'DOCUMENT' | 'LAYOUT';
}

export const TOOLBOX_ITEMS: ToolboxItem[] = [
  // BASIC
  { type: 'LABEL', label: 'Etiket', icon: 'T', group: 'BASIC', defaultWidth: 200, defaultHeight: 20, defaultProps: { value: 'Etiket Metni', fontSize: 11, fontAlign: 'left' } },
  { type: 'TEXTBOX', label: 'Metin Kutusu', icon: '⌨', group: 'BASIC', defaultWidth: 200, defaultHeight: 24, defaultProps: { placeholder: 'Metin...', fontSize: 11 } },
  { type: 'NUMBERBOX', label: 'Sayı Kutusu', icon: '#', group: 'BASIC', defaultWidth: 120, defaultHeight: 24, defaultProps: { format: 'NUMBER_2', fontSize: 11 } },
  { type: 'DATEPICKER', label: 'Tarih', icon: '📅', group: 'BASIC', defaultWidth: 130, defaultHeight: 24, defaultProps: { format: 'DATE_TR', fontSize: 11 } },
  { type: 'CHECKBOX', label: 'Onay Kutusu', icon: '☑', group: 'BASIC', defaultWidth: 140, defaultHeight: 20, defaultProps: { label: 'Seçenek', fontSize: 11 } },
  // ERP
  { type: 'CUSTOMER_FIELD', label: 'Cari Alanı', icon: '👤', group: 'ERP', defaultWidth: 300, defaultHeight: 70, defaultProps: {} },
  { type: 'PRODUCT_TABLE', label: 'Ürün Tablosu', icon: '📋', group: 'ERP', defaultWidth: 760, defaultHeight: 300, defaultProps: {} },
  { type: 'TOTALS_TABLE', label: 'Toplam Tablosu', icon: '∑', group: 'ERP', defaultWidth: 300, defaultHeight: 100, defaultProps: {} },
  // DOCUMENT
  { type: 'LOGO', label: 'Şirket Logosu', icon: '🏷', group: 'DOCUMENT', defaultWidth: 140, defaultHeight: 70, defaultProps: { objectFit: 'contain' } },
  { type: 'IMAGE', label: 'Resim', icon: '🖼', group: 'DOCUMENT', defaultWidth: 200, defaultHeight: 120, defaultProps: { objectFit: 'contain' } },
  { type: 'QRCODE', label: 'QR Kod', icon: '⊞', group: 'DOCUMENT', defaultWidth: 80, defaultHeight: 80, defaultProps: {} },
  { type: 'SIGNATURE', label: 'İmza / Kaşe', icon: '✍', group: 'DOCUMENT', defaultWidth: 160, defaultHeight: 60, defaultProps: {} },
  { type: 'DIVIDER', label: 'Çizgi', icon: '─', group: 'DOCUMENT', defaultWidth: 760, defaultHeight: 4, defaultProps: { lineStyle: 'solid', lineThickness: 1, lineColor: '#000000' } },
  { type: 'GROUP_BOX', label: 'Grup Kutusu', icon: '⬜', group: 'DOCUMENT', defaultWidth: 300, defaultHeight: 100, defaultProps: { title: 'Grup' } },
  // LAYOUT
  { type: 'SPACER', label: 'Boşluk', icon: '⬛', group: 'LAYOUT', defaultWidth: 100, defaultHeight: 20, defaultProps: {} },
];

// ─── History ──────────────────────────────────────────────────────────────

export interface HistoryEntry {
  sections: FormSection[];
  description: string;
  timestamp: number;
}

// ─── Canvas Paper Sizes ───────────────────────────────────────────────────

export const PAPER_SIZES = {
  A4: { width: 760, label: 'A4 (210mm × 297mm)' },
  A5: { width: 540, label: 'A5 (148mm × 210mm)' },
  THERMAL_80: { width: 302, label: 'Termal 80mm' },
};

// ─── Data Format Helpers ──────────────────────────────────────────────────

export const FORMAT_OPTIONS = [
  { value: '', label: 'Ham Değer' },
  { value: 'DATE_TR', label: 'Tarih (GG.AA.YYYY)' },
  { value: 'DATETIME_TR', label: 'Tarih Saat' },
  { value: 'TR_CURRENCY', label: 'Para Birimi (₺)' },
  { value: 'NUMBER_0', label: 'Sayı (tam)' },
  { value: 'NUMBER_2', label: 'Sayı (2 ondalık)' },
  { value: 'PERCENT', label: 'Yüzde (%)' },
  { value: 'UPPERCASE', label: 'BÜYÜK HARF' },
  { value: 'TITLECASE', label: 'Baş Harf Büyük' },
];

export function formatValue(value: any, format?: string): string {
  if (value === undefined || value === null) return '';
  switch (format) {
    case 'DATE_TR':
      try { return new Date(value).toLocaleDateString('tr-TR'); } catch { return String(value); }
    case 'DATETIME_TR':
      try { return new Date(value).toLocaleString('tr-TR'); } catch { return String(value); }
    case 'TR_CURRENCY':
      return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
    case 'NUMBER_0':
      return Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
    case 'NUMBER_2':
      return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'PERCENT':
      return '%' + Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    case 'UPPERCASE':
      return String(value).toUpperCase();
    case 'TITLECASE':
      return String(value).replace(/\b\w/g, c => c.toUpperCase());
    default:
      return String(value);
  }
}
