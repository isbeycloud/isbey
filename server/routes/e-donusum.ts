/**
 * İŞBEY CLOUD — e-Dönüşüm Tercih Ucu (2026-10-15)
 * ================================================
 * Deneme süresi bitince kullanıcının verdiği kararı kaydeder:
 *   ON_MUHASEBE → ön muhasebeye devam
 *   E_DONUSUM   → e-Fatura/e-Belge sürecine geçiş
 *
 * Kural: karar BİR KEZ verilir ve değiştirilemez (karar anı ve veren kullanıcı
 * denetim kaydına yazılır). Karardan sonra deneme kapısı kapanır.
 *
 * Bu uç, deneme kapısı KİLİTLİYKEN de erişilebilir (kullanıcı kararı vermeli).
 */
import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth, requireRole, resolveTenant } from '../middleware/authGuards';
import { evaluateTrialGate, menusForChoice } from '../services/trialGateService';
import { submitApplication } from '../services/eServiceApplications';

export const eDonusumRouter = Router();

const VALID_CHOICES = ['ON_MUHASEBE', 'E_DONUSUM'] as const;
type Choice = typeof VALID_CHOICES[number];

eDonusumRouter.use(requireAuth, resolveTenant);

/**
 * E-DÖNÜŞÜM BAŞVURU AKIŞI (2026-10-15, kullanıcı kararı "kayıtta VKN ile çek").
 *
 * Deneme süresi dolmadan karar VERİLMEZ (`DECISION_NOT_REQUIRED`); süre bitince
 * seçenekler şunlardır:
 *   1. Ön muhasebe → karar BİR KEZ kaydedilir, kapı açılır.
 *   2. e-Dönüşüm → kararınız e-hizmet BAŞVURUSU yoluyla alınır: kullanıcı önce
 *      hizmet başvurusunu oluşturur (`POST /applications`), teklif/fiyat
 *      hazırlandığında müşteri onaylar. Karar kaydı, ücretlendirme bilgisi
 *      netleştiği için oradandır — bu uç yalnız tarih ve başvuruyu gösterir.
 */
eDonusumRouter.get('/applications', (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const applications = (storage.getState().eServiceApplications || [])
    .filter(a => a.tenantId === tenantId)
    .map(a => ({ ...a }));
  const gate = evaluateTrialGate(storage.getState().tenants.find(t => t.id === tenantId) || {});
  res.json({
    success: true,
    choice: storage.getState().tenants.find(t => t.id === tenantId)?.edonusumChoice || null,
    trial: {
      state: gate.state,
      expiresAt: gate.expiresAt,
      daysRemaining: gate.daysRemaining,
      decisionRequired: gate.state === 'DECISION_REQUIRED',
    },
    applications,
    checkoutAvailable: false,
  });
});

eDonusumRouter.post('/applications', requireRole('COMPANY_ADMIN'), async (req: Request, res: Response) => {
  try {
    const application = await submitApplication(req.tenantId!, req.user!.id, req.body || {});
    res.status(201).json({ success: true, application });
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
});

/** GET /api/v1/e-donusum/choice — mevcut karar ve deneme durumu */
eDonusumRouter.get('/choice', (req: Request, res: Response) => {
  const tenant = (storage.getState().tenants || []).find(t => t.id === req.tenantId);
  if (!tenant) return res.status(404).json({ success: false, message: 'Firma bulunamadı.' });
  const gate = evaluateTrialGate(tenant);
  res.json({
    success: true,
    choice: tenant.edonusumChoice || null,
    choiceAt: tenant.edonusumChoiceAt || null,
    trial: {
      state: gate.state,
      expiresAt: gate.expiresAt,
      daysRemaining: gate.daysRemaining,
      decisionRequired: gate.state === 'DECISION_REQUIRED',
    },
    options: [
      { value: 'ON_MUHASEBE', label: 'Ön muhasebeye devam et' },
      { value: 'E_DONUSUM', label: 'e-Fatura / e-Belge sürecine geç' },
    ],
  });
});

/**
 * POST /api/v1/e-donusum/choice — kararı kaydeder (bir kez, geri alınamaz).
 *
 * Karar YÖNÜ:
 *   - ON_MUHASEBE → doğrudan bu uçtan kaydedilir.
 *   - E_DONUSUM   → BU UÇTAN VERİLEMEZ (400): karar e-hizmet başvurusu
 *     yoluyla alınır (`POST /applications` → SUBMITTED → QUOTED → ödeme
 *     onayı). Gerekçe: e-Fatura/e-Belge geçişi ücretlidir; "butona basıp
 *     geçtim" kararı destek/sözleşme sürecini atlatırdı. E_DONUSUM buradan
 *     gönderilirse yanıt 400 + başvuru yolu bilgisi döner.
 */
eDonusumRouter.post('/choice', requireRole('COMPANY_ADMIN'), (req: Request, res: Response) => {
  const choice = String(req.body?.choice || '') as Choice;
  if (!VALID_CHOICES.includes(choice)) {
    return res.status(400).json({ success: false, message: 'Geçerli bir tercih yapın (Ön muhasebe / e-Dönüşüm).' });
  }

  const tenantId = req.tenantId!;
  const user = req.user!;
  const tenant = (storage.getState().tenants || []).find(t => t.id === tenantId);
  if (!tenant) return res.status(404).json({ success: false, message: 'Firma bulunamadı.' });

  if (tenant.edonusumChoice) {
    return res.status(409).json({
      success: false,
      code: 'CHOICE_ALREADY_MADE',
      message: `Bu firma için tercih zaten verilmiş (${tenant.edonusumChoice}). Değişiklik için destek ile iletişime geçin.`,
    });
  }

  if (choice === 'E_DONUSUM') {
    return res.status(400).json({
      success: false,
      code: 'EDONUSUM_REQUIRES_APPLICATION',
      message: 'e-Dönüşüm geçişi ücretlidir; tercih e-hizmet başvurusu yoluyla alınır. Önce POST /api/v1/e-donusum/applications ile başvurunuzu oluşturun.',
      applicationUrl: '/api/v1/e-donusum/applications',
    });
  }

  const gate = evaluateTrialGate(tenant);
  if (gate.state !== 'DECISION_REQUIRED') {
    return res.status(409).json({
      success: false,
      code: 'DECISION_NOT_REQUIRED',
      message: gate.state === 'CLOSED'
        ? 'Tercih zaten verilmiş.'
        : `Deneme süreniz devam ediyor (${gate.daysRemaining} gün). Tercih, deneme bitiminde alınır.`,
    });
  }

  const at = new Date().toISOString();
  storage.runTransaction(draft => {
    const target = draft.tenants.find(t => t.id === tenantId)!;
    if (target.edonusumChoice) throw new Error('Tercih bu işlem sırasında zaten verildi.');
    target.edonusumChoice = choice;
    target.edonusumChoiceAt = at;
    target.updatedAt = at;
    // Ön muhasebe seçildiyse kapsam AYNEN kalır (e-Dönüşüm menüleri kapalı).
    // Fatura/KDV/muhasebe mantığı DEĞİŞMEZ (CLAUDE.md md.3).
    for (const membership of draft.tenantUsers || []) {
      if (membership.tenantId !== tenantId) continue;
      membership.allowedMenuIds = menusForChoice(choice);
    }
  });

  storage.addAuditLog({
    userId: user.id,
    username: user.username,
    companyId: tenantId,
    companyName: tenant.name,
    action: 'EDONUSUM_CHOICE',
    module: 'AUTH',
    ipAddress: req.ip || '127.0.0.1',
    details: `e-Dönüşüm tercihi kaydedildi: ${choice}`,
  });

  res.json({
    success: true,
    choice,
    choiceAt: at,
    message: 'Tercihiniz kaydedildi: ön muhasebe kullanımına devam edebilirsiniz.',
  });
});
