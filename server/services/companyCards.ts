import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDatabasePath } from '../config/environment';
import type { CompanyCard, CompanyCardEntry } from '../../src/types/companyCards';
type StoredCard = Omit<CompanyCard, 'creditLimit' | 'openingBalance' | 'balance' | 'availableLimit' | 'totalSpent' | 'totalRefunded' | 'totalRepaid'> & {
    creditLimitCents: number;
    openingBalanceCents: number;
};
type StoredEntry = Omit<CompanyCardEntry, 'amount'> & {
    amountCents: number;
    fingerprint: string;
};
interface Store {
    version: 1;
    cards: StoredCard[];
    entries: StoredEntry[];
    audit: {
        id: string;
        tenantId: string;
        actorId: string;
        action: string;
        recordId: string;
        timestamp: string;
    }[];
}
export class CompanyCardError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}
const reject = (message = 'Geçersiz kart takip bilgisi.', status = 400): never => {
    throw new CompanyCardError(message, status);
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function object(value: unknown, keys: string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)))
        return reject();
    return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
    if (value === undefined && !required)
        return '';
    if (typeof value !== 'string')
        return reject();
    const s = value.trim();
    if ((required && !s) || s.length > max || /[\u0000-\u001f\u007f<>]/.test(s) || /(?:\d[ -]?){13,}/.test(s) || /\b(?:cvv|cvc|pin|şifre|sifre|pan)\s*[:=]?\s*\d/i.test(s))
        return reject('Kart numarası veya güvenlik bilgisi kaydedilemez.');
    return s;
}
function cents(v: unknown, positive = false): number {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (positive && v === 0) || v > 1000000000)
        return reject('Tutar geçersiz.');
    const c = Math.round(v * 100);
    if (!Number.isSafeInteger(c) || v !== c / 100 || (positive && c < 1))
        return reject('Tutar en fazla iki ondalık basamak içermeli.');
    return c;
}
function cardInput(raw: unknown, updating = false) {
    const v = object(raw, ['name', 'bankName', 'last4', 'creditLimit', 'openingBalance', 'statementDay', 'dueDay', 'currency', 'status', ...(updating ? ['expectedRevision'] : [])]);
    if (typeof v.last4 !== 'string' || !/^\d{4}$/.test(v.last4) || ![v.statementDay, v.dueDay].every(x => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 31))
        return reject();
    if (v.currency !== undefined && v.currency !== 'TRY')
        return reject();
    if (v.status !== undefined && !['ACTIVE', 'ARCHIVED'].includes(v.status as string))
        return reject();
    return { name: text(v.name, 80, true), bankName: text(v.bankName, 80, true), last4: v.last4, creditLimitCents: cents(v.creditLimit), openingBalanceCents: cents(v.openingBalance), currency: 'TRY' as const, statementDay: v.statementDay as number, dueDay: v.dueDay as number, status: (v.status || 'ACTIVE') as 'ACTIVE' | 'ARCHIVED' };
}
function entryInput(raw: unknown) {
    const v = object(raw, ['requestId', 'type', 'date', 'amount', 'merchant', 'category', 'description', 'receiptNo']);
    if (!uuid(v.requestId) || !['SPEND', 'REFUND', 'REPAYMENT'].includes(v.type as string) || typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(Date.parse(v.date)) || new Date(v.date).toISOString().slice(0, 10) !== v.date || v.date < '1900-01-01' || v.date > '2199-12-31')
        return reject();
    return { requestId: v.requestId, type: v.type as CompanyCardEntry['type'], date: v.date, amountCents: cents(v.amount, true), merchant: text(v.merchant, 120), category: text(v.category, 60), description: text(v.description, 300), receiptNo: text(v.receiptNo, 80) };
}
function sameCard(a: StoredCard, b: ReturnType<typeof cardInput>): boolean {
    const norm = (v: string) => v.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
    return a.status === 'ACTIVE' && b.status === 'ACTIVE' && a.last4 === b.last4 && norm(a.bankName) === norm(b.bankName) && norm(a.name) === norm(b.name);
}
function entryWire(e: StoredEntry): CompanyCardEntry {
    const { amountCents, fingerprint: _, ...rest } = e;
    return { ...rest, amount: amountCents / 100 };
}
function cardWire(c: StoredCard, entries: StoredEntry[]): CompanyCard {
    const { creditLimitCents, openingBalanceCents, ...rest } = c;
    const totals = { SPEND: 0, REFUND: 0, REPAYMENT: 0 };
    for (const e of entries)
        if (e.tenantId === c.tenantId && e.cardId === c.id && e.status === 'ACTIVE')
            totals[e.type] += e.amountCents;
    const balance = openingBalanceCents + totals.SPEND - totals.REFUND - totals.REPAYMENT;
    if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(creditLimitCents - balance) || Object.values(totals).some(n => !Number.isSafeInteger(n)))
        return reject('Kart toplamı güvenli tutar sınırını aştı.', 409);
    return { ...rest, creditLimit: creditLimitCents / 100, openingBalance: openingBalanceCents / 100, balance: balance / 100, availableLimit: (creditLimitCents - balance) / 100, totalSpent: totals.SPEND / 100, totalRefunded: totals.REFUND / 100, totalRepaid: totals.REPAYMENT / 100 };
}
/** Fresh read on every operation. The exclusive lock works across Passenger processes. Never reclaims uncertain locks. */
export class CompanyCardsStore {
    constructor(public readonly file = getDatabasePath() + '.company-cards.json') {
    }
    private read(): Store {
        try {
            const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            if (s.version !== 1 || !Array.isArray(s.cards) || !Array.isArray(s.entries) || !Array.isArray(s.audit))
                throw new Error();
            return s;
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT')
                return { version: 1, cards: [], entries: [], audit: [] };
            throw new CompanyCardError('Kart kayıtları okunamadı.', 503);
        }
    }
    list(tenantId: string) {
        const s = this.read();
        return { cards: s.cards.filter(c => c.tenantId === tenantId).map(c => cardWire(c, s.entries)), entries: s.entries.filter(e => e.tenantId === tenantId).map(entryWire) };
    }
    private async mutate<T>(tenantId: string, actorId: string, action: string, operation: (s: Store) => {
        result: T;
        recordId: string;
        unchanged?: boolean;
    }): Promise<T> {
        fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const lock = this.file + '.lock';
        try {
            fs.mkdirSync(lock, { mode: 0o700 });
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'EEXIST')
                throw new CompanyCardError('Başka bir kart kaydı işleniyor. Lütfen tekrar deneyin.', 503);
            throw new CompanyCardError('Kart kayıt alanına erişilemiyor.', 503);
        }
        const temp = this.file + '.' + randomUUID() + '.tmp';
        try {
            const s = this.read();
            const out = operation(s);
            if (out.unchanged)
                return out.result;
            s.audit.push({ id: randomUUID(), tenantId, actorId, action, recordId: out.recordId, timestamp: new Date().toISOString() });
            const fd = fs.openSync(temp, 'wx', 0o600);
            try {
                fs.writeFileSync(fd, JSON.stringify(s));
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
                    // The fsynced file has already been committed by rename. Do not report
                    // a failed write and invite a second financial tracking entry.
                    console.error('[COMPANY_CARDS] Committed file directory sync could not be confirmed.');
                }
                finally {
                    if (dir !== undefined) {
                        try { fs.closeSync(dir); } catch { /* The committed result stays authoritative. */ }
                    }
                }
            }
            return out.result;
        }
        finally {
            // Cleanup must not mask the original validation/write result. If lock removal
            // fails, subsequent writes fail closed until an operator checks the lock.
            try { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
            catch { console.error('[COMPANY_CARDS] Temporary file cleanup requires attention.'); }
            try { fs.rmdirSync(lock); }
            catch { console.error('[COMPANY_CARDS] Write lock cleanup requires attention.'); }
        }
    }
    async create(tenantId: string, raw: unknown, actorId = 'system') {
        const input = cardInput(raw);
        return this.mutate(tenantId, actorId, 'CARD_CREATED', s => {
            if (s.cards.some(c => c.tenantId === tenantId && sameCard(c, input)))
                return reject('Aynı kart tanımı zaten mevcut.', 409);
            const now = new Date().toISOString();
            const c: StoredCard = { ...input, id: randomUUID(), tenantId, revision: randomUUID(), createdAt: now, updatedAt: now };
            s.cards.push(c);
            return { result: cardWire(c, s.entries), recordId: c.id };
        });
    }
    async update(tenantId: string, id: string, raw: unknown, actorId = 'system') {
        const input = cardInput(raw, true);
        return this.mutate(tenantId, actorId, 'CARD_UPDATED', s => {
            const c = s.cards.find(c => c.id === id && c.tenantId === tenantId);
            if (!c)
                return reject('Kart bulunamadı.', 404);
            if ((raw as Record<string, unknown>).expectedRevision !== c.revision)
                return reject('Kart değişmiş. Listeyi yenileyin.', 409);
            if (input.openingBalanceCents !== c.openingBalanceCents && s.entries.some(e => e.cardId === id && e.tenantId === tenantId))
                return reject('Hareket bulunan kartın açılış bakiyesi değiştirilemez.', 409);
            if (s.cards.some(other => other.id !== id && other.tenantId === tenantId && sameCard(other, input)))
                return reject('Aynı kart tanımı zaten mevcut.', 409);
            Object.assign(c, input, { revision: randomUUID(), updatedAt: new Date().toISOString() });
            return { result: cardWire(c, s.entries), recordId: id };
        });
    }
    async addEntry(tenantId: string, cardId: string, raw: unknown, actorId = 'system') {
        const input = entryInput(raw);
        const fingerprint = JSON.stringify(input);
        return this.mutate(tenantId, actorId, 'ENTRY_CREATED', s => {
            const c = s.cards.find(c => c.id === cardId && c.tenantId === tenantId);
            if (!c)
                return reject('Kart bulunamadı.', 404);
            const prior = s.entries.find(e => e.tenantId === tenantId && e.requestId === input.requestId);
            if (prior) {
                if (prior.cardId !== cardId || prior.fingerprint !== fingerprint)
                    return reject('İstek numarası farklı bir kayıt için kullanılmış.', 409);
                return { result: entryWire(prior), recordId: prior.id, unchanged: true };
            }
            if (c.status !== 'ACTIVE')
                return reject('Arşivlenmiş karta hareket eklenemez.', 409);
            const e: StoredEntry = { ...input, id: randomUUID(), tenantId, cardId, fingerprint, status: 'ACTIVE', revision: randomUUID(), createdAt: new Date().toISOString(), createdBy: actorId };
            s.entries.push(e);
            cardWire(c, s.entries);
            return { result: entryWire(e), recordId: e.id };
        });
    }
    async voidEntry(tenantId: string, cardId: string, entryId: string, raw: unknown, actorId = 'system') {
        const v = object(raw, ['expectedRevision', 'reason']);
        const reason = text(v.reason, 200, true);
        return this.mutate(tenantId, actorId, 'ENTRY_VOIDED', s => {
            const e = s.entries.find(e => e.tenantId === tenantId && e.cardId === cardId && e.id === entryId);
            if (!e)
                return reject('Hareket bulunamadı.', 404);
            if (e.status !== 'ACTIVE' || e.revision !== v.expectedRevision)
                return reject('Hareket değişmiş veya iptal edilmiş. Listeyi yenileyin.', 409);
            Object.assign(e, { status: 'VOID', revision: randomUUID(), voidReason: reason, voidedAt: new Date().toISOString(), voidedBy: actorId });
            const c = s.cards.find(c => c.tenantId === tenantId && c.id === cardId);
            if (!c)
                return reject('Kart bulunamadı.', 404);
            cardWire(c, s.entries);
            return { result: entryWire(e), recordId: e.id };
        });
    }
}
