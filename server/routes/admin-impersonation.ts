import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { generateToken } from './auth';
import { ImpersonationSession } from '../db/schema';
import { redactSecretsDeep } from '../security/credentialMask';
import { canEnterCompany } from '../security/memberships';

export const impersonationRouter = Router();

// POST /api/admin/impersonate - Platform Admin firmanın hesabına kontrollü geçiş yapar
impersonationRouter.post('/impersonate', requireAuth, requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
  const { targetTenantId, reason } = req.body;
  const user = req.user;
  const db = storage.getState();

  if (typeof targetTenantId !== 'string' || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Hedef firma ve destek erişimi gerekçesi zorunludur.' });
  }

  const tenant = (db.tenants || []).find(t => t.id === targetTenantId);
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Hedef şirket bulunamadı.' });
  }
  if (!canEnterCompany(db, user, tenant.id)) {
    return res.status(403).json({ success: false, message: 'Pasif, askıdaki veya arşivlenmiş firmaya destek erişimi açılamaz.' });
  }

  const now = new Date().toISOString();
  const token = generateToken({ ...user, credentialVersion: req.authCredentialVersion || '' }, targetTenantId);

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
      details: `Süper Admin (${user.username}) '${tenant.name}' firmasının hesabına denetimli geçiş yaptı. Gerekçe: ${reason.trim()}`,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({
      success: true,
      message: `'${tenant.name}' firması olarak geçiş sağlandı.`,
      token,
      impersonatedTenant: redactSecretsDeep(tenant),
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

  const account = db.users.find(u => u.id === user.id);
  if (!account) return res.status(403).json({ success: false, message: 'Yönetici hesabı bulunamadı.' });
  const originalTenantId = account.companyId || db.tenants.find(t => canEnterCompany(db, account, t.id))?.id;
  if (!originalTenantId || !canEnterCompany(db, account, originalTenantId)) {
    return res.status(403).json({ success: false, message: 'Geri dönülebilecek etkin firma bulunamadı.' });
  }
  const tenant = (db.tenants || []).find(t => t.id === originalTenantId);
  const token = generateToken({ ...account, credentialVersion: req.authCredentialVersion || '' } as typeof account, originalTenantId);

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
    activeTenant: redactSecretsDeep(tenant),
  });
});

export default impersonationRouter;
