/**
 * İŞBEY CLOUD — RAPOR OLUŞTURUCU MANTIĞI (2026-10-17)
 * ====================================================
 * Ölçülen sözleşme (`src/components/modules/raporlar/reportBuilderTypes.ts`):
 *
 *   1. FİLTRE SESSİZCE ELEMEZ. Tanımsız/boş liste = "seçili değil" → satır
 *      geçer. Yalnız DOLU liste süzer. Bu ayrım kaybolursa kullanıcı boş
 *      filtreyle "hiç kayıt yok" sanır (aynı sınıf hata: `search=undefined`).
 *   2. YENİ FİLTRELER GERÇEKTEN ÇALIŞIR: ürün, VARYANT (satırın varyantlarından
 *      en az biri), durum ve TUTAR ARALIĞI kayıt sayısını değiştirir.
 *   3. TUTAR: alt/üst sınır MUTLAK değer üzerinden karşılaştırılır; negatif
 *      (çıkış) satırlar da doğru süzülür.
 *   4. GRUPLAMA TEK KAYNAK: `groupTotals` toplamı = satırların toplamı.
 *      Grafik ve grup tablosu aynı fonksiyondan beslenir; çelişemezler.
 *   5. BOŞ FİLTRE NESNESİ KAYDEDİLMEZ (`hasDesignFilters`).
 *
 * Bu modül React'ten bağımsız saf fonksiyonlardır; ağa ÇIKMAZ.
 */
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const {
  applyFilters, groupTotals, hasDesignFilters,
} = await import('../../src/components/modules/raporlar/reportBuilderTypes');
type ReportRow = import('../../src/components/modules/raporlar/reportBuilderTypes').ReportRow;

const rows: ReportRow[] = [
  // Varyantlı satırlar: prd-1 (var-1 kırmızı, var-2 mavi)
  { date: '2026-09-05', customer: 'A Cari', customerId: 'cus-1', product: 'Urun 1', productId: 'prd-1', variantIds: ['var-1'], status: 'PAID', warehouseId: 'wh-1', amount: 100 },
  { date: '2026-09-10', customer: 'A Cari', customerId: 'cus-1', product: 'Urun 1', productId: 'prd-1', variantIds: ['var-2'], status: 'UNPAID', warehouseId: 'wh-1', amount: 250 },
  { date: '2026-09-20', customer: 'B Cari', customerId: 'cus-2', product: 'Urun 2', productId: 'prd-2', status: 'PARTIAL', warehouseId: 'wh-2', amount: 75 },
  // ÇIKIŞ satırı: negatif tutar (kasa ödemesi)
  { date: '2026-10-01', customer: 'B Cari', customerId: 'cus-2', product: 'Urun 2', productId: 'prd-2', status: 'PAID', warehouseId: 'wh-2', amount: -300 },
  // Tarihi olmayan satır (stok gibi): tarih filtresi bunu ELEMEZ
  { product: 'Urun 3', productId: 'prd-3', status: 'ACTIVE', warehouseId: 'wh-1', amount: 40 },
];

let checks = 0;
const check = (fn: () => void) => { fn(); checks++; };

try {
  // ── 1. BOŞ/TANIMSIZ FİLTRE ELEMEZ ──
  check(() => assert.equal(applyFilters(rows, undefined).length, 5, 'filtre yoksa hepsi gecer'));
  check(() => assert.equal(applyFilters(rows, {}).length, 5, 'bos nesne hepsini gecirir'));
  check(() => assert.equal(applyFilters(rows, { customerIds: [] }).length, 5,
    'BOS liste "secili degil" demektir, hicbir seyi elemez'));
  check(() => assert.equal(applyFilters(rows, { statuses: [] }).length, 5, 'bos durum listesi elemez'));
  check(() => assert.equal(applyFilters(rows, { variantIds: [] }).length, 5, 'bos varyant listesi elemez'));

  // ── 2. TARİH ARALIĞI ──
  // Tarihi EYLÜL'de olan 3 satir + TARİHSİZ satir da geçer (aşağıda ayrıca ölçülür).
  check(() => assert.equal(applyFilters(rows, { dateFrom: '2026-09-01', dateTo: '2026-09-30' }).length, 4,
    'eylul araligi: 3 tarihli + 1 tarihsiz'));
  // Tarihsiz satır: tarih filtresi verildiğinde tarihi OLMAYAN satır elenmez
  // (stok gibi tarihsiz kaynaklar tarih filtresiyle tamamen boşalmasın).
  check(() => {
    const res = applyFilters(rows, { dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    assert.ok(res.some(r => r.product === 'Urun 3'), 'tarihsiz satir tarih filtresinden etkilenmez');
  });
  check(() => assert.equal(applyFilters(rows, { dateFrom: '2026-10-01' }).length, 2,
    '1 ekim sonrasi: cikis satiri (10-01) + tarihsiz satir'));

  // ── 3. CARİ / ÜRÜN ──
  // Katı: carisi OLMAYAN 5. satır da elenir → yalnız cus-2'nin 2 satırı.
  check(() => assert.equal(applyFilters(rows, { customerIds: ['cus-2'] }).length, 2, 'cari filtresi (katı)'));
  check(() => {
    const res = applyFilters(rows, { customerIds: ['cus-1'] });
    assert.ok(res.every(r => r.customerId === 'cus-1'), 'cari filtresinde yabanci satir KALMAZ');
  });
  check(() => assert.equal(applyFilters(rows, { productIds: ['prd-1'] }).length, 2, 'urun filtresi'));
  check(() => assert.equal(applyFilters(rows, { productIds: ['prd-1', 'prd-2'] }).length, 5 - 1,
    'iki urun secilirse 4 satir (prd-3 disarida)'));

  // ── 4. VARYANT: satirin varyantlarindan EN AZ BIRI seciliyse gecer ──
  check(() => assert.equal(applyFilters(rows, { variantIds: ['var-1'] }).length, 1,
    'var-1 yalniz bir satiri secer'));
  check(() => {
    const res = applyFilters(rows, { variantIds: ['var-1', 'var-2'] });
    assert.equal(res.length, 2, 'iki varyant iki satir');
    assert.ok(res.every(r => r.productId === 'prd-1'), 'yalniz varyantli urun satirlari');
  });
  check(() => assert.equal(applyFilters(rows, { variantIds: ['var-yok'] }).length, 0,
    'eslesmeyen varyant bos doner'));

  // ── 5. DURUM ──
  // Durum filtresi KATIDIR: durumu taşımayan satır da elenir (aşağıdaki 3.
  // satırın status'ü yok → PAID listesinde görünmez).
  check(() => assert.equal(applyFilters(rows, { statuses: ['PAID'] }).length, 2, 'durum filtresi (katı)'));
  check(() => assert.equal(applyFilters(rows, { statuses: ['PAID', 'PARTIAL'] }).length, 3, 'iki durum'));
  check(() => assert.equal(applyFilters(rows, { statuses: ['DRAFT'] }).length, 0, 'olmayan durum bos'));

  // ── 6. TUTAR ARALIGI (MUTLAK deger) ──
  check(() => assert.equal(applyFilters(rows, { minAmount: 100 }).length, 3,
    'minAmount=100: 100, 250 ve 300(|-300|) gecer'));
  check(() => assert.equal(applyFilters(rows, { maxAmount: 80 }).length, 2,
    'maxAmount=80: 75 ve 40 gecer'));
  check(() => {
    const res = applyFilters(rows, { minAmount: 90, maxAmount: 260 });
    assert.deepEqual(res.map(r => r.amount), [100, 250], 'aralik tutari dogru suzer');
  });
  check(() => {
    // NEGATIF satir mutlak degerle olculur: -300, minAmount=250'yi GECER.
    const res = applyFilters(rows, { minAmount: 250 });
    assert.ok(res.some(r => r.amount === -300), 'cikis satiri mutlak degerle esige takilir');
  });

  // ── 7. BIRLESIK FILTRE ──
  check(() => assert.equal(
    applyFilters(rows, { customerIds: ['cus-1'], statuses: ['PAID'], minAmount: 50 }).length, 1,
    'cari + durum + tutar birlikte calisir'));

  // ── 8. BOŞ FİLTRE NESNESİ KAYDEDİLMEZ ──
  check(() => assert.equal(hasDesignFilters(undefined), false, 'tanimsiz filtre kaydedilmez'));
  check(() => assert.equal(hasDesignFilters({}), false, 'bos nesne kaydedilmez'));
  check(() => assert.equal(hasDesignFilters({ customerIds: [] }), false, 'bos liste kaydedilmez'));
  check(() => assert.equal(hasDesignFilters({ minAmount: 0 }), true,
    '0 GECERLI bir filtredir (sifir tutar ustu), kaydedilir'));
  check(() => assert.equal(hasDesignFilters({ customerIds: ['cus-1'] }), true, 'dolu filtre kaydedilir'));

  // ── 9. GRUPLAMA: toplam TEK KAYNAKTAN ──
  check(() => {
    const g = groupTotals(rows, 'customer');
    assert.ok(g, 'gruplama doner');
    assert.equal(g!.labels.length, 3, 'uc farkli grup: A Cari, B Cari, (bos)');
    const sum = g!.values.reduce((s, v) => s + v, 0);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    assert.equal(Math.round(sum * 100) / 100, Math.round(total * 100) / 100,
      'grup toplamlari = satir toplami');
    assert.equal(g!.totals.count, rows.length, 'kayit sayisi');
  });
  check(() => assert.equal(groupTotals(rows, undefined), null, 'alan yoksa gruplama yok'));
  check(() => {
    const g = groupTotals(rows, 'product');
    // Grup toplamlari İŞARETLİ toplanir (grup içinde giriş/çıkış netleşir):
    // Urun 1 = 100 + 250 = 350 · Urun 2 = 75 - 300 = -225 · Urun 3 = 40.
    assert.equal(g!.labels[0], 'Urun 1', 'Urun 1 (350) en buyuk grup olarak basta');
    assert.equal(g!.labels[1], 'Urun 3', 'Urun 3 (40) ikinci');
    assert.equal(g!.labels[2], 'Urun 2', 'Urun 2 (-225) en sonda');
  });

  // ── 10. GRUPLAMA FILTREYLE TUTARLI ──
  check(() => {
    const filtered = applyFilters(rows, { customerIds: ['cus-1'] });
    const g = groupTotals(filtered, 'product');
    assert.equal(g!.totals.count, 2, 'filtreli grup kayit sayisi 2');
    assert.equal(g!.totals.sum, 350, 'filtreli grup toplami 100 + 250');
  });

  console.log(`report-builder-logic: PASS (${checks} kontrol; bos filtre elemez, urun/varyant/durum/tutar suzer, negatif tutar mutlak degerle olculur, gruplama toplami satir toplamina esit)`);
} catch (err) {
  console.error(`report-builder-logic: FAIL (${checks} kontrolden sonra)`);
  throw err;
}
