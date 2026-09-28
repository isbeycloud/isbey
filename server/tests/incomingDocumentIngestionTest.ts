/**
 * GELEN BELGE İÇERİ AKTARMA — DAVRANIŞ SÖZLEŞMESİ
 * ==========================================================================
 * 2026-09-28 — Gelen e-Fatura (alış) ve e-İrsaliye içeri aktarma akışı için.
 *
 * NE ÖLÇÜYOR: Bu akış para ve stok üretir. Ölçülen şey "çalışıyor mu" değil,
 * "DOĞRU ZAMANDA ve DOĞRU MİKTARDA yazıyor mu":
 *
 *   1. SENKRON SONRASI HİÇBİR ŞEY DEĞİŞMEZ — stok, cari bakiye ve hareket
 *      defterleri aynı kalır.
 *   2. PLAN ADIMI SALT-OKUNURDUR — eşleştirme önerir, hiçbir kayıt açmaz.
 *   3. ONAY SONRASI: faturada STOK GİRİŞİ + TEDARİKÇİ BORCU oluşur;
 *      İRSALİYEDE yalnız STOK GİRİŞİ olur, BORÇ OLUŞMAZ (mali belge değildir).
 *   4. KALEMLER GERÇEKTİR — çok kalem, farklı KDV oranları korunur.
 *   5. BOZUK/OKUNAMAYAN BELGE AKTARILAMAZ ve hiçbir şey yazmaz.
 *
 * ⚠️ Bu test Hızlı Bilişim'e İSTEK YAPMAZ. Entegratör katmanı yerel bir taklit
 * ile değiştirilir; taklit GERÇEK BİR BAŞARI TAKLİT ETMEZ, yalnız testin kendi
 * ürettiği XML'i geri verir (sahte başarı yasağı — CLAUDE.md md.1).
 *
 * İZOLASYON: Yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/incomingDocumentIngestionTest.ts.json
 * ile çalışır (bkz. `tools/test-local.mjs`). XML deposu da geçici klasöre
 * yönlendirilir ki depo köküne dosya yazılmasın.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const configuredPath = process.env.DATABASE_PATH || '';
if (process.env.NODE_ENV !== 'test' || path.basename(configuredPath) !== 'incomingDocumentIngestionTest.ts.json') {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/incomingDocumentIngestionTest.ts.json ile çalıştırılabilir.'
  );
}

// XML deposunu geçici klasöre taşı (depo köküne yazılmasın).
if (!process.env.ISBEY_DATA_DIR) {
  process.env.ISBEY_DATA_DIR = path.join(path.dirname(configuredPath), 'incoming-doc-data');
}

import { storage } from '../db/storage';
import { IncomingInvoiceService } from '../services/incomingInvoiceService';
import { IncomingDespatchService } from '../services/incomingDespatchService';
import { UblInvoiceBuilder } from '../services/ubl/ublInvoiceBuilder';
import { UblDespatchBuilder } from '../services/ubl/ublDespatchBuilder';
import { ProviderFactory, ProviderTransportError } from '../services/providers/providerFactory';
import type { Product, Customer, Invoice, Waybill, Tenant } from '../db/schema';

// ── Koşum düzeneği ──────────────────────────────────────────────────────────
// NOT: Testlerin çoğu ASENKRON. Yardımcı, dönen promise'i AWAIT ETMEZSE
// başarısız bir test sessizce PASS görünür — bu kabul edilemez (CLAUDE.md:
// "Başarısız testi PASS göstermek" yasak). Bu yüzden koşucu await eder.

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

const tenantId = 'tnt-incoming-behavior';
const tedarikciVkn = '5556667778';

const tenant = {
  id: tenantId, name: 'Alıcı Firma', title: 'ALICI FIRMA A.Ş.',
  taxNumber: '9998887776', taxOffice: 'Merkez VD', city: 'İstanbul', district: 'Merkez',
} as unknown as Tenant;

const tedarikci = {
  id: 'cust-tedarikci-1', tenantId, code: '320.00001', title: 'TEDARİKÇİ A.Ş.',
  taxNumber: tedarikciVkn, taxOffice: 'Karşıyaka VD', city: 'İzmir', district: 'Karşıyaka',
  type: 'SUPPLIER', balance: 0, totalDebit: 0, totalCredit: 0,
} as unknown as Customer;

const prdEslesen = {
  id: 'prd-eslesen', tenantId, code: 'TED-100', name: 'Eşleşen Ürün', unit: 'Adet',
  purchasePrice: 10, salePrice: 20, vatRate: 20,
  currentStock: 100, stock: 100, criticalStock: 0,
  warehouseId: 'wh-default', active: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Product;

/**
 * TAKLİT SAĞLAYICI — Hızlı Bilişim'e ÇIKMAZ, ağ isteği yapmaz.
 * Yalnız testin ürettiği XML'i geri verir; hiçbir belgeyi "gönderilmiş" saymaz.
 */
class TaklitSaglayici {
  public readonly providerId = 'TAKLIT';
  public readonly name = 'Taklit (test)';
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

/** Taklidi kurar; önceki providerId'yi geri alacak fonksiyon döner. */
function saglayiciKur(belgeler: any[]): () => void {
  const ayar = (storage.getState().tenantEinvoiceSettings || []).find(s => s.tenantId === tenantId)!;
  const oncekiProviderId = ayar.providerId;
  ProviderFactory.registerProvider(new TaklitSaglayici(belgeler) as any);
  ayar.providerId = 'TAKLIT';
  return () => {
    ayar.providerId = oncekiProviderId;
  };
}

/** Stok/cari/hareket defterlerinin parmak izi — "hiçbir şey değişmedi" kanıtı. */
function durumOzeti(takip: string[]): string {
  const db = storage.getState();
  const ozet: Record<string, any> = {};
  for (const id of takip) {
    const p = (db.products || []).find(x => x.id === id);
    const c = (db.customers || []).find(x => x.id === id);
    if (p) ozet[`urun:${id}`] = { currentStock: p.currentStock, stock: p.stock };
    if (c) ozet[`cari:${id}`] = { balance: c.balance, totalDebit: c.totalDebit, totalCredit: c.totalCredit };
  }
  ozet.stokHareketSayisi = (db.stockMovements || []).filter(m => m.tenantId === tenantId).length;
  ozet.cariHareketSayisi = (db.accountTransactions || []).filter(t => t.tenantId === tenantId).length;
  ozet.faturaSayisi = (db.invoices || []).filter(i => i.tenantId === tenantId).length;
  return JSON.stringify(ozet);
}

/**
 * Diskteki TAZE hâli okur. Bellekteki özet yanıltıcı olabilir: bir hata
 * yazımı yalnız belleğe uygulayıp diske yansıtmamış olabilir (2026-09-28'de
 * tam olarak bu yaşandı). Kalıcılığı kanıtlamanın tek yolu dosyayı yeniden
 * okumaktır.
 */
function disktenOku(): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), configuredPath), 'utf8'));
}

/** Diskteki taze kayıttan stok/cari/belge durumunu özetler. */
function diskDurumu(): string {
  const d = disktenOku();
  const p = (d.products || []).find((x: any) => x.id === 'prd-eslesen');
  const c = (d.customers || []).find((x: any) => x.id === 'cust-tedarikci-1');
  return JSON.stringify({
    stok: p?.currentStock,
    cariBakiye: c?.balance,
    cariAlacak: c?.totalDebit,
    cariBorc: c?.totalCredit,
    faturaSayisi: (d.invoices || []).filter((i: any) => i.tenantId === tenantId).length,
    hareketSayisi: (d.stockMovements || []).filter((m: any) => m.tenantId === tenantId).length,
    cariHareketSayisi: (d.accountTransactions || []).filter((t: any) => t.tenantId === tenantId).length,
    gelenFaturaDurum: (d.incomingInvoices || []).find((i: any) => i.uuid === FATURA_UUID)?.status,
    gelenIrsaliyeDurum: (d.incomingDespatches || []).find((x: any) => x.uuid === IRSALIYE_UUID)?.status,
  });
}

const TAKIP = ['prd-eslesen', 'cust-tedarikci-1'];
const FATURA_UUID = '11111111-aaaa-bbbb-cccc-111111111111';
const BOZUK_UUID = '22222222-aaaa-bbbb-cccc-222222222222';
const ICERIKSIZ_UUID = '33333333-aaaa-bbbb-cccc-333333333333';
const IRSALIYE_UUID = '44444444-aaaa-bbbb-cccc-444444444444';

// ── Kurulum ─────────────────────────────────────────────────────────────────

function kurulum() {
  const db = storage.getState();
  db.products = (db.products || []).filter(p => p.tenantId !== tenantId);
  db.customers = (db.customers || []).filter(c => c.tenantId !== tenantId);
  db.invoices = (db.invoices || []).filter(i => i.tenantId !== tenantId);
  db.waybills = (db.waybills || []).filter(w => w.tenantId !== tenantId);
  db.stockMovements = (db.stockMovements || []).filter(m => m.tenantId !== tenantId);
  db.accountTransactions = (db.accountTransactions || []).filter(t => t.tenantId !== tenantId);
  db.incomingInvoices = (db.incomingInvoices || []).filter(i => i.tenantId !== tenantId);
  db.incomingDespatches = (db.incomingDespatches || []).filter(d => d.tenantId !== tenantId);
  db.tenants = (db.tenants || []).filter(t => t.id !== tenantId);
  db.tenantEinvoiceSettings = (db.tenantEinvoiceSettings || []).filter(s => s.tenantId !== tenantId);

  db.tenants.push(tenant as any);
  db.customers.push(tedarikci);
  db.products.push(prdEslesen);
  // ⚠️ Başlangıç stoğu HAREKETLE kurulur, yalnız alan yazarak DEĞİL.
  // `storage.recalculateBalances()` ürün stoğunu stok hareketlerinden YENİDEN
  // hesaplar; hareketi olmayan bir ürünün `currentStock` alanı ilk yazımdan
  // sonra sıfırlanır. Alanı elle 100 yazmak testi yanıltırdı (ilk koşuda
  // gerçekten yanılttı: 100 beklenirken 11 ölçüldü).
  db.stockMovements = (db.stockMovements || []).filter((m: any) => m.tenantId !== tenantId);
  db.stockMovements.push({
    id: 'sm-acilis', tenantId, productId: prdEslesen.id, productCode: prdEslesen.code,
    productName: prdEslesen.name, warehouseId: 'wh-default', documentNo: 'AÇILIŞ',
    documentType: 'OPENING', movementType: 'PURCHASE', quantity: 100, direction: 'IN',
    unitPrice: 10, totalAmount: 1000, currency: 'TRY', date: '2026-01-01',
    userId: 'usr-test', createdBy: 'Test', createdAt: '2026-01-01T00:00:00.000Z',
  } as any);
  db.tenantEinvoiceSettings.push({
    id: `eis-${tenantId}`, tenantId, providerId: 'HIZLI_TEKNOLOJI',
    environment: 'TEST', senderIdentifier: '9998887776', status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as any);
  storage.save();
}

// ── Test belgeleri (gerçek UBL kökleriyle) ──────────────────────────────────

/** Çok kalemli, FARKLI KDV oranlı alış faturası: 4×100 + 2×500 + 1×400. */
function alisFaturasiUret(uuid: string, no: string): string {
  const inv = {
    id: `inv-${no}`, invoiceNo: no, type: 'PURCHASE', status: 'ACTIVE',
    customerId: tedarikci.id, customerCode: tedarikci.code, customerTitle: tedarikci.title,
    date: '2026-09-20', currency: 'TRY',
    subTotal: 1800, totalDiscount: 0, totalVat: 190, grandTotal: 1990,
    items: [
      { id: 'i1', productId: 'x', productCode: 'TED-100', productName: 'Eşleşen Ürün', quantity: 4, unit: 'Adet', unitPrice: 100, vatRate: 20, vatAmount: 80, lineTotal: 400, lineGrandTotal: 480 },
      { id: 'i2', productId: 'y', productCode: 'TED-200', productName: 'Yeni Kalem (kart yok)', quantity: 2, unit: 'Kg', unitPrice: 500, vatRate: 10, vatAmount: 100, lineTotal: 1000, lineGrandTotal: 1100 },
      { id: 'i3', productId: 'z', productCode: 'TED-300', productName: 'İkinci Yeni Kalem', quantity: 1, unit: 'Litre', unitPrice: 400, vatRate: 2.5, vatAmount: 10, lineTotal: 400, lineGrandTotal: 410 },
    ],
  } as unknown as Invoice;
  return UblInvoiceBuilder.buildXml({ invoice: inv, tenant: tedarikci, customer: tenant, uuid });
}

/** İki kalemli e-İrsaliye: 7 adet TED-100 + 3 adet TED-900 (fiyatsız belge). */
function irsaliyeUret(uuid: string, no: string): string {
  const wb = {
    id: `wb-${no}`, waybillNo: no, type: 'PURCHASE_DESPATCH',
    customerId: tedarikci.id, customerCode: tedarikci.code, customerTitle: tedarikci.title,
    date: '2026-09-20', shipmentDate: '2026-09-20', status: 'PENDING',
    items: [
      { id: 'wi1', productId: 'x', productCode: 'TED-100', productName: 'Eşleşen Ürün', quantity: 7, unit: 'Adet' },
      { id: 'wi2', productId: 'y', productCode: 'TED-900', productName: 'İrsaliyede Yeni Kalem', quantity: 3, unit: 'Adet' },
    ],
  } as unknown as Waybill;
  return UblDespatchBuilder.buildXml({ waybill: wb, tenant: tedarikci, customer: tenant, uuid });
}

const taklitListe = (
  uuid: string, no: string, xmlContent: string,
  documentKind: 'INVOICE' | 'DESPATCH', appType: number, grandTotal = 0
) => ({
  uuid, invoiceNo: no, supplierVkn: tedarikciVkn, supplierTitle: tedarikci.title,
  issueDate: '2026-09-20', subTotal: 0, vatAmount: 0, grandTotal, currency: 'TRY',
  xmlContent, documentKind, appType,
});

// ════════════════════════════════════════════════════════════════════════════
// GELEN FATURA
// ════════════════════════════════════════════════════════════════════════════

test('senkron: gerçek kalemler saklanır, stok/cari DEĞİŞMEZ', async () => {
  const once = durumOzeti(TAKIP);
  const geriAl = saglayiciKur([taklitListe(FATURA_UUID, 'ALIS-1', alisFaturasiUret(FATURA_UUID, 'ALIS-1'), 'INVOICE', 1)]);
  try {
    const r = await IncomingInvoiceService.syncIncomingInvoices(tenantId);
    assert.equal(r.syncedCount, 1);
    assert.equal(r.unreadableCount, 0, 'belge okunabilmeliydi');

    const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === FATURA_UUID);
    assert.ok(kayit, 'gelen fatura kaydı oluşmalı');

    // İçerik GERÇEKTEN çözümlenmiş olmalı — 3 kalem, farklı KDV oranları.
    assert.equal(kayit!.items.length, 3, 'üç kalem de okunmalı');
    assert.deepEqual(kayit!.items.map(i => i.vatRate), [20, 10, 2.5], 'KDV oranları korunmalı');
    assert.deepEqual(kayit!.items.map(i => i.unit), ['Adet', 'Kg', 'Litre']);
    assert.equal(kayit!.items[1].unitPrice, 500, 'birim fiyat belgeden gelmeli');
    assert.equal(kayit!.supplierTaxNumber, tedarikciVkn);

    // Toplamlar kalemlerle tutarlı: 1800 + 190 = 1990.
    assert.equal(kayit!.subTotal, 1800);
    assert.equal(kayit!.vatAmount, 190);
    assert.equal(kayit!.grandTotal, 1990);
    assert.equal(kayit!.parseWarnings, undefined, 'temiz belgede uyarı olmamalı');

    // ⭐ ASIL İDDİA: senkron STOK ve CARİYE dokunmamış olmalı.
    assert.equal(durumOzeti(TAKIP), once, 'senkron sonrası stok/cari/hareket değişmemeli');
  } finally { geriAl(); }
});

test('plan: eşleştirme önerir, HİÇBİR kayıt AÇMAZ', () => {
  const db = storage.getState();
  const kayit = (db.incomingInvoices || []).find(i => i.uuid === FATURA_UUID)!;
  const urunSayisi = (db.products || []).length;
  const cariSayisi = (db.customers || []).length;
  const once = durumOzeti(TAKIP);

  const plan = IncomingInvoiceService.getIngestionPlan(kayit.id, tenantId);

  assert.equal(plan.party.exact, true, 'tedarikçi VKN ile kesin eşleşmeli');
  assert.equal(plan.party.customer?.id, 'cust-tedarikci-1');
  assert.equal(plan.lines[0].product?.id, 'prd-eslesen');
  assert.equal(plan.lines[0].matchedBy, 'SELLER_CODE');
  assert.equal(plan.lines[1].needsNewProduct, true, 'kartı olmayan kalem "yeni gerekli" işaretlenmeli');
  assert.equal(plan.lines[2].needsNewProduct, true);
  assert.equal(plan.blockedReason, undefined, 'belge aktarılabilir olmalı');

  assert.equal(db.products!.length, urunSayisi, 'plan ürün kartı AÇMAMALI');
  assert.equal(db.customers!.length, cariSayisi, 'plan cari kartı AÇMAMALI');
  assert.equal(durumOzeti(TAKIP), once, 'plan stok/cari değiştirmemeli');
});

test('onaylı dönüşüm: stok girişi + tedarikçi borcu oluşur, kalemler DOĞRU', async () => {
  // ⚠️ `storage.getState()` burada ALINMAZ: `runTransaction` sonunda `this.db`
  // yeni klonla değiştirilir ve dönüşümden önce alınan referans BAYAT kalır
  // (ilk koşuda stok bu yüzden eski değeriyle karşılaştırıldı). Doğrulamalar
  // dönüşümden SONRA taze okunur.
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === FATURA_UUID)!;
  const oncekiDisk = JSON.parse(diskDurumu());
  const stokOnce = oncekiDisk.stok as number;
  const borcOnce = oncekiDisk.cariBorc as number;

  const fatura = await IncomingInvoiceService.approveAndConvert(kayit.id, tenantId, 'usr-test', 'Test Kullanıcı');

  assert.equal(fatura.type, 'PURCHASE');
  assert.equal(fatura.items.length, 3, 'üç kalem faturaya yansımalı');
  assert.deepEqual(fatura.items.map(i => i.vatRate), [20, 10, 2.5]);
  assert.deepEqual(fatura.items.map(i => i.lineTotal), [400, 1000, 400]);
  assert.equal(fatura.grandTotal, 1990, 'genel toplam belgeyle aynı olmalı');

  // ⭐ KALICILIK: diskteki taze hâl okunur.
  const sonra = JSON.parse(diskDurumu());

  // Stok girişi: yalnız eşleşen ürün 4 adet artmalı.
  assert.equal(sonra.stok, stokOnce + 4, 'alış stoğu 4 adet artırmalı ve DİSKE yazmalı');
  // Cari borcu: alış → totalCredit artar.
  assert.equal(sonra.cariBorc, borcOnce + 1990, 'tedarikçi borcu 1990 artmalı ve DİSKE yazmalı');
  assert.equal(sonra.faturaSayisi, 1, 'alış faturası DİSKE yazılmalı');
  assert.equal(sonra.gelenFaturaDurum, 'CONVERTED_TO_PURCHASE', 'dönüşüm durumu DİSKE yazılmalı');

  const taze = storage.getState();
  // Eşleşmeyen iki kalem için kart açılmış olmalı.
  const yeniKartlar = (taze.products || []).filter(p => ['TED-200', 'TED-300'].includes(p.code));
  assert.equal(yeniKartlar.length, 2, 'eşleşmeyen kalemler için kart açılmalı');
  const kart200 = yeniKartlar.find(p => p.code === 'TED-200')!;
  assert.equal(kart200.purchasePrice, 500, 'alış fiyatı belgeden gelmeli');
  assert.equal(kart200.salePrice, 0, 'satış fiyatı UYDURULMAMALI');

  const guncelKayit = (taze.incomingInvoices || []).find(i => i.uuid === FATURA_UUID)!;
  assert.equal(guncelKayit.status, 'CONVERTED_TO_PURCHASE');
  assert.ok(guncelKayit.convertedPurchaseInvoiceId, 'dönüşüm kimliği yazılmalı');

  // Stok hareketleri: 3 kalem → 3 alış girişi (+1 açılış hareketi).
  const hareket = (taze.stockMovements || []).filter(
    m => m.tenantId === tenantId && m.documentType === 'INVOICE'
  );
  assert.equal(hareket.length, 3);
  assert.ok(hareket.every(m => m.direction === 'IN' && m.movementType === 'PURCHASE'));
});

test('dönüşüm idempotent: aynı belge ikinci kez dönüştürülemez', async () => {
  // Kayıt TAZE alınır: önceki adımda canlı draft nesnesi güncellendiği için
  // elde tutulan eski referans bayat olabilir.
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === FATURA_UUID)!;
  assert.equal(kayit.status, 'CONVERTED_TO_PURCHASE', 'önceki dönüşüm kalıcı olmalı');
  await assert.rejects(
    () => IncomingInvoiceService.approveAndConvert(kayit.id, tenantId, 'usr-test'),
    /zaten alış faturasına dönüştürülmüş/,
    'ikinci dönüşüm engellenmeli (çift stok/borç önlenir)'
  );
});

test('mükerrer senkron: aynı ETTN ikinci kez eklenmez', async () => {
  const geriAl = saglayiciKur([taklitListe(FATURA_UUID, 'ALIS-1', alisFaturasiUret(FATURA_UUID, 'ALIS-1'), 'INVOICE', 1)]);
  try {
    const r = await IncomingInvoiceService.syncIncomingInvoices(tenantId);
    assert.equal(r.syncedCount, 0);
    assert.equal(r.duplicateCount, 1, 'mükerrer belge atlanmalı');
  } finally { geriAl(); }
});

test('okunamayan fatura: UNREADABLE işaretlenir ve içeri aktarılamaz', async () => {
  // Kök doğru ama ETTN ve kalem yok → çözümleyici hata üretir.
  const bozuk =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">' +
    '<cbc:ID>BOZUK-1</cbc:ID></Invoice>';
  const geriAl = saglayiciKur([taklitListe(BOZUK_UUID, 'BOZUK-1', bozuk, 'INVOICE', 1)]);
  try {
    await IncomingInvoiceService.syncIncomingInvoices(tenantId);
    const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === BOZUK_UUID);
    assert.ok(kayit, 'okunamayan belge de kaydedilmeli (kullanıcı görebilsin)');
    assert.equal(kayit!.status, 'UNREADABLE');
    assert.equal(kayit!.items.length, 0, 'okunamayan belgeden UYDURMA kalem üretilmemeli');
    assert.ok(kayit!.parseErrors && kayit!.parseErrors.length > 0, 'hata nedeni saklanmalı');

    const once = durumOzeti(TAKIP);
    await assert.rejects(
      () => IncomingInvoiceService.approveAndConvert(kayit!.id, tenantId, 'usr-test'),
      /içeri aktarılamaz|onaylanamaz/i
    );
    assert.equal(durumOzeti(TAKIP), once, 'başarısız onay hiçbir stok/cari değişikliği yapmamalı');
  } finally { geriAl(); }
});

test('içerik indirilemezse: UNREADABLE, uydurma başarı YOK', async () => {
  const geriAl = saglayiciKur([taklitListe(ICERIKSIZ_UUID, 'ICERIKSIZ-1', '', 'INVOICE', 1, 120)]);
  try {
    await IncomingInvoiceService.syncIncomingInvoices(tenantId);
    const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === ICERIKSIZ_UUID)!;
    assert.equal(kayit.status, 'UNREADABLE', 'içeriksiz belge okunmuş sayılmamalı');
    assert.equal(kayit.items.length, 0, 'uydurma kalem ÜRETİLMEMELİ');
    // Entegratörün bildirdiği tutar bilgi olarak saklanır ama bu tutarla
    // fatura KESİLEMEZ.
    assert.equal(kayit.grandTotal, 120);
    assert.ok((kayit.parseErrors || []).some(e => /içeriği/i.test(e)));
  } finally { geriAl(); }
});

test('diskte içeriği olmayan belge plan üretemez', () => {
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === ICERIKSIZ_UUID)!;
  assert.throws(
    () => IncomingInvoiceService.getIngestionPlan(kayit.id, tenantId),
    /içeriği diskte bulunamadı/i
  );
});

// ════════════════════════════════════════════════════════════════════════════
// GELEN e-İRSALİYE — stok girer, BORÇ OLUŞMAZ
// ════════════════════════════════════════════════════════════════════════════

test('irsaliye senkron: kalemler okunur, fiyat/KDV UYDURULMAZ', async () => {
  const geriAl = saglayiciKur([taklitListe(IRSALIYE_UUID, 'IRS-ALIS-1', irsaliyeUret(IRSALIYE_UUID, 'IRS-ALIS-1'), 'DESPATCH', 3)]);
  try {
    const r = await IncomingDespatchService.syncIncomingDespatches(tenantId);
    assert.equal(r.syncedCount, 1);
    assert.equal(r.unreadableCount, 0);

    const kayit = (storage.getState().incomingDespatches || []).find(d => d.uuid === IRSALIYE_UUID)!;
    assert.equal(kayit.status, 'RECEIVED');
    assert.equal(kayit.items.length, 2, 'iki kalem okunmalı');
    assert.deepEqual(kayit.items.map(i => i.quantity), [7, 3]);
    assert.deepEqual(kayit.items.map(i => i.unit), ['Adet', 'Adet']);
    assert.equal(kayit.items[0].supplierProductCode, 'TED-100');
    // Fiyat/KDV irsaliyede YOKTUR → undefined kalmalı; 0 yazmak "bedelsiz mal"
    // izlenimi verirdi.
    assert.equal(kayit.items[0].unitPrice, undefined, 'irsaliyede fiyat uydurulmamalı');
    assert.equal(kayit.items[0].vatRate, undefined, 'irsaliyede KDV uydurulmamalı');
    // Fiyatsız belge için "KDV oranı yok" uyarısı üretilmemeli.
    assert.equal(kayit.parseWarnings, undefined, `irsaliyede KDV uyarısı olmamalı: ${JSON.stringify(kayit.parseWarnings)}`);
  } finally { geriAl(); }
});

test('irsaliye planı da SALT-OKUNURDUR', () => {
  const db = storage.getState();
  const kayit = (db.incomingDespatches || []).find(d => d.uuid === IRSALIYE_UUID)!;
  const urunSayisi = (db.products || []).length;
  const once = durumOzeti(TAKIP);

  const plan = IncomingDespatchService.getIngestionPlan(kayit.id, tenantId);
  assert.equal(plan.lines.length, 2);
  assert.equal(plan.lines[0].product?.id, 'prd-eslesen', 'TED-100 eşleşmeli');
  assert.equal(plan.lines[1].needsNewProduct, true);
  assert.equal(db.products!.length, urunSayisi, 'plan ürün kartı AÇMAMALI');
  assert.equal(durumOzeti(TAKIP), once, 'plan stok/cari değiştirmemeli');
});

test('irsaliye onayı: STOK GİRER, CARİ BORÇ OLUŞMAZ', async () => {
  const db = storage.getState();
  const kayit = (db.incomingDespatches || []).find(d => d.uuid === IRSALIYE_UUID)!;
  // Tüm baseline değerleri DİSKTEN (taze) alınır.
  const once = JSON.parse(diskDurumu());
  const stokOnce = once.stok as number;
  const borcOnce = once.cariBorc as number;
  const bakiyeOnce = once.cariBakiye as number;
  const faturaSayisiOnce = once.faturaSayisi as number;
  const cariHareketOnce = once.cariHareketSayisi as number;

  const sonuc = await IncomingDespatchService.approveDespatch(kayit.id, tenantId, 'usr-test', 'Test');

  const sonra = JSON.parse(diskDurumu());

  // STOK GİRMELİ (diske yazılmış olarak).
  assert.equal(sonra.stok, stokOnce + 7, 'irsaliye onayı 7 adet stok girişi yapmalı ve DİSKE yazmalı');
  assert.equal(sonra.gelenIrsaliyeDurum, 'APPROVED', 'onay durumu DİSKE yazılmalı');
  assert.equal(sonuc.movements.length, 2, 'iki kalem için hareket oluşmalı');
  assert.ok(sonuc.movements.every(m => m.direction === 'IN' && m.documentType === 'WAYBILL'));
  assert.ok(sonuc.movements.every(m => m.unitPrice === 0), 'irsaliyede fiyat yok — 0 yazılır, uydurulmaz');

  // ⭐ ASIL İDDİA: CARİ BORÇ OLUŞMAMALI, FATURA KESİLMEMELİ.
  assert.equal(sonra.cariBorc, borcOnce, 'irsaliye onayı cari borç OLUŞTURMAMALI (mali belge değil)');
  assert.equal(sonra.cariBakiye, bakiyeOnce, 'cari bakiye değişmemeli');
  assert.equal(sonra.cariHareketSayisi, cariHareketOnce, 'irsaliye onayı cari hareket YAZMAMALI');
  assert.equal(sonra.faturaSayisi, faturaSayisiOnce, 'irsaliye onayı fatura KESMEMELİ');
});

test('irsaliye: ikinci kez onaylanamaz (çift stok girişi önlenir)', async () => {
  const kayit = (storage.getState().incomingDespatches || []).find(d => d.uuid === IRSALIYE_UUID)!;
  const stokOnce = prdEslesen.currentStock!;
  await assert.rejects(
    () => IncomingDespatchService.approveDespatch(kayit.id, tenantId, 'usr-test'),
    /zaten onaylanmış/
  );
  assert.equal(prdEslesen.currentStock, stokOnce, 'stok değişmemeli');
});

test('fatura ve irsaliye akışları birbirine karışmaz', async () => {
  const db = storage.getState();
  assert.ok(!(db.incomingInvoices || []).some(i => i.uuid === IRSALIYE_UUID), 'irsaliye fatura listesine girmemeli');
  assert.ok(!(db.incomingDespatches || []).some(d => d.uuid === FATURA_UUID), 'fatura irsaliye listesine girmemeli');

  // Fatura senkronu irsaliyeyi İÇERİ ALMAMALI.
  const geriAl = saglayiciKur([taklitListe(IRSALIYE_UUID, 'IRS-ALIS-1', irsaliyeUret(IRSALIYE_UUID, 'IRS-ALIS-1'), 'DESPATCH', 3)]);
  try {
    const r = await IncomingInvoiceService.syncIncomingInvoices(tenantId);
    assert.equal(r.syncedCount, 0, 'irsaliye fatura senkronuyla içeri alınmamalı');
    assert.equal(r.duplicateCount, 0);
  } finally { geriAl(); }
});

test('irsaliye senkronu ve reddi DİSKE yazılır (bayat referans tuzağı)', async () => {
  // ⚠️ 2026-09-28: Bu iki yol `storage.getState()` referansı üzerinden
  // yazıyordu. Araya giren bir `update()` (addAuditLog vb.) referansı
  // bayatlatınca sonuç sessizce kayboluyordu; belirti "başarılı görünen ama
  // diske hiç yansımayan" işlemdi. Bu test kalıcılığı DİSKTEN doğrular.
  const ikinciUuid = '55555555-aaaa-bbbb-cccc-555555555555';
  const geriAl = saglayiciKur([
    taklitListe(ikinciUuid, 'IRS-ALIS-2', irsaliyeUret(ikinciUuid, 'IRS-ALIS-2'), 'DESPATCH', 3),
  ]);
  try {
    const r = await IncomingDespatchService.syncIncomingDespatches(tenantId);
    assert.equal(r.syncedCount, 1);

    const diskte = disktenOku();
    const kayit = (diskte.incomingDespatches || []).find((x: any) => x.uuid === ikinciUuid);
    assert.ok(kayit, 'senkron kaydı DİSKE yazılmalı');
    assert.equal(kayit.status, 'RECEIVED');
    assert.equal((kayit.items || []).length, 2, 'kalemler de diske yazılmalı');

    await IncomingDespatchService.rejectDespatch(kayit.id, tenantId, 'Test sebebi', 'usr-test', 'Test');

    const sonra = (disktenOku().incomingDespatches || []).find((x: any) => x.uuid === ikinciUuid);
    assert.equal(sonra?.status, 'REJECTED', 'red kararı DİSKE yazılmalı');
    assert.equal(sonra?.rejectionReason, 'Test sebebi');

    // Red stok hareketi DOĞURMAMALI.
    const m1 = (disktenOku().stockMovements || []).filter((m: any) => m.documentId === kayit.id);
    assert.equal(m1.length, 0, 'reddedilen irsaliye stok hareketi oluşturmamalı');
  } finally { geriAl(); }
});

// ════════════════════════════════════════════════════════════════════════════
// İZOLASYON VE DÜRÜSTLÜK
// ════════════════════════════════════════════════════════════════════════════

test('kiracı izolasyonu: başka firmanın belgesi okunamaz', async () => {
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === FATURA_UUID)!;
  assert.throws(
    () => IncomingInvoiceService.getIngestionPlan(kayit.id, 'tnt-baska-firma'),
    /bulunamadı/,
    'başka firma bu belgeyi görmemeli'
  );
  await assert.rejects(
    () => IncomingInvoiceService.approveAndConvert(kayit.id, 'tnt-baska-firma', 'usr-x'),
    /bulunamadı/
  );
});

test('entegratör yoksa: senkron sessizce başarılı GÖRÜNMEZ', async () => {
  const db = storage.getState();
  const ayar = (db.tenantEinvoiceSettings || []).find(s => s.tenantId === tenantId)!;
  db.tenantEinvoiceSettings = (db.tenantEinvoiceSettings || []).filter(s => s.tenantId !== tenantId);
  try {
    await assert.rejects(
      () => IncomingInvoiceService.syncIncomingInvoices(tenantId),
      (err: any) => err?.code === 'PROVIDER_NOT_CONFIGURED' || /yapılandırılmamış/i.test(err?.message || ''),
      'yapılandırma yoksa senkron HATA vermeli, sessizce 0 dönmemeli'
    );
  } finally {
    db.tenantEinvoiceSettings.push(ayar as any);
  }
});

test('sağlayıcı sözleşmesi: her entegratör içerik indirme metodu sunar', () => {
  const providers = (ProviderFactory as any).providers as Map<string, any>;
  const mock = providers.get('MOCK');
  const hizli = providers.get('HIZLI_TEKNOLOJI');
  assert.equal(typeof mock?.getIncomingDocumentContent, 'function', 'MOCK sözleşmeyi uygulamalı');
  assert.equal(typeof hizli?.getIncomingDocumentContent, 'function', 'HIZLI_TEKNOLOJI sözleşmeyi uygulamalı');
  assert.ok(ProviderFactory.getAllProviders().length >= 2, 'kayıtlı sağlayıcılar bulunmalı');
  assert.equal(typeof ProviderTransportError.is, 'function');
});

test('MOCK: içerik indirme SAHTE BAŞARI döndürmez', async () => {
  const { MockElectronicDocumentProvider } = await import('../services/providers/mockProvider');
  const mock = new MockElectronicDocumentProvider();
  const sonuc = await mock.getIncomingDocumentContent('herhangi-uuid', 1, {} as any);
  assert.equal(sonuc.success, false, 'MOCK içerik UYDURMAMALI');
  assert.equal(sonuc.content, '');
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

  console.log(`\nGelen belge içeri aktarma sözleşmesi: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
