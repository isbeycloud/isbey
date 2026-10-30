import assert from 'node:assert/strict';
import { packageSidebar, invoiceWorkspaceTabs, packageAllowsSetting } from '../../src/utils/packageNavigation';
import { getMembershipSidebar, canAccessMembershipModule } from '../../src/utils/modulePermissions';
import { menusForModules, serviceAllowsView } from '../../src/data/serviceAccess';
import { menuAllowsView } from '../../src/data/erpMenus';

function navigation(modules: string[], roles = ['COMPANY_ADMIN'], allowed?: string[]) {
  const menus = menusForModules(modules);
  const can = (view: string) => serviceAllowsView(menus, view) && menuAllowsView(allowed, view) && canAccessMembershipModule(roles, [], view);
  const groups = packageSidebar(getMembershipSidebar(roles), can);
  const ids = groups.flatMap(group => group.moduleIds);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(groups.every(group => group.moduleIds.length));
  assert.ok(ids.every(can));
  return { ids, can };
}
const expected: Record<string, string> = { CARI: 'cari', STOK: 'stok', FATURA: 'faturalar', KASA: 'kasa', BANKA: 'banka', POS: 'pos', PERSONEL: 'personel', GIDER: 'gider', TEKLIF_SIPARIS: 'teklif', IRSALIYE: 'irsaliye', EFATURA: 'edonusum' };
for (const [module, view] of Object.entries(expected)) {
  const { ids, can } = navigation([module]);
  assert.ok(ids.includes(view as typeof ids[number]), `${module} must have an accessible menu`);
  if (module !== 'FATURA') assert.equal(ids.includes('faturalar'), false);
  if (module !== 'EFATURA') assert.equal(ids.includes('edonusum'), false);
  assert.equal(packageAllowsSetting('HIZLI_CONNECT', can), module === 'EFATURA');
}
const invoice = navigation(['FATURA']);
assert.deepEqual(invoiceWorkspaceTabs.filter(tab => invoice.can(tab.module)).map(tab => tab.id), ['satis', 'alis', 'sorgulama']);
assert.equal(invoice.ids.includes('alis'), false);
assert.equal(invoice.ids.includes('satis'), false);
const combined = navigation(['FATURA', 'EFATURA', 'IRSALIYE', 'KASA', 'BANKA']);
assert.equal(combined.ids.filter(id => ['faturalar', 'satis', 'alis', 'edonusum', 'irsaliye'].includes(id)).length, 1);
assert.equal(combined.ids.includes('finans'), false);
assert.equal(invoiceWorkspaceTabs.filter(tab => combined.can(tab.module)).length, 5);
assert.equal(navigation(['FATURA', 'EFATURA'], ['COMPANY_ADMIN'], ['edonusum']).ids.includes('edonusum'), true);
assert.equal(navigation(['POS', 'PERSONEL'], ['RAPOR']).ids.some(id => ['pos', 'personel'].includes(id)), false);
const empty = navigation([]);
assert.equal(empty.ids.some(id => ['cari', 'stok', 'pos', 'faturalar', 'edonusum'].includes(id)), false);
assert.equal(packageAllowsSetting('TEMPLATES', empty.can), false);
assert.equal(packageAllowsSetting('PRICE_LISTS', empty.can), false);
assert.equal(packageAllowsSetting('COMPANY', empty.can), true);
console.info('Package navigation: exact scope, roles, invoice tabs, electronic-only access and deduplication PASS.');
