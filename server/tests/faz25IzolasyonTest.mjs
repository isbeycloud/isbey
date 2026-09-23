// FAZ 25.1 ek doğrulama: COMPANY_ADMIN tenant izolasyonu + yetki yükseltme yasağı
const BASE = 'http://127.0.0.1:4000';
let pass = 0, fail = 0; const out = [];
const ok = (c, m) => { c ? pass++ : fail++; out.push(`${c ? '✅' : '❌'} ${m}`); };
async function api(method, path, body, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
}
import { cleanupTestFixtures } from './testFixtureCleanup.mjs';

const login = async (u, p) => (await api('POST', '/api/auth/login', { username: u, password: p })).json;

// FIXTURE HİJYENİ (2026-09-12) — ön temizlik: önceki koşuların birikimini süpür.
// Yalnız bu suite'in kullandığı iki kiracı taranır (tnt-isbey, tnt-kadikoy).
// Silme başarısız olsa bile suite çökmez.
const SCOPE = { companies: ['tnt-isbey', 'tnt-kadikoy'], verbose: true };

const firma = await login('firmaadmin', 'firmaadmin123');
const kasiyer = await login('kasiyer', 'kasiyer123');
const admin = await login('admin', 'admin123');

// Ön temizlik (kotayı aç — idempotentlik: art arda koşu aynı sonucu vermeli).
if (admin?.token) {
  try { await cleanupTestFixtures(api, admin?.token, SCOPE); }
  catch (e) { console.log(`  ⚠️  [fixture-temizlik] ön temizlik hatası: ${e.message}`); }
}

// HEDEF 1 (finally semantiği): Bu koşuda açılan adlar try DIŞINDA tutulur ki
// gövde beklenmedik hata fırlatsa bile kapanış temizliği çalışabilsin.
const CREATED = [];

try {

// 1. COMPANY_ADMIN kullanıcıları listeleyebilir (kendi şirketi)
let r = await api('GET', '/api/users', null, firma.token);
ok(r.status === 200, `COMPANY_ADMIN GET /api/users → ${r.status} (200)`);

// 2. SATIS listeleyemez
r = await api('GET', '/api/users', null, kasiyer.token);
ok(r.status === 403, `SATIS GET /api/users → ${r.status} (403)`);

// 3. COMPANY_ADMIN SUPER_ADMIN rolü ATAYAMAZ (yetki yükseltme yasağı)
r = await api('POST', '/api/users', { username: 'saldiri-' + Date.now(), fullName: 'Saldırı Testi', role: 'SUPER_ADMIN', password: 'test123' }, firma.token);
ok(r.status === 400, `COMPANY_ADMIN → SUPER_ADMIN rolü atama → ${r.status} (400 — yükseltme engellendi)`);

// 4. COMPANY_ADMIN normal kullanıcı oluşturabilir → companyId kendi şirketi olur
const uname = 'yeni-' + Date.now();
CREATED.push(uname); // kapanış temizliği yalnız bu koşuda açılan adları silsin
r = await api('POST', '/api/users', { username: uname, fullName: 'Yeni Kullanıcı', role: 'SATIS', password: 'test123' }, firma.token);
ok(r.status === 200 && r.json.user?.companyId === 'tnt-isbey',
  `COMPANY_ADMIN kullanıcı oluşturma → ${r.status}, companyId=${r.json.user?.companyId} (kendi şirketine atanmalı)`);
ok(!JSON.stringify(r.json).includes('passwordHash') && !JSON.stringify(r.json).includes('test123'),
  'yeni kullanıcı yanıtında şifre/hash sızmıyor');

// 5. PLATFORM ADMIN başka şirkete kullanıcı atayabilir (companyId ile)
const pfName = 'pf-' + Date.now();
CREATED.push(pfName);
r = await api('POST', '/api/users', { username: pfName, fullName: 'PF Kullanıcı', role: 'SATIS', password: 'test123', companyId: 'tnt-kadikoy' }, admin.token);
ok(r.status === 200 && r.json.user?.companyId === 'tnt-kadikoy',
  `SUPER_ADMIN hedef şirkete kullanıcı → ${r.status}, companyId=${r.json.user?.companyId} (200/tnt-kadikoy)`);

// 6. COMPANY_ADMIN pasife alınmış kullanıcı gibi kendi rolünü yükseltemez (UPDATE)
//    (firmaadmin kendi hesabının rolünü ADMIN yapmaya çalışır)
const me = await api('GET', '/api/auth/me', null, firma.token);
const myId = me.json.user?.id;
r = await api('PUT', `/api/users/${myId}`, { role: 'SUPER_ADMIN' }, firma.token);
ok(r.status === 400, `COMPANY_ADMIN kendi rolünü SUPER_ADMIN yapma → ${r.status} (400)`);

// FIXTURE HİJYENİ (2026-09-12) — kapanış temizliği: bu suite `yeni-<ts>` (tnt-isbey) ve
// `pf-<ts>` (tnt-kadikoy) açıyor, eskiden silmiyordu; koşular arası birikim tnt-isbey
// kotasını doldurdu (koşu #4). Yalnız bu koşuda açılan adlar + bu iki kiracı kapsamı.
} finally {
  // HEDEF 1: finally — test FAIL olsa veya gövde hata fırlatsa bile çalışır.
  try {
    await cleanupTestFixtures(api, admin?.token, {
      companies: ['tnt-isbey', 'tnt-kadikoy'],
      usernames: CREATED,
      verbose: true,
    });
  } catch (e) { console.log(`  ⚠️  [fixture-temizlik] kapanış temizliği hatası: ${e.message}`); }
}

console.log(out.join('\n'));
console.log(`\nİzolasyon doğrulaması: ${pass + fail} test | PASS: ${pass} | FAIL: ${fail}`);

process.exit(fail > 0 ? 1 : 0);
