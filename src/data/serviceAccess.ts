import { ERP_MENUS } from './erpMenus';

export function allowsElectronicService(modules: string[] | null | undefined, service: string): boolean {
  return modules == null || modules.includes('*') || modules.some(m => m.replace(/_/g, '').toUpperCase() === service.toUpperCase());
}

const MODULE_MENUS: Record<string, string[]> = {
  CARI: ['cari'], STOK: ['stok'], FATURA: ['faturalar'], POS: ['pos'],
  KASA: ['kasa'], BANKA: ['banka'], CEK_SENET: ['ceksenet'],
  TEKLIF_SIPARIS: ['teklif'], IRSALIYE: ['irsaliye'], PERSONEL: ['personel'],
  EFATURA: ['edonusum'], E_FATURA: ['edonusum'], EARSIV: ['edonusum'],
  EIRSALIYE: ['edonusum'], ESMM: ['edonusum'], EDEFTER: ['edonusum'],
  RAPORLAR: ['raporlar'], MUHASEBE: ['muhasebe'], AI_ASISTAN: ['ai'],
  DOCUMENTS: ['documents'], OTOMASYON: ['otomasyon'],
  GIDER: ['gider'], FORM_DESIGNER: ['form-designer'],
};

export function menusForModules(modules: string[]): string[] {
  if (modules.includes('*')) return [...ERP_MENUS.map(m => m.id), 'form-designer'];
  return [...new Set(modules.flatMap(m => MODULE_MENUS[m.toUpperCase()] || []))];
}

const COMMON_VIEWS = ['hizmetler', 'ayarlar', 'admin', 'roles-permissions', 'companies',
  'support', 'support-center', 'device-security', 'activity-logs'];
const EXTRA_VIEWS: Record<string, string> = {
  'document-ai': 'ai', 'nakit-tahmin': 'ai', 'saha-tahsilat': 'kasa',
  'mobil-pos': 'pos', 'banka-mutabakat': 'banka', 'odeme-linkleri': 'kasa',
  'gelismis-raporlar': 'raporlar', 'tasks': 'documents', 'approvals': 'documents',
  collaboration: 'documents', 'client-portal': 'documents',
  'form-designer': 'form-designer',
};

// Null preserves existing accounts; an empty selection grants no business service.
export function serviceAllowsView(menus: string[] | null | undefined, view: string): boolean {
  if (menus == null || COMMON_VIEWS.includes(view)) return true;
  const menu = ERP_MENUS.find(m => (m.views as readonly string[]).includes(view));
  return menus.includes(menu?.id || EXTRA_VIEWS[view] || '');
}

export function serviceAllowsPath(menus: string[] | null | undefined, path: string): boolean {
  if (menus == null) return true;
  const normalized = path.split('?')[0].replace(/^\/api\/(v1\/)?/, '');
  if (/^e-documents\/erp-invoices\/[^/]+\/visual$/.test(normalized)) return menus.includes('faturalar');
  if (/^e-documents\/erp-waybills\/[^/]+\/visual$/.test(normalized)) return menus.includes('irsaliye');
  if (/^(auth|e-services|users|roles|permissions|invitations|members|companies|tenants|settings|notifications|support|support-faz8|devices|activity-logs|audit|subscriptions|credits|payments|usage|checkout|billing|onboarding)(\/|$)/.test(normalized)) {
    if (normalized === 'e-services/invoice-history') return menus.includes('edonusum');
    return true;
  }
  if (/^(saas\/plans|plans)(\/|$)/.test(normalized)) return true;
  if (/^(search|import|sync)(\/|$)/.test(normalized)) return ERP_MENUS.every(m => menus.includes(m.id));
  const resource = normalized.split('/')[0];
  const extras: Record<string, string> = { categories: 'stok', units: 'stok', warehouses: 'stok', 'invoice-designs': 'faturalar', 'form-designs': 'form-designer', 'cost-centers': 'gider', 'document-ai': 'ai', tasks: 'documents', approvals: 'documents', messages: 'documents', client: 'documents', visits: 'kasa', mobile: 'pos' };
  if (extras[resource]) return menus.includes(extras[resource]);
  const menu = ERP_MENUS.find(m => (m.paths as readonly string[]).includes(resource));
  return !!menu && menus.includes(menu.id);
}
