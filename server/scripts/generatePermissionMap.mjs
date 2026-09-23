/**
 * İŞBEY CLOUD — FAZ 25.3-E (B-4) PERMISSION MAP ÜRETİM HATTI
 * ==========================================================
 * Registry (server/security — TEK KAYNAK) → frontend snapshot üretir.
 *
 * Kullanım (VM / derlenmiş barrel ile):
 *   node server/scripts/generatePermissionMap.mjs <registry-barrel-dir> <çıktı.json>
 *   örn: node server/scripts/generatePermissionMap.mjs /tmp/f25out src/generated/permission-map.json
 *
 * Üretilen dosya frontend'in mevcut davranışını DEĞİŞTİRMEZ (snapshot/reference);
 * MODULE_ACCESS_MATRIX (src/utils/modulePermissions.ts) V4 kararıyla dokunulmazdır.
 * Hattın amacı: registry'deki kanonik kodların frontend tarafına derleme
 * zamanında taşınabilmesi ve registry testi ile güncellik denetimi yapılması.
 *
 * Güncellik kuralı: registry değişirse bu script yeniden çalıştırılmalıdır;
 * faz252bPermissionRegistryTest.mjs §6 snapshot'ın güncelliğini zorunlu tutar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const registryDir = process.argv[2];
const outPath = process.argv[3];

if (!registryDir || !outPath) {
  console.error('Kullanım: node generatePermissionMap.mjs <registry-barrel-dir> <çıktı.json>');
  process.exit(2);
}

let reg;
try {
  reg = await import(pathToFileURL(path.join(registryDir, 'index.js')));
} catch (e) {
  console.error(`Registry barrel yüklenemedi (${registryDir}): ${e.message}`);
  process.exit(2);
}

// ─── Registry'den üretim ────────────────────────────────────────────────────
const catalog = (reg.PERMISSION_CATALOG || []).map(p => ({
  code: p.code,
  module: p.module,
  action: p.action,
  name: p.name,
  description: p.description,
}));

// Katalog dışı kalan kodlar (resmileştirilen 7 gibi) — meta'sız listelenir
const catalogCodes = new Set(catalog.map(p => p.code));
const extra = (reg.ALL_PERMISSION_CODES || [])
  .filter(c => !catalogCodes.has(c))
  .map(code => ({ code, module: null, action: null, name: null, description: null, catalog: false }));

const permissions = [
  ...catalog.map(p => ({ ...p, catalog: true })),
  ...extra,
];

const roles = {};
for (const [slug, perms] of Object.entries(reg.ROLE_PERMISSIONS || {})) {
  roles[slug] = [...perms];
}

const payload = {
  $schema: 'isbey-permission-map/v1',
  generatedAt: new Date().toISOString(),
  source: 'server/security (FAZ 25.2-B registry — TEK KAYNAK)',
  generator: 'server/scripts/generatePermissionMap.mjs',
  counts: {
    permissions: permissions.length,
    catalogEntries: catalog.length,
    roles: Object.keys(roles).length,
  },
  reserved: [...(reg.RESERVED_PERMISSION_CODES || [])],
  permissions,
  roles,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`✓ permission-map üretildi: ${outPath}`);
console.log(`  permissions: ${payload.counts.permissions} (katalog: ${payload.counts.catalogEntries})`);
console.log(`  roles: ${payload.counts.roles} → ${Object.entries(roles).map(([s, p]) => `${s}=${p.length}`).join(', ')}`);
