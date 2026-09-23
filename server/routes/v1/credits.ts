import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { requireAuth } from '../../middleware/authGuards';
import { CreditWalletService } from '../../services/creditWalletService';
import { MockPaymentProvider } from '../../services/payments/mockPaymentProvider';
import { CommissionEngine } from '../../services/commissionEngine';
import { BillingInvoiceService } from '../../services/billingInvoiceService';
import { Payment } from '../../db/schema';

export const creditsRouter = Router();

creditsRouter.use(requireAuth);

// GET /api/v1/credits/wallet - Cüzdan bakiye ve uyarı bilgilerini getir
creditsRouter.get('/wallet', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const wallet = await CreditWalletService.getWallet(tenantId);
  const availableBalance = wallet.balance - (wallet.reservedBalance || 0);
  const isLowCredit = availableBalance <= (wallet.lowCreditThreshold || 20);

  res.json({
    success: true,
    wallet,
    availableBalance,
    isLowCredit,
    lowCreditMessage: isLowCredit
      ? `e-Belge kontörünüz azalıyor! Kalan kullanılabilir kontör: ${availableBalance}. İşlemlerinizin aksamaması için lütfen kontör yükleyiniz.`
      : undefined,
  });
});

// GET /api/v1/credits/packages - Satın alınabilir kontör paketlerini listele
creditsRouter.get('/packages', (req: Request, res: Response) => {
  const db = storage.getState();
  const packages = (db.creditPackages || []).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  res.json({
    success: true,
    packages,
  });
});

// POST /api/v1/credits/purchase - Online Kredi Kartı ile Kontör Satın Alma
creditsRouter.post('/purchase', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { packageId, cardNumber, cardHolder, expireMonth, expireYear, cvv } = req.body;
  const db = storage.getState();

  const pkg = (db.creditPackages || []).find(p => p.id === packageId);
  if (!pkg) {
    return res.status(404).json({ success: false, message: 'Seçilen kontör paketi bulunamadı.' });
  }

  const provider = new MockPaymentProvider();
  const orderNumber = `ORD-CRD-${Date.now().toString().slice(-8)}`;

  // 1. Ödemeyi İşle
  const payResult = await provider.createPayment({
    tenantId,
    orderType: 'CREDIT_PURCHASE',
    amount: pkg.price,
    vatAmount: Math.round((pkg.price * (pkg.vatRate / 100)) * 100) / 100,
    totalAmount: pkg.totalPrice,
    currency: pkg.currency || 'TRY',
    description: `${pkg.name} Satın Alma`,
    creditPackageId: pkg.id,
    creditQuantity: pkg.quantity || pkg.creditAmount || 100,
    cardNumber,
    cardHolder,
    expireMonth,
    expireYear,
    cvv,
    userId: req.user?.id,
    username: req.user?.fullName,
  });

  if (!payResult.success) {
    return res.status(400).json({
      success: false,
      message: payResult.errorMessage || 'Ödeme banka tarafından reddedildi.',
    });
  }

  const now = new Date().toISOString();
  const newPayment: Payment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    paymentProvider: 'MOCK',
    providerPaymentId: payResult.providerPaymentId,
    orderNumber,
    amount: pkg.price,
    currency: pkg.currency || 'TRY',
    vatAmount: Math.round((pkg.price * (pkg.vatRate / 100)) * 100) / 100,
    totalAmount: pkg.totalPrice,
    status: 'successful',
    paymentType: 'CREDIT_PURCHASE',
    description: `${pkg.name} Online Satın Alma`,
    cardLast4: payResult.cardLast4,
    cardBrand: payResult.cardBrand,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await storage.runTransaction(draft => {
    if (!draft.payments) draft.payments = [];
    draft.payments.unshift(newPayment);
  });

  // 2. Kontör Cüzdanına Yükle
  const creditQty = pkg.quantity || pkg.creditAmount || 100;
  await CreditWalletService.addCredits(
    tenantId,
    creditQty,
    'purchase',
    `${pkg.name} Online Satın Alındı`,
    'ONLINE_PAYMENT',
    orderNumber,
    req.user?.fullName || 'Online Ödeme'
  );

  // 3. Fatura ve Bayi Komisyonunu İşle
  await BillingInvoiceService.createBillingInvoice(newPayment, [
    {
      description: `${pkg.name} (${creditQty} Adet e-Dönüşüm / e-Belge Kontörü)`,
      quantity: 1,
      unitPrice: pkg.price,
      vatRate: pkg.vatRate,
    },
  ]);

  await CommissionEngine.processPaymentCommission(newPayment);

  const updatedWallet = await CreditWalletService.getWallet(tenantId);

  res.json({
    success: true,
    message: `${pkg.name} başarıyla satın alındı ve cüzdanınıza yüklendi!`,
    payment: newPayment,
    wallet: updatedWallet,
  });
});

// GET /api/v1/credits/transactions - Detaylı Kontör Hareket Ekstresi
creditsRouter.get('/transactions', (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const txs = (db.creditTransactions || []).filter(
    t => (t as any).tenantId === tenantId || (t as any).customerId === tenantId
  );

  res.json({
    success: true,
    transactions: txs,
  });
});
