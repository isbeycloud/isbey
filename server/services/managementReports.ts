import fs from 'node:fs/promises';
import { getDatabasePath } from '../config/environment';
import { isOwnedBy, isOwnedByParent, cashRegisterIdOf, bankAccountIdOf } from '../security/tenantOwnership';
import { resolveHizliUnitCode } from '../../src/utils/unitDisplay';
import type { ManagementReportFilters, ManagementReportsResponse, ManagementProductRow, ManagementMonthlyRow, ManagementExpenseRow, ManagementCashBankRow, ManagementStockRow, ManagementBalanceRow } from '../../src/types/managementReports';
type RecordRow = Record<string, any>;
export class ManagementReportError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}
const supported = ['TRY', 'USD', 'EUR', 'GBP'];
const currency = (value: unknown, legacyTry = true): string => value === undefined || value === null || value === '' ? (legacyTry ? 'TRY' : '') : typeof value === 'string' ? ({ '₺': 'TRY', TL: 'TRY' }[value.trim().toUpperCase()] || value.trim().toUpperCase()) : '';
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '2199-12-31' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000000000;
const money = (value: unknown): value is number => number(value) && Number.isSafeInteger(Math.round(value * 100)) && value === Math.round(value * 100) / 100;
const cents = (value: number) => Math.round(value * 100);
const amount = (value: number) => value / 100;
/** Labels can coincide for distinct packaging codes (PA/PK). Only proven
 * piece aliases are merged; no quantity conversion is performed. */
const unitIdentity = (value: string): string => {
    const code = resolveHizliUnitCode(value) || value.trim().toUpperCase();
    return code === 'NIU' || code === 'NAR' ? 'C62' : code;
};
const live = (value: RecordRow) => !value.isDeleted && !value.deletedAt && !value.isCancelled && !['CANCELLED', 'DELETED', 'VOID'].includes(String(value.status || '').toUpperCase());
function todayInIstanbul(now: Date): string {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const part = (type: string) => p.find(v => v.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
export function parseManagementReportFilters(query: Record<string, unknown>, now = new Date()): ManagementReportFilters {
    if (Object.keys(query).some(key => !['startDate', 'endDate', 'currency'].includes(key)))
        throw new ManagementReportError('Desteklenmeyen rapor filtresi. Bakiyeler yalnız güncel kayıt anını gösterir.');
    if (typeof query.currency !== 'string' || !supported.includes(query.currency))
        throw new ManagementReportError('Rapor için TRY, USD, EUR veya GBP para birimlerinden birini seçin.');
    const today = todayInIstanbul(now), startDate = query.startDate === undefined ? today.slice(0, 7) + '-01' : query.startDate, endDate = query.endDate === undefined ? today : query.endDate;
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate || Date.parse(endDate) - Date.parse(startDate) > 3660 * 86400000)
        throw new ManagementReportError('Geçerli başlangıç ve bitiş tarihleri girin; dönem en fazla 10 yıl olmalıdır.');
    return {
        startDate, endDate, currency: query.currency
    };
}
export async function readManagementSnapshot(): Promise<RecordRow> {
    try {
        return JSON.parse(await fs.readFile(getDatabasePath(), 'utf8'));
    }
    catch {
        throw new ManagementReportError('Güncel rapor verileri okunamadı. Lütfen tekrar deneyin.', 503);
    }
}
/** Pure reporting projection: never calls accounting engines or mutates its input. */
export function buildManagementReports(snapshot: unknown, tenantId: string, filters: ManagementReportFilters, options: {
    now?: Date;
    actorId?: string;
} = {}): ManagementReportsResponse {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
        throw new ManagementReportError('Rapor kaynağı doğrulanamadı.', 503);
    const db = snapshot as RecordRow;
    for (const key of ['customers', 'invoices', 'products', 'currentTransactions', 'expenses', 'cashRegisters', 'bankAccounts', 'cashTransactions', 'bankTransactions', 'stockMovements'])
        if (!Array.isArray(db[key]) || db[key].some((r: unknown) => !r || typeof r !== 'object' || Array.isArray(r)))
            throw new ManagementReportError('Rapor kaynağı doğrulanamadı.', 503);
    const now = options.now || new Date(), snapshotDate = todayInIstanbul(now), snapshotAt = now.toISOString();
    filters = parseManagementReportFilters(filters as unknown as Record<string, unknown>, now);
    const warningMap = new Map<string, {
        code: string;
        message: string;
        count: number;
    }>();
    const warn = (code: string, message: string, count = 1) => {
        const old = warningMap.get(code);
        if (old)
            old.count += count;
        else
            warningMap.set(code, {
                code, message, count
            });
    };
    const owned = (rows: RecordRow[]) => rows.filter(r => isOwnedBy(r, tenantId));
    const inPeriod = (date: unknown) => validDate(date) && date >= filters.startDate && date <= filters.endDate;
    const customers = owned(db.customers).filter(live), products = owned(db.products).filter(live), invoices = owned(db.invoices);
    const transactions = owned(db.currentTransactions).filter(live), stocks = owned(db.stockMovements).filter(live);
    const allCash = owned(db.cashRegisters).filter(live), allBanks = owned(db.bankAccounts).filter(live);
    const scope = (Array.isArray(db.userScopes) ? db.userScopes : []).find((s: RecordRow) => s.tenantId === tenantId && s.userId === options.actorId);
    if (scope?.menus && ['finansal-tablolar', 'alis-faturalari', 'satis-faturalari', 'masraflar', 'stok-durum', 'musteri-listesi', 'banka-hareketleri', 'kdv-detaylari'].some(key => scope.menus[key] === false))
        throw new ManagementReportError('Bu birleşik raporun veri alanlarından biri kullanıcı kapsamınızda kapalı.', 403);
    const cash = allCash.filter(a => !scope?.cashRegisterIds?.length || scope.cashRegisterIds.includes(a.id));
    const banks = allBanks.filter(a => !scope?.bankAccountIds?.length || scope.bankAccountIds.includes(a.id));
    if (cash.length !== allCash.length || banks.length !== allBanks.length)
        warn('SCOPED_ACCOUNTS', 'Kasa ve banka özeti yalnız size görünür hesapları içerir.');
    const currencies = new Set<string>([filters.currency]);
    for (const row of [...customers, ...products, ...invoices, ...cash, ...banks]) {
        const c = currency(row.currency);
        if (supported.includes(c))
            currencies.add(c);
    }
    const currencyEvidence = [...invoices, ...transactions, ...(Array.isArray(db.accountTransactions) ? owned(db.accountTransactions).filter(live) : [])];
    const currenciesByCustomer = new Map<string, Set<string>>();
    for (const record of currencyEvidence) {
        if (record.customerId && record.currency !== undefined) {
            const currencies = currenciesByCustomer.get(record.customerId) || new Set<string>();
            currencies.add(currency(record.currency, false));
            currenciesByCustomer.set(record.customerId, currencies);
        }
    }
    const txByCustomer = new Map<string, RecordRow[]>();
    for (const tx of transactions) {
        const rows = txByCustomer.get(tx.customerId) || [];
        rows.push(tx);
        txByCustomer.set(tx.customerId, rows);
    }
    let receivable = 0, payable = 0, periodDebit = 0, periodCredit = 0, balanceExcluded = 0;
    const balances: ManagementBalanceRow[] = [];
    for (const customer of customers) {
        const c = currency(customer.currency);
        if (c !== filters.currency)
            continue;
        const tx = txByCustomer.get(customer.id) || [];
        let reason = '';
        if (c !== 'TRY')
            reason = 'Eski cari hareketlerinin para birimi doğrulanamıyor.';
        if (!money(customer.balance))
            reason = 'Cari bakiye geçersiz.';
        if ([...(currenciesByCustomer.get(customer.id) || [])].some(value => value !== c))
            reason = 'Cari ve bağlı fatura/hareket para birimleri farklı.';
        let debit = 0, credit = 0, ledgerInvalid = !!reason;
        for (const t of tx) {
            if (!validDate(t.date)) {
                warn('INVALID_LEDGER_DATE', 'Geçersiz tarihli cari hareketler dönem toplamına alınmadı.');
                ledgerInvalid = true;
                continue;
            }
            if (!inPeriod(t.date))
                continue;
            const d = t.debit !== undefined ? t.debit : t.debt;
            if (!money(d) || !money(t.credit) || d < 0 || t.credit < 0) {
                warn('INVALID_LEDGER_AMOUNT', 'Geçersiz tutarlı cari hareketler dönem toplamına alınmadı.');
                ledgerInvalid = true;
                continue;
            }
            debit += cents(d);
            credit += cents(t.credit);
        }
        if (reason) {
            balanceExcluded++;
            warn('UNCERTAIN_CUSTOMER_BALANCE', 'Doğrulanamayan cari bakiyeler para toplamlarından çıkarıldı.');
        }
        const balance = reason ? null : customer.balance;
        if (balance !== null) {
            if (balance > 0)
                receivable += cents(balance);
            else
                payable += cents(-balance);
        }
        if (!ledgerInvalid) {
            periodDebit += debit;
            periodCredit += credit;
        }
        else if (!reason)
            warn('INCOMPLETE_LEDGER', 'Bazı carilerin dönem hareketleri doğrulanamadı; bu carilerin dönem toplamı gösterilmiyor.');
        balances.push({
            customerId: String(customer.id), code: String(customer.code || ''), name: String(customer.title || customer.name || ''), currency: c, balance, receivable: balance === null ? null : Math.max(balance, 0), payable: balance === null ? null : Math.max(-balance, 0), periodDebit: ledgerInvalid ? null : amount(debit), periodCredit: ledgerInvalid ? null : amount(credit), needsReview: !!reason || ledgerInvalid, reviewReason: reason || (ledgerInvalid ? 'Dönem cari hareketleri incelenmeli.' : '')
        });
    }
    const monthlyMap = new Map<string, ManagementMonthlyRow>();
    const cursor = new Date(filters.startDate.slice(0, 7) + '-01T00:00:00Z');
    while (cursor.toISOString().slice(0, 7) <= filters.endDate.slice(0, 7)) {
        const month = cursor.toISOString().slice(0, 7);
        monthlyMap.set(month, {
            month, salesNet: 0, salesReturnsNet: 0, netSales: 0, purchaseNet: 0, purchaseReturnsNet: 0, netPurchases: 0, invoiceCount: 0
        });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const productMap = new Map<string, {
        row: ManagementProductRow;
        costCents: number;
        coveredCents: number;
    }>();
    let sales = 0, salesReturns = 0, purchases = 0, purchaseReturns = 0, salesVat = 0, purchaseVat = 0, postedInvoiceCount = 0, excludedInvoiceCount = 0, knownCostLines = 0, unknownCostLines = 0, coveredNetSales = 0, estimatedCost = 0, reconciliationFailures = 0;
    for (const invoice of invoices) {
        if (!validDate(invoice.date)) {
            warn('INVALID_INVOICE_DATE', 'Geçersiz tarihli faturalar rapora alınmadı.');
            excludedInvoiceCount++;
            continue;
        }
        if (!inPeriod(invoice.date) || currency(invoice.currency) !== filters.currency)
            continue;
        const status = String(invoice.status || '').toUpperCase();
        const evidence = transactions.some(t => t.relatedInvoiceId === invoice.id) || stocks.some(t => t.documentType === 'INVOICE' && t.documentId === invoice.id);
        if (!live(invoice) || status === 'DRAFT' || !['SALES', 'PURCHASE', 'RETAIL_POS'].includes(invoice.type) || (!['ACTIVE', 'APPROVED'].includes(status) && !(status === '' && evidence))) {
            excludedInvoiceCount++;
            if (status === '')
                warn('UNVERIFIED_POSTING', 'Muhasebeleşme kanıtı bulunmayan eski faturalar dışarıda bırakıldı.');
            continue;
        }
        if (!status)
            warn('LEGACY_POSTING_EVIDENCE', 'Durumu eksik eski faturalar yalnız bağlı mali hareket kanıtıyla dahil edildi.');
        const net = invoice.subTotal !== undefined ? invoice.subTotal : invoice.subtotal;
        if (!money(net) || net < 0 || !money(invoice.totalVat) || invoice.totalVat < 0 || (invoice.subTotal !== undefined && invoice.subtotal !== undefined && invoice.subTotal !== invoice.subtotal)) {
            excludedInvoiceCount++;
            warn('INVALID_INVOICE_AMOUNT', 'Tutarı doğrulanamayan faturalar dışarıda bırakıldı.');
            continue;
        }
        const returned = invoice.invoiceCategory === 'IADE';
        if (returned && invoice.type === 'RETAIL_POS') {
            excludedInvoiceCount++;
            warn('AMBIGUOUS_RETURN', 'Yönü doğrulanamayan iade faturası dışarıda bırakıldı.');
            continue;
        }
        const kind = returned ? (invoice.type === 'PURCHASE' ? 'SALES_RETURN' : 'PURCHASE_RETURN') : (invoice.type === 'PURCHASE' ? 'PURCHASE' : 'SALES');
        const n = cents(net), vat = cents(invoice.totalVat), month = monthlyMap.get(invoice.date.slice(0, 7))!;
        postedInvoiceCount++;
        month.invoiceCount++;
        if (kind === 'SALES') {
            sales += n;
            salesVat += vat;
            month.salesNet += n;
        }
        else if (kind === 'SALES_RETURN') {
            salesReturns += n;
            salesVat -= vat;
            month.salesReturnsNet += n;
        }
        else if (kind === 'PURCHASE') {
            purchases += n;
            purchaseVat += vat;
            month.purchaseNet += n;
        }
        else {
            purchaseReturns += n;
            purchaseVat -= vat;
            month.purchaseReturnsNet += n;
        }
        if (kind !== 'SALES' && kind !== 'SALES_RETURN')
            continue;
        const sign = kind === 'SALES' ? 1 : -1;
        const items = Array.isArray(invoice.items) ? invoice.items : [];
        let lineSum = 0, invalidLine = false;
        for (const item of items) {
            if (!item || typeof item !== 'object' || !money(item.lineTotal) || item.lineTotal < 0 || !number(item.quantity) || item.quantity < 0 || typeof item.unit !== 'string' || !item.unit.trim()) {
                unknownCostLines++;
                invalidLine = true;
                warn('INVALID_SALES_LINE', 'Eksik/geçersiz satış satırları ürün ve maliyet hesabına alınmadı.');
                continue;
            }
            const lineNet = cents(item.lineTotal);
            lineSum += lineNet;
            const product = products.find(p => p.id === item.productId);
            const variants = Array.isArray(product?.variants) ? product.variants : [];
            const variant = item.variantId ? variants.find((v: RecordRow) => v.id === item.variantId) : undefined;
            const cost = variant?.purchasePrice !== undefined ? variant.purchasePrice : product?.purchasePrice;
            const unitsMatch = !!product && unitIdentity(String(product.unit || '')) === unitIdentity(item.unit);
            const costKnown = !!product && (!item.variantId || !!variant) && unitsMatch && currency(product.currency) === filters.currency && number(cost) && cost > 0 && item.quantity > 0;
            const key = JSON.stringify([item.productId || '', item.productId ? '' : item.productCode || item.productName || '', item.variantId || '', unitIdentity(item.unit)]);
            let group = productMap.get(key);
            if (!group) {
                group = {
                    row: {
                        productId: String(item.productId || ''), code: String(item.productCode || product?.code || ''), name: String(item.productName || product?.name || ''), variantId: String(item.variantId || ''), variantName: String(item.variantName || variant?.name || ''), unit: item.unit, currency: filters.currency, salesQuantity: 0, returnQuantity: 0, netQuantity: 0, salesNet: 0, salesReturnNet: 0, netSales: 0, currentUnitCost: costKnown ? cost : null, estimatedCost: null, estimatedGrossProfit: null, knownCostLines: 0, unknownCostLines: 0
                    }, costCents: 0, coveredCents: 0
                };
                productMap.set(key, group);
            }
            if (sign === 1) {
                group.row.salesQuantity += item.quantity;
                group.row.salesNet += lineNet;
            }
            else {
                group.row.returnQuantity += item.quantity;
                group.row.salesReturnNet += lineNet;
            }
            if (costKnown) {
                const lineCost = Math.round(cost * item.quantity * 100);
                if (!Number.isSafeInteger(lineCost))
                    throw new ManagementReportError('Maliyet tahmini güvenli tutar sınırını aştı.', 503);
                group.costCents += sign * lineCost;
                group.coveredCents += sign * lineNet;
                group.row.knownCostLines++;
                knownCostLines++;
                coveredNetSales += sign * lineNet;
                estimatedCost += sign * lineCost;
            }
            else {
                group.row.unknownCostLines++;
                unknownCostLines++;
                group.row.currentUnitCost = null;
                warn('UNKNOWN_CURRENT_COST', 'Alış fiyatı, ürün/varyant, para birimi veya birimi doğrulanamayan satırların maliyeti tahmin edilmedi.');
            }
        }
        if (!items.length || invalidLine || Math.abs(lineSum - n) > 1) {
            reconciliationFailures++;
            warn('INVOICE_LINE_RECONCILIATION', 'Bazı satış faturalarının kayıtlı net toplamı kalemleriyle doğrulanamadı; tam maliyet/kâr kapsamı sunulmuyor.');
        }
    }
    const productRows = [...productMap.values()].map(g => {
        if ([g.row.salesNet, g.row.salesReturnNet, g.costCents, g.coveredCents, g.coveredCents - g.costCents].some(value => !Number.isSafeInteger(value)))
            throw new ManagementReportError('Ürün toplamları güvenli tutar sınırını aştı.', 503);
        return {
            ...g.row, salesNet: amount(g.row.salesNet), salesReturnNet: amount(g.row.salesReturnNet), netSales: amount(g.row.salesNet - g.row.salesReturnNet), netQuantity: g.row.salesQuantity - g.row.returnQuantity, estimatedCost: g.row.unknownCostLines ? null : amount(g.costCents), estimatedGrossProfit: g.row.unknownCostLines ? null : amount(g.coveredCents - g.costCents)
        };
    });
    if (knownCostLines || unknownCostLines || reconciliationFailures)
        warn('CURRENT_COST_ESTIMATE', 'Kâr yalnız güncel ürün alış fiyatıyla tahmini brüttür; tarihsel maliyet veya muhasebe net kârı değildir. Giderler ayrıca gösterilir.', Math.max(knownCostLines, 1));
    const expenseMap = new Map<string, {
        categoryId: string;
        categoryName: string;
        net: number;
        vat: number;
        gross: number;
        count: number;
    }>();
    let expenseNet = 0, expenseVat = 0, expenseGross = 0, expenseExcluded = 0;
    for (const expense of owned(db.expenses).filter(live)) {
        if (!validDate(expense.date)) {
            expenseExcluded++;
            warn('INVALID_EXPENSE_DATE', 'Geçersiz tarihli giderler dışarıda bırakıldı.');
            continue;
        }
        if (!inPeriod(expense.date))
            continue;
        const linkedCash = expense.cashRegisterId ? allCash.find(a => a.id === expense.cashRegisterId) : undefined, linkedBank = expense.bankAccountId ? allBanks.find(a => a.id === expense.bankAccountId) : undefined;
        if ((expense.cashRegisterId && !linkedCash) || (expense.bankAccountId && !linkedBank) || (linkedCash && linkedBank)) {
            expenseExcluded++;
            warn('UNVERIFIED_EXPENSE_CURRENCY', 'Ödeme hesabı/para birimi doğrulanamayan giderler dışarıda bırakıldı.');
            continue;
        }
        if ((linkedCash && !cash.some(a => a.id === linkedCash.id)) || (linkedBank && !banks.some(a => a.id === linkedBank.id))) {
            expenseExcluded++;
            warn('SCOPED_EXPENSE', 'Görünürlük kapsamınız dışındaki hesaplara bağlı giderler rapora alınmadı.');
            continue;
        }
        if (expense.currency === undefined && !linkedCash && !linkedBank) {
            expenseExcluded++;
            warn('UNVERIFIED_EXPENSE_CURRENCY', 'Para birimi veya ödeme hesabı doğrulanamayan giderler dışarıda bırakıldı.');
            continue;
        }
        const c = currency(expense.currency !== undefined ? expense.currency : linkedCash?.currency ?? linkedBank?.currency);
        if (!supported.includes(c) || (expense.currency !== undefined && (linkedCash || linkedBank) && c !== currency((linkedCash || linkedBank).currency))) {
            expenseExcluded++;
            warn('UNVERIFIED_EXPENSE_CURRENCY', 'Ödeme hesabı/para birimi doğrulanamayan giderler dışarıda bırakıldı.');
            continue;
        }
        if (c !== filters.currency)
            continue;
        if (!money(expense.amount) || !money(expense.vatAmount) || !money(expense.totalAmount) || expense.amount < 0 || expense.vatAmount < 0 || expense.totalAmount < 0 || Math.abs(cents(expense.amount) + cents(expense.vatAmount) - cents(expense.totalAmount)) > 1) {
            expenseExcluded++;
            warn('INVALID_EXPENSE_AMOUNT', 'Net/KDV/toplam tutarı doğrulanamayan giderler dışarıda bırakıldı.');
            continue;
        }
        const id = String(expense.expenseCategoryId || ''), name = String(expense.expenseCategoryName || expense.categoryName || 'Kategorisiz'), key = JSON.stringify([id, name]);
        let group = expenseMap.get(key);
        if (!group) {
            group = {
                categoryId: id, categoryName: name, net: 0, vat: 0, gross: 0, count: 0
            };
            expenseMap.set(key, group);
        }
        const n = cents(expense.amount), v = cents(expense.vatAmount), g = cents(expense.totalAmount);
        group.net += n;
        group.vat += v;
        group.gross += g;
        group.count++;
        expenseNet += n;
        expenseVat += v;
        expenseGross += g;
    }
    const expenseRows: ManagementExpenseRow[] = [...expenseMap.values()].map(e => ({
        categoryId: e.categoryId, categoryName: e.categoryName, netAmount: amount(e.net), vatAmount: amount(e.vat), grossAmount: amount(e.gross), count: e.count
    }));
    const cashBank: ManagementCashBankRow[] = [];
    for (const [kind, accounts, rawTransactions, parentIdOf] of [['CASH', cash, db.cashTransactions, cashRegisterIdOf], ['BANK', banks, db.bankTransactions, bankAccountIdOf]] as const) {
        for (const account of accounts) {
            const c = currency(account.currency);
            if (c !== filters.currency)
                continue;
            const movements = rawTransactions.filter((t: RecordRow) => live(t) && parentIdOf(t) === account.id && isOwnedByParent(t, tenantId, accounts, parentIdOf));
            let reason = '';
            if (!money(account.balance))
                reason = 'Hesap bakiyesi geçersiz.';
            if (movements.some((t: RecordRow) => t.currency !== undefined && currency(t.currency, false) !== c || c !== 'TRY' && t.currency === undefined))
                reason = 'Hesap hareketlerinin para birimi doğrulanamıyor.';
            if (reason)
                warn('UNCERTAIN_ACCOUNT_BALANCE', 'Doğrulanamayan kasa/banka bakiyeleri para toplamlarından çıkarıldı.');
            cashBank.push({
                id: String(account.id), kind, name: String(account.name || [account.bankName, account.accountName].filter(Boolean).join(' - ')), currency: c, balance: reason ? null : account.balance, needsReview: !!reason, reviewReason: reason
            });
        }
    }
    const cashBalance = cashBank.filter(a => a.kind === 'CASH' && a.balance !== null).reduce((sum, a) => sum + cents(a.balance!), 0), bankBalance = cashBank.filter(a => a.kind === 'BANK' && a.balance !== null).reduce((sum, a) => sum + cents(a.balance!), 0);
    const critical: ManagementStockRow[] = [], idle: ManagementStockRow[] = [];
    const idleBefore = new Date(Date.parse(snapshotDate) - 90 * 86400000).toISOString().slice(0, 10);
    for (const product of products) {
        if (product.active === false || product.trackStock === false || currency(product.currency) !== filters.currency)
            continue;
        if (!number(product.currentStock)) {
            warn('INVALID_STOCK', 'Geçersiz stok miktarlı ürünler stok risk raporuna alınmadı.');
            continue;
        }
        const movements = stocks.filter(m => m.productId === product.id);
        const valid = movements.filter(m => validDate(m.date) && m.date <= snapshotDate);
        if (movements.some(m => validDate(m.date) && m.date > snapshotDate))
            warn('FUTURE_STOCK_MOVEMENT', 'Gelecek tarihli stok hareketleri son hareket tarihi olarak kullanılmadı.');
        const last = valid.map(m => m.date).sort().at(-1) || null;
        const threshold = product.criticalStock !== undefined ? product.criticalStock : product.minStock;
        const row: ManagementStockRow = {
            productId: String(product.id), code: String(product.code || ''), name: String(product.name || ''), variantId: '', variantName: '', unit: String(product.unit || ''), currentStock: product.currentStock, criticalStock: number(threshold) && threshold >= 0 ? threshold : 0, lastMovementDate: last
        };
        if (number(threshold) && threshold >= 0 && product.currentStock <= threshold)
            critical.push(row);
        if (product.currentStock > 0 && last && last < idleBefore)
            idle.push(row);
        else if (product.currentStock > 0 && !last)
            warn('UNKNOWN_STOCK_ACTIVITY', 'Son hareket tarihi bilinmeyen ürünler 90 gün hareketsiz kabul edilmedi.');
    }
    const netSales = sales - salesReturns, netPurchases = purchases - purchaseReturns;
    const totals = [receivable, payable, periodDebit, periodCredit, sales, salesReturns, purchases, purchaseReturns, salesVat, purchaseVat, coveredNetSales, estimatedCost, expenseNet, expenseVat, expenseGross, cashBalance, bankBalance, coveredNetSales - estimatedCost, netSales - coveredNetSales];
    if (totals.some(n => !Number.isSafeInteger(n)))
        throw new ManagementReportError('Rapor toplamları güvenli tutar sınırını aştı.', 503);
    const monthly: ManagementMonthlyRow[] = [...monthlyMap.values()].map(m => ({
        ...m, salesNet: amount(m.salesNet), salesReturnsNet: amount(m.salesReturnsNet), netSales: amount(m.salesNet - m.salesReturnsNet), purchaseNet: amount(m.purchaseNet), purchaseReturnsNet: amount(m.purchaseReturnsNet), netPurchases: amount(m.purchaseNet - m.purchaseReturnsNet)
    }));
    return {
        success: true, filters, snapshotAt, snapshotDate, currencyOptions: [...currencies].sort(), warnings: [...warningMap.values()], overview: {
            netSales: amount(netSales), netPurchases: amount(netPurchases), salesVat: amount(salesVat), purchaseVat: amount(purchaseVat), expenseNet: amount(expenseNet), expenseGross: amount(expenseGross), receivable: amount(receivable), payable: amount(payable), cashBalance: amount(cashBalance), bankBalance: amount(bankBalance), postedInvoiceCount, excludedInvoiceCount
        }, balances: {
            rows: balances, receivable: amount(receivable), payable: amount(payable), periodDebit: amount(periodDebit), periodCredit: amount(periodCredit), excludedCount: balanceExcluded
        }, products: productRows, profitability: {
            basis: 'CURRENT_PURCHASE_COST_ESTIMATE', netSales: amount(netSales), coveredNetSales: amount(coveredNetSales), uncoveredNetSales: amount(netSales - coveredNetSales), estimatedCost: amount(estimatedCost), estimatedGrossProfit: knownCostLines ? amount(coveredNetSales - estimatedCost) : null, knownCostLines, unknownCostLines, coveragePercent: knownCostLines + unknownCostLines + reconciliationFailures ? Math.round(knownCostLines / (knownCostLines + unknownCostLines + reconciliationFailures) * 1000) / 10 : null, expensesNet: amount(expenseNet), complete: knownCostLines > 0 && unknownCostLines === 0 && reconciliationFailures === 0
        }, monthly, expenses: {
            rows: expenseRows, totalNet: amount(expenseNet), totalVat: amount(expenseVat), totalGross: amount(expenseGross), excludedCount: expenseExcluded
        }, stock: {
            critical, idle, idleDays: 90
        }, cashBank
    };
}
