import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/authGuards';
import { UsageService } from '../../services/usageService';
import { UsageMetric } from '../../db/schema';

export const usageRouter = Router();

usageRouter.use(requireAuth);

// GET /api/v1/usage/limits - Tenant kullanım ve kota durumunu getir
usageRouter.get('/limits', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const usages = await UsageService.getUsage(tenantId);

  res.json({
    success: true,
    usages,
  });
});

// GET /api/v1/usage/check/:metric - Belirli bir işlem öncesi kota kontrolü (Pre-flight check)
usageRouter.get('/check/:metric', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const metric = req.params.metric as UsageMetric;
  const count = parseInt(req.query.count as string, 10) || 1;

  const check = await UsageService.checkLimit(tenantId, metric, count);

  res.json({
    success: true,
    check,
  });
});
