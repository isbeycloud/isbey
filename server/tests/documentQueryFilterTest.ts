/**
 * Belge sorgulama filtreleri: yön-farkında karşı-taraf VKN, belge no, tarih aralığı,
 * tenant izolasyonu ve boş-filtre davranışı. Gerçek v1 router'ları, izole test DB.
 *
 * SALT OKUNUR doğrulaması: test sonunda belgeler ve cariler birebir aynı olmalı.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'documentQueryFilterTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole documentQueryFilterTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'document-query-data');

const { storage } = await import('../db/storage');
const { v1InvoicesRouter } = await import('../routes/v1/invoices');
const { v1WaybillsRouter } = await import('../routes/v1/waybills');

const tenantId = 'tnt-query-test';
const OTHER = 'tnt-query-other';

// ── Kurgu ────────────────────────────────────────────────────────────────────
// Bizim VKN'miz: 9998887776 (tenant.taxNumber)
// Cari A (tedarikçi): VKN 1111111111   Cari B (müşteri): VKN 2222222222
storage.update(db => {
  db.tenants = [{ ...db.tenants[0], id: tenantId, status: 'ACTIVE', isArchived: false, taxNumber: '9998887776' }];
  db.users = [{ ...db.users[0], id: 'query-admin', role: 'SUPER_ADMIN', active: true }];

  const cTemplate = db.customers[0];
  db.customers = [
    { id: 'sup-a', title: 'Alfa Tedarik', code: 'TED-001', taxNumber: '1111111111', type: 'SUPPLIER' },
    { id: 'cus-b', title: 'Beta Müşteri', code: 'MUS-001', taxNumber: '2222222222', type: 'CUSTOMER' },
    // Başka tenant'ın carisi — hiçbir filtre/sütundan sızmamalı.
    { id: 'foreign-c', title: 'Gizli Cari', code: 'GIZ-001', taxNumber: '3333333333', type: 'CUSTOMER', tenantId: OTHER },
    // Carisi silinmiş (orphan) belge için: cari yok → tahmin yok.
  ].map(c => ({ ...cTemplate, ...c, tenantId: (c as any).tenantId ?? tenantId, balance: 0, totalDebit: 0, totalCredit: 0 }));

  const iTemplate = db.invoices[0];
  db.invoices = [
    // GELEN fatura: recipientTaxNumber BİZİM VKN'miz; tedarikçi incomingSupplierVkn'de.
    {
      id: 'pur-1', invoiceNo: 'ALI-2026-0001', type: 'PURCHASE', status: 'ACTIVE',
      customerId: 'sup-a', customerCode: 'TED-001', customerTitle: 'Alfa Tedarik',
      date: '2026-10-01', grandTotal: 100, paymentStatus: 'UNPAID',
      recipientTaxNumber: '9998887776', incomingSupplierVkn: '1111111111',
    },
    // GİDEN fatura: recipientTaxNumber = müşteri VKN'si.
    {
      id: 'sal-1', invoiceNo: 'SAT-2026-0001', type: 'SALES', status: 'ACTIVE',
      customerId: 'cus-b', customerCode: 'MUS-001', customerTitle: 'Beta Müşteri',
      date: '2026-10-05', grandTotal: 200, paymentStatus: 'PAID',
      recipientTaxNumber: '2222222222',
    },
    // Başka tenant belgesi.
    {
      id: 'foreign-1', invoiceNo: 'SAT-2026-9999', type: 'SALES', status: 'ACTIVE',
      customerId: 'foreign-c', customerCode: 'GIZ-001', customerTitle: 'Gizli Cari',
      date: '2026-10-05', grandTotal: 999, paymentStatus: 'UNPAID', tenantId: OTHER,
      recipientTaxNumber: '3333333333',
    },
  ].map(i => ({ ...iTemplate, ...i, tenantId: (i as any).tenantId ?? tenantId, isDeleted: false, paidAmount: 0, items: [], warehouseId: 'wh-1', userId: 'query-admin' }));

  const wTemplate = db.waybills[0];
  db.waybills = [
    { id: 'wb-1', waybillNo: 'IRS-2026-0001', type: 'SALES_DESPATCH', customerId: 'cus-b', customerCode: 'MUS-001', customerTitle: 'Beta Müşteri', date: '2026-10-03', status: 'PENDING' },
    { id: 'wb-2', waybillNo: 'IRS-2026-0002', type: 'PURCHASE_DESPATCH', customerId: 'sup-a', customerCode: 'TED-001', customerTitle: 'Alfa Tedarik', date: '2026-09-15', status: 'PENDING' },
  ].map(w => ({ ...wTemplate, ...w, tenantId, items: [], warehouseId: 'wh-1', shipmentDate: w.date, userId: 'query-admin' }));
});

const app = express();
app.use(express.json());
app.use('/api/v1/invoices', v1InvoicesRouter);
app.use('/api/v1/waybills', v1WaybillsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const port = (server.address() as AddressInfo).port;
const token = jwt.sign({ userId: 'query-admin', tenantId }, process.env.JWT_SECRET, { expiresIn: '5m' });
const H = { Authorization: `Bearer ${token}` };

const get = async (url: string) => {
  const r = await fetch(`http://127.0.0.1:${port}${url}`, { headers: H });
  return { status: r.status, body: await r.json() as any };
};
const ids = (b: any) => (b.data || []).map((d: any) => d.id).sort();

const before = JSON.stringify({ i: storage.getState().invoices, w: storage.getState().waybills, c: storage.getState().customers });

try {
  const I = '/api/v1/invoices';
  const W = '/api/v1/waybills';
  let n = 0;
  const check = (label: string, actual: unknown, expected: unknown) => {
    assert.deepEqual(actual, expected, label);
    n++;
  };

  // ── 1. Yön-farkında VKN ────────────────────────────────────────────────────
  // Gelen faturada tedarikçi VKN'si ile arama → tedarikçinin GELEN faturası gelir.
  check('gelen fatura + tedarikçi VKN', ids((await get(`${I}?type=PURCHASE&taxNumber=1111111111`)).body), ['pur-1']);
  // 🔴 NEGATİF KONTROL: gelen faturada BİZİM VKN'mizle arama → HİÇBİR ŞEY dönmemeli.
  check('gelen fatura + kendi VKN (negatif)', ids((await get(`${I}?type=PURCHASE&taxNumber=9998887776`)).body), []);
  // Giden faturada müşteri VKN'si → doğru kayıt.
  check('giden fatura + müşteri VKN', ids((await get(`${I}?type=SALES&taxNumber=2222222222`)).body), ['sal-1']);
  // VKN biçimlendirme: boşluk/nokta temizlenir.
  check('VKN biçim toleransı', ids((await get(`${I}?type=SALES&taxNumber=222%20222%202222`)).body), ['sal-1']);

  // ── 2. Tenant izolasyonu ──────────────────────────────────────────────────
  check('başka tenant belgesi görünmez', ids((await get(`${I}`)).body), ['pur-1', 'sal-1']);
  check('başka tenant VKN sızmaz', ids((await get(`${I}?taxNumber=3333333333`)).body), []);

  // ── 3. Belge no ───────────────────────────────────────────────────────────
  check('belge no kısmi', ids((await get(`${I}?invoiceNo=ALI-2026`)).body), ['pur-1']);

  // ── 4. Tarih aralığı ──────────────────────────────────────────────────────
  check('tarih aralığı', ids((await get(`${I}?startDate=2026-10-02&endDate=2026-10-05`)).body), ['sal-1']);
  check('bitiş günü dahil', ids((await get(`${I}?startDate=2026-10-05&endDate=2026-10-05`)).body), ['sal-1']);

  // ── 5. Geçersiz / ters aralık → 400 ───────────────────────────────────────
  check('ters aralık 400', (await get(`${I}?startDate=2026-10-05&endDate=2026-10-01`)).status, 400);
  check('geçersiz tarih 400', (await get(`${I}?startDate=05.10.2026`)).status, 400);

  // ── 6. Boş filtre → TÜM liste (search=undefined tuzağı) ───────────────────
  check('boş filtre tüm liste', ids((await get(`${I}?search=&taxNumber=&invoiceNo=`)).body), ['pur-1', 'sal-1']);

  // ── 7. Unvan / kod araması ────────────────────────────────────────────────
  check('search kodu da bulur', ids((await get(`${I}?search=MUS-001`)).body), ['sal-1']);
  check('titleOnly kodu bulmaz', ids((await get(`${I}?search=MUS-001&titleOnly=1`)).body), []);
  check('titleOnly unvanı bulur', ids((await get(`${I}?search=Beta&titleOnly=1`)).body), ['sal-1']);

  // ── 8. İrsaliye: tarih + VKN (cari join) + belge no ───────────────────────
  check('irsaliye tarih', ids((await get(`${W}?startDate=2026-10-01`)).body), ['wb-1']);
  check('irsaliye VKN join', ids((await get(`${W}?taxNumber=2222222222`)).body), ['wb-1']);
  check('irsaliye belge no', ids((await get(`${W}?waybillNo=IRS-2026-0002`)).body), ['wb-2']);
  check('irsaliye ters aralık 400', (await get(`${W}?startDate=2026-10-05&endDate=2026-10-01`)).status, 400);
  check('irsaliye boş filtre tüm liste', ids((await get(`${W}`)).body), ['wb-1', 'wb-2']);
  // Carisi olmayan VKN → tahmin yok, boş.
  check('irsaliye bilinmeyen VKN boş', ids((await get(`${W}?taxNumber=5555555555`)).body), []);

  // ── 9. Sütun değeri = filtrenin kullandığı VKN ───────────────────────────
  // Sütun, filtrenin kullandığı DEĞERİ göstermeli; ikisi çelişirse kullanıcı
  // listeye bakıp "neden bu sonuç geldi" diye anlayamaz.
  {
    const pur = (await get(`${I}?type=PURCHASE`)).body.data[0];
    // GELEN faturada karşı taraf TEDARİKÇİ → bizim VKN (9998887776) DEĞİL.
    check('gelen faturada sutun tedarikci VKN', pur._counterpartyTaxNumber, '1111111111');
    const sal = (await get(`${I}?type=SALES`)).body.data[0];
    check('giden faturada sutun musteri VKN', sal._counterpartyTaxNumber, '2222222222');
    const wb = (await get(`${W}?waybillNo=IRS-2026-0001`)).body.data[0];
    check('irsaliyede sutun cari VKN', wb._counterpartyTaxNumber, '2222222222');
    // VKN'si olmayan/bulunamayan kayıtta alan BOŞ — tahmin yok.
    const bos = (await get(`${W}?waybillNo=IRS-2026-0002`)).body.data[0];
    check('tedarikci cari VKN dogru', bos._counterpartyTaxNumber, '1111111111');
  }

  // ── 10. SALT OKUNUR ───────────────────────────────────────────────────────
  const after = JSON.stringify({ i: storage.getState().invoices, w: storage.getState().waybills, c: storage.getState().customers });
  assert.equal(after, before, 'Sorgulama hiçbir veriyi değiştirmemeli.');
  n++;

  console.warn(`documentQueryFilterTest: ${n} kontrol PASS (yon-farkinda VKN, tenant izolasyonu, tarih, 400, salt-okunur).`);
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}
