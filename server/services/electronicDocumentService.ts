import crypto from 'crypto';
import { storage } from '../db/storage';
import {
  ElectronicDocument,
  Invoice,
  Waybill,
  Customer,
} from '../db/schema';
import { ElectronicDocumentQueue } from './electronicDocumentQueue';
import { TaxpayerService } from './taxpayerService';
import { ProviderFactory } from './providers/providerFactory';
import { CreditWalletService } from './creditWalletService';

export interface SendInvoiceParams {
  invoiceId: string;
  tenantId: string;
  profile?: 'TEMELFATURA' | 'TICARIFATURA' | 'EARSIVFATURA';
  userId: string;
  username?: string;
}

export interface SendWaybillParams {
  waybillId: string;
  tenantId: string;
  userId: string;
  username?: string;
}

export class ElectronicDocumentService {
  /**
   * FAZ 25.3 #6: Duplicate belge koruması için eşzamanlı kuyruklama kilidi.
   * Node tek thread'li olduğu için await'ler arasında başka bir queueInvoice
   * girebilir (credit rezervasyonu async) → ikisi de find() geçip çift belge
   * üretir. Bu Set, await'ler arasında koruma sağlar (process ömrü boyunca).
   */
  private static queueingInProgress = new Set<string>();

  /**
   * 1. Faturayı e-Fatura veya e-Arşiv olarak kuyruğa alır
   */
  public static async queueInvoice(params: SendInvoiceParams): Promise<ElectronicDocument> {
    const { invoiceId, tenantId, profile, userId, username = 'Sistem' } = params;
    const db = storage.getState(tenantId);

    // FAZ 25.3 #6: Race-condition koruması — aynı fatura için eşzamanlı ikinci kuyruklama reddedilir
    const raceKey = `INVOICE:${tenantId}:${invoiceId}`;
    if (this.queueingInProgress.has(raceKey)) {
      throw new Error('Bu fatura için gönderim işlemi şu anda zaten sürüyor. Lütfen tekrar deneyin.');
    }
    this.queueingInProgress.add(raceKey);

    try {
    const invoice = (db.invoices || []).find(
      i => i.id === invoiceId && (i.tenantId === tenantId || (tenantId === 'tnt-isbey' && !i.tenantId))
    );
    if (!invoice) throw new Error('Fatura bulunamadı.');
    if (invoice.status === 'CANCELLED') throw new Error('İptal edilmiş fatura e-Belge olarak gönderilemez.');

    // Idempotency (FAZ 25.3 #5): Zaten işleme alınmış/teslim edilmiş belge var mı?
    // ENGELLENEN durumlar: kuyrukta veya başarılı tüm yaşam-döngüsü adımları
    // (QUEUED/SENDING/SENT/DELIVERED/ACCEPTED). REJECTED/FAILED/ERROR/CANCELLED
    // belgeler YENİDEN gönderilebilir (yeni UUID — kural gereği engellenmez).
    const blockedStatuses = ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'ACCEPTED'];
    const existingDoc = (db.electronicDocuments || []).find(
      d => d.internalDocumentId === invoice.id && d.tenantId === tenantId && blockedStatuses.includes(d.status)
    );
    if (existingDoc) {
      throw new Error(`Bu fatura zaten e-Belge olarak işleme alınmış (Belge Durumu: ${existingDoc.status}, UUID: ${existingDoc.uuid}).`);
    }

    // 2026-09-12 (fail-closed kapısı — EN ERKEN NOKTA):
    // Entegratör yapılandırması yoksa HİÇBİR ŞEY yapılmaz: kontör rezerve
    // edilmez, belge kuyruğa yazılmaz, ERP faturası işaretlenmez. Önceki akışta
    // fabrika sessizce MOCK'a düşüyordu ve belge "gönderildi" sayılıp kontör
    // düşülüyordu. Kullanıcıya açık hata döner.
    const { provider } = ProviderFactory.getProviderForTenant(tenantId);

    // Atomik Kontör Rezervasyonu (Yetersiz ise burada hata fırlatır).
    // Test sağlayıcısında rezerve EDİLMEZ: belge gerçekten gönderilmediği için
    // kontör hiç düşülmeyecek; rezerve etmek düşük bakiyeli test kiracısında
    // gereksiz "yetersiz kontör" hatası üretirdi.
    const testProviderMi = provider.providerId.toUpperCase() === 'MOCK';
    if (!testProviderMi) {
      await CreditWalletService.reserveCredits(tenantId, 1, 'INVOICE', invoice.invoiceNo);
    }

    const customer = (db.customers || []).find(c => c.id === invoice.customerId);
    const receiverTaxNumber = customer?.taxNumber || invoice.customerCode || '11111111111';

    // Otomatik profil belirleme (Mükellef sorgusu)
    // 2026-09-12: Sorgu başarısız olursa (ağ hatası / yapılandırma eksiği)
    // "mükellef değil" SONUCU ÇIKARILMAZ; VKN hane sayısına dayalı dürüst bir
    // tahmin uygulanır (10 hane → kurumlar/e-Fatura, 11 hane → şahıs/e-Arşiv).
    // Önceleri sağlayıcı katmanı hatayı yutup "mükellef değil" döndürüyordu ve
    // bu yanlış cevap 24 saatlik önbelleğe yazılıyordu.
    let finalProfile = profile;
    if (!finalProfile) {
      try {
        const tp = await TaxpayerService.checkTaxpayer(receiverTaxNumber, tenantId);
        finalProfile = tp.isEInvoiceUser ? 'TEMELFATURA' : 'EARSIVFATURA';
      } catch {
        finalProfile = receiverTaxNumber.length === 10 ? 'TEMELFATURA' : 'EARSIVFATURA';
      }
    }

    const uuid = invoice.eInvoiceUUID || crypto.randomUUID();
    const now = new Date().toISOString();

    const newDoc: ElectronicDocument = {
      id: `edoc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      documentType: 'INVOICE',
      documentDirection: 'OUTGOING',
      internalDocumentId: invoice.id,
      documentNumber: invoice.invoiceNo,
      uuid,
      profile: finalProfile,
      invoiceType: invoice.invoiceCategory || 'SATIS',
      senderIdentifier: db.company?.taxNumber || '1111111111',
      senderTitle: db.company?.name || 'İŞBEY',
      receiverIdentifier: receiverTaxNumber,
      receiverTitle: customer?.title || invoice.customerTitle,
      currency: invoice.currency || 'TRY',
      totalAmount: invoice.subTotal,
      payableAmount: invoice.grandTotal,
      status: 'QUEUED',
      providerId: provider.providerId,
      // Kontör kararının kendisi kayda yazılır (türetme değil — bkz. schema.ts)
      creditsReserved: !testProviderMi,
      idempotencyKey: `${tenantId}:${invoice.id}:${uuid}`,
      retryCount: 0,
      maxRetries: 3,
      timeline: [
        {
          status: 'QUEUED',
          description: `Fatura ${finalProfile} profiliyle e-Belge gönderim kuyruğuna alındı.`,
          timestamp: now,
        },
      ],
      createdBy: username,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.electronicDocuments) db.electronicDocuments = [];
    db.electronicDocuments.push(newDoc);

    invoice.eInvoiceStatus = 'QUEUED';
    invoice.eInvoiceUUID = uuid;

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'EINVOICE_QUEUED',
      module: 'E_INVOICE',
      documentNo: invoice.invoiceNo,
      ipAddress: '127.0.0.1',
      details: `${invoice.invoiceNo} faturası kuyruğa eklendi (UUID: ${uuid}).`,
    });

    storage.save();

    // Arka plan worker'ı tetikle (asenkron) — FAZ 25.3 #5: yakalanmayan async
    // hata süreci düşürmesin (fire-and-forget güvenli hata yakalama)
    setImmediate(() => {
      ElectronicDocumentQueue.processSingleDocument(newDoc).catch(err => {
        console.error('[E-DOC] Arka plan gönderim hatası:', err);
      });
    });

    return newDoc;
    } finally {
      // FAZ 25.3 #6: Kilit her durumda serbest bırakılır (hata/başarı fark etmez)
      this.queueingInProgress.delete(raceKey);
    }
  }

  /**
   * 2. İrsaliyeyi e-İrsaliye olarak kuyruğa alır
   */
  public static async queueWaybill(params: SendWaybillParams): Promise<ElectronicDocument> {
    const { waybillId, tenantId, userId, username = 'Sistem' } = params;
    const db = storage.getState(tenantId);

    // FAZ 25.3 #6: Race-condition koruması (irsaliye)
    const raceKey = `DESPATCH:${tenantId}:${waybillId}`;
    if (this.queueingInProgress.has(raceKey)) {
      throw new Error('Bu irsaliye için gönderim işlemi şu anda zaten sürüyor. Lütfen tekrar deneyin.');
    }
    this.queueingInProgress.add(raceKey);

    try {
    const waybill = (db.waybills || []).find(
      w => w.id === waybillId && (w.tenantId === tenantId || (tenantId === 'tnt-isbey' && !w.tenantId))
    );
    if (!waybill) throw new Error('İrsaliye bulunamadı.');

    // Idempotency (FAZ 25.3 #5): fatura ile AYNI engel listesi — ACCEPTED/DELIVERED
    // eksikliği kabul almış irsaliyenin çift gönderimine izin veriyordu (kapatıldı).
    const blockedStatusesWb = ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'ACCEPTED'];
    const existingDoc = (db.electronicDocuments || []).find(
      d => d.internalDocumentId === waybill.id && d.tenantId === tenantId && blockedStatusesWb.includes(d.status)
    );
    if (existingDoc) {
      throw new Error(`Bu irsaliye zaten e-İrsaliye olarak işleme alınmış (UUID: ${existingDoc.uuid}).`);
    }

    // 2026-09-12 (fail-closed kapısı): kontör rezervasyonundan ÖNCE entegratör
    // yapılandırması doğrulanır (bkz. queueInvoice'daki aynı gerekçe).
    const { provider } = ProviderFactory.getProviderForTenant(tenantId);

    // Atomik Kontör Rezervasyonu — test sağlayıcısında atlanır (bkz. queueInvoice)
    const testProviderMi = provider.providerId.toUpperCase() === 'MOCK';
    if (!testProviderMi) {
      await CreditWalletService.reserveCredits(tenantId, 1, 'DESPATCH', waybill.waybillNo);
    }

    const customer = (db.customers || []).find(c => c.id === waybill.customerId);
    const receiverTaxNumber = customer?.taxNumber || waybill.customerCode || '11111111111';
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();

    const newDoc: ElectronicDocument = {
      id: `edoc-wb-${Date.now()}`,
      tenantId,
      documentType: 'DESPATCH',
      documentDirection: 'OUTGOING',
      internalDocumentId: waybill.id,
      documentNumber: waybill.waybillNo,
      uuid,
      profile: 'TEMELIRSALIYE',
      senderIdentifier: db.company?.taxNumber || '1111111111',
      senderTitle: db.company?.name || 'İŞBEY',
      receiverIdentifier: receiverTaxNumber,
      receiverTitle: customer?.title || waybill.customerTitle,
      currency: 'TRY',
      totalAmount: 0,
      payableAmount: 0,
      status: 'QUEUED',
      providerId: provider.providerId,
      // Kontör kararının kendisi kayda yazılır (türetme değil — bkz. schema.ts)
      creditsReserved: !testProviderMi,
      idempotencyKey: `${tenantId}:${waybill.id}:${uuid}`,
      retryCount: 0,
      maxRetries: 3,
      timeline: [
        {
          status: 'QUEUED',
          description: `İrsaliye e-İrsaliye gönderim kuyruğuna alındı.`,
          timestamp: now,
        },
      ],
      createdBy: username,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.electronicDocuments) db.electronicDocuments = [];
    db.electronicDocuments.push(newDoc);

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'EDESPATCH_QUEUED',
      module: 'E_DESPATCH',
      documentNo: waybill.waybillNo,
      ipAddress: '127.0.0.1',
      details: `${waybill.waybillNo} nolu sevk irsaliyesi e-İrsaliye kuyruğuna alındı.`,
    });

    storage.save();

    setImmediate(() => {
      ElectronicDocumentQueue.processSingleDocument(newDoc).catch(err => {
        console.error('[E-DOC] Arka plan irsaliye gönderim hatası:', err);
      });
    });

    return newDoc;
    } finally {
      // FAZ 25.3 #6: Kilit her durumda serbest bırakılır (irsaliye)
      this.queueingInProgress.delete(raceKey);
    }
  }

  /**
   * 3. Belge durumunu entegratör üzerinden günceller
   */
  public static async syncDocumentStatus(documentId: string, tenantId: string): Promise<ElectronicDocument> {
    const db = storage.getState(tenantId);
    const doc = (db.electronicDocuments || []).find(
      d => d.id === documentId && (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
    );
    if (!doc) throw new Error('Elektronik belge bulunamadı.');

    const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);
    const statusResult = await provider.getInvoiceStatus(doc.uuid, settings);

    const now = new Date().toISOString();
    doc.providerStatus = statusResult.providerStatus;
    if (statusResult.gibStatusCode) doc.errorCode = statusResult.gibStatusCode;
    if (statusResult.gibMessage) doc.errorMessage = statusResult.gibMessage;

    if (statusResult.providerStatus.includes('ACCEPTED') || statusResult.gibStatusCode === '1300') {
      doc.status = 'ACCEPTED';
    } else if (statusResult.providerStatus.includes('REJECTED')) {
      doc.status = 'REJECTED';
    }

    doc.timeline.push({
      status: doc.status,
      description: `Durum sorgulandı: ${statusResult.gibMessage || statusResult.providerStatus}`,
      timestamp: now,
    });
    doc.updatedAt = now;

    storage.save();
    return doc;
  }
}
