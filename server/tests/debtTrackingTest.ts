import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import express from 'express';
import { spawn } from 'node:child_process';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'debts-test-')), 'db.json');
const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { migrateMemberships } = await import('../security/memberships');
const { DebtTrackingStore, istanbulToday } = await import('../services/debtTracking');
const { debtTrackingRouter } = await import('../routes/debtTracking');
storage.update(db => {
    db.tenants = ['a', 'b'].map(id => ({ ...structuredClone(db.tenants[0]), id, status: 'ACTIVE', isArchived: false, selectedServicePlanIds: undefined, erpSubscription: undefined }));
    db.users = ['owner', 'other', 'viewer'].map(id => ({ id, username: id, fullName: id, email: `${id}@example.test`, passwordHash: '', active: true, role: id === 'viewer' ? 'RAPOR' : 'COMPANY_ADMIN', companyId: id === 'other' ? 'b' : 'a', allowedCompanyIds: [id === 'other' ? 'b' : 'a'], createdAt: new Date().toISOString() }));
    db.tenantUsers = [];
    migrateMemberships(db);
    db.customers = ['receivable', 'payable', 'closed', 'mixed', 'invalid', 'foreign', 'deleted', 'usd', 'unsupported'].map(id => ({ id, tenantId: id === 'foreign' ? 'b' : 'a', code: id, title: id, type: 'BOTH', balance: id === 'payable' ? -80 : id === 'closed' ? 0 : id === 'invalid' ? 1.001 : 120, totalDebit: 120, totalCredit: 0, active: true, currency: id === 'usd' ? 'USD' : id === 'unsupported' ? 'XYZ' : 'TRY', createdAt: '', updatedAt: '', ...(id === 'deleted' ? { deletedAt: '2026-01-01' } : {}) }));
    db.invoices = [{ id: 'mixed-invoice', tenantId: 'a', customerId: 'mixed', currency: 'USD' }, { id: 'dupe1', tenantId: 'a', customerId: 'receivable', grandTotal: 120, paidAmount: 0 }, { id: 'dupe2', tenantId: 'a', customerId: 'receivable', grandTotal: 120, paidAmount: 0 }] as never;
});
await storage.runTransaction(() => {
});
// Persist explicit balance cases independently from the accounting engine's recalculation.
const initial = JSON.parse(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'));
for (const c of initial.customers)
    c.balance = c.id === 'payable' ? -80 : c.id === 'closed' ? 0 : c.id === 'invalid' ? 1.001 : 120;
fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(initial));
let mainBefore = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
const tokens = Object.fromEntries(storage.getState().users.map(u => [u.id, generateToken(u, u.companyId)]));
const app = express();
app.use(express.json({ strict: false }));
app.use('/api/debt-tracking', debtTrackingRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/debt-tracking`;
let checks = 0;
async function call(method = 'GET', route = '', body?: unknown, status = 200, user = 'owner') {
    const file = process.env.DATABASE_PATH! + '.debt-tracking.json';
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json();
    assert.equal(res.status, status, JSON.stringify(data));
    checks++;
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), mainBefore);
    if (status >= 400)
        assert.equal(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, before);
    return data;
}
const fixed = () => new Date('2026-10-29T12:00:00Z');
const store = new DebtTrackingStore(process.env.DATABASE_PATH!, fixed);
const input = { dueDate: '2026-10-28', promiseDate: '2026-10-28', reminderDate: '2026-10-29', status: 'PROMISED', note: 'Görüşüldü\nİkinci satır\r\n\tÖdeme bilgisi', expectedRevision: '', expectedDirection: 'RECEIVABLE', expectedBalance: 120, requestId: randomUUID() };
try {
    assert.equal(istanbulToday(new Date('2026-10-28T21:00:00Z')), '2026-10-29');
    await call('GET', '', undefined, 401, '');
    await call('GET', '', undefined, 403, 'viewer');
    await call('PUT', '/receivable', input, 403, 'viewer');
    const summary = await call('GET', '/summary');
    assert.equal(summary.rows, undefined);
    assert.equal(summary.totals, undefined);
    assert(summary.counts);
    let listed = store.list('a');
    assert.equal(listed.rows.length, 7);
    assert.equal(listed.rows.find(r => r.customerId === 'usd')!.amount, null);
    assert.equal(listed.rows.find(r => r.customerId === 'unsupported')!.amount, null);
    assert.equal(listed.rows.find(r => r.customerId === 'receivable')!.amount, 120);
    assert.equal(listed.rows.find(r => r.customerId === 'payable')!.direction, 'PAYABLE');
    assert.equal(listed.rows.find(r => r.customerId === 'mixed')!.amount, null);
    assert.equal(listed.rows.find(r => r.customerId === 'invalid')!.dueState, 'NEEDS_REVIEW');
    assert.equal(listed.totals[0].receivable, 120);
    assert.equal(listed.totals[0].payable, 80);
    await call('PUT', '/foreign', input, 404);
    await call('PUT', '/receivable', input, 404, 'other');
    for (const bad of [{ ...input, amount: 30 }, { ...input, dueDate: '2026-02-30' }, { ...input, note: 'cvv:123' }, { ...input, expectedBalance: 119 }, { ...input, expectedDirection: 'PAYABLE' }])
        await call('PUT', '/receivable', bad, 'amount' in bad || bad.dueDate === '2026-02-30' || bad.note === 'cvv:123' ? 400 : 409);
    const saved = await call('PUT', '/receivable', input);
    assert.equal(saved.followup.note, input.note);
    const missingPromise = await call('PUT', '/receivable', { ...input, requestId: randomUUID(), expectedRevision: saved.followup.revision, promiseDate: '' }, 400);
    assert(missingPromise.message.includes('ödeme sözü tarihi'));
    await call('PUT', '/receivable', { ...input, requestId: randomUUID(), expectedRevision: saved.followup.revision, note: 'bad\u0000note' }, 400);
    await call('PUT', '/receivable', { ...input, requestId: randomUUID(), expectedRevision: saved.followup.revision, note: 'x'.repeat(501) }, 400);
    assert.equal((await call('PUT', '/receivable', input)).followup.revision, saved.followup.revision);
    await call('PUT', '/receivable', { ...input, note: 'Farklı' }, 409);
    await call('PUT', '/payable', { ...input, expectedDirection: 'PAYABLE', expectedBalance: -80 }, 409);
    listed = store.list('a');
    const row = listed.rows.find(r => r.customerId === 'receivable')!;
    assert.equal(row.dueState, 'OVERDUE');
    assert(row.reminderDue && row.promiseOverdue);
    assert.equal(listed.counts.actionable, 1);
    for (const [due, state] of [['2026-10-29', 'TODAY'], ['2026-11-05', 'UPCOMING'], ['2026-11-06', 'LATER'], ['', 'UNSCHEDULED']]) {
        const current = store.list('a').rows.find(r => r.customerId === 'receivable')!;
        await store.save('a', 'receivable', { ...input, requestId: randomUUID(), dueDate: due, expectedRevision: current.revision });
        assert.equal(store.list('a').rows.find(r => r.customerId === 'receivable')!.dueState, state);
    }
    const raw = JSON.parse(mainBefore);
    raw.customers.find((c: {
        id: string;
    }) => c.id === 'receivable').balance = -5;
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(raw));
    mainBefore = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const flipped = store.list('a').rows.find(r => r.customerId === 'receivable')!;
    assert.equal(flipped.direction, 'PAYABLE');
    assert.equal(flipped.followup, null);
    assert.equal(flipped.dueState, 'UNSCHEDULED');
    assert(flipped.history.length > 0);
    await call('PUT', '/receivable', { ...input, requestId: randomUUID(), expectedRevision: flipped.revision }, 409);
    await store.save('a', 'receivable', { ...input, requestId: randomUUID(), expectedDirection: 'PAYABLE', expectedBalance: -5, expectedRevision: flipped.trackingRevision, dueDate: '', promiseDate: '', reminderDate: '', status: 'OPEN' });
    assert.equal(store.list('a').rows.find(r => r.customerId === 'receivable')!.followup!.direction, 'PAYABLE');
    raw.customers.find((c: {
        id: string;
    }) => c.id === 'receivable').balance = 0;
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(raw));
    mainBefore = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    assert.equal(store.list('a').rows.find(r => r.customerId === 'receivable')!.dueState, 'CLOSED');
    const lock = process.env.DATABASE_PATH! + '.debt-tracking.json.lock';
    fs.mkdirSync(lock);
    await assert.rejects(store.save('a', 'payable', { ...input, expectedDirection: 'PAYABLE', expectedBalance: -80, requestId: randomUUID() }), { status: 503 });
    fs.rmdirSync(lock);
    const historyCount = store.list('a').rows.find(r => r.customerId === 'payable')!.history.length;
    async function worker(label: string) {
        return new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, ['--import', 'tsx', 'server/tests/debtTrackingWorker.ts', process.env.DATABASE_PATH!, label], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
            let output = '';
            child.stdout.on('data', d => output += d);
            child.stderr.on('data', d => output += d);
            child.on('error', reject);
            child.on('exit', code => code === 0 ? resolve() : reject(new Error(output)));
        });
    }
    await Promise.all([worker('one'), worker('two')]);
    assert.equal(store.list('a').rows.find(r => r.customerId === 'payable')!.history.length, historyCount + 16);
    const sideFile = process.env.DATABASE_PATH! + '.debt-tracking.json';
    const savedSide = fs.readFileSync(sideFile, 'utf8');
    fs.writeFileSync(sideFile, '{broken');
    assert.throws(() => store.list('a'), { status: 503 });
    fs.writeFileSync(sideFile, savedSide);
    const originalMembership = structuredClone(storage.getState().tenantUsers.find(m => m.userId === 'owner'))!;
    const originalTenant = structuredClone(storage.getState().tenants.find(t => t.id === 'a'))!;
    const originalPlans = structuredClone(storage.getState().subscriptionPlans);
    async function fixture(change: (db: ReturnType<typeof storage.getState>) => void) {
        const prior = JSON.parse(mainBefore);
        await storage.runTransaction(change);
        const after = JSON.parse(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'));
        for (const key of ['tenants', 'tenantUsers', 'users', 'subscriptionPlans'])
            prior[key] = after[key];
        fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(prior));
        mainBefore = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    }
    await fixture(db => {
        db.tenantUsers.find(m => m.userId === 'owner')!.allowedMenuIds = ['stok'];
    });
    assert.equal((await call('GET', '', undefined, 403)).code, 'MENU_ACCESS_DENIED');
    await call('PUT', '/payable', { ...input, requestId: randomUUID() }, 403);
    await fixture(db => {
        db.tenantUsers[db.tenantUsers.findIndex(m => m.userId === 'owner')] = structuredClone(originalMembership);
        db.tenants.find(t => t.id === 'a')!.selectedServicePlanIds = ['debt-no-cari'];
        db.subscriptionPlans!.push({ ...db.subscriptionPlans![0], id: 'debt-no-cari', status: 'ACTIVE', activeModules: ['STOK'] });
    });
    assert.equal((await call('GET', '', undefined, 403)).code, 'SERVICE_ACCESS_DENIED');
    await call('PUT', '/payable', { ...input, requestId: randomUUID() }, 403);
    await fixture(db => {
        db.tenants[db.tenants.findIndex(t => t.id === 'a')] = structuredClone(originalTenant);
        db.subscriptionPlans = originalPlans;
        db.tenants.find(t => t.id === 'a')!.erpSubscription = { startDate: '2020-01-01', endDate: '2020-12-31', expiryPolicy: 'READ_ONLY', updatedAt: '' };
    });
    await call();
    assert.equal((await call('PUT', '/payable', { ...input, requestId: randomUUID() }, 403)).code, 'ERP_SUBSCRIPTION_EXPIRED');
    await fixture(db => {
        db.tenants[db.tenants.findIndex(t => t.id === 'a')] = structuredClone(originalTenant);
        db.tenantUsers.find(m => m.userId === 'owner')!.status = 'SUSPENDED';
    });
    await call('GET', '', undefined, 403);
    await call('PUT', '/payable', { ...input, requestId: randomUUID() }, 403);
    await fixture(db => {
        db.tenantUsers[db.tenantUsers.findIndex(m => m.userId === 'owner')] = structuredClone(originalMembership);
    });
    let limited = false;
    for (let i = 0; i < 125; i++) {
        const res = await fetch(base + '/summary', { headers: { Authorization: `Bearer ${tokens.owner}` } });
        if (res.status === 429) {
            limited = true;
            assert(res.headers.get('retry-after'));
            break;
        }
        assert.equal(res.status, 200);
    }
    assert(limited);
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), mainBefore);
    console.log(`Debt tracking: ${checks} HTTP checks, fresh persisted balances, currency isolation, due boundaries and main DB immutability PASS.`);
}
finally {
    server.close();
}
