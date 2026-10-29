import { Router } from 'express';
import { requireAuth, resolveTenant, requirePermission, PERMISSIONS } from '../middleware/authGuards';
import { rateLimit } from '../middleware/productionSecurity';
import { ManagementReportError, readManagementSnapshot } from '../services/managementReports';
import { buildExpenseReports, parseExpenseReportFilters } from '../services/expenseReports';
export const expenseReportsRouter = Router();
expenseReportsRouter.get('/expense-transactions', requireAuth, resolveTenant, requirePermission(PERMISSIONS.REPORTS_VIEW), requirePermission(PERMISSIONS.EXPENSES_VIEW), rateLimit({
    name: 'expense-reports', windowMs: 60000, max: 120
}), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (Array.isArray(req.user.allowedMenuIds) && !req.user.allowedMenuIds.includes('gider'))
        return res.status(403).json({ success: false, message: 'Giderler menüsüne erişim yetkiniz yok.' });
    if (Array.isArray(req.user.serviceMenuIds) && !req.user.serviceMenuIds.includes('gider'))
        return res.status(403).json({ success: false, message: 'Giderler hizmeti seçili paketinizde bulunmuyor.' });
    try {
        const filters = parseExpenseReportFilters(req.query), snapshot = await readManagementSnapshot();
        res.json(buildExpenseReports(snapshot, req.tenantId!, filters, { actorId: req.user.id }));
    }
    catch (error) {
        res.status(error instanceof ManagementReportError ? error.status : 503).json({ success: false, message: error instanceof ManagementReportError ? error.message : 'Gider hareket raporu oluşturulamadı. Lütfen tekrar deneyin.' });
    }
});
