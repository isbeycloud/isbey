import { Router } from 'express';
import { storage } from '../db/storage';
import { Invoice, InvoiceItem, StockMovement, CurrentTransaction, CashTransaction, BankTransaction, Warehouse } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';
import { DocumentConversionService } from '../services/documentConversionService';
import { resolveInvoiceRecipient } from '../services/invoiceRecipientService';
import {
  isOwnedBy,
  assertOwnedWarehouse,
  stockMovementOwnedFields,
} from '../security/tenantOwnership';

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);
invoicesRouter.use(resolveTenant);

/**
 * Fatura kaleminin stok hareketi hangi depoya yazılacak? (SUNUCU kararı)
 *
 * 2026-10-17 GÜVENLİK: Eski hâlde `warehouseId || product.warehouseId || 'wh-1'`
 * idi. Üç sorun: (1) filtre yok — başka firmanın deposu hedeflenebiliyordu;
 * (2) `'wh-1'` canlıda VAR OLMAYAN sahipsiz kimlik; (3) `product.warehouseId`
 * canlıda kırık referans taşıyor (`'wh-default'`) ve bu sessizce başka depoya
 * düşüyordu — yani hareket çözülmemiş bir depoya yazılıyordu.
 *
 * Yeni sıra — hiçbir adımda "varsayılana düşme" yok:
 *   1. İstekte depo verilmişse YALNIZ o kullanılır (geçersizse açık hata).
 *   2. Yoksa ürünün kendi deposu (varsa) — yine kapıdan geçmek zorunda.
 *   3. Yoksa firmanın TEK deposu (sunucu kararı; istekten türetilmiş değil).
 *   4. Hiçbiri yoksa açık hata (sessizce başka firmaya yazılmaz).
 */
function resolveItemWarehouse(
  warehouses: Warehouse[] | undefined,
  requestedWarehouseId: string | undefined,
  productWarehouseId: string | undefined,
  tenantId: string
): Warehouse {
  // 1) İstekte depo verildi → başka depoya DÜŞÜLMEZ, kapı karar verir.
  if (requestedWarehouseId) return assertOwnedWarehouse(warehouses, requestedWarehouseId, tenantId);
  // 2) Ürünün kendi deposu (canlıda kırık referans olabilir → açık hata verir).
  if (typeof productWarehouseId === 'string' && productWarehouseId.trim() !== '') {
    return assertOwnedWarehouse(warehouses, productWarehouseId, tenantId);
  }
  // 3) Firmanın tek deposu varsa o; yoksa/çoksa açık hata.
  const owned = (warehouses || []).filter(w => isOwnedBy(w, tenantId));
  return assertOwnedWarehouse(warehouses, owned.length === 1 ? owned[0].id : undefined, tenantId);
}

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
    // 2026-10-12: Fatura SERİSİ (A/B Serisi…). Verilmezse mevcut tek sayaç
    // kullanılır (geriye dönük uyum). Verilirse numara o seriden gelir.
    invoiceSeriesId,
  } = req.body;

  if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Müşteri ve en az bir ürün kalemi zorunludur.' });
  }

  const invoiceType = type || 'SALES';
  const isPurchase = invoiceType === 'PURCHASE';

  // 2026-10-12: GİB fatura tipi kapısı. `InvoiceTypeCode` alanına GİB'in kabul
  // etmediği bir değer girerse entegratör reddeder; bu yüzden depoya girmeden
  // reddedilir (sessiz bozulma olmaz).
  const VALID_CATEGORIES = ['SATIS', 'IADE', 'TEVKIFAT', 'ISTISNA', 'OZELMATRAH', 'IHRACKAYITLI', 'KONAKLAMA', 'SGK'];
  if (invoiceCategory !== undefined && !VALID_CATEGORIES.includes(String(invoiceCategory))) {
    return res.status(400).json({ success: false, message: `Geçersiz GİB fatura tipi: ${invoiceCategory}.` });
  }

  try {
    // 2026-10-17: Firma ve işlemi yapan kullanıcı sunucu tarafında sabitlenir.
    // `tenantId` yeni kayıtlara yazılır; `userId` artık sabit 'admin' DEĞİL.
    const tenantId = req.tenantId!;
    const actingUserId = req.user?.id || 'system';
    const selectedCustomer = storage.getState().customers.find(c => c.id === customerId && c.tenantId === req.tenantId);
    if (!selectedCustomer) throw new Error('Seçilen cari kart sistemde bulunamadı!');
    const recipient = invoiceType === 'SALES' ? await resolveInvoiceRecipient(selectedCustomer.taxNumber || '', req.tenantId!, invoiceProfile) : undefined;
    const createdInvoice = await storage.runTransaction(draft => {
      // 1. Verify Customer
      // 2026-10-17: Cari SAHİPLİKLE aranır. Eski hâlde transaction içindeki
      // `find` filtresizdi: dışarıdaki kontrolden sonra cari değişirse (veya
      // doğrudan içeriden çağrılırsa) başka firmanın carisi kullanılabiliyordu.
      const customer = draft.customers.find(c => c.id === customerId && isOwnedBy(c, tenantId));
      if (!customer) {
        throw new Error('Seçilen cari kart sistemde bulunamadı!');
      }
      if (recipient && customer.taxNumber?.replace(/\D/g, '') !== recipient.identifier) throw new Error('Alıcının vergi numarası değişti. Cariyi tekrar seçip sorgulayın.');

      // 2. Generate Invoice Document Number
      // 2026-10-12: SERİ seçildiyse numara o serinin sayacından gelir.
      // Seri bulunamazsa/pasifse/yabancıysa 400 (sessizce eski sayaca DÜŞÜLMEZ —
      // kullanıcı yanlış seriden numara aldığını bilmeli).
      const seqKind = isPurchase ? 'PURCHASE' : 'SALES';
      let invoiceNo: string;
      let usedSeriesId: string | undefined;
      const seriesId = typeof invoiceSeriesId === 'string' && invoiceSeriesId.trim()
        ? invoiceSeriesId.trim()
        : undefined;
      if (seriesId) {
        const series = (draft.invoiceSeries || []).find(
          s => s.id === seriesId && (s.tenantId === tenantId || (tenantId === 'tnt-isbey' && !s.tenantId))
        );
        if (!series) throw new Error('Fatura serisi bulunamadı.');
        if (series.active === false) throw new Error(`Fatura serisi pasif: ${series.name}.`);
        if (series.invoiceTypes.length > 0 && !series.invoiceTypes.includes(seqKind as any)) {
          throw new Error(`Bu seri ${seqKind === 'SALES' ? 'satış' : 'alış'} faturaları için tanımlı değil: ${series.name}.`);
        }
        const yr = new Date().getFullYear();
        series.lastNumber += 1;
        invoiceNo = `${series.prefix}-${yr}-${String(series.lastNumber).padStart(series.length || 6, '0')}`;
        usedSeriesId = series.id;
      } else {
        const seqType = isPurchase ? 'PURCHASE_INVOICE' : 'SALES_INVOICE';
        invoiceNo = storage.nextSequenceInTransaction(draft, seqType);
      }

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

      // 2026-10-17: Faturanın depo alanı, kalemlerin çözümlenmiş deposundan
      // yazılır (aşağıdaki döngüde doldurulur) — `'wh-1'` fallback'i YOK.
      let invoiceWarehouse: Warehouse | undefined;

      // 3. Process items and calculate values
      for (let i = 0; i < items.length; i++) {
        const itemInput = items[i];
        // 2026-10-17: Ürün SAHİPLİKLE aranır (eskiden filtresizdi → başka
        // firmanın ürünü faturalanabiliyor, stok hareketi onun adına yazılıyordu).
        const product = draft.products.find(p => p.id === itemInput.productId && isOwnedBy(p, tenantId));
        if (!product) {
          throw new Error(`Ürün bulunamadı: ID ${itemInput.productId}`);
        }

        const quantity = Number(itemInput.quantity) || 1;
        if (quantity <= 0) {
          throw new Error(`Geçersiz miktar: ${product.name}`);
        }

        // 2026-10-12: Varyant stok kontrolü. Varyantlı üründe satır MUTLAKA bir
        // varyanta bağlı olmalı; yoksa hangi varyanttan düşüleceği belirsizdir
        // ve ürün toplamından sessizce düşmek varyant stoklarını bozar.
        // Varyantsız üründe mevcut davranış AYNEN korunur.
        let variant: import('../db/schema').ProductVariant | undefined;
        const variantId = typeof itemInput.variantId === 'string' && itemInput.variantId.trim()
          ? itemInput.variantId.trim()
          : undefined;
        if (Array.isArray(product.variants) && product.variants.length > 0) {
          if (!variantId) {
            throw new Error(`Varyant seçimi zorunlu: ${product.name} için bir varyant seçin.`);
          }
          variant = product.variants.find(v => v.id === variantId && v.active !== false);
          if (!variant) {
            throw new Error(`Varyant bulunamadı: ${product.name}`);
          }
        }

        // Check stock for sales
        if (!isPurchase) {
          const available = variant ? Number(variant.currentStock) || 0 : product.currentStock;
          const label = variant ? `${product.name} (${variant.name})` : product.name;
          if (available < quantity) {
            throw new Error(`Yetersiz stok! Ürün: ${label} (Mevcut: ${available} ${product.unit}, İstenen: ${quantity})`);
          }
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
          // 2026-10-12: Varyant izi (tutar hesabı değişmez).
          variantId: variant?.id,
          variantName: variant?.name,
          productCode: product.code,
          productName: variant ? `${product.name} (${variant.name})` : product.name,
          barcode: variant?.barcode || product.barcode,
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
          // 2026-10-12: Satırın hangi fiyat listesiyle fiyatlandığının İZİ.
          // Tutar hesabı `unitPrice` üzerinden yapılır; bu alan yalnızca
          // sonradan "hangi listeyle fiyatlandı" sorusunu yanıtlar.
          // Geçersiz/boş değer diske yazılmaz (undefined kalır).
          priceListId: typeof itemInput.priceListId === 'string' && itemInput.priceListId.trim()
            ? itemInput.priceListId.trim()
            : undefined,
          lineTotal: lineNet,
          lineGrandTotal: lineGross,
        };
        processedItems.push(invItem);

        // 4. Create Stock Movement (Double-entry inventory tracking)
        // 2026-10-17: Hedef depo SUNUCU kararıyla ve sahiplik doğrulamasıyla
        // belirlenir (bkz. resolveItemWarehouse). `'wh-1'` fallback'i KALDIRILDI.
        const wh = resolveItemWarehouse(draft.warehouses, warehouseId, product.warehouseId, tenantId);
        // Faturanın depo alanı için ilk çözümlenen depo kullanılır (kalemler
        // farklı depolara yazılabiliyorsa fatura başlığı ilkini taşır).
        if (!invoiceWarehouse) invoiceWarehouse = wh;

        const stockMovement: StockMovement = {
          id: `sm-${Date.now()}-${i}`,
          // 2026-10-17: `tenantId` + doğrulanmış depo kimliği/adı yazılır.
          ...stockMovementOwnedFields(tenantId, wh),
          productId: product.id,
          // 2026-10-12: Varyant izi — recalculateBalances varyant stoğunu
          // bu alandan hesaplar.
          variantId: variant?.id,
          variantName: variant?.name,
          productCode: product.code,
          productName: product.name,
          documentNo: invoiceNo,
          documentType: 'INVOICE',
          movementType: isPurchase ? 'PURCHASE' : 'SALE',
          quantity,
          direction: isPurchase ? 'IN' : 'OUT',
          unitPrice,
          totalAmount: lineGross,
          date: invoiceDate,
          notes: `${invoiceNo} nolu ${isPurchase ? 'Alış' : 'Satış'} Faturası`,
          userId: actingUserId,
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
        tenantId,
        companyId: tenantId,
        invoiceNo,
        // 2026-10-12: Seri izi (serisiz faturalarda undefined).
        invoiceSeriesId: usedSeriesId,
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
        // 2026-10-17: Depo, kalemlerin doğrulanmış deposundan gelir.
        // Eski hâlde `warehouseId || 'wh-1'` — canlıda VAR OLMAYAN kimlik.
        warehouseId: invoiceWarehouse ? invoiceWarehouse.id : assertOwnedWarehouse(draft.warehouses, warehouseId, tenantId).id,
        currency,
        exchangeRate: Number(exchangeRate) || 1,
        invoiceProfile: recipient?.profile || invoiceProfile as any,
        invoiceCategory: invoiceCategory as any,
        withholdingCode: withholdingCode || undefined,
        withholdingRate: numWithholdingRate > 0 ? numWithholdingRate : undefined,
        withholdingAmount: totalWithholding > 0 ? totalWithholding : undefined,
        exemptionCode: exemptionCode || undefined,
        recipientTaxNumber: recipient?.identifier || recipientTaxNumber || customer.taxNumber,
        recipientAliasGB: recipient ? recipient.aliasGB : recipientAliasGB || undefined,
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
        userId: actingUserId,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      draft.invoices.push(invoice);

      // 6. Create Current Transaction (Cari Hareket)
      // Satış -> Borç artar, Alış -> Alacak artar
      const curTx: CurrentTransaction = {
        id: `ctx-${Date.now()}`,
        // 2026-10-17: Cari hareket de SAHİPLİK taşır (eskiden yoktu → kayıt
        // sahipsiz doğuyor ve varsayılan firmada birikiyordu).
        tenantId,
        companyId: tenantId,
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
        userId: actingUserId,
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
            userId: actingUserId,
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
            userId: actingUserId,
            createdAt: new Date().toISOString(),
          };
          draft.bankTransactions.push(bnkTx);
          bank.balance += isPurchase ? -pPaidAmount : pPaidAmount;
        }

        // Add payment balancing entry to Current Transactions
        const paymentCurTx: CurrentTransaction = {
          id: `ctx-${Date.now()}-pay`,
          tenantId,
          companyId: tenantId,
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
          userId: actingUserId,
          createdAt: new Date().toISOString(),
        };
        draft.currentTransactions.push(paymentCurTx);
      }

      return invoice;
    });

    storage.addAuditLog({
      userId: actingUserId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      module: 'INVOICE',
      documentNo: createdInvoice.invoiceNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${createdInvoice.customerTitle} için ${createdInvoice.grandTotal.toLocaleString('tr-TR')} TL tutarında ${createdInvoice.invoiceNo} oluşturuldu.`,
    });

    res.json({ success: true, invoice: createdInvoice, message: 'Fatura başarıyla kaydedildi ve tüm muhasebe hareketleri işlendi.' });
  } catch (err: any) {
    // Depo kapısı hatası ise HTTP kodu ve `code` alanı korunur (403/400).
    res.status(err?.statusCode || 400).json({ success: false, code: err?.code, message: err.message });
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
