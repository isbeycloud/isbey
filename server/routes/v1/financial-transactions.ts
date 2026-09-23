import { Router, Request, Response } from 'express';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { FinancialTransactionService } from '../../services/financialTransactionService';

export const v1FinancialTransactionsRouter = Router();

v1FinancialTransactionsRouter.use(requireAuth, resolveTenant);

/**
 * POST /api/v1/financial-transactions/:id/cancel
 * Finansal işlem iptali ve ters kayıt
 */
v1FinancialTransactionsRouter.post('/:id/cancel', requirePermission(PERMISSIONS.COLLECTIONS_CANCEL), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { reason = 'Kullanıcı talebi ile iptal' } = req.body;

  try {
    const cancelledTx = await FinancialTransactionService.cancelAccountTransaction(
      String(req.params.id),
      tenantId,
      reason,
      user.id,
      user.fullName || user.username
    );
    res.json({ success: true, message: 'Finansal işlem başarıyla iptal edildi.', transaction: cancelledTx });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
