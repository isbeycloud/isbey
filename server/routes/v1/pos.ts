import { Router } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';

const router = Router();
router.use(requireAuth, resolveTenant);
// Gerçek cihaz adaptörü ve doğrulanmış ödeme sonucu olmadan tahsilat kaydı oluşturulmaz.
router.post('/charge', requirePermission(PERMISSIONS.COLLECTIONS_CREATE), (_req, res) => {
  res.status(503).json({ success: false, code: 'FISCAL_DEVICE_NOT_READY',
    message: 'Yazar kasa/POS bağlantısı henüz doğrulanmadı. Tahsilat yapılmadı.' });
});
router.get('/transactions', requirePermission(PERMISSIONS.CASH_VIEW), (req, res) => {
  const tenantId = req.tenantId!;
  const transactions = (storage.getState().posTransactions || []).filter(t => t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey'));
  res.json({ success: true, count: transactions.length, transactions });
});
export default router;
