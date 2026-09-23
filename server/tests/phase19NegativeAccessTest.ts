/**
 * İŞBEY CLOUD — FAZ 19 NEGATİF ERİŞİM & ROL İZOLASYON TESTİ
 * Gerçek auth.ts + authGuards.ts kodlarına HTTP üzerinden saldırır.
 * PASS kriteri: yetkisiz erişim 401/403 döner; yetkili erişim 200 döner.
 */
const BASE = 'http://127.0.0.1:4719';
let passCount = 0, failCount = 0;
const results: string[] = [];

function pass(msg: string) { passCount++; results.push(`  ✅ PASS  ${msg}`); }
function fail(msg: string) { failCount++; results.push(`  ❌ FAIL  ${msg}`); }

interface LoginRes { success: boolean; token?: string; user?: any; message?: string; activeTenant?: any }

async function api(method: string, path: string, body?: any, token?: string): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* boş gövde */ }
  return { status: res.status, json };
}

async function login(username: string, password: string): Promise<LoginRes> {
  const { json } = await api('POST', '/api/auth/login', { username, password });
  return json;
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  İŞBEY CLOUD — FAZ 19 NEGATİF ERİŞİM TEST PAKETİ');
  console.log('════════════════════════════════════════════════════════\n');

  // ─── 1. POZİTİF LOGIN TESTLERİ ──────────────────────────────────────
  console.log('📋 1. POZİTİF LOGIN (seed kullanıcıları)');
  const users = [
    { u: 'admin', p: 'admin123', role: 'SUPER_ADMIN', name: 'admin' },
    { u: 'muhasebe', p: 'muhasebe123', role: 'MUHASEBE', name: 'muhasebe' },
    { u: 'kasiyer', p: 'kasiyer123', role: 'SATIS', name: 'kasiyer' },
    { u: 'firmaadmin', p: 'firmaadmin123', role: 'COMPANY_ADMIN', name: 'firmaadmin (FAZ20 eklendi)' },
    { u: 'rapor', p: 'rapor123', role: 'RAPOR', name: 'rapor (FAZ20 eklendi)' },
  ];
  const tokens: Record<string, string> = {};
  for (const u of users) {
    const r = await login(u.u, u.p);
    if (r.success && r.token && r.user?.role === u.role) {
      tokens[u.role] = r.token;
      pass(`${u.name} login başarılı, rol=${r.user.role}`);
    } else {
      fail(`${u.name} login BEKLENMEDİK: success=${r.success} role=${r.user?.role} msg=${r.message}`);
    }
  }

  // ─── 2. NEGATİF LOGIN TESTLERİ ──────────────────────────────────────
  console.log('\n📋 2. NEGATİF LOGIN');
  let r = await login('admin', 'yanlissifre');
  (r.success === false && !r.token) ? pass('yanlış şifre reddedildi') : fail('yanlış şifre KABUL EDİLDİ!');

  r = await login('olmayanuser', 'test123');
  (r.success === false) ? pass('olmayan kullanıcı reddedildi') : fail('olmayan kullanıcı KABUL EDİLDİ!');

  r = await login('pasifkullanici', 'pasif123');
  (r.success === false) ? pass('PASİF kullanıcı login reddedildi (FAZ20 usr-6)') : fail('pasif kullanıcı KABUL EDİLDİ — GÜVENLİK AÇIĞI!');

  r = await login('', '');
  (r.success === false) ? pass('boş credential reddedildi (400)') : fail('boş credential kabul edildi!');

  // SQL/NoSQL injection benzeri girişler
  r = await login({ $gt: '' } as any, 'x');
  (r.success === false) ? pass('NoSQL injection payload reddedildi') : fail('NoSQL injection payload kabul edildi!');

  // ─── 3. TOKENSİZ ERİŞİM (401) ───────────────────────────────────────
  console.log('\n📋 3. TOKENSİZ / GEÇERSİZ TOKEN ERİŞİMİ');
  for (const ep of ['/api/protected/erp-only', '/api/protected/muhasebe-only', '/api/protected/admin-only', '/api/protected/tenant-data']) {
    const { status } = await api('GET', ep);
    (status === 401) ? pass(`token'sız ${ep} → 401`) : fail(`token'sız ${ep} → ${status} (401 beklenir)`);
  }
  const { status: tamperStatus } = await api('GET', '/api/protected/erp-only', undefined, 'gecersiz.token.buraya');
  (tamperStatus === 401) ? pass('bozuk JWT token → 401') : fail(`bozuk JWT → ${tamperStatus}`);

  // İmzasız (kendi imzaladığımız sahte) token
  const fakeToken = Buffer.from(JSON.stringify({ userId: 'usr-1', role: 'SUPER_ADMIN', tenantId: 'tnt-isbey' })).toString('base64url') + '.sahte.imza';
  const { status: fakeStatus } = await api('GET', '/api/protected/admin-only', undefined, fakeToken);
  (fakeStatus === 401) ? pass('sahte imzalı token → 401') : fail(`sahte token → ${fakeStatus} (GÜVENLİK AÇIĞI!)`);

  // ─── 4. ROL BAZLI NEGATİF ERİŞİM (403) ─────────────────────────────
  console.log('\n📋 4. ROL İZOLASYONU (yetkisiz rol → 403)');
  const matrix: Array<{ role: string; ep: string; allowed: boolean }> = [
    // admin her yere erişir
    { role: 'SUPER_ADMIN', ep: 'admin-only', allowed: true },
    { role: 'SUPER_ADMIN', ep: 'muhasebe-only', allowed: true },
    { role: 'SUPER_ADMIN', ep: 'erp-only', allowed: true },
    // muhasebe: admin-only'e giremez, muhasebe-only'e girer
    { role: 'MUHASEBE', ep: 'admin-only', allowed: false },
    { role: 'MUHASEBE', ep: 'muhasebe-only', allowed: true },
    { role: 'MUHASEBE', ep: 'erp-only', allowed: true },
    // SATIS: muhasebe ve admin modüllerine giremez
    { role: 'SATIS', ep: 'muhasebe-only', allowed: false },
    { role: 'SATIS', ep: 'admin-only', allowed: false },
    { role: 'SATIS', ep: 'erp-only', allowed: true },
    // COMPANY_ADMIN: admin-only'e giremez (platform admin değil), ERP'ye girer
    { role: 'COMPANY_ADMIN', ep: 'admin-only', allowed: false },
    { role: 'COMPANY_ADMIN', ep: 'erp-only', allowed: true },
    // RAPOR: sadece görüntüleme — admin/muhasebe fonksiyonlarına giremez
    { role: 'RAPOR', ep: 'admin-only', allowed: false },
    { role: 'RAPOR', ep: 'muhasebe-only', allowed: false },
    { role: 'RAPOR', ep: 'erp-only', allowed: false },
  ];
  for (const m of matrix) {
    const { status } = await api('GET', `/api/protected/${m.ep}`, undefined, tokens[m.role]);
    const ok = m.allowed ? status === 200 : status === 403;
    if (ok) pass(`${m.role} → ${m.ep}: ${status} (beklenen: ${m.allowed ? 200 : 403})`);
    else fail(`${m.role} → ${m.ep}: ${status} (beklenen: ${m.allowed ? 200 : 403}) — İZOLASYON İHLALİ!`);
  }

  // ─── 5. PERMISSION BAZLI NEGATİF ERİŞİM ────────────────────────────
  console.log('\n📋 5. PERMISSION KONTROLÜ (invoices.delete)');
  const permMatrix: Array<{ role: string; allowed: boolean }> = [
    { role: 'SUPER_ADMIN', allowed: true },
    { role: 'COMPANY_ADMIN', allowed: true },
    { role: 'MUHASEBE', allowed: true }, // accountant rolü geniş izinli
    { role: 'SATIS', allowed: false },
    { role: 'RAPOR', allowed: false },
  ];
  for (const pm of permMatrix) {
    const { status } = await api('POST', '/api/protected/sensitive-action', {}, tokens[pm.role]);
    const ok = pm.allowed ? status === 200 : status === 403;
    if (ok) pass(`${pm.role} invoices.delete → ${status} (beklenen: ${pm.allowed ? 200 : 403})`);
    else fail(`${pm.role} invoices.delete → ${status} — İZNİN İHLALİ!`);
  }

  // ─── 6. TENANT İZOLASYONU ───────────────────────────────────────────
  console.log('\n📋 6. TENANT İZOLASYONU');
  const adminLogin = await login('admin', 'admin123');
  const tenantOfAdmin = adminLogin.activeTenant?.id;
  const kasiyerRes = await login('kasiyer', 'kasiyer123');
  const tenantOfKasiyer = kasiyerRes.activeTenant?.id;
  pass(`admin tenant: ${tenantOfAdmin}, kasiyer tenant: ${tenantOfKasiyer}`);

  // Kasiyer kendi tenant verisini görür
  const kd = await api('GET', '/api/protected/tenant-data', undefined, tokens['SATIS']);
  (kd.json?.tenantId === tenantOfKasiyer) ? pass('kasiyer yalnızca kendi tenantını görür') : fail(`kasiyer tenant sızıntısı: ${kd.json?.tenantId}`);

  // switch-company: kasiyer erişimi olmayan tenant'a geçemez
  const sw = await api('POST', '/api/auth/switch-company', { targetTenantId: 'tnt-kadikoy' }, tokens['SATIS']);
  (sw.status === 403) ? pass('SATIS yetkisiz tenant geçişi → 403') : fail(`SATIS tenant geçişi → ${sw.status} (403 beklenir)`);

  // olmayan tenant
  const sw2 = await api('POST', '/api/auth/switch-company', { targetTenantId: 'tnt-yok-boyle' }, tokens['SUPER_ADMIN']);
  (sw2.status === 404) ? pass('olmayan tenant → 404') : fail(`olmayan tenant → ${sw2.status}`);

  // admin (SUPER_ADMIN) geçiş yapabilir
  const sw3 = await api('POST', '/api/auth/switch-company', { targetTenantId: 'tnt-kadikoy' }, tokens['SUPER_ADMIN']);
  (sw3.status === 200 && sw3.json?.token) ? pass('SUPER_ADMIN tenant geçişi → 200 + yeni token') : fail(`SUPER_ADMIN geçişi → ${sw3.status}`);

  // ─── 7. /ME GÜVENLİĞİ ───────────────────────────────────────────────
  console.log('\n📋 7. GET /ME');
  const meNoTok = await api('GET', '/api/auth/me');
  (meNoTok.status === 401) ? pass('token\'sız /me → 401 (FAZ9 fallback yasağı)') : fail(`token'sız /me → ${meNoTok.status}`);

  const meAdmin = await api('GET', '/api/auth/me', undefined, tokens['SUPER_ADMIN']);
  (meAdmin.json?.success && meAdmin.json?.user?.username === 'admin') ? pass('/me doğru kullanıcıyı döndürür') : fail('/me yanlış kullanıcı');

  // passwordHash sızmıyor mu?
  const meRaw = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens['MUHASEBE']}` } });
  const meText = await meRaw.text();
  (!meText.includes('passwordHash') && !meText.includes('muhasebe123')) ? pass('/me yanıtında passwordHash/şifre SIZMIX') : fail('/me YANITINDA ŞİFRE BİLGİSİ SIZIYOR!');

  // ─── 8. LOGIN YANITINDA SIZINTI KONTROLÜ ────────────────────────────
  console.log('\n📋 8. HASSAS VERİ SIZINTI KONTROLÜ');
  const loginRaw = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  const loginText = await loginRaw.text();
  (!loginText.includes('passwordHash') && !loginText.includes('admin123')) ? pass('login yanıtında hash/şifre yok') : fail('login YANITINDA HASSAS VERİ VAR!');

  // Hata mesajı bilgi sızmıyor mu? (stack trace vs)
  const errRes = await api('POST', '/api/auth/login', { username: 'admin\x00\x27', password: 'x' });
  const errText = JSON.stringify(errRes.json || {});
  (!errText.includes('at ') && !errText.includes('node_modules')) ? pass('hata mesajı stack/sistem bilgisi sızmıyor') : fail('hata mesajında iç bilgi var!');

  // ─── SONUÇ ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(56));
  console.log('İŞBEY CLOUD — FAZ 19 TEST SONUÇLARI');
  console.log('═'.repeat(56));
  for (const line of results) console.log(line);
  console.log('─'.repeat(56));
  console.log(`  Toplam: ${passCount + failCount} | ✅ PASS: ${passCount} | ❌ FAIL: ${failCount}`);
  console.log('═'.repeat(56) + '\n');

  if (failCount > 0) {
    console.error(`❌ FAZ 19: ${failCount} test BAŞARISIZ`);
    process.exit(1);
  }
  console.log('🎉 FAZ 19: TÜM NEGATİF ERİŞİM TESTLERİ GEÇTİ');
}

main().catch(e => { console.error('TEST HATASI:', e); process.exit(1); });
