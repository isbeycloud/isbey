import { Request, Response, NextFunction } from 'express';
import { storage } from '../db/storage';
import { TenantModule } from '../db/schema';

/**
 * 1. e-Dönüşüm Kontör Bakiye Denetimi Middleware'i
 */
export const requireCredit = (amount: number = 1) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.tenantId || storage.getState().activeTenantId || 'tnt-isbey';
    const db = storage.getState();
    const tenant = (db.tenants || []).find(t => t.id === tenantId);

    if (!tenant) return next();

    const currentCredits = tenant.eInvoiceCredits || 0;
    if (currentCredits < amount) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        message: `Bu işlem için yeterli e-Dönüşüm kontörünüz bulunmamaktadır. Mevcut bakiye: ${currentCredits}, Gerekli: ${amount}. Lütfen kontör yükleyiniz.`,
        currentCredits,
        requiredCredits: amount,
      });
    }

    // İşlem başarıyla tamamlandığında kontörü otomatik düş
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success) {
        tenant.eInvoiceCredits = Math.max(0, (tenant.eInvoiceCredits || 0) - amount);
        tenant.updatedAt = new Date().toISOString();

        if (!db.creditTransactions) db.creditTransactions = [];
        db.creditTransactions.unshift({
          id: `ctx-use-${Date.now()}`,
          customerId: tenant.id,
          customerTitle: tenant.name,
          type: 'USAGE',
          unit: 'INVOICE_UNIT',
          amount: amount,
          balanceBefore: currentCredits,
          balanceAfter: tenant.eInvoiceCredits,
          description: `e-Belge Gönderimi (${req.originalUrl})`,
          performedBy: req.user?.fullName || 'Sistem',
          performedByRole: req.userRole || 'USER',
          createdAt: new Date().toISOString(),
        });
        storage.save();
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * 2. Paket Dahili Modül Yetki Denetimi Middleware'i
 */
export const requireModule = (moduleName: TenantModule) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.tenantId || storage.getState().activeTenantId || 'tnt-isbey';
    const db = storage.getState();
    const tenant = (db.tenants || []).find(t => t.id === tenantId);

    if (!tenant) return next();

    const activeModules = tenant.activeModules || [];
    if (!activeModules.includes(moduleName) && tenant.plan !== 'ENTERPRISE') {
      return res.status(403).json({
        success: false,
        code: 'MODULE_NOT_IN_PLAN',
        message: `'${moduleName}' modülü mevcut '${tenant.plan}' paketinizde aktif değildir. Kullanmak için lütfen paketinizi yükseltiniz.`,
        requiredModule: moduleName,
        currentPlan: tenant.plan,
      });
    }

    next();
  };
};
