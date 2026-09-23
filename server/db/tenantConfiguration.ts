import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseState, Company } from './schema';
import { initialDatabaseState } from './seed';
import { isProduction } from '../config/environment';
import { createProductionDefaults } from './productionDefaults';

export const tenantContext = new AsyncLocalStorage<string>();

export function tenantConfiguration(db: DatabaseState, tenantId: string) {
  const tenant = db.tenants.find(t => t.id === tenantId);
  if (!tenant) throw new Error('Firma yapılandırması için geçerli tenant zorunludur.');
  db.tenantConfigurations ||= {};
  if (!db.tenantConfigurations[tenantId]) {
    // Existing sequence high-water marks are retained: migration must never reuse numbers.
    const legacyOwner = db.tenants.find(t => t.taxNumber && t.taxNumber === db.company.taxNumber)?.id;
    const blankCompany: Company = { id: tenantId, name: '', title: '', taxNumber: '', taxOffice: '', email: '', phone: '', address: '', city: '', district: '', currency: 'TRY', costingMethod: 'AVG_COST', fiscalYear: new Date().getFullYear() };
    const company = { ...(legacyOwner === tenantId ? db.company : blankCompany),
      ...Object.fromEntries(Object.entries(tenant).filter(([key]) => ['name', 'title', 'taxNumber', 'taxOffice', 'email', 'phone', 'address', 'city', 'district', 'logoUrl', 'website'].includes(key))), id: tenantId } as Company;
    db.tenantConfigurations[tenantId] = {
      company,
      settings: structuredClone(legacyOwner === tenantId ? db.settings :
        isProduction() ? createProductionDefaults().settings : initialDatabaseState.settings),
      sequences: structuredClone(db.sequences),
    };
  }
  return db.tenantConfigurations[tenantId];
}

export function scopedState(db: DatabaseState, tenantId = tenantContext.getStore()): DatabaseState {
  if (!tenantId) return db; // Boot, migration and explicit platform maintenance only.
  const config = tenantConfiguration(db, tenantId);
  const tenant = db.tenants.find(t => t.id === tenantId)!;
  const keys = new Set(['company', 'settings', 'sequences']);
  return new Proxy(db, {
    get(target, key) {
      if (key === 'company') {
        for (const field of ['name', 'title', 'taxNumber', 'taxOffice', 'email', 'phone', 'address', 'city', 'district', 'logoUrl', 'website'] as const) {
          if (tenant[field] !== undefined) (config.company as any)[field] = tenant[field];
        }
      }
      return keys.has(String(key)) ? config[key as keyof typeof config] : Reflect.get(target, key);
    },
    set(target, key, value) {
      if (keys.has(String(key))) { (config as any)[key] = value; return true; }
      return Reflect.set(target, key, value);
    },
  });
}
