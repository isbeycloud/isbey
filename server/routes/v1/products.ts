import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { Product, ProductCategory, Unit, Warehouse } from '../../db/schema';
import { filterOwned, assertOwnedWarehouse } from '../../security/tenantOwnership';
import { StockService } from '../../services/stockService';

export const v1ProductsRouter = Router();

v1ProductsRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/products
 * Sayfalanmış, filtrelenmiş ürün listesi
 */
v1ProductsRouter.get('/', requirePermission(PERMISSIONS.PRODUCTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const {
    page = '1',
    limit = '25',
    search = '',
    categoryId,
    warehouseId,
    criticalOnly,
    sort = 'name',
    order = 'asc',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  let list = (db.products || []).filter(
    p => (p.tenantId === tenantId || (tenantId === 'tnt-isbey' && !p.tenantId)) && !p.deletedAt
  );

  // Arama (Barkod, Kod, Ad)
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      p =>
        p.name?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q) ||
        p.barcode?.includes(q)
    );
  }

  // Kategori Filtresi
  if (categoryId) {
    list = list.filter(p => p.categoryId === categoryId || p.groupId === categoryId);
  }

  // Depo Filtresi
  if (warehouseId) {
    list = list.filter(p => p.warehouseId === warehouseId);
  }

  // Kritik Stok Filtresi
  if (criticalOnly === 'true') {
    list = list.filter(p => (p.currentStock || 0) <= (p.criticalStock || 0));
  }

  // Sıralama
  list.sort((a: any, b: any) => {
    const valA = a[sort] ?? '';
    const valB = b[sort] ?? '';
    if (typeof valA === 'number' && typeof valB === 'number') {
      return order === 'desc' ? valB - valA : valA - valB;
    }
    return order === 'desc'
      ? String(valB).localeCompare(String(valA), 'tr')
      : String(valA).localeCompare(String(valB), 'tr');
  });

  const total = list.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = list.slice(startIndex, startIndex + limitNum);

  const summary = {
    totalProducts: list.length,
    criticalCount: list.filter(p => (p.currentStock || 0) <= (p.criticalStock || 0)).length,
    totalStockQuantity: list.reduce((sum, p) => sum + (p.currentStock || 0), 0),
    totalInventoryCost: list.reduce((sum, p) => sum + (p.currentStock || 0) * (p.purchasePrice || 0), 0),
    totalInventoryPotentialSales: list.reduce((sum, p) => sum + (p.currentStock || 0) * (p.salePrice || 0), 0),
  };

  res.json({
    success: true,
    data: paginated,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
    summary,
  });
});

/**
 * POST /api/v1/products
 * Yeni ürün oluşturma (Çoklu barkod, birim, açılış stoğu)
 */
v1ProductsRouter.post('/', requirePermission(PERMISSIONS.PRODUCTS_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    // 2026-10-17 GÜVENLİK: `...req.body` en SONA konulmaz — gövdedeki `tenantId`
    // sunucunun çözdüğü firmayı EZEBİLİR ve depo kapısı yanlış firmaya göre
    // doğrulanır. Sahiplik alanları sunucu kararıdır (gövdeden yazılmaz).
    const product = await StockService.createProduct({
      ...req.body,
      tenantId,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.status(201).json({ success: true, product });
  } catch (err: any) {
    // Depo kapısı hatası kendi kodunu korur (403/400).
    res.status(err?.statusCode || 400).json({ success: false, code: err?.code, message: err.message });
  }
});

/**
 * GET /api/v1/products/:id
 * Ürün detay ve stok hareketleri
 */
v1ProductsRouter.get('/:id', requirePermission(PERMISSIONS.PRODUCTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const product = (db.products || []).find(
    p => p.id === req.params.id && (p.tenantId === tenantId || (tenantId === 'tnt-isbey' && !p.tenantId)) && !p.deletedAt
  );

  if (!product) {
    return res.status(404).json({ success: false, message: 'Ürün bulunamadı.' });
  }

  const movements = (db.stockMovements || []).filter(
    m => m.productId === product.id && (m.tenantId === tenantId || (tenantId === 'tnt-isbey' && !m.tenantId))
  );

  res.json({ success: true, product, movements });
});

/**
 * PUT /api/v1/products/:id
 * Ürün güncelleme
 */
v1ProductsRouter.put('/:id', requirePermission(PERMISSIONS.PRODUCTS_UPDATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();
  const product = (db.products || []).find(
    p => p.id === req.params.id && (p.tenantId === tenantId || (tenantId === 'tnt-isbey' && !p.tenantId)) && !p.deletedAt
  );

  if (!product) {
    return res.status(404).json({ success: false, message: 'Ürün bulunamadı.' });
  }

  const updates = req.body;
  delete updates.id;
  delete updates.tenantId;
  delete updates.currentStock; // doğrudan değiştirilemez

  // 2026-10-17 GÜVENLİK: `warehouseId` gövdeden geldiği gibi YAZILAMAZ.
  // Eski hâlde `Object.assign` bu alanı doğrulamadan ürüne yazıyordu; ürünün
  // deposu fatura/irsaliye stok düşümünde hedef seçilirken kullanıldığı için
  // yabancı bir depo kimliği (veya canlıda VAR OLMAYAN `'wh-default'`)
  // ürüne işlenebiliyordu. Artık depo SAHİPLİK kapısından geçer.
  try {
    if (updates.warehouseId !== undefined && updates.warehouseId !== null && updates.warehouseId !== '') {
      updates.warehouseId = assertOwnedWarehouse(storage.getState().warehouses, updates.warehouseId, tenantId).id;
    } else if (updates.warehouseId === '' || updates.warehouseId === null) {
      // Boş değer bir depo ATAMASI DEĞİLDİR: alan gövdeden düşürülür ve ürünün
      // MEVCUT deposu korunur (kısmi güncelleme). Böylece boş dize diske
      // yazılmaz; canlıda VAR OLMAYAN bir kimliğe de düşülmez.
      delete updates.warehouseId;
    }
  } catch (err: any) {
    // Depo kapısı hatası kendi kodunu korur (403/400).
    return res.status(err?.statusCode || 400).json({ success: false, code: err?.code, message: err?.message });
  }

  Object.assign(product, updates, { updatedAt: new Date().toISOString() });

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'PRODUCT_UPDATED',
    module: 'STOCK',
    documentNo: product.code,
    ipAddress: req.ip || '127.0.0.1',
    details: `'${product.name}' ürünü güncellendi.`,
  });

  storage.save();
  res.json({ success: true, product });
});

/**
 * DELETE /api/v1/products/:id
 * Soft delete
 */
v1ProductsRouter.delete('/:id', requirePermission(PERMISSIONS.PRODUCTS_DELETE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();
  const product = (db.products || []).find(
    p => p.id === req.params.id && (p.tenantId === tenantId || (tenantId === 'tnt-isbey' && !p.tenantId)) && !p.deletedAt
  );

  if (!product) {
    return res.status(404).json({ success: false, message: 'Ürün bulunamadı.' });
  }

  product.deletedAt = new Date().toISOString();
  product.deletedBy = user.fullName || user.username;
  product.active = false;

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'PRODUCT_DELETED',
    module: 'STOCK',
    documentNo: product.code,
    ipAddress: req.ip || '127.0.0.1',
    details: `'${product.name}' ürünü silindi (soft delete).`,
  });

  storage.save();
  res.json({ success: true, message: 'Ürün silindi.' });
});

/**
 * POST /api/v1/products/adjust
 * Sayım ve stok miktar düzeltme
 */
v1ProductsRouter.post('/adjust', requirePermission(PERMISSIONS.PRODUCTS_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    // 2026-10-17 GÜVENLİK: sahiplik alanları gövdeden EZİLEMEZ (bkz. POST /).
    const result = await StockService.adjustStock({
      ...req.body,
      tenantId,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    // Depo kapısı hatası kendi kodunu korur (403/400).
    res.status(err?.statusCode || 400).json({ success: false, code: err?.code, message: err.message });
  }
});

/**
 * POST /api/v1/warehouses/transfer
 * Depolar arası transfer
 */
v1ProductsRouter.post('/warehouses/transfer', requirePermission(PERMISSIONS.WAREHOUSES_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;

  try {
    // 2026-10-17 GÜVENLİK: sahiplik alanları gövdeden EZİLEMEZ (bkz. POST /).
    const result = await StockService.transferWarehouse({
      ...req.body,
      tenantId,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    // Depo kapısı hatası kendi kodunu korur (403/400).
    res.status(err?.statusCode || 400).json({ success: false, code: err?.code, message: err.message });
  }
});

/**
 * GET /api/v1/categories
 */
v1ProductsRouter.get('/categories', requirePermission(PERMISSIONS.PRODUCTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  StockService.seedStockMetadata(tenantId);
  const categories = (db.productCategories || []).filter(c => !c.tenantId || c.tenantId === tenantId);
  res.json({ success: true, categories });
});

/**
 * GET /api/v1/units
 */
v1ProductsRouter.get('/units', requirePermission(PERMISSIONS.PRODUCTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  StockService.seedStockMetadata(tenantId);
  const units = (db.units || []).filter(u => !u.tenantId || u.tenantId === tenantId);
  res.json({ success: true, units });
});

/**
 * GET /api/v1/warehouses
 */
v1ProductsRouter.get('/warehouses', requirePermission(PERMISSIONS.WAREHOUSES_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  // 2026-10-17 GÜVENLİK: `!w.tenantId` KOŞULU SIZINTIYDI — sahipsiz depo
  // (canlıdaki `'wh-1'` gibi) HER firmaya listeleniyordu. Tek kaynak `isOwnedBy`:
  // sahipsiz kayıt yalnız varsayılan firmada görünür. Liste ile yazma kapısı
  // (`assertOwnedWarehouse`) aynı kuralı uygular; aksi hâlde istemci listede
  // gördüğü depoyu seçip 403 alırdı.
  const warehouses = filterOwned(db.warehouses, tenantId);
  res.json({ success: true, warehouses });
});
