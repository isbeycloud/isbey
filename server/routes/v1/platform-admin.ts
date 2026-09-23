import { Router } from 'express';
import { PlatformAdminService } from '../../services/faz9/platformAdminService';
import { storage } from '../../db/storage';

const router = Router();

/**
 * GET /api/v1/platform-admin/metrics
 * Super Admin SaaS Metrikleri (MRR, ARR, ARPU, Churn, Sağlık)
 */
router.get('/metrics', (req, res) => {
  const metrics = PlatformAdminService.getPlatformMetrics();
  return res.json({ success: true, ...metrics });
});

/**
 * GET /api/v1/platform-admin/tenants
 * Tüm tenantların SaaS abonelik ve plan listesi
 */
router.get('/tenants', (req, res) => {
  const db = storage.getState();
  const tenants = db.tenants || [];
  const subs = db.subscriptions || [];

  const list = tenants.map(t => {
    const sub = subs.find(s => s.tenantId === t.id);
    return {
      ...t,
      subscriptionStatus: sub?.status || (t.status === 'ACTIVE' ? 'active' : 'trial'),
      currentPlanSlug: sub?.planSlug || (t.plan || 'pro').toLowerCase(),
      nextBillingDate: sub?.nextBillingDate || t.expiresAt,
    };
  });

  return res.json({ success: true, count: list.length, tenants: list });
});

/**
 * POST /api/v1/platform-admin/impersonate
 * Güvenli müşteri hesabına geçiş
 */
router.post('/impersonate', async (req, res) => {
  try {
    const { targetTenantId, adminUserId = 'usr-superadmin', adminUserName = 'Platform Yöneticisi', reason } = req.body;
    if (!targetTenantId || !reason) {
      return res.status(400).json({ success: false, message: 'Hedef tenant ID ve geçiş gerekçesi zorunludur.' });
    }

    const session = await PlatformAdminService.startImpersonation({
      adminUserId,
      adminUserName,
      targetTenantId,
      reason,
    });

    return res.json({ success: true, message: 'İmleç ve yetki hedef firmaya aktarıldı.', ...session });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/v1/platform-admin/announcements
 * Sistem duyurusu yayınla
 */
router.post('/announcements', async (req, res) => {
  try {
    const { title, content, targetAudience = 'ALL', priority = 'NORMAL' } = req.body;
    const ann = await PlatformAdminService.createAnnouncement({
      title,
      content,
      targetAudience,
      priority,
      isActive: true,
    });
    return res.status(201).json({ success: true, announcement: ann });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
