import { Router } from 'express';
import crypto from 'crypto';
import { storage } from '../../db/storage';
import { AutomationEngine } from '../../services/ai/automationEngine';
import { AutomationRule, WebhookEndpoint, DatabaseState } from '../../db/schema';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/automations/rules
 * Otomasyon kurallarını listeler
 */
router.get('/rules', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const rules = (db.automationRules || []).filter(
    r => r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: rules.length, rules });
});

/**
 * POST /api/v1/automations/rules
 * Yeni otomasyon kuralı oluşturur
 */
router.post('/rules', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { name, description, triggerEvent, conditions = [], actionType, actionConfig = {} } = req.body;

    if (!name || !triggerEvent || !actionType) {
      return res.status(400).json({ success: false, message: 'Kural adı, tetikleyici ve eylem tipi zorunludur.' });
    }

    const now = new Date().toISOString();
    const newRule: AutomationRule = {
      id: `rule-${Date.now()}`,
      tenantId,
      name,
      description,
      isActive: true,
      triggerEvent,
      conditions,
      actionType,
      actionConfig,
      createdAt: now,
      updatedAt: now,
    };

    await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.automationRules) draft.automationRules = [];
      draft.automationRules.unshift(newRule);
    });

    return res.status(201).json({ success: true, message: 'Otomasyon kuralı oluşturuldu.', rule: newRule });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Kural oluşturulamadı.' });
  }
});

/**
 * GET /api/v1/automations/runs
 * Otomasyon çalışma geçmişi
 */
router.get('/runs', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const runs = (db.automationRuns || []).filter(
    r => r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: runs.length, runs });
});

/**
 * POST /api/v1/automations/test-trigger
 * Kural tetikleme simülasyonu
 */
router.post('/test-trigger', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { triggerEvent = 'INVOICE_OVERDUE', payload = { overdueDays: 14, message: 'Test gecikmiş fatura' } } = req.body;

    const runs = await AutomationEngine.triggerEvent(tenantId, triggerEvent, payload);
    return res.json({ success: true, message: `${runs.length} adet otomasyon kuralı başarıyla tetiklendi.`, runs });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Tetikleme hatası.' });
  }
});

/**
 * GET /api/v1/automations/webhooks
 * Webhook uç noktalarını listeler
 */
router.get('/webhooks', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const webhooks = (db.webhookEndpoints || []).filter(
    w => w.tenantId === tenantId || (!w.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: webhooks.length, webhooks });
});

/**
 * POST /api/v1/automations/webhooks
 * Yeni Webhook URL tanımlar
 */
router.post('/webhooks', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { url, description, events = ['*'] } = req.body;

    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ success: false, message: 'Geçerli bir Webhook URL giriniz.' });
    }

    const newWebhook: WebhookEndpoint = {
      id: `wh-${Date.now()}`,
      tenantId,
      url,
      description,
      secret: `whsec_${crypto.randomBytes(16).toString('hex')}`,
      events,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.webhookEndpoints) draft.webhookEndpoints = [];
      draft.webhookEndpoints.unshift(newWebhook);
    });

    return res.status(201).json({ success: true, message: 'Webhook başarıyla kaydedildi.', webhook: newWebhook });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Webhook kaydedilemedi.' });
  }
});

export default router;
