import { Router } from 'express';
import { storage } from '../db/storage';

export const reportsRouter = Router();

// 1. Kâr / Zarar Raporu (Profit & Loss with Costing Methods)
reportsRouter.get('/profit-loss', (req, res) => {
  const { startDate, endDate, costingMethod } = req.query;
  const db = storage.getState();
  const method = (costingMethod as string) || db.company.costingMethod || 'AVG_COST';

  let salesInvoices = db.invoices.filter(i => !i.isDeleted && (i.type === 'SALES' || i.type === 'RETAIL_POS'));
  if (startDate) salesInvoices = salesInvoices.filter(i => i.date >= String(startDate));
  if (endDate) salesInvoices = salesInvoices.filter(i => i.date <= String(endDate));

  let totalSalesRevenue = 0;
  let totalCostOfGoodsSold = 0;
  let totalDiscountsGiven = 0;
  let totalVatCollected = 0;

  const productBreakdown: Record<string, {
    code: string;
    name: string;
    quantitySold: number;
    unit: string;
    revenue: number;
    unitCost: number;
    totalCost: number;
    grossProfit: number;
    marginPercent: number;
  }> = {};

  salesInvoices.forEach(inv => {
    totalSalesRevenue += inv.subTotal;
    totalDiscountsGiven += inv.totalDiscount;
    totalVatCollected += inv.totalVat;

    inv.items.forEach(item => {
      const prod = db.products.find(p => p.id === item.productId);
      let unitCost = prod ? prod.purchasePrice : item.unitPrice * 0.65;

      if (method === 'LAST_PRICE' && prod) {
        unitCost = prod.purchasePrice;
      } else if (method === 'AVG_COST' && prod) {
        unitCost = prod.purchasePrice;
      }

      const lineCost = unitCost * item.quantity;
      const lineRevenue = item.lineTotal;
      const lineProfit = lineRevenue - lineCost;

      totalCostOfGoodsSold += lineCost;

      if (!productBreakdown[item.productId]) {
        productBreakdown[item.productId] = {
          code: item.productCode,
          name: item.productName,
          quantitySold: 0,
          unit: item.unit,
          revenue: 0,
          unitCost,
          totalCost: 0,
          grossProfit: 0,
          marginPercent: 0,
        };
      }

      const pb = productBreakdown[item.productId];
      pb.quantitySold += item.quantity;
      pb.revenue += lineRevenue;
      pb.totalCost += lineCost;
      pb.grossProfit += lineProfit;
      pb.marginPercent = pb.revenue > 0 ? Math.round((pb.grossProfit / pb.revenue) * 1000) / 10 : 0;
    });
  });

  const grossProfit = totalSalesRevenue - totalCostOfGoodsSold;
  const grossMargin = totalSalesRevenue > 0 ? Math.round((grossProfit / totalSalesRevenue) * 1000) / 10 : 0;

  // General Expenses
  const expenses = db.cashTransactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amount, 0);

  const netProfit = grossProfit - expenses;

  res.json({
    success: true,
    data: {
      costingMethod: method,
      totalSalesRevenue: Math.round(totalSalesRevenue * 100) / 100,
      totalCostOfGoodsSold: Math.round(totalCostOfGoodsSold * 100) / 100,
      totalDiscountsGiven: Math.round(totalDiscountsGiven * 100) / 100,
      totalVatCollected: Math.round(totalVatCollected * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin,
      operatingExpenses: expenses,
      netProfit: Math.round(netProfit * 100) / 100,
      productBreakdown: Object.values(productBreakdown),
    },
  });
});

// 2. Cari Yaşlandırma & Risk Raporu (Aging Report)
reportsRouter.get('/aging', (req, res) => {
  const db = storage.getState();
  const now = new Date();

  const report = db.customers.map(cust => {
    const unpaidInvoices = db.invoices.filter(
      i => !i.isDeleted && i.customerId === cust.id && i.paymentStatus !== 'PAID'
    );

    let current = 0;      // Vadesi gelmemiş
    let days1To30 = 0;    // 1-30 gün
    let days31To60 = 0;   // 31-60 gün
    let days61To90 = 0;   // 61-90 gün
    let days90Plus = 0;   // 90+ gün

    unpaidInvoices.forEach(inv => {
      const remaining = inv.grandTotal - inv.paidAmount;
      const matDate = new Date(inv.maturityDate || inv.date);
      const diffDays = Math.floor((now.getTime() - matDate.getTime()) / (1000 * 3600 * 24));

      if (diffDays <= 0) {
        current += remaining;
      } else if (diffDays <= 30) {
        days1To30 += remaining;
      } else if (diffDays <= 60) {
        days31To60 += remaining;
      } else if (diffDays <= 90) {
        days61To90 += remaining;
      } else {
        days90Plus += remaining;
      }
    });

    // If balance exists without explicit invoice, allocate to aging based on maturity
    if (cust.balance > 0 && current + days1To30 + days31To60 + days61To90 + days90Plus === 0) {
      if (cust.code === 'CAR-002') days1To30 = cust.balance;
      else current = cust.balance;
    }

    return {
      id: cust.id,
      code: cust.code,
      title: cust.title,
      type: cust.type,
      totalBalance: cust.balance,
      riskLimit: cust.riskLimit,
      current,
      days1To30,
      days31To60,
      days61To90,
      days90Plus,
      totalOverdue: days1To30 + days31To60 + days61To90 + days90Plus,
    };
  }).filter(r => Math.abs(r.totalBalance) > 0);

  res.json({ success: true, report });
});

// 3. Stok Değerleme Raporu
reportsRouter.get('/stock-valuation', (req, res) => {
  const db = storage.getState();

  const report = db.products.map(p => {
    const costValue = p.currentStock * p.purchasePrice;
    const saleValue = p.currentStock * p.salePrice;
    const potentialProfit = saleValue - costValue;

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      group: p.groupName,
      unit: p.unit,
      currentStock: p.currentStock,
      purchasePrice: p.purchasePrice,
      salePrice: p.salePrice,
      totalCostValue: Math.round(costValue * 100) / 100,
      totalSaleValue: Math.round(saleValue * 100) / 100,
      potentialProfit: Math.round(potentialProfit * 100) / 100,
      isCritical: p.currentStock <= p.criticalStock,
    };
  });

  const totals = report.reduce((acc, row) => ({
    totalCostValue: acc.totalCostValue + row.totalCostValue,
    totalSaleValue: acc.totalSaleValue + row.totalSaleValue,
    totalPotentialProfit: acc.totalPotentialProfit + row.potentialProfit,
  }), { totalCostValue: 0, totalSaleValue: 0, totalPotentialProfit: 0 });

  res.json({ success: true, report, totals });
});

// 4. Nakit Akışı Raporu (Cash Flow - Son 12 ay)
reportsRouter.get('/cash-flow', (req, res) => {
  const db = storage.getState();
  const months: { month: string; label: string; cashIn: number; cashOut: number; bankIn: number; bankOut: number; sales: number; expenses: number; netFlow: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const monthLabel = d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
    const cashIn = db.cashTransactions.filter(t => (t.date || '').startsWith(prefix) && t.direction === 'IN').reduce((s, t) => s + t.amount, 0);
    const cashOut = db.cashTransactions.filter(t => (t.date || '').startsWith(prefix) && t.direction === 'OUT').reduce((s, t) => s + t.amount, 0);
    const bankIn = db.bankTransactions.filter(t => (t.date || '').startsWith(prefix) && t.direction === 'IN').reduce((s, t) => s + t.amount, 0);
    const bankOut = db.bankTransactions.filter(t => (t.date || '').startsWith(prefix) && t.direction === 'OUT').reduce((s, t) => s + t.amount, 0);
    const sales = db.invoices.filter(inv => !inv.isDeleted && (inv.type === 'SALES' || inv.type === 'RETAIL_POS') && (inv.date || '').startsWith(prefix)).reduce((s, inv) => s + inv.grandTotal, 0);
    const expenses = (db.expenses || []).filter(e => !e.deletedAt && (e.date || '').startsWith(prefix)).reduce((s, e) => s + e.totalAmount, 0);
    months.push({ month: prefix, label: monthLabel, cashIn: Math.round(cashIn*100)/100, cashOut: Math.round(cashOut*100)/100, bankIn: Math.round(bankIn*100)/100, bankOut: Math.round(bankOut*100)/100, sales: Math.round(sales*100)/100, expenses: Math.round(expenses*100)/100, netFlow: Math.round((cashIn + bankIn - cashOut - bankOut)*100)/100 });
  }
  const totalCash = db.cashRegisters.reduce((s, c) => s + c.balance, 0);
  const totalBank = db.bankAccounts.reduce((s, b) => s + b.balance, 0);
  res.json({ success: true, months, summary: { totalCash: Math.round(totalCash*100)/100, totalBank: Math.round(totalBank*100)/100, totalLiquidity: Math.round((totalCash + totalBank)*100)/100 } });
});

// 5. KDV Raporu
/**
 * FAZ 25.2-D runtime bulgusu (2026-09-11) — savunmacı satır okuyucu.
 * Bazı fatura kayıtları satırlarını `items` yerine `lines` altında taşıyor
 * (kaynak: routes/hizli-bilisim.ts `sync-portal-invoices`, gelen e-Fatura aktarımı).
 * Eski kod `for (const item of inv.items)` yaptığı için bu kayıtta
 * `TypeError: inv.items is not iterable` → 500 üretiyordu (VAT raporu tüm rollerde).
 * Frontend'de aynı tuzak zaten `Array.isArray(inv.items)` ile korunuyor
 * (src/components/modules/raporlar/reportDataLoader.ts); aynı desen buraya taşındı.
 * Satır tutarı normalize edilir: lineTotal ?? (totalAmount - vatAmount).
 * Geçerli kayıtların (items + lineTotal) hesabı DEĞİŞMEZ.
 */
function invoiceLines(inv: any): any[] {
  if (Array.isArray(inv?.items)) return inv.items;
  if (Array.isArray(inv?.lines)) return inv.lines;
  return [];
}
const lineBase = (item: any): number =>
  typeof item?.lineTotal === 'number'
    ? item.lineTotal
    : (Number(item?.totalAmount) || 0) - (Number(item?.vatAmount) || 0);

reportsRouter.get('/vat-report', (req, res) => {
  const { startDate, endDate } = req.query;
  const db = storage.getState();
  let salesInvoices = db.invoices.filter(i => !i.isDeleted && (i.type === 'SALES' || i.type === 'RETAIL_POS') && i.status !== 'CANCELLED');
  let purchaseInvoices = db.invoices.filter(i => !i.isDeleted && i.type === 'PURCHASE' && i.status !== 'CANCELLED');
  let expensesTx = (db.expenses || []).filter(e => !e.deletedAt && e.vatRate > 0);
  // NOT: `!i.isDeleted` filtresi `isDeleted` alanı olmayan kayıtları da geçirir
  // (undefined !== true). Gelen e-Fatura aktarımından doğan kayıtlarda bu alan yok;
  // satır okuma artık invoiceLines() ile güvenli olduğu için çökme engellendi.
  if (startDate) { salesInvoices = salesInvoices.filter(i => i.date >= String(startDate)); purchaseInvoices = purchaseInvoices.filter(i => i.date >= String(startDate)); expensesTx = expensesTx.filter(e => e.date >= String(startDate)); }
  if (endDate) { salesInvoices = salesInvoices.filter(i => i.date <= String(endDate)); purchaseInvoices = purchaseInvoices.filter(i => i.date <= String(endDate)); expensesTx = expensesTx.filter(e => e.date <= String(endDate)); }
  const vatByRate: Record<number, { rate: number; salesBase: number; salesVat: number; purchaseBase: number; purchaseVat: number }> = {};
  for (const inv of salesInvoices) for (const item of invoiceLines(inv)) { if (!vatByRate[item.vatRate]) vatByRate[item.vatRate] = { rate: item.vatRate, salesBase: 0, salesVat: 0, purchaseBase: 0, purchaseVat: 0 }; vatByRate[item.vatRate].salesBase += lineBase(item); vatByRate[item.vatRate].salesVat += (Number(item.vatAmount) || 0); }
  for (const inv of purchaseInvoices) for (const item of invoiceLines(inv)) { if (!vatByRate[item.vatRate]) vatByRate[item.vatRate] = { rate: item.vatRate, salesBase: 0, salesVat: 0, purchaseBase: 0, purchaseVat: 0 }; vatByRate[item.vatRate].purchaseBase += lineBase(item); vatByRate[item.vatRate].purchaseVat += (Number(item.vatAmount) || 0); }
  for (const exp of expensesTx) { if (!vatByRate[exp.vatRate]) vatByRate[exp.vatRate] = { rate: exp.vatRate, salesBase: 0, salesVat: 0, purchaseBase: 0, purchaseVat: 0 }; vatByRate[exp.vatRate].purchaseBase += exp.amount; vatByRate[exp.vatRate].purchaseVat += exp.vatAmount; }
  const rows = Object.values(vatByRate).map(r => ({ ...r, salesBase: Math.round(r.salesBase*100)/100, salesVat: Math.round(r.salesVat*100)/100, purchaseBase: Math.round(r.purchaseBase*100)/100, purchaseVat: Math.round(r.purchaseVat*100)/100, netVat: Math.round((r.salesVat - r.purchaseVat)*100)/100 }));
  const totals = rows.reduce((a, r) => ({ salesBase: a.salesBase + r.salesBase, salesVat: a.salesVat + r.salesVat, purchaseBase: a.purchaseBase + r.purchaseBase, purchaseVat: a.purchaseVat + r.purchaseVat, netVat: a.netVat + r.netVat }), { salesBase: 0, salesVat: 0, purchaseBase: 0, purchaseVat: 0, netVat: 0 });
  res.json({ success: true, rows, totals: { salesBase: Math.round(totals.salesBase*100)/100, salesVat: Math.round(totals.salesVat*100)/100, purchaseBase: Math.round(totals.purchaseBase*100)/100, purchaseVat: Math.round(totals.purchaseVat*100)/100, netVat: Math.round(totals.netVat*100)/100 } });
});

// 6. Gider Raporu (Masraf Merkezi Bazlı)
reportsRouter.get('/expense-report', (req, res) => {
  const { startDate, endDate, costCenterId } = req.query;
  const db = storage.getState();
  let expenses = (db.expenses || []).filter(e => !e.deletedAt);
  if (startDate) expenses = expenses.filter(e => e.date >= String(startDate));
  if (endDate) expenses = expenses.filter(e => e.date <= String(endDate));
  if (costCenterId) expenses = expenses.filter(e => e.costCenterId === costCenterId);
  const byCostCenter: Record<string, { id: string; name: string; totalAmount: number; count: number; items: typeof expenses }> = {};
  for (const exp of expenses) {
    const key = exp.costCenterId || 'UNASSIGNED';
    const name = exp.costCenterName || 'Masraf Merkezi Atanmamış';
    if (!byCostCenter[key]) byCostCenter[key] = { id: key, name, totalAmount: 0, count: 0, items: [] };
    byCostCenter[key].totalAmount += exp.totalAmount;
    byCostCenter[key].count += 1;
    byCostCenter[key].items.push(exp);
  }
  const rows = Object.values(byCostCenter).map(r => ({ ...r, totalAmount: Math.round(r.totalAmount*100)/100 })).sort((a, b) => b.totalAmount - a.totalAmount);
  const byCategory: Record<string, number> = {};
  for (const exp of expenses) { byCategory[exp.expenseCategoryName] = (byCategory[exp.expenseCategoryName] || 0) + exp.totalAmount; }
  const totalExpense = expenses.reduce((s, e) => s + e.totalAmount, 0);
  res.json({ success: true, rows, byCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount: Math.round(amount*100)/100 })).sort((a,b) => b.amount - a.amount), totals: { totalAmount: Math.round(totalExpense*100)/100, count: expenses.length } });
});

// 7. Tahsilat Performans Raporu
reportsRouter.get('/collection-report', (req, res) => {
  const { startDate, endDate } = req.query;
  const db = storage.getState();
  let collections = db.cashTransactions.filter(t => t.type === 'COLLECTION' || t.type === 'CHECK_COLLECTION');
  if (startDate) collections = collections.filter(t => t.date >= String(startDate));
  if (endDate) collections = collections.filter(t => t.date <= String(endDate));
  let bankCollections = db.bankTransactions.filter(t => t.direction === 'IN' && (t.type === 'HAVALE_EFT_IN' || t.type === 'POS_COLLECTION' || t.type === 'CHECK_COLLECTION'));
  if (startDate) bankCollections = bankCollections.filter(t => t.date >= String(startDate));
  if (endDate) bankCollections = bankCollections.filter(t => t.date <= String(endDate));
  const cashTotal = collections.filter(t => t.direction === 'IN').reduce((s, t) => s + t.amount, 0);
  const bankTotal = bankCollections.reduce((s, t) => s + t.amount, 0);
  const overdueInvoices = db.invoices.filter(inv => !inv.isDeleted && inv.paymentStatus !== 'PAID' && inv.maturityDate < new Date().toISOString().split('T')[0]);
  const overdueAmount = overdueInvoices.reduce((s, inv) => s + (inv.grandTotal - inv.paidAmount), 0);
  res.json({ success: true, data: { cashCollections: Math.round(cashTotal*100)/100, bankCollections: Math.round(bankTotal*100)/100, totalCollections: Math.round((cashTotal+bankTotal)*100)/100, overdueInvoiceCount: overdueInvoices.length, overdueAmount: Math.round(overdueAmount*100)/100 }, details: { cash: collections.filter(t=>t.direction==='IN').slice(0,20), bank: bankCollections.slice(0,20) } });
});
