import { Router } from 'express';
import { storage } from '../../db/storage';
import { MockPosProvider } from '../../services/pos/mockPosProvider';
import { PosTransaction, DatabaseState } from '../../db/schema';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();
const posProvider = new MockPosProvider();

/**
 * POST /api/v1/pos/charge
 * Mobil POS veya Sanal POS üzerinden kart çekimi yapar
 */
router.post('/charge', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const companyId = req.body.companyId || 'cmp-default';
    const { amount, currency = 'TRY', cardNumber, cardHolderName, cardExpiry, cardCvv, installment = 1, referenceType = 'DIRECT_SALE', referenceId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Geçersiz tahsilat tutarı.' });
    }

    const payResult = await posProvider.createPayment({
      tenantId,
      companyId,
      amount,
      currency,
      transactionType: 'SALE',
      referenceType,
      referenceId,
      cardNumber,
      cardHolderName,
      cardExpiry,
      cardCvv,
      installment,
    });

    const now = new Date().toISOString();
    const posTxId = `pos-tx-${Date.now()}`;

    const newTx: PosTransaction = {
      id: posTxId,
      tenantId,
      companyId,
      provider: 'MOCK',
      providerTransactionId: payResult.providerTransactionId,
      amount,
      currency,
      status: payResult.status,
      transactionType: 'SALE',
      referenceType,
      referenceId,
      cardLast4: payResult.cardLast4,
      cardBrand: payResult.cardBrand,
      authCode: payResult.authCode,
      errorMessage: payResult.errorMessage,
      installment,
      createdAt: now,
      updatedAt: now,
    };

    await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.posTransactions) draft.posTransactions = [];
      draft.posTransactions.unshift(newTx);
    });

    if (!payResult.success) {
      return res.status(400).json({
        success: false,
        message: payResult.errorMessage || 'POS işlemi reddedildi.',
        transaction: newTx,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'POS tahsilatı başarıyla onaylandı.',
      transaction: newTx,
      authCode: payResult.authCode,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'POS işlem hatası.' });
  }
});

/**
 * GET /api/v1/pos/transactions
 * POS işlem geçmişi
 */
router.get('/transactions', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const txs = (db.posTransactions || []).filter(
    t => t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: txs.length, transactions: txs });
});

export default router;
