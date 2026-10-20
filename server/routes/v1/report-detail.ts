/**
 * İŞBEY CLOUD — KAPSAMLI RAPOR FİLTRELERİ + DETAY RAPORLARI (2026-10-17)
 * ======================================================================
 * Neden ayrı dosya: mevcut `/api/reports/*` uçları yalnız `startDate/endDate`
 * (bir kısmı `costingMethod`/`costCenterId`) kabul ediyor ve filtreler
 * SESSİZCE daralıyor. Bu modül üç boşluğu kapatır:
 *
 *   1. ORTAK FİLTRE SÖZLEŞMESİ — tarih aralığı, cari, ürün, varyant, depo,
 *      kasa/banka, durum (status) ve tutar aralığı TEK yerde çözülür.
 *      GEÇERSİZ filtre sessizce "boş liste" DEĞİL, açık 400 döner: kullanıcı
 *      "kayıt yok" ile "filtreyi yanlış yazdım"ı ayırt edebilmelidir.
 *
 *   2. DETAY — cari ekstre (defter satırları), stok/varyant kırılımı,
 *      kasa/banka hareket dökümü. Tutarlar MEVCUT muhasebe mantığından
 *      OKUNUR; burada hiçbir bakiye/kâr/KDV YENİDEN HESAPLANMAZ. Cari bakiye
 *      `currentTransactions` defterinden, kasa/banka bakiyesi kayıttan gelir.
 *
 *   3. TENANT İZOLASYONU — sahiplik `security/tenantOwnership.ts`'ten TEK
 *      KAYNAKTAN okunur (kimlik dizesinden çıkarılmaz). Filtre parametreleri
 *      (customerId/productId/cashRegisterId…) yabancı firmaya aitse sonuç
 *      BOŞ döner; varlık sızdırılmaz.
 *
 * Ağa ÇIKMAZ. Salt-okunur: hiçbir uç yazma yapmaz.
 */
import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import {
  bankAccountIdOf,
  cashRegisterIdOf,
  filterOwned,
  isOwnedBy,
  isOwnedByParent,
} from '../../security/tenantOwnership';

export const v1ReportDetailRouter = Router();

v1ReportDetailRouter.use(requireAuth);
v1ReportDetailRouter.use(resolveTenant);
v1ReportDetailRouter.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(403).json({ success: false, code: 'TENANT_REQUIRED', message: 'İşlem için firma seçimi zorunludur.' });
  }
  next();
});

// ───────────────────────── ortak filtre sözleşmesi ─────────────────────────

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  customerIds?: string[];
  productIds?: string[];
  variantIds?: string[];
  warehouseIds?: string[];
  cashRegisterIds?: string[];
  bankAccountIds?: string[];
  statuses?: string[];
  types?: string[];
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GEÇERLİ TAKVİM TARİHİ kontrolü. Biçim denetimi TEK BAŞINA yetmez:
 * `2026-13-99` da `/^\d{4}-\d{2}-\d{2}$/` kalıbına UYAR. Oysa 13. ay ve
 * 99. gün yoktur; bunu kabul etmek "tarih filtresi"ni sessizce anlamsız kılar.
 */
function isValidCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function listParam(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const cleaned = raw.map(v => String(v).trim()).filter(v => v && v !== 'ALL');
  return cleaned.length > 0 ? cleaned : undefined;
}

function numParam(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Sorgu parametrelerini filtre sözleşmesine çevirir.
 *
 * GEÇERSİZ GİRDİ AÇIKÇA REDDEDİLİR (400). Neden: filtrelerin sessizce
 * yorumlanması "hiç kayıt yok" sonucunu doğuruyor ve kullanıcı bunu "veri yok"
 * sanıyordu (bkz. `search=undefined` olayı). Geçersiz tarih/biçim için boş
 * liste döndürmek YANLIŞ BİLGİDİR.
 */
export function parseFilters(query: Record<string, unknown>): { filters: ReportFilters; error?: string } {
  const filters: ReportFilters = {};

  for (const [key, field] of [['startDate', 'startDate'], ['endDate', 'endDate']] as const) {
    const value = query[key];
    if (value === undefined || value === null || value === '') continue;
    const s = String(value);
    if (!DATE_RE.test(s)) return { filters, error: `${field} YYYY-AA-GG biçiminde olmalıdır.` };
    if (!isValidCalendarDate(s)) return { filters, error: `${field} geçerli bir takvim tarihi değildir.` };
    filters[field] = s;
  }
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    return { filters, error: 'startDate, endDate değerinden sonra olamaz.' };
  }

  filters.customerIds = listParam(query.customerIds ?? query.customerId);
  filters.productIds = listParam(query.productIds ?? query.productId);
  filters.variantIds = listParam(query.variantIds ?? query.variantId);
  filters.warehouseIds = listParam(query.warehouseIds ?? query.warehouseId);
  filters.cashRegisterIds = listParam(query.cashRegisterIds ?? query.cashRegisterId);
  filters.bankAccountIds = listParam(query.bankAccountIds ?? query.bankAccountId);
  filters.statuses = listParam(query.statuses ?? query.status);
  filters.types = listParam(query.types ?? query.type);

  const minAmount = numParam(query.minAmount);
  const maxAmount = numParam(query.maxAmount);
  if (Number.isNaN(minAmount!)) return { filters, error: 'minAmount sayısal olmalıdır.' };
  if (Number.isNaN(maxAmount!)) return { filters, error: 'maxAmount sayısal olmalıdır.' };
  if (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) {
    return { filters, error: 'minAmount, maxAmount değerinden büyük olamaz.' };
  }
  filters.minAmount = minAmount;
  filters.maxAmount = maxAmount;

  const search = query.search ?? query.q;
  if (search !== undefined && search !== null && String(search).trim() !== '') {
    filters.search = String(search).trim().toLocaleLowerCase('tr-TR');
  }

  return { filters };
}

const inRange = (date: string | undefined, f: ReportFilters): boolean => {
  const d = date || '';
  if (f.startDate && d < f.startDate) return false;
  if (f.endDate && d > f.endDate) return false;
  return true;
};

const inAmount = (amount: number, f: ReportFilters): boolean => {
  if (f.minAmount !== undefined && amount < f.minAmount) return false;
  if (f.maxAmount !== undefined && amount > f.maxAmount) return false;
  return true;
};

/** Liste filtresi: filtre YOKSA hepsi geçer; varsa yalnız eşleşen. */
const inList = (value: string | undefined, allowed: string[] | undefined): boolean =>
  !allowed || (value !== undefined && allowed.includes(value));

const round2 = (n: number) => Math.round(n * 100) / 100;

// ───────────────────────────── 1. DETAY: CARİ ─────────────────────────────

/**
 * GET /api/v1/reports/detail/customer
 *
 * Cari ekstre + yaşlandırma + bakiye. Bakiye MEVCUT defterden okunur:
 * satırlar `currentTransactions`tır, toplamları cari kaydındaki `balance` ile
 * KARŞILAŞTIRILIR ve `balanceMatchesLedger` alanı ile bildirilir. Uyuşmazlık
 * varsa bu uç onu SAKLAMAZ (sessiz düzeltme yapmaz, yalnız rapor eder).
 */
v1ReportDetailRouter.get('/detail/customer', requirePermission(PERMISSIONS.REPORTS_VIEW), (req: Request, res: Response) => {
  const parsed = parseFilters(req.query as Record<string, unknown>);
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  const f = parsed.filters;
  const db = storage.getState();
  const tenantId = req.tenantId!;

  const customers = filterOwned(db.customers, tenantId).filter(c => {
    if (!inList(c.id, f.customerIds)) return false;
    if (f.search && !(`${c.code} ${c.title}`.toLocaleLowerCase('tr-TR').includes(f.search))) return false;
    if (f.types && !inList(c.type, f.types)) return false;
    if (!inAmount(Math.abs(Number(c.balance) || 0), f)) return false;
    return true;
  });

  const invoices = filterOwned(db.invoices, tenantId).filter(i => !i.isDeleted);

  const rows = customers.map(cust => {
    const ledger = (db.currentTransactions || [])
      .filter(t => t.customerId === cust.id && isOwnedBy(t, tenantId) && inRange(t.date, f))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(t => ({
        id: t.id,
        date: t.date,
        documentNo: t.documentNo,
        documentType: t.documentType,
        description: t.description,
        debit: round2(Number(t.debit) || 0),
        credit: round2(Number(t.credit) || 0),
        // Satır bakiyesi DEFTERDEN gelir; burada yeniden hesaplanmaz.
        balance: round2(Number(t.balance) || 0),
      }));

    const ledgerTotal = round2(ledger.reduce((s, t) => s + t.debit - t.credit, 0));

    const open = invoices.filter(i => i.customerId === cust.id && i.paymentStatus !== 'PAID');
    const today = new Date().toISOString().split('T')[0];
    const overdue = open
      .filter(i => (i.maturityDate || i.date) < today)
      .map(i => ({
        id: i.id,
        documentNo: i.invoiceNo,
        date: i.date,
        maturityDate: i.maturityDate || i.date,
        grandTotal: round2(Number(i.grandTotal) || 0),
        paidAmount: round2(Number(i.paidAmount) || 0),
        remaining: round2((Number(i.grandTotal) || 0) - (Number(i.paidAmount) || 0)),
      }));

    return {
      id: cust.id,
      code: cust.code,
      title: cust.title,
      type: cust.type,
      taxNumber: cust.taxNumber,
      balance: round2(Number(cust.balance) || 0),
      ledgerTotal,
      balanceMatchesLedger: Math.abs(ledgerTotal - (Number(cust.balance) || 0)) < 0.01,
      riskLimit: cust.riskLimit,
      ledger,
      overdue,
      overdueTotal: round2(overdue.reduce((s, i) => s + i.remaining, 0)),
    };
  });

  res.json({
    success: true,
    appliedFilters: f,
    rows,
    totals: {
      customerCount: rows.length,
      balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
      overdueTotal: round2(rows.reduce((s, r) => s + r.overdueTotal, 0)),
    },
  });
});

// ──────────────────────── 2. DETAY: STOK / VARYANT ────────────────────────

/**
 * GET /api/v1/reports/detail/stock
 *
 * Ürün bazında stok değerleme + VARYANT KIRILIMI. Tutarlar ürün/varyant
 * kayıtlarındaki `purchasePrice`/`salePrice` ve `currentStock` alanlarından
 * okunur — stok DÜŞÜLMESİ veya yeniden hesap YAPILMAZ.
 * Varyantlı üründe ürün stoğu = varyant stoklarının toplamıdır (mevcut tasarım);
 * bu uç bunu `variantStockSum` ile ayrıca gösterir ve `stockMatchesVariants`
 * ile tutarlılığı bildirir.
 */
v1ReportDetailRouter.get('/detail/stock', requirePermission(PERMISSIONS.REPORTS_VIEW), (req: Request, res: Response) => {
  const parsed = parseFilters(req.query as Record<string, unknown>);
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  const f = parsed.filters;
  const db = storage.getState();
  const tenantId = req.tenantId!;

  const products = filterOwned(db.products, tenantId).filter(p => {
    if (!inList(p.id, f.productIds)) return false;
    if (f.search && !(`${p.code} ${p.name}`.toLocaleLowerCase('tr-TR').includes(f.search))) return false;
    if (f.statuses && !inList(p.active ? 'ACTIVE' : 'PASSIVE', f.statuses)) return false;
    if (f.warehouseIds && !f.warehouseIds.includes(p.warehouseId || '')) return false;
    const cost = (Number(p.currentStock) || 0) * (Number(p.purchasePrice) || 0);
    if (!inAmount(cost, f)) return false;
    if (f.variantIds && !(p.variants || []).some(v => f.variantIds!.includes(v.id))) return false;
    return true;
  });

  const rows = products.map(p => {
    const variants = (p.variants || [])
      .filter(v => !f.variantIds || f.variantIds.includes(v.id))
      .map(v => ({
        id: v.id,
        name: v.name,
        barcode: v.barcode,
        attributes: v.attributes,
        currentStock: Number(v.currentStock) || 0,
        purchasePrice: Number(v.purchasePrice) || 0,
        salePrice: Number(v.salePrice) || 0,
        costValue: round2((Number(v.currentStock) || 0) * (Number(v.purchasePrice) || 0)),
        saleValue: round2((Number(v.currentStock) || 0) * (Number(v.salePrice) || 0)),
      }));
    const variantStockSum = round2(variants.reduce((s, v) => s + v.currentStock, 0));
    const stock = Number(p.currentStock) || 0;
    const costValue = round2(stock * (Number(p.purchasePrice) || 0));
    const saleValue = round2(stock * (Number(p.salePrice) || 0));

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      group: p.groupName,
      unit: p.unit,
      barcode: p.barcode,
      warehouseId: p.warehouseId,
      warehouseName: p.warehouseName,
      active: p.active,
      isCritical: p.currentStock <= p.criticalStock,
      criticalStock: p.criticalStock,
      currentStock: stock,
      variantStockSum,
      hasVariants: variants.length > 0,
      stockMatchesVariants: variants.length === 0 || Math.abs(variantStockSum - stock) < 0.001,
      purchasePrice: Number(p.purchasePrice) || 0,
      salePrice: Number(p.salePrice) || 0,
      salePrices: p.salePrices,
      costValue,
      saleValue,
      potentialProfit: round2(saleValue - costValue),
      variants,
    };
  });

  res.json({
    success: true,
    appliedFilters: f,
    rows,
    totals: {
      productCount: rows.length,
      costValue: round2(rows.reduce((s, r) => s + r.costValue, 0)),
      saleValue: round2(rows.reduce((s, r) => s + r.saleValue, 0)),
      potentialProfit: round2(rows.reduce((s, r) => s + r.potentialProfit, 0)),
      criticalCount: rows.filter(r => r.isCritical).length,
    },
  });
});

// ──────────────────── 3. DETAY: KASA / BANKA HAREKETLERİ ────────────────────

/**
 * GET /api/v1/reports/detail/cash-bank
 *
 * Kasa ve banka hareket dökümü + hesap bazlı kapanış. Bakiye hesap kaydından
 * okunur; hareketler `isOwnedByParent` ile süzülür (tenantId'si boş eski
 * hareketler sahipliği bağlı oldukları hesaptan alır).
 * `openingBalance` + hareket toplamı ile kayıtlı bakiye karşılaştırılır ve
 * fark varsa `balanceMatchesMovements=false` ile AÇIKÇA bildirilir.
 */
v1ReportDetailRouter.get('/detail/cash-bank', requirePermission(PERMISSIONS.REPORTS_VIEW), (req: Request, res: Response) => {
  const parsed = parseFilters(req.query as Record<string, unknown>);
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  const f = parsed.filters;
  const db = storage.getState();
  const tenantId = req.tenantId!;

  const registers = filterOwned(db.cashRegisters, tenantId).filter(c => inList(c.id, f.cashRegisterIds));
  const accounts = filterOwned(db.bankAccounts, tenantId).filter(b => inList(b.id, f.bankAccountIds));

  // Hesap filtresi verilmişse YALNIZ o taraf listelenir: `bankAccountIds`
  // verildiğinde kasa hareketleri, `cashRegisterIds` verildiğinde banka
  // hareketleri sonuca GİRMEZ. (Aksi halde filtre yarım uygulanıyor ve karşı
  // tarafın hareketleri süzülmeden döküme düşüyordu.)
  const onlyBank = !!f.bankAccountIds && !f.cashRegisterIds;
  const onlyCash = !!f.cashRegisterIds && !f.bankAccountIds;

  const cashTx = (onlyBank ? [] : (db.cashTransactions || [])).filter(t =>
    isOwnedByParent(t, tenantId, db.cashRegisters, cashRegisterIdOf) &&
    t.date !== undefined && inRange(t.date, f) &&
    inList(t.cashRegisterId, f.cashRegisterIds) &&
    inAmount(Number(t.amount) || 0, f) &&
    (!f.types || inList(t.type, f.types)));

  const bankTx = (onlyCash ? [] : (db.bankTransactions || [])).filter(t =>
    isOwnedByParent(t, tenantId, db.bankAccounts, bankAccountIdOf) &&
    inRange(t.date, f) &&
    inList(t.bankAccountId, f.bankAccountIds) &&
    inAmount(Number(t.amount) || 0, f) &&
    (!f.types || inList(t.type, f.types)));

  // `direction` şemada OPSİYONEL; yön yoksa tutar çıkış sayılmaz, giriş de
  // sayılmaz — toplam yalnız açıkça işaretli satırlardan oluşur.
  const summarize = (rows: { direction?: string; amount?: number }[]) => {
    const inTotal = round2(rows.filter(r => r.direction === 'IN').reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const outTotal = round2(rows.filter(r => r.direction === 'OUT').reduce((s, r) => s + (Number(r.amount) || 0), 0));
    return { inTotal, outTotal, net: round2(inTotal - outTotal) };
  };

  const cashRows = registers.map(c => {
    const rows = cashTx.filter(t => t.cashRegisterId === c.id);
    const sum = summarize(rows);
    const opening = Number(c.openingBalance) || 0;
    const expected = round2(opening + sum.net);
    const balance = round2(Number(c.balance) || 0);
    return {
      id: c.id, name: c.name, code: c.code, currency: c.currency,
      openingBalance: opening, balance,
      expectedBalance: expected,
      balanceMatchesMovements: Math.abs(expected - balance) < 0.01,
      ...sum,
      transactionCount: rows.length,
    };
  });

  const bankRows = accounts.map(b => {
    const rows = bankTx.filter(t => t.bankAccountId === b.id);
    const sum = summarize(rows);
    const opening = Number(b.openingBalance) || 0;
    const expected = round2(opening + sum.net);
    const balance = round2(Number(b.balance) || 0);
    return {
      id: b.id, name: b.accountName, bankName: b.bankName, iban: b.iban, currency: b.currency,
      openingBalance: opening, balance,
      expectedBalance: expected,
      balanceMatchesMovements: Math.abs(expected - balance) < 0.01,
      ...sum,
      transactionCount: rows.length,
    };
  });

  const txRow = (t: any, kind: 'CASH' | 'BANK') => ({
    id: t.id, kind,
    accountId: kind === 'CASH' ? t.cashRegisterId : t.bankAccountId,
    accountName: kind === 'CASH' ? t.cashRegisterName : t.bankAccountName,
    documentNo: t.documentNo, date: t.date, type: t.type, direction: t.direction,
    amount: round2(Number(t.amount) || 0),
    customerTitle: t.customerTitle, description: t.description,
  });

  const transactions = [...cashTx.map(t => txRow(t, 'CASH')), ...bankTx.map(t => txRow(t, 'BANK'))]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json({
    success: true,
    appliedFilters: f,
    cash: { accounts: cashRows, ...summarize(cashTx) },
    bank: { accounts: bankRows, ...summarize(bankTx) },
    transactions,
    totals: {
      cashBalance: round2(cashRows.reduce((s, r) => s + r.balance, 0)),
      bankBalance: round2(bankRows.reduce((s, r) => s + r.balance, 0)),
      liquidity: round2(cashRows.reduce((s, r) => s + r.balance, 0) + bankRows.reduce((s, r) => s + r.balance, 0)),
      transactionCount: transactions.length,
      mismatchCount: [...cashRows, ...bankRows].filter(r => !r.balanceMatchesMovements).length,
    },
  });
});

// ───────────────────────── 4. FİLTRE SEÇENEKLERİ ─────────────────────────

/**
 * GET /api/v1/reports/filter-options
 *
 * Ekranın filtre kutularını dolduracak SEÇENEKLER (cari, ürün, varyant, depo,
 * kasa, banka, durum, belge tipi). Yalnız kendi firmasının kayıtları döner —
 * seçenek listesi de bir sızıntı yüzeyidir.
 */
v1ReportDetailRouter.get('/filter-options', requirePermission(PERMISSIONS.REPORTS_VIEW), (req: Request, res: Response) => {
  const db = storage.getState();
  const tenantId = req.tenantId!;

  const products = filterOwned(db.products, tenantId);
  res.json({
    success: true,
    customers: filterOwned(db.customers, tenantId).map(c => ({ id: c.id, code: c.code, title: c.title, type: c.type })),
    products: products.map(p => ({ id: p.id, code: p.code, name: p.name, unit: p.unit })),
    variants: products.flatMap(p =>
      (p.variants || []).map(v => ({ id: v.id, name: v.name, productId: p.id, productName: p.name, barcode: v.barcode }))),
    warehouses: filterOwned(db.warehouses, tenantId).map(w => ({ id: w.id, code: w.code, name: w.name })),
    cashRegisters: filterOwned(db.cashRegisters, tenantId).map(c => ({ id: c.id, code: c.code, name: c.name, currency: c.currency })),
    bankAccounts: filterOwned(db.bankAccounts, tenantId).map(b => ({ id: b.id, name: b.accountName, bankName: b.bankName, currency: b.currency })),
    statuses: ['ACTIVE', 'PASSIVE', 'PAID', 'PARTIAL', 'UNPAID', 'CANCELLED', 'DRAFT'],
    types: ['SALES', 'PURCHASE', 'RETAIL_POS', 'COLLECTION', 'PAYMENT', 'EXPENSE', 'TRANSFER_TO_BANK', 'TRANSFER_FROM_BANK', 'TRANSFER_TO_CASH', 'TRANSFER_FROM_CASH', 'HAVALE_EFT_IN', 'HAVALE_EFT_OUT', 'POS_COLLECTION'],
  });
});
