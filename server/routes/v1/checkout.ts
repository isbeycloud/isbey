import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { PaymentGatewayAdapter } from '../../services/payments/paymentGatewayAdapter';

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
v1CheckoutRouter.post('/pay', requirePermission(PERMISSIONS.COMPANY_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    const result = await PaymentGatewayAdapter.processPayment({
      tenantId,
      ...req.body,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
