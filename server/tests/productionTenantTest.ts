import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-production-')), 'database.json');
const { storage } = await import('../db/storage');
const { tenantContext } = await import('../db/tenantConfiguration');
const { generateToken } = await import('../routes/auth');
const { requireAuth } = await import('../middleware/authGuards');
const { settingsRouter } = await import('../routes/settings');
const { v1EinvoiceSettingsRouter } = await import('../routes/v1/e-invoice-settings');
const { companiesRouter } = await import('../routes/companies');
const { hizliBilisimRouter } = await import('../routes/hizli-bilisim');
const { migrateMemberships } = await import('../security/memberships');
const { subscriptionState, validSubscriptionDates } = await import('../security/erpSubscription');
const { dispatchHizliInvoice } = await import('../services/hizliInvoiceDispatch');
const { HizliConnectService } = await import('../services/hizliConnectService');
storage.update(db => {
  const t = db.tenants[0], u = db.users[0];
  db.tenants = ['a', 'b'].map((id, i) => ({ ...t, id, name: id, title: id, taxNumber: `123456789${i}`, status: 'ACTIVE', isArchived: false, externalCustomerId: undefined,
    erpSubscription: { startDate: '2020-01-01', endDate: '2099-12-31', expiryPolicy: 'READ_ONLY', updatedAt: '' } }));
  db.users = ['admin', 'a', 'b'].map(id => ({ ...u, id, username: id, active: true, role: id === 'admin' ? 'SUPER_ADMIN' : 'COMPANY_ADMIN', companyId: id === 'admin' ? 'a' : id, allowedCompanyIds: [id === 'admin' ? 'a' : id] }));
  db.tenantUsers = []; db.tenantConfigurations = {}; migrateMemberships(db);
  db.externalCustomers = [{ id: 'ext-a', externalId: 'provider-a', provider: 'HIZLI_BILISIM', taxNumber: '1234567890', companyName: 'A', title: 'A', taxOffice: '', contactName: '', phone: '', email: '', status: 'NEW', registeredAt: '', syncedAt: '' }];
});
const token = (id: string) => generateToken(storage.getState().users.find(u => u.id === id)!, id === 'admin' ? 'a' : id);
const app = express(); app.use(express.json());
app.use('/settings', settingsRouter); app.use('/companies', companiesRouter); app.use('/hizli', hizliBilisimRouter);
app.use('/einvoice', v1EinvoiceSettingsRouter);
app.post('/sequence', requireAuth, async (_req, res) => {
  const value = await storage.runTransaction(async draft => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return storage.nextSequenceInTransaction(draft, 'TEST');
  });
  res.json({ value });
});
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
let checks = 0;
async function call(url: string, id: string, method = 'GET', body?: any, status = 200) {
  const response = await fetch(base + url, { method, headers: { Authorization: `Bearer ${token(id)}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json(); assert.equal(response.status, status, `${url}: ${JSON.stringify(json)}`); checks++; return json;
}
try {
  await tenantContext.run('a', async () => {
    await storage.runTransaction(draft => {
      draft.invoices.push({ ...draft.invoices[0], id: 'dispatch-fixture', tenantId: 'a', status: 'DRAFT', eInvoiceStatus: 'DRAFT' } as any);
    });
    const originalSend = HizliConnectService.sendInvoice;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let sends = 0;
    HizliConnectService.sendInvoice = async () => { sends++; started(); await gate; return { success: false, requiresReconciliation: true }; };
    try {
      const first = dispatchHizliInvoice('dispatch-fixture', 'a');
      await ready;
      await assert.rejects(dispatchHizliInvoice('dispatch-fixture', 'a'), /işlemde/);
      release(); await first;
      await assert.rejects(dispatchHizliInvoice('dispatch-fixture', 'a'), /işlemde/);
      assert.equal(sends, 1);
      assert.equal(storage.getState().invoices.find(i => i.id === 'dispatch-fixture')?.eInvoiceStatus, 'SENDING');
      await assert.rejects(dispatchHizliInvoice('dispatch-fixture', 'b'), /bulunamadı/);
    } finally { release(); HizliConnectService.sendInvoice = originalSend; }
  });
  await call('/einvoice/settings', 'a', 'PUT', { providerId: 'HIZLI_TEKNOLOJI', defaultInvoicePrefix: 'btf' });
  assert.equal((await call('/einvoice/settings', 'a')).settings.defaultInvoicePrefix, 'BTF');
  assert.equal((await call('/einvoice/settings', 'b')).settings.defaultInvoicePrefix, undefined);
  await call('/einvoice/settings', 'a', 'PUT', { defaultInvoicePrefix: 'TOOLONG' }, 400);
  await call('/einvoice/settings', 'a', 'PUT', { autoSendToGib: false });
  assert.equal((await call('/einvoice/settings', 'a')).settings.defaultInvoicePrefix, 'BTF');
  const bBefore = await call('/settings', 'b');
  await call('/settings/company', 'a', 'PUT', { title: 'Only A', id: 'b' });
  await call('/settings/system', 'a', 'PUT', { receiptFooter: 'A footer' });
  assert.equal((await call('/settings', 'a')).company.title, 'Only A');
  assert.equal((await call('/settings', 'b')).company.title, bBefore.company.title);
  assert.equal((await call('/settings', 'b')).settings.receiptFooter, bBefore.settings.receiptFooter);
  assert.equal((await call('/settings', 'a')).company.id, 'a');
  await call('/companies/b', 'a', 'PUT', { title: 'Attack' }, 403);
  const values = await Promise.all(Array.from({ length: 8 }, () => call('/sequence', 'a', 'POST', {})));
  assert.equal(new Set(values.map(v => v.value)).size, 8);
  assert.ok((await call('/sequence', 'b', 'POST', {})).value.endsWith('000001'));
  const year = new Date().getFullYear();
  await call('/settings/sequences', 'a', 'PUT', { sequences: { TEST: { prefix: 'TES', year, lastNumber: 0, length: 6 } } }, 400);
  await call('/hizli/match-company', 'admin', 'POST', { customerId: 'ext-a', companyId: 'b' }, 409);
  await call('/hizli/match-company', 'admin', 'POST', { customerId: 'ext-a', companyId: 'a' });
  await call('/hizli/match-company', 'admin', 'POST', { customerId: 'ext-a', companyId: 'a' });
  assert.equal(storage.getState().externalCustomers![0].isbeyCompanyId, 'a');
  await call('/settings/company', 'a', 'PUT', { taxNumber: '9999999999' }, 400);
  await call('/companies/a', 'admin', 'PUT', { taxNumber: '9999999999' }, 400);
  storage.update(db => { db.externalCustomers!.push({ ...db.externalCustomers![0], id: 'duplicate', externalId: 'other-provider-id', isbeyCompanyId: undefined }); });
  await call('/hizli/match-company', 'admin', 'POST', { customerId: 'duplicate', companyId: 'a' }, 409);
  assert.equal(storage.getState().externalCustomers!.find(c => c.id === 'duplicate')!.isbeyCompanyId, undefined);
  storage.update(db => { db.externalCustomers = db.externalCustomers!.filter(c => c.id !== 'duplicate'); });
  const services = structuredClone(storage.getState().tenants[0].activeServices);
  await call('/companies/a/erp-subscription', 'admin', 'PUT', { startDate: '2020-01-01', endDate: '2021-01-01' });
  await call('/settings', 'a');
  await call('/settings/company', 'a', 'PUT', { name: 'expired edit' }, 403);
  await call('/sequence', 'a', 'POST', {}, 403);
  await call('/companies/a/erp-subscription', 'a', 'PUT', { startDate: '2020-01-01', endDate: '2099-01-01' }, 403);
  await call('/companies/a/erp-subscription', 'admin', 'PUT', { startDate: '2020-01-01', endDate: '2099-01-01' });
  await call('/settings/system', 'a', 'PUT', { receiptFooter: 'Renewed' });
  assert.deepEqual(storage.getState().tenants[0].activeServices, services);
  await call('/companies/a/erp-subscription', 'admin', 'PUT', { startDate: '2026-02-30', endDate: '2027-01-01' }, 400);
  assert.equal(validSubscriptionDates('2026-02-30', '2027-01-01'), false);
  const tenant = structuredClone(storage.getState().tenants[0]);
  tenant.erpSubscription = { startDate: '2026-09-01', endDate: '2026-09-22', expiryPolicy: 'READ_ONLY', updatedAt: '' };
  assert.equal(subscriptionState(tenant, Date.parse('2026-09-22T20:59:59.999Z')), 'ACTIVE');
  assert.equal(subscriptionState(tenant, Date.parse('2026-09-22T21:00:00Z')), 'EXPIRED');
  const persisted = JSON.parse(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'));
  assert.equal(persisted.tenantConfigurations.a.settings.receiptFooter, 'Renewed');
  assert.equal(persisted.tenantConfigurations.b.sequences.TEST.lastNumber, 1);
  assert.equal(tenantContext.getStore(), undefined);
  console.log(`Production tenant readiness: ${checks} HTTP checks PASS; concurrent sequences, persistence and expiry boundaries PASS`);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
