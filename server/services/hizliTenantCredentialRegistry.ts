/**
 * İŞBEY CLOUD — FAZ 25.3 / Bey360: FİRMA BAZLI WS KİMLİK + TOKEN REGISTRY
 * ========================================================================
 * Satıcı onaylı mimari (docs/21 — Hızlı Teknoloji Q&A, 2026-09-09):
 *   - ApiKey: ERP/iş ortağı seviyesinde TEK (env → HIZLI_BILISIM_API_KEY)
 *   - SecretKey: yalnızca UtilEncrypt; WS kimliği değişmedikçe 1 KEZ çağrılır
 *   - WS kullanıcı adı/şifre: FİRMA (mükellef) bazlı
 *   - JWT token: FİRMA bazlı, 24 saat TTL; yenileme = tekrar Login
 *   - Canlıya geçiş: yalnızca base URL değişir (econnecttest → econnect)
 *
 * Bu registry, hizliConnectService.ts'teki TEK GLOBAL tokenStore'un
 * multi-tenant güvenlik açığını kapatır: her belge gönderimi artık
 * KENDİ firmasının token'ıyla imzalanır (tenant izolasyonu).
 *
 * Kimlik çözümleme önceliği (fail-closed):
 *   1. TenantEinvoiceSettings.username + encryptedPassword (firma bazlı, DB)
 *   2. env HIZLI_BILISIM_WS_USERNAME/PASSWORD (yalnızca kendi firmamız için)
 *   3. Hiçbiri yoksa HATA — sahte token/hash ÜRETİLMEZ (CLAUDE.md kuralı)
 *
 * Cache iki katmanlı:
 *   - tenantCredCache : UtilEncrypt çıktısı (hashed creds) — WS kimliği
 *     değişmedikçe yeniden ŞİFRELEME yapılmaz (satıcı: "1 kez yeterli")
 *   - tenantTokenCache: Login çıktısı — 24h TTL, 20h'de proaktif yenileme
 *
 * GÜVENLİK: Bu dosya plaintext şifreleri YALNIZCA bellekte tutar;
 * log'a hash/parmak izi dışında hiçbir kimlik bilgisi YAZILMAZ.
 */

import crypto from 'crypto';
import type { TenantEinvoiceSettings } from '../db/schema';
import { HizliConnectService, tokenStore } from './hizliConnectService';
import { decryptSecret } from '../security/credentialVault';

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface TenantWsCredentials {
  apiKey: string;
  secretKey: string;
  username: string;
  password: string;
  /** Kimlik kaynağı: tenant ayarları (firma bazlı) veya env (kendi firmamız) */
  source: 'tenant-settings' | 'env-default-firm';
}

interface TenantCredEntry {
  hashedUsername: string;
  hashedPassword: string;
  /** credential parmak izi — WS kimliği değişirse UtilEncrypt yeniden çağrılır */
  credFingerprint: string;
  isTestMode: boolean;
}

interface TenantTokenEntry {
  token: string;
  expireDate: string; // ISO
  isTestMode: boolean;
}

// ─── Cache'ler (in-memory; sunucu yeniden başlayınca yeniden Login olur) ─────

const tenantCredCache = new Map<string, TenantCredEntry>();
const tenantTokenCache = new Map<string, TenantTokenEntry>();

/** Token'ı proaktif yenileme tamponu (24h TTL'in 4 saat öncesi) */
const TOKEN_REFRESH_BUFFER_MS = 4 * 60 * 60 * 1000;

function cacheKey(tenantId: string, isTest: boolean): string {
  return `${tenantId}:${isTest ? 'test' : 'prod'}`;
}

/** WS kimliği değişip değişmediğini anlayan parmak izi (log'lanmaz) */
function credFingerprint(creds: TenantWsCredentials, isTest: boolean): string {
  return crypto
    .createHash('sha256')
    .update(`${creds.secretKey}|${creds.username}|${creds.password}|${isTest}`)
    .digest('hex');
}

// ─── Kimlik çözümleme (fail-closed) ─────────────────────────────────────────

/**
 * Kimlik bilgisi alanını çözer.
 *
 * 2026-09-14 (kimlik bilgisi sertleştirmesi): Önceden burada yalnız base64
 * çözen `decodeB64` vardı. Artık `credentialVault.decryptSecret` kullanılır:
 * yeni kayıtlar AES-256-GCM ile şifrelidir (`enc:v1:` etiketli), eski
 * kayıtlar (etiketsiz base64 VEYA düz metin) olduğu gibi okunabilir.
 * Ayrıntı ve geçiş planı: server/security/credentialVault.ts
 */
function decodeB64(value: string | undefined): string {
  // `encryptedPassword` / `apiKeyEncrypted` alanları eklendiklerinden beri
  // base64 yazılıyordu — ipucu AÇIKÇA 'base64'. 'auto' sezgisi kullanılmaz:
  // tamamen base64 alfabesinden oluşan ve uzunluğu 4'ün katı olan bir kayıt
  // (örn. eski bir düz metin şifre) yanlışlıkla çözülüp bozulabilirdi.
  return decryptSecret(value, 'base64');
}

/**
 * Firmanın WS kimliğini çözümler:
 *   1) TenantEinvoiceSettings (firma bazlı — satıcı modeli)
 *   2) env (yalnızca kendi firmamız — geriye dönük uyum)
 * Bulamazsa HATA fırlatır — sahte kimlik ÜRETİLMEZ.
 */
export function resolveTenantWsCredentials(settings: TenantEinvoiceSettings): TenantWsCredentials {
  const tenantUser = (settings.username || '').trim();
  const tenantPass = decodeB64(settings.encryptedPassword);

  if (tenantUser && tenantPass) {
    const apiKey = decodeB64(settings.apiKeyEncrypted) || process.env.HIZLI_BILISIM_API_KEY || '';
    const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY || '';
    if (!apiKey) {
      throw new Error(`[${settings.tenantId}] Firma bazlı ApiKey çözümlenemedi (settings.apiKeyEncrypted boş, HIZLI_BILISIM_API_KEY tanımsız).`);
    }
    if (!secretKey) {
      throw new Error(`[${settings.tenantId}] HIZLI_BILISIM_SECRET_KEY tanımsız — UtilEncrypt yapılamaz.`);
    }
    return { apiKey, secretKey, username: tenantUser, password: tenantPass, source: 'tenant-settings' };
  }

  // Fallback: env credential'ları (yalnızca KENDİ firmamız için geçerlidir)
  const envUser = process.env.HIZLI_BILISIM_WS_USERNAME || '';
  const envPass = process.env.HIZLI_BILISIM_WS_PASSWORD || '';
  const envApiKey = process.env.HIZLI_BILISIM_API_KEY || '';
  const envSecret = process.env.HIZLI_BILISIM_SECRET_KEY || '';

  if (envUser && envPass && envApiKey && envSecret) {
    return { apiKey: envApiKey, secretKey: envSecret, username: envUser, password: envPass, source: 'env-default-firm' };
  }

  throw new Error(
    `[${settings.tenantId}] Hızlı Teknoloji WS kimliği çözümlenemedi: firma ayarlarında ` +
    `username/encryptedPassword yok ve HIZLI_BILISIM_* env credential'ları eksik. ` +
    `(Kaynak kodda credential saklanamaz — .env veya e-Fatura Ayarları doldurulmalı.)`
  );
}

// ─── Ana giriş: firma bazlı token garantisi ─────────────────────────────────

/**
 * ensureTenantToken: Verilen firma için GEÇERLİ bir Bearer token döndürür.
 *
 * Akış (satıcı modeli, docs/21):
 *   1) token cache'te geçerli token varsa döndür (0 API çağrısı)
 *   2) WS kimliğini çöz (firma ayarları → env fallback)
 *   3) hashed creds cache + parmak izi eşleşiyorsa UtilEncrypt ATLANIR
 *      (satıcı: WS kimliği değişmedikçe UtilEncrypt 1 kez yeterli)
 *   4) Login → token cache'e yazılır (24h TTL)
 *
 * env kaynağından login'de global tokenStore da senkronize edilir
 * (efatura.ts gibi mevcut kendi-firmamız akışları bozulmaz).
 */
export async function ensureTenantToken(
  settings: TenantEinvoiceSettings,
  isTest: boolean
): Promise<{ token: string; source: TenantWsCredentials['source'] }> {
  const key = cacheKey(settings.tenantId, isTest);

  // 1) Geçerli token var mı?
  const cached = tenantTokenCache.get(key);
  if (
    cached &&
    cached.isTestMode === isTest &&
    cached.expireDate &&
    new Date(cached.expireDate).getTime() - TOKEN_REFRESH_BUFFER_MS > Date.now()
  ) {
    return { token: cached.token, source: tenantCredCache.get(key) ? 'tenant-settings' : 'env-default-firm' };
  }

  // 2) Kimlik çözümle (fail-closed — hata fırlatabilir)
  const creds = resolveTenantWsCredentials(settings);
  const fingerprint = credFingerprint(creds, isTest);

  // 3) UtilEncrypt — yalnızca gerekliyse (satıcı kuralı)
  let hashedCreds = tenantCredCache.get(key);
  if (!hashedCreds || hashedCreds.credFingerprint !== fingerprint || hashedCreds.isTestMode !== isTest) {
    const enc = await HizliConnectService.utilEncrypt(creds.secretKey, creds.username, creds.password, isTest);
    if (!enc.success || !enc.hashedUsername || !enc.hashedPassword) {
      throw new Error(`[${settings.tenantId}] UtilEncrypt başarısız: ${enc.message}`);
    }
    hashedCreds = {
      hashedUsername: enc.hashedUsername,
      hashedPassword: enc.hashedPassword,
      credFingerprint: fingerprint,
      isTestMode: isTest,
    };
    tenantCredCache.set(key, hashedCreds);
  }

  // 4) Login → token
  const login = await HizliConnectService.login(creds.apiKey, hashedCreds.hashedUsername, hashedCreds.hashedPassword, isTest);
  if (!login.success || !login.token) {
    // Başarısız login'de bayat token cache'te KALMAZ (tekrar denemede temiz akış)
    tenantTokenCache.delete(key);
    throw new Error(`[${settings.tenantId}] Hızlı Teknoloji Login başarısız: ${login.message}`);
  }

  tenantTokenCache.set(key, {
    token: login.token,
    expireDate: login.expireDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    isTestMode: isTest,
  });

  // Kendi firmamız (env kaynağı) için global tokenStore'u da senkronize et —
  // böylece efatura.ts / hizliTeknolojiProvider.testConnection gibi mevcut
  // akışlar aynı token'ı görür (davranış uyumu).
  if (creds.source === 'env-default-firm') {
    tokenStore.token = login.token;
    tokenStore.expireDate = tenantTokenCache.get(key)!.expireDate;
    tokenStore.hashedUsername = hashedCreds.hashedUsername;
    tokenStore.hashedPassword = hashedCreds.hashedPassword;
    tokenStore.isTestMode = isTest;
    tokenStore.lastInitAt = new Date().toISOString();
  }

  return { token: login.token, source: creds.source };
}

/**
 * invalidateTenantToken: YALNIZ token cache'ini temizler, credential cache'ine
 * dokunmaz. 401 (token süresi dolmuş/iptal edilmiş) alındığında çağrılır:
 * bir sonraki `ensureTenantToken` UtilEncrypt'e GİRMEZ, doğrudan Login ile
 * taze token alır (satıcı kuralı: WS kimliği değişmediyse UtilEncrypt 1 kez).
 *
 * Neden gerekli: TOKEN_REFRESH_BUFFER_MS (4 saat) nedeniyle token 20. saatte
 * proaktif yenilenir; ancak token bu süreden ÖNCE sunucu tarafında iptal
 * edilirse (şifre değişikliği, oturum düşmesi) 20 saate kadar her çağrı 401
 * döner ve asla yeniden Login yapılmazdı.
 */
export function invalidateTenantToken(tenantId: string, isTest: boolean): void {
  tenantTokenCache.delete(cacheKey(tenantId, isTest));
}

/**
 * invalidateTenant: Firma ayarları değiştiğinde cache'i temizler.
 * e-invoice-settings PUT ve test-connection çağırır.
 */
export function invalidateTenant(tenantId: string): void {
  tenantCredCache.delete(cacheKey(tenantId, true));
  tenantCredCache.delete(cacheKey(tenantId, false));
  tenantTokenCache.delete(cacheKey(tenantId, true));
  tenantTokenCache.delete(cacheKey(tenantId, false));
}

/** Test/diagnostik: cache durumu özeti (kimlik bilgisi İÇERMEZ) */
export function tenantRegistryStats(): {
  credEntries: number;
  tokenEntries: number;
  tenantsWithValidToken: number;
} {
  const now = Date.now();
  let valid = 0;
  for (const t of tenantTokenCache.values()) {
    if (new Date(t.expireDate).getTime() > now) valid++;
  }
  return { credEntries: tenantCredCache.size, tokenEntries: tenantTokenCache.size, tenantsWithValidToken: valid };
}

/** Test desteği: bir kiracı için doğrudan token cache kaydı oluşturur */
export function setTenantTokenForTest(tenantId: string, isTest: boolean, token: string, expireDate?: string): void {
  tenantTokenCache.set(cacheKey(tenantId, isTest), {
    token,
    expireDate: expireDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    isTestMode: isTest,
  });
}
