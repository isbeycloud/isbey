import { Router } from 'express';
import { storage } from '../db/storage';
import { CashTransaction, CurrentTransaction } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';
// 2026-10-17: Sahiplik kararı TEK KAYNAKTAN (kimlik dizesi kanıt değildir).
import {
  cashRegisterIdOf,
  filterOwned,
  isOwnedBy,
  isOwnedByParent,
  ownedFields,
} from '../security/tenantOwnership';

export const cashRouter = Router();

cashRouter.use(requireAuth);
cashRouter.use(resolveTenant);

// List all cash registers with balances (Tenant Isolated + KAPSAM filtresi)
cashRouter.get('/', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const cashRegisters = filterOwned(db.cashRegisters, tenantId);
  // 2026-10-12: Kullanıcı kapsamı DOLU ise yalnız listedeki kasalar döner.
  // Kapsam YOKSA/BOŞSA mevcut davranış korunur (tamamı görünür).
  const scope = (db.userScopes || []).find(
    s => s.userId === String((req as any).user?.id || '') && s.tenantId === tenantId
  );
  const visible = (scope && scope.cashRegisterIds.length > 0)
    ? cashRegisters.filter(c => scope.cashRegisterIds.includes(c.id))
    : cashRegisters;
  // 2026-10-17: Eski kod `visible` boşken `db.cashRegisters`'a (TÜM firmalar)
  // düşüyordu — kapsam dışı kalan kullanıcı başka firmaların kasalarını
  // görüyordu. Düşüş KALDIRILDI: kapsam dışıysa boş liste döner.
  res.json({ success: true, cashRegisters: visible });
});

// List cash transactions with filters (Tenant Isolated)
cashRouter.get('/transactions', (req, res) => {
  const { cashRegisterId, startDate, endDate, type } = req.query;
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';

  // Sahiplik: açık alan, yoksa bağlı olduğu KASA üzerinden (geçiş kayıtları).
  let list = (db.cashTransactions || []).filter(t =>
    isOwnedByParent(t, tenantId, db.cashRegisters, cashRegisterIdOf)
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
    const tenantId = req.tenantId || 'tnt-isbey';
    const result = await storage.runTransaction(draft => {
      const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
      // IDOR: yalnız KENDİ firmasının kasası hedeflenebilir. Başka firmanın
      // kasası için de aynı "bulunamadı" hatası döner (varlık sızdırılmaz).
      if (!cash || !isOwnedBy(cash, tenantId)) throw new Error('Kasa bulunamadı.');

      const isOut = type === 'PAYMENT' || type === 'EXPENSE' || type === 'TRANSFER_TO_BANK';
      if (isOut && cash.balance < amt) {
        throw new Error(`Kasa yetersiz bakiyeye sahip! Mevcut bakiye: ${cash.balance.toLocaleString('tr-TR')} ₺`);
      }

      const docNo = storage.getNextSequence('CASH_TX');
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

      // 2026-10-17: Kayıt AÇIK sahiplikle yazılır. Önceden `tenantId` hiç
      // atanmıyordu; bu alan boş kalan kayıt "eski veri" sayılıp varsayılan
      // firmada birikiyordu (sızıntının ikinci yarısı).
      const tx: CashTransaction = {
        id: `cx-${Date.now()}`,
        ...ownedFields(tenantId),
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
    const tenantId = req.tenantId || 'tnt-isbey';
    const result = await storage.runTransaction(draft => {
      const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
      const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
      // IDOR: HER İKİ uç da kendi firmasının olmalı; aksi halde yabancı
      // hesaba/kasadan para aktarılabilirdi.
      if (!cash || !bank || !isOwnedBy(cash, tenantId) || !isOwnedBy(bank, tenantId)) {
        throw new Error('Kasa veya Banka hesabı bulunamadı.');
      }

      if (cash.balance < amt) {
        throw new Error(`Kasada yetersiz bakiye! Mevcut: ${cash.balance.toLocaleString('tr-TR')} ₺`);
      }

      const docNo = storage.getNextSequence('CASH_TX');
      const txDate = date || new Date().toISOString().split('T')[0];

      // Kasa Çıkışı
      draft.cashTransactions.push({
        id: `cx-${Date.now()}`,
        ...ownedFields(tenantId),
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
        ...ownedFields(tenantId),
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
