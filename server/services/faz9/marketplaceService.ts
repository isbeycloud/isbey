import { storage } from '../../db/storage';
import { MarketplaceAppItem, TenantIntegrationConnection, DatabaseState } from '../../db/schema';

export class MarketplaceService {
  /**
   * Tüm marketplace uygulamalarını listeler (Kategori bazlı filtrelemeli)
   */
  public static getApps(category?: string): MarketplaceAppItem[] {
    const db = storage.getState();
    let list = db.marketplaceApps || [];
    if (category && category !== 'ALL') {
      list = list.filter(a => a.category === category);
    }
    return list;
  }

  /**
   * Tenant'ın kurulu entegrasyonlarını listeler
   */
  public static getTenantConnections(tenantId: string): TenantIntegrationConnection[] {
    const db = storage.getState();
    return (db.integrationConnections || []).filter(c => c.tenantId === tenantId && c.isConnected);
  }

  /**
   * Tenant için uygulamayı bağlar (Connect)
   */
  public static async connectApp(params: {
    tenantId: string;
    appSlug: string;
    credentials?: Record<string, string>;
  }): Promise<TenantIntegrationConnection> {
    const { tenantId, appSlug, credentials = {} } = params;
    const now = new Date().toISOString();

    const db = storage.getState();
    const app = (db.marketplaceApps || []).find(a => a.slug === appSlug);
    if (!app) throw new Error('Entegrasyon uygulaması bulunamadı.');

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.integrationConnections) draft.integrationConnections = [];

      let conn = draft.integrationConnections.find(c => c.tenantId === tenantId && c.appSlug === appSlug);
      if (conn) {
        conn.isConnected = true;
        conn.credentialsEncrypted = credentials;
        conn.lastHealthStatus = 'HEALTHY';
        conn.lastSyncAt = now;
      } else {
        conn = {
          id: `conn-${Date.now()}`,
          tenantId,
          appSlug,
          appName: app.name,
          category: app.category,
          isConnected: true,
          credentialsEncrypted: credentials,
          lastHealthStatus: 'HEALTHY',
          lastSyncAt: now,
          connectedAt: now,
        };
        draft.integrationConnections.push(conn);
      }

      // App kurulu sayısını arttır
      const mApp = (draft.marketplaceApps || []).find(a => a.slug === appSlug);
      if (mApp) mApp.installedTenantsCount += 1;

      return conn;
    });
  }

  /**
   * Bağlantıyı koparır (Disconnect)
   */
  public static async disconnectApp(tenantId: string, appSlug: string) {
    return await storage.runTransaction((draft: DatabaseState) => {
      const conn = (draft.integrationConnections || []).find(c => c.tenantId === tenantId && c.appSlug === appSlug);
      if (!conn) throw new Error('Bağlantı bulunamadı.');
      conn.isConnected = false;
      return { success: true, message: 'Entegrasyon bağlantısı kesildi.' };
    });
  }
}
