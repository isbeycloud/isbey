import { Router } from 'express';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { storage } from '../db/storage';
import { isPlatformUser } from '../security/memberships';
import { submitApplication, quoteApplication, completeServicePayment, type EServicePaymentProvider } from '../services/eServiceApplications';
import { ensureTenantToken } from '../services/hizliTenantCredentialRegistry';
import { HizliConnectService } from '../services/hizliConnectService';

export function createEServicesRouter(provider?: EServicePaymentProvider) {
  const router = Router();
  router.post('/payment-callback', async (req, res) => {
    const secret = process.env.E_SERVICE_WEBHOOK_SECRET;
    const signature = req.get('x-payment-signature') || '';
    const { orderId, amountMinor, currency, reference, timestamp } = req.body || {};
    if (!secret || secret.length < 32 || !/^[a-f0-9]{64}$/i.test(signature) || !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 300_000) return res.status(401).json({ success: false, message: 'Ödeme imzası geçersiz.' });
    const expected = createHmac('sha256', secret).update(JSON.stringify([orderId, amountMinor, currency, reference, timestamp])).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return res.status(401).json({ success: false, message: 'Ödeme imzası geçersiz.' });
    try { await completeServicePayment({ orderId, amountMinor, currency, reference }); return res.json({ success: true }); }
    catch { return res.status(400).json({ success: false, message: 'Ödeme siparişle eşleşmedi.' }); }
  });
  router.use(requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'));
  router.get('/plan-requests', (req, res) => res.json({ success: true, requests: (storage.getState().servicePlanRequests || []).filter(r => isPlatformUser(req.user) || r.tenantId === req.tenantId).map(r => ({ ...r, companyName: storage.getState().tenants.find(t => t.id === r.tenantId)?.name || '' })) }));
  router.post('/plan-requests', async (req, res) => {
    const { planId, period } = req.body || {};
    if (!['MONTHLY', 'YEARLY'].includes(period)) return res.status(400).json({ success: false, message: 'Geçerli faturalama dönemi seçin.' });
    try {
      await storage.runTransaction(db => {
        const plan = db.subscriptionPlans?.find(p => p.id === planId && p.status === 'ACTIVE');
        if (!plan) throw new Error('Satışa açık paket bulunamadı.');
        db.servicePlanRequests ||= [];
        if (db.servicePlanRequests.some(r => r.tenantId === req.tenantId && r.planId === planId && r.status === 'REQUESTED')) throw new Error('Bu paket için bekleyen talebiniz bulunuyor.');
        const amount = period === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice;
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Paket fiyatı henüz tanımlanmadı.');
        db.servicePlanRequests.push({ id: randomUUID(), tenantId: req.tenantId!, userId: req.user.id, planId, planName: plan.name, period, amount, currency: plan.currency, status: 'REQUESTED', createdAt: new Date().toISOString() });
      });
      return res.status(201).json({ success: true });
    } catch (e) { return res.status(400).json({ success: false, message: (e as Error).message }); }
  });
  router.get('/applications', (req, res) => {
    const applications = (storage.getState().eServiceApplications || []).filter(a => isPlatformUser(req.user) || a.tenantId === req.tenantId);
    res.json({ success: true, applications, checkoutAvailable: !!provider });
  });
  router.post('/applications', async (req, res) => {
    try { const application = await submitApplication(req.tenantId!, req.user.id, req.body || {}); res.status(201).json({ success: true, application }); }
    catch (e) { res.status(400).json({ success: false, message: (e as Error).message }); }
  });
  router.post('/applications/:id/quote', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    try { const application = await quoteApplication(String(req.params.id), req.body.amountMinor, req.user.id); res.json({ success: true, application }); }
    catch (e) { res.status(400).json({ success: false, message: (e as Error).message }); }
  });
  router.post('/applications/:id/checkout', async (req, res) => {
    const a = storage.getState().eServiceApplications?.find(a => a.id === req.params.id && a.tenantId === req.tenantId);
    if (!a) return res.status(404).json({ success: false, message: 'Başvuru bulunamadı.' });
    if (a.status !== 'QUOTED' || !a.orderId || !a.amountMinor) return res.status(409).json({ success: false, message: 'Ödenebilir teklif bulunamadı.' });
    if (!provider) return res.status(503).json({ success: false, message: 'Canlı ödeme sağlayıcısı henüz bağlanmadı. Tahsilat yapılmadı.' });
    try {
      const checkout = await provider.createCheckout({ orderId: a.orderId, amountMinor: a.amountMinor, currency: a.currency, email: a.email });
      const url = new URL(checkout.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid URL');
      res.json({ success: true, url: url.href });
    } catch { res.status(502).json({ success: false, message: 'Ödeme sayfası oluşturulamadı; tekrar deneyebilirsiniz.' }); }
  });
  router.get('/invoice-history', async (req, res) => {
    const { startDate, endDate } = req.query;
    if (typeof startDate !== 'string' || typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(Date.parse(startDate)) || !Number.isFinite(Date.parse(endDate)) || startDate > endDate) return res.status(400).json({ success: false, message: 'Geçerli tarih aralığı seçin.' });
    const db = storage.getState();
    const settings = db.tenantEinvoiceSettings?.find(s => s.tenantId === req.tenantId);
    if (!settings || !['HIZLI', 'HIZLI_TEKNOLOJI'].includes(settings.providerId) || !settings.integrationEnabled || settings.status !== 'ACTIVE') return res.status(409).json({ success: false, message: 'Seçili firmanın Hızlı Bilişim entegrasyonu aktif değil.' });
    const tenant = db.tenants.find(t => t.id === req.tenantId && !t.isArchived);
    if (!tenant || !/^\d{10,11}$/.test(tenant.taxNumber || '') || tenant.taxNumber !== settings.senderIdentifier) return res.status(409).json({ success: false, message: 'Firma VKN/TCKN bilgisi entegratör gönderici kimliğiyle eşleşmiyor.' });
    try {
      const isTest = settings.environment === 'TEST';
      const { token } = await ensureTenantToken(settings, isTest);
      const result = await HizliConnectService.getDocumentList({ appType: 1, dateType: 'IssueDate', startDate: `${startDate}T00:00:00`, endDate: `${endDate}T23:59:59`, isNew: false }, token, isTest);
      if (!result.success) return res.status(502).json({ success: false, message: 'Hızlı Bilişim belge listesi alınamadı. Bağlantıyı kontrol edip tekrar deneyin.' });
      if (!Array.isArray(result.documents)) return res.status(502).json({ success: false, message: 'Entegratörden beklenmeyen belge yanıtı geldi.' });
      const documents = result.documents.map((d: Record<string, unknown>) => ({
        uuid: d.UUID ?? d.uuid ?? d.DocumentUUID ?? '', number: d.DocumentId ?? d.documentId ?? d.InvoiceNumber ?? '',
        date: d.DocumentDate ?? d.documentDate ?? d.IssueDate ?? '', receiver: d.ReceiverTitle ?? d.receiverTitle ?? '',
        status: d.StatusDescription ?? d.statusDescription ?? d.Status ?? '',
      }));
      res.json({ success: true, documents });
    } catch { res.status(502).json({ success: false, message: 'Firmanın Hızlı Bilişim bağlantısı kurulamadı. Firma bağlantı ayarlarını kontrol edin.' }); }
  });
  return router;
}
export const eServicesRouter = createEServicesRouter();
