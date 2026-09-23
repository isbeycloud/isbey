import { storage } from '../../db/storage';
import {
  PaymentOrder,
  PaymentOrderType,
  Tenant,
  CreditTransaction,
} from '../../db/schema';
import { DocumentConversionService } from '../documentConversionService';

export interface ProcessPaymentParams {
  tenantId: string;
  orderType: PaymentOrderType;
  amount: number;
  planSlug?: 'STARTER' | 'PRO' | 'ENTERPRISE';
  billingPeriod?: 'MONTHLY' | 'YEARLY';
  creditPackageId?: string;
  cardNumber: string;
  cardHolder: string;
  expireMonth: string;
  expireYear: string;
  cvv: string;
  userId: string;
  username?: string;
}

export class PaymentGatewayAdapter {
  /**
   * Kredi Kartı ile Sanal POS Ödeme İşlemi
   */
  public static async processPayment(params: ProcessPaymentParams): Promise<{
    success: boolean;
    order: PaymentOrder;
    message: string;
  }> {
    const {
      tenantId,
      orderType,
      amount,
      planSlug,
      billingPeriod = 'MONTHLY',
      creditPackageId,
      cardNumber,
      cvv,
      userId,
      username = 'Sistem',
    } = params;

    const db = storage.getState();
    const tenant = (db.tenants || []).find(t => t.id === tenantId);
    if (!tenant) throw new Error('Şirket / Tenant bulunamadı.');

    const cleanCard = (cardNumber || '').replace(/[^0-9]/g, '');
    const cardLast4 = cleanCard.slice(-4) || '1234';

    // Simüle Hata Kontrolü (Sonu 0000 olan kartlar hata simüle eder)
    if (cleanCard.endsWith('0000') || cvv === '000') {
      const failedOrder: PaymentOrder = {
        id: `pay-${Date.now()}`,
        tenantId,
        orderType,
        orderNumber: `SIP-${Date.now().toString().slice(-6)}`,
        amount,
        currency: 'TRY',
        planSlug,
        billingPeriod,
        creditPackageId,
        paymentMethod: 'CREDIT_CARD',
        status: 'FAILED',
        paymentGateway: 'MOCK',
        cardLast4,
        errorMessage: 'Banka reddi: Yetersiz bakiye veya geçersiz kart bilgileri.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!db.paymentOrders) db.paymentOrders = [];
      db.paymentOrders.unshift(failedOrder);
      storage.save();
      return { success: false, order: failedOrder, message: failedOrder.errorMessage! };
    }

    const now = new Date().toISOString();
    const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

    const successOrder: PaymentOrder = {
      id: `pay-${Date.now()}`,
      tenantId,
      orderType,
      orderNumber,
      amount,
      currency: 'TRY',
      planSlug,
      billingPeriod,
      creditPackageId,
      paymentMethod: 'CREDIT_CARD',
      status: 'SUCCESS',
      paymentGateway: 'MOCK',
      gatewayTransactionId: `TX-MOCK-${Date.now()}`,
      cardLast4,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.paymentOrders) db.paymentOrders = [];
    db.paymentOrders.unshift(successOrder);

    // 1. Paket Yükseltme İşlemi
    if (orderType === 'PLAN_UPGRADE' && planSlug) {
      const plan = (db.subscriptionPlans || []).find(p => p.slug === planSlug);
      if (plan) {
        tenant.plan = planSlug as any;
        tenant.status = 'ACTIVE';
        tenant.maxUsers = plan.maxUsers;
        tenant.maxInvoicesPerMonth = plan.maxInvoicesPerMonth;
        tenant.storageLimitMb = plan.storageLimitMb;
        tenant.activeModules = plan.activeModules as any;
        tenant.eInvoiceCredits = (tenant.eInvoiceCredits || 0) + plan.includedCredits;

        const days = billingPeriod === 'YEARLY' ? 365 : 30;
        const currentExp = new Date(tenant.expiresAt || now);
        const baseDate = currentExp > new Date() ? currentExp : new Date();
        tenant.expiresAt = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
        tenant.updatedAt = now;

        // Kontör Hediye / Plan Kredisi Hareketi
        if (plan.includedCredits > 0) {
          if (!db.creditTransactions) db.creditTransactions = [];
          db.creditTransactions.unshift({
            id: `ctx-${Date.now()}`,
            customerId: tenant.id,
            customerTitle: tenant.name,
            type: 'PURCHASE',
            unit: 'INVOICE_UNIT',
            amount: plan.includedCredits,
            balanceBefore: tenant.eInvoiceCredits - plan.includedCredits,
            balanceAfter: tenant.eInvoiceCredits,
            description: `${plan.name} (${billingPeriod === 'YEARLY' ? 'Yıllık' : 'Aylık'}) paket dahilinde yüklenen kontör`,
            performedBy: username,
            performedByRole: 'COMPANY_ADMIN',
            createdAt: now,
          });
        }
      }
    }

    // 2. Kontör Satın Alma İşlemi
    if (orderType === 'CREDIT_PURCHASE' && creditPackageId) {
      const pkg = (db.creditPackages || []).find(p => p.id === creditPackageId);
      const creditToAdd = pkg ? pkg.creditAmount : 100;
      const prevCredits = tenant.eInvoiceCredits || 0;
      tenant.eInvoiceCredits = prevCredits + creditToAdd;
      tenant.updatedAt = now;

      if (!db.creditTransactions) db.creditTransactions = [];
      db.creditTransactions.unshift({
        id: `ctx-${Date.now()}`,
        customerId: tenant.id,
        customerTitle: tenant.name,
        type: 'PURCHASE',
        unit: 'INVOICE_UNIT',
        amount: creditToAdd,
        balanceBefore: prevCredits,
        balanceAfter: tenant.eInvoiceCredits,
        description: `${pkg ? pkg.name : `${creditToAdd} Kontör`} Online Kredi Kartı ile Satın Alındı`,
        performedBy: username,
        performedByRole: 'COMPANY_ADMIN',
        createdAt: now,
      });
      successOrder.creditAmount = creditToAdd;
    }

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: orderType === 'PLAN_UPGRADE' ? 'SUBSCRIPTION_UPGRADED' : 'CREDITS_PURCHASED',
      module: 'SETTINGS',
      documentNo: orderNumber,
      ipAddress: '127.0.0.1',
      details: `${amount} TL tutarında ${orderType === 'PLAN_UPGRADE' ? `Paket Yükseltme (${planSlug})` : 'Kontör Satın Alma'} işlemi başarıyla tamamlandı.`,
    });

    storage.save();
    return {
      success: true,
      order: successOrder,
      message: 'Ödemeniz başarıyla alındı ve hesabınız anında güncellendi.',
    };
  }
}
