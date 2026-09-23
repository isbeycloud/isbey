import { Router } from 'express';
import { BankMatchingService } from '../../services/bankMatchingService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/bank-matching/suggestions
 * Banka hareketleri için otomatik eşleştirme ve güven skoru önerileri
 */
router.get('/suggestions', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const suggestions = await BankMatchingService.analyzeBankTransactions(tenantId);
    return res.json({ success: true, count: suggestions.length, suggestions });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Banka eşleştirme analiz hatası.' });
  }
});

/**
 * POST /api/v1/bank-matching/reconcile
 * Banka hareketi ile cari/faturayı mutabık kılar ve kesinleştirir
 */
router.post('/reconcile', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { bankTransactionId, customerId, invoiceId, notes, reconciledBy = 'Muhasebe Yetkilisi' } = req.body;

    if (!bankTransactionId || !customerId) {
      return res.status(400).json({ success: false, message: 'Banka hareketi ve müşteri bilgisi zorunludur.' });
    }

    const match = await BankMatchingService.reconcileTransaction({
      tenantId,
      bankTransactionId,
      customerId,
      invoiceId,
      reconciledBy,
      notes,
    });

    return res.json({
      success: true,
      message: 'Banka mutabakatı başarıyla onaylandı ve cari hesaba işlendi.',
      match,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Mutabakat işlemi başarısız oldu.' });
  }
});

export default router;
