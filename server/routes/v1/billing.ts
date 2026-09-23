import { Router } from 'express';
import { BillingService } from '../../services/faz9/billingService';
import { CreditWalletService } from '../../services/faz9/creditWalletService';
import { UsageMeterService } from '../../services/faz9/usageMeterService';
import { PlanService } from '../../services/faz9/planService';
import { storage } from '../../db/storage';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/billing/portal
 * Müşteri Faturalandırma Portalı Özeti (Abonelik, Cüzdan, Kullanım ve Planlar)
 */
router.get('/portal', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  const planSlug = (tenant?.plan || 'pro').toLowerCase();

  const subscription = BillingService.getSubscription(tenantId);
  const wallet = CreditWalletService.getOrCreateWallet(tenantId);
  const usage = UsageMeterService.getUsageSummary(tenantId, planSlug);
  const plans = PlanService.getPlans();
  const payments = (db.payments || []).filter(p => p.tenantId === tenantId).slice(0, 10);

  return res.json({
    success: true,
    data: {
      tenant,
      subscription,
      wallet,
      usage,
      plans,
      recentPayments: payments,
    },
  });
});

/**
 * POST /api/v1/billing/upgrade
 * Plan değiştirme / yükseltme
 */
router.post('/upgrade', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { planSlug, billingCycle = 'monthly', couponCode, paymentProvider = 'MOCK' } = req.body;

    if (!planSlug) return res.status(400).json({ success: false, message: 'Plan seçimi zorunludur.' });

    const result = await BillingService.upgradeOrChangePlan({
      tenantId,
      newPlanSlug: planSlug,
      billingCycle,
      couponCode,
      paymentProvider,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/v1/billing/buy-credits
 * Kontör satın alma
 */
router.post('/buy-credits', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { quantity = 500, amount = 450, paymentProvider = 'MOCK' } = req.body;

    const result = await CreditWalletService.purchaseCredits({
      tenantId,
      quantity: Number(quantity),
      amount: Number(amount),
      paymentProvider,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/v1/billing/cancel
 * Abonelik iptali
 */
router.post('/cancel', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { reason, cancelImmediately } = req.body;

    const sub = await BillingService.cancelSubscription(tenantId, reason, cancelImmediately);
    return res.json({ success: true, message: 'Abonelik iptal talebiniz kaydedildi.', subscription: sub });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
