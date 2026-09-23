import axios from 'axios';
import { storage } from '../../db/storage';

export interface RemoteHizliCustomer {
  externalId: string;
  companyName: string;
  title: string;
  taxNumber: string;
  taxOffice: string;
  contactName: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  district?: string;
  registeredAt?: string;
  isActive?: boolean;
  customerType?: string;
  dealerName?: string;
  pkEtiket?: string;
  gbEtiket?: string;
  sozlesmeDurumu?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HIZLI BİLİŞİM RESMİ REST API ENTEGRASYON CLIENT'I
// Flow: UtilEncrypt (SecretKey) -> Login (ApiKey) -> Bearer Token (JWT 1 Gün)
// Token süresi: satıcı teyidi 2026-09-09 (docs/21) — 24 saat, yenileme = tekrar Login
// ─────────────────────────────────────────────────────────────────────────────

export class HizliBilisimClient {
  private static cachedToken: string | null = null;
  private static tokenExpiresAt: number = 0;

  // ───────────────────────────────────────────────────────────────────────────
  // KALDIRILDI (2026-09-12): `KNOWN_CUSTOMER_VKNS` sabit VKN listesi.
  //
  // Neden kaldırıldı: `fetchRemoteCustomers()` bu 14 gerçek mükellef VKN'ini
  // döngüye sokup sonucu "N adet müşteri Hızlı Bilişim resmi API üzerinden
  // CANLI çekildi" diye raporluyordu. Oysa liste koddan geliyordu — API'de
  // "tüm mükellefleri listele" uç noktası YOK (satıcı Swagger'ı, 2026-09-12
  // doğrulaması: eConnect'te MusteriGetir/MukellefBilgisiSorgulama var, liste
  // ucu yok). Bu, CLAUDE.md'deki "API response'u uydurma / simüle etme"
  // yasağının ihlaliydi. Sabit liste ayrıca gerçek müşteri VKN'lerini kaynak
  // koda gömüyordu (PII + bakım yükü).
  //
  // Yerine ne geldi: tek mükellef sorgusu (`fetchCustomerByVkn`) gerçek API
  // çağrısı olarak korunuyor. Toplu liste gerektiğinde VKN'ler ÇAĞIRANDAN
  // parametre olarak alınır — uydurma bir "hepsini getir" yoktur.
  // ───────────────────────────────────────────────────────────────────────────

  public static getConfig() {
    // FAZ 17: Credential'lar sadece .env'den okunur — hardcode fallback kaldırıldı
    const apiUrl = process.env.HIZLI_BILISIM_API_URL;
    const apiKey = process.env.HIZLI_BILISIM_API_KEY;
    const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY;
    const wsUsername = process.env.HIZLI_BILISIM_WS_USERNAME;
    const wsPassword = process.env.HIZLI_BILISIM_WS_PASSWORD;

    if (!apiUrl || !apiKey || !secretKey || !wsUsername || !wsPassword) {
      throw new Error(
        '[HızlıBilişim] Eksik yapılandırma: HIZLI_BILISIM_API_URL, HIZLI_BILISIM_API_KEY, ' +
        'HIZLI_BILISIM_SECRET_KEY, HIZLI_BILISIM_WS_USERNAME, HIZLI_BILISIM_WS_PASSWORD ' +
        'ortam değişkenleri .env dosyasında tanımlı olmalıdır.'
      );
    }

    return {
      apiUrl,
      apiKey,
      secretKey,
      wsUsername,
      wsPassword,
      timeout: Number(process.env.HIZLI_BILISIM_TIMEOUT) || 30000,
      isTestMode: process.env.HIZLI_BILISIM_IS_TEST_MODE === 'true',
    };
  }

  /**
   * 1. Hızlı Bilişim UtilEncrypt + Login ile Bearer Token Alımı
   */
  public static async getAuthToken(): Promise<{
    token: string | null;
    customerInfo?: any;
    error?: string;
  }> {
    const now = Date.now();
    if (this.cachedToken && this.tokenExpiresAt > now) {
      return { token: this.cachedToken };
    }

    const config = this.getConfig();

    try {
      // Adım 1: UtilEncrypt
      const encResponse = await axios.post(
        `${config.apiUrl}/HizliApi/RestApi/UtilEncrypt`,
        {
          secretKey: config.secretKey,
          username: config.wsUsername,
          password: config.wsPassword,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: config.timeout,
        }
      );

      const encData = encResponse.data;
      // FAZ 25.3 #8 (docs/16 H.2): UtilEncrypt yanıtı hashed kimlik bilgileri içerir —
      // tam yanıtı log'lamak canlı credential sızıntısıdır.
      // 2026-09-12: başarı durumu console.log ile de yazılmaz (CLAUDE.md: console.log yasak).
      // Bilgi zaten dönüş değerinde taşınıyor; çağıran log'lamak isterse console.warn kullanır.

      if (!encData?.username || !encData?.password) {
        return {
          token: null,
          error: encData?.Message || 'UtilEncrypt kimlik şifreleme başarısız oldu.',
        };
      }

      // Adım 2: Login
      const loginResponse = await axios.post(
        `${config.apiUrl}/HizliApi/RestApi/Login`,
        {
          apiKey: config.apiKey,
          username: encData.username,
          password: encData.password,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: config.timeout,
        }
      );

      const rawLoginData = loginResponse.data;
      const loginData = Array.isArray(rawLoginData) ? rawLoginData[0] : rawLoginData;

      if (!loginData?.IsSucceeded || !loginData?.Token) {
        return {
          token: null,
          error: loginData?.Message || 'Hızlı Bilişim web servis oturumu açılamadı.',
        };
      }

      this.cachedToken = loginData.Token;
      // Satıcı teyidi (docs/21): token 1 gün geçerli. Cache, tam TTL'e yakın tutulur;
      // süresi bitmeden küçük bir tampon bırakılır (yenileme = tekrar Login, UtilEncrypt tekrar edilmez).
      this.tokenExpiresAt = now + 20 * 60 * 60 * 1000;

      return {
        token: loginData.Token,
        customerInfo: loginData,
      };
    } catch (err: any) {
      return {
        token: null,
        error: `Hızlı Bilişim Kimlik Doğrulama Hatası: ${err.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * 1b. Özel firma/mükellef kullanıcı adı ve şifresi ile UtilEncrypt + Login çalıştırma
   */
  public static async authenticateWithCredentials(wsUsername: string, wsPassword: string): Promise<{
    success: boolean;
    token: string | null;
    expiresAt?: string;
    customerInfo?: any;
    error?: string;
  }> {
    const config = this.getConfig();
    try {
      // 1. UtilEncrypt
      const encResponse = await axios.post(
        `${config.apiUrl}/HizliApi/RestApi/UtilEncrypt`,
        {
          secretKey: config.secretKey,
          username: wsUsername,
          password: wsPassword,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: config.timeout,
        }
      );

      const encData = encResponse.data;
      if (!encData?.username || !encData?.password) {
        return {
          success: false,
          token: null,
          error: encData?.Message || 'UtilEncrypt kimlik şifreleme başarısız oldu.',
        };
      }

      // 2. Login
      const loginResponse = await axios.post(
        `${config.apiUrl}/HizliApi/RestApi/Login`,
        {
          apiKey: config.apiKey,
          username: encData.username,
          password: encData.password,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: config.timeout,
        }
      );

      const rawLoginData = loginResponse.data;
      const loginData = Array.isArray(rawLoginData) ? rawLoginData[0] : rawLoginData;

      if (!loginData?.IsSucceeded || !loginData?.Token) {
        return {
          success: false,
          token: null,
          error: loginData?.Message || 'Hızlı Bilişim web servis oturumu açılamadı (Kullanıcı adı veya şifre hatalı).',
        };
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      return {
        success: true,
        token: loginData.Token,
        expiresAt,
        customerInfo: loginData,
      };
    } catch (err: any) {
      return {
        success: false,
        token: null,
        error: `Hızlı Bilişim Bağlantı Hatası: ${err.response?.data?.Message || err.message}`,
      };
    }
  }

  /**
   * 2. Bağlantı Testi (Test Connection)
   *
   * 2026-09-12 uydurma temizliği: Önceki sürüm auth başarılı olduğu anda
   * `customerServiceAvailable: true` döndürüyor ve `totalRemoteCount` olarak
   * SABİT VKN listesinin uzunluğunu veriyordu. İkisi de ölçüm değildi:
   * mükellef sorgu servisinin çalıştığı hiç denenmemiş, "toplam uzak kayıt"
   * ise API'den değil koddan geliyordu. Artık yalnız gerçekten ölçülen şey
   * raporlanır: sunucuya erişim + kimlik doğrulama. Mükellef servisinin
   * durumu AYRICA ölçülmelidir (bkz. probeCustomerService) — varsayılmaz.
   */
  public static async testConnection(): Promise<{
    success: boolean;
    serverReachable: boolean;
    authSuccess: boolean;
    customerServiceAvailable: boolean | null;
    message: string;
    latencyMs: number;
    customerInfo?: any;
  }> {
    const start = Date.now();
    const auth = await this.getAuthToken();
    const latencyMs = Date.now() - start;

    if (!auth.token) {
      return {
        success: false,
        serverReachable: false,
        authSuccess: false,
        customerServiceAvailable: null,
        message: auth.error || 'Bağlantı kurulamadı.',
        latencyMs,
      };
    }

    const firma = [auth.customerInfo?.MusteriAdi, auth.customerInfo?.VknTckn]
      .filter(Boolean)
      .join(' ');
    return {
      success: true,
      serverReachable: true,
      authSuccess: true,
      // Ölçülmedi: test yalnız erişim + kimlik doğrulamayı kapsar.
      customerServiceAvailable: null,
      message: `Hızlı Bilişim API bağlantısı kuruldu${firma ? `. Mükellef: ${firma}` : ''}.`,
      latencyMs,
      customerInfo: auth.customerInfo,
    };
  }

  /**
   * 2b. Mükellef sorgu servisinin gerçekten çalışıp çalışmadığını ÖLÇER.
   *
   * Varsayım yerine tek gerçek sorgu yapılır: verilen VKN/TCKN için
   * `fetchCustomerByVkn` çağrılır ve dönen sonuç raporlanır. Kayıt bulunamazsa
   * bu bir servis arızası DEĞİLDİR (mükellef gerçekten yok olabilir) — bu
   * yüzden `reachable: true, found: false` döner; yalnız ağ/auth hatası
   * `reachable: false` üretir.
   */
  public static async probeCustomerService(vknTckn: string): Promise<{
    reachable: boolean;
    found: boolean;
    message: string;
  }> {
    const auth = await this.getAuthToken();
    if (!auth.token) {
      return { reachable: false, found: false, message: auth.error || 'Oturum açılamadı.' };
    }
    try {
      const customer = await this.fetchCustomerByVkn(vknTckn);
      return {
        reachable: true,
        found: !!customer,
        message: customer
          ? `Mükellef sorgusu çalışıyor (${vknTckn}).`
          : `Mükellef sorgusu çalışıyor ancak ${vknTckn} için kayıt dönmedi.`,
      };
    } catch (err: any) {
      return { reachable: false, found: false, message: `Mükellef sorgusu başarısız: ${err.message}` };
    }
  }

  /**
   * 3. Tekil Müşteri Bilgisini Canlı API'den Çek (MusteriGetir + MukellefBilgisi)
   */
  public static async fetchCustomerByVkn(vknTckn: string): Promise<RemoteHizliCustomer | null> {
    const auth = await this.getAuthToken();
    if (!auth.token) return null;

    const config = this.getConfig();
    const headers = {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    };

    try {
      // 1. MusteriGetir API çağrısı
      const mgRes = await axios.get(
        `${config.apiUrl}/HizliApi/RestApi/MusteriGetir?vergikimlikno=${vknTckn}`,
        { headers, timeout: config.timeout }
      );

      const m = mgRes.data?.musteri;
      if (m && (m.unvan || m.vknTckn)) {
        const sube = m.subeListesi?.[0] || {};
        const contact = `${m.kaydedenAd || ''} ${m.kaydedenSoyad || ''}`.trim() || m.yetkiliKisi || m.unvan || 'Yetkili';

        let pkEtiket = sube.efaturaPkEtiket || '';
        let gbEtiket = sube.efaturaGbEtiket || '';
        if (!pkEtiket && m.etiketListesi?.length > 0) {
          const pk = m.etiketListesi.find((e: any) => e.etiketTuru === 1);
          const gb = m.etiketListesi.find((e: any) => e.etiketTuru === 0);
          if (pk?.etiket) pkEtiket = pk.etiket;
          if (gb?.etiket) gbEtiket = gb.etiket;
        }

        const address = sube.caddeAdi || sube.adres || `${sube.mahalle || ''} ${sube.cadde || ''}`.trim();
        // 2026-09-12: Şehir/il için sabit 'ADANA' fallback'i kaldırıldı — API veri
        // döndürmediyse uydurma il yazmak yanlış adres bilgisi üretir. Boş bırakılır.
        const city = sube.sehirAdi || m.vergiDairesiIl || '';
        const district = sube.ilceAdi || '';
        const email = sube.eposta || m.kurumsalEposta || '';
        const phone = sube.telefon || m.kaydedenTel || '';

        // `isActive`: m.AktifPasif alanı yoksa `?? true` ile "aktif" varsaymak
        // (önceki davranış) API'nin söylemediği bir durumu uyduruyordu. Alan
        // yoksa undefined kalır — "bilinmiyor" demektir.
        // `dealerName` / `sozlesmeDurumu`: her mükellefe sabit bayi adı ve
        // "İmzalandı" sözleşme durumu yazan hardcode kaldırıldı; API bu alanları
        // sağlamıyorsa boş bırakılır.
        return {
          externalId: `HB-${vknTckn}`,
          companyName: m.unvan || `Firma (${vknTckn})`,
          title: m.unvan || `Firma (${vknTckn})`,
          taxNumber: vknTckn,
          taxOffice: m.vergiDairesi || '',
          contactName: contact,
          phone: phone,
          email: email,
          address: address,
          city: city,
          district: district,
          // Sözleşme başlangıcı yoksa `new Date()` yazmak kayıt tarihini
          // "şimdi" gibi gösterirdi — bilinmiyorsa alan boş bırakılır.
          registeredAt: m.sozlesmeListesi?.[0]?.sozlesmeBaslangicTarihi
            ? new Date(m.sozlesmeListesi[0].sozlesmeBaslangicTarihi.replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$2-$1')).toISOString()
            : undefined,
          isActive: typeof m.AktifPasif === 'boolean' ? m.AktifPasif : undefined,
          customerType: m.BayiMi ? 'Bayi' : 'Müşteri',
          pkEtiket,
          gbEtiket,
        };
      }

      // 2. Mükellef Bilgisi Sorgulama Fallback (VKN veya TCKN)
      const isTckn = vknTckn.length === 11;
      const mbPayload = isTckn
        ? { Tckn: vknTckn }
        : { Vkn: vknTckn };

      const mbRes = await axios.post(
        `${config.apiUrl}/HizliApi/RestApi/MukellefBilgisiSorgulama`,
        { ...mbPayload, VknTckn: vknTckn },
        { headers, timeout: config.timeout }
      );

      const muk = mbRes.data?.mukellef;
      if (muk && (muk.unvan || muk.kimlikUnvani || muk.ad)) {
        const unvan = muk.unvan || muk.kimlikUnvani || `${muk.ad} ${muk.soyad}`.trim();
        const adresInfo = muk.adresBilgileri?.[0] || {};
        const address = `${adresInfo.mahalleSemt || ''} ${adresInfo.caddeSokak || ''} ${adresInfo.disKapiNo || ''}`.trim();

        // `faalTerkDurumu === '1'` alanı "faaliyet terk durumu"dur; '1' değeri
        // terk EDİLMİŞ anlamına gelir, aktif değil. Önceki kod bunu `isActive`
        // olarak true'ya çeviriyordu — anlam tersine dönmüştü. Alanın kesin
        // kodlaması doğrulanmadığı için artık yorum yapılmaz: bilinmiyorsa boş.
        return {
          externalId: `HB-${vknTckn}`,
          companyName: unvan,
          title: unvan,
          taxNumber: vknTckn,
          taxOffice: muk.vergiDairesiAdi || '',
          contactName: `${muk.ad || ''} ${muk.soyad || ''}`.trim() || unvan,
          phone: '',
          email: '',
          address: address,
          city: adresInfo.ilAdi || '',
          district: adresInfo.ilceAdi || '',
          registeredAt: muk.iseBaslamaTarihi
            ? `${muk.iseBaslamaTarihi.slice(0,4)}-${muk.iseBaslamaTarihi.slice(4,6)}-${muk.iseBaslamaTarihi.slice(6,8)}T00:00:00.000Z`
            : undefined,
          isActive: undefined,
          customerType: isTckn ? 'Şahıs Firması' : 'Tüzel Şirket',
        };
      }
    } catch (err: any) {
      console.warn(`[HizliBilisim] VKN (${vknTckn}) sorgu uyarısı:`, err.message);
    }

    return null;
  }

  /**
   * 4. Müşteri Listesi (VERİLEN VKN'ler için, gerçek API çağrısıyla)
   *
   * 2026-09-12: Bu metod eskiden parametresizdi ve SABİT `KNOWN_CUSTOMER_VKNS`
   * listesini döngüye sokuyordu; sonucu "N adet müşteri ... canlı çekildi" diye
   * raporluyordu. Liste kaynak koddan geldiği için bu bir uydurmaydı.
   *
   * Hızlı Bilişim eConnect API'sinde "tüm mükellefleri listele" uç noktası YOK
   * (MusteriGetir / MukellefBilgisiSorgulama tekil VKN sorgular; liste ucu
   * Swagger'da mevcut değil — 2026-09-12 doğrulaması). Bu yüzden toplu çekim
   * ancak çağıranın verdiği VKN listesiyle yapılabilir. VKN verilmezse
   * uydurma bir liste üretilmez; açık hata döner.
   */
  public static async fetchRemoteCustomers(vknTcknList: string[] = []): Promise<{
    success: boolean;
    customers: RemoteHizliCustomer[];
    message: string;
    source: 'API' | 'NONE';
  }> {
    const auth = await this.getAuthToken();
    if (!auth.token) {
      return {
        success: false,
        customers: [],
        message: auth.error || 'Hızlı Bilişim API oturumu açılamadı.',
        source: 'NONE',
      };
    }

    if (!Array.isArray(vknTcknList) || vknTcknList.length === 0) {
      return {
        success: false,
        customers: [],
        message:
          'Hızlı Bilişim eConnect API\'sinde "tüm mükellefleri listele" uç noktası bulunmuyor. ' +
          'Toplu çekim için sorgulanacak VKN/TCKN listesi gerekir.',
        source: 'NONE',
      };
    }

    const fetchedCustomers: RemoteHizliCustomer[] = [];
    const failed: string[] = [];

    for (const vkn of vknTcknList) {
      try {
        const customer = await this.fetchCustomerByVkn(vkn);
        if (customer) fetchedCustomers.push(customer);
        else failed.push(vkn);
      } catch (err: any) {
        failed.push(vkn);
        console.warn(`[HizliBilisim] Müşteri getirme hatası (${vkn}):`, err.message);
      }
    }

    if (fetchedCustomers.length === 0) {
      return {
        success: false,
        customers: [],
        message: `${vknTcknList.length} VKN sorgulandı, hiçbiri için kayıt dönmedi.`,
        source: 'NONE',
      };
    }

    return {
      success: true,
      customers: fetchedCustomers,
      message:
        `${vknTcknList.length} VKN sorgulandı: ${fetchedCustomers.length} kayıt alındı` +
        (failed.length ? `, ${failed.length} kayıt dönmedi.` : '.'),
      source: 'API',
    };
  }
}
