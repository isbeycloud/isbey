/**
 * ENTEGRATÖRDEN ÇEK — GERÇEK SENKRON SÖZLEŞMESİ (16 SENARYO)
 * ==========================================================================
 * 2026-09-29 — Kullanıcı isteği §2–§5, §7, §9, §10:
 *   "Entegratörden Çek" düğmesi GERÇEKTEN çalışsın; sonuç kaç belge bulundu /
 *   kaçı yeni / kaçı mükerrer / kaçı hatalı olarak dönsün; senkron stok, cari,
 *   alış faturası ve stok hareketi ÜRETMESİN.
 *
 * ⚠️ BU DOSYA HIZLI BİLİŞİM'E ÇIKMAZ. Sağlayıcı katmanı yerel bir taklit ile
 * değiştirilir. Taklit SAHTE BAŞARI ÜRETMEZ: yalnız testin kendi ürettiği XML'i
 * geri verir, hata senaryolarında GERÇEK HATA fırlatır (CLAUDE.md md.1).
 *
 * ⚠️ HER SENARYODAN SONRA "HİÇBİR ŞEY DEĞİŞMEDİ" KANITLANIR. Diskteki TAZE
 * dosya okunur (bellek yanıltabilir): ürün stoğu, cari bakiyesi, fatura sayısı,
 * stok hareketi sayısı ve cari hareket sayısı BİREBİR aynı olmalıdır. Bu, §3'ün
 * ("sync güvenliği") makinede koşan kanıtıdır.
 *
 * İZOLASYON: Yalnız NODE_ENV=test ve
 * DATABASE_PATH=<tmp>/incomingProviderSyncTest.ts.json (bkz. tools/test-local.mjs).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const configuredPath = process.env.DATABASE_PATH || '';
if (process.env.NODE_ENV !== 'test' || path.basename(configuredPath) !== 'incomingProviderSyncTest.ts.json') {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/incomingProviderSyncTest.ts.json ile çalıştırılabilir.'
  );
}

// XML deposu geçici klasöre taşınır — depo köküne dosya yazılmaz.
if (!process.env.ISBEY_DATA_DIR) {
  process.env.ISBEY_DATA_DIR = path.join(path.dirname(configuredPath), 'incoming-provider-sync-data');
}

import { storage } from '../db/storage';
import { IncomingInvoiceService } from '../services/incomingInvoiceService';
import { IncomingDespatchService } from '../services/incomingDespatchService';
import { ProviderFactory, ProviderTransportError } from '../services/providers/providerFactory';
import {
  MAX_CONTENT_DOWNLOADS_PER_SYNC,
  MAX_RANGE_DAYS,
  clampDateRange,
  resolveDateRange,
} from '../services/incomingSyncContract';
import type { Customer, Product, Tenant } from '../db/schema';
import { faturaXml, irsaliyeXml, cokSatirliBelge } from './fixtures/ublFixtureBuilder';

// ── Koşum düzeneği ──────────────────────────────────────────────────────────
// NOT: Testler ASENKRON. Yardımcı, dönen promise'i await etmezse başarısız bir
// test sessizce PASS görünür — bu kabul edilemez (CLAUDE.md: "Başarısız testi
// PASS göstermek" yasak). Koşucu bu yüzden await eder.

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { tests.push({ name, fn }); }

const tenantId = 'tnt-provider-sync';
const SATICI_VKN = '5556667778';
const ALICI_VKN = '9998887776';
const ACIK_STOK = 40;

const tenant = {
  id: tenantId, name: 'Senkron Firma', title: 'SENKRON FİRMA A.Ş.',
  taxNumber: ALICI_VKN, taxOffice: 'Merkez VD', city: 'İstanbul', district: 'Merkez',
} as unknown as Tenant;

const tedarikci = {
  id: 'cust-senkron-tedarikci', tenantId, code: '320.00001', title: 'SENKRON TEDARİKÇİ A.Ş.',
  taxNumber: SATICI_VKN, taxOffice: 'Karşıyaka VD', city: 'İzmir', district: 'Karşıyaka',
  type: 'SUPPLIER', balance: 0, totalDebit: 0, totalCredit: 0,
} as unknown as Customer;

// ⚠️ `currentStock` AÇILIŞ HAREKETİYLE TUTARLI yazılır (40 = 40 IN). Yazmasaydık
// ilk senkron transaction'ı `recalculateBalances`ı çalıştırır, stok 0 → 40 olur
// ve "senkron hiçbir şeyi değiştirmedi" iddiası YANLIŞ YERE kırılırdı.
const prd = {
  id: 'prd-senkron', tenantId, code: 'SNK-100', name: 'Senkron Ürün', unit: 'Adet',
  purchasePrice: 10, salePrice: 20, vatRate: 20, currentStock: ACIK_STOK, stock: ACIK_STOK,
  criticalStock: 0, warehouseId: 'wh-default', active: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Product;

// ── Taklit sağlayıcı ────────────────────────────────────────────────────────

/** Listedeki bir belge. `icerikHatasi` → §7: içerik ALINAMIYOR. */
interface TaklitBelge {
  uuid: string;
  invoiceNo: string;
  xmlContent: string;
  documentKind: 'INVOICE' | 'DESPATCH';
  appType: number;
  icerikHatasi?: boolean;
}

/** Liste ucunun taşıma davranışı — 401/500/timeout senaryoları için. */
type ListeDavranisi = 'OK' | 'TIMEOUT' | 'UNAUTHORIZED' | 'SERVER_ERROR';

/**
 * TAKLİT SAĞLAYICI — ağ isteği YAPMAZ.
 *
 * ⚠️ Taşıma hataları YUTULMAZ (bkz. `ListeDavranisi`). 401/500/timeout "0 belge"
 * gibi görünseydi kullanıcı "gelen kutun boş" sanardı — sessiz başarısızlık.
 */
class TaklitSaglayici {
  public readonly providerId = 'SENKRON_TAKLIT';
  public readonly name = 'Senkron Taklit (test)';
  public readonly capabilities = {
    supportsEInvoice: true, supportsEArchive: true, supportsEDespatch: true,
    supportsIncoming: true, supportsCancel: false, supportsWebhook: false,
    supportsPdfDownload: false, supportsStatusQuery: false,
  };

  /** Liste ucuna GİDEN son aralık — "aralık gerçekten iletildi mi" kanıtı. */
  public sonAralik: { startDate: string; endDate?: string } | null = null;
  /** Liste kaç kez çağrıldı — "kontrolsüz tekrarlı çekim yok" kanıtı. */
  public listeCagriSayisi = 0;

  constructor(
    private readonly belgeler: TaklitBelge[],
    private readonly davranis: ListeDavranisi = 'OK'
  ) {}

  public async getIncomingInvoices(startDate: string, _settings: any, endDate?: string): Promise<any[]> {
    this.listeCagriSayisi++;
    this.sonAralik = { startDate, endDate };

    if (this.davranis === 'TIMEOUT') throw new ProviderTransportError('Entegratör zaman aşımına uğradı (timeout).');
    if (this.davranis === 'UNAUTHORIZED') throw new ProviderTransportError('Entegratör kimlik doğrulaması başarısız (401).');
    if (this.davranis === 'SERVER_ERROR') throw new ProviderTransportError('Entegratör sunucu hatası (500).');

    // ⚠️ Liste ucu YALNIZ meta veri döner (gerçek sağlayıcı da öyle): `xmlContent`
    // KASTEN boş bırakılır ki içerik indirme yolu gerçekten sınansın.
    return this.belgeler.map(b => ({
      uuid: b.uuid,
      invoiceNo: b.invoiceNo,
      supplierVkn: SATICI_VKN,
      supplierTitle: tedarikci.title,
      issueDate: '2026-09-20',
      subTotal: 0, vatAmount: 0, grandTotal: 0, currency: 'TRY',
      documentKind: b.documentKind,
      appType: b.appType,
    }));
  }

  public async getIncomingDocumentContent(uuid: string, _appType: number) {
    const b = this.belgeler.find(x => x.uuid === uuid);
    if (!b) return { success: false, content: '', message: 'Belge bulunamadı (taklit).' };
    if (b.icerikHatasi) {
      return { success: false, content: '', message: 'Entegratör belge içeriğini boş döndürdü.' };
    }
    return { success: true, content: b.xmlContent };
  }
}

/** Taklidi (yeni belge kümesiyle) kaydeder — her test kendi taklidini kurar. */
function saglayiciKur(belgeler: TaklitBelge[], davranis: ListeDavranisi = 'OK'): TaklitSaglayici {
  const s = new TaklitSaglayici(belgeler, davranis);
  ProviderFactory.registerProvider(s as any);
  return s;
}

// ── Mutation yokluğu kanıtı ─────────────────────────────────────────────────

/**
 * Diskteki TAZE hâlden mali parmak izi.
 *
 * ⚠️ Bellekteki özet YETMEZ: bir yazım yalnız belleğe uygulanıp diske
 * yansımamış olabilir (2026-09-28'de tam bu yaşandı). Ayrıca `runTransaction`
 * sonunda `this.db` YENİ bir klonla değişir; elimizdeki referanslar bayatlar.
 */
function maliParmakIzi(): string {
  const yol = path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath);
  const d = JSON.parse(fs.readFileSync(yol, 'utf8'));
  const p = (d.products || []).find((x: any) => x.id === prd.id);
  const c = (d.customers || []).find((x: any) => x.id === tedarikci.id);
  return JSON.stringify({
    urunStok: p?.currentStock,
    urunStokAlan: p?.stock,
    cariBakiye: c?.balance,
    cariBorc: c?.totalDebit,
    cariAlacak: c?.totalCredit,
    faturaSayisi: (d.invoices || []).filter((i: any) => i.tenantId === tenantId).length,
    irsaliyeSayisi: (d.waybills || []).filter((w: any) => w.tenantId === tenantId).length,
    stokHareket: (d.stockMovements || []).filter((m: any) => m.tenantId === tenantId).length,
    cariHareket: (d.currentTransactions || []).filter((t: any) => t.tenantId === tenantId).length,
    hesapHareket: (d.accountTransactions || []).filter((t: any) => t.tenantId === tenantId).length,
    urunSayisi: (d.products || []).filter((x: any) => x.tenantId === tenantId).length,
    cariSayisi: (d.customers || []).filter((x: any) => x.tenantId === tenantId).length,
  });
}

/** Gelen belge havuzunun boyutu — "yalnız havuz doldu" iddiasının ölçüsü. */
function havuzSayisi(tur: 'INVOICE' | 'DESPATCH'): number {
  const db = storage.getState();
  const liste = tur === 'INVOICE' ? db.incomingInvoices : db.incomingDespatches;
  return (liste || []).filter(x => x.tenantId === tenantId).length;
}

/**
 * Havuzda bir ETTN KAÇ KEZ var?
 *
 * ⚠️ NEDEN MUTLAK SAYI YETMEZ: testler AYNI depoyu paylaşır ve sırayla koşar.
 * "Havuz 3 olmalı" gibi bir iddia, önceki testlerin bıraktığı belgeleri de
 * sayar ve testin kendi konusuyla ilgisi olmayan bir sebeple kırılır. Mükerrer
 * iddiasının doğru ölçüsü "bu ETTN'den kaç kayıt var"dır — bir olmalıdır.
 */
function ettnAdedi(tur: 'INVOICE' | 'DESPATCH', uuid: string): number {
  const db = storage.getState();
  const liste = tur === 'INVOICE' ? db.incomingInvoices : db.incomingDespatches;
  return (liste || []).filter(x => x.uuid === uuid).length;
}

/**
 * Senkronu koşar ve §3'ü kanıtlar: senkron sırasında stok/cari/fatura
 * DEĞİŞMEMELİ; yalnız gelen belge havuzu dolmalı.
 */
async function senkronEtVeGuvenligiKanitla(
  tur: 'INVOICE' | 'DESPATCH',
  aralik?: Parameters<typeof IncomingInvoiceService.syncIncomingInvoices>[1]
) {
  const once = maliParmakIzi();
  const sonuc = tur === 'INVOICE'
    ? await IncomingInvoiceService.syncIncomingInvoices(tenantId, aralik, { userId: 'usr-test', username: 'Test Kullanıcı' })
    : await IncomingDespatchService.syncIncomingDespatches(tenantId, aralik, { userId: 'usr-test', username: 'Test Kullanıcı' });
  assert.equal(
    maliParmakIzi(), once,
    `SENKRON MALİ DURUMU DEĞİŞTİRDİ (${tur}) — stok/cari/fatura sabit kalmalıydı`
  );
  return sonuc;
}

// ── Kurulum ─────────────────────────────────────────────────────────────────

function kurulum() {
  const db = storage.getState();

  // Önceki koşumdan kalan izler temizlenir (yalnız bu kiracı).
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
  db.products.push(prd);

  // Stok HAREKETLE kurulur: `recalculateBalances` stoğu stok hareketlerinden
  // yeniden hesaplar (bkz. ingestion testi).
  db.stockMovements.push({
    id: 'sm-senkron-acilis', tenantId, productId: prd.id, productCode: prd.code,
    productName: prd.name, warehouseId: 'wh-default', documentNo: 'AÇILIŞ',
    documentType: 'OPENING', movementType: 'PURCHASE', quantity: ACIK_STOK, direction: 'IN',
    unitPrice: 10, totalAmount: 400, currency: 'TRY', date: '2026-01-01',
    userId: 'usr-test', createdBy: 'Test', createdAt: '2026-01-01T00:00:00.000Z',
  } as any);

  // Entegratör AÇIKÇA taklide yönlendirilir; fabrika fail-closed olduğu için
  // tanınmayan kimlik hata verirdi (bkz. providerFactory başlığı).
  db.tenantEinvoiceSettings.push({
    id: `eis-${tenantId}`, tenantId, providerId: 'SENKRON_TAKLIT',
    environment: 'TEST', senderIdentifier: ALICI_VKN, status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as any);

  storage.save();
}

const U = (n: number) => `bbbbbbbb-cccc-dddd-eeee-${String(n).padStart(12, '0')}`;

function faturaBelgesi(n: number, kalem = 1, kdv = 20): TaklitBelge {
  const uuid = U(n);
  const belgeNo = `SNK-${String(n).padStart(3, '0')}`;
  return {
    uuid,
    invoiceNo: belgeNo,
    xmlContent: kalem === 1
      ? faturaXml({
          uuid, belgeNo,
          saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
          aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
          satirlar: [{ no: '1', ad: 'Senkron Kalem', kod: 'SNK-100', miktar: 2, fiyat: 100, kdv }],
        })
      : cokSatirliBelge(uuid, belgeNo, kalem, {
          kodOnEki: 'SNK', kdv,
          saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
          aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
        }),
    documentKind: 'INVOICE',
    appType: 1,
  };
}

function irsaliyeBelgesi(n: number, kalem = 1): TaklitBelge {
  const uuid = U(1000 + n);
  const belgeNo = `SNKI-${String(n).padStart(3, '0')}`;
  return {
    uuid,
    invoiceNo: belgeNo,
    xmlContent: irsaliyeXml({
      uuid, belgeNo,
      saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
      aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
      satirlar: Array.from({ length: kalem }, (_, i) => ({
        no: String(i + 1), ad: `İrsaliye Kalemi ${i + 1}`, kod: `SNK-${200 + i}`, miktar: i + 1,
      })),
    }),
    documentKind: 'DESPATCH',
    appType: 3,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1 — HİÇ BELGE YOK
// ════════════════════════════════════════════════════════════════════════════

test('1) 0 belge: senkron "hiçbir şey yok" der, hata VERMEZ ve sayı uydurmaz', async () => {
  saglayiciKur([]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.foundCount, 0);
  assert.equal(r.newCount, 0);
  assert.equal(r.duplicateCount, 0);
  assert.equal(r.errorCount, 0);
  assert.equal(r.skippedCount, 0);
  assert.equal(r.documents.length, 0);
  assert.equal(r.syncedCount, 0);
  assert.equal(havuzSayisi('INVOICE'), 0);
});

// ════════════════════════════════════════════════════════════════════════════
// 2 — TEK BELGE
// ════════════════════════════════════════════════════════════════════════════

test('2) 1 belge: "1 bulundu / 1 yeni / 0 mükerrer / 0 hata" döner ve kalemler okunur', async () => {
  const b = faturaBelgesi(1);
  saglayiciKur([b]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.foundCount, 1);
  assert.equal(r.newCount, 1);
  assert.equal(r.duplicateCount, 0);
  assert.equal(r.errorCount, 0);
  assert.deepEqual(r.documents.map(d => d.outcome), ['NEW']);

  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === b.uuid)!;
  assert.ok(kayit, 'belge havuza yazılmalı');
  assert.equal(kayit.status, 'RECEIVED');
  assert.equal(kayit.items.length, 1);
  assert.equal(kayit.items[0].quantity, 2);
  assert.equal(kayit.items[0].unitPrice, 100);
  assert.equal(kayit.items[0].vatRate, 20);
  assert.ok(kayit.xmlStoragePath, 'içerik diske yazılmalı');
});

// ════════════════════════════════════════════════════════════════════════════
// 3 — 50 BELGE
// ════════════════════════════════════════════════════════════════════════════

test('3) 50 belge: 50/50 okunur, hepsi YENİ, mali durum DEĞİŞMEZ', async () => {
  const belgeler = Array.from({ length: 50 }, (_, i) => faturaBelgesi(100 + i));
  const sag = saglayiciKur(belgeler);
  const havuzOnce = havuzSayisi('INVOICE');
  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.foundCount, 50);
  assert.equal(r.newCount, 50);
  assert.equal(r.errorCount, 0);
  assert.equal(r.skippedCount, 0);
  assert.equal(r.truncated, false);
  // ⚠️ Liste ucu TEK çağrıda döner — sağlayıcıda sayfalama YOKTUR; aralık
  // tek çağrıyla istenir (provider sözleşmesi, bkz. referans memory).
  assert.equal(sag.listeCagriSayisi, 1, 'liste ucu tek kez çağrılmalı');
  // ⚠️ ARTIŞ ölçülür, mutlak sayı değil: testler aynı depoyu paylaşır ve
  // sırayla koşar; mutlak sayı önceki testlerin belgelerini de sayardı.
  assert.equal(havuzSayisi('INVOICE'), havuzOnce + 50, 'havuz tam 50 belge büyümeli');
  for (const b of belgeler) assert.equal(ettnAdedi('INVOICE', b.uuid), 1, `${b.invoiceNo} havuza girmeli`);
});

// ════════════════════════════════════════════════════════════════════════════
// 4 — KONTROLSÜZ TOPLU İNDİRME YOK (kota) + KAYBOLAN BELGE YOK
// ════════════════════════════════════════════════════════════════════════════

test('4) kota: 150 belgelik aralıkta indirme sınırlıdır, belge KAYBOLMAZ', async () => {
  const belgeler = Array.from({ length: MAX_CONTENT_DOWNLOADS_PER_SYNC + 50 }, (_, i) => faturaBelgesi(300 + i));
  saglayiciKur(belgeler);
  const havuzOnce = havuzSayisi('INVOICE');

  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.foundCount, MAX_CONTENT_DOWNLOADS_PER_SYNC + 50);
  assert.equal(r.newCount, MAX_CONTENT_DOWNLOADS_PER_SYNC, 'kota kadar indirilir');
  assert.equal(r.skippedCount, 50, 'kalan belgeler ERTELENİR, kaybolmaz');
  assert.equal(r.truncated, true);
  assert.equal(havuzSayisi('INVOICE'), havuzOnce + MAX_CONTENT_DOWNLOADS_PER_SYNC);
  assert.ok(
    r.documents.some(d => d.outcome === 'SKIPPED' && /en fazla .* belge indirilebilir/i.test(d.message || '')),
    'ertelenen belge kullanıcıya gerekçesiyle bildirilmeli'
  );

  // İkinci tur: aynı aralık yeniden çekilir. Mükerrerler İÇERİK İNDİRMEZ, bu
  // yüzden kota GERÇEK yeni belgelere harcanır ve ilerleme kaydedilir.
  saglayiciKur(belgeler);
  const r2 = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r2.duplicateCount, MAX_CONTENT_DOWNLOADS_PER_SYNC, 'ilk turun tamamı mükerrer sayılmalı');
  assert.equal(r2.newCount, 50, 'ikinci turda kalan belgeler alınmalı');
  assert.equal(r2.skippedCount, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// 5 — MÜKERRER (idempotency)
// ════════════════════════════════════════════════════════════════════════════

test('5) mükerrer: aynı ETTN ikinci turda DUPLICATE sayılır, YENİ KAYIT AÇILMAZ', async () => {
  const belgeler = Array.from({ length: 3 }, (_, i) => faturaBelgesi(500 + i));
  saglayiciKur(belgeler);
  const havuzOnce = havuzSayisi('INVOICE');
  const ilk = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(ilk.newCount, 3);
  assert.equal(ilk.duplicateCount, 0);
  const havuzIlk = havuzSayisi('INVOICE');
  assert.equal(havuzIlk, havuzOnce + 3, 'bu testin 3 belgesi havuza girmeli');

  const ikinci = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(ikinci.foundCount, 3);
  assert.equal(ikinci.newCount, 0, 'ikinci turda hiç yeni kayıt olmamalı');
  assert.equal(ikinci.duplicateCount, 3, 'mükerrerler SAYILMALI (0 değil)');
  assert.equal(ikinci.documents.filter(d => d.outcome === 'DUPLICATE').length, 3);
  assert.equal(havuzSayisi('INVOICE'), havuzIlk, 'mükerrerler ikinci kayıt AÇMAMALI');
  // Her ETTN TEK kayıt olmalı — mükerrerliğin asıl ölçüsü budur.
  for (const b of belgeler) assert.equal(ettnAdedi('INVOICE', b.uuid), 1, `${b.invoiceNo} tek kayıt olmalı`);
});

test('5b) aynı ETTN listede İKİ KEZ gelirse de tek kayıt oluşur', async () => {
  const b = faturaBelgesi(600);
  saglayiciKur([b, { ...b }]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.foundCount, 2);
  assert.equal(r.newCount, 1, 'aynı ETTN iki kez yazılmamalı');
  assert.equal(r.duplicateCount, 1);
  const havuz = (storage.getState().incomingInvoices || []).filter(i => i.uuid === b.uuid);
  assert.equal(havuz.length, 1);
});

// ════════════════════════════════════════════════════════════════════════════
// 6 — XML ALINAMIYOR (§7)
// ════════════════════════════════════════════════════════════════════════════

test('6) XML alınamıyor: HATA durumu + açık mesaj, UYDURMA kalem yok', async () => {
  const b = { ...faturaBelgesi(700), icerikHatasi: true };
  saglayiciKur([b]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.foundCount, 1);
  assert.equal(r.errorCount, 1);
  assert.equal(r.newCount, 1, 'belge havuzda GÖRÜNMELİ (kullanıcı varlığını bilmeli)');

  const hata = r.documents.find(d => d.outcome === 'ERROR')!;
  assert.ok(hata, 'hata belge bazlı raporlanmalı');
  assert.equal(hata.documentNo, b.invoiceNo);
  assert.equal(hata.uuid, b.uuid);
  assert.ok(
    /UBL\/XML içeriği alınamadı/.test(hata.message || ''),
    `mesaj "UBL/XML içeriği alınamadı" demeli, gelen: ${hata.message}`
  );

  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === b.uuid)!;
  assert.equal(kayit.status, 'UNREADABLE');
  assert.equal(kayit.items.length, 0, 'okunamayan belgeden kalem UYDURULMAMALI');
  assert.equal(kayit.xmlStoragePath, undefined, 'içerik yoksa dosya da yazılmamalı');
});

test('6b) XML sonradan gelirse: kayıt GÜNCELLENİR, ikinci kayıt AÇILMAZ', async () => {
  const uuid = U(800);
  const belge: TaklitBelge = {
    uuid, invoiceNo: 'SNK-800', icerikHatasi: true, documentKind: 'INVOICE', appType: 1,
    xmlContent: faturaXml({
      uuid, belgeNo: 'SNK-800', saticiVkn: SATICI_VKN, saticiUnvan: tedarikci.title,
      aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
      satirlar: [{ no: '1', ad: 'Sonradan Gelen', kod: 'SNK-100', miktar: 4, fiyat: 25, kdv: 10 }],
    }),
  };

  saglayiciKur([belge]);
  const ilk = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(ilk.errorCount, 1);
  assert.equal(ilk.updatedCount, 0);

  // İkinci tur: içerik artık alınabiliyor.
  saglayiciKur([{ ...belge, icerikHatasi: false }]);
  const ikinci = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(ikinci.updatedCount, 1, 'okunamayan kayıt GÜNCELLENMELİ');
  assert.equal(ikinci.newCount, 0, 'ikinci kayıt AÇILMAMALI');
  assert.equal(ikinci.errorCount, 0);

  const havuz = (storage.getState().incomingInvoices || []).filter(i => i.uuid === uuid);
  assert.equal(havuz.length, 1, 'aynı ETTN için tek kayıt olmalı');
  assert.equal(havuz[0].status, 'RECEIVED');
  assert.equal(havuz[0].items.length, 1);
  assert.equal(havuz[0].items[0].unitPrice, 25);
  assert.equal(havuz[0].items[0].vatRate, 10);
  assert.equal((havuz[0] as any).parseErrors, undefined, 'hata izi temizlenmeli');
});

// ════════════════════════════════════════════════════════════════════════════
// 7 — BOZUK XML
// ════════════════════════════════════════════════════════════════════════════

test('7) bozuk XML: UNREADABLE olur, çökme yok, kalem uydurulmaz', async () => {
  const b: TaklitBelge = {
    uuid: U(900), invoiceNo: 'SNK-BOZUK',
    xmlContent: '<?xml version="1.0" encoding="UTF-8"?><Invoice><cbc:ID>kapanmamis',
    documentKind: 'INVOICE', appType: 1,
  };
  saglayiciKur([b]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.errorCount, 1);
  assert.ok(
    !/UBL\/XML içeriği alınamadı/.test(r.documents[0].message || ''),
    'içerik GELDİ ama bozuk — mesaj bunu ayırt etmeli'
  );

  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === b.uuid)!;
  assert.equal(kayit.status, 'UNREADABLE');
  assert.equal(kayit.items.length, 0);
  assert.ok((kayit.parseErrors || []).length > 0, 'hata gerekçesi saklanmalı');
});

// ════════════════════════════════════════════════════════════════════════════
// 8 — XXE
// ════════════════════════════════════════════════════════════════════════════

test('8) XXE yükü: diske YAZILMAZ, çözümlenmez, kullanıcı gerekçeyi görür', async () => {
  const xxe =
    '<?xml version="1.0"?>' +
    '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">' +
    '<cbc:ID>&xxe;</cbc:ID></Invoice>';
  const b: TaklitBelge = { uuid: U(901), invoiceNo: 'SNK-XXE', xmlContent: xxe, documentKind: 'INVOICE', appType: 1 };
  saglayiciKur([b]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.errorCount, 1);

  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === b.uuid)!;
  assert.equal(kayit.status, 'UNREADABLE');
  assert.equal(kayit.xmlStoragePath, undefined, 'XXE içeren belge DİSKE YAZILMAMALI');
  assert.equal(kayit.items.length, 0);
  assert.ok(
    (kayit.parseErrors || []).some(e => /XXE|ENTITY|DTD/i.test(e)),
    `gerekçe güvenlik ihlalini söylemeli: ${JSON.stringify(kayit.parseErrors)}`
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 9 — TAŞIMA HATALARI (timeout / 401 / 500)
// ════════════════════════════════════════════════════════════════════════════

test('9) timeout: senkron SESSİZCE "0 belge" GÖRÜNMEZ, hata fırlar', async () => {
  const once = maliParmakIzi();
  const havuzOnce = havuzSayisi('INVOICE');
  saglayiciKur([faturaBelgesi(1)], 'TIMEOUT');
  await assert.rejects(
    () => IncomingInvoiceService.syncIncomingInvoices(tenantId),
    (err: any) => {
      assert.ok(ProviderTransportError.is(err), 'taşıma hatası olarak tanınmalı');
      assert.ok(/zaman aşımı|timeout/i.test(err.message), `gelen: ${err.message}`);
      return true;
    }
  );
  assert.equal(havuzSayisi('INVOICE'), havuzOnce, 'başarısız senkron havuzu DEĞİŞTİRMEMELİ');
  assert.equal(maliParmakIzi(), once);
});

test('9b) entegratör 401: hata AÇIKÇA bildirilir, "gelen kutu boş" DENMEZ', async () => {
  const havuzOnce = havuzSayisi('INVOICE');
  saglayiciKur([faturaBelgesi(1)], 'UNAUTHORIZED');
  await assert.rejects(
    () => IncomingInvoiceService.syncIncomingInvoices(tenantId),
    (err: any) => {
      assert.ok(ProviderTransportError.is(err));
      assert.ok(/401|kimlik/i.test(err.message), `gelen: ${err.message}`);
      return true;
    }
  );
  assert.equal(havuzSayisi('INVOICE'), havuzOnce);
});

test('9c) entegratör 500: hata AÇIKÇA bildirilir ve hiçbir belge yazılmaz', async () => {
  const havuzOnce = havuzSayisi('INVOICE');
  const once = maliParmakIzi();
  saglayiciKur([faturaBelgesi(2), faturaBelgesi(3)], 'SERVER_ERROR');
  await assert.rejects(
    () => IncomingInvoiceService.syncIncomingInvoices(tenantId),
    (err: any) => {
      assert.ok(ProviderTransportError.is(err));
      assert.ok(/500|sunucu/i.test(err.message), `gelen: ${err.message}`);
      return true;
    }
  );
  assert.equal(havuzSayisi('INVOICE'), havuzOnce);
  assert.equal(maliParmakIzi(), once);
});

// ════════════════════════════════════════════════════════════════════════════
// 10 — TÜRKÇE KARAKTER
// ════════════════════════════════════════════════════════════════════════════

test('10) Türkçe karakter: İ/ğ/ş/ı/Ç bozulmadan saklanır', async () => {
  const uuid = U(902);
  const unvan = 'ÖZTÜRK İNŞAAT ĞÜŞİÇÖ A.Ş. — Şişli/İstanbul';
  const xml = faturaXml({
    uuid, belgeNo: 'SNK-TR-1', saticiVkn: SATICI_VKN, saticiUnvan: unvan,
    aliciVkn: ALICI_VKN, aliciUnvan: tenant.title,
    satirlar: [{ no: '1', ad: 'Çelik Şişe Kapağı (İçecek)', kod: 'SNK-100', miktar: 1, fiyat: 10, kdv: 20 }],
  });
  saglayiciKur([{ uuid, invoiceNo: 'SNK-TR-1', xmlContent: xml, documentKind: 'INVOICE', appType: 1 }]);

  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.errorCount, 0);
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === uuid)!;
  assert.equal(kayit.supplierTitle, unvan, 'Türkçe unvan BİREBİR korunmalı');
  assert.equal(kayit.items[0].name, 'Çelik Şişe Kapağı (İçecek)');
});

// ════════════════════════════════════════════════════════════════════════════
// 11 — 100 KALEM
// ════════════════════════════════════════════════════════════════════════════

test('11) 100 kalem: tamamı okunur, tek kalem kaybolmaz', async () => {
  const b = faturaBelgesi(903, 100, 20);
  saglayiciKur([b]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(r.errorCount, 0);
  const kayit = (storage.getState().incomingInvoices || []).find(i => i.uuid === b.uuid)!;
  assert.equal(kayit.items.length, 100, '100 kalemin tamamı saklanmalı');
  // Miktarlar 1..100 — sıralama ve kayıp denetimi.
  assert.deepEqual(kayit.items.map(i => i.quantity), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.ok(kayit.grandTotal > 0);
});

// ════════════════════════════════════════════════════════════════════════════
// 12 — INVOICE akışı
// ════════════════════════════════════════════════════════════════════════════

test('12) Invoice: fatura akışına girer, irsaliye akışına SIZMAZ', async () => {
  const b = faturaBelgesi(904);
  saglayiciKur([b]);
  const fatura = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(fatura.newCount, 1);

  saglayiciKur([b]);
  const irsaliye = await senkronEtVeGuvenligiKanitla('DESPATCH');
  assert.equal(irsaliye.foundCount, 0, 'e-Fatura, gelen e-İrsaliye akışına GİRMEMELİ');

  const irsaliyeHavuzu = (storage.getState().incomingDespatches || []).filter(d => d.tenantId === tenantId);
  assert.equal(irsaliyeHavuzu.length, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// 13 — DESPATCHADVICE akışı
// ════════════════════════════════════════════════════════════════════════════

test('13) DespatchAdvice: irsaliye akışına girer, FİYAT UYDURULMAZ, fatura akışına sızmaz', async () => {
  const b = irsaliyeBelgesi(1, 3);
  saglayiciKur([b]);
  const irsaliye = await senkronEtVeGuvenligiKanitla('DESPATCH');
  assert.equal(irsaliye.foundCount, 1);
  assert.equal(irsaliye.newCount, 1);
  assert.equal(irsaliye.errorCount, 0);

  const kayit = (storage.getState().incomingDespatches || []).find(d => d.uuid === b.uuid)!;
  assert.equal(kayit.status, 'RECEIVED');
  assert.equal(kayit.items.length, 3);
  // ⚠️ İrsaliyede birim fiyat/KDV YOKTUR; 0 yazmak "bedelsiz mal" izlenimi
  // verirdi — alan TANIMSIZ kalmalı.
  assert.equal(kayit.items[0].unitPrice, undefined);
  assert.equal(kayit.items[0].vatRate, undefined);
  assert.deepEqual(kayit.items.map(i => i.quantity), [1, 2, 3]);

  // Aynı belge FATURA akışında görünmemeli.
  saglayiciKur([b]);
  const fatura = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.equal(fatura.foundCount, 0, 'e-İrsaliye, gelen fatura akışına GİRMEMELİ');
});

// ════════════════════════════════════════════════════════════════════════════
// 14 — TARİH ARALIĞI (§4)
// ════════════════════════════════════════════════════════════════════════════

test('14) tarih aralığı: Bugün / Son 7 / Son 30 sunucuda hesaplanır ve uca İLETİLİR', async () => {
  const gun = (d: Date) => d.toISOString().slice(0, 10);
  const bugun = gun(new Date());

  const beklenen: Array<{ preset: 'TODAY' | 'LAST_7' | 'LAST_30'; gunOnce: number }> = [
    { preset: 'TODAY', gunOnce: 0 },
    { preset: 'LAST_7', gunOnce: 6 },
    { preset: 'LAST_30', gunOnce: 29 },
  ];

  for (const k of beklenen) {
    const sag = saglayiciKur([]);
    const r = await senkronEtVeGuvenligiKanitla('INVOICE', { preset: k.preset });
    const beklenenBas = gun(new Date(Date.now() - k.gunOnce * 86400000));
    assert.equal(r.dateRange.startDate, beklenenBas, `${k.preset} başlangıcı`);
    assert.equal(r.dateRange.endDate, bugun, `${k.preset} bitişi`);
    assert.equal(r.rangePreset, k.preset);
    // ⚠️ Aralık GERÇEKTEN sağlayıcıya iletilmeli — yalnız özete yazmak yetmez.
    assert.equal(sag.sonAralik?.startDate, beklenenBas, 'aralık sağlayıcıya iletilmeli');
    assert.equal(sag.sonAralik?.endDate, bugun, 'bitiş tarihi sağlayıcıya iletilmeli');
  }
});

test('14b) özel tarih: verilen aralık aynen kullanılır', async () => {
  const sag = saglayiciKur([]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE', {
    preset: 'CUSTOM', startDate: '2026-09-01', endDate: '2026-09-10',
  });
  assert.equal(r.dateRange.startDate, '2026-09-01');
  assert.equal(r.dateRange.endDate, '2026-09-10');
  assert.equal(r.rangePreset, 'CUSTOM');
  assert.equal(sag.sonAralik?.startDate, '2026-09-01');
  assert.equal(sag.sonAralik?.endDate, '2026-09-10');
});

test('14c) ters aralık: sessizce düzeltilmez, kullanıcıya SÖYLENİR', async () => {
  saglayiciKur([]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE', {
    preset: 'CUSTOM', startDate: '2026-09-10', endDate: '2026-09-01',
  });
  assert.equal(r.dateRange.startDate, '2026-09-01');
  assert.equal(r.dateRange.endDate, '2026-09-10');
  assert.ok(r.rangeAdjustment, 'düzeltme kullanıcıya bildirilmeli');
  assert.ok(/yer değiştirildi/i.test(r.rangeAdjustment!), r.rangeAdjustment);
});

test('14d) aşırı geniş aralık: 90 güne kısaltılır ve GEREKÇESİ döner', async () => {
  const gun = (d: Date) => d.toISOString().slice(0, 10);
  const bugun = gun(new Date());
  const cokEski = gun(new Date(Date.now() - 400 * 86400000));

  saglayiciKur([]);
  const r = await senkronEtVeGuvenligiKanitla('INVOICE', {
    preset: 'CUSTOM', startDate: cokEski, endDate: bugun,
  });
  assert.ok(r.rangeAdjustment, 'kısaltma sessiz OLMAMALI');
  assert.ok(new RegExp(String(MAX_RANGE_DAYS)).test(r.rangeAdjustment!), r.rangeAdjustment);

  const fark = Math.round(
    (new Date(r.dateRange.endDate).getTime() - new Date(r.dateRange.startDate).getTime()) / 86400000
  );
  assert.equal(fark, MAX_RANGE_DAYS, 'kısaltılmış aralık tam 90 gün olmalı');
});

test('14e) aralık yardımcıları: ters aralık ve geçersiz biçim sessizce geçmez', () => {
  const ters = clampDateRange('2026-09-10', '2026-09-01');
  assert.equal(ters.startDate, '2026-09-01');
  assert.ok(ters.adjustment);

  const bozuk = clampDateRange('10/09/2026', '2026-09-01');
  assert.ok(bozuk.adjustment, 'geçersiz biçim kullanıcıya bildirilmeli');

  const otuz = resolveDateRange('LAST_30');
  assert.equal(otuz.preset, 'LAST_30');
  assert.ok(otuz.startDate && otuz.endDate);

  // Eski istemci `{ startDate }` gönderirse "özel aralık" sayılmalı; "son 30
  // gün" saymak kullanıcının seçtiği başlangıcı SESSİZCE yok sayardı.
  const eski = resolveDateRange(undefined, '2026-09-05');
  assert.equal(eski.preset, 'CUSTOM');
  assert.equal(eski.startDate, '2026-09-05');
});

// ════════════════════════════════════════════════════════════════════════════
// 15 — DENETİM İZİ (§9)
// ════════════════════════════════════════════════════════════════════════════

test('15) denetim izi: kim, hangi aralık, kaç bulundu/yeni/mükerrer/hatalı yazılır', async () => {
  saglayiciKur([faturaBelgesi(910), faturaBelgesi(911)]);
  await senkronEtVeGuvenligiKanitla('INVOICE', { preset: 'LAST_7' });

  const loglar = (storage.getState().auditLogs || []).filter(
    (l: any) => l.action === 'INCOMING_INVOICE_SYNC' && l.companyId === tenantId
  );
  assert.ok(loglar.length >= 1, 'senkron denetim kaydı bırakmalı');
  const log: any = loglar[0];
  assert.equal(log.userId, 'usr-test');
  assert.equal(log.username, 'Test Kullanıcı');
  assert.ok(/bulundu/.test(log.details), log.details);
  assert.ok(/mükerrer/.test(log.details), log.details);
  assert.ok(/Stok ve cari DEĞİŞMEDİ/.test(log.details), log.details);
  assert.ok(/→/.test(log.details), 'tarih aralığı kayda geçmeli: ' + log.details);
});

test('15b) denetim kaydı TOKEN/PAROLA/ETTN içermez (fatura + irsaliye)', async () => {
  saglayiciKur([faturaBelgesi(912)]);
  await senkronEtVeGuvenligiKanitla('INVOICE');
  saglayiciKur([irsaliyeBelgesi(3)]);
  await senkronEtVeGuvenligiKanitla('DESPATCH');

  const loglar = (storage.getState().auditLogs || []).filter(
    (l: any) => l.action === 'INCOMING_INVOICE_SYNC' || l.action === 'INCOMING_DESPATCH_SYNC'
  );
  assert.ok(loglar.length >= 2);
  const metin = JSON.stringify(loglar);
  assert.ok(!/bearer/i.test(metin), 'denetim kaydında token İZLERİ olmamalı');
  assert.ok(!/password|parola|sifre|şifre/i.test(metin), 'denetim kaydında parola geçmemeli');
  assert.ok(!metin.includes(U(912)), 'denetim kaydına ETTN listesi yazılmamalı');
  assert.ok(!metin.includes(U(1003)), 'irsaliye ETTN de yazılmamalı');
});

// ════════════════════════════════════════════════════════════════════════════
// 16 — SENKRON SONRASI HİÇBİR MALİ ETKİ YOK (toplu)
// ════════════════════════════════════════════════════════════════════════════

test('16) senkron SONRASI: stok, cari, alış faturası ve stok hareketi DEĞİŞMEZ', async () => {
  const once = maliParmakIzi();

  saglayiciKur([faturaBelgesi(920), faturaBelgesi(921), irsaliyeBelgesi(2, 2)]);
  const f = await senkronEtVeGuvenligiKanitla('INVOICE');
  assert.ok(f.newCount >= 1);
  const d = await senkronEtVeGuvenligiKanitla('DESPATCH');
  assert.ok(d.newCount >= 1);

  assert.equal(maliParmakIzi(), once, 'iki senkron sonunda da mali durum AYNI olmalı');

  // Havuz DOLMUŞ olmalı — "hiçbir şey değişmedi" iddiası havuzu kapsamaz.
  const db = storage.getState();
  assert.ok((db.incomingInvoices || []).some(i => i.uuid === U(920)));
  assert.ok((db.incomingDespatches || []).some(x => x.uuid === U(1002)));

  // Onaylanmadıkları için hiçbiri stok/cari üretmemiş olmalı.
  assert.equal((db.invoices || []).filter(i => i.tenantId === tenantId).length, 0, 'alış faturası oluşmamalı');
  assert.equal((db.waybills || []).filter(w => w.tenantId === tenantId).length, 0, 'irsaliye oluşmamalı');
  assert.equal((db.currentTransactions || []).filter(t => t.tenantId === tenantId).length, 0, 'cari hareket oluşmamalı');
  assert.equal((db.stockMovements || []).filter(m => m.tenantId === tenantId).length, 1, 'yalnız açılış hareketi kalmalı');

  const p = (db.products || []).find(x => x.id === prd.id)!;
  assert.equal(p.currentStock, ACIK_STOK, 'stok açılış değerinde kalmalı');
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

  console.log(`\nEntegratörden çek senkron sözleşmesi: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
