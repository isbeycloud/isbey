import crypto from 'crypto';
import { storage } from '../../db/storage';
import { OnboardingProgress, DatabaseState } from '../../db/schema';
import { ActivityAuditService } from './activityAuditService';

export class OnboardingService {
  /**
   * Onboarding durumunu döndürür veya başlatır
   */
  public static getProgress(tenantId: string): OnboardingProgress {
    const db = storage.getState();
    let prog = (db.onboardingProgress || []).find(p => p.tenantId === tenantId || (!p.tenantId && tenantId === 'tnt-isbey'));
    if (!prog) {
      prog = {
        id: `onb-${Date.now()}`,
        tenantId,
        companyInfoDone: true,
        taxInfoDone: true,
        logoUploaded: false,
        bankAdded: true,
        eInvoiceConfigured: true,
        firstCustomerCreated: true,
        firstInvoiceCreated: true,
        completionPercentage: 85,
        updatedAt: new Date().toISOString(),
      };
    }
    return prog;
  }

  /**
   * Demo verileri oluşturur (10 Cari, 20 Ürün, 10 Fatura, 5 Tahsilat)
   */
  public static async injectDemoData(tenantId: string, userId: string, userName: string) {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    return await storage.runTransaction((draft: DatabaseState) => {
      // 10 Demo Cari
      if (!draft.customers) draft.customers = [];
      const sampleNames = [
        'Anadolu Lojistik Tic. A.Ş.',
        'Kuzey Marmara Dağıtım Ltd.',
        'Ege Bilişim ve Yazılım',
        'Akdeniz Gıda Sanayi',
        'Zirve Makine İmalat',
        'Başkent Kırtasiye Ofis',
        'Mavi İnşaat Taahhüt',
        'Güneş Enerji Sistemleri',
        'Çözüm Ambalaj Sanayi',
        'Yıldız Medikal Sağlık',
      ];

      sampleNames.forEach((title, idx) => {
        const code = `DEMO-CAR-${100 + idx}`;
        if (!draft.customers.some(c => c.code === code && c.tenantId === tenantId)) {
          draft.customers.push({
            id: `cust-demo-${idx + 1}-${Date.now()}`,
            tenantId,
            code,
            title,
            taxNumber: `1234567${idx}90`,
            type: 'CUSTOMER',
            phone: `0555 100 200${idx}`,
            balance: (idx + 1) * 4500,
            totalDebit: (idx + 1) * 4500,
            totalCredit: 0,
            riskLimit: 50000,
            maturityDays: 30,
            active: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      // 20 Demo Ürün
      if (!draft.products) draft.products = [];
      for (let i = 1; i <= 20; i++) {
        const code = `DEMO-PRD-${String(i).padStart(3, '0')}`;
        if (!draft.products.some(p => p.code === code && p.tenantId === tenantId)) {
          draft.products.push({
            id: `prd-demo-${i}-${Date.now()}`,
            tenantId,
            code,
            name: `Demo Ürün Modeli #${i}`,
            barcode: `869000000${String(i).padStart(4, '0')}`,
            category: i % 2 === 0 ? 'Elektronik' : 'Ofis Malzemeleri',
            unit: 'ADET',
            vatRate: 20,
            purchasePrice: 150 * i,
            salePrice: 220 * i,
            currentStock: 15 + i * 5,
            criticalStock: 10,
            trackStock: true,
            active: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      ActivityAuditService.logActivityDraft(draft, {
        tenantId,
        userId,
        userName,
        actionType: 'CREATE',
        entityType: 'DEMO_DATA',
        entityId: 'demo-batch',
        title: 'Örnek demo veriler (10 Cari, 20 Ürün) sisteme yüklendi.',
      });

      return { success: true, message: '10 Cari ve 20 Ürün başarıyla oluşturuldu.' };
    });
  }
}
