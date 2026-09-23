import { Router } from 'express';
import { storage } from '../db/storage';
import { Invoice, InvoiceItem, StockMovement, CurrentTransaction, CashTransaction, BankTransaction } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';
import { DocumentConversionService } from '../services/documentConversionService';

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);
invoicesRouter.use(resolveTenant);

// List all invoices with filters (Tenant Isolated)
invoicesRouter.get('/', (req, res) => {
  const { type, customerId, status, search, startDate, endDate } = req.query;
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';

  let list = db.invoices.filter(i =>
    !i.isDeleted && (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey'))
  );

  if (type && type !== 'ALL') {
    list = list.filter(i => i.type === type);
  }

  if (customerId) {
    list = list.filter(i => i.customerId === customerId);
  }

  if (status && status !== 'ALL') {
    list = list.filter(i => i.paymentStatus === status);
  }

  if (startDate) {
    list = list.filter(i => i.date >= String(startDate));
  }

  if (endDate) {
    list = list.filter(i => i.date <= String(endDate));
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(i =>
      i.invoiceNo.toLowerCase().includes(q) ||
      i.customerTitle.toLowerCase().includes(q) ||
      i.customerCode.toLowerCase().includes(q)
    );
  }

  // Sort descending by date
  list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.invoiceNo.localeCompare(a.invoiceNo));

  res.json({ success: true, invoices: list });
});

// Get single invoice (Tenant Isolated & IDOR Protected)
invoicesRouter.get('/:id', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const invoice = db.invoices.find(i =>
    i.id === req.params.id && (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey'))
  );
  if (!invoice) {
    return res.status(404).json({ success: false, message: 'Fatura bulunamadı.' });
  }
  res.json({ success: true, invoice });
});

// Create Invoice (SALES, PURCHASE, RETAIL_POS) - Full Atomic Transaction Flow
invoicesRouter.post('/', async (req, res) => {
  const {
    type,
    customerId,
    date,
    maturityDate,
    items,
    paymentType,
    paidAmount,
    cashRegisterId,
    bankAccountId,
    warehouseId,
    notes,
    currency = 'TRY',
    exchangeRate = 1,
    invoiceProfile = 'TICARIFATURA',
    invoiceCategory = 'SATIS',
    withholdingCode,
    withholdingRate,
    exemptionCode,
    recipientTaxNumber,
    recipientAliasGB,
  } = req.body;

  if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Müşteri ve en az bir ürün kalemi zorunludur.' });
  }

  const invoiceType = type || 'SALES';
  const isPurchase = invoiceType === 'PURCHASE';

  try {
    const createdInvoice = await storage.runTransaction(draft => {
      // 1. Verify Customer
      const customer = draft.customers.find(c => c.id === customerId);
      if (!customer) {
        throw new Error('Seçilen cari kart sistemde bulunamadı!');
      }

      // 2. Generate Invoice Document Number
      const seqType = isPurchase ? 'PURCHASE_INVOICE' : 'SALES_INVOICE';
      const invoiceNo = storage.getNextSequence(seqType);

      const invoiceDate = date || new Date().toISOString().split('T')[0];
      const invMaturity = maturityDate || (
        new Date(new Date(invoiceDate).getTime() + (customer.maturityDays || 30) * 24 * 3600 * 1000).toISOString().split('T')[0]
      );

      const invoiceId = `inv-${Date.now()}`;
      const processedItems: InvoiceItem[] = [];
      let subTotal = 0;
      let totalDiscount = 0;
      let totalVat = 0;
      let totalWithholding = 0;
      let grandTotal = 0;

      const numWithholdingRate = Number(withholdingRate) || 0;

      // 3. Process items and calculate values
      for (let i = 0; i < items.length; i++) {
        const itemInput = items[i];
        const product = draft.products.find(p => p.id === itemInput.productId);
        if (!product) {
          throw new Error(`Ürün bulunamadı: ID ${itemInput.productId}`);
        }

        const quantity = Number(itemInput.quantity) || 1;
        if (quantity <= 0) {
          throw new Error(`Geçersiz miktar: ${product.name}`);
        }

        // Check stock for sales
        if (!isPurchase && product.currentStock < quantity) {
          throw new Error(`Yetersiz stok! Ürün: ${product.name} (Mevcut: ${product.currentStock} ${product.unit}, İstenen: ${quantity})`);
        }

        const unitPrice = Number(itemInput.unitPrice) || (isPurchase ? product.purchasePrice : product.salePrice);
        const discount1 = Number(itemInput.discount1) || 0;
        const discount2 = Number(itemInput.discount2) || 0;
        const vatRate = Number(itemInput.vatRate ?? product.vatRate);
        const vatIncluded = Boolean(itemInput.vatIncluded);

        // Price before discount
        let rawTotal = quantity * unitPrice;
        // Apply tiered discount
        let discountedTotal = rawTotal * (1 - discount1 / 100) * (1 - discount2 / 100);
        let discAmount = rawTotal - discountedTotal;

        let lineNet = 0;
        let lineVatAmt = 0;
        let lineGross = 0;

        if (vatIncluded) {
          lineGross = discountedTotal;
          lineNet = discountedTotal / (1 + vatRate / 100);
          lineVatAmt = lineGross - lineNet;
        } else {
          lineNet = discountedTotal;
          lineVatAmt = lineNet * (vatRate / 100);
          lineGross = lineNet + lineVatAmt;
        }

        let lineWithholding = 0;
        if (numWithholdingRate > 0) {
          lineWithholding = lineVatAmt * numWithholdingRate;
        }

        lineNet = Math.round(lineNet * 100) / 100;
        lineVatAmt = Math.round(lineVatAmt * 100) / 100;
        lineWithholding = Math.round(lineWithholding * 100) / 100;
        lineGross = Math.round((lineNet + lineVatAmt - lineWithholding) * 100) / 100;

        subTotal += lineNet;
        totalDiscount += discAmount;
        totalVat += lineVatAmt;
        totalWithholding += lineWithholding;
        grandTotal += lineGross;

        const invItem: InvoiceItem = {
          id: `item-${Date.now()}-${i}`,
          invoiceId,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          barcode: product.barcode,
          quantity,
          unit: product.unit,
          unitPrice,
          discount1,
          discount2,
          discountAmount: Math.round(discAmount * 100) / 100,
          vatRate,
          vatAmount: lineVatAmt,
          vatIncluded,
          withholdingCode: withholdingCode || undefined,
          withholdingRate: numWithholdingRate || undefined,
          withholdingAmount: lineWithholding || undefined,
          exemptionReasonCode: exemptionCode || undefined,
          lineTotal: lineNet,
          lineGrandTotal: lineGross,
        };
        processedItems.push(invItem);

        // 4. Create Stock Movement (Double-entry inventory tracking)
        const targetWhId = warehouseId || product.warehouseId || 'wh-1';
        const wh = draft.warehouses.find(w => w.id === targetWhId);

        const stockMovement: StockMovement = {
          id: `sm-${Date.now()}-${i}`,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          warehouseId: targetWhId,
          warehouseName: wh ? wh.name : 'Merkez Depo',
          documentNo: invoiceNo,
          documentType: 'INVOICE',
          movementType: isPurchase ? 'PURCHASE' : 'SALE',
          quantity,
          direction: isPurchase ? 'IN' : 'OUT',
          unitPrice,
          totalAmount: lineGross,
          date: invoiceDate,
          notes: `${invoiceNo} nolu ${isPurchase ? 'Alış' : 'Satış'} Faturası`,
          userId: 'admin',
          createdAt: new Date().toISOString(),
        };
        draft.stockMovements.push(stockMovement);
      }

      grandTotal = Math.round(grandTotal * 100) / 100;
      subTotal = Math.round(subTotal * 100) / 100;
      totalDiscount = Math.round(totalDiscount * 100) / 100;
      totalVat = Math.round(totalVat * 100) / 100;
      totalWithholding = Math.round(totalWithholding * 100) / 100;
      const payableVat = Math.round((totalVat - totalWithholding) * 100) / 100;

      const pPaidAmount = Number(paidAmount) || (paymentType === 'CASH' || paymentType === 'CREDIT_CARD' ? grandTotal : 0);
      const isFullyPaid = pPaidAmount >= grandTotal;
      const isPartial = pPaidAmount > 0 && pPaidAmount < grandTotal;
      const paymentStatus = isFullyPaid ? 'PAID' : (isPartial ? 'PARTIAL' : 'UNPAID');

      // 5. Create Invoice Record
      const invoice: Invoice = {
        id: invoiceId,
        tenantId: req.tenantId || 'tnt-isbey',
        invoiceNo,
        type: invoiceType,
        status: 'ACTIVE',
        customerId: customer.id,
        customerCode: customer.code,
        customerTitle: customer.title,
        date: invoiceDate,
        maturityDate: invMaturity,
        subTotal,
        totalDiscount,
        totalVat,
        totalWithholding: totalWithholding > 0 ? totalWithholding : undefined,
        payableVat: totalWithholding > 0 ? payableVat : totalVat,
        grandTotal,
        paidAmount: pPaidAmount,
        paymentStatus,
        paymentType: paymentType || (pPaidAmount > 0 ? 'CASH' : 'OPEN_ACCOUNT'),
        cashRegisterId,
        bankAccountId,
        warehouseId: warehouseId || 'wh-1',
        currency,
        exchangeRate: Number(exchangeRate) || 1,
        invoiceProfile: invoiceProfile as any,
        invoiceCategory: invoiceCategory as any,
        withholdingCode: withholdingCode || undefined,
        withholdingRate: numWithholdingRate > 0 ? numWithholdingRate : undefined,
        withholdingAmount: totalWithholding > 0 ? totalWithholding : undefined,
        exemptionCode: exemptionCode || undefined,
        recipientTaxNumber: recipientTaxNumber || customer.taxNumber,
        recipientAliasGB: recipientAliasGB || undefined,
        notes: notes || '',
        items: processedItems,
        eInvoiceStatus: 'DRAFT',
        // 2026-09-16 (`docs/45`): ETTN ATANMAZ. ETTN GİB'in resmî belge
        // kimliğidir; belge entegratöre gitmeden bilinemez. Önceden burada
        // `urn:uuid:<id>-2026` diye tahmin edilebilir bir değer yazılıyordu ve
        // bu değer aşağı akışta gerçek ETTN gibi okunuyordu (kabul/red, iptal,
        // GİB durum sorgusu). Kimlik, belge gerçekten gönderildiğinde
        // `electronicDocumentService.queueInvoice` tarafından atanır
        // (`eInvoiceUUID || crypto.randomUUID()`).
        eInvoiceUUID: undefined,
        userId: 'admin',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      draft.invoices.push(invoice);

      // 6. Create Current Transaction (Cari Hareket)
      // Satış -> Borç artar, Alış -> Alacak artar
      const curTx: CurrentTransaction = {
        id: `ctx-${Date.now()}`,
        customerId: customer.id,
        customerCode: customer.code,
        customerTitle: customer.title,
        documentNo: invoiceNo,
        documentType: isPurchase ? 'PURCHASE_INVOICE' : 'SALES_INVOICE',
        date: invoiceDate,
        maturityDate: invMaturity,
        debit: isPurchase ? 0 : grandTotal,
        credit: isPurchase ? grandTotal : 0,
        balance: 0, // Recalculated by storage manager
        description: `${invoiceNo} nolu ${isPurchase ? 'Alış' : 'Satış'} Faturası`,
        relatedInvoiceId: invoiceId,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };
      draft.currentTransactions.push(curTx);

      // 7. If paid at time of invoice (Peşin / Kredi Kartı / Havale)
      if (pPaidAmount > 0) {
        if (paymentType === 'CASH' || paymentType === 'RETAIL_POS' || !paymentType) {
          const cashReg = draft.cashRegisters.find(c => c.id === cashRegisterId) || draft.cashRegisters[0];
          const cashTx: CashTransaction = {
            id: `cx-${Date.now()}`,
            cashRegisterId: cashReg.id,
            cashRegisterName: cashReg.name,
            documentNo: invoiceNo,
            type: isPurchase ? 'PAYMENT' : 'COLLECTION',
            direction: isPurchase ? 'OUT' : 'IN',
            amount: pPaidAmount,
            date: invoiceDate,
            customerId: customer.id,
            customerTitle: customer.title,
            category: isPurchase ? 'Fatura Ödemesi' : 'Fatura Peşin Tahsilatı',
            description: `${invoiceNo} nolu faturanın nakit tahsilatı`,
            userId: 'admin',
            createdAt: new Date().toISOString(),
          };
          draft.cashTransactions.push(cashTx);
          cashReg.balance += isPurchase ? -pPaidAmount : pPaidAmount;
        } else if (paymentType === 'BANK_TRANSFER' || paymentType === 'CREDIT_CARD') {
          const bank = draft.bankAccounts.find(b => b.id === bankAccountId) || draft.bankAccounts[0];
          const bnkTx: BankTransaction = {
            id: `bx-${Date.now()}`,
            bankAccountId: bank.id,
            bankAccountName: bank.accountName,
            documentNo: invoiceNo,
            type: isPurchase ? 'HAVALE_EFT_OUT' : (paymentType === 'CREDIT_CARD' ? 'POS_COLLECTION' : 'HAVALE_EFT_IN'),
            direction: isPurchase ? 'OUT' : 'IN',
            amount: pPaidAmount,
            date: invoiceDate,
            customerId: customer.id,
            customerTitle: customer.title,
            description: `${invoiceNo} nolu faturanın banka/kart tahsilatı`,
            userId: 'admin',
            createdAt: new Date().toISOString(),
          };
          draft.bankTransactions.push(bnkTx);
          bank.balance += isPurchase ? -pPaidAmount : pPaidAmount;
        }

        // Add payment balancing entry to Current Transactions
        const paymentCurTx: CurrentTransaction = {
          id: `ctx-${Date.now()}-pay`,
          customerId: customer.id,
          customerCode: customer.code,
          customerTitle: customer.title,
          documentNo: invoiceNo,
          documentType: isPurchase ? 'PAYMENT' : 'COLLECTION',
          date: invoiceDate,
          debit: isPurchase ? pPaidAmount : 0,
          credit: isPurchase ? 0 : pPaidAmount,
          balance: 0,
          description: `${invoiceNo} nolu faturanın tahsilatı/ödemesi`,
          paymentMethod: paymentType,
          relatedInvoiceId: invoiceId,
          userId: 'admin',
          createdAt: new Date().toISOString(),
        };
        draft.currentTransactions.push(paymentCurTx);
      }

      return invoice;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'INVOICE',
      documentNo: createdInvoice.invoiceNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${createdInvoice.customerTitle} için ${createdInvoice.grandTotal.toLocaleString('tr-TR')} TL tutarında ${createdInvoice.invoiceNo} oluşturuldu.`,
    });

    res.json({ success: true, invoice: createdInvoice, message: 'Fatura başarıyla kaydedildi ve tüm muhasebe hareketleri işlendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/invoices/:id/duplicate - Fatura Klonlama / Çoğaltma
invoicesRouter.post('/:id/duplicate', async (req, res) => {
  try {
    const db = storage.getState();
    const source = db.invoices.find(i => i.id === req.params.id);
    if (!source) {
      return res.status(404).json({ success: false, message: 'Klonlanacak fatura bulunamadı.' });
    }

    const isPurchase = source.type === 'PURCHASE';
    const seqType = isPurchase ? 'PURCHASE_INVOICE' : 'SALES_INVOICE';
    const newInvoiceNo = storage.getNextSequence(seqType);
    const newId = `inv-${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];

    const clonedInvoice: Invoice = {
      ...source,
      id: newId,
      invoiceNo: newInvoiceNo,
      date: today,
      maturityDate: today,
      paidAmount: 0,
      paymentStatus: 'UNPAID',
      status: 'ACTIVE',
      eInvoiceStatus: 'DRAFT',
      // 2026-09-16 (`docs/45`): `{...source}` yayılımı kaynağın GERÇEK ETTN'sini
      // klona taşır. Klon AYRI bir belgedir; aynı ETTN'yi taşıyamaz (iki belge
      // aynı kimlikle iptal/kabul hedeflenirdi). Bu yüzden satır SİLİNMEZ,
      // bilerek `undefined` yazılır.
      eInvoiceUUID: undefined,
      gibStatusCode: undefined,
      gibStatusDescription: undefined,
      notes: `${source.invoiceNo} numaralı faturadan kopyalandı. ${source.notes || ''}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: (source.items || []).map((item, idx) => ({
        ...item,
        id: `item-${Date.now()}-${idx}`,
        invoiceId: newId,
      })),
    };

    await storage.runTransaction(draft => {
      draft.invoices.push(clonedInvoice);
    });

    res.json({
      success: true,
      message: `${source.invoiceNo} nolu fatura başarıyla kopyalandı. Yeni Fatura No: ${newInvoiceNo}`,
      invoice: clonedInvoice,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/invoices/:id/convert-return - İade Faturasına Dönüştürme
invoicesRouter.post('/:id/convert-return', async (req, res) => {
  try {
    const db = storage.getState();
    const source = db.invoices.find(i => i.id === req.params.id);
    if (!source) {
      return res.status(404).json({ success: false, message: 'İadeye dönüştürülecek fatura bulunamadı.' });
    }

    const returnType = source.type === 'SALES' ? 'PURCHASE' : 'SALES'; // Satış iadesi depoya giriş (PURCHASE/RETURN), alış iadesi çıkış
    const seqType = returnType === 'PURCHASE' ? 'PURCHASE_INVOICE' : 'SALES_INVOICE';
    const newInvoiceNo = storage.getNextSequence(seqType);
    const newId = `inv-ret-${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];

    const returnInvoice: Invoice = {
      ...source,
      id: newId,
      invoiceNo: newInvoiceNo,
      type: returnType,
      invoiceCategory: 'IADE',
      date: today,
      maturityDate: today,
      paidAmount: 0,
      paymentStatus: 'UNPAID',
      status: 'ACTIVE',
      eInvoiceStatus: 'DRAFT',
      // 2026-09-16 (`docs/45`): klonlama ile aynı gerekçe — iade faturası AYRI
      // bir belgedir, `{...source}` yayılımından gelen ETTN sızmamalıdır.
      eInvoiceUUID: undefined,
      gibStatusCode: undefined,
      gibStatusDescription: undefined,
      notes: `${source.invoiceNo} nolu faturanın İADESİDİR.`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: (source.items || []).map((item, idx) => ({
        ...item,
        id: `item-ret-${Date.now()}-${idx}`,
        invoiceId: newId,
      })),
    };

    await storage.runTransaction(draft => {
      draft.invoices.push(returnInvoice);
      // Create reverse current transaction
      const curTx: CurrentTransaction = {
        id: `ctx-${Date.now()}`,
        customerId: returnInvoice.customerId,
        customerCode: returnInvoice.customerCode,
        customerTitle: returnInvoice.customerTitle,
        documentNo: newInvoiceNo,
        documentType: returnType === 'PURCHASE' ? 'PURCHASE_INVOICE' : 'SALES_INVOICE',
        date: today,
        debit: returnType === 'PURCHASE' ? 0 : returnInvoice.grandTotal,
        credit: returnType === 'PURCHASE' ? returnInvoice.grandTotal : 0,
        balance: 0,
        description: `${source.invoiceNo} nolu faturanın İade Faturası (${newInvoiceNo})`,
        relatedInvoiceId: newId,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };
      draft.currentTransactions.push(curTx);
    });

    res.json({
      success: true,
      message: `${source.invoiceNo} için ${newInvoiceNo} nolu İade Faturası başarıyla oluşturuldu.`,
      invoice: returnInvoice,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cancel / Soft Delete Invoice (Atomic reversal of all movements)
invoicesRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId || 'tnt-isbey';
  const user = req.user!;
  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
    ? req.body.reason.trim()
    : 'Kullanıcı talebi ile iptal';

  try {
    // Bu eski rota daha önce tenant sınırı olmadan yerel silme yapıyor ve
    // gönderilmiş e-Belgelerde entegratöre hiç uğramıyordu. Gerçekten
    // gönderilmiş belgelerde merkezi, fail-closed iptal akışını kullan.
    const current = storage.getState().invoices.find(i =>
      i.id === id && (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey'))
    );
    if (!current) throw new Error('Fatura bulunamadı.');
    if (current.isDeleted || current.status === 'CANCELLED') throw new Error('Fatura zaten iptal edilmiş.');

    const hasOutgoingEDoc = Boolean(
      current.eInvoiceUUID &&
      ['SENT', 'ACCEPTED', 'DELIVERED'].includes(current.eInvoiceStatus || '')
    );
    if (hasOutgoingEDoc) {
      const invoice = await DocumentConversionService.cancelInvoice(
        id,
        tenantId,
        reason,
        user.id,
        user.fullName || user.username
      );
      return res.json({
        success: true,
        message: 'Gönderilmiş e-Belge önce entegratörde doğrulanarak, ardından yerelde iptal edildi.',
        invoice,
      });
    }

    const deletedInvoiceNo = await storage.runTransaction(draft => {
      const invoice = draft.invoices.find(i =>
        i.id === id && (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey'))
      );
      if (!invoice) throw new Error('Fatura bulunamadı.');
      if (invoice.isDeleted) throw new Error('Fatura zaten iptal edilmiş.');

      invoice.isDeleted = true;
      invoice.status = 'CANCELLED';
      invoice.updatedAt = new Date().toISOString();

      // Remove stock movements
      draft.stockMovements = draft.stockMovements.filter(m => m.documentNo !== invoice.invoiceNo);

      // Remove current transactions related to this invoice
      draft.currentTransactions = draft.currentTransactions.filter(
        t => t.relatedInvoiceId !== invoice.id && t.documentNo !== invoice.invoiceNo
      );

      // Remove cash transactions
      draft.cashTransactions = draft.cashTransactions.filter(c => c.documentNo !== invoice.invoiceNo);

      // Remove bank transactions
      draft.bankTransactions = draft.bankTransactions.filter(b => b.documentNo !== invoice.invoiceNo);

      return invoice.invoiceNo;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CANCEL',
      module: 'INVOICE',
      documentNo: deletedInvoiceNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${deletedInvoiceNo} nolu fatura iptal edildi. Tüm cari ve stok hareketleri geri alındı.`,
    });

    res.json({ success: true, message: 'Fatura iptal edildi ve tüm muhasebe hareketleri geri alındı.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
