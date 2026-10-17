/**
 * İŞBEY CLOUD — v1 DOĞRUDAN KAYIT (DIRECT CREATE) KALICILIĞI (2026-10-17)
 * =========================================================================
 * Ölçülen sözleşme: `POST /api/v1/orders|quotes|waybills|cash`
 *
 *   HTTP 201 DÖNMEK KAYIT ANLAMINA GELMEZ. Uç "başarılı" derken satır diske
 *   yazılmıyorsa bu SESSİZ VERİ KAYBIDIR — kullanıcı siparişi oluşturur,
 *   ekran "kaydedildi" der, kaydı bir daha bulamaz.
 *
 * Kök neden (bayat referans):
 *   `const db = storage.getState()` CANLI `this.db` nesnesine referans verir.
 *   Ama `storage.update()` / `storage.getNextSequence()` içeride bir KLON
 *   oluşturup `this.db = klon` yapar. O andan sonra elimizdeki `db` değişkeni
 *   ÖLÜ bir nesnedir; `db.orders.push(...)` görünmez bir yere yazar ve
 *   `storage.save()` güncel kopyayı (yeni kaydı İÇERMEYEN) diske basar.
 *
 * Bu test üç şeyi ölçer:
 *   1. Uç 201 dönüyor VE kayıt süreç-içi durumda var (başarı iddiası doğru mu).
 *   2. Kayıt DİSKE yazıldı (dosya yeniden okunur — bellekteki kopya yetmez).
 *   3. Sıralı iki kayıt birbirini EZMEZ (ikisi de durur).
 *
 * Ağa ÇIKMAZ (yalnız localhost'a bağlanır).
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
const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-direct-'));
process.env.DATABASE_PATH = path.join(DB_DIR, 'directCreatePersistTest.json');

const { storage } = await import('../db/storage');
const { generateToken } = await import('../routes/auth');
const { v1OrdersRouter } = await import('../routes/v1/orders');
const { v1QuotesRouter } = await import('../routes/v1/quotes');
const { v1WaybillsRouter } = await import('../routes/v1/waybills');
const { v1CashRouter } = await import('../routes/v1/cash');

const T = 'tnt-dc';
const now = new Date().toISOString();

storage.update(db => {
  db.tenants = [{ ...db.tenants[0], id: T, name: 'Direct Create', status: 'ACTIVE' }];
  db.users = [{
    id: 'u1', username: 'dc', fullName: 'DC', email: 'dc@x.test', role: 'SUPER_ADMIN',
    active: true, companyId: T, allowedCompanyIds: [T],
    passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now,
  }];
  db.customers = [{
    id: 'cus-1', tenantId: T, code: 'CAR-001', title: 'Test Musteri', type: 'ALICI',
    balance: 0, totalDebit: 0, totalCredit: 0, taxNumber: '1111111111',
    active: true, createdAt: now, updatedAt: now,
  }] as any;
  db.products = [{
    id: 'prd-1', tenantId: T, code: 'URN-001', name: 'Test Urun', unit: 'ADET',
    active: true, currentStock: 100, criticalStock: 1, purchasePrice: 10, salePrice: 20,
    warehouseId: 'wh-1', warehouseName: 'Depo',
  }] as any;
  db.warehouses = [{ id: 'wh-1', tenantId: T, name: 'Depo', code: 'DEP-1', isDefault: true }] as any;
  db.currentTransactions = [];
  db.cashTransactions = [];
  db.bankTransactions = [];
  db.cashRegisters = [];
  db.bankAccounts = [];
  // TÜM listeler sıfırlanır: tohum (seed) verisinden kalan kayıtlar sayımı
  // yanıltıcı biçimde şişirir (ilk koşumda 3 stok hareketi görünmüştü).
  db.stockMovements = [];
  db.invoices = [];
  db.orders = [];
  db.quotes = [];
  db.waybills = [];
});

const user = storage.getState().users.find(u => u.id === 'u1')!;
const token = generateToken(user, T);

const app = express();
app.use(express.json());
app.use('/api/v1/orders', v1OrdersRouter);
app.use('/api/v1/quotes', v1QuotesRouter);
app.use('/api/v1/waybills', v1WaybillsRouter);
app.use('/api/v1/cash', v1CashRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;

/** Diskteki GERÇEK içerik — bellekteki kopya kanıt değildir. */
function readDisk(): any {
  return JSON.parse(fs.readFileSync(process.env.DATABASE_PATH!, 'utf-8'));
}

let checks = 0;
async function post(url: string, body: unknown) {
  const r = await fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  checks++;
  const raw = await r.text();
  return { status: r.status, body: (raw.startsWith('{') ? JSON.parse(raw) : raw) as any };
}

const orderItem = { productId: 'prd-1', productCode: 'URN-001', productName: 'Test Urun', quantity: 2, unitPrice: 20, vatRate: 20 };

try {
  // ── 1. SİPARİŞ: 201 diyor mu, GERÇEKTEN yazıyor mu ──
  const o1 = await post('/api/v1/orders', { customerId: 'cus-1', items: [orderItem], notes: 'ilk' });
  assert.equal(o1.status, 201, 'siparis ucu 201 doner');
  assert.equal(o1.body.success, true);

  // Başarı iddiası doğru mu: süreç-içi durumda görünüyor mu?
  const ordersInMemory = storage.getState().orders || [];
  assert.equal(ordersInMemory.length, 1, 'SIPARIS BELLEKTE VAR (basari iddiasi dogru)');
  // VE diskte?
  assert.equal((readDisk().orders || []).length, 1, 'SIPARIS DISKE YAZILDI (sessiz veri kaybi YOK)');

  // ── 2. SIRALI İKİNCİ KAYIT BİRİNCİYİ EZMEZ ──
  const o2 = await post('/api/v1/orders', { customerId: 'cus-1', items: [orderItem], notes: 'ikinci' });
  assert.equal(o2.status, 201);
  const diskAfter2 = readDisk();
  assert.equal((diskAfter2.orders || []).length, 2, 'IKI SIPARIS DE DURUYOR (biri digerini ezmedi)');
  assert.notEqual(diskAfter2.orders[0].orderNo, diskAfter2.orders[1].orderNo, 'siparis numaralari FARKLI (sayac ilerliyor)');

  // ── 3. TEKLİF ──
  const q1 = await post('/api/v1/quotes', {
    customerId: 'cus-1', items: [orderItem], validUntil: '2026-12-31',
  });
  assert.equal(q1.status, 201, 'teklif ucu 201 doner');
  assert.equal((readDisk().quotes || []).length, 1, 'TEKLIF DISKE YAZILDI');

  // ── 4. İRSALİYE (stok hareketi de doğurur) ──
  const stockBefore = readDisk().products.find((p: any) => p.id === 'prd-1').currentStock;
  const w1 = await post('/api/v1/waybills', {
    customerId: 'cus-1', warehouseId: 'wh-1', items: [orderItem],
  });
  assert.equal(w1.status, 201, 'irsaliye ucu 201 doner');
  const afterW = readDisk();
  assert.equal((afterW.waybills || []).length, 1, 'IRSALIYE DISKE YAZILDI');
  // EN AĞIR KAYIP BURADAYDI: irsaliye stok hareketi + ürün stoğu da ölü
  // nesneye yazılıyordu; uç 201 dönüp stok HİÇ düşmüyordu.
  assert.equal((afterW.stockMovements || []).length, 1, 'STOK HAREKETI DISKE YAZILDI');
  assert.equal(afterW.stockMovements[0].direction, 'OUT', 'satis irsaliyesi CIKIS hareketi dogurur');
  const stockAfter = afterW.products.find((p: any) => p.id === 'prd-1').currentStock;
  assert.equal(stockAfter, stockBefore - 2, 'URUN STOGU DISKE DUSTU (100 -> 98)');

  // ── 5. KASA ──
  const c1 = await post('/api/v1/cash', { name: 'Test Kasasi', currency: 'TRY', openingBalance: 500 });
  assert.equal(c1.status, 201, 'kasa ucu 201 doner');
  assert.equal((readDisk().cashRegisters || []).length, 1, 'KASA DISKE YAZILDI');
  assert.equal(readDisk().cashRegisters[0].balance, 500, 'kasa acilis bakiyesi dogru yazildi');

  console.log(`direct-create-persist: PASS (${checks} HTTP cagrisi; 201 donen HER uc icin kayit DISKTE dogrulandi, sirali kayitlar birbirini ezmiyor)`);
} catch (err) {
  console.error(`direct-create-persist: FAIL (${checks} HTTP cagrisindan sonra)`);
  throw err;
} finally {
  server.close();
  try { fs.rmSync(DB_DIR, { recursive: true, force: true }); } catch { /* yoksay */ }
}
