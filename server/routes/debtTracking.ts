import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, resolveTenant, requireRole, requirePermission } from '../middleware/authGuards';
import { rateLimit } from '../middleware/productionSecurity';
import { DebtTrackingStore, DebtTrackingError } from '../services/debtTracking';
export const debtTrackingRouter = Router();
const store = new DebtTrackingStore();
debtTrackingRouter.use(requireAuth, resolveTenant, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), requirePermission('customers.view'), rateLimit({ name: 'debt-tracking', windowMs: 60000, max: 120 }), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
const fail = (error: unknown, res: Response) => res.status(error instanceof DebtTrackingError ? error.status : 503).json({ success: false, message: error instanceof DebtTrackingError ? error.message : 'Takip kaydı tamamlanamadı. Lütfen tekrar deneyin.' });
debtTrackingRouter.get('/', (req, res) => {
    try {
        res.json(store.list(req.tenantId!));
    }
    catch (e) {
        fail(e, res);
    }
});
debtTrackingRouter.get('/summary', (req, res) => {
    try {
        const { today, counts } = store.list(req.tenantId!);
        res.json({ success: true, today, counts });
    }
    catch (e) {
        fail(e, res);
    }
});
debtTrackingRouter.put('/:customerId', requirePermission('customers.update'), async (req, res) => {
    try {
        res.json({ success: true, ...await store.save(req.tenantId!, String(req.params.customerId), req.body, req.user.id) });
    }
    catch (e) {
        fail(e, res);
    }
});
