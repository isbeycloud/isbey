import crypto from 'crypto';
import { storage } from '../../db/storage';
import { ActivityLog, DatabaseState } from '../../db/schema';

export class ActivityAuditService {
  /**
   * Bir transaction içinden aktivite logu yazar
   */
  public static logActivityDraft(
    draft: DatabaseState,
    entry: {
      tenantId: string;
      userId: string;
      userName: string;
      actionType: ActivityLog['actionType'];
      entityType: string;
      entityId: string;
      title: string;
      details?: { before?: any; after?: any };
    }
  ) {
    if (!draft.activityLogs) draft.activityLogs = [];
    draft.activityLogs.unshift({
      id: `act-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      tenantId: entry.tenantId,
      userId: entry.userId,
      userName: entry.userName,
      actionType: entry.actionType,
      entityType: entry.entityType,
      entityId: entry.entityId,
      title: entry.title,
      details: entry.details,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Bağımsız aktivite logu kaydeder
   */
  public static async log(entry: {
    tenantId: string;
    userId: string;
    userName: string;
    actionType: ActivityLog['actionType'];
    entityType: string;
    entityId: string;
    title: string;
    details?: { before?: any; after?: any };
  }) {
    return await storage.runTransaction((draft: DatabaseState) => {
      this.logActivityDraft(draft, entry);
    });
  }
}
