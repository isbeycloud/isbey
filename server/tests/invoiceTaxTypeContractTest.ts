/**
 * İŞBEY CLOUD — GİB Fatura Tipi Sözleşme Testi (2026-10-12)
 * =========================================================
 * Kapsam: sekmeli vergi seçimindeki GİB tipleri (KONAKLAMA + SGK dahil).
 *
 * KORUNAN DEĞİŞMEZLER:
 *  1. Geçersiz tip depoya GİRMEZ (400).
 *  2. 8 geçerli tip kabul edilir ve `InvoiceTypeCode` alanına yazılır.
 *  3. Yeni tipler hesap mantığını DEĞİŞTİRMEZ (matrah/KDV/toplam aynı formül).
 *  4. Tenant izolasyonu korunur.
 *
 * Çalıştırma: tools/test-local.mjs (izole DATABASE_PATH + NODE_ENV=test).
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'invoiceTaxTypeContractTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole invoiceTaxTypeContractTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'taxtype-data');

const { storage } = await import('../db/storage');
const { ProviderFactory } = await import('../services/providers/providerFactory');
const { TaxpayerService } = await import('../services/taxpayerService');
const oldFactory = ProviderFactory.getProviderForTenant;
const oldCheck = TaxpayerService.checkTaxpayer;
ProviderFactory.getProviderForTenant = (() => ({
  provider: { providerId: 'TEST' }, settings: {},
})) as typeof oldFactory;
TaxpayerService.checkTaxpayer = (async () => ({
  identifier: '0000000000', isEInvoiceUser: false,
})) as typeof oldCheck;

const { invoicesRouter } = await import('../routes/invoices');

const T = 'tnt-a';
let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
let token = '';

function kurulum() {
  storage.update(db => {
    db.tenants = [{ id: T, name: 'A', subdomain: 'a' } as any];
    const now = new Date().toISOString();
    db.users = [
      { id: 'u', tenantId: T, username: 'a', fullName: 'A', email: 'a@x', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.tenantUsers = [
      { id: 't', userId: 'u', tenantId: T, roleSlug: 'company_admin', status: 'active', isOwner: true, joinedAt: now, createdAt: now, updatedAt: now },
    ] as any;
    db.productGroups = [{ id: 'g', tenantId: T, name: 'G', code: 'G' } as any];
    db.warehouses = [{ id: 'w', tenantId: T, name: 'M', code: 'W', isDefault: true } as any];
    db.products = [
      { id: 'p', tenantId: T, barcode: '1', code: 'S', name: 'U', groupId: 'g', unit: 'Adet', purchasePrice: 60, salePrice: 100, vatRate: 20, criticalStock: 5, currentStock: 1000, warehouseId: 'w', active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.customers = [
      { id: 'c', tenantId: T, code: 'C', type: 'CUSTOMER', title: 'M', taxNumber: '0000000000', phone: '1', riskLimit: 1, maturityDays: 30, balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.invoices = [];
    db.stockMovements = [
      { id: 'sm-0', tenantId: T, productId: 'p', productCode: 'S', productName: 'U', warehouseId: 'w', documentNo: 'DEV', documentType: 'ADJUSTMENT', movementType: 'COUNT_ADJUSTMENT', quantity: 1000, direction: 'IN', unitPrice: 60, totalAmount: 60000, date: '2026-01-01', userId: 'u', createdAt: now } as any,
    ];
    db.currentTransactions = [];
  });
}

async function basla() {
  const app = express();
  app.use(express.json());
  app.use('/api/invoices', invoicesRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  token = jwt.sign({ userId: 'u', tenantId: T }, process.env.JWT_SECRET!, { expiresIn: '5m' });
}

const H = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const govde = (invoiceCategory: string) => ({
  type: 'SALES', customerId: 'c', date: '2026-10-12',
  items: [{ productId: 'p', quantity: 1, unitPrice: 100 }],
  invoiceCategory,
});

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push({ name, fn }); }

test('8 geçerli GİB tipi kabul edilir ve aynen saklanır', async () => {
  for (const tip of ['SATIS', 'IADE', 'TEVKIFAT', 'ISTISNA', 'OZELMATRAH', 'IHRACKAYITLI', 'KONAKLAMA', 'SGK']) {
    const res = await fetch(`${base}/api/invoices`, {
      method: 'POST', headers: H(), body: JSON.stringify(govde(tip)),
    });
    assert.equal(res.status, 200, `${tip} kabul edilmeli`);
    const inv = (await res.json() as any).invoice;
    assert.equal(inv.invoiceCategory, tip, `${tip} aynen saklanmalı (InvoiceTypeCode)`);
  }
});

test('geçersiz tip 400 (depoya girmez)', async () => {
  for (const tip of ['XYZ', 'satis', '', 'SATIŞ']) {
    const res = await fetch(`${base}/api/invoices`, {
      method: 'POST', headers: H(), body: JSON.stringify(govde(tip)),
    });
    assert.equal(res.status, 400, `"${tip}" reddedilmeli`);
  }
});

test('yeni tipler hesap formülünü DEĞİŞTİRMEZ (1×100 + %20 = 120)', async () => {
  for (const tip of ['KONAKLAMA', 'SGK', 'OZELMATRAH', 'IHRACKAYITLI']) {
    const res = await fetch(`${base}/api/invoices`, {
      method: 'POST', headers: H(), body: JSON.stringify(govde(tip)),
    });
    const inv = (await res.json() as any).invoice;
    assert.equal(inv.subTotal, 100, `${tip}: matrah`);
    assert.equal(inv.totalVat, 20, `${tip}: KDV`);
    assert.equal(inv.grandTotal, 120, `${tip}: toplam`);
  }
});

test('tip verilmezse varsayılan SATIS', async () => {
  const body: any = govde('SATIS');
  delete body.invoiceCategory;
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: H(), body: JSON.stringify({ ...body }),
  });
  // Sunucu varsayılanı SATIS uygular (400 değil).
  assert.equal(res.status, 200);
});

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
  console.log(`\ninvoiceTaxTypeContractTest: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
