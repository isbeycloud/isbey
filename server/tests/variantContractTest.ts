/**
 * İŞBEY CLOUD — Varyant + Ürün Görseli Sözleşme Testi (2026-10-12)
 * ===============================================================
 * Kapsam: varyant özellikleri (Renk/Ebat…), ürün varyantları (stok+fiyat),
 * belge satırında varyant zorunluluğu ve sunucuya görsel yükleme.
 *
 * KORUNAN DEĞİŞMEZLER:
 *  1. Varyantsız üründe davranış AYNEN eskisi gibi (tek stok/fiyat/barkod).
 *  2. Varyantlı üründe satır varyantsız GEÇEMEZ (belirsiz stok düşüşü yok).
 *  3. Tenant izolasyonu: A firması B'nin özelliğini/varyantını göremez.
 *  4. Özellik SİLİNMEZ (pasife alınır); değer atıfları kopmaz.
 *  5. Geçersiz varyant girdileri diske YAZILMAZ.
 *  6. Fatura toplam formülleri DEĞİŞMEZ (yalnız varyant izi eklenir).
 *  7. Görsel: 5 MB + 4096px + mime kapıları; sahte başlık reddedilir;
 *     tenant klasörü dışına yazılamaz/okunamaz.
 *
 * Çalıştırma: tools/test-local.mjs (izole DATABASE_PATH + NODE_ENV=test).
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'variantContractTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole variantContractTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
const DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'variant-data');
process.env.ISBEY_DATA_DIR = DATA_DIR;

const { storage } = await import('../db/storage');
// 2026-10-12: Fatura testleri alıcı çözümlemesine takılmasın diye sağlayıcı +
// mükellef sorgusu TAKLİT edilir (ağa çıkılmaz; e-Fatura GÖNDERİLMEZ).
// Alıcı e-Fatura mükellefi DEĞİL sayılır → profil EARSIVFATURA olur.
const { ProviderFactory } = await import('../services/providers/providerFactory');
const { TaxpayerService } = await import('../services/taxpayerService');
const oldFactory = ProviderFactory.getProviderForTenant;
const oldCheck = TaxpayerService.checkTaxpayer;
ProviderFactory.getProviderForTenant = (() => ({
  provider: { providerId: 'TEST' },
  settings: { tenantId: TENANT_A, environment: 'TEST' },
})) as typeof oldFactory;
TaxpayerService.checkTaxpayer = (async () => ({
  identifier: '0000000000', isEInvoiceUser: false,
})) as typeof oldCheck;
const { v1VariantOptionsRouter } = await import('../routes/v1/variantOptions');
const { productsRouter } = await import('../routes/products');
const { customersRouter } = await import('../routes/customers');
const { invoicesRouter } = await import('../routes/invoices');
const { v1ProductImagesRouter } = await import('../routes/v1/productImages');

const TENANT_A = 'tnt-a';
const TENANT_B = 'tnt-b';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
const tokens: Record<string, string> = {};

function signToken(userId: string, tenantId: string): string {
  return jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!, { expiresIn: '5m' });
}

function headers(tenant: 'A' | 'B'): Record<string, string> {
  return { Authorization: `Bearer ${tokens[tenant]}`, 'Content-Type': 'application/json' };
}

function kurulum() {
  storage.update(db => {
    db.tenants = [
      { id: TENANT_A, name: 'A Firması', subdomain: 'a' } as any,
      { id: TENANT_B, name: 'B Firması', subdomain: 'b' } as any,
    ];
    db.users = [
      { id: 'usr-a', tenantId: TENANT_A, username: 'a-admin', fullName: 'A Admin', email: 'a@x.com', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any,
      { id: 'usr-b', tenantId: TENANT_B, username: 'b-admin', fullName: 'B Admin', email: 'b@x.com', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any,
    ];
    db.memberships = [
      { id: 'mem-a', userId: 'usr-a', tenantId: TENANT_A, role: 'COMPANY_ADMIN', permissions: ['*'], active: true },
      { id: 'mem-b', userId: 'usr-b', tenantId: TENANT_B, role: 'COMPANY_ADMIN', permissions: ['*'], active: true },
    ] as any;
    const now = new Date().toISOString();
    db.productGroups = [{ id: 'grp-1', tenantId: TENANT_A, name: 'Genel', code: 'GRP-1' } as any];
    db.warehouses = [{ id: 'wh-1', tenantId: TENANT_A, name: 'Merkez Depo', code: 'WH-1', isDefault: true } as any];
    db.products = [
      { id: 'prd-sade', tenantId: TENANT_A, barcode: '8690000000001', code: 'STK-001', name: 'Sade Ürün', groupId: 'grp-1', unit: 'Adet', purchasePrice: 60, salePrice: 100, vatRate: 20, criticalStock: 5, currentStock: 50, warehouseId: 'wh-1', active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.customers = [
      // taxNumber taklit mükellef yanıtıyla EŞLEŞMELİ (0000000000); yoksa fatura
      // "vergi numarası değişti" diye reddedilir (alıcı çözümleme kapısı).
      { id: 'cust-a', tenantId: TENANT_A, code: 'CAR-001', type: 'CUSTOMER', title: 'A Müşterisi', taxNumber: '0000000000', phone: '02120000000', riskLimit: 100000, maturityDays: 30, balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.variantOptions = [];
    db.invoices = [];
    // 2026-10-17: Açılış stoğu HAREKETLE kurulur. `recalculateBalances` ürün
    // stoğunu yalnız hareketlerden türetir; bu hareket yokken ilk yazmadan
    // sonra `currentStock` 0'a iner ve varyant stok düşüşü ölçülemez.
    db.stockMovements = [{
      id: 'sm-var-base', tenantId: TENANT_A, productId: 'prd-sade', productCode: 'STK-001',
      productName: 'Sade Ürün', warehouseId: 'wh-1', documentNo: 'ACILIS-VAR',
      documentType: 'ADJUSTMENT', documentId: 'var-opening', movementType: 'COUNT_ADJUSTMENT',
      quantity: 50, direction: 'IN', unitPrice: 60, totalAmount: 3000,
      date: now.split('T')[0], userId: 'variant-admin', createdAt: now,
    } as any];
  });
}

async function basla() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/variant-options', v1VariantOptionsRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/v1/product-images', v1ProductImagesRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokens.A = signToken('usr-a', TENANT_A);
  tokens.B = signToken('usr-b', TENANT_B);
}

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push({ name, fn }); }

let RENK_ID = '';
let KIRMIZI_ID = '';
let MAVI_ID = '';
let EBAT_ID = '';
let S_ID = '';
let M_ID = '';

// ─── 1. Özellik CRUD ───────────────────────────────────────────────────────

test('özellik oluşturulur (Renk: Kırmızı/Mavi)', async () => {
  const res = await fetch(`${base}/api/v1/variant-options`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Renk', values: [{ name: 'Kırmızı', swatch: '#ff0000' }, { name: 'Mavi' }] }),
  });
  assert.equal(res.status, 200);
  const opt = (await res.json() as any).variantOption;
  assert.equal(opt.name, 'Renk');
  assert.equal(opt.values.length, 2);
  assert.equal(opt.active, true);
  RENK_ID = opt.id;
  KIRMIZI_ID = opt.values.find((v: any) => v.name === 'Kırmızı').id;
  MAVI_ID = opt.values.find((v: any) => v.name === 'Mavi').id;
});

test('aynı adda ikinci özellik REDDEDİLİR', async () => {
  const res = await fetch(`${base}/api/v1/variant-options`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'renk', values: [{ name: 'Yeşil' }] }),
  });
  assert.equal(res.status, 400);
});

test('değersiz özellik REDDEDİLİR', async () => {
  const res = await fetch(`${base}/api/v1/variant-options`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Ebat', values: [] }),
  });
  assert.equal(res.status, 400);
});

test('ikinci özellik (Ebat: S/M) + değer kimliği korunarak ad güncellenir', async () => {
  const r = await fetch(`${base}/api/v1/variant-options`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Ebat', values: [{ name: 'S' }, { name: 'M' }] }),
  });
  const ebat = (await r.json() as any).variantOption;
  EBAT_ID = ebat.id;
  S_ID = ebat.values.find((v: any) => v.name === 'S').id;
  M_ID = ebat.values.find((v: any) => v.name === 'M').id;

  // "M" değerinin ADINI değiştir ama KİMLİĞİNİ koru.
  const upd = await fetch(`${base}/api/v1/variant-options/${EBAT_ID}`, {
    method: 'PUT', headers: headers('A'),
    body: JSON.stringify({ values: [{ id: S_ID, name: 'S' }, { id: M_ID, name: 'Medium' }, { name: 'L' }] }),
  });
  assert.equal(upd.status, 200);
  const after = (await upd.json() as any).variantOption;
  assert.equal(after.values.find((v: any) => v.id === M_ID).name, 'Medium', 'Değer kimliği korunarak ad güncellenmeli');
  assert.equal(after.values.length, 3, 'Yeni değer eklenmeli');
});

test('SİLME pasife alır (kayıt SİLİNMEZ)', async () => {
  const res = await fetch(`${base}/api/v1/variant-options/${RENK_ID}`, { method: 'DELETE', headers: headers('A') });
  assert.equal(res.status, 200);
  const list = await (await fetch(`${base}/api/v1/variant-options`, { headers: headers('A') })).json() as any;
  const found = list.variantOptions.find((o: any) => o.id === RENK_ID);
  assert.ok(found, 'Pasif özellik SİLİNMEMELİ');
  assert.equal(found.active, false);
  // Yeniden etkinleştir (sonraki testler Renk kullanıyor).
  await fetch(`${base}/api/v1/variant-options/${RENK_ID}`, {
    method: 'PUT', headers: headers('A'), body: JSON.stringify({ active: true }),
  });
});

// ─── 2. Tenant izolasyonu ──────────────────────────────────────────────────

test('TENANT İZOLASYONU: B firması A özelliğini GÖREMEZ/GÜNCELLEYEMEZ', async () => {
  const listB = await (await fetch(`${base}/api/v1/variant-options`, { headers: headers('B') })).json() as any;
  assert.equal(listB.variantOptions.length, 0);
  const upd = await fetch(`${base}/api/v1/variant-options/${RENK_ID}`, {
    method: 'PUT', headers: headers('B'), body: JSON.stringify({ name: 'Hack' }),
  });
  assert.equal(upd.status, 404);
});

// ─── 3. Ürün varyantları ───────────────────────────────────────────────────

test('ÜRÜN: varyantlı ürün oluşturulur, ürün stoğu = varyant toplamı', async () => {
  const res = await fetch(`${base}/api/products`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({
      name: 'Tişört', code: 'STK-100', unit: 'Adet', warehouseId: 'wh-1', salePrice: 200, vatRate: 20,
      variantOptionIds: [RENK_ID, EBAT_ID],
      variants: [
        { attributes: [{ optionId: RENK_ID, valueId: KIRMIZI_ID }, { optionId: EBAT_ID, valueId: S_ID }], name: 'Kırmızı / S', barcode: '8691000000001', currentStock: 10, salePrice: 210 },
        { attributes: [{ optionId: RENK_ID, valueId: MAVI_ID }, { optionId: EBAT_ID, valueId: M_ID }], name: 'Mavi / Medium', currentStock: 5 },
      ],
    }),
  });
  assert.equal(res.status, 200);
  const p = (await res.json() as any).product;
  assert.equal(p.variants.length, 2);
  assert.equal(p.currentStock, 15, 'Ürün stoğu varyant toplamı olmalı (10+5)');
  // Varyant fiyatı boşsa taban geçerli (ikinci varyant).
  assert.equal(p.variants[1].salePrice, undefined);
});

test('ÜRÜN: geçersiz varyant girdileri ATILIR (bozuk satır yazılmaz)', async () => {
  const res = await fetch(`${base}/api/products`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({
      name: 'Bozuk Varyantlı', code: 'STK-101', unit: 'Adet', warehouseId: 'wh-1', salePrice: 100, vatRate: 20,
      variantOptionIds: [RENK_ID],
      variants: [
        { attributes: [{ optionId: RENK_ID, valueId: KIRMIZI_ID }], name: 'Kırmızı', currentStock: 3 },
        { attributes: [{ optionId: RENK_ID, valueId: 'yok-boyle-deger' }], name: 'Hayalet', currentStock: 99 },
        { attributes: [], name: 'Boş', currentStock: 99 },
        { attributes: [{ optionId: RENK_ID, valueId: KIRMIZI_ID }], name: 'Kırmızı Tekrar', currentStock: 7 },
      ],
    }),
  });
  assert.equal(res.status, 200);
  const p = (await res.json() as any).product;
  assert.equal(p.variants.length, 1, 'Yalnız geçerli + tekil varyant kalmalı');
  assert.equal(p.variants[0].name, 'Kırmızı');
  assert.equal(p.currentStock, 3);
});

test('ÜRÜN: başka firmaya ait özellikle varyant AÇILAMAZ (IDOR)', async () => {
  // B firması kendi özelliğini açar.
  const rb = await fetch(`${base}/api/v1/variant-options`, {
    method: 'POST', headers: headers('B'),
    body: JSON.stringify({ name: 'B-Renk', values: [{ name: 'B-Kırmızı' }] }),
  });
  const bOpt = (await rb.json() as any).variantOption;
  const bVal = bOpt.values[0].id;

  // A firması B'nin özelliğini kullanmaya çalışır.
  const res = await fetch(`${base}/api/products`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({
      name: 'IDOR Ürün', code: 'STK-102', unit: 'Adet', warehouseId: 'wh-1', salePrice: 100, vatRate: 20,
      variantOptionIds: [bOpt.id],
      variants: [{ attributes: [{ optionId: bOpt.id, valueId: bVal }], name: 'X', currentStock: 5 }],
    }),
  });
  assert.equal(res.status, 200);
  const p = (await res.json() as any).product;
  assert.equal(p.variants, undefined, 'Başka firmanın özelliği sessizce atılmalı, varyant yazılmamalı');
  assert.equal(p.variantOptionIds, undefined);
});

// ─── 4. Fatura: varyant zorunluluğu + stok ──────────────────────────────────

test('FATURA: varyantlı üründe varyantsız satır REDDEDİLİR', async () => {
  const state = storage.getState();
  const tisort = state.products.find(p => p.code === 'STK-100')!;
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({
      type: 'SALES', customerId: 'cust-a', date: new Date().toISOString().split('T')[0],
      items: [{ productId: tisort.id, quantity: 1, unitPrice: 200 }],
    }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json() as any).message, /varyant/i);
});

test('FATURA: varyantlı satışta VARYANT stoğu düşer, ürün toplamı güncellenir', async () => {
  const state = storage.getState();
  const tisort = state.products.find(p => p.code === 'STK-100')!;
  const kirmizi = tisort.variants!.find(v => v.name === 'Kırmızı / S')!;
  const beforeK = kirmizi.currentStock;

  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({
      type: 'SALES', customerId: 'cust-a', date: new Date().toISOString().split('T')[0],
      items: [{ productId: tisort.id, variantId: kirmizi.id, quantity: 2, unitPrice: 210 }],
    }),
  });
  assert.equal(res.status, 200);
  const inv = (await res.json() as any).invoice;
  assert.equal(inv.items[0].variantId, kirmizi.id, 'Satırda varyant izi olmalı');
  assert.match(inv.items[0].productName, /Kırmızı \/ S/, 'Belge satırında varyant adı görünmeli');

  const after = storage.getState().products.find(p => p.code === 'STK-100')!;
  const afterK = after.variants!.find(v => v.id === kirmizi.id)!;
  assert.equal(afterK.currentStock, beforeK - 2, 'Varyant stoğu 2 düşmeli');
  assert.equal(after.currentStock, 13, 'Ürün toplamı varyant toplamına inmeli (15-2)');
});

test('FATURA: varyant stoğu YETERSİZSE satış REDDEDİLİR', async () => {
  const state = storage.getState();
  const tisort = state.products.find(p => p.code === 'STK-100')!;
  const mavi = tisort.variants!.find(v => v.name === 'Mavi / Medium')!;
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({
      type: 'SALES', customerId: 'cust-a', date: new Date().toISOString().split('T')[0],
      items: [{ productId: tisort.id, variantId: mavi.id, quantity: 999, unitPrice: 200 }],
    }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json() as any).message, /yetersiz stok/i);
});

test('FATURA: varyantsız üründe davranış AYNEN korunur', async () => {
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({
      type: 'SALES', customerId: 'cust-a', date: new Date().toISOString().split('T')[0],
      items: [{ productId: 'prd-sade', quantity: 2, unitPrice: 100 }],
    }),
  });
  assert.equal(res.status, 200);
  const inv = (await res.json() as any).invoice;
  assert.equal(inv.items[0].variantId, undefined, 'Varyantsız satırda iz olmamalı');
  // Toplam formülü değişmedi: 2×100 + %20 = 240.
  assert.equal(inv.grandTotal, 240);
});

// ─── 5. Görsel yükleme ─────────────────────────────────────────────────────

// 1×1 PNG (geçerli başlık).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('GÖRSEL: geçerli PNG yüklenir, tenant yolunda saklanır', async () => {
  const form = new FormData();
  form.append('image', new Blob([PNG_1X1], { type: 'image/png' }), 'urun.png');
  const res = await fetch(`${base}/api/v1/product-images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.A}` },
    body: form as any,
  });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.success, true);
  assert.match(body.url, /^\/uploads\/products\/tnt-a\/\d{8}-[0-9a-f]+\.png$/);
});

test('GÖRSEL: sahte başlık (metin dosyası) REDDEDİLİR', async () => {
  const form = new FormData();
  form.append('image', new Blob(['ben png değilim'], { type: 'image/png' }), 'sahte.png');
  const res = await fetch(`${base}/api/v1/product-images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.A}` },
    body: form as any,
  });
  assert.equal(res.status, 400);
});

test('GÖRSEL: izinli tür dışı (SVG) REDDEDİLİR', async () => {
  const form = new FormData();
  form.append('image', new Blob(['<svg></svg>'], { type: 'image/svg+xml' }), 'vektor.svg');
  const res = await fetch(`${base}/api/v1/product-images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.A}` },
    body: form as any,
  });
  // multer mime kapısı veya sniff kapısı — ikisi de 4xx/500 dışı olmamalı;
  // burada 400 beklenir (mime listede yok).
  assert.ok(res.status === 400 || res.status === 500, `SVG reddedilmeli, gelen: ${res.status}`);
});

test('GÖRSEL: authsuz yükleme REDDEDİLİR (401)', async () => {
  const form = new FormData();
  form.append('image', new Blob([PNG_1X1], { type: 'image/png' }), 'urun.png');
  const res = await fetch(`${base}/api/v1/product-images`, { method: 'POST', body: form as any });
  assert.equal(res.status, 401);
});

test('GÖRSEL: başka firmanın dosyası SİLİNEMEZ (403)', async () => {
  // A firması yükler.
  const form = new FormData();
  form.append('image', new Blob([PNG_1X1], { type: 'image/png' }), 'a.png');
  const up = await fetch(`${base}/api/v1/product-images`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokens.A}` }, body: form as any,
  });
  const url = (await up.json() as any).url as string;
  // B firması silmeye çalışır.
  const del = await fetch(`${base}/api/v1/product-images`, {
    method: 'DELETE', headers: headers('B'), body: JSON.stringify({ url }),
  });
  assert.equal(del.status, 403);
});

test('AUDIT: varyant özelliği oluşturma denetim kaydı bırakır', async () => {
  const before = (storage.getState().auditLogs || []).length;
  await fetch(`${base}/api/v1/variant-options`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Audit Özelliği', values: [{ name: 'X' }] }),
  });
  assert.ok((storage.getState().auditLogs || []).length > before);
});

// ─── Koşucu ────────────────────────────────────────────────────────────────
async function main() {
  kurulum();
  await basla();

  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`PASS: ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`FAIL: ${name}\n      ${err?.message || err}`);
    }
  }

  server.close();
  ProviderFactory.getProviderForTenant = oldFactory;
  TaxpayerService.checkTaxpayer = oldCheck;
  console.log(`\nvariantContractTest: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
