import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { ElectronicDocumentService } from '../../services/electronicDocumentService';
import { IncomingInvoiceService } from '../../services/incomingInvoiceService';
import { DocumentStorageService } from '../../services/documentStorageService';
import { ProviderConfigurationError, ProviderTransportError } from '../../services/providers/providerFactory';

export const v1EDocumentsRouter = Router();

v1EDocumentsRouter.use(requireAuth, resolveTenant);

/**
 * 2026-09-12: Entegratör hatalarını SINIFINA göre ayırır:
 *   - yapılandırma eksiği  → 503 + `configured: false` (kurulum sorunu)
 *   - entegratöre ulaşılamama → 502 (üst bağımlılık arızası)
 *   - diğer (doğrulama vb.)   → 400 (istemci kusuru)
 * Önceden ilk ikisi de 400'e düşüyor ve kurulum/ağ arızası "belge geçersiz"
 * gibi görünüp kullanıcıyı yanıltıyordu.
 */
function entegratorHatasi(res: Response, err: any) {
  if (ProviderConfigurationError.is(err)) {
    return res.status(503).json({ success: false, configured: false, message: err.message });
  }
  // 2026-09-12: Entegratöre ULAŞILAMAMA da sunucu tarafı bir arızadır, istemci
  // kusuru değil. Önceden bu durum 400 dönüyordu; "senin isteğin bozuk" demek
  // yanıltıcıdır ve istemcinin retry/uyarı mantığını saptırır.
  if (ProviderTransportError.is(err)) {
    return res.status(502).json({ success: false, message: err.message });
  }
  return res.status(400).json({ success: false, message: err?.message || 'İşlem başarısız.' });
}

/**
 * GET /api/v1/e-documents
 * Giden ve gelen tüm elektronik belgeleri sayfalanmış listeler
 */
v1EDocumentsRouter.get('/', requirePermission(PERMISSIONS.EINVOICE_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const {
    page = '1',
    limit = '25',
    type,
    status,
    direction = 'OUTGOING',
    search = '',
    startDate,
    endDate,
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  let list = (db.electronicDocuments || []).filter(
    d => (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
  );

  if (direction && direction !== 'ALL') {
    list = list.filter(d => d.documentDirection === direction);
  }

  if (type && type !== 'ALL') {
    list = list.filter(d => d.documentType === type);
  }

  if (status && status !== 'ALL') {
    list = list.filter(d => d.status === status);
  }

  if (startDate) {
    list = list.filter(d => d.createdAt >= startDate);
  }

  if (endDate) {
    list = list.filter(d => d.createdAt <= endDate);
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      d =>
        d.documentNumber?.toLowerCase().includes(q) ||
        d.uuid?.toLowerCase().includes(q) ||
        d.receiverTitle?.toLowerCase().includes(q) ||
        d.receiverIdentifier?.includes(q)
    );
  }

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = list.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = list.slice(startIndex, startIndex + limitNum);

  const summary = {
    totalDocuments: list.length,
    queued: list.filter(d => d.status === 'QUEUED' || d.status === 'SENDING').length,
    sent: list.filter(d => d.status === 'SENT').length,
    accepted: list.filter(d => d.status === 'ACCEPTED').length,
    rejected: list.filter(d => d.status === 'REJECTED').length,
    failed: list.filter(d => d.status === 'FAILED').length,
  };

  res.json({
    success: true,
    data: paginated,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    summary,
  });
});

/**
 * POST /api/v1/e-documents/send-invoice
 * Faturayı e-Fatura / e-Arşiv kuyruğuna alır
 */
v1EDocumentsRouter.post('/send-invoice', requirePermission(PERMISSIONS.INVOICES_SEND), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { invoiceId, profile } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ success: false, message: 'Fatura ID (invoiceId) zorunludur.' });
  }

  try {
    const doc = await ElectronicDocumentService.queueInvoice({
      invoiceId,
      tenantId,
      profile,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.status(202).json({
      success: true,
      message: 'Fatura başarıyla e-Belge gönderim kuyruğuna alındı.',
      document: doc,
    });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});

/**
 * POST /api/v1/e-documents/send-waybill
 * İrsaliyeyi e-İrsaliye kuyruğuna alır
 */
v1EDocumentsRouter.post('/send-waybill', requirePermission(PERMISSIONS.WAYBILLS_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { waybillId } = req.body;

  if (!waybillId) {
    return res.status(400).json({ success: false, message: 'İrsaliye ID (waybillId) zorunludur.' });
  }

  try {
    const doc = await ElectronicDocumentService.queueWaybill({
      waybillId,
      tenantId,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.status(202).json({
      success: true,
      message: 'İrsaliye başarıyla e-İrsaliye kuyruğuna alındı.',
      document: doc,
    });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});

/**
 * GET /api/v1/e-documents/:id
 * Belge detay kartı ve durum timeline'ı
 */
v1EDocumentsRouter.get('/:id', requirePermission(PERMISSIONS.EINVOICE_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const doc = (db.electronicDocuments || []).find(
    d => d.id === req.params.id && (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
  );

  if (!doc) return res.status(404).json({ success: false, message: 'Elektronik belge bulunamadı.' });

  res.json({ success: true, document: doc });
});

/**
 * GET /api/v1/e-documents/:id/status
 * Entegratörden anlık durum senkronizasyonu yapar
 */
v1EDocumentsRouter.get('/:id/status', requirePermission(PERMISSIONS.EINVOICE_VIEW), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  try {
    const doc = await ElectronicDocumentService.syncDocumentStatus(String(req.params.id), tenantId);
    res.json({ success: true, document: doc });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});

/**
 * GET /api/v1/e-documents/:id/xml
 * Belgenin UBL-TR XML içeriğini döner
 */
v1EDocumentsRouter.get('/:id/xml', requirePermission(PERMISSIONS.EINVOICE_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const doc = (db.electronicDocuments || []).find(
    d => d.id === req.params.id && (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
  );

  if (!doc || !doc.xmlStoragePath) {
    return res.status(404).json({ success: false, message: 'Belgeye ait XML dosyası bulunamadı.' });
  }

  try {
    const xml = DocumentStorageService.readXml(tenantId, doc.xmlStoragePath);
    if (!xml) return res.status(404).json({ success: false, message: 'XML dosyası okunamadı.' });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err: any) {
    res.status(403).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// GELEN E-FATURA ENDPOINTLERİ
// ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/e-documents/incoming/list
 */
v1EDocumentsRouter.get('/incoming/list', requirePermission(PERMISSIONS.EINVOICE_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { page = '1', limit = '25', status, search = '' } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  let list = (db.incomingInvoices || []).filter(
    inv => (inv.tenantId === tenantId || (tenantId === 'tnt-isbey' && !inv.tenantId))
  );

  if (status && status !== 'ALL') {
    list = list.filter(inv => inv.status === status);
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      inv =>
        inv.invoiceNo?.toLowerCase().includes(q) ||
        inv.supplierTitle?.toLowerCase().includes(q) ||
        inv.supplierTaxNumber?.includes(q) ||
        inv.uuid?.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());

  const total = list.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = list.slice(startIndex, startIndex + limitNum);

  res.json({
    success: true,
    data: paginated,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
});

/**
 * POST /api/v1/e-documents/incoming/sync
 */
v1EDocumentsRouter.post('/incoming/sync', requirePermission(PERMISSIONS.EINVOICE_VIEW), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { startDate } = req.body;

  try {
    const result = await IncomingInvoiceService.syncIncomingInvoices(tenantId, startDate);
    res.json({
      success: true,
      message: `${result.syncedCount} yeni gelen fatura senkronize edildi (${result.duplicateCount} mükerrer atlandı).`,
      result,
    });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});

/**
 * POST /api/v1/e-documents/incoming/:id/convert
 * Gelen e-Faturayı Alış Faturasına Dönüştürür
 */
v1EDocumentsRouter.post('/incoming/:id/convert', requirePermission(PERMISSIONS.INVOICES_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    const invoice = await IncomingInvoiceService.convertToPurchaseInvoice(
      String(req.params.id),
      tenantId,
      user.id,
      user.fullName || user.username
    );
    res.status(201).json({
      success: true,
      message: 'Gelen fatura başarıyla alış faturasına dönüştürüldü.',
      invoice,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/v1/e-documents/incoming/:id/respond
 * Gelen faturayı kabul veya reddeder
 */
v1EDocumentsRouter.post('/incoming/:id/respond', requirePermission(PERMISSIONS.EINVOICE_VIEW), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { action = 'ACCEPTED', reason } = req.body;

  try {
    const updated = await IncomingInvoiceService.respondToInvoice(
      String(req.params.id),
      tenantId,
      action,
      reason,
      user.id,
      user.fullName || user.username
    );
    res.json({ success: true, message: `Gelen fatura durumu '${action}' olarak güncellendi.`, invoice: updated });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});
