import { DealerCommission, Payment } from '../db/schema';
import { storage } from '../db/storage';

export class CommissionEngine {
  /**
   * Başarılı bir ödeme için Bayi Komisyonunu hesaplar ve kaydeder
   */
  public static async processPaymentCommission(payment: Payment): Promise<DealerCommission | null> {
    if (payment.status !== 'successful' && payment.status !== 'SUCCESS') {
      return null;
    }

    return await storage.runTransaction(draft => {
      // 1. Tenant'ın bağlı olduğu bir bayi var mı?
      const tenant = (draft.tenants || []).find(t => t.id === payment.tenantId);
      if (!tenant) return null;

      // Bayi tespiti (tenant.dealerId veya varsayılan HQ bayi)
      const dealerId = (tenant as any).dealerId || 'dealer-isbey-hq';
      const dealer = (draft.dealers || []).find(d => d.id === dealerId);
      if (!dealer || dealer.status !== 'ACTIVE') return null;

      const rate = dealer.commissionRate || 20; // %20
      const commissionAmount = Math.round(((payment.amount * rate) / 100) * 100) / 100;

      if (!draft.dealerCommissions) draft.dealerCommissions = [];

      // Mükerrer komisyon kontrolü
      const existing = draft.dealerCommissions.find(c => c.paymentId === payment.id);
      if (existing) return existing;

      const now = new Date().toISOString();
      const newCommission: DealerCommission = {
        id: `dcom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dealerId: dealer.id,
        dealerName: dealer.name,
        tenantId: tenant.id,
        tenantName: tenant.name,
        paymentId: payment.id,
        subscriptionId: payment.subscriptionId,
        paymentAmount: payment.amount,
        commissionRate: rate,
        commissionAmount,
        status: 'PENDING',
        notes: `${payment.paymentType} işlemi üzerinden %${rate} bayi hakedişi`,
        createdAt: now,
      };

      draft.dealerCommissions.unshift(newCommission);

      // Bayi bakiyesini artır
      dealer.balance = Math.round(((dealer.balance || 0) + commissionAmount) * 100) / 100;
      dealer.updatedAt = now;

      storage.addAuditLog({
        userId: 'system',
        username: 'CommissionEngine',
        companyId: tenant.id,
        action: 'COMMISSION_CREATED',
        module: 'SETTINGS',
        documentNo: newCommission.id,
        ipAddress: '127.0.0.1',
        details: `${dealer.name} için ${payment.orderNumber} nolu tahsilattan ${commissionAmount} TL (%${rate}) komisyon tahakkuk ettirildi.`,
      });

      return newCommission;
    });
  }

  /**
   * İade durumunda komisyonu ters kayıtla iptal eder / düşer
   */
  public static async reverseCommission(paymentId: string, reason: string = 'Ödeme İadesi'): Promise<boolean> {
    return await storage.runTransaction(draft => {
      if (!draft.dealerCommissions) return false;
      const comm = draft.dealerCommissions.find(c => c.paymentId === paymentId);
      if (!comm || comm.status === 'CANCELLED') return false;

      comm.status = 'CANCELLED';
      comm.notes = `${comm.notes || ''} [İPTAL: ${reason}]`;

      const dealer = (draft.dealers || []).find(d => d.id === comm.dealerId);
      if (dealer) {
        dealer.balance = Math.max(0, Math.round(((dealer.balance || 0) - comm.commissionAmount) * 100) / 100);
        dealer.updatedAt = new Date().toISOString();
      }

      return true;
    });
  }
}
