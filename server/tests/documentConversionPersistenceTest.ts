/**
 * REGRESYON — 2026-10-06
 *
 * `DocumentConversionService` metotları transaction DIŞINDAN çağrıldığında
 * bayat `db` referansına yazıyordu; sonuç SESSİZ VERİ KAYBI + SAHTE BAŞARI:
 * API `{ success: true }` dönüyor, ama irsaliye/fatura/stok hareketi diske
 * HİÇ yazılmıyordu.
 *
 * Kök neden: `storage.update()` derin klon üretip `this.db`'yi YENİ nesneyle
 * değiştirir. `getNextSequence()` içeride `update()` çağırır. Metot başında
 * `const db = storage.getState()` ile alınan referans o andan sonra bayatlar.
 *
 * Bu dosya, hatanın GÖRÜLDÜĞÜ üç gerçek ucu ölçer:
 *   A) /api/v1/orders/:id/convert-to-waybill  → convertOrderToWaybill
 *   B) /api/v1/invoices                       → createInvoice
 *   C) /api/v1/waybills/:id/convert-to-invoice → convertWaybillToInvoice
 *
 * NOT: `POST /api/quotes/orders/:id/convert-to-waybill` (quotes.ts) kendi
 * `runTransaction`'ını kullandığı için bu hatadan ETKİLENMEZ; onu ayrıca
 * ölçüyoruz ki "yanlış yeri düzeltme" tuzağına düşmeyelim.
 *
 * Ağa ÇIKMAZ. Canlı Hızlı Bilişim'e dokunmaz (entegratör çağrısı yok).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import type { Order, OrderItem, Waybill } from '../db/schema';

if (
  process.env.NODE_ENV !== 'test' ||
  path.basename(process.env.DATABASE_PATH || '') !== 'documentConversionPersistenceTest.ts.json'
) {
  throw new Error('Test yalnız izole documentConversionPersistenceTest.ts.json üzerinde çalışır.');
}
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'doc-conversion-data');

const { storage } = await import('../db/storage');
const { DocumentConversionService } = await import('../services/documentConversionService');

const tenantId = 'tnt-docconv';
const admin = 'docconv-admin';

const item: OrderItem = {
  productId: 'docconv-product', productCode: 'DCV-1', productName: 'Kalem', unit: 'Adet',
  unitPrice: 10, discount1: 0, discount2: 0, vatRate: 20, vatAmount: 2,
  lineTotal: 10, lineGrandTotal: 12, orderedQuantity: 1, remainingQuantity: 1,
};

const order: Order = {
  id: 'docconv-order', tenantId, orderNo: 'ORDER-DCV', type: 'SALES_ORDER',
  customerId: 'docconv-customer', customerCode: 'DCV-C', customerTitle: 'Cari',
  date: '2026-10-06', deliveryDate: '2026-10-06', subTotal: 10, totalDiscount: 0,
  totalVat: 2, grandTotal: 12, status: 'PENDING', warehouseId: 'wh-docconv',
  items: [structuredClone(item)], userId: admin, createdAt: '2026-10-06', updatedAt: '2026-10-06',
};

const seededWaybill: Waybill = {
  id: 'docconv-waybill', tenantId, waybillNo: 'IRS-DCV-1', type: 'SALES_DESPATCH',
  customerId: order.customerId, customerCode: order.customerCode, customerTitle: order.customerTitle,
  date: '2026-10-06', shipmentDate: '2026-10-06', warehouseId: 'wh-docconv', status: 'PENDING',
  items: [{
    id: 'docconv-wbi', productId: item.productId, productCode: item.productCode,
    productName: item.productName, quantity: 1, unit: item.unit, unitPrice: 10,
    discount1: 0, discount2: 0, vatRate: 20, lineTotal: 10, lineGrandTotal: 12,
  }],
  userId: admin, createdAt: '2026-10-06', updatedAt: '2026-10-06',
};

storage.update(db => {
  db.tenants = [{ ...db.tenants[0], id: tenantId, status: 'ACTIVE', isArchived: false }];
  db.users = [{ ...db.users[0], id: admin, role: 'SUPER_ADMIN', active: true }];
  db.customers = [{
    ...db.customers[0], id: order.customerId, tenantId, code: order.customerCode,
    title: order.customerTitle, balance: 0, totalDebit: 0, totalCredit: 0,
  }];
  db.products = [{
    ...db.products[0], id: item.productId, tenantId, code: item.productCode,
    name: item.productName, currentStock: 10, vatRate: 20,
  }];
  db.orders = [structuredClone(order)];
  db.waybills = [structuredClone(seededWaybill)];
  db.quotes = [{
    id: 'docconv-quote', tenantId, quoteNo: 'TEK-DCV-1', type: 'SALES_QUOTE',
    customerId: order.customerId, customerCode: order.customerCode, customerTitle: order.customerTitle,
    date: '2026-10-06', validUntil: '2026-11-06', subTotal: 10, totalDiscount: 0,
    totalVat: 2, grandTotal: 12, status: 'OPEN',
    items: [{
      id: 'qi-dcv', productId: item.productId, productCode: item.productCode,
      productName: item.productName, quantity: 1, unit: item.unit, unitPrice: 10,
      discount1: 0, discount2: 0, vatRate: 20, vatAmount: 2, lineTotal: 10, lineGrandTotal: 12,
    }],
    userId: admin, createdAt: '2026-10-06', updatedAt: '2026-10-06',
  } as any];
  db.invoices = [];
  // Açılış stoğu MUTLAKA bir stok hareketiyle temsil edilmeli: `runTransaction`
  // sonunda `recalculateBalances` ürün stoğunu yalnız stok hareketlerinden
  // yeniden türetir (`inQty - outQty`). Hareket olmadan stok 0'a düşer.
  db.stockMovements = [{
    id: 'sm-docconv-base', tenantId, productId: item.productId, productCode: item.productCode,
    productName: item.productName, warehouseId: 'wh-docconv', documentNo: 'ACILIS',
    documentType: 'INVOICE', documentId: 'docconv-opening', movementType: 'PURCHASE',
    quantity: 10, direction: 'IN', unitPrice: 10, totalAmount: 100, currency: 'TRY',
    date: '2026-10-01', userId: admin, createdBy: 'Sistem', createdAt: '2026-10-01T00:00:00.000Z',
  } as any];
  db.accountTransactions = [];
  db.currentTransactions = [];
  db.auditLogs = [];
});

const stock = () => storage.getState().products.find(p => p.id === item.productId)!.currentStock;
const count = (key: 'invoices' | 'waybills' | 'stockMovements' | 'accountTransactions' | 'currentTransactions' | 'orders') =>
  ((storage.getState() as any)[key] || []).length;

const failures: string[] = [];
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (gerçek=${JSON.stringify(actual)} beklenen=${JSON.stringify(expected)})`);
  if (!ok) failures.push(label);
};

// ────────── A) convertOrderToWaybill ──────────
// (servis, /api/v1/orders/:id/convert-to-waybill ucundan aynı yolla çağrılır)
{
  const wbBefore = count('waybills');
  const smBefore = count('stockMovements');
  const stockBefore = stock();

  const wb = await DocumentConversionService.convertOrderToWaybill(order.id, tenantId, admin);

  check('A1 donen irsaliye no bos degil', typeof wb.waybillNo === 'string' && wb.waybillNo.length > 0, true);
  check('A2 irsaliye diske yazildi', count('waybills'), wbBefore + 1);
  check('A3 stok sevk kadar dustu', stock(), stockBefore - 1);
  check('A4 stok hareketi yazildi', count('stockMovements'), smBefore + 1);
  check('A5 siparis SHIPPED', storage.getState().orders.find(o => o.id === order.id)?.status, 'SHIPPED');
}

// ────────── B) createInvoice ──────────
// (/api/v1/invoices ve /quotes/... POST uçlarından çağrılır)
{
  const invBefore = count('invoices');
  const smBefore = count('stockMovements');
  const actxBefore = count('accountTransactions');
  const stockBefore = stock();

  const inv = await DocumentConversionService.createInvoice({
    tenantId, type: 'SALES', customerId: order.customerId,
    items: [{ productId: item.productId, quantity: 2, unitPrice: 10, vatRate: 20 }],
    userId: admin, username: 'Test',
  });

  check('B1 donen fatura no bos degil', typeof inv.invoiceNo === 'string' && inv.invoiceNo.length > 0, true);
  check('B2 fatura diske yazildi', count('invoices'), invBefore + 1);
  check('B3 stok hareketi yazildi', count('stockMovements'), smBefore + 1);
  check('B4 cari hareket yazildi', count('accountTransactions'), actxBefore + 1);
  check('B5 stok satis kadar dustu', stock(), stockBefore - 2);
}

// ────────── C) convertWaybillToInvoice ──────────
// (/api/v1/waybills/:id/convert-to-invoice)
{
  const invBefore = count('invoices');
  const smBefore = count('stockMovements');
  const stockBefore = stock();

  const inv = await DocumentConversionService.convertWaybillToInvoice(seededWaybill.id, tenantId, admin);

  check('C1 fatura diske yazildi', count('invoices'), invBefore + 1);
  // İrsaliyeden faturalama stok hareketi ÜRETMEMELİ: stoğu irsaliye zaten
  // düşürdü. Yeni hareket = stokun İKİ KEZ düşülmesi demek (çift sayım).
  check('C2 stok hareketi URETILMEDI (cift sayim yok)', count('stockMovements'), smBefore);
  check('C3 stok degismedi', stock(), stockBefore);
  const wb = storage.getState().waybills.find(w => w.id === seededWaybill.id);
  check('C4 irsaliye INVOICED oldu', wb?.status, 'INVOICED');
  check('C5 irsaliye faturaya baglandi', wb?.invoiceId, inv.id);
}

// ────────── D) convertQuoteToOrder ──────────
// (/api/v1/quotes/:id/convert-to-order ucundan çağrılır)
{
  const ordersBefore = count('orders');

  const order2 = await DocumentConversionService.convertQuoteToOrder('docconv-quote', tenantId, admin);

  check('D1 siparis diske yazildi', count('orders'), ordersBefore + 1);
  check('D2 donen siparis no bos degil', typeof order2.orderNo === 'string' && order2.orderNo.length > 0, true);
  const quote = storage.getState().quotes.find(x => x.id === 'docconv-quote');
  check('D3 teklif CONVERTED oldu', quote?.status, 'CONVERTED');
  check('D4 teklif siparise baglandi', quote?.convertedOrderId, order2.id);
}

// ────────── E) KONTROL: quotes.ts rotasi (runTransaction) ETKILENMEMELI ──────────
{
  const quotesSrc = await import('node:fs');
  const src = quotesSrc.readFileSync(path.join(process.cwd(), 'server/routes/quotes.ts'), 'utf8');
  const idx = src.indexOf("router.post('/orders/:id/convert-to-waybill'");
  const body = idx >= 0 ? src.slice(idx, idx + 400) : '';
  check('E1 quotes rotasi runTransaction kullaniyor', body.includes('storage.runTransaction'), true);
}

console.log('');
if (failures.length) {
  console.error(`Document conversion persistence: FAIL (${failures.length}) → ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Document conversion persistence: PASS (irsaliye + fatura + stok hareketi kalıcı).');
}
