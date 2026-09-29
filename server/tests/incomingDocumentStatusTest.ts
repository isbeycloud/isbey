/**
 * GELEN BELGE OPERASYON DURUMU — DAVRANIŞ SÖZLEŞMESİ
 * ==========================================================================
 * 2026-09-29 — "YENİ / EŞLEŞTİRME BEKLİYOR / HAZIR / İÇERİ ALINDI / HATA"
 * durumlarının ve liste süzgeçlerinin sözleşmesi.
 *
 * NE ÖLÇÜYOR: Durum TÜRETİLMİŞ bir bilgidir ve yanlış türetilirse operatörün
 * iş listesini bozar. Ölçülen üç şey:
 *
 *   1. ÖNCELİK — içeri alınmış/okunamayan belge, bugünkü kart durumundan
 *      bağımsız olarak DOĞRU sınıfta kalır.
 *   2. AYRIM — "Yeni" ve "Eşleştirme Bekliyor" yalnız `reviewedAt` ile ayrılır;
 *      bu bilgi yoksa belge YENİ sayılır (eski kayıtlar dahil).
 *   3. SÜZGEÇ GÜVENLİĞİ — tanınmayan bir süzgeç değeri BOŞ liste döndürmez.
 *
 * Ayrıca GERÇEK HTTP ucundan `statusCounts` ve süzgeç davranışı doğrulanır:
 * saf fonksiyon testi, ucun bu fonksiyonu gerçekten kullandığını kanıtlamaz.
 *
 * İZOLASYON: Yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/incomingDocumentStatusTest.ts.json
 */

import assert from 'node:assert/strict';
import path from 'node:path';

const configuredPath = process.env.DATABASE_PATH || '';
if (process.env.NODE_ENV !== 'test' || path.basename(configuredPath) !== 'incomingDocumentStatusTest.ts.json') {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/incomingDocumentStatusTest.ts.json ile çalıştırılabilir.'
  );
}

import {
  operationalStatus,
  urunIndeksiKur,
  sayilariTopla,
  operasyonDurumunaUygun,
  OPERATIONAL_STATUS_LABELS,
} from '../services/incomingDocumentStatus';
import type { Product } from '../db/schema';

// ── Koşum düzeneği ──────────────────────────────────────────────────────────
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

const urun = (id: string, code: string, name: string, barcode?: string): Product =>
  ({
    id,
    tenantId: 'tnt-durum',
    code,
    ...(barcode ? { barcode } : {}),
    name,
    unit: 'Adet',
    purchasePrice: 0,
    salePrice: 0,
    vatRate: 20,
    currentStock: 0,
    stock: 0,
    criticalStock: 0,
    warehouseId: 'wh-default',
    active: true,
  } as unknown as Product);

const IDX = urunIndeksiKur([
  urun('p1', 'STK-001', 'Vida 3x10', '8690000000011'),
  urun('p2', 'STK-002', 'Somun M6'),
]);

// ════════════════════════════════════════════════════════════════════════════
// TEMEL DURUMLAR
// ════════════════════════════════════════════════════════════════════════════

test('içeri alınmış belge, kalemi eşleşmese bile İÇERİ ALINDI kalır', () => {
  // ⚠️ Kritik öncelik: dönüşümden sonra kullanıcı ürün kartını sildiyse kalem
  // artık "eşleşmiyor" görünür. Bu bilgiyi durum hesabına sokmak, GEÇMİŞTE
  // yapılmış bir işi "eşleştirme bekliyor" gibi gösterir ve operatör aynı
  // belgeyi ikinci kez içeri almaya çalışır.
  const d = operationalStatus('CONVERTED_TO_PURCHASE', [{ name: 'Artık Olmayan Ürün' }], IDX, false);
  assert.equal(d, 'INGESTED');
});

test('okunamayan belge her koşulda HATA kalır', () => {
  // Kalem listesi boş olmasa bile ham durum UNREADABLE ise hata sınıfındadır.
  const d = operationalStatus('UNREADABLE', [{ supplierProductCode: 'STK-001' }], IDX, true);
  assert.equal(d, 'ERROR');
});

test('reddedilen belge listeden DÜŞMEZ — HATA sınıfında görünür', () => {
  const d = operationalStatus('REJECTED', [{ supplierProductCode: 'STK-001' }], IDX, true);
  assert.equal(d, 'ERROR');
});

test('kalemsiz okunmuş belge HATA sayılır (içeri alınamaz)', () => {
  // Aksi hâlde kullanıcı "Hazır" görünen ama hiçbir şey yapamayacağı bir
  // belgeye yönlendirilirdi.
  const d = operationalStatus('RECEIVED', [], IDX, false);
  assert.equal(d, 'ERROR');
});

// ════════════════════════════════════════════════════════════════════════════
// EŞLEŞTİRME VE "YENİ" AYRIMI
// ════════════════════════════════════════════════════════════════════════════

test('tüm kalemler eşleşiyorsa HAZIR (bakılmamış olsa bile)', () => {
  const lines = [
    { supplierProductCode: 'STK-001' },
    { barcode: '8690000000011' },
    { name: 'Somun M6' },
  ];
  assert.equal(operationalStatus('RECEIVED', lines, IDX, false), 'READY');
});

test('YENİ ve EŞLEŞTİRME BEKLİYOR ayrımı yalnız `reviewedAt` ile yapılır', () => {
  const eksikKalemli = [{ supplierProductCode: 'YOK-1' }, { supplierProductCode: 'STK-001' }];
  // Bakılmamış → YENİ
  assert.equal(operationalStatus('RECEIVED', eksikKalemli, IDX, false), 'NEW');
  // Bakılmış → EŞLEŞTİRME BEKLİYOR
  assert.equal(operationalStatus('RECEIVED', eksikKalemli, IDX, true), 'PENDING_MATCH');
  // ⚠️ reviewedAt VERİLMEZSE de YENİ sayılır (eski kayıtlar böyle görünür).
  assert.equal(operationalStatus('RECEIVED', eksikKalemli, IDX), 'NEW');
});

test('eşleşme sırası: barkod kodu, kod da adı yener', () => {
  const barkodla = operationalStatus('RECEIVED', [{ supplierProductCode: 'BAMBASKA', barcode: '8690000000011' }], IDX);
  assert.equal(barkodla, 'READY', 'barkod eşleşmesi kodu geçersiz kılar');

  const adla = operationalStatus('RECEIVED', [{ supplierProductCode: 'BAMBASKA', name: 'vida 3x10' }], IDX);
  assert.equal(adla, 'READY', 'ad benzerliği (büyük/küçük harf, noktalama) yakalanmalı');
});

test('kod karşılaştırması boşluk ve harf farkına takılmaz', () => {
  assert.equal(operationalStatus('RECEIVED', [{ supplierProductCode: ' stk-001 ' }], IDX), 'READY');
});

test('silinmiş ürün eşleşmiş SAYILMAZ', () => {
  // ⚠️ `deletedAt` işaretli kart, kullanıcı için artık yoktur; onu "eşleşti"
  // saymak, belgeyi içeri alınabilir göstermek demektir.
  const idx = urunIndeksiKur([
    { ...urun('p9', 'STK-009', 'Silinmiş Ürün'), deletedAt: '2026-01-01T00:00:00.000Z' } as Product,
  ]);
  assert.equal(operationalStatus('RECEIVED', [{ supplierProductCode: 'STK-009' }], idx), 'NEW');
});

// ════════════════════════════════════════════════════════════════════════════
// SAYAÇLAR VE SÜZGEÇLER
// ════════════════════════════════════════════════════════════════════════════

test('sayaçlar: pendingOperation yalnız bekleyenleri toplar', () => {
  const s = sayilariTopla(['NEW', 'NEW', 'PENDING_MATCH', 'READY', 'INGESTED', 'ERROR']);
  assert.equal(s.NEW, 2);
  assert.equal(s.PENDING_MATCH, 1);
  assert.equal(s.READY, 1);
  assert.equal(s.INGESTED, 1);
  assert.equal(s.ERROR, 1);
  // İçeri alınmış ve hatalı belgeler BEKLEYEN SAYILMAZ.
  assert.equal(s.pendingOperation, 4);
});

test('her durumun Türkçe etiketi vardır', () => {
  for (const k of ['NEW', 'PENDING_MATCH', 'READY', 'INGESTED', 'ERROR'] as const) {
    assert.ok(OPERATIONAL_STATUS_LABELS[k], `${k} etiketi eksik`);
  }
});

test('süzgeç: ALL ve tanınmayan değer SÜZMEZ (boş liste dönmez)', () => {
  // ⚠️ Bilinmeyen bir süzgeç yüzünden boş liste dönmek, kullanıcıya "belge
  // yok" dedirtir ve gerçek işi gizler.
  assert.equal(operasyonDurumunaUygun('READY', 'ALL'), true);
  assert.equal(operasyonDurumunaUygun('READY', undefined), true);
  assert.equal(operasyonDurumunaUygun('READY', 'BILINMEYEN_DURUM'), false);
});

test('süzgeç: yalnız istenen durumu geçirir', () => {
  assert.equal(operasyonDurumunaUygun('READY', 'READY'), true);
  assert.equal(operasyonDurumunaUygun('READY', 'ERROR'), false);
});

// ── Koşucu ──────────────────────────────────────────────────────────────────

async function main() {
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
      console.error('      ' + (err?.message || String(err)));
    }
  }
  console.log(`\nGelen belge operasyon durumu sözleşmesi: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
}

main();
