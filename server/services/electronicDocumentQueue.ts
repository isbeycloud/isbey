import { storage } from '../db/storage';
import {
  ElectronicDocument,
  EDocumentStatus,
  Tenant,
  Invoice,
  Waybill,
  Customer,
} from '../db/schema';
import { ProviderFactory } from './providers/providerFactory';
import { UblInvoiceBuilder } from './ubl/ublInvoiceBuilder';
import { UblDespatchBuilder } from './ubl/ublDespatchBuilder';
import { XmlValidatorService } from './ubl/xmlValidatorService';
import { DocumentStorageService } from './documentStorageService';
import { CreditWalletService } from './creditWalletService';

export class ElectronicDocumentQueue {
  private static isProcessing = false;

  /**
   * 2026-09-12: Aynı belgenin eşzamanlı iki kez işlenmesini engelleyen uçuş seti.
   * Belge durumu (`SENDING`) yeterli DEĞİLDİR: `processQueue()` QUEUED listesini
   * bir kerede alır; `queueInvoice`'ın arka plan çağrısı ise await'ler arasında
   * araya girip aynı belgeyi ikinci kez işleyebilir → entegratöre ÇİFT belge.
   * Bu set, işlem bitene kadar belge kimliğini tutar.
   */
  private static inFlight = new Set<string>();

  /**
   * FAZ 25.3 #4: Exponential backoff penceresi.
   * retryCount=0 → 30s, 1 → 60s, 2 → 120s … tavan 15 dakika.
   * Amaç: entegratör kesintisinde belgeyi saniyeler içinde tekrar tekrar
   * yormak yerine artan aralıkla denemek (hata kuyruğu disiplini).
   */
  private static backoffMs(retryCount: number): number {
    const base = 30 * 1000;
    return Math.min(base * Math.pow(2, Math.max(0, retryCount - 1)), 15 * 60 * 1000);
  }

  /**
   * Backoff penceresi içinde mi? (lastRetryAt + backoff > now → hâlâ beklemeli)
   * QUEUED + retryCount>0 (yani bir hatadan dönmüş) veya FAILED belgeler için uygulanır.
   */
  private static isBackoffPending(doc: { retryCount: number; lastRetryAt?: string }): boolean {
    if (!doc.lastRetryAt || doc.retryCount === 0) return false;
    const elapsed = Date.now() - new Date(doc.lastRetryAt).getTime();
    return elapsed < this.backoffMs(doc.retryCount);
  }

  /**
   * Kuyruktaki bekleyen (QUEUED) ve yeniden denenecek (RETRY) belgeleri işler
   */
  public static async processQueue(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;

    try {
      const db = storage.getState();
      const documentsToProcess = (db.electronicDocuments || []).filter(
        d =>
          (d.status === 'QUEUED' && !this.isBackoffPending(d)) ||
          (d.status === 'FAILED' && d.retryCount < d.maxRetries && !this.isBackoffPending(d))
      );

      for (const doc of documentsToProcess) {
        await this.processSingleDocument(doc);
        processedCount++;
      }
    } catch (err) {
      console.error('[E-DOC QUEUE ERROR]', err);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Tek bir elektronik belgeyi işler.
   *
   * 2026-09-12 (çift gönderim koruması): Bu metot İKİ yerden çağrılabilir —
   * (a) `queueInvoice`/`queueWaybill` sonrası doğrudan arka plan çağrısı,
   * (b) periyodik `processQueue()` turu (index.ts). `processQueue` QUEUED
   * listesini ÖNCE alıp sonra sırayla işlediği için, (a) ile aynı belgeyi
   * hedefleyebilir; iki eşzamanlı gönderim belgeyi entegratöre İKİ KEZ yollar.
   * `inFlight` seti işlem boyunca belge kimliğini tutar ve ikinci girişi reddeder.
   */
  public static async processSingleDocument(doc: ElectronicDocument): Promise<boolean> {
    if (this.inFlight.has(doc.id)) {
      return false;
    }
    this.inFlight.add(doc.id);

    try {
      return await this.processSingleDocumentInternal(doc);
    } finally {
      this.inFlight.delete(doc.id);
    }
  }

  private static async processSingleDocumentInternal(doc: ElectronicDocument): Promise<boolean> {
    const db = storage.getState();
    const now = new Date().toISOString();
    const startTime = Date.now();

    doc.status = 'SENDING';
    doc.timeline.push({
      status: 'SENDING',
      description: `Belge gönderim kuyruğundan alındı, işleniyor (Deneme: ${doc.retryCount + 1}/${doc.maxRetries}).`,
      timestamp: now,
    });
    storage.save();

    // ────────────────────────────────────────────────────────────────────
    // 2026-09-12 (fail-closed): Sağlayıcı çözümlemesi ARTIK try DIŞINDA ve
    // hata fırlatabilir. Önceki akışta fabrika, yapılandırması olmayan kiracıya
    // sessizce MOCK veriyordu; MOCK da `SENT_TO_GIB` döndürüyordu. Sonuç:
    // belge hiçbir yere gitmeden `SENT` + `ACCEPTED` işaretleniyor, kontör
    // düşülüyor ve ERP faturası "GİB onaylı" görünüyordu.
    //
    // Yeni davranış: yapılandırma yoksa/geçersizse belge gönderilmez. Belge
    // olağan hata yoluna alınır (retry/backoff); deneme hakkı bittiğinde
    // FAILED işaretlenir ve rezerve kontör iade edilir — sessiz başarı
    // ÜRETİLMEZ, kuyruk kilitlenmez.
    // ────────────────────────────────────────────────────────────────────
    let provider;
    let settings;
    try {
      ({ provider, settings } = ProviderFactory.getProviderForTenant(doc.tenantId));
    } catch (cfgErr: any) {
      // Gönderim DENENMEDİ. Deneme sayacı ve backoff, olağan hata yoluyla
      // birebir aynı işler (yönetici yapılandırmayı düzeltirse sonraki turda
      // gönderim gerçekleşir).
      //
      // Kontör: rezervasyonun yapılıp yapılmadığı `doc.creditsReserved`'dan
      // okunur — bu alan KUYRUKLAMA ANINDA, kararın verildiği yerde yazılır.
      // Eskiden `doc.providerId !== 'MOCK'` diye TÜRETİLİYORDU; bu fail-open'dı
      // (boş/legacy/tanınmayan providerId "rezervasyon var" sayılır, karşılıksız
      // düşüm veya başkasının rezervasyonunun iadesine yol açardı). Eski
      // kayıtlarda alan `undefined` → hiçbir kontör işlemi YAPILMAZ (fail-safe).
      const rezervasyonVar = doc.creditsReserved === true;

      doc.retryCount += 1;
      doc.lastRetryAt = now;
      doc.providerStatus = 'CONFIGURATION_MISSING';
      doc.errorCode = cfgErr?.code || 'PROVIDER_NOT_CONFIGURED';
      doc.errorMessage = cfgErr?.message || 'e-Dönüşüm entegratörü yapılandırılmamış.';
      doc.updatedAt = now;

      if (doc.retryCount < doc.maxRetries) {
        doc.status = 'QUEUED';
        doc.timeline.push({
          status: 'RETRY_PENDING',
          description: `Gönderim YAPILMADI — entegratör yapılandırılmamış (${doc.retryCount}/${doc.maxRetries}): ${doc.errorMessage}`,
          timestamp: now,
        });
      } else {
        doc.status = 'FAILED';
        doc.timeline.push({
          status: 'FAILED',
          description: `Gönderim YAPILMADI — entegratör yapılandırması ${doc.maxRetries} denemede de eksik: ${doc.errorMessage}`,
          timestamp: now,
        });
        this.syncErpDocumentStatus(doc, 'ERROR');
        if (rezervasyonVar) {
          try {
            await CreditWalletService.rollbackCredits(
              doc.tenantId,
              1,
              doc.documentType as any,
              doc.documentNumber,
              doc.errorMessage
            );
          } catch (rErr) {
            console.error('[CREDIT ROLLBACK ERROR]', rErr);
          }
        }
      }

      this.addIntegrationLog(doc.tenantId, 'NONE', doc.id, 'SEND_DOCUMENT', 'ERROR', 0, 0, doc.errorMessage);
      storage.save();
      return false;
    }

    try {
      // 1. XML Dosyası Varlığını ve Geçerliliğini Doğrula
      let xmlContent = '';
      if (doc.xmlStoragePath) {
        xmlContent = DocumentStorageService.readXml(doc.tenantId, doc.xmlStoragePath) || '';
      }

      if (!xmlContent) {
        // XML henüz oluşturulmadıysa oluştur
        xmlContent = await this.generateXmlForDocument(doc);
        const savedPath = DocumentStorageService.saveXml(doc.tenantId, doc.documentType, doc.uuid, xmlContent);
        doc.xmlStoragePath = savedPath;
      }

      // 2. XML Validasyon Kontrolü
      const validation = XmlValidatorService.validateUblXml(xmlContent);
      if (!validation.valid) {
        throw new Error(`XML Doğrulama Hatası: ${validation.errors.join('; ')}`);
      }

      // 3. Provider Üzerinden Gönder
      let sendResult;
      if (doc.documentType === 'INVOICE') {
        if (doc.profile === 'EARSIVFATURA') {
          sendResult = await provider.sendEArchive(xmlContent, settings, {
            uuid: doc.uuid,
            invoiceNo: doc.documentNumber,
          });
        } else {
          sendResult = await provider.sendInvoice(xmlContent, settings, {
            uuid: doc.uuid,
            invoiceNo: doc.documentNumber,
          });
        }
      } else {
        sendResult = await provider.sendDespatch(xmlContent, settings, {
          uuid: doc.uuid,
          waybillNo: doc.documentNumber,
        });
      }

      const durationMs = Date.now() - startTime;

      if (sendResult.success) {
        // 2026-09-12 (kritik): Test sağlayıcısı belgeyi HİÇBİR YERE göndermez.
        // Onu "başarılı gönderim" sayıp kontör düşmek, karşılığı olmayan bir
        // tahsilat üretir; ERP faturası da "GİB'e gönderildi" görünür. Test
        // sağlayıcısı yalnızca kuyruk/şema akışını sınamak içindir: belge
        // SENT işaretlenir (akış devam etsin) ama kontör DÜŞÜLMEZ ve durum
        // açıkça TEST olarak etiketlenir.
        const isTestProvider = provider.providerId.toUpperCase() === 'MOCK';
        // Kontör muhasebesi iki AYRI soruya bakar (karıştırılmamalı):
        //   (1) Gönderim gerçekten yapıldı mı?  → çözülen sağlayıcı (isTestProvider)
        //   (2) Rezervasyon alınmış mıydı?      → doc.creditsReserved (kuyruklama anı)
        // Ayar belge kuyruktayken değişmişse bu ikisi ayrışır; ikisini tek
        // bayrakla birleştirmek ya karşılıksız düşüme ya da asılı rezervasyona
        // yol açar.
        const rezervasyonVar = doc.creditsReserved === true;

        doc.status = 'SENT';
        doc.providerStatus = sendResult.providerStatus || 'SENT';
        // 2026-09-12: Entegratör belge numarası dönmediyse İŞBEY UUID'si
        // UYDURULMAZ. Bu alan iptal/durum sorgusunda entegratöre gönderilir;
        // sahte kimlikle sorgulamak yanlış belgeyi hedefler. Boş kalırsa
        // arayüz "entegratör numarası yok" durumunu dürüstçe gösterir.
        doc.providerDocumentId = sendResult.providerDocumentId || undefined;
        doc.sentAt = now;
        doc.errorCode = undefined;
        // Not burada DEĞİL, timeline'da tutulur: `errorMessage` arayüzde hata
        // olarak görüntülenir; test sağlayıcısı kaydı bir hata değildir.
        doc.errorMessage = undefined;
        doc.timeline.push({
          status: 'SENT',
          description: isTestProvider
            ? `Belge TEST sağlayıcısına (${provider.name}) işlendi — GERÇEK gönderim yapılmadı, kontör düşülmedi.`
            : doc.providerDocumentId
              ? `Belge başarıyla ${provider.name} entegratörüne iletildi. Entegratör belge no: ${doc.providerDocumentId}`
              : `Belge ${provider.name} entegratörüne iletildi; entegratör belge numarası dönmedi (durum sorgusu İŞBEY UUID'si ile yapılır).`,
          timestamp: now,
        });

        // ERP Faturasının veya İrsaliyesinin e-Belge Durumunu Güncelle
        // 2026-09-16 (`docs/46` §3): MOCK sağlayıcısında ERP faturası 'SENT'
        // İŞARETLENMEZ. MOCK hiçbir entegratöre bağlı değildir; hiçbir yere
        // gönderilmemiş bir belgeyi "GİB'e iletildi" göstermek muhasebede yanlış
        // beyana yol açar (CLAUDE.md md.1). Önceden bu ayrım yoktu ve timeline
        // "GERÇEK gönderim yapılmadı" derken faturanın kendi alanı "gönderildi"
        // diyordu — iki kayıt çelişiyordu. 'MOCK_SENT' bilerek `isSent`
        // eşlemelerinin DIŞINDA bir değerdir; arayüz onu "Taslak" gösterir.
        this.syncErpDocumentStatus(doc, isTestProvider ? 'MOCK_SENT' : 'SENT');

        if (isTestProvider) {
          // Gerçek gönderim yok → düşüm yok. Rezervasyon alınmışsa (ayar
          // sonradan test sağlayıcısına çevrilmişse) serbest bırakılır.
          if (rezervasyonVar) {
            try {
              await CreditWalletService.rollbackCredits(
                doc.tenantId,
                1,
                doc.documentType as any,
                doc.documentNumber,
                'TEST sağlayıcısı — gerçek gönderim yapılmadı, kontör düşülmedi.'
              );
            } catch (rErr) {
              console.error('[CREDIT ROLLBACK ERROR]', rErr);
            }
          }
        } else if (rezervasyonVar) {
          try {
            await CreditWalletService.commitCredits(
              doc.tenantId,
              1,
              doc.documentType as any,
              doc.documentNumber,
              `${doc.documentType} gönderim bedeli`,
              doc.createdBy || 'System'
            );
          } catch (cErr) {
            console.error('[CREDIT COMMIT ERROR]', cErr);
          }
        }

        // Entegrasyon Denetim Logu
        this.addIntegrationLog(doc.tenantId, provider.providerId, doc.id, 'SEND_DOCUMENT', 'SUCCESS', 200, durationMs,
          isTestProvider ? 'TEST sağlayıcısı — gerçek gönderim yok, kontör düşülmedi.' : undefined);

        // Kullanım Ölçümü (Usage Meter) — test sağlayıcısında ölçüm YAZILMAZ:
        // bu tablo fatura kesim/kontör mutabakatında kullanılır; gerçek
        // gönderim olmayan bir belgeyi "kullanım" saymak muhasebeyi şişirir.
        if (!isTestProvider) {
          if (!db.electronicDocumentUsage) db.electronicDocumentUsage = [];
          db.electronicDocumentUsage.push({
            id: `usage-${Date.now()}-${doc.id}`,
            tenantId: doc.tenantId,
            documentId: doc.id,
            documentType: doc.documentType === 'DESPATCH' ? 'EIRSALIYE' : doc.profile === 'EARSIVFATURA' ? 'EARSIV' : 'EINVOICE',
            providerId: provider.providerId,
            quantity: 1,
            createdAt: now,
          });
        }

        storage.save();
        return true;
      } else {
        throw new Error(sendResult.errorMessage || 'Entegratör gönderim işlemini reddetti.');
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      // İade kararı `doc.creditsReserved`'a (kuyruklama anı) bakar; rezervasyon
      // alınmadıysa iade de yapılmaz — aksi hâlde başka bir belgenin
      // rezervasyonu serbest bırakılırdı.
      const rezervasyonVar = doc.creditsReserved === true;
      doc.retryCount += 1;
      doc.lastRetryAt = now;
      doc.errorCode = error.code || 'SEND_ERROR';
      doc.errorMessage = error.message;

      if (doc.retryCount < doc.maxRetries) {
        doc.status = 'QUEUED'; // Tekrar denenecek
        doc.timeline.push({
          status: 'RETRY_PENDING',
          description: `Gönderim başarısız oldu (${error.message}). Sistem ${doc.retryCount}/${doc.maxRetries} deneme olarak tekrar kuyruğa aldı.`,
          timestamp: now,
        });
      } else {
        doc.status = 'FAILED';
        doc.timeline.push({
          status: 'FAILED',
          description: `Maksimum deneme sayısına (${doc.maxRetries}) ulaşıldı. Gönderim başarısız: ${error.message}`,
          timestamp: now,
        });
        this.syncErpDocumentStatus(doc, 'ERROR');

        // Kalıcı Hata: Rezerve Edilen Kontörü İade Et (ROLLBACK) — yalnızca
        // kuyruklama anında rezervasyon ALINMIŞSA (deneme sayacı bitince).
        if (rezervasyonVar) {
          try {
            await CreditWalletService.rollbackCredits(
              doc.tenantId,
              1,
              doc.documentType as any,
              doc.documentNumber,
              error.message
            );
          } catch (rErr) {
            console.error('[CREDIT ROLLBACK ERROR]', rErr);
          }
        }
      }

      this.addIntegrationLog(doc.tenantId, provider.providerId, doc.id, 'SEND_DOCUMENT', 'ERROR', 500, durationMs, error.message);
      storage.save();
      return false;
    }
  }

  /**
   * Belge için dinamik UBL-TR XML üretir
   */
  private static async generateXmlForDocument(doc: ElectronicDocument): Promise<string> {
    const db = storage.getState();
    const tenant = (db.tenants || []).find(t => t.id === doc.tenantId);
    if (!tenant) throw new Error('Belgenin firması bulunamadı.');

    if (doc.documentType === 'INVOICE') {
      const invoice = (db.invoices || []).find(i => i.id === doc.internalDocumentId);
      if (!invoice) throw new Error(`ERP Faturası bulunamadı (ID: ${doc.internalDocumentId})`);
      const customer = (db.customers || []).find(c => c.id === invoice.customerId) || {
        id: invoice.customerId,
        title: invoice.customerTitle,
        taxNumber: doc.receiverIdentifier,
      } as Customer;

      return UblInvoiceBuilder.buildXml({
        invoice,
        tenant,
        customer,
        uuid: doc.uuid,
        profile: doc.profile,
      });
    } else {
      const waybill = (db.waybills || []).find(w => w.id === doc.internalDocumentId);
      if (!waybill) throw new Error(`ERP İrsaliyesi bulunamadı (ID: ${doc.internalDocumentId})`);
      const customer = (db.customers || []).find(c => c.id === waybill.customerId) || {
        id: waybill.customerId,
        title: waybill.customerTitle,
        taxNumber: doc.receiverIdentifier,
      } as Customer;

      return UblDespatchBuilder.buildXml({
        waybill,
        tenant,
        customer,
        uuid: doc.uuid,
      });
    }
  }

  private static syncErpDocumentStatus(doc: ElectronicDocument, status: string) {
    const db = storage.getState();
    if (doc.documentType === 'INVOICE' && doc.internalDocumentId) {
      const inv = (db.invoices || []).find(i => i.id === doc.internalDocumentId);
      if (inv) {
        inv.eInvoiceStatus = status;
        inv.eInvoiceUUID = doc.uuid;
      }
    }
  }

  private static addIntegrationLog(
    tenantId: string,
    providerId: string,
    documentId: string,
    operation: string,
    status: 'SUCCESS' | 'ERROR' | 'RETRY',
    httpStatus: number,
    durationMs: number,
    errorMessage?: string
  ) {
    const db = storage.getState();
    if (!db.integrationLogs) db.integrationLogs = [];
    db.integrationLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      providerId,
      documentId,
      operation,
      status,
      httpStatus,
      errorMessage,
      durationMs,
      createdAt: new Date().toISOString(),
    });
    if (db.integrationLogs.length > 5000) db.integrationLogs = db.integrationLogs.slice(0, 5000);
  }
}
