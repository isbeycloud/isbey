import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { Expense, ExpenseCategory } from '../db/schema';

const router = Router();

// GET /api/expenses
router.get('/', (req: Request, res: Response) => {
  try {
    const { categoryId, startDate, endDate } = req.query;
    const db = storage.getState();
    let expenses = db.expenses || [];

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
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/expenses/categories
router.get('/categories', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    res.json({ success: true, categories: db.expenseCategories || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/expenses/categories
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const { name, code, description, color = '#6366f1' } = req.body;
    if (!name?.trim()) throw new Error('Kategori adı zorunludur.');

    const result = await storage.runTransaction(async draft => {
      const newCat: ExpenseCategory = {
        id: `expcat-${Date.now()}`,
        name: name.trim(),
        code: code?.trim() || `EXP-${Date.now().toString().slice(-4)}`,
        description,
        color,
      };
      if (!draft.expenseCategories) draft.expenseCategories = [];
      draft.expenseCategories.push(newCat);
      return newCat;
    });

    res.json({ success: true, message: 'Masraf kategorisi eklendi.', category: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/expenses
router.post('/', async (req: Request, res: Response) => {
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
    if (!expenseCategoryId || !title?.trim() || numAmt <= 0) {
      throw new Error('Kategori, Masraf Başlığı ve geçerli bir tutar girilmelidir.');
    }

    const result = await storage.runTransaction(async draft => {
      const category = draft.expenseCategories?.find(c => c.id === expenseCategoryId);
      if (!category) throw new Error('Masraf kategorisi bulunamadı.');

      const vatAmt = numAmt * (Number(vatRate) / 100);
      const totalAmt = numAmt + vatAmt;
      const documentNo = storage.getNextSequence('EXPENSE');

      let cashName = '';
      let bankName = '';

      // Deduct from Cash
      if (paymentMethod === 'CASH') {
        const cash = draft.cashRegisters.find(c => c.id === (cashRegisterId || draft.cashRegisters[0]?.id));
        if (!cash) throw new Error('Kasa bulunamadı.');
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
          userId: 'usr-1',
          createdAt: new Date().toISOString(),
        });
      }

      // Deduct from Bank
      if (paymentMethod === 'BANK') {
        const bank = draft.bankAccounts.find(b => b.id === (bankAccountId || draft.bankAccounts[0]?.id));
        if (!bank) throw new Error('Banka hesabı bulunamadı.');
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
          userId: 'usr-1',
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
        cashRegisterId: paymentMethod === 'CASH' ? (cashRegisterId || draft.cashRegisters[0]?.id) : undefined,
        cashRegisterName: cashName || undefined,
        bankAccountId: paymentMethod === 'BANK' ? (bankAccountId || draft.bankAccounts[0]?.id) : undefined,
        bankAccountName: bankName || undefined,
        supplierId,
        receiptNo,
        notes,
        userId: 'usr-1',
        createdAt: new Date().toISOString(),
      };

      if (!draft.expenses) draft.expenses = [];
      draft.expenses.unshift(newExpense);

      storage.addAuditLog({
        userId: 'usr-1',
        username: 'Yönetici Kullanıcı',
        action: 'CREATE',
        module: 'GİDER',
        documentNo,
        ipAddress: '127.0.0.1',
        details: `${documentNo} no'lu masraf kaydı (${title} - ${totalAmt.toLocaleString('tr-TR')} TL) işlendi.`,
      });

      return newExpense;
    });

    res.json({ success: true, message: 'Masraf kaydı başarıyla kaydedildi.', expense: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const expenseId = req.params.id;

    await storage.runTransaction(async draft => {
      const idx = (draft.expenses || []).findIndex(e => e.id === expenseId);
      if (idx === -1) throw new Error('Masraf kaydı bulunamadı.');

      const exp = draft.expenses[idx];

      // Revert Cash
      if (exp.paymentMethod === 'CASH' && exp.cashRegisterId) {
        const cash = draft.cashRegisters.find(c => c.id === exp.cashRegisterId);
        if (cash) cash.balance += exp.totalAmount;
        draft.cashTransactions = draft.cashTransactions.filter(t => t.documentNo !== exp.documentNo);
      }

      // Revert Bank
      if (exp.paymentMethod === 'BANK' && exp.bankAccountId) {
        const bank = draft.bankAccounts.find(b => b.id === exp.bankAccountId);
        if (bank) bank.balance += exp.totalAmount;
        draft.bankTransactions = draft.bankTransactions.filter(t => t.documentNo !== exp.documentNo);
      }

      draft.expenses.splice(idx, 1);

      storage.addAuditLog({
        userId: 'usr-1',
        username: 'Yönetici Kullanıcı',
        action: 'DELETE',
        module: 'GİDER',
        documentNo: exp.documentNo,
        ipAddress: '127.0.0.1',
        details: `${exp.documentNo} no'lu masraf kaydı silindi, kasa/banka bakiyesi iade edildi.`,
      });
    });

    res.json({ success: true, message: 'Masraf kaydı silindi ve bakiye geri yüklendi.' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
