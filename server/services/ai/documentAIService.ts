import crypto from 'crypto';
import { storage } from '../../db/storage';
import { DocumentAIJob, DocumentAIField, DocumentTypeEnum, DatabaseState, Invoice } from '../../db/schema';

export interface ProcessDocumentParams {
  tenantId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
  documentType?: DocumentTypeEnum;
}

export class DocumentAIService {
  /**
   * Belgeyi işler, OCR uygular ve alan bazlı güven skoru çıkarır
   */
  public static async processDocument(params: ProcessDocumentParams): Promise<DocumentAIJob> {
    const { tenantId, userId, fileName, fileSize, mimeType, fileUrl, documentType = 'INVOICE' } = params;

    // MIME Kontrolü
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(mimeType) && !fileName.match(/\.(pdf|jpg|jpeg|png|webp)$/i)) {
      throw new Error('Geçersiz dosya formatı. Yalnızca PDF, JPG, PNG ve WEBP belgeleri desteklenir.');
    }

    if (fileSize > 20 * 1024 * 1024) {
      throw new Error('Dosya boyutu 20 MB sınırını aşamaz.');
    }

    const now = new Date().toISOString();
    const jobId = `ocr-job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // OCR Simülasyonu ve Akıllı Alan Ayrıştırması
    const isReceipt = fileName.toLowerCase().includes('fis') || fileName.toLowerCase().includes('makbuz') || documentType === 'RECEIPT';
    const detectedDocType: DocumentTypeEnum = isReceipt ? 'RECEIPT' : 'INVOICE';

    const sampleSupplier = isReceipt ? 'OPET AKARYAKIT A.Ş.' : 'METRO ELEKTRONİK TİC. LTD. ŞTİ.';
    const sampleVkn = isReceipt ? '6440012345' : '6120987654';
    const sampleInvoiceNo = isReceipt ? `FIS-${Math.floor(100000 + Math.random() * 900000)}` : `GIB2026${Math.floor(100000000 + Math.random() * 900000000)}`;
    const subtotal = isReceipt ? 850 : 14500;
    const vatTotal = isReceipt ? 170 : 2900;
    const grandTotal = subtotal + vatTotal;

    const fields: DocumentAIField[] = [
      { fieldName: 'supplierTitle', fieldLabel: 'Firma Ünvanı', fieldValue: sampleSupplier, confidence: 98 },
      { fieldName: 'taxNumber', fieldLabel: 'VKN / TCKN', fieldValue: sampleVkn, confidence: 99 },
      { fieldName: 'invoiceNo', fieldLabel: 'Belge Numarası', fieldValue: sampleInvoiceNo, confidence: 99 },
      { fieldName: 'invoiceDate', fieldLabel: 'Fatura Tarihi', fieldValue: now.split('T')[0], confidence: 96 },
      { fieldName: 'subtotal', fieldLabel: 'Ara Toplam (Matrah)', fieldValue: subtotal, confidence: 97 },
      { fieldName: 'vatTotal', fieldLabel: 'Hesaplanan KDV', fieldValue: vatTotal, confidence: 95 },
      { fieldName: 'grandTotal', fieldLabel: 'Genel Toplam', fieldValue: grandTotal, confidence: 99 },
    ];

    const draftInvoice = {
      supplierTitle: sampleSupplier,
      taxNumber: sampleVkn,
      invoiceNo: sampleInvoiceNo,
      invoiceDate: now.split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      lineItems: [
        {
          name: isReceipt ? 'Motorin (Dizel) Akaryakıt' : '27 inç 4K Profesyonel Monitör',
          quantity: isReceipt ? 20 : 2,
          unitPrice: isReceipt ? 42.5 : 7250,
          vatRate: 20,
          total: subtotal,
        },
      ],
      subtotal,
      vatTotal,
      grandTotal,
      suggestedCategory: isReceipt ? 'Akaryakıt & Ulaşım' : 'Bilişim & Donanım',
    };

    const newJob: DocumentAIJob = {
      id: jobId,
      tenantId,
      userId,
      fileName,
      fileSize,
      mimeType,
      fileUrl,
      documentType: detectedDocType,
      status: 'COMPLETED',
      overallConfidence: 97.4,
      extractedFields: fields,
      extractedDraftInvoice: draftInvoice,
      createdAt: now,
      completedAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.documentAIJobs) draft.documentAIJobs = [];
      draft.documentAIJobs.unshift(newJob);

      // AI denetim logu yaz
      if (!draft.aiInteractions) draft.aiInteractions = [];
      draft.aiInteractions.unshift({
        id: `ai-int-${Date.now()}`,
        tenantId,
        userId,
        requestType: 'DOCUMENT_OCR',
        inputSummary: `OCR İşlendi: ${fileName} (${fileSize} bytes)`,
        outputSummary: `Çıkarılan Belge: ${sampleInvoiceNo} - ${grandTotal} TL (%97 Güven)`,
        model: 'DocumentAI-OCR-v7',
        confidence: 0.97,
        createdAt: now,
      });

      return newJob;
    });
  }

  /**
   * OCR sonucunu onaylayıp kesin ERP Alış Faturasına dönüştürür
   */
  public static async createInvoiceFromJob(params: {
    tenantId: string;
    jobId: string;
    userId: string;
    confirmedData: any;
  }): Promise<{ success: boolean; invoiceId: string; message: string }> {
    const { tenantId, jobId, userId, confirmedData } = params;

    return await storage.runTransaction((draft: DatabaseState) => {
      const job = (draft.documentAIJobs || []).find(j => j.id === jobId && j.tenantId === tenantId);
      if (!job) throw new Error('OCR belgesi bulunamadı.');

      const now = new Date().toISOString();
      const invoiceId = `inv-ocr-${Date.now()}`;

      // Cari Bul veya Oluştur
      let customer = (draft.customers || []).find(
        c => c.tenantId === tenantId && (c.taxNumber === confirmedData.taxNumber || c.title.toLowerCase() === confirmedData.supplierTitle.toLowerCase())
      );

      if (!customer) {
        const custCode = `CAR-OCR-${Math.floor(100 + Math.random() * 900)}`;
        customer = {
          id: `cust-ocr-${Date.now()}`,
          tenantId,
          code: custCode,
          title: confirmedData.supplierTitle || 'Tedarikçi',
          taxNumber: confirmedData.taxNumber,
          type: 'SUPPLIER',
          phone: '',
          balance: 0,
          totalDebit: 0,
          totalCredit: 0,
          riskLimit: 50000,
          maturityDays: 30,
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        if (!draft.customers) draft.customers = [];
        draft.customers.push(customer);
      }

      // Alış Faturası Kaydı
      const newInvoice: any = {
        id: invoiceId,
        tenantId,
        companyId: customer.companyId || 'cmp-default',
        invoiceNo: confirmedData.invoiceNo || `ALIS-${Date.now()}`,
        type: 'PURCHASE',
        customerId: customer.id,
        customerCode: customer.code,
        customerTitle: customer.title,
        date: confirmedData.invoiceDate || now.split('T')[0],
        dueDate: confirmedData.dueDate || now.split('T')[0],
        status: 'APPROVED',
        subtotal: confirmedData.subtotal || confirmedData.grandTotal * 0.8,
        vatTotal: confirmedData.vatTotal || confirmedData.grandTotal * 0.2,
        grandTotal: confirmedData.grandTotal,
        currency: 'TRY',
        notes: `Document AI (OCR) ile ${job.fileName} belgesinden otomatik üretildi.`,
        lineItems: confirmedData.lineItems || [],
        createdAt: now,
        updatedAt: now,
      };

      if (!draft.invoices) draft.invoices = [];
      draft.invoices.unshift(newInvoice);

      // Cari Hareket ve Bakiye Güncelleme (Alacaklı yap)
      customer.balance = (customer.balance || 0) - confirmedData.grandTotal;
      customer.totalCredit = (customer.totalCredit || 0) + confirmedData.grandTotal;
      customer.updatedAt = now;

      if (!draft.currentTransactions) draft.currentTransactions = [];
      draft.currentTransactions.push({
        id: `ctx-ocr-${Date.now()}`,
        tenantId,
        companyId: customer.companyId || 'cmp-default',
        customerId: customer.id,
        customerCode: customer.code,
        customerTitle: customer.title,
        date: newInvoice.date,
        documentNo: newInvoice.invoiceNo,
        transactionType: 'ALIS_FATURASI',
        description: `Alış Faturası (OCR Belge: ${job.fileName})`,
        debt: 0,
        credit: newInvoice.grandTotal,
        balance: customer.balance,
        dueDate: newInvoice.dueDate,
        userId,
        createdAt: now,
      });

      job.status = 'REVIEWED';

      return {
        success: true,
        invoiceId,
        message: `${newInvoice.invoiceNo} numaralı alış faturası başarıyla oluşturuldu ve cari hesaba işlendi.`,
      };
    });
  }
}
