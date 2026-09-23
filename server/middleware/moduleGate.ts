/**
 * İŞBEY CLOUD — FAZ 25.2 MODULE GATE
 * ==================================
 * Sunucu tarafı modül erişim matrisi (frontend src/utils/modulePermissions.ts
 * kanonik matrisinin sunucu yansıması). Frontend matrisi UX içindir; YETKİ
 * KARARI sunucuda alınır — "Header hiçbir zaman yetki kaynağı olmamalı" ve
 * "sadece Sidebar gizlemek güvenlik değildir" (CLAUDE.md kuralı).
 *
 * Model:
 *  - Her modül için izinli roller listelenir (frontend MODULE_ACCESS_MATRIX ile hizalı).
 *  - SUPER_ADMIN/ADMIN (platform admin) her zaman tüm modüllere erişir.
 *  - RAPOR (viewer) rolü READ-ONLY: erişimine izin verilen modüllerde bile
 *    yalnızca GET/HEAD geçer; yazma uçları 403 döner (hasPermission *view-only* kuralı).
 *  - 'platform' modülü yalnızca SUPER_ADMIN/ADMIN: COMPANY_ADMIN bile girmez
 *    (modulePermissions.ts §"SADECE PLATFORM ADMIN" ile birebir uyumlu).
 *
 * Kullanım (router dosyasında, requireAuth'tan SONRA):
 *   router.use(requireAuth, moduleGate('ayarlar'));
 *
 * Not: defaultDeny (securityGate.ts) AUTH'u zorunlu kılar; moduleGate üzerine
 * RBAC ekler. İkisi birlikte defense-in-depth oluşturur.
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../db/schema';
// FAZ 25.2-B (B-5): slug → platform rol eşlemesinin TEK KAYNAĞI registry'dir.
// (Eski yerel ROLE_SLUG_MAP kaldırıldı; değerler registry ile davranışsal birebirdi:
//  platform_admin→ADMIN, company_admin→COMPANY_ADMIN, accountant→MUHASEBE, viewer→RAPOR,
//  employee→PERSONEL. Farklar kural yapıları gereği nötrdür: MODULE_ROLES kuralları
//  SUPER_ADMIN+ADMIN'i birlikte içerir ve hiçbir kuralda PERSONEL yer almaz.)
import { SLUG_TO_PLATFORM_ROLE } from '../security/roles';
import type { RoleSlug } from '../security/roles';

// ─── Modül Anahtarları ──────────────────────────────────────────────────────
// Frontend modül id'leriyle anlamsal olarak hizalı gruplar.
export type ModuleKey =
  | 'ayarlar'        // settings, form-designs, document-templates (firma yönetimi)
  | 'personel'       // employees (firma yönetimi)
  | 'platform'       // platform-admin, saas-admin, dealer, developer, marketplace, billing, whitelabel, promotions, subscription, hizlibilisim
  | 'muhasebe'       // muhasebe/vergi/e-dönüşüm uçları
  | 'mali-musavir'   // mali müşavir platformu (COMPANY_ADMIN GİRMEZ)
  | 'activity-logs'  // denetim kayıtları (firma yönetimi)
  | 'otomasyon'      // otomasyon & onay (firma yönetimi)
  | 'ai'             // AI modülleri
  | 'belgeler'       // documents (muhasebe dahil)
  | 'erp-okuma';     // genel ERP okuma uçları (reports, search, dashboard benzeri — ALL)

/**
 * Modül → izinli roller.
 * Kaynak: src/utils/modulePermissions.ts MODULE_ACCESS_MATRIX (FAZ 17 onaylı).
 */
export const MODULE_ROLES: Record<ModuleKey, UserRole[] | 'ALL'> = {
  ayarlar: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  personel: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  platform: ['SUPER_ADMIN', 'ADMIN'],
  muhasebe: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  'mali-musavir': ['SUPER_ADMIN', 'ADMIN', 'MUHASEBE'],
  'activity-logs': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  otomasyon: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  ai: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  belgeler: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  'erp-okuma': 'ALL',
};

// ─── Yardımcılar ────────────────────────────────────────────────────────────

/** RAPOR (viewer) read-only: yalnızca okuma fiilleri geçer. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const isReadOnlyRequest = (method: string): boolean => READ_METHODS.has(method.toUpperCase());

/**
 * Etkin rol: user.role (birincil) + tenantUser roleSlug (req.userRole) eşleniği.
 * authGuards.requireAuth ikisini de doldurur.
 * FAZ 25.2-B (B-5): slug → platform rol çevirisi registry'deki SLUG_TO_PLATFORM_ROLE
 * üzerinden yapılır (yerel kopya kaldırıldı).
 */
export function effectiveRoles(req: Request): string[] {
  const roles = new Set<string>(req.user?.effectiveRoles || []);
  if (!req.user?.effectiveRoles && req.user?.role) roles.add(req.user.role);
  if (req.userRole) {
    const mapped = SLUG_TO_PLATFORM_ROLE[req.userRole as RoleSlug];
    if (mapped) roles.add(mapped);
  }
  return Array.from(roles);
}

// ─── Gate ───────────────────────────────────────────────────────────────────

/**
 * moduleGate(modül) → Express middleware
 * requireAuth'tan SONRA kullanılmalı (req.user dolu olmalı).
 */
export const moduleGate = (module: ModuleKey) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Oturum açmanız gerekmektedir.',
        code: 'UNAUTHORIZED',
      });
    }

    // 1) Platform admin — tüm modüller (frontend canAccessModule ile aynı kural)
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      return next();
    }

    // 2) Tanımlı olmayan modül → güvenli varsayılan: erişim yok
    const rule = MODULE_ROLES[module];
    if (rule === undefined) {
      return res.status(403).json({
        success: false,
        message: 'Bu modül erişime kapalıdır.',
        code: 'FORBIDDEN_MODULE',
        module,
      });
    }

    // 3) Rol bazlı kontrol
    const roles = effectiveRoles(req);
    const allowed = rule === 'ALL' || roles.some(r => rule.includes(r as UserRole));
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Bu modül için yetkiniz bulunmamaktadır.',
        code: 'FORBIDDEN_MODULE',
        module,
      });
    }

    // 4) RAPOR (viewer) read-only: modüle girebilir ama yazamaz
    const isViewer = roles.length > 0 && roles.every(r => r === 'RAPOR');
    if (isViewer && !isReadOnlyRequest(req.method)) {
      return res.status(403).json({
        success: false,
        message: 'Rapor kullanıcıları yalnızca görüntüleme yapabilir.',
        code: 'FORBIDDEN_READONLY',
        module,
      });
    }

    next();
  };
};

export default moduleGate;
