import { Router } from 'express';
import { storage } from '../db/storage';
import { CheckNote, CheckStatus, CheckType, CurrentTransaction, BankTransaction } from '../db/schema';

export const checksRouter = Router();

// List checks & notes with filters
checksRouter.get('/', (req, res) => {
  const { type, status, search } = req.query;
  const db = storage.getState();
  let list = db.checksNotes;

  if (type && type !== 'ALL') {
    list = list.filter(c => c.type === type);
  }

  if (status && status !== 'ALL') {
    list = list.filter(c => c.status === status);
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(c =>
      c.documentNo.toLowerCase().includes(q) ||
      c.customerTitle.toLowerCase().includes(q) ||
      c.drawer.toLowerCase().includes(q) ||
      c.bankName?.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime());
  res.json({ success: true, checksNotes: list });
});

// Create Check or Promissory Note
checksRouter.post('/', async (req, res) => {
  const { type, bankName, branchName, accountNo, checkNumber, drawer, amount, issueDate, maturityDate, customerId, description } = req.body;
  const amt = Number(amount);

  if (!customerId || !drawer || amt <= 0 || !maturityDate) {
    return res.status(400).json({ success: false, message: 'Cari, Keşideci, Vade Tarihi ve Tutar zorunludur.' });
  }

  try {
    const checkItem = await storage.runTransaction(draft => {
      const cust = draft.customers.find(c => c.id === customerId);
      if (!cust) throw new Error('Cari kart bulunamadı.');

      const docNo = storage.nextSequenceInTransaction(draft, 'CHECK');
      const isIncoming = (type as CheckType).startsWith('INCOMING');

      const check: CheckNote = {
        id: `chk-${Date.now()}`,
        type: type as CheckType,
        documentNo: docNo,
        bankName: bankName || '',
        branchName: branchName || '',
        accountNo: accountNo || '',
        checkNumber: checkNumber || '',
        drawer,
        amount: amt,
        issueDate: issueDate || new Date().toISOString().split('T')[0],
        maturityDate,
        customerId: cust.id,
        customerTitle: cust.title,
        status: 'IN_PORTFOLIO',
        description: description || '',
        userId: 'usr-1',
        createdAt: new Date().toISOString(),
      };

      draft.checksNotes.push(check);

      // Cari hareket (Alınan Çek: Müşteri borcundan düşer credit+, Verilen Çek: Tedarikçi alacağından düşer debit+)
      const curTx: CurrentTransaction = {
        id: `ctx-${Date.now()}`,
        customerId: cust.id,
        customerCode: cust.code,
        customerTitle: cust.title,
        documentNo: docNo,
        documentType: isIncoming ? 'CHECK_IN' : 'CHECK_OUT',
        date: check.issueDate,
        maturityDate,
        debit: isIncoming ? 0 : amt,
        credit: isIncoming ? amt : 0,
        balance: 0,
        description: `${docNo} nolu ${isIncoming ? 'Alınan Çek/Senet Girişi' : 'Verilen Çek/Senet Çıkışı'}`,
        paymentMethod: 'CHECK',
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };
      draft.currentTransactions.push(curTx);

      return check;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'CHECKS',
      documentNo: checkItem.documentNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${checkItem.customerTitle} için ${checkItem.amount.toLocaleString('tr-TR')} ₺ tutarında ${checkItem.documentNo} kaydedildi.`,
    });

    res.json({ success: true, checkNote: checkItem, message: 'Evrak portföye kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update Status (Tahsil Et, Ciro Et, Ödendi, Karşılıksız)
checksRouter.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, cashRegisterId, bankAccountId, endorsedToCustomerId, description } = req.body;

  try {
    const result = await storage.runTransaction(draft => {
      const check = draft.checksNotes.find(c => c.id === id);
      if (!check) throw new Error('Çek/Senet kaydı bulunamadı.');

      check.status = status as CheckStatus;
      check.statusChangeDate = new Date().toISOString().split('T')[0];

      if (status === 'COLLECTED') {
        // Tahsil edilen çek: Kasa veya Bankaya giriş
        if (cashRegisterId) {
          const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
          if (!cash) throw new Error('Kasa bulunamadı.');
          check.collectedCashRegisterId = cash.id;
          draft.cashTransactions.push({
            id: `ctx-chk-${Date.now()}`,
            cashRegisterId: cash.id,
            cashRegisterName: cash.name,
            documentNo: check.documentNo,
            type: 'CHECK_COLLECTION',
            direction: 'IN',
            amount: check.amount,
            date: check.statusChangeDate,
            customerId: check.customerId,
            customerTitle: check.customerTitle,
            description: `${check.documentNo} çek/senet tahsilatı`,
            relatedDocumentId: check.id,
            userId: 'usr-1',
            createdAt: new Date().toISOString(),
          });
        } else if (bankAccountId) {
          const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
          if (!bank) throw new Error('Banka hesabı bulunamadı.');
          check.collectedBankAccountId = bank.id;
          draft.bankTransactions.push({
            id: `bx-chk-${Date.now()}`,
            bankAccountId: bank.id,
            bankAccountName: bank.accountName,
            documentNo: check.documentNo,
            type: 'CHECK_COLLECTION',
            direction: 'IN',
            amount: check.amount,
            date: check.statusChangeDate,
            customerId: check.customerId,
            customerTitle: check.customerTitle,
            description: `${check.documentNo} çek/senet tahsilatı`,
            relatedDocumentId: check.id,
            userId: 'usr-1',
            createdAt: new Date().toISOString(),
          });
        }
      } else if (status === 'PAID') {
        // Ödenen çek: Kasa veya Bankadan çıkış
        if (cashRegisterId) {
          const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
          if (cash) {
            draft.cashTransactions.push({
              id: `ctx-chk-out-${Date.now()}`,
              cashRegisterId: cash.id,
              cashRegisterName: cash.name,
              documentNo: check.documentNo,
              type: 'CHECK_PAYMENT',
              direction: 'OUT',
              amount: check.amount,
              date: check.statusChangeDate,
              customerId: check.customerId,
              customerTitle: check.customerTitle,
              description: `${check.documentNo} çek/senet ödemesi`,
              relatedDocumentId: check.id,
              userId: 'usr-1',
              createdAt: new Date().toISOString(),
            });
          }
        } else if (bankAccountId) {
          const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
          if (bank) {
            draft.bankTransactions.push({
              id: `bx-chk-out-${Date.now()}`,
              bankAccountId: bank.id,
              bankAccountName: bank.accountName,
              documentNo: check.documentNo,
              type: 'CHECK_COLLECTION',
              direction: 'OUT',
              amount: check.amount,
              date: check.statusChangeDate,
              customerId: check.customerId,
              customerTitle: check.customerTitle,
              description: `${check.documentNo} çek/senet ödemesi`,
              relatedDocumentId: check.id,
              userId: 'usr-1',
              createdAt: new Date().toISOString(),
            });
          }
        }
      } else if (status === 'ENDORSED' && endorsedToCustomerId) {
        const endCust = draft.customers.find(c => c.id === endorsedToCustomerId);
        if (endCust) {
          check.endorsedToCustomerId = endCust.id;
          check.endorsedToCustomerTitle = endCust.title;
          // Cari hareket oluştur: Tedarikçiye çek ciro edildi
          draft.currentTransactions.push({
            id: `ctx-${Date.now()}`,
            customerId: endCust.id,
            customerCode: endCust.code,
            customerTitle: endCust.title,
            documentNo: check.documentNo,
            documentType: 'PAYMENT',
            date: check.statusChangeDate,
            maturityDate: check.maturityDate,
            debit: check.amount,
            credit: 0,
            balance: 0,
            description: `${check.documentNo} nolu çek ciro edildi (${check.customerTitle} -> ${endCust.title})`,
            paymentMethod: 'CHECK_ENDORSED',
            userId: 'admin',
            createdAt: new Date().toISOString(),
          });
        }
      }

      return check;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'UPDATE',
      module: 'CHECKS',
      documentNo: result.documentNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${result.documentNo} nolu evrak durumu güncellendi: ${status}`,
    });

    res.json({ success: true, checkNote: result, message: 'Çek/Senet durumu güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
