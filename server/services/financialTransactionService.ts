import { storage } from '../db/storage';
import {
  AccountTransaction,
  CashTransaction,
  BankTransaction,
  Customer,
  CashRegister,
  BankAccount,
} from '../db/schema';

export interface CreateCollectionParams {
  tenantId: string;
  customerId: string;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  targetType: 'CASH' | 'BANK';
  targetId: string;
  date: string;
  description?: string;
  documentNo?: string;
  referenceNo?: string;
  userId: string;
  username?: string;
}

export interface CreatePaymentParams {
  tenantId: string;
  customerId: string;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  sourceType: 'CASH' | 'BANK';
  sourceId: string;
  date: string;
  description?: string;
  documentNo?: string;
  referenceNo?: string;
  userId: string;
  username?: string;
}

export interface CashToCashTransferParams {
  tenantId: string;
  fromCashId: string;
  toCashId: string;
  amount: number;
  date: string;
  description?: string;
  referenceNo?: string;
  userId: string;
  username?: string;
}

export interface BankToBankTransferParams {
  tenantId: string;
  fromBankId: string;
  toBankId: string;
  amount: number;
  date: string;
  description?: string;
  referenceNo?: string;
  userId: string;
  username?: string;
}

export interface CashBankTransferParams {
  tenantId: string;
  cashId: string;
  bankId: string;
  amount: number;
  direction: 'CASH_TO_BANK' | 'BANK_TO_CASH';
  date: string;
  description?: string;
  referenceNo?: string;
  userId: string;
  username?: string;
}

export class FinancialTransactionService {
  /**
   * 1. CARİ TAHSİLAT (COLLECTION)
   * Cari Alacaklandırılır + Kasa/Banka Giriş (IN) Yapılır
   */
  static async createCollection(params: CreateCollectionParams): Promise<{
    accountTx: AccountTransaction;
    cashTx?: CashTransaction;
    bankTx?: BankTransaction;
  }> {
    const {
      tenantId,
      customerId,
      amount,
      currency = 'TRY',
      exchangeRate = 1.0,
      targetType,
      targetId,
      date,
      description = 'Cari Tahsilat',
      documentNo,
      referenceNo,
      userId,
      username = 'Sistem',
    } = params;

    if (amount <= 0) throw new Error('Tahsilat tutarı 0’dan büyük olmalıdır.');

    const db = storage.getState();
    const customer = (db.customers || []).find(
      c => c.id === customerId && (!c.tenantId || c.tenantId === tenantId)
    );
    if (!customer) throw new Error('Cari hesap bulunamadı veya bu firmaya ait değil.');

    const docNo = documentNo || `THS-${Date.now()}`;
    const txId = `actx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    let cashTx: CashTransaction | undefined;
    let bankTx: BankTransaction | undefined;

    if (targetType === 'CASH') {
      const cash = (db.cashRegisters || []).find(
        k => k.id === targetId && (!k.tenantId || k.tenantId === tenantId)
      );
      if (!cash) throw new Error('Hedef kasa bulunamadı.');

      const cashTxId = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      cashTx = {
        id: cashTxId,
        tenantId,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        documentNo: docNo,
        type: 'COLLECTION',
        direction: 'IN',
        amount,
        currency,
        exchangeRate,
        originalAmount: amount,
        date: date || now.slice(0, 10),
        customerId: customer.id,
        customerTitle: customer.title,
        description: description || `Tahsilat: ${customer.title}`,
        referenceNo,
        relatedAccountTxId: txId,
        userId,
        createdBy: username,
        createdAt: now,
      };

      // Kasa Bakiyesi Artır
      cash.balance = (cash.balance || 0) + amount;
      if (!db.cashTransactions) db.cashTransactions = [];
      db.cashTransactions.push(cashTx);
    } else {
      const bank = (db.bankAccounts || []).find(
        b => b.id === targetId && (!b.tenantId || b.tenantId === tenantId)
      );
      if (!bank) throw new Error('Hedef banka hesabı bulunamadı.');

      const bankTxId = `btx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      bankTx = {
        id: bankTxId,
        tenantId,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName || bank.bankName,
        documentNo: docNo,
        type: 'HAVALE_EFT_IN',
        direction: 'IN',
        amount,
        currency,
        exchangeRate,
        originalAmount: amount,
        date: date || now.slice(0, 10),
        customerId: customer.id,
        customerTitle: customer.title,
        description: description || `Tahsilat: ${customer.title}`,
        referenceNo,
        relatedAccountTxId: txId,
        userId,
        createdBy: username,
        createdAt: now,
      };

      // Banka Bakiyesi Artır
      bank.balance = (bank.balance || 0) + amount;
      if (!db.bankTransactions) db.bankTransactions = [];
      db.bankTransactions.push(bankTx);
    }

    // Cari Hareket Oluştur (Alacak / Credit)
    const accountTx: AccountTransaction = {
      id: txId,
      tenantId,
      customerId: customer.id,
      customerCode: customer.code,
      customerTitle: customer.title,
      transactionType: 'COLLECTION',
      documentType: 'COLLECTION',
      documentNo: docNo,
      date: date || now.slice(0, 10),
      description: description || `${targetType === 'CASH' ? 'Kasa' : 'Banka'} Tahsilatı`,
      debit: 0,
      credit: amount,
      currency,
      exchangeRate,
      originalAmount: amount,
      referenceNo,
      relatedCashTxId: cashTx?.id,
      relatedBankTxId: bankTx?.id,
      createdBy: username,
      createdAt: now,
    };

    if (!db.accountTransactions) db.accountTransactions = [];
    db.accountTransactions.push(accountTx);

    // Cari Bakiyesi Güncelle (Alacak artar, bakiye borç - alacak azalır)
    customer.totalCredit = (customer.totalCredit || 0) + amount;
    customer.balance = (customer.totalDebit || 0) - customer.totalCredit;
    customer.updatedAt = now;

    // Audit Log
    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'COLLECTION_CREATED',
      module: 'FINANCE',
      documentNo: docNo,
      ipAddress: '127.0.0.1',
      details: `${customer.title} carisinden ${amount} ${currency} tahsilat yapıldı (${targetType}).`,
    });

    storage.save();
    return { accountTx, cashTx, bankTx };
  }

  /**
   * 2. CARİ ÖDEME (PAYMENT)
   * Cari Borçlandırılır + Kasa/Banka Çıkış (OUT) Yapılır
   */
  static async createPayment(params: CreatePaymentParams): Promise<{
    accountTx: AccountTransaction;
    cashTx?: CashTransaction;
    bankTx?: BankTransaction;
  }> {
    const {
      tenantId,
      customerId,
      amount,
      currency = 'TRY',
      exchangeRate = 1.0,
      sourceType,
      sourceId,
      date,
      description = 'Cari Ödeme',
      documentNo,
      referenceNo,
      userId,
      username = 'Sistem',
    } = params;

    if (amount <= 0) throw new Error('Ödeme tutarı 0’dan büyük olmalıdır.');

    const db = storage.getState();
    const customer = (db.customers || []).find(
      c => c.id === customerId && (!c.tenantId || c.tenantId === tenantId)
    );
    if (!customer) throw new Error('Cari hesap bulunamadı veya bu firmaya ait değil.');

    const docNo = documentNo || `ODM-${Date.now()}`;
    const txId = `actx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    let cashTx: CashTransaction | undefined;
    let bankTx: BankTransaction | undefined;

    if (sourceType === 'CASH') {
      const cash = (db.cashRegisters || []).find(
        k => k.id === sourceId && (!k.tenantId || k.tenantId === tenantId)
      );
      if (!cash) throw new Error('Kaynak kasa bulunamadı.');

      const cashTxId = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      cashTx = {
        id: cashTxId,
        tenantId,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        documentNo: docNo,
        type: 'PAYMENT',
        direction: 'OUT',
        amount,
        currency,
        exchangeRate,
        originalAmount: amount,
        date: date || now.slice(0, 10),
        customerId: customer.id,
        customerTitle: customer.title,
        description: description || `Ödeme: ${customer.title}`,
        referenceNo,
        relatedAccountTxId: txId,
        userId,
        createdBy: username,
        createdAt: now,
      };

      // Kasa Bakiyesi Azalt
      cash.balance = (cash.balance || 0) - amount;
      if (!db.cashTransactions) db.cashTransactions = [];
      db.cashTransactions.push(cashTx);
    } else {
      const bank = (db.bankAccounts || []).find(
        b => b.id === sourceId && (!b.tenantId || b.tenantId === tenantId)
      );
      if (!bank) throw new Error('Kaynak banka hesabı bulunamadı.');

      const bankTxId = `btx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      bankTx = {
        id: bankTxId,
        tenantId,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName || bank.bankName,
        documentNo: docNo,
        type: 'HAVALE_EFT_OUT',
        direction: 'OUT',
        amount,
        currency,
        exchangeRate,
        originalAmount: amount,
        date: date || now.slice(0, 10),
        customerId: customer.id,
        customerTitle: customer.title,
        description: description || `Ödeme: ${customer.title}`,
        referenceNo,
        relatedAccountTxId: txId,
        userId,
        createdBy: username,
        createdAt: now,
      };

      // Banka Bakiyesi Azalt
      bank.balance = (bank.balance || 0) - amount;
      if (!db.bankTransactions) db.bankTransactions = [];
      db.bankTransactions.push(bankTx);
    }

    // Cari Hareket Oluştur (Borç / Debit)
    const accountTx: AccountTransaction = {
      id: txId,
      tenantId,
      customerId: customer.id,
      customerCode: customer.code,
      customerTitle: customer.title,
      transactionType: 'PAYMENT',
      documentType: 'PAYMENT',
      documentNo: docNo,
      date: date || now.slice(0, 10),
      description: description || `${sourceType === 'CASH' ? 'Kasa' : 'Banka'} Ödemesi`,
      debit: amount,
      credit: 0,
      currency,
      exchangeRate,
      originalAmount: amount,
      referenceNo,
      relatedCashTxId: cashTx?.id,
      relatedBankTxId: bankTx?.id,
      createdBy: username,
      createdAt: now,
    };

    if (!db.accountTransactions) db.accountTransactions = [];
    db.accountTransactions.push(accountTx);

    // Cari Bakiyesi Güncelle
    customer.totalDebit = (customer.totalDebit || 0) + amount;
    customer.balance = customer.totalDebit - (customer.totalCredit || 0);
    customer.updatedAt = now;

    // Audit Log
    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'PAYMENT_CREATED',
      module: 'FINANCE',
      documentNo: docNo,
      ipAddress: '127.0.0.1',
      details: `${customer.title} carisine ${amount} ${currency} ödeme yapıldı (${sourceType}).`,
    });

    storage.save();
    return { accountTx, cashTx, bankTx };
  }

  /**
   * 3. KASA → KASA VİRMAN (TRANSFER)
   */
  static async transferCashToCash(params: CashToCashTransferParams): Promise<{
    outTx: CashTransaction;
    inTx: CashTransaction;
  }> {
    const { tenantId, fromCashId, toCashId, amount, date, description, referenceNo, userId, username = 'Sistem' } = params;

    if (amount <= 0) throw new Error('Transfer tutarı 0’dan büyük olmalıdır.');
    if (fromCashId === toCashId) throw new Error('Kaynak ve hedef kasa aynı olamaz.');

    const db = storage.getState();
    const fromCash = (db.cashRegisters || []).find(k => k.id === fromCashId && (!k.tenantId || k.tenantId === tenantId));
    const toCash = (db.cashRegisters || []).find(k => k.id === toCashId && (!k.tenantId || k.tenantId === tenantId));

    if (!fromCash || !toCash) throw new Error('Kaynak veya hedef kasa bulunamadı.');

    const now = new Date().toISOString();
    const docNo = `VIRM-C2C-${Date.now()}`;

    const outTx: CashTransaction = {
      id: `ctx-out-${Date.now()}`,
      tenantId,
      cashRegisterId: fromCash.id,
      cashRegisterName: fromCash.name,
      targetCashRegisterId: toCash.id,
      targetCashRegisterName: toCash.name,
      documentNo: docNo,
      type: 'TRANSFER_OUT',
      direction: 'OUT',
      amount,
      date: date || now.slice(0, 10),
      description: description || `Kasalar Arası Virman: ${fromCash.name} ➔ ${toCash.name}`,
      referenceNo,
      userId,
      createdBy: username,
      createdAt: now,
    };

    const inTx: CashTransaction = {
      id: `ctx-in-${Date.now()}`,
      tenantId,
      cashRegisterId: toCash.id,
      cashRegisterName: toCash.name,
      targetCashRegisterId: fromCash.id,
      targetCashRegisterName: fromCash.name,
      documentNo: docNo,
      type: 'TRANSFER_IN',
      direction: 'IN',
      amount,
      date: date || now.slice(0, 10),
      description: description || `Kasalar Arası Virman: ${fromCash.name} ➔ ${toCash.name}`,
      referenceNo,
      userId,
      createdBy: username,
      createdAt: now,
    };

    fromCash.balance = (fromCash.balance || 0) - amount;
    toCash.balance = (toCash.balance || 0) + amount;

    if (!db.cashTransactions) db.cashTransactions = [];
    db.cashTransactions.push(outTx, inTx);

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'CASH_TRANSFER',
      module: 'CASH',
      documentNo: docNo,
      ipAddress: '127.0.0.1',
      details: `${fromCash.name} kasasından ${toCash.name} kasasına ${amount} TL virman yapıldı.`,
    });

    storage.save();
    return { outTx, inTx };
  }

  /**
   * 4. BANKA → BANKA VİRMAN (TRANSFER)
   */
  static async transferBankToBank(params: BankToBankTransferParams): Promise<{
    outTx: BankTransaction;
    inTx: BankTransaction;
  }> {
    const { tenantId, fromBankId, toBankId, amount, date, description, referenceNo, userId, username = 'Sistem' } = params;

    if (amount <= 0) throw new Error('Transfer tutarı 0’dan büyük olmalıdır.');
    if (fromBankId === toBankId) throw new Error('Kaynak ve hedef banka aynı olamaz.');

    const db = storage.getState();
    const fromBank = (db.bankAccounts || []).find(b => b.id === fromBankId && (!b.tenantId || b.tenantId === tenantId));
    const toBank = (db.bankAccounts || []).find(b => b.id === toBankId && (!b.tenantId || b.tenantId === tenantId));

    if (!fromBank || !toBank) throw new Error('Kaynak veya hedef banka hesabı bulunamadı.');

    const now = new Date().toISOString();
    const docNo = `VIRM-B2B-${Date.now()}`;

    const outTx: BankTransaction = {
      id: `btx-out-${Date.now()}`,
      tenantId,
      bankAccountId: fromBank.id,
      bankAccountName: fromBank.accountName || fromBank.bankName,
      targetBankAccountId: toBank.id,
      targetBankAccountName: toBank.accountName || toBank.bankName,
      documentNo: docNo,
      type: 'TRANSFER_OUT',
      direction: 'OUT',
      amount,
      date: date || now.slice(0, 10),
      description: description || `Bankalar Arası Virman: ${fromBank.bankName} ➔ ${toBank.bankName}`,
      referenceNo,
      userId,
      createdBy: username,
      createdAt: now,
    };

    const inTx: BankTransaction = {
      id: `btx-in-${Date.now()}`,
      tenantId,
      bankAccountId: toBank.id,
      bankAccountName: toBank.accountName || toBank.bankName,
      targetBankAccountId: fromBank.id,
      targetBankAccountName: fromBank.accountName || fromBank.bankName,
      documentNo: docNo,
      type: 'TRANSFER_IN',
      direction: 'IN',
      amount,
      date: date || now.slice(0, 10),
      description: description || `Bankalar Arası Virman: ${fromBank.bankName} ➔ ${toBank.bankName}`,
      referenceNo,
      userId,
      createdBy: username,
      createdAt: now,
    };

    fromBank.balance = (fromBank.balance || 0) - amount;
    toBank.balance = (toBank.balance || 0) + amount;

    if (!db.bankTransactions) db.bankTransactions = [];
    db.bankTransactions.push(outTx, inTx);

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'BANK_TRANSFER',
      module: 'BANK',
      documentNo: docNo,
      ipAddress: '127.0.0.1',
      details: `${fromBank.bankName} hesabından ${toBank.bankName} hesabına ${amount} TL virman yapıldı.`,
    });

    storage.save();
    return { outTx, inTx };
  }

  /**
   * 5. KASA ⇄ BANKA TRANSFERİ
   */
  static async transferCashAndBank(params: CashBankTransferParams): Promise<{
    cashTx: CashTransaction;
    bankTx: BankTransaction;
  }> {
    const { tenantId, cashId, bankId, amount, direction, date, description, referenceNo, userId, username = 'Sistem' } = params;

    if (amount <= 0) throw new Error('Transfer tutarı 0’dan büyük olmalıdır.');

    const db = storage.getState();
    const cash = (db.cashRegisters || []).find(k => k.id === cashId && (!k.tenantId || k.tenantId === tenantId));
    const bank = (db.bankAccounts || []).find(b => b.id === bankId && (!b.tenantId || b.tenantId === tenantId));

    if (!cash || !bank) throw new Error('Kasa veya banka hesabı bulunamadı.');

    const now = new Date().toISOString();
    const docNo = `VIRM-CB-${Date.now()}`;

    let cashTx: CashTransaction;
    let bankTx: BankTransaction;

    if (direction === 'CASH_TO_BANK') {
      cashTx = {
        id: `ctx-out-${Date.now()}`,
        tenantId,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName || bank.bankName,
        documentNo: docNo,
        type: 'TRANSFER_TO_BANK',
        direction: 'OUT',
        amount,
        date: date || now.slice(0, 10),
        description: description || `Kasadan Bankaya Yatırılan: ${cash.name} ➔ ${bank.bankName}`,
        referenceNo,
        userId,
        createdBy: username,
        createdAt: now,
      };

      bankTx = {
        id: `btx-in-${Date.now()}`,
        tenantId,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName || bank.bankName,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        documentNo: docNo,
        type: 'TRANSFER_FROM_CASH',
        direction: 'IN',
        amount,
        date: date || now.slice(0, 10),
        description: description || `Kasadan Bankaya Yatırılan: ${cash.name} ➔ ${bank.bankName}`,
        referenceNo,
        userId,
        createdBy: username,
        createdAt: now,
      };

      cash.balance = (cash.balance || 0) - amount;
      bank.balance = (bank.balance || 0) + amount;
    } else {
      bankTx = {
        id: `btx-out-${Date.now()}`,
        tenantId,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName || bank.bankName,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        documentNo: docNo,
        type: 'TRANSFER_TO_CASH',
        direction: 'OUT',
        amount,
        date: date || now.slice(0, 10),
        description: description || `Bankadan Kasaya Çekilen: ${bank.bankName} ➔ ${cash.name}`,
        referenceNo,
        userId,
        createdBy: username,
        createdAt: now,
      };

      cashTx = {
        id: `ctx-in-${Date.now()}`,
        tenantId,
        cashRegisterId: cash.id,
        cashRegisterName: cash.name,
        bankAccountId: bank.id,
        bankAccountName: bank.accountName || bank.bankName,
        documentNo: docNo,
        type: 'TRANSFER_FROM_BANK',
        direction: 'IN',
        amount,
        date: date || now.slice(0, 10),
        description: description || `Bankadan Kasaya Çekilen: ${bank.bankName} ➔ ${cash.name}`,
        referenceNo,
        userId,
        createdBy: username,
        createdAt: now,
      };

      bank.balance = (bank.balance || 0) - amount;
      cash.balance = (cash.balance || 0) + amount;
    }

    if (!db.cashTransactions) db.cashTransactions = [];
    if (!db.bankTransactions) db.bankTransactions = [];
    db.cashTransactions.push(cashTx);
    db.bankTransactions.push(bankTx);

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'CASH_BANK_TRANSFER',
      module: 'FINANCE',
      documentNo: docNo,
      ipAddress: '127.0.0.1',
      details: `${direction === 'CASH_TO_BANK' ? `${cash.name} ➔ ${bank.bankName}` : `${bank.bankName} ➔ ${cash.name}`} arasında ${amount} TL transfer yapıldı.`,
    });

    storage.save();
    return { cashTx, bankTx };
  }

  /**
   * 6. FİNANSAL İŞLEM İPTALİ (CANCEL)
   * Fiziksel silme yapılmaz; ters kayıt ve iptal durumu atanır.
   */
  static async cancelAccountTransaction(
    transactionId: string,
    tenantId: string,
    reason: string,
    userId: string,
    username: string = 'Sistem'
  ): Promise<AccountTransaction> {
    const db = storage.getState();
    const tx = (db.accountTransactions || []).find(
      t => t.id === transactionId && t.tenantId === tenantId
    );
    if (!tx) throw new Error('Finansal hareket bulunamadı veya yetkiniz yok.');
    if (tx.isCancelled) throw new Error('Bu hareket zaten iptal edilmiş.');

    const customer = (db.customers || []).find(c => c.id === tx.customerId);
    if (customer) {
      if (tx.debit > 0) {
        customer.totalDebit = Math.max(0, (customer.totalDebit || 0) - tx.debit);
      }
      if (tx.credit > 0) {
        customer.totalCredit = Math.max(0, (customer.totalCredit || 0) - tx.credit);
      }
      customer.balance = (customer.totalDebit || 0) - (customer.totalCredit || 0);
      customer.updatedAt = new Date().toISOString();
    }

    // İlgili Kasa Hareketini İptal Et
    if (tx.relatedCashTxId) {
      const cTx = (db.cashTransactions || []).find(c => c.id === tx.relatedCashTxId);
      if (cTx && !cTx.isCancelled) {
        cTx.isCancelled = true;
        cTx.cancelReason = reason;
        const cash = (db.cashRegisters || []).find(k => k.id === cTx.cashRegisterId);
        if (cash) {
          if (cTx.direction === 'IN') cash.balance = (cash.balance || 0) - cTx.amount;
          if (cTx.direction === 'OUT') cash.balance = (cash.balance || 0) + cTx.amount;
        }
      }
    }

    // İlgili Banka Hareketini İptal Et
    if (tx.relatedBankTxId) {
      const bTx = (db.bankTransactions || []).find(b => b.id === tx.relatedBankTxId);
      if (bTx && !bTx.isCancelled) {
        bTx.isCancelled = true;
        bTx.cancelReason = reason;
        const bank = (db.bankAccounts || []).find(b => b.id === bTx.bankAccountId);
        if (bank) {
          if (bTx.direction === 'IN') bank.balance = (bank.balance || 0) - bTx.amount;
          if (bTx.direction === 'OUT') bank.balance = (bank.balance || 0) + bTx.amount;
        }
      }
    }

    tx.isCancelled = true;
    tx.cancelReason = reason;

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'TRANSACTION_CANCELLED',
      module: 'FINANCE',
      documentNo: tx.documentNo,
      ipAddress: '127.0.0.1',
      details: `${tx.documentNo} nolu finansal işlem iptal edildi. Sebep: ${reason}`,
    });

    storage.save();
    return tx;
  }

  /**
   * 7. CARİ EKSTRE HESAPLAYICI (YÜRÜYEN BAKİYELİ)
   */
  static getCustomerStatement(
    customerId: string,
    tenantId: string,
    startDate?: string,
    endDate?: string
  ): {
    customer: Customer;
    transactions: (AccountTransaction & { runningBalance: number })[];
    summary: {
      totalDebit: number;
      totalCredit: number;
      finalBalance: number;
      openingBalance: number;
    };
  } {
    const db = storage.getState();
    const customer = (db.customers || []).find(
      c => c.id === customerId && (!c.tenantId || c.tenantId === tenantId)
    );
    if (!customer) throw new Error('Cari hesap bulunamadı.');

    let allTx = (db.accountTransactions || [])
      .filter(t => t.customerId === customerId && t.tenantId === tenantId && !t.isCancelled)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const formatted = allTx.map(t => {
      totalDebit += t.debit || 0;
      totalCredit += t.credit || 0;
      running += (t.debit || 0) - (t.credit || 0);
      return {
        ...t,
        runningBalance: running,
      };
    });

    let filtered = formatted;
    if (startDate) {
      filtered = filtered.filter(t => t.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(t => t.date <= endDate);
    }

    return {
      customer,
      transactions: filtered,
      summary: {
        totalDebit,
        totalCredit,
        finalBalance: running,
        openingBalance: (customer.openingDebit || 0) - (customer.openingCredit || 0),
      },
    };
  }
}
