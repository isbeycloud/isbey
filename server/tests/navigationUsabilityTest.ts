import assert from 'node:assert/strict';
import { findNavigationCommands, normalizeNavigationSearch } from '../../src/data/navigationSearch';
import { canAccessModule, hasPermission } from '../../src/utils/modulePermissions';

const all = () => true;
assert.equal(normalizeNavigationSearch('  İŞLEM ŞİRKET ÇÖZÜM  '), 'islem sirket cozum');
const result = (query: string) => findNavigationCommands(query, all, all);
assert.ok(result('YAZAR KASA').some(c => c.view === 'pos'));
assert.ok(result('masraf').some(c => c.view === 'gider' && c.tab === 'GIDER'));
assert.ok(result('banka').some(c => c.view === 'banka' && c.tab === 'KASA_BANKA'));
assert.ok(result('ŞİRKET').some(c => c.view === 'companies'));
assert.ok(result('e-fatura').some(c => c.view === 'gelen-belgeler'));
assert.equal(result('bulunmayan-menusozcugu').length, 0);
const viewer = findNavigationCommands('', view => canAccessModule('RAPOR', view), module => hasPermission('RAPOR', 'add', module));
assert.equal(viewer.some(c => !!c.action), false);
assert.equal(viewer.some(c => c.view === 'platform-admin'), false);
assert.equal(findNavigationCommands('yazar kasa', () => false, all).length, 0);
assert.equal(new Set(result('').map(c => c.id)).size, result('').length);
console.info('Navigation usability: Turkish search, valid destinations, aliases and role filtering PASS.');
