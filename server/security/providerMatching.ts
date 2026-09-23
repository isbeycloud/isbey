import type { DatabaseState } from '../db/schema';

export function validateProviderMatch(db: DatabaseState, customerId: string, tenantId: string) {
  const external = db.externalCustomers?.find(c => c.id === customerId);
  const tenant = db.tenants.find(t => t.id === tenantId && !t.isArchived);
  if (!external || !tenant) throw new Error('Müşteri veya firma bulunamadı.');
  const tax = (value: string) => String(value || '').trim();
  if (!/^\d{10,11}$/.test(tax(external.taxNumber)) || tax(external.taxNumber) !== tax(tenant.taxNumber)) throw new Error('VKN/TCKN biçimi geçersiz veya müşteri ile firma vergi numarası uyuşmuyor.');
  if (!external.externalId || external.provider !== 'HIZLI_BILISIM') throw new Error('Sağlayıcı müşteri kimliği geçersiz.');
  if (external.isbeyCompanyId && external.isbeyCompanyId !== tenantId) throw new Error('Müşteri başka bir firmaya bağlı.');
  if (tenant.externalCustomerId && tenant.externalCustomerId !== external.externalId) throw new Error('Firma başka bir sağlayıcı müşterisine bağlı.');
  if (db.tenants.some(t => t.id !== tenantId && (t.externalCustomerId === external.externalId || tax(t.taxNumber) === tax(external.taxNumber)))) throw new Error('Başka firmada aynı VKN/TCKN veya sağlayıcı bağlantısı mevcut.');
  if ((db.externalCustomers || []).some(c => c.id !== customerId && (c.isbeyCompanyId === tenantId || c.externalId === external.externalId || tax(c.taxNumber) === tax(external.taxNumber)))) throw new Error('Sağlayıcı müşteri kayıtlarında mükerrer veya çakışan eşleştirme mevcut.');
  return { external, tenant };
}
