import { randomUUID } from 'node:crypto';
import { storage } from '../db/storage';

export const E_SERVICES = ['EFATURA', 'EARSIV', 'EIRSALIYE', 'ESMM', 'EDEFTER'] as const;
export interface EServiceApplication {
  id: string;
  tenantId: string;
  createdBy: string;
  companyName: string;
  taxNumber: string;
  contactName: string;
  email: string;
  phone: string;
  services: string[];
  status: 'SUBMITTED' | 'QUOTED' | 'PAID';
  consentAt: string;
  createdAt: string;
  amountMinor?: number;
  currency: 'TRY';
  orderId?: string;
  quotedBy?: string;
  quotedAt?: string;
  paidAt?: string;
  providerReference?: string;
}

// Provider adapters must use orderId as their idempotency key. Never collect card data here.
export interface EServicePaymentProvider {
  createCheckout(order: { orderId: string; amountMinor: number; currency: 'TRY'; email: string }): Promise<{ url: string }>;
}

export async function submitApplication(tenantId: string, userId: string, input: Record<string, unknown>) {
  const text = (key: string, max: number) => typeof input[key] === 'string' ? String(input[key]).trim().slice(0, max) : '';
  const contactName = text('contactName', 120), email = text('email', 254), phone = text('phone', 30);
  const services = input.services;
  if (!contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+\d\s()-]{10,30}$/.test(phone) || input.consent !== true ||
      !Array.isArray(services) || !services.length || services.some(s => !E_SERVICES.includes(s as typeof E_SERVICES[number]))) {
    throw new Error('Yetkili adı, geçerli e-posta/telefon, hizmet seçimi ve başvuru onayı gereklidir.');
  }
  return storage.runTransaction(db => {
    const tenant = db.tenants.find(t => t.id === tenantId && !t.isArchived);
    if (!tenant || !/^\d{10,11}$/.test(tenant.taxNumber)) throw new Error('Firma bilgilerinde geçerli VKN/TCKN tanımlayın.');
    db.eServiceApplications ||= [];
    if (db.eServiceApplications.some(a => a.tenantId === tenantId && a.status !== 'PAID' && a.services.some(s => services.includes(s)))) throw new Error('Bu hizmet için açık başvurunuz bulunuyor.');
    const now = new Date().toISOString();
    const application: EServiceApplication = { id: randomUUID(), tenantId, createdBy: userId,
      companyName: tenant.name, taxNumber: tenant.taxNumber, contactName, email, phone,
      services: [...new Set(services as string[])], status: 'SUBMITTED', consentAt: now, createdAt: now, currency: 'TRY' };
    db.eServiceApplications.push(application);
    return application;
  });
}

export async function quoteApplication(id: string, amountMinor: unknown, userId: string) {
  if (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) throw new Error('Teklif tutarı geçersiz.');
  return storage.runTransaction(db => {
    const application = db.eServiceApplications?.find(a => a.id === id);
    if (!application || application.status !== 'SUBMITTED') throw new Error('Yalnızca yeni başvuruya teklif verilebilir.');
    Object.assign(application, { amountMinor, status: 'QUOTED', orderId: randomUUID(), quotedBy: userId, quotedAt: new Date().toISOString() });
    return application;
  });
}

export async function completeServicePayment(input: { orderId: string; amountMinor: number; currency: string; reference: string }) {
  if (!input.reference || input.reference.length > 200) throw new Error('Ödeme referansı geçersiz.');
  return storage.runTransaction(db => {
    const application = db.eServiceApplications?.find(a => a.orderId === input.orderId);
    if (!application || application.amountMinor !== input.amountMinor || input.currency !== 'TRY') throw new Error('Ödeme sipariş veya tutar eşleşmesi başarısız.');
    if (application.status === 'PAID') {
      if (application.providerReference !== input.reference) throw new Error('Sipariş farklı bir ödeme ile kapatılmış.');
      return application;
    }
    if (application.status !== 'QUOTED' || db.eServiceApplications?.some(a => a.providerReference === input.reference)) throw new Error('Ödeme referansı veya sipariş durumu geçersiz.');
    Object.assign(application, { status: 'PAID', paidAt: new Date().toISOString(), providerReference: input.reference });
    // Payment does not activate the integrator service; provisioning requires a separate provider approval.
    return application;
  });
}
