import { TenantEinvoiceSettings } from '../../db/schema';

/**
 * 2026-09-12: Entegratöre ULAŞILAMADIĞINDA (ağ/timeout/HTTP 5xx/bozuk yanıt)
 * fırlatılır — `ProviderConfigurationError`'dan AYRI bir sınıftır.
 *
 * Neden ayrı sınıf: bu bir istemci hatası DEĞİLDİR. Önceden tüm entegratör
 * hataları düz `Error` olarak yükseliyor, uçlardaki `entegratorHatasi` da
 * hepsini 400 ("senin isteğin bozuk") diye raporluyordu. Oysa durum "üst
 * bağımlılık şu an çalışmıyor"dur (502). İkisini aynı koda düşürmek izleme,
 * uyarı ve istemci retry mantığını yanıltır.
 *
 * NEDEN BU DOSYADA: sağlayıcı implementasyonları (`hizliTeknolojiProvider`)
 * bu hatayı fırlatır; `providerFactory` ise onları import eder. Sınıf fabrikada
 * tanımlansaydı sağlayıcı → fabrika → sağlayıcı şeklinde DÖNGÜSEL import
 * oluşurdu. Bu modül yalnızca `schema`'ya bağlıdır; döngü üretmez.
 */
export class ProviderTransportError extends Error {
  public readonly code = 'PROVIDER_UNREACHABLE';
  constructor(message: string) {
    super(message);
    this.name = 'ProviderTransportError';
  }

  /**
   * `instanceof` yerine `code` üzerinden de kontrol edilir: hata farklı bir
   * modül kopyasından gelse bile tanınır (bkz. ProviderConfigurationError.is).
   */
  public static is(err: unknown): err is ProviderTransportError {
    const e = err as { code?: string; name?: string } | null;
    return !!e && (e.code === 'PROVIDER_UNREACHABLE' || e.name === 'ProviderTransportError');
  }
}

export interface ProviderCapabilities {
  supportsEInvoice: boolean;
  supportsEArchive: boolean;
  supportsEDespatch: boolean;
  supportsIncoming: boolean;
  supportsCancel: boolean;
  supportsWebhook: boolean;
  supportsPdfDownload: boolean;
  supportsStatusQuery: boolean;
}

export interface ProviderSendResult {
  success: boolean;
  providerDocumentId?: string;
  providerStatus: string;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderStatusResult {
  providerStatus: string;
  gibStatusCode?: string;
  gibMessage?: string;
  isCompleted: boolean;
}

export interface ProviderIncomingInvoice {
  uuid: string;
  invoiceNo: string;
  supplierVkn: string;
  supplierTitle: string;
  issueDate: string;
  subTotal: number;
  vatAmount: number;
  grandTotal: number;
  currency: string;
  xmlContent: string;
}

export interface ElectronicDocumentProvider {
  readonly providerId: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  /**
   * Entegratör Bağlantı ve Kimlik Doğrulama Testi
   */
  testConnection(settings: TenantEinvoiceSettings): Promise<{ success: boolean; message: string; durationMs: number }>;

  /**
   * VKN / TCKN Mükellef Bilgisi Sorgulama
   */
  checkTaxpayer(identifier: string, settings: TenantEinvoiceSettings): Promise<{
    isEInvoiceUser: boolean;
    isEDespatchUser?: boolean;
    title?: string;
    aliasGB?: string;
    aliasPK?: string;
  }>;

  /**
   * e-Fatura Gönderimi
   */
  sendInvoice(xmlContent: string, settings: TenantEinvoiceSettings, meta: { uuid: string; invoiceNo: string; isDraft?: boolean }): Promise<ProviderSendResult>;

  /**
   * e-Arşiv Fatura Gönderimi
   */
  sendEArchive(xmlContent: string, settings: TenantEinvoiceSettings, meta: { uuid: string; invoiceNo: string; isDraft?: boolean }): Promise<ProviderSendResult>;

  /**
   * e-İrsaliye Gönderimi
   */
  sendDespatch(xmlContent: string, settings: TenantEinvoiceSettings, meta: { uuid: string; waybillNo: string }): Promise<ProviderSendResult>;

  /**
   * Belge Durum Sorgulama
   */
  getInvoiceStatus(uuid: string, settings: TenantEinvoiceSettings): Promise<ProviderStatusResult>;

  /**
   * Gelen e-Faturaları Listeleme
   */
  getIncomingInvoices(startDate: string, settings: TenantEinvoiceSettings): Promise<ProviderIncomingInvoice[]>;

  /**
   * Belge İptal Bildirimi
   *
   * `dogrulandi`: entegratör yanıtında İŞ SEVİYESİ başarı bayrağı bulundu mu?
   *   `true`  → bayrak var ve başarılı (iptal teyitli)
   *   `false` → bayrak var ve başarısız, VEYA yanıtta bayrak hiç yok (belirsiz)
   *   `undefined` → sağlayıcı bu bilgiyi raporlamıyor (örn. MOCK)
   *
   * ⚠️ `success === true` iken `dogrulandi === false` OLABİLİR: HTTP 2xx alındı ama
   * entegratörün iş-seviyesi onayı görülmedi. Bu durumda çağıran "iptal kesinleşti"
   * varsaymamalıdır. Bkz. `docs/35_FAZ19_CANCELDOCUMENT_SOZLESME_DENETIMI.md`.
   */
  cancelInvoice(uuid: string, reason: string, settings: TenantEinvoiceSettings): Promise<{ success: boolean; message?: string; dogrulandi?: boolean }>;

  /**
   * Gelen e-Faturaya UYGULAMA YANITI (KABUL / RED) bildirimi.
   *
   * 2026-09-16 eklendi (`docs/43`). Önceden arayüzde yalnız `cancelInvoice`
   * vardı ve `incomingInvoiceService` "kabul bildirimi yapılamıyor" notu
   * taşıyordu. Hızlı Bilişim sözleşmesi (`SendApplicationResponse`,
   * `ResponseCode: "KABUL" | "RED"`) bu bildirimi MÜMKÜN kılıyor.
   *
   * ⚠️ `uuid` burada e-Belge UUID (ETTN) olmalıdır; iç kayıt kimliği (`inv.id`)
   *    ETTN DEĞİLDİR. Bu kural 2026-09-16'dan (`docs/44`) itibaren ÇAĞIRANLARDA
   *    uygulanır: `incomingInvoiceService` kaydın `uuid` alanını, `routes/efatura.ts`
   *    ise `eInvoiceUUID` alanını geçirir. ETTN yoksa istek gönderilmez.
   *
   * ⚠️ RED için bu metot kullanılır (`responseCode: 'RED'`), `cancelInvoice` DEĞİL:
   *    red bir uygulama yanıtıdır, iptal değildir (bkz. `docs/44` §2).
   *
   * `dogrulandi`: `cancelInvoice` ile aynı anlam — entegratörün İŞ SEVİYESİ
   * başarı bayrağı görüldü mü? `false` ise çağıran "bildirim kesinleşti"
   * varsaymamalıdır.
   */
  respondToInvoice(
    bildirim: { uuid: string; responseCode: 'KABUL' | 'RED'; description?: string; documentId: string; documentDate: string },
    settings: TenantEinvoiceSettings
  ): Promise<{ success: boolean; message?: string; dogrulandi?: boolean }>;
}
