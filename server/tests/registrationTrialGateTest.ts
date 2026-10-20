/**
 * İŞBEY CLOUD — VKN ile Kayıt + Deneme Kapısı Sözleşmesi (2026-10-15)
 * =====================================================================
 * Kullanıcı kararı (2026-10-15): müşteri kaydolur, 14 gün boyunca e-Fatura/
 * e-Belge seçimi SORULMADAN doğrudan ön muhasebeyi kullanır. Deneme bitince
 * e-Dönüşüm seçimi ZORUNLUDUR; seçim yapılmadan veri uçları açılmaz
 * ("Kilitlensin, seçim zorunlu").
 *
 * ÖLÇÜLEN SÖZLEŞMELER:
 *  1. Kayıtta e-Dönüşüm menüsü KAPALIDIR (e-Fatura/e-Belge SEÇİMİ sorulmaz):
 *     ön muhasebe menüleri açık, `edonusum` menüsü kapalı.
 *  2. Deneme bitmeden karar VERİLEMEZ (409 DECISION_NOT_REQUIRED).
 *  3. Deneme bitince karar vermeden veri uçları 403 TRIAL_DECISION_REQUIRED
 *     döner; kimlik/firma/seçim uçları AÇIK kalır.
 *  4. Karar BİR KEZ verilir; ikinci karar 409 CHOICE_ALREADY_MADE.
 *  5. ON_MUHASEBE → bu uçtan kaydedilir; e-Dönüşüm menüleri kapalı KALIR
 *     (kısıt aynen). E_DONUSUM → bu uçtan VERİLEMEZ (400
 *     EDONUSUM_REQUIRES_APPLICATION); karar e-hizmet BAŞVURUSU yoluyla
 *     alınır (`POST /applications`), çünkü geçiş ücretlidir.
 *  6. Hızlı Bilişim'e ÇIKILMAZ: `sorgulaMukellef` YEREL taklit ile değiştirilir.
 *  7. BULUNAMADI durumunda kayıt OLUŞTURULMAZ ve firma bilgisi UYDURULMAZ.
 *  8. HATA (yetki/ağ) durumunda kayıt OLUŞTURULMAZ (gerçek hata kodu).
 *  9. SMTP yokken kayıt GERİ ALINMAZ; mail QUEUED kalır, asla SENT yazılmaz.
 * 10. Üretilen şifre DB'de AÇIK yazılmaz (yalnız bcrypt hash).
 *
 * İZOLASYON: Yalnız NODE_ENV=test ve
 * DATABASE_PATH=<tmp>/registrationTrialGateTest.ts.json.
 * Ağa ÇIKILMAZ (tek istisna 127.0.0.1'deki yerel test sunucusudur).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';

// SMTP ortam değişkenleri test sürecine SIZARSA gerçek mail GİDER —
// bu test asla dışarı mail atmaz; yapılandırma bilerek boşaltılır.
for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MAIL_FROM_NAME']) {
  delete process.env[k];
}

const configuredPath = process.env.DATABASE_PATH || '';
if (process.env.NODE_ENV !== 'test' || path.basename(configuredPath) !== 'registrationTrialGateTest.ts.json') {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/registrationTrialGateTest.ts.json ile çalıştırılabilir.'
  );
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.REGISTER_RATE_LIMIT_MAX ||= '1000';

const { storage } = await import('../db/storage');
const { generateToken, authRouter } = await import('../routes/auth');
const { reportsRouter } = await import('../routes/reports');
const { eDonusumRouter } = await import('../routes/e-donusum');
const { default: efaturaRouter } = await import('../routes/efatura');
const { defaultDeny } = await import('../middleware/securityGate');
const { trialDecisionGate } = await import('../middleware/trialGate');
const { HizliBilisimClient } = await import('../services/hizliBilisim/hizliBilisimClient');
const { evaluateTrialGate, PRE_ACCOUNTING_MENU_IDS } = await import('../services/trialGateService');
const { serviceAllowsView } = await import('../../src/data/serviceAccess');
const { menuAllowsView } = await import('../../src/data/erpMenus');

// ── Koşum düzeneği ──────────────────────────────────────────────────────────
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { tests.push({ name, fn }); }
let passCount = 0, failCount = 0;

// ── Sağlayıcı taklidi (AĞA ÇIKILMAZ) ───────────────────────────────────────
type SahteSonuc =
  | { durum: 'BULUNDU'; musteri: Record<string, unknown> }
  | { durum: 'BULUNAMADI'; musteri: null }
  | { durum: 'HATA'; musteri: null; hataSinifi: string; hataMesaji?: string };

/** Sağlayıcıdan dönen GERÇEK alanlar (uydurma alan yok). */
function musteriVt(vkn: string, ek: Record<string, unknown> = {}) {
  return {
    externalId: `HB-${vkn}`, companyName: `Test Firma ${vkn}`, title: `Test Firma ${vkn}`,
    taxNumber: vkn, taxOffice: 'Test VD', contactName: 'Yetkili Kişi',
    phone: '5550000000', email: 'a@b.c', address: 'Adres', city: 'İstanbul', district: 'Kadıköy',
    ...ek,
  };
}

let sahteKurulum: (vkn: string) => SahteSonuc = () => ({ durum: 'BULUNAMADI', musteri: null });
let sorguSayaci = 0;

(HizliBilisimClient as any).sorgulaMukellef = async (vkn: string): Promise<SahteSonuc> => {
  sorguSayaci++;
  return sahteKurulum(vkn);
};

// ── Şema kurulumu ───────────────────────────────────────────────────────────
storage.update(db => {
  const taban = { ...(db.tenants?.[0] || {}) } as any;
  db.tenants = [{ ...taban, id: 'tnt-test-a', name: 'Firma A', status: 'TRIAL', isArchived: false }];
  db.users = [];
  db.tenantUsers = [];
  db.emailOutbox = [];
  db.subscriptionPlans = (db.subscriptionPlans || []) as any[];
});

const app = express();
app.use(express.json());
app.use('/api', defaultDeny);
app.use('/api', trialDecisionGate);
app.use('/api/auth', authRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/efatura', efaturaRouter);
app.use('/api/v1/e-donusum', eDonusumRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;

async function call(url: string, method: string, body?: unknown, token?: string, status = 200) {
  const r = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await r.json();
  assert.equal(r.status, status, `${method} ${url} beklenen ${status}, alınan ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

function kayitGovdesi(vkn: string, email: string) {
  return { vknTckn: vkn, fullName: 'Test Yetkili', email, phone: '05550000000' };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. saf fonksiyon: kapı kararları
// ═══════════════════════════════════════════════════════════════════════════
test('kapı: deneme süresi dolmamışsa ACTIVE ve seçim sorulmaz', () => {
  const gate = evaluateTrialGate({
    status: 'TRIAL', expiresAt: new Date(Date.now() + 13 * 86400000).toISOString(),
  });
  assert.equal(gate.state, 'ACTIVE');
  assert.equal(gate.daysRemaining > 0, true);
});

test('kapı: süre dolmuş + seçim yoksa DECISION_REQUIRED', () => {
  const gate = evaluateTrialGate({
    status: 'TRIAL', expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.equal(gate.state, 'DECISION_REQUIRED');
  assert.equal(gate.daysRemaining, 0);
});

test('kapı: süre dolmuş + seçim yapılmışsa CLOSED', () => {
  const gate = evaluateTrialGate({
    status: 'TRIAL', expiresAt: new Date(Date.now() - 1000).toISOString(),
    edonusumChoice: 'ON_MUHASEBE',
  });
  assert.equal(gate.state, 'CLOSED');
});

test('kapı: ücretli firmanın (ACTIVE) süresi geçmişse kapı devreye GİRMEZ', () => {
  const gate = evaluateTrialGate({
    status: 'ACTIVE', expiresAt: new Date(Date.now() - 86400000).toISOString(),
  });
  assert.equal(gate.state, 'ACTIVE');
});

test('kapı: kayıt kapsamı e-Dönüşümü İÇERMEZ ama ön muhasebeyi içerir', () => {
  assert.equal(PRE_ACCOUNTING_MENU_IDS.includes('edonusum'), false);
  for (const menu of ['cari', 'stok', 'faturalar', 'kasa', 'banka']) {
    assert.equal(PRE_ACCOUNTING_MENU_IDS.includes(menu), true, `${menu} deneme kapsamında olmalı`);
  }
  assert.equal(serviceAllowsView(PRE_ACCOUNTING_MENU_IDS, 'edonusum'), false);
  assert.equal(serviceAllowsView(PRE_ACCOUNTING_MENU_IDS, 'cari'), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. fail-closed: Hızlı Bilişim yanıtları kaydı engeller
// ═══════════════════════════════════════════════════════════════════════════
test('fail-closed: BULUNAMADI durumunda kayıt OLUŞTURULMAZ (404)', async () => {
  sahteKurulum = () => ({ durum: 'BULUNAMADI', musteri: null });
  const beforeTenants = storage.getState().tenants.length;
  const beforeUsers = storage.getState().users.length;
  const json = await call('/api/auth/register-by-vkn', 'POST', kayitGovdesi('1111111111', 'bulunamadi@x.test'), undefined, 404);
  assert.equal(json.success, false);
  assert.equal(json.code, 'VKN_NOT_FOUND');
  assert.equal(storage.getState().tenants.length, beforeTenants, 'tenant yazılmamalı');
  assert.equal(storage.getState().users.length, beforeUsers, 'kullanıcı yazılmamalı');
});

test('fail-closed: HATA (YETKI) durumunda kayıt OLUŞTURULMAZ (502)', async () => {
  sahteKurulum = () => ({ durum: 'HATA', musteri: null, hataSinifi: 'YETKI', hataMesaji: '401' });
  const beforeTenants = storage.getState().tenants.length;
  const json = await call('/api/auth/register-by-vkn', 'POST', kayitGovdesi('2222222222', 'hata@x.test'), undefined, 502);
  assert.equal(json.success, false);
  assert.match(String(json.code), /^HIZLI_/);
  assert.equal(storage.getState().tenants.length, beforeTenants, 'yetki hatasında firma UYDURULMAMALI');
});

test('kapı: geçersiz VKN ve geçersiz e-posta 400 ile reddedilir, sorgu YAPILMAZ', async () => {
  sorguSayaci = 0;
  await call('/api/auth/register-by-vkn', 'POST', kayitGovdesi('12', 'gecersizvkn@x.test'), undefined, 400);
  sahteKurulum = vkn => ({ durum: 'BULUNDU', musteri: musteriVt(vkn) });
  await call('/api/auth/register-by-vkn', 'POST', { vknTckn: '3333333333', fullName: 'X', email: 'not-an-email' }, undefined, 400);
  assert.equal(sorguSayaci, 0, 'doğrulama öncesi sağlayıcıya GİDİLMEMELİ');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. başarılı kayıt: 14 gün deneme, ön muhasebe açık, e-Dönüşüm kapalı
// ═══════════════════════════════════════════════════════════════════════════
let trialToken = '';
let trialTenantId = '';

test('kayıt: BULUNDU durumunda 201, deneme 14 gün, e-Dönüşüm kapalı', async () => {
  sahteKurulum = vkn => ({ durum: 'BULUNDU', musteri: musteriVt(vkn) });
  const json = await call('/api/auth/register-by-vkn', 'POST', kayitGovdesi('4444444444', 'deneme@x.test'), undefined, 201);
  assert.equal(json.success, true);
  assert.equal(json.trialDays, 14);
  assert.equal(json.edonusumDecisionRequired, false);
  assert.equal(json.mailStatus === 'SENT' || json.mailStatus === 'QUEUED', true);
  trialToken = json.token;
  trialTenantId = json.tenant.id;

  const tenant = storage.getState().tenants.find(t => t.id === trialTenantId)!;
  assert.equal(tenant.status, 'TRIAL');
  assert.equal(tenant.edonusumChoice, undefined, 'kayıtta e-Dönüşüm SORULMAMALI');
  const kalan = new Date(tenant.expiresAt).getTime() - Date.now();
  assert.ok(kalan > 13 * 86400000 && kalan <= 14 * 86400000 + 60000, 'deneme ~14 gün olmalı');

  // Kapsam: denemedeki GERÇEK kapatma üyelik kapsamıdır (`allowedMenuIds`;
  // `menuAllowsPath` sunucuda her istekte çalışır). Paket katmanı
  // (`serviceMenuIds`) deneme çekirdeğini taşır ama e-Dönüşüm kapatmaz — bu
  // yüzden kapı sözleşmesi menü kapsamını ölçer.
  const me = await call('/api/auth/me', 'GET', undefined, trialToken);
  assert.equal(serviceAllowsView(me.user.serviceMenuIds, 'cari'), true, 'cari denemede açık olmalı');
  assert.equal(menuAllowsView(me.user.allowedMenuIds, 'cari'), true, 'cari menü kapsamında açık olmalı');
  assert.equal(menuAllowsView(me.user.allowedMenuIds, 'edonusum'), false, 'e-Dönüşüm denemede menü kapsamıyla KAPALI olmalı');
  // HTTP probu: gerçek e-belge ucu denemede 403 döner (kontör TÜKENMEZ —
  // prob, dış çağrı öncesi `menuAllowsPath` tarafından kesilir).
  const prob = await call('/api/efatura/hizli/prefix-list', 'GET', undefined, trialToken, 403);
  assert.equal(prob.code, 'MENU_ACCESS_DENIED');
});

test('kayıt: şifre DBde AÇIK yazılmaz, mail kuyruğu SENT uydurulmaz', async () => {
  const user = storage.getState().users.find(u => u.email === 'deneme@x.test')!;
  assert.match(user.passwordHash, /^\$2[aby]\$\d{2}\$/);
  // SMTP yokken mail QUEUED kalır (kayıt geri alınmaz); SENT asla uydurulmaz.
  const mails = (storage.getState().emailOutbox || []).filter(m => m.to === 'deneme@x.test');
  assert.equal(mails.length, 1, 'kayıt maili kuyrukta olmalı');
  assert.equal(mails[0].status, 'QUEUED', 'SMTP yokken mail QUEUED kalmalı, SENT uydurulmamalı');
  // Düz metin mail gövdesi kuyrukta izlenebilir ama kullanıcı kaydında
  // açık şifre alanı olmamalı (yalnız bcrypt hash).
  assert.equal('password' in user, false, 'kullanıcı kaydında açık şifre alanı olmamalı');
  assert.equal('temporaryPassword' in user, false, 'kullanıcı kaydında geçici şifre alanı olmamalı');
});

test('kayıt: aynı VKN ikinci kez reddedilir (409), aynı e-posta reddedilir', async () => {
  sahteKurulum = vkn => ({ durum: 'BULUNDU', musteri: musteriVt(vkn) });
  const dup = await call('/api/auth/register-by-vkn', 'POST', kayitGovdesi('4444444444', 'farkli@x.test'), undefined, 409);
  assert.equal(dup.code, 'VKN_EXISTS');
  const dupMail = await call('/api/auth/register-by-vkn', 'POST', kayitGovdesi('5555555555', 'deneme@x.test'), undefined, 400);
  assert.equal(dupMail.code, 'EMAIL_EXISTS');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. kilit: süre dolmadan karar verilemez, dolunca veri uçları kapanır
// ═══════════════════════════════════════════════════════════════════════════
test('kilit: deneme sürerken karar VERİLEMEZ (409)', async () => {
  const json = await call('/api/v1/e-donusum/choice', 'POST', { choice: 'ON_MUHASEBE' }, trialToken, 409);
  assert.equal(json.code, 'DECISION_NOT_REQUIRED');
});

test('kilit: süre dolunca veri uçları 403, kimlik/seçim uçları açık kalır', async () => {
  storage.update(db => {
    const t = db.tenants.find(x => x.id === trialTenantId)!;
    t.expiresAt = new Date(Date.now() - 1000).toISOString();
  });
  const locked = await call('/api/reports/profit-loss', 'GET', undefined, trialToken, 403);
  assert.equal(locked.code, 'TRIAL_DECISION_REQUIRED');
  assert.equal(locked.decisionRequired, true);

  // Açık kalması gerekenler:
  const me = await call('/api/auth/me', 'GET', undefined, trialToken);
  assert.equal(me.success, true);
  const choice = await call('/api/v1/e-donusum/choice', 'GET', undefined, trialToken);
  assert.equal(choice.success, true);
  assert.equal(choice.trial.decisionRequired, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. karar: bir kez, geri alınamaz; kapsam karara göre hizalanır
// ═══════════════════════════════════════════════════════════════════════════
test('karar: ON_MUHASEBE kilidi açar, e-Dönüşüm menüsü kapalı KALIR', async () => {
  const ok = await call('/api/v1/e-donusum/choice', 'POST', { choice: 'ON_MUHASEBE' }, trialToken);
  assert.equal(ok.success, true);
  assert.equal(ok.choice, 'ON_MUHASEBE');

  const again = await call('/api/v1/e-donusum/choice', 'POST', { choice: 'ON_MUHASEBE' }, trialToken, 409);
  assert.equal(again.code, 'CHOICE_ALREADY_MADE');

  const report = await call('/api/reports/profit-loss', 'GET', undefined, trialToken);
  assert.equal(report.success, true, 'karardan sonra veri uçları açılmalı');
  const me = await call('/api/auth/me', 'GET', undefined, trialToken);
  assert.equal(menuAllowsView(me.user.allowedMenuIds, 'edonusum'), false, 'ön muhasebede e-Dönüşüm menü kapsamıyla kapalı kalmalı');
  assert.equal(menuAllowsView(me.user.allowedMenuIds, 'cari'), true);
  // HTTP probu: ON_MUHASEBE sonrası da gerçek e-belge ucu 403 döner.
  const prob = await call('/api/efatura/hizli/prefix-list', 'GET', undefined, trialToken, 403);
  assert.equal(prob.code, 'MENU_ACCESS_DENIED');
});

test('karar: E_DONUSUM bu uçtan VERİLEMEZ — başvuru yolu zorunludur', async () => {
  sahteKurulum = vkn => ({ durum: 'BULUNDU', musteri: musteriVt(vkn) });
  const json = await call('/api/auth/register-by-vkn', 'POST', kayitGovdesi('6666666666', 'edonusum@x.test'), undefined, 201);
  const t2 = json.token;
  const tenantId2 = json.tenant.id;
  storage.update(db => {
    db.tenants.find(x => x.id === tenantId2)!.expiresAt = new Date(Date.now() - 1000).toISOString();
  });
  // E_DONUSUM bu uçtan gönderilirse 400 + başvuru yolu bilgisi döner.
  const direct = await call('/api/v1/e-donusum/choice', 'POST', { choice: 'E_DONUSUM' }, t2, 400);
  assert.equal(direct.code, 'EDONUSUM_REQUIRES_APPLICATION');
  assert.equal(direct.applicationUrl, '/api/v1/e-donusum/applications');
  // Geçersiz seçim de 400 verir.
  const bad = await call('/api/v1/e-donusum/choice', 'POST', { choice: 'YANLIS' }, t2, 400);
  assert.equal(bad.success, false);
});

test('karar: e-Dönüşüm başvurusu kilitliyken OLUŞTURULABİLİR', async () => {
  const t2user = storage.getState().users.find(u => u.email === 'edonusum@x.test')!;
  const t2token = generateToken(t2user, storage.getState().tenants.find(t => t.ownerEmail === 'edonusum@x.test')!.id);
  const app = await call('/api/v1/e-donusum/applications', 'POST', {
    contactName: 'Test Yetkili', email: 'edonusum@x.test', phone: '+905550000000',
    services: ['EFATURA'], consent: true,
  }, t2token, 201);
  assert.equal(app.success, true);
  assert.equal(app.application.status, 'SUBMITTED');
  assert.deepEqual(app.application.services, ['EFATURA']);
  // Aynı hizmete ikinci açık başvuru reddedilir (mükerrer başvuru koruması).
  const dup = await call('/api/v1/e-donusum/applications', 'POST', {
    contactName: 'Test Yetkili', email: 'edonusum@x.test', phone: '+905550000000',
    services: ['EFATURA'], consent: true,
  }, t2token, 400);
  assert.equal(dup.success, false);
  // Başvuru listesi kilitliyken GÖRÜLEBİLİR.
  const list = await call('/api/v1/e-donusum/applications', 'GET', undefined, t2token);
  assert.equal(list.success, true);
  assert.equal(list.applications.length, 1);
  assert.equal(list.trial.decisionRequired, true, 'başvuru kararı YERİNE GEÇMEZ — kilit sürer');
});

test('tenant izolasyonu: kilit başka firmanın seçimini ENGELLEMEZ', async () => {
  const secondApps = (storage.getState().eServiceApplications || []).filter(a => a.tenantId !== trialTenantId);
  assert.equal(secondApps.length, 1, 'ikinci firmanın başvurusu korunmalı');
  const firstApps = (storage.getState().eServiceApplications || []).filter(a => a.tenantId === trialTenantId);
  assert.equal(firstApps.length, 0, 'ilk firmaya başvuru SIZMAMALI');
  const first = storage.getState().tenants.find(t => t.id === trialTenantId)!;
  assert.equal(first.edonusumChoice, 'ON_MUHASEBE', 'ilk firmanın kararı değişmemeli');
  const second = storage.getState().tenants.find(t => t.id !== trialTenantId && t.id !== 'tnt-test-a')!;
  assert.equal(second.edonusumChoice, undefined, 'başvuru karar yerine GEÇMEMELİ');
});

// ── Ölü kilit: deneme GÜNLERCE önce bitmişse karar uçları YAZILABİLİR kalmalı ──
// Tedavi edilen hata (2026-10-16): deneme bitince abonelik EXPIRED olur ve
// `requireAuth` yazı bloğu karar uçlarını (POST choice/applications) 403 ile
// kesiyordu — kullanıcı kararını VEREMEZ, kilit hiç açılmazdı. Testteki eski
// senaryolar süreyi 1 sn geri alıyordu (aynı takvim günü → abonelik ACTIVE),
// bu yüzden ölü kilit yakalanamıyordu. Bu test gerçek hayatı kurar: kayıt 16
// gün önce, deneme 2 gün önce bitti → abonelik EXPIRED, kapı DECISION_REQUIRED.
test('ölü kilit: deneme günlerce önce bitmişse karar ve başvuru YAZILABİLİR', async () => {
  sahteKurulum = vkn => ({ durum: 'BULUNDU', musteri: musteriVt(vkn) });
  const json = await call('/api/auth/register-by-vkn', 'POST', kayitGovdesi('7777777777', 'olukilit@x.test'), undefined, 201);
  const token3 = json.token;
  const tenantId3 = json.tenant.id;
  storage.update(db => {
    const t = db.tenants.find(x => x.id === tenantId3)!;
    (t as any).createdAt = new Date(Date.now() - 16 * 86400000).toISOString();
    (t as any).license = undefined;
    (t as any).erpSubscription = undefined;
    t.expiresAt = new Date(Date.now() - 2 * 86400000).toISOString();
  });
  const gate = await call('/api/v1/e-donusum/choice', 'GET', undefined, token3);
  assert.equal(gate.trial.decisionRequired, true, 'kapı DECISION_REQUIRED olmalı');
  // ON_MUHASEBE kararı abonelik EXPIRED iken de KAYDEDİLEBİLMELİ (ölü kilit yok).
  const ok = await call('/api/v1/e-donusum/choice', 'POST', { choice: 'ON_MUHASEBE' }, token3);
  assert.equal(ok.success, true);
  assert.equal(ok.choice, 'ON_MUHASEBE');
});

// ── Koşum ───────────────────────────────────────────────────────────────────
try {
  for (const t of tests) {
    try { await t.fn(); passCount++; }
    catch (e) { failCount++; console.error(`FAIL: ${t.name}\n  ${(e as Error).message}`); }
  }
  console.log(`registration-trial-gate: ${passCount} PASS / ${failCount} FAIL (${tests.length} senaryo)`);
  if (failCount > 0) process.exitCode = 1;
} finally {
  server.close();
}
