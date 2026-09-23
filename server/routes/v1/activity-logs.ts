import { Router } from 'express';
import { storage } from '../../db/storage';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/activity-logs
 * Aktivite akışı ve denetim logları
 */
router.get('/', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const list = (db.activityLogs || []).filter(
    a => a.tenantId === tenantId || (!a.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: list.length, logs: list });
});

export default router;
