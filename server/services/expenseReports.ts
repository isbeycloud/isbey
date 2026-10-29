import { isOwnedBy } from '../security/tenantOwnership';
import { ManagementReportError, parseManagementReportFilters } from './managementReports';
import type { ExpenseReportFilters, ExpenseReportPaymentMethod, ExpenseReportRow, ExpenseReportsResponse, ExpenseReportGroup, ExpenseReportAmounts } from '../../src/types/expenseReports';
type RecordRow = Record<string, any>;
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '2199-12-31' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000000000 && Number.isSafeInteger(Math.round(value * 100));
const currency = (value: unknown): string => typeof value === 'string' ? ({ '₺': 'TRY', TL: 'TRY' }[value.trim().toUpperCase()] || value.trim().toUpperCase()) : '';
const live = (row: RecordRow) => !row.isDeleted && !row.deletedAt && !row.isCancelled && !['CANCELLED', 'DELETED', 'VOID', 'DRAFT'].includes(String(row.status || '').toUpperCase());
const text = (value: unknown) => typeof value === 'string' ? value : '';
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
function filterText(value: unknown, name: string, max = 120): string | undefined {
    if (value === undefined || value === '')
        return undefined;
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
        throw new ManagementReportError(`${name} filtresi geçersiz.`);
    return value.trim() || undefined;
}
export function parseExpenseReportFilters(query: Record<string, unknown>, now = new Date()): ExpenseReportFilters {
    if (Object.keys(query).some(key => !['currency', 'startDate', 'endDate', 'categoryId', 'costCenterId', 'paymentMethod', 'account', 'search'].includes(key)))
        throw new ManagementReportError('Desteklenmeyen gider raporu filtresi.');
    const base = parseManagementReportFilters({
        currency: query.currency, ...(query.startDate !== undefined ? { startDate: query.startDate } : {}), ...(query.endDate !== undefined ? { endDate: query.endDate } : {})
    }, now);
    const categoryId = filterText(query.categoryId, 'Kategori'), costCenterId = filterText(query.costCenterId, 'Masraf merkezi'), paymentMethod = filterText(query.paymentMethod, 'Ödeme yöntemi'), account = filterText(query.account, 'Hesap', 130), search = filterText(query.search, 'Arama', 200);
    if (paymentMethod && !['CASH', 'BANK', 'OTHER'].includes(paymentMethod))
        throw new ManagementReportError('Geçerli bir ödeme yöntemi seçin.');
    if (account && !/^(CASH|BANK):[^\s:][^\u0000-\u001f\u007f]{0,119}$/.test(account))
        throw new ManagementReportError('Hesap filtresi CASH:kimlik veya BANK:kimlik biçiminde olmalıdır.');
    return {
        ...base, ...(categoryId ? { categoryId } : {}), ...(costCenterId ? { costCenterId } : {}), ...(paymentMethod ? { paymentMethod: paymentMethod as ExpenseReportPaymentMethod } : {}), ...(account ? { account } : {}), ...(search ? { search } : {})
    };
}
function sum(rows: ExpenseReportRow[]): ExpenseReportAmounts {
    const net = rows.reduce((s, r) => s + Math.round(r.netAmount * 100), 0), vat = rows.reduce((s, r) => s + Math.round(r.vatAmount * 100), 0), gross = rows.reduce((s, r) => s + Math.round(r.grossAmount * 100), 0);
    if ([net, vat, gross].some(value => !Number.isSafeInteger(value)))
        throw new ManagementReportError('Gider toplamları güvenli tutar sınırını aştı.', 503);
    return {
        count: rows.length, netAmount: net / 100, vatAmount: vat / 100, grossAmount: gross / 100
    };
}
function grouped(rows: ExpenseReportRow[], kind: 'category' | 'costCenter'): ExpenseReportGroup[] {
    const groups = new Map<string, {
        id: string;
        name: string;
        rows: ExpenseReportRow[];
    }>();
    for (const row of rows) {
        const id = kind === 'category' ? row.categoryId : row.costCenterId, name = kind === 'category' ? row.categoryName : row.costCenterName;
        let group = groups.get(id);
        if (!group) {
            group = {
                id, name, rows: []
            };
            groups.set(id, group);
        }
        group.rows.push(row);
    }
    return [...groups.values()].map(group => ({
        id: group.id, name: group.name, ...sum(group.rows)
    })).sort((a, b) => b.netAmount - a.netAmount || a.name.localeCompare(b.name, 'tr'));
}
/** Expense headers only: never substitutes purchases or duplicates payment-ledger rows. */
export function buildExpenseReports(snapshot: unknown, tenantId: string, rawFilters: ExpenseReportFilters, options: {
    now?: Date;
    actorId?: string;
} = {}): ExpenseReportsResponse {
    const now = options.now || new Date(), filters = parseExpenseReportFilters(rawFilters as unknown as Record<string, unknown>, now);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
        throw new ManagementReportError('Gider raporu kaynağı doğrulanamadı.', 503);
    const db = snapshot as RecordRow;
    for (const key of ['expenses', 'cashRegisters', 'bankAccounts'])
        if (!Array.isArray(db[key]) || db[key].some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row)))
            throw new ManagementReportError('Gider raporu kaynağı doğrulanamadı.', 503);
    const owned = (rows: RecordRow[]) => rows.filter(row => isOwnedBy(row, tenantId));
    const cash = owned(db.cashRegisters).filter(live), banks = owned(db.bankAccounts).filter(live);
    const scope = (Array.isArray(db.userScopes) ? db.userScopes : []).find((s: RecordRow) => s.tenantId === tenantId && s.userId === options.actorId);
    if (scope?.menus?.masraflar === false)
        throw new ManagementReportError('Masraf kayıtları kullanıcı kapsamınızda kapalı.', 403);
    const visibleCash = cash.filter(a => !scope?.cashRegisterIds?.length || scope.cashRegisterIds.includes(a.id)), visibleBanks = banks.filter(a => !scope?.bankAccountIds?.length || scope.bankAccountIds.includes(a.id));
    const categories = Array.isArray(db.expenseCategories) ? owned(db.expenseCategories) : [], centers = Array.isArray(db.costCenters) ? owned(db.costCenters) : [], suppliers = Array.isArray(db.customers) ? owned(db.customers) : [];
    const warnings = new Map<string, {
        code: string;
        message: string;
        count: number;
    }>();
    const warn = (code: string, message: string) => {
        const found = warnings.get(code);
        if (found)
            found.count++;
        else
            warnings.set(code, {
                code, message, count: 1
            });
    };
    const verified: ExpenseReportRow[] = [], currencies = new Set<string>([filters.currency]);
    let excludedCount = 0;
    for (const expense of owned(db.expenses).filter(live)) {
        if (!validDate(expense.date)) {
            excludedCount++;
            warn('INVALID_EXPENSE_DATE', 'Geçersiz tarihli giderler rapora alınmadı.');
            continue;
        }
        if (expense.date < filters.startDate || expense.date > filters.endDate)
            continue;
        const linkedCash = expense.cashRegisterId ? cash.find(a => a.id === expense.cashRegisterId) : undefined, linkedBank = expense.bankAccountId ? banks.find(a => a.id === expense.bankAccountId) : undefined;
        if ((expense.cashRegisterId && !linkedCash) || (expense.bankAccountId && !linkedBank) || (linkedCash && linkedBank)) {
            excludedCount++;
            warn('UNVERIFIED_EXPENSE_CURRENCY', 'Ödeme hesabı veya para birimi doğrulanamayan giderler dışarıda bırakıldı.');
            continue;
        }
        if ((linkedCash && !visibleCash.some(a => a.id === linkedCash.id)) || (linkedBank && !visibleBanks.some(a => a.id === linkedBank.id))) {
            excludedCount++;
            warn('SCOPED_EXPENSE', 'Görünürlük kapsamınız dışındaki hesaplara bağlı giderler rapora alınmadı.');
            continue;
        }
        const consistentPayment = (expense.paymentMethod === 'CASH' && !!linkedCash && !linkedBank) || (expense.paymentMethod === 'BANK' && !!linkedBank && !linkedCash) || (expense.paymentMethod === 'OTHER' && !linkedCash && !linkedBank);
        if (!consistentPayment) {
            excludedCount++;
            warn('INCONSISTENT_EXPENSE_PAYMENT', 'Ödeme yöntemi ile bağlı hesabı uyuşmayan giderler rapora alınmadı.');
            continue;
        }
        const linked = linkedCash || linkedBank;
        if (expense.currency === undefined && !linked) {
            excludedCount++;
            warn('UNVERIFIED_EXPENSE_CURRENCY', 'Para birimi veya ödeme hesabı doğrulanamayan giderler dışarıda bırakıldı.');
            continue;
        }
        const c = currency(expense.currency !== undefined ? expense.currency : linked.currency);
        if (!['TRY', 'USD', 'EUR', 'GBP'].includes(c) || (expense.currency !== undefined && linked && c !== currency(linked.currency))) {
            excludedCount++;
            warn('UNVERIFIED_EXPENSE_CURRENCY', 'Ödeme hesabı veya para birimi doğrulanamayan giderler dışarıda bırakıldı.');
            continue;
        }
        if (!money(expense.amount) || !money(expense.vatAmount) || !money(expense.totalAmount) || expense.amount < 0 || expense.vatAmount < 0 || expense.totalAmount < 0 || Math.abs(Math.round(expense.amount * 100) + Math.round(expense.vatAmount * 100) - Math.round(expense.totalAmount * 100)) > 1) {
            if (c === filters.currency) {
                excludedCount++;
                warn('INVALID_EXPENSE_AMOUNT', 'Net/KDV/toplam tutarı doğrulanamayan giderler rapora alınmadı.');
            }
            continue;
        }
        if (typeof expense.id !== 'string' || !expense.id || !['CASH', 'BANK', 'OTHER'].includes(expense.paymentMethod)) {
            if (c === filters.currency) {
                excludedCount++;
                warn('INVALID_EXPENSE_IDENTITY', 'Kimliği veya ödeme yöntemi doğrulanamayan giderler rapora alınmadı.');
            }
            continue;
        }
        currencies.add(c);
        if (c !== filters.currency)
            continue;
        if ([expense.amount, expense.vatAmount, expense.totalAmount].some(value => value !== Math.round(value * 100) / 100))
            warn('EXPENSE_PRECISION_ROUNDED', 'Kaynak giderlerin kuruş altı hassasiyeti yalnız raporda kuruşa yuvarlandı; kaynak kayıtlar değiştirilmedi.');
        const categoryId = text(expense.expenseCategoryId), costCenterId = text(expense.costCenterId);
        const category = categories.find(row => row.id === categoryId), center = centers.find(row => row.id === costCenterId), supplier = suppliers.find(row => row.id === expense.supplierId);
        const vatRate = typeof expense.vatRate === 'number' && Number.isFinite(expense.vatRate) && expense.vatRate >= 0 && expense.vatRate <= 100 ? expense.vatRate : null;
        if (vatRate === null)
            warn('UNKNOWN_EXPENSE_VAT_RATE', 'KDV oranı bilinmeyen kayıtların net/KDV/toplam tutarları olduğu gibi gösterilir; oran hesaplanmaz.');
        verified.push({
            id: expense.id, date: expense.date, documentNo: text(expense.documentNo), title: text(expense.title), categoryId, categoryName: text(expense.expenseCategoryName) || text(expense.categoryName) || text(category?.name) || 'Kategorisiz', costCenterId, costCenterName: text(expense.costCenterName) || text(center?.name) || 'Belirtilmedi', supplierTitle: text(expense.supplierTitle) || text(supplier?.title), receiptNo: text(expense.receiptNo), paymentMethod: expense.paymentMethod, account: linkedCash ? 'CASH:' + linkedCash.id : linkedBank ? 'BANK:' + linkedBank.id : '', accountName: linkedCash ? (text(expense.cashRegisterName) || text(linkedCash.name)) : linkedBank ? (text(expense.bankAccountName) || [text(linkedBank.bankName), text(linkedBank.accountName)].filter(Boolean).join(' - ')) : '', currency: c, netAmount: Math.round(expense.amount * 100) / 100, vatRate, vatAmount: Math.round(expense.vatAmount * 100) / 100, grossAmount: Math.round(expense.totalAmount * 100) / 100, notes: text(expense.notes)
        });
    }
    verified.sort((a, b) => b.date.localeCompare(a.date) || a.documentNo.localeCompare(b.documentNo, 'tr') || a.id.localeCompare(b.id));
    const optionCategories = grouped(verified, 'category').filter(row => row.id).map(({ id, name }) => ({ id, name })), optionCenters = grouped(verified, 'costCenter').filter(row => row.id).map(({ id, name }) => ({ id, name }));
    const accounts = new Map<string, {
        value: string;
        label: string;
        kind: 'CASH' | 'BANK';
        id: string;
    }>();
    for (const row of verified)
        if (row.account && !accounts.has(row.account)) {
            const offset = row.account.indexOf(':');
            accounts.set(row.account, {
                value: row.account, label: row.accountName, kind: row.account.slice(0, offset) as 'CASH' | 'BANK', id: row.account.slice(offset + 1)
            });
        }
    const words = filters.search ? normalized(filters.search).split(/\s+/).filter(Boolean) : [];
    const rows = verified.filter(row => (!filters.categoryId || row.categoryId === filters.categoryId) && (!filters.costCenterId || row.costCenterId === filters.costCenterId) && (!filters.paymentMethod || row.paymentMethod === filters.paymentMethod) && (!filters.account || row.account === filters.account) && (!words.length || words.every(word => normalized([row.documentNo, row.title, row.receiptNo, row.supplierTitle, row.notes, row.categoryName, row.costCenterName, row.accountName].join(' ')).includes(word))));
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    return {
        success: true, filters, snapshotAt: now.toISOString(), snapshotDate: `${part('year')}-${part('month')}-${part('day')}`, rows, summary: sum(rows), byCategory: grouped(rows, 'category'), byCostCenter: grouped(rows, 'costCenter'), options: {
            currencies: [...currencies].sort(), categories: optionCategories, costCenters: optionCenters, accounts: [...accounts.values()], paymentMethods: [...new Set(verified.map(row => row.paymentMethod))].sort()
        }, warnings: [...warnings.values()], excludedCount
    };
}
