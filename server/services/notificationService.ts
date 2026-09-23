import { storage } from '../db/storage';
import { PushNotificationRecord, DatabaseState } from '../db/schema';

export interface SendNotificationParams {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  eventType: 'NEW_COLLECTION' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'NEW_ORDER' | 'STOCK_ALERT' | 'OVERDUE_MATURITY';
  data?: Record<string, any>;
  channel?: 'PUSH' | 'SMS' | 'EMAIL';
}

export class NotificationService {
  /**
   * Mobil push bildirimi ve sistem bildirimi gönderir
   */
  public static async send(params: SendNotificationParams): Promise<PushNotificationRecord> {
    const { tenantId, userId, title, body, eventType, data, channel = 'PUSH' } = params;
    const now = new Date().toISOString();

    const record: PushNotificationRecord = {
      id: `pnotif-${Date.now()}`,
      tenantId,
      userId,
      title,
      body,
      eventType,
      data,
      isRead: false,
      isSent: true,
      channel,
      createdAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.pushNotifications) draft.pushNotifications = [];
      draft.pushNotifications.unshift(record);

      // Ayrıca ana SystemNotification tablosuna da ekle
      if (!draft.notifications) draft.notifications = [];
      draft.notifications.unshift({
        id: `notif-${Date.now()}`,
        type: 'SYSTEM_INFO',
        severity: eventType === 'PAYMENT_FAILED' ? 'ERROR' : 'INFO',
        title,
        message: body,
        isRead: false,
        createdAt: now,
      });

      return record;
    });
  }

  /**
   * Kullanıcının bildirimlerini listeler
   */
  public static getUserNotifications(tenantId: string, userId: string): PushNotificationRecord[] {
    const db = storage.getState();
    return (db.pushNotifications || []).filter(
      n => (n.tenantId === tenantId || (!n.tenantId && tenantId === 'tnt-isbey')) && (n.userId === userId || n.userId === 'ALL')
    );
  }

  /**
   * Bildirimi okundu olarak işaretler
   */
  public static async markAsRead(id: string, tenantId: string): Promise<boolean> {
    return await storage.runTransaction((draft: DatabaseState) => {
      const n = (draft.pushNotifications || []).find(notif => notif.id === id && notif.tenantId === tenantId);
      if (n) {
        n.isRead = true;
        return true;
      }
      return false;
    });
  }
}
