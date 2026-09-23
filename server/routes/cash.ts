import { Router } from 'express';
import { storage } from '../db/storage';
import { CashTransaction, CurrentTransaction } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';

export const cashRouter = Router();

cashRouter.use(requireAuth);
cashRouter.use(resolveTenant);

// List all cash registers with balances (Tenant Isolated)
cashRouter.get('/', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const cashRegisters = (db.cashRegisters || []).filter(c => 
    c.id.includes(tenantId) || tenantId === 'tnt-isbey' || c.isDefault
  );
  res.json({ success: true, cashRegisters: cashRegisters.length > 0 ? cashRegisters : db.cashRegisters });
});

// List cash transactions with filters (Tenant Isolated)
cashRouter.get('/transactions', (req, res) => {
  const { cashRegisterId, startDate, endDate, type } = req.query;
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  
  let list = (db.cashTransactions || []).filter(t => 
    t.cashRegisterId.includes(tenantId) || tenantId === 'tnt-isbey' || !t.cashRegisterId.startsWith('cash-tnt-')
  );

  if (cashRegisterId && cashRegisterId !== 'ALL') {
    list = list.filter(t => t.cashRegisterId === cashRegisterId);
  }

  if (type && type !== 'ALL') {
    list = list.filter(t => t.type === type);
  }

  if (startDate) {
    list = list.filter(t => t.date >= String(startDate));
  }

  if (endDate) {
    list = list.filter(t => t.date <= String(endDate));
  }

  list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json({ success: true, transactions: list });
});

// Cash In / Out / Collection / Payment
cashRouter.post('/transaction', async (req, res) => {
  const { cashRegisterId, type, amount, date, customerId, category, description } = req.body;
  const amt = Number(amount);

  if (!cashRegisterId || amt <= 0) {
    return res.status(400).json({ success: false, message: 'Kasa ve pozitif bir tutar zorunludur.' });
  }

  try {
    const result = await storage.runTransaction(draft => {
      const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
      if (!cash) throw new Error('Kasa bulunamadı.');

      const isOut = type === 'PAYMENT' || type === 'EXPENSE' || type === 'TRANSFER_TO_BANK';
      if (isOut && cash.balance < amt) {
        throw new Error(`Kasa yetersiz bakiyeye sahip! Mevcut bakiye: ${cash.balance.toLocaleString('tr-TR')} ₺`);
      }

      const docNo = storage.getNextSequence('CASH_TX');
      const txDate = date || new Date().toISOString().split('T')[0];

      let customerTitle = '';
      if (customerId) {
        const cust = draft.customers.find(c => c.id === customerId);
        if (cust) {
          customerTitle = cust.title;
          // Cari hareket oluştur
          const curTx: CurrentTransaction = {
            id: `ctx-${Date.now()}`,
            customerId: cust.id,
            customerCode: cust.code,
            customerTitle: cust.title,
            documentNo: docNo,
            documentType: type === 'COLLECTION' ? 'COLLECTION' : 'PAYMENT',
            date: txDate,
            debit: type === 'PAYMENT' ? amt : 0, // Tedarikçiye ödedik -> borcumuz azaldı
            credit: type === 'COLLECTION' ? amt : 0, // Müşteriden aldık -> müşterinin borcu azaldı
            balance: 0,
            description: `${cash.name} üzerinden ${type === 'COLLECTION' ? 'Nakit Tahsilat' : 'Nakit Ödeme'}: ${description || ''}`,
            paymentMethod: 'CASH',
            userId: 'admin',
            createdAt: new Date().toISOString(),
          };
          draft.currentTransactions.push(curTx);
        }
      }

      const tx: CashTransaction = {
        id: `cx-${Date.now()}`,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        documentNo: docNo,
        type,
        direction: isOut ? 'OUT' : 'IN',
        amount: amt,
        date: txDate,
        customerId: customerId || undefined,
        customerTitle: customerTitle || undefined,
        category: category || (type === 'COLLECTION' ? 'Tahsilat' : type === 'PAYMENT' ? 'Ödeme' : 'Kasa Hareketi'),
        description: description || `${type === 'COLLECTION' ? 'Kasa Tahsilatı' : 'Kasa Çıkışı'}`,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };

      draft.cashTransactions.push(tx);
      cash.balance += isOut ? -amt : amt;

      return { tx, docNo, cashName: cash.name };
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'CASH',
      documentNo: result.docNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${result.cashName} kasasından ${result.tx.direction === 'IN' ? 'Giriş' : 'Çıkış'}: ${amt.toLocaleString('tr-TR')} ₺ (${result.tx.description})`,
    });

    res.json({ success: true, transaction: result.tx, message: 'Kasa işlemi başarıyla kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Transfer Cash to Bank (Kasadan Bankaya Virman)
cashRouter.post('/transfer-to-bank', async (req, res) => {
  const { cashRegisterId, bankAccountId, amount, date, description } = req.body;
  const amt = Number(amount);

  if (!cashRegisterId || !bankAccountId || amt <= 0) {
    return res.status(400).json({ success: false, message: 'Kasa, Banka ve geçerli tutar zorunludur.' });
  }

  try {
    const result = await storage.runTransaction(draft => {
      const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
      const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
      if (!cash || !bank) throw new Error('Kasa veya Banka hesabı bulunamadı.');

      if (cash.balance < amt) {
        throw new Error(`Kasada yetersiz bakiye! Mevcut: ${cash.balance.toLocaleString('tr-TR')} ₺`);
      }

      const docNo = storage.getNextSequence('CASH_TX');
      const txDate = date || new Date().toISOString().split('T')[0];

      // Kasa Çıkışı
      draft.cashTransactions.push({
        id: `cx-${Date.now()}`,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        documentNo: docNo,
        type: 'TRANSFER_TO_BANK',
        direction: 'OUT',
        amount: amt,
        date: txDate,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName,
        category: 'Bankaya Transfer (Virman)',
        description: description || `Kasadan ${bank.bankName} (${bank.accountName}) hesabına virman`,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      });
      cash.balance -= amt;

      // Banka Girişi
      draft.bankTransactions.push({
        id: `bx-${Date.now()}`,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName,
        documentNo: docNo,
        type: 'TRANSFER_FROM_CASH',
        direction: 'IN',
        amount: amt,
        date: txDate,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        description: description || `${cash.name} kasasından hesaba yatırılan`,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      });
      bank.balance += amt;

      return { docNo, cashName: cash.name, bankName: bank.bankName };
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'CASH',
      documentNo: result.docNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${result.cashName} kasasından ${result.bankName} bankasına ${amt.toLocaleString('tr-TR')} ₺ virman yapıldı.`,
    });

    res.json({ success: true, message: 'Kasadan bankaya transfer başarıyla tamamlandı.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
