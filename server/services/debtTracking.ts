import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDatabasePath } from '../config/environment';
import type { DebtFollowup, DebtTrackingInput, DebtTrackingResponse, DebtTrackingRow, DebtCurrencyTotal, DebtDueState } from '../../src/types/debtTracking';
type FinancialRecord = Record<string, unknown>;
interface Primary {
    customers: FinancialRecord[];
    invoices?: FinancialRecord[];
    currentTransactions?: FinancialRecord[];
    accountTransactions?: FinancialRecord[];
}
interface StoredFollowup extends DebtFollowup {
    fingerprint: string;
}
interface Sidecar {
    version: 1;
    history: StoredFollowup[];
    audit: {
        id: string;
        tenantId: string;
        customerId: string;
        actorId: string;
        timestamp: string;
        action: 'FOLLOWUP_UPDATED';
        revision: string;
    }[];
}
export class DebtTrackingError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}
const fail = (message = 'Geçersiz takip bilgisi.', status = 400): never => {
    throw new DebtTrackingError(message, status);
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function istanbulToday(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
function date(v: unknown): v is string {
    return typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '1900-01-01' && v <= '2199-12-31' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
}
function validBalance(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v * 100)) && v === Math.round(v * 100) / 100;
}
function validate(raw: unknown): DebtTrackingInput {
    const keys = ['dueDate', 'promiseDate', 'reminderDate', 'status', 'note', 'expectedRevision', 'expectedDirection', 'expectedBalance', 'requestId'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !keys.includes(k)))
        return fail();
    const v = raw as DebtTrackingInput;
    if (!date(v.dueDate) || !date(v.promiseDate) || !date(v.reminderDate) || !['OPEN', 'CONTACTED', 'PROMISED', 'DISPUTED'].includes(v.status) || typeof v.note !== 'string' || v.note.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(v.note) || /(?:\d[ -]?){13,}/.test(v.note) || /\b(?:cvv|cvc|pin|şifre|sifre|pan)\s*[:=]?\s*\d/i.test(v.note) || !(v.expectedRevision === '' || uuid(v.expectedRevision)) || !['RECEIVABLE', 'PAYABLE'].includes(v.expectedDirection) || !validBalance(v.expectedBalance) || !uuid(v.requestId))
        return fail();
    if (v.status === 'PROMISED' && !v.promiseDate)
        return fail('Ödeme sözü durumu için ödeme sözü tarihi gerekli.');
    return { dueDate: v.dueDate, promiseDate: v.promiseDate, reminderDate: v.reminderDate, status: v.status, note: v.note.trim(), expectedRevision: v.expectedRevision, expectedDirection: v.expectedDirection, expectedBalance: v.expectedBalance, requestId: v.requestId };
}
function wire(f: StoredFollowup): DebtFollowup {
    const { fingerprint: _, ...rest } = f;
    return rest;
}
function owned(record: FinancialRecord, tenantId: string): boolean {
    return record.tenantId === tenantId || !record.tenantId && record.companyId === tenantId;
}
/**
 * Tracking metadata only. Financial source is freshly read and never modified.
 * Followups belong to the customer and balance direction, not individual debt
 * episodes. A balance that closes and later reopens in the same direction may
 * reuse earlier dates; this version does not infer FIFO settlement or episodes.
 */
export class DebtTrackingStore {
    readonly file: string;
    constructor(public readonly primaryFile = getDatabasePath(), private readonly now: () => Date = () => new Date()) {
        this.file = primaryFile + '.debt-tracking.json';
    }
    private primary(): Primary {
        try {
            const value = JSON.parse(fs.readFileSync(this.primaryFile, 'utf8'));
            if (!Array.isArray(value.customers))
                throw new Error();
            return value;
        }
        catch {
            throw new DebtTrackingError('Güncel cari bakiyeler okunamadı. Lütfen tekrar deneyin.', 503);
        }
    }
    private read(): Sidecar {
        try {
            const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            if (s.version !== 1 || !Array.isArray(s.history) || !Array.isArray(s.audit))
                throw new Error();
            return s;
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT')
                return { version: 1, history: [], audit: [] };
            throw new DebtTrackingError('Takip kayıtları okunamadı.', 503);
        }
    }
    private build(tenantId: string, primary: Primary, sidecar: Sidecar): DebtTrackingResponse {
        const today = istanbulToday(this.now());
        const upcoming = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
        const customers = primary.customers.filter(c => c.tenantId === tenantId && !c.deletedAt);
        const records = [...(primary.invoices || []), ...(primary.currentTransactions || []), ...(primary.accountTransactions || [])].filter(r => owned(r, tenantId) && !r.deletedAt);
        const customerCounts = new Map<unknown, number>();
        const recordCurrencies = new Map<unknown, Set<string>>();
        for (const customer of customers) customerCounts.set(customer.id, (customerCounts.get(customer.id) || 0) + 1);
        for (const record of records) {
            if (typeof record.currency !== 'string' || !record.currency) continue;
            const currencies = recordCurrencies.get(record.customerId) || new Set<string>();
            currencies.add(record.currency.toUpperCase());
            recordCurrencies.set(record.customerId, currencies);
        }
        const rows: DebtTrackingRow[] = customers.map(customer => {
            const customerId = String(customer.id);
            const history = sidecar.history.filter(f => f.tenantId === tenantId && f.customerId === customerId).map(wire);
            const latest = history.at(-1);
            const currency = typeof customer.currency === 'string' && customer.currency ? customer.currency.toUpperCase() : 'TRY';
            let reviewReason = '';
            if (!['TRY', 'USD', 'EUR', 'GBP'].includes(currency))
                reviewReason = 'Desteklenmeyen para birimi; bakiye incelenmeli.';
            else if (currency !== 'TRY')
                reviewReason = 'Dövizli carinin eski hareketlerinde para birimi doğrulanamıyor; bakiye incelenmeli.';
            if (!validBalance(customer.balance))
                reviewReason = 'Cari bakiye geçersiz; mali kayıt incelenmeli.';
            if ([...(recordCurrencies.get(customerId) || [])].some(value => value !== currency))
                reviewReason = 'Cari ve bağlı kayıtların para birimleri farklı; bakiye incelenmeli.';
            if ((customerCounts.get(customer.id) || 0) > 1)
                reviewReason = 'Tekrarlanan cari kimliği; kayıtlar incelenmeli.';
            const balance = reviewReason ? null : customer.balance as number;
            const direction = balance === null || balance === 0 ? 'CLOSED' : balance > 0 ? 'RECEIVABLE' : 'PAYABLE';
            const followup = direction !== 'CLOSED' && latest?.direction === direction ? latest : null;
            const dueState: DebtDueState = reviewReason ? 'NEEDS_REVIEW' : direction === 'CLOSED' ? 'CLOSED' : !followup?.dueDate ? 'UNSCHEDULED' : followup.dueDate < today ? 'OVERDUE' : followup.dueDate === today ? 'TODAY' : followup.dueDate <= upcoming ? 'UPCOMING' : 'LATER';
            const open = dueState !== 'CLOSED' && dueState !== 'NEEDS_REVIEW';
            const reminderDue = !!(open && followup?.reminderDate && followup.reminderDate <= today);
            const promiseOverdue = !!(open && followup?.promiseDate && followup.promiseDate < today);
            return { customerId, customerName: String(customer.title || customer.name || ''), customerCode: String(customer.code || ''), currency, revision: latest?.revision || '', trackingRevision: latest?.revision || '', direction, balance, amount: balance === null ? null : Math.abs(balance), dueState, reminderDue, promiseOverdue, attention: open && (['OVERDUE', 'TODAY', 'UPCOMING'].includes(dueState) || reminderDue || promiseOverdue), reviewReason, followup, history };
        });
        const totals = new Map<string, DebtCurrencyTotal>();
        for (const row of rows) {
            if (row.amount === null || row.direction === 'CLOSED')
                continue;
            let total = totals.get(row.currency);
            if (!total) {
                total = { currency: row.currency, receivable: 0, payable: 0, overdueReceivable: 0, overduePayable: 0, receivableCount: 0, payableCount: 0 };
                totals.set(row.currency, total);
            }
            const key = row.direction === 'RECEIVABLE' ? 'receivable' : 'payable';
            total[key] = (Math.round(total[key] * 100) + Math.round(row.amount * 100)) / 100;
            total[row.direction === 'RECEIVABLE' ? 'receivableCount' : 'payableCount']++;
            if (row.dueState === 'OVERDUE') {
                const overdueKey = row.direction === 'RECEIVABLE' ? 'overdueReceivable' : 'overduePayable';
                total[overdueKey] = (Math.round(total[overdueKey] * 100) + Math.round(row.amount * 100)) / 100;
            }
        }
        if ([...totals.values()].some(t => [t.receivable, t.payable, t.overdueReceivable, t.overduePayable].some(n => !Number.isSafeInteger(Math.round(n * 100)))))
            throw new DebtTrackingError('Cari toplamları güvenli tutar sınırını aştı.', 503);
        return { success: true, today, rows, totals: [...totals.values()], counts: { overdue: rows.filter(r => r.dueState === 'OVERDUE').length, today: rows.filter(r => r.dueState === 'TODAY').length, upcoming: rows.filter(r => r.dueState === 'UPCOMING').length, reminderDue: rows.filter(r => r.reminderDue).length, promiseOverdue: rows.filter(r => r.promiseOverdue).length, actionable: rows.filter(r => r.dueState === 'OVERDUE' || r.dueState === 'TODAY' || r.reminderDue || r.promiseOverdue).length, attention: rows.filter(r => r.attention).length, needsReview: rows.filter(r => r.dueState === 'NEEDS_REVIEW').length, closed: rows.filter(r => r.dueState === 'CLOSED').length, unscheduled: rows.filter(r => r.dueState === 'UNSCHEDULED').length } };
    }
    list(tenantId: string) {
        return this.build(tenantId, this.primary(), this.read());
    }
    async save(tenantId: string, customerId: string, raw: unknown, actorId = 'system') {
        const input = validate(raw);
        const fingerprint = JSON.stringify({ customerId, ...input });
        const lock = this.file + '.lock';
        try {
            fs.mkdirSync(lock, { mode: 0o700 });
        }
        catch (e) {
            throw new DebtTrackingError((e as NodeJS.ErrnoException).code === 'EEXIST' ? 'Başka bir takip kaydı işleniyor. Lütfen tekrar deneyin.' : 'Takip kayıt alanına erişilemiyor.', 503);
        }
        const temp = this.file + '.' + randomUUID() + '.tmp';
        try {
            const sidecar = this.read();
            const primary = this.primary();
            const current = this.build(tenantId, primary, sidecar).rows.find(r => r.customerId === customerId);
            if (!current)
                return fail('Cari bulunamadı.', 404);
            const prior = sidecar.history.find(f => f.tenantId === tenantId && f.requestId === input.requestId);
            if (prior) {
                if (prior.fingerprint !== fingerprint)
                    return fail('İstek numarası farklı bir takip kaydında kullanılmış.', 409);
                return { row: current, followup: wire(prior) };
            }
            if (current.balance === null || current.direction === 'CLOSED')
                return fail('Takip için açık ve doğrulanabilir bir bakiye gerekli.', 409);
            if (current.revision !== input.expectedRevision || current.direction !== input.expectedDirection || current.balance !== input.expectedBalance)
                return fail('Cari bakiye veya takip bilgisi değişmiş. Listeyi yenileyin.', 409);
            const followup: StoredFollowup = { revision: randomUUID(), requestId: input.requestId, customerId, tenantId, direction: current.direction, balanceSnapshot: current.balance, dueDate: input.dueDate, promiseDate: input.promiseDate, reminderDate: input.reminderDate, status: input.status, note: input.note, updatedAt: this.now().toISOString(), updatedBy: actorId, fingerprint };
            sidecar.history.push(followup);
            sidecar.audit.push({ id: randomUUID(), tenantId, customerId, actorId, timestamp: followup.updatedAt, action: 'FOLLOWUP_UPDATED', revision: followup.revision });
            const fd = fs.openSync(temp, 'wx', 0o600);
            try {
                fs.writeFileSync(fd, JSON.stringify(sidecar));
                fs.fsyncSync(fd);
            }
            finally {
                fs.closeSync(fd);
            }
            fs.renameSync(temp, this.file);
            if (process.platform !== 'win32') {
                let dir: number | undefined;
                try {
                    dir = fs.openSync(path.dirname(this.file), 'r');
                    fs.fsyncSync(dir);
                }
                catch {
                    console.error('[DEBT_TRACKING] Committed directory sync could not be confirmed.');
                }
                finally {
                    if (dir !== undefined)
                        try {
                            fs.closeSync(dir);
                        }
                        catch {
                        }
                }
            }
            return { row: this.build(tenantId, primary, sidecar).rows.find(r => r.customerId === customerId)!, followup: wire(followup) };
        }
        catch (error) {
            if (error instanceof DebtTrackingError)
                throw error;
            throw new DebtTrackingError('Takip kaydı yazılamadı. Lütfen tekrar deneyin.', 503);
        }
        finally {
            try {
                if (fs.existsSync(temp))
                    fs.unlinkSync(temp);
            }
            catch {
                console.error('[DEBT_TRACKING] Temporary cleanup requires attention.');
            }
            try {
                fs.rmdirSync(lock);
            }
            catch {
                console.error('[DEBT_TRACKING] Lock cleanup requires attention.');
            }
        }
    }
}
