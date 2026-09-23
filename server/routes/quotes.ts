import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { Quote, Order, QuoteItem, OrderItem, Invoice, InvoiceItem, Waybill, WaybillItem } from '../db/schema';

const router = Router();

// ==========================================
// 1. QUOTES (TEKLİFLER)
// ==========================================

router.get('/', (req: Request, res: Response) => {
  try {
    const { type, status, customerId } = req.query;
    const db = storage.getState();
    let quotes = db.quotes || [];
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
    const quote = (db.quotes || []).find(q => q.id === req.params.id);
    if (!quote) return res.status(404).json({ success: false, message: 'Teklif bulunamadi.' });
    res.json({ success: true, quote });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { type = 'SALES_QUOTE', customerId, date = new Date().toISOString().split('T')[0], validUntil, termsAndConditions, paymentTerms, deliveryTerms, notes, items = [] } = req.body;
    const result = await storage.runTransaction(async draft => {
      const customer = draft.customers.find(c => c.id === customerId && !c.deletedAt);
      if (!customer) throw new Error('Cari bulunamadi.');
      const quoteNo = storage.nextSequenceInTransaction(draft, type);
      let subTotal = 0, totalDiscount = 0, totalVat = 0;
      const processedItems: QuoteItem[] = items.map((item: any) => {
        const product = draft.products.find(p => p.id === item.productId);
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
        return { id: 'qi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: item.productId, productCode: item.productCode || product?.code || '', productName: item.productName || product?.name || '', quantity: qty, unit: item.unit || product?.unit || 'Adet', unitPrice, discount1: disc1, discount2: disc2, vatRate, vatAmount, lineTotal, lineGrandTotal };
      });
      const grandTotal = Math.round((subTotal + totalVat) * 100) / 100;
      const newQuote: Quote = { id: 'quote-' + Date.now(), quoteNo, type, customerId, customerCode: customer.code, customerTitle: customer.title, date, validUntil: validUntil || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0], subTotal: Math.round(subTotal * 100) / 100, totalDiscount: Math.round(totalDiscount * 100) / 100, totalVat: Math.round(totalVat * 100) / 100, grandTotal, status: 'SENT', termsAndConditions, paymentTerms, deliveryTerms, notes, items: processedItems, userId: 'usr-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.quotes.unshift(newQuote);
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'TEKLIF', documentNo: quoteNo, ipAddress: '127.0.0.1', details: quoteNo + ' - ' + customer.title + ' - ' + grandTotal.toLocaleString('tr-TR') + ' TL' });
      return newQuote;
    });
    res.json({ success: true, message: 'Teklif basariyla kaydedildi.', quote: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PATCH /api/quotes/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const result = await storage.runTransaction(async draft => {
      const quote = draft.quotes.find(q => q.id === req.params.id);
      if (!quote) throw new Error('Teklif bulunamadi.');
      if (quote.status === 'CONVERTED') throw new Error('Donusturulmus teklif durumu degistirilemez.');
      quote.status = status;
      quote.updatedAt = new Date().toISOString();
      return quote;
    });
    res.json({ success: true, message: 'Teklif durumu guncellendi.', quote: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/quotes/:id/convert-to-order
router.post('/:id/convert-to-order', async (req: Request, res: Response) => {
  try {
    const result = await storage.runTransaction(async draft => {
      const quote = draft.quotes.find(q => q.id === req.params.id);
      if (!quote) throw new Error('Teklif bulunamadi.');
      if (quote.status === 'CONVERTED') throw new Error('Bu teklif zaten donusturulmustur.');
      if (quote.status === 'CANCELLED') throw new Error('Iptal edilmis teklif donusturulemez.');
      const customer = draft.customers.find(c => c.id === quote.customerId);
      if (!customer) throw new Error('Cari kart bulunamadi.');
      const orderType = quote.type === 'SALES_QUOTE' ? 'SALES_ORDER' : 'PURCHASE_ORDER';
      const orderNo = storage.nextSequenceInTransaction(draft, orderType);
      const orderItems: OrderItem[] = quote.items.map(qi => ({ id: 'oi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: qi.productId, productCode: qi.productCode, productName: qi.productName, orderedQuantity: qi.quantity, shippedQuantity: 0, remainingQuantity: qi.quantity, unit: qi.unit, unitPrice: qi.unitPrice, discount1: qi.discount1, discount2: qi.discount2, vatRate: qi.vatRate, vatAmount: qi.vatAmount, lineTotal: qi.lineTotal, lineGrandTotal: qi.lineGrandTotal }));
      const deliveryDate = req.body.deliveryDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const newOrder: Order = { id: 'ord-' + Date.now(), orderNo, type: orderType, customerId: quote.customerId, customerCode: quote.customerCode, customerTitle: quote.customerTitle, date: new Date().toISOString().split('T')[0], deliveryDate, subTotal: quote.subTotal, totalDiscount: quote.totalDiscount, totalVat: quote.totalVat, grandTotal: quote.grandTotal, status: 'CONFIRMED', warehouseId: draft.warehouses[0]?.id || 'wh-1', sourceQuoteId: quote.id, sourceQuoteNo: quote.quoteNo, notes: 'Teklif No: ' + quote.quoteNo + ' uzerinden olusturuldu.', items: orderItems, userId: 'usr-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.orders.unshift(newOrder);
      quote.status = 'CONVERTED';
      quote.convertedOrderId = newOrder.id;
      quote.convertedOrderNo = orderNo;
      quote.updatedAt = new Date().toISOString();
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'SIPARIS', documentNo: orderNo, ipAddress: '127.0.0.1', details: quote.quoteNo + ' teklifi ' + orderNo + ' siparisine donusturuldu.' });
      return { quote, order: newOrder };
    });
    res.json({ success: true, message: 'Teklif basariyla siparise donusturuldu!', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/quotes/:id/convert-to-invoice
router.post('/:id/convert-to-invoice', async (req: Request, res: Response) => {
  try {
    const result = await storage.runTransaction(async draft => {
      const quote = draft.quotes.find(q => q.id === req.params.id);
      if (!quote) throw new Error('Teklif bulunamadi.');
      if (quote.status === 'CONVERTED') throw new Error('Bu teklif zaten donusturulmustur.');
      const customer = draft.customers.find(c => c.id === quote.customerId);
      if (!customer) throw new Error('Cari kart bulunamadi.');
      const invoiceType = quote.type === 'SALES_QUOTE' ? 'SALES' : 'PURCHASE';
      const seqType = invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE';
      const invoiceNo = storage.nextSequenceInTransaction(draft, seqType);
      const invoiceId = 'inv-' + Date.now();
      const invoiceItems: InvoiceItem[] = quote.items.map(qi => ({ id: 'ii-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), invoiceId, productId: qi.productId, productCode: qi.productCode, productName: qi.productName, quantity: qi.quantity, unit: qi.unit, unitPrice: qi.unitPrice, discount1: qi.discount1, discount2: qi.discount2, discountAmount: (qi.quantity * qi.unitPrice) - qi.lineTotal, vatRate: qi.vatRate, vatAmount: qi.vatAmount, vatIncluded: false, lineTotal: qi.lineTotal, lineGrandTotal: qi.lineGrandTotal }));
      // Stock check for SALES
      if (invoiceType === 'SALES') {
        for (const item of invoiceItems) {
          const prod = draft.products.find(p => p.id === item.productId);
          if (prod && prod.currentStock < item.quantity) throw new Error('Yetersiz stok: ' + prod.name + ' (Mevcut: ' + prod.currentStock + ', Istenen: ' + item.quantity + ')');
        }
      }
      const newInvoice: Invoice = { id: invoiceId, invoiceNo, type: invoiceType, status: 'ACTIVE', customerId: quote.customerId, customerCode: quote.customerCode, customerTitle: quote.customerTitle, date: new Date().toISOString().split('T')[0], maturityDate: new Date(Date.now() + (customer.maturityDays || 30) * 86400000).toISOString().split('T')[0], subTotal: quote.subTotal, totalDiscount: quote.totalDiscount, totalVat: quote.totalVat, grandTotal: quote.grandTotal, paidAmount: 0, paymentStatus: 'UNPAID', paymentType: 'OPEN_ACCOUNT', warehouseId: draft.warehouses[0]?.id || 'wh-1', notes: 'Teklif No: ' + quote.quoteNo + ' uzerinden faturalastirildi.', items: invoiceItems, sourceQuoteId: quote.id, sourceQuoteNo: quote.quoteNo, userId: 'usr-1', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.invoices.unshift(newInvoice);
      // Stock movements
      for (const item of invoiceItems) {
        draft.stockMovements.push({ id: 'sm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: item.productId, productCode: item.productCode, productName: item.productName, warehouseId: newInvoice.warehouseId, documentNo: invoiceNo, documentId: invoiceId, documentType: 'INVOICE', movementType: invoiceType === 'SALES' ? 'SALE' : 'PURCHASE', quantity: item.quantity, direction: invoiceType === 'SALES' ? 'OUT' : 'IN', unitPrice: item.unitPrice, totalAmount: item.lineGrandTotal, date: newInvoice.date, userId: 'usr-1', createdAt: new Date().toISOString() });
      }
      // Current transaction
      draft.currentTransactions.push({ id: 'ctx-' + Date.now(), customerId: quote.customerId, customerCode: quote.customerCode, customerTitle: quote.customerTitle, documentNo: invoiceNo, documentType: invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE', date: newInvoice.date, maturityDate: newInvoice.maturityDate, debit: invoiceType === 'SALES' ? quote.grandTotal : 0, credit: invoiceType === 'PURCHASE' ? quote.grandTotal : 0, balance: 0, description: invoiceNo + ' - Tekliften donusturuldu (' + quote.quoteNo + ')', relatedInvoiceId: invoiceId, userId: 'usr-1', createdAt: new Date().toISOString() });
      quote.status = 'CONVERTED';
      quote.convertedInvoiceId = invoiceId;
      quote.convertedInvoiceNo = invoiceNo;
      quote.updatedAt = new Date().toISOString();
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'FATURA', documentNo: invoiceNo, ipAddress: '127.0.0.1', details: quote.quoteNo + ' teklifi ' + invoiceNo + ' faturasina donusturuldu.' });
      return { quote, invoice: newInvoice };
    });
    res.json({ success: true, message: 'Teklif basariyla faturaya donusturuldu!', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. ORDERS (SİPARİŞLER)
// ==========================================

router.get('/orders/list', (req: Request, res: Response) => {
  try {
    const { type, status } = req.query;
    const db = storage.getState();
    let orders = db.orders || [];
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
    const order = (db.orders || []).find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Siparis bulunamadi.' });
    res.json({ success: true, order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/orders', async (req: Request, res: Response) => {
  try {
    const { type = 'SALES_ORDER', customerId, date = new Date().toISOString().split('T')[0], deliveryDate, warehouseId = 'wh-1', notes, items = [] } = req.body;
    const result = await storage.runTransaction(async draft => {
      const customer = draft.customers.find(c => c.id === customerId && !c.deletedAt);
      if (!customer) throw new Error('Cari bulunamadi.');
      const orderNo = storage.nextSequenceInTransaction(draft, type);
      let subTotal = 0, totalDiscount = 0, totalVat = 0;
      const processedItems: OrderItem[] = items.map((item: any) => {
        const product = draft.products.find(p => p.id === item.productId);
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
        return { id: 'oi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: item.productId, productCode: item.productCode || product?.code || '', productName: item.productName || product?.name || '', orderedQuantity: qty, shippedQuantity: 0, remainingQuantity: qty, unit: item.unit || product?.unit || 'Adet', unitPrice, discount1: disc1, discount2: disc2, vatRate, vatAmount, lineTotal, lineGrandTotal };
      });
      const grandTotal = Math.round((subTotal + totalVat) * 100) / 100;
      const newOrder: Order = { id: 'ord-' + Date.now(), orderNo, type, customerId, customerCode: customer.code, customerTitle: customer.title, date, deliveryDate: deliveryDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], subTotal: Math.round(subTotal * 100) / 100, totalDiscount: Math.round(totalDiscount * 100) / 100, totalVat: Math.round(totalVat * 100) / 100, grandTotal, status: 'CONFIRMED', warehouseId, notes, items: processedItems, userId: 'usr-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.orders.unshift(newOrder);
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'SIPARIS', documentNo: orderNo, ipAddress: '127.0.0.1', details: orderNo + ' - ' + customer.title });
      return newOrder;
    });
    res.json({ success: true, message: 'Siparis basariyla olusturuldu.', order: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/quotes/orders/:id/convert-to-waybill
router.post('/orders/:id/convert-to-waybill', async (req: Request, res: Response) => {
  try {
    const result = await storage.runTransaction(async draft => {
      const order = draft.orders.find(o => o.id === req.params.id);
      if (!order) throw new Error('Siparis bulunamadi.');
      if (order.status === 'CANCELLED') throw new Error('Iptal edilmis siparis islenemez.');
      if (order.status === 'COMPLETED') throw new Error('Tamamlanmis siparis tekrar sevk edilemez.');
      const customer = draft.customers.find(c => c.id === order.customerId);
      if (!customer) throw new Error('Cari kart bulunamadi.');
      const waybillNo = storage.nextSequenceInTransaction(draft, 'WAYBILL');
      const waybillId = 'wb-' + Date.now();
      // Support partial shipment: if shipQuantities provided, use them; else ship remaining
      const shipQuantities: Record<string, number> = req.body.shipQuantities || {};
      const waybillItems: WaybillItem[] = [];
      let hasAnyQty = false;
      for (const oi of order.items) {
        const shipQty = shipQuantities[oi.id || oi.productId] ?? oi.remainingQuantity;
        if (shipQty <= 0) continue;
        if (shipQty > oi.remainingQuantity) throw new Error('Sevk miktari kalan miktardan fazla olamaz: ' + oi.productName);
        hasAnyQty = true;
        // Validate stock for sales
        if (order.type === 'SALES_ORDER') {
          const prod = draft.products.find(p => p.id === oi.productId);
          if (prod && prod.currentStock < shipQty) throw new Error('Yetersiz stok: ' + prod.name);
        }
        waybillItems.push({ id: 'wi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: oi.productId, productCode: oi.productCode, productName: oi.productName, quantity: shipQty, unit: oi.unit, unitPrice: oi.unitPrice, discount1: oi.discount1, discount2: oi.discount2, vatRate: oi.vatRate, lineTotal: Math.round(shipQty * oi.unitPrice * (1 - oi.discount1 / 100) * (1 - oi.discount2 / 100) * 100) / 100, lineGrandTotal: Math.round(shipQty * oi.unitPrice * (1 - oi.discount1 / 100) * (1 - oi.discount2 / 100) * (1 + oi.vatRate / 100) * 100) / 100 });
        // Update order item shipped quantities
        oi.shippedQuantity = (oi.shippedQuantity || 0) + shipQty;
        oi.remainingQuantity = oi.orderedQuantity - oi.shippedQuantity;
      }
      if (!hasAnyQty) throw new Error('Sevk edilecek urun bulunamadi.');
      const newWaybill: Waybill = { id: waybillId, waybillNo, type: order.type === 'SALES_ORDER' ? 'SALES_DESPATCH' : 'PURCHASE_DESPATCH', customerId: order.customerId, customerCode: order.customerCode, customerTitle: order.customerTitle, date: new Date().toISOString().split('T')[0], shipmentDate: req.body.shipmentDate || new Date().toISOString().split('T')[0], warehouseId: order.warehouseId, status: 'PENDING', carrierTitle: req.body.carrierTitle, plateNumber: req.body.plateNumber, driverName: req.body.driverName, sourceOrderId: order.id, sourceOrderNo: order.orderNo, notes: 'Siparis No: ' + order.orderNo + ' uzerinden olusturuldu.', items: waybillItems, userId: 'usr-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.waybills.unshift(newWaybill);
      // Stock movements
      for (const wi of waybillItems) {
        draft.stockMovements.push({ id: 'sm-wb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: wi.productId, productCode: wi.productCode, productName: wi.productName, warehouseId: order.warehouseId, documentNo: waybillNo, documentId: waybillId, documentType: 'WAYBILL', movementType: order.type === 'SALES_ORDER' ? 'WAYBILL_OUT' : 'WAYBILL_IN', quantity: wi.quantity, direction: order.type === 'SALES_ORDER' ? 'OUT' : 'IN', unitPrice: wi.unitPrice, totalAmount: wi.lineTotal, date: newWaybill.shipmentDate, notes: 'Irsaliye: ' + waybillNo, userId: 'usr-1', createdAt: new Date().toISOString() });
      }
      // Update order status
      const allShipped = order.items.every(oi => oi.remainingQuantity === 0);
      const someShipped = order.items.some(oi => oi.shippedQuantity > 0);
      order.status = allShipped ? 'SHIPPED' : (someShipped ? 'PARTIALLY_SHIPPED' : order.status);
      order.updatedAt = new Date().toISOString();
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'IRSALIYE', documentNo: waybillNo, ipAddress: '127.0.0.1', details: order.orderNo + ' siparisi ' + waybillNo + ' irsaliyesine donusturuldu.' });
      return { order, waybill: newWaybill };
    });
    res.json({ success: true, message: 'Siparis basariyla irsaliyeye donusturuldu!', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
