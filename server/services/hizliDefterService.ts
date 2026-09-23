import axios from 'axios';

export class HizliDefterService {
  private static getBaseUrl(isTest: boolean = true): string {
    return isTest
      ? 'https://econnecttest.hizliteknoloji.com.tr'
      : 'https://econnect.hizliteknoloji.com.tr';
  }

  /**
   * 2026-09-12 (uydurma temizliği): Bu servisteki TÜM `catch` blokları daha önce
   * `success: true` döndürüp sabit/şablon veri üretiyordu (ör. activeProcesses
   * listesi, 1420 yevmiye no, ONAYLANDI beratlar). Yani Hızlı Bilişim'e
   * ulaşılamadığında panel gerçek bir e-Defter durumu gösteriyordu. Bu,
   * CLAUDE.md md.1'deki "API hatasında asla sahte/simüle başarılı response
   * üretilmez; gerçek hata döndürülür" kuralının ihlaliydi. Artık hata
   * durumunda `success: false` ve `data: null` döner; sabit veri ÜRETİLMEZ.
   */
  private static errMessage(err: any): string {
    // 2026-09-13 (sızıntı hijyeni): Önceden hata gövdesinin TAMAMI
    // (`JSON.stringify(err.response.data)`) istemciye `message` olarak
    // döndürülüyordu. Entegratör hata gövdeleri istek bağlamını (ve beklenmedik
    // hâllerde kimlik alanlarını) yansıtabilir; istemciye yalnız API'nin İŞ
    // mesajı verilir, ham gövde asla.
    const d = err?.response?.data;
    const apiMsg =
      typeof d === 'string' ? d : (d?.Message || d?.message || d?.error || null);
    return apiMsg || err?.message || 'Bilinmeyen hata';
  }

  /**
   * ProcessCreate: Yeni e-Defter oluşturma sürecini başlatır
   */
  public static async processCreate(eLedgerLoadInput: any, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/HizliDefter/ProcessCreate`, eLedgerLoadInput, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { success: true, data: res.data, message: 'e-Defter oluşturma süreci başlatıldı.' };
    } catch (err: any) {
      return { success: false, data: null, message: this.errMessage(err) };
    }
  }

  /**
   * ProcessReadActive: Aktif devam eden e-Defter süreçlerini okur
   */
  public static async processReadActive(token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/HizliDefter/ProcessReadActive`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, data: null, message: this.errMessage(err) };
    }
  }

  /**
   * Process7010: Yevmiye ve Kebir parçalama ve kontrol adımı
   */
  public static async process7010(process7010Input: any, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/HizliDefter/Process7010`, process7010Input, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { success: true, data: res.data, message: 'Defter dosyaları parçalandı ve kontrol edildi.' };
    } catch (err: any) {
      return { success: false, data: null, message: this.errMessage(err) };
    }
  }

  /**
   * Process7030 / Process7030ReadUnsigned: İmzalanacak Beratları Oku & İmzalı Berat Yükle
   */
  public static async process7030ReadUnsigned(processId: string, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/HizliDefter/Process7030ReadUnsigned?processId=${processId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 20000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, data: null, message: this.errMessage(err) };
    }
  }

  /**
   * eDefterRead: Yıla ait defterleri getir
   */
  public static async eDefterRead(year: number, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/HizliDefter/eDefterRead?year=${year}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 20000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, data: null, message: this.errMessage(err) };
    }
  }

  /**
   * ReadEDefterSequence: Defter ve Berat Sıra Numaralarını Oku
   */
  public static async readEDefterSequence(token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.get(`${baseUrl}/HizliApi/HizliDefter/ReadEDefterSequence`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, data: null, message: this.errMessage(err) };
    }
  }

  /**
   * ProcessCreateInventory: Envanter Defteri Süreci Başlat
   */
  public static async processCreateInventory(input: any, token: string, isTest: boolean = true) {
    const baseUrl = this.getBaseUrl(isTest);
    try {
      const res = await axios.post(`${baseUrl}/HizliApi/HizliDefter/ProcessCreateInventory`, input, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { success: true, data: res.data, message: 'Envanter defteri süreci oluşturuldu.' };
    } catch (err: any) {
      return { success: false, data: null, message: this.errMessage(err) };
    }
  }
}
