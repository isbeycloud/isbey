import { scopedState, tenantContext } from './tenantConfiguration';
import { AsyncLocalStorage } from 'node:async_hooks';
import { migrateMemberships } from '../security/memberships';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseState, AuditLog } from './schema';
import { initialDatabaseState as developmentSeed } from './seed';
import { createProductionDefaults } from './productionDefaults';
import { XsltEngineService } from '../services/xsltEngineService';
// FAZ 25.3-E (B-2): permission/rol kataloğu TEK KAYNAK'tan (security registry) türetilir
import { PERMISSION_CATALOG, ROLE_DEFINITIONS, ROLE_PERMISSIONS } from '../security';
import { getDatabasePath, getDataDirectory, isProduction } from '../config/environment';
import { replaceFileWithRetry } from './atomicWrite';

const initialDatabaseState = isProduction() ? createProductionDefaults() : developmentSeed;
const DATA_DIR = getDataDirectory();
const DATA_FILE = getDatabasePath();

class StorageManager {
  private db: DatabaseState;
  private transactionTail: Promise<void> = Promise.resolve();
  private transactionDraft = new AsyncLocalStorage<DatabaseState>();
  private transactionBusy = false;

  constructor() {
    this.ensureDataDir();
    this.db = this.loadDatabase();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.ensureXsltDirs();
  }

  public ensureXsltDirs() {
    const types = ['efatura', 'earsiv', 'eirsaliye', 'esmm'];
    for (const t of types) {
      const dir = path.join(DATA_DIR, 'storage', 'xslt', t);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  public getXsltStoragePath(documentType: string, filename: string): string {
    const sub = documentType.toLowerCase().replace(/[^a-z0-9]/g, '');
    return path.join(DATA_DIR, 'storage', 'xslt', sub, filename.endsWith('.xslt') ? filename : `${filename}.xslt`);
  }

  public saveXsltFile(documentType: string, filename: string, content: string): string {
    this.ensureXsltDirs();
    const filePath = this.getXsltStoragePath(documentType, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  public readXsltFile(documentType: string, filename: string): string | null {
    const filePath = this.getXsltStoragePath(documentType, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
  }

  private seedDefaultDocumentTemplates(state: DatabaseState) {
    if (!state.documentTemplates || state.documentTemplates.length === 0) {
      const defaultCompanyId = state.company?.id || state.tenants?.[0]?.id || 'tnt-isbey';
      
      const docTypes: Array<{ type: import('./schema').DocumentType; name: string; theme: any }> = [
        { type: 'EFATURA', name: 'Standart Modern e-Fatura', theme: 'MODERN' },
        { type: 'EARSIV', name: 'Kurumsal e-Arşiv Fatura', theme: 'CORPORATE' },
        { type: 'EIRSALIYE', name: 'Standart e-İrsaliye Şablonu', theme: 'CLASSIC' },
        { type: 'ESMM', name: 'Profesyonel e-SMM Şablonu', theme: 'PROFESSIONAL' },
      ];

      state.documentTemplates = [];
      state.documentTemplateVersions = [];

      for (const d of docTypes) {
        const config: import('./schema').DocumentDesignConfig = {
          theme: d.theme,
          primaryColor: d.type === 'EFATURA' ? '#0284c7' : d.type === 'EARSIV' ? '#16a34a' : d.type === 'EIRSALIYE' ? '#d97706' : '#7c3aed',
          secondaryColor: '#1e293b',
          fontFamily: 'Arial, sans-serif',
          fontSize: 11,
          showLogo: true,
          logoWidth: 200,
          logoHeight: 65,
          showSignature: true,
          signatureWidth: 140,
          signatureHeight: 60,
          showQrCode: true,
          showBarcode: true,
          bankAccounts: isProduction() ? [] : [
            { bankName: 'Garanti BBVA', currency: 'TRY', iban: 'TR33 0006 2000 0001 2345 6789 01' },
            { bankName: 'İş Bankası', currency: 'USD', iban: 'TR66 0006 4000 0009 8765 4321 02' },
          ],
          columns: {
            showLineNumber: true,
            showProductCode: true,
            showBarcode: false,
            showDescription: true,
            showQuantity: true,
            showUnit: true,
            showUnitPrice: true,
            showDiscount: true,
            showVatRate: true,
            showVatAmount: true,
            showLineTotal: true,
          },
          notes: 'Fatura bedeli teslimat tarihinden itibaren 15 gün içinde ödenmelidir.',
          paymentTerms: 'Banka Havalesi / EFT',
          footerNote: 'Bu belge 213 sayılı V.U.K. hükümlerine göre elektronik ortamda düzenlenmiştir.',
        };

        const xsltContent = XsltEngineService.generateXslt(d.type, config, d.name);
        const fileName = `${d.type.toLowerCase()}_default.xslt`;
        const filePath = this.saveXsltFile(d.type, fileName, xsltContent);

        const templateId = `tmpl-${d.type.toLowerCase()}-default`;
        const template: import('./schema').DocumentTemplate = {
          id: templateId,
          companyId: defaultCompanyId,
          documentType: d.type,
          name: d.name,
          description: `Varsayılan ${d.name} XSLT şablonu`,
          theme: d.theme,
          config,
          xsltContent,
          xsltPath: filePath,
          version: 1,
          isActive: true,
          isDefault: true,
          createdBy: 'system',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        state.documentTemplates.push(template);
        state.documentTemplateVersions.push({
          id: `tmpl-ver-${Date.now()}-${d.type.toLowerCase()}`,
          templateId,
          companyId: defaultCompanyId,
          version: 1,
          xsltContent,
          config,
          notes: 'İlk sistem varsayılan sürümü',
          createdBy: 'system',
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  private seedDefaultRolesAndPermissions(state: DatabaseState) {
    const now = new Date().toISOString();

    // 1. Sistem İzinleri — FAZ 25.3-E (B-2): TEK KAYNAK security/permissions.ts
    //    PERMISSION_CATALOG'tan türetilir (37 katalog girdisi, sıra/id şeması korunur).
    if (!state.permissions || state.permissions.length === 0) {
      state.permissions = PERMISSION_CATALOG.map((p, idx) => ({
        id: `perm-${idx + 1}`,
        module: p.module,
        action: p.action,
        code: p.code as string,
        name: p.name,
        description: p.description,
        createdAt: now,
      }));
    }

    // 2. Sistem Varsayılan Roller — TEK KAYNAK security/roles.ts
    //    ROLE_DEFINITIONS (metadata) + ROLE_PERMISSIONS (izin matrisi) türetilir.
    //    Davranış notu: platform_admin/company_admin tüm izinler alır; ancak seed
    //    yalnızca DB kataloğuna yazılan (perm-1..37) kodlarla sınırlı kalır —
    //    registry'deki resmileştirilen 7 kod DB'ye yazılmaz (mevcut davranış birebir).
    if (!state.roles || state.roles.length === 0) {
      // DB kataloğu (perm-1..37) — platform_admin & company_admin bu listeyle sınırlı
      const dbCatalogCodes = (state.permissions || []).map(p => p.code);
      // PLATFORM_ADMIN_PERMISSIONS / COMPANY_ADMIN_PERMISSIONS registry ALL_PERMISSION_CODES
      // içerir; DB kataloğu alt küme olduğundan kesişim = eski allCodes davranışı.
      const allCodes = dbCatalogCodes;
      const companyAdminCodes = allCodes.filter(c => c !== 'tenants.manage');

      const slugOrder = ['platform_admin', 'company_admin', 'accountant', 'employee', 'viewer'] as const;
      state.roles = slugOrder.map(slug => {
        const def = ROLE_DEFINITIONS[slug];
        // platform_admin/company_admin: DB kataloğuyla sınırlı (eski davranış);
        // diğer roller: registry matrisi (kod listesi birebir aynıydı).
        const perms = (slug === 'platform_admin' || slug === 'company_admin')
          ? allCodes
          : [...ROLE_PERMISSIONS[slug]];
        return {
          id: def.id,
          tenantId: null as string | null,
          name: def.name,
          slug,
          description: def.description,
          isSystem: true,
          permissions: perms as string[],
          createdAt: now,
          updatedAt: now,
        };
      });
    }
  }

  private migrateTenantUsers(state: DatabaseState) {
    if (!state.tenantUsers) state.tenantUsers = [];
    if (!state.invitations) state.invitations = [];
    if (!state.impersonationSessions) state.impersonationSessions = [];

    const defaultTenantId = state.activeTenantId || state.tenants?.[0]?.id || 'tnt-isbey';
    const now = new Date().toISOString();

    for (const u of state.users || []) {
      const userTenantId = u.companyId || defaultTenantId;
      const alreadyLinked = state.tenantUsers.some(tu => tu.userId === u.id && tu.tenantId === userTenantId);
      if (!alreadyLinked) {
        let roleSlug = 'employee';
        if (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') roleSlug = 'platform_admin';
        else if (u.role === 'COMPANY_ADMIN') roleSlug = 'company_admin';
        else if (u.role === 'MUHASEBE') roleSlug = 'accountant';
        else if (u.role === 'RAPOR') roleSlug = 'viewer';

        state.tenantUsers.push({
          id: `tu-${u.id}-${userTenantId}`,
          tenantId: userTenantId,
          userId: u.id,
          roleSlug,
          isOwner: u.role === 'COMPANY_ADMIN' || u.role === 'SUPER_ADMIN',
          status: u.active ? 'active' : 'passive',
          joinedAt: u.createdAt || now,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  private loadDatabase(): DatabaseState {
    // ── VERİ KAYBI KORUMASI (2026-09-15) ─────────────────────────────────────
    //
    // ÖNCEKİ DAVRANIŞ (fail-open, KALDIRILDI):
    //   `database.json` okunamaz/parse edilemezse `catch` bloğu yalnızca
    //   console.error yazıp AŞAĞIDAKİ seed yoluna düşüyordu ve o yol
    //   `saveDatabase()` ile seed'i DİSKE yazıyordu. Yani BOZUK bir dosya
    //   (kısmi yazım, disk hatası, elle müdahale) sessizce tüm veri setinin
    //   ÜZERİNE yazılıyordu. Bu, geri dönüşü olmayan veri kaybı demektir:
    //   dosya bir daha okunamaz hâle geldiği için kullanıcı ne olduğunu
    //   anlayamaz ve kurtarma şansı kalmaz.
    //
    // YENİ DAVRANIŞ (fail-closed):
    //   - Dosya VAR ama OKUNAMIYOR/BOZUK  → dosyaya DOKUNULMAZ; bozuk dosya
    //     `database.corrupt-<stamp>.json` olarak karantinaya alınır (kopya),
    //     ardından süreç AÇIK HATA ile durdurulur. Veri diske yazılmaz.
    //   - Dosya YOK (gerçek ilk açılış)    → seed üretilir ve diske yazılır.
    //     Bu bilinçli ve güvenli tek durumdur: ortada ezilecek veri yoktur.
    const dosyaMevcut = fs.existsSync(DATA_FILE);

    // ── ÖN KONTROL: bozuk dosyayı, ÜZERİNE YAZMADAN yakala ──────────────────
    // Aşağıdaki büyük `try` bloğunun catch'i eskiden seed'e düşüyordu. Onu
    // güvenli hâle getirmek için bozukluk burada, yazma yollarından ÖNCE
    // tespit edilir; tespit edilirse hiçbir şey yazılmaz ve süreç durur.
    if (dosyaMevcut) {
      try {
        JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      } catch (err: any) {
        const karantina = this.bozukDosyayiKarantinayaAl();
        throw new Error(
          `[STORAGE] data/database.json OKUNAMADI (bozuk/geçersiz JSON). ` +
          `Veri kaybını önlemek için dosyanın ÜZERİNE YAZILMADI. ` +
          `Bozuk dosyanın kopyası: ${karantina}. ` +
          `Yapılacak: dosyayı elle onarın ya da data/backups/ altındaki bir yedeği geri yükleyin. ` +
          `(Ayrıntı: ${err.message})`
        );
      }
    }

    try {
      if (dosyaMevcut) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const loadedState: DatabaseState = {
          ...initialDatabaseState,
          ...parsed,
          costCenters: parsed.costCenters || initialDatabaseState.costCenters || [],
          quotes: parsed.quotes || initialDatabaseState.quotes || [],
          orders: parsed.orders || initialDatabaseState.orders || [],
          waybills: parsed.waybills || initialDatabaseState.waybills || [],
          expenses: parsed.expenses || initialDatabaseState.expenses || [],
          expenseCategories: parsed.expenseCategories || initialDatabaseState.expenseCategories || [],
          formDesigns: parsed.formDesigns || initialDatabaseState.formDesigns || [],
          // FAZ 25.3: Fatura + Rapor tasarım koleksiyonları (eski DB'de yoksa boş dizi)
          invoiceDesigns: parsed.invoiceDesigns || [],
          reportDesigns: parsed.reportDesigns || [],
          documentTemplates: parsed.documentTemplates || [],
          documentTemplateVersions: parsed.documentTemplateVersions || [],
          tenants: parsed.tenants && parsed.tenants.length > 0 ? parsed.tenants : initialDatabaseState.tenants || [],
          services: parsed.services && parsed.services.length > 0 ? parsed.services : initialDatabaseState.services || [],
          plans: parsed.plans && parsed.plans.length > 0 ? parsed.plans : initialDatabaseState.plans || [],
          sessions: parsed.sessions || initialDatabaseState.sessions || [],
          passwordResetTokens: parsed.passwordResetTokens || initialDatabaseState.passwordResetTokens || [],
          externalCustomers: parsed.externalCustomers && parsed.externalCustomers.length > 0 ? parsed.externalCustomers : initialDatabaseState.externalCustomers || [],
          integrationSyncLogs: parsed.integrationSyncLogs || initialDatabaseState.integrationSyncLogs || [],
          hizliBilisimSettings: parsed.hizliBilisimSettings || initialDatabaseState.hizliBilisimSettings,
          activeTenantId: parsed.activeTenantId || initialDatabaseState.activeTenantId || 'tnt-isbey',
          sequences: { ...initialDatabaseState.sequences, ...(parsed.sequences || {}) },
          tenantUsers: parsed.tenantUsers || [],
          tenantConfigurations: parsed.tenantConfigurations || {},
          roles: parsed.roles || [],
          permissions: parsed.permissions || [],
          rolePermissions: parsed.rolePermissions || [],
          invitations: parsed.invitations || [],
          impersonationSessions: parsed.impersonationSessions || [],
          supportTickets: parsed.supportTickets || [],
          tenantEinvoiceSettings: parsed.tenantEinvoiceSettings || [],
          electronicDocuments: parsed.electronicDocuments || [],
          incomingInvoices: parsed.incomingInvoices || [],
          taxpayerCache: parsed.taxpayerCache || [],
          integrationLogs: parsed.integrationLogs || [],
          electronicDocumentUsage: parsed.electronicDocumentUsage || [],
          productSupplierMappings: parsed.productSupplierMappings || [],
          subscriptionPlans: parsed.subscriptionPlans && parsed.subscriptionPlans.length > 0 ? parsed.subscriptionPlans : initialDatabaseState.subscriptionPlans || [],
          planFeatures: parsed.planFeatures && parsed.planFeatures.length > 0 ? parsed.planFeatures : initialDatabaseState.planFeatures || [],
          subscriptions: parsed.subscriptions || initialDatabaseState.subscriptions || [],
          creditWallets: parsed.creditWallets || initialDatabaseState.creditWallets || [],
          creditPackages: parsed.creditPackages && parsed.creditPackages.length > 0 ? parsed.creditPackages : initialDatabaseState.creditPackages || [],
          paymentOrders: parsed.paymentOrders || [],
          payments: parsed.payments || initialDatabaseState.payments || [],
          billingInvoices: parsed.billingInvoices || initialDatabaseState.billingInvoices || [],
          usageRecords: parsed.usageRecords || initialDatabaseState.usageRecords || [],
          dealers: parsed.dealers && parsed.dealers.length > 0 ? parsed.dealers : initialDatabaseState.dealers || [],
          dealerCommissions: parsed.dealerCommissions || initialDatabaseState.dealerCommissions || [],
          fieldCollections: parsed.fieldCollections || initialDatabaseState.fieldCollections || [],
          fieldCollectionReceipts: parsed.fieldCollectionReceipts || initialDatabaseState.fieldCollectionReceipts || [],
          customerVisits: parsed.customerVisits || initialDatabaseState.customerVisits || [],
          posTransactions: parsed.posTransactions || initialDatabaseState.posTransactions || [],
          bankTransactionMatches: parsed.bankTransactionMatches || initialDatabaseState.bankTransactionMatches || [],
          paymentLinks: parsed.paymentLinks || initialDatabaseState.paymentLinks || [],
          mobileDevices: parsed.mobileDevices || initialDatabaseState.mobileDevices || [],
          mobileSyncQueues: parsed.mobileSyncQueues || initialDatabaseState.mobileSyncQueues || [],
          pushNotifications: parsed.pushNotifications || initialDatabaseState.pushNotifications || [],
          stockCounts: parsed.stockCounts || initialDatabaseState.stockCounts || [],
          customerRiskScores: parsed.customerRiskScores || initialDatabaseState.customerRiskScores || [],
          aiConversations: parsed.aiConversations || [],
          aiMessages: parsed.aiMessages || [],
          aiInteractions: parsed.aiInteractions || [],
          aiUsage: parsed.aiUsage || [],
          aiRecommendations: parsed.aiRecommendations || [],
          aiAnomalies: parsed.aiAnomalies || [],
          aiPredictions: parsed.aiPredictions || [],
          documentAIJobs: parsed.documentAIJobs || [],
          automationRules: parsed.automationRules || [],
          automationRuns: parsed.automationRuns || [],
          webhookEndpoints: parsed.webhookEndpoints || [],
          webhookDeliveries: parsed.webhookDeliveries || [],
          accountantClients: parsed.accountantClients || [],
          documentRequests: parsed.documentRequests || [],
          documents: parsed.documents || [],
          publicShareTokens: parsed.publicShareTokens || [],
          workspaceTasks: parsed.workspaceTasks || [],
          approvalRules: parsed.approvalRules || [],
          approvalRequests: parsed.approvalRequests || [],
          topicConversations: parsed.topicConversations || [],
          topicMessages: parsed.topicMessages || [],
          supportTicketsFaz8: parsed.supportTicketsFaz8 || [],
          knowledgeArticles: parsed.knowledgeArticles || [],
          userDevices: parsed.userDevices || [],
          activityLogs: parsed.activityLogs || [],
          onboardingProgress: parsed.onboardingProgress || [],
          saasPlans: parsed.saasPlans || [],
          featureFlags: parsed.featureFlags || [],
          tenantUsageMeters: parsed.tenantUsageMeters || [],
          autoTopupRules: parsed.autoTopupRules || [],
          partnerNodes: parsed.partnerNodes || [],
          commissionRuleRecords: parsed.commissionRuleRecords || [],
          commissionPayoutTxs: parsed.commissionPayoutTxs || [],
          promoCoupons: parsed.promoCoupons || [],
          referralRecords: parsed.referralRecords || [],
          marketplaceApps: parsed.marketplaceApps || [],
          integrationConnections: parsed.integrationConnections || [],
          integrationSyncJobs: parsed.integrationSyncJobs || [],
          apiApplications: parsed.apiApplications || [],
          apiKeyCredentials: parsed.apiKeyCredentials || [],
          apiUsageLogs: parsed.apiUsageLogs || [],
          webhookSubscriptions: parsed.webhookSubscriptions || [],
          webhookDeliveryLogs: parsed.webhookDeliveryLogs || [],
          whiteLabelProfiles: parsed.whiteLabelProfiles || [],
          customDomains: parsed.customDomains || [],
          brandEmailConfigs: parsed.brandEmailConfigs || [],
          platformAnnouncements: parsed.platformAnnouncements || [],
          systemHealthIndicators: parsed.systemHealthIndicators || [],
          tenantSuccessMetrics: parsed.tenantSuccessMetrics || [],
          tenantDataExportJobs: parsed.tenantDataExportJobs || [],
        };
        this.seedDefaultDocumentTemplates(loadedState);
        this.seedDefaultRolesAndPermissions(loadedState);
        this.migrateTenantUsers(loadedState);
        migrateMemberships(loadedState);
        this.migratePhase5Data(loadedState);
        this.migratePhase6Data(loadedState);
        this.migratePhase7Data(loadedState);
        this.migratePhase8Data(loadedState);
        this.migratePhase9Data(loadedState);
        this.migrateFabricatedDataCleanup(loadedState);
        return loadedState;
      }
    } catch (err) {
      // 2026-09-15: BURADA ARTIK SEED'E DÜŞÜLMEZ.
      // Eskiden bu catch yalnızca log yazıp aşağıdaki seed yoluna bırakıyordu
      // ve o yol `saveDatabase()` ile seed'i diske yazıyordu — yani okuma
      // hatası, veri setinin imhasına dönüşüyordu. Artık hata yukarı taşınır.
      console.error('[STORAGE] Error loading database:', err);
      throw new Error(
        `[STORAGE] data/database.json yüklenemedi. Veri kaybını önlemek için ` +
        `mevcut dosya KORUNDU ve seed ile ezilmedi. Hata: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // ── SEED YOLU: YALNIZCA dosya hiç yoksa (gerçek ilk açılış) ─────────────
    // Buraya yalnızca yukarıdaki try başarısız olmadan ve dosya mevcut değilken
    // gelinebilir. Ortada ezilecek veri yoktur; seed'in diske yazılması güvenlidir.
    // DİKKAT: Bu koşul kaldırılırsa fail-open davranış geri gelir — kaldırmayın.
    if (dosyaMevcut) {
      throw new Error(
        '[STORAGE] data/database.json mevcut olduğu hâlde okunamadı; seed ile ' +
        'ezilmemesi için yükleme durduruldu. Bu bir iç tutarlılık hatasıdır.'
      );
    }

    console.warn('[STORAGE] data/database.json bulunamadı — ilk açılış kabul edildi, seed verisi üretiliyor.');
    const initialClone: DatabaseState = JSON.parse(JSON.stringify(initialDatabaseState));
    this.seedDefaultDocumentTemplates(initialClone);
    this.seedDefaultRolesAndPermissions(initialClone);
    this.migrateTenantUsers(initialClone);
    migrateMemberships(initialClone);
    this.migratePhase5Data(initialClone);
    this.migratePhase6Data(initialClone);
    this.migratePhase7Data(initialClone);
    this.migratePhase8Data(initialClone);
    this.migratePhase9Data(initialClone);
    this.migrateFabricatedDataCleanup(initialClone);
    this.saveDatabase(initialClone);
    return initialClone;
  }

  /**
   * 2026-09-15: Bozuk/okunamayan `database.json`'u KOPYALAYARAK karantinaya alır.
   *
   * NEDEN KOPYA, NEDEN TAŞIMA DEĞİL:
   *   Bu fonksiyonun amacı kanıtı korumaktır, dosyayı ortadan kaldırmak değil.
   *   Orijinal dosya YERİNDE BIRAKILIR; böylece operatör elle inceleyip
   *   onarabilir ya da yedeği geri yükleyebilir. Karantina kopyası yalnızca
   *   "o an dosya ne durumdaydı" sorusunun cevabıdır.
   *
   * Kopyalama başarısız olursa hata yutulmaz; çağıran taraf zaten durmaktadır,
   * bu bilgi hata mesajına eklenir.
   */
  private bozukDosyayiKarantinayaAl(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const karantina = path.join(DATA_DIR, `database.corrupt-${stamp}.json`);
    try {
      fs.copyFileSync(DATA_FILE, karantina);
      console.error(`[STORAGE] Bozuk veritabanı karantinaya alındı: ${karantina} (orijinal dosyaya dokunulmadı)`);
      return karantina;
    } catch (kopiErr: any) {
      const mesaj = `karantina kopyası alınamadı (${kopiErr?.message || kopiErr})`;
      console.error(`[STORAGE] ${mesaj}`);
      return mesaj;
    }
  }

  private migratePhase5Data(state: DatabaseState) {
    if (!state.subscriptionPlans || state.subscriptionPlans.length === 0) {
      state.subscriptionPlans = initialDatabaseState.subscriptionPlans || [];
    }
    if (!state.planFeatures || state.planFeatures.length === 0) {
      state.planFeatures = initialDatabaseState.planFeatures || [];
    }
    if (!state.creditPackages || state.creditPackages.length === 0) {
      state.creditPackages = initialDatabaseState.creditPackages || [];
    }
    if (!state.dealers || state.dealers.length === 0) {
      state.dealers = initialDatabaseState.dealers || [];
    }
    if (!state.dealerCommissions) state.dealerCommissions = [];
    if (!state.subscriptions) state.subscriptions = [];
    if (!state.creditWallets) state.creditWallets = [];
    if (!state.payments) state.payments = [];
    if (!state.billingInvoices) state.billingInvoices = [];
    if (!state.usageRecords) state.usageRecords = [];

    const now = new Date().toISOString();

    // Tüm mevcut tenant'lar için subscription ve wallet garanti et
    for (const t of state.tenants || []) {
      // 1. Subscription
      let sub = state.subscriptions.find(s => s.tenantId === t.id);
      if (!sub) {
        const planSlug = (t.plan || 'PRO').toUpperCase();
        const plan = state.subscriptionPlans.find(p => p.slug === planSlug) || state.subscriptionPlans[1];
        const isTrial = t.license?.isTrial ?? false;
        const start = t.license?.startDate || now;
        const end = t.license?.endDate || t.expiresAt || new Date(Date.now() + 365 * 86400000).toISOString();

        sub = {
          id: `sub-${t.id}-${Date.now()}`,
          tenantId: t.id,
          planId: plan.id,
          planSlug: plan.slug,
          status: t.status === 'SUSPENDED' ? 'suspended' : isTrial ? 'trial' : 'active',
          billingCycle: 'yearly',
          startDate: start,
          endDate: end,
          nextBillingDate: end,
          gracePeriodDays: 7,
          autoRenew: true,
          createdAt: t.createdAt || now,
          updatedAt: now,
        };
        state.subscriptions.push(sub);
      }

      // 2. Credit Wallet
      let wallet = state.creditWallets.find(w => w.tenantId === t.id);
      if (!wallet) {
        wallet = {
          id: `wlt-${t.id}`,
          tenantId: t.id,
          balance: isProduction() ? (t.eInvoiceCredits ?? 0) : (t.eInvoiceCredits || 100),
          reservedBalance: 0,
          lowCreditThreshold: 20,
          updatedAt: now,
        };
        state.creditWallets.push(wallet);
      }

      // 3. Usage Records
      const userCount = (state.tenantUsers || []).filter(tu => tu.tenantId === t.id && tu.status === 'active').length || 1;
      const invoiceCount = (state.invoices || []).filter(i => i.tenantId === t.id).length || 0;
      
      const metrics: Array<{ metric: import('./schema').UsageMetric; val: number; limit: number; hard: boolean }> = [
        { metric: 'users', val: userCount, limit: t.maxUsers || 5, hard: true },
        { metric: 'companies', val: 1, limit: t.limits?.maxBranches || 3, hard: true },
        { metric: 'invoices', val: invoiceCount, limit: t.maxInvoicesPerMonth || 1000, hard: false },
        { metric: 'storage_mb', val: t.storageUsedMb || 10, limit: t.storageLimitMb || 5120, hard: false },
        { metric: 'einvoices', val: (state.electronicDocuments || []).filter(d => d.tenantId === t.id).length || 0, limit: -1, hard: false },
      ];

      for (const m of metrics) {
        const existing = state.usageRecords.find(ur => ur.tenantId === t.id && ur.metric === m.metric);
        if (!existing) {
          state.usageRecords.push({
            id: `usg-${t.id}-${m.metric}`,
            tenantId: t.id,
            metric: m.metric,
            currentValue: m.val,
            limitValue: m.limit,
            isHardLimit: m.hard,
            updatedAt: now,
          });
        }
      }
    }
  }

  private migratePhase6Data(state: DatabaseState) {
    if (!state.fieldCollections) state.fieldCollections = [];
    if (!state.fieldCollectionReceipts) state.fieldCollectionReceipts = [];
    if (!state.customerVisits) state.customerVisits = [];
    if (!state.posTransactions) state.posTransactions = [];
    if (!state.bankTransactionMatches) state.bankTransactionMatches = [];
    if (!state.paymentLinks) state.paymentLinks = [];
    if (!state.mobileDevices) state.mobileDevices = [];
    if (!state.mobileSyncQueues) state.mobileSyncQueues = [];
    if (!state.pushNotifications) state.pushNotifications = [];
    if (!state.stockCounts) state.stockCounts = [];
    if (!state.customerRiskScores) state.customerRiskScores = [];

    // Default sequences
    if (!state.sequences['FIELD_COLLECTION']) {
      state.sequences['FIELD_COLLECTION'] = { prefix: 'THS', year: 2026, lastNumber: 0, length: 6 };
    }
    if (!state.sequences['STOCK_COUNT']) {
      state.sequences['STOCK_COUNT'] = { prefix: 'SAY', year: 2026, lastNumber: 0, length: 5 };
    }
  }

  private migratePhase7Data(state: DatabaseState) {
    if (!state.aiConversations) state.aiConversations = [];
    if (!state.aiMessages) state.aiMessages = [];
    if (!state.aiInteractions) state.aiInteractions = [];
    if (!state.aiUsage) state.aiUsage = [];
    if (!state.aiRecommendations) state.aiRecommendations = [];
    if (!state.aiAnomalies) state.aiAnomalies = [];
    if (!state.aiPredictions) state.aiPredictions = [];
    if (!state.documentAIJobs) state.documentAIJobs = [];
    if (!state.automationRules) state.automationRules = [];
    if (!state.automationRuns) state.automationRuns = [];
    if (!state.webhookEndpoints) state.webhookEndpoints = [];
    if (!state.webhookDeliveries) state.webhookDeliveries = [];
    if (!state.accountantClients) state.accountantClients = [];
    if (!state.documentRequests) state.documentRequests = [];

    // Default sequences
    if (!state.sequences['DOCUMENT_AI_JOB']) {
      state.sequences['DOCUMENT_AI_JOB'] = { prefix: 'OCR', year: 2026, lastNumber: 0, length: 6 };
    }

    if (isProduction()) return;
    // Default accountant client seed for demo
    if (state.accountantClients.length === 0) {
      state.accountantClients.push({
        id: 'acc-client-1',
        accountantUserId: 'usr-accountant',
        tenantId: 'tnt-isbey',
        companyName: 'İŞBEY Teknoloji A.Ş.',
        taxNumber: '1234567890',
        taxOffice: 'Büyük Mükellefler V.D.',
        contactEmail: 'muhasebe@isbey.cloud',
        contactPhone: '+90 212 555 0100',
        status: 'ACTIVE',
        missingDocumentsCount: 2,
        unreconciledBankCount: 4,
        lastAuditDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    // Default automation rules seed
    if (state.automationRules.length === 0) {
      state.automationRules.push(
        {
          id: 'rule-overdue-alert',
          tenantId: 'tnt-isbey',
          name: 'Vadesi Geçen Fatura Bildirimi',
          description: 'Vadesi 7 günden fazla geçen borçlu cariler için yöneticiye otomatik bildirim oluşturur.',
          isActive: true,
          triggerEvent: 'INVOICE_OVERDUE',
          conditions: [{ field: 'overdueDays', operator: 'GREATER_THAN', value: 7 }],
          actionType: 'SEND_NOTIFICATION',
          actionConfig: { channel: 'PUSH', title: '⚠️ Gecikmiş Alacak Uyarısı' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'rule-stock-reorder',
          tenantId: 'tnt-isbey',
          name: 'Kritik Stok Satın Alma Uyarısı',
          description: 'Stok seviyesi kritik miktarın altına düştüğünde satın alma görevi oluşturur.',
          isActive: true,
          triggerEvent: 'STOCK_LOW',
          conditions: [{ field: 'currentStock', operator: 'LESS_THAN', value: 10 }],
          actionType: 'CREATE_TASK',
          actionConfig: { taskName: 'Tedarikçi Siparişi Aç' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
    }
  }

  private migratePhase8Data(state: DatabaseState) {
    if (!state.documents) state.documents = [];
    if (!state.publicShareTokens) state.publicShareTokens = [];
    if (!state.workspaceTasks) state.workspaceTasks = [];
    if (!state.approvalRules) state.approvalRules = [];
    if (!state.approvalRequests) state.approvalRequests = [];
    if (!state.topicConversations) state.topicConversations = [];
    if (!state.topicMessages) state.topicMessages = [];
    if (!state.supportTicketsFaz8) state.supportTicketsFaz8 = [];
    if (!state.knowledgeArticles) state.knowledgeArticles = [];
    if (!state.userDevices) state.userDevices = [];
    if (!state.activityLogs) state.activityLogs = [];
    if (!state.onboardingProgress) state.onboardingProgress = [];

    const now = new Date().toISOString();

    if (isProduction()) return;
    // Default Approval Rules (Tutar Kademeli Onay)
    if (state.approvalRules.length === 0) {
      state.approvalRules.push(
        {
          id: 'app-rule-1',
          tenantId: 'tnt-isbey',
          documentType: 'EXPENSE',
          minAmount: 0,
          maxAmount: 5000,
          approverRole: 'MANAGER',
          approvalOrder: 1,
          isActive: true,
          createdAt: now,
        },
        {
          id: 'app-rule-2',
          tenantId: 'tnt-isbey',
          documentType: 'EXPENSE',
          minAmount: 5001,
          maxAmount: 50000,
          approverRole: 'GENERAL_MANAGER',
          approvalOrder: 2,
          isActive: true,
          createdAt: now,
        },
        {
          id: 'app-rule-3',
          tenantId: 'tnt-isbey',
          documentType: 'EXPENSE',
          minAmount: 50001,
          maxAmount: 999999999,
          approverRole: 'OWNER',
          approvalOrder: 3,
          isActive: true,
          createdAt: now,
        }
      );
    }

    // Default Sample Documents (Dijital Arşiv)
    if (state.documents.length === 0) {
      state.documents.push(
        {
          id: 'doc-1',
          tenantId: 'tnt-isbey',
          category: 'CONTRACT',
          folderName: 'Sözleşmeler',
          documentNo: 'SZL-2026-001',
          title: '2026 Yıllık SaaS Hizmet Sözleşmesi',
          description: 'Hizmet Bilişim A.Ş. ile imzalanan yıllık bakım ve lisans sözleşmesi',
          tags: ['Sözleşme', '2026', 'Yıllık'],
          currentVersion: 1,
          versions: [
            {
              versionNumber: 1,
              fileUrl: 'https://isbey.cloud/documents/sozlesme-v1.pdf',
              fileName: 'Hizmet_Sozlesmesi_2026_v1.pdf',
              fileSize: 1048576,
              uploadedByUserId: 'usr-admin',
              uploadedByName: 'Şirket Yöneticisi',
              uploadedAt: now,
              changeSummary: 'İlk onaylı nüsha tarandı.',
            },
          ],
          fileUrl: 'https://isbey.cloud/documents/sozlesme-v1.pdf',
          fileName: 'Hizmet_Sozlesmesi_2026_v1.pdf',
          fileSize: 1048576,
          mimeType: 'application/pdf',
          sharedWithMaliMusavir: true,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'doc-2',
          tenantId: 'tnt-isbey',
          category: 'BANK_STATEMENT',
          folderName: 'Banka',
          documentNo: 'EKS-2026-08',
          title: 'Ağustos 2026 Garanti BBVA Hesap Özeti',
          description: 'Mali müşavir mutabakatı için indirilen aylık resmi ekstre',
          tags: ['Banka', 'Ekstre', 'Garanti'],
          currentVersion: 1,
          versions: [
            {
              versionNumber: 1,
              fileUrl: 'https://isbey.cloud/documents/garanti-ekstre-08.pdf',
              fileName: 'Garanti_Ekstre_08_2026.pdf',
              fileSize: 524288,
              uploadedByUserId: 'usr-accountant',
              uploadedByName: 'SMMM Yetkilisi',
              uploadedAt: now,
              changeSummary: 'Banka portalından aktarıldı.',
            },
          ],
          fileUrl: 'https://isbey.cloud/documents/garanti-ekstre-08.pdf',
          fileName: 'Garanti_Ekstre_08_2026.pdf',
          fileSize: 524288,
          mimeType: 'application/pdf',
          sharedWithMaliMusavir: true,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        }
      );
    }

    // Default Workspace Tasks
    if (state.workspaceTasks.length === 0) {
      state.workspaceTasks.push(
        {
          id: 'task-1',
          tenantId: 'tnt-isbey',
          title: 'Eylül 2026 KDV Beyannamesi Evrak Kontrolü',
          description: 'Eylül ayına ait tüm akaryakıt ve yemek fişlerinin sisteme girildiğinden emin olun.',
          assignedToUserId: 'usr-accountant',
          assignedToName: 'SMMM Yetkilisi',
          createdByUserId: 'usr-admin',
          createdByName: 'Şirket Sahibi',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          tags: ['KDV', 'Beyanname', 'Muhasebe'],
          commentsCount: 2,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'task-2',
          tenantId: 'tnt-isbey',
          title: 'Vadesi Geçen Carilere Hatırlatma Araması',
          description: '30 günden fazla gecikmesi olan 3 firma aranacak.',
          assignedToUserId: 'usr-saha-1',
          assignedToName: 'Ahmet Saha',
          createdByUserId: 'usr-admin',
          createdByName: 'Şirket Sahibi',
          priority: 'MEDIUM',
          status: 'NEW',
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          tags: ['Tahsilat', 'Saha'],
          commentsCount: 0,
          createdAt: now,
          updatedAt: now,
        }
      );
    }

    // Default Knowledge Articles
    if (state.knowledgeArticles.length === 0) {
      state.knowledgeArticles.push(
        {
          id: 'kb-1',
          category: 'E_FATURA',
          title: 'e-Fatura Nasıl Kesilir ve GİB’e Nasıl Gönderilir?',
          summary: 'Satış faturası oluşturulduktan sonra tek tıkla e-Fatura ve e-Arşiv faturası üretme rehberi.',
          contentMarkdown: 'Satış modülünden faturayı oluşturduktan sonra "Onayla & e-Belge Gönder" butonuna basarak 1 saniyede GİB onaylı e-Fatura oluşturabilirsiniz.',
          tags: ['e-Fatura', 'GİB', 'Satış'],
          viewsCount: 342,
          isPopular: true,
        },
        {
          id: 'kb-2',
          category: 'KASA_BANKA',
          title: 'Banka Hesap Ekstreleri AI ile Nasıl Otomatik Eşleştirilir?',
          summary: 'Excel veya PDF banka ekstresi yükleyerek cari hesaplarla %95+ doğrulukta otomatik eşleşme adımları.',
          contentMarkdown: 'Akıllı Banka Mutabakat ekranından dosyanızı sürükleyin, sistem gelen ve giden EFT/Havale açıklamalarını carilerinizle otomatik eşleştirir.',
          tags: ['Banka', 'Mutabakat', 'AI'],
          viewsCount: 189,
          isPopular: true,
        }
      );
    }

    // Default User Device
    if (state.userDevices.length === 0) {
      state.userDevices.push({
        id: 'dev-1',
        tenantId: 'tnt-isbey',
        userId: 'usr-admin',
        userName: 'Yönetici',
        deviceName: 'Windows 11 Chrome Desktop (Ofis)',
        platform: 'Windows',
        ipAddress: '88.245.120.45',
        lastActiveAt: now,
        isCurrent: true,
        isTrusted: true,
        isBlocked: false,
        createdAt: now,
      });
    }

    // Default Onboarding Progress
    if (state.onboardingProgress.length === 0) {
      state.onboardingProgress.push({
        id: 'onb-isbey',
        tenantId: 'tnt-isbey',
        companyInfoDone: true,
        taxInfoDone: true,
        logoUploaded: true,
        bankAdded: true,
        eInvoiceConfigured: true,
        firstCustomerCreated: true,
        firstInvoiceCreated: true,
        completionPercentage: 100,
        updatedAt: now,
      });
    }
  }

  /**
   * 2026-09-12 — UYDURMA VERİ TEMİZLİĞİ (idempotent, açık ID allowlist'i)
   * ────────────────────────────────────────────────────────────────────────
   * `hizli-bayi.ts` içindeki eski `ensureDealerData()` ve `seed.ts` uydurma
   * bayi/müşteri/komisyon kayıtları üretiyordu. Kaynak kod artık üretmiyor,
   * ancak kayıtlar `data/database.json` içine kalıcı olarak işlenmişti ve
   * panel/KPI'ları beslemeye devam ediyordu (ör. dashboard'da 3 "müşteri",
   * 27.500 kontör; komisyon ekranında 5.976 TL hakediş).
   *
   * KURAL: Burada YALNIZCA kimliği kanıtlanmış uydurma kayıtlar silinir.
   * Desen/regex ile toplu silme YAPILMAZ — gerçek firma kayıtları VKN ve
   * bağımlılık zinciri üzerinden korunur. Gerçek Hızlı Bilişim mükellef
   * kayıtları `externalCustomers` koleksiyonundadır ve buraya DOKUNULMAZ.
   *
   * Kanıt (neden bu kayıtlar uydurma):
   *  - dealerCustomers dc-*: `externalId` "ext-6808/6809/6810" (gerçekler
   *    "HB-<VKN>"), createdAt 2023-2024 (proje/tenant 2026'da kuruldu) ve
   *    kaynak koddaki eski seed ile birebir aynı alanlar.
   *  - dealer-marmara: VKN "9988776655" bariz doldurma, kişi "Ahmet Marmara".
   *  - dcom-1: MOCK ödeme sağlayıcılı pay-init-1'den türetilmiş, platformun
   *    kendi aboneliğine kendi kendine kesilmiş komisyon (döngüsel demo).
   *  - partner-17883.../17884.../17885...: adı birebir "TEST ANADOLU BAYİSİ LTD.",
   *    tenant'ları `test-tnt-a-*` (otomatik test kalıntısı) ve
   *    commissionPayoutTxs'lerinde "İŞBEY TEST FİRMASI A.Ş." yazıyor.
   *
   * Idempotenttir: ikinci çalıştırmada silinecek kayıt kalmaz, hiçbir şey olmaz.
   */
  private migrateFabricatedDataCleanup(state: DatabaseState) {
    // 0) tenantId alanı olmayan `dealerCustomers` kayıtları için varsayılan kiracı ata.
    //    Bu adım, route'lardaki tenant filtresi uygulanmadan önce mevcut tüm kayıtları
    //    geçerli bir kapsama sokar. Uydurma ID'ler zaten silineceği için onlara atama
    //    zararsız (silme önce, atama önce — sıra fark etmez).
    const PLATFORM_TENANT = state.activeTenantId || (state.tenants?.[0]?.id) || 'tnt-isbey';
    if (state.dealerCustomers) {
      for (const c of state.dealerCustomers) {
        if (!c.tenantId) {
          c.tenantId = PLATFORM_TENANT;
        }
      }
    }

    // 1) Uydurma bayi müşterileri (panel/KPI besliyordu)
    const FABRICATED_DEALER_CUSTOMER_IDS = [
      'dc-1681136628',
      'dc-20574058582',
      'dc-08132170413',
    ];
    if (state.dealerCustomers) {
      state.dealerCustomers = state.dealerCustomers.filter(
        c => !FABRICATED_DEALER_CUSTOMER_IDS.includes(c.id)
      );
    }


    // 2) Uydurma bayi kaydı (dealer-marmara). dealer-isbey-hq GERÇEK kayıttır
    //    (VKN 4810592817 = platformun kendi firması) ve KORUNUR.
    const FABRICATED_DEALER_IDS = ['dealer-marmara'];
    if (state.dealers) {
      state.dealers = state.dealers.filter(d => !FABRICATED_DEALER_IDS.includes(d.id));
    }

    // 3) Uydurma komisyon kaydı (MOCK ödemeden türetilmiş döngüsel demo).
    //    Bunu silince bayi bakiyesinden de düşülür ki bakiye ekranı tutarlı kalsın.
    const FABRICATED_COMMISSION_IDS = ['dcom-1'];
    if (state.dealerCommissions) {
      const removed = state.dealerCommissions.filter(c => FABRICATED_COMMISSION_IDS.includes(c.id));
      state.dealerCommissions = state.dealerCommissions.filter(
        c => !FABRICATED_COMMISSION_IDS.includes(c.id)
      );
      for (const com of removed) {
        const dealer = (state.dealers || []).find(d => d.id === com.dealerId);
        if (dealer) {
          dealer.balance = Math.round((((dealer.balance || 0) - (com.commissionAmount || 0))) * 100) / 100;
        }
      }
    }

    // 4) Otomatik test kalıntısı partner düğümleri + onlara bağlı komisyon
    //    ödemeleri. Gerçek zincir (partner-hq → partner-dealer-marmara →
    //    partner-sub-kadikoy) KORUNUR; parentPartnerId/cüzdan ilişkileri
    //    bozulmaz çünkü silinenlerin hiçbiri bir üst düğümün altında değil
    //    (hepsinin parentPartnerId değeri null).
    const TEST_PARTNER_NAME = 'TEST ANADOLU BAYİSİ LTD.';
    if (state.partnerNodes) {
      const removedPartnerIds = state.partnerNodes
        .filter(p => (p.name || '').trim() === TEST_PARTNER_NAME && !p.parentPartnerId)
        .map(p => p.id);
      state.partnerNodes = state.partnerNodes.filter(p => !removedPartnerIds.includes(p.id));

      // Alt düğüm referanslarını temizle (silinenlerin alt düğümü yoktu ama
      // yine de savunmacı davranıyoruz: hiçbir gerçek düğüm öksüz kalmasın).
      for (const node of state.partnerNodes) {
        if (node.subDealerIds && node.subDealerIds.length > 0) {
          node.subDealerIds = node.subDealerIds.filter(id => !removedPartnerIds.includes(id));
        }
        const parentId = node.parentPartnerId;
        if (parentId && removedPartnerIds.includes(parentId)) {
          node.parentPartnerId = null;
        }
      }

      if (state.commissionPayoutTxs) {
        state.commissionPayoutTxs = state.commissionPayoutTxs.filter(
          tx => !removedPartnerIds.includes(tx.partnerId)
        );
      }
    }
  }

  private migratePhase9Data(state: DatabaseState) {
    const now = new Date().toISOString();

    if (!state.saasPlans) state.saasPlans = [];
    if (!state.featureFlags) state.featureFlags = [];
    if (!state.tenantUsageMeters) state.tenantUsageMeters = [];
    if (!state.autoTopupRules) state.autoTopupRules = [];
    if (!state.partnerNodes) state.partnerNodes = [];
    if (!state.commissionRuleRecords) state.commissionRuleRecords = [];
    if (!state.commissionPayoutTxs) state.commissionPayoutTxs = [];
    if (!state.promoCoupons) state.promoCoupons = [];
    if (!state.referralRecords) state.referralRecords = [];
    if (!state.marketplaceApps) state.marketplaceApps = [];
    if (!state.integrationConnections) state.integrationConnections = [];
    if (!state.integrationSyncJobs) state.integrationSyncJobs = [];
    if (!state.apiApplications) state.apiApplications = [];
    if (!state.apiKeyCredentials) state.apiKeyCredentials = [];
    if (!state.apiUsageLogs) state.apiUsageLogs = [];
    if (!state.webhookSubscriptions) state.webhookSubscriptions = [];
    if (!state.webhookDeliveryLogs) state.webhookDeliveryLogs = [];
    if (!state.whiteLabelProfiles) state.whiteLabelProfiles = [];
    if (!state.customDomains) state.customDomains = [];
    if (!state.brandEmailConfigs) state.brandEmailConfigs = [];
    if (!state.platformAnnouncements) state.platformAnnouncements = [];
    if (!state.systemHealthIndicators) state.systemHealthIndicators = [];
    if (!state.tenantSuccessMetrics) state.tenantSuccessMetrics = [];
    if (!state.tenantDataExportJobs) state.tenantDataExportJobs = [];

    if (isProduction()) return;
    // 1. Feature Flags Seed
    if (state.featureFlags.length === 0) {
      state.featureFlags.push(
        {
          id: 'ff-ai-assistant',
          key: 'ai_assistant',
          name: 'AI Muhasebe Asistanı & Tahminleme',
          description: 'Akıllı finansal analiz, nakit tahmin ve anomali tespiti',
          isEnabledGlobally: true,
          rolloutPercentage: 100,
          allowedPlans: ['pro', 'kurumsal', 'musavir', 'enterprise'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ff-ocr',
          key: 'ocr',
          name: 'Document AI & OCR Fiş Okuma',
          description: 'Fotoğraftan ve PDF belgelerden otomatik alış faturası çıkarma',
          isEnabledGlobally: true,
          rolloutPercentage: 100,
          allowedPlans: ['pro', 'kurumsal', 'musavir', 'enterprise'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ff-einvoice',
          key: 'e_invoice',
          name: 'GİB e-Fatura / e-Arşiv / e-İrsaliye',
          description: 'Doğrudan resmi entegratör üzerinden elektronik belge gönderip alma',
          isEnabledGlobally: true,
          rolloutPercentage: 100,
          allowedPlans: ['starter', 'pro', 'kurumsal', 'musavir', 'enterprise'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ff-bank',
          key: 'bank_integration',
          name: 'Açık Bankacılık & Otomatik Mutabakat',
          description: 'Banka hesap hareketlerini canlı çekme ve cari eşleştirme',
          isEnabledGlobally: true,
          rolloutPercentage: 100,
          allowedPlans: ['kurumsal', 'musavir', 'enterprise'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ff-api',
          key: 'api_access',
          name: 'Developer API & Webhooks',
          description: 'Dış sistemler ve e-ticaret platformları için REST API entegrasyonu',
          isEnabledGlobally: true,
          rolloutPercentage: 100,
          allowedPlans: ['kurumsal', 'enterprise'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ff-wl',
          key: 'white_label',
          name: 'White-Label Özel Marka & Custom Domain',
          description: 'Kendi logonuz, renkleriniz ve alan adınız altında platform sunumu',
          isEnabledGlobally: true,
          rolloutPercentage: 100,
          allowedPlans: ['enterprise'],
          createdAt: now,
          updatedAt: now,
        }
      );
    }

    // 2. Dinamik SaaS Planları
    if (state.saasPlans.length === 0) {
      state.saasPlans.push(
        {
          id: 'plan-starter',
          slug: 'starter',
          name: 'Başlangıç Paketi',
          description: 'Küçük işletmeler ve yeni başlayanlar için temel ön muhasebe ve e-Dönüşüm',
          monthlyPrice: 490,
          yearlyPrice: 4900,
          currency: 'TRY',
          trialDays: 14,
          isActive: true,
          displayOrder: 1,
          limits: {
            maxUsers: 2,
            maxCompanies: 1,
            maxCustomers: 250,
            maxProducts: 500,
            maxInvoicesMonthly: 150,
            maxWarehouses: 1,
            aiRequestLimit: 20,
            ocrDocumentLimit: 10,
            apiRateLimitDaily: 100,
            storageMb: 1024,
          },
          featureFlags: ['e_invoice'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'plan-pro',
          slug: 'pro',
          name: 'Profesyonel Paket',
          description: 'Büyüyen KOBİ’ler için AI asistanı, OCR fiş okuma ve çoklu kullanıcı',
          monthlyPrice: 990,
          yearlyPrice: 9900,
          currency: 'TRY',
          trialDays: 14,
          isActive: true,
          displayOrder: 2,
          isPopular: true,
          limits: {
            maxUsers: 5,
            maxCompanies: 2,
            maxCustomers: 1500,
            maxProducts: 3000,
            maxInvoicesMonthly: 1000,
            maxWarehouses: 3,
            aiRequestLimit: 200,
            ocrDocumentLimit: 100,
            apiRateLimitDaily: 1000,
            storageMb: 5120,
          },
          featureFlags: ['e_invoice', 'ai_assistant', 'ocr'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'plan-kurumsal',
          slug: 'kurumsal',
          name: 'Kurumsal Paket',
          description: 'Geniş ticaret hacmi, banka entegrasyonu, API erişimi ve saha tahsilat',
          monthlyPrice: 1990,
          yearlyPrice: 19900,
          currency: 'TRY',
          trialDays: 14,
          isActive: true,
          displayOrder: 3,
          limits: {
            maxUsers: 15,
            maxCompanies: 5,
            maxCustomers: 10000,
            maxProducts: 25000,
            maxInvoicesMonthly: 5000,
            maxWarehouses: 10,
            aiRequestLimit: 1000,
            ocrDocumentLimit: 500,
            apiRateLimitDaily: 10000,
            storageMb: 20480,
          },
          featureFlags: ['e_invoice', 'ai_assistant', 'ocr', 'bank_integration', 'api_access'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'plan-musavir',
          slug: 'musavir',
          name: 'Müşavir Pro Paketi',
          description: 'SMMM ve mali müşavirler için çoklu firma yönetim masası ve ortak workspace',
          monthlyPrice: 1490,
          yearlyPrice: 14900,
          currency: 'TRY',
          trialDays: 14,
          isActive: true,
          displayOrder: 4,
          limits: {
            maxUsers: 10,
            maxCompanies: 50,
            maxCustomers: 25000,
            maxProducts: 50000,
            maxInvoicesMonthly: 10000,
            maxWarehouses: 20,
            aiRequestLimit: 2000,
            ocrDocumentLimit: 1000,
            apiRateLimitDaily: 10000,
            storageMb: 51200,
          },
          featureFlags: ['e_invoice', 'ai_assistant', 'ocr', 'bank_integration'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'plan-enterprise',
          slug: 'enterprise',
          name: 'Enterprise / Özel Marka',
          description: 'Limitsiz kaynaklar, White-Label özel alan adı, SLA ve adanmış destek',
          monthlyPrice: 4990,
          yearlyPrice: 49900,
          currency: 'TRY',
          trialDays: 14,
          isActive: true,
          displayOrder: 5,
          limits: {
            maxUsers: 100,
            maxCompanies: 100,
            maxCustomers: 100000,
            maxProducts: 250000,
            maxInvoicesMonthly: 50000,
            maxWarehouses: 50,
            aiRequestLimit: 10000,
            ocrDocumentLimit: 5000,
            apiRateLimitDaily: 100000,
            storageMb: 204800,
          },
          featureFlags: ['e_invoice', 'ai_assistant', 'ocr', 'bank_integration', 'api_access', 'white_label'],
          createdAt: now,
          updatedAt: now,
        }
      );
    }

    // 3. Marketplace Entegrasyon Mağazası
    if (state.marketplaceApps.length === 0) {
      state.marketplaceApps.push(
        {
          id: 'app-garanti',
          slug: 'garanti-bbva-open-banking',
          name: 'Garanti BBVA Açık Bankacılık',
          category: 'BANKA',
          shortDescription: 'Canlı hesap ekstresi ve otomatik cari havale eşleme',
          fullDescription: 'Garanti BBVA kurumsal API ile hesap hareketlerini 7/24 otomatik içe aktarın.',
          version: '2.4.0',
          pricingType: 'FREE',
          author: 'İŞBEY Entegrasyon Ekibi',
          isVerified: true,
          rating: 4.9,
          installedTenantsCount: 142,
          status: 'PUBLISHED',
          requiredScopes: ['bank.read', 'bank.sync'],
          createdAt: now,
        },
        {
          id: 'app-paytr',
          slug: 'paytr-pos-gateway',
          name: 'PayTR Sanal POS & Linkle Ödeme',
          category: 'ODEME',
          shortDescription: 'Taksitli kredi kartı tahsilatı ve otomatik cari mahsup',
          fullDescription: 'PayTR iFrame ve Direct API ile tek çekim veya 12 taksite kadar online tahsilat alın.',
          version: '3.1.0',
          pricingType: 'FREE',
          author: 'PayTR Resmi',
          isVerified: true,
          rating: 4.8,
          installedTenantsCount: 210,
          status: 'PUBLISHED',
          requiredScopes: ['payments.write', 'customers.read'],
          createdAt: now,
        },
        {
          id: 'app-yurtici',
          slug: 'yurtici-kargo-connector',
          name: 'Yurtiçi Kargo Otomasyonu',
          category: 'KARGO',
          shortDescription: 'Sipariş ve irsaliyelerden otomatik kargo barkodu basma',
          fullDescription: 'e-İrsaliye ve siparişleriniz oluşturulduğu anda Yurtiçi Kargo takip numarası üretin.',
          version: '1.2.0',
          pricingType: 'FREE',
          author: 'İŞBEY Lojistik',
          isVerified: true,
          rating: 4.7,
          installedTenantsCount: 88,
          status: 'PUBLISHED',
          requiredScopes: ['waybills.read', 'orders.read'],
          createdAt: now,
        },
        {
          id: 'app-trendyol',
          slug: 'trendyol-marketplace-sync',
          name: 'Trendyol Mağaza Entegrasyonu',
          category: 'E_TICARET',
          shortDescription: 'Trendyol siparişlerini otomatik faturaya ve stoka dönüştürün',
          fullDescription: 'Pazaryeri satışlarınızı anında muhasebeleştirin, stokları çift yönlü senkronize edin.',
          version: '2.0.1',
          pricingType: 'MONTHLY_PAID',
          priceMonthly: 290,
          author: 'İŞBEY E-Ticaret Labs',
          isVerified: true,
          rating: 4.9,
          installedTenantsCount: 175,
          status: 'PUBLISHED',
          requiredScopes: ['invoices.write', 'products.write', 'customers.write'],
          createdAt: now,
        }
      );
    }

    // 4. Partner & Bayi Ağı Hiyerarşisi Seed
    if (state.partnerNodes.length === 0) {
      state.partnerNodes.push(
        {
          id: 'partner-hq',
          role: 'MAIN_PLATFORM',
          code: 'ISBEY-HQ',
          name: 'İŞBEY Cloud Merkez Platformu',
          contactName: 'Genel Dağıtım Birimi',
          email: 'partner@isbey.cloud',
          phone: '+90 216 555 0100',
          city: 'İstanbul',
          defaultCommissionRate: 100,
          walletBalance: 245000,
          pendingCommission: 0,
          paidCommissionTotal: 0,
          assignedTenantIds: ['tnt-isbey'],
          subDealerIds: ['partner-dealer-marmara'],
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'partner-dealer-marmara',
          parentPartnerId: 'partner-hq',
          role: 'DEALER',
          code: 'BAYI-3401',
          name: 'Marmara Bölge Bilişim Çözümleri Ltd.',
          contactName: 'Kemal Dağıtıcı',
          email: 'marmara@bayi.isbey.cloud',
          phone: '0533 111 2233',
          city: 'İstanbul',
          taxNumber: '6120492817',
          defaultCommissionRate: 20,
          walletBalance: 14850,
          pendingCommission: 3200,
          paidCommissionTotal: 42000,
          assignedTenantIds: ['tnt-isbey'],
          subDealerIds: ['partner-sub-kadikoy'],
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'partner-sub-kadikoy',
          parentPartnerId: 'partner-dealer-marmara',
          role: 'SUB_DEALER',
          code: 'ALT-BAYI-02',
          name: 'Kadıköy Yazılım & Donanım Hizmetleri',
          contactName: 'Selim Saha',
          email: 'kadikoy@altbayi.isbey.cloud',
          phone: '0535 222 3344',
          city: 'İstanbul',
          defaultCommissionRate: 12,
          walletBalance: 4200,
          pendingCommission: 850,
          paidCommissionTotal: 9600,
          assignedTenantIds: [],
          isActive: true,
          createdAt: now,
          updatedAt: now,
        }
      );
    }

    // 5. Komisyon Kuralları
    if (state.commissionRuleRecords.length === 0) {
      state.commissionRuleRecords.push(
        { id: 'com-rule-1', ruleName: 'Yeni Abonelik Satışı', targetService: 'SUBSCRIPTION_NEW', commissionRate: 20, isActive: true },
        { id: 'com-rule-2', ruleName: 'Abonelik Yenileme', targetService: 'SUBSCRIPTION_RENEWAL', commissionRate: 15, isActive: true },
        { id: 'com-rule-3', ruleName: 'Kontör Paketi Satışı', targetService: 'CREDIT_PURCHASE', commissionRate: 10, isActive: true },
        { id: 'com-rule-4', ruleName: 'Marketplace Uygulama Satışı', targetService: 'MARKETPLACE_APP', commissionRate: 30, isActive: true }
      );
    }

    // 6. Kuponlar ve Kampanyalar
    if (state.promoCoupons.length === 0) {
      state.promoCoupons.push(
        {
          id: 'coup-1',
          code: 'ILKAY10',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          maxRedemptions: 500,
          currentRedemptions: 34,
          perTenantLimit: 1,
          validFrom: now,
          validUntil: '2027-12-31T23:59:59Z',
          isActive: true,
          createdAt: now,
        },
        {
          id: 'coup-2',
          code: 'BULUT2026',
          discountType: 'FIXED_AMOUNT',
          discountValue: 250,
          maxRedemptions: 100,
          currentRedemptions: 12,
          perTenantLimit: 1,
          minAmount: 1000,
          validFrom: now,
          validUntil: '2027-12-31T23:59:59Z',
          isActive: true,
          createdAt: now,
        }
      );
    }

    // 7. Sistem Sağlık Göstergeleri
    if (state.systemHealthIndicators.length === 0) {
      state.systemHealthIndicators.push(
        { serviceName: 'REST API Gateway', status: 'HEALTHY', latencyMs: 24, uptimePercentage: 99.98, lastCheckedAt: now },
        { serviceName: 'Veritabanı & JSON Storage', status: 'HEALTHY', latencyMs: 12, uptimePercentage: 99.99, lastCheckedAt: now },
        { serviceName: 'AI Inference (Gemini Pro)', status: 'HEALTHY', latencyMs: 340, uptimePercentage: 99.85, lastCheckedAt: now },
        { serviceName: 'Document AI OCR Engine', status: 'HEALTHY', latencyMs: 420, uptimePercentage: 99.90, lastCheckedAt: now },
        { serviceName: 'GİB e-Dönüşüm Connector', status: 'HEALTHY', latencyMs: 180, uptimePercentage: 99.95, lastCheckedAt: now },
        { serviceName: 'Ödeme Sağlayıcı (Iyzico/PayTR)', status: 'HEALTHY', latencyMs: 95, uptimePercentage: 99.99, lastCheckedAt: now },
        { serviceName: 'Webhook Dağıtım Kuyruğu', status: 'HEALTHY', latencyMs: 15, uptimePercentage: 100, lastCheckedAt: now }
      );
    }

    // 8. Platform Duyuruları
    if (state.platformAnnouncements.length === 0) {
      state.platformAnnouncements.push({
        id: 'ann-1',
        title: '🚀 İŞBEY Cloud FAZ 9: Ticari SaaS ve Bayi Ağı Yayında!',
        content: 'Tüm iş ortaklarımız ve müşterilerimiz için API Platformu, Entegrasyon Pazaryeri ve White-Label desteği kullanıma açıldı.',
        targetAudience: 'ALL',
        priority: 'NORMAL',
        isActive: true,
        createdAt: now,
      });
    }

    // 9. Varsayılan White-Label Profili
    if (state.whiteLabelProfiles.length === 0) {
      state.whiteLabelProfiles.push({
        id: 'wl-isbey-default',
        tenantId: 'tnt-isbey',
        brandName: 'İŞBEY Cloud',
        primaryColor: '#0284c7',
        accentColor: '#38bdf8',
        supportEmail: 'destek@isbey.cloud',
        supportPhone: '+90 216 555 0123',
        loginScreenMessage: 'İşletmenizin Yeni Nesil Akıllı Bulut ERP ve Muhasebe Platformu',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 10. Tenant Usage Meter
    if (state.tenantUsageMeters.length === 0) {
      const currentPeriod = now.slice(0, 7); // YYYY-MM
      state.tenantUsageMeters.push({
        id: `usg-tnt-isbey-${currentPeriod}`,
        tenantId: 'tnt-isbey',
        period: currentPeriod,
        invoiceCount: 42,
        eDocumentCount: 38,
        ocrCount: 15,
        aiTokensCount: 24500,
        smsCount: 8,
        storageUsedMb: 142,
        apiRequestsCount: 340,
        webhookEventsCount: 12,
        updatedAt: now,
      });
    }
  }

  public generateNextCompanyCode(draft?: DatabaseState): string {
    const list = draft ? draft.tenants : (this.db.tenants || []);
    let maxNum = 0;
    for (const t of list) {
      if (t.companyCode && t.companyCode.startsWith('ISB-')) {
        const num = parseInt(t.companyCode.replace('ISB-', ''), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const nextNum = maxNum + 1;
    return `ISB-${String(nextNum).padStart(6, '0')}`;
  }

  private saveDatabase(state: DatabaseState) {
    try {
      this.ensureDataDir();
      const tempFile = DATA_FILE + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
      replaceFileWithRetry(tempFile, DATA_FILE);
    } catch (err) {
      console.error('[STORAGE] Error saving:', err);
      throw err;
    }
  }

  public getState(tenantId?: string): DatabaseState {
    return scopedState(this.transactionDraft.getStore() || this.db, tenantId);
  }

  public update(updater: (draft: DatabaseState) => void): void {
    const current = this.transactionDraft.getStore();
    if (current) { updater(scopedState(current)); return; }
    if (this.transactionBusy) throw new Error('Veritabanı işlemi sürüyor; işlemi tekrar deneyin.');
    const clone: DatabaseState = JSON.parse(JSON.stringify(this.db));
    updater(scopedState(clone));
    this.saveDatabase(clone);
    this.db = clone;
  }

  public async runTransaction<T>(action: (draft: DatabaseState) => T | Promise<T>): Promise<T> {
    const current = this.transactionDraft.getStore();
    if (current) return action(scopedState(current));
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    this.transactionBusy = true;
    const clone: DatabaseState = JSON.parse(JSON.stringify(this.db));
    try {
      const result = await this.transactionDraft.run(clone, () => action(scopedState(clone)));
      this.recalculateBalances(clone);
      this.saveDatabase(clone);
      this.db = clone;
      return result;
    } catch (error) {
      console.error('[TRANSACTION ROLLBACK]', error);
      throw error;
    } finally {
      this.transactionBusy = false;
      release();
    }
  }

  public runTransactionForTenant<T>(tenantId: string, action: (draft: DatabaseState) => T | Promise<T>): Promise<T> {
    if (!this.db.tenants.some(t => t.id === tenantId)) throw new Error('Geçerli firma zorunludur.');
    return tenantContext.run(tenantId, () => this.runTransaction(action));
  }

  public nextSequenceInTransaction(draft: DatabaseState, type: string): string {
    const yr = new Date().getFullYear();
    if (!draft.sequences[type]) {
      draft.sequences[type] = { prefix: type.substring(0, 3).toUpperCase(), year: yr, lastNumber: 0, length: 6 };
    }
    const seq = draft.sequences[type];
    if (seq.year !== yr) { seq.year = yr; seq.lastNumber = 0; }
    seq.lastNumber += 1;
    return seq.prefix + '-' + yr + '-' + String(seq.lastNumber).padStart(seq.length, '0');
  }

  public getNextSequence(type: string): string {
    let result = '';
    this.update(draft => { result = this.nextSequenceInTransaction(draft, type); });
    return result;
  }

  public addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    const newLog: AuditLog = {
      ...log,
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
    };
    this.update(draft => {
      draft.auditLogs.unshift(newLog);
      if (draft.auditLogs.length > 5000) draft.auditLogs = draft.auditLogs.slice(0, 5000);
    });
  }

  public save() {
    this.saveDatabase(this.db);
  }

  public recalculateBalances(state: DatabaseState) {
    for (const cust of state.customers) {
      const txs = state.currentTransactions
        .filter(t => t.customerId === cust.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      let debit = 0, credit = 0;
      for (const t of txs) {
        debit += Number(t.debit || 0);
        credit += Number(t.credit || 0);
        t.balance = Math.round((debit - credit) * 100) / 100;
      }
      cust.totalDebit = Math.round(debit * 100) / 100;
      cust.totalCredit = Math.round(credit * 100) / 100;
      cust.balance = Math.round((cust.totalDebit - cust.totalCredit) * 100) / 100;
    }

    for (const prod of state.products) {
      const mvs = state.stockMovements.filter(m => m.productId === prod.id);
      if (mvs.length > 0) {
        let inQty = 0, outQty = 0;
        for (const m of mvs) {
          if (m.direction === 'IN') inQty += Number(m.quantity || 0);
          else outQty += Number(m.quantity || 0);
        }
        prod.currentStock = Math.max(0, Math.round((inQty - outQty) * 1000) / 1000);
      }
    }

    for (const cash of state.cashRegisters) {
      const txs = state.cashTransactions.filter(c => c.cashRegisterId === cash.id);
      if (txs.length > 0) {
        let inAmt = 0, outAmt = 0;
        for (const t of txs) {
          if (t.direction === 'IN') inAmt += Number(t.amount || 0);
          else outAmt += Number(t.amount || 0);
        }
        cash.balance = Math.round((inAmt - outAmt) * 100) / 100;
      }
    }

    for (const bnk of state.bankAccounts) {
      const txs = state.bankTransactions.filter(b => b.bankAccountId === bnk.id);
      if (txs.length > 0) {
        let inAmt = 0, outAmt = 0;
        for (const t of txs) {
          if (t.direction === 'IN') inAmt += Number(t.amount || 0);
          else outAmt += Number(t.amount || 0);
        }
        bnk.balance = Math.round((inAmt - outAmt) * 100) / 100;
      }
    }
  }

  public backup(): string {
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = 'backup_' + ts + '.json';
    const json = JSON.stringify(this.db, null, 2);
    const backupPath = path.join(backupDir, filename);
    fs.writeFileSync(backupPath, json, 'utf-8');

    // FAZ 25.5 #3: Checksum doğrulama desteği — yedeğin bütünlüğü restore
    // öncesi SHA-256 sidecar ile doğrulanabilir (docs/18 FAZ 25.5).
    try {
      const checksum = crypto.createHash('sha256').update(json).digest('hex');
      fs.writeFileSync(backupPath + '.sha256', `${checksum}  ${filename}\n`, 'utf-8');
    } catch (err) {
      // Checksum yazımı yedeğin kendisini geçersiz kılmaz — uyarı yeterli
      console.warn('[STORAGE] Backup checksum yazılamadı:', err);
    }

    // FAZ 25.5 #2: Retention politikası — env ile ayarlanabilir
    // (BACKUP_RETENTION_COUNT varsayılan 20, BACKUP_RETENTION_DAYS varsayılan 30).
    // Sadece *.json yedekleri sayılır; .sha256 sidecar'ları kendi .json'u ile silinir.
    this.pruneBackups(backupDir);
    return filename;
  }

  /**
   * FAZ 25.5 #2: Eski yedekleri temizler (retention).
   * Kural: en yeni N yedek her zaman korunur; ek olarak MAX_AGE gününden
   * genç olanlar korunur. En az 1 yedek her koşulda kalır (son savunma hattı).
   */
  private pruneBackups(backupDir: string): void {
    try {
      const retentionCount = Math.max(1, parseInt(process.env.BACKUP_RETENTION_COUNT || '20', 10) || 20);
      const retentionDays = Math.max(0, parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10) || 30);
      const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      const backups = fs.readdirSync(backupDir)
        .filter(f => /^backup_.+\.json$/.test(f))
        .map(f => {
          const full = path.join(backupDir, f);
          return { file: f, path: full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime); // en yeni önce

      const toDelete = new Set<string>();
      // Kural 1: retention sayısının dışındaki eski yedekler
      backups.forEach((b, idx) => {
        if (idx >= retentionCount) toDelete.add(b.file);
      });
      // Kural 2: cutoff'tan eski ama henüz sayı kuralına takılmayanlar da silinir
      for (const b of backups) {
        if (b.mtime < cutoffMs) toDelete.add(b.file);
      }
      // Güvence: en az 1 (en yeni) yedek her koşulda kalır
      if (backups.length > 0) toDelete.delete(backups[0].file);

      for (const file of toDelete) {
        const jsonPath = path.join(backupDir, file);
        fs.unlinkSync(jsonPath);
        const shaPath = jsonPath + '.sha256';
        if (fs.existsSync(shaPath)) fs.unlinkSync(shaPath); // sidecar ile birlikte
      }
    } catch (err) {
      // Retention hatası yedekleme işlemini başarısız kılmaz
      console.warn('[STORAGE] Backup retention (prune) hatası:', err);
    }
  }

  /**
   * FAZ 25.5 #3: Yedek bütünlüğü doğrulama — restore ÖNCESİ çağrılır.
   * .sha256 sidecar yoksa true döner (eski yedeklerle geriye uyum).
   */
  public verifyBackupChecksum(filename: string): boolean {
    const backupPath = path.join(DATA_DIR, 'backups', filename);
    const shaPath = backupPath + '.sha256';
    if (!fs.existsSync(shaPath)) return true; // sidecarsız eski yedek — geçerli kabul
    const expected = (fs.readFileSync(shaPath, 'utf-8').trim().split(/\s+/)[0] || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected)) return false;
    const actual = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
    return actual === expected;
  }

  public addSyncLog(log: Omit<import('./schema').IntegrationSyncLog, 'id' | 'createdAt'>) {
    if (!this.db.integrationSyncLogs) this.db.integrationSyncLogs = [];
    const newLog: import('./schema').IntegrationSyncLog = {
      ...log,
      id: `synclog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.db.integrationSyncLogs.unshift(newLog);
    if (this.db.integrationSyncLogs.length > 200) {
      this.db.integrationSyncLogs = this.db.integrationSyncLogs.slice(0, 200);
    }
    this.saveDatabase(this.db);
  }

  /**
   * Multi-Tenant: Yeni bir tenant/firma kaydı olduğunda tüm varsayılan altyapıyı otomatik kurar
   */
  public bootstrapNewTenant(
    tenant: import('./schema').Tenant,
    adminUser: import('./schema').User,
    draft?: DatabaseState
  ) {
    const target = draft || this.db;
    const now = new Date().toISOString();

    if (!target.tenants) target.tenants = [];
    if (!target.users) target.users = [];
    if (!target.cashRegisters) target.cashRegisters = [];
    if (!target.bankAccounts) target.bankAccounts = [];
    if (!target.warehouses) target.warehouses = [];
    if (!target.creditTransactions) target.creditTransactions = [];
    if (!target.dealerCustomers) target.dealerCustomers = [];
    if (!target.supportTickets) target.supportTickets = [];
    if (!target.tenantUsers) target.tenantUsers = [];

    // 1. Tenant ekle
    target.tenants.push(tenant);

    // 2. Admin kullanıcı ekle
    target.users.push(adminUser);

    // 2.1. TenantUser İlişkisi Ekle
    target.tenantUsers.push({
      id: `tu-${adminUser.id}-${tenant.id}`,
      tenantId: tenant.id,
      userId: adminUser.id,
      roleSlug: 'company_admin',
      isOwner: true,
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Varsayılan Kasa
    target.cashRegisters.push({
      id: `cash-${tenant.id}-default`,
      name: `${tenant.name} Merkez Kasa (TL)`,
      code: 'KSA-01',
      isDefault: true,
      balance: 0,
      currency: 'TRY',
      description: 'Varsayılan Şirket Merkez Kasası',
      active: true,
    });

    // 4. Varsayılan Depo
    target.warehouses.push({
      id: `wh-${tenant.id}-default`,
      name: `${tenant.name} Ana Merkez Depo`,
      code: 'DEP-01',
      isDefault: true,
      address: tenant.address || `${tenant.city || 'Merkez'} Depo`,
    });

    // 5. 100 Ücretsiz e-Dönüşüm / e-Fatura Kontörü Tanımla
    target.creditTransactions.push({
      id: `crd-init-${tenant.id}-${Date.now()}`,
      dealerId: 'dealer-isbey-hq',
      customerId: tenant.id,
      customerName: tenant.name,
      taxNumber: tenant.taxNumber,
      amount: 100,
      unitPrice: 0,
      totalPrice: 0,
      balanceAfter: 100,
      note: 'İŞBEY CLOUD 14 Günlük Deneme Paketi Hoş Geldin Kontörü (100 Kontör)',
      type: 'PURCHASE',
      performedBy: 'System / Self-Registration',
      createdAt: now,
    });

    // 6. Hoş Geldiniz Sistem Bildirimi
    if (!target.notifications) target.notifications = [];
    target.notifications.unshift({
      id: `notif-welcome-${tenant.id}`,
      type: 'SYSTEM_INFO',
      severity: 'SUCCESS',
      title: `🎉 İŞBEY CLOUD'a Hoş Geldiniz!`,
      message: `${tenant.title || tenant.name} firmanız başarıyla oluşturuldu. 14 günlük deneme sürümünüz ve 100 e-belge kontörünüz aktif edildi.`,
      actionUrl: '/app',
      isRead: false,
      createdAt: now,
    });

    if (!draft) {
      this.saveDatabase(this.db);
    }
  }
}

export const storage = new StorageManager();
