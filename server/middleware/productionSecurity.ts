/**
 * İŞBEY CLOUD — FAZ 25.4 PRODUCTION SECURITY LAYER (sıfır bağımlılık)
 * ====================================================================
 * docs/18 FAZ 25.4 kalemleri için npm paketi OLMADAN uygulanır (bash/npm
 * erişimi olmadan bağımlılık eklemek sunucuyu başlatılamaz yapardı):
 *
 *   1. securityHeaders  → helmet'in çekirdek başlıkları (Elle, davranış eşdeğeri)
 *   2. corsAllowlist    → mevcut `cors` paketiyle origin allowlist (env bazlı)
 *   3. rateLimit        → in-memory sliding window (login / mobile login / webhook)
 *
 * DAVRANIŞ GÜVENCESİ (değişmez kural: "çalışan özellikleri bozma"):
 *   - CORS allowlist YALNIZCA CORS_ALLOW_ORIGINS env tanımlıysa aktifleşir.
 *     Tanımsızsa mevcut açık davranış KORUNUR (mevcut geliştirme akışı bozulmaz).
 *   - Rate limit yalnızca public uçlara (login, mobile login, webhook) uygulanır;
 *     kimlikli akışlara dokunmaz. Webhook limiti yüksek (abuse katmanı).
 *   - CSP başlığı yalnızca CSP_HEADER env tanımlıysa gönderilir (SPA dev akışı
 *     vite proxy kullandığı için default CSP RİSKLİ — bilinçli olarak opsiyonel).
 *
 * Tüm limitler env ile ayarlanabilir; değerler docs/18 kabul kriterlerine hizalı.
 */

import { Request, Response, NextFunction } from 'express';

// ─── 1. Security Headers (helmet çekirdek eşdeğeri) ──────────────────────────

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // XSS filter (eski tarayıcılar için) + MIME sniffing engeli
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '0'); // modern kılavuz: filter'a güvenme, CSP kullan
  // Clickjacking: API yanıtlarının iframe'de açılması anlamsız — engelle
  res.setHeader('X-Frame-Options', 'DENY');
  // Referrer sızıntısını kıs
  res.setHeader('Referrer-Policy', 'no-referrer');
  // HSTS yalnızca HTTPS arkasındaysa anlamlı; env ile açılır (localhost'ta zararsız ama gereksiz)
  if (process.env.ENABLE_HSTS === 'true') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // SPA için opsiyonel CSP (env ile verilir — körlemesine default CSP SPA'yı kırar)
  const csp = process.env.CSP_HEADER;
  if (csp) {
    res.setHeader('Content-Security-Policy', csp);
  }
  next();
}

// ─── 2. CORS Allowlist (env bazlı, opsiyonel) ────────────────────────────────

/**
 * CORS_ALLOW_ORIGINS="https://app.isbey.com,https://admin.isbey.com" şeklinde
 * virgülle ayrılmış liste. TANIMSIZSA allowlist devre dışı (mevcut davranış).
 * LOCAL_DEV_ALLOW=true ise localhost* origin'leri de kabul edilir (geliştirme).
 */
export function buildCorsOptions(): { origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void } {
  const raw = process.env.CORS_ALLOW_ORIGINS || '';
  const allowlist = raw.split(',').map(s => s.trim()).filter(Boolean);
  const localDev = process.env.LOCAL_DEV_ALLOW === 'true';

  return {
    origin: (origin, cb) => {
      // Same-origin / curl / mobil app → Origin header'ı yok: izin ver
      if (!origin) return cb(null, true);

      if (allowlist.length === 0 && !localDev) {
        // Allowlist yapılandırılmamış → mevcut davranış (herkese açık) KORUNUR
        return cb(null, true);
      }
      if (allowlist.includes(origin)) return cb(null, true);
      if (localDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false); // izinli değil → tarayıcı CORS hatası alır
    },
  };
}

// ─── 3. In-Memory Rate Limiter (sliding window) ──────────────────────────────

interface RateEntry { timestamps: number[]; }
const rateBuckets = new Map<string, RateEntry>();

// Bellek disiplini: 10 dakikada bir boş bucket'ları temizle
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateBuckets) {
    const windowMs = 15 * 60 * 1000;
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);
    if (entry.timestamps.length === 0) rateBuckets.delete(key);
  }
}, 10 * 60 * 1000).unref?.();

export interface RateLimitOptions {
  /** Pencere (ms) */
  windowMs?: number;
  /** Pencere başına max istek */
  max?: number;
  /** Bucket anahtarı öneki (istek başına ip+route ile birleşir) */
  name: string;
}

export function rateLimit(options: RateLimitOptions) {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const max = options.max ?? 100;

  return (req: Request, res: Response, next: NextFunction): void => {
    // 2026-09-12 (güvenlik sertleştirmesi / XFF bypass): Önceden limiter KOŞULSUZ
    // olarak ham `X-Forwarded-For` başlığını okuyup ilk değeri IP sanıyordu. Bu
    // başlık istemci tarafından serbestçe uydurulabilir: her istekte farklı bir XFF
    // gönderen bir saldırgan her seferinde YENİ bir bucket açtırıp limiti tamamen
    // atlatabiliyordu (login brute-force koruması dâhil etkisizdi).
    //
    // Çözüm: IP tespiti Express'e bırakılır. `req.ip`, `app.set('trust proxy', ...)`
    // ile proxy'ye GÜVENİLİYORSA XFF'i (sağdan ilk güvenilmeyen adım) doğru biçimde
    // çözer; aksi hâlde istemcinin taklit edemeyeceği gerçek socket adresini döner.
    // `trust proxy` yapılandırması `server/index.ts`'te TRUST_PROXY env'i ile yapılır
    // (varsayılan KAPALI = güvenli). Böylece XFF yalnızca açıkça güvenilen dağıtımda
    // dikkate alınır; elle başlık okuma tamamen kaldırılmıştır.
    const ip = req.ip || 'unknown';

    const key = `${options.name}:${ip}`;
    const now = Date.now();

    let entry = rateBuckets.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      rateBuckets.set(key, entry);
    }
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

    if (entry.timestamps.length >= max) {
      // 429 + Retry-After
      const oldest = entry.timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        success: false,
        message: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.',
        code: 'RATE_LIMITED',
      });
      return;
    }

    entry.timestamps.push(now);
    next();
  };
}

/**
 * Hazır limitler (docs/18 FAZ 25.4 #3):
 *  - login: 15 dk / 20 deneme (brute force)
 *  - mobileLogin: 15 dk / 30 deneme
 *  - webhook: 1 dk / 60 istek (abuse katmanı — meşru provider akışını bozmamalı)
 *
 * SINIR AYARI (env, OPSİYONEL — tanımsızsa yukarıdaki güvenli varsayılan geçerlidir):
 * Doğrulama koşusu suitleri AYNI IP'den (127.0.0.1) çok sayıda login yapar; paylaşılan
 * bucket yüzünden suitler zincirleme 429 alıp kanıt üretemiyordu (koşu #2: runtime
 * authz + 25.5 backup FAIL). Çözüm limiti zayıflatmak DEĞİL, koşu sırasında limiti
 * AÇIKÇA yükseltilebilir kılmaktır: varsayılan 20 değişmez, yalnızca bu iki env
 * tanımlıysa sapma olur ve koşu raporunda görünür.
 *   - LOGIN_RATE_LIMIT_MAX   (varsayılan 20)
 *   - MOBILE_RATE_LIMIT_MAX  (varsayılan 30)
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const loginRateLimit = rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: envInt('LOGIN_RATE_LIMIT_MAX', 20) });
export const mobileLoginRateLimit = rateLimit({ name: 'mobile-login', windowMs: 15 * 60 * 1000, max: envInt('MOBILE_RATE_LIMIT_MAX', 30) });
export const webhookRateLimit = rateLimit({ name: 'webhook', windowMs: 60 * 1000, max: 60 });
