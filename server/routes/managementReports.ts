import { Router } from 'express';
import { requireAuth, resolveTenant, requirePermission, PERMISSIONS } from '../middleware/authGuards';
import { rateLimit } from '../middleware/productionSecurity';
import { buildManagementReports, parseManagementReportFilters, readManagementSnapshot, ManagementReportError } from '../services/managementReports';
export const managementReportsRouter = Router();
managementReportsRouter.get('/management', requireAuth, resolveTenant, requirePermission(PERMISSIONS.REPORTS_VIEW), rateLimit({
    name: 'management-reports', windowMs: 60000, max: 120
}), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const filters = parseManagementReportFilters(req.query);
        const snapshot = await readManagementSnapshot();
        res.json(buildManagementReports(snapshot, req.tenantId!, filters, { actorId: req.user.id }));
    }
    catch (error) {
        res.status(error instanceof ManagementReportError ? error.status : 503).json({ success: false, message: error instanceof ManagementReportError ? error.message : 'Yönetim raporu oluşturulamadı. Lütfen tekrar deneyin.' });
    }
});
