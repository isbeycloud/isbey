import { Router, Request, Response } from 'express';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { TaxpayerService } from '../../services/taxpayerService';
import { ProviderConfigurationError } from '../../services/providers/providerFactory';

export const v1TaxpayersRouter = Router();

v1TaxpayersRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/taxpayers/check
 * VKN veya TCKN ile mükellefiyet durumu sorgular (Cache + Provider)
 */
v1TaxpayersRouter.get('/check', requirePermission(PERMISSIONS.EINVOICE_VIEW), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { vkn, force } = req.query as Record<string, string>;

  if (!vkn) {
    return res.status(400).json({ success: false, message: 'Vergi Kimlik Numarası veya TCKN (vkn) parametresi gereklidir.' });
  }

  try {
    const result = await TaxpayerService.checkTaxpayer(vkn, tenantId, force === 'true');
    res.json({ success: true, taxpayer: result });
  } catch (err: any) {
    // 2026-09-12: Entegratör yapılandırılmamışsa bu bir İSTEMCİ hatası değil,
    // eksik kurulumdur → 503 + `configured: false`. Arayüz "mükellef değil"
    // ile "sorgulanamadı"yı ayırt edebilmelidir.
    if (ProviderConfigurationError.is(err)) {
      return res.status(503).json({ success: false, configured: false, message: err.message });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});
