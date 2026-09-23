import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { generateToken } from './auth';
import { ImpersonationSession } from '../db/schema';

export const impersonationRouter = Router();

// POST /api/admin/impersonate - Platform Admin firmanın hesabına kontrollü geçiş yapar
impersonationRouter.post('/impersonate', requireAuth, requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
  const { targetTenantId, reason } = req.body;
  const user = req.user;
  const db = storage.getState();

  if (!targetTenantId) {
    return res.status(400).json({ success: false, message: 'targetTenantId zorunludur.' });
  }

  const tenant = (db.tenants || []).find(t => t.id === targetTenantId);
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Hedef şirket bulunamadı.' });
  }

  const now = new Date().toISOString();
  const token = generateToken(user, targetTenantId);

  const session: ImpersonationSession = {
    id: `imp-${Date.now()}`,
    originalUserId: user.id,
    originalUserName: user.fullName || user.username,
    impersonatedTenantId: targetTenantId,
    impersonatedTenantName: tenant.name,
    token,
    startedAt: now,
  };

  try {
    await storage.runTransaction(draft => {
      if (!draft.impersonationSessions) draft.impersonationSessions = [];
      draft.impersonationSessions.unshift(session);
    });

    storage.addAuditLog({
      userId: user.id,
      username: user.username,
      companyId: targetTenantId,
      companyName: tenant.name,
      action: 'ADMIN_IMPERSONATION',
      module: 'PLATFORM_ADMIN',
      details: `Süper Admin (${user.username}) '${tenant.name}' firmasının hesabına denetimli geçiş yaptı. Gerekçe: ${reason || 'Teknik Destek'}`,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({
      success: true,
      message: `'${tenant.name}' firması olarak geçiş sağlandı.`,
      token,
      impersonatedTenant: tenant,
      sessionId: session.id,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/impersonate/stop - Impersonation oturumunu sonlandırır
impersonationRouter.post('/impersonate/stop', requireAuth, async (req: Request, res: Response) => {
  const user = req.user;
  const db = storage.getState();

  const originalTenantId = user.companyId || db.tenants?.[0]?.id || 'tnt-isbey';
  const tenant = (db.tenants || []).find(t => t.id === originalTenantId);
  const token = generateToken(user, originalTenantId);

  storage.addAuditLog({
    userId: user.id,
    username: user.username,
    companyId: originalTenantId,
    action: 'ADMIN_IMPERSONATION_STOPPED',
    module: 'PLATFORM_ADMIN',
    details: `Süper Admin (${user.username}) firma denetim oturumunu sonlandırdı.`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'Yönetici oturumuna geri dönüldü.',
    token,
    activeTenant: tenant,
  });
});

export default impersonationRouter;
