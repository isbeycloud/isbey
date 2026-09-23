import { Router } from 'express';
import { MarketplaceService } from '../../services/faz9/marketplaceService';
import { GenericMockConnector } from '../../services/faz9/integrationFramework';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/marketplace/apps
 * Entegrasyon mağazası uygulamaları
 */
router.get('/apps', (req, res) => {
  const category = req.query.category as string;
  const apps = MarketplaceService.getApps(category);
  return res.json({ success: true, count: apps.length, apps });
});

/**
 * GET /api/v1/marketplace/connections
 * Tenant'ın kurulu bağlantıları
 */
router.get('/connections', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const connections = MarketplaceService.getTenantConnections(tenantId);
  return res.json({ success: true, count: connections.length, connections });
});

/**
 * POST /api/v1/marketplace/connect
 * Uygulama bağlama
 */
router.post('/connect', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { appSlug, credentials } = req.body;
    if (!appSlug) return res.status(400).json({ success: false, message: 'Uygulama slug zorunludur.' });

    const conn = await MarketplaceService.connectApp({
      tenantId,
      appSlug,
      credentials,
    });

    return res.status(201).json({ success: true, message: 'Entegrasyon bağlantısı başarıyla kuruldu.', connection: conn });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/v1/marketplace/disconnect
 * Uygulama bağlantısını kesme
 */
router.post('/disconnect', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { appSlug } = req.body;
    const result = await MarketplaceService.disconnectApp(tenantId, appSlug);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/v1/marketplace/test-connection
 * Bağlantı testi çalıştırma
 */
router.post('/test-connection', async (req, res) => {
  const { appSlug = 'garanti-bbva' } = req.body;
  // FAZ 25.2-C: tenantId body'den değil token'dan çözümlenir
  const tenantId = resolveRequestTenantId(req);
  const connector = new GenericMockConnector(appSlug, tenantId);
  const result = await connector.testConnection();
  return res.json(result);
});

export default router;
