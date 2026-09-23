import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { BankAccount } from '../../db/schema';
import { FinancialTransactionService } from '../../services/financialTransactionService';

export const v1BanksRouter = Router();

v1BanksRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/banks
 * Banka hesapları listesi
 */
v1BanksRouter.get('/', requirePermission(PERMISSIONS.BANK_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const bankAccounts = (db.bankAccounts || []).filter(
    b => (!b.tenantId || b.tenantId === tenantId) && b.active !== false
  );

  const totalBalance = bankAccounts.reduce((sum, b) => sum + (b.balance || 0), 0);

  res.json({ success: true, bankAccounts, totalBalance });
});

/**
 * POST /api/v1/banks
 * Yeni banka hesabı oluşturma
 */
v1BanksRouter.post('/', requirePermission(PERMISSIONS.BANK_CREATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();

  const { bankName, accountName, accountNo, branchName, iban, currency = 'TRY', openingBalance = 0 } = req.body;
  if (!bankName) return res.status(400).json({ success: false, message: 'Banka adı zorunludur.' });

  const now = new Date().toISOString();
  const newBank: BankAccount = {
    id: `bank-${Date.now()}`,
    tenantId,
    bankName,
    accountName: accountName || bankName,
    accountNo: accountNo || '',
    branchName: branchName || '',
    iban: iban || '',
    currency,
    openingBalance,
    balance: openingBalance,
    isDefault: (db.bankAccounts || []).filter(b => b.tenantId === tenantId).length === 0,
    status: 'ACTIVE',
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  if (!db.bankAccounts) db.bankAccounts = [];
  db.bankAccounts.push(newBank);

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'BANK_ACCOUNT_CREATED',
    module: 'BANK',
    documentNo: iban || bankName,
    ipAddress: req.ip || '127.0.0.1',
    details: `'${bankName}' hesabı (${currency}) açıldı. Bakiye: ${openingBalance}`,
  });

  storage.save();
  res.status(201).json({ success: true, bankAccount: newBank });
});

/**
 * GET /api/v1/banks/:id/transactions
 * Banka hareketleri
 */
v1BanksRouter.get('/:id/transactions', requirePermission(PERMISSIONS.BANK_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const bank = (db.bankAccounts || []).find(
    b => b.id === req.params.id && (!b.tenantId || b.tenantId === tenantId)
  );

  if (!bank) return res.status(404).json({ success: false, message: 'Banka hesabı bulunamadı.' });

  const transactions = (db.bankTransactions || [])
    .filter(t => t.bankAccountId === bank.id && (!t.tenantId || t.tenantId === tenantId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ success: true, bank, transactions });
});

/**
 * POST /api/v1/banks/transfer
 * Banka -> Banka veya Banka -> Kasa transferi
 */
v1BanksRouter.post('/transfer', requirePermission(PERMISSIONS.BANK_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { type, fromBankId, toBankId, cashId, amount, date, description, referenceNo } = req.body;

  try {
    if (type === 'BANK_TO_BANK') {
      const result = await FinancialTransactionService.transferBankToBank({
        tenantId,
        fromBankId,
        toBankId,
        amount,
        date,
        description,
        referenceNo,
        userId: user.id,
        username: user.fullName || user.username,
      });
      return res.json({ success: true, ...result });
    }

    if (type === 'BANK_TO_CASH') {
      const result = await FinancialTransactionService.transferCashAndBank({
        tenantId,
        cashId,
        bankId: fromBankId,
        amount,
        direction: 'BANK_TO_CASH',
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
