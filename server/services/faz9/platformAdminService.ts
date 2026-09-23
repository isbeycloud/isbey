import crypto from 'crypto';
import { storage } from '../../db/storage';
import { SystemHealthIndicator, PlatformAnnouncement, TenantSuccessMetric, DatabaseState } from '../../db/schema';

export class PlatformAdminService {
  /**
   * Süper Admin Platform Dashboard Metrikleri
   */
  public static getPlatformMetrics() {
    const db = storage.getState();
    const tenants = db.tenants || [];
    const subscriptions = db.subscriptions || [];
    const payments = db.payments || [];
    const partners = db.partnerNodes || [];

    const totalTenants = tenants.length;
    const activeTenants = subscriptions.filter(s => s.status === 'active').length || totalTenants;
    const trialTenants = subscriptions.filter(s => s.status === 'trial').length;
    const cancelledTenants = subscriptions.filter(s => s.status === 'cancelled').length;

    // Gelir hesaplama
    const mrr = subscriptions.reduce((acc, sub) => {
      if (sub.status !== 'active') return acc;
      const plan = (db.saasPlans || []).find(p => p.slug === sub.planSlug);
      return acc + (plan?.monthlyPrice || 990);
    }, 0);

    const arr = mrr * 12;
    const arpu = activeTenants > 0 ? Math.round(mrr / activeTenants) : 0;

    // AI & e-Belge Kullanımı
    const totalAiTokens = (db.tenantUsageMeters || []).reduce((acc, m) => acc + (m.aiTokensCount || 0), 0);
    const totalEDocuments = (db.electronicDocuments || []).length;
    const totalApiRequests = (db.tenantUsageMeters || []).reduce((acc, m) => acc + (m.apiRequestsCount || 0), 0);

    return {
      totalTenants,
      activeTenants,
      trialTenants,
      cancelledTenants,
      mrr,
      arr,
      arpu,
      activeDealersCount: partners.filter(p => p.role === 'DEALER' && p.isActive).length,
      activeSubDealersCount: partners.filter(p => p.role === 'SUB_DEALER' && p.isActive).length,
      totalAiTokens,
      totalEDocuments,
      totalApiRequests,
      healthIndicators: db.systemHealthIndicators || [],
    };
  }

  /**
   * Güvenli Impersonation (Müşteri Hesabına Geçiş) Oturumu Başlatır
   */
  public static async startImpersonation(params: {
    adminUserId: string;
    adminUserName: string;
    targetTenantId: string;
    reason: string;
  }): Promise<{ token: string; targetTenantName: string }> {
    const { adminUserId, adminUserName, targetTenantId, reason } = params;
    const now = new Date().toISOString();
    const token = `imp_${crypto.randomBytes(16).toString('hex')}`;

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.impersonationSessions) draft.impersonationSessions = [];

      const tenant = (draft.tenants || []).find(t => t.id === targetTenantId);
      const targetTenantName = tenant ? tenant.name : targetTenantId;

      draft.impersonationSessions.push({
        id: `impsess-${Date.now()}`,
        originalUserId: adminUserId,
        originalUserName: adminUserName,
        impersonatedTenantId: targetTenantId,
        impersonatedTenantName: targetTenantName,
        token,
        startedAt: now,
      });

      return { token, targetTenantName };
    });
  }

  /**
   * Platform Duyurusu Yayınlar
   */
  public static async createAnnouncement(announcement: Omit<PlatformAnnouncement, 'id' | 'createdAt'>): Promise<PlatformAnnouncement> {
    const now = new Date().toISOString();
    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.platformAnnouncements) draft.platformAnnouncements = [];
      const newAnn: PlatformAnnouncement = {
        id: `ann-${Date.now()}`,
        ...announcement,
        createdAt: now,
      };
      draft.platformAnnouncements.unshift(newAnn);
      return newAnn;
    });
  }
}
