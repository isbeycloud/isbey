import {
  ElectronicDocumentProvider,
  ProviderCapabilities,
  ProviderSendResult,
  ProviderStatusResult,
  ProviderIncomingInvoice,
} from './electronicDocumentProvider';
import { TenantEinvoiceSettings } from '../../db/schema';

export class MockElectronicDocumentProvider implements ElectronicDocumentProvider {
  public readonly providerId = 'MOCK';
  public readonly name = 'İŞBEY Mock Test Entegratörü';
  public readonly capabilities: ProviderCapabilities = {
    supportsEInvoice: true,
    supportsEArchive: true,
    supportsEDespatch: true,
    supportsIncoming: true,
    supportsCancel: true,
    supportsWebhook: true,
    supportsPdfDownload: true,
    supportsStatusQuery: true,
  };

  // Simülasyon ayarları (Testler için dinamik olarak değiştirilebilir)
  public static simulationMode: 'SUCCESS' | 'TEMPORARY_ERROR' | 'PERMANENT_ERROR' = 'SUCCESS';

  /**
   * 2026-09-12 (kritik dürüstlük düzeltmesi):
   * Bu sağlayıcının dönüş değerleri GERÇEK GİB sonucu gibi görünemez.
   *
   * Önceki hâlde gönderim, GİB'e iletildi anlamına gelen "SENT_TO_GIB" etiketi
   * ve durum sorgusu da GİB'in GERÇEK "iletildi" kodu olan 1300'ü dönüyordu.
   * Bu değerleri MOCK'tan döndürmek, hiçbir yere gönderilmemiş bir belgeyi
   * muhasebede "GİB onaylı" gösterir (CLAUDE.md md.1 ihlali). Ayrıca gelen
   * fatura listesi uydurma bir tedarikçi faturası ("Global Hammadde Tedarik
   * A.Ş.") üretiyordu; bu kayıt veritabanına GERÇEK gelen fatura olarak
   * yazılıyordu.
   *
   * Yeni kural: durum etiketleri MOCK olduğunu AÇIKÇA taşır ve gerçek GİB kodu
   * ASLA döndürülmez. (Fabrika zaten MOCK'a yalnızca kiracı ayarında açıkça
   * `providerId: 'MOCK'` yazılıysa ulaştırır — bkz. providerFactory.ts.)
   */
  private static readonly MOCK_STATUS_PREFIX = 'MOCK_';

  public async testConnection(settings: TenantEinvoiceSettings): Promise<{ success: boolean; message: string; durationMs: number }> {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `[MOCK] Bağlantı başarılı. Ortam: ${settings.environment || 'TEST'}`,
      durationMs: Date.now() - start,
    };
  }

  public async checkTaxpayer(identifier: string, settings: TenantEinvoiceSettings): Promise<{
    isEInvoiceUser: boolean;
    isEDespatchUser?: boolean;
    title?: string;
    aliasGB?: string;
    aliasPK?: string;
  }> {
    // 2026-09-12: Uydurma mükellef ÜRETİLMEZ.
    // Önceki hâlde VKN'nin son hanesine göre "e-Fatura mükellefi" UYDURULUYOR,
    // ünvan olarak `Mock Mükellef A.Ş. (<vkn>)` ve alias olarak varsayılan
    // 'urn:mail:defaultgb' dönüyordu. `TaxpayerService` bu yanıtı 24 saatlik
    // ÖNBELLEĞE yazdığı için uydurma ünvan/alias gerçek mükellef verisi gibi
    // fatura kesim akışında kullanılabiliyordu (fatura yanlış ünvana gider).
    //
    // Gerçek sorgu yapılmadığı için tek dürüst cevap "bilinmiyor"dur: kaydın
    // kendisi var olmadığı (10/11 hane dışı) dışında mükellefiyet iddia edilmez,
    // ünvan/alias döndürülmez.
    return {
      isEInvoiceUser: false,
      isEDespatchUser: false,
      title: undefined,
      aliasGB: undefined,
      aliasPK: undefined,
    };
  }

  public async sendInvoice(
    xmlContent: string,
    settings: TenantEinvoiceSettings,
    // 2026-09-13: `_meta` — bu sağlayıcı belge KİMLİĞİ ÜRETMEZ (bkz. aşağıdaki not).
    // Alt çizgi öneki, tip kontrolünde "kullanılmayan parametre" hatasını önler
    // (arayüz sözleşmesi gereği imzada kalır).
    _meta: { uuid: string; invoiceNo: string; isDraft?: boolean }
  ): Promise<ProviderSendResult> {
    if (MockElectronicDocumentProvider.simulationMode === 'TEMPORARY_ERROR') {
      return {
        success: false,
        providerStatus: 'CONNECTION_TIMEOUT',
        errorCode: 'ERR_TIMEOUT',
        errorMessage: 'Entegratör sunucusuna geçici olarak ulaşılamadı. Tekrar denenecek.',
      };
    }

    if (MockElectronicDocumentProvider.simulationMode === 'PERMANENT_ERROR') {
      return {
        success: false,
        providerStatus: 'REJECTED_BY_SCHEMA',
        errorCode: 'ERR_SCHEMA_INVALID',
        errorMessage: 'Belge şeması geçersiz veya VKN vergi dairesinde aktif değil.',
      };
    }

    return {
      success: true,
      // 2026-09-13: Burada önceden, İŞBEY'in UUID'sinden türetilmiş sahte bir
      // "entegratör belge numarası" döndürülüyordu. Bu alan "ENTEGRATÖRÜN belge
      // kimliği" anlamına gelir ve iptal/durum sorgusunda entegratöre GÖNDERİLİR.
      // MOCK hiçbir entegratöre bağlı olmadığı için ürettiği kimliğin karşılığı
      // yoktur; kayda yazılırsa "entegratör belge no'su varmış" gibi görünür.
      // Alan BOŞ bırakılır; arayüz "entegratör belge numarası yok" durumunu
      // dürüstçe gösterir (bkz. aynı kural: hizliTeknolojiProvider.ts).
      providerDocumentId: undefined,
      // GİB'e iletildi anlamına gelen etiket DEĞİL: bu belge hiçbir yere
      // gönderilmedi. Etiket MOCK olduğunu taşır; arayüz/rapor bunu
      // "GİB'e iletildi" diye gösteremez.
      providerStatus: `${MockElectronicDocumentProvider.MOCK_STATUS_PREFIX}SANDBOX`,
      statusCode: 200,
    };
  }

  public async sendEArchive(
    xmlContent: string,
    settings: TenantEinvoiceSettings,
    meta: { uuid: string; invoiceNo: string; isDraft?: boolean }
  ): Promise<ProviderSendResult> {
    return this.sendInvoice(xmlContent, settings, meta);
  }

  public async sendDespatch(
    xmlContent: string,
    settings: TenantEinvoiceSettings,
    meta: { uuid: string; waybillNo: string }
  ): Promise<ProviderSendResult> {
    return this.sendInvoice(xmlContent, settings, { uuid: meta.uuid, invoiceNo: meta.waybillNo });
  }

  public async getInvoiceStatus(uuid: string, settings: TenantEinvoiceSettings): Promise<ProviderStatusResult> {
    return {
      // 2026-09-12: 'COMPLETED_ACCEPTED' + gibStatusCode '1300' DÖNDÜRÜLMEZ.
      // '1300' GİB'in gerçek "iletildi" kodudur; MOCK'tan dönmesi, hiç
      // gönderilmemiş belgenin muhasebede ACCEPTED işaretlenmesine yol açıyordu
      // (electronicDocumentService.ts: providerStatus 'ACCEPTED' içeriyorsa
      // veya kod '1300' ise belgeyi ACCEPTED yapar).
      providerStatus: `${MockElectronicDocumentProvider.MOCK_STATUS_PREFIX}SANDBOX`,
      gibStatusCode: '',
      gibMessage: 'MOCK sağlayıcı: gerçek GİB durumu yoktur (belge gönderilmedi).',
      isCompleted: true,
    };
  }

  public async getIncomingInvoices(startDate: string, settings: TenantEinvoiceSettings): Promise<ProviderIncomingInvoice[]> {
    // 2026-09-12: Uydurma gelen fatura ÜRETİLMEZ.
    // Önceki hâlde sabit bir UUID + uydurma tedarikçi ("Global Hammadde Tedarik
    // A.Ş.", VKN 9988776655) dönüyordu; `IncomingInvoiceService.syncIncomingInvoices`
    // bunu GERÇEK gelen fatura gibi veritabanına yazıp cari/stok tarafına
    // aktarabiliyordu. MOCK sağlayıcının gelen kutusu yoktur — boş liste
    // döndürmek, uydurma belge üretmekten doğrudur.
    return [];
  }

  /**
   * MOCK iptal — hiçbir entegratör çağrısı YAPMAZ.
   *
   * `dogrulandi: undefined` döner: MOCK bir entegratör onayı görmediği için
   * "doğrulandı" DİYEMEZ. Bu sonuç asla gerçek sandbox kanıtı sayılmaz
   * (bkz. `docs/35` §6 ve kullanıcı kuralı 7).
   */
  public async cancelInvoice(uuid: string, reason: string, settings: TenantEinvoiceSettings): Promise<{ success: boolean; message?: string; dogrulandi?: boolean }> {
    return {
      success: true,
      dogrulandi: undefined,
      message: `[MOCK] Belge iptal talebi iletildi (entegratör onayı YOK — MOCK). Sebep: ${reason}`,
    };
  }

  /**
   * Gelen e-Faturaya uygulama yanıtı (KABUL / RED).
   *
   * ⚠️ MOCK hiçbir yere bildirim GÖNDERMEZ. `dogrulandi: undefined` —
   * "entegratör onayladı" bilgisi YOK. Çağıran bunu gerçek bir entegratör
   * teyidi sanmamalıdır (bkz. `cancelInvoice` ile aynı ilke).
   */
  public async respondToInvoice(
    bildirim: { uuid: string; responseCode: 'KABUL' | 'RED'; description?: string; documentId: string; documentDate: string },
    _settings: TenantEinvoiceSettings
  ): Promise<{ success: boolean; message?: string; dogrulandi?: boolean }> {
    return {
      success: true,
      dogrulandi: undefined,
      message: `[MOCK] Uygulama yanıtı (${bildirim.responseCode}) iletildi — entegratör onayı YOK. Belge: ${bildirim.documentId}`,
    };
  }
}
