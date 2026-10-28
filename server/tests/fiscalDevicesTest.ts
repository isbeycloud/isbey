import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bey360-fiscal-')), 'database.json');
const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { migrateMemberships } = await import('../security/memberships');
const { fiscalDevicesRouter } = await import('../routes/v1/fiscal-devices');
const { default: posRouter } = await import('../routes/v1/pos');
const { MockPosProvider } = await import('../services/pos/mockPosProvider');
const { defaultDeny } = await import('../middleware/securityGate');
const { fiscalAdapterCatalog, createFiscalAdapterRegistry } = await import('../../packages/fiscal-device-kit/src/index');
storage.update(db => {
  db.tenants = ['a', 'b'].map(id => ({ ...structuredClone(db.tenants[0]), id, status: 'ACTIVE', isArchived: false, selectedServicePlanIds: undefined, erpSubscription: undefined }));
  db.users = ['admin', 'owner', 'owner-b', 'employee'].map(id => ({ id, username: id, fullName: id, email: `${id}@example.test`, passwordHash: '', active: true,
    role: id === 'admin' ? 'SUPER_ADMIN' : id === 'employee' ? 'PERSONEL' : 'COMPANY_ADMIN', companyId: id === 'owner-b' ? 'b' : 'a', allowedCompanyIds: [id === 'owner-b' ? 'b' : 'a'], createdAt: new Date().toISOString() }));
  db.tenantUsers = []; migrateMemberships(db); db.fiscalDevices = [];
});
await storage.runTransaction(() => {});
const tokens = Object.fromEntries(storage.getState().users.map(user => [user.id, generateToken(user, user.companyId)]));
const financialKeys = ['tenants', 'subscriptions', 'invoices', 'products', 'customers', 'currentTransactions', 'stockMovements', 'payments', 'creditTransactions', 'posTransactions', 'cashTransactions', 'bankTransactions'] as const;
const financialBefore = Object.fromEntries(financialKeys.map(key => [key, JSON.stringify((storage.getState() as any)[key])]));
const app = express(); app.use(express.json({ strict: false })); app.use('/api', defaultDeny);
app.use('/api/v1/fiscal-devices', fiscalDevicesRouter); app.use('/devices', fiscalDevicesRouter); app.use('/pos', posRouter);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
let checks = 0;
async function call(method: string, route: string, user = 'owner', body?: unknown, expected = 200) {
  const before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`); checks++;
  if (expected >= 400 || method === 'GET') assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before, 'Reddedilen/okuma isteği diskte değişiklik yaptı');
  return data;
}
const input = { name: 'Ön kasa', adapterId: 'beko-tokenx-wire', model: '300TR', serialNumber: 'TEST-DEVICE-01', branchLabel: 'Test mağaza', workstationName: 'KASA-01', transport: 'USB', connectionHint: 'USB1' };
try {
  await call('GET', '/devices', '', undefined, 401); await call('GET', '/devices', 'employee', undefined, 403);
  await call('POST', '/devices', 'employee', input, 403);
  const list = await call('GET', '/devices'); assert.equal(list.adapters.length, 7); assert.equal(list.collectionAvailable, false);
  for (const invalid of [null, [], { ...input, tenantId: 'b' }, { ...input, status: 'ACTIVE' }, { ...input, connected: true }, { ...input, password: 'forbidden' },
    { ...input, adapterId: 'unknown' }, { ...input, transport: 'TCP_IP' }, { ...input, serialNumber: '' }, { ...input, name: 'x'.repeat(101) },
    { ...input, model: 'bad\nname' }, { ...input, connectionHint: 'https://localhost' }, { ...input, host: '192.168.1.5', port: 1234 },
    { ...input, adapterId: 'hugin-pending', transport: 'TCP_IP', host: '169.254.169.254', port: 80 },
    { ...input, adapterId: 'hugin-pending', transport: 'TCP_IP', host: '127.0.0.1', port: 80 },
    { ...input, adapterId: 'hugin-pending', transport: 'TCP_IP', host: '192.168.1.5', port: 0 }]) await call('POST', '/devices', 'owner', invalid, 400);
  let device = (await call('POST', '/devices', 'owner', input, 201)).device;
  assert.equal(device.tenantId, 'a'); assert.equal(device.status, 'DRAFT');
  await call('POST', '/devices', 'owner', input, 409);
  assert.equal((await call('GET', '/devices', 'owner-b')).devices.length, 0);
  await call('PUT', '/devices/' + device.id, 'owner-b', { ...input, expectedRevision: device.revision }, 404);
  await call('GET', '/devices/' + device.id + '/readiness', 'owner-b', undefined, 404);
  await call('DELETE', '/devices/' + device.id, 'owner-b', { expectedRevision: device.revision }, 404);
  await call('PUT', '/devices/' + device.id, 'owner', { ...input, name: 'Değişmiş' }, 409);
  const stale = device.revision;
  device = (await call('PUT', '/devices/' + device.id, 'owner', { ...input, name: 'Kasa 2', expectedRevision: stale })).device;
  await call('PUT', '/devices/' + device.id, 'owner', { ...input, expectedRevision: stale }, 409);
  const readiness = (await call('GET', '/devices/' + device.id + '/readiness')).readiness;
  assert.equal(readiness.connected, false); assert.equal(readiness.hardwareContacted, false); assert.equal(readiness.collectionAvailable, false);
  await call('DELETE', '/devices/' + device.id, 'owner', { expectedRevision: stale }, 409);
  await call('DELETE', '/devices/' + device.id, 'owner', { expectedRevision: device.revision });
  assert.equal((await call('GET', '/devices')).devices[0].status, 'DISABLED');
  const disk = JSON.parse(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8')); assert.equal(disk.fiscalDevices[0].status, 'DISABLED');
  for (const mode of ['test', 'production', 'staging', 'development']) {
    process.env.NODE_ENV = mode;
    await call('POST', '/pos/charge', 'owner', { amount: 1, companyId: 'b', cardNumber: 'fake' }, 503);
    await call('POST', '/pos/charge', '', {}, 401); await call('POST', '/pos/charge', 'employee', {}, 403);
    if (mode !== 'test') {
      const mock = new MockPosProvider();
      await assert.rejects(mock.createPayment({} as never)); await assert.rejects(mock.checkPayment('test'));
      await assert.rejects(mock.refundPayment('test', 1)); await assert.rejects(mock.cancelPayment('test'));
    }
  }
  for (const manifest of fiscalAdapterCatalog()) {
    const adapter = createFiscalAdapterRegistry().get(manifest.id);
    assert.equal((await adapter.inspect(device)).state, 'UNVERIFIED');
    await assert.rejects(adapter.collect({} as never), { code: 'FISCAL_DEVICE_NOT_READY' });
    await assert.rejects(adapter.query('test'), { code: 'FISCAL_DEVICE_NOT_READY' });
    await assert.rejects(adapter.cancel('test'), { code: 'FISCAL_DEVICE_NOT_READY' });
  }
  assert.throws(() => createFiscalAdapterRegistry().get('unknown'), { code: 'FISCAL_DEVICE_NOT_READY' });
  process.env.NODE_ENV = 'test';
  // Gerçek kaynak yolu menü ve hizmet kısıtlarına da tabi olmalıdır.
  const originalMembership = structuredClone(storage.getState().tenantUsers.find(m => m.userId === 'owner'))!;
  const ownerTenant = storage.getState().tenants.find(t => t.id === 'a')!;
  storage.update(db => {
    const membership = db.tenantUsers.find(m => m.userId === 'owner')!;
    membership.allowedMenuIds = ['cari'];
  });
  assert.equal((await call('GET', '/api/v1/fiscal-devices', 'owner', undefined, 403)).code, 'MENU_ACCESS_DENIED');
  storage.update(db => {
    Object.assign(db.tenantUsers.find(m => m.userId === 'owner')!, originalMembership);
    const tenant = db.tenants.find(t => t.id === 'a')!;
    tenant.selectedServicePlanIds = ['fiscal-no-pos'];
    db.subscriptionPlans!.push({ ...db.subscriptionPlans![0], id: 'fiscal-no-pos', status: 'ACTIVE', activeModules: ['CARI'] });
  });
  assert.equal((await call('GET', '/api/v1/fiscal-devices', 'owner', undefined, 403)).code, 'SERVICE_ACCESS_DENIED');
  storage.update(db => { db.tenants[0] = ownerTenant; db.subscriptionPlans = db.subscriptionPlans!.filter(p => p.id !== 'fiscal-no-pos'); });
  for (const key of financialKeys) assert.equal(JSON.stringify((storage.getState() as any)[key]), financialBefore[key], `${key} changed`);
  console.info(`Fiscal device kit: ${checks} HTTP checks; adapter gates, IDOR, concurrency, persistence and financial immutability PASS.`);
} finally { process.env.NODE_ENV = 'test'; await new Promise<void>(resolve => server.close(() => resolve())); }
