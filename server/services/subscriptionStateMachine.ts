import { Subscription, SubscriptionStatus, SubscriptionPlan } from '../db/schema';
import { storage } from '../db/storage';

export interface ProrationResult {
  currentPlan: SubscriptionPlan;
  newPlan: SubscriptionPlan;
  billingCycle: 'monthly' | 'yearly';
  daysInPeriod: number;
  daysRemaining: number;
  daysUsed: number;
  unusedCurrentPlanValue: number;
  newPlanCost: number;
  netProratedAmount: number; // Ödenecek net tutar (KDV hariç)
  vatAmount: number;
  totalPayableAmount: number; // KDV dahil
}

export class SubscriptionStateMachine {
  private static validTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    trial: ['active', 'expired', 'cancelled'],
    active: ['past_due', 'cancelled', 'expired', 'suspended', 'active'],
    past_due: ['active', 'suspended', 'cancelled'],
    suspended: ['active', 'cancelled'],
    cancelled: ['active', 'trial'],
    expired: ['active', 'trial'],
  };

  /**
   * Durum geçişinin geçerli olup olmadığını doğrular
   */
  public static isValidTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
    const allowed = this.validTransitions[from] || [];
    return allowed.includes(to);
  }

  /**
   * Abonelik durumunu atomik olarak günceller
   */
  public static async transitionStatus(
    tenantId: string,
    targetStatus: SubscriptionStatus,
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; subscription: Subscription; message: string }> {
    return await storage.runTransaction(draft => {
      const sub = (draft.subscriptions || []).find(s => s.tenantId === tenantId);
      if (!sub) {
        throw new Error('Tenant aboneliği bulunamadı.');
      }

      if (!this.isValidTransition(sub.status, targetStatus)) {
        throw new Error(`Geçersiz durum geçişi: '${sub.status}' durumundan '${targetStatus}' durumuna geçilemez.`);
      }

      const prevStatus = sub.status;
      const now = new Date().toISOString();

      sub.status = targetStatus;
      sub.updatedAt = now;

      if (targetStatus === 'cancelled') {
        sub.cancelledAt = now;
        sub.cancelReason = (reason as any) || 'other';
        sub.autoRenew = false;
      }

      // Tenant nesnesini de senkronize et
      const tenant = (draft.tenants || []).find(t => t.id === tenantId);
      if (tenant) {
        if (targetStatus === 'suspended') {
          tenant.status = 'SUSPENDED';
        } else if (targetStatus === 'active') {
          tenant.status = 'ACTIVE';
        } else if (targetStatus === 'expired') {
          tenant.status = 'EXPIRED';
        }
        tenant.updatedAt = now;
      }

      storage.addAuditLog({
        userId: 'system',
        username: 'SubscriptionStateMachine',
        companyId: tenantId,
        action: 'SUBSCRIPTION_STATUS_CHANGED',
        module: 'SETTINGS',
        documentNo: sub.id,
        ipAddress: '127.0.0.1',
        details: `Abonelik durumu '${prevStatus}' -> '${targetStatus}' olarak değiştirildi. Neden: ${reason || 'Sistem / Kullanıcı işlemi'}`,
      });

      return {
        success: true,
        subscription: sub,
        message: `Abonelik durumu başarıyla '${targetStatus}' olarak güncellendi.`,
      };
    });
  }

  /**
   * Upgrade / Downgrade için Proration (Kıstelyevm) Fiyat Farkı Hesaplaması
   */
  public static calculateProration(
    currentSub: Subscription,
    currentPlan: SubscriptionPlan,
    newPlan: SubscriptionPlan,
    newBillingCycle?: 'monthly' | 'yearly'
  ): ProrationResult {
    const cycle = newBillingCycle || currentSub.billingCycle || 'monthly';
    const now = new Date().getTime();
    const start = new Date(currentSub.startDate).getTime();
    const end = new Date(currentSub.endDate).getTime();

    const totalPeriodMs = Math.max(1, end - start);
    const remainingMs = Math.max(0, end - now);
    const usedMs = Math.max(0, now - start);

    const daysInPeriod = Math.round(totalPeriodMs / (1000 * 60 * 60 * 24)) || (cycle === 'yearly' ? 365 : 30);
    const daysRemaining = Math.round(remainingMs / (1000 * 60 * 60 * 24));
    const daysUsed = Math.max(0, daysInPeriod - daysRemaining);

    const currentPlanBasePrice = currentSub.billingCycle === 'yearly' ? currentPlan.yearlyPrice : currentPlan.monthlyPrice;
    const newPlanBasePrice = cycle === 'yearly' ? newPlan.yearlyPrice : newPlan.monthlyPrice;

    // Kalan gün değerinin iade kredisi
    const unusedFraction = daysRemaining / daysInPeriod;
    const unusedCurrentPlanValue = Math.round((currentPlanBasePrice * unusedFraction) * 100) / 100;

    // Yeni planın tam dönem veya kalan gün tutarı
    const newPlanCost = newPlanBasePrice;
    const netProratedAmount = Math.max(0, Math.round((newPlanCost - unusedCurrentPlanValue) * 100) / 100);
    const vatAmount = Math.round((netProratedAmount * 0.20) * 100) / 100;
    const totalPayableAmount = Math.round((netProratedAmount + vatAmount) * 100) / 100;

    return {
      currentPlan,
      newPlan,
      billingCycle: cycle,
      daysInPeriod,
      daysRemaining,
      daysUsed,
      unusedCurrentPlanValue,
      newPlanCost,
      netProratedAmount,
      vatAmount,
      totalPayableAmount,
    };
  }
}
