import { initialDatabaseState as developmentSeed } from './seed';
import type { DatabaseState } from './schema';

/** Empty business collections; only reusable product catalogs are retained. */
export function createProductionDefaults(): DatabaseState {
  const state = structuredClone(developmentSeed);
  const catalogs = new Set(['services', 'plans', 'subscriptionPlans', 'planFeatures', 'creditPackages']);
  for (const key of Object.keys(state) as Array<keyof DatabaseState>) {
    if (Array.isArray(state[key]) && !catalogs.has(key)) (state as any)[key] = [];
  }
  state.company = { id: '', name: '', title: '', taxNumber: '', taxOffice: '',
    phone: '', email: '', address: '', city: '', district: '', currency: 'TRY',
    costingMethod: 'AVG_COST', fiscalYear: new Date().getFullYear() };
  state.activeTenantId = '';
  state.tenantConfigurations = {};
  for (const sequence of Object.values(state.sequences)) {
    sequence.lastNumber = 0;
    sequence.year = new Date().getFullYear();
  }
  state.settings.receiptHeader = '';
  state.settings.receiptFooter = '';
  state.hizliBilisimSettings = { apiUrl: 'https://econnecttest.hizliteknoloji.com.tr',
    apiKey: '', apiUsername: '', isTestMode: true, autoSyncEnabled: false,
    autoSyncIntervalMinutes: 15, autoCreateCompany: false, defaultPlan: 'PRO',
    sendActivationEmail: false, totalSynced: 0, totalConverted: 0 };
  return state;
}
