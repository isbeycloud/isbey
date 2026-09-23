import { storage } from '../db/storage';
import {
  Product,
  StockMovement,
  ProductBarcode,
  ProductCategory,
  Unit,
  Warehouse,
} from '../db/schema';

export interface CreateProductParams {
  tenantId: string;
  code: string;
  barcode?: string;
  barcodes?: string[];
  name: string;
  categoryId?: string;
  unit?: string;
  unitId?: string;
  purchasePrice?: number;
  salePrice?: number;
  currency?: string;
  vatRate?: number;
  otvRate?: number;
  criticalStock?: number;
  maximumStock?: number;
  initialStock?: number;
  warehouseId?: string;
  description?: string;
  userId: string;
  username?: string;
}

export interface AdjustStockParams {
  tenantId: string;
  productId: string;
  warehouseId?: string;
  quantity: number; // pozitif = giriş, negatif = çıkış
  reason: string;
  unitPrice?: number;
  documentNo?: string;
  date?: string;
  userId: string;
  username?: string;
}

export interface WarehouseTransferParams {
  tenantId: string;
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  date?: string;
  notes?: string;
  userId: string;
  username?: string;
}

export class StockService {
  /**
   * 1. YENİ ÜRÜN OLUŞTURMA (ÇOKLU BARKOD VE BİRİM DESTEKLİ)
   */
  static async createProduct(params: CreateProductParams): Promise<Product> {
    const {
      tenantId,
      code,
      barcode,
      barcodes = [],
      name,
      categoryId,
      unit = 'Adet',
      unitId,
      purchasePrice = 0,
      salePrice = 0,
      currency = 'TRY',
      vatRate = 20,
      otvRate = 0,
      criticalStock = 5,
      maximumStock = 1000,
      initialStock = 0,
      warehouseId,
      description,
      userId,
      username = 'Sistem',
    } = params;

    const db = storage.getState();
    const existing = (db.products || []).find(
      p => p.code === code && (!p.tenantId || p.tenantId === tenantId)
    );
    if (existing) throw new Error(`'${code}' ürün kodu bu firmada zaten kullanılıyor.`);

    const productId = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const whId = warehouseId || (db.warehouses && db.warehouses[0]?.id) || 'wh-default';

    const newProduct: Product = {
      id: productId,
      tenantId,
      code,
      barcode: barcode || barcodes[0] || `869${Date.now().toString().slice(-9)}`,
      name,
      categoryId,
      unit,
      unitId,
      purchasePrice,
      salePrice,
      currency,
      vatRate,
      otvRate,
      criticalStock,
      maximumStock,
      currentStock: 0,
      warehouseId: whId,
      description,
      status: 'ACTIVE',
      active: true,
      createdBy: username,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.products) db.products = [];
    db.products.push(newProduct);

    // Ek barkodları kaydet
    const allBarcodes = Array.from(new Set([newProduct.barcode, ...barcodes])).filter(Boolean);
    if (!db.productBarcodes) db.productBarcodes = [];
    allBarcodes.forEach((b, idx) => {
      db.productBarcodes!.push({
        id: `bc-${Date.now()}-${idx}`,
        tenantId,
        productId,
        barcode: b,
        isPrimary: idx === 0,
        createdAt: now,
      });
    });

    // Açılış Stoğu varsa hareket oluştur
    if (initialStock > 0) {
      const openMove: StockMovement = {
        id: `sm-open-${Date.now()}`,
        tenantId,
        productId,
        productCode: code,
        productName: name,
        warehouseId: whId,
        documentNo: `OPEN-${Date.now().toString().slice(-6)}`,
        documentType: 'OPENING',
        movementType: 'OPENING',
        quantity: initialStock,
        direction: 'IN',
        unitPrice: purchasePrice,
        totalAmount: initialStock * purchasePrice,
        currency,
        date: now.slice(0, 10),
        notes: 'Açılış Stok Devri',
        userId,
        createdBy: username,
        createdAt: now,
      };

      if (!db.stockMovements) db.stockMovements = [];
      db.stockMovements.push(openMove);
      newProduct.currentStock = initialStock;
    }

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'PRODUCT_CREATED',
      module: 'STOCK',
      documentNo: code,
      ipAddress: '127.0.0.1',
      details: `'${name}' (${code}) ürünü ${initialStock} adet başlangıç stoğu ile oluşturuldu.`,
    });

    storage.save();
    return newProduct;
  }

  /**
   * 2. SAYIM DÜZELTME (ADJUSTMENT IN / OUT)
   */
  static async adjustStock(params: AdjustStockParams): Promise<{
    movement: StockMovement;
    updatedStock: number;
  }> {
    const {
      tenantId,
      productId,
      warehouseId,
      quantity,
      reason,
      unitPrice,
      documentNo,
      date,
      userId,
      username = 'Sistem',
    } = params;

    if (quantity === 0) throw new Error('Düzeltme miktarı 0 olamaz.');

    const db = storage.getState();
    const product = (db.products || []).find(
      p => p.id === productId && (!p.tenantId || p.tenantId === tenantId)
    );
    if (!product) throw new Error('Ürün bulunamadı veya yetkiniz yok.');

    const whId = warehouseId || product.warehouseId || (db.warehouses && db.warehouses[0]?.id) || 'wh-default';
    const now = new Date().toISOString();
    const isIncrease = quantity > 0;
    const absQty = Math.abs(quantity);
    const price = unitPrice !== undefined ? unitPrice : product.purchasePrice || 0;
    const docNo = documentNo || `ADJ-${Date.now()}`;

    const movement: StockMovement = {
      id: `sm-adj-${Date.now()}`,
      tenantId,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      warehouseId: whId,
      documentNo: docNo,
      documentType: 'ADJUSTMENT',
      movementType: isIncrease ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity: absQty,
      direction: isIncrease ? 'IN' : 'OUT',
      unitPrice: price,
      totalAmount: absQty * price,
      currency: product.currency || 'TRY',
      date: date || now.slice(0, 10),
      notes: reason || 'Sayım Stok Düzeltmesi',
      userId,
      createdBy: username,
      createdAt: now,
    };

    if (!db.stockMovements) db.stockMovements = [];
    db.stockMovements.push(movement);

    product.currentStock = isIncrease
      ? (product.currentStock || 0) + absQty
      : (product.currentStock || 0) - absQty;
    product.updatedAt = now;

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'STOCK_ADJUSTMENT',
      module: 'STOCK',
      documentNo: docNo,
      ipAddress: '127.0.0.1',
      details: `'${product.name}' ürününde ${quantity > 0 ? `+${absQty}` : `-${absQty}`} adet düzeltme yapıldı. Yeni Stok: ${product.currentStock}`,
    });

    storage.save();
    return { movement, updatedStock: product.currentStock };
  }

  /**
   * 3. DEPOLAR ARASI STOK TRANSFERİ (TRANSFER OUT + TRANSFER IN)
   */
  static async transferWarehouse(params: WarehouseTransferParams): Promise<{
    outMove: StockMovement;
    inMove: StockMovement;
  }> {
    const {
      tenantId,
      productId,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      date,
      notes,
      userId,
      username = 'Sistem',
    } = params;

    if (quantity <= 0) throw new Error('Transfer miktarı 0’dan büyük olmalıdır.');
    if (fromWarehouseId === toWarehouseId) throw new Error('Kaynak ve hedef depo aynı olamaz.');

    const db = storage.getState();
    const product = (db.products || []).find(
      p => p.id === productId && (!p.tenantId || p.tenantId === tenantId)
    );
    if (!product) throw new Error('Ürün bulunamadı.');

    const fromWh = (db.warehouses || []).find(w => w.id === fromWarehouseId);
    const toWh = (db.warehouses || []).find(w => w.id === toWarehouseId);
    if (!fromWh || !toWh) throw new Error('Kaynak veya hedef depo bulunamadı.');

    const now = new Date().toISOString();
    const docNo = `WH-TRF-${Date.now()}`;
    const price = product.purchasePrice || 0;

    const outMove: StockMovement = {
      id: `sm-out-${Date.now()}`,
      tenantId,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      warehouseId: fromWh.id,
      warehouseName: fromWh.name,
      documentNo: docNo,
      documentType: 'TRANSFER',
      movementType: 'TRANSFER_OUT',
      quantity,
      direction: 'OUT',
      unitPrice: price,
      totalAmount: quantity * price,
      currency: product.currency || 'TRY',
      date: date || now.slice(0, 10),
      notes: notes || `Depo Transferi: ${fromWh.name} ➔ ${toWh.name}`,
      userId,
      createdBy: username,
      createdAt: now,
    };

    const inMove: StockMovement = {
      id: `sm-in-${Date.now()}`,
      tenantId,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      warehouseId: toWh.id,
      warehouseName: toWh.name,
      documentNo: docNo,
      documentType: 'TRANSFER',
      movementType: 'TRANSFER_IN',
      quantity,
      direction: 'IN',
      unitPrice: price,
      totalAmount: quantity * price,
      currency: product.currency || 'TRY',
      date: date || now.slice(0, 10),
      notes: notes || `Depo Transferi: ${fromWh.name} ➔ ${toWh.name}`,
      userId,
      createdBy: username,
      createdAt: now,
    };

    if (!db.stockMovements) db.stockMovements = [];
    db.stockMovements.push(outMove, inMove);

    storage.addAuditLog({
      userId,
      username,
      companyId: tenantId,
      action: 'WAREHOUSE_TRANSFER',
      module: 'STOCK',
      documentNo: docNo,
      ipAddress: '127.0.0.1',
      details: `${product.name} ürününden ${quantity} ${product.unit} ${fromWh.name} ➔ ${toWh.name} deposuna transfer edildi.`,
    });

    storage.save();
    return { outMove, inMove };
  }

  /**
   * 4. STANDART BİRİM VE KATEGORİLERİ GARANTİ ET (SEED)
   */
  static seedStockMetadata(tenantId?: string) {
    const db = storage.getState();
    if (!db.units) db.units = [];
    if (!db.productCategories) db.productCategories = [];

    const defaultUnits = [
      { name: 'Adet', code: 'C62', isDefault: true },
      { name: 'Kilogram', code: 'KGM', isDefault: false },
      { name: 'Gram', code: 'GRM', isDefault: false },
      { name: 'Litre', code: 'LTR', isDefault: false },
      { name: 'Metre', code: 'MTR', isDefault: false },
      { name: 'Kutu', code: 'BX', isDefault: false },
      { name: 'Paket', code: 'PA', isDefault: false },
      { name: 'Saat', code: 'HUR', isDefault: false },
    ];

    defaultUnits.forEach((u, i) => {
      if (!db.units!.some(x => x.name.toLowerCase() === u.name.toLowerCase())) {
        db.units!.push({
          id: `unit-${i + 1}`,
          tenantId,
          name: u.name,
          code: u.code,
          isDefault: u.isDefault,
        });
      }
    });

    const defaultCats = [
      { name: 'Genel', code: 'GENEL' },
      { name: 'Hammadde & Malzeme', code: 'HAM' },
      { name: 'Ticari Mallar', code: 'TIC' },
      { name: 'Hizmet & Danışmanlık', code: 'HIZ' },
    ];

    defaultCats.forEach((c, i) => {
      if (!db.productCategories!.some(x => x.name.toLowerCase() === c.name.toLowerCase())) {
        db.productCategories!.push({
          id: `cat-${i + 1}`,
          tenantId,
          name: c.name,
          code: c.code,
          status: 'ACTIVE',
        });
      }
    });

    storage.save();
  }
}
