import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { requireAuth } from '../../middleware/authGuards';
// FAZ 25.4: webhook abuse rate limit — yalnızca public webhook ucu (kimlikli uçlar limit dışı)
import { webhookRateLimit } from '../../middleware/productionSecurity';
import { MockPaymentProvider } from '../../services/payments/mockPaymentProvider';
import { CommissionEngine } from '../../services/commissionEngine';
import { BillingInvoiceService } from '../../services/billingInvoiceService';
import { CreditWalletService } from '../../services/creditWalletService';
import { Payment } from '../../db/schema';
import { MonitoringService } from '../../services/monitoringService';

export const paymentsRouter = Router();

// POST /api/v1/payments/webhook - Ödeme Sağlayıcı Webhook Bildirimi (Public - Signature Doğrulamalı)
paymentsRouter.post('/webhook', webhookRateLimit, async (req: Request, res: Response) => {
  // FAZ 25.3 #2 (docs/09 §25.5): Fallback secret YASAK (CLAUDE.md kuralı).
  // Secret tanımsızsa fail-closed → 503; webhook işlemi reddedilir.
  const secretKey = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secretKey) {
    console.error('[PAYMENTS] PAYMENT_WEBHOOK_SECRET tanımsız — webhook fail-closed reddedildi (503).');
    MonitoringService.recordWebhookEvent('mock-payment', '/api/v1/payments/webhook', 'REJECTED', 'PAYMENT_WEBHOOK_SECRET tanımsız');
    return res.status(503).json({ success: false, message: 'Webhook imza doğrulaması yapılandırılmamış. İşlem reddedildi.' });
  }

  // İmza header'ı zorunlu — sahte default değer KULLANILMAZ (FAZ 25.3 #2)
  const signature = (req.headers['x-signature'] as string) || '';
  const provider = new MockPaymentProvider();

  // 1. İmza Doğrulama
  const isValid = !!signature && provider.validateWebhookSignature(req.body, signature, secretKey);
  if (!isValid) {
    MonitoringService.recordWebhookEvent('mock-payment', '/api/v1/payments/webhook', 'INVALID_SIGNATURE', 'Geçersiz x-signature');
    return res.status(401).json({ success: false, message: 'Geçersiz webhook imzası.' });
  }

  const { eventType, providerPaymentId, tenantId, status, amount } = req.body;
  const db = storage.getState();

  // 2. Idempotency Kontrolü: Bu provider payment ID daha önce işlendi mi?
  const existingPayment = (db.payments || []).find(p => p.providerPaymentId === providerPaymentId);
  if (existingPayment && existingPayment.status === 'successful') {
    return res.json({
      success: true,
      message: 'Bu ödeme bildirimi zaten başarıyla işlenmiş (Idempotent response).',
    });
  }

  if (eventType === 'PAYMENT_SUCCESS') {
    const now = new Date().toISOString();
    const newPayment: Payment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId: tenantId || 'tnt-isbey',
      paymentProvider: 'MOCK',
      providerPaymentId: providerPaymentId || `WEBHOOK-TX-${Date.now()}`,
      orderNumber: `ORD-WH-${Date.now().toString().slice(-6)}`,
      amount: amount || 100,
      currency: 'TRY',
      vatAmount: Math.round(((amount || 100) * 0.20) * 100) / 100,
      totalAmount: Math.round(((amount || 100) * 1.20) * 100) / 100,
      status: 'successful',
      paymentType: 'SUBSCRIPTION',
      description: 'Webhook ile Onaylanan Tahsilat',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await storage.runTransaction(draft => {
      if (!draft.payments) draft.payments = [];
      draft.payments.unshift(newPayment);
    });

    await CommissionEngine.processPaymentCommission(newPayment);
    MonitoringService.recordPaymentEvent('WEBHOOK', 'mock-payment', amount, providerPaymentId, { tenantId });
  }

  MonitoringService.recordWebhookEvent('mock-payment', '/api/v1/payments/webhook', 'SUCCESS', `Event: ${eventType || 'payment'}`);
  res.json({ success: true, message: 'Webhook başarıyla işlendi.' });
});

// Korumalı Endpoints
paymentsRouter.use(requireAuth);

// GET /api/v1/payments/history - Şirketin tüm ödeme geçmişini listele
paymentsRouter.get('/history', (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const payments = (db.payments || []).filter(p => p.tenantId === tenantId);
  const invoices = (db.billingInvoices || []).filter(i => i.tenantId === tenantId);

  res.json({
    success: true,
    payments,
    invoices,
  });
});

// GET /api/v1/payments/:id - Tekil ödeme detayı
paymentsRouter.get('/:id', (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const payment = (db.payments || []).find(p => p.id === req.params.id && p.tenantId === tenantId);

  if (!payment) {
    return res.status(404).json({ success: false, message: 'Ödeme kaydı bulunamadı.' });
  }

  const invoice = (db.billingInvoices || []).find(i => i.id === payment.billingInvoiceId || i.paymentId === payment.id);

  res.json({
    success: true,
    payment,
    invoice,
  });
});

// POST /api/v1/payments/:id/refund - Ödeme İadesi (Refund)
paymentsRouter.post('/:id/refund', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { reason, amount } = req.body;
  const db = storage.getState();

  const payment = (db.payments || []).find(p => p.id === req.params.id && p.tenantId === tenantId);
  if (!payment) return res.status(404).json({ success: false, message: 'Ödeme kaydı bulunamadı.' });
  if (payment.status !== 'successful' && payment.status !== 'SUCCESS') {
    return res.status(400).json({ success: false, message: 'Yalnızca başarılı ödemeler iade edilebilir.' });
  }

  const provider = new MockPaymentProvider();
  const refundAmount = amount || payment.totalAmount;

  const refundResult = await provider.refundPayment({
    paymentId: payment.id,
    providerPaymentId: payment.providerPaymentId,
    amount: refundAmount,
    reason,
  });

  if (!refundResult.success) {
    return res.status(400).json({ success: false, message: refundResult.errorMessage || 'İade işlemi başarısız oldu.' });
  }

  const now = new Date().toISOString();
  await storage.runTransaction(draft => {
    const p = (draft.payments || []).find(item => item.id === payment.id);
    if (p) {
      p.status = 'refunded';
      p.refundedAmount = refundAmount;
      p.refundedAt = now;
      p.updatedAt = now;
    }

    const inv = (draft.billingInvoices || []).find(item => item.id === payment.billingInvoiceId || item.paymentId === payment.id);
    if (inv) {
      inv.status = 'refunded';
    }
  });

  // Bayi komisyonunu ters kayıtla geri al
  await CommissionEngine.reverseCommission(payment.id, reason || 'Müşteri İade Talebi');

  res.json({
    success: true,
    message: `${refundAmount} TL tutarındaki ödeme başarıyla iade edildi.`,
    refundResult,
  });
});
