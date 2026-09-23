import { storage } from '../../db/storage';
import { Customer, Invoice, CurrentTransaction, Product, CashRegister, BankAccount } from '../../db/schema';
import { CustomerRiskService } from '../customerRiskService';

export class AIDataService {
  /**
   * PII (Kişisel Veri) Maskeleme
   */
  public static maskTaxNumber(taxNo?: string): string {
    if (!taxNo || taxNo.length < 5) return '***';
    return `${taxNo.slice(0, 3)}*****${taxNo.slice(-2)}`;
  }

  public static maskIban(iban?: string): string {
    if (!iban || iban.length < 10) return 'TR** **** ****';
    return `${iban.slice(0, 4)} **** **** ${iban.slice(-4)}`;
  }

  public static maskPhone(phone?: string): string {
    if (!phone || phone.length < 7) return '05** *** **';
    return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
  }

  /**
   * Tenant bazlı finansal özet ve kpi bağlamı
   */
  public static getTenantFinancialSummary(tenantId: string) {
    const db = storage.getState();
    const today = new Date().toISOString().split('T')[0];

    const invoices = (db.invoices || []).filter(
      i => (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey')) && i.status !== 'CANCELLED'
    );
    const totalSales = invoices.reduce((sum, i) => sum + (i.grandTotal || 0), 0);
    const todaySales = invoices.filter(i => i.date === today).reduce((sum, i) => sum + (i.grandTotal || 0), 0);

    const collections = (db.fieldCollections || []).filter(
      c => (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')) && c.status === 'CONFIRMED'
    );
    const totalCollections = collections.reduce((sum, c) => sum + c.amount, 0);

    const customers = (db.customers || []).filter(
      c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
    );
    const totalReceivables = customers.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0);
    const totalPayables = customers.reduce((sum, c) => sum + Math.abs(Math.min(0, c.balance || 0)), 0);

    const totalCash = (db.cashRegisters || [])
      .filter(cr => cr.tenantId === tenantId || (!cr.tenantId && tenantId === 'tnt-isbey'))
      .reduce((sum, cr) => sum + (cr.balance || 0), 0);

    const totalBank = (db.bankAccounts || [])
      .filter(ba => ba.tenantId === tenantId || (!ba.tenantId && tenantId === 'tnt-isbey'))
      .reduce((sum, ba) => sum + (ba.balance || 0), 0);

    return {
      todaySales,
      totalSales,
      totalCollections,
      totalReceivables,
      totalPayables,
      totalCash,
      totalBank,
      netLiquidAssets: totalCash + totalBank,
      predictedDeficit30Days: totalPayables > (totalCash + totalBank + totalCollections * 0.5) ? Math.round(totalPayables - (totalCash + totalBank)) : 0,
      activeCustomerCount: customers.length,
    };
  }

  /**
   * En çok ciro yapılan müşteriler (Whitelist veri)
   */
  public static getTopCustomers(tenantId: string) {
    const db = storage.getState();
    const invoices = (db.invoices || []).filter(
      i => (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey')) && i.status !== 'CANCELLED'
    );

    const map: Record<string, { customerId: string; customerTitle: string; totalSales: number; invoiceCount: number }> = {};
    for (const inv of invoices) {
      if (!map[inv.customerId]) {
        map[inv.customerId] = {
          customerId: inv.customerId,
          customerTitle: inv.customerTitle || 'Müşteri',
          totalSales: 0,
          invoiceCount: 0,
        };
      }
      map[inv.customerId].totalSales += inv.grandTotal || 0;
      map[inv.customerId].invoiceCount += 1;
    }

    return Object.values(map).sort((a, b) => b.totalSales - a.totalSales);
  }

  /**
   * Vadesi geçmiş müşteriler ve risk detayları (Maskelenmiş)
   */
  public static getOverdueCustomers(tenantId: string) {
    const riskScores = CustomerRiskService.calculateRiskScores(tenantId);
    return riskScores
      .filter(r => r.overdueDebt > 0 || r.riskScore < 70)
      .map(r => ({
        customerId: r.customerId,
        customerTitle: r.customerTitle,
        riskScore: r.riskScore,
        riskLevel: r.riskLevel,
        overdueDebt: r.overdueDebt,
        maxOverdueDays: r.maxOverdueDays,
        suggestedAction: r.suggestedAction,
      }));
  }

  /**
   * Kritik stok seviyesindeki ürünler
   */
  public static getCriticalStockProducts(tenantId: string) {
    const db = storage.getState();
    return (db.products || [])
      .filter(p => (p.tenantId === tenantId || (!p.tenantId && tenantId === 'tnt-isbey')) && (p.currentStock || 0) <= (p.criticalStock || 10))
      .map(p => ({
        productId: p.id,
        code: p.code,
        name: p.name,
        currentStock: p.currentStock || 0,
        criticalStock: p.criticalStock || 10,
        suggestedReorderQuantity: Math.max(20, (p.criticalStock || 10) * 3 - (p.currentStock || 0)),
        unit: p.unit || 'ADET',
      }));
  }
}
