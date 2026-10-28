import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth, requireRole, resolveTenant } from '../../middleware/authGuards';
import { storage } from '../../db/storage';
import { fiscalAdapterCatalog } from '../../../packages/fiscal-device-kit/src/index';
import { FiscalConfigurationError, inspectFiscalDevice, saveFiscalDevice } from '../../services/pos/fiscalDevices';

export const fiscalDevicesRouter = Router();
fiscalDevicesRouter.use(requireAuth, resolveTenant, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store'); next();
});
fiscalDevicesRouter.get('/', (req, res) => res.json({ success: true, adapters: fiscalAdapterCatalog(),
  devices: (storage.getState().fiscalDevices || []).filter(d => d.tenantId === req.tenantId), collectionAvailable: false }));

const fail = (error: unknown, res: import('express').Response) => res.status(error instanceof FiscalConfigurationError ? error.status : 500)
  .json({ success: false, message: error instanceof FiscalConfigurationError ? error.message : 'Cihaz tanımı kaydedilemedi.' });

fiscalDevicesRouter.post('/', async (req, res) => {
  try { const device = await storage.runTransaction(db => saveFiscalDevice(db, req.tenantId!, req.body, { id: req.user.id, username: req.user.username, ipAddress: req.ip || '' })); res.status(201).json({ success: true, device }); }
  catch (error) { fail(error, res); }
});
fiscalDevicesRouter.put('/:id', async (req, res) => {
  try { const device = await storage.runTransaction(db => saveFiscalDevice(db, req.tenantId!, req.body, { id: req.user.id, username: req.user.username, ipAddress: req.ip || '' }, String(req.params.id))); res.json({ success: true, device }); }
  catch (error) { fail(error, res); }
});
fiscalDevicesRouter.delete('/:id', async (req, res) => {
  try {
    await storage.runTransaction(db => {
      const device = db.fiscalDevices?.find(d => d.id === req.params.id && d.tenantId === req.tenantId);
      if (!device) throw new FiscalConfigurationError('Cihaz tanımı bulunamadı.', 404);
      if (!req.body || Object.keys(req.body).some(k => k !== 'expectedRevision') || req.body.expectedRevision !== device.revision) throw new FiscalConfigurationError('Cihaz tanımı değişmiş. Listeyi yenileyin.', 409);
      device.status = 'DISABLED'; device.revision = randomUUID(); device.updatedAt = new Date().toISOString();
      db.auditLogs ||= [];
      db.auditLogs.unshift({ id: randomUUID(), tenantId: req.tenantId, companyId: req.tenantId, userId: req.user.id, username: req.user.username, ipAddress: req.ip || '',
        action: 'FISCAL_DEVICE_DISABLED', module: 'SETTINGS', timestamp: device.updatedAt, details: JSON.stringify({ deviceId: device.id }) });
    });
    res.json({ success: true });
  } catch (error) { fail(error, res); }
});
fiscalDevicesRouter.get('/:id/readiness', async (req, res) => {
  const device = storage.getState().fiscalDevices?.find(d => d.id === req.params.id && d.tenantId === req.tenantId);
  if (!device) { res.status(404).json({ success: false, message: 'Cihaz tanımı bulunamadı.' }); return; }
  res.json({ success: true, readiness: await inspectFiscalDevice(device) });
});
