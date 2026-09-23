import type { Tenant } from '../db/schema';

export function subscriptionState(tenant: Tenant, now = Date.now()) {
  const start = tenant.erpSubscription?.startDate || tenant.license?.startDate || tenant.createdAt?.slice(0, 10);
  const end = tenant.erpSubscription?.endDate || tenant.license?.endDate || tenant.expiresAt?.slice(0, 10);
  const startsAt = Date.parse(`${start}T00:00:00+03:00`);
  const endsAt = Date.parse(`${end}T23:59:59.999+03:00`);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt > endsAt) return 'UNCONFIGURED';
  if (now < startsAt) return 'NOT_STARTED';
  if (now > endsAt || (!tenant.erpSubscription && tenant.status === 'EXPIRED')) return 'EXPIRED';
  return 'ACTIVE';
}

export function validSubscriptionDates(startDate: unknown, endDate: unknown) {
  const valid = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  return valid(startDate) && valid(endDate) && startDate <= endDate;
}
