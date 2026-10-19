import { storage } from '../db/storage';
import {
  Product,
  StockMovement,
  ProductBarcode,
  ProductCategory,
  Unit,
  Warehouse,
} from '../db/schema';
import { isOwnedBy, assertOwnedWarehouse, stockMovementOwnedFields } from '../security/tenantOwnership';

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
    const existing = (db.products || []).find(p => p.code === code && isOwnedBy(p, tenantId));
    if (existing) throw new Error(`'${code}' ürün kodu bu firmada zaten kullanılıyor.`);

    const productId = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    // 2026-10-17 GÜVENLİK: Eski hâl `warehouseId || db.warehouses[0]?.id || 'wh-default'` idi —
    // istekteki depo SAHİPLİK kontrolünden geçmiyordu (yabancı depo kimliği ürüne
    // yazılabiliyordu) ve `'wh-default'` canlıda VAR OLMAYAN bir kimlikti.
    // Yeni kural: istekte depo verilmişse SAHİPLİK kapısından geçer; verilmemişse
    // firmanın TEK deposu kullanılır; birden çok/ hiç yok + açılış stoğu varsa
    // AÇIK HATA (sessizce başka depoya düşme yok). Açılış stoğu yoksa ürün
    // deposuz kaydedilebilir (mevcut davranış).
    const requestedWhId = typeof warehouseId === 'string' && warehouseId.trim() !== '' ? warehouseId.trim() : undefined;
    const ownedWhs = (db.warehouses || []).filter(w => isOwnedBy(w, tenantId));
    const whId: string | undefined = requestedWhId ?? (ownedWhs.length === 1 ? ownedWhs[0].id : undefined);
    if (whId === undefined && initialStock > 0) {
      // Açılış stoğu yazılacak ama hedef depo belirsiz → AÇIK HATA (fırlatır).
      assertOwnedWarehouse(db.warehouses, undefined, tenantId);
    }
    // Açılış stoğu varsa depo kapısından geçmiş olmak ZORUNDA; yoksa ürün
    // deposuz kaydedilebilir (kapı yalnız depo belirtildiğinde çalışır).
    const openingWh: Warehouse | undefined =
      whId !== undefined ? assertOwnedWarehouse(db.warehouses, whId, tenantId) : undefined;

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
    const allBarcodes = Array.from(new Set([newProduct.barcode, ...barcodes]))
      .filter((barcode): barcode is string => typeof barcode === 'string' && Boolean(barcode));
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
    if (initialStock > 0 && openingWh) {
      const openMove: StockMovement = {
        id: `sm-open-${Date.now()}`,
        // 2026-10-17: Doğrulanmış depo (tenantId + kimlik + ad) tek kaynaktan.
        ...stockMovementOwnedFields(tenantId, openingWh),
        productId,
        productCode: code,
        productName: name,
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
    const product = (db.products || []).find(p => p.id === productId && isOwnedBy(p, tenantId));
    if (!product) throw new Error('Ürün bulunamadı veya yetkiniz yok.');

    // 2026-10-17 GÜVENLİK: Eski hâl `warehouseId || product.warehouseId ||
    // db.warehouses[0]?.id || 'wh-default'` idi: istekteki depo sahiplik
    // kontrolünden geçmiyordu (yabancı depoda sayım düzeltmesi yazılabiliyordu)
    // ve `db.warehouses[0]` başka firmanın deposu olabilirdi.
    // Ürünün kendi `warehouseId`'si DB'de VAR OLMAYAN bir kimlikse (canlıdaki
    // 'wh-default'/'wh-1' durumu) sessizce başka depoya DÜŞÜLMEZ → açık hata.
    const requestedWhId = typeof warehouseId === 'string' && warehouseId.trim() !== '' ? warehouseId.trim() : undefined;
    const productWhId =
      !requestedWhId && typeof product.warehouseId === 'string' && product.warehouseId.trim() !== ''
        ? product.warehouseId.trim()
        : undefined;
    const ownedWhs = (db.warehouses || []).filter(w => isOwnedBy(w, tenantId));
    const fallbackWhId = ownedWhs.length === 1 ? ownedWhs[0].id : undefined;
    const wh = assertOwnedWarehouse(db.warehouses, requestedWhId ?? productWhId ?? fallbackWhId, tenantId);
    const now = new Date().toISOString();
    const isIncrease = quantity > 0;
    const absQty = Math.abs(quantity);
    const price = unitPrice !== undefined ? unitPrice : product.purchasePrice || 0;
    const docNo = documentNo || `ADJ-${Date.now()}`;

    const movement: StockMovement = {
      id: `sm-adj-${Date.now()}`,
      // 2026-10-17: tenantId + doğrulanmış depo kimliği/adı tek kaynaktan.
      ...stockMovementOwnedFields(tenantId, wh),
      productId: product.id,
      productCode: product.code,
      productName: product.name,
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
    const product = (db.products || []).find(p => p.id === productId && isOwnedBy(p, tenantId));
    if (!product) throw new Error('Ürün bulunamadı.');

    // 2026-10-17 GÜVENLİK: Kaynak/hedef depo eskiden SAHİPLİK FİLTRESİZ aranıyordu;
    // başka firmanın deposuna stok transfer edilebiliyordu (yazma IDOR'u).
    // Artık ikisi de depo kapısından geçer. Fırlatan API → strict kapalıyken de güvenli.
    const fromWh = assertOwnedWarehouse(db.warehouses, fromWarehouseId, tenantId);
    const toWh = assertOwnedWarehouse(db.warehouses, toWarehouseId, tenantId);

    const now = new Date().toISOString();
    const docNo = `WH-TRF-${Date.now()}`;
    const price = product.purchasePrice || 0;

    const outMove: StockMovement = {
      id: `sm-out-${Date.now()}`,
      // 2026-10-17: tenantId + doğrulanmış depo alanları tek kaynaktan.
      ...stockMovementOwnedFields(tenantId, fromWh),
      productId: product.id,
      productCode: product.code,
      productName: product.name,
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
      // 2026-10-17: tenantId + doğrulanmış depo alanları tek kaynaktan.
      ...stockMovementOwnedFields(tenantId, toWh),
      productId: product.id,
      productCode: product.code,
      productName: product.name,
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
