import { Router } from 'express';
import { ApiPlatformService } from '../../services/faz9/apiPlatformService';
import { WebhookEngine } from '../../services/faz9/webhookEngine';
import { storage } from '../../db/storage';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/developer/keys
 * Tenant'ın API anahtarları
 */
router.get('/keys', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const list = (db.apiKeyCredentials || []).filter(k => k.tenantId === tenantId && !k.isRevoked);
  return res.json({ success: true, count: list.length, keys: list });
});

/**
 * POST /api/v1/developer/keys
 * Yeni API anahtarı üretir
 */
router.post('/keys', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { name = 'Varsayılan API Anahtarı', isSandbox = false, scopes = ['*'], rateLimitTier = 'PRO' } = req.body;

    const result = await ApiPlatformService.createApiKey({
      tenantId,
      applicationId: `app-${Date.now()}`,
      name,
      isSandbox,
      scopes,
      rateLimitTier,
    });

    return res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/v1/developer/logs
 * API İstek Logları
 */
router.get('/logs', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const list = (db.apiUsageLogs || []).filter(l => l.tenantId === tenantId).slice(0, 50);
  return res.json({ success: true, count: list.length, logs: list });
});

/**
 * GET /api/v1/developer/webhooks
 * Webhook abonelikleri
 */
router.get('/webhooks', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const list = (db.webhookSubscriptions || []).filter(w => w.tenantId === tenantId);
  return res.json({ success: true, count: list.length, webhooks: list });
});

/**
 * POST /api/v1/developer/webhooks
 * Yeni webhook oluşturur
 */
router.post('/webhooks', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { url, events = ['invoice.created', 'payment.received'] } = req.body;

    if (!url) return res.status(400).json({ success: false, message: 'Webhook URL zorunludur.' });

    const result = await WebhookEngine.createWebhook({
      tenantId,
      url,
      events,
    });

    return res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
