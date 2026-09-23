import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../../db/storage';
import { requireAuth } from '../../middleware/authGuards';
import { Dealer, Tenant, User } from '../../db/schema';

export const dealersRouter = Router();

dealersRouter.use(requireAuth);

// Helper: İstek sahibinin bayi ID'sini çözümler
function resolveCurrentDealerId(req: Request): string {
  const user = req.user;
  const db = storage.getState();
  // Eğer kullanıcı doğrudan bir bayiye bağlıysa veya super adminse
  if (user?.dealerId) return user.dealerId;
  const defaultDealer = (db.dealers || [])[0];
  return defaultDealer ? defaultDealer.id : 'dealer-isbey-hq';
}

// GET /api/v1/dealers/dashboard - Bayi Dashboard KPI ve Özet Verileri
dealersRouter.get('/dashboard', (req: Request, res: Response) => {
  const dealerId = resolveCurrentDealerId(req);
  const db = storage.getState();
  const dealer = (db.dealers || []).find(d => d.id === dealerId);

  if (!dealer) {
    return res.status(404).json({ success: false, message: 'Bayi hesabı bulunamadı.' });
  }

  // Bu bayiye bağlı tenant'lar
  const customers = (db.tenants || []).filter(t => (t as any).dealerId === dealer.id || (t as any).dealerId === dealer.code);
  const activeCustomers = customers.filter(c => c.status === 'ACTIVE').length;
  const trialCustomers = (db.subscriptions || []).filter(
    s => customers.some(c => c.id === s.tenantId) && s.status === 'trial'
  ).length;

  const commissions = (db.dealerCommissions || []).filter(c => c.dealerId === dealer.id);
  const totalCommissionEarned = commissions.reduce((sum, c) => sum + c.commissionAmount, 0);
  const pendingCommissions = commissions.filter(c => c.status === 'PENDING').reduce((sum, c) => sum + c.commissionAmount, 0);

  const subDealers = (db.dealers || []).filter(d => d.parentDealerId === dealer.id);

  res.json({
    success: true,
    dealer,
    metrics: {
      totalCustomers: customers.length,
      activeCustomers,
      trialCustomers,
      subDealersCount: subDealers.length,
      totalCommissionEarned,
      currentBalance: dealer.balance || 0,
      pendingCommissions,
    },
    recentCommissions: commissions.slice(0, 10),
  });
});

// GET /api/v1/dealers/customers - Bayinin Müşteri Listesi
dealersRouter.get('/customers', (req: Request, res: Response) => {
  const dealerId = resolveCurrentDealerId(req);
  const db = storage.getState();
  const customers = (db.tenants || []).filter(t => (t as any).dealerId === dealerId || (t as any).dealerId === 'dealer-isbey-hq');

  const enriched = customers.map(c => {
    const sub = (db.subscriptions || []).find(s => s.tenantId === c.id);
    const wallet = (db.creditWallets || []).find(w => w.tenantId === c.id);
    return {
      ...c,
      subscriptionStatus: sub?.status || 'active',
      planSlug: sub?.planSlug || c.plan || 'PRO',
      credits: wallet?.balance ?? c.eInvoiceCredits ?? 100,
    };
  });

  res.json({
    success: true,
    customers: enriched,
  });
});

// POST /api/v1/dealers/customers - Bayi Tarafından Yeni Müşteri & Firma Kaydı
dealersRouter.post('/customers', async (req: Request, res: Response) => {
  const dealerId = resolveCurrentDealerId(req);
  const {
    companyName,
    title,
    taxNumber,
    taxOffice,
    city,
    phone,
    adminFullName,
    adminEmail,
    adminPassword,
    planSlug = 'PRO',
    externalCustomerId,
    externalSource,
  } = req.body;

  if (!companyName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      success: false,
      message: 'Firma adı, yönetici e-posta ve şifresi zorunludur.',
    });
  }

  const db = storage.getState();
  const dealer = (db.dealers || []).find(d => d.id === dealerId);

  // Mükerrer E-posta kontrolü
  if ((db.users || []).some(u => u.email.toLowerCase() === adminEmail.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: 'Bu e-posta adresine kayıtlı bir kullanıcı zaten mevcut.',
    });
  }

  const newTenantId = `tnt-${Date.now()}`;
  const newUserId = `usr-${Date.now()}`;
  const now = new Date().toISOString();
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(adminPassword, salt);
  const companyCode = storage.generateNextCompanyCode();

  const newTenant: Tenant = {
    id: newTenantId,
    companyCode,
    name: companyName.trim(),
    title: title?.trim() || companyName.trim(),
    slug: companyName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    taxNumber: taxNumber || '1111111111',
    taxOffice: taxOffice || 'Merkez',
    city: city || 'İstanbul',
    phone: phone || '',
    email: adminEmail,
    plan: planSlug.toUpperCase() as any,
    status: 'ACTIVE',
    maxUsers: planSlug === 'STARTER' ? 2 : planSlug === 'PRO' ? 5 : 15,
    currentUsers: 1,
    maxInvoicesPerMonth: 1000,
    eInvoiceCredits: 100,
    storageLimitMb: 5120,
    storageUsedMb: 10,
    activeModules: ['CARI', 'STOK', 'FATURA', 'KASA', 'BANKA', 'EFATURA', 'EARSIV'],
    createdAt: now,
    updatedAt: now,
    dealerId: dealer?.id || dealerId,
    externalCustomerId,
    externalSource: externalSource || (dealer ? `DEALER_${dealer.code}` : undefined),
  } as any;

  const adminUser: User = {
    id: newUserId,
    tenantId: newTenantId,
    companyId: newTenantId,
    companyName: companyName.trim(),
    username: adminEmail.split('@')[0],
    fullName: adminFullName || 'Firma Yöneticisi',
    email: adminEmail,
    role: 'COMPANY_ADMIN',
    active: true,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  await storage.runTransaction(draft => {
    storage.bootstrapNewTenant(newTenant, adminUser, draft);

    // Bayi ilişkili abonelik kaydı oluştur
    if (!draft.subscriptions) draft.subscriptions = [];
    const plan = (draft.subscriptionPlans || []).find(p => p.slug === planSlug.toUpperCase()) || draft.subscriptionPlans?.[1];
    draft.subscriptions.push({
      id: `sub-${newTenantId}`,
      tenantId: newTenantId,
      planId: plan?.id || 'plan-pro',
      planSlug: plan?.slug || 'PRO',
      status: 'trial',
      billingCycle: 'monthly',
      startDate: now,
      endDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      trialStart: now,
      trialEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
      nextBillingDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      gracePeriodDays: 7,
      autoRenew: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  res.status(201).json({
    success: true,
    message: `"${companyName}" başarıyla kaydedildi ve 14 günlük deneme sürümü başlatıldı.`,
    tenant: newTenant,
    user: { id: adminUser.id, email: adminUser.email, fullName: adminUser.fullName },
  });
});

// GET /api/v1/dealers/sub-dealers - Alt Bayileri Listele
dealersRouter.get('/sub-dealers', (req: Request, res: Response) => {
  const dealerId = resolveCurrentDealerId(req);
  const db = storage.getState();
  const subDealers = (db.dealers || []).filter(d => d.parentDealerId === dealerId);

  res.json({
    success: true,
    subDealers,
  });
});

// POST /api/v1/dealers/sub-dealers - Yeni Alt Bayi Oluştur
dealersRouter.post('/sub-dealers', async (req: Request, res: Response) => {
  const parentDealerId = resolveCurrentDealerId(req);
  const { name, email, phone, contactPerson, taxNumber, taxOffice, city, commissionRate = 15 } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Bayi adı ve e-posta zorunludur.' });
  }

  const db = storage.getState();
  const parent = (db.dealers || []).find(d => d.id === parentDealerId);
  const count = (db.dealers || []).length;
  const now = new Date().toISOString();

  const newSubDealer: Dealer = {
    id: `dealer-sub-${Date.now()}`,
    parentDealerId,
    name: name.trim(),
    code: `BAYI-${String(count + 101).padStart(3, '0')}`,
    email: email.trim(),
    phone,
    contactPerson,
    taxNumber,
    taxOffice,
    city,
    commissionRate: Math.min(commissionRate, parent?.commissionRate || 25),
    balance: 0,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  await storage.runTransaction(draft => {
    if (!draft.dealers) draft.dealers = [];
    draft.dealers.push(newSubDealer);
  });

  res.status(201).json({
    success: true,
    message: `Alt bayi '${name}' başarıyla oluşturuldu (Kod: ${newSubDealer.code}).`,
    subDealer: newSubDealer,
  });
});

// GET /api/v1/dealers/commissions - Bayi Komisyon Ekstresi
dealersRouter.get('/commissions', (req: Request, res: Response) => {
  const dealerId = resolveCurrentDealerId(req);
  const db = storage.getState();
  const commissions = (db.dealerCommissions || []).filter(c => c.dealerId === dealerId);

  res.json({
    success: true,
    commissions,
  });
});
