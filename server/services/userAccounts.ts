import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { getDatabasePath } from '../config/environment';
import { readSmtpConfig } from './mailService';
import type { DatabaseState, User, TenantUser } from '../db/schema';
import type { UserAccountProfile, UserAccountMail, UserAccountReadiness } from '../../src/types/userAccounts';
interface AccountOverride {
    userId: string;
    fullName: string;
    email: string;
    phone: string;
    department: string;
    branch: string;
    passwordHash?: string;
    credentialVersion: string;
    revision: string;
    updatedAt: string;
    passwordChangedAt?: string;
}
interface Operation {
    requestId: string;
    actorId: string;
    targetId: string;
    tenantId: string;
    action: string;
    fingerprint: string;
    createdAt: string;
    requiresLogin?: boolean;
    mail?: UserAccountMail;
}
interface ResetRecord {
    digest: string;
    userId: string;
    email: string;
    revision: string;
    credentialVersion: string;
    expiresAt: string;
    used: boolean;
    requestId: string;
}
interface Sidecar {
    version: 1;
    accounts: AccountOverride[];
    operations: Operation[];
    resets: ResetRecord[];
    audit: {
        id: string;
        actorId: string;
        targetId: string;
        tenantId: string;
        action: string;
        createdAt: string;
    }[];
}
export type EffectiveAccount = User & {
    credentialVersion: string;
    accountRevision: string;
};
export interface AccountMailMessage {
    to: string;
    subject: string;
    text: string;
}
export type AccountMailDelivery = (message: AccountMailMessage) => Promise<{
    accepted: string[];
    rejected: string[];
}>;
export class UserAccountsError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}
const fail = (message = 'Geçersiz hesap bilgisi.', status = 400): never => {
    throw new UserAccountsError(message, status);
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const normalized = (s: string) => s.trim().normalize('NFKC').toLowerCase();
const platform = (u: User) => ['SUPER_ADMIN', 'ADMIN'].includes(u.role);
const activeMember = (m: TenantUser) => m.status === 'active' && !m.deletedAt;
function text(v: unknown, limit: number, required = false): string {
    if (typeof v !== 'string')
        return fail();
    const value = v.trim();
    if ((required && !value) || value.length > limit || /[\u0000-\u001f\u007f<>]/.test(value) || /(?:\d[ -]?){13,}/.test(value) || /\b(?:cvv|cvc|pin|şifre|sifre|pan)\s*[:=]?\s*\d/i.test(value))
        return fail();
    return value;
}
function object(raw: unknown, keys: string[]): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !keys.includes(k)))
        return fail();
    return raw as Record<string, unknown>;
}
function mutation(raw: unknown, extra: string[]) {
    const v = object(raw, ['expectedRevision', 'actingPassword', 'requestId', ...extra]);
    if (!(v.expectedRevision === '' || uuid(v.expectedRevision)) || !uuid(v.requestId) || typeof v.actingPassword !== 'string' || !v.actingPassword || Buffer.byteLength(v.actingPassword, 'utf8') > 72)
        return fail();
    return v;
}
function password(raw: Record<string, unknown>) {
    if (typeof raw.newPassword !== 'string' || raw.newPassword !== raw.confirmPassword || Array.from(raw.newPassword).length < 12 || Buffer.byteLength(raw.newPassword, 'utf8') > 72)
        return fail('Şifre en az 12 karakter, en fazla 72 UTF-8 baytı olmalı ve iki şifre aynı olmalı.');
    return raw.newPassword;
}
function profileInput(v: Record<string, unknown>) {
    const email = normalized(text(v.email, 254, true));
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email))
        return fail('Geçerli bir e-posta adresi girin.');
    return { fullName: text(v.fullName, 120, true), email, phone: text(v.phone, 40), department: text(v.department, 80), branch: text(v.branch, 80) };
}
function safeMail(op?: Operation): UserAccountMail | null {
    return op?.mail ? { ...op.mail } : null;
}
/** Private identity overlay. Mutations never write the accounting database. */
export class UserAccountsStore {
    readonly file: string;
    constructor(public readonly primaryFile = getDatabasePath(), private readonly options: {
        deliver?: AccountMailDelivery;
        now?: () => Date;
    } = {}) {
        this.file = primaryFile + '.user-accounts.json';
    }
    private now() {
        return this.options.now?.() || new Date();
    }
    private read(): Sidecar {
        try {
            const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            if (s.version !== 1 || !Array.isArray(s.accounts) || !Array.isArray(s.operations) || !Array.isArray(s.resets) || !Array.isArray(s.audit))
                throw new Error();
            return s;
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT')
                return { version: 1, accounts: [], operations: [], resets: [], audit: [] };
            throw new UserAccountsError('Hesap kayıtları okunamadı.', 503);
        }
    }
    private primary(): DatabaseState {
        try {
            const p = JSON.parse(fs.readFileSync(this.primaryFile, 'utf8'));
            if (!Array.isArray(p.users) || !Array.isArray(p.tenants) || !Array.isArray(p.tenantUsers))
                throw new Error();
            return p;
        }
        catch {
            throw new UserAccountsError('Güncel kullanıcı kayıtları okunamadı.', 503);
        }
    }
    private merge(user: User, s: Sidecar): EffectiveAccount {
        const o = s.accounts.find(a => a.userId === user.id);
        if (!o)
            return { ...user, credentialVersion: '', accountRevision: '' };
        return { ...user, fullName: o.fullName, email: o.email, phone: o.phone, department: o.department, branch: o.branch, passwordHash: o.passwordHash || user.passwordHash, passwordChangedAt: o.passwordChangedAt || user.passwordChangedAt, updatedAt: o.updatedAt, credentialVersion: o.credentialVersion, accountRevision: o.revision };
    }
    private ambiguousEmail(db: DatabaseState, s: Sidecar, target: EffectiveAccount): boolean {
        const email = normalized(target.email);
        return db.users.some(user => user.id !== target.id &&
            (normalized(this.merge(user, s).email) === email || normalized(user.username) === email));
    }
    effectiveUsers(): EffectiveAccount[] {
        const s = this.read();
        return this.primary().users.map(u => this.merge(u, s));
    }
    effectiveProfile(user: User): EffectiveAccount {
        return this.merge(user, this.read());
    }
    credentialVersion(userId: string): string {
        return this.read().accounts.find(a => a.userId === userId)?.credentialVersion || '';
    }
    private override(user: EffectiveAccount, s: Sidecar): AccountOverride {
        let o = s.accounts.find(a => a.userId === user.id);
        if (!o) {
            o = { userId: user.id, fullName: user.fullName, email: user.email, phone: user.phone || '', department: user.department || '', branch: user.branch || '', credentialVersion: user.credentialVersion, revision: user.accountRevision, updatedAt: this.now().toISOString() };
            s.accounts.push(o);
        }
        return o;
    }
    private eligible(db: DatabaseState, user: User, tenantId: string) {
        return (db.tenantUsers || []).some(m => m.userId === user.id && m.tenantId === tenantId && !m.deletedAt);
    }
    private manager(db: DatabaseState, actor: User, tenantId: string): boolean {
        if (platform(actor))
            return true;
        const m = db.tenantUsers.find(m => m.userId === actor.id && m.tenantId === tenantId && activeMember(m));
        return !!m && (m.isOwner || (db.roles || []).some(r => (r.isSystem || r.tenantId === tenantId) && r.slug === 'company_admin' && (m.roleIds ? m.roleIds.includes(r.id) : m.roleId === r.id || m.roleSlug === r.slug)));
    }
    private permission(db: DatabaseState, actor: User, tenantId: string, permission: string): boolean {
        if (platform(actor))
            return true;
        const m = db.tenantUsers.find(m => m.userId === actor.id && m.tenantId === tenantId && activeMember(m));
        if (!m)
            return false;
        const codes = (db.roles || []).filter(r => (r.isSystem || r.tenantId === tenantId) && (m.roleIds ? m.roleIds.includes(r.id) : m.roleId === r.id || m.roleSlug === r.slug)).flatMap(r => r.permissions);
        return codes.some(code => code === '*' || code === permission || code === 'users.*');
    }
    private actor(db: DatabaseState, s: Sidecar, actorId: string, tenantId: string): EffectiveAccount {
        const raw = db.users.find(u => u.id === actorId);
        const tenant = db.tenants.find(t => t.id === tenantId && !t.isArchived && !['SUSPENDED', 'INACTIVE'].includes(t.status));
        if (!raw?.active || !tenant || !platform(raw) && !db.tenantUsers.some(m => m.userId === actorId && m.tenantId === tenantId && activeMember(m)))
            return fail('Firma erişimi reddedildi.', 403);
        return this.merge(raw, s);
    }
    private restriction(db: DatabaseState, actor: EffectiveAccount, target: EffectiveAccount, tenantId: string): string {
        if (actor.id === target.id)
            return '';
        if (!this.manager(db, actor, tenantId))
            return 'Bu hesabı düzenleme yetkiniz yok.';
        if (!this.permission(db, actor, tenantId, 'users.update'))
            return 'Kullanıcı düzenleme izniniz yok.';
        if (platform(target) && actor.role !== 'SUPER_ADMIN')
            return 'Platform hesabını yalnız üst yönetici düzenleyebilir.';
        if (platform(actor))
            return '';
        const memberships = db.tenantUsers.filter(m => m.userId === target.id && !m.deletedAt);
        if (memberships.some(m => m.tenantId !== tenantId) || (target.allowedCompanyIds || []).some(id => id !== tenantId) || (target.companyId && target.companyId !== tenantId))
            return 'Birden fazla firmaya bağlı hesap yalnız platform yöneticisi tarafından düzenlenebilir.';
        const m = memberships.find(m => m.tenantId === tenantId);
        const owner = m?.isOwner || (db.roles || []).some(r => r.slug === 'company_admin' && (r.isSystem || r.tenantId === tenantId) && (m?.roleIds ? m.roleIds.includes(r.id) : m?.roleId === r.id || m?.roleSlug === r.slug));
        if (owner || target.role === 'COMPANY_ADMIN')
            return 'Diğer firma yöneticilerinin hesabını platform yöneticisi düzenleyebilir.';
        return '';
    }
    private target(db: DatabaseState, s: Sidecar, actor: EffectiveAccount, tenantId: string, targetId: string): EffectiveAccount {
        const u = db.users.find(u => u.id === targetId);
        if (!u || (u.id !== actor.id && !this.eligible(db, u, tenantId)))
            return fail('Kullanıcı bulunamadı.', 404);
        return this.merge(u, s);
    }
    private safe(db: DatabaseState, s: Sidecar, actor: EffectiveAccount, user: EffectiveAccount, tenantId: string): UserAccountProfile {
        const restrictionReason = this.restriction(db, actor, user, tenantId);
        const mail = s.operations.filter(o => o.tenantId === tenantId && o.targetId === user.id && o.mail).at(-1);
        return { id: user.id, username: user.username, fullName: user.fullName, email: user.email, phone: user.phone || '', department: user.department || '', branch: user.branch || '', role: user.role, active: user.active, revision: user.accountRevision, canEdit: !restrictionReason, canSetPassword: !restrictionReason, canSend: !restrictionReason && user.active && !!user.email, restrictionReason, lastMail: safeMail(mail) };
    }
    mailReadiness(): UserAccountReadiness {
        if (!this.publicUrl())
            return { ready: false, message: 'Güvenli uygulama adresi yapılandırılmamış.' };
        if (this.options.deliver)
            return { ready: true, message: 'E-posta gönderimi kullanılabilir.' };
        const config = readSmtpConfig();
        if (!config)
            return { ready: false, message: 'E-posta sunucusu yapılandırılmamış. Gönderim yapılamıyor.' };
        const url = this.publicUrl();
        if (!url)
            return { ready: false, message: 'Güvenli uygulama adresi yapılandırılmamış.' };
        return { ready: true, message: 'E-posta sunucusu yapılandırılmış; gerçek teslim sonucu gönderim sırasında kontrol edilir.' };
    }
    list(actorId: string, tenantId: string) {
        const db = this.primary(), s = this.read(), actor = this.actor(db, s, actorId, tenantId);
        if (!this.manager(db, actor, tenantId) || !this.permission(db, actor, tenantId, 'users.view'))
            return fail('Kullanıcıları görüntüleme yetkiniz yok.', 403);
        return { success: true, users: db.users.filter(u => u.id === actor.id || this.eligible(db, u, tenantId)).map(u => this.safe(db, s, actor, this.merge(u, s), tenantId)), mailReadiness: this.mailReadiness() };
    }
    me(actorId: string, tenantId: string) {
        const db = this.primary(), s = this.read(), actor = this.actor(db, s, actorId, tenantId);
        return { success: true, user: this.safe(db, s, actor, actor, tenantId), mailReadiness: this.mailReadiness() };
    }
    private fingerprint(action: string, targetId: string, v: Record<string, unknown>) {
        const { actingPassword: _, ...safe } = v;
        const secret = process.env.JWT_SECRET;
        if (!secret)
            throw new UserAccountsError('Hesap güvenlik yapılandırması eksik.', 503);
        return createHmac('sha256', secret).update(JSON.stringify({ action, targetId, ...safe })).digest('hex');
    }
    private authorize(db: DatabaseState, s: Sidecar, actorId: string, tenantId: string, targetId: string, v: Record<string, unknown>) {
        const actor = this.actor(db, s, actorId, tenantId), target = this.target(db, s, actor, tenantId, targetId);
        const restriction = this.restriction(db, actor, target, tenantId);
        if (restriction)
            return fail(restriction, 403);
        if (!bcrypt.compareSync(v.actingPassword as string, actor.passwordHash))
            return fail('Mevcut şifreniz doğrulanamadı.', 401);
        return { actor, target };
    }
    private prior(s: Sidecar, actorId: string, requestId: string, fingerprint: string) {
        const prior = s.operations.find(o => o.actorId === actorId && o.requestId === requestId);
        if (prior && prior.fingerprint !== fingerprint)
            return fail('İstek numarası farklı bir işlemde kullanılmış.', 409);
        return prior;
    }
    private audit(s: Sidecar, actorId: string, targetId: string, tenantId: string, action: string) {
        s.audit.push({ id: randomUUID(), actorId, targetId, tenantId, action, createdAt: this.now().toISOString() });
    }
    private async transaction<T>(operation: (db: DatabaseState, s: Sidecar) => {
        result: T;
        unchanged?: boolean;
    }): Promise<T> {
        const lock = this.file + '.lock';
        try {
            fs.mkdirSync(lock, { mode: 0o700 });
        }
        catch {
            throw new UserAccountsError('Başka bir hesap işlemi sürüyor. Lütfen tekrar deneyin.', 503);
        }
        const temp = this.file + '.' + randomUUID() + '.tmp';
        try {
            const s = this.read(), db = this.primary(), out = operation(db, s);
            if (out.unchanged)
                return out.result;
            const fd = fs.openSync(temp, 'wx', 0o600);
            try {
                fs.writeFileSync(fd, JSON.stringify(s));
                fs.fsyncSync(fd);
            }
            finally {
                fs.closeSync(fd);
            }
            fs.renameSync(temp, this.file);
            if (process.platform !== 'win32') {
                let dir: number | undefined;
                try {
                    dir = fs.openSync(path.dirname(this.file), 'r');
                    fs.fsyncSync(dir);
                }
                catch {
                    console.error('[USER_ACCOUNTS] Committed directory sync could not be confirmed.');
                }
                finally {
                    if (dir !== undefined)
                        try {
                            fs.closeSync(dir);
                        }
                        catch {
                        }
                }
            }
            return out.result;
        }
        catch (error) {
            if (error instanceof UserAccountsError)
                throw error;
            throw new UserAccountsError('Hesap işlemi tamamlanamadı.', 503);
        }
        finally {
            try {
                if (fs.existsSync(temp))
                    fs.unlinkSync(temp);
            }
            catch {
                console.error('[USER_ACCOUNTS] Temporary cleanup requires attention.');
            }
            try {
                fs.rmdirSync(lock);
            }
            catch {
                console.error('[USER_ACCOUNTS] Lock cleanup requires attention.');
            }
        }
    }
    async updateProfile(actorId: string, tenantId: string, targetId: string, raw: unknown) {
        const v = mutation(raw, ['fullName', 'email', 'phone', 'department', 'branch']), input = profileInput(v), fingerprint = this.fingerprint('PROFILE', targetId, v);
        return this.transaction((db, s) => {
            const { actor, target } = this.authorize(db, s, actorId, tenantId, targetId, v);
            const old = this.prior(s, actorId, v.requestId as string, fingerprint);
            if (old)
                return { result: { user: this.safe(db, s, actor, target, tenantId), requiresLogin: !!old.requiresLogin }, unchanged: true };
            if (target.accountRevision !== v.expectedRevision)
                return fail('Hesap değişmiş. Listeyi yenileyin.', 409);
            if (db.users.some(u => u.id !== targetId && (normalized(this.merge(u, s).email) === input.email || normalized(u.username) === input.email)))
                return fail('Bu e-posta kullanılamıyor.', 409);
            const o = this.override(target, s), emailChanged = normalized(target.email) !== input.email;
            Object.assign(o, input, { revision: randomUUID(), updatedAt: this.now().toISOString() });
            if (emailChanged) {
                o.credentialVersion = randomUUID();
                s.resets.filter(r => r.userId === targetId).forEach(r => r.used = true);
            }
            s.operations.push({ requestId: v.requestId as string, actorId, targetId, tenantId, action: 'PROFILE', fingerprint, createdAt: this.now().toISOString(), requiresLogin: emailChanged && actorId === targetId });
            this.audit(s, actorId, targetId, tenantId, 'PROFILE_UPDATED');
            return { result: { user: this.safe(db, s, actor, this.merge(target, s), tenantId), requiresLogin: emailChanged && actorId === targetId } };
        });
    }
    async setPassword(actorId: string, tenantId: string, targetId: string, raw: unknown) {
        const v = mutation(raw, ['newPassword', 'confirmPassword']), next = password(v), fingerprint = this.fingerprint('PASSWORD', targetId, v);
        return this.transaction((db, s) => {
            const { actor, target } = this.authorize(db, s, actorId, tenantId, targetId, v);
            const old = this.prior(s, actorId, v.requestId as string, fingerprint);
            if (old)
                return { result: { user: this.safe(db, s, actor, target, tenantId), requiresLogin: actorId === targetId }, unchanged: true };
            if (target.accountRevision !== v.expectedRevision)
                return fail('Hesap değişmiş. Listeyi yenileyin.', 409);
            const o = this.override(target, s);
            o.passwordHash = bcrypt.hashSync(next, 10);
            o.credentialVersion = randomUUID();
            o.revision = randomUUID();
            o.passwordChangedAt = this.now().toISOString();
            o.updatedAt = o.passwordChangedAt;
            s.resets.filter(r => r.userId === targetId).forEach(r => r.used = true);
            s.operations.push({ requestId: v.requestId as string, actorId, targetId, tenantId, action: 'PASSWORD', fingerprint, createdAt: this.now().toISOString() });
            this.audit(s, actorId, targetId, tenantId, 'PASSWORD_CHANGED');
            return { result: { user: this.safe(db, s, actor, this.merge(target, s), tenantId), requiresLogin: actorId === targetId } };
        });
    }
    private publicUrl(): URL | null {
        try {
            const configured = process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL;
            if (!configured)
                return null;
            const url = new URL(configured);
            if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
                return null;
            return new URL('/reset-password', url);
        }
        catch {
            return null;
        }
    }
    private async deliver(message: AccountMailMessage) {
        if (this.options.deliver)
            return this.options.deliver(message);
        const config = readSmtpConfig();
        if (!config)
            throw new UserAccountsError('E-posta sunucusu yapılandırılmamış.', 503);
        const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, requireTLS: !config.secure, auth: { user: config.user, pass: config.pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, logger: false, debug: false });
        try {
            const result = await transport.sendMail({ from: { name: config.fromName, address: config.from }, to: message.to, subject: message.subject, text: message.text });
            return { accepted: (result.accepted || []).map(String), rejected: (result.rejected || []).map(String) };
        }
        finally {
            transport.close();
        }
    }
    async sendPasswordEmail(actorId: string, tenantId: string, targetId: string, raw: unknown) {
        const v = mutation(raw, []), fingerprint = this.fingerprint('PASSWORD_EMAIL', targetId, v);
        if (!this.mailReadiness().ready)
            throw new UserAccountsError(this.mailReadiness().message, 503);
        const token = randomBytes(32).toString('base64url'), digest = createHash('sha256').update(token).digest('hex');
        const prepared = await this.transaction((db, s) => {
            const { actor, target } = this.authorize(db, s, actorId, tenantId, targetId, v);
            if (this.ambiguousEmail(db, s, target))
                return fail('Bu e-posta hesabı doğrulanamıyor. Yöneticiyle iletişime geçin.', 409);
            const old = this.prior(s, actorId, v.requestId as string, fingerprint);
            if (old)
                return { result: { user: this.safe(db, s, actor, target, tenantId), mail: safeMail(old)!, to: '', send: false }, unchanged: true };
            if (target.accountRevision !== v.expectedRevision)
                return fail('Hesap değişmiş. Listeyi yenileyin.', 409);
            if (!target.active || !target.email)
                return fail('Bu hesaba şifre e-postası gönderilemiyor.', 409);
            const email = normalized(target.email);
            if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\r\n]/.test(email))
                return fail('Geçerli kayıtlı e-posta gerekli.');
            s.resets.filter(r => r.userId === targetId).forEach(r => r.used = true);
            s.resets.push({ digest, userId: targetId, email, revision: target.accountRevision, credentialVersion: target.credentialVersion, expiresAt: new Date(this.now().getTime() + 30 * 60000).toISOString(), used: false, requestId: v.requestId as string });
            const mail: UserAccountMail = { requestId: v.requestId as string, status: 'PENDING', createdAt: this.now().toISOString(), updatedAt: this.now().toISOString() };
            s.operations.push({ requestId: v.requestId as string, actorId, targetId, tenantId, action: 'PASSWORD_EMAIL', fingerprint, createdAt: mail.createdAt, mail });
            this.audit(s, actorId, targetId, tenantId, 'PASSWORD_EMAIL_REQUESTED');
            return { result: { user: this.safe(db, s, actor, target, tenantId), mail, to: email, send: true } };
        });
        if (!prepared.send)
            return { user: prepared.user, mail: prepared.mail };
        let status: UserAccountMail['status'] = 'UNKNOWN';
        try {
            const link = this.publicUrl();
            if (!link)
                throw new Error();
            link.hash = 'token=' + token;
            const result = await this.deliver({ to: prepared.to, subject: 'BEY360 şifre belirleme bağlantısı', text: `Şifrenizi belirlemek için bu bağlantıyı açın. Bağlantı 30 dakika geçerlidir.\n${link.toString()}\nBu işlemi siz istemediyseniz bağlantıyı kullanmayın.` });
            status = result.rejected.length === 0 && result.accepted.some(email => normalized(email) === normalized(prepared.to)) ? 'SENT' : 'FAILED';
        }
        catch {
            status = 'UNKNOWN';
        }
        try {
            return await this.transaction((db, s) => {
                const op = s.operations.find(o => o.actorId === actorId && o.requestId === v.requestId)!;
                op.mail!.status = status;
                op.mail!.updatedAt = this.now().toISOString();
                if (status === 'FAILED')
                    s.resets.filter(r => r.requestId === v.requestId && r.userId === targetId).forEach(r => r.used = true);
                this.audit(s, actorId, targetId, tenantId, 'PASSWORD_EMAIL_' + status);
                const actor = this.actor(db, s, actorId, tenantId), target = this.target(db, s, actor, tenantId, targetId);
                return { result: { user: this.safe(db, s, actor, target, tenantId), mail: safeMail(op)! } };
            });
        }
        catch {
            throw new UserAccountsError('E-posta gönderim sonucu doğrulanamadı. Aynı isteği tekrar gönderirken otomatik yeni e-posta oluşturulmaz.', 503);
        }
    }
    async resetPassword(raw: unknown) {
        const v = object(raw, ['token', 'newPassword', 'confirmPassword']);
        const next = password(v);
        const invalid = () => fail('Bağlantı geçersiz veya süresi dolmuş.', 400);
        if (typeof v.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(v.token))
            return invalid();
        const digest = createHash('sha256').update(v.token).digest('hex');
        return this.transaction((db, s) => {
            const reset = s.resets.find(r => r.digest === digest);
            if (!reset || reset.used || Date.parse(reset.expiresAt) <= this.now().getTime())
                return invalid();
            const rawUser = db.users.find(u => u.id === reset.userId);
            if (!rawUser?.active)
                return invalid();
            const user = this.merge(rawUser, s);
            if (this.ambiguousEmail(db, s, user))
                return invalid();
            if (normalized(user.email) !== reset.email || user.accountRevision !== reset.revision || user.credentialVersion !== reset.credentialVersion)
                return invalid();
            const o = this.override(user, s);
            o.passwordHash = bcrypt.hashSync(next, 10);
            o.credentialVersion = randomUUID();
            o.revision = randomUUID();
            o.updatedAt = this.now().toISOString();
            o.passwordChangedAt = o.updatedAt;
            s.resets.filter(r => r.userId === user.id).forEach(r => r.used = true);
            this.audit(s, 'password-reset', user.id, '', 'PASSWORD_RESET');
            return { result: { success: true, message: 'Şifreniz belirlendi. Yeni şifrenizle giriş yapabilirsiniz.' } };
        });
    }
}
export const userAccounts = new UserAccountsStore();
