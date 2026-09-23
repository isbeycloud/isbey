import { storage } from '../db/storage';
import {
  IncomingInvoice,
  IncomingInvoiceItem,
  Invoice,
  Customer,
  Product,
} from '../db/schema';
import { ProviderFactory } from './providers/providerFactory';
import { DocumentStorageService } from './documentStorageService';
import { DocumentConversionService } from './documentConversionService';

export class IncomingInvoiceService {
  /**
   * 1. Gelen e-Faturaları Entegratörden Çeker ve Senkronize Eder
   */
  public static async syncIncomingInvoices(tenantId: string, startDate?: string): Promise<{ syncedCount: number; duplicateCount: number }> {
    const db = storage.getState();
    const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);
    const fromDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const incomingList = await provider.getIncomingInvoices(fromDate, settings);

    let syncedCount = 0;
    let duplicateCount = 0;
    const now = new Date().toISOString();

    if (!db.incomingInvoices) db.incomingInvoices = [];

    for (const item of incomingList) {
      // UUID bazında mükerrerlik kontrolü (Idempotent Sync)
      const exists = db.incomingInvoices.some(
        inv => inv.uuid === item.uuid && (inv.tenantId === tenantId || (tenantId === 'tnt-isbey' && !inv.tenantId))
      );

      if (exists) {
        duplicateCount++;
        continue;
      }

      // XML'i güvenli tenant dizinine kaydet
      const xmlPath = DocumentStorageService.saveXml(tenantId, 'incoming_invoice', item.uuid, item.xmlContent);

      const newIncoming: IncomingInvoice = {
        id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId,
        uuid: item.uuid,
        invoiceNo: item.invoiceNo,
        supplierTaxNumber: item.supplierVkn,
        supplierTitle: item.supplierTitle,
        issueDate: item.issueDate,
        subTotal: item.subTotal,
        vatAmount: item.vatAmount,
        grandTotal: item.grandTotal,
        currency: item.currency || 'TRY',
        status: 'RECEIVED',
        xmlStoragePath: xmlPath,
        items: [
          {
            id: `inci-${Date.now()}-1`,
            incomingInvoiceId: item.uuid,
            name: 'Gelen Mal / Hizmet Kalemi',
            quantity: 1,
            unit: 'Adet',
            unitPrice: item.subTotal,
            vatRate: 20,
            vatAmount: item.vatAmount,
            lineTotal: item.subTotal,
          },
        ],
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      db.incomingInvoices.push(newIncoming);
      syncedCount++;
    }

    storage.save();
    return { syncedCount, duplicateCount };
  }

  /**
   * 2. Gelen e-Faturayı Alış Faturasına Dönüştürme Motoru
   */
  public static async convertToPurchaseInvoice(
    incomingInvoiceId: string,
    tenantId: string,
    userId: string,
    username: string = 'Sistem'
  ): Promise<Invoice> {
    const db = storage.getState();
    const incInvoice = (db.incomingInvoices || []).find(
      i => (i.id === incomingInvoiceId || i.uuid === incomingInvoiceId) && (i.tenantId === tenantId || (tenantId === 'tnt-isbey' && !i.tenantId))
    );
    if (!incInvoice) throw new Error('Gelen fatura kaydı bulunamadı.');

    // 1. Tedarikçiyi Bul veya Otomatik Oluştur
    let supplier = (db.customers || []).find(
      c => c.taxNumber === incInvoice.supplierTaxNumber && (c.tenantId === tenantId || (tenantId === 'tnt-isbey' && !c.tenantId))
    );

    if (!supplier) {
      const supCode = storage.getNextSequence('CUSTOMER_SUPPLIER') || `320.${String((db.customers?.length || 0) + 1).padStart(5, '0')}`;
      supplier = {
        id: `cust-sup-${Date.now()}`,
        tenantId,
        code: supCode,
        title: incInvoice.supplierTitle,
        taxNumber: incInvoice.supplierTaxNumber,
        taxOffice: 'Vergi Dairesi',
        type: 'SUPPLIER',
        currency: 'TRY',
        balance: 0,
        totalDebit: 0,
        totalCredit: 0,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!db.customers) db.customers = [];
      db.customers.push(supplier);
    }

    // 2. Ürünleri Eşle veya Varsayılan Ticari Mal Olarak Ata
    const defaultProduct = (db.products || []).find(
      p => (p.tenantId === tenantId || (tenantId === 'tnt-isbey' && !p.tenantId)) && !p.deletedAt
    );

    let mappedProductId = defaultProduct?.id;
    if (!mappedProductId) {
      // Ürün yoksa hızlıca bir ticari mal kartı oluştur
      const newProd: Product = {
        id: `prod-auto-${Date.now()}`,
        tenantId,
        code: `STK-ALIS-${Date.now().toString().slice(-4)}`,
        name: 'Genel Ticari Mal Alışı',
        unit: 'Adet',
        purchasePrice: incInvoice.subTotal,
        salePrice: incInvoice.subTotal * 1.3,
        vatRate: 20,
        currentStock: 0,
        criticalStock: 5,
        warehouseId: 'wh-default',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!db.products) db.products = [];
      db.products.push(newProd);
      mappedProductId = newProd.id;
    }

    // 3. DocumentConversionService ile Alış Faturası Kes
    const purchaseInvoice = await DocumentConversionService.createInvoice({
      tenantId,
      type: 'PURCHASE',
      customerId: supplier.id,
      date: incInvoice.issueDate,
      items: [
        {
          productId: mappedProductId,
          quantity: 1,
          unitPrice: incInvoice.subTotal,
          vatRate: 20,
        },
      ],
      notes: `Gelen e-Faturadan aktarıldı (UUID: ${incInvoice.uuid}, Fatura No: ${incInvoice.invoiceNo})`,
      userId,
      username,
    });

    incInvoice.status = 'CONVERTED_TO_PURCHASE';
    incInvoice.convertedPurchaseInvoiceId = purchaseInvoice.id;
    incInvoice.updatedAt = new Date().toISOString();

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'INCOMING_INVOICE_CONVERTED',
      module: 'E_INVOICE',
      documentNo: incInvoice.invoiceNo,
      ipAddress: '127.0.0.1',
      details: `${incInvoice.invoiceNo} nolu gelen e-fatura ${purchaseInvoice.invoiceNo} nolu alış faturasına dönüştürüldü.`,
    });

    storage.save();
    return purchaseInvoice;
  }

  /**
   * 3. Gelen e-Faturayı Kabul veya Reddetme Bildirimi
   */
  public static async respondToInvoice(
    incomingInvoiceId: string,
    tenantId: string,
    action: 'ACCEPTED' | 'REJECTED',
    reason?: string,
    userId?: string,
    username: string = 'Sistem'
  ): Promise<IncomingInvoice> {
    const db = storage.getState();
    // 2026-09-12: `action` doğrulanır. Önceden ham gövdeden geliyordu; geçersiz
    // bir değer (ör. 'FOO') else dalına düşüp belgeyi ACCEPTED yaparken denetim
    // kaydına "REDDEDİLDİ" yazıyordu — kayıt kendi içinde çelişiyordu.
    if (action !== 'ACCEPTED' && action !== 'REJECTED') {
      throw new Error("Geçersiz işlem: 'action' yalnızca ACCEPTED veya REJECTED olabilir.");
    }

    const incInvoice = (db.incomingInvoices || []).find(
      i => (i.id === incomingInvoiceId || i.uuid === incomingInvoiceId) && (i.tenantId === tenantId || (tenantId === 'tnt-isbey' && !i.tenantId))
    );
    if (!incInvoice) throw new Error('Gelen fatura bulunamadı.');

    // 2026-09-12 (fail-closed): yapılandırma yoksa hiçbir şey yapılmaz.
    // Aksi hâlde fabrika sessizce MOCK'a düşüyor, red bildirimi hiçbir yere
    // gitmeden "iletildi" sayılıyordu.
    const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);

    // 2026-09-16 GÜNCELLEME (`docs/44` §2): RED bildirimi artık `CancelDocument`
    // ile DEĞİL, `SendApplicationResponse` + `ResponseCode: "RED"` ile gidiyor.
    //
    // Önceden `provider.cancelInvoice(...)` çağrılıyordu ve bu SÖZLEŞMEYE AYKIRIYDI:
    // red bir "uygulama yanıtı"dır, iptal değildir. `CancelDocument` ucunun AppType
    // kümesi 3/6/7'dir (e-Arşiv / e-SMM / Müstahsil) ve e-Fatura (1) BULUNMAZ — yani
    // gelen bir e-Faturayı reddetmek iptal ucuyla yapılıyordu ve başarısız olurdu.
    //
    // Her iki dal da AYNI disiplini uygular: sağlayıcı `{ success: false }`
    // dönebilir (hata fırlatmak yerine) → sonuç MUTLAKA kontrol edilir ve
    // bildirilemeyen bir yanıt, belgenin durumunu DEĞİŞTİRMEZ.
    //
    // Ayrıca ETTN zorunludur (`docs/44` §1): boş kimlikle bildirim göndermek,
    // entegratörde hiçbir belgeyi hedeflemeyen bir istek üretir.
    const belgeUuid = typeof incInvoice.uuid === 'string' ? incInvoice.uuid.trim() : '';
    if (!belgeUuid) {
      throw new Error('Gelen belgenin e-Belge UUID (ETTN) bilgisi yok; uygulama yanıtı gönderilemedi.');
    }

    const yanitKodu: 'KABUL' | 'RED' = action === 'ACCEPTED' ? 'KABUL' : 'RED';
    const yanit = await provider.respondToInvoice({
      uuid: belgeUuid,
      responseCode: yanitKodu,
      description: action === 'REJECTED' ? (reason || 'Müşteri reddi') : undefined,
      documentId: incInvoice.invoiceNo,
      documentDate: incInvoice.issueDate,
    }, settings);
    if (!yanit?.success) {
      throw new Error(yanit?.message || `${yanitKodu} bildirimi entegratöre iletilemedi; durum değiştirilmedi.`);
    }

    if (action === 'ACCEPTED') {
      incInvoice.status = 'ACCEPTED';
    } else {
      incInvoice.status = 'REJECTED';
      incInvoice.rejectionReason = reason;
    }

    incInvoice.updatedAt = new Date().toISOString();

    storage.addAuditLog({
      userId: userId || 'usr-sys',
      username,
      companyId: tenantId,
      action: action === 'ACCEPTED' ? 'INCOMING_INVOICE_ACCEPTED' : 'INCOMING_INVOICE_REJECTED',
      module: 'E_INVOICE',
      documentNo: incInvoice.invoiceNo,
      ipAddress: '127.0.0.1',
      details: `${incInvoice.invoiceNo} gelen fatura için '${action}' yanıtı verildi.${reason ? ` Sebep: ${reason}` : ''}`,
    });

    storage.save();
    return incInvoice;
  }
}
