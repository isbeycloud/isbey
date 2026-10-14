/**
 * İŞBEY CLOUD — Varyant Özellikleri (Renk, Ebat, Malzeme…)
 * ========================================================
 * 2026-10-12: Ürün varyantlarının ÖZELLİK tanımları. Değerler (Kırmızı/Mavi,
 * S/M/L) özelliğin içinde gömülü tutulur.
 *
 * GÜVENLİK:
 *  - requireAuth + resolveTenant (router seviyesinde) + requirePermission
 *    (uç seviyesinde). Mevcut stok izinleri kullanılır — yeni izin kodu YOK
 *    (canlı rol kayıtlarında kayma riski taşınmaz).
 *  - Tenant izolasyonu her okuma/yazmada zorunlu (IDOR koruması).
 *  - Değer silinirse o değeri kullanan varyant ATIFLARI temizlenemez (varyant
 *    ürün içinde gömülü); bu yüzden silme YOKTUR — yalnız pasife alma.
 *    Pasif özelliğin değerleri yeni ürünlerde seçilemez, mevcut kayıtlar
 *    bozulmaz.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { VariantOption } from '../../db/schema';

export const v1VariantOptionsRouter = Router();

v1VariantOptionsRouter.use(requireAuth, resolveTenant);

function visibleOptions(state: ReturnType<typeof storage.getState>, tenantId: string): VariantOption[] {
  return (state.variantOptions || []).filter(
    o => o.tenantId === tenantId || (tenantId === 'tnt-isbey' && !o.tenantId)
  );
}

function findOwned(state: ReturnType<typeof storage.getState>, id: unknown, tenantId: string): VariantOption | undefined {
  const wanted = Array.isArray(id) ? id[0] : String(id || '');
  if (!wanted) return undefined;
  return visibleOptions(state, tenantId).find(o => o.id === wanted);
}

/** Değer adlarını temizler; boşları atar, tekrarları tekilleştirir. */
function sanitizeValues(input: unknown): Array<{ id?: string; name: string; swatch?: string; sortOrder?: number }> {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Array<{ id?: string; name: string; swatch?: string; sortOrder?: number }> = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Record<string, unknown>;
    const name = typeof v.name === 'string' ? v.name.trim() : '';
    if (!name) continue;
    const key = name.toLocaleLowerCase('tr');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: typeof v.id === 'string' && v.id.trim() ? v.id.trim() : undefined,
      name,
      swatch: typeof v.swatch === 'string' ? v.swatch.slice(0, 16) : undefined,
    });
  }
  return out;
}

/**
 * GET /api/v1/variant-options
 * Tenant'ın varyant özellikleri (pasifler dahil; `activeOnly=true` ile süzülür).
 */
v1VariantOptionsRouter.get('/', requirePermission(PERMISSIONS.PRODUCTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { activeOnly } = req.query as Record<string, string>;

  let list = visibleOptions(storage.getState(), tenantId);
  if (activeOnly === 'true') {
    list = list.filter(o => o.active !== false);
  }
  list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  res.json({ success: true, variantOptions: list });
});

/**
 * POST /api/v1/variant-options
 * Yeni varyant özelliği. Aynı ad ikinci kez açılamaz.
 */
v1VariantOptionsRouter.post('/', requirePermission(PERMISSIONS.PRODUCTS_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { name, selectionType, values } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Özellik adı zorunludur (örn. Renk, Ebat).' });
  }
  const trimmedName = name.trim();
  const cleanValues = sanitizeValues(values);
  if (cleanValues.length === 0) {
    return res.status(400).json({ success: false, message: 'En az bir değer girin (örn. Kırmızı, Mavi).' });
  }

  try {
    const created = await storage.runTransaction(draft => {
      const mevcut = (draft.variantOptions || []).filter(
        o => o.tenantId === tenantId || (tenantId === 'tnt-isbey' && !o.tenantId)
      );
      if (mevcut.some(o => o.name.toLocaleLowerCase('tr') === trimmedName.toLocaleLowerCase('tr'))) {
        throw new Error(`Bu adda bir özellik zaten var: ${trimmedName}`);
      }

      const now = new Date().toISOString();
      const option: VariantOption = {
        id: `vo-${Date.now()}`,
        tenantId,
        name: trimmedName,
        selectionType: selectionType === 'MULTI' ? 'MULTI' : 'SINGLE',
        values: cleanValues.map((v, i) => ({
          id: v.id || `vv-${Date.now()}-${i}`,
          name: v.name,
          swatch: v.swatch,
          sortOrder: i + 1,
        })),
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      if (!draft.variantOptions) draft.variantOptions = [];
      draft.variantOptions.push(option);
      return option;
    });

    storage.addAuditLog({
      userId: req.user?.id || 'admin',
      username: req.user?.username || 'admin',
      action: 'CREATE',
      module: 'STOCK',
      documentNo: created.name,
      ipAddress: req.ip || '127.0.0.1',
      details: `Varyant özelliği oluşturuldu: ${created.name} (${created.values.length} değer)`,
    });

    res.json({ success: true, variantOption: created, message: 'Varyant özelliği kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/v1/variant-options/:id
 * Özellik tanımını günceller. `id`/`tenantId`/`createdAt` ezilemez.
 * Mevcut değerlerin KİMLİĞİ korunur (varyant atıfları valueId ile bağlıdır);
 * listede OLMAYAN eski değer SİLİNMEZ, yalnız yeni adlarla güncellenir veya
 * eklenir. Değer Kaldırmak için ayrı bir kapı yoktur — değer pasife alınamaz
 * çünkü atıflar ürün içinde gömülüdür; istenmeyen değer yeni ürünlerde
 * seçilmez (istemci yalnız aktifleri gösterir).
 */
v1VariantOptionsRouter.put('/:id', requirePermission(PERMISSIONS.PRODUCTS_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!findOwned(storage.getState(), id, tenantId)) {
    return res.status(404).json({ success: false, message: 'Varyant özelliği bulunamadı.' });
  }

  const { name, selectionType, active, values } = req.body || {};

  try {
    const updated = await storage.runTransaction(draft => {
      const option = (draft.variantOptions || []).find(
        o => o.id === (Array.isArray(id) ? id[0] : id) &&
          (o.tenantId === tenantId || (tenantId === 'tnt-isbey' && !o.tenantId))
      );
      if (!option) throw new Error('Varyant özelliği bulunamadı.');

      if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed) throw new Error('Özellik adı boş olamaz.');
        const cakisma = (draft.variantOptions || []).some(
          o =>
            o.id !== option.id &&
            (o.tenantId === tenantId || (tenantId === 'tnt-isbey' && !o.tenantId)) &&
            o.name.toLocaleLowerCase('tr') === trimmed.toLocaleLowerCase('tr')
        );
        if (cakisma) throw new Error(`Bu adda bir özellik zaten var: ${trimmed}`);
        option.name = trimmed;
      }

      if (selectionType !== undefined) {
        option.selectionType = selectionType === 'MULTI' ? 'MULTI' : 'SINGLE';
      }
      if (active !== undefined) option.active = Boolean(active);

      // Değer güncelleme: id'si bilinen değer YERİNDE güncellenir (atıf korunur);
      // id'siz ad yeni değer olarak eklenir; listede olmayan eski değer KORUNUR
      // (varyant atıfları kopmasın diye sessiz silme YOKTUR).
      if (values !== undefined) {
        const clean = sanitizeValues(values);
        if (clean.length === 0) throw new Error('En az bir değer olmalı.');
        const byId = new Map(option.values.map(v => [v.id, v]));
        const next: typeof option.values = [];
        clean.forEach((v, i) => {
          const existing = v.id ? byId.get(v.id) : undefined;
          if (existing) {
            existing.name = v.name;
            existing.swatch = v.swatch;
            existing.sortOrder = i + 1;
            next.push(existing);
          } else {
            next.push({
              id: `vv-${Date.now()}-${i}`,
              name: v.name,
              swatch: v.swatch,
              sortOrder: i + 1,
            });
          }
        });
        // Eski değerleri sona ekle (sıraları korunur, atıflar kopmaz).
        for (const old of option.values) {
          if (!next.some(n => n.id === old.id)) next.push(old);
        }
        option.values = next;
      }

      option.updatedAt = new Date().toISOString();
      return option;
    });

    storage.addAuditLog({
      userId: req.user?.id || 'admin',
      username: req.user?.username || 'admin',
      action: 'UPDATE',
      module: 'STOCK',
      documentNo: updated.name,
      ipAddress: req.ip || '127.0.0.1',
      details: `Varyant özelliği güncellendi: ${updated.name}`,
    });

    res.json({ success: true, variantOption: updated, message: 'Varyant özelliği güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/v1/variant-options/:id
 * Silmez — PASİFE alır. Özellik silinseydi ürünlerdeki varyant atıfları
 * (optionId/valueId) sessizce anlamsız kalırdı.
 */
v1VariantOptionsRouter.delete('/:id', requirePermission(PERMISSIONS.PRODUCTS_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!findOwned(storage.getState(), id, tenantId)) {
    return res.status(404).json({ success: false, message: 'Varyant özelliği bulunamadı.' });
  }

  try {
    const updated = await storage.runTransaction(draft => {
      const option = (draft.variantOptions || []).find(
        o => o.id === (Array.isArray(id) ? id[0] : id) &&
          (o.tenantId === tenantId || (tenantId === 'tnt-isbey' && !o.tenantId))
      );
      if (!option) throw new Error('Varyant özelliği bulunamadı.');
      option.active = false;
      option.updatedAt = new Date().toISOString();
      return option;
    });

    storage.addAuditLog({
      userId: req.user?.id || 'admin',
      username: req.user?.username || 'admin',
      action: 'UPDATE',
      module: 'STOCK',
      documentNo: updated.name,
      ipAddress: req.ip || '127.0.0.1',
      details: `Varyant özelliği pasife alındı: ${updated.name}`,
    });

    res.json({ success: true, variantOption: updated, message: 'Varyant özelliği pasife alındı.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
