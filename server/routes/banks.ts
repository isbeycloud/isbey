import { Router } from 'express';
import { storage } from '../db/storage';
import { BankTransaction, CurrentTransaction } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';

export const banksRouter = Router();

banksRouter.use(requireAuth);
banksRouter.use(resolveTenant);

// List all bank accounts (Tenant Isolated)
banksRouter.get('/', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const bankAccounts = (db.bankAccounts || []).filter(b => 
    b.id.includes(tenantId) || tenantId === 'tnt-isbey' || b.isDefault
  );
  res.json({ success: true, bankAccounts: bankAccounts.length > 0 ? bankAccounts : db.bankAccounts });
});

// List bank transactions (Tenant Isolated)
banksRouter.get('/transactions', (req, res) => {
  const { bankAccountId, startDate, endDate, type } = req.query;
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';

  let list = (db.bankTransactions || []).filter(t => 
    t.bankAccountId.includes(tenantId) || tenantId === 'tnt-isbey' || !t.bankAccountId.startsWith('bnk-tnt-')
  );

  if (bankAccountId && bankAccountId !== 'ALL') {
    list = list.filter(t => t.bankAccountId === bankAccountId);
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

// Create Bank Transaction (Havale / EFT / POS)
banksRouter.post('/transaction', async (req, res) => {
  const { bankAccountId, type, amount, date, customerId, description } = req.body;
  const amt = Number(amount);

  if (!bankAccountId || amt <= 0) {
    return res.status(400).json({ success: false, message: 'Banka hesabı ve geçerli bir tutar zorunludur.' });
  }

  try {
    const result = await storage.runTransaction(draft => {
      const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
      if (!bank) throw new Error('Banka hesabı bulunamadı.');

      const isOut = type === 'HAVALE_EFT_OUT' || type === 'EXPENSE' || type === 'TRANSFER_TO_CASH';
      if (isOut && bank.balance < amt) {
        throw new Error(`Bankada yetersiz bakiye! Mevcut bakiye: ${bank.balance.toLocaleString('tr-TR')} ₺`);
      }

      const docNo = storage.getNextSequence('BANK_TX');
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
            documentType: isOut ? 'PAYMENT' : 'COLLECTION',
            date: txDate,
            debit: isOut ? amt : 0,
            credit: isOut ? 0 : amt,
            balance: 0,
            description: `${bank.bankName} (${bank.accountName}) üzerinden Banka ${isOut ? 'Ödemesi' : 'Tahsilatı'}: ${description || ''}`,
            paymentMethod: 'BANK_TRANSFER',
            userId: 'admin',
            createdAt: new Date().toISOString(),
          };
          draft.currentTransactions.push(curTx);
        }
      }

      const tx: BankTransaction = {
        id: `bx-${Date.now()}`,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName,
        documentNo: docNo,
        type,
        direction: isOut ? 'OUT' : 'IN',
        amount: amt,
        date: txDate,
        customerId: customerId || undefined,
        customerTitle: customerTitle || undefined,
        description: description || `${isOut ? 'Banka Çıkışı' : 'Banka Girişi'}`,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };

      draft.bankTransactions.push(tx);
      bank.balance += isOut ? -amt : amt;

      return { tx, docNo, bankName: bank.bankName };
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'BANK',
      documentNo: result.docNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${result.bankName} hesabından ${result.tx.direction === 'IN' ? 'Giriş' : 'Çıkış'}: ${amt.toLocaleString('tr-TR')} ₺ (${result.tx.description})`,
    });

    res.json({ success: true, transaction: result.tx, message: 'Banka işlemi başarıyla kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Transfer from Bank to Cash (Bankadan Kasaya Virman / Para Çekme)
banksRouter.post('/transfer-to-cash', async (req, res) => {
  const { bankAccountId, cashRegisterId, amount, date, description } = req.body;
  const amt = Number(amount);

  if (!bankAccountId || !cashRegisterId || amt <= 0) {
    return res.status(400).json({ success: false, message: 'Banka hesabı, Kasa ve geçerli tutar zorunludur.' });
  }

  try {
    const result = await storage.runTransaction(draft => {
      const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
      const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
      if (!bank || !cash) throw new Error('Banka veya Kasa bulunamadı.');

      if (bank.balance < amt) {
        throw new Error(`Bankada yetersiz bakiye! Mevcut: ${bank.balance.toLocaleString('tr-TR')} ₺`);
      }

      const docNo = storage.getNextSequence('BANK_TX');
      const txDate = date || new Date().toISOString().split('T')[0];

      // Banka Çıkışı
      draft.bankTransactions.push({
        id: `bx-${Date.now()}`,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName,
        documentNo: docNo,
        type: 'TRANSFER_TO_CASH',
        direction: 'OUT',
        amount: amt,
        date: txDate,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        description: description || `${bank.bankName} hesabından kasaya çekilen tutar`,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      });
      bank.balance -= amt;

      // Kasa Girişi
      draft.cashTransactions.push({
        id: `cx-${Date.now()}`,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        documentNo: docNo,
        type: 'TRANSFER_FROM_BANK',
        direction: 'IN',
        amount: amt,
        date: txDate,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName,
        category: 'Bankadan Nakit Çekim',
        description: description || `${bank.bankName} (${bank.accountName}) hesabından nakit giriş`,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      });
      cash.balance += amt;

      return { docNo, bankName: bank.bankName, cashName: cash.name };
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'BANK',
      documentNo: result.docNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${result.bankName} bankasından ${result.cashName} kasasına ${amt.toLocaleString('tr-TR')} ₺ virman yapıldı.`,
    });

    res.json({ success: true, message: 'Bankadan kasaya transfer başarıyla tamamlandı.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
