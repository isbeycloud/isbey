import { storage } from '../../db/storage';
import { HizliBilisimClient, RemoteHizliCustomer } from './hizliBilisimClient';
import { ExternalCustomer } from '../../db/schema';
import { validateTaxId, normalizeTaxId } from './taxIdValidation';

/** Uzak mükellef kaydını havuz kaydına çevirir (id deterministik: VKN). */
function uzaktanHavuza(remote: RemoteHizliCustomer, mevcut?: ExternalCustomer): ExternalCustomer {
  return {
    ...(mevcut || {}),
    id: mevcut?.id || `hbc-${remote.taxNumber}`,
    externalId: remote.externalId,
    provider: 'HIZLI_BILISIM',
    companyName: remote.companyName,
    title: remote.title,
    taxNumber: remote.taxNumber,
    taxOffice: remote.taxOffice,
    contactName: remote.contactName,
    phone: remote.phone,
    email: remote.email,
    address: remote.address,
    city: remote.city,
    district: remote.district,
    status: mevcut?.status || 'NEW',
    registeredAt: mevcut?.registeredAt || remote.registeredAt || new Date().toISOString(),
    syncedAt: new Date().toISOString(),
  };
}

export class HizliBilisimSyncService {
  /**
   * 2026-10-01 — İLK KURULUMDA "0 KAYIT" ÇIKMAZI.
   *
   * ÖNCEKİ DAVRANIŞ: `executeSync` sorgulanacak VKN'leri yalnız
   * `dealerCustomers`'tan (Hızlı Bilişim Bayi ekranının kendi kayıtları) ve
   * istek listesinden alıyordu. Panel sıfır kayıtla açıldığında liste boş
   * kalıyor, uç nokta teknik bir metinle (`eConnect API'sinde "tüm
   * mükellefleri listele" uç noktası bulunmuyor...`) hata dönüyordu. Operatör
   * için bu bir ÇIKMAZDI: sıfırdan ilk kaydı oluşturacak hiçbir yol yoktu ve
   * mesaj entegrasyonun tamamen bozuk olduğu izlenimi veriyordu.
   *
   * KÖK NEDEN: "ilk kaydı VKN ile sorgula" adımı hiç yoktu. Oysa sağlayıcı
   * tam da bunu destekliyor (`MusteriGetir?vergikimlikno=`).
   *
   * BU TURDA EKLENEN: sorgulanacak liste artık üç kaynaktan birleştirilir ve
   * ayrıştırılmış (checked/updated/unchanged/failed) sonuç döner. Teknik
   * sağlayıcı mesajı KULLANICIYA GİTMEZ; log/audit'te kalır.
   */
  public static async hbDenGuncelle(triggeredBy: string = 'admin', ekVknler?: string[]): Promise<{
    success: boolean;
    checked: number;
    updated: number;
    unchanged: number;
    failed: number;
    hatalar: { vkn: string; sinif?: string }[];
    message: string;
    bos: boolean;
  }> {
    const db = storage.getState();

    // Kaynak 1+2: bu kiracının bayi kayıtları ve (varsa) tekilleştirilmiş
    // dış müşteri havuzu. Kaynak 3: istekte açıkça verilen VKN'ler.
    const havuz = new Set<string>();
    for (const d of db.dealerCustomers || []) {
      const t = normalizeTaxId(d.taxNumber);
      if (t) havuz.add(t);
    }
    for (const e of db.externalCustomers || []) {
      const t = normalizeTaxId(e.taxNumber);
      if (t) havuz.add(t);
    }
    for (const v of ekVknler || []) {
      const t = normalizeTaxId(v);
      if (t) havuz.add(t);
    }

    const liste = [...havuz];

    if (liste.length === 0) {
      // Teknik ayrıntı YOK. Operatörün atacağı adım açıkça söylenir.
      const msg = 'Güncellenecek Hızlı Bilişim mükellefi bulunamadı. ' +
        'VKN/TCKN ile ilk mükellefinizi sorgulayıp portföye ekleyebilirsiniz.';
      storage.addSyncLog({
        provider: 'HIZLI_BILISIM', action: 'SYNC_STARTED', username: triggeredBy,
        details: 'HB\'den Güncelle çağrıldı ancak güncellenecek VKN yok (boş portföy).',
        status: 'SUCCESS',
      });
      return { success: true, checked: 0, updated: 0, unchanged: 0, failed: 0, hatalar: [], message: msg, bos: true };
    }

    let updated = 0;
    let unchanged = 0;
    const hatalar: { vkn: string; sinif?: string }[] = [];

    for (const vkn of liste) {
      const sonuc = await HizliBilisimClient.sorgulaMukellef(vkn);
      if (sonuc.durum !== 'BULUNDU' || !sonuc.musteri) {
        hatalar.push({ vkn, sinif: sonuc.durum === 'HATA' ? sonuc.hataSinifi : 'BULUNAMADI' });
        continue;
      }
      const degisti = await this.upsertRemoteCustomer(sonuc.musteri);
      if (degisti) updated++; else unchanged++;
    }

    const checked = liste.length;
    const failed = hatalar.length;
    const msg = `${checked} mükellef kontrol edildi: ${updated} güncellendi, ` +
      `${unchanged} değişiklik yok, ${failed} hata.`;

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM', action: 'CUSTOMER_UPDATED', username: triggeredBy,
      details: msg,
      status: failed > 0 ? 'ERROR' : 'SUCCESS',
    });

    return { success: failed === 0, checked, updated, unchanged, failed, hatalar, message: msg, bos: false };
  }

  /**
   * Tek bir uzak müşteriyi `externalCustomers` havuzuna yazar/günceller.
   * Değişiklik olduysa `true`, aynıysa `false` döner (mutasyon yoksa yazmaz).
   */
  private static async upsertRemoteCustomer(remote: RemoteHizliCustomer): Promise<boolean> {
    let degisti = false;
    await storage.runTransaction(draft => {
      if (!draft.externalCustomers) draft.externalCustomers = [];
      const mevcut = draft.externalCustomers.find(
        c => c.taxNumber === remote.taxNumber || c.externalId === remote.externalId
      );
      if (!mevcut) {
        draft.externalCustomers.push(uzaktanHavuza(remote));
        degisti = true;
        return;
      }
      // Yalnız gerçekten farklı alanlar yazılır — "her turda güncellendi"
      // demek operatörü yanıltırdı.
      const alanlar: (keyof ExternalCustomer & keyof RemoteHizliCustomer)[] = [
        'companyName', 'title', 'taxOffice', 'contactName', 'phone', 'email', 'address', 'city', 'district',
      ];
      for (const alan of alanlar) {
        const yeni = remote[alan];
        if (yeni !== undefined && yeni !== '' && mevcut[alan] !== yeni) {
          (mevcut as any)[alan] = yeni;
          degisti = true;
        }
      }
      mevcut.syncedAt = new Date().toISOString();
    });
    return degisti;
  }

  /**
   * VKN/TCKN ile Hızlı Bilişim'den TEKİL mükellef sorgusu + önizleme.
   * **HİÇBİR ŞEY YAZMAZ** — yalnız sağlayıcıdan okur ve mevcut kaydı işaretler.
   */
  public static async sorgula(hamVkn: string): Promise<{
    success: boolean;
    durum: 'BULUNDU' | 'BULUNAMADI' | 'HATA' | 'GECERSIZ';
    musteri?: ExternalCustomer;
    mevcutKayit?: boolean;
    mevcutId?: string;
    hataSinifi?: string;
    message: string;
  }> {
    const bicim = validateTaxId(hamVkn);
    if (!bicim.ok) {
      return { success: false, durum: 'GECERSIZ', message: bicim.message || 'Geçersiz VKN/TCKN.' };
    }
    const vkn = normalizeTaxId(hamVkn);

    const sonuc = await HizliBilisimClient.sorgulaMukellef(vkn);
    if (sonuc.durum === 'HATA') {
      return {
        success: false,
        durum: 'HATA',
        hataSinifi: sonuc.hataSinifi,
        // Teknik sağlayıcı metni kullanıcıya GİTMEZ; sınıf adı sözlüğe çevrilir.
        message: this.hataMesaji(sonuc.hataSinifi),
      };
    }
    if (sonuc.durum === 'BULUNAMADI' || !sonuc.musteri) {
      return {
        success: false,
        durum: 'BULUNAMADI',
        message: `Hızlı Bilişim'de ${vkn} numaralı mükellef bulunamadı. VKN/TCKN'yi kontrol edin.`,
      };
    }

    const db = storage.getState();
    const mevcut = (db.externalCustomers || []).find(c => c.taxNumber === vkn);
    return {
      success: true,
      durum: 'BULUNDU',
      musteri: uzaktanHavuza(sonuc.musteri),
      mevcutKayit: Boolean(mevcut),
      mevcutId: mevcut?.id,
      message: mevcut
        ? `${vkn} zaten portföyünüzde kayıtlı.`
        : `${vkn} Hızlı Bilişim'de bulundu.`,
    };
  }

  /** Teknik sağlayıcı hatasını operatörün anlayacağı mesaja çevirir. */
  private static hataMesaji(sinif?: string): string {
    switch (sinif) {
      case 'YAPILANDIRMA': return 'Hızlı Bilişim entegrasyon ayarları eksik. Sistem yöneticinizle iletişime geçin.';
      case 'KIMLIK': return 'Hızlı Bilişim oturumu açılamadı. Entegrasyon kimlik bilgilerini kontrol edin.';
      case 'YETKI': return 'Hızlı Bilişim sorgu yetkisi reddedildi. Entegrasyon hesabının yetkisini kontrol edin.';
      case 'HIZ_SINIRI': return 'Hızlı Bilişim istek sınırı aşıldı. Lütfen kısa bir süre sonra tekrar deneyin.';
      case 'SUNUCU': return 'Hızlı Bilişim sunucusu şu anda yanıt vermiyor. Lütfen tekrar deneyin.';
      case 'ZAMAN_ASIMI': return 'Hızlı Bilişim sorgusu zaman aşımına uğradı. Lütfen tekrar deneyin.';
      case 'AG': return 'Hızlı Bilişim\'e ulaşılamadı (ağ). Lütfen bağlantıyı kontrol edin.';
      default: return 'Hızlı Bilişim sorgusu tamamlanamadı. Lütfen tekrar deneyin.';
    }
  }

  /**
   * Onaylanan önizlemeyi İŞBEY portföyüne (`externalCustomers`) ekler.
   * `tenantId` yalnız iz/kaynak ayrımı için yazılır; kayıt platform portföyüdür.
   * Aynı VKN zaten varsa YENİ KAYIT AÇILMAZ (idempotent).
   */
  public static async portfoyeEkle(hamVkn: string, triggeredBy: string, tenantId?: string): Promise<{
    success: boolean;
    durum: 'EKLENDI' | 'MEVCUT' | 'BULUNAMADI' | 'HATA' | 'GECERSIZ';
    customer?: ExternalCustomer;
    message: string;
  }> {
    const bicim = validateTaxId(hamVkn);
    if (!bicim.ok) return { success: false, durum: 'GECERSIZ', message: bicim.message || 'Geçersiz VKN/TCKN.' };
    const vkn = normalizeTaxId(hamVkn);

    const db = storage.getState();
    const mevcutHavuz = (db.externalCustomers || []).find(c => c.taxNumber === vkn);
    if (mevcutHavuz) {
      return { success: true, durum: 'MEVCUT', customer: mevcutHavuz, message: `${vkn} zaten portföyünüzde kayıtlı.` };
    }

    // Sağlayıcıdan TAZE veri çekilir — istemci gövdesindeki alanlar KAYDEDİLMEZ
    // (aksi hâlde kullanıcı unvan/şehir uydurabilirdi).
    const sonuc = await HizliBilisimClient.sorgulaMukellef(vkn);
    if (sonuc.durum === 'HATA') {
      return { success: false, durum: 'HATA', message: this.hataMesaji(sonuc.hataSinifi) };
    }
    if (sonuc.durum !== 'BULUNDU' || !sonuc.musteri) {
      return { success: false, durum: 'BULUNAMADI', message: `Hızlı Bilişim'de ${vkn} bulunamadı.` };
    }
    if ((db.externalCustomers || []).some(c => c.taxNumber === vkn)) {
      // Eşzamanlı ikinci istek yarışı: transaction içinde yeniden kontrol edilir.
      const tekrar = (storage.getState().externalCustomers || []).find(c => c.taxNumber === vkn);
      if (tekrar) return { success: true, durum: 'MEVCUT', customer: tekrar, message: `${vkn} zaten portföyünüzde kayıtlı.` };
    }

    const kayit: ExternalCustomer = {
      ...uzaktanHavuza(sonuc.musteri),
      id: `hbc-${vkn}`,
      status: 'NEW',
    };

    await storage.runTransaction(draft => {
      if (!draft.externalCustomers) draft.externalCustomers = [];
      if (draft.externalCustomers.some(c => c.taxNumber === vkn)) return; // yarış koruması
      draft.externalCustomers.push(kayit);
    });

    storage.addAuditLog({
      tenantId,
      userId: 'system',
      username: triggeredBy,
      action: 'CUSTOMER_IMPORTED',
      module: 'hizlibilisim',
      ipAddress: '-',
      // ⚠️ Token/parola YAZILMAZ. Yalnız kim + hangi VKN + sonuç.
      details: `Hızlı Bilişim'den mükellef portföye eklendi: ${vkn} (${kayit.companyName}).`,
    });

    return { success: true, durum: 'EKLENDI', customer: kayit, message: `${kayit.companyName} portföye eklendi.` };
  }


  /**
   * Duplicate kontrolü (VKN, E-posta, Telefon, External ID)
   */
  public static checkDuplicate(data: {
    taxNumber: string;
    email?: string;
    phone?: string;
    externalId?: string;
  }): {
    hasDuplicate: boolean;
    duplicateType?: 'TAX_NUMBER' | 'EMAIL' | 'EXTERNAL_ID' | 'PHONE';
    matchedTenant?: any;
    message?: string;
  } {
    const db = storage.getState();
    const cleanTax = data.taxNumber?.trim();

    // 1. Vergi No kontrolü
    if (cleanTax) {
      const matchVkn = (db.tenants || []).find(t => t.taxNumber === cleanTax);
      if (matchVkn) {
        return {
          hasDuplicate: true,
          duplicateType: 'TAX_NUMBER',
          matchedTenant: matchVkn,
          message: `Bu Vergi Numarası (${cleanTax}) zaten "${matchVkn.name}" (${matchVkn.companyCode}) firmasında kayıtlıdır.`,
        };
      }
    }

    // 2. External Customer ID kontrolü
    if (data.externalId) {
      const matchExt = (db.tenants || []).find(t => t.externalCustomerId === data.externalId);
      if (matchExt) {
        return {
          hasDuplicate: true,
          duplicateType: 'EXTERNAL_ID',
          matchedTenant: matchExt,
          message: `Bu Hızlı Bilişim Müşterisi (${data.externalId}) zaten "${matchExt.name}" firması ile ilişkilendirilmiştir.`,
        };
      }
    }

    // 3. E-posta kontrolü
    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      const matchEmail = (db.tenants || []).find(t => t.email?.toLowerCase() === cleanEmail);
      if (matchEmail) {
        return {
          hasDuplicate: true,
          duplicateType: 'EMAIL',
          matchedTenant: matchEmail,
          message: `Bu e-posta adresi (${data.email}) "${matchEmail.name}" firmasında kullanılmaktadır.`,
        };
      }
    }

    return { hasDuplicate: false };
  }
}
