import crypto from 'crypto';
import { storage } from '../../db/storage';
import { ApprovalRule, ApprovalRequest, DatabaseState } from '../../db/schema';
import { ActivityAuditService } from './activityAuditService';

export class ApprovalEngine {
  /**
   * Tutara ve belge türüne göre onay talebi oluşturur
   */
  public static async requestApproval(params: {
    tenantId: string;
    entityType: ApprovalRequest['entityType'];
    entityId: string;
    documentNo: string;
    title: string;
    amount: number;
    currency?: string;
    requestedByUserId: string;
    requestedByName: string;
  }): Promise<ApprovalRequest> {
    const {
      tenantId,
      entityType,
      entityId,
      documentNo,
      title,
      amount,
      currency = 'TRY',
      requestedByUserId,
      requestedByName,
    } = params;

    const db = storage.getState();
    const rules = (db.approvalRules || []).filter(
      r => (r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')) && r.isActive && r.documentType === entityType
    );

    // Tutar aralığına uygun kuralı bul
    const matchedRule = rules.find(r => amount >= r.minAmount && amount <= r.maxAmount);
    const requiredRole = matchedRule ? matchedRule.approverRole : (amount > 50000 ? 'OWNER' : 'MANAGER');

    const now = new Date().toISOString();
    const reqId = `app-req-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    const newRequest: ApprovalRequest = {
      id: reqId,
      tenantId,
      entityType,
      entityId,
      documentNo,
      title,
      requestedByUserId,
      requestedByName,
      amount,
      currency,
      status: 'PENDING',
      requiredRole,
      createdAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.approvalRequests) draft.approvalRequests = [];
      draft.approvalRequests.unshift(newRequest);

      ActivityAuditService.logActivityDraft(draft, {
        tenantId,
        userId: requestedByUserId,
        userName: requestedByName,
        actionType: 'CREATE',
        entityType: 'APPROVAL_REQUEST',
        entityId: newRequest.id,
        title: `Onay talebi oluşturuldu: ${documentNo} (${amount.toLocaleString('tr-TR')} ${currency}) ➔ ${requiredRole}`,
      });

      return newRequest;
    });
  }

  /**
   * Talebi onaylar veya reddeder
   */
  public static async processApproval(params: {
    tenantId: string;
    requestId: string;
    decision: 'APPROVE' | 'REJECT';
    approverUserId: string;
    approverName: string;
    rejectReason?: string;
  }): Promise<ApprovalRequest> {
    const { tenantId, requestId, decision, approverUserId, approverName, rejectReason } = params;
    const now = new Date().toISOString();

    return await storage.runTransaction((draft: DatabaseState) => {
      const req = (draft.approvalRequests || []).find(r => r.id === requestId && (r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')));
      if (!req) throw new Error('Onay talebi bulunamadı.');

      req.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      req.approverUserId = approverUserId;
      req.approverName = approverName;
      req.rejectReason = rejectReason;
      req.approvedAt = now;

      ActivityAuditService.logActivityDraft(draft, {
        tenantId,
        userId: approverUserId,
        userName: approverName,
        actionType: decision === 'APPROVE' ? 'APPROVE' : 'REJECT',
        entityType: req.entityType,
        entityId: req.entityId,
        title: `${req.documentNo} belgesi ${decision === 'APPROVE' ? 'ONAYLANDI' : 'REDDEDİLDİ'} (${approverName})`,
      });

      return req;
    });
  }
}
