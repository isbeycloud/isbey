import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';

export const plansRouter = Router();

// GET /api/v1/plans - Tüm SaaS paketlerini ve özelliklerini listele
plansRouter.get('/', (req: Request, res: Response) => {
  const db = storage.getState();
  const plans = (db.subscriptionPlans || []).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  const features = db.planFeatures || [];

  const enhancedPlans = plans.map(p => {
    const planFeats = features.filter(f => f.planId === p.id);
    return {
      ...p,
      detailedFeatures: planFeats,
    };
  });

  res.json({
    success: true,
    plans: enhancedPlans,
  });
});

// GET /api/v1/plans/:slug - Tekil paket detayı
plansRouter.get('/:slug', (req: Request, res: Response) => {
  const db = storage.getState();
  const plan = (db.subscriptionPlans || []).find(
    p => p.slug.toUpperCase() === String(req.params.slug).toUpperCase() || p.id === req.params.slug
  );

  if (!plan) {
    return res.status(404).json({ success: false, message: 'Paket bulunamadı.' });
  }

  const features = (db.planFeatures || []).filter(f => f.planId === plan.id);

  res.json({
    success: true,
    plan: {
      ...plan,
      detailedFeatures: features,
    },
  });
});
