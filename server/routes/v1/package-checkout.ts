import { Router } from 'express';
import { requireAuth, requireRole, resolveTenant } from '../../middleware/authGuards';
import { storage } from '../../db/storage';
import { garantiPreparationStatus, previewPackageCheckout } from '../../services/payments/garantiPreparation';
import { paymentPreparationMessage } from '../../services/payments/checkoutSafety';

export const packageCheckoutRouter = Router();
packageCheckoutRouter.use(requireAuth, resolveTenant, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'));
packageCheckoutRouter.get('/status', (_req, res) => {
  const { provider, model, stage, checkoutAvailable, message } = garantiPreparationStatus();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, provider, model, stage, checkoutAvailable, message });
});
packageCheckoutRouter.get('/admin/readiness', requireRole('SUPER_ADMIN', 'ADMIN'), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, ...garantiPreparationStatus() });
});
packageCheckoutRouter.post('/preview', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json({ success: true, preview: previewPackageCheckout(storage.getState(), req.tenantId!, req.body) }); }
  catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Paket önizlemesi alınamadı.' }); }
});
// Kimlik bilgileri doldurulsa dahi banka doğrulama aşaması tamamlanmadan açılmaz.
packageCheckoutRouter.post('/start', (_req, res) => {
  res.status(503).json({ success: false, code: 'PAYMENT_NOT_AVAILABLE', message: paymentPreparationMessage });
});
