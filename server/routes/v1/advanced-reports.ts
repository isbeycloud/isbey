import { Router } from 'express';
import { storage } from '../../db/storage';
import { CustomerRiskService } from '../../services/customerRiskService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/reports/advanced/dashboard
 * Yönetici konsolide finansal ve operasyonel dashboard verileri
 */
router.get('/dashboard', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const today = new Date().toISOString().split('T')[0];

  // Satış Faturaları
  const invoices = (db.invoices || []).filter(
    i => (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey')) && i.status !== 'CANCELLED'
  );
  const totalSales = invoices.reduce((sum, i) => sum + (i.grandTotal || 0), 0);
  const todaySales = invoices.filter(i => i.date === today).reduce((sum, i) => sum + (i.grandTotal || 0), 0);

  // Saha ve Online Tahsilatlar
  const collections = (db.fieldCollections || []).filter(
    c => (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')) && c.status === 'CONFIRMED'
  );
  const totalCollections = collections.reduce((sum, c) => sum + c.amount, 0);
  const todayCollections = collections.filter(c => c.collectionDate === today).reduce((sum, c) => sum + c.amount, 0);

  // Cari Borç / Alacak
  const customers = (db.customers || []).filter(
    c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
  );
  const totalReceivables = customers.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0);
  const totalPayables = customers.reduce((sum, c) => sum + Math.abs(Math.min(0, c.balance || 0)), 0);

  // Kasa / Banka Varlıkları
  const totalCash = (db.cashRegisters || [])
    .filter(cr => cr.tenantId === tenantId || (!cr.tenantId && tenantId === 'tnt-isbey'))
    .reduce((sum, cr) => sum + (cr.balance || 0), 0);

  const totalBank = (db.bankAccounts || [])
    .filter(ba => ba.tenantId === tenantId || (!ba.tenantId && tenantId === 'tnt-isbey'))
    .reduce((sum, ba) => sum + (ba.balance || 0), 0);

  return res.json({
    success: true,
    data: {
      todaySales,
      totalSales,
      todayCollections,
      totalCollections,
      totalReceivables,
      totalPayables,
      totalCash,
      totalBank,
      netLiquidAssets: totalCash + totalBank,
      totalActiveCustomers: customers.length,
      activeFieldAgents: (db.customerVisits || []).map(v => v.fieldAgentId).filter((v, i, a) => a.indexOf(v) === i).length,
    },
  });
});

/**
 * GET /api/v1/reports/advanced/field-performance
 * Saha personeli hedef / gerçekleşen tahsilat ve ziyaret karnesi
 */
router.get('/field-performance', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();

  const collections = (db.fieldCollections || []).filter(
    c => (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')) && c.status === 'CONFIRMED'
  );
  const visits = (db.customerVisits || []).filter(
    v => v.tenantId === tenantId || (!v.tenantId && tenantId === 'tnt-isbey')
  );

  // Personel bazlı gruplama
  const agentMap: Record<string, {
    agentId: string;
    agentName: string;
    totalCollections: number;
    collectionCount: number;
    totalVisits: number;
    completedVisits: number;
    targetAmount: number;
    successRate: number;
  }> = {};

  for (const c of collections) {
    if (!agentMap[c.userId]) {
      agentMap[c.userId] = {
        agentId: c.userId,
        agentName: c.userName,
        totalCollections: 0,
        collectionCount: 0,
        totalVisits: 0,
        completedVisits: 0,
        targetAmount: 150000,
        successRate: 0,
      };
    }
    agentMap[c.userId].totalCollections += c.amount;
    agentMap[c.userId].collectionCount += 1;
  }

  for (const v of visits) {
    if (!agentMap[v.fieldAgentId]) {
      agentMap[v.fieldAgentId] = {
        agentId: v.fieldAgentId,
        agentName: v.fieldAgentName,
        totalCollections: 0,
        collectionCount: 0,
        totalVisits: 0,
        completedVisits: 0,
        targetAmount: 150000,
        successRate: 0,
      };
    }
    agentMap[v.fieldAgentId].totalVisits += 1;
    if (v.status === 'COMPLETED') agentMap[v.fieldAgentId].completedVisits += 1;
  }

  const performanceList = Object.values(agentMap).map(agent => {
    agent.successRate = Math.min(100, Math.round((agent.totalCollections / agent.targetAmount) * 100));
    return agent;
  });

  performanceList.sort((a, b) => b.totalCollections - a.totalCollections);

  return res.json({ success: true, count: performanceList.length, performance: performanceList });
});

/**
 * GET /api/v1/reports/advanced/customer-risk
 * Cari Risk Skoru ve Vade Gecikmesi Raporu
 */
router.get('/customer-risk', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const riskScores = CustomerRiskService.calculateRiskScores(tenantId);
  return res.json({ success: true, count: riskScores.length, riskScores });
});

/**
 * GET /api/v1/reports/advanced/cash-bank-flow
 * Kasa & Banka Nakit Akış Dökümü
 */
router.get('/cash-bank-flow', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();

  const cashRegisters = (db.cashRegisters || []).filter(
    cr => cr.tenantId === tenantId || (!cr.tenantId && tenantId === 'tnt-isbey')
  );
  const bankAccounts = (db.bankAccounts || []).filter(
    ba => ba.tenantId === tenantId || (!ba.tenantId && tenantId === 'tnt-isbey')
  );
  const recentCashTxs = (db.cashTransactions || [])
    .filter(t => t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey'))
    .slice(-20);
  const recentBankTxs = (db.bankTransactions || [])
    .filter(t => t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey'))
    .slice(-20);

  return res.json({
    success: true,
    cashRegisters,
    bankAccounts,
    recentCashTxs,
    recentBankTxs,
  });
});

export default router;
