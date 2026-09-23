import { Router } from 'express';
import { DeviceService } from '../../services/faz8/deviceService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/devices
 * Kullanıcının aktif bağlı cihazları
 */
router.get('/', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const userId = (req.query.userId as string) || 'usr-admin';
  const devices = DeviceService.getDevices(userId, tenantId);
  return res.json({ success: true, count: devices.length, devices });
});

/**
 * POST /api/v1/devices/:id/terminate
 * Cihaz oturumunu uzaktan sonlandırır
 */
router.post('/:id/terminate', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const result = await DeviceService.terminateDevice(req.params.id, tenantId);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Cihaz oturumu kapatılamadı.' });
  }
});

export default router;
