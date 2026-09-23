import { Router } from 'express';
import { storage } from '../db/storage';
import { Product, StockMovement } from '../db/schema';
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
      p.barcode.includes(q)
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

// Create Product
productsRouter.post('/', async (req, res) => {
  const { barcode, code, name, groupId, unit, purchasePrice, salePrice, vatRate, criticalStock, warehouseId, description, imageUrl, initialStock } = req.body;

  if (!name || !salePrice) {
    return res.status(400).json({ success: false, message: 'Ürün adı ve satış fiyatı zorunludur.' });
  }

  try {
    const newProduct = await storage.runTransaction(draft => {
      const nextNum = draft.products.length + 1;
      const productCode = code || `STK-${String(nextNum).padStart(3, '0')}`;
      const productBarcode = barcode || `869${Date.now().toString().slice(-10)}`;

      const group = draft.productGroups.find(g => g.id === groupId);
      const warehouse = draft.warehouses.find(w => w.id === warehouseId) || draft.warehouses[0];

      const product: Product = {
        id: `prd-${Date.now()}`,
        tenantId: req.tenantId || 'tnt-isbey',
        barcode: productBarcode,
        code: productCode,
        name,
        groupId: groupId || draft.productGroups[0]?.id || 'grp-1',
        groupName: group?.name || 'Genel',
        unit: unit || 'Adet',
        purchasePrice: Number(purchasePrice) || 0,
        salePrice: Number(salePrice) || 0,
        vatRate: Number(vatRate) !== undefined ? Number(vatRate) : 20,
        criticalStock: Number(criticalStock) || 5,
        currentStock: Number(initialStock) || 0,
        warehouseId: warehouse?.id || 'wh-1',
        warehouseName: warehouse?.name || 'Merkez Depo',
        description: description || '',
        imageUrl: imageUrl || undefined,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      draft.products.push(product);

      // If initial stock provided, create opening stock movement
      if (Number(initialStock) > 0) {
        const movement: StockMovement = {
          id: `sm-${Date.now()}`,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          warehouseId: product.warehouseId,
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

      Object.assign(product, {
        ...updateData,
        groupName: group ? group.name : product.groupName,
        warehouseName: warehouse ? warehouse.name : product.warehouseName,
        purchasePrice: Number(updateData.purchasePrice ?? product.purchasePrice),
        salePrice: Number(updateData.salePrice ?? product.salePrice),
        vatRate: Number(updateData.vatRate ?? product.vatRate),
        criticalStock: Number(updateData.criticalStock ?? product.criticalStock),
        updatedAt: new Date().toISOString(),
      });

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
