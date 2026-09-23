import crypto from 'crypto';
import { storage } from '../db/storage';
import {
  PaymentLink,
  Customer,
  CurrentTransaction,
  BankTransaction,
  DatabaseState,
} from '../db/schema';
import { MockPaymentProvider } from './payments/mockPaymentProvider';

export class PaymentLinkService {
  /**
   * Müşteri için süreli, kriptografik olarak güvenli ödeme linki ve QR kod üretir
   */
  public static async createPaymentLink(params: {
    tenantId: string;
    customerId: string;
    amount: number;
    currency?: 'TRY' | 'USD' | 'EUR';
    description?: string;
    expiresInDays?: number;
  }): Promise<PaymentLink> {
    const { tenantId, customerId, amount, currency = 'TRY', description = 'Cari Hesap Ödemesi', expiresInDays = 7 } = params;

    const db = storage.getState();
    const customer = (db.customers || []).find(
      c => c.id === customerId && (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey'))
    );
    if (!customer) throw new Error('Müşteri bulunamadı.');

    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const linkId = `plink-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const qrData = `https://isbey.cloud/pay/${token}`;

    const newLink: PaymentLink = {
      id: linkId,
      tenantId,
      customerId: customer.id,
      customerTitle: customer.title,
      amount,
      currency,
      token,
      tokenHash,
      description,
      expiresAt,
      status: 'ACTIVE',
      qrData,
      viewCount: 0,
      createdAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.paymentLinks) draft.paymentLinks = [];
      draft.paymentLinks.push(newLink);
      return newLink;
    });
  }

  /**
   * Token ile ödeme linki bilgilerini çözümler (Müşteri ödeme ekranı için)
   */
  public static resolveToken(token: string): PaymentLink | null {
    const db = storage.getState();
    const link = (db.paymentLinks || []).find(pl => pl.token === token);
    if (!link) return null;

    // Süre kontrolü
    if (new Date(link.expiresAt) < new Date() && link.status === 'ACTIVE') {
      link.status = 'EXPIRED';
      storage.save();
    }

    link.viewCount = (link.viewCount || 0) + 1;
    storage.save();
    return link;
  }

  /**
   * Müşteri ödeme linki üzerinden kredi kartı ile ödemeyi tamamlar
   */
  public static async executePublicPayment(params: {
    token: string;
    cardNumber: string;
    cardHolder: string;
    expiry: string;
    cvv: string;
  }): Promise<{ success: boolean; message: string; paymentId?: string }> {
    const { token, cardNumber, cardHolder, expiry, cvv } = params;

    const link = this.resolveToken(token);
    if (!link) throw new Error('Geçersiz veya süresi dolmuş ödeme linki.');
    if (link.status === 'USED') throw new Error('Bu ödeme linki zaten kullanılmış.');
    if (link.status === 'EXPIRED') throw new Error('Ödeme linkinin geçerlilik süresi dolmuştur.');

    const mockProvider = new MockPaymentProvider();
    const payRes = await mockProvider.createPayment({
      tenantId: link.tenantId,
      orderNumber: `ORD-LINK-${Date.now()}`,
      amount: link.amount,
      currency: link.currency,
      paymentType: 'PLAN_UPGRADE', // Generic online payment
      description: link.description,
      cardNumber,
      cardHolder,
      expiry,
      cvv,
    });

    if (!payRes.success) {
      return { success: false, message: payRes.errorMessage || 'Ödeme reddedildi.' };
    }

    const now = new Date().toISOString();

    // Atomik Finansal Yansıma: Link durumunu 'USED' yap, Cari bakiyeyi düş, Banka hareketi yaz
    await storage.runTransaction((draft: DatabaseState) => {
      const pl = (draft.paymentLinks || []).find(l => l.id === link.id);
      if (pl) {
        pl.status = 'USED';
        pl.paymentId = payRes.paymentId;
        pl.paidAt = now;
      }

      const customer = (draft.customers || []).find(c => c.id === link.customerId);
      if (customer) {
        customer.balance = (customer.balance || 0) - link.amount;
        customer.updatedAt = now;

        if (!draft.currentTransactions) draft.currentTransactions = [];
        draft.currentTransactions.push({
          id: `ctx-plink-${Date.now()}`,
          tenantId: link.tenantId,
          companyId: customer.companyId || 'cmp-default',
          customerId: customer.id,
          customerCode: customer.code,
          customerTitle: customer.title,
          date: now.split('T')[0],
          documentNo: `LINK-${link.id.slice(-6).toUpperCase()}`,
          transactionType: 'TAHSILAT',
          description: `Online Ödeme Linki Tahsilatı (${link.description})`,
          debt: 0,
          credit: link.amount,
          balance: customer.balance,
          dueDate: now.split('T')[0],
          userId: 'ONLINE_PAYMENT',
          createdAt: now,
        });
      }

      // Banka hesabına POS girişi yaz
      if (!draft.bankTransactions) draft.bankTransactions = [];
      const bankAccount = (draft.bankAccounts || []).find(ba => ba.tenantId === link.tenantId) || draft.bankAccounts[0];
      if (bankAccount) {
        draft.bankTransactions.push({
          id: `btx-plink-${Date.now()}`,
          tenantId: link.tenantId,
          companyId: bankAccount.companyId || 'cmp-default',
          bankAccountId: bankAccount.id,
          bankAccountName: bankAccount.accountName,
          date: now.split('T')[0],
          documentNo: `LINK-${link.id.slice(-6).toUpperCase()}`,
          type: 'INCOME',
          category: 'POS_TAHSILAT',
          amount: link.amount,
          description: `${link.customerTitle} - Online Ödeme Linki Tahsilatı`,
          customerId: link.customerId,
          customerTitle: link.customerTitle,
          userId: 'ONLINE_PAYMENT',
          createdAt: now,
        });
        bankAccount.balance = (bankAccount.balance || 0) + link.amount;
      }
    });

    return { success: true, message: 'Ödemeniz başarıyla tamamlandı. Teşekkür ederiz!', paymentId: payRes.paymentId };
  }
}
