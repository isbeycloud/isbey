/**
 * İŞBEY CLOUD — KAPSAMLI RAPOR FİLTRELERİ + DETAY RAPORLARI (2026-10-17)
 * =====================================================================
 * Ölçülen sözleşme (`/api/v1/reports/detail/*`, `/api/v1/reports/filter-options`):
 *
 *   1. GEÇERSİZ FİLTRE SESSİZ KALMAZ. Bozuk tarih / bozuk tutar / ters aralık
 *      (startDate > endDate) → 400. Neden gerekli: filtre sessizce yorumlanınca
 *      sonuç "kayıt yok" gibi görünüyor ve kullanıcı bunu veri yokluğu sanıyordu
 *      (aynı sınıf hata: `search=undefined` olayı).
 *   2. TENANT İZOLASYONU. B firması A'nın cari/stok/kasa verisini göremez;
 *      filtre parametresi olarak A'nın kimliği VERİLSE BİLE sonuç boş döner
 *      (parametre bir yetki kanıtı değildir).
 *   3. TUTAR TUTARLILIĞI (hesap DEĞİŞMEZ, yalnız okunur ve raporlanır):
 *      - cari: defter satırları toplamı = cari bakiyesi (`balanceMatchesLedger`)
 *      - stok: varyant stokları toplamı = ürün stoğu (`stockMatchesVariants`)
 *      - kasa/banka: açılış + hareket neti = kayıtlı bakiye
 *   4. Filtreler GERÇEKTEN süzer: tarih aralığı, cari, tutar aralığı ve arama
 *      kriterleri kayıt sayısını değiştirir; eşleşmeyen filtre boş döner.
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
  fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-rpt-')),
  'reportFilterDetailTest.json'
);

const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { v1ReportDetailRouter } = await import('../routes/v1/report-detail');

const A = 'tnt-rp-a';
const B = 'tnt-rp-b';
const now = new Date().toISOString();

storage.update(db => {
  db.tenants = [
    { ...db.tenants[0], id: A, name: 'Rapor A', status: 'ACTIVE' },
    { ...db.tenants[0], id: B, name: 'Rapor B', status: 'ACTIVE' },
  ];
  db.users = [{
    id: 'u1', username: 'rp', fullName: 'RP', email: 'rp@x.test', role: 'SUPER_ADMIN',
    active: true, companyId: A, allowedCompanyIds: [A, B],
    passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now,
  }];

  db.customers = [
    { id: 'cus-a1', tenantId: A, code: 'CAR-001', title: 'A Musteri Bir', type: 'ALICI', balance: 300, totalDebit: 500, totalCredit: 200, taxNumber: '1111111111', active: true, createdAt: now, updatedAt: now },
    { id: 'cus-a2', tenantId: A, code: 'CAR-002', title: 'A Musteri Iki', type: 'ALICI', balance: 0, totalDebit: 0, totalCredit: 0, taxNumber: '2222222222', active: true, createdAt: now, updatedAt: now },
    { id: 'cus-b1', tenantId: B, code: 'CAR-001', title: 'B Musteri Bir', type: 'ALICI', balance: 900, totalDebit: 900, totalCredit: 0, taxNumber: '3333333333', active: true, createdAt: now, updatedAt: now },
  ] as any;

  // Defter: cari bakiyesinin KAYNAĞI. cus-a1: 500 borç - 200 alacak = 300.
  db.currentTransactions = [
    { id: 'ctx-a1', tenantId: A, companyId: A, customerId: 'cus-a1', customerCode: 'CAR-001', customerTitle: 'A Musteri Bir', documentNo: 'FTR-001', documentType: 'SALES', date: '2026-09-10', debit: 500, credit: 0, balance: 500, description: 'satis', userId: 'u1', createdAt: now },
    { id: 'ctx-a2', tenantId: A, companyId: A, customerId: 'cus-a1', customerCode: 'CAR-001', customerTitle: 'A Musteri Bir', documentNo: 'TAH-001', documentType: 'COLLECTION', date: '2026-09-20', debit: 0, credit: 200, balance: 300, description: 'tahsilat', userId: 'u1', createdAt: now },
    { id: 'ctx-b1', tenantId: B, companyId: B, customerId: 'cus-b1', customerCode: 'CAR-001', customerTitle: 'B Musteri Bir', documentNo: 'FTR-900', documentType: 'SALES', date: '2026-09-11', debit: 900, credit: 0, balance: 900, description: 'satis', userId: 'u1', createdAt: now },
  ] as any;

  db.products = [
    // Varyantlı ürün: ürün stoğu = varyant stoğu toplamı (2 + 3 = 5)
    {
      id: 'prd-a1', tenantId: A, code: 'URN-001', name: 'A Varyantli Urun', unit: 'ADET', active: true,
      currentStock: 5, criticalStock: 1, purchasePrice: 10, salePrice: 20, warehouseId: 'wh-a', warehouseName: 'A Depo',
      variants: [
        { id: 'var-a1', name: 'Kirmizi', barcode: 'B1', currentStock: 2, purchasePrice: 10, salePrice: 20, attributes: { Renk: 'Kirmizi' } },
        { id: 'var-a2', name: 'Mavi', barcode: 'B2', currentStock: 3, purchasePrice: 10, salePrice: 20, attributes: { Renk: 'Mavi' } },
      ],
    },
    // Varyantsız ürün, kritik seviyede
    { id: 'prd-a2', tenantId: A, code: 'URN-002', name: 'A Kritik Urun', unit: 'ADET', active: true, currentStock: 0, criticalStock: 5, purchasePrice: 7, salePrice: 15, warehouseId: 'wh-a', warehouseName: 'A Depo' },
    { id: 'prd-b1', tenantId: B, code: 'URN-900', name: 'B Urun', unit: 'ADET', active: true, currentStock: 100, criticalStock: 1, purchasePrice: 3, salePrice: 6, warehouseId: 'wh-b', warehouseName: 'B Depo' },
  ] as any;

  db.warehouses = [
    { id: 'wh-a', tenantId: A, name: 'A Depo', code: 'DEP-A', isDefault: true },
    { id: 'wh-b', tenantId: B, name: 'B Depo', code: 'DEP-B', isDefault: true },
  ] as any;

  // Kasa: 1000 açılış − 250 çıkış + 50 giriş = 800 (kayıtlı bakiye ile aynı)
  db.cashRegisters = [
    { id: 'cash-a', tenantId: A, name: 'A Kasasi', code: 'K-A', openingBalance: 1000, balance: 800, currency: 'TRY', active: true, createdAt: now },
    { id: 'cash-b', tenantId: B, name: 'B Kasasi', code: 'K-B', openingBalance: 0, balance: 999, currency: 'TRY', active: true, createdAt: now },
  ] as any;

  db.cashTransactions = [
    { id: 'ct-a1', tenantId: A, cashRegisterId: 'cash-a', cashRegisterName: 'A Kasasi', documentNo: 'K-1', type: 'PAYMENT', direction: 'OUT', amount: 250, date: '2026-09-05', description: 'odeme', createdAt: now },
    { id: 'ct-a2', tenantId: A, cashRegisterId: 'cash-a', cashRegisterName: 'A Kasasi', documentNo: 'K-2', type: 'COLLECTION', direction: 'IN', amount: 50, date: '2026-09-15', description: 'tahsilat', createdAt: now },
    { id: 'ct-b1', tenantId: B, cashRegisterId: 'cash-b', cashRegisterName: 'B Kasasi', type: 'COLLECTION', direction: 'IN', amount: 999, date: '2026-09-06', description: 'B', createdAt: now },
  ] as any;

  db.bankAccounts = [
    { id: 'bnk-a', tenantId: A, bankName: 'A Bank', accountName: 'A TL', openingBalance: 500, balance: 600, currency: 'TRY', active: true, createdAt: now },
    { id: 'bnk-b', tenantId: B, bankName: 'B Bank', accountName: 'B TL', openingBalance: 0, balance: 111, currency: 'TRY', active: true, createdAt: now },
  ] as any;

  db.bankTransactions = [
    { id: 'bt-a1', tenantId: A, bankAccountId: 'bnk-a', bankAccountName: 'A TL', type: 'HAVALE_EFT_IN', direction: 'IN', amount: 100, date: '2026-09-12', description: 'giris', createdAt: now },
    { id: 'bt-b1', tenantId: B, bankAccountId: 'bnk-b', bankAccountName: 'B TL', type: 'HAVALE_EFT_IN', direction: 'IN', amount: 111, date: '2026-09-12', description: 'B', createdAt: now },
  ] as any;

  db.invoices = [
    { id: 'inv-a1', tenantId: A, invoiceNo: 'FTR-001', type: 'SALES', customerId: 'cus-a1', customerName: 'A Musteri Bir', date: '2026-09-10', maturityDate: '2026-09-01', grandTotal: 500, paidAmount: 200, paymentStatus: 'PARTIAL', items: [], subTotal: 500, totalVat: 0, totalDiscount: 0, status: 'APPROVED', createdAt: now },
    { id: 'inv-b1', tenantId: B, invoiceNo: 'FTR-900', type: 'SALES', customerId: 'cus-b1', customerName: 'B Musteri Bir', date: '2026-09-11', maturityDate: '2026-12-01', grandTotal: 900, paidAmount: 0, paymentStatus: 'UNPAID', items: [], subTotal: 900, totalVat: 0, totalDiscount: 0, status: 'APPROVED', createdAt: now },
  ] as any;
});

const user = storage.getState().users.find(u => u.id === 'u1')!;
const tokenA = generateToken(user, A);
const tokenB = generateToken(user, B);

const app = express();
app.use(express.json());
app.use('/api/v1/reports', v1ReportDetailRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;

let checks = 0;
// Uçlar `/api/v1/reports` altina mount edilir; testte yalniz alt yol yazilir.
const API = '/api/v1/reports';
async function get(url: string, bearer: string) {
  const r = await fetch(base + API + url, { headers: { Authorization: `Bearer ${bearer}` } });
  checks++;
  const raw = await r.text();
  if (!raw.startsWith('{')) {
    throw new Error(`${url} JSON DONMEDI (${r.status} ${r.headers.get('content-type')}): ${raw.slice(0, 200)}`);
  }
  return { status: r.status, body: JSON.parse(raw) as any };
}

try {
  // ── 1. GEÇERSİZ FİLTRE → 400 (sessiz boş liste DEĞİL) ──
  for (const [q, why] of [
    ['?startDate=2026-13-99', 'bozuk tarih'],
    ['?endDate=dun', 'tarih bicimi degil'],
    ['?startDate=2026-09-30&endDate=2026-09-01', 'ters aralik'],
    ['?minAmount=abc', 'bozuk tutar'],
    ['?minAmount=100&maxAmount=50', 'ters tutar araligi'],
  ] as const) {
    const r = await get(`/detail/customer${q}`, tokenA);
    assert.equal(r.status, 400, `gecersiz filtre REDDEDILIR (${why})`);
    assert.equal(r.body.success, false);
    assert.ok(typeof r.body.message === 'string' && r.body.message.length > 0, `${why} icin acik mesaj doner`);
  }

  // Geçerli filtre 200
  const ok = await get('/detail/customer?startDate=2026-09-01&endDate=2026-09-30', tokenA);
  assert.equal(ok.status, 200, 'gecerli tarih araligi kabul edilir');

  // ── 2. TENANT İZOLASYONU ──
  const cStokB = await get('/detail/stock', tokenB);
  const bStokIds = cStokB.body.rows.map((r: any) => r.id);
  assert.deepEqual(bStokIds, ['prd-b1'], 'B yalniz kendi urununu gorur');
  assert.ok(!JSON.stringify(cStokB.body).includes('URN-001'), 'B ciktisinda A urun kodu GECMEZ');

  // B, A'nın kimliğini filtre olarak verse bile sonuç BOŞ (parametre yetki değildir)
  const hack = await get('/detail/stock?productIds=prd-a1', tokenB);
  assert.equal(hack.status, 200);
  assert.deepEqual(hack.body.rows, [], 'B, A urun kimligini filtre verse de kayit GOREMEZ');

  const hack2 = await get('/detail/customer?customerIds=cus-a1', tokenB);
  assert.deepEqual(hack2.body.rows, [], 'B, A cari kimligini filtre verse de kayit GOREMEZ');

  const hack3 = await get('/detail/cash-bank?cashRegisterIds=cash-a', tokenB);
  assert.deepEqual(hack3.body.cash.accounts, [], 'B, A kasa kimligiyle kayit GOREMEZ');
  assert.equal(hack3.body.totals.transactionCount, 0, 'B, A kasa hareketini GOREMEZ');

  const optB = await get('/filter-options', tokenB);
  assert.ok(!JSON.stringify(optB.body).includes('A Musteri Bir'), 'filtre secenekleri de sizdirmaz');
  assert.ok(optB.body.customers.some((c: any) => c.id === 'cus-b1'), 'B kendi carisini secenekte gorur');

  // ── 3. TUTAR TUTARLILIĞI ──
  const cariA = await get('/detail/customer', tokenA);
  const a1 = cariA.body.rows.find((r: any) => r.id === 'cus-a1');
  assert.ok(a1, 'A carisi gelir');
  assert.equal(a1.ledger.length, 2, 'defter satirlari gelir');
  assert.equal(a1.ledgerTotal, 300, 'defter toplami 500 - 200 = 300');
  assert.equal(a1.balance, 300, 'cari bakiyesi');
  assert.equal(a1.balanceMatchesLedger, true, 'defter = bakiye (uyusmazlik YOK)');
  assert.equal(a1.overdueTotal, 300, 'vadesi gecen kalan 500 - 200 = 300');

  const stokA = await get('/detail/stock', tokenA);
  const p1 = stokA.body.rows.find((r: any) => r.id === 'prd-a1');
  assert.equal(p1.variants.length, 2, 'varyant kirilimi gelir');
  assert.equal(p1.variantStockSum, 5, 'varyant stoklari toplami 2 + 3 = 5');
  assert.equal(p1.currentStock, 5, 'urun stogu');
  assert.equal(p1.stockMatchesVariants, true, 'varyant toplami = urun stogu');
  assert.equal(p1.costValue, 50, 'maliyet degeri 5 x 10');
  assert.equal(stokA.body.totals.criticalCount, 1, 'kritik urun sayisi 1 (URN-002)');
  assert.equal(p1.isCritical, false, 'URN-001 kritik DEGIL');

  const kbA = await get('/detail/cash-bank', tokenA);
  const ca = kbA.body.cash.accounts.find((r: any) => r.id === 'cash-a');
  assert.equal(ca.openingBalance, 1000);
  assert.equal(ca.inTotal, 50);
  assert.equal(ca.outTotal, 250);
  assert.equal(ca.net, -200);
  assert.equal(ca.expectedBalance, 800, 'acilis + net = 1000 - 200');
  assert.equal(ca.balance, 800);
  assert.equal(ca.balanceMatchesMovements, true, 'hareketler = bakiye');
  const ba = kbA.body.bank.accounts.find((r: any) => r.id === 'bnk-a');
  assert.equal(ba.expectedBalance, 600, '500 + 100');
  assert.equal(ba.balanceMatchesMovements, true);
  assert.equal(kbA.body.totals.mismatchCount, 0, 'uyusmazlik yok');

  // ── 4. FİLTRELER GERÇEKTEN SÜZER ──
  const byDate = await get('/detail/cash-bank?startDate=2026-09-10&endDate=2026-09-30', tokenA);
  assert.equal(byDate.body.transactions.length, 2,
    'Aralik filtresi: 09-15 kasa + 09-12 banka = 2 hareket (09-05 disarida)');
  assert.equal(byDate.body.totals.transactionCount, 2);

  // 250 (kasa cikis) ve 100 (banka giris) → 150 esigi YALNIZ 250yi birakir.
  const byAmount = await get('/detail/cash-bank?minAmount=150', tokenA);
  assert.equal(byAmount.body.totals.transactionCount, 1, 'minAmount=150 → yalniz 250 cikisi');

  // Hesap filtresi KARSI TARAFI da suzer: banka filtresi verilince kasa
  // hareketleri döküme GIRMEZ (onceden giriyordu).
  const byAccount = await get('/detail/cash-bank?bankAccountIds=bnk-a', tokenA);
  assert.equal(byAccount.body.totals.transactionCount, 1, 'banka filtresi → yalniz banka hareketi');
  assert.equal(byAccount.body.cash.transactions, undefined, 'banka filtresinde kasa hareket listesi yok');
  assert.equal(byAccount.body.transactions.every((x: any) => x.kind === 'BANK'), true,
    'banka filtresinde yalniz BANK turu hareketler doner');

  const byAccountCash = await get('/detail/cash-bank?cashRegisterIds=cash-a', tokenA);
  assert.equal(byAccountCash.body.transactions.every((x: any) => x.kind === 'CASH'), true,
    'kasa filtresinde yalniz CASH turu hareketler doner');

  const bySearch = await get('/detail/stock?search=kritik', tokenA);
  assert.deepEqual(bySearch.body.rows.map((r: any) => r.id), ['prd-a2'], 'arama urun adinda calisir');

  const byVariant = await get('/detail/stock?variantIds=var-a1', tokenA);
  assert.deepEqual(byVariant.body.rows.map((r: any) => r.id), ['prd-a1'], 'varyant filtresi urunu bulur');
  assert.deepEqual(byVariant.body.rows[0].variants.map((v: any) => v.id), ['var-a1'],
    'varyant kirilimi de filtrelenir');

  const byCustomer = await get('/detail/customer?customerIds=cus-a2', tokenA);
  assert.deepEqual(byCustomer.body.rows.map((r: any) => r.id), ['cus-a2'], 'cari filtresi');

  const noMatch = await get('/detail/customer?customerIds=yok-boyle-bir-cari', tokenA);
  assert.deepEqual(noMatch.body.rows, [], 'eslesmeyen filtre bos doner');

  // A, B'nin kaydını GÖRMEZ (ters yön de kapalı)
  const cariAAll = await get('/detail/customer', tokenA);
  assert.ok(!cariAAll.body.rows.some((r: any) => r.id === 'cus-b1'), 'A, B carisini GORMEZ');
  assert.ok(!cariAAll.body.rows.some((r: any) => r.id === 'cus-a2' && r.balanceMatchesLedger === false),
    'defteri olmayan cari uyusmazlik olarak isaretlenmez (0 = 0)');

  console.log(`report-filter-detail: PASS (${checks} HTTP cagrisi; gecersiz filtre 400, tenant izolasyonu, defter/varyant/hareket tutarliligi ve filtre suzme dogrulandi)`);
} finally {
  server.close();
}
