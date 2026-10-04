import type { DatabaseState, Tenant, SubscriptionPlan } from '../db/schema';
import { menusForModules } from '../../src/data/serviceAccess';

export function selectedPlans(db: DatabaseState, ids: unknown): SubscriptionPlan[] {
  if (!Array.isArray(ids) || !ids.length || ids.length > 10 || ids.some(id => typeof id !== 'string')) {
    throw new Error('En az bir, en fazla 10 hizmet paketi seçin.');
  }
  const plans = [...new Set(ids)].map(id => db.subscriptionPlans?.find(p => p.id === id && p.status === 'ACTIVE'));
  if (plans.some(p => !p)) throw new Error('Seçilen paket satışa açık değil.');
  if (plans.some(p => !p!.activeModules?.length || !menusForModules(p!.activeModules).length)) {
    throw new Error('Seçilen paketin hizmet kapsamı tanımlanmamış.');
  }
  return plans as SubscriptionPlan[];
}

export function applyServicePlans(tenant: Tenant, plans: SubscriptionPlan[]) {
  tenant.selectedServicePlanIds = plans.map(p => p.id);
  const legacyPlan = plans.map(p => p.slug.toUpperCase()).find(slug => ['ENTERPRISE', 'PRO', 'PROFESSIONAL', 'STARTER', 'FREE'].includes(slug));
  if (legacyPlan) tenant.plan = legacyPlan as Tenant['plan'];
  tenant.activeModules = [...new Set(plans.flatMap(p => p.activeModules))] as Tenant['activeModules'];
  tenant.maxUsers = Math.max(...plans.map(p => p.maxUsers));
  tenant.maxInvoicesPerMonth = Math.max(...plans.map(p => p.maxInvoicesPerMonth));
  tenant.storageLimitMb = Math.max(...plans.map(p => p.storageLimitMb));
  tenant.updatedAt = new Date().toISOString();
}

export function serviceModules(db: DatabaseState, tenant?: Tenant): string[] | null {
  if (!tenant || tenant.selectedServicePlanIds === undefined) return null;
  return [...new Set(tenant.selectedServicePlanIds.flatMap(id =>
    db.subscriptionPlans?.find(p => p.id === id && p.status === 'ACTIVE')?.activeModules || []))];
}
export function serviceMenus(db: DatabaseState, tenant?: Tenant): string[] | null {
  const modules = serviceModules(db, tenant);
  return modules === null ? null : menusForModules(modules);
}
