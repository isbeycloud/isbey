/**
 * İŞBEY CLOUD — KAPSAMLI RAPOR FİLTRE TİPLERİ (2026-10-17)
 * =========================================================
 * Sunucudaki sözleşmenin (`server/routes/v1/report-detail.ts`) İSTEMCİ yüzü.
 *
 * İki kural burada da geçerlidir:
 *   1. GEÇERSİZ FİLTRE SESSİZ KALMAZ. Sunucu 400 döner; istemci de "kayıt yok"
 *      ekranı göstermek yerine hatayı AÇIKÇA gösterir. Aksi hâlde kullanıcı
 *      bozuk tarih aralığını "veri yok" sanır (bkz. `search=undefined` olayı).
 *   2. BOŞ FİLTRE GÖNDERİLMEZ. `buildQuery` yalnız DOLU değerleri geçirir;
 *      `undefined` metni sorguya düşüp tüm listeyi boşaltmaz.
 */

export interface ReportFilterState {
  startDate: string;
  endDate: string;
  customerIds: string[];
  productIds: string[];
  variantIds: string[];
  warehouseIds: string[];
  cashRegisterIds: string[];
  bankAccountIds: string[];
  statuses: string[];
  types: string[];
  minAmount: string;   // metin tutulur; kullanıcı yazarken yarım değer bozulmasın
  maxAmount: string;
  search: string;
}

export const EMPTY_REPORT_FILTERS: ReportFilterState = {
  startDate: '',
  endDate: '',
  customerIds: [],
  productIds: [],
  variantIds: [],
  warehouseIds: [],
  cashRegisterIds: [],
  bankAccountIds: [],
  statuses: [],
  types: [],
  minAmount: '',
  maxAmount: '',
  search: '',
};

export interface ReportFilterOptions {
  customers: { id: string; code: string; title: string }[];
  products: { id: string; code: string; name: string }[];
  variants: { id: string; name: string; productId: string; productName: string; barcode?: string }[];
  warehouses: { id: string; code: string; name: string }[];
  cashRegisters: { id: string; code: string; name: string; currency?: string }[];
  bankAccounts: { id: string; name: string; bankName?: string; currency?: string }[];
  statuses: string[];
  types: string[];
}

export const EMPTY_FILTER_OPTIONS: ReportFilterOptions = {
  customers: [], products: [], variants: [], warehouses: [],
  cashRegisters: [], bankAccounts: [], statuses: [], types: [],
};

/** Ekranda gösterilen etiketler (sunucu kodları → Türkçe) */
export const DOC_TYPE_LABELS: Record<string, string> = {
  SALES: 'Satış', PURCHASE: 'Alış', RETAIL_POS: 'Perakende (POS)',
  COLLECTION: 'Tahsilat', PAYMENT: 'Ödeme', EXPENSE: 'Gider',
  TRANSFER_TO_BANK: 'Kasadan Bankaya Virman',
  TRANSFER_FROM_BANK: 'Bankadan Kasaya Virman',
  TRANSFER_TO_CASH: 'Bankadan Kasaya Virman',
  TRANSFER_FROM_CASH: 'Kasadan Bankaya Virman',
  HAVALE_EFT_IN: 'Gelen Havale/EFT', HAVALE_EFT_OUT: 'Giden Havale/EFT',
  POS_COLLECTION: 'POS Tahsilatı',
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif', PASSIVE: 'Pasif', PAID: 'Ödendi', PARTIAL: 'Kısmi Ödendi',
  UNPAID: 'Ödenmedi', CANCELLED: 'İptal', DRAFT: 'Taslak',
};

/**
 * Filtre durumunu SUNUCUNUN BEKLEDİĞİ sorgu nesnesine çevirir.
 *
 * Boş diziler ve boş metinler GÖNDERİLMEZ: sunucu tarafında `?statuses=` gibi
 * boş bir parametre "kullanıcı bir şey seçti" sanılabilir.
 */
export function toQueryParams(f: ReportFilterState): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const putList = (key: string, list: string[]) => {
    if (list.length > 0) params[key] = list.join(',');
  };
  if (f.startDate) params.startDate = f.startDate;
  if (f.endDate) params.endDate = f.endDate;
  if (f.minAmount.trim() !== '') params.minAmount = f.minAmount.trim();
  if (f.maxAmount.trim() !== '') params.maxAmount = f.maxAmount.trim();
  if (f.search.trim() !== '') params.search = f.search.trim();
  putList('customerIds', f.customerIds);
  putList('productIds', f.productIds);
  putList('variantIds', f.variantIds);
  putList('warehouseIds', f.warehouseIds);
  putList('cashRegisterIds', f.cashRegisterIds);
  putList('bankAccountIds', f.bankAccountIds);
  putList('statuses', f.statuses);
  putList('types', f.types);
  return params;
}

/** Hiç filtre seçili mi? (Ekranda "temizle" düğmesini anlamlı kılar.) */
export function hasAnyFilter(f: ReportFilterState): boolean {
  return Object.keys(toQueryParams(f)).length > 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * İSTEMCİ TARAFI ÖN DOĞRULAMA. Sunucu da doğrular (tek yetkili orasıdır;
 * buradaki kontrol yalnız anında geri bildirim içindir). İki yerin kuralları
 * AYNI tutulmalıdır — biri gevşerse kullanıcı 400 mesajını gidiş-dönüşle görür.
 */
export function isValidCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function validateFilters(f: ReportFilterState): string | null {
  if (f.startDate && !isValidCalendarDate(f.startDate)) return 'Başlangıç tarihi geçerli bir takvim tarihi değildir.';
  if (f.endDate && !isValidCalendarDate(f.endDate)) return 'Bitiş tarihi geçerli bir takvim tarihi değildir.';
  if (f.startDate && f.endDate && f.startDate > f.endDate) return 'Başlangıç tarihi, bitiş tarihinden sonra olamaz.';

  const min = f.minAmount.trim() === '' ? undefined : Number(f.minAmount);
  const max = f.maxAmount.trim() === '' ? undefined : Number(f.maxAmount);
  if (min !== undefined && !Number.isFinite(min)) return 'Alt tutar sayısal olmalıdır.';
  if (max !== undefined && !Number.isFinite(max)) return 'Üst tutar sayısal olmalıdır.';
  if (min !== undefined && max !== undefined && min > max) return 'Alt tutar, üst tutardan büyük olamaz.';
  return null;
}
