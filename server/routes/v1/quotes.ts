import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { Quote } from '../../db/schema';
import { DocumentConversionService } from '../../services/documentConversionService';

export const v1QuotesRouter = Router();

v1QuotesRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/quotes
 */
v1QuotesRouter.get('/', requirePermission(PERMISSIONS.QUOTES_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { page = '1', limit = '25', status, search = '' } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  let list = (db.quotes || []).filter(
    q => (q.tenantId === tenantId || (tenantId === 'tnt-isbey' && !q.tenantId))
  );

  if (status && status !== 'ALL') {
    list = list.filter(q => q.status === status);
  }

  if (search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(
      q =>
        q.quoteNo?.toLowerCase().includes(s) ||
        q.customerTitle?.toLowerCase().includes(s)
    );
  }

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
 * POST /api/v1/quotes
 */
v1QuotesRouter.post('/', requirePermission(PERMISSIONS.QUOTES_CREATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();

  const { customerId, validUntil, items = [], termsAndConditions, paymentTerms, deliveryTerms, notes } = req.body;

  const customer = (db.customers || []).find(
    c => c.id === customerId && (c.tenantId === tenantId || (tenantId === 'tnt-isbey' && !c.tenantId))
  );
  if (!customer) return res.status(400).json({ success: false, message: 'Cari hesap bulunamadı.' });

  const now = new Date().toISOString();
  const quoteNo = storage.getNextSequence('QUOTE');
  const quoteId = `quote-${Date.now()}`;

  let subTotal = 0;
  let totalDiscount = 0;
  let totalVat = 0;

  const formattedItems = items.map((it: any, i: number) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.unitPrice) || 0;
    const vatR = it.vatRate !== undefined ? Number(it.vatRate) : 20;
    const d1 = Number(it.discount1) || 0;
    const d2 = Number(it.discount2) || 0;

    const raw = qty * price;
    const d1A = raw * (d1 / 100);
    const afterD1 = raw - d1A;
    const d2A = afterD1 * (d2 / 100);
    const disc = d1A + d2A;
    const net = raw - disc;
    const vat = net * (vatR / 100);

    subTotal += net;
    totalDiscount += disc;
    totalVat += vat;

    return {
      id: `qi-${Date.now()}-${i}`,
      productId: it.productId,
      productCode: it.productCode || '',
      productName: it.productName || '',
      quantity: qty,
      unit: it.unit || 'Adet',
      unitPrice: price,
      discount1: d1,
      discount2: d2,
      vatRate: vatR,
      vatAmount: vat,
      lineTotal: net,
      lineGrandTotal: net + vat,
    };
  });

  const grandTotal = subTotal + totalVat;

  const newQuote: Quote = {
    id: quoteId,
    tenantId,
    quoteNo,
    type: 'SALES_QUOTE',
    customerId: customer.id,
    customerCode: customer.code,
    customerTitle: customer.title,
    date: now.slice(0, 10),
    validUntil: validUntil || now.slice(0, 10),
    subTotal: Math.round(subTotal * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    status: 'SENT',
    termsAndConditions,
    paymentTerms,
    deliveryTerms,
    notes,
    items: formattedItems,
    userId: user.id,
    createdAt: now,
    updatedAt: now,
  };

  if (!db.quotes) db.quotes = [];
  db.quotes.push(newQuote);

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'QUOTE_CREATED',
    module: 'QUOTES',
    documentNo: quoteNo,
    ipAddress: req.ip || '127.0.0.1',
    details: `${customer.title} adına ${grandTotal} TL tutarında teklif (${quoteNo}) hazırlandı.`,
  });

  storage.save();
  res.status(201).json({ success: true, quote: newQuote });
});

/**
 * POST /api/v1/quotes/:id/convert-to-order
 */
v1QuotesRouter.post('/:id/convert-to-order', requirePermission(PERMISSIONS.QUOTES_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    const order = await DocumentConversionService.convertQuoteToOrder(
      String(req.params.id),
      tenantId,
      user.id,
      user.fullName || user.username
    );
    res.json({ success: true, order });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
