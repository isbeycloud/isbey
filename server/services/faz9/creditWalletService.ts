import { storage } from '../../db/storage';
import { CreditWallet, CreditTxRecord, DatabaseState, AutoTopupRule } from '../../db/schema';
import { PaymentProviderFactory } from './paymentProvider';

export class CreditWalletService {
  /**
   * Cüzdanı getirir veya 100 hoş geldin kontörüyle başlatır
   */
  public static getOrCreateWallet(tenantId: string): CreditWallet {
    const db = storage.getState();
    let wallet = (db.creditWallets || []).find(w => w.tenantId === tenantId);
    if (!wallet) {
      wallet = {
        id: `wlt-${tenantId}`,
        tenantId,
        balance: 100,
        reservedBalance: 0,
        lowCreditThreshold: 20,
        updatedAt: new Date().toISOString(),
      };
    }
    return wallet;
  }

  /**
   * Kontör harcaması yapar (e-Fatura: 1, e-Arşiv: 1, OCR: 2, SMS: 1, AI: 1)
   */
  public static async consumeCredits(params: {
    tenantId: string;
    quantity: number;
    referenceType: CreditTxRecord['referenceType'];
    referenceId?: string;
    description: string;
    performedBy?: string;
  }): Promise<{ success: boolean; remainingBalance: number; warning?: string }> {
    const { tenantId, quantity, referenceType, referenceId, description, performedBy = 'System' } = params;
    const now = new Date().toISOString();

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.creditWallets) draft.creditWallets = [];
      if (!draft.creditTransactions) draft.creditTransactions = [];

      let wallet = draft.creditWallets.find(w => w.tenantId === tenantId);
      if (!wallet) {
        wallet = {
          id: `wlt-${tenantId}`,
          tenantId,
          balance: 100,
          reservedBalance: 0,
          lowCreditThreshold: 20,
          updatedAt: now,
        };
        draft.creditWallets.push(wallet);
      }

      if (wallet.balance < quantity) {
        // Kontör yetersiz
        return {
          success: false,
          remainingBalance: wallet.balance,
          warning: 'Kontör bakiyeniz yetersiz. Lütfen kontör yükleyiniz.',
        };
      }

      const balanceBefore = wallet.balance;
      wallet.balance -= quantity;
      wallet.updatedAt = now;

      // Log kaydı
      draft.creditTransactions.push({
        id: `ctx-${Date.now()}`,
        dealerId: 'dealer-isbey-hq',
        customerId: tenantId,
        customerName: tenantId,
        amount: quantity,
        unitPrice: 0,
        totalPrice: 0,
        balanceAfter: wallet.balance,
        note: description,
        type: 'USAGE',
        performedBy,
        createdAt: now,
      });

      let warning: string | undefined;
      if (wallet.balance <= wallet.lowCreditThreshold) {
        warning = `Kontör bakiyeniz ${wallet.balance} adede düştü. Kesintisiz hizmet için kontör yüklemeniz önerilir.`;
      }

      return {
        success: true,
        remainingBalance: wallet.balance,
        warning,
      };
    });
  }

  /**
   * Kontör satın alma işlemi ve cüzdana yükleme
   */
  public static async purchaseCredits(params: {
    tenantId: string;
    quantity: number;
    amount: number;
    paymentProvider?: 'MOCK' | 'IYZICO' | 'PAYTR';
  }): Promise<{ success: boolean; newBalance: number; paymentId: string }> {
    const { tenantId, quantity, amount, paymentProvider = 'MOCK' } = params;
    const now = new Date().toISOString();

    // 1. Ödeme Sağlayıcı ile Tahsilat
    const provider = PaymentProviderFactory.getProvider(paymentProvider);
    const paymentResult = await provider.createPayment({
      tenantId,
      orderNumber: `ORD-CRD-${Date.now()}`,
      amount,
      currency: 'TRY',
      description: `${quantity} Adet İŞBEY Bulut Kontör Paketi Satın Alımı`,
    });

    if (!paymentResult.success) {
      throw new Error(paymentResult.errorMessage || 'Ödeme işlemi tamamlanamadı.');
    }

    // 2. Cüzdan Bakiyesini Güncelle
    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.creditWallets) draft.creditWallets = [];
      if (!draft.creditTransactions) draft.creditTransactions = [];
      if (!draft.payments) draft.payments = [];

      let wallet = draft.creditWallets.find(w => w.tenantId === tenantId);
      if (!wallet) {
        wallet = {
          id: `wlt-${tenantId}`,
          tenantId,
          balance: 0,
          reservedBalance: 0,
          lowCreditThreshold: 20,
          updatedAt: now,
        };
        draft.creditWallets.push(wallet);
      }

      wallet.balance += quantity;
      wallet.updatedAt = now;

      // Ödeme Kaydı
      draft.payments.push({
        id: `pay-${Date.now()}`,
        tenantId,
        paymentProvider,
        providerPaymentId: paymentResult.providerPaymentId,
        orderNumber: `ORD-CRD-${Date.now()}`,
        amount,
        currency: 'TRY',
        vatAmount: amount * 0.2,
        totalAmount: amount * 1.2,
        status: 'successful',
        paymentType: 'CREDIT_PURCHASE',
        description: `${quantity} Kontör Yüklemesi`,
        paidAt: now,
      });

      // Kontör Hareket Kaydı
      draft.creditTransactions.push({
        id: `crd-${Date.now()}`,
        dealerId: 'dealer-isbey-hq',
        customerId: tenantId,
        customerName: tenantId,
        amount: quantity,
        unitPrice: amount / quantity,
        totalPrice: amount,
        balanceAfter: wallet.balance,
        note: `${quantity} Adet Kontör Satın Alındı (${paymentProvider})`,
        type: 'PURCHASE',
        performedBy: 'Online Checkout',
        createdAt: now,
      });

      return {
        success: true,
        newBalance: wallet.balance,
        paymentId: paymentResult.providerPaymentId,
      };
    });
  }
}
