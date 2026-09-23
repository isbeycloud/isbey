import crypto from 'crypto';
import { storage } from '../../db/storage';
import { WebhookSubscriptionItem, WebhookDeliveryLog, DatabaseState } from '../../db/schema';

export class WebhookEngine {
  /**
   * Yeni Webhook Aboneliği oluşturur
   */
  public static async createWebhook(params: {
    tenantId: string;
    url: string;
    events: string[];
    secret?: string;
  }): Promise<{ webhook: WebhookSubscriptionItem; plainSecret: string }> {
    const { tenantId, url, events, secret } = params;
    const now = new Date().toISOString();
    const plainSecret = secret || `whsec_${crypto.randomBytes(16).toString('hex')}`;
    const secretHash = crypto.createHash('sha256').update(plainSecret).digest('hex');

    const webhook: WebhookSubscriptionItem = {
      id: `wh-${Date.now()}`,
      tenantId,
      url,
      secretHash,
      events,
      isActive: true,
      failureCount: 0,
      createdAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.webhookSubscriptions) draft.webhookSubscriptions = [];
      draft.webhookSubscriptions.push(webhook);
      return { webhook, plainSecret };
    });
  }

  /**
   * Sistem olayını (event) abonelere dağıtır
   */
  public static async dispatchEvent(tenantId: string, event: string, payload: any) {
    const db = storage.getState();
    const subs = (db.webhookSubscriptions || []).filter(
      s => s.tenantId === tenantId && s.isActive && (s.events.includes(event) || s.events.includes('*'))
    );

    const now = new Date().toISOString();

    for (const sub of subs) {
      await storage.runTransaction((draft: DatabaseState) => {
        if (!draft.webhookDeliveryLogs) draft.webhookDeliveryLogs = [];

        // 2026-09-12 (uydurma iletim temizliği): Önceden HTTP isteği YAPILMADAN
        // `httpStatus: 200` + `status: 'SUCCESS'` + `deliveredAt` yazılıyordu
        // ("Simüle başarılı iletim"). İletim gerçekleşmediği için bu kayıt yanıltıcı
        // bir denetim iziydi. Şu an bu yöntem gerçek gönderim YAPMAZ; bu yüzden
        // teslim edilmiş gibi işaretlenmez: durum 'RETRYING', httpStatus yok.
        // NOT: Abonelik kaydı yalnızca `secretHash` sakladığı için imza üretilemez;
        // gerçek gönderim (HMAC) için düz metin secret saklanması gerekir — bu
        // ayrı bir tasarım kararıdır. Bu yolun ÜRETİMDE çağıranı yoktur (yalnızca
        // testler); gerçek otomasyon webhook'u AutomationEngine.dispatchWebhooks'tur.
        const log: WebhookDeliveryLog = {
          id: `whlog-${Date.now()}`,
          tenantId,
          subscriptionId: sub.id,
          event,
          payloadSnippet: JSON.stringify(payload).slice(0, 100),
          status: 'RETRYING',
          retryAttempt: 0,
          createdAt: now,
        };

        draft.webhookDeliveryLogs.unshift(log);
      });
    }
  }
}
