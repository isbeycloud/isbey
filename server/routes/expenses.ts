import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { Expense, ExpenseCategory } from '../db/schema';
import { requireAuth, resolveTenant, requirePermission, PERMISSIONS } from '../middleware/authGuards';
import { cashRegisterIdOf, bankAccountIdOf, isOwnedBy, isOwnedByParent, ownedFields } from '../security/tenantOwnership';

const router = Router();
router.use(requireAuth, resolveTenant);
router.use((req, res, next) => {
  const scope = (storage.getState().userScopes || []).find(s => s.userId === req.user.id && s.tenantId === req.tenantId);
  if (scope?.menus?.masraflar === false) return res.status(403).json({ success: false, message: 'Masraflar ekranına erişim yetkiniz kapalı.' });
  next();
});

class ExpenseError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const missing = () => new ExpenseError('Masraf kaydı veya ödeme hesabı bulunamadı.', 404);
// Untagged entries are the existing shared reference catalog. Custom entries
// with explicit ownership must remain private to their company.
const visibleCategory = (category: ExpenseCategory, tenantId: string) => {
  const owned = category as ExpenseCategory & { tenantId?: string; companyId?: string };
  return !(owned.tenantId || owned.companyId) || isOwnedBy(owned, tenantId);
};
const live = (record: object) => {
  const fields = record as { deletedAt?: string; isDeleted?: boolean };
  return !fields.deletedAt && !fields.isDeleted;
};
function visibleAccounts(db: ReturnType<typeof storage.getState>, req: Request) {
  const scope = (db.userScopes || []).find(s => s.userId === req.user.id && s.tenantId === req.tenantId);
  return {
    cash: db.cashRegisters.filter(a => isOwnedBy(a, req.tenantId!) && live(a) && (!scope?.cashRegisterIds?.length || scope.cashRegisterIds.includes(a.id))),
    banks: db.bankAccounts.filter(a => isOwnedBy(a, req.tenantId!) && live(a) && (!scope?.bankAccountIds?.length || scope.bankAccountIds.includes(a.id))),
  };
}
function visibleExpense(expense: Expense, db: ReturnType<typeof storage.getState>, req: Request) {
  if (!isOwnedBy(expense, req.tenantId!) || !live(expense)) return false;
  const accounts = visibleAccounts(db, req);
  return (!expense.cashRegisterId || accounts.cash.some(a => a.id === expense.cashRegisterId))
    && (!expense.bankAccountId || accounts.banks.some(a => a.id === expense.bankAccountId));
}
function fail(res: Response, error: unknown) {
  return res.status(error instanceof ExpenseError ? error.status : 500).json({ success: false, message: error instanceof ExpenseError ? error.message : 'Masraf işlemi tamamlanamadı. Lütfen tekrar deneyin.' });
}

// GET /api/expenses
router.get('/', requirePermission(PERMISSIONS.EXPENSES_VIEW), (req: Request, res: Response) => {
  try {
    const { categoryId, startDate, endDate } = req.query;
    const db = storage.getState();
    let expenses = (db.expenses || []).filter(e => visibleExpense(e, db, req));

    if (categoryId && categoryId !== 'ALL') {
      expenses = expenses.filter(e => e.expenseCategoryId === categoryId);
    }
    if (startDate) {
      expenses = expenses.filter(e => e.date >= String(startDate));
    }
    if (endDate) {
      expenses = expenses.filter(e => e.date <= String(endDate));
    }

    expenses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Summary calculations
    const totalAmount = expenses.reduce((sum, e) => sum + e.totalAmount, 0);
    const totalVat = expenses.reduce((sum, e) => sum + e.vatAmount, 0);
    const netAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    res.json({
      success: true,
      expenses,
      summary: {
        totalAmount,
        totalVat,
        netAmount,
        count: expenses.length,
      },
    });
  } catch (error: any) {
    fail(res, error);
  }
});

// GET /api/expenses/categories
router.get('/categories', requirePermission(PERMISSIONS.EXPENSES_VIEW), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    res.json({ success: true, categories: (db.expenseCategories || []).filter(category => visibleCategory(category, req.tenantId!)) });
  } catch (error: any) {
    fail(res, error);
  }
});

// POST /api/expenses/categories
router.post('/categories', requirePermission(PERMISSIONS.EXPENSES_CREATE), async (req: Request, res: Response) => {
  try {
    const { name, code, description, color = '#6366f1' } = req.body;
    if (typeof name !== 'string' || !name.trim()) throw new ExpenseError('Kategori adı zorunludur.');

    const result = await storage.runTransaction(async draft => {
      const newCat: ExpenseCategory = {
        id: `expcat-${Date.now()}`,
        name: name.trim(),
        code: code?.trim() || `EXP-${Date.now().toString().slice(-4)}`,
        description,
        color,
        ...ownedFields(req.tenantId!),
      };
      if (!draft.expenseCategories) draft.expenseCategories = [];
      draft.expenseCategories.push(newCat);
      return newCat;
    });

    res.json({ success: true, message: 'Masraf kategorisi eklendi.', category: result });
  } catch (error: any) {
    fail(res, error);
  }
});

// POST /api/expenses
router.post('/', requirePermission(PERMISSIONS.EXPENSES_CREATE), async (req: Request, res: Response) => {
  try {
    const {
      expenseCategoryId,
      title,
      amount,
      vatRate = 20,
      date = new Date().toISOString().split('T')[0],
      paymentMethod = 'CASH',
      cashRegisterId,
      bankAccountId,
      supplierId,
      receiptNo,
      notes,
    } = req.body;

    const numAmt = Number(amount);
    if (!expenseCategoryId || typeof title !== 'string' || !title.trim() || !['number', 'string'].includes(typeof amount) || !Number.isFinite(numAmt) || numAmt <= 0 || numAmt > Number.MAX_SAFE_INTEGER) {
      throw new ExpenseError('Kategori, Masraf Başlığı ve geçerli bir tutar girilmelidir.');
    }
    const numVat = Number(vatRate);
    if (!['CASH', 'BANK', 'OTHER'].includes(paymentMethod) || !['number', 'string'].includes(typeof vatRate) || !Number.isFinite(numVat) || numVat < 0 || numVat > 100) throw new ExpenseError('Geçerli ödeme yöntemi ve KDV oranı girilmelidir.');

    const result = await storage.runTransaction(async draft => {
      const category = draft.expenseCategories?.find(c => c.id === expenseCategoryId && visibleCategory(c, req.tenantId!));
      if (!category) throw missing();
      const accounts = visibleAccounts(draft, req);
      const cash = paymentMethod === 'CASH' ? accounts.cash.find(c => c.id === (cashRegisterId || accounts.cash[0]?.id)) : undefined;
      const bank = paymentMethod === 'BANK' ? accounts.banks.find(b => b.id === (bankAccountId || accounts.banks[0]?.id)) : undefined;
      if ((paymentMethod === 'CASH' && !cash) || (paymentMethod === 'BANK' && !bank)) throw missing();
      if (supplierId && !draft.customers.some(c => c.id === supplierId && isOwnedBy(c, req.tenantId!) && live(c))) throw missing();

      const vatAmt = numAmt * (numVat / 100);
      const totalAmt = numAmt + vatAmt;
      if (!Number.isFinite(totalAmt) || totalAmt > Number.MAX_SAFE_INTEGER || (cash && (!Number.isFinite(cash.balance) || !Number.isFinite(cash.balance - totalAmt))) || (bank && (!Number.isFinite(bank.balance) || !Number.isFinite(bank.balance - totalAmt)))) throw new ExpenseError('Tutar veya hesap bakiyesi geçersiz.');
      const documentNo = storage.getNextSequence('EXPENSE');

      let cashName = '';
      let bankName = '';

      // Deduct from Cash
      if (paymentMethod === 'CASH') {
        if (!cash) throw missing();
        cashName = cash.name;
        cash.balance -= totalAmt;

        draft.cashTransactions.push({
          id: `ctx-exp-${Date.now()}`,
          cashRegisterId: cash.id,
          cashRegisterName: cash.name,
          documentNo,
          type: 'EXPENSE',
          direction: 'OUT',
          amount: totalAmt,
          date,
          category: category.name,
          description: `Gider: ${title} (${documentNo})`,
          ...ownedFields(req.tenantId!),
          userId: req.user.id,
          createdAt: new Date().toISOString(),
        });
      }

      // Deduct from Bank
      if (paymentMethod === 'BANK') {
        if (!bank) throw missing();
        bankName = `${bank.bankName} - ${bank.accountName}`;
        bank.balance -= totalAmt;

        draft.bankTransactions.push({
          id: `btx-exp-${Date.now()}`,
          bankAccountId: bank.id,
          bankAccountName: bank.accountName,
          documentNo,
          type: 'EXPENSE',
          direction: 'OUT',
          amount: totalAmt,
          date,
          description: `Gider: ${title} (${documentNo})`,
          ...ownedFields(req.tenantId!),
          userId: req.user.id,
          createdAt: new Date().toISOString(),
        });
      }

      const newExpense: Expense = {
        id: `exp-${Date.now()}`,
        documentNo,
        expenseCategoryId,
        expenseCategoryName: category.name,
        title: title.trim(),
        amount: numAmt,
        vatRate: Number(vatRate),
        vatAmount: vatAmt,
        totalAmount: totalAmt,
        date,
        paymentMethod,
        cashRegisterId: cash?.id,
        cashRegisterName: cashName || undefined,
        bankAccountId: bank?.id,
        bankAccountName: bankName || undefined,
        supplierId,
        receiptNo,
        notes,
        ...ownedFields(req.tenantId!),
        userId: req.user.id,
        createdAt: new Date().toISOString(),
      };

      if (!draft.expenses) draft.expenses = [];
      draft.expenses.unshift(newExpense);

      storage.addAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'CREATE',
        module: 'GİDER',
        documentNo,
        ipAddress: req.ip || '',
        details: `${documentNo} no'lu masraf kaydı (${title} - ${totalAmt.toLocaleString('tr-TR')} TL) işlendi.`,
      });

      return newExpense;
    });

    res.json({ success: true, message: 'Masraf kaydı başarıyla kaydedildi.', expense: result });
  } catch (error: any) {
    fail(res, error);
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', requirePermission(PERMISSIONS.EXPENSES_DELETE), async (req: Request, res: Response) => {
  try {
    const expenseId = req.params.id;

    await storage.runTransaction(async draft => {
      const idx = (draft.expenses || []).findIndex(e => e.id === expenseId && visibleExpense(e, draft, req));
      if (idx === -1) throw missing();

      const exp = draft.expenses[idx];
      const accounts = visibleAccounts(draft, req);
      const cash = accounts.cash.find(c => c.id === exp.cashRegisterId);
      const bank = accounts.banks.find(b => b.id === exp.bankAccountId);
      if ((exp.paymentMethod === 'CASH' && (!cash || exp.bankAccountId)) || (exp.paymentMethod === 'BANK' && (!bank || exp.cashRegisterId)) || !['CASH', 'BANK', 'OTHER'].includes(exp.paymentMethod) || (exp.paymentMethod === 'OTHER' && (exp.cashRegisterId || exp.bankAccountId))) throw missing();
      if (!Number.isFinite(exp.totalAmount) || exp.totalAmount <= 0) throw new ExpenseError('Masraf tutarı doğrulanamadı.');
      const cashMatches = draft.cashTransactions.filter(t => t.cashRegisterId === cash?.id && t.documentNo === exp.documentNo && t.type === 'EXPENSE' && t.direction === 'OUT' && live(t) && isOwnedByParent(t, req.tenantId!, draft.cashRegisters, cashRegisterIdOf));
      const bankMatches = draft.bankTransactions.filter(t => t.bankAccountId === bank?.id && t.documentNo === exp.documentNo && t.type === 'EXPENSE' && t.direction === 'OUT' && live(t) && isOwnedByParent(t, req.tenantId!, draft.bankAccounts, bankAccountIdOf));
      if ((exp.paymentMethod === 'CASH' && (cashMatches.length !== 1 || cashMatches[0].amount !== exp.totalAmount)) || (exp.paymentMethod === 'BANK' && (bankMatches.length !== 1 || bankMatches[0].amount !== exp.totalAmount))) throw new ExpenseError('İlgili ödeme hareketi doğrulanamadı; kayıt silinmedi.');
      if ((cash && (!Number.isFinite(cash.balance) || !Number.isFinite(cash.balance + exp.totalAmount))) || (bank && (!Number.isFinite(bank.balance) || !Number.isFinite(bank.balance + exp.totalAmount)))) throw new ExpenseError('Hesap bakiyesi doğrulanamadı.');

      // Revert Cash
      if (exp.paymentMethod === 'CASH' && exp.cashRegisterId) {
        cash!.balance += exp.totalAmount;
        draft.cashTransactions = draft.cashTransactions.filter(t => t !== cashMatches[0]);
      }

      // Revert Bank
      if (exp.paymentMethod === 'BANK' && exp.bankAccountId) {
        bank!.balance += exp.totalAmount;
        draft.bankTransactions = draft.bankTransactions.filter(t => t !== bankMatches[0]);
      }

      draft.expenses.splice(idx, 1);

      storage.addAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'DELETE',
        module: 'GİDER',
        documentNo: exp.documentNo,
        ipAddress: req.ip || '',
        details: `${exp.documentNo} no'lu masraf kaydı silindi, kasa/banka bakiyesi iade edildi.`,
      });
    });

    res.json({ success: true, message: 'Masraf kaydı silindi ve bakiye geri yüklendi.' });
  } catch (error: any) {
    fail(res, error);
  }
});

export default router;
