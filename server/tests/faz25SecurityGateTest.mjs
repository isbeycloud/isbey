// FAZ 25.1 NEGATİF ERİŞİM & GATE TESTİ (izole sunucu üzerinde)
const BASE = 'http://127.0.0.1:4000';
let pass = 0, fail = 0;
const results = [];
const ok = (c, m) => { c ? pass++ : fail++; results.push(`${c ? '  ✅ PASS' : '  ❌ FAIL'}  ${m}`); };

async function api(method, path, body, token, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function login(u, p) {
  const r = await api('POST', '/api/auth/login', { username: u, password: p });
  return r.json;
}

const main = async () => {
  console.log('════════ İŞBEY FAZ 25.1 — SECURITY GATE TESTİ ════════\n');

  // ── 1. PUBLIC yollar açık kalmalı
  console.log('📋 1. PUBLIC ALLOWLIST (açık kalmalı)');
  let r = await api('GET', '/api/health');
  ok(r.status === 200, `GET /api/health → ${r.status} (200 beklenir)`);
  r = await api('GET', '/api/v1/plans');
  ok(r.status === 200, `GET /api/v1/plans → ${r.status} (200 beklenir)`);
  r = await api('GET', '/api/v1/support-faz8/knowledge');
  ok(r.status === 200, `GET /api/v1/support-faz8/knowledge → ${r.status} (200 beklenir)`);
  r = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  ok(r.status === 200 && r.json.token, `POST /api/auth/login → ${r.status} (login çalışıyor)`);

  // ── 2. DEFAULT DENY: token'sız korumalı yollar 401
  console.log('\n📋 2. DEFAULT DENY — token\'sız erişim (401 beklenir)');
  const denyPaths = [
    ['GET', '/api/users'], ['POST', '/api/users'], ['GET', '/api/tenants'],
    ['POST', '/api/tenants/tnt-isbey/switch'], ['GET', '/api/settings'],
    ['POST', '/api/settings/backup'], ['GET', '/api/reports/profit-loss'],
    ['GET', '/api/ai/insights'], ['GET', '/api/search?q=x'],
    ['POST', '/api/sync/batch'], ['GET', '/api/employees'],
    ['GET', '/api/v1/mobile/bootstrap'], ['POST', '/api/v1/mobile/sync'],
    ['GET', '/api/v1/mobile/devices'], ['GET', '/api/v1/mobile/dashboard'],
    ['GET', '/api/v1/platform-admin/metrics'], ['GET', '/api/v1/billing/portal'],
    ['GET', '/api/v1/activity-logs'], ['POST', '/api/v1/pos/charge'],
    ['GET', '/api/v1/developer/keys'], ['GET', '/api/v1/advanced-reports/dashboard'],
    ['POST', '/api/v1/onboarding/demo-data'], ['GET', '/api/v1/documents'],
  ];
  for (const [m, p] of denyPaths) {
    const res = await api(m, p, m === 'POST' ? {} : undefined);
    ok(res.status === 401, `token'sız ${m} ${p} → ${res.status} (401 beklenir)`);
  }

  // ── 3. x-tenant-id başlığı yetki kaynağı olamaz
  r = await api('GET', '/api/v1/mobile/bootstrap', null, null, { 'x-tenant-id': 'tnt-kadikoy' });
  ok(r.status === 401, `x-tenant-id başlığıyla token'sız bootstrap → ${r.status} (401 — başlık yetki vermez)`);

  // ── 4. Eski sahte mob-jwt token artık geçersiz
  r = await api('GET', '/api/v1/mobile/bootstrap', null, 'mob-jwt-usr-1-1757000000-abcdef12');
  ok(r.status === 401, `sahte "mob-jwt-*" token → ${r.status} (401 — gerçek JWT zorunlu)`);

  // ── 5. RBAC: rol bazlı erişim
  console.log('\n📋 5. RBAC — rol izolasyonu');
  const admin = await login('admin', 'admin123');
  const kasiyer = await login('kasiyer', 'kasiyer123');
  const rapor = await login('rapor', 'rapor123');
  const firmaadmin = await login('firmaadmin', 'firmaadmin123');
  ok(admin.token && kasiyer.token && rapor.token && firmaadmin.token, '4 rol login başarılı');

  r = await api('GET', '/api/users', null, admin.token);
  ok(r.status === 200, `ADMIN /api/users → ${r.status} (200)`);
  r = await api('GET', '/api/users', null, kasiyer.token);
  ok(r.status === 403, `SATIS /api/users → ${r.status} (403)`);
  r = await api('GET', '/api/auth/users', null, kasiyer.token);
  ok(r.status === 403, `SATIS /api/auth/users → ${r.status} (403)`);
  r = await api('GET', '/api/tenants', null, firmaadmin.token);
  ok(r.status === 403, `COMPANY_ADMIN /api/tenants → ${r.status} (403 — INTERNAL)`);
  r = await api('POST', '/api/tenants/tnt-kadikoy/switch', {}, kasiyer.token);
  ok(r.status === 403, `SATIS /tenants/:id/switch → ${r.status} (403 — INTERNAL)`);

  // ── 6. Mobil IDOR düzeltmesi: tenant yalnızca token'dan
  console.log('\n📋 6. MOBIL IDOR — tenant kaynağı yalnızca token');
  r = await api('GET', '/api/v1/mobile/bootstrap?tenantId=tnt-kadikoy', null, kasiyer.token);
  ok(r.status === 200 && r.json.tenantId === 'tnt-isbey',
    `kasiyer bootstrap?tenantId=tnt-kadikoy → dönen tenant: ${r.json?.tenantId} (tnt-isbey olmalı — IDOR kapandı)`);
  r = await api('GET', '/api/v1/mobile/bootstrap', null, kasiyer.token, { 'x-tenant-id': 'tnt-kadikoy' });
  ok(r.status === 200 && r.json.tenantId === 'tnt-isbey',
    `kasiyer bootstrap + x-tenant-id başlığı → dönen tenant: ${r.json?.tenantId} (token öncelikli)`);
  r = await api('GET', '/api/v1/mobile/dashboard', null, kasiyer.token);
  ok(r.status === 200, `kasiyer mobile/dashboard → ${r.status} (200 — kendi tenant'ı)`);
  r = await api('GET', '/api/v1/mobile/devices', null, kasiyer.token);
  ok(r.status === 200, `kasiyer mobile/devices → ${r.status} (200)`);
  // Mobil login gerçek JWT üretiyor mu + pasif kullanıcı reddi
  r = await api('POST', '/api/v1/mobile/auth/login', { email: 'kasiyer', password: 'kasiyer123' });
  ok(r.status === 200 && typeof r.json.token === 'string' && r.json.token.split('.').length === 3,
    'mobil login → gerçek JWT formatı (3 parça)');
  const mobTok = r.json.token;
  r = await api('GET', '/api/v1/mobile/bootstrap', null, mobTok);
  ok(r.status === 200, `mobil JWT ile bootstrap → ${r.status} (200 — gerçek token geçerli)`);
  r = await api('POST', '/api/v1/mobile/auth/login', { email: 'pasifkullanici', password: 'pasif123' });
  ok(r.status === 403, `pasif kullanıcı mobil login → ${r.status} (403)`);

  // ── 7. Webhook fail-closed (FAZ 25.3 #2): secret tanımsız → 503, imzasız istek → 401. Asla 200/302 değil.
  r = await api('POST', '/api/v1/payments/webhook', { eventType: 'PAYMENT_SUCCESS' });
  ok(r.status === 401 || r.status === 503, `POST /api/v1/payments/webhook token'sız + imzasız → ${r.status} (fail-closed 401/503 — FAZ 25.3)`);

  // ── SONUÇ
  console.log('\n' + '═'.repeat(56));
  for (const l of results) console.log(l);
  console.log('─'.repeat(56));
  console.log(`  Toplam: ${pass + fail} | ✅ PASS: ${pass} | ❌ FAIL: ${fail}`);
  console.log('═'.repeat(56));
  process.exit(fail > 0 ? 1 : 0);
};
main().catch(e => { console.error('TEST HATASI:', e); process.exit(1); });
