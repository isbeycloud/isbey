/**
 * İŞBEY CLOUD — Deneme Kararı Kapısı (2026-10-15)
 * ================================================
 * İş kuralı: Kayıtta e-Dönüşüm seçimi SORULMAZ; 14 gün boyunca ön muhasebe
 * serbestçe kullanılır. Deneme bitince seçim ZORUNLUDUR — seçim yapılmadan
 * veri uçları 403 döner (kullanıcı kararı: "Kilitlensin, seçim zorunlu").
 *
 * KONUM: `defaultDeny`'den SONRA bağlanır; böylece `req.tenantId` yetkili
 * JWT'den gelmiş olur (x-tenant-id gibi başlıklar yetki kaynağı DEĞİLDİR).
 *
 * AÇIK KALAN YOLLAR (kilitliyken de erişilebilir) — kullanıcı kararı
 * verebilmeli ve oturumunu görebilmelidir:
 *   - Kimliğini ve firma durumunu okuma: GET /api/auth/me
 *   - Firma listesi: GET /api/tenants
 *   - Seçim ucu: POST /api/v1/e-donusum/choice
 *   - Sağlık/fiyat listesi (public): /api/health, /api/v1/plans
 *   - Platform yöneticisi (SUPER_ADMIN) muaftır.
 */
import { Request, Response, NextFunction } from 'express';
import { storage } from '../db/storage';
import { evaluateTrialGate } from '../services/trialGateService';

const ALLOWED_WHILE_LOCKED: { method: string; pattern: string | RegExp }[] = [
  { method: 'GET', pattern: '/api/auth/me' },
  // Firma DEĞİŞTİRME (kullanıcı kilitli firmadan diğer firmasına geçebilir —
  // `switchCompany` kendi içinde membership denetler).
  { method: 'POST', pattern: '/api/auth/switch-company' },
  { method: 'POST', pattern: /^\/api\/admin\/companies\/[^/]+\/switch$/ },
  { method: 'POST', pattern: /^\/api\/tenants\/[^/]+\/switch$/ },
  { method: 'GET', pattern: '/api/tenants' },
  // e-Dönüşüm başvurusu: kilitliyken karar bu uçtan verilir.
  { method: 'POST', pattern: '/api/v1/e-donusum/applications' },
  { method: 'GET', pattern: '/api/v1/e-donusum/applications' },
  { method: 'POST', pattern: '/api/v1/e-donusum/choice' },
  { method: 'GET', pattern: '/api/v1/e-donusum/choice' },
  { method: 'POST', pattern: '/api/auth/logout' },
];
// Not: `/api/health` ve `/api/v1/plans` BU listede değildir — onlar public
// uçtur ve bu kapı kimliksiz isteklere dokunmaz (`!req.tenantId` → next).
// Bu liste yalnız KİLİTLİ FİRMANIN kimlikli istekleri içindir; paketi ödeme
// ekranı gibi uçlar eklenirse bu listeye YALNIZCA o uçlar eklenir, veri
// uçlarına sessizce izin VERİLMEZ.

function fullPath(req: Request): string {
  return (req.originalUrl || req.url).split('?')[0];
}

function isAllowed(req: Request): boolean {
  const path = fullPath(req);
  return ALLOWED_WHILE_LOCKED.some(r => r.method === req.method && (typeof r.pattern === 'string' ? r.pattern === path : r.pattern.test(path)));
}

export const trialDecisionGate = (req: Request, res: Response, next: NextFunction) => {
  // Kimliksiz istekler (public uçlar) bu kapının konusu değildir.
  if (!req.tenantId || !req.user) return next();
  if (req.user.role === 'SUPER_ADMIN' || req.userRole === 'platform_admin') return next();
  if (isAllowed(req)) return next();

  const tenant = (storage.getState().tenants || []).find(t => t.id === req.tenantId);
  if (!tenant) return next(); // Tenant yoksa resolveTenant/route kendi hatasını verir.

  const gate = evaluateTrialGate(tenant);
  if (gate.state !== 'DECISION_REQUIRED') return next();

  return res.status(403).json({
    success: false,
    code: 'TRIAL_DECISION_REQUIRED',
    message: 'Deneme süreniz doldu. Kullanmaya devam etmek için e-Dönüşüm tercihinizi seçmelisiniz.',
    decisionRequired: true,
    expiresAt: gate.expiresAt,
  });
};
