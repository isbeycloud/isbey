import crypto from 'crypto';
import { storage } from '../db/storage';
import {
  FieldCollection,
  FieldCollectionReceipt,
  FieldPaymentMethod,
  FieldCollectionStatus,
  CurrentTransaction,
  CashTransaction,
  BankTransaction,
  DatabaseState,
} from '../db/schema';

export interface CreateFieldCollectionParams {
  tenantId: string;
  companyId?: string;
  customerId: string;
  userId: string;
  userName: string;
  amount: number;
  currency?: 'TRY' | 'USD' | 'EUR';
  paymentMethod: FieldPaymentMethod;
  collectionDate?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  signatureFileUrl?: string;
  photoFileUrl?: string;
  clientTransactionId?: string;
  targetCashRegisterId?: string;
  targetBankAccountId?: string;
}

export class FieldCollectionService {
  /**
   * Yeni saha tahsilatı oluşturur, cari hareketi düşer ve kasa/banka girişini atomik olarak yansıtır.
   */
  public static async createCollection(params: CreateFieldCollectionParams): Promise<{
    collection: FieldCollection;
    receipt: FieldCollectionReceipt;
  }> {
    const {
      tenantId,
      customerId,
      userId,
      userName,
      amount,
      currency = 'TRY',
      paymentMethod,
      description = 'Saha Tahsilatı',
      latitude,
      longitude,
      locationAccuracy,
      signatureFileUrl,
      photoFileUrl,
      clientTransactionId = crypto.randomUUID(),
      targetCashRegisterId,
      targetBankAccountId,
    } = params;

    if (!customerId || !amount || amount <= 0) {
      throw new Error('Geçersiz müşteri veya tahsilat tutarı.');
    }

    return await storage.runTransactionForTenant(tenantId, (draft: DatabaseState) => {
      if (!draft.fieldCollections) draft.fieldCollections = [];
      if (!draft.fieldCollectionReceipts) draft.fieldCollectionReceipts = [];
      if (!draft.currentTransactions) draft.currentTransactions = [];
      if (!draft.cashTransactions) draft.cashTransactions = [];
      if (!draft.bankTransactions) draft.bankTransactions = [];

      // 1. Idempotency Check: Aynı client_transaction_id ile daha önce kayıt var mı?
      const existing = draft.fieldCollections.find(
        fc => fc.tenantId === tenantId && fc.clientTransactionId === clientTransactionId
      );
      if (existing) {
        const existingReceipt = draft.fieldCollectionReceipts.find(
          r => r.collectionId === existing.id
        );
        return { collection: existing, receipt: existingReceipt! };
      }

      // 2. Müşteri Bilgilerini Doğrula
      const customer = (draft.customers || []).find(
        c => c.id === customerId && (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey'))
      );
      if (!customer) throw new Error('Tahsilat yapılacak müşteri bulunamadı.');

      const companyId = params.companyId || customer.companyId || draft.company?.id || 'cmp-default';
      const now = new Date().toISOString();
      const collectionDate = params.collectionDate || now.split('T')[0];

      // 3. Sıralı Tahsilat No Üret (THS-2026-000001)
      const seq = draft.sequences['FIELD_COLLECTION'] || { prefix: 'THS', year: 2026, lastNumber: 0, length: 6 };
      seq.lastNumber += 1;
      draft.sequences['FIELD_COLLECTION'] = seq;
      const collectionNumber = `${seq.prefix}-${seq.year}-${String(seq.lastNumber).padStart(seq.length, '0')}`;

      // 4. Onay Eşiği Kontrolü (100.000 TL ve üzeri ise onay bekliyor)
      const isHighAmount = amount >= 100000;
      const status: FieldCollectionStatus = isHighAmount ? 'PENDING_APPROVAL' : 'CONFIRMED';
      const isApproved = !isHighAmount;

      const collectionId = `fcol-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const receiptNumber = `MAK-${seq.year}-${String(seq.lastNumber).padStart(seq.length, '0')}`;

      // 5. Cari Hareketini Oluştur (Alacak Kaydı -> Müşteri borcunu azaltır)
      let currentTransactionId: string | undefined;
      let cashTransactionId: string | undefined;

      if (isApproved) {
        const curTxId = `ctx-fcol-${Date.now()}`;
        const newBalance = (customer.balance || 0) - amount; // Borç alacak bakiyesi azalır

        const currentTx: CurrentTransaction = {
          id: curTxId,
          tenantId,
          companyId,
          customerId: customer.id,
          customerCode: customer.code,
          customerTitle: customer.title,
          date: collectionDate,
          documentNo: collectionNumber,
          transactionType: 'TAHSILAT',
          description: `Saha Tahsilatı (${paymentMethod}) - ${description} (Personel: ${userName})`,
          debt: 0,
          credit: amount,
          balance: newBalance,
          dueDate: collectionDate,
          userId,
          createdAt: now,
        };
        draft.currentTransactions.push(currentTx);
        customer.balance = newBalance;
        customer.updatedAt = now;
        currentTransactionId = curTxId;

        // 6. Finansal Yansıma (Kasa / Banka)
        if (paymentMethod === 'CASH') {
          // Nakit Kasa Girişi
          const cashRegister = (draft.cashRegisters || []).find(
            cr => cr.id === targetCashRegisterId || cr.tenantId === tenantId || cr.isDefault
          ) || draft.cashRegisters[0];

          if (cashRegister) {
            const cashTxId = `cstx-fcol-${Date.now()}`;
            const cashTx: CashTransaction = {
              id: cashTxId,
              tenantId,
              companyId,
              cashRegisterId: cashRegister.id,
              cashRegisterName: cashRegister.name,
              date: collectionDate,
              documentNo: collectionNumber,
              type: 'INCOME',
              category: 'SAHA_TAHSILAT',
              amount,
              description: `${customer.title} - Saha Tahsilatı (Personel: ${userName})`,
              customerId: customer.id,
              customerTitle: customer.title,
              userId,
              createdAt: now,
            };
            draft.cashTransactions.push(cashTx);
            cashRegister.balance = (cashRegister.balance || 0) + amount;
            cashTransactionId = cashTxId;
          }
        } else if (paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'CREDIT_CARD') {
          // Banka Hesabı Girişi
          const bankAccount = (draft.bankAccounts || []).find(
            ba => ba.id === targetBankAccountId || ba.tenantId === tenantId || ba.isDefault
          ) || draft.bankAccounts[0];

          if (bankAccount) {
            const bankTx: BankTransaction = {
              id: `btx-fcol-${Date.now()}`,
              tenantId,
              companyId,
              bankAccountId: bankAccount.id,
              bankAccountName: bankAccount.accountName,
              date: collectionDate,
              documentNo: collectionNumber,
              type: 'INCOME',
              category: paymentMethod === 'CREDIT_CARD' ? 'POS_TAHSILAT' : 'HAVALE_EFT',
              amount,
              description: `${customer.title} - Saha Tahsilatı (Personel: ${userName})`,
              customerId: customer.id,
              customerTitle: customer.title,
              userId,
              createdAt: now,
            };
            draft.bankTransactions.push(bankTx);
            bankAccount.balance = (bankAccount.balance || 0) + amount;
          }
        }
      }

      // 7. FieldCollection Kaydını Oluştur
      const newCollection: FieldCollection = {
        id: collectionId,
        tenantId,
        companyId,
        collectionNumber,
        customerId: customer.id,
        customerTitle: customer.title,
        userId,
        userName,
        amount,
        currency,
        paymentMethod,
        collectionDate,
        description,
        latitude,
        longitude,
        locationAccuracy,
        signatureFileUrl,
        photoFileUrl,
        receiptNumber,
        status,
        isApproved,
        approvedBy: isApproved ? 'SYSTEM' : undefined,
        approvedAt: isApproved ? now : undefined,
        clientTransactionId,
        syncStatus: 'SYNCED',
        currentTransactionId,
        cashTransactionId,
        createdAt: now,
        updatedAt: now,
      };
      draft.fieldCollections.push(newCollection);

      // 8. Resmi Tahsilat Makbuzu Oluştur
      const receipt: FieldCollectionReceipt = {
        id: `rcpt-${Date.now()}`,
        collectionId,
        collectionNumber,
        receiptNumber,
        tenantId,
        companyTitle: draft.company?.name || 'İŞBEY Teknoloji A.Ş.',
        customerTitle: customer.title,
        amount,
        currency,
        paymentMethod,
        collectedBy: userName,
        signedAt: now,
        notes: description,
        createdAt: now,
      };
      draft.fieldCollectionReceipts.push(receipt);

      // 9. Sistem Bildirimi ve Denetim Kaydı
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: `log-fcol-${Date.now()}`,
        tenantId,
        userId,
        userName,
        userRole: 'SAHA',
        action: 'FIELD_COLLECTION_CREATED',
        module: 'SAHA_TAHSILAT',
        documentNo: collectionNumber,
        ipAddress: '127.0.0.1',
        details: `${customer.title} firmasından ${amount} ${currency} tutarında saha tahsilatı yapıldı (${paymentMethod}).`,
        timestamp: now,
      });

      return { collection: newCollection, receipt };
    });
  }

  /**
   * Onay bekleyen yüksek tutarlı tahsilatı onaylar
   */
  public static async approveCollection(id: string, tenantId: string, approvedBy: string): Promise<FieldCollection> {
    return await storage.runTransactionForTenant(tenantId, (draft: DatabaseState) => {
      const col = (draft.fieldCollections || []).find(c => c.id === id && c.tenantId === tenantId);
      if (!col) throw new Error('Tahsilat kaydı bulunamadı.');
      if (col.status !== 'PENDING_APPROVAL') throw new Error('Bu tahsilat onay bekleyen durumda değil.');

      const now = new Date().toISOString();
      col.status = 'CONFIRMED';
      col.isApproved = true;
      col.approvedBy = approvedBy;
      col.approvedAt = now;
      col.updatedAt = now;

      // Cari bakiyesini güncelle
      const customer = (draft.customers || []).find(c => c.id === col.customerId);
      if (customer) {
        customer.balance = (customer.balance || 0) - col.amount;
        customer.updatedAt = now;

        const currentTx: CurrentTransaction = {
          id: `ctx-fcol-${Date.now()}`,
          tenantId,
          companyId: col.companyId,
          customerId: customer.id,
          customerCode: customer.code,
          customerTitle: customer.title,
          date: col.collectionDate,
          documentNo: col.collectionNumber,
          transactionType: 'TAHSILAT',
          description: `Saha Tahsilat Onayı - ${col.collectionNumber} (Onaylayan: ${approvedBy})`,
          debt: 0,
          credit: col.amount,
          balance: customer.balance,
          dueDate: col.collectionDate,
          userId: approvedBy,
          createdAt: now,
        };
        draft.currentTransactions.push(currentTx);
        col.currentTransactionId = currentTx.id;
      }

      return col;
    });
  }

  /**
   * Saha tahsilatını iptal eder ve varsa cari/kasa hareketlerini geri alır (ters kayıt)
   */
  public static async cancelCollection(id: string, tenantId: string, reason: string, cancelledBy: string): Promise<FieldCollection> {
    return await storage.runTransactionForTenant(tenantId, (draft: DatabaseState) => {
      const col = (draft.fieldCollections || []).find(c => c.id === id && c.tenantId === tenantId);
      if (!col) throw new Error('Tahsilat kaydı bulunamadı.');
      if (col.status === 'CANCELLED') throw new Error('Bu tahsilat zaten iptal edilmiş.');

      const now = new Date().toISOString();
      const previousStatus = col.status;
      col.status = 'CANCELLED';
      col.description = `[İPTAL: ${reason}] ${col.description || ''}`;
      col.updatedAt = now;

      // Eğer daha önce onaylanmışsa cari bakiyesini eski haline getir (Ters kayıt)
      if (previousStatus === 'CONFIRMED') {
        const customer = (draft.customers || []).find(c => c.id === col.customerId);
        if (customer) {
          customer.balance = (customer.balance || 0) + col.amount;
          customer.updatedAt = now;

          const reverseTx: CurrentTransaction = {
            id: `ctx-fcol-rev-${Date.now()}`,
            tenantId,
            companyId: col.companyId,
            customerId: customer.id,
            customerCode: customer.code,
            customerTitle: customer.title,
            date: now.split('T')[0],
            documentNo: col.collectionNumber,
            transactionType: 'IPTAL',
            description: `Saha Tahsilat İptali: ${col.collectionNumber} - Sebep: ${reason}`,
            debt: col.amount,
            credit: 0,
            balance: customer.balance,
            dueDate: now.split('T')[0],
            userId: cancelledBy,
            createdAt: now,
          };
          draft.currentTransactions.push(reverseTx);
        }
      }

      return col;
    });
  }
}
