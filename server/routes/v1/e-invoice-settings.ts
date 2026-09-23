import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { TenantEinvoiceSettings } from '../../db/schema';
import { ProviderFactory } from '../../services/providers/providerFactory';
import { invalidateTenant } from '../../services/hizliTenantCredentialRegistry';
import { encryptSecret } from '../../security/credentialVault';

export const v1EinvoiceSettingsRouter = Router();

v1EinvoiceSettingsRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/e-invoice/settings
 * Şirketin e-Dönüşüm entegrasyon ayarlarını döner (Hassas şifreler maskeli)
 */
v1EinvoiceSettingsRouter.get('/settings', requirePermission(PERMISSIONS.COMPANY_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const settings = (db.tenantEinvoiceSettings || []).find(s => s.tenantId === tenantId);

  if (!settings) {
    // 2026-09-12 (fail-closed): Kiracının kayıtlı ayarı YOKSA burada artık
    // Entegratör alanı UYDURULMAZ (eskiden burada test sağlayıcısı yazılıydı).
    // Önceki hâlde arayüz bu nesneyi "kayıtlı ayar" sanıp test sağlayıcısını
    // seçili gösteriyor, ardından /test-connection "bağlantı başarılı"
    // dönüyordu — hiç entegratör yapılandırılmamışken.
    // Doğru cevap: yapılandırma yoktur (`configured: false`, boş providerId).
    const defaultSettings: TenantEinvoiceSettings = {
      id: `set-${tenantId}`,
      tenantId,
      providerId: '',
      environment: 'TEST',
      senderIdentifier: db.company?.taxNumber || '1111111111',
      senderTitle: db.company?.name || 'İŞBEY SaaS',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return res.json({ success: true, configured: false, settings: defaultSettings });
  }

  // Güvenlik: Hassas şifreleri maskele
  const maskedSettings = {
    ...settings,
    encryptedPassword: settings.encryptedPassword ? '************' : undefined,
    apiKeyEncrypted: settings.apiKeyEncrypted ? '************' : undefined,
    apiSecretEncrypted: settings.apiSecretEncrypted ? '************' : undefined,
  };

  res.json({ success: true, configured: true, settings: maskedSettings });
});

/**
 * PUT /api/v1/e-invoice/settings
 * Şirket e-Dönüşüm entegrasyon ayarlarını günceller
 */
v1EinvoiceSettingsRouter.put('/settings', requirePermission(PERMISSIONS.COMPANY_UPDATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();

  const {
    providerId,
    environment,
    username,
    password,
    apiKey,
    apiSecret,
    senderIdentifier,
    senderTitle,
    senderAliasGB,
    senderAliasPK,
    defaultInvoiceProfile,
    defaultDespatchProfile,
    autoSendToGib,
  } = req.body;

  if (!db.tenantEinvoiceSettings) db.tenantEinvoiceSettings = [];
  let settings = db.tenantEinvoiceSettings.find(s => s.tenantId === tenantId);

  // 2026-09-12 (fail-closed): Entegratör AÇIKÇA seçilmelidir. `providerId`
  // varsayılanı test sağlayıcısıydı; alanı hiç göndermeyen bir istemci, farkında
  // olmadan kiracıyı ona bağlıyor ve "bağlantı başarılı" görüyordu. Artık kayıtlı ve
  // tanınan bir entegratör yoksa ayar KAYDEDİLMEZ (400).
  const requestedProvider = String(providerId ?? settings?.providerId ?? '').trim().toUpperCase();
  if (!requestedProvider) {
    return res.status(400).json({
      success: false,
      message: 'Entegratör (providerId) seçilmelidir. Kayıtlı entegratörler: ' +
        ProviderFactory.getAllProviders().map(p => p.id).join(', ') + '.',
    });
  }
  if (!ProviderFactory.getAllProviders().some(p => p.id.toUpperCase() === requestedProvider)) {
    return res.status(400).json({
      success: false,
      message: `Tanınmayan entegratör: '${providerId}'. Kayıtlı entegratörler: ` +
        ProviderFactory.getAllProviders().map(p => p.id).join(', ') + '.',
    });
  }

  // 2026-09-12: Ortam (environment) artık doğrulanır ve AÇIKÇA yazılır.
  // Önceden alan hiç gönderilmediğinde sessizce 'TEST' kabul ediliyor, denetim
  // kaydı ise HAM gövdedeki değeri (çoğu zaman `undefined`) yazıyordu — yani
  // "hangi ortama kaydedildi" sorusunun cevabı denetim izinde yoktu.
  // Güvenli varsayılan yine TEST'tir (CLAUDE.md md.1: canlı kullanım onay
  // fazından önce açılmaz); ancak artık görünmez değildir ve tanınmayan bir
  // değer sessizce kabul edilmez.
  const rawEnvironment = String(environment ?? settings?.environment ?? 'TEST').trim().toUpperCase();
  if (rawEnvironment !== 'TEST' && rawEnvironment !== 'PRODUCTION') {
    return res.status(400).json({
      success: false,
      message: `Geçersiz ortam: '${environment}'. Yalnızca TEST veya PRODUCTION olabilir.`,
    });
  }
  // 2026-09-13 (KRİTİK — production kaçağı): Bu ayar TÜM e-Dönüşüm yığınını
  // yönlendirir. ProviderFactory `settings.environment`'ı okuyup isTest türetir
  // (hizliTeknolojiProvider) ve hizli-defter.ts base URL'i buradan seçilir.
  // Önceden bu uç, `environment='PRODUCTION'` isteğini hiçbir kilit olmadan
  // kaydediyordu; yani kiracı kendi ayarını canlıya çevirip e-Belge/e-Defter
  // çağrılarını econnect.hizliteknoloji.com.tr'ye yöneltebiliyordu. efatura.ts
  // tarafındaki fail-closed kilit (HIZLI_BILISIM_ALLOW_PROD) burada YOKTU —
  // CLAUDE.md md.1 "canlı kullanım QA onay fazından önce açılmaz" ihlaliydi.
  if (rawEnvironment === 'PRODUCTION' && process.env.HIZLI_BILISIM_ALLOW_PROD !== 'true') {
    return res.status(403).json({
      success: false,
      message: 'CANLI (production) e-Dönüşüm ortamı QA onay fazı öncesi kapalıdır. Ortam TEST olarak kalmalıdır.',
    });
  }
  const requestedEnvironment = rawEnvironment as 'TEST' | 'PRODUCTION';

  const now = new Date().toISOString();

  if (!settings) {
    settings = {
      id: `set-${tenantId}`,
      tenantId,
      providerId: requestedProvider,
      environment: requestedEnvironment,
      senderIdentifier: senderIdentifier || db.company?.taxNumber || '1111111111',
      senderTitle,
      senderAliasGB,
      senderAliasPK,
      defaultInvoiceProfile: defaultInvoiceProfile || 'TEMELFATURA',
      defaultDespatchProfile: defaultDespatchProfile || 'TEMELIRSALIYE',
      autoSendToGib: autoSendToGib || false,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    db.tenantEinvoiceSettings.push(settings);
  } else {
    settings.providerId = requestedProvider;
    settings.environment = requestedEnvironment;
    if (senderIdentifier) settings.senderIdentifier = senderIdentifier;
    if (senderTitle) settings.senderTitle = senderTitle;
    if (senderAliasGB) settings.senderAliasGB = senderAliasGB;
    if (senderAliasPK) settings.senderAliasPK = senderAliasPK;
    if (defaultInvoiceProfile) settings.defaultInvoiceProfile = defaultInvoiceProfile;
    if (defaultDespatchProfile) settings.defaultDespatchProfile = defaultDespatchProfile;
    if (autoSendToGib !== undefined) settings.autoSendToGib = autoSendToGib;
    settings.updatedAt = now;
  }

  // Şifre güncellenmişse sakla.
  // 2026-09-14 (kimlik bilgisi sertleştirmesi): Burada eskiden
  // `Buffer.from(x).toString('base64')` yazılıyordu. base64 bir KODLAMADIR,
  // şifreleme değildir — `data/database.json` ele geçtiğinde firma WS şifreleri
  // tek satırla düz metne dönüyordu. Hızlı Bilişim duyurusunun güvenlik notu
  // ("...password bilgileri localde, uygulama dosyalarında... saklanmamalıdır")
  // gereği artık AES-256-GCM ile şifrelenir (server/security/credentialVault.ts).
  // Alan adları geriye dönük uyum için korundu; okuma tarafı hem yeni hem eski
  // biçimi çözer (bkz. decryptSecret).
  if (username) settings.username = username;
  if (password && password !== '************') {
    settings.encryptedPassword = encryptSecret(password);
  }
  if (apiKey && apiKey !== '************') {
    settings.apiKeyEncrypted = encryptSecret(apiKey);
  }
  if (apiSecret && apiSecret !== '************') {
    settings.apiSecretEncrypted = encryptSecret(apiSecret);
  }

  // Bey360 (docs/21): WS kimliği değiştiyse firma bazlı UtilEncrypt/token cache'i temizle —
  // sonraki gönderim yeni kimlikle yeniden şifrelenir + Login olur (satıcı kuralı: kimlik
  // değişmedikçe UtilEncrypt 1 kez yeterli; değiştiyse tekrar edilir).
  invalidateTenant(tenantId);

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'EINVOICE_SETTINGS_UPDATED',
    module: 'SETTINGS',
    ipAddress: req.ip || '127.0.0.1',
    details: `e-Dönüşüm entegrasyon ayarları güncellendi (Provider: ${requestedProvider}, Ortam: ${requestedEnvironment}).`,
  });

  storage.save();

  const masked = {
    ...settings,
    encryptedPassword: settings.encryptedPassword ? '************' : undefined,
    apiKeyEncrypted: settings.apiKeyEncrypted ? '************' : undefined,
    apiSecretEncrypted: settings.apiSecretEncrypted ? '************' : undefined,
  };

  res.json({ success: true, message: 'e-Dönüşüm ayarları başarıyla kaydedildi.', settings: masked });
});

/**
 * POST /api/v1/e-invoice/test-connection
 * Seçilen provider ile canlı veya test bağlantı denemesi yapar
 */
v1EinvoiceSettingsRouter.post('/test-connection', requirePermission(PERMISSIONS.COMPANY_VIEW), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // 2026-09-12: `getProviderForTenant` artık fail-closed (yapılandırma yoksa
  // hata fırlatır). Önceki kodda bu çağrı try BLOĞUNUN DIŞINDAYDI; dolayısıyla
  // yapılandırma hatası 500 üretirdi. Artık ayarsızlık açık bir 400 cevabıdır
  // — ve hiçbir koşulda "bağlantı başarılı" DENMEZ (test sağlayıcısına
  // sessiz düşüş yok: fabrika artık fail-closed).
  let provider;
  let settings;
  try {
    ({ provider, settings } = ProviderFactory.getProviderForTenant(tenantId));
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      configured: false,
      // (yukarıdaki catch zaten yalnızca yapılandırma hatası için ayrılmıştır)
      message: err?.message || 'e-Dönüşüm entegratörü yapılandırılmamış.',
    });
  }

  try {
    const result = await provider.testConnection(settings);
    res.json({
      success: result.success,
      provider: provider.name,
      environment: settings.environment,
      message: result.message,
      durationMs: result.durationMs,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: `Bağlantı testi başarısız: ${err.message}` });
  }
});

/**
 * GET /api/v1/e-invoice/providers
 * Sistemde kayıtlı provider listesini döner
 */
v1EinvoiceSettingsRouter.get('/providers', (req: Request, res: Response) => {
  const providers = ProviderFactory.getAllProviders();
  res.json({ success: true, providers });
});
