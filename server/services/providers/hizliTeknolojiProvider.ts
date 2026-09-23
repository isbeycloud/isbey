import {
  ElectronicDocumentProvider,
  ProviderCapabilities,
  ProviderSendResult,
  ProviderStatusResult,
  ProviderIncomingInvoice,
  ProviderTransportError,
} from './electronicDocumentProvider';
import { TenantEinvoiceSettings } from '../../db/schema';
import { HizliConnectService } from '../hizliConnectService';
import { ensureTenantToken, invalidateTenantToken } from '../hizliTenantCredentialRegistry';

/**
 * HIZLI TEKNOLOJİ PROVIDER — FİRMA BAZLI TOKEN SÜRÜMÜ (Bey360 / docs/21)
 * =======================================================================
 * Satıcı onaylı model: token firma bazlıdır. Her işlem için
 * `ensureTenantToken(settings, isTest)` ile KENDİ firmasının token'ı
 * alınır; global tokenStore bağımlılığı kaldırıldı (multi-tenant izolasyonu).
 *
 * Kimlik çözümleme (fail-closed): firma e-Fatura ayarları (username +
 * encryptedPassword) → yoksa env (yalnızca kendi firmamız) → yoksa HATA.
 * UtilEncrypt yalnızca WS kimliği değiştiğinde tekrar çağrılır (satıcı
 * kuralı: 1 kez yeterli); token 24h TTL, 20h'de proaktif yenileme.
 */

/**
 * 2026-09-12: Hızlı Bilişim REST yanıtlarında 401 (token süresi dolmuş/iptal)
 * alındığında bayat token cache'te kalırsa, 4 saatlik yenileme tamponu nedeniyle
 * çağrılar 20 saate kadar 401 dönmeye devam ederdi. Bu yardımcı, 401 görülen
 * firmanın YALNIZ token'ını geçersizleştirir; bir sonraki çağrı UtilEncrypt'e
 * girmeden taze Login yapar (WS kimliği 1 kez şifrelenir kuralı korunur).
 *
 * NOT: İstek burada OTOMATİK YENİDEN DENENMEZ — belge gönderimi gibi yan etkili
 * işlemlerde sessiz retry mükerrer belge üretebilir. Yalnızca "bir sonraki
 * çağrı temiz başlasın" garantisi verilir.
 */
function invalidateStaleTokenIfUnauthorized(
  res: { success?: boolean; error?: any } | undefined,
  settings: TenantEinvoiceSettings,
  isTest: boolean
): void {
  if (res && res.success === false && Number(res.error) === 401) {
    invalidateTenantToken(settings.tenantId, isTest);
  }
}

export class HizliTeknolojiProvider implements ElectronicDocumentProvider {
  public readonly providerId = 'HIZLI_TEKNOLOJI';
  public readonly name = 'Hızlı Teknoloji e-Connect';
  public readonly capabilities: ProviderCapabilities = {
    supportsEInvoice: true,
    supportsEArchive: true,
    supportsEDespatch: true,
    supportsIncoming: true,
    supportsCancel: true,
    supportsWebhook: true,
    supportsPdfDownload: false,
    supportsStatusQuery: true,
  };

  public async testConnection(settings: TenantEinvoiceSettings): Promise<{ success: boolean; message: string; durationMs: number }> {
    const start = Date.now();
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token, source } = await ensureTenantToken(settings, isTest);
      // Login token'ı alındı → Test endpoint ile doğrula (gerçek erişim kanıtı)
      const probe = await HizliConnectService.test(token, isTest);
      invalidateStaleTokenIfUnauthorized(probe, settings, isTest);
      if (probe.success) {
        const kaynak = source === 'tenant-settings' ? 'firma ayarları' : 'varsayılan firma (env)';
        return {
          success: true,
          message: `Hızlı Teknoloji bağlantısı başarılı (${kaynak} kimliğiyle). Test endpoint doğrulandı.`,
          durationMs: Date.now() - start,
        };
      }
      return {
        success: false,
        message: probe.message || 'Kimlik doğrulandı ancak Test endpoint erişimi başarısız.',
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Bağlantı hatası: ${err.message}`,
        durationMs: Date.now() - start,
      };
    }
  }

  public async checkTaxpayer(identifier: string, settings: TenantEinvoiceSettings): Promise<{
    isEInvoiceUser: boolean;
    isEDespatchUser?: boolean;
    title?: string;
    aliasGB?: string;
    aliasPK?: string;
  }> {
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token } = await ensureTenantToken(settings, isTest);
      const res = await HizliConnectService.checkGibUser(identifier, token, isTest);
      // checkGibUser gerçek dönüş alanları: isEInvoiceUser, aliasPk, aliasGb (FAZ 13: alias uydurulmaz)
      invalidateStaleTokenIfUnauthorized(res, settings, isTest);
      if (res.success && res.isEInvoiceUser) {
        return {
          isEInvoiceUser: true,
          title: res.title,
          aliasGB: res.aliasGb || '',
          aliasPK: res.aliasPk || '',
        };
      }
      return { isEInvoiceUser: false };
    } catch (err: any) {
      // 2026-09-12 (sessiz yanlış cevap kapatıldı): Önceden sorgu hatası
      // yutulup "mükellef değil" dönüyordu. Bu bir İDDİADIR ve çağıran
      // (`TaxpayerService`) onu 24 SAATLİK ÖNBELLEĞE yazıyordu — yani geçici bir
      // ağ hatası, gün boyu "bu VKN e-Fatura mükellefi değil" olarak hizmet
      // veriyordu (fatura yanlış profille kesilir). Artık hata yukarı taşınır;
      // önbelleğe YALNIZ gerçek yanıt yazılır.
      throw err;
    }
  }

  public async sendInvoice(
    xmlContent: string,
    settings: TenantEinvoiceSettings,
    meta: { uuid: string; invoiceNo: string; isDraft?: boolean }
  ): Promise<ProviderSendResult> {
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token } = await ensureTenantToken(settings, isTest);
      // Girdi UBL-TR XML'dir → SendDocument endpoint (sendInvoiceModel JSON payload bekler)
      const res = await HizliConnectService.sendDocument([{ xmlContent }], token, isTest);
      invalidateStaleTokenIfUnauthorized(res, settings, isTest);
      if (res.success) {
        return {
          success: true,
          // 2026-09-12 (uydurma temizliği): Burada `|| meta.uuid` vardı — yani
          // entegratör bir belge numarası DÖNMEDİĞİNDE İŞBEY'in kendi ürettiği
          // UUID, "entegratörün belge kimliği" gibi kaydediliyordu. Bu alan
          // ileride iptal/durum sorgusunda entegratöre GÖNDERİLİR; sahte bir
          // kimlikle sorgulamak yanlış belgeyi hedefler. Entegratör numara
          // vermediyse alan boş kalır ve bu, çağıran tarafta açıkça görünür.
          providerDocumentId: res.data?.uuid || undefined,
          providerStatus: 'SENT_TO_INTEGRATOR',
          statusCode: 200,
        };
      }
      return {
        success: false,
        providerStatus: 'FAILED',
        errorMessage: res.message || 'Fatura entegratöre iletilemedi.',
      };
    } catch (err: any) {
      return {
        success: false,
        providerStatus: 'ERROR',
        errorMessage: err.message,
      };
    }
  }

  public async sendEArchive(
    xmlContent: string,
    settings: TenantEinvoiceSettings,
    meta: { uuid: string; invoiceNo: string; isDraft?: boolean }
  ): Promise<ProviderSendResult> {
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token } = await ensureTenantToken(settings, isTest);
      // Not: sendEArsiv wrapper'ı global ensureToken kullanır — firma bazlı token ile
      // sendDocument çağrılır (wrapper'ın UBL-TR XML gönderim yolu ile aynı endpoint).
      const res = await HizliConnectService.sendDocument([{ xmlContent }], token, isTest);
      invalidateStaleTokenIfUnauthorized(res, settings, isTest);
      if (res.success) {
        return {
          success: true,
          // Entegratör numarası yoksa İŞBEY UUID'si uydurulmaz (bkz. sendInvoice).
          providerDocumentId: res.data?.uuid || undefined,
          providerStatus: 'SENT_TO_INTEGRATOR',
          statusCode: 200,
        };
      }
      return {
        success: false,
        providerStatus: 'FAILED',
        errorMessage: res.message || 'e-Arşiv entegratöre iletilemedi.',
      };
    } catch (err: any) {
      return {
        success: false,
        providerStatus: 'ERROR',
        errorMessage: err.message,
      };
    }
  }

  public async sendDespatch(
    xmlContent: string,
    settings: TenantEinvoiceSettings,
    meta: { uuid: string; waybillNo: string }
  ): Promise<ProviderSendResult> {
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token } = await ensureTenantToken(settings, isTest);
      // Not: sendEIrsaliye wrapper'ı global ensureToken kullanır — firma bazlı token ile sendDocument.
      const res = await HizliConnectService.sendDocument([{ xmlContent }], token, isTest);
      invalidateStaleTokenIfUnauthorized(res, settings, isTest);
      if (res.success) {
        return {
          success: true,
          // Entegratör numarası yoksa İŞBEY UUID'si uydurulmaz (bkz. sendInvoice).
          providerDocumentId: res.data?.uuid || undefined,
          providerStatus: 'SENT_TO_INTEGRATOR',
          statusCode: 200,
        };
      }
      return {
        success: false,
        providerStatus: 'FAILED',
        errorMessage: res.message || 'e-İrsaliye entegratöre iletilemedi.',
      };
    } catch (err: any) {
      return {
        success: false,
        providerStatus: 'ERROR',
        errorMessage: err.message,
      };
    }
  }

  public async getInvoiceStatus(uuid: string, settings: TenantEinvoiceSettings): Promise<ProviderStatusResult> {
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token } = await ensureTenantToken(settings, isTest);
      const res = await HizliConnectService.getDocumentListByGUID([uuid], 1, token, isTest);
      invalidateStaleTokenIfUnauthorized(res, settings, isTest);
      // 2026-09-13 (sessiz yanlış cevap kapatıldı):
      // Önceden `!res.success` durumu da `{ providerStatus: 'WAITING' }` olarak
      // dönüyordu. `HizliConnectService` ağ/HTTP hatasında HATA FIRLATMAZ,
      // `{ success: false, message }` döner. Yani entegratöre ULAŞILAMADIĞINDA
      // çağıran (`ElectronicDocumentService.syncDocumentStatus`) bunu geçerli
      // bir "belge henüz işlenmedi" durumu sanıp `providerStatus = 'WAITING'`
      // yazıyor, HTTP 200 dönüyordu. Ağ arızası ile gerçekten bekleyen belge
      // AYNI görünemez. Hata yukarı taşınır; uçtaki `entegratorHatasi` 502 üretir.
      if (!res.success) {
        throw new ProviderTransportError(res.message || 'Belge durumu entegratörden alınamadı.');
      }
      if (!res.data) {
        // Sorgu başarılı ama gövde boş — bu GERÇEK bir "durum yok" cevabıdır
        // (hata değil). Dürüstçe boş döndürülür; uydurma durum yazılmaz.
        return {
          providerStatus: 'UNKNOWN',
          gibStatusCode: '',
          gibMessage: 'Entegratör bu UUID için durum kaydı döndürmedi.',
          isCompleted: false,
        };
      }
      const docs = res.data.documents || res.data || [];
      // 2026-09-17 (`docs/50` S-G4): `docs[0]` yerine istenen UUID aranır —
      // uç `guids` filtresini uygulamayabiliyor. Bulunamazsa mevcut UNKNOWN
      // dalına düşer (yeni dal gerekmez).
      const liste = Array.isArray(docs) ? docs : [docs];
      const doc = liste.find(
        (d: any) => d && (d.UUID === uuid || d.uuid === uuid || d.Id === uuid || d.id === uuid)
      );
      if (!doc) {
        return {
          providerStatus: 'UNKNOWN',
          gibStatusCode: '',
          gibMessage: 'Entegratör bu UUID için durum kaydı döndürmedi.',
          isCompleted: false,
        };
      }
      // 2026-09-12 (uydurma temizliği): `gibStatusCode` ve `providerStatus`
      // alanları, API değer döndürmediğinde SABİT '1300' / 'PROCESSED' yazıyordu.
      // 1300 = "GİB'e iletildi" anlamına gelen gerçek bir kod; onu uydurmak
      // belgenin GİB'e ulaştığı izlenimi veriyordu. Alanlar artık API'de yoksa
      // boş/'UNKNOWN' döner — gerçek durum bilinmiyorsa bilinmiyor denir.
      return {
        providerStatus: doc?.statusDescription || doc?.status || 'UNKNOWN',
        gibStatusCode: doc?.statusCode !== undefined ? String(doc.statusCode) : '',
        gibMessage: doc?.statusDescription || doc?.description || 'Belge durumu alındı.',
        isCompleted: true,
      };
    } catch (err: any) {
      // Taşıma hataları AYNEN yukarı taşınır (502 sınıflaması uçtaki
      // `entegratorHatasi` tarafından yapılır). Kalan beklenmeyen hatalar da
      // taşıma hatası sayılır: "durum bilinmiyor" demek yerine "sorgulanamadı"
      // denir — ikisi karıştırılırsa izleme ve retry yanıltılır.
      //
      // NOT: `ProviderConfigurationError`e burada BAKILMAZ. O sınıf
      // `providerFactory.ts`'te tanımlıdır ve fabrika bu dosyayı import eder;
      // buradan import etmek DÖNGÜSEL bağımlılık yaratırdı. Zaten bu sağlayıcı
      // yapılandırma hatası FIRLATMAZ (fabrika, sağlayıcı çözülmeden önce
      // fırlatır) — yalnızca `ensureTenantToken` kaynaklı düz hatalar gelir.
      if (ProviderTransportError.is(err)) throw err;
      throw new ProviderTransportError(err?.message || 'Belge durumu entegratörden alınamadı.');
    }
  }

  public async getIncomingInvoices(startDate: string, settings: TenantEinvoiceSettings): Promise<ProviderIncomingInvoice[]> {
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token } = await ensureTenantToken(settings, isTest);
      const endDate = new Date().toISOString();
      const res = await HizliConnectService.getDocumentReceiverAllList(
        { dateType: 'CreateDate', startDate, endDate },
        token,
        isTest
      );
      invalidateStaleTokenIfUnauthorized(res, settings, isTest);
      // 2026-09-12: `HizliConnectService` ağ/HTTP hatasında HATA FIRLATMAZ,
      // `{ success: false, message }` döner ve `data` alanı HİÇ BULUNMAZ. Bu
      // yüzden aşağıdaki `res.data?.documents || res.data || []` ifadesi hatayı
      // sessizce BOŞ LİSTEYE çeviriyordu — yani catch'i düzeltmek tek başına
      // yetmez. Başarı bayrağı açıkça kontrol edilir.
      if (!res.success) {
        throw new ProviderTransportError(res.message || 'Gelen belge listesi entegratörden alınamadı.');
      }
      const documents = res.data?.documents || res.data || [];
      // 2026-09-12 (uydurma temizliği): `xmlContent` yoksa `'<Invoice/>'` gibi
      // boş bir XML yazılıyordu; bu, olmayan bir belgeyi varmış gibi işleme sokar.
      // XML yoksa boş string bırakılır; çağıran taraf "belge içeriği yok" görür.
      return (Array.isArray(documents) ? documents : []).map((inv: any) => ({
        uuid: inv.uuid || inv.ettn,
        invoiceNo: inv.invoiceNo || inv.faturaNo,
        supplierVkn: inv.supplierVkn || inv.senderVkn,
        supplierTitle: inv.supplierTitle || inv.senderTitle,
        issueDate: inv.issueDate || inv.tarih,
        subTotal: inv.subTotal || 0,
        vatAmount: inv.vatAmount || 0,
        grandTotal: inv.grandTotal || inv.odenecekTutar || 0,
        currency: inv.currency || 'TRY',
        xmlContent: inv.xmlContent || '',
      }));
    } catch (err: any) {
      // 2026-09-12 (sessiz yanlış cevap kapatıldı): Önceden bu catch boş liste
      // döndürüyordu. Çağıran (`IncomingInvoiceService.syncIncomingInvoices`) bu
      // sonucu "senkronize edilecek yeni fatura yok" diye raporluyordu — yani
      // entegratöre ulaşılamadığında panel "0 yeni fatura" gösteriyordu. Bir ağ
      // hatası ile gerçekten boş bir gelen kutusu AYNI görünemez; hata yukarı
      // taşınır. Uçtaki `entegratorHatasi` bunu 502/503 olarak raporlar
      // (yapılandırma eksiği 503; entegratöre ulaşılamama 502). Düz `Error`
      // fırlatmak burada 400 üretirdi — istemci kusuru gibi görünürdü.
      if (ProviderTransportError.is(err)) throw err;
      throw new ProviderTransportError(err?.message || 'Gelen belgeler entegratörden alınamadı.');
    }
  }

  public async cancelInvoice(uuid: string, reason: string, settings: TenantEinvoiceSettings): Promise<{ success: boolean; message?: string; dogrulandi?: boolean }> {
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token } = await ensureTenantToken(settings, isTest);
      // CancelDocument doğrulanmış Swagger sözleşmesi (HizliWebApp.Models.EArsiv.CancelDocumentInput):
      // POST /HizliApi/RestApi/CancelDocument
      const res = await HizliConnectService.cancelDocument({
        uuid,
        DocumentUuid: uuid,
        cancelReason: reason,
        CancelReason: reason,
        AppType: 3,
        CancelDate: new Date().toISOString().slice(0, 10),
      }, token, isTest);
      invalidateStaleTokenIfUnauthorized(res, settings, isTest);

      if (!res.success) {
        return { success: false, dogrulandi: false, message: res.message || 'İptal talebi entegratöre iletilemedi.' };
      }

      // HTTP 2xx + iş-seviyesi bayrak (IsSucceeded: true) kontrolü
      const dogrulandi = (res as any).isSeviyesi === 'basarili';
      return {
        success: dogrulandi,
        dogrulandi,
        message: dogrulandi
          ? 'İptal talebi entegratöre iletildi ve iş seviyesinde doğrulandı.'
          : 'İptal talebi entegratöre iletildi ancak entegratör yanıtında iş-seviyesi ' +
            'başarı bayrağı bulunmadı — iptal DOĞRULANMADI.',
      };
    } catch (err: any) {
      return { success: false, dogrulandi: false, message: err.message };
    }
  }

  /**
   * Gelen e-Faturaya uygulama yanıtı (KABUL / RED) — `SendApplicationResponse`.
   *
   * Sözleşme (`docs/41` §2.1): `AppType` bu uçta `1 = e-Fatura`.
   * Gövde şekli ve iş-seviyesi kapısı `hizliConnectService.sendApplicationResponse`
   * içinde uygulanır (bkz. `docs/42`, `docs/43`).
   *
   * ⚠️ `bildirim.uuid` ETTN olmalıdır; `documentId`/`documentDate` sözleşmenin
   *    `Documents[]` alanını doldurur. Çağıran bunları KANITLANMIŞ kaynaklardan
   *    geçirmelidir (bkz. `docs/43` §3).
   */
  public async respondToInvoice(
    bildirim: { uuid: string; responseCode: 'KABUL' | 'RED'; description?: string; documentId: string; documentDate: string },
    settings: TenantEinvoiceSettings
  ): Promise<{ success: boolean; message?: string; dogrulandi?: boolean }> {
    const isTest = settings.environment !== 'PRODUCTION';
    try {
      const { token } = await ensureTenantToken(settings, isTest);
      const res = await HizliConnectService.sendApplicationResponse({
        documentUuid: bildirim.uuid,
        responseCode: bildirim.responseCode,
        responseDescription: bildirim.description,
        documentId: bildirim.documentId,
        documentDate: bildirim.documentDate,
      }, token, isTest);
      invalidateStaleTokenIfUnauthorized(res, settings, isTest);

      if (!res.success) {
        return { success: false, dogrulandi: false, message: res.message || 'Uygulama yanıtı entegratöre iletilemedi.' };
      }

      const dogrulandi = (res as any).isSeviyesi === 'basarili';
      return {
        success: dogrulandi,
        dogrulandi,
        message: dogrulandi
          ? `${bildirim.responseCode} yanıtı entegratöre iletildi ve iş seviyesinde doğrulandı.`
          : `${bildirim.responseCode} yanıtı entegratöre iletildi ancak entegratör yanıtında iş-seviyesi ` +
            'başarı bayrağı bulunmadı — DOĞRULANMADI.',
      };
    } catch (err: any) {
      return { success: false, dogrulandi: false, message: err.message };
    }
  }
}
