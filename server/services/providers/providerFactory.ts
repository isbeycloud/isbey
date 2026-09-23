import { ElectronicDocumentProvider, ProviderTransportError } from './electronicDocumentProvider';
import { MockElectronicDocumentProvider } from './mockProvider';
import { HizliTeknolojiProvider } from './hizliTeknolojiProvider';
import { storage } from '../../db/storage';
import { TenantEinvoiceSettings } from '../../db/schema';

/**
 * 2026-09-12 (kritik dürüstlük düzeltmesi — sessiz MOCK fallback'i kaldırıldı)
 * ───────────────────────────────────────────────────────────────────────────
 * ÖNCEKİ DAVRANIŞ: Kiracının `tenantEinvoiceSettings` kaydı YOKSA fabrika
 * kendiliğinden bir ayar nesnesi uydurup entegratörü "MOCK" olarak yazıyordu.
 * Tanınmayan bir entegratör kimliği geldiğinde de haritada bulunamayan kayıt
 * yerine sessizce Mock sağlayıcısına düşüyordu.
 *
 * NEDEN YANLIŞ: Mock sağlayıcı, GİB'e iletildi anlamına gelen bir etiket ve
 * GİB'in gerçek "iletildi" durum kodunu döndürüyordu. Sonuç: hiç entegratör yapılandırmamış bir
 * kiracı, e-Fatura gönderim kuyruğuna belge koyduğunda belge GERÇEKTEN
 * gönderilmeden `SENT` + `ACCEPTED` işaretleniyor, üstüne muhasebe tarafında
 * kontör düşülüyor ve ERP faturası "GİB onaylı" görünüyordu. Bu, CLAUDE.md
 * md.1'in ("API hatasında asla sahte/simüle başarılı response üretilmez")
 * doğrudan ihlalidir.
 *
 * YENİ KURAL (fail-closed): Yapılandırma yoksa veya tanınmayan bir `providerId`
 * gelirse sağlayıcı DÖNDÜRÜLMEZ — açık hata fırlatılır. Test sağlayıcısına
 * yalnızca kiracı ayarında AÇIKÇA o entegratör seçiliyse ulaşılır (bilinçli test
 * yapılandırması); varsayılan/yedek yol olarak ASLA kullanılmaz.
 */

/** Entegrasyon yapılandırması eksik/geçersiz olduğunda fırlatılır. */
export class ProviderConfigurationError extends Error {
  public readonly code = 'PROVIDER_NOT_CONFIGURED';
  public readonly tenantId: string;
  constructor(tenantId: string, message: string) {
    super(message);
    this.name = 'ProviderConfigurationError';
    this.tenantId = tenantId;
  }

  /**
   * Yapılandırma hatası mı? `instanceof` yerine `code` üzerinden de kontrol
   * edilir: hata farklı bir modül kopyasından gelse bile (çift yükleme / derleme
   * farkı) tanınır, aksi hâlde cagiran onu genel bir 400'e düşürürdü.
   */
  public static is(err: unknown): err is ProviderConfigurationError {
    const e = err as { code?: string; name?: string } | null;
    return !!e && (e.code === 'PROVIDER_NOT_CONFIGURED' || e.name === 'ProviderConfigurationError');
  }
}

// ProviderTransportError bu dosyada DEĞİL, electronicDocumentProvider.ts'te
// tanımlıdır ve burada yalnızca yeniden dışa aktarılır (çağıranların import
// yolu değişmesin diye). Sınıf fabrikada tanımlansaydı sağlayıcı → fabrika →
// sağlayıcı döngüsel import oluşurdu.
export { ProviderTransportError };

export class ProviderFactory {
  private static providers: Map<string, ElectronicDocumentProvider> = new Map<string, ElectronicDocumentProvider>([
    ['MOCK', new MockElectronicDocumentProvider()],
    ['HIZLI_TEKNOLOJI', new HizliTeknolojiProvider()],
  ]);

  /**
   * Yeni bir provider adapter kaydeder (Gelecekte Logo, Foriba vb. ekleme kolaylığı)
   */
  public static registerProvider(provider: ElectronicDocumentProvider) {
    this.providers.set(provider.providerId.toUpperCase(), provider);
  }

  /**
   * Kiracının AÇIKÇA kaydedilmiş e-Fatura ayarlarını döner (uydurma yok).
   */
  public static getSettingsForTenant(tenantId: string): TenantEinvoiceSettings | null {
    const db = storage.getState();
    return (db.tenantEinvoiceSettings || []).find(s => s.tenantId === tenantId) || null;
  }

  /**
   * Tenant ayarlarına göre aktif provider adapter'ını döner.
   *
   * FAIL-CLOSED: Kiracının e-Dönüşüm ayarı yoksa veya `providerId` kayıtlı bir
   * adapter'a karşılık gelmiyorsa hata fırlatır. Hiçbir koşulda sessizce
   * MOCK'a düşülmez (bkz. dosya başlığı).
   */
  public static getProviderForTenant(tenantId: string): {
    provider: ElectronicDocumentProvider;
    settings: TenantEinvoiceSettings;
  } {
    const settings = this.getSettingsForTenant(tenantId);

    if (!settings) {
      throw new ProviderConfigurationError(
        tenantId,
        `[${tenantId}] e-Dönüşüm entegratörü yapılandırılmamış. Belge gönderimi/ sorgusu yapılamaz — ` +
          `Ayarlar > e-Dönüşüm bölümünden entegratör bilgilerini tanımlayın. ` +
          `(Güvenlik gereği otomatik test/MOCK sağlayıcısına düşülmez.)`
      );
    }

    const provKey = String(settings.providerId || '').trim().toUpperCase();
    if (!provKey) {
      throw new ProviderConfigurationError(
        tenantId,
        `[${tenantId}] e-Dönüşüm ayarında entegratör (providerId) tanımlı değil.`
      );
    }

    const provider = this.providers.get(provKey);
    if (!provider) {
      throw new ProviderConfigurationError(
        tenantId,
        `[${tenantId}] Tanınmayan entegratör: '${settings.providerId}'. ` +
          `Kayıtlı entegratörler: ${this.getAllProviders().map(p => p.id).join(', ')}.`
      );
    }

    return { provider, settings };
  }

  /**
   * Tüm kayıtlı provider listesini döner
   */
  public static getAllProviders(): Array<{ id: string; name: string; capabilities: any }> {
    return Array.from(this.providers.values()).map(p => ({
      id: p.providerId,
      name: p.name,
      capabilities: p.capabilities,
    }));
  }
}
