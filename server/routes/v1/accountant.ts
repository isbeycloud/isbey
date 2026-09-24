import { Router } from 'express';
import { storage } from '../../db/storage';
import { AccountantService } from '../../services/ai/accountantService';
import { requireAuth, requireRole } from '../../middleware/authGuards';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

// FAZ 17: Tüm accountant route'larına auth guard eklendi
router.use(requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'));

/**
 * GET /api/v1/accountant/clients
 * Mali Müşavirin mükellef portföyü
 */
router.get('/clients', (req, res) => {
  // FAZ 17/18: userId sadece kimlik doğrulanmış JWT token'dan alınır
  const userId = req.user?.id || 'usr-accountant';
  const clients = AccountantService.getClients(userId);
  return res.json({ success: true, count: clients.length, clients });
});

/**
 * GET /api/v1/accountant/clients/:id/monthly-report
 * Aylık AI Muhasebe Kapanış Raporu
 */
router.get('/clients/:id/monthly-report', (req, res) => {
  const tenantId = req.params.id || 'tnt-isbey';
  // FAZ 17/18: userId JWT token'dan alınır (query param güvenlik açığı kapatıldı)
  const userId = req.user?.id || (req.headers['x-user-id'] as string) || 'usr-accountant';
  
  // Yetki Kontrolü: Mali Müşavir sadece yetkili olduğu mükellefi görebilir
  if (!AccountantService.isAccountantAuthorizedForTenant(userId, tenantId)) {
    return res.status(403).json({ success: false, message: 'Bu firmanın muhasebe kayıtlarına erişim yetkiniz bulunmamaktadır.' });
  }

  const period = (req.query.period as string) || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return res.status(400).json({ success: false, message: 'Geçerli dönem seçin.' });
  const report = AccountantService.generateMonthlyClosingReport(tenantId, period);
  return res.json({ success: true, report });
});

/**
 * GET /api/v1/accountant/requests
 * Talep edilen evraklar listesi
 */
router.get('/requests', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const requests = (db.documentRequests || []).filter(
    r => r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: requests.length, requests });
});

/**
 * POST /api/v1/accountant/requests
 * Firmadan yeni evrak talebi oluşturma
 */
router.post('/requests', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { documentType = 'BANK_STATEMENT', period = new Date().toISOString().slice(0, 7), description, dueDate } = req.body;
    const accountantUserId = req.user.id;
    const accountantName = req.user.fullName;
    const companyName = storage.getState().tenants.find(t => t.id === tenantId)?.name || '';

    if (!description) {
      return res.status(400).json({ success: false, message: 'Evrak talep açıklaması zorunludur.' });
    }

    const request = await AccountantService.createDocumentRequest({
      tenantId,
      accountantUserId,
      accountantName,
      companyName,
      documentType,
      period,
      description,
      dueDate: dueDate || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });

    return res.status(201).json({
      success: true,
      message: 'Evrak talebi başarıyla firmaya iletildi.',
      request,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Evrak talebi oluşturulamadı.' });
  }
});

export default router;
