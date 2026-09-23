import { storage } from '../../db/storage';
import { SaaSPlanItem, FeatureFlagConfig, DatabaseState } from '../../db/schema';

export class PlanService {
  /**
   * Tüm aktif planları listeler
   */
  public static getPlans(): SaaSPlanItem[] {
    const db = storage.getState();
    return (db.saasPlans || []).filter(p => p.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /**
   * Slug'a göre plan bulur
   */
  public static getPlanBySlug(slug: string): SaaSPlanItem | undefined {
    const db = storage.getState();
    return (db.saasPlans || []).find(p => p.slug === slug);
  }

  /**
   * Feature Flag kontrolü yapar (tenantId ve planSlug bazlı)
   */
  public static isFeatureEnabled(featureKey: string, planSlug: string, tenantId?: string): boolean {
    const db = storage.getState();
    const flag = (db.featureFlags || []).find(f => f.key === featureKey);
    if (!flag) return false;
    if (!flag.isEnabledGlobally) return false;

    if (tenantId && flag.allowedTenantIds && flag.allowedTenantIds.includes(tenantId)) {
      return true;
    }

    if (flag.allowedPlans.includes(planSlug) || flag.allowedPlans.includes('*')) {
      return true;
    }

    return false;
  }

  /**
   * Yeni plan oluşturur veya günceller (Admin)
   */
  public static async savePlan(plan: SaaSPlanItem): Promise<SaaSPlanItem> {
    const now = new Date().toISOString();
    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.saasPlans) draft.saasPlans = [];
      const idx = draft.saasPlans.findIndex(p => p.id === plan.id || p.slug === plan.slug);
      if (idx >= 0) {
        draft.saasPlans[idx] = { ...plan, updatedAt: now };
        return draft.saasPlans[idx];
      } else {
        const newPlan = { ...plan, id: plan.id || `plan-${Date.now()}`, createdAt: now, updatedAt: now };
        draft.saasPlans.push(newPlan);
        return newPlan;
      }
    });
  }
}
