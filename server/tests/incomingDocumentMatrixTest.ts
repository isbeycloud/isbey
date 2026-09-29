/**
 * GELEN BELGE — A–O ZORUNLU MATRİS TESTİ
 * ==========================================================================
 * 2026-09-29 — Kullanıcının istediği 15 zorunlu senaryo (A…O).
 *
 * NE ÖLÇÜYOR: Gelen belge akışının GERÇEK GÜNLÜK OPERASYONA dayanıp
 * dayanmadığını. Tek satırlık fatura da, 100 satırlık fatura da, iskontolu
 * satır da, dövizli belge de, %1/%10/%20 KDV aynı belgede de doğru okunmalı;
 * yarıda patlayan bir onay HİÇBİR İZ BIRAKMAMALI; XXE yükü diske hiç
 * yazılmamalı.
 *
 * ⚠️ MATRİSİN TAMAMI BURADA TEKRAR YAZILMAZ. G, H, I, J, L, M, N zaten
 * `incomingDocumentIngestionTest.ts` ve `incomingDocumentAuthzTest.ts`
 * içinde koşuyor; aynı iddiayı ikinci bir dosyada kopyalamak, iki testin
 * zamanla AYRIŞMASINA yol açar (biri güncellenir, diğeri sessizce eski
 * davranışı doğrulamaya devam eder). Bu dosya yalnız KAPSANMAYAN maddeleri
 * koşar ve her kapsanan madde için hangi dosyanın onu koştuğunu YAZAR.
 *
 * ⚠️ AĞ İSTEĞİ YOK. Sağlayıcı katmanı yerel bir taklit ile değiştirilir;
 * taklit SAHTE BAŞARI ÜRETMEZ — yalnız testin kendi ürettiği XML'i geri verir
 * (CLAUDE.md md.1). Hiçbir koşulda Hızlı Bilişim'e çıkılmaz; kontör tüketen
 * bir işlem çalıştırılmaz.
 *
 * İZOLASYON: Yalnız NODE_ENV=test ve
 * DATABASE_PATH=<tmp>/incomingDocumentMatrixTest.ts.json (bkz. tools/test-local.mjs).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const configuredPath = process.env.DATABASE_PATH || '';
if (process.env.NODE_ENV !== 'test' || path.basename(configuredPath) !== 'incomingDocumentMatrixTest.ts.json') {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/incomingDocumentMatrixTest.ts.json ile çalıştırılabilir.'
  );
}

// XML deposu geçici klasöre taşınır — depo köküne dosya yazılmaz.
if (!process.env.ISBEY_DATA_DIR) {
  process.env.ISBEY_DATA_DIR = path.join(path.dirname(configuredPath), 'incoming-matrix-data');
}

import { storage } from '../db/storage';
import { IncomingInvoiceService } from '../services/incomingInvoiceService';
import { IncomingDespatchService } from '../services/incomingDespatchService';
import { DocumentConversionService } from '../services/documentConversionService';
import { parseUblDocument } from '../services/ubl/ublParser';
import { matchLine, discountPercentForLine } from '../services/ubl/incomingDocumentMapper';
import { ProviderFactory } from '../services/providers/providerFactory';
import { IncomingDocumentError } from '../errors/incomingDocumentError';
import type { Product, Customer, Tenant } from '../db/schema';
import { faturaXml, irsaliyeXml, cokSatirliBelge, satirNet, satirKdv } from './fixtures/ublFixtureBuilder';

// ── Koşum düzeneği ──────────────────────────────────────────────────────────
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { tests.push({ name, fn }); }

const tenantId = 'tnt-matrix';
const SATICI_VKN = '5556667778';
const ALICI_VKN = '9998887776';

const tenant = {
  id: tenantId, name: 'Matris Firma', title: 'MATRİS FİRMA A.Ş.',
  taxNumber: ALICI_VKN, taxOffice: 'Merkez VD', city: 'İstanbul', district: 'Merkez',
} as unknown as Tenant;

const tedarikci = {
  id: 'cust-matris-tedarikci', tenantId, code: '320.00001', title: 'MATRİS TEDARİKÇİ A.Ş.',
  taxNumber: SATICI_VKN, taxOffice: 'Karşıyaka VD', city: 'İzmir', district: 'Karşıyaka',
  type: 'SUPPLIER', balance: 0, totalDebit: 0, totalCredit: 0, active: true,
} as unknown as Customer;

/**
 * Eşleşecek tek ürün kartı.
 *
 * ⚠️ Stok, HAREKETLE kurulur (bkz. `kurulum`): `recalculateBalances` ürün
 * stoğunu stok hareketlerinden yeniden hesaplar; yalnız alan yazmak testi
 * yanıltır (bu tuzak ilk koşuda gerçekten ölçüldü).
 */
const prdEslesen = {
  id: 'prd-matris-1', tenantId, code: 'MTX-100', name: 'Matris Eşleşen Ürün', unit: 'Adet',
  purchasePrice: 10, salePrice: 20, vatRate: 20,
  currentStock: 50, stock: 50, criticalStock: 0,
  warehouseId: 'wh-default', active: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Product;

/** Taklit sağlayıcı — ağa ÇIKMAZ, yalnız verilen XML'i geri verir. */
class TaklitSaglayici {
  public readonly providerId = 'MATRIS_TAKLIT';
  public readonly name = 'Matris Taklit (test)';
  public readonly capabilities = {
    supportsEInvoice: true, supportsEArchive: true, supportsEDespatch: true,
    supportsIncoming: true, supportsCancel: false, supportsWebhook: false,
    supportsPdfDownload: false, supportsStatusQuery: false,
  };
  constructor(private readonly belgeler: any[]) {}
  public async getIncomingInvoices(): Promise<any[]> { return this.belgeler; }
  public async getIncomingDocumentContent(uuid: string) {
    const b = this.belgeler.find(x => x.uuid === uuid);
    if (!b?.xmlContent) return { success: false, content: '', message: 'Belge içeriği yok (taklit).' };
    return { success: true, content: b.xmlContent };
  }
}

function saglayiciKur(belgeler: any[]): () => void {
  const ayar = (storage.getState().tenantEinvoiceSettings || []).find(s => s.tenantId === tenantId)!;
  const onceki = ayar.providerId;
  ProviderFactory.registerProvider(new TaklitSaglayici(belgeler) as any);
  ayar.providerId = 'MATRIS_TAKLIT';
  return () => { ayar.providerId = onceki; };
}

const liste = (
  uuid: string, no: string, xmlContent: string,
  documentKind: 'INVOICE' | 'DESPATCH' = 'INVOICE', appType = 1
) => ({
  uuid, invoiceNo: no, supplierVkn: SATICI_VKN, supplierTitle: tedarikci.title,
  issueDate: '2026-09-20', subTotal: 0, vatAmount: 0, grandTotal: 0,
  currency: 'TRY', xmlContent, documentKind, appType,
});

/** Diskteki TAZE hâl — kalıcılığı kanıtlamanın tek yolu (bellek yanıltabilir). */
function disktenOku(): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), configuredPath), 'utf8'));
}

/** İz bırakmama kanıtı: fatura / stok hareketi / cari hareket sayıları. */
function izSayilari(): string {
  const d = disktenOku();
  return JSON.stringify({
    fatura: (d.invoices || []).filter((i: any) => i.tenantId === tenantId).length,
    stokHareket: (d.stockMovements || []).filter((m: any) => m.tenantId === tenantId).length,
    cariHareket: (d.currentTransactions || []).filter((t: any) => t.tenantId === tenantId).length,
    hesapHareket: (d.accountTransactions || []).filter((t: any) => t.tenantId === tenantId).length,
  });
}

function kurulum() {
  const db = storage.getState();
  db.products = (db.products || []).filter(p => p.tenantId !== tenantId);
  db.customers = (db.customers || []).filter(c => c.tenantId !== tenantId);
  db.invoices = (db.invoices || []).filter(i => i.tenantId !== tenantId);
  db.waybills = (db.waybills || []).filter(w => w.tenantId !== tenantId);
  db.stockMovements = (db.stockMovements || []).filter(m => m.tenantId !== tenantId);
  db.accountTransactions = (db.accountTransactions || []).filter(t => t.tenantId !== tenantId);
  db.currentTransactions = (db.currentTransactions || []).filter(t => t.tenantId !== tenantId);
  db.incomingInvoices = (db.incomingInvoices || []).filter(i => i.tenantId !== tenantId);
  db.incomingDespatches = (db.incomingDespatches || []).filter(d => d.tenantId !== tenantId);
  db.productSupplierMappings = (db.productSupplierMappings || []).filter(m => m.tenantId !== tenantId);
  db.tenants = (db.tenants || []).filter(t => t.id !== tenantId);
  db.tenantEinvoiceSettings = (db.tenantEinvoiceSettings || []).filter(s => s.tenantId !== tenantId);

  db.tenants.push(tenant as any);
  db.customers.push(tedarikci);
  db.products.push(prdEslesen);
  db.stockMovements.push({
    id: 'sm-matris-acilis', tenantId, productId: prdEslesen.id, productCode: prdEslesen.code,
    productName: prdEslesen.name, warehouseId: 'wh-default', documentNo: 'AÇILIŞ',
    documentType: 'OPENING', movementType: 'PURCHASE', quantity: 50, direction: 'IN',
    unitPrice: 10, totalAmount: 500, currency: 'TRY', date: '2026-01-01',
    userId: 'usr-test', createdBy: 'Test', createdAt: '2026-01-01T00:00:00.000Z',
  } as any);
  db.tenantEinvoiceSettings.push({
    id: `eis-${tenantId}`, tenantId, providerId: 'HIZLI_TEKNOLOJI',
    environment: 'TEST', senderIdentifier: ALICI_VKN, status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as any);
  storage.save();
}

/** Belgeyi senkronlar ve kaydı döner. */
async function senkronlaVeAl(uuid: string, xml: string, no: string, kind: 'INVOICE' | 'DESPATCH' = 'INVOICE', appType = 1) {
  const geriAl = saglayiciKur([liste(uuid, no, xml, kind, appType)]);
  try {
    if (kind === 'DESPATCH') await IncomingDespatchService.syncIncomingDespatches(tenantId);
    else await IncomingInvoiceService.syncIncomingInvoices(tenantId);
  } finally { geriAl(); }
  const kayit = kind === 'DESPATCH'
    ? (storage.getState().incomingDespatches || []).find(d => d.uuid === uuid)
    : (storage.getState().incomingInvoices || []).find(i => i.uuid === uuid);
  assert.ok(kayit, `belge senkronize olmalı: ${uuid}`);
  return kayit!;
}

const U = (n: number) => `aaaaaaaa-bbbb-cccc-dddd-${String(n).padStart(12, '0')}`;

// ════════════════════════════════════════════════════════════════════════════
// A — TEK SATIRLIK FATURA
// ════════════════════════════════════════════════════════════════════════════

test('A) tek satırlık fatura: kalem, KDV ve tutar birebir okunur', async () => {
  const xml = faturaXml({
    uuid: U(1), belgeNo: 'MTX-A-1', saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
    aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
    satirlar: [{ no: '1', ad: 'Tek Kalem', kod: 'MTX-100', miktar: 3, fiyat: 100, kdv: 20 }],
  });

  const kayit = await senkronlaVeAl(U(1), xml, 'MTX-A-1');
  assert.equal(kayit.status, 'RECEIVED', `okunabilir olmalı: ${JSON.stringify(kayit.parseErrors)}`);
  assert.equal(kayit.items.length, 1, 'tek kalem okunmalı');
  assert.equal(kayit.items[0].quantity, 3);
  assert.equal(kayit.items[0].unitPrice, 100);
  assert.equal(kayit.items[0].vatRate, 20);
  assert.equal(kayit.items[0].lineTotal, 300);
  assert.equal(kayit.subTotal, 300);
  assert.equal(kayit.vatAmount, 60);
  assert.equal(kayit.grandTotal, 360);
  // Belgenin kendi bildirdiği tutarla uyuşmalı → uyarı OLMAMALI.
  assert.equal(kayit.parseWarnings, undefined, `uyarı olmamalı: ${JSON.stringify(kayit.parseWarnings)}`);
  assert.equal(kayit.supplierTaxNumber, SATICI_VKN, 'tedarikçi VKN belgeden gelmeli');
  assert.ok(kayit.xmlStoragePath, 'XML diske saklanmalı (detay/Görsel/XML sekmeleri bunu kullanır)');
});

// ════════════════════════════════════════════════════════════════════════════
// B — 10 SATIR, C — 100 SATIR
// ════════════════════════════════════════════════════════════════════════════

test('B) 10 satırlık fatura: tüm kalemler eksiksiz okunur', async () => {
  const xml = cokSatirliBelge(U(2), 'MTX-B-10', 10, {
    saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title, aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
  });
  const kayit = await senkronlaVeAl(U(2), xml, 'MTX-B-10');

  assert.equal(kayit.status, 'RECEIVED');
  assert.equal(kayit.items.length, 10, 'on kalemin hepsi okunmalı');
  // Kalem tutarları: Σ i×10 (i=1..10) = 550; KDV %20 → 110; toplam 660.
  assert.equal(kayit.subTotal, 550);
  assert.equal(kayit.vatAmount, 110);
  assert.equal(kayit.grandTotal, 660);
  assert.equal(kayit.parseWarnings, undefined);
});

test('C) 100 satırlık fatura: hacimde kayıp ve uydurma yok', async () => {
  const xml = cokSatirliBelge(U(3), 'MTX-C-100', 100, {
    saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title, aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
  });
  const kayit = await senkronlaVeAl(U(3), xml, 'MTX-C-100');

  assert.equal(kayit.items.length, 100, 'yüz kalemin hepsi okunmalı (kırpma/sessiz düşürme yok)');
  // Σ i×10 (i=1..100) = 50500; KDV %20 → 10100; toplam 60600.
  assert.equal(kayit.subTotal, 50500);
  assert.equal(kayit.vatAmount, 10100);
  assert.equal(kayit.grandTotal, 60600);
  // Sıra numaraları korunmalı — kaydırma olursa eşleştirme yanlış satıra gider.
  assert.equal(kayit.items[0].name, 'KALEM-1 ürünü');
  assert.equal(kayit.items[99].name, 'KALEM-100 ürünü');
  assert.equal(kayit.parseWarnings, undefined);
});

test('C2) 100 satırlık belgede toplu eşleştirme sayaçları tutarlı', () => {
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === U(3))!;
  const plan = IncomingInvoiceService.getIngestionPlan(kayit.id, tenantId);

  assert.equal(plan.matchSummary!.total, 100);
  assert.equal(plan.lines.length, 100);
  // Hiçbir kalem mevcut karta uymaz → 100 kalem eşleşme bekliyor.
  assert.equal(plan.matchSummary!.matched, 0, 'hiçbir karta uymayan kalem eşleşmiş sayılmamalı');
  assert.equal(plan.matchSummary!.pending, 100);
  assert.equal(plan.matchSummary!.highConfidence, 0);
  assert.ok(
    plan.lines.every(l => l.needsNewProduct),
    'her kalem için kullanıcı kararı gerekli — SESSİZ OTOMATİK EŞLEŞTİRME YOK'
  );
});

// ════════════════════════════════════════════════════════════════════════════
// D — AYNI BELGEDE %1, %10, %20 KDV
// ════════════════════════════════════════════════════════════════════════════

test('D) tek belgede %1 + %10 + %20 KDV: oranlar KARIŞMAZ, toplam doğru', async () => {
  const satirlar = [
    { no: '1', ad: 'Gıda (1%)', kod: 'KDV-1', miktar: 10, fiyat: 100, kdv: 1 },
    { no: '2', ad: 'Tekstil (10%)', kod: 'KDV-10', miktar: 4, fiyat: 250, kdv: 10 },
    { no: '3', ad: 'Elektronik (20%)', kod: 'KDV-20', miktar: 2, fiyat: 500, kdv: 20 },
  ];
  const xml = faturaXml({
    uuid: U(4), belgeNo: 'MTX-D-1', saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
    aliciVkn: ALICI_VKN, aliciUnvan: tenant.title, satirlar,
  });

  const kayit = await senkronlaVeAl(U(4), xml, 'MTX-D-1');
  assert.deepEqual(kayit.items.map((i: any) => i.vatRate), [1, 10, 20], 'her satır KENDİ oranını korumalı');
  // Net: 1000 + 1000 + 1000 = 3000. KDV: 10 + 100 + 200 = 310.
  assert.equal(kayit.subTotal, 3000);
  assert.equal(kayit.vatAmount, 310);
  assert.equal(kayit.grandTotal, 3310);
  // Satır KDV'leri ayrı ayrı doğru olmalı — sabit oran uygulanmadığının kanıtı.
  assert.deepEqual(kayit.items.map((i: any) => i.vatAmount), [10, 100, 200]);
  assert.equal(kayit.parseWarnings, undefined, 'belge kendi tutarıyla tutarlı olmalı');
});

// ════════════════════════════════════════════════════════════════════════════
// E — İSKONTOLU SATIR
// ════════════════════════════════════════════════════════════════════════════

test('E) iskontolu satır: net tutar iskonto SONRASI, çift indirim YOK', async () => {
  // 10 × 100 = 1000 brüt, %10 iskonto = 100 → net 900, KDV %20 = 180.
  const satirlar = [{
    no: '1', ad: 'İskontolu Kalem', kod: 'MTX-100', miktar: 10, fiyat: 100, kdv: 20,
    iskontoTutar: 100, iskontoOran: 10,
  }];
  const xml = faturaXml({
    uuid: U(5), belgeNo: 'MTX-E-1', saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
    aliciVkn: ALICI_VKN, aliciUnvan: tenant.title, satirlar,
  });

  // Fixture'ın kendi beklediği değerler — testin ölçtüğü şeyle aynı kaynaktan.
  assert.equal(satirNet(satirlar[0]), 900);
  assert.equal(satirKdv(satirlar[0]), 180);

  const kayit = await senkronlaVeAl(U(5), xml, 'MTX-E-1');
  assert.equal(kayit.items.length, 1);
  assert.equal(kayit.items[0].lineTotal, 900, 'satır neti İSKONTO SONRASI olmalı (çift indirim yapılmamalı)');
  assert.equal(kayit.items[0].vatAmount, 180, 'KDV net tutar üzerinden hesaplanmalı');
  assert.equal(kayit.subTotal, 900);
  assert.equal(kayit.vatAmount, 180);
  assert.equal(kayit.grandTotal, 1080);
  assert.equal(kayit.parseWarnings, undefined);

  // Çözümleyici iskontoyu ayrıca raporlar (gösterim için) — ama tutarı DÜŞMEZ.
  const doc = parseUblDocument(xml);
  assert.equal(doc.lines[0].discountAmount, 100, 'iskonto tutarı okunmalı');
  assert.equal(doc.lines[0].grossBeforeDiscount, 1000, 'brüt tutar gösterim için türetilmeli');
});

test('E2) iskonto, fatura motoruna YÜZDE olarak geçer (brüt geçilirse borç şişerdi)', () => {
  const doc = parseUblDocument(faturaXml({
    uuid: U(5), belgeNo: 'MTX-E-1', saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
    aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
    satirlar: [{
      no: '1', ad: 'İskontolu Kalem', kod: 'MTX-100', miktar: 10, fiyat: 100, kdv: 20,
      iskontoTutar: 100, iskontoOran: 10,
    }],
  }));
  const oran = discountPercentForLine(doc.lines[0]);
  assert.equal(oran, 10, 'iskonto yüzdesi belgenin KENDİ tutarlarından türetilmeli');

  // İskontosuz satırda `undefined` dönmeli — 0 yazmak "iskonto var ama sıfır"
  // gibi görünür ve motorun varsayılanını gereksiz yere ezberler.
  const temiz = parseUblDocument(faturaXml({
    uuid: U(5), belgeNo: 'MTX-E-1b', saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
    aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
    satirlar: [{ no: '1', ad: 'İskontosuz', kod: 'MTX-100', miktar: 1, fiyat: 100, kdv: 20 }],
  }));
  assert.equal(discountPercentForLine(temiz.lines[0]), undefined);
});

// ════════════════════════════════════════════════════════════════════════════
// F — TRY DIŞI PARA BİRİMİ
//
// ⚠️ BURADA ÖLÇÜLEN GERÇEK BİR MUHASEBE RİSKİDİR: `createInvoice` tutarları ve
// `currency` alanını TRY olarak yazar, kur parametresi ALMAZ. 1.000 USD'lik bir
// belgenin "1.000 TL" olarak içeri alınması, tedarikçi borcunu ve stok
// maliyetini sessizce yanlış yazardı. Kur uydurmak da (CLAUDE.md md.1), motoru
// değiştirmek de (md.3) yasaktır — doğru davranış belgeyi GÖSTERMEK ama
// onayı ENGELLEMEKTİR.
// ════════════════════════════════════════════════════════════════════════════

test('F) dövizli fatura: GERÇEK hâliyle gösterilir (para birimi uydurulmaz)', async () => {
  const xml = faturaXml({
    uuid: U(6), belgeNo: 'MTX-F-USD', paraBirimi: 'USD',
    saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title, aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
    satirlar: [{ no: '1', ad: 'İthal Kalem', kod: 'MTX-100', miktar: 2, fiyat: 500, kdv: 20 }],
  });

  const kayit = await senkronlaVeAl(U(6), xml, 'MTX-F-USD');
  assert.equal(kayit.status, 'RECEIVED', 'belge OKUNABİLİR olmalı — döviz bir okuma engeli değildir');
  assert.equal(kayit.currency, 'USD', 'para birimi belgeden okunmalı, TRY varsayılmamalı');
  assert.equal(kayit.grandTotal, 1200, 'tutar belgede yazdığı gibi (USD) saklanmalı');

  const plan = IncomingInvoiceService.getIngestionPlan(kayit.id, tenantId);
  assert.ok(plan.blockedReason, 'içeri alma ENGELLENMELİ');
  assert.match(plan.blockedReason!, /USD/, 'engel nedeni para birimini AÇIKÇA söylemeli');
  assert.match(plan.blockedReason!, /TL/i, 'TL karşılığı doğrulanmadan alınamayacağı belirtilmeli');
  // Belge yine de eksiksiz görünmeli: kalem ve tutarlar okunmuş olmalı.
  assert.equal(plan.lines.length, 1, 'dövizli belgenin kalemleri de okunmalı');
  assert.equal(plan.totals.computedPayableTotal, 1200);
});

test('F2) dövizli belge ONAYLANAMAZ: 422 ve HİÇBİR iz yok', async () => {
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === U(6))!;
  const once = izSayilari();

  await assert.rejects(
    () => IncomingInvoiceService.approveAndConvert(kayit.id, tenantId, 'usr-test', 'Test'),
    (err: any) => {
      assert.ok(IncomingDocumentError.is(err), 'alan hatası (domain error) olmalı');
      assert.equal(err.code, 'NOT_INGESTIBLE', 'NOT_INGESTIBLE beklenir');
      assert.equal(err.httpStatus, 422);
      return true;
    },
    'dövizli belge içeri alınmamalı'
  );

  assert.equal(izSayilari(), once, 'engellenen onay fatura/stok/cari HİÇBİR ŞEY yazmamalı');
  const sonra = (disktenOku().incomingInvoices || []).find((i: any) => i.uuid === U(6));
  assert.equal(sonra.status, 'RECEIVED', 'belge durumu DEĞİŞMEMELİ (yarım dönüşüm yok)');
});

test('F3) TL belge döviz kapısına TAKILMAZ (kapı yalnız yabancı parayı engeller)', async () => {
  const xml = faturaXml({
    uuid: U(7), belgeNo: 'MTX-F-TRY', paraBirimi: 'TRY',
    saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title, aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
    satirlar: [{ no: '1', ad: 'TL Kalem', kod: 'MTX-100', miktar: 1, fiyat: 100, kdv: 20 }],
  });
  const kayit = await senkronlaVeAl(U(7), xml, 'MTX-F-TRY');
  const plan = IncomingInvoiceService.getIngestionPlan(kayit.id, tenantId);
  assert.equal(plan.blockedReason, undefined, 'TL belge engellenmemeli');
});

// ════════════════════════════════════════════════════════════════════════════
// K — TRANSACTION ORTASINDA HATA → TAM GERİ ALMA
//
// ⚠️ ÖLÇÜM YÖNTEMİ: `runTransaction` yalnız BAŞARILI olduğunda `this.db`'yi
// yeni klonla değiştirir (bkz. storage.ts). Hata fırlatıldığında `this.db`
// atanmaz ve klon diske yazılmaz. Bu yüzden `createInvoice`'ı monkey-patch ile
// patlatıp DİSKTE iz kalmadığını göstermek, geri almayı dışarıdan kanıtlar.
// ════════════════════════════════════════════════════════════════════════════

test('K) onay ortasında hata: TAM GERİ ALMA — yarım kayıt kalmaz', async () => {
  const xml = faturaXml({
    uuid: U(8), belgeNo: 'MTX-K-1', saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
    aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
    satirlar: [
      { no: '1', ad: 'Kalem 1', kod: 'MTX-100', miktar: 2, fiyat: 100, kdv: 20 },
      { no: '2', ad: 'Kalem 2', kod: 'MTX-K-2', miktar: 1, fiyat: 300, kdv: 20 },
    ],
  });
  const kayit = await senkronlaVeAl(U(8), xml, 'MTX-K-1');
  const once = izSayilari();
  const oncekiDisk = JSON.parse(izSayilari());
  const urunSayisiOnce = (disktenOku().products || []).filter((p: any) => p.tenantId === tenantId).length;

  const gercek = DocumentConversionService.createInvoice;
  const patlama = new Error('Matris testi: fatura motoru ortada patladı');
  (DocumentConversionService as any).createInvoice = async () => { throw patlama; };
  try {
    await assert.rejects(
      () => IncomingInvoiceService.approveAndConvert(kayit.id, tenantId, 'usr-test', 'Test'),
      /ortada patladı/,
      'hata YUTULMAMALI — çağırana iletilmeli'
    );
  } finally {
    (DocumentConversionService as any).createInvoice = gercek;
  }

  // ⭐ ASIL İDDİA: diskte hiçbir iz yok.
  assert.equal(izSayilari(), once, 'başarısız onay fatura/stok/cari HİÇBİR ŞEY yazmamalı');
  const disk = disktenOku();
  assert.equal(
    (disk.products || []).filter((p: any) => p.tenantId === tenantId).length,
    urunSayisiOnce,
    'yarıda kalan onay ÜRÜN KARTI da bırakmamalı'
  );
  assert.equal(
    (disk.incomingInvoices || []).find((i: any) => i.uuid === U(8))?.status,
    'RECEIVED',
    'belge durumu RECEIVED kalmalı — yarım dönüşüm işareti yazılmamalı'
  );

  // Geri alma sonrası belge HÂLÂ içeri alınabilir olmalı (sistem kilitlenmemeli).
  const fatura = await IncomingInvoiceService.approveAndConvert(kayit.id, tenantId, 'usr-test', 'Test');
  assert.equal(fatura.grandTotal, 600, 'geri alma sonrası normal onay çalışmalı (2×100 + 300 = 500 + %20)');
  assert.notEqual(izSayilari(), once, 'başarılı onay bu kez YAZMALI');
});

// ════════════════════════════════════════════════════════════════════════════
// O — XXE YÜKÜ REDDEDİLİR
// ════════════════════════════════════════════════════════════════════════════

test('O) XXE yükü: diske YAZILMAZ, çözümlenmez, UNREADABLE olur', async () => {
  const xxe =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE Invoice [\n' +
    '  <!ENTITY xxe SYSTEM "file:///etc/passwd">\n' +
    ']>\n' +
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">' +
    '<cbc:ID>XXE-1</cbc:ID><cbc:UUID>' + U(9) + '</cbc:UUID>' +
    '<cbc:Note>&xxe;</cbc:Note></Invoice>';

  const kayit = await senkronlaVeAl(U(9), xxe, 'XXE-1');
  assert.equal(kayit.status, 'UNREADABLE', 'XXE içeren belge okunabilir sayılmamalı');
  assert.equal(kayit.items.length, 0, 'uydurma kalem ÜRETİLMEMELİ');
  assert.ok(
    (kayit.parseErrors || []).some((e: string) => /XXE|DTD|ENTITY|güvenlik/i.test(e)),
    `güvenlik ihlali nedeni saklanmalı: ${JSON.stringify(kayit.parseErrors)}`
  );

  // ⭐ Ham XML DİSKE HİÇ YAZILMAMIŞ olmalı: zararlı içerik saklanmaz.
  assert.equal(kayit.xmlStoragePath, undefined, 'XXE içeren XML diske YAZILMAMALI');

  // Plan üretilemez ve onay 422 ile reddedilir.
  assert.throws(
    () => IncomingInvoiceService.getIngestionPlan(kayit.id, tenantId),
    (err: any) => err?.code === 'NOT_INGESTIBLE'
  );
  await assert.rejects(
    () => IncomingInvoiceService.approveAndConvert(kayit.id, tenantId, 'usr-test'),
    (err: any) => {
      assert.equal(err.code, 'NOT_INGESTIBLE', 'XXE belgesi NOT_INGESTIBLE ile reddedilmeli');
      return true;
    }
  );
});

test('O2) XXE reddi KALICIDIR: diskteki durum da UNREADABLE', async () => {
  const once = izSayilari();
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === U(9))!;
  await assert.rejects(() => IncomingInvoiceService.approveAndConvert(kayit.id, tenantId, 'usr-test'));
  assert.equal(izSayilari(), once, 'reddedilen XXE belgesi hiçbir muhasebe kaydı doğurmamalı');

  const diskte = (disktenOku().incomingInvoices || []).find((i: any) => i.uuid === U(9));
  assert.equal(diskte?.status, 'UNREADABLE', 'red kararı DİSKE yazılmalı');
  assert.equal(diskte?.xmlStoragePath, undefined, 'zararlı içerik diskte BULUNMAMALI');
});

// ════════════════════════════════════════════════════════════════════════════
// MATRİS KAPSAMA DENETİMİ
//
// ⚠️ G, H, I, J, L, M, N maddeleri bu dosyada TEKRAR YAZILMAZ; kendi
// dosyalarında koşarlar (yukarıdaki başlık notu). Ancak "başka dosyada
// koşuyor" demek, o testin bir gün SESSİZCE SİLİNMESİ riskini taşır — o zaman
// matrisin yarısı kaybolur ve kimse fark etmez. Bu test, kapsanan maddelerin
// hâlâ yerinde olduğunu programatik olarak doğrular.
// ════════════════════════════════════════════════════════════════════════════

test('matris kapsama: kapsanan maddeler (G,H,I,J,L,M,N) diğer dosyalarda HÂLÂ var', () => {
  const kok = path.resolve(process.cwd(), 'server/tests');
  const oku = (ad: string) => fs.readFileSync(path.join(kok, ad), 'utf8');

  const icerikAktarma = oku('incomingDocumentIngestionTest.ts');
  const yetki = oku('incomingDocumentAuthzTest.ts');

  // Her giriş: [madde, dosya, testin adında geçmesi gereken ifade]
  const kapsanan: Array<[string, string, string]> = [
    ['G (aynı ETTN iki kez senkron)', icerikAktarma, 'mükerrer senkron: aynı ETTN ikinci kez eklenmez'],
    ['H (aynı ETTN iki kez onay)', icerikAktarma, 'dönüşüm idempotent: aynı belge ikinci kez dönüştürülemez'],
    ['I (bilinmeyen ürün → kart açılır)', icerikAktarma, 'Eşleşmeyen'],
    ['J (öğrenilen tedarikçi eşleştirmesi)', icerikAktarma, 'öğrenilen eşleştirme: kullanıcı kararı SONRAKİ belgede'],
    ['L (irsaliye → stok girer, cari borç OLUŞMAZ)', icerikAktarma, 'irsaliye onayı: STOK GİRER, CARİ BORÇ OLUŞMAZ'],
    ['M (MUHASEBE yetkisi)', yetki, 'MUHASEBE: gelen fatura listesini GÖREBİLİR'],
    ['N (yetkisiz rol → 403)', yetki, 'SATIS/VIEWER: gelen FATURA ucunda 403'],
  ];

  for (const [madde, kaynak, ifade] of kapsanan) {
    assert.ok(
      kaynak.includes(ifade),
      `${madde} maddesini koşan test BULUNAMADI ("${ifade}"). Kapsama sessizce kaybolmuş olabilir.`
    );
  }

  // En az yetki kuralı (M) yalnız listeyi görmek değildir: admin yetkisi
  // KAZANILMAMASI da ölçülmelidir.
  assert.ok(yetki.includes('ADMIN yetkisi KAZANMAZ'), 'M: muhasebenin admin yetkisi kazanmadığı ölçülmeli');
  assert.ok(yetki.includes('waybills.create YOK'), 'M: waybills.create verilmediği ölçülmeli');
  assert.ok(yetki.includes('products.create YOK'), 'M: products.create verilmediği ölçülmeli');
});

// ── Koşucu ──────────────────────────────────────────────────────────────────

async function main() {
  kurulum();
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`PASS: ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`FAIL: ${name}`);
      console.error(`      ${err?.message || err}`);
    }
  }

  console.log(`\nGelen belge A–O matrisi: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
