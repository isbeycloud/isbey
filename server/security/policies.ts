/**
 * İŞBEY CLOUD — FAZ 25.2-B RESOURCE OWNERSHIP POLICIES (HAZIRLIK İSKELETİ)
 * ========================================================================
 * "Bu kullanıcı bu kayda gerçekten sahip mi?" sorusunun merkezi katmanıdır.
 * FAZ 25.2-C (Resource Ownership Hardening) bu dosyadaki policy'leri
 * route'lara bağlayacaktır.
 *
 * FAZ 25.2-B DURUMU: YALNIZCA TANIM + SAF DEĞERLENDİRİCİ.
 *  - Hiçbir router'a bağlı DEĞİLDİR; runtime davranış değişmez.
 *  - requirePermission/requireRole ile birlikte kullanılabilir pure fonksiyonlardır.
 *
 * Onaylı kaynak kuralı (CLAUDE.md + docs/12 §5):
 *  tenantId YALNIZCA token'dan (req.tenantId) gelir; query/body/header
 *  kaynaklı tenant kimliği tek başına yetki kaynağı KABUL EDİLMEZ.
 */

import { PLATFORM_ROLE_TO_SLUG, ROLE_SLUGS } from './roles';

/** Kimlik bağlamı — authGuards.requireAuth dolumunun minimal yansıması. */
export interface AuthContext {
  userId: string;
  platformRole: string;             // User.role (örn. 'COMPANY_ADMIN')
  roleSlug: string;                 // req.userRole (tenant rolü)
  tenantId: string;                 // req.tenantId (TOKEN'dan — asla istek gövdesinden)
  companyId?: string;               // User.companyId
  allowedCompanyIds?: string[];     // User.allowedCompanyIds
}

/** Sahiplik değerlendirilecek kaydın minimal yüzeyi. */
export interface ResourceRef {
  tenantId?: string;
  companyId?: string;
  userId?: string;
}

export type PolicyDecision = 'ALLOW' | 'DENY';

const isPlatformAdminRole = (role: string): boolean =>
  role === 'SUPER_ADMIN' || role === 'ADMIN';

/** Platform yöneticisi: her resource'a erişir. */
export const isPlatformAdminContext = (ctx: AuthContext): boolean =>
  isPlatformAdminRole(ctx.platformRole) || ctx.roleSlug === ROLE_SLUGS.PLATFORM_ADMIN;

/**
 * Tenant sahipliği: kaydın tenant'ı çağıranın token tenant'ı ile aynı mı?
 * (undefined tenant alanlı legacy kayıtlar: yalnızca 'tnt-isbey' bağlamında görünür —
 * customers.ts konvansiyonu. 25.2-C'de tüm route'lara uygulanacaktır.)
 */
export function tenantOwnsResource(
  ctx: AuthContext,
  resource: ResourceRef,
  defaultTenantId = 'tnt-isbey'
): PolicyDecision {
  if (isPlatformAdminContext(ctx)) return 'ALLOW';
  const resTenant = resource.tenantId ?? resource.companyId;
  if (!resTenant) return ctx.tenantId === defaultTenantId ? 'ALLOW' : 'DENY';
  return resTenant === ctx.tenantId
    ? 'ALLOW'
    : 'DENY';
}

/**
 * Rol atama hiyerarşisi — admin-users.ts/users.ts canAssignRole kurallarının
 * merkezileştirilmiş hali (25.2-C'de route'lar buna referans verecektir).
 * Platform yöneticisi her rolü atayabilir; diğerleri platform rollerini ASLA atayamaz.
 */
export function canAssignPlatformRole(
  ctx: AuthContext,
  targetPlatformRole: string
): PolicyDecision {
  if (isPlatformAdminContext(ctx)) return 'ALLOW';
  const targetIsPlatformRole =
    targetPlatformRole === 'SUPER_ADMIN' || targetPlatformRole === 'ADMIN';
  return targetIsPlatformRole ? 'DENY' : 'ALLOW';
}

/**
 * Kullanıcı kaydı sahipliği — COMPANY_ADMIN yalnızca kendi şirketinin
 * kullanıcılarını yönetebilir; platform yöneticisi kullanıcılarına dokunamaz.
 */
export function canManageUserRecord(
  ctx: AuthContext,
  target: ResourceRef & { platformRole?: string }
): PolicyDecision {
  if (isPlatformAdminContext(ctx)) return 'ALLOW';
  if (target.platformRole && isPlatformAdminRole(target.platformRole)) return 'DENY';
  return tenantOwnsResource(ctx, target);
}

/** Slug eşlemesi için kısayol (roles.ts PLATFORM_ROLE_TO_SLUG'a delege eder). */
export const resolveRoleSlug = (platformRole: string): string =>
  PLATFORM_ROLE_TO_SLUG[platformRole] ?? ROLE_SLUGS.EMPLOYEE;

// ─── FAZ 25.2-C: İstek tenant kimliği — TEK KAYNAK (TOKEN) ──────────────────
/**
 * FAZ 25.2-C kabul kuralı: tenantId YALNIZCA token'dan (requireAuth → req.tenantId)
 * çözümlenir. req.query.tenantId / req.body.tenantId / req.headers['x-tenant-id']
 * yetki kaynağı OLAMAZ (IDOR kapısı — kullanıcı eliyle tenant seçemez).
 *
 * securityGate.defaultDeny, /api/* altındaki tüm istekleri requireAuth'a soktuğu
 * için req.tenantId auth'lu her istekte DOLUDUR (authGuards.requireAuth satır 96).
 * Dolmadığı durum fail-closed hatadır — sessiz default'a düşme YASAK.
 */
export interface TenantBearerRequest {
  tenantId?: string;
}

/** req.tenantId çözümlenemediğinde fırlatılır (fail-closed; route 500'e düşer). */
export class TenantResolutionError extends Error {
  constructor() {
    super("TENANT_UNRESOLVED: İstek tenant kimliği token'dan çözümlenemedi.");
    this.name = 'TenantResolutionError';
  }
}

/**
 * Route handler'larında standart kullanım:
 *   const tenantId = resolveRequestTenantId(req);
 * (Express Request, TenantBearerRequest ile yapısal olarak uyumludur.)
 */
export function resolveRequestTenantId(req: TenantBearerRequest): string {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new TenantResolutionError();
  }
  return tenantId;
}
