import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-account-')), 'database.json');
const { storage } = await import('../db/storage');
const { migrateMemberships } = await import('../security/memberships');
const { generateToken } = await import('../routes/auth');
const { default: usersRouter } = await import('../routes/users');
const { adminUsersRouter } = await import('../routes/admin-users');
const { invitationsRouter } = await import('../routes/invitations');
const { impersonationRouter } = await import('../routes/admin-impersonation');
storage.update(db => {
  const originalTenant = db.tenants[0];
  db.tenants = [{ ...originalTenant, id: 'account-company', status: 'ACTIVE', isArchived: false, maxUsers: 100, selectedServicePlanIds: undefined, erpSubscription: undefined }];
  db.users = ['platform', 'owner', 'target'].map(id => ({ id, username: id, fullName: id, email: `${id}@example.test`, passwordHash: bcrypt.hashSync('OriginalPassword123', 4), active: true, role: id === 'platform' ? 'SUPER_ADMIN' : id === 'owner' ? 'COMPANY_ADMIN' : 'PERSONEL', companyId: 'account-company', allowedCompanyIds: ['account-company'], createdAt: new Date().toISOString() }));
  db.tenantUsers = [];
  migrateMemberships(db);
});
const tokens = Object.fromEntries(storage.getState().users.map(user => [user.id, generateToken(user, 'account-company')]));
const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/admin', impersonationRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
let checks = 0;
async function reject(method: string, route: string, body: unknown, status: number, actor = 'platform') {
  const before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  assert.equal(result.token, undefined);
  assert.equal(result.resetLink, undefined);
  assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before, 'Rejected legacy operation changed primary data');
  checks++;
}
try {
  await reject('POST', '/api/admin/users/target/reset-password', {}, 401, '');
  await reject('POST', '/api/admin/users/target/reset-password', {}, 403, 'owner');
  await reject('POST', '/api/admin/users/target/reset-password', {}, 410);
  await reject('POST', '/api/admin/users/target/reset-password', { newPassword: 'Anything123456' }, 410);
  await reject('PUT', '/api/users/target', { email: 'changed@example.test' }, 403, 'owner');
  await reject('PUT', '/api/users/target', { fullName: 'Changed', password: 'Anything123456' }, 409);
  for (const field of ['fullName', 'email', 'phone', 'password', 'newPassword', 'passwordHash']) {
    await reject('PUT', '/api/admin/users/target', { [field]: field === 'email' ? 'changed@example.test' : 'Changed' }, 409);
  }
  const account = { username: 'new-user', fullName: 'New User', email: 'new-user@example.test', companyId: 'account-company', role: 'PERSONEL' };
  for (const password of [undefined, '123', 'ElevenChars', 'a'.repeat(73), 'ş'.repeat(37)]) {
    await reject('POST', '/api/users', { ...account, password }, 400);
    await reject('POST', '/api/admin/users', { ...account, password }, 400);
  }
  await reject('POST', '/api/admin/users', { ...account, password: 'StrongPassword123', sendResetLink: true }, 400);
  const password = '  Preserve Spaces  ';
  const response = await fetch(base + '/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.platform}` }, body: JSON.stringify({ ...account, password }) });
  assert.equal(response.status, 200);
  const created = storage.getState().users.find(user => user.username === account.username)!;
  assert(created);
  assert(bcrypt.compareSync(password, created.passwordHash));
  assert(!bcrypt.compareSync(password.trim(), created.passwordHash));
  // Isolated credential-overlay contract: the mobile path must use the same effective hash/version.
  const { userAccounts } = await import('../services/userAccounts');
  const { default: mobileRouter } = await import('../routes/v1/mobile');
  app.use('/api/v1/mobile', mobileRouter);
  const originalUsers = userAccounts.effectiveUsers.bind(userAccounts);
  const originalVersion = userAccounts.credentialVersion.bind(userAccounts);
  const originalTransaction = storage.runTransaction.bind(storage);
  let version = 'changed-version';
  let ambiguousAlias = false;
  const changedPassword = 'ChangedMobilePassword123';
  const changedHash = bcrypt.hashSync(changedPassword, 4);
  userAccounts.effectiveUsers = () => {
    const users = originalUsers().map(user => user.id === 'target' ? { ...user, passwordHash: changedHash, credentialVersion: version } : user);
    if (ambiguousAlias) users.push({ ...users.find(user => user.id === 'target')!, id: 'ambiguous-alias' });
    return users;
  };
  userAccounts.credentialVersion = (id: string) => id === 'target' ? version : originalVersion(id);
  try {
    const login = (value: string, deviceId: string) => fetch(base + '/api/v1/mobile/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'target@example.test', password: value, deviceId }) });
    const before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    assert.equal((await login('OriginalPassword123', 'old-password')).status, 401);
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before);
    const accepted = await login(changedPassword, 'current-password');
    assert.equal(accepted.status, 200);
    const acceptedData = await accepted.json();
    assert.equal((jwt.verify(acceptedData.token, process.env.JWT_SECRET!) as jwt.JwtPayload).credentialVersion, version);
    ambiguousAlias = true;
    const beforeAmbiguous = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    assert.equal((await login(changedPassword, 'ambiguous-alias')).status, 401);
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), beforeAmbiguous);
    ambiguousAlias = false;
    storage.runTransaction = async action => {
      const result = await originalTransaction(action);
      version = 'reset-during-device-registration';
      return result;
    };
    assert.equal((await login(changedPassword, 'concurrent-reset')).status, 401, 'Old password proof acquired the latest credential version');
  } finally {
    userAccounts.effectiveUsers = originalUsers;
    userAccounts.credentialVersion = originalVersion;
    storage.runTransaction = originalTransaction;
  }
  const updatedPassword = 'UpdatedInvitationPassword123';
  await userAccounts.setPassword('platform', 'account-company', 'target', { actingPassword: 'OriginalPassword123', expectedRevision: '', requestId: randomUUID(), newPassword: updatedPassword, confirmPassword: updatedPassword });
  function invitation() {
    const token = randomBytes(32).toString('hex');
    storage.update(db => {
      db.invitations ||= [];
      db.invitations.push({ id: randomUUID(), tenantId: 'account-company', tenantName: 'Test', email: 'target@example.test', roleSlug: 'employee', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60_000).toISOString(), createdBy: 'platform', createdAt: new Date().toISOString() });
    });
    return token;
  }
  const invitationToken = invitation();
  await reject('POST', '/api/invitations/accept', { token: invitationToken, password: 'OriginalPassword123' }, 400, '');
  const acceptedInvite = await fetch(base + '/api/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: invitationToken, password: updatedPassword }) });
  assert.equal(acceptedInvite.status, 200);
  const invitedData = await acceptedInvite.json();
  assert.equal((jwt.verify(invitedData.token, process.env.JWT_SECRET!) as jwt.JwtPayload).credentialVersion, userAccounts.credentialVersion('target'));
  const racingInvite = invitation();
  storage.runTransaction = async action => {
    const result = await originalTransaction(action);
    const target = userAccounts.effectiveUsers().find(user => user.id === 'target')!;
    await userAccounts.setPassword('platform', 'account-company', 'target', { actingPassword: 'OriginalPassword123', expectedRevision: target.accountRevision, requestId: randomUUID(), newPassword: 'ResetDuringInvitation123', confirmPassword: 'ResetDuringInvitation123' });
    return result;
  };
  try {
    const raced = await fetch(base + '/api/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: racingInvite, password: updatedPassword }) });
    assert.equal(raced.status, 400);
    assert.equal((await raced.json()).token, undefined);
  } finally { storage.runTransaction = originalTransaction; }
  const currentTarget = userAccounts.effectiveUsers().find(user => user.id === 'target')!;
  await userAccounts.updateProfile('platform', 'account-company', 'target', { actingPassword: 'OriginalPassword123', expectedRevision: currentTarget.accountRevision, requestId: randomUUID(), fullName: currentTarget.fullName, email: 'effective-target@example.test', phone: '', department: '', branch: '' });
  for (const route of ['/api/users', '/api/admin/users']) {
    await reject('POST', route, { ...account, username: 'alias-conflict', email: 'effective-target@example.test', password: 'StrongPassword123' }, 400);
    await reject('POST', route, { ...account, username: 'effective-target@example.test', email: 'unique-alias@example.test', password: 'StrongPassword123' }, 400);
  }
  for (const route of ['/api/admin/users?search=effective-target', '/api/admin/users/target', '/api/admin/users?companyId=account-company']) {
    const response = await fetch(base + route, { headers: { Authorization: `Bearer ${tokens.platform}` } });
    assert.equal(response.status, 200);
    const data = await response.json();
    const user = data.user || data.users.find((entry: { id: string }) => entry.id === 'target');
    assert.equal(user.email, 'effective-target@example.test');
    assert(!JSON.stringify(data).includes('passwordHash'));
    assert(!JSON.stringify(data).includes('credentialVersion'));
    assert(!JSON.stringify(data).includes('accountRevision'));
  }
  await userAccounts.setPassword('platform', 'account-company', 'platform', { actingPassword: 'OriginalPassword123', expectedRevision: '', requestId: randomUUID(), newPassword: 'UpdatedPlatformPassword123', confirmPassword: 'UpdatedPlatformPassword123' });
  const platformUser = userAccounts.effectiveUsers().find(user => user.id === 'platform')!;
  tokens.platform = generateToken(platformUser, 'account-company');
  for (const [route, body] of [['/api/admin/impersonate', { targetTenantId: 'account-company', reason: 'Credential boundary test' }], ['/api/admin/impersonate/stop', {}]] as const) {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.platform}` }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal((jwt.verify(data.token, process.env.JWT_SECRET!) as jwt.JwtPayload).credentialVersion, platformUser.credentialVersion);
  }
  console.log(`Legacy account boundaries: ${checks} rejected HTTP checks preserve primary data; strong password spaces and mobile credential/version proof PASS.`);
} finally { server.close(); }
