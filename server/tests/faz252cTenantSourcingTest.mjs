/**
 * İŞBEY CLOUD — FAZ 25.2-C TENANT SOURCING CONSISTENCY TEST
 * =========================================================
 * Kabul kriteri (onaylı, 25.2-C spec):
 *   "Kabul edilmez: req.query.tenantId / req.body.tenantId /
 *    req.headers['x-tenant-id'] ile doğrudan veri erişimi —
 *    bunları req.user.companyId veya merkezi policy kontrolüne bağla."
 *
 * Bu test KAYNAK TARAMASI yapar (statik):
 *   1. server/routes altında güvensiz tenant kaynak deseni = 0
 *   2. resolveRequestTenantId kullanımı = beklenen dosya sayısı ve çağrı sayısı
 *   3. policies.ts helper'ı tek kaynak tanım (duplicate yok)
 *   4. Her swap'li dosya policies'ten import ediyor (kopya tanım yok)
 *   5. mobile.ts FAZ 25.1 pattern'i (tenantFromToken) hâlâ yerinde
 *
 * Çalıştırma:
 *   node server/tests/faz252cTenantSourcingTest.mjs [routesDir] [securityDir]
 *   (varsayılan: repo kökünden göreli yollar)
 *
 * Bu test MEVCUT DAVRANIŞI DEĞİŞTİRMEZ; yalnızca kaynak disiplinini kanıtlar.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROUTES_DIR = process.argv[2] || path.resolve(process.cwd(), 'server/routes');
const SECURITY_DIR = process.argv[3] || path.resolve(process.cwd(), 'server/security');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ FAIL: ' + msg); }
};

const walkTs = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTs(p));
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
};

console.log('════════ FAZ 25.2-C — TENANT SOURCING CONSISTENCY TEST ════════\n');

// ─── 1. Güvensiz kaynak deseni routes altında 0 ────────────────────────────
console.log('📋 1. Güvensiz tenant kaynağı taraması (routes/)');
const routeFiles = walkTs(ROUTES_DIR);
const UNSAFE_RE = /req\.(query|body)\.tenantId\s+as\s+string|req\.headers\['x-tenant-id'\]/;
const violations = [];
const fileSources = new Map(); // dosya -> kaynak kod (kaçınma)

for (const f of routeFiles) {
  const src = fs.readFileSync(f, 'utf8');
  fileSources.set(f, src);
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // Yorum satırlarındaki örnekler suç değildir (kuralları ANLATAN yorumlar).
    const stripped = line.replace(/\/\/.*$/, '');
    if (UNSAFE_RE.test(stripped)) {
      violations.push(`${path.relative(ROUTES_DIR, f)}:${i + 1}`);
    }
  });
}
ok(violations.length === 0,
  `Güvensiz kaynak deseni 0 (${routeFiles.length} dosya tarandı) — ihlal: ${violations.join(', ') || 'YOK'}`);

// ─── 2. resolveRequestTenantId kullanımı ───────────────────────────────────
console.log('\n📋 2. resolveRequestTenantId merkezi kullanımı');
const EXPECTED_MIN_FILES = 25;
let totalCalls = 0;
const filesWithHelper = [];
for (const [f, src] of fileSources) {
  const n = (src.match(/resolveRequestTenantId\(req\)/g) || []).length;
  if (n > 0) { totalCalls += n; filesWithHelper.push(path.relative(ROUTES_DIR, f)); }
}
ok(filesWithHelper.length >= EXPECTED_MIN_FILES,
  `Helper'ı kullanan dosya ≥ ${EXPECTED_MIN_FILES} (gerçek: ${filesWithHelper.length})`);
ok(totalCalls >= 70,
  `Toplam çağrı ≥ 70 (beklenen ~74, gerçek: ${totalCalls})`);

// ─── 3. Helper'ın TEK tanımı policies.ts'te ────────────────────────────────
console.log('\n📋 3. Helper tek kaynak tanımı (policies.ts)');
const policiesPath = path.join(SECURITY_DIR, 'policies.ts');
ok(fs.existsSync(policiesPath), `policies.ts mevcut: ${policiesPath}`);
const policiesSrc = fs.readFileSync(policiesPath, 'utf8');
ok(/export function resolveRequestTenantId/.test(policiesSrc),
  'policies.ts içinde export function resolveRequestTenantId tanımı var');
ok(/class TenantResolutionError/.test(policiesSrc),
  'fail-closed TenantResolutionError tanımı var');

// Başka bir yerde export edilmiş duplicate tanım var mı? (routes altında tanım yasak)
const duplicateDefs = [];
for (const [f, src] of fileSources) {
  if (/export\s+(function|const)\s+resolveRequestTenantId/.test(src)) {
    duplicateDefs.push(path.relative(ROUTES_DIR, f));
  }
}
ok(duplicateDefs.length === 0,
  `Route katmanında duplicate helper tanımı yok — duplicate: ${duplicateDefs.join(', ') || 'YOK'}`);

// ─── 4. Her swap'li dosya policies'ten import ediyor ───────────────────────
console.log('\n📋 4. Import disiplini (kopya değil, tek kaynaktan türetim)');
const importlessFiles = filesWithHelper.filter(rel => {
  const src = fileSources.get(path.join(ROUTES_DIR, rel));
  return !/from\s+'[^']*security\/policies'/.test(src);
});
ok(importlessFiles.length === 0,
  `Helper çağıran her dosya security/policies'ten import ediyor — eksik: ${importlessFiles.join(', ') || 'YOK'}`);

// ─── 5. mobile.ts FAZ 25.1 deseni korunuyor (regresyon işareti) ────────────
console.log('\n📋 5. FAZ 25.1 mobil deseni korunumu');
const mobilePath = path.join(ROUTES_DIR, 'v1/mobile.ts');
if (fs.existsSync(mobilePath)) {
  const mobileSrc = fs.readFileSync(mobilePath, 'utf8');
  ok(/tenantFromToken\s*=/.test(mobileSrc), 'mobile.ts tenantFromToken deseni yerinde');
  ok(/router\.use\(requireAuth\)/.test(mobileSrc), 'mobile.ts auth gate yerinde');
} else {
  ok(false, 'mobile.ts bulunamadı');
}

// ─── 6. accountant delegasyon istisnası korunuyor ──────────────────────────
console.log('\n📋 6. Mali müşavir delegasyon istisnası (bilinçli kural)');
const accountantPath = path.join(ROUTES_DIR, 'v1/accountant.ts');
const accountantSrc = fs.readFileSync(accountantPath, 'utf8');
ok(/isAccountantAuthorizedForTenant/.test(accountantSrc),
  'accountant.ts delegasyon doğrulaması (isAccountantAuthorizedForTenant) yerinde');

console.log(`\n════════ SONUÇ: ${pass} PASS / ${fail} FAIL ════════`);
process.exit(fail ? 1 : 0);
