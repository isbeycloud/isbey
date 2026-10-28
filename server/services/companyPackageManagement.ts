import { randomUUID } from 'node:crypto';
import type { DatabaseState, Tenant } from '../db/schema';
import { validSubscriptionDates, subscriptionState } from '../security/erpSubscription';
import { applyServicePlans, selectedPlans } from './serviceEntitlements';
import { trialActiveModules } from './trialGateService';

export class PackageManagementError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function manageCompanyPackage(db: DatabaseState, id: string, input: any,
  actor: { id: string; username: string; ipAddress: string }) {
  const tenant = db.tenants.find(t => t.id === id && !t.isArchived);
  if (!tenant) throw new PackageManagementError('Firma bulunamadı.', 404);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PackageManagementError('Paket bilgileri zorunludur.');
  if (typeof input.expectedUpdatedAt !== 'string' || input.expectedUpdatedAt !== tenant.updatedAt) {
    throw new PackageManagementError('Firma bilgileri değişmiş. Ekranı yenileyip tekrar deneyin.', 409);
  }
  if (!['FREE', 'PAID', 'TRIAL'].includes(input.billingMode)) throw new PackageManagementError('Ücretsiz, ücretli veya deneme kullanımını seçin.');
  if (!['monthly', 'yearly'].includes(input.billingCycle)) throw new PackageManagementError('Aylık veya yıllık dönem seçin.');
  if (!validSubscriptionDates(input.startDate, input.endDate)) throw new PackageManagementError('Geçerli başlangıç ve bitiş tarihleri seçin.');
  if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) throw new PackageManagementError('Değişiklik gerekçesi 10–1000 karakter olmalıdır.');
  if (typeof input.autoRenew !== 'boolean') throw new PackageManagementError('Otomatik yenileme tercihi geçersiz.');
  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 100_000_000 || Math.abs(amount * 100 - Math.round(amount * 100)) > .00001) {
    throw new PackageManagementError('Dönem bedeli en fazla iki ondalıklı, geçerli bir tutar olmalıdır.');
  }
  if (input.billingMode === 'PAID' ? amount <= 0 : amount !== 0 || input.autoRenew) throw new PackageManagementError('Ücretli kullanımda pozitif bedel girin; ücretsiz ve denemede bedel sıfır, otomatik yenileme kapalı olmalıdır.');
  const plans = selectedPlans(db, input.planIds);
  if (new Set(plans.map(p => p.currency)).size !== 1) throw new PackageManagementError('Birlikte seçilen paketlerin para birimleri aynı olmalıdır.');
  const limits = {
    maxUsers: Math.max(...plans.map(p => p.maxUsers)),
    maxInvoicesPerMonth: Math.max(...plans.map(p => p.maxInvoicesPerMonth)),
    storageLimitMb: Math.max(...plans.map(p => p.storageLimitMb)),
  };
  if (Object.values(limits).some(n => !Number.isSafeInteger(n) || n <= 0)) throw new PackageManagementError('Paket kotaları geçerli değil. Önce paket tanımını düzeltin.');
  const activeUsers = new Set((db.tenantUsers || []).filter(m => m.tenantId === id && m.status === 'active' && !m.deletedAt && db.users.some(u => u.id === m.userId && u.active)).map(m => m.userId)).size;
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date()).slice(0, 7);
  const invoices = db.invoices.filter(i => i.tenantId === id && !i.isDeleted && i.date?.startsWith(month)).length;
  if (activeUsers > limits.maxUsers || invoices > limits.maxInvoicesPerMonth || (tenant.storageUsedMb || 0) > limits.storageLimitMb) {
    throw new PackageManagementError('Mevcut kullanım seçilen paketin kotasını aşıyor. Kullanıcı, aylık belge ve depolama limitlerini kontrol edin.');
  }
  const before = { planIds: tenant.selectedServicePlanIds, plan: tenant.plan, commercial: tenant.commercialSubscription, endDate: tenant.expiresAt };
  const now = new Date().toISOString();
  const trial = input.billingMode === 'TRIAL';
  applyServicePlans(tenant, plans);
  if (trial) tenant.activeModules = trialActiveModules(tenant.activeModules);
  tenant.commercialSubscription = { billingMode: input.billingMode, billingCycle: input.billingCycle, amount,
    currency: plans[0].currency, reason: input.reason.trim(), updatedAt: now, updatedBy: actor.id };
  tenant.erpSubscription = { startDate: input.startDate, endDate: input.endDate, expiryPolicy: 'READ_ONLY', updatedAt: now };
  tenant.expiresAt = input.endDate + 'T23:59:59.999+03:00';
  const expired = Date.parse(tenant.expiresAt) < Date.now();
  if (tenant.license) Object.assign(tenant.license, { startDate: input.startDate, endDate: input.endDate, isTrial: trial,
    status: expired ? 'EXPIRED' : 'ACTIVE' });
  // Askıya alma ve pasife alma kararları paket değişikliğiyle kaldırılmaz.
  if (!['SUSPENDED', 'INACTIVE'].includes(tenant.status)) tenant.status = expired ? 'EXPIRED' : trial ? 'TRIAL' : 'ACTIVE';
  if (trial) tenant.trialStartedAt = input.startDate + 'T00:00:00+03:00';
  if (tenant.limits) Object.assign(tenant.limits, limits);
  tenant.updatedAt = now;
  db.subscriptions ||= [];
  const subscriptions = db.subscriptions.filter(s => s.tenantId === id);
  if (subscriptions.length > 1) throw new PackageManagementError('Firmada birden fazla abonelik kaydı var; paket değişikliğinden önce inceleyin.');
  const subscription = subscriptions[0] || {
    id: randomUUID(), tenantId: id, createdAt: now, gracePeriodDays: 7,
  } as typeof db.subscriptions[number];
  Object.assign(subscription, { planId: plans[0].id, planSlug: plans[0].slug, status: tenant.status === 'SUSPENDED' || tenant.status === 'INACTIVE' ? 'suspended' : expired ? 'expired' : trial ? 'trial' : 'active',
    billingCycle: input.billingCycle, startDate: input.startDate + 'T00:00:00+03:00', endDate: tenant.expiresAt,
    nextBillingDate: input.billingMode === 'PAID' ? tenant.expiresAt : undefined, autoRenew: input.autoRenew,
    trialStart: trial ? input.startDate + 'T00:00:00+03:00' : undefined, trialEnd: trial ? tenant.expiresAt : undefined,
    cancelledAt: undefined, cancelReason: undefined, cancelNote: undefined, updatedAt: now });
  if (!subscriptions.length) db.subscriptions.push(subscription);
  db.auditLogs ||= [];
  db.auditLogs.unshift({ id: randomUUID(), tenantId: id, companyId: id, companyName: tenant.name, userId: actor.id,
    username: actor.username, ipAddress: actor.ipAddress, timestamp: now, module: 'SUBSCRIPTION', action: 'PACKAGE_CHANGED',
    documentNo: tenant.companyCode || tenant.slug,
    details: JSON.stringify({ before, after: { planIds: tenant.selectedServicePlanIds, commercial: tenant.commercialSubscription, endDate: tenant.expiresAt }, reason: input.reason.trim(), paymentCollected: false }) });
  return tenant;
}

export function managedMonthlyRevenue(tenant: Tenant): number | null {
  const value = tenant.commercialSubscription;
  if (!value) return null;
  if (tenant.status !== 'ACTIVE' || subscriptionState(tenant) !== 'ACTIVE' || value.billingMode !== 'PAID' || value.currency !== 'TRY') return 0;
  return value.billingCycle === 'yearly' ? value.amount / 12 : value.amount;
}
