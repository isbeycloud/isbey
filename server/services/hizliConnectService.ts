import axios from 'axios';
import { validateHizliSendResponse } from './hizliSendContract';

// ============================================================
// Sunucu genelinde paylaşılan token deposu (in-memory)
// ============================================================
export const tokenStore: {
  token: string;
  expireDate: string;
  hashedUsername: string;
  hashedPassword: string;
  isTestMode: boolean;
  lastInitAt?: string;
} = {
  token: '',
  expireDate: '',
  hashedUsername: '',
  hashedPassword: '',
  isTestMode: process.env.HIZLI_BILISIM_IS_TEST_MODE === 'false' ? false : true,
};


export interface HizliConnectConfig {
  apiKey: string;
  secretKey?: string;
  hashedUsername: string;
  hashedPassword: string;
  isTestMode: boolean;
  senderIdentifier: string; // Gönderici VKN/TCKN
  senderUrn?: string;        // Gönderici GB/PK Posta Kutusu
  autoCheckGibUser?: boolean;
}

// ============================================================
// İŞ SEVİYESİ BAŞARI BAYRAĞI — HTTP 2xx TEK BAŞINA YETMEZ
// ============================================================
/**
 * Bu API iş hatasını HTTP 2xx İÇİNDE bildirir. Kod içinde belgelenmiş kanıt:
 * `utilEncrypt` yolu `{"IsSucceeded":false,"Message":"Hatalı secretKey!"}`
 * gövdesini HTTP 200 ile alıp ayrıştırır (bkz. `utilEncrypt`, gerçek yanıt
 * örneği yorumu). `login` yolu da aynı alanı okur.
 *
 * SONUÇ: `axios` hata fırlatmadı` diye "işlem başarılı" denemez.
 *
 * ⚠️ SÖZLEŞME SINIRI (dürüstlük notu):
 *   `IsSucceeded` alanının varlığı yalnız `UtilEncrypt` ve `Login` için
 *   KANITLIDIR. `CancelDocument` / `SendDocument` yanıtlarının bu alanı taşıyıp
 *   taşımadığı DOĞRULANMAMIŞTIR (satıcı dokümanı repoda yok — bkz.
 *   `docs/35_FAZ19_CANCELDOCUMENT_SOZLESME_DENETIMI.md`).
 *   Bu yüzden alan YOKSA "başarısız" DENMEZ (bu da uydurma olurdu) — "belirsiz"
 *   denir ve çağıran karar verir. Alan VARSA ve `false` ise bu artık
 *   tartışmasız bir iş hatasıdır.
 */
export type IsSeviyesiSonuc = 'basarili' | 'basarisiz' | 'belirsiz';

/** Yanıt gövdesinden iş-seviyesi başarı bayrağını okur. */
export function isSeviyesiSonucuOku(veri: unknown): IsSeviyesiSonuc {
  if (veri === null || veri === undefined) return 'belirsiz';

  // Login dizisi döndürür; diğer uçlar nesne. İkisini de ele al.
  const hedefler = Array.isArray(veri) ? veri : [veri];

  for (const hedef of hedefler) {
    if (!hedef || typeof hedef !== 'object') continue;
    const d = hedef as Record<string, unknown>;

    const bayrak = d.IsSucceeded ?? d.isSucceeded ?? d.Success ?? d.success;
    if (typeof bayrak === 'boolean') return bayrak ? 'basarili' : 'basarisiz';

    // Bazı uçlar sarmalayıcı nesne döndürür: bir seviye içe bak.
    for (const ic of Object.values(d)) {
      if (ic && typeof ic === 'object' && !Array.isArray(ic)) {
        const ib = (ic as Record<string, unknown>).IsSucceeded
          ?? (ic as Record<string, unknown>).isSucceeded;
        if (typeof ib === 'boolean') return ib ? 'basarili' : 'basarisiz';
      }
    }
  }
  return 'belirsiz';
}

/** Yanıt gövdesinden API'nin iş-seviyesi hata mesajını çıkarır (varsa). */
export function isSeviyesiMesaji(veri: unknown): string | undefined {
  const hedefler = Array.isArray(veri) ? veri : [veri];
  for (const hedef of hedefler) {
    if (!hedef || typeof hedef !== 'object') continue;
    const d = hedef as Record<string, unknown>;
    const m = d.Message ?? d.message ?? d.ErrorMessage ?? d.error ?? d.Hata;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return undefined;
}

export class HizliConnectService {
  public static getBaseUrl(isTest: boolean): string {
    if (!isTest && process.env.HIZLI_BILISIM_ALLOW_PROD !== 'true') throw new Error('Hızlı Bilişim canlı ortam kilidi kapalı.');
    return isTest
      ? 'https://econnecttest.hizliteknoloji.com.tr'
      : 'https://econnect.hizliteknoloji.com.tr';
  }

  // ==========================================
  // 1. KİMLİK DOĞRULAMA & ŞİFRELEME (AUTH & SECURITY)
  // ==========================================

  /**
   * UtilEncrypt: SecretKey, Kullanıcı Adı ve Şifre ile Hash üretir.
   */
  public static async utilEncrypt(
    secretKey: string,
    username: string,
    password: string,
    isTest: boolean = true
  ): Promise<{ success: boolean; hashedUsername?: string; hashedPassword?: string; message?: string }> {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const response = await axios.post(
        `${baseUrl}/HizliApi/RestApi/UtilEncrypt`,
        { secretKey, username, password },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      // Gerçek API yanıt formatı: { username, password, IsSucceeded, Message }
      const d = response.data;
      const isSucceeded = d?.IsSucceeded ?? d?.isSucceeded ?? (d?.username !== null && d?.username !== undefined);

      if (isSucceeded && (d.username || d.Username)) {
        return {
          success: true,
          hashedUsername: d.username || d.Username,
          hashedPassword: d.password || d.Password,
          message: 'Şifreleme başarılı. Hashed kullanıcı bilgileri üretildi.',
        };
      }

      // API başarısız yanıt döndürdü — gerçek hata mesajını ilet
      const apiMsg = d?.Message || d?.message || 'Şifreleme servisinden beklenmeyen yanıt alındı.';
      // 2026-09-13 (log hijyeni): `JSON.stringify(d)` HAM yanıtı log'a döküyordu.
      // UtilEncrypt yanıtı başarısız görünse bile `username`/`password` (HASH'ler)
      // taşıyabilir; hash'ler SecretKey ile üretilir ve log'da bulunmaları WS
      // şifresine giden yolu kısaltır. Yalnız iş mesajı + başarı bayrağı yazılır.
      console.warn('[HIZLI_CONNECT] UtilEncrypt API hatası:', apiMsg, '| IsSucceeded:', !!d?.IsSucceeded);
      return { success: false, message: apiMsg };
    } catch (err: any) {
      // FAZ 12: Hata durumunda sahte hash ÜRETİLMEZ — gerçek hata döndürülür (CLAUDE.md kuralı)
      // 2026-09-13: Yanıtın TAMAMI değil, yalnız API iş mesajı log'lanır.
      console.warn('[HIZLI_CONNECT] UtilEncrypt hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        message: `UtilEncrypt servisine ulaşılamadı: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * Login: ApiKey, HashedUsername ve HashedPassword ile Bearer Token alır.
   */
  public static async login(
    apiKey: string,
    hashedUsername: string,
    hashedPassword: string,
    isTest: boolean = true
  ): Promise<{ success: boolean; token?: string; expireDate?: string; message: string; firmaAdi?: string; vkn?: string }> {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const response = await axios.post(
        `${baseUrl}/HizliApi/RestApi/Login`,
        // 2026-09-14 (sözleşme hizalaması): Burada `ApiKey` (büyük A) gönderiliyordu;
        // aynı API'ye giden diğer iki çağrı (`hizliBilisimClient.ts:126,202` ve
        // `phase18HizliBilisimIntegrationTest.ts:335`) `apiKey` (küçük a) gönderiyordu.
        // Hızlı Bilişim'in token geçişi duyurusundaki Login örneği `apiKey` kullanır:
        //   { "apiKey": "...", "username": "<şifreli>", "password": "<şifreli>" }
        // En güncel satıcı sözleşmesi ve kod içi çoğunluk `apiKey` olduğu için buraya
        // hizalandı. NOT: Bu değişiklik CANLI ÇAĞRI ile doğrulanmamıştır —
        // FAZ 18 sandbox kimliği engeli (Hatalı secretKey!) nedeniyle Login adımına
        // hiç ulaşılamadı, dolayısıyla iki yazımdan hangisinin API tarafından kabul
        // edildiği kanıtlanmadı. Sandbox kimliği sağlandığında koşu #6 bunu ölçmelidir.
        { apiKey, username: hashedUsername, password: hashedPassword },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      // Gerçek API yanıtı DİZİ döndürür: [{ Token: "eyJ...", IsSucceeded: true, ... }]
      const d = Array.isArray(response.data) ? response.data[0] : response.data;
      const token = d?.Token || d?.token || (typeof d === 'string' ? d : null);
      const isSucceeded = d?.IsSucceeded ?? d?.isSucceeded ?? !!token;

      if (isSucceeded && token) {
        // JWT'den expire tarihini çöz
        let expireDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          if (payload?.exp) expireDate = new Date(payload.exp * 1000).toISOString();
        } catch {}

        console.log(`[HIZLI_CONNECT] ✅ Login başarılı. Firma: ${d?.MusteriAdi || d?.Unvan || ''} | VKN: ${d?.VknTckn || ''}`);
        return {
          success: true,
          token,
          expireDate,
          message: `Hızlı Teknoloji e-Connect bağlantısı başarılı. ${d?.MusteriAdi || ''} oturumu açıldı.`,
          firmaAdi: d?.MusteriAdi || d?.Unvan || '',
          vkn: d?.VknTckn || '',
        };
      }

      const apiMsg = d?.Message || d?.message || 'Login başarısız. Kimlik bilgilerini kontrol edin.';
      // 2026-09-13 (log hijyeni): Önceden burada `JSON.stringify(d)` ile HAM yanıt
      // log'a dökülüyordu. Başarısız görünen bir yanıt gövdesi yine de `Token`
      // alanı taşıyabilir (kısmi/bozuk yanıt) — bu, JWT'nin log dosyasına
      // sızması demektir. Artık yalnız iş mesajı ve varlık boolean'ları yazılır;
      // yanıt gövdesi ve token ASLA log'lanmaz.
      console.warn('[HIZLI_CONNECT] Login API hatası:', apiMsg, '| IsSucceeded:', !!d?.IsSucceeded, '| Token var mı:', !!token);
      return { success: false, message: apiMsg };
    } catch (err: any) {
      // FAZ 12: Simüle token ÜRETİLMEZ — gerçek hata döndürülür
      // 2026-09-13: `err.response.data`'nın TAMAMI log'lanmaz (token sızma yolu);
      // yalnız API'nin iş mesajı yazılır.
      console.warn('[HIZLI_CONNECT] Login hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        message: `Login başarısız: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * Test Connection Endpoint
   */
  public static async test(token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const response = await axios.get(`${baseUrl}/HizliApi/RestApi/Test`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 10000,
      });
      return { success: true, data: response.data, message: 'Hızlı Bilişim API Test başarılı.' };
    } catch (err: any) {
      // FAZ 12: Erişilemeyen API "başarılı test" sayılmaz
      console.warn('[HIZLI_CONNECT] Test endpoint hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `API Test başarısız: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 2. BELGE GÖNDERİMİ (e-Fatura, e-Arşiv, e-İrsaliye, e-SMM, e-Müstahsil)
  // ==========================================

  /**
   * SendInvoiceModel: JSON formatında e-Fatura / e-Arşiv gönderimi
   */
  public static async sendInvoiceModel(payload: any[], token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SendInvoiceModel`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return validateHizliSendResponse(res.data, payload.length);
    } catch (err: any) {
      // FAZ 12: Sahte "1300 GİB'e iletildi" response'u ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SendInvoiceModel hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        requiresReconciliation: true,
        data: undefined,
        message: 'Gönderim sonucu doğrulanamadı. Yeniden göndermeden önce sağlayıcıdan belge durumunu kontrol edin.',
      };
    }
  }

  /**
   * SendDocument: UBL-TR XML formatında belge gönderimi
   * Hızlı Bilişim Swagger sözleşmesi (HizliWebApp.Services.InputDocument):
   * - AppType: int32 (1: e-Fatura, 2: e-Arşiv, vb.)
   * - DestinationIdentifier: string (Alıcı VKN/TCKN — ZORUNLU)
   * - XmlContent: string (UBL-TR XML)
   * - DocumentUUID: string (ETTN)
   * - DocumentId: string (Fatura no)
   */
  public static async sendDocument(inputDocuments: any[], token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const normalizedDocuments = (inputDocuments || []).map((doc: any) => {
        const xml = doc?.XmlContent || doc?.xmlContent || (typeof doc === 'string' ? doc : '');
        let vkn = doc?.DestinationIdentifier || doc?.destinationIdentifier || doc?.vkn || '';
        let uuid = doc?.DocumentUUID || doc?.documentUUID || doc?.uuid || '';
        const appType = doc?.AppType ?? doc?.appType ?? 1;

        if (xml) {
          if (!vkn) {
            const mCust = xml.match(/<cac:AccountingCustomerParty>[\s\S]*?<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/i);
            if (mCust && mCust[1]) vkn = mCust[1].trim();
          }
          if (!uuid) {
            const mUuid = xml.match(/<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/i);
            if (mUuid && mUuid[1]) uuid = mUuid[1].trim();
          }
        }

        const item: Record<string, any> = {
          AppType: appType,
          DestinationIdentifier: vkn,
          XmlContent: xml,
          DocumentUUID: uuid || undefined,
          ...(doc?.SourceUrn ? { SourceUrn: doc.SourceUrn } : {}),
          ...(doc?.DestinationUrn ? { DestinationUrn: doc.DestinationUrn } : {}),
          ...(doc?.DocumentId ? { DocumentId: doc.DocumentId } : {}),
          ...(doc?.DocumentDate ? { DocumentDate: doc.DocumentDate } : {}),
          ...(doc?.IsDraft !== undefined ? { IsDraft: doc.IsDraft } : {}),
        };

        if (doc?.xmlContent && !item.xmlContent) {
          item.xmlContent = xml;
        }

        return item;
      });

      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SendDocument`, normalizedDocuments, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return validateHizliSendResponse(res.data, normalizedDocuments.length);
    } catch (err: any) {
      // FAZ 12: Sahte gönderim response'u ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SendDocument hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        requiresReconciliation: true,
        data: undefined,
        message: 'XML gönderim sonucu doğrulanamadı. Yeniden göndermeden önce sağlayıcıdan belge durumunu kontrol edin.',
      };
    }
  }

  /**
   * SendDespatchAdviceModel: e-İrsaliye Gönderimi
   */
  public static async sendDespatchAdvice(payload: any[], token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SendDespatchAdviceModel`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { success: true, data: res.data, message: 'e-İrsaliye başarıyla iletildi.' };
    } catch (err: any) {
      // FAZ 12: Sahte e-İrsaliye response'u ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SendDespatchAdvice hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        message: `e-İrsaliye entegratöre iletilemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * SendReceiptModel: e-SMM (Serbest Meslek Makbuzu) Gönderimi
   */
  public static async sendReceipt(payload: any[], token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SendReceiptModel`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { success: true, data: res.data, message: 'e-SMM başarıyla iletildi.' };
    } catch (err: any) {
      // FAZ 12: Sahte e-SMM response'u ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SendReceipt hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        message: `e-SMM entegratöre iletilemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * SendCreditNoteModel: e-Müstahsil Makbuzu / e-Gider Pusulası Gönderimi
   */
  public static async sendCreditNote(payload: any[], token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SendCreditNoteModel`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { success: true, data: res.data, message: 'e-Müstahsil Makbuzu başarıyla iletildi.' };
    } catch (err: any) {
      // FAZ 12: Sahte e-Müstahsil response'u ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SendCreditNote hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        message: `e-Müstahsil Makbuzu iletilemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * SendCheckModel: e-Adisyon / e-Dekont Gönderimi
   */
  public static async sendCheck(payload: any[], token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SendCheckModel`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { success: true, data: res.data, message: 'e-Adisyon / e-Dekont başarıyla iletildi.' };
    } catch (err: any) {
      // FAZ 12: Sahte e-Adisyon response'u ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SendCheck hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        message: `e-Adisyon / e-Dekont iletilemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * ConvertDespatchToInvoice: İrsaliyeleri faturaya dönüştür
   */
  public static async convertDespatchToInvoice(irsaliyeXmlList: string[], token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/ConvertDespachsToInvoice`, irsaliyeXmlList, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { success: true, data: res.data, message: 'İrsaliyeler başarıyla faturaya dönüştürüldü.' };
    } catch (err: any) {
      // FAZ 12: Dönüşüm olmadan "dönüştürüldü" DENMEZ
      console.warn('[HIZLI_CONNECT] ConvertDespachsToInvoice hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `İrsaliye faturaya dönüştürülemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 3. UYGULAMA YANITI, İPTAL & İTİRAZ
  // ==========================================

  /**
   * SendApplicationResponse: Uygulama yanıtı (KABUL / RED) gönderimi.
   *
   * ⚠️ `AppType` NUMARALANDIRMASI UÇ BAZLIDIR (docs/41 §5.1):
   *   Bu uçta `1 = e-Fatura`. (`CancelDocument` ucu 3/6/7 kullanır — karıştırma.)
   *
   * SÖZLEŞME (docs/41 §2.1) — istek gövdesi:
   *   AppType             int      → 1 : e-Fatura
   *   ResponseCode        string   → "KABUL" | "RED"
   *   ResponseDescription string   → neden (zorunlu değil)
   *   Documents           List<ApplicationResponseDocumentInfo>
   *     DocumentUUID  string   → e-Belge UUID (ETTN)
   *     DocumentId    string   → belge numarası
   *     DocumentDate  DateTime → belge tarihi
   *
   * ✅ KİMLİK KAYNAĞI (docs/44 §1): `DocumentUUID`'ye artık HER ZAMAN kaydın
   *   gerçek `eInvoiceUUID` alanı (ETTN) gönderilir. Önceden çağıran iç kaydı
   *   (`inv.id`) geçiyordu ve entegratör belgeyi bu kimlikle BULAMIYORDU.
   *   Çağıranlar (`routes/efatura.ts`) kimliği kayıttan çözümler ve ETTN yoksa
   *   isteği REDDEDER; bu metoda asla uydurma kimlik gelmez.
   */
  public static async sendApplicationResponse(
    responsePayload: {
      /** e-Belge UUID (ETTN). Çağıran bunu kaydın `eInvoiceUUID` alanından vermelidir. */
      documentUuid: string;
      responseCode: 'KABUL' | 'RED';
      responseDescription?: string;
      /** Belge numarası (`DocumentId`). */
      documentId: string;
      /** Belge tarihi (`DocumentDate`), YYYY-MM-DD. */
      documentDate: string;
      /** Varsayılan 1 = e-Fatura (bu ucun numaralandırması). */
      appType?: number;
    },
    token: string,
    isTest: boolean = true
  ) {
    const baseUrl = this.getBaseUrl(isTest);
    const yanitKodu = responsePayload.responseCode;

    // Sözleşmeye uygun gövde — düz {uuid, responseType, reason} DEĞİL.
    const requestBody = {
      AppType: responsePayload.appType ?? 1,
      ResponseCode: yanitKodu,
      ResponseDescription: responsePayload.responseDescription ?? '',
      Documents: [
        {
          DocumentUUID: responsePayload.documentUuid,
          DocumentId: responsePayload.documentId,
          DocumentDate: responsePayload.documentDate,
        },
      ],
    };

    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SendApplicationResponse`, requestBody, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      // HTTP 2xx TEK BAŞINA YETMEZ — iş hatası 200 içinde bildirilir.
      // Sözleşme (docs/41): bu ucun çıkışı da `ResponseMessage`
      // (`IsSucceeded` + `Message`) döner. `cancelDocument` ile aynı desen.
      const isSonuc = isSeviyesiSonucuOku(res.data);
      if (isSonuc === 'basarisiz') {
        const apiMsg = isSeviyesiMesaji(res.data) || 'Entegratör uygulama yanıtını reddetti.';
        console.warn('[HIZLI_CONNECT] SendApplicationResponse iş hatası (HTTP 2xx):', apiMsg);
        return {
          success: false,
          isSeviyesi: isSonuc,
          data: res.data,
          error: res.status,
          // "Gönderildi" DENMEZ — API iş hatası bildirdi.
          message: `${yanitKodu} uygulama yanıtı iletilemedi: ${apiMsg}`,
        };
      }

      return {
        success: true,
        isSeviyesi: isSonuc,
        data: res.data,
        // Alan yoksa "belirsiz" — çağıran bilsin, uydurma onay yazılmasın.
        message: isSonuc === 'belirsiz'
          ? `${yanitKodu} uygulama yanıtı iletildi (iş-seviyesi başarı bayrağı yanıtta yok — doğrulanmadı).`
          : `Ticari Faturaya ${yanitKodu} uygulama yanıtı gönderildi.`,
      };
    } catch (err: any) {
      // FAZ 12: Sahte yanıt-onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SendApplicationResponse hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        isSeviyesi: 'basarisiz' as IsSeviyesiSonuc,
        error: err?.response?.status,
        message: `Uygulama yanıtı iletilemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * CancelEArsivInvoice: e-Arşiv Fatura İptali
   *
   * NOT (sözleşme): Bu uç `Uuid` / `CancelReason` (büyük harf) sorgu parametresi
   * kullanır — `CancelDocument` gövdesindeki küçük harfli adlarla ÇELİŞİR.
   * Hangisinin doğru olduğu kanıtlanmamıştır; bkz. docs/35.
   */
  public static async cancelEArsivInvoice(uuid: string, cancelReason: string, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/CancelEArsivInvoice?Uuid=${uuid}&CancelReason=${encodeURIComponent(cancelReason)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 20000,
      });

      // HTTP 2xx TEK BAŞINA YETMEZ — iş hatası 200 içinde bildirilir.
      const isSonuc = isSeviyesiSonucuOku(res.data);
      if (isSonuc === 'basarisiz') {
        const apiMsg = isSeviyesiMesaji(res.data) || 'Entegratör iptal talebini reddetti.';
        console.warn('[HIZLI_CONNECT] CancelEArsivInvoice iş hatası (HTTP 2xx):', apiMsg);
        return {
          success: false,
          isSeviyesi: isSonuc,
          data: res.data,
          error: res.status,
          message: `e-Arşiv fatura iptal edilemedi: ${apiMsg}`,
        };
      }

      return {
        success: true,
        isSeviyesi: isSonuc,
        data: res.data,
        message: isSonuc === 'belirsiz'
          ? 'e-Arşiv iptal talebi iletildi (iş-seviyesi başarı bayrağı yanıtta yok — doğrulanmadı).'
          : 'e-Arşiv Fatura başarıyla iptal edildi.',
      };
    } catch (err: any) {
      // FAZ 12: İptal edilmediyse "başarıyla iptal edildi" DENMEZ
      console.warn('[HIZLI_CONNECT] CancelEArsivInvoice hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        isSeviyesi: 'basarisiz' as IsSeviyesiSonuc,
        error: err?.response?.status,
        message: `e-Arşiv fatura iptal edilemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * CancelDocument: Genel Belge İptali
   *
   * Doğrulanmış Swagger sözleşmesi (HizliWebApp.Models.EArsiv.CancelDocumentInput):
   * Endpoint: POST /HizliApi/RestApi/CancelDocument
   * Parametreler:
   *   - AppType: 3 (e-Arşiv Fatura), 6 (e-SMM), 7 (e-Müstahsil)
   *   - DocumentUuid: string (fatura UUID)
   *   - CancelReason: string
   *   - CancelDate: string (YYYY-MM-DD)
   * Yanıt (HizliWebApp.Services.ResponseMessage):
   *   - IsSucceeded: boolean
   *   - Message: string
   */
  public static async cancelDocument(payload: any, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const docUuid = payload?.DocumentUuid || payload?.uuid || payload?.Uuid || '';
      const reason = payload?.CancelReason || payload?.cancelReason || payload?.reason || 'İptal';
      const appType = payload?.AppType ?? 3;
      const cancelDate = payload?.CancelDate || payload?.cancelDate || new Date().toISOString().slice(0, 10);

      const requestBody: Record<string, any> = {
        // Doğrulanmış Swagger modeli
        AppType: appType,
        DocumentUuid: docUuid,
        CancelReason: reason,
        CancelDate: cancelDate,
        // Geriye dönük test uyumluluğu için küçük harfli alanlar
        uuid: docUuid,
        cancelReason: reason,
      };

      if (payload?.FaturaNo || payload?.invoiceNo) {
        requestBody.FaturaNo = payload.FaturaNo || payload.invoiceNo;
      }
      if (payload?.AliciAdi || payload?.customerTitle) {
        requestBody.AliciAdi = payload.AliciAdi || payload.customerTitle;
      }
      if (payload?.Year) {
        requestBody.Year = payload.Year;
      }
      if (payload?.CancelMail) {
        requestBody.CancelMail = payload.CancelMail;
      }

      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/CancelDocument`, requestBody, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      // HTTP 2xx TEK BAŞINA YETMEZ — iş hatası 200 içinde bildirilir (bkz. isSeviyesiSonucuOku).
      const isSonuc = isSeviyesiSonucuOku(res.data);
      if (isSonuc === 'basarisiz') {
        const apiMsg = isSeviyesiMesaji(res.data) || 'Entegratör iptal talebini reddetti.';
        console.warn('[HIZLI_CONNECT] CancelDocument iş hatası (HTTP 2xx):', apiMsg);
        return {
          success: false,
          isSeviyesi: isSonuc,
          data: res.data,
          error: res.status,
          // "İptal edildi" DENMEZ — API iş hatası bildirdi.
          message: `Belge iptal edilemedi: ${apiMsg}`,
        };
      }

      return {
        success: true,
        isSeviyesi: isSonuc,
        data: res.data,
        // Alan yoksa "belirsiz" — çağıran bilsin, uydurma onay yazılmasın.
        message: isSonuc === 'belirsiz'
          ? 'Belge iptal talebi iletildi (iş-seviyesi başarı bayrağı yanıtta yok — doğrulanmadı).'
          : 'Belge iptal edildi.',
      };
    } catch (err: any) {
      // FAZ 12: Sahte iptal-onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] CancelDocument hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        isSeviyesi: 'basarisiz' as IsSeviyesiSonuc,
        error: err?.response?.status,
        message: `Belge iptal edilemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * ObjectDocument: e-Arşiv İtiraz Kaydı
   */
  public static async objectDocument(payload: any, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/ObjectDocument`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });
      return { success: true, data: res.data, message: 'İtiraz kaydı alındı.' };
    } catch (err: any) {
      // FAZ 12: Sahte itiraz-onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] ObjectDocument hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        message: `İtiraz kaydı oluşturulamadı: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * RescindCancel: İptali Geri Alma
   */
  public static async rescindCancel(appType: number, uuid: string, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/RescindCancel?appType=${appType}&UUID=${uuid}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 20000,
      });
      return { success: true, data: res.data, message: 'İptal geri alındı.' };
    } catch (err: any) {
      // FAZ 12: Sahte geri-alma onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] RescindCancel hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        message: `İptal işlemi geri alınamadı: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  // ==========================================
  // 4. GELEN / GİDEN BELGE SORGULAMA & İNDİRME
  // ==========================================

  /**
   * GetDocumentList: Belge Listesini Getir (Gelen / Giden)
   */
  public static async getDocumentList(params: {
    appType: number; // 1: e-Fatura, 2: e-Arşiv, 3: e-İrsaliye, 4: e-SMM, 5: e-Müstahsil
    dateType?: string; // CreateDate / IssueDate
    startDate?: string;
    endDate?: string;
    isNew?: boolean;
    isExport?: boolean;
    isDraft?: boolean;
    takenFromEntegrator?: string;
    branchCodes?: number[];
  }, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    const query = new URLSearchParams({
      AppType: String(params.appType || 1),
      DateType: params.dateType || 'CreateDate',
      StartDate: params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      EndDate: params.endDate || new Date().toISOString(),
      IsNew: String(params.isNew ?? false),
      IsExport: String(params.isExport ?? false),
      IsDraft: String(params.isDraft ?? false),
      TakenFromEntegrator: params.takenFromEntegrator || '1',
    });

    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/GetDocumentList?${query.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 25000,
      });
      return { success: true, documents: res.data?.documents || res.data || [] };
    } catch (err: any) {
      // FAZ 12: Demo belge listesi ÜRETİLMEZ — gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] GetDocumentList hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        documents: [],
        message: `Belge listesi alınamadı: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * GetDocumentFile: Belgeyi PDF, HTML veya XML olarak indir
   */
  public static async getDocumentFile(
    appType: number,
    uuid: string,
    format: 'PDF' | 'HTML' | 'XML' = 'PDF',
    isDraft: boolean = false,
    token: string,
    isTest: boolean = true
  ) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(
        `${baseUrl}/HizliApi/RestApi/GetDocumentFile?AppType=${appType}&Uuid=${uuid}&Tur=${format}&IsDraft=${isDraft}`,
        { headers: { 'Authorization': `Bearer ${token}` }, timeout: 25000 }
      );
      return { success: true, content: res.data?.content || res.data?.Content || res.data, format };
    } catch (err: any) {
      // FAZ 12: Simüle belge içeriği ÜRETİLMEZ — bozuk/eksik PDF kullanıcıya gösterilmez
      console.warn('[HIZLI_CONNECT] GetDocumentFile hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        content: '',
        format,
        message: `Belge içeriği indirilemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * SetTakenFromEntegrator: Belgeyi alındı olarak işaretle
   */
  public static async setTakenFromEntegrator(uuids: string[], appType: number, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(
        `${baseUrl}/HizliApi/RestApi/SetTakenFromEntegrator`,
        { appType, uuids },
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      return { success: true, data: res.data, message: 'Belgeler alındı olarak işaretlendi.' };
    } catch (err: any) {
      // FAZ 12: İşaretleme olmadan "güncellendi" DENMEZ
      console.warn('[HIZLI_CONNECT] SetTakenFromEntegrator hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Belgeler işaretlenemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 5. GİB MÜKELLEF SORGULAMA & POSTA KUTUSU
  // ==========================================

  /**
   * CheckGibUser / GetGibUserList: VKN/TCKN ile Mükellef Sorgula
   */
  public static async checkGibUser(vkn: string, token: string, isTest: boolean = true) {
    const cleanVkn = vkn.replace(/\D/g, '');
    const baseUrl = this.getBaseUrl(isTest);

    try {
      // Provider contract: Type selects the mailbox (PK/GB), Identifier is the VKN.
      // HTTP 200 alone is not proof of a successful registry lookup.
      if (!/^\d{10,11}$/.test(cleanVkn)) throw new Error('Geçerli VKN/TCKN gereklidir.');
      const lists = await Promise.all(['PK', 'GB'].map(async type => {
        const response = await axios.get(
          `${baseUrl}/HizliApi/RestApi/GetGibUserList?AppType=1&Type=${type}&Identifier=${cleanVkn}`,
          { headers: { 'Authorization': `Bearer ${token}` }, timeout: 15000 }
        );
        const data = response.data;
        if (data?.IsSucceeded !== true || !Array.isArray(data.gibUserLists)) {
          throw new Error('Sağlayıcı mükellef sorgusunu doğrulamadı.');
        }
        if (data.gibUserLists.some((u: any) => !u || u.Identifier !== cleanVkn ||
          typeof u.Alias !== 'string' || !u.Alias.startsWith('urn:mail:') || !u.Alias.slice(9).trim() ||
          typeof u.Title !== 'string' || !u.Title.trim())) {
          throw new Error('Mükellef yanıtı istenen firma ile eşleşmiyor veya eksik.');
        }
        return data.gibUserLists;
      }));
      const [pk, gb] = lists;
      const users = [...pk, ...gb];
      if (users.length) {
        const uniqueAlias = (rows: any[]) => {
          const aliases = [...new Set<string>(rows.map(u => u.Alias))];
          return aliases.length === 1 ? aliases[0] : '';
        };
        return {
          success: true,
          isEInvoiceUser: true,
          title: users[0].Title,
          // Ambiguous mailbox lists require an explicit choice, never pick the first.
          aliasPk: uniqueAlias(pk),
          aliasGb: uniqueAlias(gb),
          firstCreationTime: users[0].FirstCreationTime || '',
          message: 'Alıcı GİB e-Fatura mükellefidir.',
        };
      }
      // API yanıt verdi ama mükellef kaydı yok → gerçekten mükellef değil (e-Arşiv yoluna gider)
      return {
        success: true,
        isEInvoiceUser: false,
        title: '',
        aliasPk: '',
        aliasGb: '',
        message: 'Alıcı GİB e-Fatura mükellefi değil — e-Arşiv kapsamında değerlendirilmeli.',
      };
    } catch (err: any) {
      // FAZ 12: API'ye ulaşılamadıysa VKN uzunluğuna göre mükellef durumu UYDURULMAZ.
      // Yanlış "mükellef" kararı yanlış belge tipine (e-Fatura vs e-Arşiv) yol açar.
      console.warn('[HIZLI_CONNECT] GetGibUserList hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        isEInvoiceUser: false,
        title: '',
        aliasPk: '',
        aliasGb: '',
        message: `GİB mükellef sorgusu başarısız: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  // ==========================================
  // 6. KONTÖR & KREDİ İŞLEMLERİ
  // ==========================================

  /**
   * KalanKontorSorgula
   */
  public static async kalanKontorSorgula(vkn: string, birimTuru: string = 'FaturaAdedi', token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(
        `${baseUrl}/HizliApi/RestApi/KalanKontorSorgula?vkn_tckn=${vkn}&birimTuru=${birimTuru}`,
        { headers: { 'Authorization': `Bearer ${token}` }, timeout: 15000 }
      );
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: Sahte kontör bakiyesi (2500/1845) ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] KalanKontorSorgula hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Kalan kontör sorgulanamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /**
   * KontorYukle
   */
  public static async kontorYukle(payload: { vkn_tckn: string; adet: number; paketTuru: string }, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/KontorYukle`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      return { success: true, data: res.data, message: `${payload.adet} adet kontör başarıyla yüklendi.` };
    } catch (err: any) {
      // FAZ 12: Yüklenmeyen kontör için "tanımlandı" DENMEZ
      console.warn('[HIZLI_CONNECT] KontorYukle hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Kontör yüklenemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 7. MÜŞTERİ YÖNETİMİ (HbtMusteri)
  // ==========================================

  public static async musteriOlustur(musteriData: any, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/MusteriOlustur`, musteriData, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });
      return { success: true, data: res.data, message: 'Hızlı Bilişim müşteri kaydı başarıyla oluşturuldu.' };
    } catch (err: any) {
      // FAZ 12: Oluşturulmayan müşteri için sahte onay ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] MusteriOlustur hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Müşteri kaydı oluşturulamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  public static async musteriGetir(vkn: string, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/MusteriGetir?vergikimlikno=${vkn}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, customer: res.data };
    } catch (err: any) {
      // FAZ 12: "Sorgulandı" deyip null dönmek yerine gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] MusteriGetir hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Müşteri sorgulanamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 8. SİSTEM KOD LİSTELERİ & TCMB KURLARI
  // ==========================================

  /**
   * GetCodeList: DURUM, FATURATURU, PARABIRIMI, BIRIM, TEVKIFAT, ISTISNA vb.
   */
  public static async getCodeList(type: string, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/GetCodeList?type=${type}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      if (res.data?.IsSucceeded !== true || !Array.isArray(res.data.Prefix) || res.data.Prefix.some((p: unknown) => typeof p !== 'string' || !p.trim())) throw new Error('Sağlayıcı seri listesini doğrulamadı.');
      return { success: true, list: res.data.Prefix as string[] };
    } catch (err: any) {
      // FAZ 12: GİB kod listeleri statik mock yerine gerçek hata döndürür —
      // kod listesi stale kalırsa fatura red riski vardır; kullanıcı hata görmelidir.
      console.warn('[HIZLI_CONNECT] GetCodeList hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, list: [], message: `Kod listesi alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /**
   * TcbmKurGetir: TCMB Döviz Kurlarını Getir
   */
  public static async tcmbKurGetir(paraBirimi: string = 'USD', kurTipi: 'SatisKur' | 'AlisKur' = 'SatisKur', token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/TcbmKurGetir?kurTipi=${kurTipi}&paraBirimi=${paraBirimi}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, rate: res.data?.rate || res.data, currency: paraBirimi };
    } catch (err: any) {
      // FAZ 12: Sahte döviz kuru (33.85 vb.) ÜRETİLMEZ — yanlış kur finansal hesabı bozar
      console.warn('[HIZLI_CONNECT] TcbmKurGetir hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, rate: null, currency: paraBirimi, message: `TCMB kuru alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 9. SERİ NO (ÖNEK / PREFIX) & ŞABLON (XSLT)
  // ==========================================

  public static async getPrefixCodeList(prefixType: number = 1, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/PrefixCodeList?PrefixType=${prefixType}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      if (res.data?.IsSucceeded !== true || !Array.isArray(res.data.Prefix) || res.data.Prefix.some((p: unknown) => typeof p !== 'string' || !p.trim())) throw new Error('Sağlayıcı seri listesini doğrulamadı.');
      return { success: true, list: res.data.Prefix as string[] };
    } catch (err: any) {
      // FAZ 12: Sahte seri listesi ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] PrefixCodeList hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, list: [], message: `Seri listesi alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  public static async savePrefixCode(payload: any, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/PrefixCodeSave`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      return { success: true, data: res.data, message: 'Seri no / Önek kaydedildi.' };
    } catch (err: any) {
      // FAZ 12: Kaydedilmeyen seri için sahte onay ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] PrefixCodeSave hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Seri no kaydedilemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  public static async getXsltList(token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/XsltList`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      if (res.data?.IsSucceeded !== true || !Array.isArray(res.data.Prefix) || res.data.Prefix.some((p: unknown) => typeof p !== 'string' || !p.trim())) throw new Error('Sağlayıcı seri listesini doğrulamadı.');
      return { success: true, list: res.data.Prefix as string[] };
    } catch (err: any) {
      // FAZ 12: Sahte şablon listesi ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] XsltList hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        list: [],
        message: `XSLT şablon listesi alınamadı: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  // ==========================================
  // 10. KREDİ / KONTÖR BAKIYESI
  // ==========================================

  /**
   * GetCredits: Kalan kontör / kredi bakiyesini sorgular
   */
  public static async getCredits(token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/GetCredits`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      const data = res.data;
      // FAZ 17: API'den gerçek bakiye gelmezse uydurma sayı gösterilmez
      if (data?.totalCredits === undefined && data?.TotalCredits === undefined && data?.remainingCredits === undefined && data?.RemainingCredits === undefined) {
        console.warn('[HIZLI_CONNECT] GetCredits beklenmeyen yanıt:', JSON.stringify(data)?.slice(0, 200));
        return {
          success: false,
          message: 'Kontör bakiyesi API yanıtında bulunamadı.',
        };
      }
      return {
        success: true,
        totalCredits: data?.totalCredits ?? data?.TotalCredits ?? 0,
        remainingCredits: data?.remainingCredits ?? data?.RemainingCredits ?? 0,
        message: 'Kontör bakiyesi alındı.',
      };
    } catch (err: any) {
      // FAZ 12: Sahte kontör bakiyesi (2500/1845) ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] GetCredits hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        message: `Kontör bakiyesi alınamadı: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  // ==========================================
  // 11. OTOMATİK BAŞLATMA (STARTUP AUTO-INIT)
  // ==========================================

  /**
   * autoInitialize: Uygulama başlangıcında çalışır.
   * 1. .env'den kimlik bilgilerini okur.
   * 2. UtilEncrypt ile şifreler → hashedUsername / hashedPassword üretir.
   * 3. Login → Bearer token alır ve tokenStore'a yazar.
   * 4. Hata olursa sessizce uyarır; uygulama yine de başlar.
   */
  public static async autoInitialize(): Promise<{ success: boolean; message: string }> {
    const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY || '';
    const username  = process.env.HIZLI_BILISIM_WS_USERNAME || '';
    const password  = process.env.HIZLI_BILISIM_WS_PASSWORD || '';
    const apiKey    = process.env.HIZLI_BILISIM_API_KEY || '';
    const isTest    = process.env.HIZLI_BILISIM_IS_TEST_MODE !== 'false';

    tokenStore.isTestMode = isTest;

    if (!secretKey || !username || !password || !apiKey) {
      const msg = '[HIZLI_CONNECT] ⚠️  .env dosyasında eksik kimlik bilgisi. Auto-init atlandı.';
      console.warn(msg);
      return { success: false, message: msg };
    }

    console.log(`[HIZLI_CONNECT] 🔐 UtilEncrypt başlatılıyor... (${isTest ? 'TEST' : 'CANLI'} mod)`);

    // Adım 1: Şifrele
    const encResult = await this.utilEncrypt(secretKey, username, password, isTest);
    if (!encResult.success || !encResult.hashedUsername || !encResult.hashedPassword) {
      const msg = `[HIZLI_CONNECT] ❌ UtilEncrypt başarısız: ${encResult.message}`;
      console.error(msg);
      return { success: false, message: msg };
    }

    tokenStore.hashedUsername = encResult.hashedUsername;
    tokenStore.hashedPassword = encResult.hashedPassword;
    console.log('[HIZLI_CONNECT] ✅ Kimlik bilgileri şifrelendi.');

    // Adım 2: Login → Token al
    const loginResult = await this.login(apiKey, encResult.hashedUsername, encResult.hashedPassword, isTest);
    if (!loginResult.success || !loginResult.token) {
      const msg = `[HIZLI_CONNECT] ❌ Login başarısız: ${loginResult.message}`;
      console.error(msg);
      return { success: false, message: msg };
    }

    tokenStore.token = loginResult.token;
    tokenStore.expireDate = loginResult.expireDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    tokenStore.lastInitAt = new Date().toISOString();

    const env = isTest ? '🧪 TEST' : '🚀 CANLI';
    console.log(`[HIZLI_CONNECT] ${env} Token başarıyla alındı. Geçerlilik: ${tokenStore.expireDate}`);

    return {
      success: true,
      message: `Hızlı Teknoloji e-Connect bağlantısı kuruldu (${isTest ? 'Test' : 'Canlı'} mod). Token geçerli.`,
    };
  }

  /**
   * refreshToken: Mevcut hashlanmış kimlik bilgileriyle yeni token alır.
   * Sunucu tarafında periyodik olarak çağrılır (her 23 saatte bir).
   */
  public static async refreshToken(): Promise<{ success: boolean; message: string }> {
    const apiKey = process.env.HIZLI_BILISIM_API_KEY || '';
    const { hashedUsername, hashedPassword, isTestMode } = tokenStore;

    if (!hashedUsername || !hashedPassword) {
      // Tam init gerekiyor
      return this.autoInitialize();
    }

    console.log('[HIZLI_CONNECT] 🔄 Token yenileniyor...');
    const loginResult = await this.login(apiKey, hashedUsername, hashedPassword, isTestMode);
    if (loginResult.success && loginResult.token) {
      tokenStore.token = loginResult.token;
      tokenStore.expireDate = loginResult.expireDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      tokenStore.lastInitAt = new Date().toISOString();
      console.log(`[HIZLI_CONNECT] ✅ Token yenilendi. Yeni geçerlilik: ${tokenStore.expireDate}`);
      return { success: true, message: 'Token başarıyla yenilendi.' };
    }

    console.warn(`[HIZLI_CONNECT] ⚠️  Token yenileme başarısız. Tam init deneniyor...`);
    return this.autoInitialize();
  }

  // ==========================================
  // 12. CARİ YÖNETİMİ (Swagger: CariList / CariGetById)
  // ==========================================

  /** CariList: Tüm cari listesini getir */
  public static async cariList(token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/CariList`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: Boş cari listesi yerine gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] CariList hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Cari listesi alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** CariGetById: VKN/TCKN ile cari getir */
  public static async cariGetById(vknTckn: string, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/CariGetById?VknTckn=${vknTckn}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: "Sorgulandı" deyip null dönmek yerine gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] CariGetById hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Cari bilgisi alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 13. STOK YÖNETİMİ (Swagger: StockSave / StockList / StokDelete)
  // ==========================================

  /** StockSave: Stok kaydet */
  public static async stockSave(stockData: any, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/StockSave`, stockData, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });
      return { success: true, data: res.data, message: 'Stok kaydı başarılı.' };
    } catch (err: any) {
      // FAZ 12: Sahte "kaydedildi" onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] StockSave hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Stok kaydedilemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** StockList: Stok listesini getir */
  public static async stockList(token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/StockList`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: Boş stok listesi yerine gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] StockList hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Stok listesi alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** StokDelete: Stok sil */
  public static async stokDelete(stokId: number, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/StokDelete?stokId=${stokId}`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data, message: 'Stok silindi.' };
    } catch (err: any) {
      // FAZ 12: Sahte "silindi" onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] StokDelete hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Stok silinemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 14. DASHBOARD BİLGİSİ (Swagger: GetDashboardInfo)
  // ==========================================

  /** GetDashboardInfo: Dashboard istatistiklerini getir */
  public static async getDashboardInfo(identifier: string, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/GetDashboardInfo?Identifier=${identifier}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: null + "alındı" mesajı yerine gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] GetDashboardInfo hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Dashboard bilgisi alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 15. E-POSTA İŞLEMLERİ (Swagger: SetEmailSend / ReSendMail)
  // ==========================================

  /** SetEmailSend: E-posta gönder */
  public static async setEmailSend(payload: {
    appType: number;
    uuid: string;
    emailList: string[];
    subject?: string;
  }, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SetEmailSend`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });
      return { success: true, data: res.data, message: 'E-posta gönderildi.' };
    } catch (err: any) {
      // FAZ 12: Sahte e-posta onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SetEmailSend hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `E-posta gönderilemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** ReSendMail: E-posta yeniden gönder */
  public static async reSendMail(payload: { appType: number; uuid: string }, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/ReSendMail`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });
      return { success: true, data: res.data, message: 'E-posta yeniden gönderildi.' };
    } catch (err: any) {
      // FAZ 12: Sahte yeniden-gönderim onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] ReSendMail hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `E-posta yeniden gönderilemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 16. BELGE SORGULAMA EK METODLAR
  // ==========================================

  /** GetDocumentViewer: VKN + fatura no + tutar ile belge görüntüleyici */
  public static async getDocumentViewer(params: {
    appType: number;
    vknTckn: string;
    documentNo: string;
    payableAmount: number;
  }, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const q = new URLSearchParams({
        appType: String(params.appType),
        vknTckn: params.vknTckn,
        documentNo: params.documentNo,
        payableAmount: String(params.payableAmount),
      });
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/GetDocumentViewer?${q}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: null + "hazır" mesajı yerine gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] GetDocumentViewer hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Belge görüntülenemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** GetDocumentReceiverAllList: Gelen tüm belgeler (tarih filtreli) */
  public static async getDocumentReceiverAllList(params: {
    dateType: string;
    startDate: string;
    endDate: string;
    takenFromEntegrator?: string;
  }, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const q = new URLSearchParams({
        DateType: params.dateType || 'CreateDate',
        StartDate: params.startDate,
        EndDate: params.endDate,
        TakenFromEntegrator: params.takenFromEntegrator || '1',
      });
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/GetDocumentReceiverAllList?${q}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 20000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: Boş gelen-belge listesi yerine gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] GetDocumentReceiverAllList hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Gelen belgeler alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** GetDocumentListGUID: UUID listesiyle belge sorgu */
  public static async getDocumentListByGUID(guids: string[], appType: number, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/GetDocumentListGUID`, { appType, guids }, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: GUID sorgusu boş liste yerine gerçek hata döndürür
      console.warn('[HIZLI_CONNECT] GetDocumentListGUID hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Belge sorgusu başarısız: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 17. MÜŞTERİ AKTİF/PASİF
  // ==========================================

  /** MusteriAktifPasif: Müşteriyi aktif veya pasif yap */
  public static async musteriAktifPasif(vknTckn: string, isActive: boolean, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/MusteriAktifPasif`,
        { vkn_tckn: vknTckn, isActive },
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      return { success: true, data: res.data, message: `Müşteri ${isActive ? 'aktif' : 'pasif'} yapıldı.` };
    } catch (err: any) {
      // FAZ 12: Sahte güncelleme onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] MusteriAktifPasif hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Müşteri durumu güncellenemedi: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 18. KONTÖR HAREKETLERİ
  // ==========================================

  /** KontorHareketleri: Kontör hareketlerini getir (kendi firması) */
  public static async kontorHareketleri(token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/KontorHareketleri`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: Boş kontör hareketleri yerine gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] KontorHareketleri hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Kontör hareketleri alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** KontorHareketleriVknTckn: Belirli VKN'nin kontör hareketleri */
  public static async kontorHareketleriVknTckn(vknTckn: string, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/KontorHareketleriVknTckn?vkn_tckn=${vknTckn}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: VKN bazlı kontör sorgusu boş veri yerine gerçek hata döndürür
      console.warn('[HIZLI_CONNECT] KontorHareketleriVknTckn hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Kontör hareketleri (VKN) alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  // ==========================================
  // 19. XML DOĞRULAMA VE SON FATURA NO
  // ==========================================

  /** ControlDocumentXML: XML belgesini GİB standartlarına göre doğrula */
  public static async controlDocumentXML(xmlContent: string, appType: number, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/RestApi/ControlDocumentXML`,
        { xmlContent, appType },
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
      );
      return { success: true, data: res.data, message: 'XML doğrulama tamamlandı.' };
    } catch (err: any) {
      // FAZ 12: Doğrulanmayan XML "geçerli" sayılmaz — gerçek hata döndürülür
      console.warn('[HIZLI_CONNECT] ControlDocumentXML hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, isValid: false, message: `XML doğrulama başarısız: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** GetLastInvoiceIdAndDate: Belirli seri için son fatura numarası ve tarihi */
  public static async getLastInvoiceIdAndDate(appType: number, seri: string, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/RestApi/GetLastInvoiceIdAndDate?AppType=${appType}&Seri=${seri}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      if (res.data?.IsSucceeded !== true) return { success: false, message: res.data?.Message || 'Sağlayıcı son fatura numarasını doğrulamadı.' };
      return { success: true, data: res.data };
    } catch (err: any) {
      // FAZ 12: Uydurma fatura numarası ÜRETİLMEZ — seri numarası çakışması riski
      console.warn('[HIZLI_CONNECT] GetLastInvoiceIdAndDate hatası:', err?.response?.data?.Message || err?.message);
      return { success: false, message: `Son fatura numarası alınamadı: ${err?.response?.data?.Message || err.message}` };
    }
  }

  /** SetDocumentFlag: Belgeye özel bayrak (flag) yaz */
  public static async setDocumentFlag(appType: number, uuid: string, flagName: string, flagValue: number, token: string, isTest: boolean = false) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(
        `${baseUrl}/HizliApi/RestApi/SetDocumentFlag?AppType=${appType}&Uuid=${uuid}&Flag_Name=${encodeURIComponent(flagName)}&Flag_Value=${flagValue}`,
        { headers: { 'Authorization': `Bearer ${token}` }, timeout: 15000 }
      );
      return { success: true, data: res.data, message: 'Belge bayrağı güncellendi.' };
    } catch (err: any) {
      // FAZ 12: Sahte bayrak-onayı ÜRETİLMEZ
      console.warn('[HIZLI_CONNECT] SetDocumentFlag hatası:', err?.response?.data?.Message || err?.message);
      return {
        success: false,
        error: err?.response?.status,
        message: `Belge bayrağı güncellenemedi: ${err?.response?.data?.Message || err.message}`,
      };
    }
  }

  // ==========================================
  // 20. PROVIDER WRAPPER METODLARI (FAZ 13)
  // hizliTeknolojiProvider'ın çağırdığı, ранее tanımlı olmayan metodlar.
  // Gerçek API yanıtı döndürür — sahte/simüle yanıt ÜRETİLMEZ.
  // ==========================================

  /**
   * Aktif token döndürür; yoksa / süresi geçmişse env credential'ları ile yeniler.
   */
  private static async ensureToken(isTest: boolean): Promise<string> {
    if (tokenStore.token && tokenStore.expireDate && new Date(tokenStore.expireDate).getTime() > Date.now() && tokenStore.isTestMode === isTest) {
      return tokenStore.token;
    }
    const init = await this.authenticate(isTest);
    if (!init.success || !tokenStore.token) {
      throw new Error(init.message || 'Hızlı Teknoloji kimlik doğrulaması yapılamadı.');
    }
    return tokenStore.token;
  }

  /**
   * authenticate: UtilEncrypt → Login → tokenStore. Provider testConnection için kullanır.
   */
  public static async authenticate(isTest: boolean = true): Promise<{ success: boolean; message: string }> {
    const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY || '';
    const username  = process.env.HIZLI_BILISIM_WS_USERNAME || '';
    const password  = process.env.HIZLI_BILISIM_WS_PASSWORD || '';
    const apiKey    = process.env.HIZLI_BILISIM_API_KEY || '';

    if (!secretKey || !username || !password || !apiKey) {
      return { success: false, message: 'HIZLI_BILISIM_* ortam değişkenleri eksik — .env dosyasını kontrol edin.' };
    }

    const enc = await this.utilEncrypt(secretKey, username, password, isTest);
    if (!enc.success || !enc.hashedUsername || !enc.hashedPassword) {
      return { success: false, message: enc.message || 'UtilEncrypt başarısız.' };
    }

    tokenStore.hashedUsername = enc.hashedUsername;
    tokenStore.hashedPassword = enc.hashedPassword;
    tokenStore.isTestMode = isTest;

    const login = await this.login(apiKey, enc.hashedUsername, enc.hashedPassword, isTest);
    if (!login.success || !login.token) {
      return { success: false, message: login.message };
    }

    tokenStore.token = login.token;
    tokenStore.expireDate = login.expireDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    tokenStore.lastInitAt = new Date().toISOString();
    return { success: true, message: login.message };
  }

  /**
   * sendInvoice: High-level fatura gönderimi
   */
  public static async sendInvoice(invoice: any, customer: any, company: any, config?: any, token?: string): Promise<any> {
    try {
      const settings = config?.tenantSettings;
      if (!settings || settings.tenantId !== invoice?.tenantId || settings.senderIdentifier !== company?.taxNumber) {
        throw new Error('Gönderim için faturanın firmasına ait entegratör ayarı gereklidir.');
      }
      if (invoice.status === 'CANCELLED' || ['SENT', 'DELIVERED', 'ACCEPTED'].includes(invoice.eInvoiceStatus)) {
        throw new Error('İptal edilmiş veya gönderilmiş fatura tekrar gönderilemez.');
      }
      const model = invoice.hizliModel;
      if (!model?.invoiceheader || !model.customer || !Array.isArray(model.invoiceLines) || !model.invoiceLines.length) {
        throw new Error('Sağlayıcıya uygun kayıtlı fatura modeli bulunamadı.');
      }
      if (model.supplier?.supplierParty?.IdentificationID !== settings.senderIdentifier ||
          model.customer.IdentificationID !== (customer?.taxNumber || (!invoice.customerId ? invoice.customerCode : undefined))) {
        throw new Error('Fatura modelindeki gönderici veya alıcı vergi numarası kayıtla uyuşmuyor.');
      }
      const prefix = settings.defaultInvoicePrefix;
      if (!/^[A-Z][A-Z0-9]{2}$/.test(prefix || '')) throw new Error('Firmanın fatura serisi seçilmemiş.');
      if (model.invoiceheader.Prefix && model.invoiceheader.Prefix !== prefix) throw new Error('Taslak serisi firma serisinden farklı; taslağı kontrol edin.');
      const payload = structuredClone(model);
      payload.invoiceheader.Prefix = prefix;
      payload.invoiceheader.SourceUrn = settings.senderAliasGB;
      const isTest = settings.environment !== 'PRODUCTION';
      const { ensureTenantToken } = await import('./hizliTenantCredentialRegistry');
      const active = await ensureTenantToken(settings, isTest);
      const appType = payload.invoiceheader.ProfileID === 'EARSIVFATURA' ? 2 : 1;

      // ──────────────────────────────────────────────────────────────────
      // 2026-09-25 (canlı gönderim kusuru — "Belge No Zorunludur!"):
      // "Otomatik" bir ARAYÜZ etiketidir, resmî belge numarası DEĞİLDİR.
      // Önceden bu alan `null` yapılıp gönderiliyordu; sağlayıcı belge
      // numarasını ZORUNLU tuttuğu için gönderim daha doğrulama aşamasında
      // reddediliyordu ("Fatura Belge No Zorunludur! Gönderim İşlemi
      // Durduruldu!").
      //
      // Numara UYDURULMAZ: sağlayıcının kendi sırasından okunur
      // (`GetLastInvoiceIdAndDate` → `NextDocumentId`). Seri, yıl içerir
      // (ör. "BTF" öneki için "BTF2026"); yıl faturanın düzenlenme
      // tarihinden alınır ki dönem sınırında yanlış seriye düşülmesin.
      //
      // Numara ALINAMAZSA gönderim YAPILMAZ: sıra dışı bir numara üretmek
      // GİB'de numara çakışması/kaçak belge demektir.
      // ──────────────────────────────────────────────────────────────────
      const mevcutBelgeNo = payload.invoiceheader.Invoice_ID;
      if (!mevcutBelgeNo || mevcutBelgeNo === 'Otomatik') {
        const issueDate = new Date(payload.invoiceheader.IssueDate);
        const yil = String(!Number.isNaN(issueDate.getTime()) ? issueDate.getFullYear() : new Date().getFullYear());
        const seri = `${prefix}${yil}`;
        const sonBelge = await this.getLastInvoiceIdAndDate(appType, seri, active.token, isTest);
        const yeniBelgeNo = sonBelge.success ? sonBelge.data?.NextDocumentId : undefined;
        if (typeof yeniBelgeNo !== 'string' || !yeniBelgeNo.trim()) {
          throw new Error(
            `Belge numarası sağlayıcıdan alınamadı (seri: ${seri}); gönderim yapılmadı. ` +
            `${sonBelge.message || 'Sağlayıcı sıradaki belge numarasını döndürmedi.'}`
          );
        }
        payload.invoiceheader.Invoice_ID = yeniBelgeNo.trim();
      }

      const result = await this.sendInvoiceModel([{
        AppType: appType,
        SourceUrn: settings.senderAliasGB,
        DestinationIdentifier: payload.customer.IdentificationID,
        DestinationUrn: payload.invoiceheader.DestinationUrn,
        InvoiceModel: payload,
        LocalId: invoice.id,
        UpdateDocument: false,
        IsDraft: false,
        IsDraftSend: false,
        IsPreview: false,
        IsXml: false,
      }], active.token, isTest);
      // This is the UUID supplied in the accepted document, not a fabricated provider ID.
      return { ...result, uuid: result.success ? payload.invoiceheader.UUID : undefined };
    } catch (err: any) {
      return { success: false, message: err.message, invoiceNumber: invoice?.invoiceNo, uuid: invoice?.eInvoiceUUID };
    }
  }

  /**
   * sendEInvoice: UBL-TR XML e-Fatura gönderimi (SendDocument endpoint).
   * Gerçek API yanıtı döndürülür — hata durumunda success:false.
   */
  public static async sendEInvoice(xmlContent: string, isTest: boolean = true) {
    try {
      const token = await this.ensureToken(isTest);
      return await this.sendDocument([{ xmlContent }], token, isTest);
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * sendEArsiv: UBL-TR XML e-Arşiv gönderimi (SendDocument endpoint).
   */
  public static async sendEArsiv(xmlContent: string, isTest: boolean = true) {
    try {
      const token = await this.ensureToken(isTest);
      return await this.sendDocument([{ xmlContent }], token, isTest);
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * sendEIrsaliye: UBL-TR XML e-İrsaliye gönderimi (SendDocument endpoint).
   */
  public static async sendEIrsaliye(xmlContent: string, isTest: boolean = true) {
    try {
      const token = await this.ensureToken(isTest);
      return await this.sendDocument([{ xmlContent }], token, isTest);
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * getInvoiceStatus: UUID ile belge durumu sorgusu (GetDocumentListGUID endpoint).
   * Gerçek response alanları aynen döndürülür — tahmin yapılmaz.
   */
  public static async getInvoiceStatus(uuid: string, isTest: boolean = true) {
    try {
      const token = await this.ensureToken(isTest);
      const res = await this.getDocumentListByGUID([uuid], 1, token, isTest);
      if (res.success && res.data) {
        const docs = res.data.documents || res.data || [];
        // 2026-09-17 (`docs/50` S-G4): `docs[0]` körü körüne alınmıyordu — ölçüm
        // gösterdi ki uç `guids` filtresini uygulamayabiliyor (istenen kimlik
        // 8/8 sorguda dönmedi). Dönen listede İSTENEN UUID aranır; yoksa boş
        // sonuç dönülür — ilgisiz belgenin durumu bu belgenin durumu sanılmaz.
        // Çağıranlar (`efatura.ts` batch-status-sync, provider) boş sonucu
        // "atla/UNKNOWN" diye işler.
        const liste = Array.isArray(docs) ? docs : [docs];
        const doc = liste.find(
          (d: any) => d && (d.UUID === uuid || d.uuid === uuid || d.Id === uuid || d.id === uuid)
        );
        if (!doc) {
          return {
            status: '',
            gibStatus: '',
            message: 'Entegratör bu UUID için durum kaydı döndürmedi.',
            raw: res.data,
          };
        }
        return {
          status: doc?.statusDescription || doc?.status || '',
          gibStatus: doc?.statusCode !== undefined ? String(doc.statusCode) : '',
          message: doc?.statusDescription || doc?.description || 'Belge durumu alındı.',
          raw: doc,
        };
      }
      return { status: '', gibStatus: '', message: res.message || 'Belge durumu alınamadı.', raw: res.data };
    } catch (err: any) {
      return { status: '', gibStatus: '', message: err.message };
    }
  }

  /**
   * getIncomingInvoices: Gelen e-Fatura listesi (GetDocumentReceiverAllList endpoint).
   * Gerçek API listesi döndürülür — demo veri ÜRETİLMEZ.
   */
  public static async getIncomingInvoices(startDate: string, isTest: boolean = true) {
    try {
      const token = await this.ensureToken(isTest);
      const endDate = new Date().toISOString();
      const res = await this.getDocumentReceiverAllList({ dateType: 'CreateDate', startDate, endDate }, token, isTest);
      const documents = res.data?.documents || res.data || [];
      return { success: true, invoices: Array.isArray(documents) ? documents : [] };
    } catch (err: any) {
      return { success: false, invoices: [], message: err.message };
    }
  }
}
