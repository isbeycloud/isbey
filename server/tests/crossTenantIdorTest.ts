/**
 * İŞBEY CLOUD — ÇAPRAZ-TENANT IDOR TARAMASI (2026-10-19)
 * ======================================================
 * ÖLÇÜLEN RİSK: Depo kapısı (P0) kapatıldıktan sonra geriye "başka firmanın
 * KAYDINI kimliğiyle okuyup/yazabilme" sınıfı kaldı. Bu dosya, B firmasının
 * gerçek kayıtlarını kurar ve A firmasının kimliğiyle her `/:id` ucunu dener.
 *
 * KURAL: yabancı kayıt için 404/403 dışındaki HER yanıt İHLALDİR — özellikle
 * 200 (veri sızdı) ve 201/500 (yazma denendi). 400 de kabul edilmez: 400
 * "gövde hatalı" demektir, "yetkin yok" değil; IDOR'da 400 sızıntı sayılır.
 *
 * Ağa ÇIKMAZ. Canlı veritabanına DOKUNMAZ (geçici dizinde çalışır).
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
  fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-idor-')),
  'crossTenantIdorTest.json'
);

const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');

const A = 'tnt-idor-a';
const B = 'tnt-idor-b';
const now = new Date().toISOString();

let checks = 0;
const ihlaller: string[] = [];

storage.update(db => {
  db.tenants = [
    { ...db.tenants[0], id: A, name: 'IDOR Firmasi A', status: 'ACTIVE', taxNumber: '9111111111' },
    { ...db.tenants[0], id: B, name: 'IDOR Firmasi B', status: 'ACTIVE', taxNumber: '9222222222' },
  ] as any;
  // TEK kullanıcı, SUPER_ADMIN, her iki firmaya yetkili: böylece "yetki yok"
  // bahanesi elenir; ölçülen şey %100 TENANT filtrelemesidir.
  db.users = [{
    id: 'u-idor', username: 'idor', fullName: 'IDOR', email: 'idor@x.test', role: 'SUPER_ADMIN',
    active: true, companyId: A, allowedCompanyIds: [A, B],
    passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now,
  }] as any;

  db.warehouses = [
    { id: 'w-a', tenantId: A, name: 'A Depo', code: 'A-1', isDefault: true, active: true, createdAt: now },
    { id: 'w-b', tenantId: B, name: 'B Depo', code: 'B-1', isDefault: true, active: true, createdAt: now },
  ] as any;

  db.customers = [
    { id: 'c-a', tenantId: A, code: 'CA', title: 'Musteri A', type: 'ALICI', balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now },
    { id: 'c-b', tenantId: B, code: 'CB', title: 'Musteri B GIZLI', type: 'ALICI', balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now },
  ] as any;

  db.products = [
    { id: 'p-a', tenantId: A, code: 'PA', name: 'Urun A', unit: 'Adet', vatRate: 20, salePrice: 100, purchasePrice: 50, currentStock: 10, warehouseId: 'w-a', groupId: '', criticalStock: 0, active: true, createdAt: now, updatedAt: now },
    { id: 'p-b', tenantId: B, code: 'PB', name: 'Urun B GIZLI', unit: 'Adet', vatRate: 20, salePrice: 200, purchasePrice: 90, currentStock: 7, warehouseId: 'w-b', groupId: '', criticalStock: 0, active: true, createdAt: now, updatedAt: now },
  ] as any;

  db.cashRegisters = [
    { id: 'cash-a', tenantId: A, name: 'A Kasa', code: 'K-A', balance: 1000, currency: 'TRY', active: true, createdAt: now },
    { id: 'cash-b', tenantId: B, name: 'B Kasa GIZLI', code: 'K-B', balance: 5000, currency: 'TRY', active: true, createdAt: now },
  ] as any;

  db.bankAccounts = [
    { id: 'bnk-a', tenantId: A, name: 'A Banka', iban: 'TR000000000000000000000001', balance: 0, currency: 'TRY', active: true, createdAt: now },
    { id: 'bnk-b', tenantId: B, name: 'B Banka GIZLI', iban: 'TR000000000000000000000002', balance: 0, currency: 'TRY', active: true, createdAt: now },
  ] as any;

  db.stockMovements = [] as any;
  db.invoices = [
    { id: 'inv-a', tenantId: A, invoiceNo: 'A-1', type: 'SALES', customerId: 'c-a', customerTitle: 'Musteri A', warehouseId: 'w-a', items: [], subtotal: 0, vatTotal: 0, total: 0, status: 'DRAFT', eInvoiceStatus: 'DRAFT', createdAt: now, updatedAt: now },
    { id: 'inv-b', tenantId: B, invoiceNo: 'B-GIZLI', type: 'SALES', customerId: 'c-b', customerTitle: 'Musteri B GIZLI', warehouseId: 'w-b', items: [], subtotal: 0, vatTotal: 0, total: 999, status: 'DRAFT', eInvoiceStatus: 'DRAFT', createdAt: now, updatedAt: now },
  ] as any;
});

// NOT: `invoices.ts` ADLI dışa aktarım kullanır; `waybills.ts`/`quotes.ts` default.
const { invoicesRouter } = await import('../routes/invoices');
const { default: waybillsRouter } = await import('../routes/waybills');
const { default: quotesRouter } = await import('../routes/quotes');
const { productsRouter } = await import('../routes/products');
const { v1CustomersRouter } = await import('../routes/v1/customers');
const { v1ProductsRouter } = await import('../routes/v1/products');
const { v1InvoicesRouter } = await import('../routes/v1/invoices');
const { v1CashRouter } = await import('../routes/v1/cash');
const { v1BanksRouter } = await import('../routes/v1/banks');
const { v1EDocumentsRouter } = await import('../routes/v1/e-documents');
const { v1WaybillsRouter } = await import('../routes/v1/waybills');
const { paymentsRouter: v1PaymentsRouter } = await import('../routes/v1/payments');

const app = express();
app.use(express.json());
app.use('/api/invoices', invoicesRouter);
app.use('/api/waybills', waybillsRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/products', productsRouter);
app.use('/api/v1/customers', v1CustomersRouter);
app.use('/api/v1/products', v1ProductsRouter);
app.use('/api/v1/invoices', v1InvoicesRouter);
app.use('/api/v1/cash', v1CashRouter);
app.use('/api/v1/banks', v1BanksRouter);
app.use('/api/v1/e-documents', v1EDocumentsRouter);
app.use('/api/v1/waybills', v1WaybillsRouter);
app.use('/api/v1/payments', v1PaymentsRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err?.statusCode || 500).json({ success: false, message: err?.message });
});

const server = app.listen(0);
await new Promise<void>(r => server.once('listening', () => r()));
const port = (server.address() as any).port;
const tokenA = generateToken({ ...storage.getState().users[0], tenantId: A } as any, A);
const tokenB = generateToken({ ...storage.getState().users[0], tenantId: B } as any, B);

async function call(url: string, method: string, token: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* HTML/gövdesiz yanıt */ }
  return { status: res.status, body: parsed, text };
}

/** Yabancı kayda erişim: 403 veya 404 BEKLENİR. Başka her şey ihlaldir. */
function expectDenied(label: string, r: { status: number; body: any; text: string }) {
  checks++;
  if (r.status === 403 || r.status === 404) return;
  ihlaller.push(`${label} -> HTTP ${r.status} (403/404 beklenirdi)`);
}

/** Aynı uç kendi kaydında ÇALIŞMALI — yoksa "her şeyi reddet" yanlış güvenliğidir. */
function expectAllowed(label: string, r: { status: number }) {
  checks++;
  if (r.status >= 200 && r.status < 300) return;
  ihlaller.push(`${label} -> HTTP ${r.status} (2xx beklenirdi: asiri kilit)`);
}

try {
  // ── 1. OKUMA (GET /:id) ────────────────────────────────────────────────
  expectDenied('GET /api/invoices/:id (B faturasi)',
    await call('/api/invoices/inv-b', 'GET', tokenA));
  expectDenied('GET /api/v1/invoices/:id (B faturasi)',
    await call('/api/v1/invoices/inv-b', 'GET', tokenA));
  expectDenied('GET /api/products/:id (B urunu)',
    await call('/api/products/p-b', 'GET', tokenA));
  expectDenied('GET /api/v1/products/:id (B urunu)',
    await call('/api/v1/products/p-b', 'GET', tokenA));
  expectDenied('GET /api/v1/customers/:id (B cari)',
    await call('/api/v1/customers/c-b', 'GET', tokenA));
  expectDenied('GET /api/v1/customers/:id/statement (B cari ekstre)',
    await call('/api/v1/customers/c-b/statement', 'GET', tokenA));
  expectDenied('GET /api/v1/cash/:id/transactions (B kasa)',
    await call('/api/v1/cash/cash-b/transactions', 'GET', tokenA));
  expectDenied('GET /api/v1/banks/:id/transactions (B banka)',
    await call('/api/v1/banks/bnk-b/transactions', 'GET', tokenA));

  // ── 2. GÖVDE SIZINTISI: liste uçları yabancı kimlik DÖNDÜRMEMELİ ──────
  for (const [label, url] of [
    ['GET /api/products', '/api/products'],
    ['GET /api/v1/products', '/api/v1/products'],
    ['GET /api/invoices', '/api/invoices'],
    ['GET /api/v1/invoices', '/api/v1/invoices'],
    ['GET /api/v1/customers', '/api/v1/customers'],
  ] as const) {
    checks++;
    const r = await call(url, 'GET', tokenA);
    if (r.status !== 200) { ihlaller.push(`${label} -> HTTP ${r.status} (200 beklenirdi)`); continue; }
    const raw = JSON.stringify(r.body);
    for (const sizinti of ['GIZLI', 'inv-b', 'p-b', 'c-b']) {
      if (raw.includes(sizinti)) ihlaller.push(`${label} LISTE SIZINTISI: "${sizinti}" gorunuyor`);
    }
  }

  // ── 3. YAZMA (PUT/DELETE) — yabancı kayıt DEĞİŞMEMELİ ──────────────────
  const before = storage.getState();
  const bInvoiceTotal = before.invoices.find((i: any) => i.id === 'inv-b')!.total;
  const bProductStock = before.products.find((p: any) => p.id === 'p-b')!.currentStock;
  const bCashBalance = (before.cashRegisters as any[]).find(c => c.id === 'cash-b')!.balance;

  expectDenied('PUT /api/invoices/:id (B faturasi)',
    await call('/api/invoices/inv-b', 'PUT', tokenA, { customerTitle: 'ELE GECIRILDI', total: 1 }));
  expectDenied('DELETE /api/invoices/:id (B faturasi)',
    await call('/api/invoices/inv-b', 'DELETE', tokenA));
  expectDenied('DELETE /api/products/:id (B urunu)',
    await call('/api/products/p-b', 'DELETE', tokenA));

  const after = storage.getState();
  checks++;
  if (after.invoices.find((i: any) => i.id === 'inv-b')!.total !== bInvoiceTotal) {
    ihlaller.push('YAZMA: B faturasinin toplami DEGISTI');
  }
  checks++;
  if (after.products.find((p: any) => p.id === 'p-b')!.currentStock !== bProductStock) {
    ihlaller.push('YAZMA: B urununun stogu DEGISTI');
  }
  checks++;
  if (after.invoices.some((i: any) => i.id === 'inv-b' && i.customerTitle === 'ELE GECIRILDI')) {
    ihlaller.push('YAZMA: B faturasinin basligi ELE GECIRILDI');
  }
  checks++;
  if (!after.invoices.some((i: any) => i.id === 'inv-b')) {
    ihlaller.push('YAZMA: B faturasi SILINDI');
  }
  checks++;
  if (!after.products.some((p: any) => p.id === 'p-b')) {
    ihlaller.push('YAZMA: B urunu SILINDI');
  }

  // ── 4. KASA/BANKA YAZMA: yabancı kasadan tahsilat ──────────────────────
  expectDenied('POST /api/v1/cash/:id/transactions (B kasasina yazma)',
    await call('/api/v1/cash/cash-b/transactions', 'POST', tokenA,
      { type: 'IN', amount: 1, description: 'IDOR' }));
  checks++;
  if ((storage.getState().cashRegisters as any[]).find(c => c.id === 'cash-b')!.balance !== bCashBalance) {
    ihlaller.push('YAZMA: B kasasinin bakiyesi DEGISTI');
  }

  // ── 5. POZİTİF KONTROL: kendi kaydı erişilebilir olmalı ────────────────
  // Aksi hâlde "hepsini reddet" yanlış güvenliği IDOR testini anlamsız kılar.
  expectAllowed('GET /api/invoices/inv-a (KENDI faturasi)', await call('/api/invoices/inv-a', 'GET', tokenA));
  expectAllowed('GET /api/products/p-a (KENDI urunu)', await call('/api/products/p-a', 'GET', tokenA));
  expectAllowed('GET /api/v1/customers/c-a (KENDI cari)', await call('/api/v1/customers/c-a', 'GET', tokenA));
  // B kimliğiyle B kaydı da açılmalı (test yanlış firmayı kilitlemesin).
  expectAllowed('GET /api/invoices/inv-b (B KENDI faturasi)', await call('/api/invoices/inv-b', 'GET', tokenB));
  expectAllowed('GET /api/products/p-b (B KENDI urunu)', await call('/api/products/p-b', 'GET', tokenB));

  assert.equal(
    ihlaller.length, 0,
    `CAPRAZ-TENANT IDOR IHLALLERI (${ihlaller.length}):\n  - ` + ihlaller.join('\n  - ')
  );
  console.log(
    `cross-tenant-idor: PASS (${checks} kontrol; okuma+yazma+liste sizintisi; ` +
    `yabanci kayit 403/404, kendi kaydi 2xx)`
  );
} finally {
  server.close();
}
