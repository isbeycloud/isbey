/**
 * İŞBEY CLOUD — VKN ile Self-Servis Kayıt Servisi (2026-10-15)
 * ============================================================
 * Akış (kullanıcı kararı 2026-10-15):
 *   1. Müşteri VKN/TCKN + yetkili bilgisi ile kaydolur.
 *   2. Firma bilgisi HIZLI BİLİŞİM'den ÇEKİLİR (`sorgulaMukellef`). Bulunamazsa
 *      kayıt OLUŞTURULMAZ ve firma bilgisi UYDURULMAZ (fail-closed).
 *   3. 14 günlük TRIAL tenant açılır. e-Dönüşüm seçimi SORULMAZ — kullanıcı
 *      doğrudan ön muhasebeyi kullanmaya başlar.
 *   4. Rastgele şifre üretilir, bcrypt ile saklanır ve e-posta ile gönderilir.
 *
 * KURALLAR:
 *  - Şifre yalnız mail gövdesinde taşınır; loglanmaz, DB'de açık yazılmaz.
 *  - HB erişilemezse kayıt açılmaz (gerçek hata döner) — sahte başarı YASAK.
 *  - Mail gönderilemezse KAYIT GERİ ALINMAZ; mail kuyrukta bekler ve durum
 *    çağırana gerçek hâliyle bildirilir.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { storage } from '../db/storage';
import type { Tenant, User, TenantModule } from '../db/schema';
import { HizliBilisimClient, type RemoteHizliCustomer } from './hizliBilisim/hizliBilisimClient';
import { queueAndSendMail } from './emailOutboxService';
import { registrationPasswordMail } from './mailService';
import { PRE_ACCOUNTING_MENU_IDS } from './trialGateService';

export const TRIAL_DAYS = 14;

export interface RegisterByVknInput {
  vknTckn: string;
  fullName: string;
  email: string;
  phone?: string;
  loginUrl?: string;
}

/**
 * Kayıt sonucu. Hata kolu `RegisterFailure`, firma çekme adımının hata kolu
 * `HizliFetchFailure`'dır — ikisi de aynı şekle sahiptir, bu yüzden
 * `registerByVkn` firma çekme hatasını doğrudan döndürebilir.
 */
export interface RegisterFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export type RegisterByVknResult =
  | { ok: true; tenant: Tenant; user: User; username: string; mailStatus: 'SENT' | 'QUEUED' | 'FAILED'; mailMessage?: string }
  | RegisterFailure;

/** VKN (10) veya TCKN (11) — rakam dışı karakterler temizlenir. */
export function normalizeVkn(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function isValidVkn(vkn: string): boolean {
  return /^\d{10,11}$/.test(vkn);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Rastgele geçici şifre: en az bir büyük/küçük harf ve rakam içerir.
 * Okunabilirlik için karıştırılabilecek karakterler (0/O, 1/l/I) kullanılmaz.
 */
export function generateTemporaryPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  // Fisher–Yates (immutable kopya üzerinde): ilk üç karakter hep aynı sırada kalmasın
  const shuffled = [...chars];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.join('');
}

/** E-posta yerel kısmından kullanıcı adı; DB'de benzersiz olana kadar numaralanır. */
function buildUsername(email: string, existing: { username: string }[]): string {
  const base = (email.split('@')[0] || 'kullanici')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24) || 'kullanici';
  let candidate = base;
  let counter = 1;
  while (existing.some(u => u.username.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${base}${counter++}`;
  }
  return candidate;
}

/**
 * Hızlı Bilişim'den firma bilgisi çeker. Hata sınıfı KORUNUR: "bulunamadı" ile
 * "yetki/ağ hatası" aynı mesaja indirgenmez (operatör yanlış yönlenmesin).
 */
export type HizliFetchFailure = RegisterFailure;

export async function fetchCompanyFromHizli(vkn: string): Promise<
  | { ok: true; customer: RemoteHizliCustomer }
  | HizliFetchFailure
> {
  const result = await HizliBilisimClient.sorgulaMukellef(vkn);
  if (result.durum === 'BULUNDU' && result.musteri) return { ok: true, customer: result.musteri };
  if (result.durum === 'BULUNAMADI') {
    return {
      ok: false,
      status: 404,
      code: 'VKN_NOT_FOUND',
      message: 'Bu VKN/TCKN ile Hızlı Bilişim portföyünde kayıt bulunamadı. Numarayı kontrol edin veya bayinizle iletişime geçin.',
    };
  }
  const sinif = result.hataSinifi || 'BILINMEYEN';
  const status = sinif === 'YAPILANDIRMA' ? 503 : sinif === 'YETKI' || sinif === 'KIMLIK' ? 502 : 503;
  return {
    ok: false,
    status,
    code: `HIZLI_${sinif}`,
    message: `Firma bilgisi şu anda sorgulanamıyor (${sinif}). Lütfen birkaç dakika sonra tekrar deneyin.`,
  };
}

export async function registerByVkn(input: RegisterByVknInput): Promise<RegisterByVknResult> {
  const vkn = normalizeVkn(input.vknTckn);
  const fullName = String(input.fullName || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').trim();

  if (!isValidVkn(vkn)) {
    return { ok: false, status: 400, code: 'INVALID_VKN', message: 'Geçerli bir VKN (10 hane) veya TCKN (11 hane) giriniz.' };
  }
  if (!fullName) return { ok: false, status: 400, code: 'FULLNAME_REQUIRED', message: 'Yetkili ad soyad zorunludur.' };
  if (!isValidEmail(email)) return { ok: false, status: 400, code: 'INVALID_EMAIL', message: 'Geçerli bir e-posta adresi giriniz.' };

  const db = storage.getState();
  if (db.users.some(u => u.email.toLowerCase() === email)) {
    return { ok: false, status: 400, code: 'EMAIL_EXISTS', message: 'Bu e-posta adresi ile kayıtlı bir kullanıcı zaten mevcut. Lütfen giriş yapınız.' };
  }
  if ((db.tenants || []).some(t => normalizeVkn(t.taxNumber) === vkn && !t.isArchived)) {
    return { ok: false, status: 409, code: 'VKN_EXISTS', message: 'Bu VKN/TCKN ile kayıtlı bir firma zaten mevcut. Lütfen giriş yapınız veya şifrenizi sıfırlayınız.' };
  }

  // 1. Firma bilgisi YALNIZ Hızlı Bilişim'den gelir — uydurulmaz.
  // Not: `!remote.ok` DEĞİL `=== false` — `strict: false` altında truthiness
  // daraltması yapılmıyor (bkz. auth.ts'teki aynı not).
  const remote = await fetchCompanyFromHizli(vkn);
  if (remote.ok === false) return remote;
  const customer = remote.customer;

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tenantId = `tnt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const companyName = String(customer.companyName || customer.title || '').trim() || `Firma ${vkn}`;

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = bcrypt.hashSync(temporaryPassword, 10);

  // Yeni üye ilk açılışta paketini kendisi seçer.

  const tenant: Tenant = {
    id: tenantId,
    companyCode: storage.generateNextCompanyCode(),
    name: companyName,
    slug: companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || `firma-${vkn}`,
    title: companyName,
    taxNumber: vkn,
    taxOffice: String(customer.taxOffice || '').trim(),
    email,
    phone: phone || String(customer.phone || '').trim(),
    address: customer.address,
    city: customer.city,
    district: customer.district,
    // Hizmetler ilk paket seçimi tamamlanınca açılır.
    plan: 'STARTER',
    status: 'TRIAL',
    maxUsers: 5,
    currentUsers: 1,
    maxInvoicesPerMonth: 500,
    // Deneme kontörü: mevcut self-servis kayıtla aynı (100). Kontör TÜKETEN
    // işlem bu akışta çalıştırılmaz; değer yalnız kota bilgisidir.
    eInvoiceCredits: 100,
    storageLimitMb: 2048,
    storageUsedMb: 5,
    // Boş seçim ilk açılışta zorunlu paket ekranını kalıcı olarak işaretler.
    activeModules: [],
    selectedServicePlanIds: [],
    ownerName: fullName,
    ownerEmail: email,
    ownerPhone: phone,
    expiresAt: trialEndsAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    // 2026-10-15: Deneme akışı alanları — seçim SONRADAN yapılacak.
    trialStartedAt: now.toISOString(),
    registrationVkn: vkn,
    externalProvider: 'HIZLI_BILISIM',
    externalCustomerId: customer.externalId,
    syncedAt: now.toISOString(),
    stats: {
      totalCustomers: 0,
      totalProducts: 0,
      totalInvoices: 0,
      totalRevenue: 0,
      monthlyInvoiceCount: 0,
      userCount: 1,
      lastLoginAt: now.toISOString(),
    },
  };

  let adminUser: User | null = null;

  await storage.runTransaction(draft => {
    // Yarış kontrolü: aynı VKN/e-posta bu işlem sırasında eklenmiş olabilir.
    if (draft.tenants.some(t => normalizeVkn(t.taxNumber) === vkn && !t.isArchived)) {
      throw new Error('Bu VKN/TCKN ile kayıtlı bir firma zaten mevcut.');
    }
    if (draft.users.some(u => u.email.toLowerCase() === email)) {
      throw new Error('Bu e-posta adresi ile kayıtlı bir kullanıcı zaten mevcut.');
    }

    adminUser = {
      id: `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      username: buildUsername(email, draft.users),
      fullName,
      email,
      phone,
      role: 'COMPANY_ADMIN',
      passwordHash,
      active: true,
      companyId: tenantId,
      companyName,
      allowedCompanyIds: [tenantId],
      createdAt: now.toISOString(),
      passwordChangedAt: now.toISOString(),
    };

    storage.bootstrapNewTenant(tenant, adminUser, draft);

    // Deneme kapsamı: kayıtta e-Dönüşüm/e-Belge SEÇİMİ sorulmaz — müşteri
    // doğrudan ön muhasebeyi kullanır. Bu yüzden üyeliğin menü kapsamı
    // e-Dönüşüm menüsü HARİÇ tutulur; süre bitince karar verilir ve kapsam
    // buna göre güncellenir (bkz. routes/e-donusum.ts).
    const membership = (draft.tenantUsers || []).find(m => m.userId === adminUser!.id && m.tenantId === tenantId);
    if (membership) membership.allowedMenuIds = [...PRE_ACCOUNTING_MENU_IDS];
  });

  if (!adminUser) {
    return { ok: false, status: 500, code: 'USER_NOT_CREATED', message: 'Firma oluşturuldu ancak yönetici hesabı açılamadı. Destek ile iletişime geçin.' };
  }

  const createdUser: User = adminUser;

  storage.addAuditLog({
    userId: createdUser.id,
    username: createdUser.username,
    companyId: tenantId,
    companyName,
    action: 'COMPANY_CREATED',
    module: 'AUTH',
    details: `VKN ile self-servis kayıt: ${companyName} (VKN ${vkn}). Kaynak: HIZLI_BILISIM (${customer.externalId}). 14 gün deneme başladı.`,
    ipAddress: 'self-service',
  });

  // 2. Şifre maili: kuyruğa yazılır, hemen denenir. Kayıt mail yüzünden geri alınmaz.
  const mail = registrationPasswordMail({
    fullName,
    username: createdUser.username,
    password: temporaryPassword,
    companyName,
    trialEndsAt,
    loginUrl: input.loginUrl || process.env.APP_PUBLIC_URL || 'https://bey360.com',
  });

  const outbox = await queueAndSendMail({
    tenantId,
    to: email,
    kind: 'REGISTRATION_PASSWORD',
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  storage.addAuditLog({
    userId: createdUser.id,
    username: createdUser.username,
    companyId: tenantId,
    companyName,
    action: 'MAIL_SENT',
    module: 'AUTH',
    details: `Kayıt şifre maili: ${email} → durum ${outbox.status}${outbox.lastError ? ` (${outbox.lastError})` : ''}`,
    ipAddress: 'self-service',
  });

  return {
    ok: true,
    tenant,
    user: createdUser,
    username: createdUser.username,
    mailStatus: outbox.status === 'SENT' ? 'SENT' : outbox.status === 'FAILED' ? 'FAILED' : 'QUEUED',
    mailMessage: outbox.status === 'SENT' ? undefined : outbox.lastError,
  };
}
