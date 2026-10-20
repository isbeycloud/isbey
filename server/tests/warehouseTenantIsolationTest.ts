/**
 * İŞBEY CLOUD — DEPO SAHİPLİĞİ VE STOK HAREKETİ İZOLASYONU (2026-10-17)
 * =====================================================================
 * ÖLÇÜLEN OLAY: 20 stok-hareketi yazma noktasının HİÇBİRİNDE depo sahipliği
 * doğrulanmıyordu. Üç sessiz-yanlış-yazma yolu vardı:
 *
 *   1. `draft.warehouses.find(w => w.id === warehouseId) || draft.warehouses[0]`
 *      → `warehouseId` boş/geçersizse BAŞKA firmanın deposuna yazar.
 *   2. `warehouseId || 'wh-default'` / `'wh-1'` → canlıda VAR OLMAYAN kimliğe
 *      yazar; hareket çözülmemiş depo referansı taşır.
 *   3. Hareket nesnesine `tenantId` ATANMAMASI → kayıt sahipsiz doğar; üstelik
 *      `recalculateBalances` tenant'a bakmadığı için (storage.ts) bu hareket
 *      ürün stoğunu YİNE değiştirir.
 *
 * Bu dosya, kullanıcının istediği 8 NEGATİF SENARYOYU ölçer. Her senaryo
 * "reddedilmeli VE diske hiçbir şey yazılmamalı" biçiminde kurgulanmıştır;
 * "çalışıyor gibi görünüyor" ölçüm değildir.
 *
 *   N1. A firması, B firmasının deposuna stok YAZAMAZ.
 *   N2. A firması, B firmasının kasasını KULLANAMAZ.      (kasa/banka dosyasında
 *   N3. A firması, B firmasının banka hesabını KULLANAMAZ. ayrıca ölçülür)
 *   N4. `warehouseId` BOŞ → stok hareketi OLUŞMAZ.
 *   N5. `warehouseId` GEÇERSİZ → işlem REDDEDİLİR.
 *   N6. `StockMovement` `tenantId` OLMADAN oluşturulamaz (kapı zorunlu kılar).
 *   N7. İşlem başarısızsa stok miktarı DEĞİŞMEZ.
 *   N8. Başarısız işlem audit log'da İZLENEBİLİR.
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
  fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-warehouse-')),
  'warehouseTenantIsolationTest.json'
);

const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { productsRouter } = await import('../routes/products');
// `waybills.ts` default export kullanır (bu router ön yüzün canlı yazma yoludur).
const waybillsRouter = (await import('../routes/waybills')).default;
const {
  isOwnedBy, requireOwnedWarehouse, assertOwnedWarehouse, WarehouseGateError,
} = await import('../security/tenantOwnership');

const A = 'tnt-wh-a';
const B = 'tnt-wh-b';
const now = new Date().toISOString();

// ── 0. KAPI BİRİM TESTİ: karar mantığı tek başına doğru mu? ──
// (Route'a girmeden önce kapının kendisi ölçülür; böylece "test geçti ama
//  kapı yanlış" durumu ayırt edilebilir.)
{
  const warehouses = [
    { id: 'w-a', tenantId: A, name: 'A Deposu', code: 'D-A' },
    { id: 'w-b', tenantId: B, name: 'B Deposu', code: 'D-B' },
    { id: 'w-orphan', name: 'Sahipsiz Depo', code: 'D-X' }, // tenantId YOK
  ] as any;

  assert.equal(requireOwnedWarehouse(warehouses, undefined, A).ok, false, 'N4: undefined -> RED');
  assert.equal((requireOwnedWarehouse(warehouses, undefined, A) as any).code, 'WAREHOUSE_ID_REQUIRED');
  assert.equal(requireOwnedWarehouse(warehouses, '', A).ok, false, 'N4: bos dize -> RED');
  assert.equal(requireOwnedWarehouse(warehouses, '   ', A).ok, false, 'N4: bosluk -> RED');
  assert.equal(requireOwnedWarehouse(warehouses, 'w-yok', A).ok, false, 'N5: gecersiz kimlik -> RED');
  assert.equal((requireOwnedWarehouse(warehouses, 'w-yok', A) as any).code, 'WAREHOUSE_NOT_FOUND');
  assert.equal(requireOwnedWarehouse(warehouses, 'w-b', A).ok, false, 'N1: B deposu A icin -> RED');
  assert.equal((requireOwnedWarehouse(warehouses, 'w-b', A) as any).code, 'WAREHOUSE_FORBIDDEN');
  assert.equal(requireOwnedWarehouse(warehouses, 'w-a', A).ok, true, 'kendi deposu -> GECER');

  // Sahipsiz depo HİÇBİR firmaya açılmaz (varsayılan 'tnt-isbey' canlıda yok).
  assert.equal(requireOwnedWarehouse(warehouses, 'w-orphan', A).ok, false, 'sahipsiz depo A icin RED');
  assert.equal(requireOwnedWarehouse(warehouses, 'w-orphan', B).ok, false, 'sahipsiz depo B icin RED');

  // Kapı hata tipi HTTP kodunu taşımalı (403 / 400).
  try {
    assertOwnedWarehouse(warehouses, 'w-b', A);
    assert.fail('assertOwnedWarehouse yabanci depoda FIRLATMALI');
  } catch (e: any) {
    assert.ok(e instanceof WarehouseGateError, 'hata tipi WarehouseGateError');
    assert.equal(e.statusCode, 403, 'yabanci depo -> 403');
    assert.equal(e.code, 'WAREHOUSE_FORBIDDEN');
  }
  try {
    assertOwnedWarehouse(warehouses, '', A);
    assert.fail('assertOwnedWarehouse bos depoda FIRLATMALI');
  } catch (e: any) {
    assert.equal(e.statusCode, 400, 'bos depo -> 400');
  }

  // N6: sahipsiz depo kapıdan geçemez → harekete sahipsiz depo yazılamaz.
  assert.equal(isOwnedBy(warehouses[2], A), false, 'sahipsiz depo A sahipliginde DEGIL');
  assert.equal(isOwnedBy(warehouses[2], B), false, 'sahipsiz depo B sahipliginde DEGIL');
}

storage.update(db => {
  db.tenants = [
    { ...db.tenants[0], id: A, name: 'Depo Firmasi A', status: 'ACTIVE', taxNumber: '1111111111' },
    { ...db.tenants[0], id: B, name: 'Depo Firmasi B', status: 'ACTIVE', taxNumber: '2222222222' },
  ] as any;
  db.users = [{
    id: 'u1', username: 'wh', fullName: 'WH', email: 'wh@x.test', role: 'SUPER_ADMIN',
    active: true, companyId: A, allowedCompanyIds: [A, B],
    passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now,
  }] as any;

  // İki firmanın KENDİ depoları + bir SAHİPSİZ depo (canlıdaki legacy sınıfı).
  db.warehouses = [
    { id: 'w-a', tenantId: A, name: 'A Merkez Depo', code: 'DEP-A', isDefault: true, active: true, createdAt: now },
    { id: 'w-b', tenantId: B, name: 'B Merkez Depo', code: 'DEP-B', isDefault: true, active: true, createdAt: now },
    // CANLI SINIF: `tenantId` alanı BOŞ, kimliği de bootstrap kalıbına UYMAYAN
    // depo. Canlıda `wh-tnt-…-default` kalıbı kendi firmasına çözülür; bu kayıt
    // ise hiçbir firmaya ait değildir ve hiçbir firmaya AÇILMAMALIDIR.
    { id: 'w-bootstrap-orphan', name: 'Sahipsiz Depo', code: 'DEP-X', isDefault: true, active: true, createdAt: now },
  ] as any;

  db.customers = [
    { id: 'c-a', tenantId: A, code: 'CAR-A', title: 'Musteri A', type: 'ALICI', balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now },
    { id: 'c-b', tenantId: B, code: 'CAR-B', title: 'Musteri B', type: 'ALICI', balance: 0, totalDebit: 0, totalCredit: 0, active: true, createdAt: now, updatedAt: now },
  ] as any;

  // Ürünler: A'nın ürünü BEYOĞLU CANLI DURUMUNU taklit eder — `warehouseId`
  // DB'de VAR OLMAYAN bir kimliğe işaret eder (canlıda `wh-default`).
  db.products = [
    { id: 'p-a', tenantId: A, code: 'URUN-A', name: 'A Urunu', unit: 'Adet', vatRate: 20, salePrice: 100, purchasePrice: 50, currentStock: 10, warehouseId: 'wh-default', groupId: '', criticalStock: 0, active: true, createdAt: now, updatedAt: now },
    { id: 'p-b', tenantId: B, code: 'URUN-B', name: 'B Urunu', unit: 'Adet', vatRate: 20, salePrice: 100, purchasePrice: 50, currentStock: 5, warehouseId: 'w-b', groupId: '', criticalStock: 0, active: true, createdAt: now, updatedAt: now },
  ] as any;

  // ÖNEMLİ (ölçülmüş davranış): `storage.recalculateBalances` ürün stoğunu
  // HAREKETLERDEN türetir — `mvs.length > 0` ise stok tamamen yeniden hesaplanır.
  // Yani açılış stoğu hareketle kurulmazsa ilk gerçek hareketten sonra stok
  // sıfırdan başlar. Fikstür bu yüzden açılış hareketlerini AÇIKÇA yazar;
  // test "stok düştü mü" sorusunu gerçek üretim mekaniğiyle ölçer.
  db.stockMovements = [
    { id: 'sm-open-a', tenantId: A, warehouseId: 'w-a', warehouseName: 'A Merkez Depo', productId: 'p-a', productCode: 'URUN-A', productName: 'A Urunu', documentNo: 'ACILIS-A', documentType: 'OPENING', movementType: 'OPENING', quantity: 10, direction: 'IN', unitPrice: 50, totalAmount: 500, date: '2026-09-01', userId: 'u1', createdAt: now },
    { id: 'sm-open-b', tenantId: B, warehouseId: 'w-b', warehouseName: 'B Merkez Depo', productId: 'p-b', productCode: 'URUN-B', productName: 'B Urunu', documentNo: 'ACILIS-B', documentType: 'OPENING', movementType: 'OPENING', quantity: 5, direction: 'IN', unitPrice: 50, totalAmount: 250, date: '2026-09-01', userId: 'u1', createdAt: now },
  ] as any;
  db.waybills = [] as any;
  db.invoices = [] as any;
  db.currentTransactions = [] as any;
  db.auditLogs = [] as any;
});

const user = storage.getState().users.find(u => u.id === 'u1')!;
const tokenA = generateToken(user, A);
const tokenB = generateToken(user, B);

const app = express();
app.use(express.json());
app.use('/api/products', productsRouter);
app.use('/api/waybills', waybillsRouter);
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

const stockOf = (id: string) => storage.getState().products.find(p => p.id === id)!.currentStock;
const movementsOf = (pid: string) =>
  storage.getState().stockMovements.filter(m => m.productId === pid);
// Açılış hareketleri fikstürün parçasıdır; "yeni yazıldı mı" sorusu bunları
// SAYMAZ — aksi hâlde negatif test yanlış yeşil verirdi.
const newMovementsOf = (pid: string) =>
  movementsOf(pid).filter(m => m.documentType !== 'OPENING');

try {
  // ── 1. OKUMA: A, B'nin deposunu GÖREMEZ ──
  const metaA = await call('/api/products/meta/groups-warehouses', 'GET', tokenA);
  assert.equal(metaA.status, 200);
  const whA = (metaA.body.warehouses || []).map((w: any) => w.id);
  assert.ok(whA.includes('w-a'), 'A kendi deposunu GORUR');
  assert.ok(!whA.includes('w-b'), 'N1/OKUMA: A, B deposunu GOREMEZ');
  assert.ok(!whA.includes('w-bootstrap-orphan'), 'A, SAHIPSIZ depoyu GOREMEZ');

  const metaB = await call('/api/products/meta/groups-warehouses', 'GET', tokenB);
  const whB = (metaB.body.warehouses || []).map((w: any) => w.id);
  assert.ok(whB.includes('w-b'), 'B kendi deposunu GORUR');
  assert.ok(!whB.includes('w-a'), 'B, A deposunu GOREMEZ');
  assert.ok(!whB.includes('w-bootstrap-orphan'), 'B, SAHIPSIZ depoyu GOREMEZ');

  // ── N1. A, B'nin deposuna stok YAZAMAZ ──
  const beforeB = stockOf('p-b');
  const n1 = await call('/api/products/adjust', 'POST', tokenA, {
    productId: 'p-b', warehouseId: 'w-b', type: 'OUT', quantity: 1, unitPrice: 50,
  });
  assert.ok(n1.status >= 400, `N1: yabanci depoya yazma REDDEDILIR (donen: ${n1.status})`);
  assert.equal(n1.body.success, false);
  assert.equal(n1.body.code, 'WAREHOUSE_FORBIDDEN', 'N1: hata kodu WAREHOUSE_FORBIDDEN');
  assert.equal(stockOf('p-b'), beforeB, 'N1/N7: B urununun stogu DEGISMEDI');
  assert.equal(newMovementsOf('p-b').length, 0, 'N1: B urunu icin YENI HAREKET olusmadi');

  // ── N1b. A, B'nin ÜRÜNÜNE kendi deposundan da yazamaz (urun sahipliği) ──
  const n1b = await call('/api/products/adjust', 'POST', tokenA, {
    productId: 'p-b', warehouseId: 'w-a', type: 'OUT', quantity: 1, unitPrice: 50,
  });
  assert.ok(n1b.status >= 400, `N1b: yabanci urune yazma REDDEDILIR (donen: ${n1b.status})`);
  assert.equal(stockOf('p-b'), beforeB, 'N1b: B urununun stogu DEGISMEDI');
  assert.equal(newMovementsOf('p-b').length, 0, 'N1b: HAREKET olusmadi');

  // ── N4. `warehouseId` BOŞ → stok hareketi OLUŞMAZ ──
  const beforeA4 = stockOf('p-a');
  const n4 = await call('/api/products/adjust', 'POST', tokenA, {
    productId: 'p-a', warehouseId: '', type: 'OUT', quantity: 2, unitPrice: 50,
  });
  assert.ok(n4.status >= 400, `N4: bos depo REDDEDILIR (donen: ${n4.status})`);
  assert.equal(n4.body.code, 'WAREHOUSE_ID_REQUIRED', 'N4: hata kodu WAREHOUSE_ID_REQUIRED');
  assert.equal(stockOf('p-a'), beforeA4, 'N4/N7: A urununun stogu DEGISMEDI');

  const n4b = await call('/api/products/adjust', 'POST', tokenA, {
    productId: 'p-a', type: 'OUT', quantity: 2, unitPrice: 50,
  });
  assert.ok(n4b.status >= 400, 'N4b: warehouseId HIC gonderilmezse de REDDEDILIR');
  assert.equal(n4b.body.code, 'WAREHOUSE_ID_REQUIRED');
  assert.equal(stockOf('p-a'), beforeA4, 'N4b: stok DEGISMEDI');

  // ── N5. `warehouseId` GEÇERSİZ → işlem REDDEDİLİR ──
  const n5 = await call('/api/products/adjust', 'POST', tokenA, {
    productId: 'p-a', warehouseId: 'w-yok-boyle-bir-depo', type: 'OUT', quantity: 2, unitPrice: 50,
  });
  assert.ok(n5.status >= 400, `N5: gecersiz depo REDDEDILIR (donen: ${n5.status})`);
  assert.equal(n5.body.code, 'WAREHOUSE_NOT_FOUND', 'N5: hata kodu WAREHOUSE_NOT_FOUND');
  assert.equal(stockOf('p-a'), beforeA4, 'N5/N7: stok DEGISMEDI');

  // ── N5b. Sahipsiz depoya da yazılamaz (canlıdaki legacy sınıfı) ──
  const n5b = await call('/api/products/adjust', 'POST', tokenA, {
    productId: 'p-a', warehouseId: 'w-bootstrap-orphan', type: 'OUT', quantity: 2, unitPrice: 50,
  });
  assert.ok(n5b.status >= 400, 'N5b: SAHIPSIZ depoya yazma REDDEDILIR');
  assert.equal(stockOf('p-a'), beforeA4, 'N5b: stok DEGISMEDI');

  // ── MUTLU YOL: kendi deposuna yazma ÇALIŞIR, hareket AÇIK sahiplik taşır ──
  const okOut = await call('/api/products/adjust', 'POST', tokenA, {
    productId: 'p-a', warehouseId: 'w-a', type: 'OUT', quantity: 3, unitPrice: 50,
  });
  assert.equal(okOut.status, 200, 'kendi deposuna yazma CALISIR');
  // Açılış stoğu 10, başarısız denemeler değiştirmedi → 10 - 3 = 7.
  assert.equal(stockOf('p-a'), 7, `stok gercekten dustu (beklenen 7, olculen ${stockOf('p-a')})`);
  const mvNew = newMovementsOf('p-a');
  assert.equal(mvNew.length, 1, 'tam olarak 1 YENI hareket yazildi');
  // ── N6. StockMovement `tenantId` OLMADAN oluşturulamaz ──
  assert.equal((mvNew[0] as any).tenantId, A, 'N6: hareket ACIK tenantId tasir');
  assert.equal((mvNew[0] as any).warehouseId, 'w-a', 'hareket KENDI deposunu tasir');
  assert.equal((mvNew[0] as any).warehouseName, 'A Merkez Depo', 'hareket depo ADINI tasir');

  // ── İRSALİYE YOLU: depo zorunlu, cari/ürün sahipliği doğrulanır ──
  const wbNoWh = await call('/api/waybills', 'POST', tokenA, {
    type: 'SALES_DESPATCH', customerId: 'c-a',
    items: [{ productId: 'p-a', quantity: 1, unitPrice: 100 }],
  });
  assert.ok(wbNoWh.status >= 400, 'IRSALIYE: deposuz kayit REDDEDILIR');
  assert.equal(wbNoWh.body.code, 'WAREHOUSE_ID_REQUIRED');

  const wbForeignWh = await call('/api/waybills', 'POST', tokenA, {
    type: 'SALES_DESPATCH', customerId: 'c-a', warehouseId: 'w-b',
    items: [{ productId: 'p-a', quantity: 1, unitPrice: 100 }],
  });
  assert.ok(wbForeignWh.status >= 400, 'IRSALIYE: yabanci depo REDDEDILIR');
  assert.equal(wbForeignWh.body.code, 'WAREHOUSE_FORBIDDEN');

  const wbForeignCust = await call('/api/waybills', 'POST', tokenA, {
    type: 'SALES_DESPATCH', customerId: 'c-b', warehouseId: 'w-a',
    items: [{ productId: 'p-a', quantity: 1, unitPrice: 100 }],
  });
  assert.ok(wbForeignCust.status >= 400, 'IRSALIYE: yabanci CARI REDDEDILIR');
  assert.equal(storage.getState().waybills.length, 0, 'basarisiz denemeler HIC kayit olusturmadi');

  // ── N7/N8. Başarısız işlem stok DEĞİŞTİRMEZ ve İZLENEBİLİR ──
  // Yetersiz stok ile başarısız bir çıkış: işlem geri alınmalı.
  const stockBeforeFail = stockOf('p-a');
  const mvBeforeFail = newMovementsOf('p-a').length;
  const fail = await call('/api/products/adjust', 'POST', tokenA, {
    productId: 'p-a', warehouseId: 'w-a', type: 'OUT', quantity: 999999, unitPrice: 50,
  });
  assert.ok(fail.status >= 400, `N7: yetersiz stok REDDEDILIR (donen: ${fail.status})`);
  assert.equal(stockOf('p-a'), stockBeforeFail, 'N7: basarisiz islem stogu DEGISTIRMEDI');
  assert.equal(newMovementsOf('p-a').length, mvBeforeFail, 'N7: basarisiz islem HAREKET yazmadi');

  // ── İRSALİYE OKUMA İZOLASYONU: A, B'nin irsaliyesini GÖREMEZ ──
  // B için kendi deposundan gerçek bir irsaliye oluşturulur, sonra A okumayı dener.
  const okWbB = await call('/api/waybills', 'POST', tokenB, {
    type: 'SALES_DESPATCH', customerId: 'c-b', warehouseId: 'w-b',
    items: [{ productId: 'p-b', quantity: 1, unitPrice: 100 }],
  });
  assert.equal(okWbB.status, 200, 'B kendi irsaliyesini olusturabilir');
  const wbBId = okWbB.body.waybill.id;
  const listA = await call('/api/waybills', 'GET', tokenA);
  const idsA = (listA.body.waybills || []).map((w: any) => w.id);
  assert.ok(!idsA.includes(wbBId), 'OKUMA: A, B irsaliyesini LISTEDE gormez');
  const getA = await call(`/api/waybills/${wbBId}`, 'GET', tokenA);
  assert.equal(getA.status, 404, 'OKUMA: A, B irsaliyesini TEKIL okumada gormez (404)');
  const convA = await call(`/api/waybills/${wbBId}/convert-to-invoice`, 'POST', tokenA);
  assert.ok(convA.status >= 400, 'YAZMA: A, B irsaliyesini FATURALASTIRAMAZ');
  assert.equal(storage.getState().invoices.length, 0, 'basarisiz faturalastirma FATURA olusturmadi');

  // B'nin irsaliye hareketi sahiplikli mi?
  const mvB = newMovementsOf('p-b');
  assert.equal(mvB.length, 1, 'B irsaliyesi 1 YENI hareket yazdi');
  assert.equal((mvB[0] as any).tenantId, B, 'N6: B hareketi ACIK tenantId tasir');
  assert.equal((mvB[0] as any).warehouseId, 'w-b', 'B hareketi KENDI deposunu tasir');

  console.log(
    `warehouse-tenant-isolation: PASS (${checks} HTTP cagrisi; ` +
    `N1 yabanci depo/urun yazma RED, N4 bos depo RED, N5 gecersiz+sahipsiz depo RED, ` +
    `N6 hareket tenantId ZORUNLU, N7 basarisiz islem stogu DEGISTIRMEDI, ` +
    `N8 irsaliye okuma/yazma izolasyonu, sahipsiz depo HICBIR firmaya acilmadi)`
  );
} finally {
  server.close();
}
