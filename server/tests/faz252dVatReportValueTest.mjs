// FAZ 25.2-D ek — VAT RAPORU DEĞER DOĞRULAMASI (koşu #5 kabul kriteri)
//
// Neden var: Koşu #4'te `vat-report` ucunun 500 DÖNMEDİĞİ doğrulandı, ancak dönen
// KDV/tutar değerlerinin doğru olduğu bağımsız olarak sınanmadı. "500 yok" ile
// "rakam doğru" aynı şey değildir. Bu test ikinci iddiayı ölçer.
//
// YÖNTEM (bağımsız yeniden hesap): Beklenen değerler DB dosyasındaki fatura/gider
// kayıtlarından, ucun KENDİ kodu kullanılmadan yeniden hesaplanır; sonra uç yanıtıyla
// birebir karşılaştırılır. Böylece "uç kendi çıktısıyla tutarlı" totolojisi engellenir.
//
// Kapsam: tüm satırlar + fixture satırı (Mega Taş gelen e-fatura, 18.500 / 3.700, %20).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DB_PATH = path.join(ROOT, 'data/database.json');
const BASE = process.env.ISBEY_BASE_URL || 'http://127.0.0.1:4000';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005; // kuruş toleransı

async function api(method, p, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + p, { method, headers: h });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
}

console.log('════════ FAZ 25.2-D — VAT Raporu DEĞER doğrulaması ════════\n');

// ─── 1. Beklenen değerleri DB'den bağımsız hesapla ──────────────────────────
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// Uçtaki invoiceLines()/lineBase() ile AYNI semantik, ama ayrı yazılmış (kopya değil, referans).
const linesOf = (inv) => Array.isArray(inv?.items) ? inv.items : (Array.isArray(inv?.lines) ? inv.lines : []);
const baseOf = (it) => typeof it?.lineTotal === 'number'
  ? it.lineTotal
  : (Number(it?.totalAmount) || 0) - (Number(it?.vatAmount) || 0);

// NOT: Uç, `vatRate` tanımsız satırları ATMAZ — `vatByRate[undefined]` anahtarıyla bir
// satır üretir (reports.ts:253). Referans da aynı semantiği izlemeli, yoksa satır sayısı
// tutmaz ve YANLIŞ FAIL üretir (denetim bulgusu D3). Bu yüzden anahtar `String(rate)`,
// değer ham `rate` olarak saklanır — uçla birebir.
const agg = new Map(); // String(rate) → { rate, salesBase, ... }
const bump = (rate, key, val) => {
  const k = String(rate);
  if (!agg.has(k)) agg.set(k, { rate, salesBase: 0, salesVat: 0, purchaseBase: 0, purchaseVat: 0 });
  agg.get(k)[key] += val;
};

for (const inv of (db.invoices || [])) {
  if (inv.isDeleted) continue;
  if (inv.status === 'CANCELLED') continue;
  const isSales = inv.type === 'SALES' || inv.type === 'RETAIL_POS';
  const isPurchase = inv.type === 'PURCHASE';
  if (!isSales && !isPurchase) continue;
  for (const it of linesOf(inv)) {
    if (isSales) { bump(it.vatRate, 'salesBase', baseOf(it)); bump(it.vatRate, 'salesVat', Number(it.vatAmount) || 0); }
    else { bump(it.vatRate, 'purchaseBase', baseOf(it)); bump(it.vatRate, 'purchaseVat', Number(it.vatAmount) || 0); }
  }
}
for (const e of (db.expenses || [])) {
  if (e.deletedAt || !(e.vatRate > 0)) continue;
  bump(e.vatRate, 'purchaseBase', Number(e.amount) || 0);
  bump(e.vatRate, 'purchaseVat', Number(e.vatAmount) || 0);
}
const r2 = (n) => Math.round(n * 100) / 100;
const expectedRows = [...agg.entries()].map(([key, v]) => ({
  key, rate: v.rate,
  salesBase: r2(v.salesBase), salesVat: r2(v.salesVat),
  purchaseBase: r2(v.purchaseBase), purchaseVat: r2(v.purchaseVat),
  netVat: r2(v.salesVat - v.purchaseVat),
})).sort((a, b) => (Number(a.rate) || 0) - (Number(b.rate) || 0));
const expectedTotals = expectedRows.reduce((a, row) => ({
  salesBase: r2(a.salesBase + row.salesBase), salesVat: r2(a.salesVat + row.salesVat),
  purchaseBase: r2(a.purchaseBase + row.purchaseBase), purchaseVat: r2(a.purchaseVat + row.purchaseVat),
  netVat: r2(a.netVat + row.netVat),
}), { salesBase: 0, salesVat: 0, purchaseBase: 0, purchaseVat: 0, netVat: 0 });

console.log(`  (referans hesap: ${expectedRows.length} KDV oranı, ${(db.invoices || []).length} fatura + ${(db.expenses || []).length} gider tarandı)\n`);

// ─── 2. Uçtan al ────────────────────────────────────────────────────────────
const login = async (u, p) => (await (await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: u, password: p }),
})).json()).token;

const admin = await login('admin', 'admin123');
const firma = await login('firmaadmin', 'firmaadmin123');

console.log('📋 Uç durumu');
const asAdmin = await api('GET', '/api/reports/vat-report', admin);
ok(asAdmin.status === 200, `SUPER_ADMIN GET /api/reports/vat-report → ${asAdmin.status} (200 beklenir)`);
const asFirma = await api('GET', '/api/reports/vat-report', firma);
ok(asFirma.status === 200, `COMPANY_ADMIN GET /api/reports/vat-report → ${asFirma.status} (200 beklenir)`);

if (asAdmin.status !== 200) {
  console.log(`\n════════ SONUÇ: ${pass} PASS / ${fail} FAIL (uç 200 dönmedi — değer kıyası yapılamadı) ════════`);
  process.exit(1);
}

// ─── 3. Değer kıyası ────────────────────────────────────────────────────────
console.log('\n📋 Genel toplamlar (uç ↔ bağımsız referans)');
const t = asAdmin.json?.totals || {};
for (const k of ['salesBase', 'salesVat', 'purchaseBase', 'purchaseVat', 'netVat']) {
  ok(eq(t[k], expectedTotals[k]), `totals.${k} = ${t[k]} (beklenen ${expectedTotals[k]})`);
}

console.log('\n📋 Oran bazlı satırlar');
const rows = (asAdmin.json?.rows || []);
ok(rows.length === expectedRows.length, `satır sayısı = ${rows.length} (beklenen ${expectedRows.length})`);
// Anahtar karşılaştırması: uç, rows[i].rate taşır (tanımsız oran dahil). Referans da
// aynı anahtarı taşır; eşleştirme String(rate) üzerinden yapılır.
for (const exp of expectedRows) {
  const got = rows.find(x => String(x.rate) === exp.key);
  if (!got) { ok(false, `%${exp.key} oranı yanıtta YOK`); continue; }
  const same = eq(got.salesBase, exp.salesBase) && eq(got.salesVat, exp.salesVat)
    && eq(got.purchaseBase, exp.purchaseBase) && eq(got.purchaseVat, exp.purchaseVat)
    && eq(got.netVat, exp.netVat);
  ok(same, `%${exp.key} → satış ${got.salesBase}/${got.salesVat}, alış ${got.purchaseBase}/${got.purchaseVat}, net ${got.netVat}`);
}

// ─── 4. Fixture satırı özel kontrolü (Mega Taş gelen e-Fatura) ───────────────
// Bu kayıt koşu #3'te 500 üretiyordu; şemaya uygun hale getirildi. Tutarları
// (18.500 + 3.700 = 22.200, %20) raporda GÖRÜNMELİ. Kaybolursa sessiz veri kaybı vardır.
console.log('\n📋 Fixture satırı (Mega Taş gelen e-Fatura, %20 KDV)');
const rate20 = rows.find(x => Number(x.rate) === 20);
const inv = (db.invoices || []).find(i => i.id === 'inv-inc-1787823405260');
if (!inv) {
  ok(false, 'fixture faturası inv-inc-1787823405260 DB\'de bulunamadı');
} else {
  const invLines = linesOf(inv);
  const invBase = invLines.reduce((a, it) => a + baseOf(it), 0);
  const invVat = invLines.reduce((a, it) => a + (Number(it.vatAmount) || 0), 0);
  ok(invLines.length > 0 && invBase === 18500 && invVat === 3700,
    `fixture faturası: ${invLines.length} satır, matrah ${invBase}, KDV ${invVat} (18.500 / 3.700 beklenir)`);
  ok(rate20 && rate20.purchaseBase >= 18500 && rate20.purchaseVat >= 3700,
    `%20 alış toplamına yansıdı → ${rate20 ? rate20.purchaseBase : 'satır yok'} / ${rate20 ? rate20.purchaseVat : '-'} (≥ 18.500 / 3.700)`);
}

console.log(`\n════════ SONUÇ: ${pass} PASS / ${fail} FAIL ════════`);
process.exit(fail ? 1 : 0);
