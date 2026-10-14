import { Router } from 'express';
import { storage } from '../db/storage';
import { Product, ProductPriceEntry, StockMovement } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';

export const productsRouter = Router();

productsRouter.use(requireAuth);
productsRouter.use(resolveTenant);

// List all products (Tenant Isolated)
productsRouter.get('/', (req, res) => {
  const { groupId, warehouseId, search, criticalOnly } = req.query;
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  
  let list = db.products.filter(p => 
    p.tenantId === tenantId || (!p.tenantId && tenantId === 'tnt-isbey')
  );

  if (groupId && groupId !== 'ALL') {
    list = list.filter(p => p.groupId === groupId);
  }

  if (warehouseId && warehouseId !== 'ALL') {
    list = list.filter(p => p.warehouseId === warehouseId);
  }

  if (criticalOnly === 'true') {
    list = list.filter(p => p.currentStock <= p.criticalStock);
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.barcode ?? '').includes(q)
    );
  }

  res.json({ success: true, products: list });
});

// Barcode Lookup (for POS & Scanner - Tenant Isolated)
productsRouter.get('/barcode/:barcode', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const product = db.products.find(p => 
    p.barcode === req.params.barcode && p.active && (p.tenantId === tenantId || (!p.tenantId && tenantId === 'tnt-isbey'))
  );
  if (!product) {
    return res.status(404).json({ success: false, message: 'Barkoda ait aktif ürün bulunamadı.' });
  }
  res.json({ success: true, product });
});

// Get Product Groups & Warehouses (Tenant Isolated)
productsRouter.get('/meta/groups-warehouses', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  
  const warehouses = (db.warehouses || []).filter(w => 
    w.id.includes(tenantId) || tenantId === 'tnt-isbey' || w.isDefault
  );

  res.json({
    success: true,
    groups: db.productGroups,
    warehouses: warehouses.length > 0 ? warehouses : db.warehouses,
  });
});

// Get Single Product & Movements (Tenant Isolated & IDOR Protected)
productsRouter.get('/:id', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const product = db.products.find(p => 
    p.id === req.params.id && (p.tenantId === tenantId || (!p.tenantId && tenantId === 'tnt-isbey'))
  );
  if (!product) {
    return res.status(404).json({ success: false, message: 'Stok kartı bulunamadı.' });
  }

  const movements = db.stockMovements
    .filter(m => m.productId === product.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json({ success: true, product, movements });
});

/**
 * 2026-10-12: Varyant girdilerini sunucu tarafında temizler.
 *
 * Neden gerekli: istemci `variants` dizisini olduğu gibi gönderir. Geçersiz
 * girdiler (boş varyant kimliği, sayı olmayan stok/fiyat) diske yazılırsa stok
 * raporu ve belge satırı bozulur. Yalnızca geçerli girdiler alınır.
 *
 * @param variantOptionIds Ürünün kullandığı özellik kimlikleri.
 * @param options Tenant'ın varyant özellik tanımları (atıf doğrulama için).
 */
function sanitizeProductVariants(
  input: unknown,
  variantOptionIds: string[],
  options: import('../db/schema').VariantOption[]
): import('../db/schema').ProductVariant[] {
  if (!Array.isArray(input) || variantOptionIds.length === 0) return [];
  const byId = new Map(options.map(o => [o.id, o]));
  const seen = new Set<string>();
  const out: import('../db/schema').ProductVariant[] = [];
  const now = new Date().toISOString();

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Record<string, unknown>;
    const attrs = Array.isArray(v.attributes) ? v.attributes : [];
    // Her seçili özelliğe GEÇERLİ bir değer atanmalı; eksik/hatalı atıf varsa
    // satır atlanır (sessizce bozuk varyant yazılmaz).
    const cleanAttrs: Array<{ optionId: string; valueId: string }> = [];
    let valid = true;
    for (const optionId of variantOptionIds) {
      const found = attrs.find(
        (a: any) => a && typeof a === 'object' && a.optionId === optionId && typeof a.valueId === 'string'
      ) as { optionId: string; valueId: string } | undefined;
      const opt = byId.get(optionId);
      if (!found || !opt || !opt.values.some(val => val.id === found.valueId)) {
        valid = false;
        break;
      }
      cleanAttrs.push({ optionId, valueId: found.valueId });
    }
    if (!valid) continue;

    const key = cleanAttrs.map(a => `${a.optionId}=${a.valueId}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const stock = Number(v.currentStock);
    const sale = v.salePrice === undefined || v.salePrice === null || v.salePrice === '' ? undefined : Number(v.salePrice);
    const purchase = v.purchasePrice === undefined || v.purchasePrice === null || v.purchasePrice === '' ? undefined : Number(v.purchasePrice);
    const barcode = typeof v.barcode === 'string' && v.barcode.trim() ? v.barcode.trim() : undefined;
    const name = typeof v.name === 'string' && v.name.trim()
      ? v.name.trim()
      : cleanAttrs.map(a => byId.get(a.optionId)?.values.find(val => val.id === a.valueId)?.name || '').filter(Boolean).join(' / ');
    const imageUrl = typeof v.imageUrl === 'string' && v.imageUrl.trim() ? v.imageUrl.trim() : undefined;

    out.push({
      id: typeof v.id === 'string' && v.id.trim() ? v.id.trim() : `var-${Date.now()}-${out.length}`,
      attributes: cleanAttrs,
      name: name || `Varyant ${out.length + 1}`,
      barcode,
      currentStock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
      salePrice: sale !== undefined && Number.isFinite(sale) ? sale : undefined,
      purchasePrice: purchase !== undefined && Number.isFinite(purchase) ? purchase : undefined,
      salePrices: sanitizeProductPrices(v.salePrices),
      imageUrl,
      active: v.active !== false,
      createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
      updatedAt: now,
    });
    if (out.length >= 200) break;
  }
  return out;
}

/**
 * 2026-10-12: Fiyat listesi girdilerini sunucu tarafında temizler.
 *
 * Neden gerekli: istemci `salePrices` dizisini olduğu gibi gönderir. Geçersiz
 * girdiler (boş `priceListId`, sayı olmayan fiyat) diske yazılırsa belge satırı
 * `NaN` fiyatla hesaplanır ve fatura tutarı bozulur. Bu yüzden yalnızca geçerli
 * girdiler alınır; aynı listeye ait tekrar eden kayıtlar son değerle tekilleşir.
 */
function sanitizeProductPrices(input: unknown): ProductPriceEntry[] {
  if (!Array.isArray(input)) return [];
  const byList = new Map<string, ProductPriceEntry>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const priceListId = typeof entry.priceListId === 'string' ? entry.priceListId.trim() : '';
    if (!priceListId) continue;

    const sale = Number(entry.salePrice);
    if (!Number.isFinite(sale)) continue;

    const discount = Number(entry.discountRate);
    const purchase = Number(entry.purchasePrice);

    byList.set(priceListId, {
      priceListId,
      salePrice: sale,
      discountRate: Number.isFinite(discount) ? discount : undefined,
      purchasePrice: Number.isFinite(purchase) ? purchase : undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  return [...byList.values()];
}

// Create Product
productsRouter.post('/', async (req, res) => {
  const { barcode, code, name, groupId, unit, purchasePrice, salePrice, salePrices, variantOptionIds, variants, vatRate, criticalStock, warehouseId, description, imageUrl, initialStock } = req.body;

  // 2026-10-12: Satış fiyatı artık YALNIZCA `salePrice` değildir — ürün yalnız
  // fiyat listesi fiyatlarıyla da tanımlanabilir (taban fiyat 0 kalabilir).
  // Eski kapı `!salePrice` idi ve `salePrice: 0` + dolu `salePrices` kombinasyonunu
  // reddediyordu; bu, "fiyatı yalnız listeden gelen" ürünü imkânsız kılıyordu.
  // Zorunluluk şimdi "iki fiyat kanalından en az biri dolu" biçimindedir.
  const hasBasePrice = salePrice !== undefined && salePrice !== null && salePrice !== '' && Number.isFinite(Number(salePrice));
  const prices = sanitizeProductPrices(salePrices);
  if (!name || (!hasBasePrice && prices.length === 0)) {
    return res.status(400).json({ success: false, message: 'Ürün adı ve en az bir satış fiyatı (taban veya fiyat listesi) zorunludur.' });
  }

  try {
    const newProduct = await storage.runTransaction(draft => {
      const nextNum = draft.products.length + 1;
      const productCode = code || `STK-${String(nextNum).padStart(3, '0')}`;
      const productBarcode = barcode || `869${Date.now().toString().slice(-10)}`;

      const group = draft.productGroups.find(g => g.id === groupId);
      const warehouse = draft.warehouses.find(w => w.id === warehouseId) || draft.warehouses[0];
      const tenantId = req.tenantId || 'tnt-isbey';

      // 2026-10-12: Varyant özellikleri tenant'a ait olmalı (IDOR koruması).
      // Geçersiz/başka firmaya ait özellik kimliği sessizce ATILIR — varyant
      // satırı tanımsız özellikle yazılmaz.
      const tenantOptions = (draft.variantOptions || []).filter(
        o => o.tenantId === tenantId || (tenantId === 'tnt-isbey' && !o.tenantId)
      );
      const cleanOptionIds = Array.isArray(variantOptionIds)
        ? [...new Set(variantOptionIds.filter(id => typeof id === 'string' && tenantOptions.some(o => o.id === id && o.active !== false)))]
        : [];
      const cleanVariants = sanitizeProductVariants(variants, cleanOptionIds, tenantOptions);

      const product: Product = {
        id: `prd-${Date.now()}`,
        tenantId,
        barcode: productBarcode,
        code: productCode,
        name,
        groupId: groupId || draft.productGroups[0]?.id || 'grp-1',
        groupName: group?.name || 'Genel',
        unit: unit || 'Adet',
        purchasePrice: Number(purchasePrice) || 0,
        // 2026-10-12: Taban satış fiyatı verilmediyse liste fiyatlarının EN
        // DÜŞÜĞÜ taban kabul edilir. `salePrice`'ı hâlâ doğrudan okuyan yerler
        // (POS, raporlar, mobil, stok değerleme) 0 görürse bedava satış riski
        // doğar; bu yüzden 0 bırakmak yerine güvenli bir taban türetilir.
        salePrice: hasBasePrice
          ? Number(salePrice)
          : (prices.length > 0 ? Math.min(...prices.map(p => p.salePrice)) : 0),
        salePrices: prices.length > 0 ? prices : undefined,
        // 2026-10-12: Varyantlı üründe açılış stoğu VARYANT satırlarından gelir;
        // ürün `initialStock` alanı varyant varsa YOK SAYILIR (çift sayım olmaz).
        variantOptionIds: cleanOptionIds.length > 0 ? cleanOptionIds : undefined,
        variants: cleanVariants.length > 0 ? cleanVariants : undefined,
        vatRate: Number(vatRate) !== undefined ? Number(vatRate) : 20,
        criticalStock: Number(criticalStock) || 5,
        currentStock: cleanVariants.length > 0
          ? cleanVariants.reduce((s, v) => s + (Number(v.currentStock) || 0), 0)
          : (Number(initialStock) || 0),
        warehouseId: warehouse?.id || 'wh-1',
        warehouseName: warehouse?.name || 'Merkez Depo',
        description: description || '',
        imageUrl: imageUrl || undefined,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      draft.products.push(product);

      // 2026-10-12: Varyantlı üründe açılış stoğu VARYANT başına hareketle
      // kurulur. NEDEN: `recalculateBalances` varyant stoğunu hareketlerden
      // hesaplar; varyant satırındaki sayı tek başına yetmez (ilk belgede
      // varyant stoğu sıfırlanırdı). Varyant YOKSA mevcut davranış korunur.
      if (product.variants && product.variants.length > 0) {
        const now = new Date().toISOString();
        const dateStr = now.split('T')[0];
        for (const v of product.variants) {
          const qty = Number(v.currentStock) || 0;
          if (qty <= 0) continue;
          const movement: StockMovement = {
            id: `sm-${Date.now()}-${v.id}`,
            productId: product.id,
            variantId: v.id,
            variantName: v.name,
            productCode: product.code,
            productName: product.name,
            warehouseId: product.warehouseId ?? 'wh-1',
            warehouseName: product.warehouseName,
            documentNo: `DEV-${new Date().getFullYear()}-001`,
            documentType: 'ADJUSTMENT',
            movementType: 'COUNT_ADJUSTMENT',
            quantity: qty,
            direction: 'IN',
            unitPrice: product.purchasePrice,
            totalAmount: qty * product.purchasePrice,
            date: dateStr,
            notes: `Açılış Devir Stoğu (${v.name})`,
            userId: req.user?.id || 'admin',
            createdAt: now,
          };
          draft.stockMovements.push(movement);
        }
      } else if (Number(initialStock) > 0) {
        // If initial stock provided, create opening stock movement
        const movement: StockMovement = {
          id: `sm-${Date.now()}`,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          warehouseId: product.warehouseId ?? 'wh-1',
          warehouseName: product.warehouseName,
          documentNo: `DEV-${new Date().getFullYear()}-001`,
          documentType: 'ADJUSTMENT',
          movementType: 'COUNT_ADJUSTMENT',
          quantity: Number(initialStock),
          direction: 'IN',
          unitPrice: product.purchasePrice,
          totalAmount: Number(initialStock) * product.purchasePrice,
          date: new Date().toISOString().split('T')[0],
          notes: 'Açılış Devir Stoğu',
          userId: req.user?.id || 'admin',
          createdAt: new Date().toISOString(),
        };
        draft.stockMovements.push(movement);
      }

      return product;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'STOCK',
      documentNo: newProduct.code,
      ipAddress: req.ip || '127.0.0.1',
      details: `Yeni stok kartı eklendi: ${newProduct.name} (${newProduct.code})`,
    });

    res.json({ success: true, product: newProduct, message: 'Stok kartı kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update Product
productsRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    const updated = await storage.runTransaction(draft => {
      const product = draft.products.find(p => p.id === id);
      if (!product) throw new Error('Stok kartı bulunamadı.');

      const group = draft.productGroups.find(g => g.id === updateData.groupId);
      const warehouse = draft.warehouses.find(w => w.id === updateData.warehouseId);

      // 2026-10-12: Varyant stok farkı için ÖNCEKİ değerler (`Object.assign`
      // öncesi snapshot). Ürün kartından varyant stoğu değiştirilirse fark,
      // düzeltme hareketiyle deftere işlenir; yoksa `recalculateBalances`
      // ilk belgede değişimi silerdi.
      const beforeVariantStock = new Map(
        ((product.variants || []) as import('../db/schema').ProductVariant[]).map(v => [v.id, Number(v.currentStock) || 0])
      );

      // 2026-10-12: `salePrices` ham gövdeyle yazılamaz — geçersiz girdiler
      // (boş priceListId, sayı olmayan fiyat) NaN tutar üretir. POST ile aynı
      // temizleyiciden geçirilir. Alan HİÇ gönderilmediyse mevcut fiyatlar
      // korunur (kısmi güncelleme `salePrices`'ı silmez); boş dizi gönderilirse
      // tüm liste fiyatları kaldırılır.
      const sanitizedPrices = updateData.salePrices !== undefined
        ? sanitizeProductPrices(updateData.salePrices)
        : undefined;

      // 2026-10-12: Varyant güncellemesi. `variantOptionIds` HİÇ gönderilmediyse
      // mevcut varyant yapısı korunur; boş dizi gönderilirse varyantlar TAMAMEN
      // kaldırılır (ürün varyantsız olur). `variants` gönderildiyse temizlenir.
      const tenantId = req.tenantId || 'tnt-isbey';
      const tenantOptions = (draft.variantOptions || []).filter(
        o => o.tenantId === tenantId || (tenantId === 'tnt-isbey' && !o.tenantId)
      );
      let nextOptionIds: string[] | undefined;
      let nextVariants: import('../db/schema').ProductVariant[] | undefined;
      let variantsTouched = false;
      if (updateData.variantOptionIds !== undefined) {
        variantsTouched = true;
        const rawIds: unknown[] = Array.isArray(updateData.variantOptionIds) ? updateData.variantOptionIds : [];
        nextOptionIds = [...new Set(
          rawIds.filter((id): id is string => typeof id === 'string' && tenantOptions.some(o => o.id === id && o.active !== false))
        )];
        nextVariants = sanitizeProductVariants(updateData.variants, nextOptionIds, tenantOptions);
      } else if (updateData.variants !== undefined) {
        variantsTouched = true;
        nextOptionIds = product.variantOptionIds || [];
        nextVariants = sanitizeProductVariants(updateData.variants, nextOptionIds, tenantOptions);
      }

      Object.assign(product, {
        ...updateData,
        groupName: group ? group.name : product.groupName,
        warehouseName: warehouse ? warehouse.name : product.warehouseName,
        purchasePrice: Number(updateData.purchasePrice ?? product.purchasePrice),
        salePrice: Number(updateData.salePrice ?? product.salePrice),
        salePrices: sanitizedPrices !== undefined
          ? (sanitizedPrices.length > 0 ? sanitizedPrices : undefined)
          : product.salePrices,
        variantOptionIds: variantsTouched
          ? (nextOptionIds && nextOptionIds.length > 0 ? nextOptionIds : undefined)
          : product.variantOptionIds,
        // Varyant kaldırılırsa `variants` undefined olur; ürün varyantsız olur
        // ve `currentStock` mevcut değerinde kalır (stok hareketleri korunur).
        variants: variantsTouched
          ? (nextVariants && nextVariants.length > 0 ? nextVariants : undefined)
          : product.variants,
        vatRate: Number(updateData.vatRate ?? product.vatRate),
        criticalStock: Number(updateData.criticalStock ?? product.criticalStock),
        updatedAt: new Date().toISOString(),
      });

      // Varyantlı üründe ürün stoğu = varyant toplamıdır.
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        product.currentStock = product.variants.reduce((s, v) => s + (Number(v.currentStock) || 0), 0);
      }

      // 2026-10-12: Varyant stok FARKI için düzeltme hareketi. Ürün kartından
      // varyant stoğu değiştirilirse fark deftere işlenir; yoksa
      // `recalculateBalances` ilk belgede değişimi SİLERDİ. Yeni varyant
      // (önceden yoktu) için TAMAMI açılış sayılır.
      if (variantsTouched && Array.isArray(product.variants) && product.variants.length > 0) {
        const now = new Date().toISOString();
        const dateStr = now.split('T')[0];
        for (const v of product.variants as import('../db/schema').ProductVariant[]) {
          const before = beforeVariantStock.get(v.id);
          const after = Number(v.currentStock) || 0;
          const diff = before === undefined ? after : after - before;
          if (!Number.isFinite(diff) || diff === 0) continue;
          draft.stockMovements.push({
            id: `sm-${Date.now()}-${v.id}`,
            productId: product.id,
            variantId: v.id,
            variantName: v.name,
            productCode: product.code,
            productName: product.name,
            warehouseId: product.warehouseId ?? 'wh-1',
            warehouseName: product.warehouseName,
            documentNo: `DUZ-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
            documentType: 'ADJUSTMENT',
            movementType: 'COUNT_ADJUSTMENT',
            quantity: Math.abs(diff),
            direction: diff > 0 ? 'IN' : 'OUT',
            unitPrice: product.purchasePrice,
            totalAmount: Math.abs(diff) * product.purchasePrice,
            date: dateStr,
            notes: before === undefined
              ? `Varyant açılış stoğu (${v.name})`
              : `Varyant stok düzeltmesi (${v.name}): ${before} → ${after}`,
            userId: req.user?.id || 'admin',
            createdAt: now,
          });
        }
      }

      return product;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'UPDATE',
      module: 'STOCK',
      documentNo: updated.code,
      ipAddress: req.ip || '127.0.0.1',
      details: `Stok kartı güncellendi: ${updated.name}`,
    });

    res.json({ success: true, product: updated, message: 'Stok kartı güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Direct Stock In / Out Adjustment (Stok Hareketi Giriş / Çıkış)
productsRouter.post('/adjust', async (req, res) => {
  const { productId, warehouseId, type, quantity, unitPrice, notes } = req.body;
  const qty = Number(quantity);

  if (!productId || qty <= 0) {
    return res.status(400).json({ success: false, message: 'Geçerli bir ürün ve miktar giriniz.' });
  }

  try {
    const movement = await storage.runTransaction(draft => {
      const product = draft.products.find(p => p.id === productId);
      if (!product) throw new Error('Ürün bulunamadı.');

      const isOut = type === 'OUT';
      if (isOut && product.currentStock < qty) {
        throw new Error(`Yetersiz stok! Mevcut stok: ${product.currentStock} ${product.unit}`);
      }

      const warehouse = draft.warehouses.find(w => w.id === warehouseId) || draft.warehouses[0];
      const docNo = `DUZ-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

      const sm: StockMovement = {
        id: `sm-${Date.now()}`,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        documentNo: docNo,
        documentType: 'ADJUSTMENT',
        movementType: isOut ? 'SALE_RETURN' : 'COUNT_ADJUSTMENT',
        quantity: qty,
        direction: isOut ? 'OUT' : 'IN',
        unitPrice: Number(unitPrice) || product.purchasePrice,
        totalAmount: qty * (Number(unitPrice) || product.purchasePrice),
        date: new Date().toISOString().split('T')[0],
        notes: notes || (isOut ? 'Manuel Stok Çıkışı' : 'Manuel Stok Girişi'),
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };

      draft.stockMovements.push(sm);
      return sm;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'UPDATE',
      module: 'STOCK',
      documentNo: movement.documentNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${movement.productName} için ${movement.direction === 'IN' ? 'Stok Girişi' : 'Stok Çıkışı'}: ${movement.quantity} adet`,
    });

    res.json({ success: true, movement, message: 'Stok hareketi başarıyla işlendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Warehouse Transfer (Depolar Arası Transfer)
productsRouter.post('/transfer', async (req, res) => {
  const { productId, fromWarehouseId, toWarehouseId, quantity, notes } = req.body;
  const qty = Number(quantity);

  if (!productId || fromWarehouseId === toWarehouseId || qty <= 0) {
    return res.status(400).json({ success: false, message: 'Geçersiz transfer bilgileri veya aynı depolar seçildi.' });
  }

  try {
    const result = await storage.runTransaction(draft => {
      const product = draft.products.find(p => p.id === productId);
      if (!product) throw new Error('Ürün bulunamadı.');

      const fromWh = draft.warehouses.find(w => w.id === fromWarehouseId);
      const toWh = draft.warehouses.find(w => w.id === toWarehouseId);
      if (!fromWh || !toWh) throw new Error('Kaynak veya hedef depo bulunamadı.');

      if (product.currentStock < qty) {
        throw new Error(`Yetersiz stok! Mevcut: ${product.currentStock}`);
      }

      const docNo = `TRF-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      const dateStr = new Date().toISOString().split('T')[0];

      // OUT from source
      const outMovement: StockMovement = {
        id: `sm-${Date.now()}-out`,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        warehouseId: fromWh.id,
        warehouseName: fromWh.name,
        documentNo: docNo,
        documentType: 'TRANSFER',
        movementType: 'TRANSFER_OUT',
        quantity: qty,
        direction: 'OUT',
        unitPrice: product.purchasePrice,
        totalAmount: qty * product.purchasePrice,
        date: dateStr,
        notes: `Transfer: ${fromWh.name} -> ${toWh.name}. ${notes || ''}`,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };

      // IN to destination
      const inMovement: StockMovement = {
        id: `sm-${Date.now()}-in`,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        warehouseId: toWh.id,
        warehouseName: toWh.name,
        documentNo: docNo,
        documentType: 'TRANSFER',
        movementType: 'TRANSFER_IN',
        quantity: qty,
        direction: 'IN',
        unitPrice: product.purchasePrice,
        totalAmount: qty * product.purchasePrice,
        date: dateStr,
        notes: `Transfer: ${fromWh.name} -> ${toWh.name}. ${notes || ''}`,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };

      draft.stockMovements.push(outMovement, inMovement);
      return { docNo, fromWh: fromWh.name, toWh: toWh.name, qty };
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'UPDATE',
      module: 'STOCK',
      documentNo: result.docNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `Depo transferi yapıldı: ${result.qty} adet (${result.fromWh} -> ${result.toWh})`,
    });

    res.json({ success: true, message: 'Depo transferi tamamlandı.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
