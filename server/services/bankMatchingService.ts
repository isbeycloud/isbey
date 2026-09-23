import { storage } from '../db/storage';
import {
  BankTransaction,
  BankTransactionMatch,
  Customer,
  Invoice,
  CurrentTransaction,
  DatabaseState,
} from '../db/schema';

export interface MatchSuggestion {
  bankTransaction: BankTransaction;
  match: BankTransactionMatch;
  matchedCustomer?: Customer;
  matchedInvoice?: Invoice;
}

export class BankMatchingService {
  /**
   * Banka hareketlerini analiz eder ve cari/fatura eşleşme önerileri üretir
   */
  public static async analyzeBankTransactions(tenantId: string): Promise<MatchSuggestion[]> {
    const db = storage.getState();
    const bankTxs = (db.bankTransactions || []).filter(
      bt => bt.tenantId === tenantId || (!bt.tenantId && tenantId === 'tnt-isbey')
    );
    const customers = (db.customers || []).filter(
      c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
    );
    const invoices = (db.invoices || []).filter(
      i => (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey')) && i.status !== 'CANCELLED'
    );
    const existingMatches = (db.bankTransactionMatches || []).filter(m => m.tenantId === tenantId);

    const suggestions: MatchSuggestion[] = [];

    for (const btx of bankTxs) {
      // Zaten mutabık kalınmış mı?
      const existing = existingMatches.find(m => m.bankTransactionId === btx.id);
      if (existing && existing.status === 'CONFIRMED') {
        const c = customers.find(cust => cust.id === existing.matchedCustomerId);
        const inv = invoices.find(i => i.id === existing.matchedInvoiceId);
        suggestions.push({
          bankTransaction: btx,
          match: existing,
          matchedCustomer: c,
          matchedInvoice: inv,
        });
        continue;
      }

      const descUpper = (btx.description || '').toUpperCase();
      let matchedCustomer: Customer | undefined;
      let matchedInvoice: Invoice | undefined;
      let score = 0;
      const rules: string[] = [];

      // 1. Fatura Numarası Eşleşmesi (Örn: FAT-2026-00001 veya GİB No)
      for (const inv of invoices) {
        if (inv.invoiceNo && descUpper.includes(inv.invoiceNo.toUpperCase())) {
          matchedInvoice = inv;
          matchedCustomer = customers.find(c => c.id === inv.customerId);
          score += 50;
          rules.push('EXACT_INVOICE_NO_MATCH');
          break;
        }
      }

      // 2. VKN / TCKN Eşleşmesi
      if (!matchedCustomer) {
        for (const cust of customers) {
          if (cust.taxNumber && cust.taxNumber.length >= 10 && descUpper.includes(cust.taxNumber)) {
            matchedCustomer = cust;
            score += 40;
            rules.push('VKN_TAX_NUMBER_MATCH');
            break;
          }
        }
      }

      // 3. Ünvan Benzerliği
      if (!matchedCustomer) {
        for (const cust of customers) {
          const titleWords = cust.title.toUpperCase().split(/\s+/).filter(w => w.length > 3);
          let matchCount = 0;
          for (const word of titleWords) {
            if (descUpper.includes(word)) matchCount++;
          }
          if (matchCount >= 2 || (titleWords.length === 1 && matchCount === 1)) {
            matchedCustomer = cust;
            score += 35;
            rules.push('TITLE_SIMILARITY_MATCH');
            break;
          }
        }
      }

      // 4. Tutar Eşleşmesi
      if (matchedCustomer && !matchedInvoice) {
        const openInvoices = invoices.filter(
          i => i.customerId === matchedCustomer!.id && Math.abs(i.grandTotal - btx.amount) < 0.01
        );
        if (openInvoices.length > 0) {
          matchedInvoice = openInvoices[0];
          score += 25;
          rules.push('EXACT_AMOUNT_MATCH');
        }
      }

      const finalScore = Math.min(100, score);
      const matchStatus = finalScore >= 80 ? 'PROPOSED' : 'PROPOSED';

      const matchRecord: BankTransactionMatch = existing || {
        id: `bm-${btx.id}`,
        tenantId,
        bankTransactionId: btx.id,
        matchedCustomerId: matchedCustomer?.id,
        matchedCustomerTitle: matchedCustomer?.title,
        matchedInvoiceId: matchedInvoice?.id,
        matchedInvoiceNo: matchedInvoice?.invoiceNo,
        matchScore: finalScore,
        matchRules: rules,
        status: matchStatus,
        createdAt: new Date().toISOString(),
      };

      suggestions.push({
        bankTransaction: btx,
        match: matchRecord,
        matchedCustomer,
        matchedInvoice,
      });
    }

    return suggestions;
  }

  /**
   * Banka hareketini cari ve/veya fatura ile mutabık kılar ve kaydeder
   */
  public static async reconcileTransaction(params: {
    tenantId: string;
    bankTransactionId: string;
    customerId: string;
    invoiceId?: string;
    reconciledBy: string;
    notes?: string;
  }): Promise<BankTransactionMatch> {
    const { tenantId, bankTransactionId, customerId, invoiceId, reconciledBy, notes } = params;

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.bankTransactionMatches) draft.bankTransactionMatches = [];
      if (!draft.currentTransactions) draft.currentTransactions = [];

      const btx = (draft.bankTransactions || []).find(b => b.id === bankTransactionId);
      if (!btx) throw new Error('Banka hareketi bulunamadı.');

      const customer = (draft.customers || []).find(c => c.id === customerId);
      if (!customer) throw new Error('Eşleştirilecek cari hesap bulunamadı.');

      const now = new Date().toISOString();

      let match = draft.bankTransactionMatches.find(m => m.bankTransactionId === bankTransactionId);
      if (!match) {
        match = {
          id: `bm-${bankTransactionId}`,
          tenantId,
          bankTransactionId,
          matchedCustomerId: customer.id,
          matchedCustomerTitle: customer.title,
          matchedInvoiceId: invoiceId,
          matchScore: 100,
          matchRules: ['MANUAL_CONFIRMED'],
          status: 'CONFIRMED',
          reconciledAt: now,
          reconciledBy,
          notes,
          createdAt: now,
        };
        draft.bankTransactionMatches.push(match);
      } else {
        match.matchedCustomerId = customer.id;
        match.matchedCustomerTitle = customer.title;
        match.matchedInvoiceId = invoiceId;
        match.status = 'CONFIRMED';
        match.reconciledAt = now;
        match.reconciledBy = reconciledBy;
        match.notes = notes;
      }

      // Cari Hareketini düş (Eğer daha önce işlenmediyse)
      if (btx.type === 'INCOME') {
        const newBalance = (customer.balance || 0) - btx.amount;
        customer.balance = newBalance;
        customer.updatedAt = now;

        const curTx: CurrentTransaction = {
          id: `ctx-bank-rec-${Date.now()}`,
          tenantId,
          companyId: btx.companyId || 'cmp-default',
          customerId: customer.id,
          customerCode: customer.code,
          customerTitle: customer.title,
          date: btx.date,
          documentNo: btx.documentNo || `BNK-${Date.now()}`,
          transactionType: 'TAHSILAT',
          description: `Banka Mutabakatı - ${btx.description} (Hesap: ${btx.bankAccountName})`,
          debt: 0,
          credit: btx.amount,
          balance: newBalance,
          dueDate: btx.date,
          userId: reconciledBy,
          createdAt: now,
        };
        draft.currentTransactions.push(curTx);
      }

      return match;
    });
  }
}
