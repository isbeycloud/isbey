import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';

export const servicesRouter = Router();

// GET /api/admin/services - List all catalog services
servicesRouter.get('/', requireAuth, (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const services = (db.services || []).sort((a, b) => a.sortOrder - b.sortOrder);
    res.json({ success: true, services });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/plans - List all plans / packages
servicesRouter.get('/plans', requireAuth, (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const plans = db.plans || [];
    res.json({ success: true, plans });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/plans - Create/Update Plan (Super Admin)
servicesRouter.post('/plans', requireAuth, requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id, code, name, description, monthlyPrice, annualPrice, maxUsers, maxBranches, maxWarehouses, maxInvoicesPerMonth, storageLimitMb, includedServices } = req.body;

    const result = await storage.runTransaction(async draft => {
      if (!draft.plans) draft.plans = [];

      let plan = draft.plans.find(p => p.id === id || p.code === code);
      if (plan) {
        if (name) plan.name = name;
        if (description) plan.description = description;
        if (monthlyPrice !== undefined) plan.monthlyPrice = Number(monthlyPrice);
        if (annualPrice !== undefined) plan.annualPrice = Number(annualPrice);
        if (maxUsers !== undefined) plan.maxUsers = Number(maxUsers);
        if (maxBranches !== undefined) plan.maxBranches = Number(maxBranches);
        if (maxWarehouses !== undefined) plan.maxWarehouses = Number(maxWarehouses);
        if (maxInvoicesPerMonth !== undefined) plan.maxInvoicesPerMonth = Number(maxInvoicesPerMonth);
        if (storageLimitMb !== undefined) plan.storageLimitMb = Number(storageLimitMb);
        if (includedServices) plan.includedServices = includedServices;
      } else {
        plan = {
          id: id || `plan-${Date.now()}`,
          code,
          name,
          description: description || '',
          monthlyPrice: Number(monthlyPrice) || 0,
          annualPrice: Number(annualPrice) || 0,
          maxUsers: Number(maxUsers) || 5,
          maxBranches: Number(maxBranches) || 2,
          maxWarehouses: Number(maxWarehouses) || 2,
          maxInvoicesPerMonth: Number(maxInvoicesPerMonth) || 1000,
          storageLimitMb: Number(storageLimitMb) || 2048,
          includedServices: includedServices || ['PRE_ACCOUNTING', 'CARI', 'STOK', 'FATURA'],
        };
        draft.plans.push(plan);
      }

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        action: 'SETTINGS_CHANGE',
        module: 'PAKETLER',
        ipAddress: req.ip || '127.0.0.1',
        details: `Paket şablonu güncellendi: ${plan.name} (${plan.code})`,
      });

      return plan;
    });

    res.json({ success: true, message: 'Paket şablonu başarıyla kaydedildi.', plan: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
