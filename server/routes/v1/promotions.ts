import { Router } from 'express';
import { PromotionService } from '../../services/faz9/promotionService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * POST /api/v1/promotions/validate-coupon
 * Kupon kodu geçerliliğini ve indirim tutarını kontrol eder
 */
router.post('/validate-coupon', (req, res) => {
  const { code, amount = 1000 } = req.body;
  if (!code) return res.status(400).json({ valid: false, message: 'Kupon kodu giriniz.' });

  const result = PromotionService.validateCoupon(code, Number(amount));
  return res.json(result);
});

/**
 * GET /api/v1/promotions/referral-code
 * Tenant için arkadaşını davet et kodu
 */
router.get('/referral-code', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const code = PromotionService.getOrCreateReferralCode(tenantId);
  return res.json({
    success: true,
    referralCode: code,
    shareUrl: `https://isbey.cloud/register?ref=${code}`,
    inviterReward: '100 AI Kredisi',
    inviteeReward: '50 AI Kredisi',
  });
});

export default router;
