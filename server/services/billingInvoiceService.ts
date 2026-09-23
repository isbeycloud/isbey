import { BillingInvoice, BillingInvoiceItem, Payment } from '../db/schema';
import { storage } from '../db/storage';

export class BillingInvoiceService {
  /**
   * Başarılı ödeme sonrasında resmi SaaS Hizmet Faturasını üretir
   */
  public static async createBillingInvoice(
    payment: Payment,
    items: Array<{ description: string; quantity: number; unitPrice: number; vatRate?: number }>
  ): Promise<BillingInvoice> {
    return await storage.runTransaction(draft => {
      const tenant = (draft.tenants || []).find(t => t.id === payment.tenantId);
      const invoiceNumber = storage.nextSequenceInTransaction(draft, 'SAAS_INVOICE');
      const now = new Date().toISOString();

      const invoiceItems: BillingInvoiceItem[] = items.map((it, idx) => {
        const vatRate = it.vatRate ?? 20;
        const sub = it.unitPrice * it.quantity;
        const vat = Math.round((sub * (vatRate / 100)) * 100) / 100;
        return {
          id: `bitem-${Date.now()}-${idx + 1}`,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          vatRate,
          vatAmount: vat,
          totalAmount: sub + vat,
        };
      });

      const subtotal = invoiceItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      const vatAmount = invoiceItems.reduce((sum, i) => sum + i.vatAmount, 0);
      const totalAmount = subtotal + vatAmount;

      const newInvoice: BillingInvoice = {
        id: `binv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: payment.tenantId,
        tenantName: tenant?.name || 'Müşteri',
        tenantTaxNumber: tenant?.taxNumber,
        tenantAddress: tenant?.address,
        subscriptionId: payment.subscriptionId,
        paymentId: payment.id,
        invoiceNumber,
        invoiceDate: now,
        periodStart: now,
        periodEnd: new Date(Date.now() + 365 * 86400000).toISOString(),
        subtotal,
        vatAmount,
        discountAmount: 0,
        totalAmount,
        currency: payment.currency || 'TRY',
        status: 'paid',
        paidAt: payment.paidAt || now,
        items: invoiceItems,
        createdAt: now,
      };

      if (!draft.billingInvoices) draft.billingInvoices = [];
      draft.billingInvoices.unshift(newInvoice);

      // Payment nesnesiyle ilişkilendir
      const payRecord = (draft.payments || []).find(p => p.id === payment.id);
      if (payRecord) {
        payRecord.billingInvoiceId = newInvoice.id;
      }

      return newInvoice;
    });
  }
}
