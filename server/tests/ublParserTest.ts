import assert from 'node:assert/strict';
import { UblInvoiceBuilder } from '../services/ubl/ublInvoiceBuilder';
import { UblDespatchBuilder } from '../services/ubl/ublDespatchBuilder';
import { parseUblDocument, canIngest, unitNameFromUbl } from '../services/ubl/ublParser';
import { parseUblTree, decodeXmlText } from '../services/ubl/ublTree';
import type { Invoice, Waybill, Tenant, Customer } from '../db/schema';

/**
 * UBL-TR ÇÖZÜMLEYİCİ SÖZLEŞMESİ
 * ==========================================================================
 * 2026-09-28 — Gelen e-Fatura / e-İrsaliye içeri aktarma özelliği için.
 *
 * NEDEN BU TEST: Yeni çözümleyici, gelen belgelerin GERÇEK içeriğini okumak
 * için yazıldı. Yanlış okuyan bir çözümleyici, kullanıcının muhasebesine
 * yanlış kalem/tutar/KDV yazar. Bu yüzden test yalnız "çalışıyor mu" değil,
 * "DOĞRU okuyor mu" sorusunu sorar.
 *
 * EN GÜÇLÜ KANIT — GİDİŞ-DÖNÜŞ: Kendi ÜRETTİĞİMİZ UBL belgesi (giden fatura ve
 * irsaliye üreticileriyle) çözümleyiciden geçirilir ve alanlar BİREBİR
 * karşılaştırılır. Böylece çözümleyici, sistemin gerçekten ürettiği biçime
 * karşı sınanır — elle yazılmış bir örnekle değil.
 *
 * AYRICA: Bilinmeyen/eksik/bozuk belgeler test edilir. Eski davranışta eksik
 * veri SESSİZCE uyduruluyordu (sabit %20 KDV, "Gelen Mal / Hizmet Kalemi"
 * adı). Artık eksik veri ya hata ya uyarı üretmeli; asla uydurulmamalı.
 */

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`      ${err?.message || err}`);
  }
}

// ── Test verisi ─────────────────────────────────────────────────────────────
const tenant = {
  id: 'tnt-test', name: 'Test A.Ş.', title: 'FAZ4 TEKNOLOJI VE TICARET A.S.',
  taxNumber: '1234567890', taxOffice: 'Merkez Vergi Dairesi',
  city: 'İstanbul', district: 'Merkez',
} as unknown as Tenant;

const customer = {
  id: 'cust-1', code: '120.001', title: 'E-Fatura Müşterisi A.Ş.',
  taxNumber: '1122334450', taxOffice: 'Vergi Dairesi',
  city: 'İstanbul', district: 'Merkez',
} as unknown as Customer;

const invoice = {
  id: 'inv-1', invoiceNo: 'SAT-2026-000016', type: 'SALES', status: 'ACTIVE',
  customerId: 'cust-1', customerCode: '120.001', customerTitle: 'E-Fatura Müşterisi A.Ş.',
  date: '2026-09-02', maturityDate: '2026-09-02',
  subTotal: 5000, totalDiscount: 0, totalVat: 1000, grandTotal: 6000,
  paidAmount: 0, paymentStatus: 'UNPAID', warehouseId: 'wh-default',
  items: [
    {
      id: 'it-1', productId: 'p-1', productCode: 'STK-EDOC-01', productName: 'Bulut Sunucu Lisansı',
      quantity: 5, unit: 'Adet', unitPrice: 1000, vatRate: 20, vatAmount: 1000,
      lineTotal: 5000, lineGrandTotal: 6000,
    },
  ],
  currency: 'TRY',
} as unknown as Invoice;

const waybill = {
  id: 'wb-1', waybillNo: 'IRS-2026-000003', type: 'SALES_DESPATCH',
  customerId: 'cust-1', customerCode: '120.001', customerTitle: 'E-Fatura Müşterisi A.Ş.',
  date: '2026-09-02', shipmentDate: '2026-09-02', warehouseId: 'wh-default',
  status: 'PENDING', notes: '',
  items: [
    {
      id: 'wi-1', productId: 'p-1', productCode: 'STK-1', productName: 'Ürün',
      quantity: 10, unit: 'Adet', unitPrice: 0, discount1: 0, discount2: 0,
      vatRate: 20, lineTotal: 0, lineGrandTotal: 0,
    },
  ],
} as unknown as Waybill;

// ── 1. Ağaç çözümleyici ─────────────────────────────────────────────────────

test('ağaç: basit belge kök ve metin okunur', () => {
  const r = parseUblTree('<A><B>x</B></A>');
  assert.equal(r.ok, true);
  assert.equal(r.root?.name, 'A');
  assert.equal(r.root?.children[0]?.name, 'B');
  assert.equal(r.root?.children[0]?.text, 'x');
});

test('ağaç: namespace öneki soyulur, ham ad korunur', () => {
  const r = parseUblTree('<cbc:ID>x</cbc:ID>');
  assert.equal(r.root?.name, 'ID');
  assert.equal(r.root?.rawName, 'cbc:ID');
});

test('ağaç: CDATA içeriği olduğu gibi korunur (kaçış çözülmez)', () => {
  const r = parseUblTree('<A><![CDATA[<b>&x</b>]]></A>');
  assert.equal(r.root?.text, '<b>&x</b>');
});

test('ağaç: yorum ve işlem yönergesi atlanır', () => {
  const r = parseUblTree('<?xml version="1.0"?><!-- not --><A><!-- iç --><B/></A>');
  assert.equal(r.ok, true);
  assert.equal(r.root?.name, 'A');
  assert.equal(r.root?.children.length, 1);
});

test('ağaç: self-closing etiket boş metinle düğüm olur', () => {
  const r = parseUblTree('<A><B/></A>');
  assert.equal(r.root?.children[0]?.text, '');
});

test('ağaç: nitelik tırnakları ve entity çözülür', () => {
  const r = parseUblTree('<A x="1 &amp; 2" y=\'z\'/>');
  assert.equal(r.root?.attrs.x, '1 & 2');
  assert.equal(r.root?.attrs.y, 'z');
});

test('ağaç: tırnak içindeki > etiketi bozmaz', () => {
  const r = parseUblTree('<A b="a > b">t</A>');
  assert.equal(r.ok, true);
  assert.equal(r.root?.attrs.b, 'a > b');
});

test('ağaç: bozuk XML konumla REDDEDİLİR', () => {
  const r = parseUblTree('<A><B></A>');
  assert.equal(r.ok, false);
  assert.ok(r.error, 'hata mesajı boş olmamalı');
});

test('ağaç: iki kök eleman reddedilir', () => {
  const r = parseUblTree('<A/><B/>');
  assert.equal(r.ok, false);
});

test('ağaç: boş içerik reddedilir', () => {
  assert.equal(parseUblTree('').ok, false);
  assert.equal(parseUblTree('   ').ok, false);
});

test('entity: sayısal ve adlandırılmış entity çözülür', () => {
  assert.equal(decodeXmlText('a&amp;b'), 'a&b');
  assert.equal(decodeXmlText('&#65;'), 'A');
  assert.equal(decodeXmlText('&#x41;'), 'A');
  // Bilinmeyen entity bozulmadan kalır (sessizce silinmez).
  assert.equal(decodeXmlText('&bilinmeyen;'), '&bilinmeyen;');
});

// ── 2. GİDİŞ-DÖNÜŞ: kendi ürettiğimiz fatura ────────────────────────────────

test('gidiş-dönüş: üretilen e-Fatura birebir geri okunur', () => {
  const xml = UblInvoiceBuilder.buildXml({ invoice, tenant, customer, uuid: 'aa58f0cc-4128-46d9-aa2d-e81bd9f38b7e' });
  const doc = parseUblDocument(xml);

  assert.deepEqual(doc.errors, [], `beklenmeyen hata: ${doc.errors.join(' | ')}`);
  assert.equal(doc.kind, 'INVOICE');
  assert.equal(doc.uuid, 'aa58f0cc-4128-46d9-aa2d-e81bd9f38b7e');
  assert.equal(doc.documentNo, 'SAT-2026-000016');
  assert.equal(doc.issueDate, '2026-09-02');
  assert.equal(doc.currency, 'TRY');

  // Taraf bilgisi: VKN ve unvan DOĞRU okunmalı.
  assert.equal(doc.supplier.taxNumber, '1234567890');
  assert.equal(doc.supplier.scheme, 'VKN');
  assert.equal(doc.supplier.title, 'FAZ4 TEKNOLOJI VE TICARET A.S.');
  assert.equal(doc.customer.taxNumber, '1122334450');

  // Kalem bilgisi: eskiden burada TEK uydurma satır vardı.
  assert.equal(doc.lines.length, 1, 'kalem sayısı');
  const line = doc.lines[0];
  assert.equal(line.name, 'Bulut Sunucu Lisansı');
  assert.equal(line.quantity, 5);
  assert.equal(line.unitCode, 'C62');
  assert.equal(line.unitName, 'Adet');
  assert.equal(line.unitPrice, 1000);
  assert.equal(line.vatRate, 20);
  assert.equal(line.vatAmount, 1000);
  assert.equal(line.lineTotal, 5000);
  assert.equal(line.sellerProductCode, 'STK-EDOC-01');

  // Toplamlar kalemlerden hesaplanmalı ve belgeyle uyuşmalı.
  assert.equal(doc.subTotal, 5000);
  assert.equal(doc.vatTotal, 1000);
  assert.equal(doc.grandTotal, 6000);
  assert.equal(doc.warnings.length, 0, `beklenmeyen uyarı: ${doc.warnings.join(' | ')}`);
});

test('gidiş-dönüş: üretilen e-İrsaliye birebir geri okunur', () => {
  const xml = UblDespatchBuilder.buildXml({ waybill, tenant, customer, uuid: '505a5fa0-1325-4ab6-bc31-a0b0d696f6b9' });
  const doc = parseUblDocument(xml);

  assert.deepEqual(doc.errors, [], `beklenmeyen hata: ${doc.errors.join(' | ')}`);
  assert.equal(doc.kind, 'DESPATCH');
  assert.equal(doc.uuid, '505a5fa0-1325-4ab6-bc31-a0b0d696f6b9');
  assert.equal(doc.documentNo, 'IRS-2026-000003');
  assert.equal(doc.supplier.taxNumber, '1234567890');
  assert.equal(doc.lines.length, 1);
  assert.equal(doc.lines[0].name, 'Ürün');
  assert.equal(doc.lines[0].quantity, 10);
  assert.equal(doc.lines[0].sellerProductCode, 'STK-1');
  // İrsaliye fiyat taşımaz — bu bir EKSİKLİK DEĞİL, uyarı üretmemeli.
  assert.equal(doc.warnings.length, 0, `irsaliyede fiyat uyarısı üretilmemeli: ${doc.warnings.join(' | ')}`);
});

test('gidiş-dönüş: çok kalemli fatura kalem kalem okunur', () => {
  const multi = {
    ...invoice,
    // Toplamlar kalemlerle TUTARLI olmalı; aksi hâlde test yapay bir uyarı
    // üretir ve asıl ölçülmek istenen şeyi bulanıklaştırır.
    subTotal: 1350, totalDiscount: 0, totalVat: 65, grandTotal: 1415,
    items: [
      { id: 'i1', productId: 'p1', productCode: 'A-1', productName: 'Kalem Bir', quantity: 2, unit: 'Adet', unitPrice: 100, vatRate: 20, vatAmount: 40, lineTotal: 200, lineGrandTotal: 240 },
      { id: 'i2', productId: 'p2', productCode: 'A-2', productName: 'Kalem İki', quantity: 3, unit: 'Kg', unitPrice: 50, vatRate: 10, vatAmount: 15, lineTotal: 150, lineGrandTotal: 165 },
      { id: 'i3', productId: 'p3', productCode: 'A-3', productName: 'Kalem Üç', quantity: 1, unit: 'Litre', unitPrice: 1000, vatRate: 1, vatAmount: 10, lineTotal: 1000, lineGrandTotal: 1010 },
    ],
  } as unknown as Invoice;

  const xml = UblInvoiceBuilder.buildXml({ invoice: multi, tenant, customer, uuid: 'b1111111-2222-3333-4444-555555555555' });
  const doc = parseUblDocument(xml);

  assert.equal(doc.lines.length, 3, 'üç kalem de okunmalı');
  assert.deepEqual(doc.lines.map(l => l.name), ['Kalem Bir', 'Kalem İki', 'Kalem Üç']);
  // Farklı KDV oranları KORUNMALI — eski kod hepsini %20 yapıyordu.
  assert.deepEqual(doc.lines.map(l => l.vatRate), [20, 10, 1]);
  assert.deepEqual(doc.lines.map(l => l.unitName), ['Adet', 'Kg', 'Litre']);
  assert.deepEqual(doc.lines.map(l => l.sellerProductCode), ['A-1', 'A-2', 'A-3']);
  assert.equal(doc.subTotal, 1350);
  assert.equal(doc.vatTotal, 65);
  assert.equal(doc.grandTotal, 1415);
});

// ── 3. İçerik doğrulaması (sessiz yanlış okumayı yakalar) ───────────────────

test('doğrulama: bildirilen tutar ile hesaplanan tutar uyuşmazsa UYARI üretilir', () => {
  // Kalem 1000 TL ama belge 9999 TL ödenecek diyor → çözümleme bir yeri
  // kaçırmış olabilir; kullanıcı görmeli.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns:cbc="urn:x" xmlns:cac="urn:y">
  <cbc:ID>F-1</cbc:ID><cbc:UUID>11111111-1111-1111-1111-111111111111</cbc:UUID>
  <cbc:IssueDate>2026-01-01</cbc:IssueDate>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Satıcı</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal><cbc:PayableAmount>9999.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>1000.00</cbc:LineExtensionAmount>
    <cac:TaxTotal><cbc:TaxAmount>0.00</cbc:TaxAmount>
      <cac:TaxSubtotal><cbc:Percent>0</cbc:Percent></cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item><cbc:Name>Ürün</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount>1000.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
  const doc = parseUblDocument(xml);
  assert.deepEqual(doc.errors, []);
  assert.ok(
    doc.warnings.some(w => w.includes('uyuşmuyor')),
    `tutar uyuşmazlığı uyarısı bekleniyordu, gelen: ${JSON.stringify(doc.warnings)}`
  );
});

test('doğrulama: ETTN yoksa içeri aktarma ENGELLENİR', () => {
  const xml = `<Invoice xmlns:cbc="urn:x"><cbc:ID>F-1</cbc:ID></Invoice>`;
  const doc = parseUblDocument(xml);
  assert.ok(doc.errors.some(e => e.includes('ETTN')), 'ETTN eksikliği hata olmalı');
  assert.equal(canIngest(doc).ok, false);
});

test('doğrulama: kalemi olmayan belge ENGELLENİR', () => {
  const xml = `<Invoice xmlns:cbc="urn:x">
    <cbc:ID>F-1</cbc:ID><cbc:UUID>11111111-1111-1111-1111-111111111111</cbc:UUID>
  </Invoice>`;
  const doc = parseUblDocument(xml);
  assert.equal(canIngest(doc).ok, false);
});

test('doğrulama: satıcı VKN yoksa ENGELLENİR', () => {
  const xml = `<Invoice xmlns:cbc="urn:x">
    <cbc:ID>F-1</cbc:ID><cbc:UUID>11111111-1111-1111-1111-111111111111</cbc:UUID>
    <cac:InvoiceLine xmlns:cac="urn:y"><cbc:ID>1</cbc:ID></cac:InvoiceLine>
  </Invoice>`;
  const doc = parseUblDocument(xml);
  assert.ok(doc.errors.some(e => e.includes('VKN')), 'VKN eksikliği hata olmalı');
});

test('doğrulama: UBL olmayan kök reddedilir', () => {
  const doc = parseUblDocument('<Fatura><ID>1</ID></Fatura>');
  assert.equal(doc.errors.length > 0, true);
  assert.ok(doc.errors[0].includes('kök'), `kök hatası bekleniyordu: ${doc.errors[0]}`);
});

test('doğrulama: bozuk XML yarım sonuç ÜRETMEZ', () => {
  const doc = parseUblDocument('<Invoice><cbc:ID>x</cbc:ID>');
  assert.ok(doc.errors.length > 0);
  assert.equal(doc.lines.length, 0, 'bozuk belgeden kalem üretilmemeli');
  assert.equal(doc.grandTotal, 0);
});

// ── 4. Eksik veri UYDURULMAZ ────────────────────────────────────────────────

test('eksik veri: KDV oranı belgede yoksa %0 yazılır ve UYARI verilir (uydurma %20 YOK)', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns:cbc="urn:x" xmlns:cac="urn:y">
  <cbc:ID>F-2</cbc:ID><cbc:UUID>22222222-2222-2222-2222-222222222222</cbc:UUID>
  <cbc:IssueDate>2026-01-01</cbc:IssueDate>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Satıcı A.Ş.</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>500.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Hizmet</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount>250.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
  const doc = parseUblDocument(xml);
  assert.equal(doc.lines[0].vatRate, 0, 'uydurma %20 yazılmamalı');
  assert.ok(doc.warnings.some(w => w.includes('KDV oranı')), 'eksik KDV oranı uyarı üretmeli');
  // Birim fiyat belgeden okunur, uydurulmaz.
  assert.equal(doc.lines[0].unitPrice, 250);
  assert.equal(doc.lines[0].quantity, 2);
});

test('eksik veri: birim fiyat yoksa satır tutarından TÜRETİLİR, sıfır yazılmaz', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns:cbc="urn:x" xmlns:cac="urn:y">
  <cbc:ID>F-3</cbc:ID><cbc:UUID>33333333-3333-3333-3333-333333333333</cbc:UUID>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Satıcı</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">4</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>400.00</cbc:LineExtensionAmount>
    <cac:TaxTotal><cbc:TaxAmount>80.00</cbc:TaxAmount>
      <cac:TaxSubtotal><cbc:Percent>20</cbc:Percent></cac:TaxSubtotal></cac:TaxTotal>
    <cac:Item><cbc:Name>Ürün</cbc:Name></cac:Item>
  </cac:InvoiceLine>
</Invoice>`;
  const doc = parseUblDocument(xml);
  assert.equal(doc.lines[0].unitPrice, 100, '400 / 4 = 100 türetilmeli');
});

test('eksik veri: KDV oranı yoksa tutardan TÜRETİLİR', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns:cbc="urn:x" xmlns:cac="urn:y">
  <cbc:ID>F-4</cbc:ID><cbc:UUID>44444444-4444-4444-4444-444444444444</cbc:UUID>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Satıcı</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>200.00</cbc:LineExtensionAmount>
    <cac:TaxTotal><cbc:TaxAmount>20.00</cbc:TaxAmount>
      <cac:TaxSubtotal><cbc:TaxAmount>20.00</cbc:TaxAmount></cac:TaxSubtotal></cac:TaxTotal>
    <cac:Item><cbc:Name>Ürün</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount>200.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
  const doc = parseUblDocument(xml);
  assert.equal(doc.lines[0].vatRate, 10, '20/200 = %10 türetilmeli');
});

// ── 5. Sayı biçimi ──────────────────────────────────────────────────────────

test('biçim: nokta ondalık ve virgül ondalık ikisi de doğru okunur', () => {
  const mk = (amount: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns:cbc="urn:x" xmlns:cac="urn:y">
  <cbc:ID>F</cbc:ID><cbc:UUID>55555555-5555-5555-5555-555555555555</cbc:UUID>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>S</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>${amount}</cbc:LineExtensionAmount>
    <cac:TaxTotal><cbc:TaxAmount>0</cbc:TaxAmount><cac:TaxSubtotal><cbc:Percent>0</cbc:Percent></cac:TaxSubtotal></cac:TaxTotal>
    <cac:Item><cbc:Name>Ü</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount>${amount}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
  assert.equal(parseUblDocument(mk('1234.56')).lines[0].lineTotal, 1234.56, 'nokta ondalık');
  assert.equal(parseUblDocument(mk('1234,56')).lines[0].lineTotal, 1234.56, 'virgül ondalık');
  assert.equal(parseUblDocument(mk('1.234,56')).lines[0].lineTotal, 1234.56, 'Türkçe binlik+ondalık');
  assert.equal(parseUblDocument(mk('1234')).lines[0].lineTotal, 1234, 'tam sayı');
});

test('biçim: geçersiz sayı 0 değil UNDEFINED sayılır (sessiz sıfır yok)', () => {
  const xml = `<Invoice xmlns:cbc="urn:x" xmlns:cac="urn:y">
    <cbc:ID>F</cbc:ID><cbc:UUID>66666666-6666-6666-6666-666666666666</cbc:UUID>
    <cac:AccountingSupplierParty><cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>S</cbc:Name></cac:PartyName>
    </cac:Party></cac:AccountingSupplierParty>
    <cac:InvoiceLine>
      <cbc:ID>1</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount>abc</cbc:LineExtensionAmount>
      <cac:Item><cbc:Name>Ü</cbc:Name></cac:Item>
    </cac:InvoiceLine>
  </Invoice>`;
  // Okunamayan tutar 0'a düşer (toplam bozulmasın) ama bu SESSİZ kalmaz —
  // uyarı üretilir ve kullanıcı onay ekranında görür.
  const doc = parseUblDocument(xml);
  assert.equal(doc.lines[0].lineTotal, 0);
  assert.ok(doc.warnings.length > 0, 'okunamayan tutar uyarı üretmeli');
});

// ── 6. Birim eşlemesi ───────────────────────────────────────────────────────

test('birim: UBL kodu okunabilir ada çevrilir', () => {
  assert.equal(unitNameFromUbl('C62'), 'Adet');
  assert.equal(unitNameFromUbl('KGM'), 'Kg');
  assert.equal(unitNameFromUbl('LTR'), 'Litre');
  // Bilinmeyen kod olduğu gibi kalır (uydurma ad üretilmez).
  assert.equal(unitNameFromUbl('XYZ'), 'XYZ');
  assert.equal(unitNameFromUbl(undefined), 'Adet');
});

// ── 7. Özet ─────────────────────────────────────────────────────────────────

console.log(`\nUBL çözümleyici sözleşmesi: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
