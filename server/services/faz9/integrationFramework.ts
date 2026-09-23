import { storage } from '../../db/storage';
import { IntegrationSyncJobRecord, DatabaseState } from '../../db/schema';

export interface IIntegrationProvider {
  connect(credentials: Record<string, string>): Promise<{ success: boolean; message: string }>;
  disconnect(): Promise<{ success: boolean }>;
  testConnection(): Promise<{ healthy: boolean; latencyMs: number; message: string }>;
  sync(direction: 'INCOMING' | 'OUTGOING' | 'BIDIRECTIONAL'): Promise<IntegrationSyncJobRecord>;
  healthCheck(): Promise<'HEALTHY' | 'WARNING' | 'ERROR'>;
}

export class GenericMockConnector implements IIntegrationProvider {
  constructor(private appSlug: string, private tenantId: string) {}

  async connect(credentials: Record<string, string>) {
    return { success: true, message: `${this.appSlug} bağlantısı kuruldu.` };
  }

  async disconnect() {
    return { success: true };
  }

  async testConnection() {
    return { healthy: true, latencyMs: 45, message: 'Bağlantı başarılı (Ping: 45ms).' };
  }

  async sync(direction: 'INCOMING' | 'OUTGOING' | 'BIDIRECTIONAL'): Promise<IntegrationSyncJobRecord> {
    const now = new Date().toISOString();
    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.integrationSyncJobs) draft.integrationSyncJobs = [];

      const job: IntegrationSyncJobRecord = {
        id: `sync-${Date.now()}`,
        tenantId: this.tenantId,
        appSlug: this.appSlug,
        direction,
        status: 'SUCCESS',
        recordsProcessed: 14,
        recordsFailed: 0,
        durationMs: 320,
        createdAt: now,
      };

      draft.integrationSyncJobs.unshift(job);
      return job;
    });
  }

  async healthCheck(): Promise<'HEALTHY' | 'WARNING' | 'ERROR'> {
    return 'HEALTHY';
  }
}
