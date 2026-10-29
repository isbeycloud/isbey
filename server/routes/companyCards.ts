import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, resolveTenant, requireRole, requirePermission } from '../middleware/authGuards';
import { CompanyCardsStore, CompanyCardError } from '../services/companyCards';
import { rateLimit } from '../middleware/productionSecurity';
export const companyCardsRouter = Router();
const store = new CompanyCardsStore();
companyCardsRouter.use(requireAuth, resolveTenant, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), requirePermission('bank.view'), rateLimit({ name: 'company-cards', windowMs: 60000, max: 120 }), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
const fail = (error: unknown, res: Response) => res.status(error instanceof CompanyCardError ? error.status : 503).json({ success: false, message: error instanceof CompanyCardError ? error.message : 'Kart kaydı tamamlanamadı. Lütfen tekrar deneyin.' });
companyCardsRouter.get('/', requirePermission('bank.view'), (req, res) => {
    try {
        res.json({ success: true, ...store.list(req.tenantId!) });
    }
    catch (e) {
        fail(e, res);
    }
});
companyCardsRouter.post('/', requirePermission('bank.create'), async (req, res) => {
    try {
        res.status(201).json({ success: true, card: await store.create(req.tenantId!, req.body, req.user.id) });
    }
    catch (e) {
        fail(e, res);
    }
});
companyCardsRouter.put('/:id', requirePermission('bank.create'), async (req, res) => {
    try {
        res.json({ success: true, card: await store.update(req.tenantId!, String(req.params.id), req.body, req.user.id) });
    }
    catch (e) {
        fail(e, res);
    }
});
companyCardsRouter.post('/:id/entries', requirePermission('bank.create'), async (req, res) => {
    try {
        res.status(201).json({ success: true, entry: await store.addEntry(req.tenantId!, String(req.params.id), req.body, req.user.id) });
    }
    catch (e) {
        fail(e, res);
    }
});
companyCardsRouter.post('/:id/entries/:entryId/void', requirePermission('bank.create'), async (req, res) => {
    try {
        res.json({ success: true, entry: await store.voidEntry(req.tenantId!, String(req.params.id), String(req.params.entryId), req.body, req.user.id) });
    }
    catch (e) {
        fail(e, res);
    }
});
