import { storage } from '../../db/storage';
import { CommissionPayoutTx, DatabaseState, PartnerNode } from '../../db/schema';

export class CommissionEngine {
  /**
   * Decimal hassasiyetinde komisyon hesaplar ve partner cüzdanına ekler
   */
  public static async calculateAndAccrueCommission(params: {
    partnerId: string;
    tenantId: string;
    tenantName: string;
    paymentId: string;
    serviceType: 'SUBSCRIPTION_NEW' | 'SUBSCRIPTION_RENEWAL' | 'CREDIT_PURCHASE' | 'MARKETPLACE_APP';
    grossAmount: number;
    discountAmount?: number;
  }): Promise<CommissionPayoutTx> {
    const { partnerId, tenantId, tenantName, paymentId, serviceType, grossAmount, discountAmount = 0 } = params;
    const now = new Date().toISOString();

    const db = storage.getState();
    const partner = (db.partnerNodes || []).find(p => p.id === partnerId);
    if (!partner) throw new Error('İlgili bayi / partner bulunamadı.');

    const rule = (db.commissionRuleRecords || []).find(r => r.targetService === serviceType && r.isActive);
    const commissionRate = rule ? rule.commissionRate : partner.defaultCommissionRate;

    // Decimal hesaplama
    const netAmount = Math.max(0, grossAmount - discountAmount);
    const commissionAmount = Math.round((netAmount * (commissionRate / 100)) * 100) / 100;

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.commissionPayoutTxs) draft.commissionPayoutTxs = [];
      if (!draft.partnerNodes) draft.partnerNodes = [];

      const tx: CommissionPayoutTx = {
        id: `com-tx-${Date.now()}`,
        partnerId: partner.id,
        partnerName: partner.name,
        tenantId,
        tenantName,
        paymentId,
        serviceType,
        grossAmount,
        discountAmount,
        netAmount,
        commissionRate,
        commissionAmount,
        status: 'PENDING',
        createdAt: now,
      };

      draft.commissionPayoutTxs.unshift(tx);

      const pDraft = draft.partnerNodes.find(p => p.id === partnerId);
      if (pDraft) {
        pDraft.pendingCommission += commissionAmount;
        pDraft.updatedAt = now;
      }

      return tx;
    });
  }

  /**
   * Bayi komisyonunu onayla ve cüzdana aktar
   */
  public static async approveCommission(txId: string): Promise<CommissionPayoutTx> {
    const now = new Date().toISOString();
    return await storage.runTransaction((draft: DatabaseState) => {
      const tx = (draft.commissionPayoutTxs || []).find(t => t.id === txId);
      if (!tx) throw new Error('Komisyon kaydı bulunamadı.');
      if (tx.status === 'APPROVED' || tx.status === 'PAID') return tx;

      tx.status = 'APPROVED';

      const partner = (draft.partnerNodes || []).find(p => p.id === tx.partnerId);
      if (partner) {
        partner.pendingCommission = Math.max(0, partner.pendingCommission - tx.commissionAmount);
        partner.walletBalance += tx.commissionAmount;
        partner.updatedAt = now;
      }

      return tx;
    });
  }
}
