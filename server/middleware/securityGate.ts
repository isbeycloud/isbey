/**
 * İŞBEY CLOUD — FAZ 25.1 SECURITY GATE
 * =====================================
 * DEFAULT DENY: Allowlist'te olmayan HER /api/* isteği en azından
 * kimlik doğrulamasından (requireAuth) geçmek zorundadır.
 *
 * Tasarım kararları (FAZ 25 planı §25.2, onaylandı):
 *  - Allowlist YOL bazlıdır (dosya bazlı değil): yeni route dosyası
 *    ekleyen geliştirici otomatik korunur; public endpoint eklemek için
 *    bu listeyi güncellemek + code review gerekir.
 *  - Bu middleware index.ts'te TÜM router mount'larından ÖNCE
 *    app.use('/api', defaultDeny) olarak bağlanır.
 *  - JWT'deki tenantId her zaman yetki kaynağıdır; x-tenant-id gibi
 *    başlıklar yalnızca yardımcı bilgidir, asla yetki kaynağı olamaz.
 */

import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './authGuards';

// ─── Public Endpoint Allowlist (FAZ 25 planı §25.3 — onaylı liste) ─────────

interface PublicRoute {
  method: string;
  /** Tam yol veya regex (parametreli yollar için) */
  pattern: string | RegExp;
}

const PUBLIC_ROUTES: PublicRoute[] = [
  // P1-P2: Kimlik doğrulama giriş noktaları
  { method: 'POST', pattern: '/api/auth/login' },
  { method: 'POST', pattern: '/api/auth/register' },

  // P3: Sağlık kontrolü (LB/monitör)
  { method: 'GET', pattern: '/api/health' },

  // P4: Fiyat listesi (read-only, static)
  { method: 'GET', pattern: '/api/v1/plans' },
  { method: 'GET', pattern: /^\/api\/v1\/plans\/[^/]+$/ },

  // P5: Mobil cihaz girişi (rate limit Sprint 25.4'te eklenecek)
  { method: 'POST', pattern: '/api/v1/mobile/auth/login' },

  // P6: Yardım makaleleri (read-only, public içerik — firma/tenant verisi İÇERMEZ)
  { method: 'GET', pattern: '/api/v1/support-faz8/knowledge' },

  // W1-W2: Webhook'lar (imza doğrulaması Sprint 25.3'te zorunlu hale gelir)
  { method: 'POST', pattern: /^\/api\/v1\/payments\/webhook$/ },
  { method: 'POST', pattern: /^\/api\/v1\/integrations\/[^/]+\/webhook$/ },

  // T1-T3: İmzalı token ile erişilen uçlar (token doğrulama handler içinde)
  { method: 'GET', pattern: /^\/api\/v1\/documents\/public-share\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/v1\/payment-links\/resolve\/[^/]+$/ },
  { method: 'POST', pattern: '/api/v1/payment-links/pay' },
];

/**
 * Yol eşleştirme: string tam eşleşme, RegExp partial match.
 */
function matches(pattern: string | RegExp, path: string): boolean {
  if (typeof pattern === 'string') return pattern === path;
  return pattern.test(path);
}

/**
 * Mount-bağımsız tam yol: app.use('/api', ...) içinde req.path öneksiz gelir
 * (/health gibi); allowlist ise /api/health gibi TAM yol tanımlar.
 * Bu nedenle eşleştirme originalUrl üzerinden yapılır (query string atılır).
 */
function fullPath(req: Request): string {
  return (req.originalUrl || req.url).split('?')[0];
}

/**
 * DEFAULT DENY gate — /api altındaki tüm isteklere uygulanır.
 * Allowlist'te yoksa requireAuth devreye girer (401).
 */
export const defaultDeny = (req: Request, res: Response, next: NextFunction) => {
  const path = fullPath(req);
  const isPublic = PUBLIC_ROUTES.some(
    r => r.method === req.method && matches(r.pattern, path)
  );

  if (isPublic) {
    return next();
  }

  // Allowlist dışındaki her şey en azından AUTH — 401 döner
  return requireAuth(req, res, next);
};

// Sprint 25.1 kapsamında allowlist'e SONRADAN eklenmeyecek; yeni public
// endpoint ihtiyacı ayrı onay konusudur (FAZ 25 planı §25.3 notu).
