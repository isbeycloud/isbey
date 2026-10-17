import { Router } from 'express';
import { storage } from '../db/storage';
import { BankTransaction, CurrentTransaction } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';
// 2026-10-17: Sahiplik kararı TEK KAYNAKTAN (kimlik dizesi kanıt değildir).
import {
  bankAccountIdOf,
  filterOwned,
  isOwnedBy,
  isOwnedByParent,
  ownedFields,
} from '../security/tenantOwnership';

export const banksRouter = Router();

banksRouter.use(requireAuth);
banksRouter.use(resolveTenant);

// List all bank accounts (Tenant Isolated + KAPSAM filtresi)
banksRouter.get('/', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const bankAccounts = filterOwned(db.bankAccounts, tenantId);
  // 2026-10-12: Kullanıcı kapsamı DOLU ise yalnız listedeki hesaplar döner.
  const scope = (db.userScopes || []).find(
    s => s.userId === String((req as any).user?.id || '') && s.tenantId === tenantId
  );
  const visible = (scope && scope.bankAccountIds.length > 0)
    ? bankAccounts.filter(b => scope.bankAccountIds.includes(b.id))
    : bankAccounts;
  // 2026-10-17: Eski kod `visible` boşken `db.bankAccounts`'a (TÜM firmalar)
  // düşüyordu. Düşüş KALDIRILDI: kapsam dışıysa boş liste döner.
  res.json({ success: true, bankAccounts: visible });
});

// List bank transactions (Tenant Isolated)
banksRouter.get('/transactions', (req, res) => {
  const { bankAccountId, startDate, endDate, type } = req.query;
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';

  // Sahiplik: açık alan, yoksa bağlı olduğu HESAP üzerinden (geçiş kayıtları).
  let list = (db.bankTransactions || []).filter(t =>
    isOwnedByParent(t, tenantId, db.bankAccounts, bankAccountIdOf)
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
    const tenantId = req.tenantId || 'tnt-isbey';
    const result = await storage.runTransaction(draft => {
      const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
      // IDOR: yalnız KENDİ firmasının hesabı hedeflenebilir.
      if (!bank || !isOwnedBy(bank, tenantId)) throw new Error('Banka hesabı bulunamadı.');

      const isOut = type === 'HAVALE_EFT_OUT' || type === 'EXPENSE' || type === 'TRANSFER_TO_CASH';
      if (isOut && bank.balance < amt) {
        throw new Error(`Bankada yetersiz bakiye! Mevcut bakiye: ${bank.balance.toLocaleString('tr-TR')} ₺`);
      }

      const docNo = storage.getNextSequence('BANK_TX');
      const txDate = date || new Date().toISOString().split('T')[0];

      let customerTitle = '';
      if (customerId) {
        const cust = draft.customers.find(c => c.id === customerId && isOwnedBy(c, tenantId));
        if (cust) {
          customerTitle = cust.title;
          // Cari hareket oluştur
          const curTx: CurrentTransaction = {
            id: `ctx-${Date.now()}`,
            ...ownedFields(tenantId),
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

      // 2026-10-17: Kayıt AÇIK sahiplikle yazılır (önce tenantId atanmıyordu).
      const tx: BankTransaction = {
        id: `bx-${Date.now()}`,
        ...ownedFields(tenantId),
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
    const tenantId = req.tenantId || 'tnt-isbey';
    const result = await storage.runTransaction(draft => {
      const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
      const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
      // IDOR: HER İKİ uç da kendi firmasının olmalı.
      if (!bank || !cash || !isOwnedBy(bank, tenantId) || !isOwnedBy(cash, tenantId)) {
        throw new Error('Banka veya Kasa bulunamadı.');
      }

      if (bank.balance < amt) {
        throw new Error(`Bankada yetersiz bakiye! Mevcut: ${bank.balance.toLocaleString('tr-TR')} ₺`);
      }

      const docNo = storage.getNextSequence('BANK_TX');
      const txDate = date || new Date().toISOString().split('T')[0];

      // Banka Çıkışı
      draft.bankTransactions.push({
        id: `bx-${Date.now()}`,
        ...ownedFields(tenantId),
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
        ...ownedFields(tenantId),
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
