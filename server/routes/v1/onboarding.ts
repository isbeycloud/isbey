import { Router } from 'express';
import { OnboardingService } from '../../services/faz8/onboardingService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/onboarding/progress
 * Kurulum ilerleme durumu
 */
router.get('/progress', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const progress = OnboardingService.getProgress(tenantId);
  return res.json({ success: true, progress });
});

/**
 * POST /api/v1/onboarding/demo-data
 * Tek tıkla demo verileri oluşturur
 */
router.post('/demo-data', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const userId = req.body.userId || 'usr-admin';
    const userName = req.body.userName || 'Şirket Sahibi';

    const result = await OnboardingService.injectDemoData(tenantId, userId, userName);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Demo veriler oluşturulamadı.' });
  }
});

export default router;
