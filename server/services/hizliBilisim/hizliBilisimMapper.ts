import { ExternalCustomer, Tenant, User, TenantPlan, CompanyService, Warehouse, CashRegister, BankAccount } from '../../db/schema';
import { storage } from '../../db/storage';

export class HizliBilisimMapper {
  /**
   * Hızlı Bilişim müşterisini İŞBEY Firma (Tenant) formatına dönüştürür.
   */
  public static mapToTenant(
    ext: ExternalCustomer,
    options: {
      plan?: TenantPlan;
      startDate?: string;
      endDate?: string;
      isTrial?: boolean;
      trialDays?: number;
      maxUsers?: number;
      storageLimitMb?: number;
    } = {}
  ): {
    tenant: Tenant;
    defaultWarehouse: Warehouse;
    defaultCashRegister: CashRegister;
    defaultBankAccount: BankAccount;
  } {
    const plan = options.plan || 'PRO';
    const isTrial = options.isTrial || false;
    const trialDays = options.trialDays || 14;
    const startDate = options.startDate || new Date().toISOString().split('T')[0];

    const endDate = options.endDate || (isTrial
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    const companyId = `tnt-${Date.now()}`;
    const generatedCode = storage.generateNextCompanyCode();

    const cleanSlug = ext.companyName
      .toLowerCase()
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 25);

    // Plan standart hizmetleri
    const includedServices: CompanyService[] = [
      { serviceCode: 'PRE_ACCOUNTING', serviceName: 'Ön Muhasebe', startDate, endDate, status: 'ACTIVE' },
      { serviceCode: 'CARI', serviceName: 'Cari Hesaplar', startDate, endDate, status: 'ACTIVE' },
      { serviceCode: 'STOK', serviceName: 'Stok Yönetimi', startDate, endDate, status: 'ACTIVE' },
      { serviceCode: 'FATURA', serviceName: 'Fatura Modülü', startDate, endDate, status: 'ACTIVE' },
      { serviceCode: 'EFATURA', serviceName: 'e-Fatura Entegrasyonu', startDate, endDate, status: 'ACTIVE' },
      { serviceCode: 'EARSIV', serviceName: 'e-Arşiv Fatura', startDate, endDate, status: 'ACTIVE' },
      { serviceCode: 'KASA', serviceName: 'Kasa Takibi', startDate, endDate, status: 'ACTIVE' },
      { serviceCode: 'BANKA', serviceName: 'Banka Hesapları', startDate, endDate, status: 'ACTIVE' },
      { serviceCode: 'RAPOR', serviceName: 'Finansal Raporlar', startDate, endDate, status: 'ACTIVE' },
    ];

    if (plan === 'ENTERPRISE') {
      includedServices.push(
        { serviceCode: 'EIRSALIYE', serviceName: 'e-İrsaliye', startDate, endDate, status: 'ACTIVE' },
        { serviceCode: 'CEK_SENET', serviceName: 'Çek / Senet', startDate, endDate, status: 'ACTIVE' },
        { serviceCode: 'PERSONEL', serviceName: 'Personel & Prim', startDate, endDate, status: 'ACTIVE' },
        { serviceCode: 'AI_ASISTAN', serviceName: 'AI Asistanı', startDate, endDate, status: 'ACTIVE' }
      );
    }

    const tenant: Tenant = {
      id: companyId,
      companyCode: generatedCode,
      name: ext.companyName.trim(),
      slug: `${cleanSlug}-${Date.now().toString().slice(-4)}`,
      title: ext.title?.trim() || ext.companyName.trim(),
      taxNumber: ext.taxNumber.trim(),
      taxOffice: ext.taxOffice?.trim() || '',
      email: ext.email.trim(),
      phone: ext.phone.trim(),
      address: ext.address?.trim() || '',
      city: ext.city?.trim() || '',
      district: ext.district?.trim() || '',
      plan: plan,
      status: isTrial ? 'TRIAL' : 'ACTIVE',
      maxUsers: options.maxUsers || (plan === 'ENTERPRISE' ? 25 : plan === 'PRO' ? 10 : 3),
      currentUsers: 1,
      maxInvoicesPerMonth: plan === 'ENTERPRISE' ? 10000 : plan === 'PRO' ? 3000 : 1000,
      // Hızlı Bilişim API'sinden gerçek bir kontör bakiyesi gelmeden İŞBEY'de
      // kontör tanımlanmaz. Aksi bir başlangıç değeri, şirketin hiç sahip
      // olmadığı kontörü kullanabilir görünmesine yol açar.
      eInvoiceCredits: 0,
      storageLimitMb: options.storageLimitMb || (plan === 'ENTERPRISE' ? 10240 : 5120),
      storageUsedMb: 0,
      // İŞBEY hesabı açılan firma, e-Dönüşüm dışında günlük ERP işlerini
      // hemen kullanabilir. e-Belge gönderimi yine ayrıca firma bazlı
      // entegratör kimlik bilgisi ve profil doğrulaması ister.
      activeModules: [
        'POS', 'STOK', 'CARI', 'FATURA', 'TEKLIF_SIPARIS', 'IRSALIYE',
        'BANKA', 'KASA', 'CEK_SENET', 'E_FATURA', 'PERSONEL', 'RAPORLAR',
      ] as any,
      activeServices: includedServices,
      license: {
        startDate,
        endDate,
        isTrial,
        trialDays: isTrial ? trialDays : 0,
        status: 'ACTIVE',
      },
      limits: {
        maxUsers: options.maxUsers || (plan === 'ENTERPRISE' ? 25 : plan === 'PRO' ? 10 : 3),
        maxBranches: plan === 'ENTERPRISE' ? 10 : 3,
        maxWarehouses: plan === 'ENTERPRISE' ? 10 : 3,
        maxInvoicesPerMonth: plan === 'ENTERPRISE' ? 10000 : 3000,
        storageLimitMb: options.storageLimitMb || 5120,
        storageUsedMb: 0,
      },
      branches: [
        {
          id: `br-${Date.now()}-1`,
          name: `${ext.companyName.trim()} Merkez Şube`,
          code: 'SB-01',
          isDefault: true,
          phone: ext.phone || '',
          city: ext.city || '',
          managerName: ext.contactName || '',
        },
      ],
      authorizedPerson: {
        firstName: ext.contactName.split(' ')[0] || 'Yetkili',
        lastName: ext.contactName.split(' ').slice(1).join(' ') || '',
        phone: ext.phone,
        email: ext.email,
      },
      ownerName: ext.contactName,
      ownerEmail: ext.email,
      ownerPhone: ext.phone,
      expiresAt: `${endDate}T23:59:59Z`,
      externalProvider: 'HIZLI_BILISIM',
      externalCustomerId: ext.externalId,
      syncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: {
        totalCustomers: 0,
        totalProducts: 0,
        totalInvoices: 0,
        totalRevenue: 0,
        monthlyInvoiceCount: 0,
        userCount: 1,
        activeServicesCount: includedServices.length,
        warehouseCount: 1,
        branchCount: 1,
      },
    };

    const defaultWarehouse: Warehouse = {
      id: `wh-${companyId}`,
      tenantId: companyId,
      name: `${ext.companyName.trim()} Merkez Depo`,
      code: 'DEP-01',
      isDefault: true,
      address: ext.address || '',
    };

    const defaultCashRegister: CashRegister = {
      id: `cash-${companyId}`,
      tenantId: companyId,
      name: 'Merkez TL Kasası',
      code: 'KAS-01',
      isDefault: true,
      balance: 0,
      currency: '₺',
      active: true,
      description: 'Varsayılan Şirket Nakit Kasası',
    };

    const defaultBankAccount: BankAccount = {
      id: `bnk-${companyId}`,
      tenantId: companyId,
      // Banka bilgisi Hızlı Bilişim müşteri kartından gelmez. Yer tutucu IBAN
      // veya banka adı yazmak muhasebesel olarak tehlikelidir; kullanıcı gerçek
      // hesabı İŞBEY Banka modülünden ekler.
      bankName: '',
      accountName: '',
      accountNo: '',
      branchName: '',
      iban: '',
      currency: '₺',
      balance: 0,
      isDefault: true,
      active: true,
    };

    return {
      tenant,
      defaultWarehouse,
      defaultCashRegister,
      defaultBankAccount,
    };
  }

  /**
   * Hızlı Bilişim yetkili bilgilerinden İŞBEY Company Admin kullanıcısı türetir.
   */
  public static mapToCompanyAdmin(
    ext: ExternalCustomer,
    companyId: string,
    companyCode: string
  ): {
    user: User;
    rawUsername: string;
    token: string;
    expiresAt: string;
  } {
    const cleanUsername = ((ext.email || '').split('@')[0] || ext.contactName || ext.taxNumber)
      .toLowerCase()
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 20);

    const uniqueUsername = `${cleanUsername}_${companyCode.toLowerCase().replace('-', '')}`;
    const token = `act_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const user: User = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      username: uniqueUsername,
      fullName: ext.contactName || ext.companyName,
      email: ext.email,
      phone: ext.phone,
      role: 'COMPANY_ADMIN',
      companyId: companyId,
      allowedCompanyIds: [companyId],
      active: true,
      passwordHash: '', // Aktivasyon linki üzerinden güvenle belirlenecek
      department: 'Yönetim',
      branch: 'Merkez',
      createdAt: new Date().toISOString(),
      permissions: [
        { module: 'CARI', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true },
        { module: 'FATURA', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true, canApprove: true },
        { module: 'STOK', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true },
        { module: 'KASA', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true },
        { module: 'BANKA', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true },
        { module: 'POS', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true },
        { module: 'TEKLIF_SIPARIS', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true, canApprove: true },
        { module: 'IRSALIYE', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true, canApprove: true },
        { module: 'CEK_SENET', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true },
        { module: 'E_FATURA', canView: true, canAdd: true, canEdit: true, canDelete: false, canPrint: true, canExport: true, canApprove: true },
        { module: 'PERSONEL', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true },
        { module: 'RAPORLAR', canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true, canExport: true },
      ],
    };

    return {
      user,
      rawUsername: uniqueUsername,
      token,
      expiresAt,
    };
  }
}
