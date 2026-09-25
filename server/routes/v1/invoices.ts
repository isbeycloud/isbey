import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { DocumentConversionService } from '../../services/documentConversionService';

export const v1InvoicesRouter = Router();

v1InvoicesRouter.use(requireAuth, resolveTenant);

// Only an unsent draft's recipient address can be changed through this endpoint.
v1InvoicesRouter.patch('/:id/recipient-address', requirePermission(PERMISSIONS.INVOICES_UPDATE), async (req: Request, res: Response) => {
  const keys = ['StreetName', 'CityName', 'CitySubdivisionName', 'CountryName'] as const;
  if (keys.some(key => typeof req.body?.[key] !== 'string' || !req.body[key].trim() || req.body[key].length > 500)) {
    return res.status(400).json({ success: false, message: 'Açık adres, il, ilçe ve ülke gereklidir.' });
  }
  const patch = Object.fromEntries(keys.map(key => [key, req.body[key].trim()]));
  try {
    const result = await storage.runTransaction(draft => {
      const invoice = draft.invoices.find(i => i.id === req.params.id && i.tenantId === req.tenantId && !i.isDeleted);
      if (!invoice) return { status: 404, message: 'Fatura bulunamadı.' };
      const model = (invoice as any).hizliModel;
      if (invoice.status !== 'DRAFT' || invoice.eInvoiceStatus !== 'DRAFT' || !model?.customer) {
        return { status: 409, message: 'Yalnız gönderilmemiş fatura taslağının adresi değiştirilebilir.' };
      }
      Object.assign(model.customer, patch);
      invoice.updatedAt = new Date().toISOString();
      return { status: 200, message: 'Taslak alıcı adresi güncellendi.' };
    });
    if (result.status === 200) storage.addAuditLog({ userId: req.user!.id, username: req.user!.username,
      companyId: req.tenantId, action: 'UPDATE', module: 'INVOICE', ipAddress: req.ip || '',
      details: `${req.params.id} taslağının alıcı adresi güncellendi.` });
    return res.status(result.status).json({ success: result.status === 200, message: result.message });
  } catch {
    return res.status(500).json({ success: false, message: 'Adres kaydedilemedi.' });
  }
});

/**
 * GET /api/v1/invoices
 * Sayfalanmış faturalar listesi
 */
v1InvoicesRouter.get('/', requirePermission(PERMISSIONS.INVOICES_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const {
    page = '1',
    limit = '25',
    type,
    status,
    paymentStatus,
    customerId,
    search = '',
    startDate,
    endDate,
    sort = 'date',
    order = 'desc',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  let list = (db.invoices || []).filter(
    inv => (inv.tenantId === tenantId || (tenantId === 'tnt-isbey' && !inv.tenantId)) && !inv.isDeleted
  );

  if (type && type !== 'ALL') {
    list = list.filter(inv => inv.type === type);
  }

  if (status && status !== 'ALL') {
    list = list.filter(inv => inv.status === status);
  }

  if (paymentStatus && paymentStatus !== 'ALL') {
    list = list.filter(inv => inv.paymentStatus === paymentStatus);
  }

  if (customerId) {
    list = list.filter(inv => inv.customerId === customerId);
  }

  if (startDate) {
    list = list.filter(inv => inv.date >= startDate);
  }

  if (endDate) {
    list = list.filter(inv => inv.date <= endDate);
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      inv =>
        inv.invoiceNo?.toLowerCase().includes(q) ||
        inv.customerTitle?.toLowerCase().includes(q) ||
        inv.customerCode?.toLowerCase().includes(q)
    );
  }

  list.sort((a: any, b: any) => {
    const valA = a[sort] ?? '';
    const valB = b[sort] ?? '';
    if (typeof valA === 'number' && typeof valB === 'number') {
      return order === 'desc' ? valB - valA : valA - valB;
    }
    return order === 'desc'
      ? String(valB).localeCompare(String(valA), 'tr')
      : String(valA).localeCompare(String(valB), 'tr');
  });

  const total = list.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = list.slice(startIndex, startIndex + limitNum);

  const summary = {
    totalInvoices: list.length,
    totalGrandTotal: list.reduce((s, inv) => s + (inv.grandTotal || 0), 0),
    totalPaid: list.reduce((s, inv) => s + (inv.paidAmount || 0), 0),
    totalUnpaid: list.reduce((s, inv) => s + ((inv.grandTotal || 0) - (inv.paidAmount || 0)), 0),
  };

  res.json({
    success: true,
    data: paginated,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
    summary,
  });
});

/**
 * POST /api/v1/invoices
 * Satış veya Alış Faturası Oluştur
 */
v1InvoicesRouter.post('/', requirePermission(PERMISSIONS.INVOICES_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    const invoice = await DocumentConversionService.createInvoice({
      tenantId,
      ...req.body,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.status(201).json({ success: true, invoice });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/v1/invoices/:id
 * Fatura detayları
 */
v1InvoicesRouter.get('/:id', requirePermission(PERMISSIONS.INVOICES_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const invoice = (db.invoices || []).find(
    inv => inv.id === req.params.id && (inv.tenantId === tenantId || (tenantId === 'tnt-isbey' && !inv.tenantId))
  );

  if (!invoice) return res.status(404).json({ success: false, message: 'Fatura bulunamadı.' });

  res.json({ success: true, invoice });
});

/**
 * POST /api/v1/invoices/:id/cancel
 * Fatura iptali ve ters kayıt
 */
v1InvoicesRouter.post('/:id/cancel', requirePermission(PERMISSIONS.INVOICES_DELETE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { reason = 'Kullanıcı talebi ile iptal' } = req.body;

  try {
    const invoice = await DocumentConversionService.cancelInvoice(
      String(req.params.id),
      tenantId,
      reason,
      user.id,
      user.fullName || user.username
    );
    res.json({ success: true, message: 'Fatura başarıyla iptal edildi.', invoice });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
