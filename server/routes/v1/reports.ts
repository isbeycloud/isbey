import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';

export const v1ReportsRouter = Router();

v1ReportsRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/reports/customer-aging
 * Cari Borç Yaşlandırma Raporu (0-30, 31-60, 61-90, 90+ gün)
 */
v1ReportsRouter.get('/customer-aging', requirePermission(PERMISSIONS.REPORTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const now = new Date();

  const customers = (db.customers || []).filter(
    c => (!c.tenantId || c.tenantId === tenantId) && !c.deletedAt && (c.balance || 0) > 0
  );

  const report = customers.map(c => {
    const txs = (db.accountTransactions || []).filter(
      t => t.customerId === c.id && t.tenantId === tenantId && t.debit > 0 && !t.isCancelled
    );

    let b0_30 = 0;
    let b31_60 = 0;
    let b61_90 = 0;
    let b90_plus = 0;

    txs.forEach(t => {
      const diffDays = Math.floor((now.getTime() - new Date(t.date).getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) b0_30 += t.debit;
      else if (diffDays <= 60) b31_60 += t.debit;
      else if (diffDays <= 90) b61_90 += t.debit;
      else b90_plus += t.debit;
    });

    return {
      customerId: c.id,
      customerCode: c.code,
      customerTitle: c.title,
      phone: c.phone,
      totalBalance: c.balance,
      days0_30: b0_30 || (c.balance > 0 ? c.balance : 0),
      days31_60: b31_60,
      days61_90: b61_90,
      days90Plus: b90_plus,
    };
  });

  const totals = {
    totalDebtors: report.length,
    totalReceivables: report.reduce((s, r) => s + r.totalBalance, 0),
    total0_30: report.reduce((s, r) => s + r.days0_30, 0),
    total31_60: report.reduce((s, r) => s + r.days31_60, 0),
    total61_90: report.reduce((s, r) => s + r.days61_90, 0),
    total90Plus: report.reduce((s, r) => s + r.days90Plus, 0),
  };

  res.json({ success: true, data: report, totals });
});

/**
 * GET /api/v1/reports/stock-valuation
 * Stok Değerleme & Envanter Raporu
 */
v1ReportsRouter.get('/stock-valuation', requirePermission(PERMISSIONS.REPORTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();

  const products = (db.products || []).filter(
    p => (!p.tenantId || p.tenantId === tenantId) && !p.deletedAt
  );

  const report = products.map(p => {
    const cost = (p.currentStock || 0) * (p.purchasePrice || 0);
    const potentialSales = (p.currentStock || 0) * (p.salePrice || 0);
    const potentialProfit = potentialSales - cost;
    return {
      productId: p.id,
      code: p.code,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock || 0,
      purchasePrice: p.purchasePrice || 0,
      salePrice: p.salePrice || 0,
      totalCost: cost,
      potentialSales,
      potentialProfit,
    };
  });

  const totals = {
    totalItems: products.length,
    totalStockCount: products.reduce((s, p) => s + (p.currentStock || 0), 0),
    totalCostValue: report.reduce((s, r) => s + r.totalCost, 0),
    totalPotentialSalesValue: report.reduce((s, r) => s + r.potentialSales, 0),
    totalPotentialProfit: report.reduce((s, r) => s + r.potentialProfit, 0),
  };

  res.json({ success: true, data: report, totals });
});

/**
 * GET /api/v1/reports/cash-flow
 * Konsolide Kasa & Banka Nakit Akış Raporu
 */
v1ReportsRouter.get('/cash-flow', requirePermission(PERMISSIONS.REPORTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();

  const cashRegisters = (db.cashRegisters || []).filter(
    k => (!k.tenantId || k.tenantId === tenantId) && k.active !== false
  );
  const bankAccounts = (db.bankAccounts || []).filter(
    b => (!b.tenantId || b.tenantId === tenantId) && b.active !== false
  );

  const totalCash = cashRegisters.reduce((s, k) => s + (k.balance || 0), 0);
  const totalBank = bankAccounts.reduce((s, b) => s + (b.balance || 0), 0);

  const recentCashTxs = (db.cashTransactions || [])
    .filter(t => (!t.tenantId || t.tenantId === tenantId) && !t.isCancelled)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);

  const recentBankTxs = (db.bankTransactions || [])
    .filter(t => (!t.tenantId || t.tenantId === tenantId) && !t.isCancelled)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);

  res.json({
    success: true,
    data: {
      cashRegisters,
      bankAccounts,
      totalCash,
      totalBank,
      totalLiquidFunds: totalCash + totalBank,
      recentCashTransactions: recentCashTxs,
      recentBankTransactions: recentBankTxs,
    },
  });
});
