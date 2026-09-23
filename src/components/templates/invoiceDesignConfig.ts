/**
 * İŞBEY CLOUD — FAZ 25.3-A1 FATURA TASARIM MODEL KATMANI
 * =======================================================
 * Fatura Tasarım Modülü'nün tek veri kaynağı.
 *
 * Mimari karar (docs/14 V2):
 *  - 6 hazır temadan 5'i mevcut InvoiceTemplates.tsx şablonlarına SARILIR
 *    (Kurumsal→corporate, Minimal→classic, Modern→modern,
 *     E-Ticaret→compact, Resmi Evrak→professional).
 *  - "Özel" tema: konfigüre edilebilir alan/renk kombinasyonu.
 *  - Mevcut DocumentTemplateSettings akışı BOZULMAZ; bu model
 *    resolveDesignToTemplateSettings() ile mevcut motora çözülür.
 *  - PrintModal / DocumentTemplateEngine değişmeden çalışmaya devam eder.
 */

import type { DocumentTemplateSettings, InvoiceTemplateType } from '../../types';

// ─── Tema kimlikleri ────────────────────────────────────────────────────────

export type InvoiceThemeId =
  | 'CORPORATE'   // Kurumsal
  | 'MINIMAL'     // Minimal
  | 'MODERN'      // Modern
  | 'ECOMMERCE'   // E-Ticaret
  | 'OFFICIAL'    // Resmi Evrak
  | 'CUSTOM';     // Özel Tasarım

// ─── Alan yönetimi (sürükle-bırak sıralaması) ───────────────────────────────

export type InvoiceFieldId =
  | 'logo'
  | 'companyHeader'
  | 'invoiceMeta'      // Fatura No / Tarih / Vade
  | 'customerBox'      // Cari / Vergi No / Adres
  | 'itemsTable'       // Ürün tablosu
  | 'totals'           // Ara Toplam / KDV / Genel Toplam
  | 'notes'            // Not Alanı
  | 'bankAccounts'     // Banka / IBAN bilgisi
  | 'qrCode'
  | 'stampSignature';  // Kaşe / İmza

export interface InvoiceFieldDef {
  id: InvoiceFieldId;
  label: string;
  description: string;
  /** Tablo alanları mı (kolon yönetimi) yoksa bölüm mü? */
  kind: 'SECTION' | 'COLUMN';
}

/** Sürükle-bırak panelinde görünen alan kataloğu */
export const INVOICE_FIELDS: InvoiceFieldDef[] = [
  { id: 'logo',           label: 'Logo',              description: 'Firma logosu üst başlıkta',    kind: 'SECTION' },
  { id: 'companyHeader',  label: 'Firma Bilgileri',   description: 'Unvan, adres, telefon, VKN',   kind: 'SECTION' },
  { id: 'invoiceMeta',    label: 'Fatura Künyesi',    description: 'Fatura No, Tarih, Vade',       kind: 'SECTION' },
  { id: 'customerBox',    label: 'Cari Bilgileri',    description: 'Müşteri unvanı, vergi no',     kind: 'SECTION' },
  { id: 'itemsTable',     label: 'Ürün Tablosu',      description: 'Kod, açıklama, miktar, fiyat', kind: 'SECTION' },
  { id: 'totals',         label: 'Toplamlar',         description: 'Ara Toplam, KDV, Genel Toplam', kind: 'SECTION' },
  { id: 'notes',          label: 'Not Alanı',         description: 'Fatura notları / açıklama',    kind: 'SECTION' },
  { id: 'bankAccounts',   label: 'Banka Bilgileri',   description: 'Ödeme banka hesapları / IBAN', kind: 'SECTION' },
  { id: 'qrCode',         label: 'QR Kod',            description: 'E-Fatura QR / karekod',        kind: 'SECTION' },
  { id: 'stampSignature', label: 'Kaşe / İmza',       description: 'Kaşe ve imza alanı',           kind: 'SECTION' },
];

/** Ürün tablosu kolon kimlikleri (bölüm kimliklerinden bağımsız) */
export type InvoiceColumnId = 'code' | 'description' | 'quantity' | 'unitPrice' | 'vat' | 'total' | 'discount';

/** Ürün tablosu kolon yönetimi kataloğu */
export const INVOICE_COLUMNS: { id: InvoiceColumnId; label: string; description: string; kind: 'COLUMN' }[] = [
  { id: 'code',        label: 'Kod',      description: 'Stok kodu',        kind: 'COLUMN' },
  { id: 'description', label: 'Açıklama', description: 'Mal/hizmet cinsi', kind: 'COLUMN' },
  { id: 'quantity',    label: 'Miktar',   description: 'Adet + birim',     kind: 'COLUMN' },
  { id: 'unitPrice',   label: 'Birim Fiyat', description: 'KDV hariç fiyat', kind: 'COLUMN' },
  { id: 'vat',         label: 'KDV %',    description: 'KDV oranı',        kind: 'COLUMN' },
  { id: 'total',       label: 'Tutar',    description: 'Satır toplamı',    kind: 'COLUMN' },
  { id: 'discount',    label: 'İskonto',  description: 'Satır iskontosu',  kind: 'COLUMN' },
];

// ─── Tasarım konfigürasyonu ─────────────────────────────────────────────────

export interface InvoiceDesignConfig {
  id: string;
  name: string;
  theme: InvoiceThemeId;
  isDefault: boolean;
  /** Vurgu rengi (başlık çizgileri, toplamlar, temalı bileşenler) */
  accentColor: string;
  /** Logo (dataURL — localStorage + backend JSON uyumlu) */
  logoDataUrl?: string;
  /** Alan göster/gizle — eksik alan = true (geriye dönük) */
  showSections?: Partial<Record<InvoiceFieldId, boolean>>;
  /** Ürün tablosu kolon sırası + görünürlüğü */
  columnOrder?: InvoiceColumnId[];
  headerNote?: string;
  footerNotes?: string;
  /** Kaşe/imza resmi (dataURL) */
  stampDataUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── 6 Hazır Tema ───────────────────────────────────────────────────────────

export interface PresetTheme {
  id: InvoiceThemeId;
  name: string;
  description: string;
  /** Hangi mevcut şablona sarılıyor (InvoiceTemplateType) */
  template: InvoiceTemplateType;
  accentColor: string;
  preview: { bg: string; header: string; accent: string };
  defaults?: Partial<InvoiceDesignConfig>;
}

/**
 * 2026-09-13 — RENK NOTU (VERİ / BASKI PALETİ — DÖNÜŞTÜRÜLMEDİ)
 * ===========================================================================
 * Aşağıdaki accentColor ve preview.* değerleri UYGULAMA TEMASI DEĞİL,
 * kullanıcının faturası için seçtiği/varsayılan gelen BASKI renkleridir
 * (veri katmanı). preview swatch'ı InvoiceDesignTab'da doğrudan fatura
 * önizlemesini temsil eden küçük bir görsel olarak çizilir — app chrome
 * değildir. Bu yüzden var(--*) token'larına ÇEVRİLMEZ.
 * ===========================================================================
 */

export const PRESET_THEMES: PresetTheme[] = [
  {
    id: 'CORPORATE',
    name: 'Kurumsal',
    description: 'Vurgu renkli başlık, kurumsal kimlik odaklı klasik düzen',
    template: 'corporate',
    accentColor: '#1e40af',
    preview: { bg: '#f8fafc', header: '#1e40af', accent: '#3b82f6' },
  },
  {
    id: 'MINIMAL',
    name: 'Minimal',
    description: 'Sade siyah-beyaz, Times New Roman, resmi çizgiler',
    template: 'classic',
    accentColor: '#111827',
    preview: { bg: '#ffffff', header: '#111827', accent: '#6b7280' },
  },
  {
    id: 'MODERN',
    name: 'Modern',
    description: 'Renkli paneller, yumuşak köşeler, çağdaş görünüm',
    template: 'modern',
    accentColor: '#0ea5e9',
    preview: { bg: '#f0f9ff', header: '#0284c7', accent: '#38bdf8' },
  },
  {
    id: 'ECOMMERCE',
    name: 'E-Ticaret',
    description: 'Kompakt düzen, hızlı perakende fiş görünümü',
    template: 'compact',
    accentColor: '#059669',
    preview: { bg: '#f0fdf4', header: '#047857', accent: '#10b981' },
  },
  {
    id: 'OFFICIAL',
    name: 'Resmi Evrak',
    description: 'Profesyonel resmi fatura, kaşe/imza vurgulu',
    template: 'professional',
    accentColor: '#3730a3',
    preview: { bg: '#f5f5ff', header: '#3730a3', accent: '#6366f1' },
  },
  {
    id: 'CUSTOM',
    name: 'Özel Tasarım',
    description: 'Alan seçimi, renk ve logo ile tamamen size özel',
    template: 'professional',
    accentColor: '#0f172a',
    preview: { bg: '#f1f5f9', header: '#0f172a', accent: '#64748b' },
    defaults: {
      showSections: {
        logo: true,
        companyHeader: true,
        invoiceMeta: true,
        customerBox: true,
        itemsTable: true,
        totals: true,
        notes: true,
        bankAccounts: false,
        qrCode: true,
        stampSignature: true,
      },
    },
  },
];

// ─── Varsayılan tasarım ─────────────────────────────────────────────────────

export const DEFAULT_INVOICE_DESIGN: InvoiceDesignConfig = {
  id: 'invd-default',
  name: 'Varsayılan Tasarım',
  theme: 'OFFICIAL',
  isDefault: true,
  accentColor: PRESET_THEMES[4].accentColor,
};

/** Tema kimliğini mevcut şablon tipine çöz (V2 sarım haritası) */
export const themeToTemplateType = (theme: InvoiceThemeId): InvoiceTemplateType =>
  PRESET_THEMES.find(t => t.id === theme)?.template ?? 'professional';

/** Tema kimliğini vurgu rengine çöz
 *  2026-09-13 — '#0f172a' fallback'i VERİ'dir (tasarımın vurgu rengi),
 *  uygulama teması değildir; baskı çıktısında kullanılır. Dokunulmadı. */
export const themeToAccentColor = (theme: InvoiceThemeId): string =>
  PRESET_THEMES.find(t => t.id === theme)?.accentColor ?? '#0f172a';

/**
 * FAZ 25.3-A3 köprü: InvoiceDesignConfig → mevcut DocumentTemplateSettings.
 * DocumentTemplateEngine + PrintModal mevcut imzasıyla çalışmaya devam eder;
 * tasarım modülü bu çözümleme üzerinden motora bağlanır.
 */
export function resolveDesignToTemplateSettings(
  design: InvoiceDesignConfig | null | undefined,
  fallback?: DocumentTemplateSettings
): DocumentTemplateSettings {
  if (!design || design.theme === 'CUSTOM' && !design.showSections) {
    // Özel tasarım konfigüre edilmemişse mevcut ayarları koru
    return fallback ?? resolveDesignToTemplateSettings(DEFAULT_INVOICE_DESIGN);
  }

  const s = design.showSections ?? {};
  return {
    invoiceTemplate: themeToTemplateType(design.theme),
    primaryColor: design.accentColor || themeToAccentColor(design.theme),
    accentColor: design.accentColor || themeToAccentColor(design.theme),
    showLogo: s.logo ?? true,
    showQrCode: s.qrCode ?? fallback?.showQrCode ?? true,
    showBankAccounts: s.bankAccounts ?? fallback?.showBankAccounts ?? false,
    selectedBankIds: fallback?.selectedBankIds,
    showStampAndSignature: s.stampSignature ?? true,
    headerNote: design.headerNote ?? fallback?.headerNote,
    footerNotes: design.footerNotes ?? fallback?.footerNotes,
    fontFamily: fallback?.fontFamily,
    fontSize: fallback?.fontSize,
  };
}

/**
 * Bir tasarımın tüm bölümleri açık mı kontrolü — UI'da "tüm alanlar aktif"
 * rozeti ve CUSTOM tema doğrulaması için kullanılır.
 */
export const isAllSectionsVisible = (design: InvoiceDesignConfig): boolean =>
  INVOICE_FIELDS.every(f => design.showSections?.[f.id] !== false);

/** Güvenli kopya — dışarıdan gelen (backend/localStorage) JSON'u doğrular */
export function sanitizeInvoiceDesign(input: unknown): InvoiceDesignConfig {
  const raw = (input ?? {}) as Partial<InvoiceDesignConfig>;
  const theme: InvoiceThemeId = PRESET_THEMES.some(t => t.id === raw.theme)
    ? (raw.theme as InvoiceThemeId)
    : 'CUSTOM';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : 'invd-' + Date.now(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'İsimsiz Tasarım',
    theme,
    isDefault: raw.isDefault === true,
    accentColor: typeof raw.accentColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.accentColor)
      ? raw.accentColor
      : themeToAccentColor(theme),
    logoDataUrl: typeof raw.logoDataUrl === 'string' ? raw.logoDataUrl : undefined,
    stampDataUrl: typeof raw.stampDataUrl === 'string' ? raw.stampDataUrl : undefined,
    showSections: raw.showSections && typeof raw.showSections === 'object' ? { ...raw.showSections } : undefined,
    columnOrder: Array.isArray(raw.columnOrder) ? raw.columnOrder.filter(Boolean) : undefined,
    headerNote: typeof raw.headerNote === 'string' ? raw.headerNote : undefined,
    footerNotes: typeof raw.footerNotes === 'string' ? raw.footerNotes : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
