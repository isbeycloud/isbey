import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { Waybill, StockMovement } from '../../db/schema';
import { DocumentConversionService } from '../../services/documentConversionService';

export const v1WaybillsRouter = Router();

v1WaybillsRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/waybills
 */
v1WaybillsRouter.get('/', requirePermission(PERMISSIONS.WAYBILLS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { page = '1', limit = '25', status, type, search = '' } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  let list = (db.waybills || []).filter(
    w => (w.tenantId === tenantId || (tenantId === 'tnt-isbey' && !w.tenantId))
  );

  if (status && status !== 'ALL') {
    list = list.filter(w => w.status === status);
  }

  if (type && type !== 'ALL') {
    list = list.filter(w => w.type === type);
  }

  if (search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(
      w =>
        w.waybillNo?.toLowerCase().includes(s) ||
        w.customerTitle?.toLowerCase().includes(s)
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
 * POST /api/v1/waybills
 * İrsaliye oluşturma ve fiili stok düşümü
 */
v1WaybillsRouter.post('/', requirePermission(PERMISSIONS.WAYBILLS_CREATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();

  const {
    type = 'SALES_DESPATCH',
    customerId,
    shipmentDate,
    warehouseId,
    carrierTitle,
    plateNumber,
    driverName,
    items = [],
    notes,
  } = req.body;

  const customer = (db.customers || []).find(
    c => c.id === customerId && (c.tenantId === tenantId || (tenantId === 'tnt-isbey' && !c.tenantId))
  );
  if (!customer) return res.status(400).json({ success: false, message: 'Cari hesap bulunamadı.' });

  const now = new Date().toISOString();
  const waybillNo = storage.getNextSequence('WAYBILL');
  const waybillId = `wb-${Date.now()}`;
  const whId = warehouseId || 'wh-default';

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

    return {
      id: `wbi-${Date.now()}-${i}`,
      productId: it.productId,
      productCode: it.productCode || '',
      productName: it.productName || '',
      quantity: qty,
      unit: it.unit || 'Adet',
      unitPrice: price,
      discount1: d1,
      discount2: d2,
      vatRate: vatR,
      lineTotal: net,
      lineGrandTotal: net + vat,
    };
  });

  const newWaybill: Waybill = {
    id: waybillId,
    tenantId,
    waybillNo,
    type,
    customerId: customer.id,
    customerCode: customer.code,
    customerTitle: customer.title,
    date: now.slice(0, 10),
    shipmentDate: shipmentDate || now.slice(0, 10),
    warehouseId: whId,
    status: 'PENDING',
    carrierTitle,
    plateNumber,
    driverName,
    notes,
    items: formattedItems,
    userId: user.id,
    createdAt: now,
    updatedAt: now,
  };

  if (!db.waybills) db.waybills = [];
  db.waybills.push(newWaybill);

  // Fiili stok hareketi oluştur
  const isSales = type === 'SALES_DESPATCH';
  for (const item of formattedItems) {
    const prod = (db.products || []).find(p => p.id === item.productId);
    if (prod) {
      if (isSales) {
        prod.currentStock = (prod.currentStock || 0) - item.quantity;
      } else {
        prod.currentStock = (prod.currentStock || 0) + item.quantity;
      }
      prod.updatedAt = now;

      const sm: StockMovement = {
        id: `sm-wb-${Date.now()}-${item.productId}`,
        tenantId,
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        warehouseId: whId,
        documentNo: waybillNo,
        documentType: 'WAYBILL',
        documentId: waybillId,
        movementType: isSales ? 'WAYBILL_OUT' : 'WAYBILL_IN',
        quantity: item.quantity,
        direction: isSales ? 'OUT' : 'IN',
        unitPrice: item.unitPrice,
        totalAmount: item.lineTotal,
        currency: 'TRY',
        date: now.slice(0, 10),
        userId: user.id,
        createdBy: user.fullName || user.username,
        createdAt: now,
      };
      if (!db.stockMovements) db.stockMovements = [];
      db.stockMovements.push(sm);
    }
  }

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'WAYBILL_CREATED',
    module: 'WAYBILLS',
    documentNo: waybillNo,
    ipAddress: req.ip || '127.0.0.1',
    details: `${customer.title} adına ${type} irsaliyesi (${waybillNo}) düzenlendi.`,
  });

  storage.save();
  res.status(201).json({ success: true, waybill: newWaybill });
});

/**
 * POST /api/v1/waybills/:id/convert-to-invoice
 */
v1WaybillsRouter.post('/:id/convert-to-invoice', requirePermission(PERMISSIONS.INVOICES_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    const invoice = await DocumentConversionService.convertWaybillToInvoice(
      String(req.params.id),
      tenantId,
      user.id,
      user.fullName || user.username
    );
    res.json({ success: true, invoice });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
