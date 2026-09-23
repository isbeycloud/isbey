import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
// FAZ 25.4: webhook abuse rate limit — yalnızca public webhook ucu (kimlikli uçlar limit dışı)
import { webhookRateLimit } from '../../middleware/productionSecurity';
import { MonitoringService } from '../../services/monitoringService';

export const v1IntegrationsRouter = Router();

/**
 * POST /api/v1/integrations/:provider/webhook
 * Güvenli Provider Webhook Dinleyicisi
 */
v1IntegrationsRouter.post('/:provider/webhook', webhookRateLimit, async (req: Request, res: Response) => {
  const { provider } = req.params;
  const signature = req.headers['x-signature'] || req.headers['authorization'];
  const event = req.body;

  // ── FAZ 25.3 #3 (docs/08 3.2 KRİTİK): fail-closed imza doğrulaması ──
  // Eski davranış: yalnızca provider==='hizli' VE WEBHOOK_SECRET tanımlıysa kontrol
  // yapılıyordu → env boşsa HERKES e-belge durumunu manipüle edebiliyordu.
  // Yeni davranış: hizli provider'ı için imza ZORUNLU. Secret tanımsızsa 503
  // (fail-closed — hiçbir bildirim işlenmez), imza hatalıysa 401.
  const normalizedProvider = (String(provider || '')).toLowerCase();
  if (normalizedProvider === 'hizli') {
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.error('[INTEGRATIONS] WEBHOOK_SECRET tanımsız — hizli webhook fail-closed reddedildi (503).');
      MonitoringService.recordWebhookEvent(normalizedProvider, `/api/v1/integrations/${provider}/webhook`, 'REJECTED', 'WEBHOOK_SECRET tanımsız');
      return res.status(503).json({ success: false, message: 'Webhook imza doğrulaması yapılandırılmamış. İşlem reddedildi.' });
    }
    const providedSig = typeof signature === 'string' ? signature : '';
    if (!providedSig || providedSig !== expectedSecret) {
      MonitoringService.recordWebhookEvent(normalizedProvider, `/api/v1/integrations/${provider}/webhook`, 'INVALID_SIGNATURE', 'Geçersiz imza');
      return res.status(401).json({ success: false, message: 'Geçersiz webhook imzası.' });
    }
  }

  // 2. Event İşleme
  const db = storage.getState();
  const { documentUuid, status, gibCode, gibMessage, tenantId } = event;

  if (documentUuid) {
    const doc = (db.electronicDocuments || []).find(d => d.uuid === documentUuid);
    if (doc) {
      const now = new Date().toISOString();
      if (status === 'ACCEPTED' || gibCode === '1300') {
        doc.status = 'ACCEPTED';
      } else if (status === 'REJECTED') {
        doc.status = 'REJECTED';
      }
      doc.providerStatus = status || doc.providerStatus;
      doc.errorMessage = gibMessage || doc.errorMessage;
      doc.timeline.push({
        status: doc.status,
        description: `Webhook bildirimi alındı (${provider}): ${gibMessage || status}`,
        timestamp: now,
      });
      doc.updatedAt = now;
      storage.save();
    }
  }

  // Denetim Logu
  storage.addAuditLog({
    userId: 'webhook',
    username: `${String(provider).toUpperCase()}_WEBHOOK`,
    companyId: tenantId || 'tnt-isbey',
    action: 'INTEGRATION_WEBHOOK_RECEIVED',
    module: 'E_INVOICE',
    documentNo: documentUuid,
    ipAddress: req.ip || '127.0.0.1',
    details: `${provider} provider'ından webhook olayı işlendi.`,
  });

  MonitoringService.recordWebhookEvent(normalizedProvider, `/api/v1/integrations/${provider}/webhook`, 'SUCCESS', `Status: ${status || 'RECEIVED'}`);
  res.json({ success: true, received: true });
});
