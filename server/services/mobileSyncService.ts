import { storage } from '../db/storage';
import { MobileSyncQueue, DatabaseState } from '../db/schema';
import { FieldCollectionService } from './fieldCollectionService';

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
          // Stok sayım kaydı
          await storage.runTransactionForTenant(tenantId, (draft: DatabaseState) => {
            if (!draft.stockCounts) draft.stockCounts = [];
            const seq = draft.sequences['STOCK_COUNT'] || { prefix: 'SAY', year: 2026, lastNumber: 0, length: 5 };
            seq.lastNumber += 1;
            draft.sequences['STOCK_COUNT'] = seq;
            const countNo = `${seq.prefix}-${seq.year}-${String(seq.lastNumber).padStart(seq.length, '0')}`;

            const scId = `sc-${Date.now()}`;
            serverRecordId = scId;
            draft.stockCounts.push({
              id: scId,
              tenantId,
              warehouseId: op.payload.warehouseId || 'wh-default',
              warehouseName: op.payload.warehouseName || 'Merkez Depo',
              countNumber: countNo,
              status: 'COMPLETED',
              countedBy: userName,
              items: op.payload.items || [],
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
