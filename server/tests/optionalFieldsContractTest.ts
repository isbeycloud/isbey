/** Strict kapısındaki eksik alanların gerçek router/servis regresyonları; ağ çağrısı yok. */
import assert from 'node:assert/strict';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import type { Order, OrderItem } from '../db/schema';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'optionalFieldsContractTest.ts.json') {
  throw new Error('Test yalnız izole optionalFieldsContractTest.ts.json üzerinde çalışır.');
}
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'optional-fields-data');
const { storage } = await import('../db/storage');
const { productsRouter } = await import('../routes/products');
const { customersRouter } = await import('../routes/customers');
const { default: quotesRouter } = await import('../routes/quotes');
const { CustomerRiskService } = await import('../services/customerRiskService');
const { DocumentConversionService } = await import('../services/documentConversionService');
const { PaymentGatewayAdapter } = await import('../services/payments/paymentGatewayAdapter');
const tenantId = 'tnt-optional-test';
const item: OrderItem = { productId: 'optional-product', productCode: 'OPT-1', productName: 'Kalem', unit: 'Adet', unitPrice: 10, discount1: 0, discount2: 0, vatRate: 20, vatAmount: 2, lineTotal: 10, lineGrandTotal: 12 };
const order: Order = { id: 'optional-order', tenantId, orderNo: 'ORDER-1', type: 'SALES_ORDER', customerId: 'optional-customer', customerCode: 'OPT-C', customerTitle: 'Cari', date: '2026-10-06', deliveryDate: '2026-10-06', subTotal: 10, totalDiscount: 0, totalVat: 2, grandTotal: 12, status: 'PENDING', warehouseId: 'wh-test', items: [item], userId: 'optional-admin', createdAt: '2026-10-06', updatedAt: '2026-10-06' };
storage.update(db => {
  db.tenants = [{ ...db.tenants[0], id: tenantId, status: 'ACTIVE', isArchived: false, eInvoiceCredits: 25 }];
  db.users = [{ ...db.users[0], id: 'optional-admin', role: 'SUPER_ADMIN', active: true }];
  db.customers = [{ ...db.customers[0], id: order.customerId, tenantId, balance: 20, riskLimit: undefined }];
  db.products = [{ ...db.products[0], id: item.productId, tenantId, code: item.productCode, name: item.productName, barcode: undefined, currentStock: 10 }];
  db.orders = [structuredClone(order)];
  db.currentTransactions = [{ ...db.currentTransactions[0], id: 'optional-tx', tenantId, customerId: order.customerId, debt: undefined, dueDate: '2020-01-01' }];
  db.creditPackages = [{ id: 'optional-package', name: 'Eksik miktar', quantity: 100, price: 10, vatRate: 20, totalPrice: 12, unitPrice: 0.1, status: 'ACTIVE', displayOrder: 1 }];
  db.paymentOrders = []; db.creditTransactions = []; db.waybills = []; db.stockMovements = [];
});
const app = express();
app.use(express.json());
app.use('/products', productsRouter);
app.use('/customers', customersRouter);
app.use('/quotes', quotesRouter);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ message: err.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const headers = { Authorization: `Bearer ${jwt.sign({ userId: 'optional-admin', tenantId }, process.env.JWT_SECRET!, { expiresIn: '5m' })}`, 'Content-Type': 'application/json' };
const snapshot = () => JSON.stringify(storage.getState());
try {
  const search = await fetch(`${base}/products?search=bulunmayan`, { headers });
  assert.equal(search.status, 200, 'Eksik barkod aramada 500 üretmemeli.');
  assert.deepEqual((await search.json()).products, []);
  const statement = await fetch(`${base}/customers/${order.customerId}/statement`, { headers });
  assert.equal(statement.status, 200);
  assert.equal((await statement.json()).summary.availableLimit, 0, 'Eksik risk limiti NaN üretmemeli.');
  const risks = CustomerRiskService.calculateRiskScores(tenantId);
  assert.equal(risks.length, 1);
  assert.ok(Number.isFinite(risks[0].riskScore));
  assert.equal(risks[0].overdueDebt, 0);
  let before = snapshot();
  const shipment = await fetch(`${base}/quotes/orders/${order.id}/convert-to-waybill`, { method: 'POST', headers, body: '{}' });
  assert.equal(shipment.status, 400, 'Eksik sevk miktarı açıkça reddedilmeli.');
  assert.match((await shipment.json()).message, /miktarlari tanimli degil/);
  assert.equal(snapshot(), before, 'Hatalı sevkte transaction tüm değişiklikleri geri almalı.');
  await assert.rejects(DocumentConversionService.convertOrderToWaybill(order.id, tenantId, 'optional-admin'), /sevk miktarı tanımlı değil/);
  assert.equal(snapshot(), before, 'Eksik miktarda servis sıra/stock/cari kaydını değiştirmemeli.');
  const paymentParams = { tenantId, orderType: 'CREDIT_PURCHASE' as const, amount: 12, creditPackageId: 'optional-package', cardNumber: '4111111111111111', cardHolder: 'TEST', expireMonth: '12', expireYear: '2030', cvv: '123', userId: 'optional-admin' };
  await assert.rejects(PaymentGatewayAdapter.processPayment(paymentParams), /paketinin miktarı tanımlı değil/);
  assert.equal(snapshot(), before, 'Eksik kontörde ödeme/credit/bakiye kaydı oluşmamalı.');
  storage.update(db => { db.creditPackages![0].creditAmount = 100; });
  const paid = await PaymentGatewayAdapter.processPayment(paymentParams);
  assert.equal(paid.success, true);
  assert.equal(storage.getState().tenants[0].eInvoiceCredits, 125);
  assert.equal(storage.getState().creditTransactions![0].amount, 100);
  storage.update(db => { db.orders[0].items[0].orderedQuantity = 2; db.orders[0].items[0].remainingQuantity = 1; });
  const waybill = await DocumentConversionService.convertOrderToWaybill(order.id, tenantId, 'optional-admin');
  assert.equal(waybill.items[0].quantity, 1);
  const validShipment = await fetch(`${base}/quotes/orders/${order.id}/convert-to-waybill`, { method: 'POST', headers, body: '{}' });
  assert.equal(validShipment.status, 200);
  assert.equal((await validShipment.json()).data.waybill.items[0].quantity, 1);
  assert.equal(storage.getState().stockMovements.at(-1)?.quantity, 1);
  console.log('Optional fields contract: PASS (router, rollback, service rejection, valid credit/shipment).');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
