import { storage } from '../../db/storage';
import { AccountantClient, DocumentRequest, DatabaseState, DocumentTypeEnum } from '../../db/schema';
import { AnomalyService } from './anomalyService';

export class AccountantService {
  /**
   * Mali Müşavirin portföyündeki firmaları ve eksik evrak / mutabakat durumunu listeler
   */
  public static getClients(accountantUserId: string): AccountantClient[] {
    const db = storage.getState();
    const all = db.accountantClients || [];
    return all.filter(c => c.accountantUserId === accountantUserId);
  }

  /**
   * Mali müşavirin belirli bir tenanta erişim yetkisi olup olmadığını doğrular
   */
  public static isAccountantAuthorizedForTenant(accountantUserId: string, tenantId: string): boolean {
    const db = storage.getState();
    const user = (db.users || []).find(u => u.id === accountantUserId);
    if (user && user.role === 'SUPER_ADMIN') return true;
    if (user && user.allowedCompanyIds && user.allowedCompanyIds.includes(tenantId)) return true;
    const clients = (db.accountantClients || []).filter(c => c.accountantUserId === accountantUserId);
    return clients.some(c => c.tenantId === tenantId);
  }

  /**
   * Firmadan eksik evrak talebi oluşturur (Banka ekstresi, fatura vb.)
   */
  public static async createDocumentRequest(params: {
    tenantId: string;
    accountantUserId: string;
    accountantName: string;
    companyName: string;
    documentType: DocumentTypeEnum;
    period: string;
    description: string;
    dueDate: string;
  }): Promise<DocumentRequest> {
    const { tenantId, accountantUserId, accountantName, companyName, documentType, period, description, dueDate } = params;
    const now = new Date().toISOString();

    const newRequest: DocumentRequest = {
      id: `doc-req-${Date.now()}`,
      tenantId,
      accountantUserId,
      accountantName,
      companyName,
      documentType,
      period,
      description,
      status: 'PENDING',
      dueDate,
      createdAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.documentRequests) draft.documentRequests = [];
      draft.documentRequests.unshift(newRequest);
      return newRequest;
    });
  }

  /**
   * Firmanın aylık muhasebe kontrol raporunu üretir
   */
  public static generateMonthlyClosingReport(tenantId: string, period: string) {
    const db = storage.getState();
    const invoices = (db.invoices || []).filter(
      i => (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey')) && i.status !== 'CANCELLED'
    );
    const expenses = (db.expenses || []).filter(
      e => e.tenantId === tenantId || (!e.tenantId && tenantId === 'tnt-isbey')
    );
    const bankMatches = (db.bankTransactionMatches || []).filter(
      m => m.tenantId === tenantId && m.status === 'PROPOSED'
    );
    const issues = AnomalyService.detectAnomalies(tenantId);

    const totalSalesAmount = invoices.filter(i => i.type === 'SALES').reduce((sum, i) => sum + (i.grandTotal || 0), 0);
    const totalSalesVat = invoices.filter(i => i.type === 'SALES').reduce((sum, i) => sum + (i.vatTotal || 0), 0);
    const totalExpenseAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    return {
      period,
      companyName: 'İŞBEY Teknoloji A.Ş.',
      generatedAt: new Date().toISOString(),
      stats: {
        totalSalesInvoices: invoices.filter(i => i.type === 'SALES').length,
        totalSalesAmount,
        totalSalesVat,
        totalExpenseCount: expenses.length,
        totalExpenseAmount,
        unmatchedBankTransactions: bankMatches.length,
        auditIssuesCount: issues.length,
      },
      auditIssues: issues,
      summaryText: `Dönem içinde ${invoices.length} fatura ve ${expenses.length} gider işlendi. Toplam KDV matrahı ${totalSalesAmount.toLocaleString('tr-TR')} TL olup, ${bankMatches.length} adet banka mutabakatı ve ${issues.length} adet denetim uyarısı beklemektedir.`,
    };
  }
}
