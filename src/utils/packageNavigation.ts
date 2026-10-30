import type { AppView } from '../context/AppContext';
import type { SidebarGroup } from './modulePermissions';

// Presentation only: every destination still passes the existing package and role gates.
export function packageSidebar(groups: SidebarGroup[], canAccess: (view: string) => boolean): SidebarGroup[] {
  const candidates = groups.map(group => ({ ...group, moduleIds: group.moduleIds.filter(canAccess) }));
  // Role sidebar lists are not exhaustive; include each entitled service once.
  const listed = new Set(candidates.flatMap(group => group.moduleIds));
  const services: AppView[] = ['cari', 'stok', 'faturalar', 'kasa', 'banka', 'teklif', 'irsaliye', 'gider', 'ceksenet', 'personel', 'pos', 'muhasebe', 'vergi', 'raporlar', 'documents', 'ai', 'otomasyon'];
  const missing = services.filter(id => !listed.has(id) && canAccess(id));
  if (missing.length) candidates.push({ groupLabel: 'PAKET HİZMETLERİ', moduleIds: missing });
  // Electronic-only packages need their own entry when the invoice workspace is unavailable.
  if (canAccess('edonusum') && !candidates.some(group => group.moduleIds.includes('edonusum'))) {
    candidates.push({ groupLabel: 'BELGELER', moduleIds: ['edonusum'] });
  }
  const all = new Set(candidates.flatMap(group => group.moduleIds));
  const hidden = new Set<AppView>();
  if (all.has('faturalar')) {
    for (const view of ['alis', 'satis', 'edonusum'] as AppView[]) hidden.add(view);
    // Only remove the independent waybill entry when its tab is available in the hub.
    if (canAccess('irsaliye')) hidden.add('irsaliye');
  }
  if (all.has('kasa')) hidden.add('finans');
  if (all.has('ai-merkezi')) hidden.add('ai');
  const management = (['companies', 'tenants', 'platform-admin', 'saas-admin', 'hizlibilisim'] as AppView[]).filter(id => all.has(id));
  management.slice(1).forEach(id => hidden.add(id));
  const seen = new Set<AppView>();
  return candidates.map(group => ({ ...group, moduleIds: group.moduleIds.filter(id => {
    if (hidden.has(id) || seen.has(id)) return false;
    seen.add(id); return true;
  }) })).filter(group => group.moduleIds.length > 0);
}

export const invoiceWorkspaceTabs = [
  { id: 'satis', module: 'satis', label: 'Satış Faturaları' },
  { id: 'alis', module: 'alis', label: 'Alış Faturaları' },
  { id: 'efatura', module: 'edonusum', label: 'e-Fatura & e-Arşiv Portalı' },
  { id: 'irsaliye', module: 'irsaliye', label: 'e-İrsaliyeler & Sevk' },
  { id: 'sorgulama', module: 'faturalar', label: 'Belge Sorgulama' },
] as const;

export function packageAllowsSetting(tab: string, canAccess: (view: string) => boolean): boolean {
  const required: Record<string, string[]> = {
    HIZLI_CONNECT: ['edonusum'], HIZLI_BILISIM: ['edonusum'],
    TEMPLATES: ['faturalar', 'irsaliye', 'edonusum'], INVOICE_DESIGN: ['faturalar'],
    SEQUENCES: ['faturalar', 'irsaliye', 'edonusum'], PRICE_LISTS: ['cari', 'stok'],
  };
  return !required[tab] || required[tab].some(canAccess);
}
