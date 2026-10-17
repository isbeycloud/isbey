import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { CashRegister } from '../../db/schema';
import { FinancialTransactionService } from '../../services/financialTransactionService';

export const v1CashRouter = Router();

v1CashRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/cash
 * Kasa hesapları listesi
 */
v1CashRouter.get('/', requirePermission(PERMISSIONS.CASH_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const cashRegisters = (db.cashRegisters || []).filter(
    k => (!k.tenantId || k.tenantId === tenantId) && k.active !== false
  );

  const totalBalance = cashRegisters.reduce((sum, k) => sum + (k.balance || 0), 0);

  res.json({ success: true, cashRegisters, totalBalance });
});

/**
 * POST /api/v1/cash
 * Yeni kasa oluşturma
 */
v1CashRouter.post('/', requirePermission(PERMISSIONS.CASH_CREATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  const { name, code, currency = 'TRY', openingBalance = 0, description } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Kasa adı zorunludur.' });

  const now = new Date().toISOString();

  // 2026-10-17: bkz. orders.ts — bayat referans tuzağı. Burada `getNextSequence`
  // YOKTU, bu yüzden kayıp henüz oluşmuyordu; ancak `addAuditLog` `update()`
  // tetiklediği için `db` push'tan sonra ölü kalıyordu (kırılgan tesadüf).
  // Kayıt + denetim izi tek güncellemede; varsayılan kasa kararı da draft üzerinden.
  let newCash!: CashRegister;
  storage.update(draft => {
    if (!draft.cashRegisters) draft.cashRegisters = [];
    const finalCode = code || `KASA-${String(draft.cashRegisters.length + 1).padStart(3, '0')}`;
    newCash = {
      id: `cash-${Date.now()}`,
      tenantId,
      name,
      code: finalCode,
      isDefault: draft.cashRegisters.filter(k => k.tenantId === tenantId).length === 0,
      openingBalance,
      balance: openingBalance,
      currency,
      description,
      status: 'ACTIVE',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    draft.cashRegisters.push(newCash);

    draft.auditLogs.unshift({
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      userId: user.id,
      username: user.fullName || user.username,
      companyId: tenantId,
      action: 'CASH_ACCOUNT_CREATED',
      module: 'CASH',
      documentNo: finalCode,
      ipAddress: req.ip || '127.0.0.1',
      details: `'${name}' (${finalCode}) kasası açıldı. Bakiye: ${openingBalance} ${currency}`,
      timestamp: now,
    } as any);
  });

  res.status(201).json({ success: true, cashRegister: newCash });
});

/**
 * GET /api/v1/cash/:id/transactions
 * Kasa hareketleri
 */
v1CashRouter.get('/:id/transactions', requirePermission(PERMISSIONS.CASH_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const cash = (db.cashRegisters || []).find(
    k => k.id === req.params.id && (!k.tenantId || k.tenantId === tenantId)
  );

  if (!cash) return res.status(404).json({ success: false, message: 'Kasa bulunamadı.' });

  const transactions = (db.cashTransactions || [])
    .filter(t => t.cashRegisterId === cash.id && (!t.tenantId || t.tenantId === tenantId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ success: true, cash, transactions });
});

/**
 * POST /api/v1/cash/transfer
 * Kasa -> Kasa veya Kasa -> Banka transferi
 */
v1CashRouter.post('/transfer', requirePermission(PERMISSIONS.CASH_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { type, fromCashId, toCashId, bankId, amount, date, description, referenceNo } = req.body;

  try {
    if (type === 'CASH_TO_CASH') {
      const result = await FinancialTransactionService.transferCashToCash({
        tenantId,
        fromCashId,
        toCashId,
        amount,
        date,
        description,
        referenceNo,
        userId: user.id,
        username: user.fullName || user.username,
      });
      return res.json({ success: true, ...result });
    }

    if (type === 'CASH_TO_BANK') {
      const result = await FinancialTransactionService.transferCashAndBank({
        tenantId,
        cashId: fromCashId,
        bankId,
        amount,
        direction: 'CASH_TO_BANK',
        date,
        description,
        referenceNo,
        userId: user.id,
        username: user.fullName || user.username,
      });
      return res.json({ success: true, ...result });
    }

    res.status(400).json({ success: false, message: 'Geçersiz transfer tipi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
