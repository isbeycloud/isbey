import { CreditWallet, CreditTxRecord, CreditTransactionKind } from '../db/schema';
import { storage } from '../db/storage';

export class CreditWalletService {
  /**
   * Cüzdanı getirir veya oluşturur
   */
  public static async getWallet(tenantId: string): Promise<CreditWallet> {
    const db = storage.getState();
    let wallet = (db.creditWallets || []).find(w => w.tenantId === tenantId);
    if (!wallet) {
      const tenant = (db.tenants || []).find(t => t.id === tenantId);
      wallet = {
        id: `wlt-${tenantId}`,
        tenantId,
        balance: tenant?.eInvoiceCredits || 100,
        reservedBalance: 0,
        lowCreditThreshold: 20,
        updatedAt: new Date().toISOString(),
      };
    }
    return wallet;
  }

  /**
   * 1. ATOMİK KONTÖR REZERVASYONU
   * e-Belge gönderimi başlamadan önce kontör rezerve edilir
   */
  public static async reserveCredits(
    tenantId: string,
    amount: number = 1,
    referenceType: 'INVOICE' | 'DESPATCH' = 'INVOICE',
    referenceId?: string
  ): Promise<{ success: boolean; availableBalance: number; reservedBalance: number }> {
    return await storage.runTransaction(draft => {
      if (!draft.creditWallets) draft.creditWallets = [];
      let wallet = draft.creditWallets.find(w => w.tenantId === tenantId);
      if (!wallet) {
        const tenant = (draft.tenants || []).find(t => t.id === tenantId);
        wallet = {
          id: `wlt-${tenantId}`,
          tenantId,
          balance: tenant?.eInvoiceCredits || 100,
          reservedBalance: 0,
          lowCreditThreshold: 20,
          updatedAt: new Date().toISOString(),
        };
        draft.creditWallets.push(wallet);
      }

      const availableBalance = wallet.balance - (wallet.reservedBalance || 0);
      if (availableBalance < amount) {
        throw new Error(
          `Yetersiz e-belge kontörü. Mevcut Kullanılabilir Bakiye: ${availableBalance}, Gerekli: ${amount}. Lütfen kontör yükleyiniz.`
        );
      }

      wallet.reservedBalance = (wallet.reservedBalance || 0) + amount;
      wallet.updatedAt = new Date().toISOString();

      return {
        success: true,
        availableBalance: wallet.balance - wallet.reservedBalance,
        reservedBalance: wallet.reservedBalance,
      };
    });
  }

  /**
   * 2. ATOMİK KONTÖR DÜŞÜMÜ (COMMIT)
   * Belge başarıyla GİB / HBT sistemine iletildiğinde rezervasyon düşülür ve bakiye azaltılır
   */
  public static async commitCredits(
    tenantId: string,
    amount: number = 1,
    referenceType: 'INVOICE' | 'DESPATCH' = 'INVOICE',
    referenceId?: string,
    description: string = 'e-Belge gönderim bedeli',
    performedBy: string = 'System'
  ): Promise<{ success: boolean; newBalance: number }> {
    return await storage.runTransaction(draft => {
      if (!draft.creditWallets) draft.creditWallets = [];
      const wallet = draft.creditWallets.find(w => w.tenantId === tenantId);
      if (!wallet) throw new Error('Kontör cüzdanı bulunamadı.');

      const prevBalance = wallet.balance;
      wallet.reservedBalance = Math.max(0, (wallet.reservedBalance || 0) - amount);
      wallet.balance = Math.max(0, wallet.balance - amount);
      wallet.updatedAt = new Date().toISOString();

      // Tenant ana kaydındaki sayacı da eşitle
      const tenant = (draft.tenants || []).find(t => t.id === tenantId);
      if (tenant) {
        tenant.eInvoiceCredits = wallet.balance;
        tenant.updatedAt = new Date().toISOString();
      }

      // Hareket ekle
      if (!draft.creditTransactions) draft.creditTransactions = [];
      const now = new Date().toISOString();
      draft.creditTransactions.unshift({
        id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId,
        customerId: tenantId,
        customerTitle: tenant?.name || 'Müşteri',
        type: 'USAGE',
        unit: 'INVOICE_UNIT',
        amount,
        balanceBefore: prevBalance,
        balanceAfter: wallet.balance,
        description: `${description} (${referenceType} ${referenceId || ''})`,
        performedBy,
        performedByRole: 'COMPANY_ADMIN',
        createdAt: now,
      } as any);

      return {
        success: true,
        newBalance: wallet.balance,
      };
    });
  }

  /**
   * 3. ATOMİK KONTÖR İADESİ (ROLLBACK)
   * Belge gönderimi başarısız olursa rezerve edilen kontör serbest bırakılır
   */
  public static async rollbackCredits(
    tenantId: string,
    amount: number = 1,
    referenceType: 'INVOICE' | 'DESPATCH' = 'INVOICE',
    referenceId?: string,
    reason: string = 'Gönderim başarısız olduğu için rezervasyon iptal edildi'
  ): Promise<{ success: boolean; availableBalance: number }> {
    return await storage.runTransaction(draft => {
      if (!draft.creditWallets) draft.creditWallets = [];
      const wallet = draft.creditWallets.find(w => w.tenantId === tenantId);
      if (wallet) {
        wallet.reservedBalance = Math.max(0, (wallet.reservedBalance || 0) - amount);
        wallet.updatedAt = new Date().toISOString();
      }
      return {
        success: true,
        availableBalance: wallet ? wallet.balance - (wallet.reservedBalance || 0) : 0,
      };
    });
  }

  /**
   * 4. KONTÖR YÜKLEME / SATIN ALMA
   */
  public static async addCredits(
    tenantId: string,
    amount: number,
    type: CreditTransactionKind = 'purchase',
    description: string = 'Kontör Yükleme',
    referenceType: 'ONLINE_PAYMENT' | 'ADMIN_GRANT' | 'REFUND' = 'ONLINE_PAYMENT',
    referenceId?: string,
    performedBy: string = 'Online Ödeme'
  ): Promise<{ success: boolean; newBalance: number }> {
    return await storage.runTransaction(draft => {
      if (!draft.creditWallets) draft.creditWallets = [];
      let wallet = draft.creditWallets.find(w => w.tenantId === tenantId);
      const tenant = (draft.tenants || []).find(t => t.id === tenantId);

      if (!wallet) {
        wallet = {
          id: `wlt-${tenantId}`,
          tenantId,
          balance: 0,
          reservedBalance: 0,
          lowCreditThreshold: 20,
          updatedAt: new Date().toISOString(),
        };
        draft.creditWallets.push(wallet);
      }

      const prevBalance = wallet.balance;
      wallet.balance += amount;
      wallet.updatedAt = new Date().toISOString();

      if (tenant) {
        tenant.eInvoiceCredits = wallet.balance;
        tenant.updatedAt = new Date().toISOString();
      }

      if (!draft.creditTransactions) draft.creditTransactions = [];
      const now = new Date().toISOString();
      draft.creditTransactions.unshift({
        id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId,
        customerId: tenantId,
        customerTitle: tenant?.name || 'Müşteri',
        type: type.toUpperCase() as any,
        unit: 'INVOICE_UNIT',
        amount,
        balanceBefore: prevBalance,
        balanceAfter: wallet.balance,
        description: `${description} (${referenceType} ${referenceId || ''})`,
        performedBy,
        performedByRole: 'COMPANY_ADMIN',
        createdAt: now,
      } as any);

      return {
        success: true,
        newBalance: wallet.balance,
      };
    });
  }
}
