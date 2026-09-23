import { storage } from '../../db/storage';
import { TenantUsageMeter, DatabaseState, SaaSPlanItem } from '../../db/schema';
import { PlanService } from './planService';

export class UsageMeterService {
  /**
   * Tenant'ın mevcut ayki kullanımını döndürür veya oluşturur
   */
  public static getOrCreateMeter(tenantId: string, period?: string): TenantUsageMeter {
    const db = storage.getState();
    const currentPeriod = period || new Date().toISOString().slice(0, 7); // YYYY-MM
    let meter = (db.tenantUsageMeters || []).find(m => m.tenantId === tenantId && m.period === currentPeriod);

    if (!meter) {
      meter = {
        id: `usg-${tenantId}-${currentPeriod}`,
        tenantId,
        period: currentPeriod,
        invoiceCount: 0,
        eDocumentCount: 0,
        ocrCount: 0,
        aiTokensCount: 0,
        smsCount: 0,
        storageUsedMb: 10,
        apiRequestsCount: 0,
        webhookEventsCount: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    return meter;
  }

  /**
   * Kullanımı arttırır ve limit kontrolü yapar
   */
  public static async recordUsage(params: {
    tenantId: string;
    metric: 'invoice' | 'eDocument' | 'ocr' | 'aiTokens' | 'sms' | 'storage' | 'apiRequest' | 'webhook';
    quantity?: number;
  }): Promise<{ allowed: boolean; warning?: string; meter: TenantUsageMeter }> {
    const { tenantId, metric, quantity = 1 } = params;
    const currentPeriod = new Date().toISOString().slice(0, 7);

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.tenantUsageMeters) draft.tenantUsageMeters = [];
      let m = draft.tenantUsageMeters.find(meter => meter.tenantId === tenantId && meter.period === currentPeriod);

      if (!m) {
        m = {
          id: `usg-${tenantId}-${currentPeriod}`,
          tenantId,
          period: currentPeriod,
          invoiceCount: 0,
          eDocumentCount: 0,
          ocrCount: 0,
          aiTokensCount: 0,
          smsCount: 0,
          storageUsedMb: 10,
          apiRequestsCount: 0,
          webhookEventsCount: 0,
          updatedAt: new Date().toISOString(),
        };
        draft.tenantUsageMeters.push(m);
      }

      switch (metric) {
        case 'invoice': m.invoiceCount += quantity; break;
        case 'eDocument': m.eDocumentCount += quantity; break;
        case 'ocr': m.ocrCount += quantity; break;
        case 'aiTokens': m.aiTokensCount += quantity; break;
        case 'sms': m.smsCount += quantity; break;
        case 'storage': m.storageUsedMb += quantity; break;
        case 'apiRequest': m.apiRequestsCount += quantity; break;
        case 'webhook': m.webhookEventsCount += quantity; break;
      }

      m.updatedAt = new Date().toISOString();

      // Limit kontrolü
      const tenant = (draft.tenants || []).find(t => t.id === tenantId);
      const planSlug = (tenant?.plan || 'pro').toLowerCase();
      const plan = (draft.saasPlans || []).find(p => p.slug === planSlug);

      let warning: string | undefined;
      let allowed = true;

      if (plan) {
        if (metric === 'invoice' && m.invoiceCount >= plan.limits.maxInvoicesMonthly * 0.85) {
          warning = `Aylık fatura limitinizin %${Math.round((m.invoiceCount / plan.limits.maxInvoicesMonthly) * 100)}'ine ulaştınız.`;
          if (m.invoiceCount > plan.limits.maxInvoicesMonthly) allowed = false;
        } else if (metric === 'ocr' && m.ocrCount >= plan.limits.ocrDocumentLimit * 0.85) {
          warning = `Aylık OCR fiş okuma limitinizin %${Math.round((m.ocrCount / plan.limits.ocrDocumentLimit) * 100)}'ine ulaştınız.`;
          if (m.ocrCount > plan.limits.ocrDocumentLimit) allowed = false;
        }
      }

      return { allowed, warning, meter: m };
    });
  }

  /**
   * Kullanım özeti ve yükseltme önerisi
   */
  public static getUsageSummary(tenantId: string, planSlug: string) {
    const meter = this.getOrCreateMeter(tenantId);
    const plan = PlanService.getPlanBySlug(planSlug) || PlanService.getPlans()[1]; // Pro default

    const invoicePct = Math.min(100, Math.round((meter.invoiceCount / (plan?.limits.maxInvoicesMonthly || 1000)) * 100));
    const ocrPct = Math.min(100, Math.round((meter.ocrCount / (plan?.limits.ocrDocumentLimit || 100)) * 100));
    const storagePct = Math.min(100, Math.round((meter.storageUsedMb / (plan?.limits.storageMb || 5120)) * 100));
    const apiPct = Math.min(100, Math.round((meter.apiRequestsCount / (plan?.limits.apiRateLimitDaily || 1000)) * 100));

    const needsUpgrade = invoicePct >= 85 || ocrPct >= 85 || storagePct >= 85;

    return {
      meter,
      plan,
      percentages: {
        invoice: invoicePct,
        ocr: ocrPct,
        storage: storagePct,
        api: apiPct,
      },
      needsUpgrade,
      suggestedPlanSlug: needsUpgrade ? (planSlug === 'starter' ? 'pro' : planSlug === 'pro' ? 'kurumsal' : 'enterprise') : undefined,
    };
  }
}
