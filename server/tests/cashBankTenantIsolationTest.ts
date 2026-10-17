/**
 * İŞBEY CLOUD — KASA/BANKA TENANT İZOLASYONU (2026-10-17)
 * =======================================================
 * ÖLÇÜLEN OLAY (kanıtlanmış sızıntı): `/api/cash`, `/api/banks`,
 * `/api/dashboard/summary` ve `/api/products` (depo) sahiplik kararını kayıt
 * KİMLİĞİ dizesine dayandırıyordu:
 *
 *   c.id.includes(tenantId) || tenantId === 'tnt-isbey' || c.isDefault
 *   !t.cashRegisterId.startsWith('cash-tnt-')
 *
 * Sonuç: B firmasının token'ı ile A firmasının kasa/banka kayıtları ve
 * HAREKETLERİ okunabiliyordu; ayrıca `POST /api/cash/transaction` yabancı
 * kasanın bakiyesini değiştirebiliyordu (yazma IDOR'u).
 *
 * Bu dosya dört şeyi ölçer:
 *   1. Okuma izolasyonu — B, A'nın kayıt/hareketlerini GÖREMEZ.
 *   2. Geriye dönük uyum — `tenantId` alanı boş ESKİ veri varsayılan firmada
 *      kalır; geçiş bootstrap kimlikleri (`cash-<tenant>-default`) kendi
 *      firmasına çözülür → kimse kendi kasasını kaybetmez.
 *   3. Yazma IDOR — yabancı kasaya/hesaba yazma ve virman REDDEDİLİR, bakiye
 *      DEĞİŞMEZ.
 *   4. Üretim yolu — yeni kayıtlar `bootstrapNewTenant` ile AÇIK sahiplikle
 *      (`tenantId` + `companyId`) yazılır; sahiplik artık kimliğe bağlı değil.
 * Ağa ÇIKMAZ.
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
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-cashbank-')),
  'cashBankTenantIsolationTest.json'
);

const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { cashRouter } = await import('../routes/cash');
const { banksRouter } = await import('../routes/banks');
const { dashboardRouter } = await import('../routes/dashboard');

const A = 'tnt-kt-a';
const B = 'tnt-kt-b';
const now = new Date().toISOString();

// ── 4. ÜRETİM YOLU: bootstrap AÇIK sahiplik yazıyor mu? ──
// (Route kurulmadan ÖNCE ölçülür: `bootstrapNewTenant` gerçek üretim yoludur.)
{
  const t = { ...storage.getState().tenants[0], id: 'tnt-boot-probe', name: 'Bootstrap Probe', taxNumber: '9999999999' } as any;
  const u = {
    id: 'u-boot', username: 'boot', fullName: 'Boot', email: 'boot@x.test', role: 'COMPANY_ADMIN',
    active: true, companyId: 'tnt-boot-probe', allowedCompanyIds: ['tnt-boot-probe'],
    passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now,
  } as any;
  storage.bootstrapNewTenant(t, u);
  const bootCash = storage.getState().cashRegisters.find(c => c.id === 'cash-tnt-boot-probe-default');
  assert.ok(bootCash, 'bootstrap kasa uretildi');
  assert.equal(bootCash!.tenantId, 'tnt-boot-probe', 'bootstrap kasa tenantId ACIKCA yazilir');
  assert.equal((bootCash as any).companyId, 'tnt-boot-probe', 'bootstrap kasa companyId ACIKCA yazilir');
  const bootWh = storage.getState().warehouses.find(w => w.id === 'wh-tnt-boot-probe-default');
  assert.equal(bootWh!.tenantId, 'tnt-boot-probe', 'bootstrap depo tenantId ACIKCA yazilir');
}

storage.update(db => {
  db.tenants = [
    { ...db.tenants[0], id: A, name: 'Firma A', status: 'ACTIVE' },
    { ...db.tenants[0], id: B, name: 'Firma B', status: 'ACTIVE' },
  ];
  db.users = [{
    id: 'u1', username: 'kt', fullName: 'KT', email: 'kt@x.test', role: 'SUPER_ADMIN',
    active: true, companyId: A, allowedCompanyIds: [A, B],
    passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now,
  }];

  db.customers = [
    { id: 'c-a', tenantId: A, code: 'CAR-A', title: 'Musteri A', type: 'ALICI', balance: 100, totalDebit: 100, totalCredit: 0, active: true, createdAt: now, updatedAt: now },
    { id: 'c-b', tenantId: B, code: 'CAR-B', title: 'Musteri B', type: 'ALICI', balance: 200, totalDebit: 200, totalCredit: 0, active: true, createdAt: now, updatedAt: now },
  ] as any;

  // cari `balance` alanı TÜREVDİR: her yazmadan sonra `recalculateBalances`
  // bakiyeyi `currentTransactions`'tan yeniden hesaplar (bkz. storage.ts).
  // Defter satırı olmadan yazılan bakiye ilk yazmada 0'a inerdi; fikstür bu
  // yüzden carilerin GERÇEK defterini de kurar.
  db.currentTransactions = [
    { id: 'ctx-a', tenantId: A, companyId: A, customerId: 'c-a', customerCode: 'CAR-A', customerTitle: 'Musteri A', documentNo: 'D-A', documentType: 'SALES', date: '2026-09-01', debit: 100, credit: 0, balance: 100, description: 'A acilis', userId: 'u1', createdAt: now },
    { id: 'ctx-b', tenantId: B, companyId: B, customerId: 'c-b', customerCode: 'CAR-B', customerTitle: 'Musteri B', documentNo: 'D-B', documentType: 'SALES', date: '2026-09-01', debit: 200, credit: 0, balance: 200, description: 'B acilis', userId: 'u1', createdAt: now },
  ] as any;

  db.cashRegisters = [
    // A: açık sahiplikli kasa + A'nın ESKİ bootstrap kasası (tenantId YOK)
    { id: 'cash-a-explicit', tenantId: A, name: 'A Kasası', code: 'K-A', balance: 1000, active: true, createdAt: now },
    { id: `cash-${A}-default`, name: 'A Merkez Kasa', code: 'KSA-01', isDefault: true, balance: 400, active: true, createdAt: now },
    // B: kendi kasası (açık sahiplik) + ESKİ varsayılan firma verisi
    { id: 'cash-b-explicit', tenantId: B, name: 'B Kasası', code: 'K-B', balance: 700, active: true, createdAt: now },
    // tenantId ALANI BOŞ kayıt = geçiş öncesi veri → VARSAYILAN firmaya aittir.
    // (Eski kod bunu `isDefault`/önek yüzünden HERKESE açıyordu.)
    { id: 'cash-1750000000000', name: 'Eski Kasa', code: 'K-ESKI', balance: 555, active: true, createdAt: now },
  ] as any;

  db.bankAccounts = [
    { id: 'bnk-a-explicit', tenantId: A, bankName: 'A Bank', accountName: 'A TL', balance: 2000, active: true, createdAt: now },
    { id: 'bnk-b-explicit', tenantId: B, bankName: 'B Bank', accountName: 'B TL', balance: 900, active: true, createdAt: now },
  ] as any;

  db.cashTransactions = [
    { id: 'ct-a', tenantId: A, type: 'INCOME', direction: 'IN', amount: 1000, date: '2026-10-01', cashRegisterId: 'cash-a-explicit', description: 'A tahsilat', createdAt: now },
    // A'nın geçiş kaydı: tenantId YOK, sahiplik KASA üzerinden çözülür
    { id: 'ct-a-legacy', type: 'INCOME', direction: 'IN', amount: 400, date: '2026-10-02', cashRegisterId: `cash-${A}-default`, description: 'A bootstrap', createdAt: now },
    { id: 'ct-b', tenantId: B, type: 'INCOME', direction: 'IN', amount: 700, date: '2026-10-03', cashRegisterId: 'cash-b-explicit', description: 'B tahsilat', createdAt: now },
    // Eski verinin hareketi: sahiplik ebeveyn (varsayılan firma) üzerinden
    { id: 'ct-legacy', type: 'INCOME', direction: 'IN', amount: 555, date: '2026-10-04', cashRegisterId: 'cash-1750000000000', description: 'Eski veri', createdAt: now },
  ] as any;

  db.bankTransactions = [
    { id: 'bt-a', tenantId: A, type: 'HAVALE_EFT_IN', direction: 'IN', amount: 2000, date: '2026-10-01', bankAccountId: 'bnk-a-explicit', description: 'A havale', createdAt: now },
    { id: 'bt-b', tenantId: B, type: 'HAVALE_EFT_IN', direction: 'IN', amount: 900, date: '2026-10-02', bankAccountId: 'bnk-b-explicit', description: 'B havale', createdAt: now },
  ] as any;
});

const user = storage.getState().users.find(u => u.id === 'u1')!;
const tokenA = generateToken(user, A);
const tokenB = generateToken(user, B);

const app = express();
app.use(express.json());
app.use('/api/cash', cashRouter);
app.use('/api/banks', banksRouter);
app.use('/api/dashboard', dashboardRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;

let checks = 0;
async function call(url: string, method: string, bearer: string, body?: unknown) {
  const r = await fetch(base + url, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  checks++;
  return { status: r.status, body: await r.json() as any };
}

try {
  // ── 1. OKUMA: B, A'nın kasa/banka kayıtlarını GÖREMEZ ──
  const crB = await call('/api/cash', 'GET', tokenB);
  assert.equal(crB.status, 200);
  const crBIds = crB.body.cashRegisters.map((c: any) => c.id);
  assert.ok(!crBIds.includes('cash-a-explicit'), 'B, A acik sahipli kasasini GOREMEZ');
  assert.ok(!crBIds.includes(`cash-${A}-default`), 'B, A bootstrap kasasini GOREMEZ');
  assert.ok(!crBIds.includes('cash-1750000000000'), 'B, varsayilan firmanin eski kasasini GOREMEZ');
  assert.ok(crBIds.includes('cash-b-explicit'), 'B kendi kasasini GORMELI');

  const baB = await call('/api/banks', 'GET', tokenB);
  const baBIds = baB.body.bankAccounts.map((b: any) => b.id);
  assert.ok(!baBIds.includes('bnk-a-explicit'), 'B, A banka hesabini GOREMEZ');
  assert.ok(baBIds.includes('bnk-b-explicit'), 'B kendi hesabini GORMELI');

  // ── 2. OKUMA: hareketler izole ──
  const ctB = await call('/api/cash/transactions', 'GET', tokenB);
  const ctBIds = ctB.body.transactions.map((t: any) => t.id);
  assert.deepEqual(ctBIds, ['ct-b'], 'B yalniz kendi kasa hareketini gorur');

  const btB = await call('/api/banks/transactions', 'GET', tokenB);
  assert.deepEqual(btB.body.transactions.map((t: any) => t.id), ['bt-b'], 'B yalniz kendi banka hareketini gorur');

  // ── 3. GEÇİŞ UYUMU: A kendi kayıtlarını GÖRMEYE DEVAM EDER (kilitlenme yok) ──
  const crA = await call('/api/cash', 'GET', tokenA);
  const crAIds = crA.body.cashRegisters.map((c: any) => c.id);
  assert.ok(crAIds.includes('cash-a-explicit'), 'A acik sahipli kasasini gorur');
  assert.ok(crAIds.includes(`cash-${A}-default`), 'A kendi bootstrap kasasini GORMEYE DEVAM EDER');
  assert.ok(!crAIds.includes('cash-b-explicit'), 'A, B kasasini GOREMEZ');
  assert.ok(!crAIds.includes('cash-1750000000000'), 'A, varsayilan firmanin eski kasasini GOREMEZ');

  const ctA = await call('/api/cash/transactions', 'GET', tokenA);
  const ctAIds = ctA.body.transactions.map((t: any) => t.id);
  assert.ok(ctAIds.includes('ct-a'), 'A kendi hareketini gorur');
  assert.ok(ctAIds.includes('ct-a-legacy'), 'A kendi gecis hareketini GORMEYE DEVAM EDER (ebeveyn kasa)');
  assert.ok(!ctAIds.includes('ct-b'), 'A, B hareketini GOREMEZ');

  // ── 4. YAZMA IDOR: B, A kasasına/hesabına yazamaz ──
  const before = storage.getState().cashRegisters.find(c => c.id === 'cash-a-explicit')!.balance;
  const w1 = await call('/api/cash/transaction', 'POST', tokenB, {
    cashRegisterId: 'cash-a-explicit', type: 'INCOME', amount: 999, description: 'IDOR denemesi',
  });
  assert.equal(w1.status, 400, 'yabanci kasaya yazma REDDEDILIR');
  assert.equal(w1.body.success, false);
  assert.equal(storage.getState().cashRegisters.find(c => c.id === 'cash-a-explicit')!.balance, before,
    'yabanci kasa bakiyesi DEGISMEDI');

  const bBefore = storage.getState().bankAccounts.find(b => b.id === 'bnk-a-explicit')!.balance;
  const w2 = await call('/api/banks/transaction', 'POST', tokenB, {
    bankAccountId: 'bnk-a-explicit', type: 'HAVALE_EFT_IN', amount: 999, description: 'IDOR denemesi',
  });
  assert.equal(w2.status, 400, 'yabanci banka hesabina yazma REDDEDILIR');
  assert.equal(storage.getState().bankAccounts.find(b => b.id === 'bnk-a-explicit')!.balance, bBefore);

  // Virman: B kendi kasasından A'nın bankasına aktaramaz
  const w3 = await call('/api/cash/transfer-to-bank', 'POST', tokenB, {
    cashRegisterId: 'cash-b-explicit', bankAccountId: 'bnk-a-explicit', amount: 100,
  });
  assert.equal(w3.status, 400, 'yabanci banka hesabina virman REDDEDILIR');
  assert.equal(storage.getState().bankAccounts.find(b => b.id === 'bnk-a-explicit')!.balance, bBefore);
  assert.equal(storage.getState().cashRegisters.find(c => c.id === 'cash-b-explicit')!.balance, 700,
    'basarisiz virman kendi kasasini da bozmaz');

  // ── 5. YAZMA: kendi kasasına yazma ÇALIŞIR ve sahiplik alanı DOLAR ──
  const ok = await call('/api/cash/transaction', 'POST', tokenB, {
    cashRegisterId: 'cash-b-explicit', type: 'INCOME', amount: 50, description: 'kendi kasam',
  });
  assert.equal(ok.status, 200, 'kendi kasasina yazma calisir');
  assert.equal(ok.body.transaction.tenantId, B, 'yeni kayit ACIK sahiplikle yazilir (tenantId)');
  assert.equal(ok.body.transaction.companyId, B, 'yeni kayit ACIK sahiplikle yazilir (companyId)');
  assert.equal(storage.getState().cashRegisters.find(c => c.id === 'cash-b-explicit')!.balance, 750);

  // ── 6. DASHBOARD ÖZETİ: tekil alanlar değil, TÜM GÖVDE izole olmalı ──
  // (Özet KPI'ları düzeltilip vadesi geçen cari / kritik stok / aylık trend
  // filtresiz bırakılsaydı sızıntı burada yakalanırdı.)
  const dsB = await call('/api/dashboard/summary', 'GET', tokenB);
  assert.equal(dsB.status, 200);
  // NOT: 5. adımda B kendi kasasına 50 girdi → bakiye 700 + 50 = 750.
  assert.equal(dsB.body.data.kpis.totalCash, 750, 'B ozetinde yalniz kendi kasasi var');
  assert.equal(dsB.body.data.kpis.totalBank, 900, 'B ozetinde yalniz kendi bankasi var');
  assert.equal(dsB.body.data.kpis.totalReceivables, 200, 'B ozetinde yalniz kendi carisi var');
  const dsBText = JSON.stringify(dsB.body);
  assert.ok(!dsBText.includes('Musteri A'), 'B ozetinde A carisi GECMEZ');
  assert.ok(!dsBText.includes('Eski Kasa'), 'B ozetinde varsayilan firmanin eski kasasi GECMEZ');
  const dsBMonths = dsB.body.data.monthlyTrends.map((m: any) => m.tahsilat);
  assert.deepEqual(dsBMonths, [0, 0, 0, 0, 0, 900], 'B aylik trendinde A tahsilati YOK');

  // Aynı ölçüm A için: kendi verisi tam, B'nin verisi yok
  const dsA = await call('/api/dashboard/summary', 'GET', tokenA);
  assert.equal(dsA.body.data.kpis.totalCash, 1400, 'A kendi kasalarini (acik + bootstrap) gorur');
  assert.equal(dsA.body.data.kpis.totalBank, 2000);
  assert.equal(dsA.body.data.kpis.totalReceivables, 100);
  assert.ok(!JSON.stringify(dsA.body).includes('B Kasasi'), 'A ozetinde B kasasi GECMEZ');

  console.log(`cash-bank-tenant-isolation: PASS (${checks} HTTP cagrisi; okuma sizintisi YOK, yazma IDOR REDDEDILDI, dashboard ozeti izole, gecis uyumu + bootstrap damgasi dogrulandi)`);
} finally {
  server.close();
}
