/**
 * İŞBEY CLOUD — Taslak Fatura PDF Sözleşme Testi (2026-10-12)
 * ===========================================================
 * Kapsam: gelen + giden taslaklar için rapor ve yazdırılabilir HTML.
 *
 * KORUNAN DEĞİŞMEZLER:
 *  1. Gönderilmiş fatura (SENT/DELIVERED/ACCEPTED) BURADAN alınamaz (409).
 *  2. İşlenmiş gelen belge (CONVERTED/ACCEPTED/REJECTED) alınamaz (409).
 *  3. Tenant izolasyonu: A firması B'nin taslağını göremez (404).
 *  4. TASLAK bandı HTML'de ZORUNLU (çıktı gerçek fatura sanılamaz).
 *  5. Tutarlar ERP kaydıyla BİREBİR (matrah/KDV/toplam).
 *  6. Authsuz erişim 401.
 *
 * NOT: Sunucuda PDF motoru YOKTUR — çıktı HTML'dir, istemci PDF'e çevirir.
 * Bu test HTML içeriğini + rapor matematiğini ölçer. Ağa ÇIKMAZ.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'draftPdfContractTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole draftPdfContractTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'draft-data');

const { storage } = await import('../db/storage');
const { v1DraftPdfsRouter } = await import('../routes/v1/draftPdfs');

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
      { id: 'usr-a', tenantId: TENANT_A, username: 'a', fullName: 'A', email: 'a@x', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: now, updatedAt: now } as any,
      { id: 'usr-b', tenantId: TENANT_B, username: 'b', fullName: 'B', email: 'b@x', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.tenantUsers = [
      { id: 'tu-a', userId: 'usr-a', tenantId: TENANT_A, roleSlug: 'company_admin', status: 'active', isOwner: true, joinedAt: now, createdAt: now, updatedAt: now },
      { id: 'tu-b', userId: 'usr-b', tenantId: TENANT_B, roleSlug: 'company_admin', status: 'active', isOwner: true, joinedAt: now, createdAt: now, updatedAt: now },
    ] as any;
    db.customers = [
      { id: 'cust-a', tenantId: TENANT_A, code: 'CAR-1', type: 'CUSTOMER', title: 'Müşteri A', phone: '1', riskLimit: 1, maturityDays: 30, balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.invoices = [
      // Giden TASLAK satış faturası.
      { id: 'inv-taslak', tenantId: TENANT_A, invoiceNo: 'SAT-2026-000001', type: 'SALES', status: 'ACTIVE', customerId: 'cust-a', customerCode: 'CAR-1', customerTitle: 'Müşteri A', date: '2026-10-12', maturityDate: '2026-11-11', subTotal: 100, totalDiscount: 0, totalVat: 20, grandTotal: 120, paidAmount: 0, paymentStatus: 'UNPAID', warehouseId: 'wh-1', items: [{ id: 'i1', invoiceId: 'inv-taslak', productId: 'p1', productCode: 'S1', productName: 'Ürün 1', quantity: 1, unit: 'Adet', unitPrice: 100, discount1: 0, discount2: 0, discountAmount: 0, vatRate: 20, vatAmount: 20, vatIncluded: false, lineTotal: 100, lineGrandTotal: 120 }], currency: 'TRY', invoiceProfile: 'TICARIFATURA', eInvoiceStatus: 'DRAFT', userId: 'usr-a', isDeleted: false, createdAt: now, updatedAt: now } as any,
      // GÖNDERİLMİŞ fatura — rapora GİRMEMELİ, HTML'i VERİLMEMELİ.
      { id: 'inv-sent', tenantId: TENANT_A, invoiceNo: 'SAT-2026-000002', type: 'SALES', status: 'ACTIVE', customerId: 'cust-a', customerCode: 'CAR-1', customerTitle: 'Müşteri A', date: '2026-10-12', maturityDate: '2026-11-11', subTotal: 50, totalDiscount: 0, totalVat: 10, grandTotal: 60, paidAmount: 0, paymentStatus: 'UNPAID', warehouseId: 'wh-1', items: [], currency: 'TRY', eInvoiceStatus: 'SENT', eInvoiceUUID: 'uuid-1', userId: 'usr-a', isDeleted: false, createdAt: now, updatedAt: now } as any,
      // B firmasının taslağı.
      { id: 'inv-b', tenantId: TENANT_B, invoiceNo: 'SAT-2026-000009', type: 'SALES', status: 'ACTIVE', customerId: 'x', customerCode: 'X', customerTitle: 'X', date: '2026-10-12', maturityDate: '2026-11-11', subTotal: 10, totalDiscount: 0, totalVat: 2, grandTotal: 12, paidAmount: 0, paymentStatus: 'UNPAID', warehouseId: 'wh-1', items: [], currency: 'TRY', eInvoiceStatus: 'DRAFT', userId: 'usr-b', isDeleted: false, createdAt: now, updatedAt: now } as any,
    ];
    db.incomingInvoices = [
      { id: 'inc-1', tenantId: TENANT_A, uuid: 'u-1', invoiceNo: 'TED-100', supplierTaxNumber: '1111111111', supplierTitle: 'Tedarikçi T', issueDate: '2026-10-10', subTotal: 200, vatAmount: 40, grandTotal: 240, currency: 'TRY', status: 'RECEIVED', items: [{ productName: 'Malzeme', quantity: 2, unitPrice: 100, vatRate: 20 }] } as any,
      // İşlenmiş gelen belge — rapora GİRMEMELİ.
      { id: 'inc-done', tenantId: TENANT_A, uuid: 'u-2', invoiceNo: 'TED-101', supplierTaxNumber: '1111111111', supplierTitle: 'Tedarikçi T', issueDate: '2026-10-10', subTotal: 10, vatAmount: 2, grandTotal: 12, currency: 'TRY', status: 'CONVERTED_TO_PURCHASE', items: [] } as any,
    ];
  });
}

async function basla() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/draft-pdfs', v1DraftPdfsRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokens.A = signToken('usr-a', TENANT_A);
  tokens.B = signToken('usr-b', TENANT_B);
}

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push({ name, fn }); }

// ─── 1. Rapor ──────────────────────────────────────────────────────────────

test('RAPOR: giden taslak + gelen taslak listelenir, gönderilmiş/işlenmiş GİRMEZ', async () => {
  const res = await fetch(`${base}/api/v1/draft-pdfs/report?kind=ALL`, { headers: headers('A') });
  assert.equal(res.status, 200);
  const report = (await res.json() as any).report;
  assert.equal(report.outgoing.length, 1, 'Yalnız taslak satış faturası');
  assert.equal(report.outgoing[0].id, 'inv-taslak');
  assert.equal(report.incoming.length, 1, 'Yalnız işlenmemiş gelen belge');
  assert.equal(report.incoming[0].id, 'inc-1');
  assert.equal(report.totals.outgoingCount, 1);
  assert.equal(report.totals.outgoingTotal, 120);
  assert.equal(report.totals.incomingCount, 1);
  assert.equal(report.totals.incomingTotal, 240);
});

test('RAPOR: kind filtresi çalışır', async () => {
  const out = await (await fetch(`${base}/api/v1/draft-pdfs/report?kind=OUTGOING`, { headers: headers('A') })).json() as any;
  assert.equal(out.report.outgoing.length, 1);
  assert.equal(out.report.incoming.length, 0);
  const inc = await (await fetch(`${base}/api/v1/draft-pdfs/report?kind=INCOMING`, { headers: headers('A') })).json() as any;
  assert.equal(inc.report.outgoing.length, 0);
  assert.equal(inc.report.incoming.length, 1);
});

test('RAPOR: geçersiz kind 400', async () => {
  const res = await fetch(`${base}/api/v1/draft-pdfs/report?kind=X`, { headers: headers('A') });
  assert.equal(res.status, 400);
});

// ─── 2. Giden HTML ─────────────────────────────────────────────────────────

test('GİDEN HTML: taslak içeriği + TASLAK bandı + tutarlar birebir', async () => {
  const res = await fetch(`${base}/api/v1/draft-pdfs/outgoing/inv-taslak/html`, { headers: headers('A') });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  const html = await res.text();
  assert.match(html, /TASLAK — MALİ DEĞERİ YOKTUR/, 'TASLAK bandı zorunlu');
  assert.match(html, /SAT-2026-000001/, 'Belge numarası');
  assert.match(html, /Müşteri A/, 'Alıcı');
  assert.match(html, /Ürün 1/, 'Kalem');
  assert.match(html, /120,00/, 'Genel toplam birebir');
});

test('GİDEN HTML: gönderilmiş fatura 409 (e-belge portalından alınır)', async () => {
  const res = await fetch(`${base}/api/v1/draft-pdfs/outgoing/inv-sent/html`, { headers: headers('A') });
  assert.equal(res.status, 409);
});

test('GİDEN HTML: yabancı firmanın taslağı 404 (IDOR)', async () => {
  const res = await fetch(`${base}/api/v1/draft-pdfs/outgoing/inv-b/html`, { headers: headers('A') });
  assert.equal(res.status, 404);
});

test('GİDEN HTML: olmayan belge 404', async () => {
  const res = await fetch(`${base}/api/v1/draft-pdfs/outgoing/yok/html`, { headers: headers('A') });
  assert.equal(res.status, 404);
});

// ─── 3. Gelen HTML ─────────────────────────────────────────────────────────

test('GELEN HTML: havuz içeriği + TASLAK bandı + tutarlar birebir', async () => {
  const res = await fetch(`${base}/api/v1/draft-pdfs/incoming/inc-1/html`, { headers: headers('A') });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /TASLAK/, 'TASLAK bandı zorunlu');
  assert.match(html, /TED-100/, 'Tedarikçi belge numarası');
  assert.match(html, /Tedarikçi T/, 'Tedarikçi');
  assert.match(html, /240,00/, 'Genel toplam birebir');
});

test('GELEN HTML: işlenmiş belge 409', async () => {
  const res = await fetch(`${base}/api/v1/draft-pdfs/incoming/inc-done/html`, { headers: headers('A') });
  assert.equal(res.status, 409);
});

// ─── 4. Auth ───────────────────────────────────────────────────────────────

test('AUTH: authsuz rapor ve HTML 401', async () => {
  const r1 = await fetch(`${base}/api/v1/draft-pdfs/report`);
  assert.equal(r1.status, 401);
  const r2 = await fetch(`${base}/api/v1/draft-pdfs/outgoing/inv-taslak/html`);
  assert.equal(r2.status, 401);
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
  console.log(`\ndraftPdfContractTest: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
