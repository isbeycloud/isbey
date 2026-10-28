import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { PaymentGatewayAdapter } from '../../services/payments/paymentGatewayAdapter';
import { sandboxPaymentOnly } from '../../services/payments/checkoutSafety';

export const v1CheckoutRouter = Router();

v1CheckoutRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/checkout/orders
 * Firmanın geçmiş ödeme ve fatura dökümleri
 */
v1CheckoutRouter.get('/orders', requirePermission(PERMISSIONS.COMPANY_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const orders = (db.paymentOrders || []).filter(o => o.tenantId === tenantId);
  res.json({ success: true, orders });
});

/**
 * POST /api/v1/checkout/pay
 * Doğrudan checkout ödeme motoru
 */
v1CheckoutRouter.post('/pay', requirePermission(PERMISSIONS.COMPANY_UPDATE), sandboxPaymentOnly, async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    const result = await PaymentGatewayAdapter.processPayment({
      orderType: req.body.orderType,
      amount: req.body.amount,
      planSlug: req.body.planSlug,
      billingPeriod: req.body.billingPeriod,
      creditPackageId: req.body.creditPackageId,
      cardNumber: req.body.cardNumber,
      cardHolder: req.body.cardHolder,
      expireMonth: req.body.expireMonth,
      expireYear: req.body.expireYear,
      cvv: req.body.cvv,
      tenantId,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
