import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { DocumentConversionService } from '../../services/documentConversionService';
import { resolveInvoiceRecipient } from '../../services/invoiceRecipientService';
import { isOwnedBy } from '../../security/tenantOwnership';
import {
  parseDateRange,
  normalizeTaxNumber,
  tenantCustomerTaxMap,
  resolveCounterpartyTaxNumber,
  attachCounterpartyTaxNumber,
} from '../../utils/documentQuery';

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
    taxNumber,
    invoiceNo,
    titleOnly,
    sort = 'date',
    order = 'desc',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  // Tarih doğrulaması: geçersiz biçim veya ters aralık 400 döner (sessiz yutma yok).
  const range = parseDateRange(startDate, endDate);
  if ('error' in range) {
    return res.status(400).json({ success: false, message: range.error });
  }

  const db = storage.getState();
  // Karşı-taraf VKN'si için tek harita: hem filtrede hem yanıtta AYNI kaynak kullanılır.
  const taxMap = tenantCustomerTaxMap(db.customers || [], tenantId);
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

  if (range.startDate) {
    list = list.filter(inv => String(inv.date || '').slice(0, 10) >= range.startDate!);
  }

  if (range.endDate) {
    // Bitiş günü DAHİL: damga taşıyan kayıtlar da ('2026-10-06T10:00') eşleşir.
    list = list.filter(inv => String(inv.date || '').slice(0, 10) <= range.endDate!);
  }

  if (invoiceNo?.trim()) {
    const n = invoiceNo.trim().toLowerCase();
    list = list.filter(inv => inv.invoiceNo?.toLowerCase().includes(n));
  }

  if (taxNumber?.trim()) {
    // ⚠️ Karşı taraf VKN'si yöne göre çözülür (bkz. utils/documentQuery).
    const wanted = normalizeTaxNumber(taxNumber);
    if (wanted) {
      list = list.filter(inv => resolveCounterpartyTaxNumber(inv, taxMap) === wanted);
    }
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    // titleOnly=1 ise YALNIZ unvan; aksi halde belge no + unvan + kod (mevcut davranış).
    const titleOnlyMode = titleOnly === '1' || titleOnly === 'true';
    list = list.filter(
      inv =>
        inv.customerTitle?.toLowerCase().includes(q) ||
        (!titleOnlyMode && (
          inv.invoiceNo?.toLowerCase().includes(q) ||
          inv.customerCode?.toLowerCase().includes(q)
        ))
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
  // Sayfadaki her belgeye karşı-taraf VKN'sini ekle (filtreyle AYNI harita).
  const paginated = list
    .slice(startIndex, startIndex + limitNum)
    .map(inv => attachCounterpartyTaxNumber(inv, taxMap));

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
    // 2026-10-17 GÜVENLİK: Cari SAHİPLİK tek kaynaktan (`isOwnedBy`) — elle
    // yazılmış `c.tenantId === tenantId` karşılaştırması eski (tenantId alanı
    // boş) kayıtları yok sayıyordu.
    const customer = storage.getState().customers.find(c => c.id === req.body.customerId && isOwnedBy(c, tenantId));
    if (!customer) throw new Error('Cari hesap bulunamadı.');
    const recipient = (req.body.type || 'SALES') === 'SALES' ? await resolveInvoiceRecipient(customer.taxNumber || '', tenantId, req.body.invoiceProfile) : undefined;
    // NOT: `...req.body` ÖNCE yayılır, sahiplik alanları SONRA yazılır — gövde
    // `tenantId`/`userId` EZEMEZ. Depo ise `createInvoice` içindeki depo
    // kapısından geçer (`assertOwnedWarehouse`); gövdeden gelen `warehouseId`
    // sahiplik kanıtı sayılmaz.
    const invoice = await DocumentConversionService.createInvoice({
      ...req.body,
      tenantId,
      ...(recipient ? { invoiceProfile: recipient.profile, recipientTaxNumber: recipient.identifier, recipientAliasGB: recipient.aliasGB } : {}),
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.status(201).json({ success: true, invoice });
  } catch (err: any) {
    // Depo kapısı hatası kendi kodunu korur (403/400).
    res.status(err?.statusCode || 400).json({ success: false, code: err?.code, message: err.message });
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
