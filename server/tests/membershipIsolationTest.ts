import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-membership-')), 'test.json');
const { storage } = await import('../db/storage');
const { authRouter, generateToken } = await import('../routes/auth');
const { default: usersRouter } = await import('../routes/users');
const { rolesRouter } = await import('../routes/roles');
const { companiesRouter } = await import('../routes/companies');
const { tenantsRouter } = await import('../routes/tenants');
const { adminUsersRouter } = await import('../routes/admin-users');
const { requireAuth, requirePermission, PERMISSIONS } = await import('../middleware/authGuards');
const { migrateMemberships, membershipFor } = await import('../security/memberships');
const { moduleGate } = await import('../middleware/moduleGate');

storage.update(db => {
  const template = db.tenants[0];
  db.tenants = ['a', 'b', 'c'].map(id => ({ ...template, id, name: id, erpSubscription: { startDate: '2020-01-01', endDate: '2099-12-31', expiryPolicy: 'READ_ONLY', updatedAt: '' }, status: 'ACTIVE', isArchived: false, maxUsers: 50 }));
  const now = new Date().toISOString();
  db.users = ['admin', 'manager', 'shared', 'legacy'].map(id => ({ id, username: id, fullName: id, email: `${id}@example.test`,
    role: id === 'admin' ? 'SUPER_ADMIN' : 'COMPANY_ADMIN', active: true, companyId: 'a', allowedCompanyIds: ['a'], passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now }));
  db.tenantUsers = [];
  migrateMemberships(db);
  const sharedA = membershipFor(db, 'shared', 'a')!;
  db.tenantUsers.push({ ...sharedA, id: 'shared-b', tenantId: 'b', roleSlug: 'accountant', roleIds: ['role-accountant', 'role-viewer'] });
  db.roles!.push({ id: 'b-role', tenantId: 'b', slug: 'same-slug', name: 'B role', isSystem: false, permissions: ['invoices.create'], description: '', createdAt: now, updatedAt: now });
  db.roles!.push({ id: 'a-role', tenantId: 'a', slug: 'same-slug', name: 'A role', isSystem: false, permissions: ['products.view'], description: '', createdAt: now, updatedAt: now });
});
const token = (user: string, tenant: string) => generateToken(storage.getState().users.find(u => u.id === user)!, tenant);
const sharedA = token('shared', 'a'), sharedB = token('shared', 'b'), admin = token('admin', 'a'), manager = token('manager', 'a');
const app = express(); app.use(express.json());
app.use('/auth', authRouter); app.use('/users', usersRouter); app.use('/roles', rolesRouter);
app.use('/companies', companiesRouter); app.use('/tenants', requireAuth, tenantsRouter);
app.use('/admin/users', adminUsersRouter);
app.get('/identity', requireAuth, (req, res) => res.json(req.user));
app.post('/write', requireAuth, requirePermission(PERMISSIONS.INVOICES_CREATE), (_req, res) => res.json({ success: true }));
app.post('/accounting', requireAuth, moduleGate('muhasebe'), (_req, res) => res.json({ success: true }));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
let checks = 0;
async function call(url: string, bearer: string, method = 'GET', body?: unknown, status = 200) {
  const response = await fetch(base + url, { method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json();
  assert.equal(response.status, status, `${method} ${url}: ${JSON.stringify(json)}`); checks++;
  return json;
}
try {
  assert.equal((await call('/identity', sharedA)).role, 'COMPANY_ADMIN');
  const b = await call('/identity', sharedB); assert.equal(b.role, 'MUHASEBE'); assert.equal(b.roleSlugs.length, 2);
  const bUsers = await call('/admin/users?companyId=b', admin);
  assert.equal(bUsers.users.find((u: any) => u.id === 'shared').role, 'MUHASEBE');
  assert.equal(b.passwordHash, undefined); assert.equal(b.companyId, 'b');
  await call('/users', sharedB, 'GET', undefined, 403);
  await call('/write', sharedB, 'POST', {});
  await call('/accounting', sharedB, 'POST', {}); // viewer + accountant is additive, not read-only
  const globalTenant = storage.getState().activeTenantId;
  const switched = await call('/auth/switch-company', sharedA, 'POST', { targetTenantId: 'b' });
  assert.equal(switched.user.role, 'MUHASEBE');
  assert.equal((await call('/auth/me', switched.token)).activeTenant.id, 'b');
  assert.equal((await call('/auth/me', sharedA)).activeTenant.id, 'a');
  assert.equal(storage.getState().activeTenantId, globalTenant);
  await call('/auth/switch-company', sharedB, 'POST', { targetTenantId: 'c' }, 403);
  await call('/companies/c/switch', sharedB, 'POST', {}, 403);
  const alias = await call('/companies/b/switch', sharedA, 'POST', {}); assert.ok(alias.token);
  const platformAlias = await call('/tenants/b/switch', admin, 'POST', {}); assert.ok(platformAlias.token);
  assert.equal(storage.getState().activeTenantId, globalTenant);
  await call('/companies/b', manager, 'GET', undefined, 403);
  const details = await call('/companies/a', manager); assert.ok(details.details.users.every((u: any) => !('passwordHash' in u)));
  await call('/roles/b-role', manager, 'PUT', { name: 'Attack' }, 400);
  assert.equal(storage.getState().roles!.find(r => r.id === 'b-role')!.name, 'B role');
  await call('/users/shared/memberships/b', manager, 'PUT', { roleIds: ['role-company-admin'], status: 'active' }, 403);
  await call('/users/shared/memberships/a', manager, 'PUT', { roleIds: ['role-platform-admin'], status: 'active' }, 400);
  await call('/users/shared/memberships/a', manager, 'PUT', { roleIds: ['b-role'], status: 'active' }, 400);
  await call('/users/shared/memberships/b', admin, 'PUT', { roleIds: ['role-viewer'], status: 'passive' });
  await call('/identity', sharedB, 'GET', undefined, 403);
  await call('/identity', sharedA);
  await call('/users/shared/memberships/b', admin, 'PUT', { roleIds: ['role-viewer'], status: 'active' });
  await call('/write', sharedB, 'POST', {}, 403); // existing JWT picks up role removal immediately
  await call('/users/shared/memberships/b', admin, 'DELETE');
  await call('/identity', sharedB, 'GET', undefined, 403);
  storage.update(migrateMemberships);
  await call('/identity', sharedB, 'GET', undefined, 403); // migration cannot resurrect removal
  await call('/identity', sharedA);
  await call('/users/shared/memberships/b', admin, 'PUT', { roleIds: ['b-role'], status: 'active' });
  const custom = await call('/identity', sharedB); assert.deepEqual(custom.permissionCodes, ['invoices.create']);
  await call('/write', sharedB, 'POST', {});
  await call('/users/manager/memberships/a', manager, 'PUT', { roleIds: ['role-viewer'], status: 'active' }, 400);
  const list = await call('/users/shared/memberships', manager); assert.deepEqual(list.companies.map((c: any) => c.id), ['a']);
  await call('/users/shared', manager, 'PUT', { role: 'SUPER_ADMIN' }, 403);
  await call('/admin/users/shared', manager, 'PUT', { role: 'SUPER_ADMIN' }, 403);
  await call('/users/shared', admin, 'PUT', { fullName: 'Updated name', department: 'Finance', branch: 'Central', role: 'SUPER_ADMIN' });
  assert.equal(storage.getState().users.find(u => u.id === 'shared')!.role, 'COMPANY_ADMIN');
  assert.equal(storage.getState().users.find(u => u.id === 'shared')!.department, 'Finance');
  const login = await call('/auth/login', '', 'POST', { username: 'shared', password: 'TestPassword123!' });
  assert.equal(login.user.role, 'COMPANY_ADMIN');
  storage.update(db => { membershipFor(db, 'shared', 'a')!.status = 'passive'; });
  const loginB = await call('/auth/login', '', 'POST', { username: 'shared', password: 'TestPassword123!' });
  assert.equal(loginB.activeTenant.id, 'b');
  const invalidTenantToken = token('legacy', 'c'); await call('/identity', invalidTenantToken, 'GET', undefined, 403);
  storage.update(db => { membershipFor(db, 'legacy', 'a')!.roleIds = []; });
  await call('/identity', token('legacy', 'a'), 'GET', undefined, 403);
  storage.update(db => { db.tenants.find(t => t.id === 'b')!.status = 'SUSPENDED'; });
  await call('/identity', sharedB, 'GET', undefined, 403);
  const { canAccessMembershipModule, getMembershipSidebar } = await import('../../src/utils/modulePermissions');
  assert.ok(canAccessMembershipModule(['MUHASEBE', 'PERSONEL'], [], 'muhasebe'));
  assert.ok(!canAccessMembershipModule(['MUHASEBE', 'PERSONEL'], [], 'platform-admin'));
  assert.ok(canAccessMembershipModule([], ['products.view'], 'stok'));
  assert.ok(getMembershipSidebar(['MUHASEBE', 'PERSONEL']).flatMap(g => g.moduleIds).includes('muhasebe'));
  console.log(`Membership isolation: ${checks} HTTP checks PASS`);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
