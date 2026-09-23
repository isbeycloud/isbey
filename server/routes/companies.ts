import { validSubscriptionDates } from '../security/erpSubscription';
import { migrateMemberships } from '../security/memberships';
import { redactSecretsDeep } from '../security/credentialMask';
import { switchCompany } from './auth';
import { isPlatformUser, membershipFor, companyIdentity } from '../security/memberships';
import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import type {
  Tenant,
  TenantPlan,
  TenantStatus,
  CompanyService,
  CompanyBranch,
  Warehouse,
  CashRegister,
  BankAccount,
} from '../db/schema';

export const companiesRouter = Router();
companiesRouter.use(requireAuth);
companiesRouter.param('id', (req, res, next, id) => {
  if (!isPlatformUser(req.user) && id !== req.tenantId && !req.path.endsWith('/switch')) return res.status(403).json({ success: false, message: 'Başka firma üzerinde işlem yapamazsınız.' });
  next();
});

companiesRouter.put('/:id/erp-subscription', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!validSubscriptionDates(startDate, endDate)) return res.status(400).json({ success: false, message: 'Geçerli başlangıç ve bitiş tarihleri zorunludur; bitiş başlangıçtan önce olamaz.' });
  try {
    const subscription = await storage.runTransaction(draft => {
      const tenant = draft.tenants.find(t => t.id === req.params.id);
      if (!tenant) throw new Error('Firma bulunamadı.');
      tenant.erpSubscription = { startDate, endDate, expiryPolicy: 'READ_ONLY', updatedAt: new Date().toISOString() };
      tenant.expiresAt = endDate + 'T23:59:59.999+03:00';
      if (tenant.license) { tenant.license.startDate = startDate; tenant.license.endDate = endDate; }
      return tenant.erpSubscription;
    });
    storage.addAuditLog({ userId: req.user.id, username: req.user.username, companyId: String(req.params.id), action: 'UPDATE', module: 'ERP_SUBSCRIPTION', details: 'ERP abonelik tarihleri güncellendi.', ipAddress: req.ip || '' });
    res.json({ success: true, subscription, message: 'ERP aboneliği kaydedildi.' });
  } catch (error) { res.status(400).json({ success: false, message: (error as Error).message }); }
});

// GET /api/admin/companies - List all companies with KPIs & filters
companiesRouter.get('/', requireAuth, (req: Request, res: Response) => {
  try {
    const { status, plan, search } = req.query;
    const db = storage.getState();
    let list = (db.tenants || []).filter(t => !t.isArchived && (isPlatformUser(req.user) || t.id === req.tenantId));

    if (status && status !== 'ALL') {
      list = list.filter(t => t.status === status);
    }

    if (plan && plan !== 'ALL') {
      list = list.filter(t => t.plan === plan);
    }

    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.title || '').toLowerCase().includes(q) ||
        (t.taxNumber || '').includes(q) ||
        (t.companyCode || '').toLowerCase().includes(q) ||
        (t.ownerName || '').toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q) ||
        (t.phone || '').includes(q)
      );
    }

    // KPI Metrics calculation
    const allTenants = (db.tenants || []).filter(t => !t.isArchived && (isPlatformUser(req.user) || t.id === req.tenantId));
    const totalCompanies = allTenants.length;
    const activeCompanies = allTenants.filter(t => t.status === 'ACTIVE').length;
    const passiveCompanies = allTenants.filter(t => t.status === 'INACTIVE' || t.status === 'SUSPENDED').length;
    const trialCompanies = allTenants.filter(t => t.status === 'TRIAL').length;

    // Check expiring / expired licenses
    const now = new Date();
    const expiringSoon = allTenants.filter(t => {
      if (!t.expiresAt) return false;
      const exp = new Date(t.expiresAt);
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= 30;
    }).length;
    const expiredCompanies = allTenants.filter(t => t.status === 'EXPIRED' || (t.expiresAt && new Date(t.expiresAt) < now)).length;

    const totalActiveUsers = (db.users || []).filter(u => u.active && (isPlatformUser(req.user) || !!membershipFor(db, u.id, req.tenantId!))).length;

    // New companies this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonth = allTenants.filter(t => t.createdAt >= startOfMonth).length;

    // Estimated MRR
    const planPrices: Record<string, number> = {
      FREE: 0,
      STARTER: 950,
      PRO: 2450,
      PROFESSIONAL: 2450,
      ENTERPRISE: 6900,
    };
    const totalMRR = allTenants.reduce((acc, t) => acc + (t.status === 'ACTIVE' ? (planPrices[t.plan] || 0) : 0), 0);

    res.json({
      success: true,
      companies: redactSecretsDeep(list),
      activeCompanyId: req.tenantId,
      kpis: {
        totalCompanies,
        activeCompanies,
        passiveCompanies,
        trialCompanies,
        expiringSoon,
        expiredCompanies,
        totalActiveUsers,
        newThisMonth,
        totalMRR,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/companies/:id - Single company with full 11-tab details
companiesRouter.get('/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const tenant = (db.tenants || []).find(t => t.id === req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Firma kaydı bulunamadı.' });
    }

    if (!isPlatformUser(req.user) && tenant.id !== req.tenantId) return res.status(403).json({ success: false, message: 'Firma erişimi reddedildi.' });
    // Associated details
    const users = (db.users || []).filter(u => { const m = membershipFor(db, u.id, tenant.id); return m && !m.deletedAt; }).map(u => ({ ...companyIdentity(db, u, tenant.id), active: u.active && membershipFor(db, u.id, tenant.id)?.status === 'active' }));
    const auditLogs = (db.auditLogs || []).filter(l => l.companyId === tenant.id || l.details?.includes(tenant.name)).slice(0, 50);
    const sessions = (db.sessions || []).filter(s => s.companyId === tenant.id).map(({ id: _sessionToken, ...s }) => s);
    const warehouses = (db.warehouses || []).filter(x => ((x as any).tenantId || (x as any).companyId) === tenant.id);
    const cashRegisters = (db.cashRegisters || []).filter(x => ((x as any).tenantId || (x as any).companyId) === tenant.id);
    const bankAccounts = (db.bankAccounts || []).filter(x => ((x as any).tenantId || (x as any).companyId) === tenant.id);

    res.json({
      success: true,
      company: redactSecretsDeep(tenant),
      details: {
        users,
        auditLogs,
        sessions,
        warehouses,
        cashRegisters,
        bankAccounts,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/companies - Atomic Transactional Company Creation
companiesRouter.post('/', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const {
      companyCode,
      name,
      title,
      taxNumber,
      taxOffice,
      identityNumber,
      mersisNo,
      email,
      phone,
      gsm,
      website,
      address,
      city,
      district,
      postalCode,
      logoUrl,
      plan = 'PRO',
      isTrial = false,
      trialDays = 14,
      startDate = new Date().toISOString().split('T')[0],
      endDate,
      maxUsers = 10,
      maxBranches = 3,
      maxWarehouses = 3,
      maxInvoicesPerMonth = 5000,
      authorizedPerson,
      createAdminUser = true,
      adminUsername,
      adminPassword = '123',
    } = req.body;

    if (!name?.trim() || !taxNumber?.trim()) {
      return res.status(400).json({ success: false, message: 'Firma adı ve Vergi Numarası zorunludur.' });
    }

    const result = await storage.runTransaction(async draft => {
      // 1. Check uniqueness of code and tax number
      const existingCode = companyCode?.trim();
      if (existingCode && draft.tenants.some(t => t.companyCode?.toLowerCase() === existingCode.toLowerCase())) {
        throw new Error(`"${existingCode}" firma kodu zaten başka bir firmada kullanılmaktadır.`);
      }

      const generatedCode = existingCode || storage.generateNextCompanyCode(draft);

      const finalSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);
      const companyId = `tnt-${Date.now()}`;

      // Calculate expiration
      const calculatedEnd = endDate || (isTrial
        ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      // 2. Resolve initial services based on Plan
      const selectedPlan = draft.plans?.find(p => p.code === plan) || draft.plans?.[1];
      const includedCodes = selectedPlan?.includedServices || ['PRE_ACCOUNTING', 'CARI', 'STOK', 'FATURA', 'KASA', 'BANKA', 'RAPOR'];

      const initialServices: CompanyService[] = includedCodes.map(code => {
        const srvMeta = draft.services?.find(s => s.code === code);
        return {
          serviceCode: code,
          serviceName: srvMeta?.name || code,
          startDate,
          endDate: calculatedEnd,
          status: 'ACTIVE',
        };
      });

      // 3. Create Company / Tenant Object
      const newTenant: Tenant = {
        id: companyId,
        companyCode: generatedCode,
        name: name.trim(),
        slug: `${finalSlug}-${Date.now().toString().slice(-4)}`,
        title: title?.trim() || name.trim(),
        taxNumber: taxNumber.trim(),
        taxOffice: taxOffice?.trim() || 'Merkez',
        identityNumber: identityNumber?.trim(),
        mersisNo: mersisNo?.trim(),
        email: email?.trim() || `${generatedCode.toLowerCase()}@isbey.com.tr`,
        phone: phone?.trim() || '',
        gsm: gsm?.trim(),
        website: website?.trim(),
        address: address?.trim() || '',
        city: city?.trim() || 'İstanbul',
        district: district?.trim() || '',
        postalCode: postalCode?.trim(),
        logoUrl: logoUrl || undefined,
        plan: plan as TenantPlan,
        status: (isTrial ? 'TRIAL' : 'ACTIVE') as TenantStatus,
        maxUsers: Number(maxUsers) || 10,
        currentUsers: createAdminUser ? 1 : 0,
        maxInvoicesPerMonth: Number(maxInvoicesPerMonth) || 5000,
        eInvoiceCredits: 250,
        storageLimitMb: 5120,
        storageUsedMb: 5,
        activeModules: ['POS', 'STOK', 'CARI', 'FATURA', 'KASA', 'BANKA', 'RAPORLAR'] as any,
        activeServices: initialServices,
        license: {
          startDate,
          endDate: calculatedEnd,
          isTrial: Boolean(isTrial),
          trialDays: isTrial ? Number(trialDays) : 0,
          status: 'ACTIVE',
        },
        limits: {
          maxUsers: Number(maxUsers) || 10,
          maxBranches: Number(maxBranches) || 3,
          maxWarehouses: Number(maxWarehouses) || 3,
          maxInvoicesPerMonth: Number(maxInvoicesPerMonth) || 5000,
          storageLimitMb: 5120,
          storageUsedMb: 5,
        },
        branches: [
          {
            id: `br-${Date.now()}-1`,
            name: `${name.trim()} Merkez Şube`,
            code: 'SB-01',
            isDefault: true,
            phone: phone || '',
            city: city || 'İstanbul',
            managerName: authorizedPerson ? `${authorizedPerson.firstName} ${authorizedPerson.lastName}` : 'Şube Müdürü',
          },
        ],
        authorizedPerson: authorizedPerson ? {
          firstName: authorizedPerson.firstName?.trim() || '',
          lastName: authorizedPerson.lastName?.trim() || '',
          phone: authorizedPerson.phone?.trim(),
          email: authorizedPerson.email?.trim(),
        } : undefined,
        ownerName: authorizedPerson ? `${authorizedPerson.firstName} ${authorizedPerson.lastName}` : name.trim(),
        ownerEmail: authorizedPerson?.email || email || 'admin@firma.com',
        ownerPhone: authorizedPerson?.phone || phone || '',
        expiresAt: `${calculatedEnd}T23:59:59Z`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          totalCustomers: 0,
          totalProducts: 0,
          totalInvoices: 0,
          totalRevenue: 0,
          monthlyInvoiceCount: 0,
          userCount: createAdminUser ? 1 : 0,
          activeServicesCount: initialServices.length,
          warehouseCount: 1,
          branchCount: 1,
          lastLoginAt: undefined,
        },
      };

      draft.tenants.push(newTenant);

      // 4. Default Warehouse
      const newWh: Warehouse = {
        id: `wh-${Date.now()}`,
        name: `${name.trim()} Ana Depo`,
        code: 'DEP-01',
        isDefault: true,
        address: address || 'Merkez Depo Alanı',
      };
      draft.warehouses.push(newWh);

      // 5. Default Cash Register
      const newCash: CashRegister = {
        id: `cash-${Date.now()}`,
        name: 'Merkez TL Kasası',
        code: 'KAS-01',
        isDefault: true,
        balance: 0,
        currency: '₺',
        active: true,
        description: 'Varsayılan Şirket Nakit Kasası',
      };
      draft.cashRegisters.push(newCash);

      // 6. Default Bank Account
      const newBank: BankAccount = {
        id: `bnk-${Date.now()}`,
        bankName: 'T.C. Ziraat Bankası',
        accountName: `${name.trim()} Ticari TL`,
        accountNo: '12345678-5001',
        branchName: `${city || 'Merkez'} Şubesi`,
        iban: 'TR12 0001 0000 0000 0000 0000 01',
        currency: '₺',
        balance: 0,
        isDefault: true,
        active: true,
      };
      draft.bankAccounts.push(newBank);

      // 7. Optional Admin User Creation
      if (createAdminUser) {
        const uName = adminUsername?.trim() || `${generatedCode.toLowerCase()}_admin`;
        const newUser = {
          id: `usr-${Date.now()}`,
          username: uName,
          fullName: authorizedPerson ? `${authorizedPerson.firstName} ${authorizedPerson.lastName}` : `${name.trim()} Yöneticisi`,
          email: authorizedPerson?.email || email || `${uName}@isbey.com.tr`,
          phone: authorizedPerson?.phone || phone || '',
          role: 'COMPANY_ADMIN' as any,
          passwordHash: adminPassword || '123',
          active: true,
          companyId: companyId,
          allowedCompanyIds: [companyId],
          createdAt: new Date().toISOString(),
        };
        draft.users.push(newUser);
        migrateMemberships(draft);
      }

      // 8. Audit Log
      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: companyId,
        companyName: newTenant.name,
        action: 'COMPANY_CREATED',
        module: 'FİRMALAR',
        ipAddress: req.ip || '127.0.0.1',
        details: `Yeni firma oluşturuldu: ${newTenant.companyCode} - ${newTenant.name} (${newTenant.plan})`,
      });

      return newTenant;
    });

    res.json({
      success: true,
      message: `"${result.name}" firması başarıyla ve tüm varsayılan bileşenleriyle oluşturuldu.`,
      company: result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/companies/:id - Update Company Details
companiesRouter.put('/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const result = await storage.runTransaction(async draft => {
      const tenant = draft.tenants.find(t => t.id === id);
      if (!tenant) throw new Error('Firma bulunamadı.');

      // Prevent non-superadmin from changing companyCode
      if (body.companyCode && body.companyCode !== tenant.companyCode && req.user?.role === 'SUPER_ADMIN') {
        const dup = draft.tenants.some(t => t.id !== id && t.companyCode?.toLowerCase() === body.companyCode.toLowerCase());
        if (dup) throw new Error(`"${body.companyCode}" kodu başka bir firma tarafından kullanılıyor.`);
        tenant.companyCode = body.companyCode.trim();
      }

      if (body.name) tenant.name = body.name.trim();
      if (body.title) tenant.title = body.title.trim();
      if (body.taxNumber && tenant.externalCustomerId && body.taxNumber.trim() !== tenant.taxNumber.trim()) throw new Error('Sağlayıcıya bağlı firmanın VKN/TCKN değeri değiştirilemez.');
      if (body.taxNumber) tenant.taxNumber = body.taxNumber.trim();
      if (body.taxOffice) tenant.taxOffice = body.taxOffice.trim();
      if (body.identityNumber !== undefined) tenant.identityNumber = body.identityNumber?.trim();
      if (body.mersisNo !== undefined) tenant.mersisNo = body.mersisNo?.trim();
      if (body.email) tenant.email = body.email.trim();
      if (body.phone) tenant.phone = body.phone.trim();
      if (body.gsm !== undefined) tenant.gsm = body.gsm?.trim();
      if (body.website !== undefined) tenant.website = body.website?.trim();
      if (body.address) tenant.address = body.address.trim();
      if (body.city) tenant.city = body.city.trim();
      if (body.district) tenant.district = body.district.trim();
      if (body.postalCode !== undefined) tenant.postalCode = body.postalCode?.trim();
      if (body.logoUrl !== undefined) tenant.logoUrl = body.logoUrl;
      if (body.authorizedPerson) tenant.authorizedPerson = body.authorizedPerson;

      tenant.updatedAt = new Date().toISOString();

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: tenant.id,
        companyName: tenant.name,
        action: 'COMPANY_UPDATED',
        module: 'FİRMALAR',
        ipAddress: req.ip || '127.0.0.1',
        details: `Firma bilgileri güncellendi: ${tenant.companyCode} - ${tenant.name}`,
      });

      return tenant;
    });

    res.json({
      success: true,
      message: 'Firma bilgileri başarıyla güncellendi.',
      company: result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/companies/:id/status - Change status (ACTIVE, INACTIVE, SUSPENDED, TRIAL, EXPIRED)
companiesRouter.post('/:id/status', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRIAL', 'EXPIRED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Geçersiz firma durumu.' });
    }

    const result = await storage.runTransaction(async draft => {
      const tenant = draft.tenants.find(t => t.id === id);
      if (!tenant) throw new Error('Firma bulunamadı.');

      const oldStatus = tenant.status;
      tenant.status = status as TenantStatus;
      tenant.updatedAt = new Date().toISOString();

      // If suspended or inactive, revoke all active sessions for this company
      if (status === 'SUSPENDED' || status === 'INACTIVE' || status === 'EXPIRED') {
        if (draft.sessions) {
          draft.sessions.forEach(s => {
            if (s.companyId === tenant.id) s.isRevoked = true;
          });
        }
      }

      const action = (status === 'ACTIVE' || status === 'TRIAL') ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED';
      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: tenant.id,
        companyName: tenant.name,
        action,
        module: 'FİRMALAR',
        ipAddress: req.ip || '127.0.0.1',
        details: `Firma durumu değiştirildi: ${tenant.name} (${oldStatus} -> ${status})`,
      });

      return tenant;
    });

    res.json({
      success: true,
      message: `Firma durumu "${status}" olarak güncellendi.`,
      company: result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/companies/:id/services - Add/Toggle/Remove Company Services
companiesRouter.post('/:id/services', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, serviceCode, startDate, endDate, limit, notes } = req.body;

    const result = await storage.runTransaction(async draft => {
      const tenant = draft.tenants.find(t => t.id === id);
      if (!tenant) throw new Error('Firma bulunamadı.');

      if (!tenant.activeServices) tenant.activeServices = [];

      const existingIndex = tenant.activeServices.findIndex(s => s.serviceCode === serviceCode);
      const srvMeta = draft.services?.find(s => s.code === serviceCode);

      if (action === 'TOGGLE') {
        if (existingIndex >= 0) {
          const current = tenant.activeServices[existingIndex];
          current.status = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        } else {
          tenant.activeServices.push({
            serviceCode,
            serviceName: srvMeta?.name || serviceCode,
            startDate: new Date().toISOString().split('T')[0],
            endDate: tenant.expiresAt ? tenant.expiresAt.split('T')[0] : '2027-12-31',
            status: 'ACTIVE',
            limit,
            notes,
          });
        }
      } else if (action === 'ADD' || action === 'UPDATE') {
        if (existingIndex >= 0) {
          tenant.activeServices[existingIndex] = {
            ...tenant.activeServices[existingIndex],
            startDate: startDate || tenant.activeServices[existingIndex].startDate,
            endDate: endDate || tenant.activeServices[existingIndex].endDate,
            limit: limit !== undefined ? limit : tenant.activeServices[existingIndex].limit,
            status: 'ACTIVE',
            notes,
          };
        } else {
          tenant.activeServices.push({
            serviceCode,
            serviceName: srvMeta?.name || serviceCode,
            startDate: startDate || new Date().toISOString().split('T')[0],
            endDate: endDate || (tenant.expiresAt ? tenant.expiresAt.split('T')[0] : '2027-12-31'),
            limit,
            status: 'ACTIVE',
            notes,
          });
        }
      } else if (action === 'REMOVE') {
        if (existingIndex >= 0) {
          tenant.activeServices.splice(existingIndex, 1);
        }
      }

      tenant.updatedAt = new Date().toISOString();
      if (tenant.stats) {
        tenant.stats.activeServicesCount = tenant.activeServices.filter(s => s.status === 'ACTIVE').length;
      }

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: tenant.id,
        companyName: tenant.name,
        action: action === 'REMOVE' ? 'SERVICE_REMOVED' : 'SERVICE_ADDED',
        module: 'HİZMETLER',
        ipAddress: req.ip || '127.0.0.1',
        details: `Firma hizmeti güncellendi (${serviceCode} - ${action}): ${tenant.name}`,
      });

      return tenant;
    });

    res.json({
      success: true,
      message: 'Firma hizmetleri güncellendi.',
      company: result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/companies/:id/license - Update Package & License limits
companiesRouter.post('/:id/license', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { plan, startDate, endDate, maxUsers, maxBranches, maxWarehouses, maxInvoicesPerMonth, eInvoiceCredits } = req.body;

    const result = await storage.runTransaction(async draft => {
      const tenant = draft.tenants.find(t => t.id === id);
      if (!tenant) throw new Error('Firma bulunamadı.');

      if (startDate || endDate) {
        const start = startDate || tenant.erpSubscription?.startDate || tenant.license?.startDate || tenant.createdAt.slice(0, 10);
        const end = endDate || tenant.erpSubscription?.endDate || tenant.license?.endDate || tenant.expiresAt.slice(0, 10);
        if (!validSubscriptionDates(start, end)) throw new Error('Geçersiz ERP abonelik tarihleri.');
        tenant.erpSubscription = { startDate: start, endDate: end, expiryPolicy: 'READ_ONLY', updatedAt: new Date().toISOString() };
      }
      if (plan) tenant.plan = plan;
      if (maxUsers !== undefined) tenant.maxUsers = Number(maxUsers);
      if (maxInvoicesPerMonth !== undefined) tenant.maxInvoicesPerMonth = Number(maxInvoicesPerMonth);
      if (eInvoiceCredits !== undefined) tenant.eInvoiceCredits = Number(eInvoiceCredits);

      if (!tenant.license) {
        tenant.license = {
          startDate: startDate || new Date().toISOString().split('T')[0],
          endDate: endDate || '2027-12-31',
          isTrial: tenant.status === 'TRIAL',
          trialDays: 0,
          status: 'ACTIVE',
        };
      } else {
        if (startDate) tenant.license.startDate = startDate;
        if (endDate) {
          tenant.license.endDate = endDate;
          tenant.expiresAt = `${endDate}T23:59:59Z`;
        }
      }

      if (!tenant.limits) {
        tenant.limits = {
          maxUsers: tenant.maxUsers,
          maxBranches: Number(maxBranches) || 3,
          maxWarehouses: Number(maxWarehouses) || 3,
          maxInvoicesPerMonth: tenant.maxInvoicesPerMonth,
          storageLimitMb: 5120,
          storageUsedMb: 5,
        };
      } else {
        if (maxUsers !== undefined) tenant.limits.maxUsers = Number(maxUsers);
        if (maxBranches !== undefined) tenant.limits.maxBranches = Number(maxBranches);
        if (maxWarehouses !== undefined) tenant.limits.maxWarehouses = Number(maxWarehouses);
        if (maxInvoicesPerMonth !== undefined) tenant.limits.maxInvoicesPerMonth = Number(maxInvoicesPerMonth);
      }

      tenant.updatedAt = new Date().toISOString();

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: tenant.id,
        companyName: tenant.name,
        action: 'LICENSE_CHANGED',
        module: 'LİSANS',
        ipAddress: req.ip || '127.0.0.1',
        details: `Firma paketi ve lisansı güncellendi: ${tenant.name} (${tenant.plan}, Bitiş: ${endDate || tenant.license.endDate})`,
      });

      return tenant;
    });

    res.json({
      success: true,
      message: 'Lisans ve limit bilgileri başarıyla güncellendi.',
      company: result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/companies/:id/switch - Switch Active Workspace
companiesRouter.post('/:id/switch', requireAuth, switchCompany);

// POST /api/admin/companies/:id/delete - Safe Soft-Delete / Archive or Hard Delete (SuperAdmin + Double Confirm)
companiesRouter.post('/:id/delete', requireAuth, requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { confirmCode, hardDelete = false } = req.body;

    if (id === 'tnt-isbey') {
      return res.status(400).json({ success: false, message: 'Ana merkez firma (İŞBEY Merkez) silinemez!' });
    }

    const result = await storage.runTransaction(async draft => {
      const index = draft.tenants.findIndex(t => t.id === id);
      if (index === -1) throw new Error('Firma bulunamadı.');

      const tenant = draft.tenants[index];

      // Double confirmation verification: Must type companyCode or name
      if (confirmCode !== tenant.companyCode && confirmCode !== tenant.name) {
        throw new Error(`Güvenlik doğrulaması başarısız. Lütfen firma kodunu (${tenant.companyCode}) tam olarak giriniz.`);
      }

      if (hardDelete) {
        draft.tenants.splice(index, 1);
      } else {
        // Soft delete / Archive
        tenant.isArchived = true;
        tenant.status = 'INACTIVE';
        tenant.deletedAt = new Date().toISOString();
      }

      // If active tenant was this, fallback to master
      if (draft.activeTenantId === id) {
        draft.activeTenantId = 'tnt-isbey';
      }

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: String(id),
        companyName: tenant.name,
        action: 'COMPANY_DELETED',
        module: 'FİRMALAR',
        ipAddress: req.ip || '127.0.0.1',
        details: `Firma ${hardDelete ? 'kalıcı olarak silindi' : 'arşivlendi/pasife alındı'}: ${tenant.companyCode} - ${tenant.name}`,
      });

      return tenant;
    });

    res.json({
      success: true,
      message: `"${result.name}" firması başarıyla ${hardDelete ? 'kalıcı olarak silindi' : 'arşivlendi/pasife alındı'}.`,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/companies/bulk-action - Bulk activate / inactivate / add service
companiesRouter.post('/bulk-action', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { companyIds, action, serviceCode } = req.body;
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      return res.status(400).json({ success: false, message: 'En az bir firma seçilmelidir.' });
    }

    await storage.runTransaction(async draft => {
      draft.tenants.forEach(t => {
        if (companyIds.includes(t.id)) {
          if (action === 'ACTIVATE') {
            t.status = 'ACTIVE';
          } else if (action === 'DEACTIVATE') {
            t.status = 'INACTIVE';
          } else if (action === 'ADD_SERVICE' && serviceCode) {
            if (!t.activeServices) t.activeServices = [];
            if (!t.activeServices.some(s => s.serviceCode === serviceCode)) {
              const srv = draft.services?.find(s => s.code === serviceCode);
              t.activeServices.push({
                serviceCode,
                serviceName: srv?.name || serviceCode,
                startDate: new Date().toISOString().split('T')[0],
                endDate: t.expiresAt ? t.expiresAt.split('T')[0] : '2027-12-31',
                status: 'ACTIVE',
              });
            }
          }
          t.updatedAt = new Date().toISOString();
        }
      });

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        action: 'COMPANY_UPDATED',
        module: 'FİRMALAR',
        ipAddress: req.ip || '127.0.0.1',
        details: `Toplu firma işlemi gerçekleştirildi (${action}): ${companyIds.length} firma`,
      });
    });

    res.json({
      success: true,
      message: `${companyIds.length} firma üzerinde toplu işlem başarıyla uygulandı.`,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
