import { storage } from '../db/storage';
import {
  Invoice,
  InvoiceItem,
  Quote,
  Order,
  Waybill,
  StockMovement,
  AccountTransaction,
} from '../db/schema';
import { FinancialTransactionService } from './financialTransactionService';
import { ProviderFactory } from './providers/providerFactory';

export interface CreateInvoiceParams {
  tenantId: string;
  type: 'SALES' | 'PURCHASE' | 'RETAIL_POS' | 'PROFORMA';
  customerId: string;
  date?: string;
  maturityDate?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    vatRate?: number;
    discount1?: number;
    discount2?: number;
    withholdingCode?: string;
    withholdingRate?: number; // e.g. 5 for 5/10
  }>;
  paidAmount?: number;
  paymentType?: 'CASH' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'OPEN_ACCOUNT';
  cashRegisterId?: string;
  bankAccountId?: string;
  warehouseId?: string;
  notes?: string;
  sourceQuoteId?: string;
  sourceOrderId?: string;
  sourceWaybillId?: string;
  userId: string;
  username?: string;
}

export class DocumentConversionService {
  /**
   * 1. MERKEZİ FATURA OLUŞTURMA MOTORU
   * Fatura + Otomatik Stok Hareketi + Cari Hareket + (Varsa) Tahsilat/Ödeme
   */
  static async createInvoice(params: CreateInvoiceParams): Promise<Invoice> {
    const {
      tenantId,
      type = 'SALES',
      customerId,
      date,
      maturityDate,
      items = [],
      paidAmount = 0,
      paymentType = 'OPEN_ACCOUNT',
      cashRegisterId,
      bankAccountId,
      warehouseId,
      notes,
      sourceQuoteId,
      sourceOrderId,
      sourceWaybillId,
      userId,
      username = 'Sistem',
    } = params;

    if (!items || items.length === 0) {
      throw new Error('Faturada en az bir ürün/hizmet satırı bulunmalıdır.');
    }

    const db = storage.getState();
    const customer = (db.customers || []).find(
      c => c.id === customerId && (!c.tenantId || c.tenantId === tenantId)
    );
    if (!customer) throw new Error('Cari hesap bulunamadı.');

    const now = new Date().toISOString();
    const invoiceDate = date || now.slice(0, 10);
    const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invoiceNo = storage.getNextSequence(type === 'PURCHASE' ? 'PURCHASE_INVOICE' : 'SALES_INVOICE');
    const whId = warehouseId || (db.warehouses && db.warehouses[0]?.id) || 'wh-default';

    let subTotal = 0;
    let totalDiscount = 0;
    let totalVat = 0;
    let totalWithholding = 0;

    const formattedItems: InvoiceItem[] = [];
    const stockMovementsToCreate: StockMovement[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const product = (db.products || []).find(
        p => p.id === it.productId && (!p.tenantId || p.tenantId === tenantId)
      );
      if (!product) throw new Error(`Ürün bulunamadı (ID: ${it.productId})`);

      const qty = Number(it.quantity) || 1;
      const price = Number(it.unitPrice) || 0;
      const vatR = it.vatRate !== undefined ? Number(it.vatRate) : (product.vatRate || 20);
      const d1 = Number(it.discount1) || 0;
      const d2 = Number(it.discount2) || 0;

      const rawTotal = qty * price;
      const d1Amount = rawTotal * (d1 / 100);
      const afterD1 = rawTotal - d1Amount;
      const d2Amount = afterD1 * (d2 / 100);
      const lineDiscTotal = d1Amount + d2Amount;
      const lineNet = rawTotal - lineDiscTotal;
      const lineVat = lineNet * (vatR / 100);

      let lineWithholding = 0;
      if (it.withholdingRate && it.withholdingRate > 0) {
        lineWithholding = lineVat * (it.withholdingRate / 10);
      }

      subTotal += lineNet;
      totalDiscount += lineDiscTotal;
      totalVat += lineVat;
      totalWithholding += lineWithholding;

      const lineGrand = lineNet + lineVat;

      formattedItems.push({
        id: `item-${Date.now()}-${i}`,
        invoiceId,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        barcode: product.barcode,
        quantity: qty,
        unit: product.unit || 'Adet',
        unitPrice: price,
        discount1: d1,
        discount2: d2,
        discountAmount: lineDiscTotal,
        vatRate: vatR,
        vatAmount: lineVat,
        vatIncluded: false,
        withholdingCode: it.withholdingCode,
        withholdingRate: it.withholdingRate,
        withholdingAmount: lineWithholding,
        lineTotal: lineNet,
        lineGrandTotal: lineGrand,
      });

      // İrsaliyeden aktarılmadıysa fiili stok hareketi oluştur
      if (!sourceWaybillId) {
        const isSales = type === 'SALES' || type === 'RETAIL_POS';
        const direction = isSales ? 'OUT' : 'IN';
        const movementType = isSales ? 'SALE' : 'PURCHASE';

        stockMovementsToCreate.push({
          id: `sm-${Date.now()}-${i}`,
          tenantId,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          warehouseId: whId,
          documentNo: invoiceNo,
          documentType: 'INVOICE',
          documentId: invoiceId,
          movementType,
          quantity: qty,
          direction,
          unitPrice: price,
          totalAmount: lineNet,
          currency: 'TRY',
          date: invoiceDate,
          userId,
          createdBy: username,
          createdAt: now,
        });

        // Ürün mevcut stok bakiye güncellemesi
        if (isSales) {
          product.currentStock = (product.currentStock || 0) - qty;
        } else {
          product.currentStock = (product.currentStock || 0) + qty;
        }
        product.updatedAt = now;
      }
    }

    const payableVat = totalVat - totalWithholding;
    const grandTotal = subTotal + payableVat;

    const isSalesInvoice = type === 'SALES' || type === 'RETAIL_POS';
    const isPaid = paidAmount >= grandTotal;
    const paymentStatus = isPaid ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

    const newInvoice: Invoice = {
      id: invoiceId,
      tenantId,
      invoiceNo,
      type,
      status: 'ACTIVE',
      customerId: customer.id,
      customerCode: customer.code,
      customerTitle: customer.title,
      date: invoiceDate,
      maturityDate: maturityDate || invoiceDate,
      subTotal: Math.round(subTotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      totalWithholding: Math.round(totalWithholding * 100) / 100,
      payableVat: Math.round(payableVat * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      paymentStatus,
      paymentType,
      cashRegisterId,
      bankAccountId,
      warehouseId: whId,
      notes,
      items: formattedItems,
      sourceQuoteId,
      sourceOrderId,
      sourceWaybillId,
      currency: 'TRY',
      userId,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.invoices) db.invoices = [];
    db.invoices.push(newInvoice);

    // Stok hareketlerini kaydet
    if (!db.stockMovements) db.stockMovements = [];
    db.stockMovements.push(...stockMovementsToCreate);

    // Cari Hareket Oluştur
    const accountTx: AccountTransaction = {
      id: `actx-inv-${Date.now()}`,
      tenantId,
      customerId: customer.id,
      customerCode: customer.code,
      customerTitle: customer.title,
      transactionType: 'INVOICE',
      documentType: type === 'PURCHASE' ? 'PURCHASE_INVOICE' : 'SALES_INVOICE',
      documentId: invoiceId,
      documentNo: invoiceNo,
      date: invoiceDate,
      dueDate: maturityDate || invoiceDate,
      description: `${type === 'PURCHASE' ? 'Alış Faturası' : 'Satış Faturası'}: ${invoiceNo}`,
      debit: isSalesInvoice ? grandTotal : 0,
      credit: isSalesInvoice ? 0 : grandTotal,
      currency: 'TRY',
      relatedInvoiceId: invoiceId,
      createdBy: username,
      createdAt: now,
    };

    if (!db.accountTransactions) db.accountTransactions = [];
    db.accountTransactions.push(accountTx);

    // Cari Bakiye Güncelle
    if (isSalesInvoice) {
      customer.totalDebit = (customer.totalDebit || 0) + grandTotal;
    } else {
      customer.totalCredit = (customer.totalCredit || 0) + grandTotal;
    }
    customer.balance = (customer.totalDebit || 0) - (customer.totalCredit || 0);
    customer.updatedAt = now;

    // Kapalı Fatura veya Peşin Ödeme Varsa Anında Kasa/Banka Tahsilat/Ödeme Kaydı Yap
    if (paidAmount > 0) {
      if (isSalesInvoice) {
        await FinancialTransactionService.createCollection({
          tenantId,
          customerId: customer.id,
          amount: paidAmount,
          currency: 'TRY',
          targetType: bankAccountId ? 'BANK' : 'CASH',
          targetId: bankAccountId || cashRegisterId || (db.cashRegisters && db.cashRegisters[0]?.id) || 'cash-1',
          date: invoiceDate,
          description: `Fatura Peşinat / Tahsilatı (${invoiceNo})`,
          documentNo: `THS-${invoiceNo}`,
          userId,
          username,
        });
      } else {
        await FinancialTransactionService.createPayment({
          tenantId,
          customerId: customer.id,
          amount: paidAmount,
          currency: 'TRY',
          sourceType: bankAccountId ? 'BANK' : 'CASH',
          sourceId: bankAccountId || cashRegisterId || (db.cashRegisters && db.cashRegisters[0]?.id) || 'cash-1',
          date: invoiceDate,
          description: `Alış Faturası Ödemesi (${invoiceNo})`,
          documentNo: `ODM-${invoiceNo}`,
          userId,
          username,
        });
      }
    }

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'INVOICE_CREATED',
      module: 'INVOICES',
      documentNo: invoiceNo,
      ipAddress: '127.0.0.1',
      details: `${customer.title} adına ${grandTotal} TL tutarında ${type} faturası (${invoiceNo}) oluşturuldu.`,
    });

    storage.save();
    return newInvoice;
  }

  /**
   * 2. FATURA İPTALİ VE STOK/CARİ İADESİ (ROLLBACK)
   */
  static async cancelInvoice(invoiceId: string, tenantId: string, reason: string, userId: string, username: string = 'Sistem'): Promise<Invoice> {
    const db = storage.getState();
    const invoice = (db.invoices || []).find(
      inv => inv.id === invoiceId && (!inv.tenantId || inv.tenantId === tenantId)
    );
    if (!invoice) throw new Error('Fatura bulunamadı.');
    if (invoice.status === 'CANCELLED') throw new Error('Bu fatura zaten iptal edilmiş.');

    const now = new Date().toISOString();
    const isSales = invoice.type === 'SALES' || invoice.type === 'RETAIL_POS';

    // 0. INTEGRATION GAP ÇÖZÜMÜ: Giden Belge Entegratör İptali (CancelDocument)
    // Fatura daha önce entegratöre iletilmişse (eInvoiceUUID mevcut ve geçerli giden durumu var),
    // önce entegratör üzerinden CancelDocument çağrısı yapılır ve iş-seviyesi doğrulanır.
    // Entegratör çağrısı başarısızsa veya doğrulanmazsa YEREL İPTAL KESİNLİKLE YAPILMAZ (fail-closed).
    const hasOutgoingEDoc = Boolean(
      invoice.eInvoiceUUID &&
      ['SENT', 'ACCEPTED', 'DELIVERED'].includes(invoice.eInvoiceStatus || '')
    );

    const linkedElectronicDocument = (db.electronicDocuments || []).find(
      d => d.internalDocumentId === invoice.id && (!d.tenantId || d.tenantId === tenantId)
    );

    if (hasOutgoingEDoc) {
      // Hızlı Bilişim'in doğrulanmış CancelDocument sözleşmesi yalnız
      // e-Arşiv AppType=3 kapsamındadır. e-Fatura/e-İrsaliye için aynı çağrıyı
      // yapmak, yanlış belge türünde "iptal" denemek anlamına gelir. Bu durumda
      // yerel kayıt da değiştirilmez: doğru GİB/entegratör iptal yöntemi
      // uygulanana kadar işlem fail-closed kalır.
      if (!linkedElectronicDocument || linkedElectronicDocument.documentDirection !== 'OUTGOING') {
        throw new Error('Gönderilmiş e-Belgenin entegratör gönderim kaydı bulunamadı. Entegratör iptali doğrulanmadan yerel iptal yapılamaz.');
      }
      if (linkedElectronicDocument.profile !== 'EARSIVFATURA') {
        throw new Error('Bu gönderilmiş belge için doğrulanmış bir entegratör iptal sözleşmesi bulunmuyor. Yerel kayıt değiştirilmedi; ilgili GİB/entegratör iptal prosedürünü kullanın.');
      }
      const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);
      const cancelRes = await provider.cancelInvoice(invoice.eInvoiceUUID!, reason, settings);
      if (!cancelRes.success) {
        throw new Error(`Entegratör fatura iptalini reddetti: ${cancelRes.message || 'Bilinmeyen hata'}`);
      }
      if (cancelRes.dogrulandi === false) {
        throw new Error(`Entegratör yanıtında iş-seviyesi başarı doğrulanamadı: ${cancelRes.message || 'Belirsiz durum'}`);
      }
    }

    // 1. Stokları Geri Al (Ters Hareket)
    // FAZ 25.2-D runtime bulgusu (2026-09-11): Gelen e-Fatura aktarımından doğan bazı
    // kayıtlarda satırlar `lines` altında tutuluyor; `invoice.items` undefined kalıyor.
    // Çıplak iterasyon `TypeError: invoice.items is not iterable` ile ucu düşürüyordu.
    // Satır listesi savunmacı okunur (raporlardaki invoiceLines() ile aynı desen).
    const cancelLines: any[] = Array.isArray(invoice.items)
      ? invoice.items
      : Array.isArray((invoice as any).lines) ? (invoice as any).lines : [];
    for (const item of cancelLines) {
      const product = (db.products || []).find(p => p.id === item.productId);
      if (product) {
        if (isSales) {
          product.currentStock = (product.currentStock || 0) + item.quantity;
        } else {
          product.currentStock = Math.max(0, (product.currentStock || 0) - item.quantity);
        }
        product.updatedAt = now;

        const revMove: StockMovement = {
          id: `sm-rev-${Date.now()}-${item.id}`,
          tenantId,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          warehouseId: invoice.warehouseId || 'wh-default',
          documentNo: `IPT-${invoice.invoiceNo}`,
          documentType: 'INVOICE',
          documentId: invoice.id,
          movementType: isSales ? 'SALE_RETURN' : 'PURCHASE_RETURN',
          quantity: item.quantity,
          direction: isSales ? 'IN' : 'OUT',
          unitPrice: item.unitPrice,
          totalAmount: typeof item.lineTotal === 'number'
            ? item.lineTotal
            : (Number(item.totalAmount) || 0) - (Number(item.vatAmount) || 0),
          currency: 'TRY',
          date: now.slice(0, 10),
          notes: `Fatura İptali: ${invoice.invoiceNo} (Sebep: ${reason})`,
          userId,
          createdBy: username,
          createdAt: now,
        };
        if (!db.stockMovements) db.stockMovements = [];
        db.stockMovements.push(revMove);
      }
    }

    // 2. Cari Hareketi İptal Et / Ters Kayıt
    const customer = (db.customers || []).find(c => c.id === invoice.customerId);
    if (customer) {
      if (isSales) {
        customer.totalDebit = Math.max(0, (customer.totalDebit || 0) - invoice.grandTotal);
      } else {
        customer.totalCredit = Math.max(0, (customer.totalCredit || 0) - invoice.grandTotal);
      }
      customer.balance = (customer.totalDebit || 0) - (customer.totalCredit || 0);
      customer.updatedAt = now;

      // Cari hareketini isCancelled yap
      const actx = (db.accountTransactions || []).find(t => t.relatedInvoiceId === invoice.id);
      if (actx) {
        actx.isCancelled = true;
        actx.cancelReason = reason;
      }
    }

    // 3. Durumları Kesinleştir
    invoice.status = 'CANCELLED';
    invoice.updatedAt = now;
    if (invoice.eInvoiceStatus) {
      invoice.eInvoiceStatus = 'CANCELLED';
    }

    const edoc = linkedElectronicDocument;
    if (edoc) {
      edoc.status = 'CANCELLED';
      edoc.updatedAt = now;
      if (!edoc.timeline) edoc.timeline = [];
      edoc.timeline.push({
        status: 'CANCELLED',
        description: `Fatura ERP üzerinden iptal edildi (Sebep: ${reason}).`,
        timestamp: now,
      });
    }

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'INVOICE_CANCELLED',
      module: 'INVOICES',
      documentNo: invoice.invoiceNo,
      ipAddress: '127.0.0.1',
      details: `${invoice.invoiceNo} nolu fatura iptal edildi. Sebep: ${reason}`,
    });

    storage.save();
    return invoice;
  }

  /**
   * 3. TEKLİFİ SİPARİŞE DÖNÜŞTÜRME
   */
  static async convertQuoteToOrder(quoteId: string, tenantId: string, userId: string, username: string = 'Sistem'): Promise<Order> {
    const db = storage.getState();
    const quote = (db.quotes || []).find(q => q.id === quoteId && (!q.tenantId || q.tenantId === tenantId));
    if (!quote) throw new Error('Teklif bulunamadı.');

    const now = new Date().toISOString();
    const orderNo = storage.getNextSequence('ORDER');
    const orderId = `ord-${Date.now()}`;

    const newOrder: Order = {
      id: orderId,
      tenantId,
      orderNo,
      type: 'SALES_ORDER',
      customerId: quote.customerId,
      customerCode: quote.customerCode,
      customerTitle: quote.customerTitle,
      date: now.slice(0, 10),
      deliveryDate: now.slice(0, 10),
      subTotal: quote.subTotal,
      totalDiscount: quote.totalDiscount,
      totalVat: quote.totalVat,
      grandTotal: quote.grandTotal,
      status: 'CONFIRMED',
      warehouseId: 'wh-default',
      sourceQuoteId: quote.id,
      sourceQuoteNo: quote.quoteNo,
      notes: `Tekliften dönüştürüldü: ${quote.quoteNo}`,
      items: quote.items.map(it => ({
        id: `oi-${Date.now()}-${it.productId}`,
        productId: it.productId,
        productCode: it.productCode,
        productName: it.productName,
        orderedQuantity: it.quantity,
        shippedQuantity: 0,
        remainingQuantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discount1: it.discount1 || 0,
        discount2: it.discount2 || 0,
        vatRate: it.vatRate,
        vatAmount: it.vatAmount,
        lineTotal: it.lineTotal,
        lineGrandTotal: it.lineGrandTotal,
      })),
      userId,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.orders) db.orders = [];
    db.orders.push(newOrder);

    quote.status = 'CONVERTED';
    quote.convertedOrderId = orderId;
    quote.convertedOrderNo = orderNo;

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'QUOTE_CONVERTED_TO_ORDER',
      module: 'QUOTES',
      documentNo: quote.quoteNo,
      ipAddress: '127.0.0.1',
      details: `${quote.quoteNo} nolu teklif ${orderNo} nolu siparişe dönüştürüldü.`,
    });

    storage.save();
    return newOrder;
  }

  /**
   * 4. SİPARİŞİ İRSALİYEYE DÖNÜŞTÜRME
   */
  static async convertOrderToWaybill(orderId: string, tenantId: string, userId: string, username: string = 'Sistem'): Promise<Waybill> {
    const db = storage.getState();
    const order = (db.orders || []).find(o => o.id === orderId && (!o.tenantId || o.tenantId === tenantId));
    if (!order) throw new Error('Sipariş bulunamadı.');

    const now = new Date().toISOString();
    const waybillNo = storage.getNextSequence('WAYBILL');
    const waybillId = `wb-${Date.now()}`;

    const newWaybill: Waybill = {
      id: waybillId,
      tenantId,
      waybillNo,
      type: 'SALES_DESPATCH',
      customerId: order.customerId,
      customerCode: order.customerCode,
      customerTitle: order.customerTitle,
      date: now.slice(0, 10),
      shipmentDate: now.slice(0, 10),
      warehouseId: order.warehouseId || 'wh-default',
      status: 'PENDING',
      sourceOrderId: order.id,
      sourceOrderNo: order.orderNo,
      notes: `Siparişten sevk irsaliyesi oluşturuldu: ${order.orderNo}`,
      items: order.items.map(it => ({
        id: `wbi-${Date.now()}-${it.productId}`,
        productId: it.productId,
        productCode: it.productCode,
        productName: it.productName,
        quantity: it.remainingQuantity || it.orderedQuantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discount1: it.discount1,
        discount2: it.discount2,
        vatRate: it.vatRate,
        lineTotal: it.lineTotal,
        lineGrandTotal: it.lineGrandTotal,
      })),
      userId,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.waybills) db.waybills = [];
    db.waybills.push(newWaybill);

    // Fiili stok düşümü
    for (const item of newWaybill.items) {
      const prod = (db.products || []).find(p => p.id === item.productId);
      if (prod) {
        prod.currentStock = (prod.currentStock || 0) - item.quantity;
        prod.updatedAt = now;

        const sm: StockMovement = {
          id: `sm-wb-${Date.now()}-${item.productId}`,
          tenantId,
          productId: prod.id,
          productCode: prod.code,
          productName: prod.name,
          warehouseId: newWaybill.warehouseId,
          documentNo: waybillNo,
          documentType: 'WAYBILL',
          documentId: waybillId,
          movementType: 'WAYBILL_OUT',
          quantity: item.quantity,
          direction: 'OUT',
          unitPrice: item.unitPrice,
          totalAmount: item.lineTotal,
          currency: 'TRY',
          date: now.slice(0, 10),
          userId,
          createdBy: username,
          createdAt: now,
        };
        if (!db.stockMovements) db.stockMovements = [];
        db.stockMovements.push(sm);
      }
    }

    order.status = 'SHIPPED';

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'ORDER_CONVERTED_TO_WAYBILL',
      module: 'ORDERS',
      documentNo: order.orderNo,
      ipAddress: '127.0.0.1',
      details: `${order.orderNo} nolu sipariş ${waybillNo} nolu irsaliyeye sevk edildi.`,
    });

    storage.save();
    return newWaybill;
  }

  /**
   * 5. İRSALİYEYİ FATURAYA DÖNÜŞTÜRME
   */
  static async convertWaybillToInvoice(waybillId: string, tenantId: string, userId: string, username: string = 'Sistem'): Promise<Invoice> {
    const db = storage.getState();
    const waybill = (db.waybills || []).find(w => w.id === waybillId && (!w.tenantId || w.tenantId === tenantId));
    if (!waybill) throw new Error('İrsaliye bulunamadı.');

    const invoice = await DocumentConversionService.createInvoice({
      tenantId,
      type: 'SALES',
      customerId: waybill.customerId,
      items: waybill.items.map(it => ({
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        vatRate: it.vatRate,
        discount1: it.discount1,
        discount2: it.discount2,
      })),
      sourceWaybillId: waybill.id,
      notes: `İrsaliyeden faturalandırıldı: ${waybill.waybillNo}`,
      userId,
      username,
    });

    waybill.status = 'INVOICED';
    waybill.invoiceId = invoice.id;
    waybill.invoiceNo = invoice.invoiceNo;

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'WAYBILL_INVOICED',
      module: 'WAYBILLS',
      documentNo: waybill.waybillNo,
      ipAddress: '127.0.0.1',
      details: `${waybill.waybillNo} nolu irsaliye ${invoice.invoiceNo} nolu faturaya dönüştürüldü.`,
    });

    storage.save();
    return invoice;
  }
}
