import { Router, Request, Response } from 'express';
import { HizliDefterService } from '../services/hizliDefterService';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { resolveRequestTenantId } from '../security/policies';
import { ProviderFactory, ProviderConfigurationError } from '../services/providers/providerFactory';
import { ensureTenantToken } from '../services/hizliTenantCredentialRegistry';

export const hizliDefterRouter = Router();

/**
 * 2026-09-12 (yetki kapısı): Bu router daha önce YALNIZCA `requireAuth` taşıyordu;
 * yani kimliği doğrulanmış HERHANGİ bir kullanıcı (kasiyer, depo, personel) e-Defter
 * uçlarına erişebiliyordu. `src/utils/modulePermissions.ts` bu modülü
 * 'muhasebe' → SUPER_ADMIN / ADMIN / COMPANY_ADMIN / MUHASEBE ile sınırlar.
 * "Sadece Sidebar gizlemek güvenlik değildir" (CLAUDE.md md.2) kuralı gereği aynı
 * sınır backend'de de uygulanır. Uçlar Hızlı Bilişim'e kontör/yan etki üretebilen
 * çağrılar yaptığı için bu kapı zorunludur.
 * NOT: Rol adları satır içi yazılır — runtime authz jeneratörü guard'ı argüman
 * metninden okur (bkz. faz252dAuthzMatrixGenerator.mjs).
 */
hizliDefterRouter.use(requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'));

/**
 * 2026-09-12 (uydurma temizliği — KRİTİK):
 * ─────────────────────────────────────────────────────────────────────────────
 * Bu route'lar daha önce Hızlı Bilişim Bearer token'ını şöyle "çözüyordu":
 *
 *     const token = (req.headers.authorization || '').replace('Bearer ', '') || 'demo_token';
 *
 * İki ayrı uydurma vardı:
 *   (a) İstekteki `Authorization` başlığı İŞBEY'in KENDİ JWT'sidir (requireAuth
 *       onu doğrular). Bu değer Hızlı Bilişim tokenı sanılıp e-Connect'e
 *       gönderiliyordu → kimlik doğrulaması hiç yapılmıyordu.
 *   (b) Başlık yoksa `'demo_token'` gibi UYDURMA bir token ile çağrı yapılıyordu.
 * Her iki hâlde de servis katmanı hatayı yutup SABİT e-Defter verisi döndürdüğü
 * için panel gerçek bir e-Defter durumu gösteriyordu (bkz. hizliDefterService
 * başlığı). CLAUDE.md md.1: "API hatasında asla sahte/simüle başarılı response
 * üretilmez; gerçek hata döndürülür."
 *
 * Doğru desen (efatura.ts / hizliTeknolojiProvider ile aynı): token, isteğin
 * kiracısının e-Fatura ayarlarından `ensureTenantToken` ile alınır; kiracı
 * kimliği TOKEN bağlamından (`resolveRequestTenantId`) gelir — query/body'den
 * ASLA. Kimlik çözümlenemezse istek 500 ile açıkça başarısız olur.
 */
async function resolveToken(req: Request): Promise<{ token: string; isTest: boolean }> {
  const tenantId = resolveRequestTenantId(req);
  const { settings } = ProviderFactory.getProviderForTenant(tenantId);
  const isTest = settings.environment !== 'PRODUCTION';
  const { token } = await ensureTenantToken(settings, isTest);
  return { token, isTest };
}

/**
 * Tenant token çözümleme hatasını tutarlı biçimde döner (fail-closed).
 * 2026-09-12: Entegratör yapılandırması eksikse bu bir sunucu/kurulum eksiğidir
 * (503 + `configured: false`); entegratör reddi ise 502'dir. İkisi karıştırılmaz.
 */
function tokenError(res: Response, err: any) {
  const msg = err?.message || 'Hızlı Bilişim kimliği çözümlenemedi.';
  // Kiracı kimliği token bağlamından çözülemedi (requireAuth sonrası beklenmez).
  // Bu bir KİMLİK sorunudur, entegratör arızası değil — 502'ye düşürülmesi
  // "Hızlı Bilişim bozuk" izlenimi verirdi (yanlış sınıflama).
  if (err?.name === 'TenantResolutionError' || /^TENANT_UNRESOLVED/.test(msg)) {
    return res.status(401).json({ success: false, configured: false, data: null, message: msg });
  }
  if (ProviderConfigurationError.is(err)) {
    return res.status(503).json({ success: false, configured: false, data: null, message: msg });
  }
  // Kalan durum: entegratör kimliği doğrulanamadı (ör. Login/UtilEncrypt reddi).
  // Bu üst bağımlılık arızasıdır (502); istemci kusuru DEĞİLDİR.
  res.status(502).json({ success: false, data: null, message: msg });
}

// GET /api/edefter/processes - Aktif e-Defter süreçlerini oku
hizliDefterRouter.get('/processes', async (req: Request, res: Response) => {
  try {
    const { token, isTest } = await resolveToken(req);
    const result = await HizliDefterService.processReadActive(token, isTest);
    res.json(result);
  } catch (err: any) {
    tokenError(res, err);
  }
});

// POST /api/edefter/create - Yeni e-Defter oluşturma süreci
hizliDefterRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const { token, isTest } = await resolveToken(req);
    const result = await HizliDefterService.processCreate(req.body, token, isTest);
    res.json(result);
  } catch (err: any) {
    tokenError(res, err);
  }
});

// GET /api/edefter/sequence - Defter ve berat sıra numaraları
hizliDefterRouter.get('/sequence', async (req: Request, res: Response) => {
  try {
    const { token, isTest } = await resolveToken(req);
    const result = await HizliDefterService.readEDefterSequence(token, isTest);
    res.json(result);
  } catch (err: any) {
    tokenError(res, err);
  }
});

// GET /api/edefter/list - Yıllık defter listesi
hizliDefterRouter.get('/list', async (req: Request, res: Response) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const { token, isTest } = await resolveToken(req);
    const result = await HizliDefterService.eDefterRead(year, token, isTest);
    res.json(result);
  } catch (err: any) {
    tokenError(res, err);
  }
});

// POST /api/edefter/inventory - Envanter defteri oluştur
hizliDefterRouter.post('/inventory', async (req: Request, res: Response) => {
  try {
    const { token, isTest } = await resolveToken(req);
    const result = await HizliDefterService.processCreateInventory(req.body, token, isTest);
    res.json(result);
  } catch (err: any) {
    tokenError(res, err);
  }
});
