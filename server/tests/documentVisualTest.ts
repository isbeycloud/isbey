import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'documentVisualTest.ts.json') {
  throw new Error('Test yalnız izole documentVisualTest.ts.json ve NODE_ENV=test ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'visual-data');
const { storage } = await import('../db/storage');
const { DocumentStorageService } = await import('../services/documentStorageService');
const { prepareDocumentVisual } = await import('../services/documentVisualService');
const { v1EDocumentsRouter } = await import('../routes/v1/e-documents');
const { parseUblTree, findFirst, decodeXmlText } = await import('../services/ubl/ublTree');
const T = 'tnt-visual';
const xslt = `<?xml version="1.0"?><xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template match="/"><html><body>Özgün Tasarım <xsl:value-of select="/*/*[local-name()='ID']"/></body></html></xsl:template></xsl:stylesheet>`;
function xml(root = 'Invoice', template = xslt) {
  return `<${root} xmlns:cac="urn:cac" xmlns:cbc="urn:cbc"><cbc:ID>TEST-42</cbc:ID><cac:AdditionalDocumentReference><cbc:DocumentType>XSLT</cbc:DocumentType><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="application/xml" filename="original.xslt">${Buffer.from(template).toString('base64')}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference></${root}>`;
}
const invoiceXml = xml();
const despatchXml = xml('DespatchAdvice');
const invPath = DocumentStorageService.saveXml(T, 'invoice', 'test-invoice', invoiceXml);
const dspPath = DocumentStorageService.saveXml(T, 'despatch', 'test-despatch', despatchXml);
storage.update(db => {
  db.tenants = [{ ...db.tenants[0], id: T, status: 'ACTIVE', isArchived: false, name: 'Firma A', title: 'Firma A', taxNumber: '1111111111' }];
  db.users = [{ ...db.users[0], id: 'visual-admin', role: 'SUPER_ADMIN', active: true }];
  db.users.push({ ...db.users[0], id: 'visual-viewer', role: 'RAPOR', companyId: T });
  db.tenantUsers = [{ id: 'visual-member', userId: 'visual-viewer', tenantId: T, roleSlug: 'viewer', status: 'active', allowedMenuIds: ['faturalar'] }] as any;
  db.subscriptionPlans ||= [];
  db.subscriptionPlans.push({ id: 'visual-invoice-plan', status: 'ACTIVE', activeModules: ['FATURA'] } as any);
  db.tenants[0].selectedServicePlanIds = ['visual-invoice-plan'];
  db.customers = [{ ...db.customers[0], id: 'visual-customer', tenantId: T, title: 'Cari & Ortak', taxNumber: '2222222222' }];
  db.invoices = ['sales', 'purchase', 'archive', 'foreign'].map(id => ({ ...db.invoices[0], id, tenantId: id === 'foreign' ? 'tnt-other' : T,
    type: id === 'purchase' ? 'PURCHASE' : 'SALES', customerId: 'visual-customer', invoiceNo: 'ERP-42', isDeleted: false,
    currency: 'USD', invoiceProfile: 'TEMELFATURA', items: [{ ...db.invoices[0]?.items[0], productName: 'Ürün <A> & B', quantity: 0, unit: 'kg', unitPrice: 100, lineTotal: 0, vatAmount: 0, vatRate: 10 }] })) as any;
  db.waybills = [{ ...db.waybills[0], id: 'waybill', tenantId: T, type: 'SALES_DESPATCH', customerId: 'visual-customer', waybillNo: 'IRS-42', items: [{ productName: 'Sevk', quantity: 7, unit: 'kg' }] }] as any;
  db.invoices.push({ ...db.invoices[0], id: 'no-customer-card', customerId: null, customerTitle: 'Kayıtlı Alıcı',
    hizliModel: { customer: { PartyName: 'Belge Alıcısı & Ortak', IdentificationID: '3333333333', StreetName: 'Kayıtlı Adres' } } } as any);
  db.invoices.push({ ...db.invoices[0], id: 'foreign-customer-link', customerId: 'foreign-customer', customerTitle: 'Kayıtlı Alıcı' });
  db.customers.push({ ...db.customers[0], id: 'foreign-customer', tenantId: 'tnt-other', title: 'FOREIGN SECRET', taxNumber: '4444444444' });
  db.incomingInvoices = [{ id: 'incoming', tenantId: T, uuid: 'incoming-uuid', xmlStoragePath: invPath },
    { id: 'foreign-incoming', tenantId: 'tnt-other', xmlStoragePath: invPath }] as any;
  db.incomingDespatches = [{ id: 'incoming-despatch', tenantId: T, xmlStoragePath: dspPath }] as any;
  db.electronicDocuments = [{ id: 'archived', tenantId: T, documentType: 'INVOICE', internalDocumentId: 'archive', xmlStoragePath: invPath }] as any;
  db.documentTemplates = [{ id: 'company-template', companyId: T, documentType: 'EFATURA', isActive: true, isDefault: true, xsltContent: xslt.replace('Özgün Tasarım', 'Firma Tasarımı') },
    { id: 'other-template', companyId: 'tnt-other', documentType: 'EIRSALIYE', isActive: true, isDefault: true, xsltContent: 'FOREIGN SECRET' }] as any;
});

assert.equal(prepareDocumentVisual(invoiceXml, 'EFATURA', T, true).templateSource, 'embedded');
assert.equal(prepareDocumentVisual('<Invoice/>', 'EFATURA', T, false).templateSource, 'company');
assert.equal(prepareDocumentVisual('<Invoice/>', 'EFATURA', T, true).templateSource, 'standard');
assert.equal(prepareDocumentVisual('<DespatchAdvice/>', 'EIRSALIYE', T, false).templateSource, 'standard');
for (const bad of ['<xsl:stylesheet>', xslt.replace('<xsl:template', '<xsl:include href="https://outside.invalid"/><xsl:template'),
  xslt.replace('/*/*[local-name()=\'ID\']', "document('https://outside.invalid')"),
  xslt.replace('<xsl:template', '<xsl:for-each-group select="*" group-by="@id"/><xsl:template')]) {
  assert.throws(() => prepareDocumentVisual(xml('Invoice', bad), 'EFATURA', T, true));
}
assert.throws(() => prepareDocumentVisual(invoiceXml.replace(Buffer.from(xslt).toString('base64'), '%%%'), 'EFATURA', T, true));

const app = express();
app.use('/api/v1/e-documents', v1EDocumentsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/e-documents`;
const token = jwt.sign({ userId: 'visual-admin', tenantId: T }, process.env.JWT_SECRET);
storage.getState(T); // Mevcut tenant yapılandırmasının tembel başlangıcını test dışında tamamla.
const before = JSON.stringify(storage.getState());
try {
  for (const [url, source] of [
    ['/incoming/incoming/visual', 'embedded'], ['/incoming-despatches/incoming-despatch/visual', 'embedded'],
    ['/erp-invoices/sales/visual', 'company'], ['/erp-invoices/purchase/visual', 'standard'],
    ['/erp-invoices/archive/visual', 'embedded'], ['/erp-waybills/waybill/visual', 'standard'],
    ['/erp-invoices/no-customer-card/visual', 'company'], ['/erp-invoices/foreign-customer-link/visual', 'company'],
  ]) {
    const response = await fetch(base + url, { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.templateSource, source);
    assert.equal(result.renderedBy, 'client');
    assert.ok(result.xml && result.xslt);
    assert.equal(parseUblTree(result.xml).ok, true);
    if (url.includes('/sales/')) {
      assert.ok(result.xml.includes('Ürün &lt;A&gt; &amp; B'));
      assert.ok(result.xml.includes('unitCode="KGM">0'));
      assert.ok(result.xml.includes('currencyID="USD"'));
    }
    if (url.includes('/purchase/')) {
      const parsed = parseUblTree(result.xml);
      assert.equal(decodeXmlText(findFirst(findFirst(parsed.root, 'AccountingSupplierParty'), 'Name')?.text || ''), 'Cari & Ortak');
      assert.equal(findFirst(findFirst(parsed.root, 'AccountingCustomerParty'), 'Name')?.text, 'Firma A');
    }
    if (url.includes('/no-customer-card/')) {
      assert.ok(result.xml.includes('Belge Alıcısı &amp; Ortak'));
      assert.ok(result.xml.includes('3333333333'));
      assert.ok(result.xml.includes('Kayıtlı Adres'));
      assert.equal(result.xmlSource, 'erp');
    }
    if (url.includes('/foreign-customer-link/')) {
      assert.ok(result.xml.includes('Kayıtlı Alıcı'));
      assert.ok(!result.xml.includes('FOREIGN SECRET') && !result.xml.includes('4444444444'));
    }
  }
  for (const url of ['/erp-invoices/foreign/visual', '/incoming/foreign-incoming/visual']) {
    assert.equal((await fetch(base + url, { headers: { Authorization: `Bearer ${token}` } })).status, 404);
  }
  assert.equal((await fetch(base + '/erp-invoices/sales/visual')).status, 401);
  const viewer = jwt.sign({ userId: 'visual-viewer', tenantId: T }, process.env.JWT_SECRET);
  assert.equal((await fetch(base + '/erp-invoices/sales/visual', { headers: { Authorization: `Bearer ${viewer}` } })).status, 200,
    'Yalnız Fatura paketi ve faturalar menüsü olan görüntüleyici önizlemeyi açabilmeli.');
  assert.equal((await fetch(base + '/erp-waybills/waybill/visual', { headers: { Authorization: `Bearer ${viewer}` } })).status, 403,
    'Fatura paketi irsaliye erişimi vermemeli.');
  assert.equal(JSON.stringify(storage.getState()), before, 'Görüntüleme DB/muhasebe verisini değiştirmemeli.');
  console.warn('documentVisualTest: XSLT seçimi, 13 HTTP kontrolü, kayıtlı alıcı, paket/menü/rol izolasyonu, dış kaynak reddi ve salt okunur davranış PASS.');
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}
