/**
 * İŞBEY CLOUD — Kullanıcı Görünürlük Kapsamları (2026-10-12)
 * ==========================================================
 * Firma yöneticisi, muhasebeci/personel kullanıcıları için menü ve hesap
 * görünürlüğünü kısıtlar (ekran görüntüsündeki "YETKİLENDİRME" sekmesi).
 *
 * GÜVENLİK:
 *  - requireAuth + resolveTenant + requirePermission. Yazma `users.update`
 *    ister (kullanıcı yönetimi yetkisidir); okuma `users.view`.
 *  - Kapsam SADECE kendi tenant'ının kullanıcılarına tanımlanabilir (IDOR).
 *  - BU UÇLAR YALNIZCA TANIM YÖNETİR. Asıl kısıtlama veri uçlarındadır
 *    (kasa/banka listeleme filtreleri) + istemci sidebar filtresindedir.
 *    Tanım tek başına güvenlik DEĞİLDİR — "sadece sidebar gizlemek güvenlik
 *    değildir" kuralı gereği filtre sunucuda da uygulanır.
 *
 * SEMANTİK (şemadakiyle aynı):
 *  - Kayıt YOKSA her şey görünür. Kapsam daraltıcıdır, genişletici değil.
 *  - `menus` belirtilmeyen menü AÇIK sayılır.
 *  - Hesap listeleri BOŞSA o türün tamamı görünür.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import type { ScopeMenuKey, UserVisibilityScope } from '../../db/schema';

export const v1UserScopesRouter = Router();

v1UserScopesRouter.use(requireAuth, resolveTenant);

/** Geçerli menü anahtarları (şemadaki birliğin çalışma anı kopyası). */
const VALID_MENUS: ReadonlySet<string> = new Set([
  'dashboard', 'maas', 'vergi', 'finansal-tablolar',
  'alis-faturalari', 'satis-faturalari', 'cekler', 'senetler',
  'masraflar', 'kdv-detaylari', 'ba-bs', 'vadesi-gecenler',
  'stok-durum', 'banka-hareketleri', 'musteri-listesi',
]);

function cleanMenus(input: unknown): Partial<Record<ScopeMenuKey, boolean>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Partial<Record<ScopeMenuKey, boolean>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (VALID_MENUS.has(key) && typeof value === 'boolean') {
      (out as Record<string, boolean>)[key] = value;
    }
  }
  return out;
}

function cleanIdList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(
    input.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map(v => v.trim())
  )];
}

/** Tenant'ın kullanıcısını bulur (başka firmanın kullanıcısına kapsam YOK). */
function findTenantUser(state: ReturnType<typeof storage.getState>, userId: string, tenantId: string) {
  return (state.users || []).find(u => String((u as any).id) === String(userId) && String((u as any).tenantId || (u as any).companyId || '') === tenantId);
}

/**
 * GET /api/v1/user-scopes/me
 * Giriş yapmış kullanıcının KENDİ kapsamını döndürür. İstemci (sidebar, liste
 * filtreleri) bunu kullanır. İzin kapısı YOKTUR (kendi kaydı) — yalnız auth.
 *
 * SIRA ÖNEMLİ: Bu tanım `/:userId` ÖNCESİNDE olmalı; yoksa Express "me"yi
 * kullanıcı kimliği sanır ve `findTenantUser("me")` 404 döndürür.
 */
v1UserScopesRouter.get('/me', (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Oturum bulunamadı.' });
  const db = storage.getState();
  const scope = (db.userScopes || []).find(s => s.userId === String(userId) && s.tenantId === tenantId) || null;
  res.json({ success: true, scope });
});

/**
 * GET /api/v1/user-scopes?userId=...
 * Yöneticinin bir kullanıcının kapsamını okuması. Kayıt yoksa `{ scope: null }`.
 */
v1UserScopesRouter.get('/', requirePermission(PERMISSIONS.USERS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { userId } = req.query as Record<string, string>;
  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId zorunludur.' });
  }
  const db = storage.getState();
  const scope = (db.userScopes || []).find(s => s.userId === String(userId) && s.tenantId === tenantId) || null;
  res.json({ success: true, scope });
});

/**
 * PUT /api/v1/user-scopes/:userId
 * Kapsamı oluşturur/günceller (upsert). Gövde kısmi olabilir; gönderilmeyen
 * alan korunur. `menus: {}` + boş listeler = kısıtlama YOK (her şey görünür).
 */
v1UserScopesRouter.put('/:userId', requirePermission(PERMISSIONS.USERS_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : String(req.params.userId || '');

  if (!findTenantUser(storage.getState(), userId, tenantId)) {
    return res.status(404).json({ success: false, message: 'Kullanıcı bu firmada bulunamadı.' });
  }

  const { menus, cashRegisterIds, bankAccountIds, employeeIds, taxTypes } = req.body || {};

  try {
    const saved = await storage.runTransaction(draft => {
      if (!draft.userScopes) draft.userScopes = [];
      let scope = draft.userScopes.find(s => s.userId === userId && s.tenantId === tenantId);
      const now = new Date().toISOString();

      // Kasa/banka/personel kimlikleri tenant'a ait olmalı; yabancı kimlik
      // sessizce ATILIR (başka firmanın hesabı kapsama giremez).
      const tenantCash = new Set((draft.cashRegisters || []).filter(c => (c.tenantId || tenantId) === tenantId).map(c => c.id));
      const tenantBank = new Set((draft.bankAccounts || []).filter(b => (b.tenantId || tenantId) === tenantId).map(b => b.id));
      const tenantEmp = new Set((draft.employees || []).filter(e => String((e as any).tenantId || tenantId) === tenantId).map(e => e.id));

      if (!scope) {
        const created: UserVisibilityScope = {
          id: `usc-${Date.now()}`,
          tenantId,
          userId,
          menus: cleanMenus(menus),
          cashRegisterIds: cleanIdList(cashRegisterIds).filter(id => tenantCash.size === 0 || tenantCash.has(id)),
          bankAccountIds: cleanIdList(bankAccountIds).filter(id => tenantBank.size === 0 || tenantBank.has(id)),
          employeeIds: cleanIdList(employeeIds).filter(id => tenantEmp.size === 0 || tenantEmp.has(id)),
          taxTypes: cleanIdList(taxTypes),
          updatedAt: now,
          updatedBy: (req as any).user?.id,
        };
        draft.userScopes.push(created);
        return created;
      }

      if (menus !== undefined) scope.menus = cleanMenus(menus);
      if (cashRegisterIds !== undefined) {
        scope.cashRegisterIds = cleanIdList(cashRegisterIds).filter(id => tenantCash.size === 0 || tenantCash.has(id));
      }
      if (bankAccountIds !== undefined) {
        scope.bankAccountIds = cleanIdList(bankAccountIds).filter(id => tenantBank.size === 0 || tenantBank.has(id));
      }
      if (employeeIds !== undefined) {
        scope.employeeIds = cleanIdList(employeeIds).filter(id => tenantEmp.size === 0 || tenantEmp.has(id));
      }
      if (taxTypes !== undefined) scope.taxTypes = cleanIdList(taxTypes);
      scope.updatedAt = now;
      scope.updatedBy = (req as any).user?.id;
      return scope;
    });

    storage.addAuditLog({
      userId: (req as any).user?.id || 'admin',
      username: (req as any).user?.username || 'admin',
      action: 'UPDATE',
      module: 'YONETIM',
      documentNo: userId,
      ipAddress: req.ip || '127.0.0.1',
      details: `Kullanıcı görünürlük kapsamı güncellendi: ${userId}`,
    });

    res.json({ success: true, scope: saved, message: 'Yetki kapsamı kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/v1/user-scopes/:userId
 * Kapsamı KALDIRIR (kullanıcı her şeyi görür hale gelir). Silme kapsamın
 * kendisinedir; kullanıcıya dokunulmaz.
 */
v1UserScopesRouter.delete('/:userId', requirePermission(PERMISSIONS.USERS_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : String(req.params.userId || '');

  try {
    const removed = await storage.runTransaction(draft => {
      const idx = (draft.userScopes || []).findIndex(s => s.userId === userId && s.tenantId === tenantId);
      if (idx < 0) throw new Error('Kapsam bulunamadı.');
      const [gone] = draft.userScopes!.splice(idx, 1);
      return gone;
    });
    res.json({ success: true, scope: removed, message: 'Yetki kapsamı kaldırıldı (tam görünüm).' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
