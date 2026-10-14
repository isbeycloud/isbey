/**
 * İŞBEY CLOUD — Fiyat Listesi Sözleşme Testi (2026-10-12)
 * ======================================================
 * Kapsam: isimli satış fiyat listeleri (Perakende/Toptan/Bayi…), ürünün liste
 * bazlı fiyatları ve carinin listeye bağlanması.
 *
 * KORUNAN DEĞİŞMEZLER:
 *  1. `salePrice` GERİYE DÖNÜK UYUMLU: fiyat listesi yoksa davranış AYNEN
 *     eskisi gibi (satır taban fiyattan fiyatlanır). Bu testin en önemli
 *     maddesi budur — mevcut 12+ okuma noktası bozulmamalı.
 *  2. Tenant izolasyonu: A firması B'nin fiyat listesini göremez, güncelleyemez.
 *  3. Liste SİLİNMEZ: yalnız pasife alınır (bağlı cariler korunur).
 *  4. Geçersiz fiyat girdileri diske YAZILMAZ (NaN tutar = bozuk fatura).
 *  5. Satış fiyatı zorunluluğu: taban VEYA en az bir liste fiyatı olmalı.
 *  6. Audit kaydı yazılır.
 *
 * Çalıştırma: tools/test-local.mjs (izole DATABASE_PATH + NODE_ENV=test).
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'priceListContractTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole priceListContractTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
const DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'price-list-data');
process.env.ISBEY_DATA_DIR = DATA_DIR;

const { storage } = await import('../db/storage');
const { v1PriceListsRouter } = await import('../routes/v1/priceLists');
const { productsRouter } = await import('../routes/products');
const { customersRouter } = await import('../routes/customers');

const TENANT_A = 'tnt-a';
const TENANT_B = 'tnt-b';

// ─── Düzenek ───────────────────────────────────────────────────────────────
let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
const tokens: Record<string, string> = {};

function signToken(userId: string, tenantId: string): string {
  return jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!, { expiresIn: '5m' });
}

function headers(tenant: 'A' | 'B'): Record<string, string> {
  return {
    Authorization: `Bearer ${tokens[tenant]}`,
    'Content-Type': 'application/json',
  };
}

function kurulum() {
  storage.update(db => {
    db.tenants = [
      { id: TENANT_A, name: 'A Firması', subdomain: 'a' } as any,
      { id: TENANT_B, name: 'B Firması', subdomain: 'b' } as any,
    ];
    // İki kiracı için birer SUPER_ADMIN benzeri kullanıcı (izin kapıları için).
    db.users = [
      {
        id: 'usr-a', tenantId: TENANT_A, username: 'a-admin', fullName: 'A Admin',
        email: 'a@x.com', phone: '', role: 'ADMIN', permissions: ['*'],
        active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } as any,
      {
        id: 'usr-b', tenantId: TENANT_B, username: 'b-admin', fullName: 'B Admin',
        email: 'b@x.com', phone: '', role: 'ADMIN', permissions: ['*'],
        active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } as any,
    ];
    db.memberships = [
      { id: 'mem-a', userId: 'usr-a', tenantId: TENANT_A, role: 'COMPANY_ADMIN', permissions: ['*'], active: true },
      { id: 'mem-b', userId: 'usr-b', tenantId: TENANT_B, role: 'COMPANY_ADMIN', permissions: ['*'], active: true },
    ] as any;

    // Her kiracıda bir ürün + bir cari.
    const now = new Date().toISOString();
    db.products = [
      {
        id: 'prd-a', tenantId: TENANT_A, barcode: '8690000000001', code: 'STK-001',
        name: 'A Ürünü', groupId: 'grp-1', unit: 'Adet', purchasePrice: 60, salePrice: 100,
        vatRate: 20, criticalStock: 5, currentStock: 0, warehouseId: 'wh-1', active: true,
        createdAt: now, updatedAt: now,
      } as any,
      {
        id: 'prd-b', tenantId: TENANT_B, barcode: '8690000000002', code: 'STK-001',
        name: 'B Ürünü', groupId: 'grp-1', unit: 'Adet', purchasePrice: 60, salePrice: 100,
        vatRate: 20, criticalStock: 5, currentStock: 0, warehouseId: 'wh-1', active: true,
        createdAt: now, updatedAt: now,
      } as any,
    ];
    db.customers = [
      {
        id: 'cust-a', tenantId: TENANT_A, code: 'CAR-001', type: 'CUSTOMER', title: 'A Müşterisi',
        phone: '02120000000', riskLimit: 100000, maturityDays: 30, balance: 0,
        totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now,
      } as any,
    ];
    db.priceLists = [];
  });
}

async function basla() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/price-lists', v1PriceListsRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/customers', customersRouter);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ success: false, message: err.message });
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', () => r()));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  tokens.A = signToken('usr-a', TENANT_A);
  tokens.B = signToken('usr-b', TENANT_B);
}

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push({ name, fn }); }

// ─── 1. Fiyat listesi CRUD ─────────────────────────────────────────────────

test('liste oluşturulur ve ilk liste otomatik VARSAYILAN olur', async () => {
  const res = await fetch(`${base}/api/v1/price-lists`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Perakende', defaultDiscountRate: 0 }),
  });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.success, true);
  assert.equal(body.priceList.name, 'Perakende');
  assert.equal(body.priceList.isDefault, true, 'İlk liste varsayılan olmalı');
  assert.equal(body.priceList.active, true);
  assert.match(body.priceList.code, /^FL-\d{3}$/);
});

test('AYNI ADDA ikinci liste REDDEDİLİR (karışıklık önlenir)', async () => {
  const res = await fetch(`${base}/api/v1/price-lists`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'perakende' }),   // büyük/küçük harf farkı da çakışır
  });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.match(body.message, /zaten var/i);
});

test('boş ad REDDEDİLİR', async () => {
  const res = await fetch(`${base}/api/v1/price-lists`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify({ name: '   ' }),
  });
  assert.equal(res.status, 400);
});

test('yeni varsayılan işaretlenince ÖNCEKİ varsayılan temizlenir (tek varsayılan)', async () => {
  const r1 = await fetch(`${base}/api/v1/price-lists`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Toptan', defaultDiscountRate: 10, isDefault: true }),
  });
  const toptan = (await r1.json() as any).priceList;

  const list = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const defaults = list.priceLists.filter((l: any) => l.isDefault);
  assert.equal(defaults.length, 1, 'Yalnız TEK varsayılan liste olmalı');
  assert.equal(defaults[0].id, toptan.id, 'Varsayılan yeni liste olmalı');
});

test('liste güncellenir (ad/kod/iskonto)', async () => {
  const list = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const toptan = list.priceLists.find((l: any) => l.name === 'Toptan');
  const res = await fetch(`${base}/api/v1/price-lists/${toptan.id}`, {
    method: 'PUT', headers: headers('A'),
    body: JSON.stringify({ name: 'Toptan Satış', defaultDiscountRate: 12 }),
  });
  assert.equal(res.status, 200);
  const updated = (await res.json() as any).priceList;
  assert.equal(updated.name, 'Toptan Satış');
  assert.equal(updated.defaultDiscountRate, 12);
  assert.equal(updated.id, toptan.id, 'id değişmemeli');
});

test('SİLME ucu listeyi PASİFE alır (kayıt SİLİNMEZ — bağlı cariler korunur)', async () => {
  const list = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const perakende = list.priceLists.find((l: any) => l.name === 'Perakende');

  const res = await fetch(`${base}/api/v1/price-lists/${perakende.id}`, {
    method: 'DELETE', headers: headers('A'),
  });
  assert.equal(res.status, 200);

  // Kayıt hâlâ DURUYOR, yalnız aktif değil.
  const after = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const found = after.priceLists.find((l: any) => l.id === perakende.id);
  assert.ok(found, 'Pasife alınan liste SİLİNMEMELİ (bağlı cariler korunur)');
  assert.equal(found.active, false);

  // activeOnly=true listesinde görünmez.
  const activeOnly = await (await fetch(`${base}/api/v1/price-lists?activeOnly=true`, { headers: headers('A') })).json() as any;
  assert.ok(!activeOnly.priceLists.some((l: any) => l.id === perakende.id));
});

// ─── 2. Tenant izolasyonu (IDOR) ───────────────────────────────────────────

test('TENANT İZOLASYONU: B firması A listesini GÖREMEZ', async () => {
  const listB = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('B') })).json() as any;
  assert.equal(listB.priceLists.length, 0, 'B firması A fiyat listesini görmemeli');
});

test('TENANT İZOLASYONU: B firması A listesini GÜNCELLEYEMEZ (404)', async () => {
  const listA = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const target = listA.priceLists[0];

  const res = await fetch(`${base}/api/v1/price-lists/${target.id}`, {
    method: 'PUT', headers: headers('B'), body: JSON.stringify({ name: 'Ele geçirildi' }),
  });
  assert.equal(res.status, 404, 'Başka kiracının listesi güncellenememeli');

  // Gerçekten değişmediğini kanıtla.
  const after = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  assert.notEqual(after.priceLists.find((l: any) => l.id === target.id).name, 'Ele geçirildi');
});

test('TENANT İZOLASYONU: B firması A listesini SİLEMEZ (404)', async () => {
  const listA = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  // AKTİF bir liste seçilmeli: önceki test Perakende'yi pasife aldı, o
  // seçilseydi "hâlâ aktif" iddiası yanlış yere bakardı.
  const target = listA.priceLists.find((l: any) => l.active !== false);
  assert.ok(target, 'Ön koşul: A kiracısında aktif liste olmalı');

  const res = await fetch(`${base}/api/v1/price-lists/${target.id}`, {
    method: 'DELETE', headers: headers('B'),
  });
  assert.equal(res.status, 404);
  const after = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  assert.equal(after.priceLists.find((l: any) => l.id === target.id).active, true, 'A listesi hâlâ aktif olmalı');
});

// ─── 3. Ürün: liste bazlı fiyatlar ─────────────────────────────────────────

test('ÜRÜN: liste fiyatları kaydedilir; TÜM fiyatlar diske doğru yazılır', async () => {
  const listA = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const toptan = listA.priceLists.find((l: any) => l.name === 'Toptan Satış');

  const res = await fetch(`${base}/api/products/prd-a`, {
    method: 'PUT', headers: headers('A'),
    body: JSON.stringify({
      salePrices: [
        { priceListId: toptan.id, salePrice: 85, discountRate: 5 },
        { priceListId: 'pl-yok', salePrice: 99 },
      ],
    }),
  });
  assert.equal(res.status, 200);
  const product = (await res.json() as any).product;
  assert.equal(product.salePrices.length, 2);
  assert.equal(product.salePrices[0].salePrice, 85);
  assert.equal(product.salePrices[0].discountRate, 5);
  // Taban fiyat KORUNUR (liste fiyatı onu ezmez).
  assert.equal(product.salePrice, 100, 'Taban salePrice liste fiyatından etkilenmemeli');
});

test('ÜRÜN: GEÇERSİZ fiyat girdileri diske YAZILMAZ (NaN tutar koruması)', async () => {
  const listA = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const toptan = listA.priceLists.find((l: any) => l.name === 'Toptan Satış');

  const res = await fetch(`${base}/api/products/prd-a`, {
    method: 'PUT', headers: headers('A'),
    body: JSON.stringify({
      salePrices: [
        { priceListId: toptan.id, salePrice: 90 },
        { priceListId: '', salePrice: 50 },            // boş liste → atılır
        { priceListId: 'pl-x', salePrice: 'abc' },     // sayı değil → atılır
        { priceListId: toptan.id, salePrice: 95 },     // aynı liste → SON değer kazanır
      ],
    }),
  });
  assert.equal(res.status, 200);
  const product = (await res.json() as any).product;
  assert.equal(product.salePrices.length, 1, 'Yalnız geçerli girdi kalmalı');
  assert.equal(product.salePrices[0].priceListId, toptan.id);
  assert.equal(product.salePrices[0].salePrice, 95, 'Aynı liste için son değer geçerli');
  assert.ok(product.salePrices.every((e: any) => Number.isFinite(e.salePrice)), 'Hiçbir fiyat NaN olmamalı');
});

test('ÜRÜN: salePrices HİÇ gönderilmezse mevcut fiyatlar KORUNUR (kısmi güncelleme)', async () => {
  const before = storage.getState().products.find(p => p.id === 'prd-a')!;
  const beforeCount = (before.salePrices || []).length;
  assert.ok(beforeCount > 0, 'Ön koşul: üründe liste fiyatı olmalı');

  const res = await fetch(`${base}/api/products/prd-a`, {
    method: 'PUT', headers: headers('A'), body: JSON.stringify({ name: 'A Ürünü (yeni ad)' }),
  });
  assert.equal(res.status, 200);
  const product = (await res.json() as any).product;
  assert.equal(product.name, 'A Ürünü (yeni ad)');
  assert.equal((product.salePrices || []).length, beforeCount, 'salePrices gönderilmediyse korunmalı');
});

test('ÜRÜN: POST — yalnız LİSTE fiyatı verilirse taban fiyat EN DÜŞÜK liste fiyatına çekilir', async () => {
  const listA = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const toptan = listA.priceLists.find((l: any) => l.name === 'Toptan Satış');

  const res = await fetch(`${base}/api/products`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({
      name: 'Yalnız Listeli Ürün', code: 'STK-900', unit: 'Adet', vatRate: 20,
      salePrices: [{ priceListId: toptan.id, salePrice: 70 }],
    }),
  });
  assert.equal(res.status, 200, 'Yalnız liste fiyatlı ürün kabul edilmeli');
  const product = (await res.json() as any).product;
  assert.equal(product.salePrice, 70, 'Taban fiyat en düşük liste fiyatına çekilmeli (0 kalmamalı)');
  assert.equal(product.salePrices.length, 1);
});

test('ÜRÜN: ne taban ne liste fiyatı verilirse REDDEDİLİR (sessiz 0 fiyat olmaz)', async () => {
  const res = await fetch(`${base}/api/products`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Fiyatsız Ürün', code: 'STK-901', unit: 'Adet' }),
  });
  assert.equal(res.status, 400, 'Satış fiyatı olmayan ürün oluşturulmamalı');
});

test('ÜRÜN: salePrice=0 TEK BAŞINA geçerli (bedelsiz/numune ürün)', async () => {
  const res = await fetch(`${base}/api/products`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Numune Ürün', code: 'STK-902', unit: 'Adet', salePrice: 0, vatRate: 20 }),
  });
  assert.equal(res.status, 200, 'salePrice: 0 açıkça verilmişse kabul edilmeli');
  assert.equal((await res.json() as any).product.salePrice, 0);
});

// ─── 4. Cari: fiyat listesi bağlantısı ─────────────────────────────────────

test('CARİ: priceListId kaydedilir ve okunur', async () => {
  const listA = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const toptan = listA.priceLists.find((l: any) => l.name === 'Toptan Satış');

  const res = await fetch(`${base}/api/customers/cust-a`, {
    method: 'PUT', headers: headers('A'), body: JSON.stringify({ priceListId: toptan.id }),
  });
  assert.equal(res.status, 200);

  const read = await (await fetch(`${base}/api/customers/cust-a`, { headers: headers('A') })).json() as any;
  assert.equal(read.customer.priceListId, toptan.id, 'Carinin fiyat listesi kalıcı olmalı');
});

test('CARİ: POST ile priceListId birlikte kaydedilir', async () => {
  const listA = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('A') })).json() as any;
  const toptan = listA.priceLists.find((l: any) => l.name === 'Toptan Satış');

  const res = await fetch(`${base}/api/customers`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ title: 'Listeli Müşteri', phone: '02120000001', priceListId: toptan.id }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json() as any).customer.priceListId, toptan.id);
});

// ─── 5. Geriye dönük uyumluluk (EN KRİTİK) ─────────────────────────────────

test('GERİYE DÖNÜK UYUM: fiyat listesi olmayan üründe salePrice AYNEN korunur', async () => {
  // prd-b'nin hiç liste fiyatı yok; taban fiyatı 100 olmalı.
  const listB = await (await fetch(`${base}/api/v1/price-lists`, { headers: headers('B') })).json() as any;
  assert.equal(listB.priceLists.length, 0, 'Ön koşul: B kiracısında liste yok');

  const state = storage.getState();
  const prdB = state.products.find(p => p.id === 'prd-b')!;
  assert.equal(prdB.salePrice, 100, 'Listesiz üründe taban fiyat AYNEN kalmalı');
  assert.equal(prdB.salePrices, undefined, 'Liste fiyatı yoksa alan hiç oluşmamalı');
});

test('GERİYE DÖNÜK UYUM: priceLists koleksiyonu YOKKEN de okuma çalışır', () => {
  // storage merge bloğu `priceLists: parsed.priceLists || []` ile korur —
  // alan yoksa boş dizi olur, çökme olmaz.
  const state = storage.getState();
  assert.ok(Array.isArray(state.priceLists), 'priceLists her zaman dizi olmalı');
});

test('AUDIT: liste oluşturma denetim kaydı bırakır', async () => {
  const before = (storage.getState().auditLogs || []).length;
  await fetch(`${base}/api/v1/price-lists`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify({ name: 'Proje Özel' }),
  });
  const after = (storage.getState().auditLogs || []).length;
  assert.ok(after > before, 'Fiyat listesi oluşturma audit kaydı yazmalı');
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
  console.log(`\npriceListContractTest: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
