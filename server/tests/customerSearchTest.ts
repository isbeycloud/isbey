/** Cari aramasında null/eksik telefon regresyonu; gerçek router, izole test DB. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import type { Customer } from '../db/schema';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'customerSearchTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole customerSearchTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'customer-search-data');

const { storage } = await import('../db/storage');
const { customersRouter } = await import('../routes/customers');
const { resolveTenant } = await import('../middleware/authGuards');
const tenantId = 'tnt-search-test';
storage.update(db => {
  db.tenants = [{ ...db.tenants[0], id: tenantId, status: 'ACTIVE', isArchived: false }];
  db.users = [{ ...db.users[0], id: 'search-admin', role: 'SUPER_ADMIN', active: true }];
  const template = db.customers[0];
  db.customers = [
    { id: 'null-phone', title: 'Alfa', code: 'CAR-001', taxNumber: '1111111111', phone: null, type: 'CUSTOMER' },
    { id: 'missing-phone', title: 'Beta', code: 'CAR-002', taxNumber: null, phone: undefined, type: 'SUPPLIER' },
    { id: 'empty-phone', title: 'Gama', code: 'CAR-003', taxNumber: '', phone: '', type: 'BOTH' },
    { id: 'with-phone', title: 'Delta', code: 'CAR-004', taxNumber: '4444444444', phone: '05551234567', type: 'CUSTOMER' },
    { id: 'other-tenant', title: 'Alfa', code: 'CAR-005', phone: null, tenantId: 'tnt-other', type: 'CUSTOMER' },
    { id: 'unowned', title: 'Alfa', code: 'CAR-006', phone: null, tenantId: undefined, type: 'CUSTOMER' },
  ].map(c => ({ ...template, tenantId, balance: 0, totalDebit: 0, totalCredit: 0, ...c })) as unknown as Customer[];
  db.invoices = [];
  db.currentTransactions = [];
});

const app = express();
app.use(express.json());
app.get('/unresolved-tenant', resolveTenant, (_req, res) => res.json({ success: true }));
app.use('/api/customers', customersRouter);
// Test hatasını HTTP yanıtına taşı; başarısız arama 500 olarak gözlemlenir.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ success: false, message: err.message });
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/customers`;
const token = jwt.sign({ userId: 'search-admin', tenantId }, process.env.JWT_SECRET, { expiresIn: '5m' });
const before = JSON.stringify(storage.getState().customers);

try {
  const cases: Array<[string, string[]]> = [
    ['?search=bulunmayan', []],
    ['?search=BETA', ['missing-phone']],
    ['?search=alfa', ['null-phone']],
    ['?search=CAR-003', ['empty-phone']],
    ['?search=1111111111', ['null-phone']],
    ['?search=1234567', ['with-phone']],
    ['?search=', ['null-phone', 'missing-phone', 'empty-phone', 'with-phone']],
    ['', ['null-phone', 'missing-phone', 'empty-phone', 'with-phone']],
    ['?type=SUPPLIER&search=car', ['missing-phone', 'empty-phone']],
  ];
  for (const [query, expected] of cases) {
    const response = await fetch(base + query, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    assert.equal(response.status, 200, `${query}: ${JSON.stringify(body)}`);
    assert.equal(body.success, true);
    assert.deepEqual(body.customers.map((c: Customer) => c.id), expected, query);
  }
  assert.equal((await fetch(base + '?search=alfa')).status, 401);
  assert.equal((await fetch(base.replace('/api/customers', '/unresolved-tenant'))).status, 403,
    'Firma seçimi yoksa global/demo tenant kullanılamaz.');
  assert.equal(JSON.stringify(storage.getState().customers), before, 'Arama cari verisini değiştirmemeli.');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  for (const id of ['other-tenant', 'unowned']) {
    assert.equal((await fetch(`${base}/${id}`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/${id}/statement`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/${id}`, { method: 'PUT', headers, body: JSON.stringify({ title: 'Forbidden' }) })).status, 404);
  }
  assert.equal(JSON.stringify(storage.getState().customers), before, 'Yetkisiz değişiklik cari verisini değiştirmemeli.');
  const original = structuredClone(storage.getState().customers.find(c => c.id === 'null-phone')!);
  const update = await fetch(`${base}/null-phone`, { method: 'PUT', headers, body: JSON.stringify({ title: 'Updated', tenantId: 'tnt-other', id: 'moved', balance: 999, totalDebit: 999 }) });
  assert.equal(update.status, 200);
  const updated = (await update.json()).customer;
  assert.equal(updated.title, 'Updated');
  assert.equal(updated.id, original.id);
  assert.equal(updated.tenantId, tenantId);
  assert.equal(updated.balance, original.balance);
  assert.equal(updated.totalDebit, original.totalDebit);
  storage.update(db => {
    db.currentTransactions = [
      { id: 'owned', tenantId, customerId: original.id, date: '2026-10-01', debit: 10, credit: 0 },
      { id: 'foreign', tenantId: 'tnt-other', customerId: original.id, date: '2026-10-01', debit: 100, credit: 0 },
      { id: 'no-owner', customerId: original.id, date: '2026-10-01', debit: 100, credit: 0 },
    ] as any;
  });
  const statement = await fetch(`${base}/${original.id}/statement`, { headers });
  assert.equal(statement.status, 200);
  assert.deepEqual((await statement.json()).statement.map((t: { id: string }) => t.id), ['owned']);
  console.warn('customerSearchTest: null telefon, tenant izolasyonu, güncelleme alanları ve ekstre izolasyonu PASS.');
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}
