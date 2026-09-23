/**
 * İŞBEY CLOUD — FAZ 25.2-D #1: Rol × Endpoint Matris Jeneratörü
 * =============================================================
 * AMAÇ: server/routes altındaki TÜM route tanımlarını statik tarayıp
 * her endpoint'in guard gereksinimini (auth / role / permission) çıkarır;
 * roles.ts registry'siyle birleştirip ROL × ENDPOINT erişim matrisini üretir.
 *
 * ÇIKTI: server/tests/output/authz-matrix.json
 *   { generatedAt, totals, endpoints: [{ method, file, path, guard,
 *      roles: { SUPER_ADMIN: 'ALLOW'|'DENY'|... }, permission }] }
 *
 * STATİK TARAMA KURALLARI (kasıtlı olarak muhafazakâr):
 *   - router dosyasında `router.use(requireAuth)` varsa dosya genel auth'lu.
 *   - `router.METHOD('/yol', guard, handler)` deseninde guard'lar
 *     ilk handler'a kadar olan argümanlardan okunur.
 *   - Hiç guard görünmeyen endpoint → guard:'none(inside-auth-file)' —
 *     securityGate defaultDeny (index.ts app.use('/api', defaultDeny))
 *     zaten requireAuth'u garanti ettiği için bunlar auth-only kabul edilir.
 *   - Bu jeneratör SADECE rapor üretir; davranış değiştirmez.
 *
 * Çalıştırma: node server/tests/faz252dAuthzMatrixGenerator.mjs [routesDir]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROUTES_DIR = process.argv[2] || path.resolve(process.cwd(), 'server/routes');
const OUT_DIR = path.resolve(process.cwd(), 'server/tests/output');
const SECURITY_DIR = process.argv[3] || path.resolve(process.cwd(), 'server/security');

// ─── roles.ts registry birebir kopyası (değişirse matris de değişir) ────────
// Kaynak: server/security/roles.ts — PLATFORM_ROLE_TO_SLUG + ROLE_PERMISSIONS
const PLATFORM_ROLE_TO_SLUG = {
  SUPER_ADMIN: 'platform_admin',
  ADMIN: 'platform_admin',
  COMPANY_ADMIN: 'company_admin',
  MUHASEBE: 'accountant',
  RAPOR: 'viewer',
};
// authGuards davranışı: SUPER_ADMIN ve platform_admin slug'ı her şeye erişir;
// company_admin requirePermission'da tam yetkili (authGuards.ts:172-179).
const ROLE_PERMISSIONS = {
  platform_admin: '*',
  company_admin: '*',
  accountant: [
    'customers.view', 'customers.create', 'customers.update',
    'products.view',
    'invoices.view', 'invoices.create', 'invoices.update', 'invoices.delete', 'invoices.send',
    'quotes.view',
    'waybills.view',
    'cash.view', 'cash.create', 'cash.update', 'cash.delete',
    'expenses.view', 'expenses.create', 'expenses.update',
    'reports.view', 'company.view',
  ],
  employee: [
    'customers.view', 'customers.create',
    'products.view',
    'invoices.view', 'invoices.create',
    'quotes.view', 'quotes.create',
    'waybills.view',
    'cash.view', 'cash.create',
    'expenses.create',
  ],
  viewer: [
    'customers.view', 'products.view', 'invoices.view', 'quotes.view',
    'waybills.view', 'cash.view', 'expenses.view', 'reports.view', 'company.view',
  ],
};
const MATRIX_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'KASA', 'DEPO', 'PERSONEL', 'SAHA', 'RAPOR'];

function slugFor(platformRole) {
  return PLATFORM_ROLE_TO_SLUG[platformRole] || 'employee';
}

function roleAllows(platformRole, guard, permissionCode) {
  // 1) SUPER_ADMIN / ADMIN her zaman ALLOW
  if (platformRole === 'SUPER_ADMIN') return 'ALLOW';
  const slug = slugFor(platformRole);
  if (slug === 'platform_admin') return 'ALLOW'; // ADMIN = platform_admin

  // 2) Guard yoksa auth-only → tüm authenticate kullanıcılar erişir
  if (!guard || guard.type === 'auth-only') return 'ALLOW';

  if (guard.type === 'role') {
    // requireRole platform rol adlarıyla çalışır (authGuards currentRoles: user.role + slug)
    return guard.roles.includes(platformRole) ? 'ALLOW' : 'DENY';
  }
  if (guard.type === 'permission') {
    const perms = ROLE_PERMISSIONS[slug];
    if (perms === '*') return 'ALLOW';
    if (!permissionCode) return 'UNKNOWN';
    if (perms.includes(permissionCode)) return 'ALLOW';
    if (perms.includes(`${permissionCode.split('.')[0]}.*`)) return 'ALLOW';
    return 'DENY';
  }
  return 'UNKNOWN';
}

// ─── PERMISSIONS sabit çözümleyici (permissions.ts → {NAME: 'x.y'}) ─────────
function loadPermissionConstants() {
  const file = path.join(SECURITY_DIR, 'permissions.ts');
  const src = fs.readFileSync(file, 'utf8');
  const block = src.match(/export const PERMISSIONS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!block) throw new Error('PERMISSIONS bloğu permissions.ts içinde bulunamadı');
  const map = {};
  const re = /([A-Z0-9_]+)\s*:\s*'([a-z]+\.[a-z]+)'/g;
  let m;
  while ((m = re.exec(block[1])) !== null) map[m[1]] = m[2];
  return map;
}

// ─── Route taraması ──────────────────────────────────────────────────────────
function walkTs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTs(p));
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Bir route tanım satırı bloğundaki guard zincirini oku.
 *  Strateji: `router.<method>(<args>)` çağrısını, parante dengesine kadar oku,
 *  argüman stringlerinde requireRole/requirePermission ara. */
function extractGuardChain(content, startIdx) {
  const open = content.indexOf('(', startIdx);
  if (open === -1) return null;
  let depth = 0, i = open;
  for (; i < content.length; i++) {
    const ch = content[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) break; }
  }
  const args = content.slice(open + 1, i);
  const guard = { type: 'auth-only' };
  const roleMatch = args.match(/requireRole\(\s*([^)]*)\)/);
  if (roleMatch) {
    guard.type = 'role';
    guard.roles = [...roleMatch[1].matchAll(/['"]([A-Z_]+)['"]/g)].map(x => x[1]);
  }
  const permMatch = args.match(/requirePermission\(\s*([^)]+)\)/);
  if (permMatch && guard.type !== 'role') {
    const arg = permMatch[1].trim();
    const lit = arg.match(/^['"]([a-z]+\.[a-z]+)['"]$/);
    const konst = arg.match(/^PERMISSIONS\.([A-Z0-9_]+)$/);
    if (lit) { guard.type = 'permission'; guard.code = lit[1]; }
    else if (konst && permissionConstants[konst[1]]) {
      guard.type = 'permission';
      guard.code = permissionConstants[konst[1]];
    } else {
      guard.type = 'permission-unknown';
      guard.code = arg;
    }
  }
  return guard;
}

/**
 * Dengeli parantezle argüman dilimini oku.
 * NEDEN: eski kod `router\.use\(([^)]*)\)` kullanıyordu; `[^)]*` İLK ')' karakterinde
 * durur. `requireRole('SUPER_ADMIN', 'ADMIN')` gibi İÇ İÇE parantezli bir çağrıda bu,
 * dilimi "requireRole('SUPER_ADMIN', 'ADMIN'" noktasında kesiyor → requireRole hiç
 * eşleşmiyor → dosya-genel rol koruması GÖRÜLMÜYOR ve uç yanlışlıkla "auth-only"
 * sayılıyor. Sonuç: matris, korumalı uçları tüm rollere ALLOW diye yazıyor; runtime
 * suite de gerçek 403 cevabını "beklenti ALLOW → 403" diye FAIL raporluyor
 * (koşu #3: tenants 16 + admin-saas 32 = 48 FAIL'in kök nedeni).
 * extractGuardChain() bu sorunu zaten doğru çözüyordu; aynı mantık buraya taşındı.
 */
function balancedArgs(content, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return content.slice(openIdx + 1, i); }
  }
  return content.slice(openIdx + 1);
}

/** `routerName.use(...)` çağrılarının argüman gövdelerini dengeli okur. */
function fileWideUseArgs(content, routerName) {
  const out = [];
  const re = new RegExp(`${routerName}\\s*\\.\\s*use\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push(balancedArgs(content, m.index + m[0].length - 1));
  }
  return out;
}

const permissionConstants = loadPermissionConstants();

const results = [];
const files = walkTs(ROUTES_DIR);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(ROUTES_DIR, file).replace(/\\/g, '/');

  // Router değişken adı: export const xRouter = Router() | const router = Router()
  const routerDecl = content.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:express\.)?Router\(\s*\)/);
  if (!routerDecl) continue;
  const routerName = routerDecl[1];

  // Dosya genel auth (router.use(requireAuth) veya requireAuth zincirli)
  const fileWideAuth = /router\.use\(\s*requireAuth\s*\)/.test(content) ||
    new RegExp(`${routerName}\\.use\\(\\s*requireAuth\\s*\\)`).test(content);

  // FAZ 25.2-D: Dosya genel requireRole (ör. tenants.ts, v1/admin-saas.ts, users.ts)
  // → dosyadaki auth-only görünen uçlar aslında bu rol korumasının ARDINDADIR.
  // Desenler: router.use(requireRole(...)) VEYA router.use(requireAuth, requireRole(...))
  // NOT: argüman gövdesi DENGELİ parantezle okunur (bkz. balancedArgs) — aksi halde
  // requireRole('SUPER_ADMIN', 'ADMIN') iç içe parantezi yüzünden hiç görülmez.
  const fileWideRoles = [];
  for (const useArgs of fileWideUseArgs(content, routerName)) {
    for (const roleCall of useArgs.matchAll(/requireRole\(\s*([^)]*)\)/g)) {
      for (const rm of roleCall[1].matchAll(/['"]([A-Z_]+)['"]/g)) fileWideRoles.push(rm[1]);
    }
  }
  const hasFileWideRoles = fileWideRoles.length > 0;

  // Her route tanımını bul
  const routeRe = new RegExp(
    `${routerName}\\s*\\.\\s*(get|post|put|patch|delete|all)\\s*\\(`,
    'g'
  );
  let m;
  const seen = new Set();
  while ((m = routeRe.exec(content)) !== null) {
    const method = m[1].toUpperCase();
    const afterOpen = content.slice(m.index, m.index + 4000);
    // routeRe "router.get(" ile eşleşti → yol, ilk açılış parantezinden sonra gelir
    const pathMatch = afterOpen.match(/\(\s*['"`]([^'"`]+)['"`]/);
    if (!pathMatch) continue;
    const subpath = pathMatch[1];
    const key = `${method} ${relFile} ${subpath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const guard = extractGuardChain(content, m.index);
    const guardType = guard ? guard.type : 'auth-only';
    const isFileAuth = fileWideAuth && (guardType === 'auth-only');

    // Dosya-genel requireRole birleşimi: uç bazlı guard auth-only ise
    // etkin guard dosya-genel rol korumasıdır; requireRole/requirePermission
    // varsa zaten kendi guard'ı belirleyicidir (ekrol en kısıtlayıcıyı verir).
    let effectiveGuard = guardType === 'permission-unknown' ? { type: 'permission' } : guard;
    if (hasFileWideRoles && (!guard || guard.type === 'auth-only')) {
      effectiveGuard = { type: 'role', roles: fileWideRoles };
    }

    results.push({
      method,
      file: relFile,
      path: subpath,
      guard: hasFileWideRoles && (!guard || guard.type === 'auth-only')
        ? `role (dosya-genel: ${fileWideRoles.join(', ')})`
        : fileWideAuth && guardType === 'auth-only' ? 'auth (dosya-genel requireAuth)' : guardType,
      permission: guard && (guard.type === 'permission' || guard.type === 'permission-unknown') ? guard.code || null : null,
      roles: Object.fromEntries(MATRIX_ROLES.map(r => [r, roleAllows(r, effectiveGuard, guard && guard.code)])),
      fileWideAuth,
      fileWideRoles: hasFileWideRoles ? fileWideRoles : null,
    });
  }
}

// ─── Özet ────────────────────────────────────────────────────────────────────
const totals = {
  files: files.length,
  endpoints: results.length,
  byGuard: results.reduce((acc, e) => {
    acc[e.guard] = (acc[e.guard] || 0) + 1;
    return acc;
  }, {}),
  unknownGuards: results.filter(e => e.guard === 'permission-unknown').length,
  publicCandidates: 0, // securityGate PUBLIC_ROUTES ile karşılaştırma runtime suitinde
};

// public uçları securityGate'ten oku (bilgi amaçlı)
const gateSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/middleware/securityGate.ts'), 'utf8');
const publicPatterns = [...gateSrc.matchAll(/pattern:\s*([^,\n]+)[,}]/g)].map(x => x[1].trim());
totals.securityGatePublicRoutes = publicPatterns.length;

const matrix = {
  generatedAt: new Date().toISOString(),
  registrySource: 'server/security/roles.ts (PLATFORM_ROLE_TO_SLUG + ROLE_PERMISSIONS statik kopya)',
  totals,
  endpoints: results,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'authz-matrix.json');
fs.writeFileSync(outPath, JSON.stringify(matrix, null, 2), 'utf8');

// ─── Konsol raporu ───────────────────────────────────────────────────────────
console.log('═'.repeat(64));
console.log(' İŞBEY FAZ 25.2-D #1 — Rol × Endpoint Matris Jeneratörü');
console.log('═'.repeat(64));
console.log(`  Taranan dosya      : ${totals.files}`);
console.log(`  Bulunan endpoint   : ${totals.endpoints}`);
console.log(`  Guard dağılımı     : ${JSON.stringify(totals.byGuard)}`);
console.log(`  Bilinmeyen guard   : ${totals.unknownGuards} (permission-unknown — manuel işaret)`);
console.log(`  securityGate public: ${totals.securityGatePublicRoutes} desen (bilgi)`);
console.log(`  Çıktı              : ${path.relative(process.cwd(), outPath)}`);
console.log('═'.repeat(64));

// Rol × guard özet istatistiği
for (const role of MATRIX_ROLES) {
  const allow = results.filter(e => e.roles[role] === 'ALLOW').length;
  const deny = results.filter(e => e.roles[role] === 'DENY').length;
  const unknown = results.filter(e => e.roles[role] === 'UNKNOWN').length;
  console.log(`  ${role.padEnd(14)} ALLOW: ${String(allow).padStart(4)}  DENY: ${String(deny).padStart(4)}  UNKNOWN: ${unknown}`);
}

process.exit(0);
