// FAZ 25.2-A SMOKE TEST — C1 (escalation), C2 (search scope), C4 (backup), C5 (admin users RBAC)
const BASE = 'http://127.0.0.1:4000';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ FAIL: ' + msg); } };
const api = async (m, p, body, token) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};
const login = async (u, pw) => (await api('POST', '/api/auth/login', { username: u, password: pw })).json?.token;
import { cleanupTestFixtures } from './testFixtureCleanup.mjs';

// FIXTURE HİJYENİ (2026-09-12): Bu suite C1'de gerçek kullanıcı açıyor. Koşu #4'te
// önceki koşuların birikimi tnt-isbey kotasını (maxUsers=15) doldurduğu için C1 kalemleri
// 400 ile düştü ve asıl iddia ("başka tenant'a kullanıcı açılamaz") HİÇ ölçülemedi.
// Çözüm: koşu başında VE sonunda yalnız tnt-isbey kapsamında, yalnız bilinen test önekli
// kullanıcıları temizle. Gerçek kullanıcılara ve maxUsers'a dokunulmaz.

console.log('════════ FAZ 25.2-A SMOKE — C1/C2/C4/C5 ════════\n');
const admin = await login('admin', 'admin123');
const firma = await login('firmaadmin', 'firmaadmin123');
const muh = await login('muhasebe', 'muhasebe123');
ok(admin && firma && muh, 'Login: admin, firmaadmin, muhasebe token aldı');

// Ön temizlik: kotayı aç (idempotentlik — art arda koşu aynı sonucu vermeli).
// Kiracı kapsamı ZORUNLU: yalnız tnt-isbey (bu suite orada kullanıcı açıyor).
const SCOPE = { companies: ['tnt-isbey'], verbose: true };
if (admin) {
  try { await cleanupTestFixtures(api, admin, SCOPE); }
  catch (e) { console.log(`  ⚠️  [fixture-temizlik] ön temizlik hatası: ${e.message}`); }
}

// HEDEF 1 (finally semantiği): Suite gövdesi try içine alındı, kapanış temizliği
// finally'ye taşındı. Böylece bir adım beklenmedik hata fırlatsa bile (ağ hatası,
// login başarısızlığı vb.) fixture temizliği ATLANMAZ — koşular arası birikim
// (koşu #4'ün kök nedeni) test çökse de oluşmaz.
// `tag` finally'de kullanıldığı için try DIŞINDA tanımlanır (blok kapsamı).
const tag = Date.now().toString(36).slice(-5);

try {

console.log('\n📋 C4 — Backup yalnızca SUPER_ADMIN');
ok((await api('POST', '/api/settings/backup', {}, admin)).status === 200, `admin backup → 200`);
ok((await api('POST', '/api/settings/backup', {}, firma)).status === 403, `COMPANY_ADMIN backup → 403`);
ok((await api('POST', '/api/settings/backup', {}, muh)).status === 403, `MUHASEBE backup → 403`);
ok((await api('POST', '/api/settings/backup', {})).status === 401, `token'sız backup → 401`);

console.log('\n📋 C5 — Admin users listesi yalnızca platform yöneticileri');
ok((await api('GET', '/api/admin/users', null, admin)).status === 200, `admin GET /api/admin/users → 200`);
ok((await api('GET', '/api/admin/users', null, firma)).status === 403, `COMPANY_ADMIN GET /api/admin/users → 403`);
ok((await api('GET', '/api/admin/users/usr-4', null, firma)).status === 403, `COMPANY_ADMIN GET /api/admin/users/:id → 403`);
ok((await api('GET', '/api/admin/users', null)).status === 401, `token'sız → 401`);

console.log('\n📋 C1 — Yetki yükseltme yasağı (privilege escalation)');
// İZOLASYON (2026-09-11): Bu blok önceden SABİT kullanıcı adları (esc1/crmtest1/satis262a)
// kullanıyordu. İlk koşuda kayıt oluşuyor, İKİNCİ koşuda aynı ad "zaten var" → 409 dönüyor
// ve kalem "200 beklenir" diye FAIL oluyordu. Koşu #3'teki 2 FAIL bundan kaynaklandı
// (koşu #2'de oluşan kullanıcılar DB'de duruyordu). Çözüm: her koşuda çakışmasız ad.
// NOT: `tag` try DIŞINDA tanımlıdır (finally'deki kapanış temizliği kullanır).
let r = await api('PUT', '/api/admin/users/usr-4', { role: 'SUPER_ADMIN' }, firma);
ok(r.status === 403, `COMPANY_ADMIN kendini SUPER_ADMIN yapmaya çalışır → ${r.status} (403) — "${r.json?.message}"`);
r = await api('PUT', '/api/admin/users/usr-1', { role: 'SATIS' }, firma);
ok(r.status === 403 || r.json?.success === false, `COMPANY_ADMIN platform-admin hedefini değiştirir → engellendi (${r.status}) — "${r.json?.message}"`);
r = await api('POST', '/api/admin/users', { username: `esc-${tag}`, fullName: 'Esc Test', role: 'SUPER_ADMIN', password: 'Test1234' }, firma);
ok(r.status === 403, `COMPANY_ADMIN SUPER_ADMIN kullanıcı oluşturmaya çalışır → ${r.status} (403)`);
// Asıl iddia "200 dönmesi" değil, TENANT ZORLAMASI: gönderilen companyId tnt-ankara olsa da
// kayıt tnt-isbey'e sabitlenmeli. 409 (ad zaten var) durumunda bile bu doğrulanabilir.
r = await api('POST', '/api/admin/users', { username: `crm-${tag}`, fullName: 'Cross Tenant', role: 'SATIS', password: 'Test1234', companyId: 'tnt-ankara' }, firma);
if (r.status === 200) {
  ok(r.json?.user?.companyId === 'tnt-isbey', `COMPANY_ADMIN başka tenant'a kullanıcı açamaz → companyId zorla tnt-isbey (${r.json?.user?.companyId})`);
} else if (r.status === 409) {
  // Ad çakışması: istek yine de tnt-ankara'ya KAYIT AÇMAMIŞ olmalı (yan etki yok)
  const probe = await api('GET', '/api/admin/users', null, firma);
  const sizinti = (probe.json?.users || []).some(u => u.username === `crm-${tag}` && u.companyId === 'tnt-ankara');
  ok(!sizinti, `COMPANY_ADMIN başka tenant'a kullanıcı açamaz → 409 (ad çakışması; tnt-ankara'ya kayıt açılmadı)`);
} else {
  ok(false, `COMPANY_ADMIN başka tenant'a kullanıcı açamaz → beklenmeyen HTTP ${r.status} — "${r.json?.message}"`);
}
// Düzeltme sonrası normal akış: COMPANY_ADMIN kendi tenant'ında SATIS oluşturabilmeli
r = await api('POST', '/api/admin/users', { username: `satis-${tag}`, fullName: 'Satış Kullanıcısı', role: 'SATIS', password: 'satis262a' }, firma);
ok(r.status === 200, `COMPANY_ADMIN kendi tenant'ına SATIS oluşturur → ${r.status} (200 beklenir)`);

console.log('\n📋 C2 — Search tenant scope + platform verisi kilidi');
r = await api('GET', '/api/search?q=ABC', null, firma);
const catKeys = (r.json?.categories || []).map(c => c.key);
ok(r.status === 200, `firmaadmin search → 200`);
ok(!catKeys.includes('COMPANY') && !catKeys.includes('USER') && !catKeys.includes('HIZLI_CUSTOMER'), `COMPANY/USER/HIZLI_CUSTOMER kategorileri YOK (firmaadmin) → ${catKeys.join(',') || 'boş'}`);
ok(catKeys.includes('CUSTOMER') || catKeys.includes('PRODUCT') || catKeys.includes('MODULE'), `firmaadmin kendi tenant araması çalışıyor → ${catKeys.join(',')}`);
r = await api('GET', '/api/search?q=isbey', null, admin);
const adminKeys = (r.json?.categories || []).map(c => c.key);
ok(adminKeys.includes('COMPANY'), `admin platform kategorilerini görür (q=isbey → FİRMALAR) → ${adminKeys.join(',')}`);
ok((await api('GET', '/api/search?q=ABC')).status === 401, `token'sız search → 401`);

// Kapanış temizliği: asıl iddialar ölçüldükten SONRA kendi fixture'larını sil.
// `usernames` ile yalnız BU koşuda açılan adlara daraltılır (en güvenli mod);
// ön temizlik zaten eski birikimi süpürdüğü için burada gerekmez.
} finally {
  // HEDEF 1: kapanış temizliği finally içinde — test FAIL olsa veya gövde
  // beklenmedik hata fırlatsa bile çalışır.
  try {
    await cleanupTestFixtures(api, admin, {
      // crm- testte tnt-isbey'e zorlanır (iddia bu); yine de tnt-ankara'ya kaçarsa
      // silinmesin diye kapsam dar tutulur — kaçış zaten FAIL olarak raporlanır.
      companies: ['tnt-isbey'],
      usernames: [`esc-${tag}`, `crm-${tag}`, `satis-${tag}`],
      verbose: true,
    });
  } catch (e) { console.log(`  ⚠️  [fixture-temizlik] kapanış temizliği hatası: ${e.message}`); }
}

console.log(`\n════════ SONUÇ: ${pass} PASS / ${fail} FAIL ════════`);
process.exit(fail ? 1 : 0);
