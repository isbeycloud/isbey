/**
 * İŞBEY CLOUD — FAZ 25.2-B PERMISSION REGISTRY CONSISTENCY TEST
 * ============================================================
 * Kabul kriterleri (onaylı):
 *   - Permission tek kaynak            → server/security/permissions.ts
 *   - Duplicate permission tanımı      → 0
 *   - Route registry uyumu             → %100 (routes/ altındaki her
 *     requirePermission('...') kodu registry'de TANIMLI olmalı)
 *   - Storage seed ↔ registry uyumu    → seed'in tüm kodları registry alt kümesi
 *   - Rol matrisi ↔ registry           → seed davranışı birebir
 *
 * Çalıştırma:
 *   - Normal ortam:  npx tsx server/tests/faz252bPermissionRegistryTest.mjs
 *   - VM (derlenmiş): node faz252bPermissionRegistryTest.mjs /tmp/f25/out
 *     (argv[2] = derlenmiş security barrel dizini — index.js içerir)
 *
 * Bu test MEVCUT DAVRANIŞI DEĞİŞTİRMEZ; yalnızca tutarlılığı kanıtlar.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// ─── Registry yükleme (argv[2] veya varsayılan) ────────────────────────────
const registryDir = process.argv[2] || path.resolve(process.cwd(), 'server/security');
let reg;
try {
  // Derlenmiş barrel: index.js (aynı dizinde permissions.js, roles.js, policies.js)
  reg = await import(pathToFileURL(path.join(registryDir, 'index.js')));
} catch {
  console.error(`Registry modülü yüklenemedi: ${registryDir}`);
  console.error('VM kullanımı: node faz252bPermissionRegistryTest.mjs <derlenen-barrel-dizini>');
  process.exit(2);
}

import { pathToFileURL } from 'node:url';

// ─── Yardımcılar ───────────────────────────────────────────────────────────
const ROUTES_DIR = process.argv[3] || path.resolve(process.cwd(), 'server/routes');
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
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

console.log('════════ FAZ 25.2-B — PERMISSION REGISTRY CONSISTENCY TEST ════════\n');

// ─── 1. Registry iç tutarlılık: duplicate 0 ────────────────────────────────
console.log('📋 1. Registry iç tutarlılık');
try {
  reg.assertRegistryConsistency();
  ok(true, `assertRegistryConsistency() — duplicate tanım 0, rol matrisi tanımsız kod içermiyor`);
} catch (e) {
  ok(false, `assertRegistryConsistency() hata fırlattı: ${e.message}`);
}
ok(reg.ALL_PERMISSION_CODES.length > 0, `Katalog boş değil: ${reg.ALL_PERMISSION_CODES.length} kod`);

// ─── 2. Route ↔ Registry uyumu: %100 ───────────────────────────────────────
console.log('\n📋 2. Route → Registry uyumu (routes/ taraması)');
const routeFiles = walkTs(ROUTES_DIR);
const routeCodes = new Map(); // code -> [dosya:line]
const unresolvedCalls = [];
for (const f of routeFiles) {
  const source = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'requirePermission') {
      const arg = node.arguments[0];
      const location = `${path.relative(ROUTES_DIR, f)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
      let code;
      if (arg && ts.isStringLiteralLike(arg)) {
        code = arg.text;
      } else if (arg && ts.isPropertyAccessExpression(arg) && ts.isIdentifier(arg.expression) && arg.expression.text === 'PERMISSIONS') {
        code = reg.PERMISSIONS[arg.name.text];
      }
      if (typeof code !== 'string') {
        unresolvedCalls.push(`${location} (${arg?.getText(source) || 'boş argüman'})`);
      } else {
        if (!routeCodes.has(code)) routeCodes.set(code, []);
        routeCodes.get(code).push(location);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
ok(routeCodes.size > 0, `Route taraması boş değil (${routeCodes.size} unique kod)`);
ok(unresolvedCalls.length === 0, `Çözümlenemeyen requirePermission çağrısı yok — ${unresolvedCalls.join(', ') || 'YOK'}`);

const reserved = new Set(reg.RESERVED_PERMISSION_CODES);
const unknownInRoutes = [...routeCodes.keys()].filter(c => !reg.isKnownPermission(c));
ok(unknownInRoutes.length === 0,
  `Route'larda kullanılan her kod registry'de tanımlı (${routeCodes.size} unique kod) — tanımsız: ${unknownInRoutes.join(', ') || 'YOK'}`);

// Rezerve kodlar route'larda BAĞLI OLMAMALI (25.2-B kararı: rezerve set henüz bağlanmaz)
const reservedBound = [...routeCodes.keys()].filter(c => reserved.has(c));
ok(reservedBound.length === 0,
  `Rezerve kodlar henüz route'lara bağlanmadı (${reserved.size} rezerve kod) — bağlı: ${reservedBound.join(', ') || 'YOK'}`);

// Route'lardaki her kod, PERMISSIONS sabitlerinden biri ile birebir eşleşmeli
// (string literal sürüklenmesi yerine sabit kullanımı hedefi — B-3'te zorunlu olacak)
const permValues = new Set(reg.ALL_PERMISSION_CODES);
const allRouteCodesKnown = [...routeCodes.keys()].every(c => permValues.has(c));
ok(allRouteCodesKnown, 'Route kodlarının tamamı PERMISSIONS değerleriyle eşleşiyor');

// ─── 3. Storage seed → Registry türetimi (FAZ 25.3-E B-2 sonrası) ──────────
console.log('\n📋 3. Storage seed → Registry türetimi');
const storagePath = path.resolve(ROUTES_DIR, '../db/storage.ts');
const storageSrc = fs.readFileSync(storagePath, 'utf8');
const seedBlock = storageSrc.slice(
  storageSrc.indexOf('seedDefaultRolesAndPermissions'),
  storageSrc.indexOf('private migrateTenantUsers')
);

// B-2: seed artık registry'den türetilir — import'lar zorunlu
ok(storageSrc.includes("from '../security'") || storageSrc.includes('from "../security"'),
  'storage.ts security registry barrel\'dan import ediyor (tek kaynak)');

ok(/\bPERMISSION_CATALOG\b/.test(seedBlock) && /\bROLE_DEFINITIONS\b/.test(seedBlock) && /\bROLE_PERMISSIONS\b/.test(seedBlock),
  'seed bloğu PERMISSION_CATALOG + ROLE_DEFINITIONS + ROLE_PERMISSIONS türetimi kullanıyor');

// B-2 sonrası seed'de literal permission tanımı KALMAMALI (duplicate tanımın sıfırlanması)
const seedLiteralCodes = [...seedBlock.matchAll(/code:\s*'([^']+)'/g)].map(m => m[1]);
ok(seedLiteralCodes.length === 0,
  `Seed bloğunda literal permission tanımı kalmadı (duplicate tanım 0) — kalan: ${seedLiteralCodes.join(', ') || 'YOK'}`);

// Seed katalog meta'sı registry ile birebir: 37 girdi, kodları registry üyesi
ok(reg.SEED_CATALOG_CODES && reg.SEED_CATALOG_CODES.length === 37,
  `SEED_CATALOG_CODES 37 girdi (${reg.SEED_CATALOG_CODES ? reg.SEED_CATALOG_CODES.length : 'yok'})`);
const seedCatUnknown = (reg.SEED_CATALOG_CODES || []).filter(c => !reg.isKnownPermission(c));
ok(seedCatUnknown.length === 0,
  `Seed katalog kodlarının tamamı registry'de — dışarıda: ${seedCatUnknown.join(', ') || 'YOK'}`);
// Katalog sırası db perm-1..37 id şemasına bağlı — duplicate olmamalı
ok(new Set(reg.SEED_CATALOG_CODES || []).size === (reg.SEED_CATALOG_CODES || []).length,
  'Seed katalog kodları tekrarsız (sıra şeması güvenli)');

// ─── 4. Rol matrisi ↔ Registry (B-2: matrisin TEK KAYNAĞI roles.ts) ────────
console.log('\n📋 4. Rol matrisi ↔ Registry birebir (seed bu matristen türetilir)');
const S = reg.ROLE_SLUGS;
const arr = s => [...new Set(s)].sort();

// Onaylı referans sayılar (docs/13): accountant=20, employee=11, viewer=9
ok(reg.ROLE_PERMISSIONS[S.ACCOUNTANT].length === 20 && arr(reg.ROLE_PERMISSIONS[S.ACCOUNTANT]).length === 20,
  `accountant matrisi 20 izin (onaylı referans)`);
ok(reg.ROLE_PERMISSIONS[S.EMPLOYEE].length === 11 && arr(reg.ROLE_PERMISSIONS[S.EMPLOYEE]).length === 11,
  `employee matrisi 11 izin (onaylı referans)`);
ok(reg.ROLE_PERMISSIONS[S.VIEWER].length === 9 && arr(reg.ROLE_PERMISSIONS[S.VIEWER]).length === 9,
  `viewer matrisi 9 izin (onaylı referans)`);

// Matris kodlarının tamamı registry'de (index.assertRegistryConsistency da kapsar)
const matrixUnknown = Object.values(reg.ROLE_PERMISSIONS).flat().filter(c => !reg.isKnownPermission(c));
ok(matrixUnknown.length === 0, `Rol matrisi kodlarının tamamı tanımlı — tanımsız: ${matrixUnknown.join(', ') || 'YOK'}`);

// ── B-1 spec kontrol 3: Boş rol tanımı 0 ──────────────────────────────────
// Her rol en az 1 izin içermeli (boş dizi = yanlışlıkla silinmiş matris sinyali).
// Not: İleride gerçekten "izin verilmeyen" bir rol gerekirse bu test bilinçli
// güncellenmelidir (boş dizi o zaman meşru olur).
const emptyRoles = Object.entries(reg.ROLE_PERMISSIONS)
  .filter(([slug, perms]) => !Array.isArray(perms) || perms.length === 0)
  .map(([slug]) => slug);
ok(emptyRoles.length === 0, `Boş rol tanımı yok (her rol >0 izin) — boş: ${emptyRoles.join(', ') || 'YOK'}`);

// ── B-1 spec kontrol 4: Bilinmeyen rol 0 ──────────────────────────────────
// ROLE_PERMISSIONS ve ROLE_DEFINITIONS anahtarları ROLE_SLUGS kümesine birebir eşit olmalı:
// bilinmeyen slug (typo) veya eksik tanım sessizce boş izin kümesi üretir.
const knownSlugs = new Set(Object.values(reg.ROLE_SLUGS));
const unknownRoleSlugs = Object.keys(reg.ROLE_PERMISSIONS).filter(slug => !knownSlugs.has(slug));
ok(unknownRoleSlugs.length === 0, `Rol matrisinde bilinmeyen slug yok (${knownSlugs.size} sistem rolü) — bilinmeyen: ${unknownRoleSlugs.join(', ') || 'YOK'}`);
ok(Object.keys(reg.ROLE_PERMISSIONS).length === knownSlugs.size,
  `Rol matrisi tüm sistem rollerini kapsıyor (${Object.keys(reg.ROLE_PERMISSIONS).length}/${knownSlugs.size})`);
const defSlugs = Object.keys(reg.ROLE_DEFINITIONS || {});
ok(defSlugs.length === knownSlugs.size && defSlugs.every(s => knownSlugs.has(s)),
  `ROLE_DEFINITIONS slug kümesi birebir (${defSlugs.length}/${knownSlugs.size})`);
// Rol meta'sı (ad/açıklama) boş bırakılamaz — UI seed'i boş isimli rol üretmesin
const emptyMeta = Object.entries(reg.ROLE_DEFINITIONS || {})
  .filter(([, d]) => !d || !d.name || !d.name.trim() || !d.description || !d.description.trim())
  .map(([s]) => s);
ok(emptyMeta.length === 0, `Rol ad/açıklamaları tam dolu — eksik: ${emptyMeta.join(', ') || 'YOK'}`);

// company_admin = tüm izinler − tenants.manage (seed kuralı)
const ca = reg.ROLE_PERMISSIONS[S.COMPANY_ADMIN];
ok(!ca.includes('tenants.manage') && ca.length === reg.ALL_PERMISSION_CODES.length - 1,
  `company_admin = tüm izinler − tenants.manage (${ca.length}/${reg.ALL_PERMISSION_CODES.length})`);

// platform_admin = tüm izinler
const pa = reg.ROLE_PERMISSIONS[S.PLATFORM_ADMIN];
ok(pa.length === reg.ALL_PERMISSION_CODES.length, `platform_admin = tüm izinler (${pa.length})`);

// ─── 5. Rol davranış örnekleri (authGuards ile aynı semantik) ──────────────
console.log('\n📋 5. Rol davranış kontrol örnekleri');
ok(reg.roleHasPermission(S.VIEWER, 'cash.create') === false, 'viewer cash.create → false');
ok(reg.roleHasPermission(S.ACCOUNTANT, 'invoices.send') === true, 'accountant invoices.send → true');
ok(reg.roleHasPermission(S.EMPLOYEE, 'customers.delete') === false, 'employee customers.delete → false');
ok(reg.roleHasPermission(S.COMPANY_ADMIN, 'tenants.manage') === false, 'company_admin tenants.manage → false');
ok(reg.roleHasPermission(S.PLATFORM_ADMIN, 'tenants.manage') === true, 'platform_admin tenants.manage → true');
ok(reg.isKnownPermission('nonexistent.code') === false, 'tanımsız kod isKnownPermission → false');

// ─── 6. Frontend snapshot güncelliği (FAZ 25.3-E B-4 üretim hattı) ─────────
console.log('\n📋 6. Frontend permission-map güncellik denetimi');
const mapPath = path.resolve(ROUTES_DIR, '../../src/generated/permission-map.json');
if (fs.existsSync(mapPath)) {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const mapCodes = new Set((map.permissions || []).map(p => p.code));
  const regCodes = new Set(reg.ALL_PERMISSION_CODES);
  const missingInMap = [...regCodes].filter(c => !mapCodes.has(c));
  const extraInMap = [...mapCodes].filter(c => !regCodes.has(c));
  ok(missingInMap.length === 0 && extraInMap.length === 0,
    `Snapshot kodları registry ile birebir (${mapCodes.size} kod) — eksik: ${missingInMap.join(', ') || 'YOK'} fazla: ${extraInMap.join(', ') || 'YOK'}`);
  const mapRoleOk = Object.entries(reg.ROLE_PERMISSIONS).every(([slug, perms]) => {
    const m = (map.roles || {})[slug] || [];
    return [...perms].sort().join() === [...m].sort().join();
  });
  ok(mapRoleOk, 'Snapshot rol matrisleri registry ile birebir');
  ok(map.reserved && [...map.reserved].sort().join() === [...reg.RESERVED_PERMISSION_CODES].sort().join(),
    'Snapshot rezerve kod listesi birebir');
} else {
  ok(false, `permission-map.json bulunamadı: ${mapPath} — generatePermissionMap.mjs çalıştırılmalı`);
}

console.log(`\n════════ SONUÇ: ${pass} PASS / ${fail} FAIL ════════`);
process.exit(fail ? 1 : 0);
