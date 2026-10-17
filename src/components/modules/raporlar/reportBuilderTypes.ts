/**
 * İŞBEY CLOUD — FAZ 25.3-C RAPOR TASARIM MOTORU: TİPLER + KOLON KATALOĞU
 * ======================================================================
 * ReportDesignerView'ın veri modeli, alan/kolon tanımları ve
 * Excel(CSV)/yazdırma yardımcıları. Backend karşılığı: ReportDesignRecord
 * (server/db/schema.ts) + /api/report-designs route.
 */

// ─── Veri kaynakları ────────────────────────────────────────────────────────

export type ReportDataSource = 'SALES' | 'PURCHASE' | 'CUSTOMER' | 'CASH' | 'STOCK' | 'VAT';

export const DATA_SOURCE_LABELS: Record<ReportDataSource, string> = {
  SALES: 'Satış Faturaları',
  PURCHASE: 'Alış Faturaları',
  CUSTOMER: 'Cari Hesaplar',
  CASH: 'Kasa Hareketleri',
  STOCK: 'Stok Durumu',
  VAT: 'KDV Kayıtları',
};

export type ReportChartType = 'BAR' | 'LINE' | 'DOUGHNUT' | 'TABLE';

export const CHART_LABELS: Record<ReportChartType, string> = {
  BAR: 'Bar', LINE: 'Çizgi', DOUGHNUT: 'Pasta', TABLE: 'Sadece Tablo',
};

export type ReportFieldId = 'date' | 'customer' | 'product' | 'vat' | 'employee' | 'region' | 'warehouse';

export interface ReportFieldDef {
  id: ReportFieldId;
  label: string;
  /** Hangi veri kaynaklarında anlamlı */
  sources: ReportDataSource[];
}

/** Alan seçici kataloğu (onaylı kapsam: tarih/cari/ürün/KDV/personel/bölge/depo) */
export const REPORT_FIELDS: ReportFieldDef[] = [
  { id: 'date',      label: 'Tarih',    sources: ['SALES', 'PURCHASE', 'CASH', 'VAT'] },
  { id: 'customer',  label: 'Cari',     sources: ['SALES', 'PURCHASE', 'CUSTOMER', 'CASH'] },
  { id: 'product',   label: 'Ürün',     sources: ['SALES', 'PURCHASE', 'STOCK'] },
  { id: 'vat',       label: 'KDV',      sources: ['SALES', 'PURCHASE', 'VAT'] },
  { id: 'employee',  label: 'Personel', sources: [] },          // veri hazır olunca otomatik dolar
  { id: 'region',    label: 'Bölge',    sources: ['CUSTOMER'] },
  { id: 'warehouse', label: 'Depo',     sources: ['STOCK'] },
];

export type ReportKpiId = 'revenue' | 'count' | 'avg' | 'growth' | 'receivable' | 'payable';

export const KPI_LABELS: Record<ReportKpiId, string> = {
  revenue: 'Toplam Ciro', count: 'Kayıt Sayısı', avg: 'Ortalama Tutar',
  growth: 'Büyüme %', receivable: 'Toplam Alacak', payable: 'Toplam Borç',
};

/** Kayıtlı rapor tasarımı (backend ReportDesignRecord'un frontend yüzü) */
export interface ReportDesign {
  id: string;
  name: string;
  dataSource: ReportDataSource;
  chartType: ReportChartType;
  fields: ReportFieldId[];
  columns?: string[];
  kpis?: ReportKpiId[];
  /**
   * Rapor oluşturucu filtreleri (2026-10-17 genişletmesi).
   * ÖNCE yalnız tarih/cari/depo vardı; varyant, ürün, durum ve TUTAR ARALIĞI
   * eklenince "özel rapor kurma" gerçekten kapsamlı oldu. Tüm alanlar
   * OPSİYONELDİR: tanımsız filtre satırı hiç elenmez.
   */
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    customerIds?: string[];
    warehouseIds?: string[];
    productIds?: string[];
    /** Yalnız ürünün varyantlarından en az biri seçiliyse satır geçer. */
    variantIds?: string[];
    /** Kaynak kodları: ACTIVE/PASSIVE (stok), PAID/PARTIAL/UNPAID (fatura). */
    statuses?: string[];
    minAmount?: number;
    maxAmount?: number;
  };
  /** Grafik/tablo gruplaması; yoksa ilk tarih dışı alan kullanılır. */
  groupBy?: ReportFieldId;
  createdAt?: string;
  updatedAt?: string;
}

/** Boş tasarım — yeni rapor oluşturma varsayılanı */
export const NEW_REPORT_DESIGN: Omit<ReportDesign, 'id'> = {
  name: 'Yeni Satış Raporu',
  dataSource: 'SALES',
  chartType: 'BAR',
  fields: ['date', 'customer', 'product', 'vat'],
  kpis: ['revenue', 'count', 'growth'],
  // Filtre nesnesi boş başlar: kaydederken `hasDesignFilters` yalnız DOLU
  // alanları yazar, boş `{}` diske düşmez.
  filters: {},
};

/** Kaynak bazında SEÇİLEBİLİR durum kodları (rapor oluşturucu durum filtresi). */
export const SOURCE_STATUSES: Partial<Record<ReportDataSource, { id: string; label: string }[]>> = {
  SALES: [
    { id: 'PAID', label: 'Ödendi' }, { id: 'PARTIAL', label: 'Kısmi Ödendi' },
    { id: 'UNPAID', label: 'Ödenmedi' }, { id: 'DRAFT', label: 'Taslak' },
  ],
  PURCHASE: [
    { id: 'PAID', label: 'Ödendi' }, { id: 'PARTIAL', label: 'Kısmi Ödendi' },
    { id: 'UNPAID', label: 'Ödenmedi' }, { id: 'DRAFT', label: 'Taslak' },
  ],
  STOCK: [{ id: 'ACTIVE', label: 'Aktif' }, { id: 'PASSIVE', label: 'Pasif' }],
};

// ─── Kolon tanımları (Alan → başlık) ────────────────────────────────────────

export const FIELD_COLUMN_LABELS: Record<ReportFieldId, string> = {
  date: 'Tarih', customer: 'Cari', product: 'Ürün / Hizmet', vat: 'KDV',
  employee: 'Personel', region: 'Bölge', warehouse: 'Depo',
};

export const AMOUNT_LABEL: Record<ReportDataSource, string> = {
  SALES: 'Tutar', PURCHASE: 'Tutar', CUSTOMER: 'Bakiye',
  CASH: 'Hareket', STOCK: 'Mevcut Stok', VAT: 'KDV Tutarı',
};

// ─── Veri kümesi: satırlar normalize edilmiş alan anahtarlarıyla ────────────

export interface ReportRow {
  date?: string;
  customer?: string;
  customerId?: string;   // filtre eşleştirmesi için (filters.customerIds)
  product?: string;
  productId?: string;    // filtre eşleştirmesi için (filters.productIds)
  /** Satırın bağlı olduğu varyant(lar) — filters.variantIds için. */
  variantIds?: string[];
  /** Ham durum kodu (ACTIVE/PASSIVE/PAID/PARTIAL/UNPAID…) — filters.statuses için. */
  status?: string;
  vat?: number;
  employee?: string;
  region?: string;
  warehouse?: string;
  warehouseId?: string;  // filtre eşleştirmesi için (filters.warehouseIds)
  amount: number;
}

// ─── KPI hesapları ──────────────────────────────────────────────────────────

export interface ReportKpis {
  revenue: number;
  count: number;
  avg: number;
  growth: number | null;   // aylık karşılaştırma imkânsızsa null
  receivable: number;
  payable: number;
}

const monthKey = (dateStr?: string): string => (dateStr || '').slice(0, 7); // YYYY-MM

export function computeKpis(rows: ReportRow[], kpis: ReportKpiId[] | undefined, currentMonth: string): ReportKpis {
  const revenue = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const count = rows.length;
  const avg = count > 0 ? revenue / count : 0;

  // Büyüme: seçili ay vs önceki ay (tarih alanlı veride)
  let growth: number | null = null;
  const thisMonth = rows.filter(r => monthKey(r.date) === currentMonth).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const prev = new Date(currentMonth + '-01');
  prev.setMonth(prev.getMonth() - 1);
  const prevMonthKey = prev.toISOString().slice(0, 7);
  const prevMonth = rows.filter(r => monthKey(r.date) === prevMonthKey).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (prevMonth > 0) growth = Math.round(((thisMonth - prevMonth) / prevMonth) * 1000) / 10;

  // Alacak/Borç: yalnız Cari kaynağında anlamlı
  let receivable = 0, payable = 0;
  for (const r of rows) {
    const bal = Number(r.amount) || 0;
    if (bal > 0) receivable += bal; else payable += Math.abs(bal);
  }

  return {
    revenue,
    count,
    avg,
    growth,
    receivable: kpis?.includes('receivable') ? receivable : 0,
    payable: kpis?.includes('payable') ? payable : 0,
  };
}

// ─── Grafik verisi: ilk alan boyutuna göre gruplama ─────────────────────────

export function buildChartData(rows: ReportRow[], groupField: ReportFieldId | undefined, limit = 8) {
  if (!groupField) return null;
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const raw = r[groupField];
    const key = typeof raw === 'number' ? String(raw) : (raw || '-');
    buckets.set(key, (buckets.get(key) || 0) + (Number(r.amount) || 0));
  }
  const entries = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  return {
    labels: entries.map(([k]) => k),
    values: entries.map(([, v]) => Math.round(v * 100) / 100),
  };
}

// ─── Excel (CSV) çıktısı — Türkçe Excel uyumlu (BOM + ; + virgül ondalık) ───

export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tasarımın alan listesinden tablo kolon sırası üret (alan kataloğu sırasıyla) */
export function orderedFields(fields: ReportFieldId[]): ReportFieldId[] {
  return REPORT_FIELDS.map(f => f.id).filter(id => fields.includes(id));
}

/**
 * Tasarım filtrelerini satır kümesine uygula.
 *
 * Kural: tanımsız/boş filtre satırı ELEMEZ. "Seçili değil" ile "hiçbiriyle
 * eşleşmiyor" ayrımı korunur — boş liste gönderilirse filtre yok sayılır.
 * Tarih karşılaştırması YYYY-AA-GG metin sırasıyla yapılır (aynı biçim,
 * aynı sonuç); tutar karşılaştırması sayısaldır.
 */
export function applyFilters(rows: ReportRow[], filters: ReportDesign['filters'] | undefined): ReportRow[] {
  if (!filters) return rows;
  const dateFrom = filters.dateFrom ? filters.dateFrom.slice(0, 10) : '';
  const dateTo = filters.dateTo ? filters.dateTo.slice(0, 10) : '';
  const setOf = (list?: string[]) => (list && list.length > 0 ? new Set(list) : null);
  const customerSet = setOf(filters.customerIds);
  const warehouseSet = setOf(filters.warehouseIds);
  const productSet = setOf(filters.productIds);
  const variantSet = setOf(filters.variantIds);
  const statusSet = setOf(filters.statuses);
  const hasMin = typeof filters.minAmount === 'number' && Number.isFinite(filters.minAmount);
  const hasMax = typeof filters.maxAmount === 'number' && Number.isFinite(filters.maxAmount);

  return rows.filter(r => {
    if (dateFrom && r.date && r.date.slice(0, 10) < dateFrom) return false;
    if (dateTo && r.date && r.date.slice(0, 10) > dateTo) return false;
    // DEĞER FİLTRELERİ KATIDIR: alanı taşımayan satır da ELENİR. Neden: kullanıcı
    // "A Cari" seçtiğinde carisi belli olmayan bir satırın sonuca sızması
    // filtrenin çalışmadığı izlenimini verir. SADECE TARİH filtresi esnektir —
    // çünkü stok gibi kaynaklarda satırda tarih alanı hiç yoktur ve katı
    // davranış o raporu tümden boşaltırdı.
    if (customerSet && !(r.customerId && customerSet.has(r.customerId))) return false;
    if (warehouseSet && !(r.warehouseId && warehouseSet.has(r.warehouseId))) return false;
    if (productSet && !(r.productId && productSet.has(r.productId))) return false;
    // Varyant: satırın varyantlarından EN AZ BİRİ seçiliyse geçer.
    if (variantSet && !(r.variantIds && r.variantIds.some(v => variantSet.has(v)))) return false;
    if (statusSet && !(r.status && statusSet.has(r.status))) return false;
    const amount = Math.abs(Number(r.amount) || 0);
    if (hasMin && amount < filters.minAmount!) return false;
    if (hasMax && amount > filters.maxAmount!) return false;
    return true;
  });
}

/** Filtre tanımı BOŞ mu? (Kaydetme sırasında anlamsız nesne yazmamak için.) */
export function hasDesignFilters(filters: ReportDesign['filters'] | undefined): boolean {
  if (!filters) return false;
  return Object.values(filters).some(
    v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  );
}

/**
 * Gruplama: alan değerine göre toplam tutar. Grafik ve özet tablo aynı
 * fonksiyonu kullanır ki iki görünüm BİRBİRİYLE ÇELİŞMESİN.
 * `null` döner → gruplanabilir alan yok.
 */
export function groupTotals(
  rows: ReportRow[], field: ReportFieldId | undefined, limit = 20,
): { labels: string[]; values: number[]; counts: number[]; totals: { sum: number; count: number; avg: number } } | null {
  if (!field) return null;
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const raw = r[field];
    const key = typeof raw === 'number' ? String(raw) : (raw || '(boş)');
    const prev = buckets.get(key) || { sum: 0, count: 0 };
    buckets.set(key, { sum: prev.sum + (Number(r.amount) || 0), count: prev.count + 1 });
  }
  const entries = [...buckets.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, limit);
  const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return {
    labels: entries.map(([k]) => k),
    values: entries.map(([, v]) => Math.round(v.sum * 100) / 100),
    counts: entries.map(([, v]) => v.count),
    totals: {
      sum: Math.round(sum * 100) / 100,
      count: rows.length,
      avg: rows.length > 0 ? Math.round((sum / rows.length) * 100) / 100 : 0,
    },
  };
}

/** Alanın bu veri kaynağında veriye sahip olup olmadığı (UI ipucu) */
export const fieldHasData = (field: ReportFieldId, source: ReportDataSource): boolean =>
  REPORT_FIELDS.find(f => f.id === field)?.sources.includes(source) ?? false;
