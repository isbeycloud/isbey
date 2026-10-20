/**
 * İŞBEY CLOUD — SIFIR TUTAR KAPISI SÖZLEŞME TESTİ (2026-10-20)
 * ============================================================
 * Ölçülen olay: canlıda `SAT-2026-000005` (RETAIL_POS) 3 kalem × 0 TL olarak
 * kesildi. Üç adet stok ÇIKIŞI doğdu, alacak doğmadı, "neden" hiçbir yerde
 * yazmıyordu. Aynı sınıfın kaynağı ölçüldü: 13 ürünün `salePrice` alanı 0.
 *
 * KORUNAN DEĞİŞMEZLER:
 *  K1. Sıfır tutarlı SATIŞ (SALES / RETAIL_POS) gerekçesiz YAZILMAZ → 400,
 *      kodu `ZERO_TOTAL_REASON_REQUIRED`.
 *  K2. Gerekçe (≥10 karakter) verilirse yazılır ve GEREKÇE BELGEYE + DENETİM
 *      KAYDINA geçer.
 *  K3. Kısa/kaçamak gerekçe ("0", "yok") kabul EDİLMEZ.
 *  K4. Meşru sıfır tutar ENGELLENMEZ — numune/promosyon işi kırılmaz; yalnız
 *      SESSİZLİK kaldırılır.
 *  K5. ALIŞ (PURCHASE) ve PROFORMA kapsam DIŞIDIR (tedarikçi belgesi / teklif).
 *  K6. Toplamı > 0 olan fatura gerekçesiz de geçer (kapı yalnız sıfırda).
 *  K7. Gerekçe YALNIZ sıfır tutarlı satışta belgeye yazılır (şişme yok).
 *  K8. Kapı düştüğünde HİÇBİR ŞEY yazılmaz: fatura, stok hareketi, cari
 *      hareket, ürün stoğu, sayaç — hepsi DEĞİŞMEZ (yarım kayıt yok).
 *  K9. Ürünün kendi satış fiyatı > 0 iken satıra 0 girilmişse UYARI üretilir
 *      (engellemez, görünür kılar; denetim kaydına geçer).
 *
 * İKİ YAZMA YOLU: legacy `POST /api/invoices` (kendi transaction'ı) ve
 * `POST /api/v1/invoices` (`DocumentConversionService`). Kural tek kaynakta
 * (`services/zeroPriceGate.ts`); bu dosya İKİSİNİ de ölçer — biri düzeltilip
 * diğeri unutulursa test kırmızı olur.
 *
 * Ağa ÇIKMAZ (yalnız localhost; sağlayıcı yerel taklit edilir).
 *
 * Çalıştırma: tools/test-local.mjs (izole DATABASE_PATH + NODE_ENV=test).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'zeroPriceGateContractTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole zeroPriceGateContractTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'zeroprice-data');

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

const {
  evaluateZeroTotalGate,
  assertZeroTotalAllowed,
  ZeroTotalGateError,
  ZERO_TOTAL_REASON_MIN,
} = await import('../services/zeroPriceGate');
const { invoicesRouter } = await import('../routes/invoices');
const { v1InvoicesRouter } = await import('../routes/v1/invoices');

const T = 'tnt-zp';
const GEREKCE = 'Numune amaçlı bedelsiz gönderim — pazarlama';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
let token = '';

function kurulum() {
  storage.update(db => {
    db.tenants = [{ id: T, name: 'ZP', subdomain: 'zp', status: 'ACTIVE' } as any];
    const now = new Date().toISOString();
    db.users = [
      { id: 'u', tenantId: T, username: 'zp', fullName: 'ZP', email: 'zp@x', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.tenantUsers = [
      { id: 'tu', userId: 'u', tenantId: T, roleSlug: 'company_admin', status: 'active', isOwner: true, joinedAt: now, createdAt: now, updatedAt: now },
    ] as any;
    db.productGroups = [{ id: 'g', tenantId: T, name: 'G', code: 'G' } as any];
    db.warehouses = [{ id: 'w', tenantId: T, name: 'Merkez', code: 'W', isDefault: true } as any];
    // İKİ ÜRÜN — ikisi de canlıdaki gerçek durumun parçası:
    //  p : `salePrice` 0 (canlıda 13 ürün böyle). Eski fatura ucunda
    //      `Number(unitPrice) || salePrice` 0'a düşer → satır sessizce 0 TL,
    //      fatura 0 TL kesilir. SAT-2026-000005 tam bu yoldan doğdu.
    //  p2: `salePrice` 100 — "fiyatı var ama satıra 0 girilmiş" uyarısının
    //      ölçüldüğü ürün (v1 yolu unitPrice'ı olduğu gibi kullanır).
    db.products = [
      { id: 'p', tenantId: T, barcode: '1', code: 'URN-1', name: 'Numune Ürün', groupId: 'g', unit: 'Adet', purchasePrice: 0, salePrice: 0, vatRate: 20, criticalStock: 5, currentStock: 1000, warehouseId: 'w', active: true, createdAt: now, updatedAt: now } as any,
      { id: 'p2', tenantId: T, barcode: '2', code: 'URN-2', name: 'Fiyatlı Ürün', groupId: 'g', unit: 'Adet', purchasePrice: 60, salePrice: 100, vatRate: 20, criticalStock: 5, currentStock: 1000, warehouseId: 'w', active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.customers = [
      { id: 'c', tenantId: T, code: 'CAR-1', type: 'CUSTOMER', title: 'Müşteri', taxNumber: '0000000000', phone: '1', riskLimit: 1, maturityDays: 30, balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now } as any,
    ];
    db.invoices = [];
    // Stok, HAREKETTEN hesaplanır (`recalculateBalances`): açılış stoğu da
    // hareket olarak durmalı, yoksa `currentStock` sıfıra düşer ve test
    // "yetersiz stok" ile yanlış yerde patlar.
    db.stockMovements = ['p', 'p2'].map(id => ({
      id: `sm-${id}`, tenantId: T, productId: id, productCode: id, productName: id,
      warehouseId: 'w', warehouseName: 'Merkez', documentNo: 'ACILIS', documentType: 'ADJUSTMENT',
      movementType: 'COUNT_ADJUSTMENT', quantity: 1000, direction: 'IN', unitPrice: 0,
      totalAmount: 0, date: '2026-01-01', userId: 'u', createdAt: now,
    })) as any;
    db.currentTransactions = [];
    db.auditLogs = [];
  });
}

/** DİSKTEKİ gerçek durum — bellekteki kopya kanıt değildir. */
function diskte(): any {
  return JSON.parse(fs.readFileSync(process.env.DATABASE_PATH!, 'utf-8'));
}

/** Kapının düştüğünü kanıtlayacak değişmezler. Her ÜRÜN ayrı ölçülür —
 *  tek ürüne bakmak "yanlış ürünün stoğu değişmedi" diye yanlış PASS verir. */
function muhasebeOzeti() {
  const db = diskte();
  const stok: Record<string, number> = {};
  for (const urun of db.products || []) stok[urun.id] = urun.currentStock;
  const cari = (db.customers || []).find((c: any) => c.id === 'c') || {};
  return {
    fatura: (db.invoices || []).length,
    stokHareketi: (db.stockMovements || []).length,
    cariHareket: (db.currentTransactions || []).length,
    stok,
    cariBakiye: cari.balance,
    sayac: JSON.stringify((db.sequences || {}).SALES_INVOICE ?? null),
  };
}

async function basla() {
  const app = express();
  app.use(express.json());
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/v1/invoices', v1InvoicesRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  token = jwt.sign({ userId: 'u', tenantId: T }, process.env.JWT_SECRET!, { expiresIn: '5m' });
}

const H = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
/** Satır: ürün + adet + (verilirse) birim fiyat. Fiyat VERİLMEZSE legacy uç
 *  ürünün `salePrice`'ına düşer — canlıdaki sessiz 0 TL yolu tam budur. */
const satir = (adet: number, fiyat?: number, urun = 'p') => [
  fiyat === undefined
    ? { productId: urun, quantity: adet }
    : { productId: urun, quantity: adet, unitPrice: fiyat },
];

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push({ name, fn }); }

// ─────────────────────────── SAF FONKSİYON KAPISI ───────────────────────────

test('K1: sıfır tutarlı SALES gerekçesiz DURUR (kod + ne yapmalı mesajı)', () => {
  const r = evaluateZeroTotalGate('SALES', 0, [{ productCode: 'URN-1', productName: 'Numune', quantity: 3, unitPrice: 0 }]);
  assert.equal(r.blocked, true);
  assert.equal(r.code, 'ZERO_TOTAL_REASON_REQUIRED');
  assert.match(r.message!, /GEREKÇE/);
  assert.match(r.message!, /URN-1/, 'mesaj hangi satırın 0 olduğunu söylemeli');
});

test('K1b: sıfır tutarlı RETAIL_POS da DURUR (canlı SAT-2026-000005 yolu)', () => {
  const r = evaluateZeroTotalGate('RETAIL_POS', 0, [{ productCode: 'URN-1', quantity: 3, unitPrice: 0 }]);
  assert.equal(r.blocked, true);
  assert.equal(r.code, 'ZERO_TOTAL_REASON_REQUIRED');
});

test('K2: yeterli gerekçeyle GEÇER', () => {
  const r = evaluateZeroTotalGate('SALES', 0, [{ quantity: 1, unitPrice: 0 }], GEREKCE);
  assert.equal(r.blocked, false);
});

test('K3: kısa/kaçamak gerekçe kabul EDİLMEZ', () => {
  for (const kisa of ['', '   ', '0', 'yok', 'bedava', 'a'.repeat(ZERO_TOTAL_REASON_MIN - 1)]) {
    assert.equal(evaluateZeroTotalGate('SALES', 0, [{ quantity: 1, unitPrice: 0 }], kisa).blocked, true, `"${kisa}" reddedilmeli`);
  }
  assert.equal(evaluateZeroTotalGate('SALES', 0, [{ quantity: 1, unitPrice: 0 }], 'a'.repeat(ZERO_TOTAL_REASON_MIN)).blocked, false);
});

test('K4: negatif toplam da gerekçe ister (sıfırdan farkı yok)', () => {
  const satirlar = [{ quantity: 1, unitPrice: -50 }];
  assert.equal(evaluateZeroTotalGate('SALES', -50, satirlar).blocked, true);
  assert.equal(evaluateZeroTotalGate('SALES', -50, satirlar, GEREKCE).blocked, false);
});

test('K5: ALIŞ ve PROFORMA kapsam DIŞI (tedarikçi belgesi / teklif)', () => {
  assert.equal(evaluateZeroTotalGate('PURCHASE', 0, [{ quantity: 1, unitPrice: 0 }]).blocked, false);
  assert.equal(evaluateZeroTotalGate('PROFORMA', 0, [{ quantity: 1, unitPrice: 0 }]).blocked, false);
});

test('K6: toplamı > 0 olan fatura gerekçesiz geçer', () => {
  assert.equal(evaluateZeroTotalGate('SALES', 120, [{ quantity: 1, unitPrice: 100 }]).blocked, false);
});

test('K9: fiyatı olan ürüne 0 girilmişse UYARI üretilir (engellemez)', () => {
  const r = evaluateZeroTotalGate('SALES', 0, [{ productCode: 'URN-1', productName: 'Numune', quantity: 2, unitPrice: 0, productSalePrice: 100 }], GEREKCE);
  assert.equal(r.blocked, false, 'uyarı engel DEĞİLDİR');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /URN-1/);
  assert.match(r.warnings[0], /100/);
  // Satış fiyatı zaten 0 ise "fiyatı var ama 0 girilmiş" uyarısı YOK.
  assert.equal(evaluateZeroTotalGate('SALES', 0, [{ quantity: 1, unitPrice: 0, productSalePrice: 0 }], GEREKCE).warnings.length, 0);
});

test('K10: assertZeroTotalAllowed düşünce ZeroTotalGateError (400 + kod)', () => {
  try {
    assertZeroTotalAllowed('SALES', 0, [{ quantity: 1, unitPrice: 0 }]);
    assert.fail('fırlatmalıydı');
  } catch (err: any) {
    assert.ok(err instanceof ZeroTotalGateError);
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'ZERO_TOTAL_REASON_REQUIRED');
  }
  // Geçen durumda uyarı listesi döner (denetim kaydı için).
  const uyarilar = assertZeroTotalAllowed('SALES', 0, [{ quantity: 1, unitPrice: 0, productSalePrice: 100 }], GEREKCE);
  assert.equal(uyarilar.length, 1);
});

// ─────────────────────────── LEGACY POST /api/invoices ───────────────────────────

test('K8: legacy uçta gerekçesiz sıfır satış 400 + HİÇBİR ŞEY yazılmaz', async () => {
  const once = muhasebeOzeti();
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ type: 'RETAIL_POS', customerId: 'c', items: satir(3, 0) }),
  });
  const govde = await res.json() as any;
  assert.equal(res.status, 400, 'gerekçesiz 0 TL satış reddedilmeli');
  assert.equal(govde.code, 'ZERO_TOTAL_REASON_REQUIRED');
  assert.match(String(govde.message), /GEREKÇE/);
  assert.deepEqual(muhasebeOzeti(), once, 'fatura/stok/cari/sayaç DEĞİŞMEMELİ (yarım kayıt yok)');
});

test('K3b: legacy uçta kısa gerekçe de 400 (istemci atlatamaz)', async () => {
  const once = muhasebeOzeti();
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ type: 'RETAIL_POS', customerId: 'c', items: satir(3, 0), zeroTotalReason: 'yok' }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(muhasebeOzeti(), once);
});

test('K2b: legacy uçta gerekçeli sıfır satış YAZILIR (belge + denetim + stok çıkışı)', async () => {
  const once = muhasebeOzeti();
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ type: 'RETAIL_POS', customerId: 'c', items: satir(3, 0), zeroTotalReason: GEREKCE }),
  });
  const govde = await res.json() as any;
  assert.equal(res.status, 200, JSON.stringify(govde));
  assert.equal(govde.invoice.grandTotal, 0);
  assert.equal(govde.invoice.zeroTotalReason, GEREKCE, 'gerekçe BELGEYE yazılmalı');

  const simdi = muhasebeOzeti();
  assert.equal(simdi.fatura, once.fatura + 1);
  assert.equal(simdi.stokHareketi, once.stokHareketi + 1, '0 TL satış stok çıkışı doğurur');
  assert.equal(simdi.stok['p'], once.stok['p'] - 3, '3 adet stok düşmeli');
  assert.equal(simdi.cariHareket, once.cariHareket + 1);
  assert.equal(simdi.cariBakiye, once.cariBakiye, '0 TL satış alacak DOĞURMAZ (bakiye değişmez)');

  const db = diskte();
  const kayit = db.invoices.find((i: any) => i.id === govde.invoice.id);
  assert.equal(kayit.zeroTotalReason, GEREKCE, 'gerekçe DİSKTE olmalı');
  assert.ok(db.auditLogs.some((l: any) => String(l.details).includes(`SIFIR TUTAR GEREKÇESİ: ${GEREKCE}`)), 'denetim kaydı gerekçeyi taşımalı');
});

test('K7: toplamı > 0 olanda gerekçe belgeye YAZILMAZ (şişme yok)', async () => {
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ type: 'RETAIL_POS', customerId: 'c', items: satir(1, 100), zeroTotalReason: GEREKCE }),
  });
  const govde = await res.json() as any;
  assert.equal(res.status, 200, JSON.stringify(govde));
  assert.equal(govde.invoice.grandTotal, 120);
  assert.equal(govde.invoice.zeroTotalReason, undefined);
});

test('K5b: legacy uçta 0 TL ALIŞ gerekçesiz kabul edilir (kapsam dışı)', async () => {
  const once = muhasebeOzeti();
  const res = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ type: 'PURCHASE', customerId: 'c', items: satir(1, 0) }),
  });
  assert.equal(res.status, 200);
  const simdi = muhasebeOzeti();
  assert.equal(simdi.fatura, once.fatura + 1);
  assert.equal(simdi.cariBakiye, once.cariBakiye, '0 TL alış bakiyeyi DEĞİŞTİRMEZ');
});

// ─────────────────────────── v1 POST /api/v1/invoices ───────────────────────────

test('K8b: v1 uçta gerekçesiz sıfır satış 400 + HİÇBİR ŞEY yazılmaz', async () => {
  const once = muhasebeOzeti();
  const res = await fetch(`${base}/api/v1/invoices`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ type: 'RETAIL_POS', customerId: 'c', items: satir(2, 0) }),
  });
  const govde = await res.json() as any;
  assert.equal(res.status, 400, JSON.stringify(govde));
  assert.equal(govde.code, 'ZERO_TOTAL_REASON_REQUIRED');
  assert.deepEqual(muhasebeOzeti(), once);
});

test('K2c: v1 uçta gerekçeli sıfır satış 201 + belge/denetim/stok', async () => {
  const once = muhasebeOzeti();
  const res = await fetch(`${base}/api/v1/invoices`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ type: 'RETAIL_POS', customerId: 'c', items: satir(2, 0), zeroTotalReason: GEREKCE }),
  });
  const govde = await res.json() as any;
  assert.equal(res.status, 201, JSON.stringify(govde));
  assert.equal(govde.invoice.zeroTotalReason, GEREKCE);
  assert.equal(govde.invoice.grandTotal, 0);

  const simdi = muhasebeOzeti();
  assert.equal(simdi.fatura, once.fatura + 1);
  assert.equal(simdi.stok['p'], once.stok['p'] - 2);
  assert.equal(simdi.cariBakiye, once.cariBakiye, '0 TL satış bakiyeyi DEĞİŞTİRMEZ');
});

test('K9b: fiyatı 100 TL olan ürüne 0 girilirse UYARI denetim kaydına geçer (engellenmez)', async () => {
  const once = muhasebeOzeti();
  const res = await fetch(`${base}/api/v1/invoices`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ type: 'SALES', customerId: 'c', items: satir(1, 0, 'p2'), zeroTotalReason: GEREKCE }),
  });
  const govde = await res.json() as any;
  assert.equal(res.status, 201, JSON.stringify(govde));
  assert.equal(govde.invoice.grandTotal, 0);

  const db = diskte();
  const log = db.auditLogs.find((l: any) => String(l.details).includes('UYARI (0 fiyatlı satır)'));
  assert.ok(log, 'uyarı denetim kaydında OLMALI — satır sessizce bedava çıkmamalı');
  assert.match(String(log.details), /URN-2/);
  assert.equal(muhasebeOzeti().stok['p2'], once.stok['p2'] - 1);
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
      // `assert.equal` hatasında beklenen/gerçek değer ayrı satırda yazılır:
      // hangi değişmezin kaydığı (stok? bakiye? sayaç?) tek bakışta görünsün.
      console.error(`FAIL: ${name}\n      ${err?.message || err}`
        + (err?.actual !== undefined ? `\n      gerçek=${JSON.stringify(err.actual)} beklenen=${JSON.stringify(err.expected)}` : ''));
    }
  }

  server.close();
  ProviderFactory.getProviderForTenant = oldFactory;
  TaxpayerService.checkTaxpayer = oldCheck;
  console.log(`\nzeroPriceGateContractTest: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
