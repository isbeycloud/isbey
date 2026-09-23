import { storage } from '../db/storage';
import { TaxpayerCacheItem } from '../db/schema';
import { ProviderFactory } from './providers/providerFactory';

export class TaxpayerService {
  /**
   * VKN / TCKN Mükellef Sorgulama (Önbellek & Provider Destekli)
   */
  public static async checkTaxpayer(
    identifier: string,
    tenantId: string,
    forceRefresh: boolean = false
  ): Promise<TaxpayerCacheItem> {
    const cleanId = (identifier || '').replace(/[^0-9]/g, '').trim();
    if (cleanId.length !== 10 && cleanId.length !== 11) {
      throw new Error('Geçersiz VKN / TCKN formatı (10 veya 11 hane olmalıdır).');
    }

    const db = storage.getState();
    const now = new Date();
    const nowIso = now.toISOString();

    // 2026-09-12 (tenant izolasyonu — IDOR/PII): Önbellek anahtarı YALNIZCA
    // VKN/TCKN idi. Bu alan kiracılar arası PAYLAŞILAN tek bir listedir
    // (db.taxpayerCache). İki somut sonucu vardı:
    //   (1) A kiracısı bir VKN'yi sorgulayınca, kayıt B kiracısına da aynen
    //       servis ediliyordu — ünvan/alias gibi mükellef bilgisi kiracılar
    //       arasında sızıyordu.
    //   (2) Farklı entegratör kullanan kiracılar birbirinin cevabını yiyordu;
    //       MOCK kullanan bir kiracının "mükellef değil" cevabı, gerçek
    //       entegratör kullanan kiracıya 24 saat boyunca hizmet veriyordu.
    // Kayıt artık kiracı bazlı anahtarla (`id`) aranır. Şema DEĞİŞMEZ; mevcut
    // kayıtlar (eski `taxpayer-<vkn>` id'si) eşleşmediği için ilk çağrıda
    // tazelenir — bu, yanlış cevabı önbellekte tutmaktan doğrudur.
    const cacheId = `taxpayer-${tenantId}-${cleanId}`;

    // 1. Önbellek Kontrolü (Varsayılan 24 saat geçerli, kiracıya özel)
    if (!forceRefresh && db.taxpayerCache) {
      const cached = db.taxpayerCache.find(
        c => c.id === cacheId && new Date(c.expiresAt) > now
      );
      if (cached) {
        return cached;
      }
    }

    // 2. Provider Üzerinden Sorgula
    const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);
    const result = await provider.checkTaxpayer(cleanId, settings);

    // 24 saat sonrası için son kullanma tarihi
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const cacheItem: TaxpayerCacheItem = {
      id: cacheId,
      identifier: cleanId,
      // 2026-09-12: Sağlayıcı ünvan döndürmediyse UYDURULMAZ. Önceleri buraya
      // 'e-Fatura Mükellefi' / 'e-Arşiv Mükellefi' yazılıyordu; bu değer 24
      // saatlik önbelleğe girip fatura kesim ekranında GERÇEK ünvan sanılarak
      // kullanılabiliyordu. Bilinmiyorsa boş kalır.
      title: result.title || '',
      isEInvoiceUser: result.isEInvoiceUser,
      isEDespatchUser: result.isEDespatchUser,
      aliasGB: result.aliasGB,
      aliasPK: result.aliasPK,
      lastCheckedAt: nowIso,
      expiresAt,
    };

    if (!db.taxpayerCache) db.taxpayerCache = [];
    // 2026-09-12: upsert anahtarı da kiracı bazlı olmalı. Önceden burada
    // `c.identifier === cleanId` aranıyordu; yani aynı VKN'yi soran İKİNCİ
    // kiracı, BİRİNCİ kiracının satırını kendi `id`'siyle EZİYORDU. Okuma
    // tarafı kiracı bazlı olduğundan, ezilen kiracı kendi kaydını bir daha
    // bulamıyor (önbellek isabetsizliği) ve paylaşılan tek satır kalıyordu.
    const existingIndex = db.taxpayerCache.findIndex(c => c.id === cacheId);
    if (existingIndex >= 0) {
      db.taxpayerCache[existingIndex] = cacheItem;
    } else {
      db.taxpayerCache.push(cacheItem);
    }

    storage.save();
    return cacheItem;
  }
}
