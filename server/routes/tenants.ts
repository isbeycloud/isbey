import { switchCompany } from './auth';
import { Router } from 'express';
import { storage } from '../db/storage';
import type { Tenant, TenantPlan, TenantStatus } from '../db/schema';
// FAZ 25.1: tenants router INTERNAL — yalnızca platform yöneticisi (SUPER_ADMIN/ADMIN)
import { requireRole } from '../middleware/authGuards';

export const tenantsRouter = Router();

// FAZ 25.1: Tüm tenant yönetim uçları platform-yönetici yetkisi ister.
// (Global defaultDeny katmanı AUTH'u zaten zorunlu kılar; bu katman RBAC ekler.)
tenantsRouter.use(requireRole('SUPER_ADMIN', 'ADMIN'));

// GET /api/tenants - List all tenants with summary statistics
tenantsRouter.get('/', (req, res) => {
  try {
    const { status, plan, search } = req.query;
    const db = storage.getState();
    let list = db.tenants || [];

    if (status && status !== 'ALL') {
      list = list.filter(t => t.status === status);
    }

    if (plan && plan !== 'ALL') {
      list = list.filter(t => t.plan === plan);
    }

    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.taxNumber.includes(q) ||
        t.ownerName.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q)
      );
    }

    // Calculate aggregated metrics
    const totalTenants = (db.tenants || []).length;
    const activeTenants = (db.tenants || []).filter(t => t.status === 'ACTIVE').length;
    const trialTenants = (db.tenants || []).filter(t => t.status === 'TRIAL').length;
    const totalCredits = (db.tenants || []).reduce((acc, t) => acc + (t.eInvoiceCredits || 0), 0);
    const totalUsers = (db.tenants || []).reduce((acc, t) => acc + (t.currentUsers || 1), 0);

    // Approximate Monthly Recurring Revenue (MRR)
    const planPrices: Record<TenantPlan, number> = {
      FREE: 0,
      STARTER: 950,
      PRO: 2450,
      PROFESSIONAL: 2450,
      ENTERPRISE: 6900,
    };
    const totalMRR = (db.tenants || []).reduce((acc, t) => acc + (t.status === 'ACTIVE' ? (planPrices[t.plan] || 0) : 0), 0);

    res.json({
      success: true,
      tenants: list,
      activeTenantId: req.tenantId,
      summary: {
        totalTenants,
        activeTenants,
        trialTenants,
        totalCredits,
        totalUsers,
        totalMRR,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tenants/:id - Get single tenant
tenantsRouter.get('/:id', (req, res) => {
  const db = storage.getState();
  const tenant = (db.tenants || []).find(t => t.id === req.params.id);
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Kiracı / Şirket kaydı bulunamadı.' });
  }
  res.json({ success: true, tenant });
});

// POST /api/tenants - Create new tenant
tenantsRouter.post('/', async (req, res) => {
  const {
    name,
    title,
    taxNumber,
    taxOffice,
    email,
    phone,
    address,
    city,
    district,
    plan = 'PRO',
    ownerName,
    ownerEmail,
    ownerPhone,
    initialCredits = 500,
    activeModules,
  } = req.body;

  if (!name || !title || !taxNumber) {
    return res.status(400).json({ success: false, message: 'Firma adı, unvanı ve vergi numarası zorunludur.' });
  }

  try {
    const newTenant = await storage.runTransaction(draft => {
      if (!draft.tenants) draft.tenants = [];

      const slug = name
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const defaultModules = activeModules || [
        'POS',
        'STOK',
        'CARI',
        'FATURA',
        'TEKLIF_SIPARIS',
        'IRSALIYE',
        'BANKA',
        'KASA',
        'E_FATURA',
        'RAPORLAR',
      ];

      const userLimits: Record<TenantPlan, number> = {
        FREE: 2,
        STARTER: 5,
        PRO: 10,
        PROFESSIONAL: 10,
        ENTERPRISE: 30,
      };

      const invoiceLimits: Record<TenantPlan, number> = {
        FREE: 100,
        STARTER: 1000,
        PRO: 5000,
        PROFESSIONAL: 5000,
        ENTERPRISE: 50000,
      };

      const tenant: Tenant = {
        id: `tnt-${Date.now()}`,
        name,
        slug: slug || `tnt-${Date.now().toString().slice(-4)}`,
        title,
        taxNumber,
        taxOffice: taxOffice || 'Merkez',
        email: email || `${slug}@isbey.com.tr`,
        phone: phone || '',
        address: address || '',
        city: city || 'İstanbul',
        district: district || '',
        plan: plan as TenantPlan,
        status: 'ACTIVE',
        maxUsers: userLimits[plan as TenantPlan] || 10,
        currentUsers: 1,
        maxInvoicesPerMonth: invoiceLimits[plan as TenantPlan] || 5000,
        eInvoiceCredits: Number(initialCredits) || 500,
        storageLimitMb: plan === 'ENTERPRISE' ? 10240 : 2048,
        storageUsedMb: 12,
        activeModules: defaultModules,
        ownerName: ownerName || 'Firma Yetkilisi',
        ownerEmail: ownerEmail || email || 'yetkili@firma.com',
        ownerPhone: ownerPhone || phone || '',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          totalCustomers: 0,
          totalProducts: 0,
          totalInvoices: 0,
          totalRevenue: 0,
          monthlyInvoiceCount: 0,
        },
      };

      draft.tenants.push(tenant);
      return tenant;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'SYSTEM',
      documentNo: newTenant.slug,
      ipAddress: req.ip || '127.0.0.1',
      details: `Yeni kiracı / şirket oluşturuldu: ${newTenant.name} (${newTenant.plan})`,
    });

    res.json({ success: true, tenant: newTenant, message: 'Yeni kiracı şirket başarıyla oluşturuldu.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/tenants/:id - Update tenant
tenantsRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const protectedFields = ['id', 'externalProvider', 'externalCustomerId', 'erpSubscription', 'license', 'expiresAt'];
  if (protectedFields.some(field => field in req.body)) return res.status(400).json({ success: false, message: 'Kimlik, sağlayıcı ve ERP aboneliğini ilgili yönetim ekranından düzenleyin.' });
  const updateData = req.body;

  try {
    const updated = await storage.runTransaction(draft => {
      if (!draft.tenants) draft.tenants = [];
      const tIndex = draft.tenants.findIndex(t => t.id === id);
      if (tIndex === -1) throw new Error('Kiracı bulunamadı.');

      const current = draft.tenants[tIndex];
      if (current.externalCustomerId && updateData.taxNumber !== undefined && String(updateData.taxNumber).trim() !== current.taxNumber.trim()) throw new Error('Sağlayıcıya bağlı firmanın VKN/TCKN değeri değiştirilemez.');
      const updatedTenant: Tenant = {
        ...current,
        ...updateData,
        updatedAt: new Date().toISOString(),
      };

      draft.tenants[tIndex] = updatedTenant;
      return updatedTenant;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'UPDATE',
      module: 'SYSTEM',
      documentNo: updated.slug,
      ipAddress: req.ip || '127.0.0.1',
      details: `Kiracı bilgileri güncellendi: ${updated.name}`,
    });

    res.json({ success: true, tenant: updated, message: 'Kiracı bilgileri güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/tenants/:id/credits - Add e-Invoice credits
tenantsRouter.post('/:id/credits', async (req, res) => {
  const { id } = req.params;
  const { amount, notes } = req.body;

  const creditAmount = Number(amount);
  if (!creditAmount || creditAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Geçerli bir kontör miktarı girin.' });
  }

  try {
    const updated = await storage.runTransaction(draft => {
      if (!draft.tenants) draft.tenants = [];
      const tenant = draft.tenants.find(t => t.id === id);
      if (!tenant) throw new Error('Kiracı bulunamadı.');

      tenant.eInvoiceCredits = (tenant.eInvoiceCredits || 0) + creditAmount;
      tenant.updatedAt = new Date().toISOString();
      return tenant;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'UPDATE',
      module: 'FINANCE',
      documentNo: updated.slug,
      ipAddress: req.ip || '127.0.0.1',
      details: `${updated.name} şirketine +${creditAmount} e-Fatura kontörü yüklendi. ${notes ? `(${notes})` : ''}`,
    });

    res.json({
      success: true,
      tenant: updated,
      newCredits: updated.eInvoiceCredits,
      message: `+${creditAmount} kontör başarıyla yüklendi. Güncel bakiye: ${updated.eInvoiceCredits}`,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/tenants/:id/switch - Switch active tenant session
tenantsRouter.post('/:id/switch', switchCompany);

// DELETE /api/tenants/:id - Delete / Archive tenant
tenantsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (id === 'tnt-isbey') {
    return res.status(400).json({ success: false, message: 'Ana merkez kiracı şirketi silinemez!' });
  }

  try {
    const deletedName = await storage.runTransaction(draft => {
      if (!draft.tenants) draft.tenants = [];
      const tIndex = draft.tenants.findIndex(t => t.id === id);
      if (tIndex === -1) throw new Error('Kiracı bulunamadı.');

      const name = draft.tenants[tIndex].name;
      draft.tenants.splice(tIndex, 1);

      if (draft.activeTenantId === id) {
        draft.activeTenantId = draft.tenants[0]?.id || 'tnt-isbey';
      }

      return name;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'DELETE',
      module: 'SYSTEM',
      documentNo: id,
      ipAddress: req.ip || '127.0.0.1',
      details: `Kiracı şirket silindi: ${deletedName}`,
    });

    res.json({ success: true, message: `"${deletedName}" kiracı kaydı silindi.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
