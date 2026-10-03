/**
 * HIZLI BİLİŞİM MÜŞTERİ LİSTESİ — SORGU PARAMETRESİ TEMİZLİĞİ (REGRESYON)
 * ==========================================================================
 * 2026-10-02 — CANLIDA YAKALANAN HATA.
 *
 * Belirti: `portfoye-ekle` ile mükellef eklendi, KPI "Toplam Müşteri = 1"
 * oldu, ama LİSTE BOŞ kaldı ("Kriterlere uygun Hızlı Bilişim müşteri kaydı
 * bulunamadı."). Yani kullanıcı eklediği kaydı göremiyordu.
 *
 * Kök neden: `HizliBilisimCustomerListView.loadData()` filtre alanları
 * boşken `search: form.vknTckn || form.musteriAdi || form.unvan || undefined`
 * gönderiyor; hepsi boşsa `undefined` oluyor. `URLSearchParams` bunu
 * `search=undefined` string'ine çeviriyor. Frontend `params ? ... : ''`
 * dediği için (nesne truthy) sorgu ekleniyor; backend `if (search)` bloğuna
 * girip GERÇEK bir arama terimi sanıyor ve `"undefined"` içermeyen her kaydı
 * eliyor → liste daima boş.
 *
 * ⚠️ AĞ İSTEĞİ YOK. Yalnız saf fonksiyon + gerçek router mantığının kopyası.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

console.log('\nA) Canlidaki hatali davranis (kanit)');
const bozuk = new URLSearchParams({ status: 'ALL', search: undefined });
ok(bozuk.toString() === 'status=ALL&search=undefined',
  'undefined -> "undefined" string olur (gercek: "' + bozuk.toString() + '")');

const havuz = [
  { companyName: 'ABDULKADIR SEZER', title: 'ABDULKADIR SEZER', contactName: 'ABDULKADIR SEZER', taxNumber: '59086248844', phone: '', email: '', externalId: 'HB-59086248844' },
];
const backendFiltre = (list, search) => {
  if (!search) return list;
  const q = String(search).toLowerCase().trim();
  return list.filter(c =>
    (c.companyName || '').toLowerCase().includes(q) ||
    (c.title || '').toLowerCase().includes(q) ||
    (c.contactName || '').toLowerCase().includes(q) ||
    (c.taxNumber || '').includes(q) ||
    (c.phone || '').includes(q) ||
    (c.email || '').toLowerCase().includes(q) ||
    (c.externalId || '').toLowerCase().includes(q));
};
ok(backendFiltre(havuz, 'undefined').length === 0,
  'search="undefined" TUM kayitlari eler (canli belirti: liste bos, KPI dolu)');
ok(backendFiltre(havuz, '').length === 1, 'search bos string ise filtre UYGULANMAZ (dogru davranis)');

console.log('\nB) buildQuery yardimcisi');
const API_SRC = path.resolve(process.cwd(), 'src/services/api.ts');
const src = fs.readFileSync(API_SRC, 'utf8');

const fnMatch = src.match(/export function buildQuery\([\s\S]*?\n\}/);
ok(Boolean(fnMatch), 'api.ts icinde buildQuery() tanimli');

if (fnMatch) {
  const body = fnMatch[0]
    .replace(/export function buildQuery/, 'function buildQuery')
    .replace(/: Record<string, unknown>/g, '')
    .replace(/: string/g, "")
    .replace(/params\?/, "params");
  const buildQuery = new Function(body + '; return buildQuery;')();

  ok(buildQuery({ status: 'ALL', search: undefined }) === '?status=ALL',
    'undefined alan TAMAMEN duser (search=undefined URETILMEZ)');
  ok(buildQuery({ status: 'ALL', search: null }) === '?status=ALL', 'null alan duser');
  ok(buildQuery({ status: 'ALL', search: '' }) === '?status=ALL', 'bos string duser');
  ok(buildQuery({ status: 'ALL', search: '  ' }) === '?status=ALL', 'yalniz bosluk duser');
  ok(buildQuery({ status: 'ALL', search: 'sezer' }) === '?status=ALL&search=sezer', 'dolu deger korunur');
  ok(buildQuery({ status: 'ALL', sayfa: 0, k: false }) === '?status=ALL&sayfa=0&k=false',
    '0 ve false DUSMEZ (yalniz undefined/null/bosluk duser)');
  ok(buildQuery({}) === '', 'bos nesne -> bos string');
  ok(buildQuery(undefined) === '', 'undefined nesne -> bos string');
}

console.log('\nB2) Sunucu savunma katmani (router)');
const routerSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'server/routes/hizli-bilisim.ts'), 'utf8');
ok(/q !== 'undefined'/.test(routerSrc) && /q !== 'null'/.test(routerSrc),
  'router "undefined"/"null" metnini arama terimi KABUL ETMEZ');
ok(/const gecerliArama =/.test(routerSrc), 'router gecerliArama kapisi tanimli');
// Router'in filtresi artik bu degerleri yok saymali
const routerFiltre = (list, search) => {
  const q = String(search ?? '').toLowerCase().trim();
  const gecerli = q !== '' && q !== 'undefined' && q !== 'null';
  if (!gecerli) return list;
  return list.filter(c => (c.companyName || '').toLowerCase().includes(q));
};
ok(routerFiltre(havuz, 'undefined').length === 1,
  'SUNUCU: search=undefined artik listeyi BOSALTMAZ (ikinci savunma katmani)');
ok(routerFiltre(havuz, '').length === 1, 'SUNUCU: bos arama tum listeyi doner');
ok(routerFiltre(havuz, 'sezer').length === 1, 'SUNUCU: gercek arama hala calisir');
ok(routerFiltre(havuz, 'yokboyle').length === 0, 'SUNUCU: eslesmeyen terim yine 0 doner');

console.log('\nC) Kaynak taramasi');
const hataliKullanim = [...src.matchAll(/params \? `\?\$\{new URLSearchParams\(params as any\)\.toString\(\)\}` : ''/g)];
ok(hataliKullanim.length === 0,
  'api.ts\'de hatali kalip kalmadi (bulunan: ' + hataliKullanim.length + ')');

const listView = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/modules/hizlibilisim/HizliBilisimCustomerListView.tsx'), 'utf8');
ok(!/search:\s*[^\n]*\|\|\s*undefined/.test(listView),
  'ListView `search: ... || undefined` gondermiyor');

console.log('\nSONUC: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exitCode = fail ? 1 : 0;
