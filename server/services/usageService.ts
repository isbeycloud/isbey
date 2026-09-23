import { UsageRecord, UsageMetric } from '../db/schema';
import { storage } from '../db/storage';

export interface UsageLimitCheckResult {
  allowed: boolean;
  metric: UsageMetric;
  currentValue: number;
  requestedValue: number;
  limitValue: number; // -1 = Unlimited
  isHardLimit: boolean;
  message?: string;
}

export class UsageService {
  /**
   * Tenant'ın tüm kullanım metriklerini getirir
   */
  public static async getUsage(tenantId: string): Promise<UsageRecord[]> {
    const db = storage.getState();
    const records = (db.usageRecords || []).filter(r => r.tenantId === tenantId);

    // Canlı hesaplama ile eşitle
    const tenant = (db.tenants || []).find(t => t.id === tenantId);
    const userCount = (db.tenantUsers || []).filter(tu => tu.tenantId === tenantId && tu.status === 'active').length || 1;
    const invoiceCount = (db.invoices || []).filter(i => i.tenantId === tenantId).length || 0;
    const eDocCount = (db.electronicDocuments || []).filter(d => d.tenantId === tenantId).length || 0;
    const productCount = (db.products || []).length || 0;
    const customerCount = (db.customers || []).length || 0;

    return [
      {
        id: `usg-${tenantId}-users`,
        tenantId,
        metric: 'users',
        currentValue: userCount,
        limitValue: tenant?.maxUsers || 5,
        isHardLimit: true,
        updatedAt: new Date().toISOString(),
      },
      {
        id: `usg-${tenantId}-companies`,
        tenantId,
        metric: 'companies',
        currentValue: 1,
        limitValue: tenant?.limits?.maxBranches || 3,
        isHardLimit: true,
        updatedAt: new Date().toISOString(),
      },
      {
        id: `usg-${tenantId}-customers`,
        tenantId,
        metric: 'customers',
        currentValue: customerCount,
        limitValue: -1,
        isHardLimit: false,
        updatedAt: new Date().toISOString(),
      },
      {
        id: `usg-${tenantId}-products`,
        tenantId,
        metric: 'products',
        currentValue: productCount,
        limitValue: -1,
        isHardLimit: false,
        updatedAt: new Date().toISOString(),
      },
      {
        id: `usg-${tenantId}-invoices`,
        tenantId,
        metric: 'invoices',
        currentValue: invoiceCount,
        limitValue: tenant?.maxInvoicesPerMonth || 1000,
        isHardLimit: false,
        updatedAt: new Date().toISOString(),
      },
      {
        id: `usg-${tenantId}-storage_mb`,
        tenantId,
        metric: 'storage_mb',
        currentValue: tenant?.storageUsedMb || 15,
        limitValue: tenant?.storageLimitMb || 5120,
        isHardLimit: false,
        updatedAt: new Date().toISOString(),
      },
      {
        id: `usg-${tenantId}-einvoices`,
        tenantId,
        metric: 'einvoices',
        currentValue: eDocCount,
        limitValue: -1,
        isHardLimit: false,
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  /**
   * Yeni bir işlem yapılmadan önce limit kontrolü yapar
   */
  public static async checkLimit(
    tenantId: string,
    metric: UsageMetric,
    incrementAmount: number = 1
  ): Promise<UsageLimitCheckResult> {
    const usages = await this.getUsage(tenantId);
    const record = usages.find(u => u.metric === metric);

    if (!record) {
      return {
        allowed: true,
        metric,
        currentValue: 0,
        requestedValue: incrementAmount,
        limitValue: -1,
        isHardLimit: false,
      };
    }

    if (record.limitValue === -1) {
      // Sınırsız
      return {
        allowed: true,
        metric,
        currentValue: record.currentValue,
        requestedValue: record.currentValue + incrementAmount,
        limitValue: -1,
        isHardLimit: record.isHardLimit,
      };
    }

    const nextValue = record.currentValue + incrementAmount;
    if (nextValue > record.limitValue) {
      const metricNames: Record<UsageMetric, string> = {
        users: 'Kullanıcı',
        companies: 'Şirket',
        customers: 'Cari Kart',
        products: 'Ürün / Hizmet',
        invoices: 'Aylık Fatura',
        storage_mb: 'Depolama Alanı (MB)',
        einvoices: 'e-Belge',
        earchives: 'e-Arşiv',
        edespatches: 'e-İrsaliye',
      };

      const metricLabel = metricNames[metric] || metric;
      const message = `${metricLabel} limitinize ulaştınız (${record.currentValue}/${record.limitValue}). Lütfen paketinizi yükseltin.`;

      if (record.isHardLimit) {
        return {
          allowed: false,
          metric,
          currentValue: record.currentValue,
          requestedValue: nextValue,
          limitValue: record.limitValue,
          isHardLimit: true,
          message,
        };
      } else {
        // Soft limit: İşleme izin verilir ancak uyarı mesajı döner
        return {
          allowed: true,
          metric,
          currentValue: record.currentValue,
          requestedValue: nextValue,
          limitValue: record.limitValue,
          isHardLimit: false,
          message: `Uyarı: ${metricLabel} limitinizi aşıyorsunuz (${record.currentValue}/${record.limitValue}).`,
        };
      }
    }

    return {
      allowed: true,
      metric,
      currentValue: record.currentValue,
      requestedValue: nextValue,
      limitValue: record.limitValue,
      isHardLimit: record.isHardLimit,
    };
  }

  /**
   * Kullanım sayacını artırır
   */
  public static async incrementUsage(tenantId: string, metric: UsageMetric, amount: number = 1) {
    return await storage.runTransaction(draft => {
      if (!draft.usageRecords) draft.usageRecords = [];
      let record = draft.usageRecords.find(u => u.tenantId === tenantId && u.metric === metric);
      if (!record) {
        record = {
          id: `usg-${tenantId}-${metric}`,
          tenantId,
          metric,
          currentValue: 0,
          limitValue: -1,
          isHardLimit: metric === 'users' || metric === 'companies',
          updatedAt: new Date().toISOString(),
        };
        draft.usageRecords.push(record);
      }
      record.currentValue += amount;
      record.updatedAt = new Date().toISOString();
      return record;
    });
  }

  /**
   * Kullanım sayacını azaltır (örn: kullanıcı silindiğinde)
   */
  public static async decrementUsage(tenantId: string, metric: UsageMetric, amount: number = 1) {
    return await storage.runTransaction(draft => {
      if (!draft.usageRecords) draft.usageRecords = [];
      const record = draft.usageRecords.find(u => u.tenantId === tenantId && u.metric === metric);
      if (record) {
        record.currentValue = Math.max(0, record.currentValue - amount);
        record.updatedAt = new Date().toISOString();
      }
      return record;
    });
  }
}
