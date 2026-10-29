import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { spawn } from 'node:child_process';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.PUBLIC_APP_URL = 'https://accounts.example.test';
// This suite never opens a real SMTP connection, even on a configured workstation.
for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'])
    delete process.env[key];
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'accounts-test-')), 'db.json');
const { storage } = await import('../db/storage');
const { migrateMemberships } = await import('../security/memberships');
const { generateToken, authRouter } = await import('../routes/auth');
const { UserAccountsStore } = await import('../services/userAccounts');
const { userAccountsRouter, accountPasswordResetRouter } = await import('../routes/userAccounts');
const password = 'InitialPassword-123';
storage.update(db => {
    db.tenants = ['a', 'b'].map(id => ({ ...structuredClone(db.tenants[0]), id, status: 'ACTIVE', isArchived: false, selectedServicePlanIds: undefined, erpSubscription: undefined }));
    db.users = ['owner', 'employee', 'shared', 'other', 'platform', 'viewer'].map(id => ({ id, username: id, fullName: id, email: `${id}@example.test`, phone: '', department: '', branch: '', passwordHash: bcrypt.hashSync(password, 4), active: true, role: id === 'platform' ? 'SUPER_ADMIN' : id === 'owner' ? 'COMPANY_ADMIN' : id === 'viewer' ? 'RAPOR' : 'PERSONEL', companyId: id === 'other' ? 'b' : 'a', allowedCompanyIds: id === 'shared' ? ['a', 'b'] : [id === 'other' ? 'b' : 'a'], createdAt: new Date().toISOString() }));
    db.tenantUsers = [];
    migrateMemberships(db);
    db.sessions = [{ id: 'legacy-session', userId: 'employee', username: 'employee', companyId: 'a', device: 'test', browser: 'test', ipAddress: '127.0.0.1', lastActiveAt: new Date().toISOString(), isRevoked: false, createdAt: new Date().toISOString() }];
});
await storage.runTransaction(() => {
});
const tokens = Object.fromEntries(storage.getState().users.map(u => [u.id, generateToken(u, u.companyId!)]));
const app = express();
app.use(express.json({ strict: false }));
app.use('/api/user-accounts', userAccountsRouter);
app.use('/api/account-password-reset', accountPasswordResetRouter);
app.use('/api/auth', authRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
let before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
let checks = 0;
async function call(method: string, route: string, body?: unknown, status = 200, user = 'owner', financial = true) {
    const side = process.env.DATABASE_PATH! + '.user-accounts.json';
    const prev = fs.existsSync(side) ? fs.readFileSync(side, 'utf8') : null;
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json();
    assert.equal(res.status, status, JSON.stringify(data));
    checks++;
    if (financial)
        assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before, 'Identity operation wrote financial DB');
    else
        before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    if (status >= 400 && status !== 503)
        assert.equal(fs.existsSync(side) ? fs.readFileSync(side, 'utf8') : null, prev);
    assert(!JSON.stringify(data).includes('passwordHash'));
    return data;
}
const mutation = () => ({ expectedRevision: '', actingPassword: password, requestId: randomUUID() });
try {
    await call('GET', '/api/user-accounts', undefined, 401, '');
    await call('GET', '/api/user-accounts', undefined, 403, 'viewer');
    const list = await call('GET', '/api/user-accounts');
    assert(!list.users.some((u: {
        id: string;
    }) => u.id === 'other'));
    assert.equal(list.users.find((u: {
        id: string;
    }) => u.id === 'shared').canEdit, false);
    const me = await call('GET', '/api/user-accounts/me', undefined, 200, 'viewer');
    assert.equal(me.user.id, 'viewer');
    await call('PUT', '/api/user-accounts/shared/profile', { ...mutation(), fullName: 'Changed', email: 'shared@example.test', phone: '', department: '', branch: '' }, 403);
    await call('PUT', '/api/user-accounts/other/profile', { ...mutation(), fullName: 'Changed', email: 'other@example.test', phone: '', department: '', branch: '' }, 404);
    const profile = { ...mutation(), fullName: 'Personel Yeni', email: 'employee-new@example.test', phone: '+90 555 111 22 33', department: 'Muhasebe', branch: 'Merkez' };
    await call('PUT', '/api/user-accounts/employee/profile', { ...profile, actingPassword: 'wrong' }, 401);
    await call('PUT', '/api/user-accounts/employee/profile', { ...profile, role: 'SUPER_ADMIN' }, 400);
    const saved = await call('PUT', '/api/user-accounts/employee/profile', profile);
    assert.equal(saved.user.email, profile.email);
    await call('PUT', '/api/user-accounts/employee/profile', { ...profile, email: 'other@example.test', expectedRevision: saved.user.revision, requestId: randomUUID() }, 409);
    assert.equal((await call('PUT', '/api/user-accounts/employee/profile', profile)).user.revision, saved.user.revision);
    await call('PUT', '/api/user-accounts/employee/profile', { ...profile, requestId: randomUUID(), expectedRevision: '' }, 409);
    await call('GET', '/api/user-accounts/me', undefined, 401, 'employee');
    tokens.legacySession = 'session_legacy-session';
    await call('GET', '/api/user-accounts/me', undefined, 401, 'legacySession');
    const store = new UserAccountsStore(process.env.DATABASE_PATH!);
    const effective = store.effectiveUsers().find(u => u.id === 'employee')!;
    tokens.employee = generateToken(effective, 'a');
    assert.equal((await call('GET', '/api/user-accounts/me', undefined, 200, 'employee')).user.email, profile.email);
    const passInput = { ...mutation(), expectedRevision: saved.user.revision, newPassword: 'StrongNewPassword-456', confirmPassword: 'StrongNewPassword-456' };
    for (const bad of [{ ...passInput, newPassword: 'short', confirmPassword: 'short' }, { ...passInput, newPassword: 'é'.repeat(40), confirmPassword: 'é'.repeat(40) }, { ...passInput, confirmPassword: 'mismatch' }])
        await call('POST', '/api/user-accounts/employee/password', bad, 400);
    await call('POST', '/api/user-accounts/employee/password', passInput);
    await call('GET', '/api/user-accounts/me', undefined, 401, 'employee');
    const changed = store.effectiveUsers().find(u => u.id === 'employee')!;
    assert(bcrypt.compareSync(passInput.newPassword, changed.passwordHash));
    assert(!bcrypt.compareSync(password, changed.passwordHash));
    const snapshot = store.list('owner', 'a');
    assert(!JSON.stringify(snapshot).includes('credentialVersion'));
    assert(!JSON.stringify(snapshot).includes('passwordHash'));
    tokens.legacy = generateToken(storage.getState().users.find(u => u.id === 'employee')!, 'a');
    await call('GET', '/api/user-accounts/me', undefined, 401, 'legacy');
    const noSmtp = await call('GET', '/api/user-accounts/me');
    assert.equal(noSmtp.mailReadiness.ready, false);
    const latest = store.me('employee', 'a').user;
    await call('POST', '/api/user-accounts/employee/password-email', { ...mutation(), expectedRevision: latest.revision }, 503);
    await call('POST', '/api/user-accounts/employee/password-email', { ...mutation(), expectedRevision: latest.revision, to: 'attacker@example.test' }, 400);
    let now = Date.now();
    const messages: {
        to: string;
        subject: string;
        text: string;
    }[] = [];
    const mailStore = new UserAccountsStore(process.env.DATABASE_PATH!, { now: () => new Date(now), deliver: async (message) => {
            messages.push(message);
            return { accepted: [message.to], rejected: [] };
        } });
    const emailBody = { ...mutation(), expectedRevision: latest.revision };
    const sent = await mailStore.sendPasswordEmail('owner', 'a', 'employee', emailBody);
    assert.equal(sent.mail.status, 'SENT');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, profile.email);
    assert.equal((await mailStore.sendPasswordEmail('owner', 'a', 'employee', emailBody)).mail.status, 'SENT');
    assert.equal(messages.length, 1);
    const extract = (index: number) => {
        const link = messages[index].text.split('\n').find(line => line.startsWith('https://'))!;
        const url = new URL(link);
        assert.equal(url.pathname, '/reset-password');
        assert.equal(url.search, '');
        return new URLSearchParams(url.hash.slice(1)).get('token')!;
    };
    const oldToken = extract(0);
    assert(!fs.readFileSync(process.env.DATABASE_PATH! + '.user-accounts.json', 'utf8').includes(oldToken));
    await mailStore.sendPasswordEmail('owner', 'a', 'employee', { ...emailBody, requestId: randomUUID() });
    const resetToken = extract(1);
    const resetPassword = 'ResetNewPassword-789';
    const invalid = await call('POST', '/api/account-password-reset', { token: oldToken, newPassword: resetPassword, confirmPassword: resetPassword }, 400, '');
    await call('POST', '/api/account-password-reset', { token: resetToken, newPassword: resetPassword, confirmPassword: resetPassword }, 200, '');
    const used = await call('POST', '/api/account-password-reset', { token: resetToken, newPassword: resetPassword, confirmPassword: resetPassword }, 400, '');
    assert.equal(used.message, invalid.message);
    assert(!JSON.stringify(store.me('owner', 'a')).includes('credentialVersion'));
    const resetUser = store.effectiveUsers().find(u => u.id === 'employee')!;
    assert(bcrypt.compareSync(resetPassword, resetUser.passwordHash));
    const expiredBody = { ...mutation(), expectedRevision: store.me('employee', 'a').user.revision };
    await mailStore.sendPasswordEmail('owner', 'a', 'employee', expiredBody);
    const expiredToken = extract(2);
    now += 31 * 60000;
    await assert.rejects(mailStore.resetPassword({ token: expiredToken, newPassword: resetPassword, confirmPassword: resetPassword }), { status: 400, message: invalid.message });
    now = Date.now();
    let rejected = 0;
    const failStore = new UserAccountsStore(process.env.DATABASE_PATH!, { deliver: async () => {
            rejected++;
            return { accepted: [], rejected: [profile.email] };
        } });
    const failedBody = { ...mutation(), expectedRevision: store.me('employee', 'a').user.revision };
    assert.equal((await failStore.sendPasswordEmail('owner', 'a', 'employee', failedBody)).mail.status, 'FAILED');
    await failStore.sendPasswordEmail('owner', 'a', 'employee', failedBody);
    assert.equal(rejected, 1);
    let unknown = 0;
    const uncertain = new UserAccountsStore(process.env.DATABASE_PATH!, { deliver: async () => {
            unknown++;
            throw new Error('sensitive smtp diagnostic must not persist');
        } });
    const unknownBody = { ...mutation(), expectedRevision: store.me('employee', 'a').user.revision };
    assert.equal((await uncertain.sendPasswordEmail('owner', 'a', 'employee', unknownBody)).mail.status, 'UNKNOWN');
    await uncertain.sendPasswordEmail('owner', 'a', 'employee', unknownBody);
    assert.equal(unknown, 1);
    const disk = fs.readFileSync(process.env.DATABASE_PATH! + '.user-accounts.json', 'utf8');
    for (const secret of [oldToken, resetToken, expiredToken, password, passInput.newPassword, resetPassword, 'sensitive smtp diagnostic'])
        assert(!disk.includes(secret));
    assert(!disk.includes('https://'));
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before);
    await call('POST', '/api/auth/login', { email: profile.email, password: password }, 401, '', false);
    await call('POST', '/api/auth/login', { email: 'employee@example.test', password: resetPassword }, 401, '', false);
    const login = await call('POST', '/api/auth/login', { email: profile.email, password: resetPassword }, 200, '', false);
    assert.equal(login.user.email, profile.email);
    assert.equal(login.user.fullName, profile.fullName);
    tokens.employee = login.token;
    await call('GET', '/api/user-accounts/me', undefined, 200, 'employee');
    const sideFile = process.env.DATABASE_PATH! + '.user-accounts.json';
    const count = JSON.parse(fs.readFileSync(sideFile, 'utf8')).audit.length;
    async function worker(label: string) {
        return new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, ['--import', 'tsx', 'server/tests/userAccountsWorker.ts', process.env.DATABASE_PATH!, label], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
            let output = '';
            child.stdout.on('data', d => output += d);
            child.stderr.on('data', d => output += d);
            child.on('error', reject);
            child.on('exit', code => code === 0 ? resolve() : reject(new Error(output)));
        });
    }
    await Promise.all([worker('one'), worker('two')]);
    assert.equal(JSON.parse(fs.readFileSync(sideFile, 'utf8')).audit.length, count + 8);
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before);
    fs.mkdirSync(sideFile + '.lock');
    await assert.rejects(store.updateProfile('owner', 'a', 'employee', { ...profile, requestId: randomUUID(), expectedRevision: store.me('employee', 'a').user.revision }), { status: 503 });
    fs.rmdirSync(sideFile + '.lock');
    const savedSide = fs.readFileSync(sideFile, 'utf8');
    fs.writeFileSync(sideFile, '{broken');
    await call('GET', '/api/user-accounts/me', undefined, 503);
    fs.writeFileSync(sideFile, savedSide);
    const primary = JSON.parse(before);
    primary.users.find((u: {
        id: string;
    }) => u.id === 'employee').active = false;
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(primary));
    before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    await call('GET', '/api/user-accounts/me', undefined, 403, 'employee');
    primary.users.find((u: {
        id: string;
    }) => u.id === 'employee').active = true;
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(primary));
    before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const viewerInput = { ...mutation(), fullName: 'Rapor Kullanıcısı', email: 'viewer@example.test', phone: '', department: 'Raporlama', branch: 'Merkez' };
    await call('PUT', '/api/user-accounts/me/profile', viewerInput, 200, 'viewer');
    const publicUrl = process.env.PUBLIC_APP_URL;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.APP_PUBLIC_URL;
    assert.equal(mailStore.mailReadiness().ready, false);
    process.env.PUBLIC_APP_URL = publicUrl;
    const membership = structuredClone(storage.getState().tenantUsers.find(m => m.userId === 'owner'))!;
    storage.update(db => {
        const m = db.tenantUsers.find(m => m.userId === 'owner')!;
        m.roleIds = ['limited-account-owner'];
        db.roles!.push({ id: 'limited-account-owner', slug: 'company_admin', name: 'Limited owner', tenantId: 'a', isSystem: false, permissions: ['users.view'], description: '', createdAt: '', updatedAt: '' });
    });
    before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const restricted = await call('GET', '/api/user-accounts');
    assert.equal(restricted.users.find((u: {
        id: string;
    }) => u.id === 'employee').canEdit, false);
    await call('PUT', '/api/user-accounts/employee/profile', { ...profile, expectedRevision: store.me('employee', 'a').user.revision, requestId: randomUUID() }, 403);
    storage.update(db => {
        db.tenantUsers[db.tenantUsers.findIndex(m => m.userId === 'owner')] = membership;
        db.roles = db.roles!.filter(r => r.id !== 'limited-account-owner');
    });
    before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const currentViewer = store.me('viewer', 'a').user;
    await call('POST', '/api/user-accounts/me/password', { ...mutation(), expectedRevision: currentViewer.revision, newPassword: 'ViewerNewPassword-123', confirmPassword: 'ViewerNewPassword-123' }, 200, 'viewer');
    await call('GET', '/api/user-accounts/me', undefined, 401, 'viewer');
    const accountNow = store.me('employee', 'a').user;
    const boundMail = { ...mutation(), expectedRevision: accountNow.revision };
    await mailStore.sendPasswordEmail('owner', 'a', 'employee', boundMail);
    const boundToken = extract(messages.length - 1);
    await call('PUT', '/api/user-accounts/employee/profile', { ...profile, expectedRevision: accountNow.revision, requestId: randomUUID(), email: 'employee-final@example.test' });
    const invalidated = await call('POST', '/api/account-password-reset', { token: boundToken, newPassword: resetPassword, confirmPassword: resetPassword }, 400, '');
    assert.equal(invalidated.message, invalid.message);
    assert.equal(mailStore.mailReadiness().ready, true);
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before);
    const finalAccount = store.me('employee', 'a').user;
    await mailStore.sendPasswordEmail('owner', 'a', 'employee', { ...mutation(), expectedRevision: finalAccount.revision });
    const aliasToken = extract(messages.length - 1);
    storage.update(db => {
        db.users.push({ ...structuredClone(db.users.find(u => u.id === 'other')!), id: 'alias-conflict', username: finalAccount.email, email: 'different@example.test' });
    });
    before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const deliveredCount = messages.length;
    await assert.rejects(mailStore.sendPasswordEmail('owner', 'a', 'employee', { ...mutation(), expectedRevision: finalAccount.revision }), { status: 409 });
    assert.equal(messages.length, deliveredCount);
    await call('POST', '/api/account-password-reset', { token: aliasToken, newPassword: resetPassword, confirmPassword: resetPassword }, 400, '');
    await call('POST', '/api/auth/login', { email: finalAccount.email, password: resetPassword }, 401, '', false);
    storage.update(db => { db.users = db.users.filter(u => u.id !== 'alias-conflict'); });
    before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    console.log(`User accounts: ${checks} HTTP checks, sidecar identity overlays and financial immutability PASS.`);
}
finally {
    server.close();
}
