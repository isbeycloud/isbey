import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-garanti-')), 'database.json');
const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { migrateMemberships } = await import('../security/memberships');
const { packageCheckoutRouter } = await import('../routes/v1/package-checkout');
const { v1CheckoutRouter } = await import('../routes/v1/checkout');
const { subscriptionsRouter } = await import('../routes/v1/subscriptions');
const { default: billingRouter } = await import('../routes/v1/billing');
const { creditsRouter } = await import('../routes/v1/credits');
const { paymentsRouter } = await import('../routes/v1/payments');
const { garantiPreparationStatus, garantiRequestHash } = await import('../services/payments/garantiPreparation');
const { PaymentGatewayAdapter } = await import('../services/payments/paymentGatewayAdapter');
const { PaymentProviderFactory, MockPaymentProvider: Faz9Mock, IyzicoPaymentProvider } = await import('../services/faz9/paymentProvider');
const { MockPaymentProvider } = await import('../services/payments/mockPaymentProvider');

storage.update(db => {
  db.tenants = ['a', 'b'].map(id => ({ ...structuredClone(db.tenants[0]), id, status: 'ACTIVE', isArchived: false,
    selectedServicePlanIds: undefined, erpSubscription: undefined, commercialSubscription: undefined }));
  db.users = ['admin', 'owner', 'employee'].map(id => ({ id, username: id, fullName: id, email: `${id}@example.test`, passwordHash: '', active: true,
    role: id === 'admin' ? 'SUPER_ADMIN' : id === 'owner' ? 'COMPANY_ADMIN' : 'SATIS', companyId: 'a', allowedCompanyIds: ['a'], createdAt: new Date().toISOString() }));
  db.tenantUsers = []; migrateMemberships(db);
  db.subscriptionPlans = [{ ...db.subscriptionPlans![0], id: 'plan-a', slug: 'PRO', name: 'Test plan', status: 'ACTIVE',
    currency: 'TRY', monthlyPrice: 123.45, yearlyPrice: 1234.5, activeModules: ['CARI'] }];
});
await storage.runTransaction(() => {});
const tokens = Object.fromEntries(storage.getState().users.map(user => [user.id, generateToken(user, 'a')]));
const app = express(); app.use(express.json({ strict: false }));
app.use('/package-checkout', packageCheckoutRouter); app.use('/checkout', v1CheckoutRouter);
app.use('/subscriptions', subscriptionsRouter); app.use('/billing', billingRouter); app.use('/credits', creditsRouter); app.use('/payments', paymentsRouter);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
let checks = 0;
async function call(method: string, route: string, user = 'owner', body?: unknown, expected = 200) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text();
  assert.ok(response.headers.get('content-type')?.includes('application/json'), `${method} ${route}: HTTP ${response.status}: ${raw.slice(0,300)}`);
  const result = JSON.parse(raw); assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`); checks++; return result;
}
try {
  const before = fs.readFileSync(process.env.DATABASE_PATH, 'utf8');
  const previewBody = { planId: 'plan-a', billingCycle: 'monthly' };
  await call('GET', '/package-checkout/status', '', undefined, 401);
  await call('GET', '/package-checkout/status', 'employee', undefined, 403);
  await call('GET', '/package-checkout/admin/readiness', 'owner', undefined, 403);
  await call('GET', '/package-checkout/admin/readiness', 'admin');
  const preview = (await call('POST', '/package-checkout/preview', 'owner', previewBody)).preview;
  assert.equal(preview.tenantId, 'a'); assert.equal(preview.catalogAmount, 123.45); assert.equal(preview.paymentCollected, false);
  assert.equal((await call('POST', '/package-checkout/preview', 'owner', { ...previewBody, billingCycle: 'yearly' })).preview.catalogAmount, 1234.5);
  for (const input of [null, [], { ...previewBody, tenantId: 'b' }, { ...previewBody, amount: 0.01 }, { ...previewBody, cardNumber: 'test' },
    { ...previewBody, billingCycle: 'weekly' }, { ...previewBody, planId: 'missing' }, { ...previewBody, paymentProvider: 'MOCK' }]) {
    await call('POST', '/package-checkout/preview', 'owner', input, 400);
  }
  const env = { GARANTI_MODE: 'TEST', GARANTI_MERCHANT_ID: '12345', GARANTI_TERMINAL_ID: '12345678',
    GARANTI_PROV_USER_ID: 'fixture-user', GARANTI_TERMINAL_USER_ID: 'fixture-terminal', GARANTI_PROVISION_PASSWORD: 'fixture-password',
    GARANTI_STORE_KEY: 'fixture-key', APP_PUBLIC_URL: 'https://example.test' };
  const ready = garantiPreparationStatus(env);
  assert.equal(ready.configurationComplete, true); assert.equal(ready.checkoutAvailable, false);
  assert.ok(!JSON.stringify(ready).includes('fixture-password')); assert.ok(!JSON.stringify(ready).includes('fixture-key'));
  for (const key of Object.keys(env)) assert.equal(garantiPreparationStatus({ ...env, [key]: '' }).configurationComplete, false);
  assert.equal(garantiPreparationStatus({ ...env, APP_PUBLIC_URL: 'https://user:pass@example.test' }).configurationComplete, false);
  assert.equal(garantiPreparationStatus({ ...env, GARANTI_MODE: 'PROD' }).checkoutAvailable, false);
  const hashInput = { terminalId: '12345678', provisionPassword: 'fixture-ğİŞ', storeKey: 'fixture-key', orderId: 'TEST-ORDER-1',
    amountMinor: 12345, successUrl: 'https://example.test/return', errorUrl: 'https://example.test/return' };
  // ISO-8859-9 Python hashlib ile bağımsız hesaplanmış sabit vektör.
  assert.equal(garantiRequestHash(hashInput), 'F06F0491DDA64B3C05261B1A771E6CBA68B4098F7E79A97C66DFC844A81BB04FA83AFFAB8DA9C3AB92B29BB89CC54C2FD7690F38584811752BFA66C1E0FEB654');
  for (const invalid of [{ amountMinor: 1.1 }, { amountMinor: 0 }, { terminalId: '123' }, { successUrl: 'http://example.test' }, { provisionPassword: '😀' }]) {
    assert.throws(() => garantiRequestHash({ ...hashInput, ...invalid }));
  }
  assert.throws(() => PaymentProviderFactory.getProvider('UNKNOWN' as never), /desteklenmiyor/);
  for (const mode of ['production', 'staging', 'development']) {
    process.env.NODE_ENV = mode;
    const status = await call('GET', '/package-checkout/status'); assert.equal(status.checkoutAvailable, false);
    await call('POST', '/package-checkout/start', 'owner', { ...previewBody, amount: 1, tenantId: 'b' }, 503);
    for (const route of ['/checkout/pay', '/subscriptions/change', '/billing/upgrade', '/billing/buy-credits', '/credits/purchase']) {
      await call('POST', route, 'admin', { targetPlanSlug: 'PRO', planSlug: 'pro', tenantId: 'b', amount: 0.01, paymentProvider: 'MOCK' }, 503);
      await call('POST', route, '', {}, 401);
      await call('POST', route, 'employee', {}, 403);
    }
    await call('POST', '/payments/webhook', '', { eventType: 'PAYMENT_SUCCESS', amount: 1 }, 503);
    await assert.rejects(PaymentGatewayAdapter.processPayment({} as never), /henüz açık değil/);
    assert.throws(() => PaymentProviderFactory.getProvider(), /henüz açık değil/);
    for (const provider of [new Faz9Mock(), new IyzicoPaymentProvider()]) {
      await assert.rejects(provider.createPayment({} as never), /henüz açık değil/);
      await assert.rejects(provider.checkPayment('test'), /henüz açık değil/);
      await assert.rejects(provider.refundPayment('test'), /henüz açık değil/);
      await assert.rejects(provider.cancelPayment('test'), /henüz açık değil/);
    }
    const mock = new MockPaymentProvider();
    await assert.rejects(mock.createPayment({} as never), /henüz açık değil/);
    await assert.rejects(mock.verifyPayment('test'), /henüz açık değil/);
    await assert.rejects(mock.refundPayment({} as never), /henüz açık değil/);
  }
  assert.equal(fs.readFileSync(process.env.DATABASE_PATH, 'utf8'), before, 'Hazırlık veya kapalı ödeme akışı diskte veri değiştirdi');
  console.info(`Garanti hazırlığı: ${checks} HTTP kontrolü; hash/yapılandırma/simülasyon kapıları ve veri değişmezliği PASS.`);
} finally {
  process.env.NODE_ENV = 'test';
  await new Promise<void>(resolve => server.close(() => resolve()));
}
