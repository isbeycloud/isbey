/**
 * İŞBEY CLOUD — FAZ 25.2-D #4: Frontend MODULE_ACCESS_MATRIX ↔ Backend Role Registry
 * ===================================================================================
 * Kabul (docs/18 25.2-D madde 4, B-5 açık kalem):
 *   Frontend modül matrisindeki roller ile backend rol registry'si
 *   (PLATFORM_ROLE_TO_SLUG) hizalı olmalı; backend'de OLMAYAN rol
 *   etiketi frontend matrisinde kullanILAMAZ.
 *
 * Tarayıcı statiktir; çalıştırma:
 *   node server/tests/faz252dFrontendMatrixAlignmentTest.mjs [modulePermissionsPath]
 *
 * Bilinen yapı taşları:
 *   - src/utils/modulePermissions.ts → MODULE_ACCESS_MATRIX (rol dizileri | 'ALL')
 *   - server/security/roles.ts       → PLATFORM_ROLE_TO_SLUG anahtarları
 *     = 10 platform rolü: SUPER_ADMIN, ADMIN, COMPANY_ADMIN, MUHASEBE,
 *       SATIS, KASA, DEPO, PERSONEL, SAHA, RAPOR
 *
 * Geçmiş bulgu (bu testin varoluş nedeni): cari satırında 'employee'
 * slug'ı platform rolleri arasına karışmış (tenant slug ≠ platform rol).
 */

import fs from 'node:fs';
import path from 'node:path';

const MODULE_PERMS_PATH = process.argv[2] ||
  path.resolve(process.cwd(), 'src/utils/modulePermissions.ts');
const ROLES_PATH = process.argv[3] ||
  path.resolve(process.cwd(), 'server/security/roles.ts');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ FAIL: ' + msg); }
};

// ─── Backend registry: platform rol birliği (PlatformRole union'ı oku) ──────
const rolesSrc = fs.readFileSync(ROLES_PATH, 'utf8');
const unionMatch = rolesSrc.match(/export type PlatformRole\s*=\s*([\s\S]*?);/);
if (!unionMatch) {
  console.error('PlatformRole union bulunamadı (roles.ts)');
  process.exit(1);
}
const BACKEND_PLATFORM_ROLES = [...unionMatch[1].matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);
ok(BACKEND_PLATFORM_ROLES.length >= 10,
  `Backend platform rol sayısı: ${BACKEND_PLATFORM_ROLES.length} (${BACKEND_PLATFORM_ROLES.join(', ')})`);

// ─── Frontend matrisini oku ─────────────────────────────────────────────────
const src = fs.readFileSync(MODULE_PERMS_PATH, 'utf8');
const matrixMatch = src.match(/const MODULE_ACCESS_MATRIX[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!matrixMatch) {
  console.error('MODULE_ACCESS_MATRIX bulunamadı (modulePermissions.ts)');
  process.exit(1);
}
const matrixBlock = matrixMatch[1];

// Her satır: 'modul-id': [...] | 'ALL'   — anahtar TIRNAKLI veya TIRNAKSIZ olabilir.
// DÜZELTME (2026-09-10): önceki desen yalnız TIRNAKLI anahtarları yakalıyordu
// (/'([a-z0-9-]+)'\s*:/). Matriste yalnız tire içeren anahtarlar tırnaklıdır;
// bu yüzden ~37 tırnaksız modül (cari, stok, dashboard, ...) hiç taranmıyordu.
// Sonuçları: (a) sayım yanlış FAIL (23 < 40), (b) tırnaksız satırlardaki geçersiz
// rol etiketleri (ör. cari'deki 'employee') kör noktada kalıp sahte PASS üretiyordu.
// Artık satır başına, iki biçimi de kabul eden bir desenle okunur.
const entries = {};
const entryRe = /^\s*(?:'([a-z0-9-]+)'|([a-z0-9-]+))\s*:\s*(\[[^\]]*\]|'ALL')\s*,?\s*$/;
for (const satir of matrixBlock.split('\n')) {
  const m = entryRe.exec(satir);
  if (m) entries[m[1] || m[2]] = m[3];
}

const moduleCount = Object.keys(entries).length;
ok(moduleCount >= 40, `Frontend matris modül sayısı: ${moduleCount} (≥40 beklenir)`);

// ─── Bölüm 1: Backend'de olmayan rol etiketi = 0 ────────────────────────────
const unknownRoles = [];
const invalidEntries = [];
for (const [mod, val] of Object.entries(entries)) {
  if (val === "'ALL'") continue;
  const roles = [...val.matchAll(/'([^']+)'/g)].map(x => x[1]);
  for (const r of roles) {
    if (!BACKEND_PLATFORM_ROLES.includes(r)) {
      unknownRoles.push({ mod, role: r });
    }
  }
  // boş dizi de geçersiz
  const list = val.match(/\[([^\]]*)\]/);
  if (list && list[1].trim() === '') invalidEntries.push(mod);
}

console.log('\n── Bölüm 1: Bilinmeyen rol etiketi taraması ──');
ok(unknownRoles.length === 0,
  unknownRoles.length === 0
    ? 'Matristeki tüm roller backend PlatformRole kümesinde tanımlı (0 bilinmeyen)'
    : `Bilinmeyen rol etiketi: ${unknownRoles.length} adet → ` +
      unknownRoles.map(u => `${u.mod}:'${u.role}'`).join(', ') +
      ' (tenant slug\'ları platform rolü DEĞİLDİR — düzeltilmeli)');

ok(invalidEntries.length === 0,
  invalidEntries.length === 0
    ? 'Boş rol dizisi olan modül yok'
    : `Boş dizi: ${invalidEntries.join(', ')}`);

// ─── Bölüm 2: Sidebar ↔ matris tutarlılığı (her rol en az 1 modül görmeli) ──
console.log('\n── Bölüm 2: Rol başına sidebar kapsamı ──');
for (const role of BACKEND_PLATFORM_ROLES) {
  const visible = Object.entries(entries).filter(([, v]) =>
    v === "'ALL'" || (v.match(/\[([^\]]*)\]/) || [, ''])[1].includes(`'${role}'`)
  );
  ok(visible.length > 0, `${role}: ${visible.length} modül görünür (≥1)`);
}

// ─── Bölüm 3: Kritik izolasyon değişmezleri (documented davranış) ───────────
console.log('\n── Bölüm 3: Kritik izolasyon değişmezleri ──');
// 3a) platform-admin yalnız SUPER_ADMIN/ADMIN
const pa = entries['platform-admin'] || '';
ok(pa === "['SUPER_ADMIN', 'ADMIN']",
  `platform-admin yalnızca SUPER_ADMIN+ADMIN (${pa})`);
// 3b) SUPER_ADMIN her modülde (ALL dahil)
const superAdminDenied = Object.entries(entries).filter(([, v]) => {
  if (v === "'ALL'") return false;
  const roles = [...v.matchAll(/'([^']+)'/g)].map(x => x[1]);
  return !roles.includes('SUPER_ADMIN');
});
ok(superAdminDenied.length === 0,
  superAdminDenied.length === 0
    ? 'SUPER_ADMIN tüm modüllerde tanımlı (canAccessModule zaten true döndürüyor — matris de tutarlı)'
    : `SUPER_ADMIN eksik modüller: ${superAdminDenied.map(e => e[0]).join(', ')}`);
// 3c) muhasebe-kontrol / mali-musavir SAHA/DEPO/PERSONEL içermez (finansal izolasyon)
for (const mod of ['mali-musavir', 'muhasebe-kontrol', 'edonusum', 'edonusummerkezi']) {
  const v = entries[mod] || '';
  const roles = [...v.matchAll(/'([^']+)'/g)].map(x => x[1]);
  const leak = ['SAHA', 'DEPO', 'PERSONEL', 'KASA', 'SATIS'].filter(r => roles.includes(r));
  ok(leak.length === 0, `${mod} finansal/IDOR duyarlı rollerden arınmış ${leak.length ? '(' + leak.join(',') + ' sızdı!)' : ''}`);
}

// ─── SONUÇ ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(56));
console.log(`  Toplam: ${pass + fail} | ✓ PASS: ${pass} | ✗ FAIL: ${fail}`);
console.log('═'.repeat(56));
if (unknownRoles.length > 0) {
  console.log('\nDÜZELTME ÖNERİSİ: modulePermissions.ts içinde tenant slug (' +
    unknownRoles.map(u => u.role).join(', ') +
    ') yerine karşılık gelen platform rolü kullanılmalı.');
  console.log('Eşleme (roles.ts SLUG_TO_PLATFORM_ROLE): employee→PERSONEL');
}
process.exit(fail > 0 ? 1 : 0);
