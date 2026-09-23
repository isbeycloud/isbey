import { Router } from 'express';
import { storage } from '../../db/storage';
import { AIDataService } from '../../services/ai/aiDataService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/client/dashboard
 * Firma Sahibi / Müşteri Portalı Dashboard Özeti
 */
router.get('/dashboard', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const financial = AIDataService.getTenantFinancialSummary(tenantId);
  const db = storage.getState();

  const missingDocs = (db.documentRequests || []).filter(
    r => (r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')) && r.status === 'PENDING'
  );
  const pendingApprovals = (db.approvalRequests || []).filter(
    a => (a.tenantId === tenantId || (!a.tenantId && tenantId === 'tnt-isbey')) && a.status === 'PENDING'
  );
  const activeTasks = (db.workspaceTasks || []).filter(
    t => (t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey')) && t.status !== 'COMPLETED'
  );

  return res.json({
    success: true,
    data: {
      todaySales: financial.todaySales,
      totalSales: financial.totalSales,
      totalReceivables: financial.totalReceivables,
      totalPayables: financial.totalPayables,
      totalCash: financial.totalCash,
      totalBank: financial.totalBank,
      totalLiquid: financial.netLiquidAssets,
      missingDocumentsCount: missingDocs.length,
      pendingApprovalsCount: pendingApprovals.length,
      activeTasksCount: activeTasks.length,
    },
  });
});

export default router;
