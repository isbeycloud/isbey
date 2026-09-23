import crypto from 'crypto';
import { storage } from '../../db/storage';
import { AutomationRule, AutomationRun, WebhookEndpoint, WebhookDelivery, DatabaseState } from '../../db/schema';
import { NotificationService } from '../notificationService';

/** Webhook gönderimi için ağ zaman aşımı (ms) — asılı kalan istek sunucuyu bağlamasın */
const WEBHOOK_TIMEOUT_MS = 10_000;

export class AutomationEngine {
  /**
   * Aynı endpoint'e eşzamanlı gönderimi engelleyen uçuş (in-flight) defteri.
   * İki olay aynı webhook'u aynı anda tetiklerse ikinci gönderim atlanır —
   * alıcıya mükerrer olay gitmez.
   */
  private static readonly inFlightWebhooks = new Set<string>();

  /**
   * Bir olayı tetikler ve aktif otomasyon kurallarını çalıştırır
   */
  public static async triggerEvent(tenantId: string, eventType: string, payload: any): Promise<AutomationRun[]> {
    const db = storage.getState();
    const rules = (db.automationRules || []).filter(
      r => (r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')) && r.isActive && r.triggerEvent === eventType
    );

    const runs: AutomationRun[] = [];
    const now = new Date().toISOString();

    for (const rule of rules) {
      let conditionsMet = true;

      // Koşul Değerlendirmesi
      for (const cond of rule.conditions || []) {
        const actualValue = payload[cond.field];
        if (cond.operator === 'EQUALS' && actualValue !== cond.value) conditionsMet = false;
        if (cond.operator === 'GREATER_THAN' && Number(actualValue) <= Number(cond.value)) conditionsMet = false;
        if (cond.operator === 'LESS_THAN' && Number(actualValue) >= Number(cond.value)) conditionsMet = false;
      }

      if (!conditionsMet) continue;

      let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let errorMsg: string | undefined;

      try {
        if (rule.actionType === 'SEND_NOTIFICATION') {
          await NotificationService.send({
            tenantId,
            userId: payload.userId || 'ALL',
            title: rule.actionConfig?.title || 'Otomasyon Bildirimi',
            body: `${rule.name}: ${payload.message || 'Kural tetiklendi.'}`,
            eventType: 'OVERDUE_MATURITY',
            data: payload,
          });
        } else if (rule.actionType === 'TRIGGER_WEBHOOK') {
          await this.dispatchWebhooks(tenantId, eventType, payload);
        }
      } catch (err: any) {
        status = 'FAILED';
        errorMsg = err.message;
      }

      const runRecord: AutomationRun = {
        id: `run-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId,
        ruleId: rule.id,
        ruleName: rule.name,
        triggerEvent: eventType,
        status,
        actionExecuted: rule.actionType,
        errorMessage: errorMsg,
        executedAt: now,
      };

      runs.push(runRecord);

      await storage.runTransaction((draft: DatabaseState) => {
        if (!draft.automationRuns) draft.automationRuns = [];
        draft.automationRuns.unshift(runRecord);
      });
    }

    return runs;
  }

  /**
   * HMAC-SHA256 imzalı webhook gönderimi yapar
   */
  public static async dispatchWebhooks(tenantId: string, event: string, payload: any): Promise<void> {
    const db = storage.getState();
    const endpoints = (db.webhookEndpoints || []).filter(
      w => (w.tenantId === tenantId || (!w.tenantId && tenantId === 'tnt-isbey')) && w.isActive && (w.events.includes(event) || w.events.includes('*'))
    );

    const now = new Date().toISOString();

    for (const ep of endpoints) {
      const payloadString = JSON.stringify({
        event,
        tenantId,
        timestamp: now,
        data: payload,
      });

      // 2026-09-12 (uydurma iletim temizliği / güvenlik):
      //  (a) Önceden HMAC anahtarı `ep.secret || 'isbey_secret'` şeklindeydi:
      //      secret'i BOŞ olan bir endpoint, kaynak kodda yazılı, herkesin bildiği
      //      bir anahtarla imzalanıyordu → alıcı imzayı doğrulasa bile bu bir
      //      güvenlik garantisi DEĞİLDİ. Artık secret yoksa GÖNDERİM YAPILMAZ;
      //      kayıt alıcıya hiç ulaşmadığı için dürüstçe 'FAILED' işaretlenir.
      //  (b) Önceden hiç HTTP isteği YAPILMIYORDU; yine de `responseStatus: 200`,
      //      `status: 'DELIVERED'`, `lastDeliveryStatus: 'SUCCESS'` yazılarak
      //      "Mock Dispatch" iletimi gerçekmiş gibi kaydediliyordu. Bu, CLAUDE.md
      //      md.1'in "API response'u uydurmak / simüle etmek yasağı"na giriyordu.
      //      Artık gönderim GERÇEK fetch ile yapılır; 2xx dışı veya ağ hatası
      //      'FAILED' olarak kaydedilir. Otomatik retry YOKTUR: otomasyon webhook'u
      //      yan etkili olabilir (mükerrer tetikleme önlenir).
      const secret = String(ep.secret || '').trim();
      let responseStatus: number | undefined;
      let responseBody: string | undefined;
      let status: 'DELIVERED' | 'FAILED' = 'FAILED';
      let deliveredAt: string | undefined;

      if (!secret) {
        responseBody = 'Webhook secret tanımlı değil; güvenli imza üretilemediği için gönderim yapılmadı.';
      } else if (AutomationEngine.inFlightWebhooks.has(ep.id)) {
        responseBody = 'Aynı uç noktaya eşzamanlı gönderim sürüyor; mükerrer olay önlemek için atlandı.';
      } else {
        AutomationEngine.inFlightWebhooks.add(ep.id);
        const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
          try {
            const resp = await fetch(ep.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-ISBEY-Event': event,
                'X-ISBEY-Signature': `sha256=${signature}`,
              },
              body: payloadString,
              signal: controller.signal,
            });
            responseStatus = resp.status;
            // Yanıt gövdesi denetim kaydına girer; çok büyük olmasın diye kırpılır.
            responseBody = (await resp.text().catch(() => '')).slice(0, 500);
            if (resp.ok) {
              status = 'DELIVERED';
              deliveredAt = new Date().toISOString();
            }
          } finally {
            clearTimeout(timer);
          }
        } catch (err: any) {
          responseBody = `Ağ hatası: ${err?.name === 'AbortError' ? 'zaman aşımı' : (err?.message || 'bilinmeyen hata')}`;
        } finally {
          AutomationEngine.inFlightWebhooks.delete(ep.id);
        }
      }

      const delivery: WebhookDelivery = {
        id: `whd-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId,
        webhookId: ep.id,
        event,
        payload,
        responseStatus,
        responseBody,
        attemptCount: 1,
        status,
        deliveredAt,
        createdAt: now,
      };

      await storage.runTransaction((draft: DatabaseState) => {
        if (!draft.webhookDeliveries) draft.webhookDeliveries = [];
        draft.webhookDeliveries.unshift(delivery);

        const targetEp = (draft.webhookEndpoints || []).find(e => e.id === ep.id);
        if (targetEp) {
          targetEp.lastDeliveryStatus = status === 'DELIVERED' ? 'SUCCESS' : 'FAILED';
          targetEp.lastDeliveryAt = now;
        }
      });
    }
  }
}
