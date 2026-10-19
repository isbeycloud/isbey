import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { Quote, Order, QuoteItem, OrderItem, Invoice, InvoiceItem, Waybill, WaybillItem } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';
import {
  isOwnedBy,
  filterOwned,
  assertOwnedWarehouse,
  stockMovementOwnedFields,
  WarehouseGateError,
} from '../security/tenantOwnership';

const router = Router();

// 2026-10-17 GÜVENLİK: Bu router'da kimlik doğrulaması ve firma çözümlemesi
// YOKTU — `tenantId` dizesi dosyada hiç geçmiyordu. Sonuç: bir firmanın
// kullanıcısı başka firmanın teklifini/siparişini okuyup dönüştürebiliyor,
// oluşan fatura/irsaliye SAHİPSİZ doğuyor ve stok, sahipsiz depo kimliğiyle
// (`'wh-1'` — canlıda VAR OLMAYAN) düşüyordu. Artık her istek kimlik + firma
// ile gelir ve her okuma/yazma sahiplikle süzülür.
router.use(requireAuth);
router.use(resolveTenant);

/**
 * Dönüştürme yollarında hedef depoyu SUNUCU kararıyla belirler.
 *
 * 2026-10-17: Eski hâlde hedef `draft.warehouses[0]?.id || 'wh-1'` idi —
 * filtresiz (başka firmanın deposu olabilir) ve canlıda var olmayan bir
 * kimlik. Yeni kural:
 *   - İstekte `warehouseId` varsa yalnız o kullanılır (sahiplik kapıdan geçer).
 *   - İstekte yoksa ve firmanın TEK yazılabilir deposu varsa o kullanılır.
 *   - İstekte yoksa ve firmanın birden çok deposu varsa belirsizlik AÇIK hata
 *     verir; hiçbir koşulda başka depoya / başka firmaya düşülmez.
 */
function resolveTargetWarehouseId(
  warehouses: import('../db/schema').Warehouse[] | undefined,
  requested: unknown,
  tenantId: string
): string {
  if (typeof requested === 'string' && requested.trim() !== '') return requested.trim();
  const owned = (warehouses || []).filter(w => isOwnedBy(w, tenantId));
  if (owned.length === 1) return owned[0].id;
  throw new WarehouseGateError({
    ok: false,
    code: 'WAREHOUSE_ID_REQUIRED',
    message:
      owned.length === 0
        ? 'Bu firma için tanımlı depo yok. İşlem için önce bir depo tanımlayın.'
        : 'Birden çok depo tanımlı. Lütfen işlem için depo seçiniz.',
  });
}

// ==========================================
// 1. QUOTES (TEKLİFLER)
// ==========================================

router.get('/', (req: Request, res: Response) => {
  try {
    const { type, status, customerId } = req.query;
    const tenantId = req.tenantId!;
    const db = storage.getState();
    // 2026-10-17: Liste SAHİPLİKLE süzülür (eski hâlde filtresizdi → IDOR).
    let quotes = filterOwned(db.quotes || [], tenantId);
    if (type && type !== 'ALL') quotes = quotes.filter(q => q.type === type);
    if (status && status !== 'ALL') quotes = quotes.filter(q => q.status === status);
    if (customerId) quotes = quotes.filter(q => q.customerId === customerId);
    quotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ success: true, quotes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const tenantId = req.tenantId!;
    const quote = (db.quotes || []).find(q => q.id === req.params.id && isOwnedBy(q, tenantId));
    if (!quote) return res.status(404).json({ success: false, message: 'Teklif bulunamadi.' });
    res.json({ success: true, quote });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { type = 'SALES_QUOTE', customerId, date = new Date().toISOString().split('T')[0], validUntil, termsAndConditions, paymentTerms, deliveryTerms, notes, items = [] } = req.body;
    const tenantId = req.tenantId!;
    const actingUserId = req.user?.id || 'system';
    const result = await storage.runTransaction(async draft => {
      const customer = draft.customers.find(c => c.id === customerId && isOwnedBy(c, tenantId) && !c.deletedAt);
      if (!customer) throw new Error('Cari bulunamadi.');
      const quoteNo = storage.nextSequenceInTransaction(draft, type);
      let subTotal = 0, totalDiscount = 0, totalVat = 0;
      const processedItems: QuoteItem[] = items.map((item: any) => {
        const product = draft.products.find(p => p.id === item.productId && isOwnedBy(p, tenantId));
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || product?.salePrice || 0;
        const disc1 = Number(item.discount1) || 0;
        const disc2 = Number(item.discount2) || 0;
        const vatRate = Number(item.vatRate ?? product?.vatRate ?? 20);
        const baseTotal = qty * unitPrice;
        const afterDisc = baseTotal * (1 - disc1 / 100) * (1 - disc2 / 100);
        const discAmount = baseTotal - afterDisc;
        const vatAmount = Math.round(afterDisc * (vatRate / 100) * 100) / 100;
        const lineTotal = Math.round(afterDisc * 100) / 100;
        const lineGrandTotal = Math.round((lineTotal + vatAmount) * 100) / 100;
        subTotal += lineTotal;
        totalDiscount += discAmount;
        totalVat += vatAmount;
        return { id: 'qi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: item.productId, productCode: item.productCode || product?.code || '', productName: item.productName || product?.name || '', quantity: qty, unit: item.unit || product?.unit || 'Adet', unitPrice, discount1: disc1, discount2: disc2, vatRate, vatAmount, lineTotal, lineGrandTotal, priceListId: typeof item.priceListId === 'string' && item.priceListId.trim() ? item.priceListId.trim() : undefined };
      });
      const grandTotal = Math.round((subTotal + totalVat) * 100) / 100;
      // 2026-10-17: `tenantId` yazılır ve `userId` gerçek kullanıcıdır.
      const newQuote: Quote = { id: 'quote-' + Date.now(), tenantId, quoteNo, type, customerId, customerCode: customer.code, customerTitle: customer.title, date, validUntil: validUntil || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0], subTotal: Math.round(subTotal * 100) / 100, totalDiscount: Math.round(totalDiscount * 100) / 100, totalVat: Math.round(totalVat * 100) / 100, grandTotal, status: 'SENT', termsAndConditions, paymentTerms, deliveryTerms, notes, items: processedItems, userId: actingUserId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.quotes.unshift(newQuote);
      storage.addAuditLog({ userId: actingUserId, username: req.user?.username || 'system', action: 'CREATE', module: 'TEKLIF', documentNo: quoteNo, ipAddress: req.ip || '127.0.0.1', details: quoteNo + ' - ' + customer.title + ' - ' + grandTotal.toLocaleString('tr-TR') + ' TL' });
      return newQuote;
    });
    res.json({ success: true, message: 'Teklif basariyla kaydedildi.', quote: result });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

// PATCH /api/quotes/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const tenantId = req.tenantId!;
    const result = await storage.runTransaction(async draft => {
      const quote = draft.quotes.find(q => q.id === req.params.id && isOwnedBy(q, tenantId));
      if (!quote) throw new Error('Teklif bulunamadi.');
      if (quote.status === 'CONVERTED') throw new Error('Donusturulmus teklif durumu degistirilemez.');
      quote.status = status;
      quote.updatedAt = new Date().toISOString();
      return quote;
    });
    res.json({ success: true, message: 'Teklif durumu guncellendi.', quote: result });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

// POST /api/quotes/:id/convert-to-order
router.post('/:id/convert-to-order', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const actingUserId = req.user?.id || 'system';
    const result = await storage.runTransaction(async draft => {
      // 2026-10-17: Teklif ve cari SAHİPLİKLE aranır (eskiden filtresizdi).
      const quote = draft.quotes.find(q => q.id === req.params.id && isOwnedBy(q, tenantId));
      if (!quote) throw new Error('Teklif bulunamadi.');
      if (quote.status === 'CONVERTED') throw new Error('Bu teklif zaten donusturulmustur.');
      if (quote.status === 'CANCELLED') throw new Error('Iptal edilmis teklif donusturulemez.');
      const customer = draft.customers.find(c => c.id === quote.customerId && isOwnedBy(c, tenantId));
      if (!customer) throw new Error('Cari kart bulunamadi.');
      // 2026-10-17: Hedef depo sunucu kararıyla belirlenir (bkz. resolveTargetWarehouseId).
      const orderWhId = resolveTargetWarehouseId(draft.warehouses, req.body.warehouseId, tenantId);
      const orderWarehouse = assertOwnedWarehouse(draft.warehouses, orderWhId, tenantId);
      const orderType = quote.type === 'SALES_QUOTE' ? 'SALES_ORDER' : 'PURCHASE_ORDER';
      const orderNo = storage.nextSequenceInTransaction(draft, orderType);
      const orderItems: OrderItem[] = quote.items.map(qi => ({ id: 'oi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: qi.productId, productCode: qi.productCode, productName: qi.productName, orderedQuantity: qi.quantity, shippedQuantity: 0, remainingQuantity: qi.quantity, unit: qi.unit, unitPrice: qi.unitPrice, discount1: qi.discount1, discount2: qi.discount2, vatRate: qi.vatRate, vatAmount: qi.vatAmount, lineTotal: qi.lineTotal, lineGrandTotal: qi.lineGrandTotal }));
      const deliveryDate = req.body.deliveryDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const newOrder: Order = { id: 'ord-' + Date.now(), tenantId, orderNo, type: orderType, customerId: quote.customerId, customerCode: quote.customerCode, customerTitle: quote.customerTitle, date: new Date().toISOString().split('T')[0], deliveryDate, subTotal: quote.subTotal, totalDiscount: quote.totalDiscount, totalVat: quote.totalVat, grandTotal: quote.grandTotal, status: 'CONFIRMED', warehouseId: orderWarehouse.id, sourceQuoteId: quote.id, sourceQuoteNo: quote.quoteNo, notes: 'Teklif No: ' + quote.quoteNo + ' uzerinden olusturuldu.', items: orderItems, userId: actingUserId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.orders.unshift(newOrder);
      quote.status = 'CONVERTED';
      quote.convertedOrderId = newOrder.id;
      quote.convertedOrderNo = orderNo;
      quote.updatedAt = new Date().toISOString();
      storage.addAuditLog({ userId: actingUserId, username: req.user?.username || 'system', action: 'CREATE', module: 'SIPARIS', documentNo: orderNo, ipAddress: req.ip || '127.0.0.1', details: quote.quoteNo + ' teklifi ' + orderNo + ' siparisine donusturuldu.' });
      return { quote, order: newOrder };
    });
    res.json({ success: true, message: 'Teklif basariyla siparise donusturuldu!', data: result });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

// POST /api/quotes/:id/convert-to-invoice
router.post('/:id/convert-to-invoice', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const actingUserId = req.user?.id || 'system';
    const result = await storage.runTransaction(async draft => {
      // 2026-10-17: Teklif ve cari SAHİPLİKLE aranır (eskiden filtresizdi).
      const quote = draft.quotes.find(q => q.id === req.params.id && isOwnedBy(q, tenantId));
      if (!quote) throw new Error('Teklif bulunamadi.');
      if (quote.status === 'CONVERTED') throw new Error('Bu teklif zaten donusturulmustur.');
      const customer = draft.customers.find(c => c.id === quote.customerId && isOwnedBy(c, tenantId));
      if (!customer) throw new Error('Cari kart bulunamadi.');
      // 2026-10-17: Hedef depo ZORUNLU ve sahiplikli (eskiden `'wh-1'` fallback'i vardı).
      const invoiceWhId = resolveTargetWarehouseId(draft.warehouses, req.body.warehouseId, tenantId);
      const invoiceWarehouse = assertOwnedWarehouse(draft.warehouses, invoiceWhId, tenantId);
      const invoiceType = quote.type === 'SALES_QUOTE' ? 'SALES' : 'PURCHASE';
      const seqType = invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE';
      const invoiceNo = storage.nextSequenceInTransaction(draft, seqType);
      const invoiceId = 'inv-' + Date.now();
      const invoiceItems: InvoiceItem[] = quote.items.map(qi => ({ id: 'ii-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), invoiceId, productId: qi.productId, productCode: qi.productCode, productName: qi.productName, quantity: qi.quantity, unit: qi.unit, unitPrice: qi.unitPrice, discount1: qi.discount1, discount2: qi.discount2, discountAmount: (qi.quantity * qi.unitPrice) - qi.lineTotal, vatRate: qi.vatRate, vatAmount: qi.vatAmount, vatIncluded: false, lineTotal: qi.lineTotal, lineGrandTotal: qi.lineGrandTotal }));
      // Stock check for SALES
      if (invoiceType === 'SALES') {
        for (const item of invoiceItems) {
          const prod = draft.products.find(p => p.id === item.productId && isOwnedBy(p, tenantId));
          if (prod && prod.currentStock < item.quantity) throw new Error('Yetersiz stok: ' + prod.name + ' (Mevcut: ' + prod.currentStock + ', Istenen: ' + item.quantity + ')');
        }
      }
      const newInvoice: Invoice = { id: invoiceId, tenantId, companyId: tenantId, invoiceNo, type: invoiceType, status: 'ACTIVE', customerId: quote.customerId, customerCode: quote.customerCode, customerTitle: quote.customerTitle, date: new Date().toISOString().split('T')[0], maturityDate: new Date(Date.now() + (customer.maturityDays || 30) * 86400000).toISOString().split('T')[0], subTotal: quote.subTotal, totalDiscount: quote.totalDiscount, totalVat: quote.totalVat, grandTotal: quote.grandTotal, paidAmount: 0, paymentStatus: 'UNPAID', paymentType: 'OPEN_ACCOUNT', warehouseId: invoiceWarehouse.id, notes: 'Teklif No: ' + quote.quoteNo + ' uzerinden faturalastirildi.', items: invoiceItems, sourceQuoteId: quote.id, sourceQuoteNo: quote.quoteNo, userId: actingUserId, isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.invoices.unshift(newInvoice);
      // Stock movements
      // 2026-10-17: Hareket sahiplik + DOĞRULANMIŞ depo taşır; eskiden
      // `warehouseId: newInvoice.warehouseId` (filtresiz `warehouses[0]`)
      // yazılıyor ve `tenantId` hiç atanmıyordu.
      for (const item of invoiceItems) {
        draft.stockMovements.push({ id: 'sm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), ...stockMovementOwnedFields(tenantId, invoiceWarehouse), productId: item.productId, productCode: item.productCode, productName: item.productName, documentNo: invoiceNo, documentId: invoiceId, documentType: 'INVOICE', movementType: invoiceType === 'SALES' ? 'SALE' : 'PURCHASE', quantity: item.quantity, direction: invoiceType === 'SALES' ? 'OUT' : 'IN', unitPrice: item.unitPrice, totalAmount: item.lineGrandTotal, date: newInvoice.date, userId: actingUserId, createdAt: new Date().toISOString() });
      }
      // Current transaction
      draft.currentTransactions.push({ id: 'ctx-' + Date.now(), tenantId, companyId: tenantId, customerId: quote.customerId, customerCode: quote.customerCode, customerTitle: quote.customerTitle, documentNo: invoiceNo, documentType: invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE', date: newInvoice.date, maturityDate: newInvoice.maturityDate, debit: invoiceType === 'SALES' ? quote.grandTotal : 0, credit: invoiceType === 'PURCHASE' ? quote.grandTotal : 0, balance: 0, description: invoiceNo + ' - Tekliften donusturuldu (' + quote.quoteNo + ')', relatedInvoiceId: invoiceId, userId: actingUserId, createdAt: new Date().toISOString() });
      quote.status = 'CONVERTED';
      quote.convertedInvoiceId = invoiceId;
      quote.convertedInvoiceNo = invoiceNo;
      quote.updatedAt = new Date().toISOString();
      storage.addAuditLog({ userId: actingUserId, username: req.user?.username || 'system', action: 'CREATE', module: 'FATURA', documentNo: invoiceNo, ipAddress: req.ip || '127.0.0.1', details: quote.quoteNo + ' teklifi ' + invoiceNo + ' faturasina donusturuldu.' });
      return { quote, invoice: newInvoice };
    });
    res.json({ success: true, message: 'Teklif basariyla faturaya donusturuldu!', data: result });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

// ==========================================
// 2. ORDERS (SİPARİŞLER)
// ==========================================

router.get('/orders/list', (req: Request, res: Response) => {
  try {
    const { type, status } = req.query;
    const tenantId = req.tenantId!;
    const db = storage.getState();
    // 2026-10-17: Liste SAHİPLİKLE süzülür (eski hâlde filtresizdi → IDOR).
    let orders = filterOwned(db.orders || [], tenantId);
    if (type && type !== 'ALL') orders = orders.filter(o => o.type === type);
    if (status && status !== 'ALL') orders = orders.filter(o => o.status === status);
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ success: true, orders });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/orders/:id', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const tenantId = req.tenantId!;
    const order = (db.orders || []).find(o => o.id === req.params.id && isOwnedBy(o, tenantId));
    if (!order) return res.status(404).json({ success: false, message: 'Siparis bulunamadi.' });
    res.json({ success: true, order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/orders', async (req: Request, res: Response) => {
  try {
    const { type = 'SALES_ORDER', customerId, date = new Date().toISOString().split('T')[0], deliveryDate, warehouseId, notes, items = [] } = req.body;
    const tenantId = req.tenantId!;
    const actingUserId = req.user?.id || 'system';
    // 2026-10-17 GÜVENLİK: Depo kapısı ÖNCE (transaction dışında). Eski hâlde
    // gövdeden gelen `warehouseId = 'wh-1'` varsayılanı filtreye girmeden
    // siparişe yazılıyordu: canlıda VAR OLMAYAN ve sahipsiz bir kimlik.
    const orderWhId = resolveTargetWarehouseId(storage.getState().warehouses, warehouseId, tenantId);
    assertOwnedWarehouse(storage.getState().warehouses, orderWhId, tenantId);
    const result = await storage.runTransaction(async draft => {
      const customer = draft.customers.find(c => c.id === customerId && isOwnedBy(c, tenantId) && !c.deletedAt);
      if (!customer) throw new Error('Cari bulunamadi.');
      const warehouse = assertOwnedWarehouse(draft.warehouses, orderWhId, tenantId);
      const orderNo = storage.nextSequenceInTransaction(draft, type);
      let subTotal = 0, totalDiscount = 0, totalVat = 0;
      const processedItems: OrderItem[] = items.map((item: any) => {
        const product = draft.products.find(p => p.id === item.productId && isOwnedBy(p, tenantId));
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || product?.salePrice || 0;
        const disc1 = Number(item.discount1) || 0;
        const disc2 = Number(item.discount2) || 0;
        const vatRate = Number(item.vatRate ?? product?.vatRate ?? 20);
        const baseTotal = qty * unitPrice;
        const afterDisc = baseTotal * (1 - disc1 / 100) * (1 - disc2 / 100);
        const vatAmount = Math.round(afterDisc * (vatRate / 100) * 100) / 100;
        const lineTotal = Math.round(afterDisc * 100) / 100;
        const lineGrandTotal = Math.round((lineTotal + vatAmount) * 100) / 100;
        subTotal += lineTotal;
        totalDiscount += baseTotal - afterDisc;
        totalVat += vatAmount;
        return { id: 'oi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: item.productId, productCode: item.productCode || product?.code || '', productName: item.productName || product?.name || '', orderedQuantity: qty, shippedQuantity: 0, remainingQuantity: qty, unit: item.unit || product?.unit || 'Adet', unitPrice, discount1: disc1, discount2: disc2, vatRate, vatAmount, lineTotal, lineGrandTotal, priceListId: typeof item.priceListId === 'string' && item.priceListId.trim() ? item.priceListId.trim() : undefined };
      });
      const grandTotal = Math.round((subTotal + totalVat) * 100) / 100;
      const newOrder: Order = { id: 'ord-' + Date.now(), tenantId, orderNo, type, customerId, customerCode: customer.code, customerTitle: customer.title, date, deliveryDate: deliveryDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], subTotal: Math.round(subTotal * 100) / 100, totalDiscount: Math.round(totalDiscount * 100) / 100, totalVat: Math.round(totalVat * 100) / 100, grandTotal, status: 'CONFIRMED', warehouseId: warehouse.id, notes, items: processedItems, userId: actingUserId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.orders.unshift(newOrder);
      storage.addAuditLog({ userId: actingUserId, username: req.user?.username || 'system', action: 'CREATE', module: 'SIPARIS', documentNo: orderNo, ipAddress: req.ip || '127.0.0.1', details: orderNo + ' - ' + customer.title });
      return newOrder;
    });
    res.json({ success: true, message: 'Siparis basariyla olusturuldu.', order: result });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

// POST /api/quotes/orders/:id/convert-to-waybill
router.post('/orders/:id/convert-to-waybill', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const actingUserId = req.user?.id || 'system';
    const result = await storage.runTransaction(async draft => {
      // 2026-10-17: Sipariş ve cari SAHİPLİKLE aranır (eskiden filtresizdi →
      // başka firmanın siparişi sevk edilebiliyordu, yazma IDOR'u).
      const order = draft.orders.find(o => o.id === req.params.id && isOwnedBy(o, tenantId));
      if (!order) throw new Error('Siparis bulunamadi.');
      if (order.status === 'CANCELLED') throw new Error('Iptal edilmis siparis islenemez.');
      if (order.status === 'COMPLETED') throw new Error('Tamamlanmis siparis tekrar sevk edilemez.');
      const customer = draft.customers.find(c => c.id === order.customerId && isOwnedBy(c, tenantId));
      if (!customer) throw new Error('Cari kart bulunamadi.');
      // 2026-10-17: Sevk deposu ZORUNLU ve sahiplikli. Siparişin taşıdığı
      // `warehouseId` canlıda VAR OLMAYAN bir kimlik olabilir (`'wh-1'` gibi);
      // bu durumda sessizce başka depoya düşülmez, açık hata verilir. Kullanıcı
      // bilinçli olarak başka bir depo seçtiyse (gövdede `warehouseId`) o depo
      // kullanılır — ama o da kapıdan geçmek zorundadır; sahiplik asla
      // gövdeden gelmez, kapı SUNUCU kararıdır.
      const requestedWhId =
        typeof req.body.warehouseId === 'string' && req.body.warehouseId.trim() !== ''
          ? req.body.warehouseId
          : order.warehouseId;
      const waybillWhId = resolveTargetWarehouseId(draft.warehouses, requestedWhId, tenantId);
      const waybillWarehouse = assertOwnedWarehouse(draft.warehouses, waybillWhId, tenantId);
      const waybillNo = storage.nextSequenceInTransaction(draft, 'WAYBILL');
      const waybillId = 'wb-' + Date.now();
      // Support partial shipment: if shipQuantities provided, use them; else ship remaining
      const shipQuantities: Record<string, number> = req.body.shipQuantities || {};
      const waybillItems: WaybillItem[] = [];
      let hasAnyQty = false;
      for (const oi of order.items) {
        if (oi.remainingQuantity === undefined || oi.orderedQuantity === undefined) {
          throw new Error('Siparis sevk miktarlari tanimli degil: ' + oi.productName);
        }
        const shipQty = shipQuantities[oi.id || oi.productId] ?? oi.remainingQuantity;
        if (shipQty <= 0) continue;
        if (shipQty > oi.remainingQuantity) throw new Error('Sevk miktari kalan miktardan fazla olamaz: ' + oi.productName);
        hasAnyQty = true;
        // Validate stock for sales
        if (order.type === 'SALES_ORDER') {
          const prod = draft.products.find(p => p.id === oi.productId && isOwnedBy(p, tenantId));
          if (prod && prod.currentStock < shipQty) throw new Error('Yetersiz stok: ' + prod.name);
        }
        waybillItems.push({ id: 'wi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: oi.productId, productCode: oi.productCode, productName: oi.productName, quantity: shipQty, unit: oi.unit, unitPrice: oi.unitPrice, discount1: oi.discount1, discount2: oi.discount2, vatRate: oi.vatRate, lineTotal: Math.round(shipQty * oi.unitPrice * (1 - oi.discount1 / 100) * (1 - oi.discount2 / 100) * 100) / 100, lineGrandTotal: Math.round(shipQty * oi.unitPrice * (1 - oi.discount1 / 100) * (1 - oi.discount2 / 100) * (1 + oi.vatRate / 100) * 100) / 100 });
        // Update order item shipped quantities
        oi.shippedQuantity = (oi.shippedQuantity || 0) + shipQty;
        oi.remainingQuantity = oi.orderedQuantity - oi.shippedQuantity;
      }
      if (!hasAnyQty) throw new Error('Sevk edilecek urun bulunamadi.');
      const newWaybill: Waybill = { id: waybillId, tenantId, waybillNo, type: order.type === 'SALES_ORDER' ? 'SALES_DESPATCH' : 'PURCHASE_DESPATCH', customerId: order.customerId, customerCode: order.customerCode, customerTitle: order.customerTitle, date: new Date().toISOString().split('T')[0], shipmentDate: req.body.shipmentDate || new Date().toISOString().split('T')[0], warehouseId: waybillWarehouse.id, status: 'PENDING', carrierTitle: req.body.carrierTitle, plateNumber: req.body.plateNumber, driverName: req.body.driverName, sourceOrderId: order.id, sourceOrderNo: order.orderNo, notes: 'Siparis No: ' + order.orderNo + ' uzerinden olusturuldu.', items: waybillItems, userId: actingUserId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.waybills.unshift(newWaybill);
      // Stock movements
      // 2026-10-17: Hareket sahiplik + DOĞRULANMIŞ depo taşır (eskiden
      // `warehouseId: order.warehouseId` çözülmemiş kimlik olabiliyordu).
      for (const wi of waybillItems) {
        draft.stockMovements.push({ id: 'sm-wb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), ...stockMovementOwnedFields(tenantId, waybillWarehouse), productId: wi.productId, productCode: wi.productCode, productName: wi.productName, documentNo: waybillNo, documentId: waybillId, documentType: 'WAYBILL', movementType: order.type === 'SALES_ORDER' ? 'WAYBILL_OUT' : 'WAYBILL_IN', quantity: wi.quantity, direction: order.type === 'SALES_ORDER' ? 'OUT' : 'IN', unitPrice: wi.unitPrice, totalAmount: wi.lineTotal, date: newWaybill.shipmentDate, notes: 'Irsaliye: ' + waybillNo, userId: actingUserId, createdAt: new Date().toISOString() });
      }
      // Update order status
      const allShipped = order.items.every(oi => oi.remainingQuantity === 0);
      const someShipped = order.items.some(oi => (oi.shippedQuantity ?? 0) > 0);
      order.status = allShipped ? 'SHIPPED' : (someShipped ? 'PARTIALLY_SHIPPED' : order.status);
      order.updatedAt = new Date().toISOString();
      storage.addAuditLog({ userId: actingUserId, username: req.user?.username || 'system', action: 'CREATE', module: 'IRSALIYE', documentNo: waybillNo, ipAddress: req.ip || '127.0.0.1', details: order.orderNo + ' siparisi ' + waybillNo + ' irsaliyesine donusturuldu.' });
      return { order, waybill: newWaybill };
    });
    res.json({ success: true, message: 'Siparis basariyla irsaliyeye donusturuldu!', data: result });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

export default router;
