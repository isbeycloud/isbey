import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-managed-packages-')), 'database.json');
process.env.HIZLI_BILISIM_ALLOW_PROD = 'false';
const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { requireAuth } = await import('../middleware/authGuards');
const { companiesRouter } = await import('../routes/companies');
const { tenantsRouter } = await import('../routes/tenants');
const { migrateMemberships } = await import('../security/memberships');
const { serviceModules } = await import('../services/serviceEntitlements');
const { managedMonthlyRevenue } = await import('../services/companyPackageManagement');

storage.update(db => {
  const template = db.tenants[0];
  db.tenants = ['a', 'b'].map(id => ({ ...structuredClone(template), id, name: id, isArchived: false, status: 'ACTIVE',
    selectedServicePlanIds: ['large'], updatedAt: '2026-01-01T00:00:00.000Z', storageUsedMb: 5,
    license: { prefix: 'T', startDate: '2020-01-01', endDate: '2099-12-31', isTrial: false, trialDays: 14, status: 'ACTIVE' },
    erpSubscription: { startDate: '2020-01-01', endDate: '2099-12-31', expiryPolicy: 'READ_ONLY', updatedAt: '' } }));
  db.users = ['admin', 'owner', 'employee'].map(id => ({ id, username: id, fullName: id, email: `${id}@example.test`, passwordHash: '', active: true,
    role: id === 'admin' ? 'SUPER_ADMIN' : id === 'owner' ? 'COMPANY_ADMIN' : 'SATIS', companyId: 'a', allowedCompanyIds: ['a'], createdAt: new Date().toISOString() }));
  db.tenantUsers = []; migrateMemberships(db);
  const plan = db.subscriptionPlans![0];
  db.subscriptionPlans = [
    { ...plan, id: 'large', name: 'Kurumsal', slug: 'PRO', status: 'ACTIVE', maxUsers: 10, maxInvoicesPerMonth: 10000, storageLimitMb: 1000, currency: 'TRY', monthlyPrice: 200, yearlyPrice: 2000, activeModules: ['CARI', 'STOK', 'FATURA', 'RAPORLAR', 'EFATURA'] },
    { ...plan, id: 'small', name: 'Başlangıç', slug: 'STARTER', status: 'ACTIVE', maxUsers: 1, maxInvoicesPerMonth: 100, storageLimitMb: 100, currency: 'TRY', monthlyPrice: 50, yearlyPrice: 500, activeModules: ['CARI'] },
    { ...plan, id: 'usd', name: 'USD', slug: 'USD', status: 'ACTIVE', currency: 'USD', activeModules: ['CARI'] },
    { ...plan, id: 'closed', name: 'Eski', status: 'INACTIVE', activeModules: ['CARI'] },
  ];
  db.subscriptions = []; db.auditLogs = [];
});
await storage.runTransaction(() => {});
const unrelatedTenant = JSON.stringify(storage.getState().tenants[1]);
const financialKeys = ['invoices', 'products', 'stockMovements', 'customers', 'currentTransactions', 'payments', 'creditTransactions', 'eServiceApplications'] as const;
const financialBefore = Object.fromEntries(financialKeys.map(k => [k, JSON.stringify(storage.getState()[k])]));
const tokens = Object.fromEntries(storage.getState().users.map(u => [u.id, generateToken(u, 'a')]));
const app = express(); app.use(express.json()); app.use('/api', requireAuth);
app.use('/api/companies', companiesRouter); app.use('/api/tenants', tenantsRouter);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
let checks = 0;
const tenant = () => storage.getState().tenants[0];
const payload = (extra: Record<string, unknown> = {}) => ({ planIds: ['large'], billingMode: 'PAID', billingCycle: 'yearly', amount: 1200,
  startDate: '2020-01-01', endDate: '2099-12-31', autoRenew: true, reason: 'Müşteri talebiyle yıllık pakete geçiş', expectedUpdatedAt: tenant().updatedAt, ...extra });
async function call(method: string, route: string, user = 'admin', body?: unknown, status = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json(); assert.equal(r.status, status, `${method} ${route}: ${JSON.stringify(data)}`); checks++; return data;
}
try {
  const route = '/api/companies/a/package';
  await call('GET', route, '', undefined, 401);
  for (const user of ['owner', 'employee']) {
    await call('GET', route, user, undefined, 403);
    await call('PUT', route, user, payload({ role: 'SUPER_ADMIN' }), 403);
  }
  await call('PUT', '/api/companies/b/package', 'owner', payload(), 403);
  const first = await call('GET', route);
  assert.equal(first.plans.length, 3); assert.equal(first.subscription, null);
  await call('GET', '/api/companies/missing/package', 'admin', undefined, 404);
  for (const invalid of [
    { billingMode: 'INVALID' }, { billingCycle: 'weekly' }, { startDate: '2026-02-30' }, { endDate: '2019-01-01' },
    { reason: 'short' }, { autoRenew: 'true' }, { amount: -1 }, { amount: '1200' }, { amount: 1.001 }, { amount: 0 },
    { billingMode: 'FREE', amount: 1200 }, { billingMode: 'FREE', amount: 0, autoRenew: true },
    { planIds: [] }, { planIds: ['missing'] }, { planIds: ['closed'] }, { planIds: ['large', 'usd'] }, { planIds: ['small'] },
  ]) {
    const before = JSON.stringify(storage.getState());
    await call('PUT', route, 'admin', payload(invalid), 400);
    assert.equal(JSON.stringify(storage.getState()), before, 'Invalid change mutated state');
  }
  await call('PUT', route, 'admin', payload({ expectedUpdatedAt: 'stale' }), 409);
  storage.update(db => { db.tenants[0].storageUsedMb = 1001; });
  await call('PUT', route, 'admin', payload(), 400);
  storage.update(db => { db.tenants[0].storageUsedMb = 5; });
  const originalInvoices = structuredClone(storage.getState().invoices);
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date()).slice(0, 7);
  storage.update(db => {
    db.subscriptionPlans!.find(p => p.id === 'large')!.maxInvoicesPerMonth = 1;
    db.invoices.push(...['quota-one', 'quota-two'].map(id => ({ ...structuredClone(originalInvoices[0]), id, tenantId: 'a', date: month + '-01', isDeleted: false })));
  });
  await call('PUT', route, 'admin', payload(), 400);
  storage.update(db => { db.invoices = originalInvoices; db.subscriptionPlans!.find(p => p.id === 'large')!.maxInvoicesPerMonth = 10000; });
  const stale = tenant().updatedAt;
  await call('PUT', route, 'admin', payload());
  assert.equal(tenant().commercialSubscription!.amount, 1200);
  assert.equal(managedMonthlyRevenue(tenant()), 100);
  assert.deepEqual(tenant().selectedServicePlanIds, ['large']);
  assert.equal(storage.getState().subscriptions[0].planId, 'large');
  assert.equal(storage.getState().subscriptions[0].billingCycle, 'yearly');
  assert.equal(storage.getState().subscriptions[0].nextBillingDate, tenant().expiresAt);
  assert.equal(storage.getState().auditLogs[0].userId, 'admin');
  assert.equal(storage.getState().auditLogs[0].tenantId, 'a');
  assert.equal(JSON.parse(storage.getState().auditLogs[0].details).paymentCollected, false);
  await call('PUT', route, 'admin', payload({ expectedUpdatedAt: stale }), 409);
  await call('PUT', route, 'admin', payload({ billingMode: 'FREE', amount: 0, autoRenew: false }));
  assert.equal(tenant().commercialSubscription!.billingMode, 'FREE');
  assert.equal(managedMonthlyRevenue(tenant()), 0);
  assert.equal(storage.getState().subscriptions[0].nextBillingDate, undefined);
  assert.equal(tenant().license!.isTrial, false);
  await call('PUT', route, 'admin', payload({ billingMode: 'TRIAL', amount: 0, autoRenew: false }));
  assert.equal(tenant().status, 'TRIAL'); assert.equal(tenant().license!.isTrial, true);
  assert.ok(!serviceModules(storage.getState(), tenant())!.includes('EFATURA'));
  assert.ok(!tenant().activeModules.includes('EFATURA' as any));
  await call('PUT', route, 'admin', payload());
  assert.equal(tenant().status, 'ACTIVE'); assert.equal(tenant().license!.isTrial, false);
  assert.ok(serviceModules(storage.getState(), tenant())!.includes('EFATURA'));
  storage.update(db => { db.tenants[0].status = 'SUSPENDED'; });
  tokens.admin = generateToken(storage.getState().users.find(u => u.id === 'admin')!, 'b');
  await call('PUT', route, 'admin', payload());
  assert.equal(tenant().status, 'SUSPENDED'); assert.equal(managedMonthlyRevenue(tenant()), 0);
  storage.update(db => { db.tenants[0].status = 'ACTIVE'; });
  await call('PUT', route, 'admin', payload({ endDate: '2020-12-31' }));
  assert.equal(tenant().status, 'EXPIRED'); assert.equal(tenant().license!.status, 'EXPIRED');
  assert.equal(storage.getState().subscriptions[0].status, 'expired');
  assert.equal(managedMonthlyRevenue(tenant()), 0);
  await call('PUT', route, 'admin', payload());
  assert.equal(tenant().status, 'ACTIVE'); assert.equal(tenant().license!.status, 'ACTIVE');
  assert.equal(storage.getState().subscriptions[0].status, 'active');
  const beforeProtected = JSON.stringify(tenant().commercialSubscription);
  await call('PUT', '/api/companies/a', 'owner', { commercialSubscription: { billingMode: 'FREE' } });
  assert.equal(JSON.stringify(tenant().commercialSubscription), beforeProtected);
  await call('PUT', '/api/tenants/a', 'admin', { commercialSubscription: { billingMode: 'FREE' } }, 400);
  const history = await call('GET', route);
  assert.equal(history.history.length, 7);
  assert.ok(!history.plans.some((p: any) => p.id === 'closed'));
  assert.equal(JSON.stringify(storage.getState().tenants[1]), unrelatedTenant);
  for (const key of financialKeys) assert.equal(JSON.stringify(storage.getState()[key]), financialBefore[key], `${key} changed`);
  const persisted = JSON.parse(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'));
  assert.equal(persisted.tenants[0].commercialSubscription.billingMode, 'PAID');
  assert.equal(persisted.subscriptions.length, 1);
  console.log(`Company package management: ${checks} HTTP checks PASS; authorization, persistence, quotas, trial entitlements, audit and financial invariants PASS`);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
