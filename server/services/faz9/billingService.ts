import { storage } from '../../db/storage';
import { Subscription, DatabaseState, SaaSPlanItem } from '../../db/schema';
import { PaymentProviderFactory } from './paymentProvider';
import { PlanService } from './planService';

export class BillingService {
  /**
   * Tenant'ın aktif abonelik durumunu döndürür
   */
  public static getSubscription(tenantId: string): Subscription | undefined {
    const db = storage.getState();
    return (db.subscriptions || []).find(s => s.tenantId === tenantId);
  }

  /**
   * Yeni abonelik başlatır veya plan yükseltir / değiştirir
   */
  public static async upgradeOrChangePlan(params: {
    tenantId: string;
    newPlanSlug: string;
    billingCycle: 'monthly' | 'yearly';
    couponCode?: string;
    paymentProvider?: 'MOCK' | 'IYZICO' | 'PAYTR';
  }): Promise<{ success: boolean; subscription: Subscription; paidAmount: number }> {
    const { tenantId, newPlanSlug, billingCycle, couponCode, paymentProvider = 'MOCK' } = params;
    const now = new Date().toISOString();

    const plan = PlanService.getPlanBySlug(newPlanSlug);
    if (!plan) throw new Error('Geçersiz plan seçimi.');

    let baseAmount = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

    // Kupon İndirimi Kontrolü
    const db = storage.getState();
    if (couponCode) {
      const coupon = (db.promoCoupons || []).find(c => c.code.toUpperCase() === couponCode.toUpperCase() && c.isActive);
      if (coupon) {
        if (coupon.discountType === 'PERCENTAGE') {
          baseAmount = baseAmount * (1 - coupon.discountValue / 100);
        } else {
          baseAmount = Math.max(0, baseAmount - coupon.discountValue);
        }
      }
    }

    // Ödeme Al
    const provider = PaymentProviderFactory.getProvider(paymentProvider);
    const paymentResult = await provider.createPayment({
      tenantId,
      orderNumber: `ORD-SUB-${Date.now()}`,
      amount: baseAmount,
      currency: plan.currency,
      description: `İŞBEY Cloud ${plan.name} (${billingCycle === 'yearly' ? 'Yıllık' : 'Aylık'}) Aboneliği`,
    });

    if (!paymentResult.success) {
      throw new Error(paymentResult.errorMessage || 'Abonelik ödemesi başarısız oldu.');
    }

    // Aboneliği Güncelle
    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.subscriptions) draft.subscriptions = [];
      if (!draft.payments) draft.payments = [];
      if (!draft.tenants) draft.tenants = [];

      let sub = draft.subscriptions.find(s => s.tenantId === tenantId);
      const daysToAdd = billingCycle === 'yearly' ? 365 : 30;
      const nextBilling = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

      if (sub) {
        sub.planSlug = newPlanSlug;
        sub.planId = plan.id;
        sub.status = 'active';
        sub.billingCycle = billingCycle;
        sub.nextBillingDate = nextBilling;
        sub.endDate = nextBilling;
        sub.updatedAt = now;
      } else {
        sub = {
          id: `sub-${Date.now()}`,
          tenantId,
          planId: plan.id,
          planSlug: newPlanSlug,
          status: 'active',
          billingCycle,
          startDate: now,
          endDate: nextBilling,
          nextBillingDate: nextBilling,
          gracePeriodDays: 7,
          autoRenew: true,
          createdAt: now,
          updatedAt: now,
        };
        draft.subscriptions.push(sub);
      }

      // Tenant plan bilgisini güncelle
      const t = draft.tenants.find(ten => ten.id === tenantId);
      if (t) {
        t.plan = newPlanSlug.toUpperCase() as any;
      }

      // Ödeme Kaydı
      draft.payments.push({
        id: `pay-sub-${Date.now()}`,
        tenantId,
        subscriptionId: sub.id,
        paymentProvider,
        providerPaymentId: paymentResult.providerPaymentId,
        orderNumber: `ORD-SUB-${Date.now()}`,
        amount: baseAmount,
        currency: plan.currency,
        vatAmount: baseAmount * 0.2,
        totalAmount: baseAmount * 1.2,
        status: 'successful',
        paymentType: 'SUBSCRIPTION',
        description: `${plan.name} Abonelik Yenileme / Geçiş`,
        paidAt: now,
      });

      return {
        success: true,
        subscription: sub,
        paidAmount: baseAmount,
      };
    });
  }

  /**
   * Abonelik İptali
   */
  public static async cancelSubscription(tenantId: string, reason?: string, cancelImmediately = false): Promise<Subscription> {
    const now = new Date().toISOString();
    return await storage.runTransaction((draft: DatabaseState) => {
      const sub = (draft.subscriptions || []).find(s => s.tenantId === tenantId);
      if (!sub) throw new Error('Abonelik bulunamadı.');

      sub.autoRenew = false;
      sub.cancelledAt = now;
      sub.cancelReason = reason || 'Kullanıcı isteği ile iptal edildi.';
      if (cancelImmediately) {
        sub.status = 'cancelled';
      }
      sub.updatedAt = now;
      return sub;
    });
  }
}
