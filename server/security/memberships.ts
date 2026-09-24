import type { DatabaseState, User, TenantUser, UserRole } from '../db/schema';
import { PLATFORM_ROLE_TO_SLUG, SLUG_TO_PLATFORM_ROLE, type RoleSlug } from './roles';

export const isPlatformUser = (user: Pick<User, 'role'>) => ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
export const membershipFor = (db: DatabaseState, userId: string, tenantId: string) =>
  (db.tenantUsers || []).find(m => m.userId === userId && m.tenantId === tenantId);
export const activeMembership = (m?: TenantUser) => !!m && m.status === 'active' && !m.deletedAt;
export const canEnterCompany = (db: DatabaseState, user: User, tenantId: string) => {
  const tenant = db.tenants.find(t => t.id === tenantId);
  return !!tenant && !tenant.isArchived && !['SUSPENDED', 'INACTIVE'].includes(tenant.status)
    && user.active && (isPlatformUser(user) || activeMembership(membershipFor(db, user.id, tenantId)));
};

export function membershipRoles(db: DatabaseState, membership?: TenantUser) {
  if (!membership) return [];
  const available = (db.roles || []).filter(r => r.slug !== 'platform_admin' &&
    (r.isSystem || r.tenantId === membership.tenantId));
  // An explicitly empty roleIds array means no roles, never a legacy fallback.
  return membership.roleIds !== undefined
    ? available.filter(r => membership.roleIds!.includes(r.id))
    : available.filter(r => membership.roleId ? r.id === membership.roleId : r.slug === membership.roleSlug);
}

export function companyIdentity(db: DatabaseState, user: User, tenantId: string) {
  const platform = isPlatformUser(user);
  const membership = membershipFor(db, user.id, tenantId);
  const roles = membershipRoles(db, membership);
  const roleSlugs = platform ? ['platform_admin'] : roles.map(r => r.slug);
  const effectiveRoles = platform ? [user.role] : roles.map(r =>
    SLUG_TO_PLATFORM_ROLE[r.slug as RoleSlug]).filter(Boolean) as UserRole[];
  if (!platform && membership?.roleIds === undefined && membership?.legacyRole && roles.some(r => r.slug === 'employee')) {
    effectiveRoles.splice(0, effectiveRoles.length, membership.legacyRole);
  }
  const priority: UserRole[] = ['COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'KASA', 'DEPO', 'PERSONEL', 'SAHA', 'RAPOR'];
  const role = platform ? user.role : priority.find(r => effectiveRoles.includes(r)) || 'RAPOR';
  const permissionCodes = platform ? ['*'] : [...new Set(roles.flatMap(r => r.permissions))];
  const { passwordHash: _secret, permissions: _legacy, ...safe } = user;
  return { ...safe, role, companyId: tenantId, companyName: db.tenants.find(t => t.id === tenantId)?.name, tenantId, allowedCompanyIds: [tenantId],
    roleSlugs, effectiveRoles, permissionCodes, allowedMenuIds: platform ? null : membership?.allowedMenuIds ?? null };
}

// Idempotent upgrade: never reactivate a revoked membership or overwrite its roles.
export function migrateMemberships(db: DatabaseState) {
  db.tenantUsers ||= [];
  for (const user of db.users) {
    if (isPlatformUser(user)) continue;
    const companies = [...new Set([user.companyId, ...(user.allowedCompanyIds || [])].filter(Boolean))] as string[];
    for (const tenantId of companies) {
      const existing = membershipFor(db, user.id, tenantId);
      if (existing) {
        if (existing.roleIds === undefined && !existing.legacyRole && existing.roleSlug === 'employee' && ['SATIS', 'KASA', 'DEPO', 'PERSONEL', 'SAHA'].includes(user.role)) existing.legacyRole = user.role;
        continue;
      }
      if (!db.tenants.some(t => t.id === tenantId)) continue;
      const now = new Date().toISOString();
      db.tenantUsers.push({ id: `tu-${user.id}-${tenantId}`, userId: user.id, tenantId,
        roleSlug: PLATFORM_ROLE_TO_SLUG[user.role] || 'employee', legacyRole: user.role, isOwner: false,
        status: user.active ? 'active' : 'passive', joinedAt: now, createdAt: now, updatedAt: now });
    }
  }
}
