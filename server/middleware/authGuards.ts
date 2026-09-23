import { tenantContext } from '../db/tenantConfiguration';
import { subscriptionState } from '../security/erpSubscription';
import { canEnterCompany, companyIdentity } from '../security/memberships';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { storage } from '../db/storage';
import { UserRole } from '../db/schema';

// FAZ 25.3-E (B-3): PERMISSIONS sabitleri security registry'den re-export edilir —
// route'lar tek import noktasından (authGuards) kanonik kodlara erişir.
// Kodların KAYNAĞI server/security/permissions.ts'tir; burada duplicate TANIM yoktur.
export { PERMISSIONS } from '../security/permissions';

// FAZ 9: Fallback JWT secret YASAK — secret yoksa açıkça hata ver
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. .env dosyasına JWT_SECRET ekleyin.');
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: any;
      tenantId?: string;
      activeCompanyId?: string;
      userRole?: string;
      userPermissions?: string[];
    }
  }
}

/**
 * 1. Require Authentication Guard (JWT & Session Destekli)
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const db = storage.getState();

  let resolvedUser: any = null;
  let resolvedTenantId = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.replace('Bearer ', '').trim();
    if (rawToken.startsWith('session_')) {
      // GÜVENLİK DÜZELTMESİ (FAZ 25 güvenlik incelemesi): token'dan userId DEĞİL,
      // sessionId okunur ve db.sessions koleksiyonunda DOĞRULANIR.
      // Eski davranış (session_<userId> → doğrudan kullanıcı girişi) sahte token ile
      // herhangi bir kullanıcının kimliğine bürünmeye izin veriyordu.
      const sessionId = rawToken.slice('session_'.length);
      const session = (db.sessions || []).find(s => s.id === sessionId);
      if (!session || session.isRevoked) {
        return res.status(401).json({
          success: false,
          message: 'Oturum bulunamadı veya sonlandırılmış. Lütfen tekrar giriş yapınız.',
          code: 'SESSION_INVALID',
        });
      }
      // Oturum aktifliği: 7 günden uzun süredir hareketsiz oturumlar geçersiz sayılır
      const idleLimitMs = 7 * 24 * 60 * 60 * 1000;
      if (session.lastActiveAt && (Date.now() - new Date(session.lastActiveAt).getTime()) > idleLimitMs) {
        return res.status(401).json({
          success: false,
          message: 'Oturum uzun süre hareketsiz kaldığı için sonlandırıldı. Lütfen tekrar giriş yapınız.',
          code: 'SESSION_EXPIRED',
        });
      }
      resolvedUser = db.users.find(u => u.id === session.userId);
      if (resolvedUser && session.companyId) {
        // Oturum hangi şirket için açıldıysa tenant o olur (token'dan değiştirilemez)
        resolvedTenantId = session.companyId;
      }
    } else {
      try {
        const decoded: any = jwt.verify(rawToken, JWT_SECRET);
        resolvedUser = db.users.find(u => u.id === decoded.userId);
        if (decoded.tenantId) {
          resolvedTenantId = decoded.tenantId;
        }
      } catch (err: any) {
        return res.status(401).json({
          success: false,
          message: 'Oturum süreniz dolmuş veya geçersiz JWT token. Lütfen tekrar giriş yapınız.',
          code: 'TOKEN_EXPIRED',
        });
      }
    }
  }

  // FAZ 9: "Token yoksa ilk kullanıcı" fallback'i YASAK — kimlik doğrulaması zorunlu
  if (!resolvedUser) {
    return res.status(401).json({
      success: false,
      message: 'Oturum açmanız gerekmektedir.',
      code: 'UNAUTHORIZED',
    });
  }

  if (!resolvedUser.active) {
    return res.status(403).json({
      success: false,
      message: 'Kullanıcı hesabınız pasife alınmıştır. Sistem yöneticinizle iletişime geçiniz.',
      code: 'USER_INACTIVE',
    });
  }

  if (!canEnterCompany(db, resolvedUser, resolvedTenantId)) {
    return res.status(403).json({ success: false, message: 'Bu firmada aktif üyeliğiniz bulunmuyor veya firma erişime kapalı.', code: 'MEMBERSHIP_REQUIRED' });
  }
  const identity = companyIdentity(db, resolvedUser, resolvedTenantId);
  if (!identity.roleSlugs.length) {
    return res.status(403).json({ success: false, message: 'Bu firma üyeliğine geçerli bir rol atanmamış.', code: 'MEMBERSHIP_ROLE_REQUIRED' });
  }
  req.user = identity;
  req.tenantId = resolvedTenantId;
  req.activeCompanyId = resolvedTenantId;
  req.userRole = identity.roleSlugs[0] || '';
  req.userPermissions = identity.permissionCodes;
  const subscription = subscriptionState(db.tenants.find(t => t.id === resolvedTenantId)!);
  const path = (req.originalUrl || req.url).split('?')[0];
  const sessionOperation = /\/auth\/(switch-company|logout)$/.test(path) || /\/companies\/[^/]+\/switch$/.test(path);
  if (!identity.roleSlugs.includes('platform_admin') && subscription !== 'ACTIVE'
      && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sessionOperation) {
    return res.status(403).json({ success: false, code: `ERP_SUBSCRIPTION_${subscription}`, message: 'ERP aboneliği etkin değil. Görüntüleme açık; yeni kayıt ve değişiklik için abonelik yenilenmeli.' });
  }
  tenantContext.run(resolvedTenantId, next);
};

/**
 * 2. Role-Based Access Control Guard
 */
export const requireRole = (...allowedRoles: (UserRole | string)[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Oturum açmanız gerekmektedir.',
        code: 'UNAUTHORIZED',
      });
    }

    // Super Admin has universal access
    if (user.role === 'SUPER_ADMIN' || req.userRole === 'platform_admin') {
      return next();
    }

    const currentRoles = [...(user.effectiveRoles || [user.role]), ...(user.roleSlugs || [])].filter(Boolean);
    const hasRole = allowedRoles.some(r => currentRoles.includes(r as any));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz bulunmamaktadır.',
        code: 'FORBIDDEN_ROLE',
      });
    }

    next();
  };
};

/**
 * 3. Granular Permission Guard (Örn: 'customers.create', 'invoices.delete')
 */
export const requirePermission = (permissionCode: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Oturum açmanız gerekmektedir.', code: 'UNAUTHORIZED' });
    }

    // Platform süper yöneticisi ve Firma Yöneticisi kendi şirketinde tam yetkiye sahiptir
    if (
      user.role === 'SUPER_ADMIN' ||
      req.userRole === 'platform_admin'
    ) {
      return next();
    }

    const userPerms = req.userPermissions || [];
    const hasPerm = userPerms.includes('*') || userPerms.includes(permissionCode) || userPerms.includes(`${permissionCode.split('.')[0]}.*`);

    if (!hasPerm) {
      return res.status(403).json({
        success: false,
        message: `Bu işlem için gerekli '${permissionCode}' iznine sahip değilsiniz.`,
        code: 'FORBIDDEN_PERMISSION',
        requiredPermission: permissionCode,
      });
    }

    next();
  };
};

/**
 * 4. Tenant Resolver & Isolation Guard (IDOR Koruması)
 */
export const resolveTenant = (req: Request, res: Response, next: NextFunction) => {
  const db = storage.getState();
  const tenantId = req.tenantId || db.activeTenantId || 'tnt-isbey';
  const tenant = (db.tenants || []).find(t => t.id === tenantId);

  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'İşlem yapılmak istenen şirket/tenant bulunamadı.',
      code: 'TENANT_NOT_FOUND',
    });
  }

  if (tenant.status === 'SUSPENDED') {
    return res.status(403).json({
      success: false,
      message: 'Bu şirket hesabı askıya alınmıştır. Lütfen destek ile iletişime geçiniz.',
      code: 'TENANT_SUSPENDED',
    });
  }

  next();
};

/**
 * 5. Company Service Entitlement Guard
 */
export const requireService = (serviceCode: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const db = storage.getState();
    const activeTenantId = req.tenantId || db.activeTenantId || 'tnt-isbey';
    const tenant = (db.tenants || []).find(t => t.id === activeTenantId);

    if (!tenant) {
      return next();
    }

    if (tenant.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Firmanız askıya alınmıştır. İşlem gerçekleştiremezsiniz.',
        code: 'COMPANY_SUSPENDED',
      });
    }

    if (subscriptionState(tenant) !== 'ACTIVE' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.userRole !== 'platform_admin') {
      return res.status(403).json({
        success: false,
        message: 'Firma lisansınızın süresi dolmuştur. Sistem yöneticinizle iletişime geçin.',
        code: 'COMPANY_EXPIRED',
      });
    }

    const hasActiveService = tenant.activeServices
      ? tenant.activeServices.some(s => s.serviceCode === serviceCode && s.status === 'ACTIVE')
      : (tenant.activeModules as string[] || []).includes(serviceCode);

    if (!hasActiveService) {
      return res.status(403).json({
        success: false,
        message: 'Bu özellik firmanızın aktif hizmetleri arasında bulunmamaktadır.',
        code: 'SERVICE_NOT_ENABLED',
        serviceCode,
      });
    }

    next();
  };
};

/**
 * 6. Company License Status Guard
 */
export const checkLicenseStatus = (req: Request, res: Response, next: NextFunction) => {
  const db = storage.getState();
  const activeTenantId = req.tenantId || db.activeTenantId || 'tnt-isbey';
  const tenant = (db.tenants || []).find(t => t.id === activeTenantId);

  if (tenant) {
    if (tenant.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Firmanız askıya alınmıştır. Sistem yöneticinizle iletişime geçiniz.',
        code: 'COMPANY_SUSPENDED',
      });
    }
    if (subscriptionState(tenant) !== 'ACTIVE' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.userRole !== 'platform_admin') {
      return res.status(403).json({
        success: false,
        message: 'Firma lisansınızın süresi dolmuştur. Sistem yöneticinizle iletişime geçin.',
        code: 'LICENSE_EXPIRED',
      });
    }
  }

  next();
};
