/**
 * İŞBEY CLOUD — FAZ 25.2-B ROLE REGISTRY (TEK KAYNAK)
 * ===================================================
 * Rol ↔ permission ilişkisinin kanonik kaynağı. db/storage.ts seed'i
 * bu matristen türetilir (FAZ 25.2-B ile birebir uyum testi zorunlu).
 *
 * İki katmanlı rol modeli (mevcut davranış korunur):
 *  - Platform rolü (User.role): UserRole — SUPER_ADMIN, ADMIN, COMPANY_ADMIN,
 *    MUHASEBE, SATIS, KASA, DEPO, PERSONEL, SAHA, RAPOR (db/schema.ts).
 *    NOT: Kodda 'PLATFORM_ADMIN' diye ayrı rol YOKTUR (= SUPER_ADMIN/ADMIN);
 *    'USER' etiketi employee slug'ına karşılık gelir.
 *  - Tenant rolü (TenantUser.roleSlug): ROLE_SLUGS aşağıdaki 5 sistem rolü.
 *
 * Kaynak doğrulaması: storage.ts seedDefaultRolesAndPermissions (satır 218-309)
 * — bu dosyadaki matris o bloğun birebir yansımasıdır.
 */

import { PERMISSIONS, ALL_PERMISSION_CODES } from './permissions';
import type { PermissionCode } from './permissions';

// ─── Tenant rol slug'ları (db.roles.slug) ───────────────────────────────────

export const ROLE_SLUGS = {
  PLATFORM_ADMIN: 'platform_admin',
  COMPANY_ADMIN: 'company_admin',
  ACCOUNTANT: 'accountant',
  EMPLOYEE: 'employee',
  VIEWER: 'viewer',
} as const;

export type RoleSlug = (typeof ROLE_SLUGS)[keyof typeof ROLE_SLUGS];

// ─── Platform rol birliği (db/schema.ts UserRole yansıması) ────────────────

export type PlatformRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'COMPANY_ADMIN'
  | 'MUHASEBE'
  | 'SATIS'
  | 'KASA'
  | 'DEPO'
  | 'PERSONEL'
  | 'SAHA'
  | 'RAPOR';

/**
 * Platform rol → tenant slug eşlemesi.
 * authGuards.requireAuth içindeki eşlemenin TEK KAYNAĞI (FAZ 25.2-B B-3'te
 * oradan buraya referans edilecektir; şimdilik davranış birebir korunur).
 */
export const PLATFORM_ROLE_TO_SLUG: Record<string, RoleSlug> = {
  SUPER_ADMIN: ROLE_SLUGS.PLATFORM_ADMIN,
  ADMIN: ROLE_SLUGS.PLATFORM_ADMIN,
  COMPANY_ADMIN: ROLE_SLUGS.COMPANY_ADMIN,
  MUHASEBE: ROLE_SLUGS.ACCOUNTANT,
  RAPOR: ROLE_SLUGS.VIEWER,
};

// Slug → platform rol karşılığı (moduleGate ROLE_SLUG_MAP'in tersi; tenant
// kullanıcı login akışlarında tenant rolünün UI rolüne çevrilmesi için).
export const SLUG_TO_PLATFORM_ROLE: Record<RoleSlug, PlatformRole | null> = {
  [ROLE_SLUGS.PLATFORM_ADMIN]: 'ADMIN',
  [ROLE_SLUGS.COMPANY_ADMIN]: 'COMPANY_ADMIN',
  [ROLE_SLUGS.ACCOUNTANT]: 'MUHASEBE',
  [ROLE_SLUGS.EMPLOYEE]: 'PERSONEL',
  [ROLE_SLUGS.VIEWER]: 'RAPOR',
};

// ─── Rol → Permission matrisi (storage seed ile birebir) ───────────────────

/** Platform süper yöneticisi: tüm izinler (seed'deki allCodes ile aynı liste). */
const PLATFORM_ADMIN_PERMISSIONS: readonly PermissionCode[] = ALL_PERMISSION_CODES;

/** Firma yöneticisi: tenants.manage dışındaki tüm izinler (seed companyAdminCodes). */
const COMPANY_ADMIN_PERMISSIONS: readonly PermissionCode[] =
  ALL_PERMISSION_CODES.filter(c => c !== PERMISSIONS.TENANTS_MANAGE);

/** Mali müşavir (seed accountantCodes — birebir). */
const ACCOUNTANT_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSIONS.CUSTOMERS_VIEW,
  PERMISSIONS.CUSTOMERS_CREATE,
  PERMISSIONS.CUSTOMERS_UPDATE,
  PERMISSIONS.PRODUCTS_VIEW,
  PERMISSIONS.INVOICES_VIEW,
  PERMISSIONS.INVOICES_CREATE,
  PERMISSIONS.INVOICES_UPDATE,
  PERMISSIONS.INVOICES_DELETE,
  PERMISSIONS.INVOICES_SEND,
  PERMISSIONS.QUOTES_VIEW,
  PERMISSIONS.WAYBILLS_VIEW,
  PERMISSIONS.CASH_VIEW,
  PERMISSIONS.CASH_CREATE,
  PERMISSIONS.CASH_UPDATE,
  PERMISSIONS.CASH_DELETE,
  PERMISSIONS.EXPENSES_VIEW,
  PERMISSIONS.EXPENSES_CREATE,
  PERMISSIONS.EXPENSES_UPDATE,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.COMPANY_VIEW,
];

/** Personel / Satış (seed employeeCodes — birebir). */
const EMPLOYEE_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSIONS.CUSTOMERS_VIEW,
  PERMISSIONS.CUSTOMERS_CREATE,
  PERMISSIONS.PRODUCTS_VIEW,
  PERMISSIONS.INVOICES_VIEW,
  PERMISSIONS.INVOICES_CREATE,
  PERMISSIONS.QUOTES_VIEW,
  PERMISSIONS.QUOTES_CREATE,
  PERMISSIONS.WAYBILLS_VIEW,
  PERMISSIONS.CASH_VIEW,
  PERMISSIONS.CASH_CREATE,
  PERMISSIONS.EXPENSES_CREATE,
];

/** İzleyici / Salt okunur (seed viewerCodes — birebir). */
const VIEWER_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSIONS.CUSTOMERS_VIEW,
  PERMISSIONS.PRODUCTS_VIEW,
  PERMISSIONS.INVOICES_VIEW,
  PERMISSIONS.QUOTES_VIEW,
  PERMISSIONS.WAYBILLS_VIEW,
  PERMISSIONS.CASH_VIEW,
  PERMISSIONS.EXPENSES_VIEW,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.COMPANY_VIEW,
];

/** Slug → izin listesi (tek kaynak matris). */
export const ROLE_PERMISSIONS: Record<RoleSlug, readonly PermissionCode[]> = {
  [ROLE_SLUGS.PLATFORM_ADMIN]: PLATFORM_ADMIN_PERMISSIONS,
  [ROLE_SLUGS.COMPANY_ADMIN]: COMPANY_ADMIN_PERMISSIONS,
  [ROLE_SLUGS.ACCOUNTANT]: ACCOUNTANT_PERMISSIONS,
  [ROLE_SLUGS.EMPLOYEE]: EMPLOYEE_PERMISSIONS,
  [ROLE_SLUGS.VIEWER]: VIEWER_PERMISSIONS,
};

/**
 * Rol tanım metadata'sı — storage seed'deki Role kayıtlarının statik alanları.
 * (id öneki, ad, açıklama) — seed bu kaynaktan türetilir.
 */
export const ROLE_DEFINITIONS: Record<
  RoleSlug,
  { id: string; name: string; description: string }
> = {
  [ROLE_SLUGS.PLATFORM_ADMIN]: {
    id: 'role-platform-admin',
    name: 'Platform Süper Yöneticisi',
    description: 'Sistem genelinde tam yetkili platform admin rolü',
  },
  [ROLE_SLUGS.COMPANY_ADMIN]: {
    id: 'role-company-admin',
    name: 'Firma Yöneticisi (Company Admin)',
    description: 'Firma dahilindeki tüm modülleri, kullanıcıları ve ayarları yönetebilir',
  },
  [ROLE_SLUGS.ACCOUNTANT]: {
    id: 'role-accountant',
    name: 'Mali Müşavir / Muhasebeci',
    description: 'Finans, fatura, e-Dönüşüm, kasa, banka ve resmi raporları yönetebilir',
  },
  [ROLE_SLUGS.EMPLOYEE]: {
    id: 'role-employee',
    name: 'Personel / Satış Temsilcisi',
    description: 'Satış, POS, müşteri ekleme ve günlük operasyonları yürütebilir',
  },
  [ROLE_SLUGS.VIEWER]: {
    id: 'role-viewer',
    name: 'İzleyici (Salt Okunur)',
    description: 'Sadece görüntüleme yetkisine sahiptir, değişiklik yapamaz',
  },
};

// ─── Yardımcılar ───────────────────────────────────────────────────────────

/** Wildcard semantiği: platform_admin tam yetki; '*' davranışı authGuards ile aynı kalır. */
export const WILDCARD_PERMISSION = '*';

/** Rolün verilen izne sahip olup olmadığı (prefix wildcard dahil). */
export function roleHasPermission(slug: RoleSlug, code: string): boolean {
  const perms = ROLE_PERMISSIONS[slug] || [];
  if (slug === ROLE_SLUGS.PLATFORM_ADMIN) return true;
  if (perms.includes(code as PermissionCode)) return true;
  const prefix = `${code.split('.')[0]}.*`;
  return (perms as readonly string[]).includes(prefix);
}

/** Duplicate rol tanımı denetimi (test altyapısı kullanır). */
export function assertNoDuplicateRoleSlugs(): void {
  const seen = new Set<string>();
  for (const slug of Object.values(ROLE_SLUGS)) {
    if (seen.has(slug)) throw new Error(`Duplicate role slug: "${slug}" (roles.ts)`);
    seen.add(slug);
  }
}
