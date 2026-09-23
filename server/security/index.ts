/**
 * İŞBEY CLOUD — FAZ 25.2-B SECURITY REGISTRY BARREL
 * =================================================
 * Tek import noktası:
 *   import { PERMISSIONS, ROLES, roleHasPermission } from '../security';
 *
 * Tüketim (hedef mimari):
 *   permissions.ts ──┬── backend guards (authGuards.requirePermission)
 *                    ├── storage seed (db/storage.ts)
 *                    ├── frontend üretim hattı (scripts/generate-permission-map.ts)
 *                    └── authorization tests
 */

import {
  isKnownPermission,
  assertNoDuplicatePermissions,
  RESERVED_PERMISSION_CODES,
} from './permissions';
import {
  assertNoDuplicateRoleSlugs,
  ROLE_PERMISSIONS,
} from './roles';

export * from './permissions';
export * from './roles';
export * from './policies';

// ─── Tüm registry tutarlılık denetimi (test + startup kullanabilir) ────────

export function assertRegistryConsistency(): void {
  // permissions.ts ve roles.ts iç duplicate denetimi
  assertNoDuplicatePermissions();
  assertNoDuplicateRoleSlugs();

  // Rol matrisinde tanımsız kod bulunamaz
  for (const [slug, perms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const code of perms) {
      if (!isKnownPermission(code)) {
        throw new Error(
          `Rol "${slug}" registry'de tanımsız permission kullanıyor: "${code}"`
        );
      }
    }
  }

  // Rezerve set gerçekten katalogda olmalı
  for (const code of RESERVED_PERMISSION_CODES) {
    if (!isKnownPermission(code)) {
      throw new Error(`Rezerve kod katalogda yok: "${code}"`);
    }
  }
}
