/**
 * İŞBEY CLOUD — Rapor Tenant İzolasyon Sözleşmesi (2026-10-15)
 * ============================================================
 * Legacy `/api/reports/*` uçları tenant filtresizdi: HER firma TÜM firmaların
 * fatura/ürün/cari/kasa/banka verisini görüyordu (Tenant A <-> B sızıntısı).
 * Bu test 7 ucu da iki tenant'lı veride ölçer; firma B firma A'nın
 * kayıtlarını ASLA göremez.
 *
 * Kural: `tenantId` alanı DOLU kayıtlar yalnız kendi tenant'ına görünür.
 * `tenantId` alanı BOŞ kayıtlar yalnız varsayılan `tnt-isbey` tenant'ına
 * görünür (eski veri ana firmada kalır, yeni firmalara sızmaz).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-reports-')), 'test.json');

const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { reportsRouter } = await import('../routes/reports');

// ── İki tenant'lı veri: A'da kayıt var, B bomboş ──
const TENANT_A = 'tnt-test-a';
const TENANT_B = 'tnt-test-b';
storage.update(db => {
  db.tenants = [
    { ...db.tenants[0], id: TENANT_A, name: 'Firma A', status: 'ACTIVE' },
    { ...db.tenants[0], id: TENANT_B, name: 'Firma B', status: 'ACTIVE' },
  ];
  const now = new Date().toISOString();
  db.users = [{
    id: 'u1', username: 'sahip', fullName: 'Sahip', email: 's@x.test',
    role: 'SUPER_ADMIN', active: true, companyId: TENANT_A,
    allowedCompanyIds: [TENANT_A, TENANT_B],
    passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now,
  }];
  db.customers = [{
    id: 'c-a', tenantId: TENANT_A, code: 'CAR-A', title: 'Musteri A', type: 'ALICI' as any,
    balance: 100, totalDebit: 100, totalCredit: 0, active: true,
    createdAt: now, updatedAt: now,
  }];
  db.products = [{
    id: 'p-a', tenantId: TENANT_A, code: 'P-A', name: 'Urun A', groupName: 'G',
    unit: 'ADET', barcode: '1', purchasePrice: 60, salePrice: 100,
    vatRate: 20, currentStock: 5, criticalStock: 1, active: true,
    createdAt: now, updatedAt: now,
  } as any];
  db.invoices = [{
    id: 'i-a', tenantId: TENANT_A, invoiceNo: 'SAT-A1', type: 'SALES', status: 'APPROVED',
    customerId: 'c-a', customerCode: 'CAR-A', customerTitle: 'Musteri A',
    date: '2026-10-01', maturityDate: '2026-10-01',
    subTotal: 100, totalDiscount: 0, totalVat: 20, grandTotal: 120, paidAmount: 0,
    paymentStatus: 'UNPAID', warehouseId: 'wh-1', items: [{
      productId: 'p-a', productCode: 'P-A', productName: 'Urun A', quantity: 1,
      unit: 'ADET', unitPrice: 100, lineTotal: 100, vatRate: 20, vatAmount: 20,
    }] as any,
    createdAt: now,
  } as any];
  db.cashRegisters = [{ id: 'k-a', tenantId: TENANT_A, name: 'Kasa A', balance: 500, active: true, createdAt: now } as any];
  db.bankAccounts = [{ id: 'b-a', tenantId: TENANT_A, name: 'Banka A', balance: 700, active: true, createdAt: now } as any];
  db.cashTransactions = [{ id: 'ct-a', tenantId: TENANT_A, type: 'INCOME', direction: 'IN', amount: 500, date: '2026-10-01', cashRegisterId: 'k-a', createdAt: now } as any];
  db.bankTransactions = [{ id: 'bt-a', tenantId: TENANT_A, type: 'HAVALE_EFT_IN', direction: 'IN', amount: 700, date: '2026-10-01', bankAccountId: 'b-a', createdAt: now } as any];
  db.expenses = [{ id: 'e-a', tenantId: TENANT_A, totalAmount: 50, vatRate: 20, vatAmount: 10, amount: 40, date: '2026-10-01', expenseCategoryName: 'K', createdAt: now } as any];
});

const tokenA = generateToken(storage.getState().users.find(u => u.id === 'u1')!, TENANT_A);
const tokenB = generateToken(storage.getState().users.find(u => u.id === 'u1')!, TENANT_B);

const app = express();
app.use(express.json());
app.use('/api/reports', reportsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;

let checks = 0;
async function get(url: string, bearer: string) {
  const r = await fetch(base + url, { headers: { Authorization: `Bearer ${bearer}` } });
  const j: any = await r.json();
  assert.equal(r.status, 200, `GET ${url}: ${JSON.stringify(j).slice(0, 200)}`);
  checks++;
  return j;
}

try {
  // profit-loss: A kendi verisini görür, B sıfır görür
  const plA = await get('/api/reports/profit-loss', tokenA);
  assert.equal(plA.success, true);
  assert.equal(plA.data.totalSalesRevenue, 100, 'A satis hasılatı');
  const plB = await get('/api/reports/profit-loss', tokenB);
  assert.equal(plB.success, true);
  assert.equal(plB.data.totalSalesRevenue, 0, 'B baska firmanin satisını GOREMEZ');
  assert.deepEqual(plB.data.productBreakdown, [], 'B urun kırılımı bos');

  // aging: B'de cari yok
  const agB = await get('/api/reports/aging', tokenB);
  assert.deepEqual(agB.report, [], 'B cari yaslandırma bos');

  // stock-valuation: B'de stok yok
  const svB = await get('/api/reports/stock-valuation', tokenB);
  assert.deepEqual(svB.report, [], 'B stok degerleme bos');
  assert.equal(svB.totals.totalCostValue, 0);

  // cash-flow: B'de kasa/banka/satis/gider sıfır
  const cfB = await get('/api/reports/cash-flow', tokenB);
  assert.equal(cfB.summary.totalCash, 0, 'B baska firmanin kasasini GOREMEZ');
  assert.equal(cfB.summary.totalBank, 0, 'B baska firmanin bankasini GOREMEZ');
  assert.ok(cfB.months.every((m: any) => m.sales === 0 && m.expenses === 0), 'B aylik satis/gider sifir');

  // vat-report: B'de satır yok
  const vatB = await get('/api/reports/vat-report', tokenB);
  assert.deepEqual(vatB.rows, [], 'B KDV satiri bos');

  // expense-report: B'de gider yok
  const exB = await get('/api/reports/expense-report', tokenB);
  assert.deepEqual(exB.rows, [], 'B gider satiri bos');
  assert.equal(exB.totals.totalAmount, 0);

  // collection-report: B'de tahsilat/vade yok
  const colB = await get('/api/reports/collection-report', tokenB);
  assert.equal(colB.data.totalCollections, 0, 'B tahsilat sifir');
  assert.equal(colB.data.overdueInvoiceCount, 0, 'B vadesiz fatura sifir');

  console.log(`reports-tenant-isolation: PASS (${checks} HTTP cagrisi, 7 uc izole)`);
} finally {
  server.close();
}
