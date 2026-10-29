import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import express from 'express';
import { spawn } from 'node:child_process';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cards-test-')), 'database.json');
const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { migrateMemberships } = await import('../security/memberships');
const { CompanyCardsStore } = await import('../services/companyCards');
const { companyCardsRouter } = await import('../routes/companyCards');
storage.update(db => {
    db.tenants = ['a', 'b'].map(id => ({ ...structuredClone(db.tenants[0]), id, status: 'ACTIVE', isArchived: false, selectedServicePlanIds: undefined, erpSubscription: undefined }));
    db.users = ['owner', 'other', 'viewer', 'scoped'].map(id => ({ id, username: id, fullName: id, email: `${id}@example.test`, passwordHash: '', active: true, role: id === 'viewer' ? 'RAPOR' : id === 'scoped' ? 'MUHASEBE' : 'COMPANY_ADMIN', companyId: id === 'other' ? 'b' : 'a', allowedCompanyIds: [id === 'other' ? 'b' : 'a'], createdAt: new Date().toISOString() }));
    db.tenantUsers = [];
    migrateMemberships(db);
    db.userScopes = [{ id: 'scoped-bank', tenantId: 'a', userId: 'scoped', menus: {}, cashRegisterIds: [], bankAccountIds: ['only-one-bank'], employeeIds: [], taxTypes: [], updatedAt: new Date().toISOString() }];
});
await storage.runTransaction(() => {
});
let mainBefore = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
const tokens = Object.fromEntries(storage.getState().users.map(u => [u.id, generateToken(u, u.companyId)]));
const app = express();
app.use(express.json({ strict: false }));
app.use('/api/company-cards', companyCardsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/company-cards`;
let checks = 0;
async function call(method: string, route = '', body?: unknown, status = 200, user = 'owner') {
    const file = process.env.DATABASE_PATH! + '.company-cards.json';
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    checks++;
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), mainBefore, 'main financial database changed');
    if (status >= 400)
        assert.equal(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, before, 'rejected mutation changed store');
    return result;
}
const input = { name: 'İş kartı', bankName: 'Banka', last4: '1234', creditLimit: 1000, openingBalance: 10.10, statementDay: 15, dueDay: 25, currency: 'TRY', status: 'ACTIVE' };
try {
    await call('GET', '', undefined, 401, '');
    await call('GET', '', undefined, 403, 'viewer');
    await call('POST', '', input, 403, 'viewer');
    await call('GET', '', undefined, 403, 'scoped');
    await call('POST', '', input, 403, 'scoped');
    for (const bad of [null, [], { ...input, tenantId: 'b' }, { ...input, cvv: '123' }, { ...input, last4: '1234567812345678' }, { ...input, name: 'Kart 4111 1111 1111 1111' }, { ...input, creditLimit: 1.001 }, { ...input, statementDay: 32 }])
        await call('POST', '', bad, 400);
    let card = (await call('POST', '', input, 201)).card;
    await call('POST', '', { ...input, name: ' İŞ KARTI ' }, 409);
    assert.equal(card.balance, 10.10);
    assert.equal((await call('GET', '', undefined, 200, 'other')).cards.length, 0);
    await call('PUT', '/' + card.id, { ...input, expectedRevision: card.revision }, 404, 'other');
    await call('PUT', '/' + card.id, { ...input, expectedRevision: randomUUID() }, 409);
    const priorRevision = card.revision;
    card = (await call('PUT', '/' + card.id, { ...input, name: 'İş kartı yeni', expectedRevision: priorRevision })).card;
    await call('PUT', '/' + card.id, { ...input, expectedRevision: priorRevision }, 409);
    const entryInput = { requestId: randomUUID(), type: 'SPEND', date: '2026-10-29', amount: 0.20, merchant: 'Market', category: 'Ofis', description: 'Test', receiptNo: 'F-1' };
    for (const bad of [{ ...entryInput, date: '2026-02-30' }, { ...entryInput, amount: -1 }, { ...entryInput, amount: 0.001 }, { ...entryInput, amount: 0.000000001 }, { ...entryInput, amount: 0.00999999 }, { ...entryInput, cardNumber: '4111111111111111' }])
        await call('POST', `/${card.id}/entries`, bad, 400);
    const entry = (await call('POST', `/${card.id}/entries`, entryInput, 201)).entry;
    await call('POST', `/${card.id}/entries`, { ...entryInput, requestId: randomUUID() }, 404, 'other');
    assert.equal((await call('POST', `/${card.id}/entries`, entryInput, 201)).entry.id, entry.id);
    await call('POST', `/${card.id}/entries`, { ...entryInput, amount: 1 }, 409);
    await call('POST', `/${card.id}/entries`, { ...entryInput, requestId: randomUUID(), description: 'cvv:123' }, 400);
    await call('PUT', '/' + card.id, { ...input, openingBalance: 5, expectedRevision: card.revision }, 409);
    await call('POST', `/${card.id}/entries`, { ...entryInput, requestId: randomUUID(), type: 'REFUND', amount: 0.10 }, 201);
    await call('POST', `/${card.id}/entries`, { ...entryInput, requestId: randomUUID(), type: 'REPAYMENT', amount: 0.20 }, 201);
    let list = await call('GET');
    assert.equal(list.cards[0].balance, 10);
    assert.equal(list.entries.length, 3);
    await call('POST', `/${card.id}/entries/${entry.id}/void`, { expectedRevision: entry.revision, reason: 'Yanlış kayıt' }, 404, 'other');
    await call('POST', `/${card.id}/entries/${entry.id}/void`, { expectedRevision: entry.revision, reason: 'Yanlış kayıt' });
    await call('POST', `/${card.id}/entries/${entry.id}/void`, { expectedRevision: entry.revision, reason: 'Yanlış kayıt' }, 409);
    list = await call('GET');
    assert.equal(list.cards[0].balance, 9.8);
    assert.equal(list.entries.length, 3);
    card = (await call('PUT', '/' + card.id, { ...input, status: 'ARCHIVED', expectedRevision: card.revision })).card;
    await call('POST', `/${card.id}/entries`, { ...entryInput, requestId: randomUUID() }, 409);
    const file = process.env.DATABASE_PATH! + '.company-cards.json';
    const s1 = new CompanyCardsStore(file);
    const s2 = new CompanyCardsStore(file);
    assert.equal(s1.list('a').cards[0].status, 'ARCHIVED');
    const outcomes = await Promise.allSettled([s1.create('a', { ...input, name: 'One' }), s2.create('a', { ...input, name: 'Two' })]);
    const succeeded = outcomes.filter(r => r.status === 'fulfilled').length;
    assert(succeeded >= 1);
    assert.equal(s2.list('a').cards.length, 1 + succeeded);
    fs.mkdirSync(file + '.lock');
    await assert.rejects(s1.create('a', input), { status: 503 });
    fs.rmdirSync(file + '.lock');
    // Separate OS processes share no cache. All successful additions must survive atomic replacement.
    async function worker(label: string) {
        return new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, ['--import', 'tsx', 'server/tests/companyCardsWorker.ts', file, label], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
            let output = '';
            child.stdout.on('data', d => output += d);
            child.stderr.on('data', d => output += d);
            child.on('error', reject);
            child.on('exit', code => code === 0 ? resolve() : reject(new Error(output)));
        });
    }
    const count = s1.list('a').cards.length;
    await Promise.all([worker('one'), worker('two')]);
    assert.equal(s2.list('a').cards.length, count + 16);
    const rawDisk = fs.readFileSync(file, 'utf8');
    const savedDisk = JSON.parse(rawDisk);
    assert.equal(savedDisk.entries[0].amountCents, 20);
    assert.equal(savedDisk.entries[0].amount, undefined);
    assert(savedDisk.audit.some((event: { action: string }) => event.action === 'ENTRY_VOIDED'));
    assert(savedDisk.audit.every((event: Record<string, unknown>) => !('description' in event) && !('last4' in event)));
    fs.writeFileSync(file, '{broken');
    await assert.rejects(s1.create('a', { ...input, name: 'Do not overwrite' }), { status: 503 });
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
    fs.writeFileSync(file, rawDisk);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const originalMembership = structuredClone(storage.getState().tenantUsers.find(m => m.userId === 'owner'))!;
    const originalTenant = structuredClone(storage.getState().tenants.find(t => t.id === 'a'))!;
    const originalPlans = structuredClone(storage.getState().subscriptionPlans);
    async function fixture(change: (db: ReturnType<typeof storage.getState>) => void) {
        await storage.runTransaction(change);
        mainBefore = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    }
    await fixture(db => { db.tenantUsers.find(m => m.userId === 'owner')!.allowedMenuIds = ['cari']; });
    assert.equal((await call('GET', '', undefined, 403)).code, 'MENU_ACCESS_DENIED');
    await call('POST', '', { ...input, name: 'Forbidden' }, 403);
    await fixture(db => {
        db.tenantUsers[db.tenantUsers.findIndex(m => m.userId === 'owner')] = structuredClone(originalMembership);
        db.tenants.find(t => t.id === 'a')!.selectedServicePlanIds = ['cards-no-bank'];
        db.subscriptionPlans!.push({ ...db.subscriptionPlans![0], id: 'cards-no-bank', status: 'ACTIVE', activeModules: ['CARI'] });
    });
    assert.equal((await call('GET', '', undefined, 403)).code, 'SERVICE_ACCESS_DENIED');
    await call('POST', '', { ...input, name: 'Forbidden' }, 403);
    await fixture(db => {
        db.tenants[db.tenants.findIndex(t => t.id === 'a')] = structuredClone(originalTenant);
        db.subscriptionPlans = originalPlans;
        db.tenants.find(t => t.id === 'a')!.erpSubscription = { startDate: '2020-01-01', endDate: '2020-12-31', expiryPolicy: 'READ_ONLY', updatedAt: '' };
    });
    await call('GET');
    assert.equal((await call('POST', '', { ...input, name: 'Forbidden' }, 403)).code, 'ERP_SUBSCRIPTION_EXPIRED');
    await fixture(db => { db.tenants[db.tenants.findIndex(t => t.id === 'a')] = structuredClone(originalTenant); });
    // The bounded reusable endpoint limiter is enforced without changing login limits.
    let limited = false;
    for (let i = 0; i < 125; i++) {
        const response = await fetch(base, { headers: { Authorization: `Bearer ${tokens.owner}` } });
        if (response.status === 429) { limited = true; assert(response.headers.get('retry-after')); break; }
        assert.equal(response.status, 200);
    }
    assert(limited);
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), mainBefore);
    console.info(`Company card tracking: ${checks} HTTP checks, independent fresh stores, lock contention and unchanged financial database passed.`);
}
finally {
    server.close();
}
