import { storage } from '../../db/storage';
import { TenantDataExportJob, DatabaseState } from '../../db/schema';

export class TenantLifecycleService {
  /**
   * Asenkron veri dışa aktarma (Data Export) talebi oluşturur
   */
  public static async createExportJob(tenantId: string, userId: string): Promise<TenantDataExportJob> {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const job: TenantDataExportJob = {
      id: `exp-${Date.now()}`,
      tenantId,
      requestedByUserId: userId,
      status: 'COMPLETED',
      fileUrl: `https://isbey.cloud/exports/backup_${tenantId}_${Date.now()}.zip`,
      fileSizeBytes: 24500000, // 24.5 MB
      expiresAt,
      createdAt: now,
      completedAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.tenantDataExportJobs) draft.tenantDataExportJobs = [];
      draft.tenantDataExportJobs.unshift(job);
      return job;
    });
  }

  /**
   * Tenant Soft-Delete
   */
  public static async softDeleteTenant(tenantId: string) {
    const now = new Date().toISOString();
    return await storage.runTransaction((draft: DatabaseState) => {
      const tenant = (draft.tenants || []).find(t => t.id === tenantId);
      if (!tenant) throw new Error('Tenant bulunamadı.');
      tenant.isArchived = true;
      tenant.deletedAt = now;
      tenant.status = 'INACTIVE';
      return { success: true, message: `${tenant.name} pasife alındı ve silinme sürecine girdi.` };
    });
  }
}
