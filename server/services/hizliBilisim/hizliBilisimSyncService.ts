import { storage } from '../../db/storage';
import { HizliBilisimClient } from './hizliBilisimClient';
import { ExternalCustomer } from '../../db/schema';

export class HizliBilisimSyncService {
  /**
   * Hızlı Bilişim'den müşteri senkronizasyonunu icra eder.
   *
   * 2026-09-12 (uydurma temizliği): Bu servis eskiden parametresiz
   * `fetchRemoteCustomers()` çağırıyordu; o metod da sabit bir VKN listesini
   * döngüye sokup sonucu "canlı çekildi" diye raporluyordu. Hızlı Bilişim
   * eConnect API'sinde "tüm mükellefleri listele" uç noktası YOK. Bu yüzden
   * senkronizasyon artık SORGULANACAK VKN listesine dayanır:
   *   1) Çağıran VKN verirse (panelden seçim) onlar kullanılır.
   *   2) Verilmezse, panelde KAYITLI firmaların (dealerCustomers) VKN'leri
   *      kullanılır — bunlar kullanıcının girdiği gerçek kayıtlardır.
   *   3) Hiçbiri yoksa uydurma liste ÜRETİLMEZ; açık hata döner.
   */
  public static async executeSync(triggeredBy: string = 'admin', vknTcknList?: string[]): Promise<{
    success: boolean;
    totalFetched: number;
    newCount: number;
    updatedCount: number;
    matchedCount: number;
    message: string;
  }> {
    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'SYNC_STARTED',
      username: triggeredBy,
      details: 'Hızlı Bilişim müşteri/üye senkronizasyonu başlatıldı.',
      status: 'SUCCESS',
    });

    try {
      // Sorgulanacak VKN kümesini çözümle (uydurma yok).
      const db = storage.getState();
      const registeredVkns = (db.dealerCustomers || [])
        .map(d => (d.taxNumber || '').trim())
        .filter(Boolean);
      const queryList = (vknTcknList && vknTcknList.length > 0)
        ? vknTcknList.map(v => String(v).trim()).filter(Boolean)
        : registeredVkns;

      if (queryList.length === 0) {
        const msg =
          'Hızlı Bilişim eConnect API\'sinde "tüm mükellefleri listele" uç noktası bulunmuyor. ' +
          'Senkronizasyon için sorgulanacak VKN/TCKN gerekir — panelde kayıtlı firma yok ve ' +
          'istekte liste verilmedi. Uydurma liste üretilmedi.';
        storage.addSyncLog({
          provider: 'HIZLI_BILISIM',
          action: 'SYNC_ERROR',
          username: triggeredBy,
          details: msg,
          status: 'ERROR',
        });
        return { success: false, totalFetched: 0, newCount: 0, updatedCount: 0, matchedCount: 0, message: msg };
      }

      const remoteRes = await HizliBilisimClient.fetchRemoteCustomers(queryList);

      // Kaynak etiketi: gerçek kaynak yalnız 'API' olabilir. Önceki sürümdeki
      // 'PORTAL' (web arayüzü) etiketi hiçbir zaman üretilmeyen bir daldı.
      const sourceLabel = remoteRes.source === 'API' ? 'e-Connect REST API' : 'kaynak yok';

      if (!remoteRes.success || remoteRes.customers.length === 0) {
        storage.addSyncLog({
          provider: 'HIZLI_BILISIM',
          action: 'SYNC_ERROR',
          username: triggeredBy,
          details: remoteRes.message || `Hızlı Bilişim (${sourceLabel}) veri çekme hatası.`,
          status: 'ERROR',
        });
        return {
          success: false,
          totalFetched: 0,
          newCount: 0,
          updatedCount: 0,
          matchedCount: 0,
          message: remoteRes.message,
        };
      }

      storage.addSyncLog({
        provider: 'HIZLI_BILISIM',
        action: 'CUSTOMER_IMPORTED',
        username: triggeredBy,
        details: `${remoteRes.customers.length} müşteri kaydı ${sourceLabel} üzerinden çekildi (${queryList.length} VKN sorgulandı).`,
        status: 'SUCCESS',
      });

      let newCount = 0;
      let updatedCount = 0;
      let matchedCount = 0;

      await storage.runTransaction(draft => {
        if (!draft.externalCustomers) draft.externalCustomers = [];

        for (const remote of remoteRes.customers) {
          // 1. Check existing in externalCustomers by externalId or taxNumber
          const existing = draft.externalCustomers.find(
            c => c.externalId === remote.externalId || (c.taxNumber && c.taxNumber === remote.taxNumber)
          );

          // 2. Check if already exists in İŞBEY Tenants
          const matchedTenant = (draft.tenants || []).find(
            t => t.taxNumber === remote.taxNumber || t.externalCustomerId === remote.externalId
          );

          if (existing) {
            // Update fields if changed
            let hasChange = false;
            if (existing.companyName !== remote.companyName) { existing.companyName = remote.companyName; hasChange = true; }
            if (existing.title !== remote.title) { existing.title = remote.title; hasChange = true; }
            if (existing.phone !== remote.phone) { existing.phone = remote.phone; hasChange = true; }
            if (existing.email !== remote.email) { existing.email = remote.email; hasChange = true; }
            if (existing.contactName !== remote.contactName) { existing.contactName = remote.contactName; hasChange = true; }
            if (existing.address !== remote.address) { existing.address = remote.address; hasChange = true; }

            if (matchedTenant && !existing.isbeyCompanyId) {
              existing.isbeyCompanyId = matchedTenant.id;
              existing.isbeyCompanyCode = matchedTenant.companyCode;
              if (existing.status === 'NEW') existing.status = 'MATCHED';
              matchedCount++;
            }

            existing.syncedAt = new Date().toISOString();
            if (hasChange) updatedCount++;
          } else {
            // New external customer record
            const newCustomer: ExternalCustomer = {
              id: `hbc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              externalId: remote.externalId,
              provider: 'HIZLI_BILISIM',
              companyName: remote.companyName,
              title: remote.title || remote.companyName,
              taxNumber: remote.taxNumber,
              taxOffice: remote.taxOffice || 'Merkez',
              contactName: remote.contactName,
              phone: remote.phone,
              email: remote.email,
              address: remote.address,
              city: remote.city,
              district: remote.district,
              status: matchedTenant ? 'MATCHED' : 'NEW',
              isbeyCompanyId: matchedTenant?.id,
              isbeyCompanyCode: matchedTenant?.companyCode,
              registeredAt: remote.registeredAt || new Date().toISOString(),
              syncedAt: new Date().toISOString(),
            };

            draft.externalCustomers.push(newCustomer);
            if (matchedTenant) matchedCount++;
            else newCount++;
          }
        }

        // Update settings stats
        if (!draft.hizliBilisimSettings) {
          draft.hizliBilisimSettings = {
            // E-7: varsayılan TEST URL'idir (canlı URL yanıltıcı izdi).
            apiUrl: 'https://econnecttest.hizliteknoloji.com.tr',
            apiKey: process.env.HIZLI_BILISIM_API_KEY || '', // FAZ 10
            apiUsername: 'isbey_admin',
            isTestMode: true,
            autoSyncEnabled: false,
            autoSyncIntervalMinutes: 15,
            autoCreateCompany: false,
            defaultPlan: 'PRO',
            sendActivationEmail: true,
          };
        }

        draft.hizliBilisimSettings.lastSyncAt = new Date().toISOString();
        draft.hizliBilisimSettings.lastSyncStatus = 'SUCCESS';
        draft.hizliBilisimSettings.totalSynced = draft.externalCustomers.length;
        draft.hizliBilisimSettings.totalConverted = draft.externalCustomers.filter(
          c => c.status === 'IMPORTED' || c.status === 'USER_CREATED'
        ).length;
      });

      storage.addSyncLog({
        provider: 'HIZLI_BILISIM',
        action: 'CUSTOMER_IMPORTED',
        username: triggeredBy,
        details: `Senkronizasyon tamamlandı: ${remoteRes.customers.length} kayıt işlendi (${newCount} yeni, ${updatedCount} güncellendi, ${matchedCount} eşleşti).`,
        status: 'SUCCESS',
      });

      return {
        success: true,
        totalFetched: remoteRes.customers.length,
        newCount,
        updatedCount,
        matchedCount,
        message: `Hızlı Bilişim senkronizasyonu başarıyla tamamlandı. (${newCount} yeni müşteri eklendi).`,
      };
    } catch (err: any) {
      storage.addSyncLog({
        provider: 'HIZLI_BILISIM',
        action: 'SYNC_ERROR',
        username: triggeredBy,
        details: `Senkronizasyon yürütme hatası: ${err.message}`,
        status: 'ERROR',
      });

      return {
        success: false,
        totalFetched: 0,
        newCount: 0,
        updatedCount: 0,
        matchedCount: 0,
        message: err.message,
      };
    }
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
