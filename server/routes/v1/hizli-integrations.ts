/**
 * Hizli Bilisim Entegrasyon Yonetimi API
 * GET  /api/admin/integrations/hizli-bilisim
 * GET  /api/admin/integrations/hizli-bilisim/:tenantId
 * PUT  /api/admin/integrations/hizli-bilisim/:tenantId   (SUPER_ADMIN only)
 *
 * 2026-09-14: Guvenik kurallari:
 *   - secretKey / apiKey / token / password HICBIR ZAMAN frontende donmez.
 *   - Okuma: SUPER_ADMIN + ADMIN
 *   - Yazma (ac/kapat): SUPER_ADMIN only
 *   - "Entegrasyonu kapat" != "Kullanicilari sil"
 *   - integrationEnabled degistiginde AuditLog yazilir.
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../../middleware/authGuards';
import { storage } from '../../db/storage';

export const hizliIntegrationsRouter = Router();

/** Guvenli projeksiyon — credential hicbir zaman donmez */
function buildSafeRow(tenant: any, settings: any, dealer: any) {
  const isHizli = settings?.providerId === 'HIZLI' || settings?.providerId === 'HIZLI_TEKNOLOJI';

  let integrationStatus: 'ACTIVE' | 'PASSIVE' | 'PENDING' | 'ERROR';
  if (!settings || !isHizli) {
    integrationStatus = 'PENDING';
  } else if (!settings.integrationEnabled) {
    integrationStatus = 'PASSIVE';
  } else if (settings.status === 'ACTIVE') {
    integrationStatus = 'ACTIVE';
  } else if (settings.status === 'PENDING_VERIFICATION') {
    integrationStatus = 'PENDING';
  } else {
    integrationStatus = 'ERROR';
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    taxNumber: tenant.taxNumber || '',
    city: tenant.city || '',
    status: tenant.status,
    dealerId: dealer?.id || null,
    dealerName: dealer?.name || 'Bagimsiz',
    provider: isHizli ? 'HIZLI' : (settings?.providerId || null),
    environment: settings?.environment || null,
    integrationEnabled: !!settings?.integrationEnabled,
    integrationStatus,
    einvoiceStatus: settings?.status || null,
    lastSyncedAt: tenant.syncedAt || null,
    integrationEnabledAt: settings?.integrationEnabledAt || null,
    integrationDisabledAt: settings?.integrationDisabledAt || null,
    externalCustomerId: tenant.externalCustomerId || null,
  };
}

// GET / — liste
hizliIntegrationsRouter.get(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  (req: Request, res: Response) => {
    const db = storage.getState();
    const hizliSettings = (db.tenantEinvoiceSettings || []).filter(
      (s: any) => s.providerId === 'HIZLI' || s.providerId === 'HIZLI_TEKNOLOJI'
    );
    const settingsMap = new Map(hizliSettings.map((s: any) => [s.tenantId, s]));
    const tenants = (db.tenants || []).filter((t: any) => settingsMap.has(t.id));
    const dealers: any[] = db.dealers || [];
    const dealerMap = new Map(dealers.map((d: any) => [d.id, d]));
    const defaultDealer = dealers[0] || null;

    const rows = tenants.map((t: any) => {
      const settings = settingsMap.get(t.id);
      const dealer = dealerMap.get(t.dealerId) || defaultDealer;
      return buildSafeRow(t, settings, dealer);
    });

    const summary = {
      total: rows.length,
      active: rows.filter((r: any) => r.integrationStatus === 'ACTIVE').length,
      passive: rows.filter((r: any) => r.integrationStatus === 'PASSIVE').length,
      pending: rows.filter((r: any) => r.integrationStatus === 'PENDING').length,
      error: rows.filter((r: any) => r.integrationStatus === 'ERROR').length,
      dealerCount: new Set(rows.map((r: any) => r.dealerId).filter(Boolean)).size,
    };

    res.json({ success: true, integrations: rows, summary });
  }
);

// GET /:tenantId — detay
hizliIntegrationsRouter.get(
  '/:tenantId',
  requireAuth,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  (req: Request, res: Response) => {
    const db = storage.getState();
    const { tenantId } = req.params;
    const tenant = (db.tenants || []).find((t: any) => t.id === tenantId);
    if (!tenant) return res.status(404).json({ success: false, message: 'Kiraci bulunamadi.' });
    const settings = (db.tenantEinvoiceSettings || []).find((s: any) => s.tenantId === tenantId);
    const dealers: any[] = db.dealers || [];
    const dealer = dealers.find((d: any) => d.id === (tenant as any).dealerId) || dealers[0] || null;
    res.json({ success: true, integration: buildSafeRow(tenant, settings, dealer) });
  }
);

// PUT /:tenantId — ac/kapat (SUPER_ADMIN only)
hizliIntegrationsRouter.put(
  '/:tenantId',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    const db = storage.getState();
    const { tenantId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: "'enabled' alani boolean olmalidir." });
    }

    const tenant = (db.tenants || []).find((t: any) => t.id === tenantId);
    if (!tenant) return res.status(404).json({ success: false, message: 'Kiraci bulunamadi.' });

    const settings = (db.tenantEinvoiceSettings || []).find((s: any) => s.tenantId === tenantId);
    if (!settings) {
      return res.status(404).json({ success: false, message: 'Bu kiraci icin Hizli Bilisim e-Fatura ayari bulunamadi.' });
    }

    if (!!settings.integrationEnabled === enabled) {
      return res.json({ success: true, message: `Entegrasyon zaten ${enabled ? 'acik' : 'kapali'}.`, integrationEnabled: enabled });
    }

    const now = new Date().toISOString();
    settings.integrationEnabled = enabled;
    settings.updatedAt = now;
    if (enabled) {
      settings.integrationEnabledAt = now;
    } else {
      settings.integrationDisabledAt = now;
    }

    // Audit log
    const user = (req as any).user;
    const auditEntry: any = {
      id: `audit-hizli-int-${Date.now()}`,
      userId: user?.id || 'system',
      username: user?.username || 'system',
      userRole: user?.role || 'SUPER_ADMIN',
      action: enabled ? 'INTEGRATION_ENABLED' : 'INTEGRATION_DISABLED',
      module: 'HIZLI_BILISIM_INTEGRATION',
      details: `${(tenant as any).name} (${tenantId}) ISBEY ERP entegrasyonu ${enabled ? 'AKTIF edildi' : 'PASIF edildi'}. Mevcut kullanicilar korundu.`,
      ipAddress: req.ip || '',
      timestamp: now,
    };
    if (!db.auditLogs) (db as any).auditLogs = [];
    db.auditLogs.push(auditEntry);
    storage.save();

    res.json({
      success: true,
      message: `${(tenant as any).name} entegrasyonu ${enabled ? 'acildi' : 'kapatildi'}.`,
      integrationEnabled: enabled,
      updatedAt: now,
    });
  }
);

