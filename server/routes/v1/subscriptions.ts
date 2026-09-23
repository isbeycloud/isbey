import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { requireAuth } from '../../middleware/authGuards';
import { SubscriptionStateMachine } from '../../services/subscriptionStateMachine';
import { UsageService } from '../../services/usageService';
import { PaymentGatewayAdapter } from '../../services/payments/paymentGatewayAdapter';

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth);

// GET /api/v1/subscriptions/current - Aktif şirket abonelik ve lisans durumunu getir
subscriptionsRouter.get('/current', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const sub = (db.subscriptions || []).find(s => s.tenantId === tenantId);
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  const plans = db.subscriptionPlans || [];

  if (!sub) {
    return res.status(404).json({ success: false, message: 'Bu şirkete ait aktif abonelik bulunamadı.' });
  }

  const currentPlan = plans.find(p => p.id === sub.planId || p.slug === sub.planSlug) || plans[0];
  const now = new Date().getTime();
  const end = new Date(sub.endDate).getTime();
  const daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));

  const isTrialActive = sub.status === 'trial' && sub.trialEnd ? new Date(sub.trialEnd).getTime() > now : false;
  const trialDaysRemaining = sub.trialEnd
    ? Math.max(0, Math.ceil((new Date(sub.trialEnd).getTime() - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const usage = await UsageService.getUsage(tenantId);

  res.json({
    success: true,
    subscription: sub,
    plan: currentPlan,
    tenantStatus: tenant?.status || 'ACTIVE',
    daysRemaining,
    isTrialActive,
    trialDaysRemaining,
    usage,
  });
});

// POST /api/v1/subscriptions/preview-change - Paket değişikliği için önizleme ve proration farkı hesaplama
subscriptionsRouter.post('/preview-change', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { targetPlanSlug, billingCycle = 'monthly' } = req.body;
  const db = storage.getState();

  const sub = (db.subscriptions || []).find(s => s.tenantId === tenantId);
  if (!sub) return res.status(404).json({ success: false, message: 'Abonelik bulunamadı.' });

  const plans = db.subscriptionPlans || [];
  const currentPlan = plans.find(p => p.id === sub.planId || p.slug === sub.planSlug) || plans[0];
  const targetPlan = plans.find(p => p.slug === targetPlanSlug || p.id === targetPlanSlug);

  if (!targetPlan) {
    return res.status(400).json({ success: false, message: 'Hedef paket bulunamadı.' });
  }

  // Downgrade Limit Kontrolü
  const isDowngrade = targetPlan.displayOrder < currentPlan.displayOrder;
  if (isDowngrade) {
    const activeUsers = (db.tenantUsers || []).filter(tu => tu.tenantId === tenantId && tu.status === 'active').length || 1;
    if (activeUsers > targetPlan.maxUsers) {
      return res.status(400).json({
        success: false,
        code: 'DOWNGRADE_LIMIT_EXCEEDED',
        message: `Mevcut aktif kullanıcı sayınız (${activeUsers}), geçmek istediğiniz '${targetPlan.name}' limitinden (${targetPlan.maxUsers}) fazladır. Lütfen önce kullanıcı sayısını azaltınız.`,
      });
    }
  }

  const proration = SubscriptionStateMachine.calculateProration(
    sub,
    currentPlan,
    targetPlan,
    billingCycle
  );

  res.json({
    success: true,
    isDowngrade,
    proration,
  });
});

// POST /api/v1/subscriptions/change - Paket Yükseltme / Değiştirme ve Ödeme Entegrasyonu
subscriptionsRouter.post('/change', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { targetPlanSlug, billingCycle = 'monthly', paymentDetails } = req.body;
  const db = storage.getState();

  const sub = (db.subscriptions || []).find(s => s.tenantId === tenantId);
  if (!sub) return res.status(404).json({ success: false, message: 'Abonelik bulunamadı.' });

  const plans = db.subscriptionPlans || [];
  const currentPlan = plans.find(p => p.id === sub.planId || p.slug === sub.planSlug) || plans[0];
  const targetPlan = plans.find(p => p.slug === targetPlanSlug || p.id === targetPlanSlug);

  if (!targetPlan) return res.status(400).json({ success: false, message: 'Hedef paket bulunamadı.' });

  // Downgrade kontrolü
  const isDowngrade = targetPlan.displayOrder < currentPlan.displayOrder;
  if (isDowngrade) {
    const activeUsers = (db.tenantUsers || []).filter(tu => tu.tenantId === tenantId && tu.status === 'active').length || 1;
    if (activeUsers > targetPlan.maxUsers) {
      return res.status(400).json({
        success: false,
        message: `Kullanıcı sayınız (${activeUsers}), '${targetPlan.name}' paket limitinden (${targetPlan.maxUsers}) büyüktür. Önce kullanıcı silmelisiniz.`,
      });
    }
  }

  const proration = SubscriptionStateMachine.calculateProration(sub, currentPlan, targetPlan, billingCycle);

  // Ödeme Gerekli ise (Proration farkı > 0)
  if (proration.totalPayableAmount > 0 && paymentDetails) {
    const payResult = await PaymentGatewayAdapter.processPayment({
      tenantId,
      orderType: 'PLAN_UPGRADE',
      amount: proration.netProratedAmount,
      planSlug: targetPlan.slug as any,
      billingPeriod: billingCycle.toUpperCase() as any,
      cardNumber: paymentDetails.cardNumber,
      cardHolder: paymentDetails.cardHolder || req.user?.fullName,
      expireMonth: paymentDetails.expireMonth,
      expireYear: paymentDetails.expireYear,
      cvv: paymentDetails.cvv,
      userId: req.user?.id || 'usr-1',
      username: req.user?.fullName || 'Yönetici',
    });

    if (!payResult.success) {
      return res.status(400).json({ success: false, message: payResult.message });
    }
  }

  // Abonelik ve Tenant Kaydını Güncelle
  const now = new Date().toISOString();
  const days = billingCycle === 'yearly' ? 365 : 30;
  const newEndDate = new Date(Date.now() + days * 86400000).toISOString();

  await storage.runTransaction(draft => {
    const s = (draft.subscriptions || []).find(item => item.tenantId === tenantId);
    if (s) {
      s.planId = targetPlan.id;
      s.planSlug = targetPlan.slug;
      s.status = 'active';
      s.billingCycle = billingCycle;
      s.startDate = now;
      s.endDate = newEndDate;
      s.nextBillingDate = newEndDate;
      s.updatedAt = now;
    }

    const t = (draft.tenants || []).find(item => item.id === tenantId);
    if (t) {
      t.plan = targetPlan.slug as any;
      t.status = 'ACTIVE';
      t.maxUsers = targetPlan.maxUsers;
      t.maxInvoicesPerMonth = targetPlan.maxInvoicesPerMonth;
      t.storageLimitMb = targetPlan.storageLimitMb;
      t.activeModules = targetPlan.activeModules as any;
      t.expiresAt = newEndDate;
      t.updatedAt = now;
    }
  });

  res.json({
    success: true,
    message: `'${targetPlan.name}' paketine başarıyla geçildi!`,
    subscription: sub,
  });
});

// POST /api/v1/subscriptions/cancel - Aboneliği İptal Et
subscriptionsRouter.post('/cancel', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { reason, note } = req.body;

  try {
    const result = await SubscriptionStateMachine.transitionStatus(tenantId, 'cancelled', reason);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/subscriptions/auto-renew - Otomatik Yenilemeyi Aç / Kapat
subscriptionsRouter.post('/auto-renew', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { autoRenew } = req.body;

  await storage.runTransaction(draft => {
    const sub = (draft.subscriptions || []).find(s => s.tenantId === tenantId);
    if (sub) {
      sub.autoRenew = !!autoRenew;
      sub.updatedAt = new Date().toISOString();
    }
  });

  res.json({
    success: true,
    message: `Otomatik yenileme ${autoRenew ? 'aktif edildi' : 'kapatıldı'}.`,
  });
});
