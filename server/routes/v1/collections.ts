import { Router, Request, Response } from 'express';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { FinancialTransactionService } from '../../services/financialTransactionService';

export const v1CollectionsRouter = Router();

v1CollectionsRouter.use(requireAuth, resolveTenant);

/**
 * POST /api/v1/collections
 * Cari Tahsilat (Cari Alacak + Kasa/Banka Giriş)
 */
v1CollectionsRouter.post('/', requirePermission(PERMISSIONS.COLLECTIONS_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    const result = await FinancialTransactionService.createCollection({
      tenantId,
      ...req.body,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
