import { storage } from '../db/storage';
import { MobileSyncQueue, DatabaseState } from '../db/schema';
import { FieldCollectionService } from './fieldCollectionService';
import { isOwnedBy, assertOwnedWarehouse, stockMovementOwnedFields } from '../security/tenantOwnership';

export interface SyncOperationItem {
  clientTransactionId: string;
  operationType: 'CREATE_COLLECTION' | 'CREATE_VISIT' | 'STOCK_COUNT' | 'UPDATE_CUSTOMER';
  payload: any;
  clientTimestamp: string;
}

export interface SyncBatchRequest {
  tenantId: string;
  userId: string;
  userName: string;
  deviceId: string;
  lastSyncAt?: string;
  operations: SyncOperationItem[];
}

export interface SyncBatchResponse {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  serverTimestamp: string;
  results: Array<{
    clientTransactionId: string;
    status: 'SYNCED' | 'CONFLICT' | 'FAILED';
    serverRecordId?: string;
    errorMessage?: string;
  }>;
}

export class MobileSyncService {
  /**
   * Çevrimdışı mobil kuyruk işlemlerini sunucuyla senkronize eder
   */
  public static async processSyncBatch(req: SyncBatchRequest): Promise<SyncBatchResponse> {
    const { tenantId, userId, userName, deviceId, operations } = req;
    const now = new Date().toISOString();

    let syncedCount = 0;
    let failedCount = 0;
    const results: SyncBatchResponse['results'] = [];

    for (const op of operations) {
      try {
        let serverRecordId: string | undefined;

        if (op.operationType === 'CREATE_COLLECTION') {
          const res = await FieldCollectionService.createCollection({
            ...op.payload,
            tenantId,
            userId,
            userName,
            clientTransactionId: op.clientTransactionId,
          });
          serverRecordId = res.collection.id;
        } else if (op.operationType === 'CREATE_VISIT') {
          // Ziyaret kaydı
          await storage.runTransactionForTenant(tenantId, (draft: DatabaseState) => {
            if (!draft.customerVisits) draft.customerVisits = [];
            const existing = draft.customerVisits.find(v => v.clientTransactionId === op.clientTransactionId);
            if (!existing) {
              const visitId = `vst-${Date.now()}-${draft.customerVisits.length + 1}`;
              serverRecordId = visitId;
              draft.customerVisits.push({
                id: visitId,
                tenantId,
                customerId: op.payload.customerId,
                customerTitle: op.payload.customerTitle || 'Müşteri',
                fieldAgentId: userId,
                fieldAgentName: userName,
                visitDate: op.payload.visitDate || now.split('T')[0],
                startTime: op.payload.startTime || now,
                endTime: op.payload.endTime,
                latitude: op.payload.latitude,
                longitude: op.payload.longitude,
                notes: op.payload.notes,
                outcome: op.payload.outcome,
                status: 'COMPLETED',
                clientTransactionId: op.clientTransactionId,
                syncStatus: 'SYNCED',
                createdAt: now,
                updatedAt: now,
              });
            } else {
              serverRecordId = existing.id;
            }
          });
        } else if (op.operationType === 'STOCK_COUNT') {
          // 2026-10-12: Stok sayım FİŞİ + FARK İŞLEME. Sayım onaylanınca:
          //  1. Sayım fişi kaydedilir (SAY-xxxx, COMPLETED).
          //  2. Her satırın farkı stok hareketi olarak yazılır: fazla (counted >
          //     system) GİRİŞ, eksik (counted < system) ÇIKIŞ. Sıfır fark için
          //     hareket YAZILMAZ (defter şişmez).
          //  3. Varyantlı satırda (variantId dolu) hareket varyanta işlenir.
          await storage.runTransactionForTenant(tenantId, (draft: DatabaseState) => {
            if (!draft.stockCounts) draft.stockCounts = [];
            const seq = draft.sequences['STOCK_COUNT'] || { prefix: 'SAY', year: 2026, lastNumber: 0, length: 5 };
            seq.lastNumber += 1;
            draft.sequences['STOCK_COUNT'] = seq;
            const countNo = `${seq.prefix}-${seq.year}-${String(seq.lastNumber).padStart(seq.length, '0')}`;

            const scId = `sc-${Date.now()}`;
            serverRecordId = scId;
            const rawItems = Array.isArray(op.payload.items) ? op.payload.items : [];
            // 2026-10-17 GÜVENLİK: Sayım deposu artık SAHİPLİK kapısından geçer.
            // Eski hâl `op.payload.warehouseId || 'wh-default'` + `draft.warehouses[0]`
            // idi: `'wh-default'` canlıda VAR OLMAYAN bir kimlik ve `[0]` BAŞKA
            // firmanın deposu olabilirdi (sessiz düşme). Artık istekteki depo
            // doğrulanır, yoksa firmanın TEK deposu kullanılır, belirsizse AÇIK HATA.
            const requestedWhId =
              typeof op.payload?.warehouseId === 'string' && op.payload.warehouseId.trim()
                ? op.payload.warehouseId.trim()
                : undefined;
            const ownedWhs = (draft.warehouses || []).filter(w => isOwnedBy(w, tenantId));
            const warehouse = assertOwnedWarehouse(
              draft.warehouses,
              requestedWhId ?? (ownedWhs.length === 1 ? ownedWhs[0].id : undefined),
              tenantId
            );
            const warehouseId = warehouse.id;

            const cleanItems: import('../db/schema').StockCountItem[] = [];
            for (const raw of rawItems) {
              if (!raw || typeof raw !== 'object') continue;
              // 2026-10-17 GÜVENLİK: Ürün SAHİPLİKLE aranır (eskiden filtresizdi
              // → başka firmanın ürününe sayım farkı işlenebiliyordu).
              const product = draft.products.find(p => p.id === (raw as any).productId && isOwnedBy(p, tenantId));
              if (!product) continue;
              const variantId = typeof (raw as any).variantId === 'string' && (raw as any).variantId.trim()
                ? (raw as any).variantId.trim()
                : undefined;
              const variant = variantId
                ? (product.variants || []).find(v => v.id === variantId && v.active !== false)
                : undefined;
              // Varyantlı üründe varyantsız satır GEÇEMEZ (belirsiz stok).
              if (Array.isArray(product.variants) && product.variants.length > 0 && !variant) continue;
              const counted = Math.max(0, Number((raw as any).countedQuantity) || 0);
              const system = variant
                ? Number(variant.currentStock) || 0
                : Number(product.currentStock) || 0;
              const variance = Math.round((counted - system) * 1000) / 1000;
              cleanItems.push({
                productId: product.id,
                productCode: product.code,
                productName: product.name,
                variantId: variant?.id,
                variantName: variant?.name,
                barcode: variant?.barcode || product.barcode,
                systemQuantity: system,
                countedQuantity: counted,
                variance,
                unit: product.unit,
              });

              // Fark hareketi (sıfır fark atlanır).
              if (variance !== 0) {
                const qty = Math.abs(variance);
                draft.stockMovements.push({
                  id: `sm-${Date.now()}-${product.id.slice(-4)}-${cleanItems.length}`,
                  // 2026-10-17: tenantId + doğrulanmış depo kimliği/adı tek kaynaktan.
                  // Eski hâl `warehouse?.id || 'wh-default'` + `'Merkez Depo'` uydurma
                  // adıydı; artık depo kapısından geçmiş gerçek depo yazılır.
                  ...stockMovementOwnedFields(tenantId, warehouse),
                  productId: product.id,
                  variantId: variant?.id,
                  variantName: variant?.name,
                  productCode: product.code,
                  productName: product.name,
                  documentNo: countNo,
                  documentType: 'ADJUSTMENT',
                  movementType: 'COUNT_ADJUSTMENT',
                  quantity: qty,
                  direction: variance > 0 ? 'IN' : 'OUT',
                  unitPrice: product.purchasePrice,
                  totalAmount: Math.round(qty * product.purchasePrice * 100) / 100,
                  date: now.split('T')[0],
                  notes: `Stok sayım farkı (${countNo})${variant ? ` — ${variant.name}` : ''}: sistem ${system} → sayılan ${counted}`,
                  userId,
                  createdAt: now,
                });
              }
            }

            if (cleanItems.length === 0) throw new Error('Sayım fişinde geçerli ürün satırı yok.');

            draft.stockCounts.push({
              id: scId,
              tenantId,
              warehouseId,
              // 2026-10-17: Depo adı artık doğrulanmış depodan gelir; gövdeden
              // gelen ada ve uydurma 'Merkez Depo' varsayımına düşülmez.
              warehouseName: warehouse.name,
              countNumber: countNo,
              status: 'COMPLETED',
              countedBy: userName,
              items: cleanItems,
              notes: op.payload.notes,
              createdAt: now,
              completedAt: now,
            });
          });
        }

        syncedCount++;
        results.push({
          clientTransactionId: op.clientTransactionId,
          status: 'SYNCED',
          serverRecordId,
        });
      } catch (err: any) {
        failedCount++;
        results.push({
          clientTransactionId: op.clientTransactionId,
          status: 'FAILED',
          errorMessage: err.message || 'İşlem senkronize edilemedi.',
        });
      }
    }

    return {
      success: true,
      syncedCount,
      failedCount,
      serverTimestamp: now,
      results,
    };
  }
}
