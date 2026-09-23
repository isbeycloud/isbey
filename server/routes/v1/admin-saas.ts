import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { requireAuth, requireRole } from '../../middleware/authGuards';
import { SubscriptionPlan, CreditPackage, Dealer } from '../../db/schema';

export const adminSaasRouter = Router();

adminSaasRouter.use(requireAuth);
adminSaasRouter.use(requireRole('SUPER_ADMIN', 'ADMIN', 'platform_admin'));

// GET /api/v1/admin/saas/kpis - Super Admin SaaS Analytics & KPI Metrikleri
adminSaasRouter.get('/kpis', (req: Request, res: Response) => {
  const db = storage.getState();
  const tenants = db.tenants || [];
  const subs = db.subscriptions || [];
  const payments = db.payments || [];
  const plans = db.subscriptionPlans || [];
  const dealers = db.dealers || [];
  const commissions = db.dealerCommissions || [];

  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => t.status === 'ACTIVE').length;
  const trialTenants = subs.filter(s => s.status === 'trial').length;
  const pastDueTenants = subs.filter(s => s.status === 'past_due').length;
  const suspendedTenants = tenants.filter(t => t.status === 'SUSPENDED').length;

  // MRR (Monthly Recurring Revenue) & ARR (Annual Recurring Revenue) Hesaplama
  let mrr = 0;
  subs.filter(s => s.status === 'active').forEach(s => {
    const plan = plans.find(p => p.id === s.planId || p.slug === s.planSlug);
    if (plan) {
      if (s.billingCycle === 'yearly') {
        mrr += Math.round(plan.yearlyPrice / 12);
      } else {
        mrr += plan.monthlyPrice;
      }
    }
  });

  const arr = mrr * 12;

  // Toplam Gelir ve Başarılı İşlemler
  const successfulPayments = payments.filter(p => p.status === 'successful' || p.status === 'SUCCESS');
  const totalRevenue = successfulPayments.reduce((sum, p) => sum + p.totalAmount, 0);
  const creditSalesRevenue = successfulPayments
    .filter(p => p.paymentType === 'CREDIT_PURCHASE')
    .reduce((sum, p) => sum + p.totalAmount, 0);
  const subscriptionRevenue = successfulPayments
    .filter(p => p.paymentType === 'SUBSCRIPTION' || p.paymentType === 'PLAN_UPGRADE')
    .reduce((sum, p) => sum + p.totalAmount, 0);

  // ARPU (Average Revenue Per User / Account)
  const arpu = activeTenants > 0 ? Math.round((mrr / activeTenants) * 100) / 100 : 0;

  // Churn & Dönüşüm
  const cancelledCount = subs.filter(s => s.status === 'cancelled').length;
  const churnRate = totalTenants > 0 ? Math.round(((cancelledCount / totalTenants) * 100) * 10) / 10 : 0;
  const totalPaidConversions = subs.filter(s => s.status === 'active' && s.trialStart).length;
  const trialConversionRate = trialTenants + totalPaidConversions > 0
    ? Math.round(((totalPaidConversions / (trialTenants + totalPaidConversions)) * 100) * 10) / 10
    : 0;

  // Toplam Bayi Komisyonları
  const totalCommissionsPaid = commissions
    .filter(c => c.status === 'PAID')
    .reduce((sum, c) => sum + c.commissionAmount, 0);
  const pendingCommissions = commissions
    .filter(c => c.status === 'PENDING' || c.status === 'APPROVED')
    .reduce((sum, c) => sum + c.commissionAmount, 0);

  res.json({
    success: true,
    kpis: {
      mrr,
      arr,
      arpu,
      totalRevenue,
      subscriptionRevenue,
      creditSalesRevenue,
      churnRate,
      trialConversionRate,
      totalTenants,
      activeTenants,
      trialTenants,
      pastDueTenants,
      suspendedTenants,
      totalDealers: dealers.length,
      totalCommissionsPaid,
      pendingCommissions,
    },
    recentPayments: successfulPayments.slice(0, 8),
    recentSubscriptions: subs.slice(0, 8),
  });
});

// GET /api/v1/admin/plans - Paketleri Yönet
adminSaasRouter.get('/plans', (req: Request, res: Response) => {
  const db = storage.getState();
  res.json({ success: true, plans: db.subscriptionPlans || [] });
});

// PUT /api/v1/admin/plans/:id - Paket Fiyat ve Özellik Güncelleme
adminSaasRouter.put('/plans/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, monthlyPrice, yearlyPrice, maxUsers, maxCompanies, maxInvoicesPerMonth, includedCredits, storageLimitMb, activeModules, status } = req.body;

  const updated = await storage.runTransaction(draft => {
    if (!draft.subscriptionPlans) draft.subscriptionPlans = [];
    const plan = draft.subscriptionPlans.find(p => p.id === id || p.slug === id);
    if (!plan) throw new Error('Paket bulunamadı.');

    if (name !== undefined) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (monthlyPrice !== undefined) plan.monthlyPrice = Number(monthlyPrice);
    if (yearlyPrice !== undefined) plan.yearlyPrice = Number(yearlyPrice);
    if (maxUsers !== undefined) plan.maxUsers = Number(maxUsers);
    if (maxCompanies !== undefined) plan.maxCompanies = Number(maxCompanies);
    if (maxInvoicesPerMonth !== undefined) plan.maxInvoicesPerMonth = Number(maxInvoicesPerMonth);
    if (includedCredits !== undefined) plan.includedCredits = Number(includedCredits);
    if (storageLimitMb !== undefined) plan.storageLimitMb = Number(storageLimitMb);
    if (activeModules !== undefined) plan.activeModules = activeModules;
    if (status !== undefined) plan.status = status;
    plan.updatedAt = new Date().toISOString();

    return plan;
  });

  res.json({
    success: true,
    message: `'${updated.name}' paketi başarıyla güncellendi.`,
    plan: updated,
  });
});

// GET /api/v1/admin/credits/packages - Kontör Paketlerini Listele
adminSaasRouter.get('/credits/packages', (req: Request, res: Response) => {
  const db = storage.getState();
  res.json({ success: true, packages: db.creditPackages || [] });
});

// POST /api/v1/admin/credits/packages - Yeni Kontör Paketi Ekle
adminSaasRouter.post('/credits/packages', async (req: Request, res: Response) => {
  const { name, quantity, price, vatRate = 20, isPopular } = req.body;

  if (!name || !quantity || !price) {
    return res.status(400).json({ success: false, message: 'Paket adı, kontör adedi ve fiyat zorunludur.' });
  }

  const vatAmount = Math.round((Number(price) * (Number(vatRate) / 100)) * 100) / 100;
  const totalPrice = Math.round((Number(price) + vatAmount) * 100) / 100;
  const unitPrice = Math.round((Number(price) / Number(quantity)) * 100) / 100;

  const newPackage: CreditPackage = {
    id: `cp-${Date.now()}`,
    name: name.trim(),
    quantity: Number(quantity),
    creditAmount: Number(quantity),
    price: Number(price),
    vatRate: Number(vatRate),
    totalPrice,
    unitPrice,
    isPopular: !!isPopular,
    status: 'ACTIVE',
    active: true,
    displayOrder: 99,
    createdAt: new Date().toISOString(),
  };

  await storage.runTransaction(draft => {
    if (!draft.creditPackages) draft.creditPackages = [];
    draft.creditPackages.push(newPackage);
  });

  res.status(201).json({
    success: true,
    message: 'Yeni kontör paketi oluşturuldu.',
    package: newPackage,
  });
});

// GET /api/v1/admin/dealers - Bayileri ve Komisyonları Yönet
adminSaasRouter.get('/dealers', (req: Request, res: Response) => {
  const db = storage.getState();
  res.json({
    success: true,
    dealers: db.dealers || [],
    commissions: db.dealerCommissions || [],
  });
});

// POST /api/v1/admin/dealers/:id/payout - Bayi Komisyon Ödemesini Tamamla
adminSaasRouter.post('/dealers/:id/payout', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, note } = req.body;

  const result = await storage.runTransaction(draft => {
    const dealer = (draft.dealers || []).find(d => d.id === id);
    if (!dealer) throw new Error('Bayi bulunamadı.');

    const payoutAmount = Number(amount) || dealer.balance || 0;
    if (payoutAmount <= 0 || payoutAmount > dealer.balance) {
      throw new Error('Geçersiz ödeme tutarı veya yetersiz bakiye.');
    }

    dealer.balance = Math.max(0, Math.round((dealer.balance - payoutAmount) * 100) / 100);
    dealer.updatedAt = new Date().toISOString();

    // Bu bayinin PENDING/APPROVED komisyonlarını PAID yap
    const now = new Date().toISOString();
    (draft.dealerCommissions || [])
      .filter(c => c.dealerId === dealer.id && (c.status === 'PENDING' || c.status === 'APPROVED'))
      .forEach(c => {
        c.status = 'PAID';
        c.paidAt = now;
      });

    return {
      dealer,
      payoutAmount,
    };
  });

  res.json({
    success: true,
    message: `${dealerResultName(result.dealer)} bayisine ${result.payoutAmount} TL ödeme onaylandı ve hakedişler kapatıldı.`,
    dealer: result.dealer,
  });
});

function dealerResultName(dealer: any) {
  return dealer?.name || 'Bayi';
}
