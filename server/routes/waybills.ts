import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { Waybill, WaybillItem, Invoice, InvoiceItem } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';
import {
  isOwnedBy,
  filterOwned,
  assertOwnedWarehouse,
  stockMovementOwnedFields,
} from '../security/tenantOwnership';

const router = Router();

// 2026-10-17 GÜVENLİK: Bu router daha önce yalnız `/api` defaultDeny üzerinden
// korunuyordu ve İÇİNDE HİÇBİR sahiplik filtresi yoktu: `tenantId` dizesi
// dosyada hiç geçmiyordu, `userId` sabit `'usr-1'`, varsayılan depo `'wh-1'`
// (canlıda VAR OLMAYAN, sahipsiz kimlik). Sonuç: bir firmanın kullanıcısı başka
// firmanın cari/ürün kaydına bağlı irsaliye açabiliyor ve stok, sahipsiz
// hareketle düşüyordu. Ön yüzün irsaliye YAZMA yolu burasıdır (bkz. api.ts
// `createWaybill`), bu yüzden açık canlıydı.
router.use(requireAuth);
router.use(resolveTenant);

router.get('/', (req: Request, res: Response) => {
  try {
    const { type, status, customerId } = req.query;
    const tenantId = req.tenantId!;
    const db = storage.getState();
    let waybills = filterOwned(db.waybills || [], tenantId);
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
    const tenantId = req.tenantId!;
    const waybill = (db.waybills || []).find(w => w.id === req.params.id && isOwnedBy(w, tenantId));
    if (!waybill) return res.status(404).json({ success: false, message: 'Irsaliye bulunamadi.' });
    res.json({ success: true, waybill });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { type = 'SALES_DESPATCH', customerId, date = new Date().toISOString().split('T')[0], shipmentDate = new Date().toISOString().split('T')[0], warehouseId, carrierTitle, plateNumber, driverName, notes, items = [] } = req.body;
    const tenantId = req.tenantId!;
    // 2026-10-17: Depo ZORUNLU ve sahipliği doğrulanır. Eski hâlde varsayılan
    // `'wh-1'` idi — canlıda VAR OLMAYAN sahipsiz kimlik; fallback YOK.
    assertOwnedWarehouse(storage.getState().warehouses, warehouseId, tenantId);
    const result = await storage.runTransaction(async draft => {
      const customer = draft.customers.find(c => c.id === customerId && isOwnedBy(c, tenantId) && !c.deletedAt);
      if (!customer) throw new Error('Cari kart bulunamadi.');
      // Kapı transaction içinde yeniden doğrulanır (arada depo değişmiş olabilir).
      const warehouse = assertOwnedWarehouse(draft.warehouses, warehouseId, tenantId);
      const waybillNo = storage.nextSequenceInTransaction(draft, 'WAYBILL');
      const waybillId = 'wb-' + Date.now();
      const processedItems: WaybillItem[] = items.map((item: any) => {
        // 2026-10-17: Ürün de sahiplikle aranır — başka firmanın ürününe
        // irsaliye satırı bağlanamaz (yoksa `product` undefined kalır ve satır
        // sahipsiz ürün kimliği taşır).
        const product = draft.products.find(p => p.id === item.productId && isOwnedBy(p, tenantId));
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || product?.salePrice || 0;
        const disc1 = Number(item.discount1) || 0;
        const disc2 = Number(item.discount2) || 0;
        const vatRate = Number(item.vatRate ?? product?.vatRate ?? 20);
        const afterDisc = qty * unitPrice * (1 - disc1 / 100) * (1 - disc2 / 100);
        const lineTotal = Math.round(afterDisc * 100) / 100;
        const lineGrandTotal = Math.round(afterDisc * (1 + vatRate / 100) * 100) / 100;
        // 2026-10-12: Varyant kontrolü — varyantlı üründe satır varyantsız
        // geçemez (hangi varyanttan düşüleceği belirsiz olurdu).
        let variant: import('../db/schema').ProductVariant | undefined;
        const variantId = typeof item.variantId === 'string' && item.variantId.trim() ? item.variantId.trim() : undefined;
        if (product && Array.isArray(product.variants) && product.variants.length > 0) {
          if (!variantId) throw new Error('Varyant seçimi zorunlu: ' + product.name + ' için bir varyant seçin.');
          variant = product.variants.find(v => v.id === variantId && v.active !== false);
          if (!variant) throw new Error('Varyant bulunamadı: ' + product.name);
        }
        // Stock check for outbound
        if (type === 'SALES_DESPATCH' && product) {
          const available = variant ? Number(variant.currentStock) || 0 : product.currentStock;
          const label = variant ? product.name + ' (' + variant.name + ')' : product.name;
          if (available < qty) throw new Error('Yetersiz stok: ' + label + ' (Mevcut: ' + available + ', Istenen: ' + qty + ')');
        }
        return { id: 'wi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), productId: item.productId, variantId: variant?.id, variantName: variant?.name, productCode: item.productCode || product?.code || '', productName: variant ? (item.productName || product?.name || '') + ' (' + variant.name + ')' : (item.productName || product?.name || ''), quantity: qty, unit: item.unit || product?.unit || 'Adet', unitPrice, discount1: disc1, discount2: disc2, vatRate, lineTotal, lineGrandTotal, priceListId: typeof item.priceListId === 'string' && item.priceListId.trim() ? item.priceListId.trim() : undefined };
      });
      // 2026-10-17: `tenantId` + `userId` ARTIK yazılır. Eski hâlde ikisi de
      // yoktu / sabitti (`'usr-1'`) → irsaliye sahipsiz doğuyor, denetim izi
      // gerçek kullanıcıyı göstermiyordu.
      const actingUserId = req.user?.id || 'system';
      const newWaybill: Waybill = { id: waybillId, tenantId, waybillNo, type, customerId, customerCode: customer.code, customerTitle: customer.title, date, shipmentDate, warehouseId: warehouse.id, status: 'PENDING', carrierTitle, plateNumber, driverName, notes, items: processedItems, userId: actingUserId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.waybills.unshift(newWaybill);
      // Immediate stock movements
      for (const wi of processedItems) {
        draft.stockMovements.push({ id: 'sm-wb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), ...stockMovementOwnedFields(tenantId, warehouse), productId: wi.productId, variantId: (wi as any).variantId, variantName: (wi as any).variantName, productCode: wi.productCode, productName: wi.productName, documentNo: waybillNo, documentId: waybillId, documentType: 'WAYBILL', movementType: type === 'SALES_DESPATCH' ? 'WAYBILL_OUT' : 'WAYBILL_IN', quantity: wi.quantity, direction: type === 'SALES_DESPATCH' ? 'OUT' : 'IN', unitPrice: wi.unitPrice, totalAmount: wi.lineTotal, date: shipmentDate, notes: 'Irsaliye: ' + waybillNo, userId: actingUserId, createdAt: new Date().toISOString() });
      }
      storage.addAuditLog({ userId: actingUserId, username: req.user?.username || 'system', action: 'CREATE', module: 'IRSALIYE', documentNo: waybillNo, ipAddress: req.ip || '127.0.0.1', details: waybillNo + ' - ' + customer.title + ' irsaliyesi olusturuldu.' });
      return newWaybill;
    });
    res.json({ success: true, message: 'Irsaliye basariyla kaydedildi ve stoklar guncellendi.', waybill: result });
  } catch (error: any) {
    // Depo kapısı hatası ise HTTP kodu ve `code` alanı korunur (403/400).
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

// POST /api/waybills/:id/convert-to-invoice
router.post('/:id/convert-to-invoice', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const actingUserId = req.user?.id || 'system';
  try {
    const result = await storage.runTransaction(async draft => {
      // 2026-10-17 GÜVENLİK: Irsaliye ve cari SAHİPLİKLE aranır. Eski hâlde
      // filtresiz `find` idi; başka firmanın irsaliyesi faturalaştırılabiliyor,
      // cari de o firmadan okunuyordu.
      const waybill = draft.waybills.find(w => w.id === req.params.id && isOwnedBy(w, tenantId));
      if (!waybill) throw new Error('Irsaliye bulunamadi.');
      if (waybill.status === 'INVOICED') throw new Error('Bu irsaliye zaten faturalastirilmistir.');
      if (waybill.status === 'CANCELLED') throw new Error('Iptal edilmis irsaliye faturalastirilamaz.');
      const customer = draft.customers.find(c => c.id === waybill.customerId && isOwnedBy(c, tenantId));
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
      const newInvoice: Invoice = { id: invoiceId, tenantId, invoiceNo, type: invoiceType, status: 'ACTIVE', customerId: waybill.customerId, customerCode: waybill.customerCode, customerTitle: waybill.customerTitle, date: new Date().toISOString().split('T')[0], maturityDate: new Date(Date.now() + (customer.maturityDays || 30) * 86400000).toISOString().split('T')[0], subTotal: Math.round(subTotal * 100) / 100, totalDiscount: 0, totalVat: Math.round(totalVat * 100) / 100, grandTotal, paidAmount: 0, paymentStatus: 'UNPAID', paymentType: 'OPEN_ACCOUNT', warehouseId: waybill.warehouseId, notes: 'Irsaliye No: ' + waybill.waybillNo + ' uzerinden faturalastirildi.', items: invoiceItems, sourceWaybillId: waybill.id, sourceWaybillNo: waybill.waybillNo, userId: actingUserId, isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.invoices.unshift(newInvoice);
      // NOTE: NO additional stock movements - waybill already moved stock!
      draft.currentTransactions.push({ id: 'ctx-' + Date.now(), tenantId, companyId: tenantId, customerId: waybill.customerId, customerCode: waybill.customerCode, customerTitle: waybill.customerTitle, documentNo: invoiceNo, documentType: invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE', date: newInvoice.date, maturityDate: newInvoice.maturityDate, debit: invoiceType === 'SALES' ? grandTotal : 0, credit: invoiceType === 'PURCHASE' ? grandTotal : 0, balance: 0, description: waybill.waybillNo + ' irsaliyesinin faturalastirmasi - ' + invoiceNo, relatedInvoiceId: invoiceId, userId: actingUserId, createdAt: new Date().toISOString() });
      waybill.status = 'INVOICED';
      waybill.invoiceId = invoiceId;
      waybill.invoiceNo = invoiceNo;
      waybill.updatedAt = new Date().toISOString();
      storage.addAuditLog({ userId: actingUserId, username: req.user?.username || 'system', action: 'CREATE', module: 'FATURA', documentNo: invoiceNo, ipAddress: req.ip || '127.0.0.1', details: waybill.waybillNo + ' irsaliyesi ' + invoiceNo + ' faturasina donusturuldu.' });
      return { waybill, invoice: newInvoice };
    });
    res.json({ success: true, message: 'Irsaliye basariyla faturaya donusturuldu!', data: result });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

// POST /api/waybills/bulk-invoice - Birden fazla irsaliyeyi tek faturaya
router.post('/bulk-invoice', async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const actingUserId = req.user?.id || 'system';
  try {
    const { waybillIds } = req.body as { waybillIds: string[] };
    if (!waybillIds || waybillIds.length === 0) throw new Error('En az bir irsaliye secilmelidir.');
    const result = await storage.runTransaction(async draft => {
      // 2026-10-17 GÜVENLİK: Toplu faturalaştırmada her irsaliye ve cari
      // SAHİPLİKLE aranır. Eski hâlde filtresiz `find` idi → başka firmanın
      // irsaliyeleri kendi faturasına bağlanabiliyordu (yazma IDOR'u).
      const waybills = waybillIds.map(id => {
        const wb = draft.waybills.find(w => w.id === id && isOwnedBy(w, tenantId));
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
      const customer = draft.customers.find(c => c.id === customerId && isOwnedBy(c, tenantId));
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
      const newInvoice: Invoice = { id: invoiceId, tenantId, invoiceNo, type: invoiceType, status: 'ACTIVE', customerId, customerCode: customer.code, customerTitle: customer.title, date: new Date().toISOString().split('T')[0], maturityDate: new Date(Date.now() + (customer.maturityDays || 30) * 86400000).toISOString().split('T')[0], subTotal: Math.round(subTotal * 100) / 100, totalDiscount: 0, totalVat: Math.round(totalVat * 100) / 100, grandTotal, paidAmount: 0, paymentStatus: 'UNPAID', paymentType: 'OPEN_ACCOUNT', warehouseId: waybills[0].warehouseId, notes: 'Toplu irsaliye faturalastirmasi: ' + waybillNos, items: invoiceItems, userId: actingUserId, isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.invoices.unshift(newInvoice);
      draft.currentTransactions.push({ id: 'ctx-' + Date.now(), tenantId, companyId: tenantId, customerId, customerCode: customer.code, customerTitle: customer.title, documentNo: invoiceNo, documentType: invoiceType === 'SALES' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE', date: newInvoice.date, maturityDate: newInvoice.maturityDate, debit: invoiceType === 'SALES' ? grandTotal : 0, credit: invoiceType === 'PURCHASE' ? grandTotal : 0, balance: 0, description: invoiceNo + ' - Toplu irsaliye faturasi (' + waybillNos + ')', relatedInvoiceId: invoiceId, userId: actingUserId, createdAt: new Date().toISOString() });
      // Mark all waybills as INVOICED
      for (const wb of waybills) {
        wb.status = 'INVOICED';
        wb.invoiceId = invoiceId;
        wb.invoiceNo = invoiceNo;
        wb.updatedAt = new Date().toISOString();
      }
      storage.addAuditLog({ userId: actingUserId, username: req.user?.username || 'system', action: 'CREATE', module: 'FATURA', documentNo: invoiceNo, ipAddress: req.ip || '127.0.0.1', details: waybillNos + ' irsaliyeleri toplu olarak ' + invoiceNo + ' faturasina donusturuldu.' });
      return { invoice: newInvoice, waybillCount: waybills.length };
    });
    res.json({ success: true, message: result.waybillCount + ' irsaliye basariyla tek faturaya donusturuldu!', data: result });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

export default router;
