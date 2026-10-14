/**
 * İŞBEY CLOUD — Fatura Seri Sözleşme Testi (2026-10-12)
 * =====================================================
 * Kapsam: fatura kayıt ekranında SERİ seçimi (A/B Serisi…) ve numaranın
 * o serinin sayacından gelmesi.
 *
 * KORUNAN DEĞİŞMEZLER:
 *  1. Seri SEÇİLMEZSE eski tek sayaç kullanılır (geriye dönük uyum).
 *  2. Yabancı/pasif seri ile fatura KESİLEMEZ (sessizce eski sayaca düşülmez).
 *  3. Sayaç GERİ ALINAMAZ (kullanılmış numara tekrar üretilmez).
 *  4. Tenant izolasyonu: A firması B'nin serisini göremez/kullanamaz.
 *  5. Seri SİLİNMEZ (pasife alınır); aynı ad/ön ek ikinci kez açılmaz.
 *  6. Fatura toplam formülleri DEĞİŞMEZ (yalnız seri izi + numara kaynağı).
 *
 * Çalıştırma: tools/test-local.mjs (izole DATABASE_PATH + NODE_ENV=test).
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'invoiceSeriesContractTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole invoiceSeriesContractTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'series-data');

const { storage } = await import('../db/storage');
const { ProviderFactory } = await import('../services/providers/providerFactory');
const { TaxpayerService } = await import('../services/taxpayerService');
const oldFactory = ProviderFactory.getProviderForTenant;
const oldCheck = TaxpayerService.checkTaxpayer;
ProviderFactory.getProviderForTenant = (() => ({
  provider: { providerId: 'TEST' },
  settings: { tenantId: 'tnt-a', environment: 'TEST' },
})) as typeof oldFactory;
TaxpayerService.checkTaxpayer = (async () => ({
  identifier: '0000000000', isEInvoiceUser: false,
})) as typeof oldCheck;

const { v1InvoiceSeriesRouter } = await import('../routes/v1/invoiceSeries');
const { productsRouter } = await import('../routes/products');
const { customersRouter } = await import('../routes/customers');
const { invoicesRouter } = await import('../routes/invoices');

const TENANT_A = 'tnt-a';
const TENANT_B = 'tnt-b';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
const tokens: Record<string, string> = {};

function signToken(userId: string, tenantId: string): string {
  return jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!, { expiresIn: '5m' });
}
function headers(t: 'A' | 'B'): Record<string, string> {
  return { Authorization: `Bearer ${tokens[t]}`, 'Content-Type': 'application/json' };
}

function kurulum() {
  storage.update(db => {
    db.tenants = [
      { id: TENANT_A, name: 'A Firması', subdomain: 'a' } as any,
      { id: TENANT_B, name: 'B Firması', subdomain: 'b' } as any,
    ];
    const now = new Date().toISOString();
    db.users = [
      { id: 'usr-a', tenantId: TENANT_A, username: 'a-admin', fullName: 'A', email: 'a@x', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: now, updatedAt: now } as any,
      { id: 'usr-b', tenantId: TENANT_B, username: 'b-admin', fullName: 'B', email: 'b@x', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.tenantUsers = [
      { id: 'tu-a', userId: 'usr-a', tenantId: TENANT_A, roleSlug: 'company_admin', status: 'active', isOwner: true, joinedAt: now, createdAt: now, updatedAt: now },
      { id: 'tu-b', userId: 'usr-b', tenantId: TENANT_B, roleSlug: 'company_admin', status: 'active', isOwner: true, joinedAt: now, createdAt: now, updatedAt: now },
    ] as any;
    db.productGroups = [{ id: 'grp-1', tenantId: TENANT_A, name: 'Genel', code: 'G' } as any];
    db.warehouses = [{ id: 'wh-1', tenantId: TENANT_A, name: 'Merkez', code: 'W', isDefault: true } as any];
    db.products = [
      { id: 'prd-1', tenantId: TENANT_A, barcode: '8691', code: 'STK-1', name: 'Ürün', groupId: 'grp-1', unit: 'Adet', purchasePrice: 60, salePrice: 100, vatRate: 20, criticalStock: 5, currentStock: 100, warehouseId: 'wh-1', active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.customers = [
      { id: 'cust-a', tenantId: TENANT_A, code: 'CAR-1', type: 'CUSTOMER', title: 'Müşteri', taxNumber: '0000000000', phone: '0212', riskLimit: 100000, maturityDays: 30, balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.invoiceSeries = [];
    db.invoices = [];
    db.currentTransactions = [];
    // Açılış stoğu HAREKETLE kurulur: `recalculateBalances` stoğu hareketlerden
    // hesaplar; hareket yoksa ilk belgede stok SIFIRLANIR (ölçülen tuzak).
    db.stockMovements = [
      { id: 'sm-acilis', tenantId: TENANT_A, productId: 'prd-1', productCode: 'STK-1', productName: 'Ürün', warehouseId: 'wh-1', documentNo: 'DEV-2026-001', documentType: 'ADJUSTMENT', movementType: 'COUNT_ADJUSTMENT', quantity: 100, direction: 'IN', unitPrice: 60, totalAmount: 6000, date: '2026-01-01', userId: 'usr-a', createdAt: now } as any,
    ];
  });
}

async function basla() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/invoice-series', v1InvoiceSeriesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/invoices', invoicesRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokens.A = signToken('usr-a', TENANT_A);
  tokens.B = signToken('usr-b', TENANT_B);
}

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push({ name, fn }); }

let SERI_A = '';

// ─── 1. Seri CRUD ──────────────────────────────────────────────────────────

test('seri oluşturulur ve ilk seri otomatik VARSAYILAN olur', async () => {
  const res = await fetch(`${base}/api/v1/invoice-series`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'A Serisi', prefix: 'A', invoiceTypes: ['SALES'] }),
  });
  assert.equal(res.status, 200);
  const s = (await res.json() as any).invoiceSeries;
  assert.equal(s.name, 'A Serisi');
  assert.equal(s.prefix, 'A');
  assert.equal(s.lastNumber, 0);
  assert.equal(s.isDefault, true);
  SERI_A = s.id;
});

test('aynı ADDA veya ÖN EKTE ikinci seri REDDEDİLİR', async () => {
  const r1 = await fetch(`${base}/api/v1/invoice-series`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'a serisi', prefix: 'AX' }),
  });
  assert.equal(r1.status, 400);
  const r2 = await fetch(`${base}/api/v1/invoice-series`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Başka Seri', prefix: 'a' }),
  });
  assert.equal(r2.status, 400);
});

test('ön eksiz seri REDDEDİLİR', async () => {
  const res = await fetch(`${base}/api/v1/invoice-series`, {
    method: 'POST', headers: headers('A'),
    body: JSON.stringify({ name: 'Eksiz', prefix: '!!!' }),
  });
  assert.equal(res.status, 400);
});

test('SİLME pasife alır; sayaç GERİ ALINAMAZ', async () => {
  // Sayacı ileri al.
  const upd = await fetch(`${base}/api/v1/invoice-series/${SERI_A}`, {
    method: 'PUT', headers: headers('A'), body: JSON.stringify({ lastNumber: 5 }),
  });
  assert.equal(upd.status, 200);
  assert.equal((await upd.json() as any).invoiceSeries.lastNumber, 5);

  // Geri almayı dene.
  const back = await fetch(`${base}/api/v1/invoice-series/${SERI_A}`, {
    method: 'PUT', headers: headers('A'), body: JSON.stringify({ lastNumber: 2 }),
  });
  assert.equal(back.status, 400);
});

// ─── 2. Fatura kesimi ──────────────────────────────────────────────────────

function faturaGovdesi(extra: Record<string, unknown> = {}) {
  return {
    type: 'SALES', customerId: 'cust-a', date: new Date().toISOString().split('T')[0],
    items: [{ productId: 'prd-1', quantity: 1, unitPrice: 100 }],
    ...extra,
  };
}

test('SERİSİZ fatura eski sayaca düşer (geriye dönük uyum)', async () => {
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify(faturaGovdesi()),
  });
  assert.equal(res.status, 200);
  const inv = (await res.json() as any).invoice;
  assert.match(inv.invoiceNo, /^SAT-\d{4}-\d{6}$/);
  assert.equal(inv.invoiceSeriesId, undefined, 'Serisiz faturada iz olmamalı');
});

test('SERİLİ fatura numarası seriden gelir ve sayaç ilerler', async () => {
  const r1 = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify(faturaGovdesi({ invoiceSeriesId: SERI_A })),
  });
  assert.equal(r1.status, 200);
  const inv1 = (await r1.json() as any).invoice;
  const yr = new Date().getFullYear();
  assert.equal(inv1.invoiceNo, `A-${yr}-000006`, 'Sayaç 5\'ten devam etmeli');
  assert.equal(inv1.invoiceSeriesId, SERI_A);

  const r2 = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify(faturaGovdesi({ invoiceSeriesId: SERI_A })),
  });
  assert.equal((await r2.json() as any).invoice.invoiceNo, `A-${yr}-000007`);
});

test('toplam formülü DEĞİŞMEDİ (1×100 + %20 = 120)', async () => {
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify(faturaGovdesi({ invoiceSeriesId: SERI_A })),
  });
  assert.equal((await res.json() as any).invoice.grandTotal, 120);
});

test('YABANCI seri ile fatura KESİLEMEZ (sessizce eski sayaca düşülmez)', async () => {
  // B firması kendi serisini açar.
  const rb = await fetch(`${base}/api/v1/invoice-series`, {
    method: 'POST', headers: headers('B'), body: JSON.stringify({ name: 'B Serisi', prefix: 'B' }),
  });
  const bSeri = (await rb.json() as any).invoiceSeries.id;

  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify(faturaGovdesi({ invoiceSeriesId: bSeri })),
  });
  assert.equal(res.status, 400, 'Başka firmanın serisi kullanılamamalı');
});

test('PASİF seri ile fatura KESİLEMEZ', async () => {
  await fetch(`${base}/api/v1/invoice-series/${SERI_A}`, { method: 'DELETE', headers: headers('A') });
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify(faturaGovdesi({ invoiceSeriesId: SERI_A })),
  });
  assert.equal(res.status, 400, 'Pasif seri kullanılamamalı');
  // Yeniden etkinleştir.
  await fetch(`${base}/api/v1/invoice-series/${SERI_A}`, {
    method: 'PUT', headers: headers('A'), body: JSON.stringify({ active: true }),
  });
});

// ─── 3. Tenant izolasyonu ──────────────────────────────────────────────────

test('TENANT İZOLASYONU: B firması A serisini GÖREMEZ', async () => {
  const listB = await (await fetch(`${base}/api/v1/invoice-series`, { headers: headers('B') })).json() as any;
  assert.ok(!listB.invoiceSeries.some((s: any) => s.id === SERI_A), 'B, A serisini görmemeli');
});

test('AUDIT: seri oluşturma denetim kaydı bırakır', async () => {
  const before = (storage.getState().auditLogs || []).length;
  await fetch(`${base}/api/v1/invoice-series`, {
    method: 'POST', headers: headers('A'), body: JSON.stringify({ name: 'Audit Serisi', prefix: 'AUD' }),
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
  console.log(`\ninvoiceSeriesContractTest: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
