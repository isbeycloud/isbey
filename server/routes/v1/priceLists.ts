/**
 * İŞBEY CLOUD — Fiyat Listeleri (Fiyat Listesi Yönetimi)
 * =====================================================
 * 2026-10-12: Ürün başına TEK `salePrice` alanına ek olarak isimli satış
 * fiyat listeleri (Perakende, Toptan, Bayi, Proje…).
 *
 * Tasarım kararları:
 *  - `priceLists` AYRI bir koleksiyondur (liste tanımı tenant verisidir);
 *    ürünün listeye özel fiyatı ise `Product.salePrices` içinde GÖMÜLÜ durur.
 *    Gömülü tutulmasının nedeni: ürün silindiğinde/fiyatı değiştiğinde tek
 *    kayıtta tutarlı kalır ve JSON deposunda atomik yazılır.
 *  - `Product.salePrice` KORUNUR (12+ okuma noktası var); liste fiyatı yoksa
 *    belge satırı yine `salePrice`'a düşer. Bu uç hiçbir zaman `salePrice`'ı
 *    otomatik değiştirmez — sessiz fiyat kayması olmaz.
 *  - İzinler mevcut stok izinlerine bağlanır (`products.*`): yeni bir izin
 *    kodu EKLENMEZ, böylece canlı rol kayıtlarında yetki kaybı/kayması
 *    yaşanmaz (yeni kod eski DB'ye reconcile edilene kadar 403 riski taşır).
 *  - Silme YOKTUR; yalnız pasife alma (`active:false`). Fiyat listesi
 *    silinirse ona bağlı cariler ve ürün fiyatları sessizce anlamsızlaşırdı.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { PriceList } from '../../db/schema';

export const v1PriceListsRouter = Router();

v1PriceListsRouter.use(requireAuth, resolveTenant);

/** Gövdeden güvenle sayı oku — boş/geçersizse undefined döner (0 geçerlidir). */
function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Tenant kapsamlı liste erişimi (IDOR koruması).
 * `id` tipi Express 5'te `string | string[]` olabilir; bu yüzden geniş alınır
 * ve karşılaştırma öncesi tek değere indirilir.
 */
function findOwnedList(
  state: ReturnType<typeof storage.getState>,
  id: string | string[],
  tenantId: string
): PriceList | undefined {
  const wanted = Array.isArray(id) ? id[0] : id;
  return (state.priceLists || []).find(
    l => l.id === wanted && (l.tenantId === tenantId || (tenantId === 'tnt-isbey' && !l.tenantId))
  );
}

/**
 * GET /api/v1/price-lists
 * Tenant'ın fiyat listeleri (pasifler dahil; `activeOnly=true` ile süzülür).
 */
v1PriceListsRouter.get('/', requirePermission(PERMISSIONS.PRODUCTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { activeOnly } = req.query as Record<string, string>;

  const db = storage.getState();
  let list = (db.priceLists || []).filter(
    l => l.tenantId === tenantId || (tenantId === 'tnt-isbey' && !l.tenantId)
  );

  if (activeOnly === 'true') {
    list = list.filter(l => l.active !== false);
  }

  list = [...list].sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.name.localeCompare(b.name, 'tr'));

  res.json({ success: true, priceLists: list });
});

/**
 * POST /api/v1/price-lists
 * Yeni fiyat listesi. Aynı isim ikinci kez açılamaz (karışıklık önlenir).
 */
v1PriceListsRouter.post('/', requirePermission(PERMISSIONS.PRODUCTS_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { code, name, description, defaultDiscountRate, isDefault } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Fiyat listesi adı zorunludur.' });
  }

  const trimmedName = name.trim();

  try {
    const created = await storage.runTransaction(draft => {
      const mevcut = (draft.priceLists || []).filter(
        l => l.tenantId === tenantId || (tenantId === 'tnt-isbey' && !l.tenantId)
      );

      if (mevcut.some(l => l.name.toLocaleLowerCase('tr') === trimmedName.toLocaleLowerCase('tr'))) {
        throw new Error(`Bu adda bir fiyat listesi zaten var: ${trimmedName}`);
      }

      const now = new Date().toISOString();
      const makeDefault = Boolean(isDefault) || mevcut.length === 0;

      // Varsayılan işaretlenen yeni liste, önceki varsayılanı devre dışı bırakır.
      if (makeDefault) {
        for (const l of draft.priceLists || []) {
          if (l.tenantId === tenantId || (tenantId === 'tnt-isbey' && !l.tenantId)) l.isDefault = false;
        }
      }

      const priceList: PriceList = {
        id: `pl-${Date.now()}`,
        tenantId,
        code: code?.trim() || `FL-${String(mevcut.length + 1).padStart(3, '0')}`,
        name: trimmedName,
        description: description || '',
        defaultDiscountRate: optionalNumber(defaultDiscountRate) ?? 0,
        isDefault: makeDefault,
        sortOrder: mevcut.length + 1,
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      if (!draft.priceLists) draft.priceLists = [];
      draft.priceLists.push(priceList);
      return priceList;
    });

    storage.addAuditLog({
      userId: req.user?.id || 'admin',
      username: req.user?.username || 'admin',
      action: 'CREATE',
      module: 'STOCK',
      documentNo: created.code,
      ipAddress: req.ip || '127.0.0.1',
      details: `Fiyat listesi oluşturuldu: ${created.name} (${created.code})`,
    });

    res.json({ success: true, priceList: created, message: 'Fiyat listesi kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/v1/price-lists/:id
 * Liste tanımını günceller. `id`/`tenantId`/`createdAt` ezilemez.
 */
v1PriceListsRouter.put('/:id', requirePermission(PERMISSIONS.PRODUCTS_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!findOwnedList(storage.getState(), id, tenantId)) {
    return res.status(404).json({ success: false, message: 'Fiyat listesi bulunamadı.' });
  }

  const { code, name, description, defaultDiscountRate, isDefault, active, sortOrder } = req.body || {};

  try {
    const updated = await storage.runTransaction(draft => {
      const list = (draft.priceLists || []).find(
        l => l.id === id && (l.tenantId === tenantId || (tenantId === 'tnt-isbey' && !l.tenantId))
      );
      if (!list) throw new Error('Fiyat listesi bulunamadı.');

      if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed) throw new Error('Fiyat listesi adı boş olamaz.');
        const cakisma = (draft.priceLists || []).some(
          l =>
            l.id !== id &&
            (l.tenantId === tenantId || (tenantId === 'tnt-isbey' && !l.tenantId)) &&
            l.name.toLocaleLowerCase('tr') === trimmed.toLocaleLowerCase('tr')
        );
        if (cakisma) throw new Error(`Bu adda bir fiyat listesi zaten var: ${trimmed}`);
        list.name = trimmed;
      }

      if (code !== undefined) list.code = String(code).trim() || list.code;
      if (description !== undefined) list.description = String(description);
      if (defaultDiscountRate !== undefined) list.defaultDiscountRate = optionalNumber(defaultDiscountRate) ?? 0;
      if (sortOrder !== undefined) list.sortOrder = optionalNumber(sortOrder) ?? list.sortOrder;
      if (active !== undefined) list.active = Boolean(active);

      // Varsayılan işaretleme tektir: yeni varsayılan, diğerlerini temizler.
      if (isDefault === true) {
        for (const l of draft.priceLists || []) {
          if (l.tenantId === tenantId || (tenantId === 'tnt-isbey' && !l.tenantId)) l.isDefault = false;
        }
        list.isDefault = true;
      } else if (isDefault === false) {
        list.isDefault = false;
      }

      list.updatedAt = new Date().toISOString();
      return list;
    });

    storage.addAuditLog({
      userId: req.user?.id || 'admin',
      username: req.user?.username || 'admin',
      action: 'UPDATE',
      module: 'STOCK',
      documentNo: updated.code,
      ipAddress: req.ip || '127.0.0.1',
      details: `Fiyat listesi güncellendi: ${updated.name}`,
    });

    res.json({ success: true, priceList: updated, message: 'Fiyat listesi güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/v1/price-lists/:id
 * Silmez — PASİFE alır. Kullanımdaki bir listenin silinmesi, ona bağlı cari ve
 * ürün fiyatlarını sessizce anlamsız bırakırdı. Pasif liste yeni belgelerde
 * seçilemez, mevcut kayıtlar bozulmaz.
 */
v1PriceListsRouter.delete('/:id', requirePermission(PERMISSIONS.PRODUCTS_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!findOwnedList(storage.getState(), id, tenantId)) {
    return res.status(404).json({ success: false, message: 'Fiyat listesi bulunamadı.' });
  }

  try {
    const updated = await storage.runTransaction(draft => {
      const list = (draft.priceLists || []).find(
        l => l.id === id && (l.tenantId === tenantId || (tenantId === 'tnt-isbey' && !l.tenantId))
      );
      if (!list) throw new Error('Fiyat listesi bulunamadı.');

      list.active = false;
      list.isDefault = false;
      list.updatedAt = new Date().toISOString();
      return list;
    });

    storage.addAuditLog({
      userId: req.user?.id || 'admin',
      username: req.user?.username || 'admin',
      action: 'UPDATE',
      module: 'STOCK',
      documentNo: updated.code,
      ipAddress: req.ip || '127.0.0.1',
      details: `Fiyat listesi pasife alındı: ${updated.name}`,
    });

    res.json({ success: true, priceList: updated, message: 'Fiyat listesi pasife alındı.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
