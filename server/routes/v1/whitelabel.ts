import { Router } from 'express';
import { WhiteLabelService } from '../../services/faz9/whiteLabelService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/whitelabel/profile
 * Tenant'ın White-Label marka profili
 */
router.get('/profile', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const profile = WhiteLabelService.getBrandProfile(tenantId);
  return res.json({ success: true, profile });
});

/**
 * POST /api/v1/whitelabel/profile
 * Marka profilini kaydeder
 */
router.post('/profile', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const profile = await WhiteLabelService.saveBrandProfile({
      ...req.body,
      tenantId,
    });
    return res.json({ success: true, message: 'Özel marka ayarları başarıyla kaydedildi.', profile });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/v1/whitelabel/verify-domain
 * Özel alan adı doğrulama
 */
router.post('/verify-domain', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ success: false, message: 'Domain adı zorunludur.' });

    const result = await WhiteLabelService.verifyCustomDomain(tenantId, domain);
    return res.json({ success: true, message: `${domain} alan adı DNS ve SSL doğrulaması tamamlandı.`, verification: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
