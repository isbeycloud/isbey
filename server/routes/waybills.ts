import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { Waybill, WaybillItem, Invoice, InvoiceItem } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { type, status, customerId } = req.query;
    const db = storage.getState();
    let waybills = db.waybills || [];
    if (type && type !== 'ALL') waybills = waybills.filter(w => w.type === type);
    if (status && status !== 'ALL') waybills = waybills.filter(w => w.status === status);
    if (customerId) waybills = waybills.filter(w => w.customerId === customerId);
    waybills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ success: true, waybills });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const waybill = (db.waybills || []).find(w => w.id === req.params.id);
    if (!waybill) return res.status(404).json({ success: false, message: 'Irsaliye bulunamadi.' });
    res.json({ success: true, waybill });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { type = 'SALES_DESPATCH', customerId, date = new Date().toISOString().split('T')[0], shipmentDate = new Date().toISOString().split('T')[0], warehouseId = 'wh-1', carrierTitle, plateNumber, driverName, notes, items = [] } = req.body;
    const result = await storage.runTransaction(async draft => {
      const customer = draft.customers.find(c => c.id === customerId && !c.deletedAt);
      if (!customer) throw new Error('Cari kart bulunamadi.');
      const waybillNo = storage.nextSequenceInTransaction(draft, 'WAYBILL');
      const waybillId = 'wb-' + Date.now();
      const processedItems: WaybillItem[] = items.map((item: any) => {
        const product = draft.products.find(p => p.id === item.productId);
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || product?.salePrice || 0;
        const disc1 = Number(item.discount1) || 0;
        const disc2 = Number(item.discount2) || 0;
        const vatRate = Number(item.vatRate ?? product?.vatRate ?? 20);
        const afterDisc = qty * unitPrice * (1 - disc1 / 100) * (1 - disc2 / 100);
        const lineTotal = Math.round(afterDisc * 100) / 100;
        const lineGrandTotal = Math.round(afterDisc * (1 + vatRate / 100) * 100) / 100;
        // Stock check for outbound
        if (type === 'SALES_DESPATCH' && product) {
          if (product.currentStock < qty) throw new Error('Yetersiz stok: ' + product.name + ' (Mevcut: ' + product.currentStock + ', Istenen: ' + qty + ')');
        }
        return { id: 'wi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: item.productId, productCode: item.productCode || product?.code || '', productName: item.productName || product?.name || '', quantity: qty, unit: item.unit || product?.unit || 'Adet', unitPrice, discount1: disc1, discount2: disc2, vatRate, lineTotal, lineGrandTotal };
      });
      const newWaybill: Waybill = { id: waybillId, waybillNo, type, customerId, customerCode: customer.code, customerTitle: customer.title, date, shipmentDate, warehouseId, status: 'PENDING', carrierTitle, plateNumber, driverName, notes, items: processedItems, userId: 'usr-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.waybills.unshift(newWaybill);
      // Immediate stock movements
      for (const wi of processedItems) {
        draft.stockMovements.push({ id: 'sm-wb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: wi.productId, productCode: wi.productCode, productName: wi.productName, warehouseId, documentNo: waybillNo, documentId: waybillId, documentType: 'WAYBILL', movementType: type === 'SALES_DESPATCH' ? 'WAYBILL_OUT' : 'WAYBILL_IN', quantity: wi.quantity, direction: type === 'SALES_DESPATCH' ? 'OUT' : 'IN', unitPrice: wi.unitPrice, totalAmount: wi.lineTotal, date: shipmentDate, notes: 'Irsaliye: ' + waybillNo, userId: 'usr-1', createdAt: new Date().toISOString() });
      }
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'IRSALIYE', documentNo: waybillNo, ipAddress: '127.0.0.1', details: waybillNo + ' - ' + customer.title + ' irsaliyesi olusturuldu.' });
      return newWaybill;
    });
    res.json({ success: true, message: 'Irsaliye basariyla kaydedildi ve stoklar guncellendi.', waybill: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/waybills/:id/convert-to-invoice
router.post('/:id/convert-to-invoice', async (req: Request, res: Response) => {
  try {
    const result = await storage.runTransaction(async draft => {
      const waybill = draft.waybills.find(w => w.id === req.params.id);
      if (!waybill) throw new Error('Irsaliye bulunamadi.');
      if (waybill.status === 'INVOICED') throw new Error('Bu irsaliye zaten faturalastirilmistir.');
      if (waybill.status === 'CANCELLED') throw new Error('Iptal edilmis irsaliye faturalastirilamaz.');
      const customer = draft.customers.find(c => c.id === waybill.customerId);
      if (!customer) throw new Error('Cari kart bulunamadi.');
      const invoiceType = waybill.type === 'SALES_DESPATCH' ? 'SALES' : 'PURCHASE';
      const seqType = invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE';
      const invoiceNo = storage.nextSequenceInTransaction(draft, seqType);
      const invoiceId = 'inv-' + Date.now();
      let subTotal = 0, totalVat = 0;
      const invoiceItems: InvoiceItem[] = waybill.items.map(wi => {
        const lineTotal = wi.lineTotal;
        const vatAmount = Math.round(lineTotal * (wi.vatRate / 100) * 100) / 100;
        subTotal += lineTotal;
        totalVat += vatAmount;
        return { id: 'ii-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), invoiceId, productId: wi.productId, productCode: wi.productCode, productName: wi.productName, quantity: wi.quantity, unit: wi.unit, unitPrice: wi.unitPrice, discount1: wi.discount1 || 0, discount2: wi.discount2 || 0, discountAmount: 0, vatRate: wi.vatRate, vatAmount, vatIncluded: false, lineTotal, lineGrandTotal: Math.round((lineTotal + vatAmount) * 100) / 100 };
      });
      const grandTotal = Math.round((subTotal + totalVat) * 100) / 100;
      const newInvoice: Invoice = { id: invoiceId, invoiceNo, type: invoiceType, status: 'ACTIVE', customerId: waybill.customerId, customerCode: waybill.customerCode, customerTitle: waybill.customerTitle, date: new Date().toISOString().split('T')[0], maturityDate: new Date(Date.now() + (customer.maturityDays || 30) * 86400000).toISOString().split('T')[0], subTotal: Math.round(subTotal * 100) / 100, totalDiscount: 0, totalVat: Math.round(totalVat * 100) / 100, grandTotal, paidAmount: 0, paymentStatus: 'UNPAID', paymentType: 'OPEN_ACCOUNT', warehouseId: waybill.warehouseId, notes: 'Irsaliye No: ' + waybill.waybillNo + ' uzerinden faturalastirildi.', items: invoiceItems, sourceWaybillId: waybill.id, sourceWaybillNo: waybill.waybillNo, userId: 'usr-1', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.invoices.unshift(newInvoice);
      // NOTE: NO additional stock movements - waybill already moved stock!
      draft.currentTransactions.push({ id: 'ctx-' + Date.now(), customerId: waybill.customerId, customerCode: waybill.customerCode, customerTitle: waybill.customerTitle, documentNo: invoiceNo, documentType: invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE', date: newInvoice.date, maturityDate: newInvoice.maturityDate, debit: invoiceType === 'SALES' ? grandTotal : 0, credit: invoiceType === 'PURCHASE' ? grandTotal : 0, balance: 0, description: waybill.waybillNo + ' irsaliyesinin faturalastirmasi - ' + invoiceNo, relatedInvoiceId: invoiceId, userId: 'usr-1', createdAt: new Date().toISOString() });
      waybill.status = 'INVOICED';
      waybill.invoiceId = invoiceId;
      waybill.invoiceNo = invoiceNo;
      waybill.updatedAt = new Date().toISOString();
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'FATURA', documentNo: invoiceNo, ipAddress: '127.0.0.1', details: waybill.waybillNo + ' irsaliyesi ' + invoiceNo + ' faturasina donusturuldu.' });
      return { waybill, invoice: newInvoice };
    });
    res.json({ success: true, message: 'Irsaliye basariyla faturaya donusturuldu!', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/waybills/bulk-invoice - Birden fazla irsaliyeyi tek faturaya
router.post('/bulk-invoice', async (req: Request, res: Response) => {
  try {
    const { waybillIds } = req.body as { waybillIds: string[] };
    if (!waybillIds || waybillIds.length === 0) throw new Error('En az bir irsaliye secilmelidir.');
    const result = await storage.runTransaction(async draft => {
      const waybills = waybillIds.map(id => {
        const wb = draft.waybills.find(w => w.id === id);
        if (!wb) throw new Error('Irsaliye bulunamadi: ' + id);
        if (wb.status === 'INVOICED') throw new Error('Irsaliye zaten faturalastirilmis: ' + wb.waybillNo);
        if (wb.status === 'CANCELLED') throw new Error('Iptal irsaliye secildi: ' + wb.waybillNo);
        return wb;
      });
      // All waybills must be for same customer and same type
      const customerId = waybills[0].customerId;
      const waybillType = waybills[0].type;
      if (waybills.some(w => w.customerId !== customerId)) throw new Error('Toplu faturalastirma icin tum irsaliyeler ayni cariye ait olmalidir.');
      if (waybills.some(w => w.type !== waybillType)) throw new Error('Satis ve alis irsaliyeleri ayni faturada birlestirilemez.');
      const customer = draft.customers.find(c => c.id === customerId);
      if (!customer) throw new Error('Cari kart bulunamadi.');
      const invoiceType = waybillType === 'SALES_DESPATCH' ? 'SALES' : 'PURCHASE';
      const seqType = invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE';
      const invoiceNo = storage.nextSequenceInTransaction(draft, seqType);
      const invoiceId = 'inv-' + Date.now();
      let subTotal = 0, totalVat = 0;
      const invoiceItems: InvoiceItem[] = [];
      for (const wb of waybills) {
        for (const wi of wb.items) {
          const lineTotal = wi.lineTotal;
          const vatAmount = Math.round(lineTotal * (wi.vatRate / 100) * 100) / 100;
          subTotal += lineTotal;
          totalVat += vatAmount;
          invoiceItems.push({ id: 'ii-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), invoiceId, productId: wi.productId, productCode: wi.productCode, productName: wi.productName, quantity: wi.quantity, unit: wi.unit, unitPrice: wi.unitPrice, discount1: wi.discount1 || 0, discount2: wi.discount2 || 0, discountAmount: 0, vatRate: wi.vatRate, vatAmount, vatIncluded: false, lineTotal, lineGrandTotal: Math.round((lineTotal + vatAmount) * 100) / 100 });
        }
      }
      const grandTotal = Math.round((subTotal + totalVat) * 100) / 100;
      const waybillNos = waybills.map(w => w.waybillNo).join(', ');
      const newInvoice: Invoice = { id: invoiceId, invoiceNo, type: invoiceType, status: 'ACTIVE', customerId, customerCode: customer.code, customerTitle: customer.title, date: new Date().toISOString().split('T')[0], maturityDate: new Date(Date.now() + (customer.maturityDays || 30) * 86400000).toISOString().split('T')[0], subTotal: Math.round(subTotal * 100) / 100, totalDiscount: 0, totalVat: Math.round(totalVat * 100) / 100, grandTotal, paidAmount: 0, paymentStatus: 'UNPAID', paymentType: 'OPEN_ACCOUNT', warehouseId: waybills[0].warehouseId, notes: 'Toplu irsaliye faturalastirmasi: ' + waybillNos, items: invoiceItems, userId: 'usr-1', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.invoices.unshift(newInvoice);
      draft.currentTransactions.push({ id: 'ctx-' + Date.now(), customerId, customerCode: customer.code, customerTitle: customer.title, documentNo: invoiceNo, documentType: invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE', date: newInvoice.date, maturityDate: newInvoice.maturityDate, debit: invoiceType === 'SALES' ? grandTotal : 0, credit: invoiceType === 'PURCHASE' ? grandTotal : 0, balance: 0, description: invoiceNo + ' - Toplu irsaliye faturasi (' + waybillNos + ')', relatedInvoiceId: invoiceId, userId: 'usr-1', createdAt: new Date().toISOString() });
      // Mark all waybills as INVOICED
      for (const wb of waybills) {
        wb.status = 'INVOICED';
        wb.invoiceId = invoiceId;
        wb.invoiceNo = invoiceNo;
        wb.updatedAt = new Date().toISOString();
      }
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'FATURA', documentNo: invoiceNo, ipAddress: '127.0.0.1', details: waybillNos + ' irsaliyeleri toplu olarak ' + invoiceNo + ' faturasina donusturuldu.' });
      return { invoice: newInvoice, waybillCount: waybills.length };
    });
    res.json({ success: true, message: result.waybillCount + ' irsaliye basariyla tek faturaya donusturuldu!', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
