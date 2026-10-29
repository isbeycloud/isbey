import { test, expect } from './fixtures/adminSession';
import { execFileSync } from 'node:child_process';
import { standardDocumentXslt } from '../server/services/ubl/standardDocumentXslt';
import { XsltEngineService } from '../server/services/xsltEngineService';

const codes = ['NIU', 'C62', 'NAR', 'KGM', 'MTR', 'XYZ-42', ''];
const labels = ['Adet', 'Adet', 'Adet', 'Kg', 'Metre', 'XYZ-42', ''];
const xml = `<Invoice xmlns:cbc="urn:cbc" xmlns:cac="urn:cac"><cbc:ID>UNIT-FIXTURE</cbc:ID>${codes.map((code, index) => `<cac:InvoiceLine><cbc:ID>${index + 1}</cbc:ID><cbc:InvoicedQuantity${code ? ` unitCode="${code}"` : ''}>2.5</cbc:InvoicedQuantity><cbc:LineExtensionAmount>28.125</cbc:LineExtensionAmount><cac:Item><cbc:Name>NIU Ürün ${index + 1}</cbc:Name><cac:SellersItemIdentification><cbc:ID>NIU</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price><cbc:PriceAmount>11.25</cbc:PriceAmount></cac:Price><cac:TaxTotal><cbc:TaxAmount>5.625</cbc:TaxAmount></cac:TaxTotal></cac:InvoiceLine>`).join('')}</Invoice>`;

test('standard and generated XSLT translate only unit cells and preserve original XML, names and numeric values', async ({ page }) => {
  await page.goto('/');
  const generated = XsltEngineService.generateXslt('EFATURA', {
    theme:'CLASSIC',primaryColor:'#333333',secondaryColor:'#555555',fontFamily:'Arial',fontSize:12,
    logoWidth:220,logoHeight:80,showLogo:false,signatureWidth:160,signatureHeight:70,showSignature:false,
    showQrCode:false,showBarcode:false,bankAccounts:[],columns:{showLineNumber:true,showProductCode:false,
      showBarcode:false,showDescription:true,showQuantity:true,showUnit:true,showUnitPrice:true,
      showDiscount:false,showVatRate:false,showVatAmount:true,showLineTotal:true},
  });
  for (const xslt of [standardDocumentXslt, generated]) {
  const result = await page.evaluate(({ xml, xslt }) => {
    const parser = new DOMParser();
    const source = parser.parseFromString(xml, 'application/xml');
    const serializer = new XMLSerializer(), before = serializer.serializeToString(source);
    const processor = new XSLTProcessor();
    processor.importStylesheet(parser.parseFromString(xslt, 'application/xml'));
    const output = processor.transformToDocument(source);
    return {
      cells: Array.from(output.querySelectorAll('table tr')).map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '')).filter(cells => cells.length === 7 && /^[1-7]$/.test(cells[0])),
      sourceUnchanged: before === serializer.serializeToString(source),
      rawUnits: Array.from(source.getElementsByTagNameNS('urn:cbc', 'InvoicedQuantity')).map(node => node.getAttribute('unitCode') || ''),
      sellerCodes: Array.from(source.getElementsByTagNameNS('urn:cac', 'SellersItemIdentification')).map(node => node.textContent),
    };
  }, { xml, xslt });
  expect(result.sourceUnchanged).toBe(true);
  expect(result.rawUnits).toEqual(codes);
  expect(result.sellerCodes).toEqual(codes.map(() => 'NIU'));
  expect(result.cells.map(cells => cells[3])).toEqual(labels);
  for (const [index, cells] of result.cells.entries()) {
    expect(cells).toEqual([String(index + 1), `NIU Ürün ${index + 1}`, '2.5', labels[index], '11.25', '5.625', '28.125']);
  }
  }
});

test('incoming detail and matching translate historic raw units without importing or changing source data', async ({ page, adminSession }) => {
  const lines = codes.map((code, index) => ({ lineNo: String(index + 1), name: `NIU Ürün ${index + 1}`, sellerProductCode: 'NIU', quantity: 2.5, unitCode: code || undefined, unitName: code, unitPrice: 11.25, vatRate: 20, vatAmount: 5.625, lineTotal: 28.125, grossLineTotal: 33.75 }));
  const document = { kind: 'INVOICE', uuid: 'unit-fixture', documentNo: 'UNIT-FIXTURE', issueDate: '2026-10-01', currency: 'TRY', supplier: { title: 'Birim Test Tedarikçisi', taxNumber: '2222222222' }, customer: { title: 'Alıcı', taxNumber: '1111111111' }, lines, subTotal: 196.875, vatTotal: 39.375, grandTotal: 236.25, warnings: [], errors: [] };
  const record = { id: 'unit-fixture', invoiceNo: 'UNIT-FIXTURE', supplierTitle: document.supplier.title, supplierTaxNumber: document.supplier.taxNumber, issueDate: document.issueDate, currency: 'TRY', status: 'RECEIVED', operationalStatus: 'NEW', items: [], grandTotal: document.grandTotal };
  const plan = { document, party: { exact: false, reason: 'Test için eşleştirme yapılmayacak.' }, lines: lines.map(line => ({ line, confidence: 'SUGGESTION', needsNewProduct: true })), totals: { computedSubTotal: document.subTotal, computedVatTotal: document.vatTotal, computedGrandTotal: document.grandTotal }, blockedReason: 'Yalnız gösterim testi; içeri aktarılmaz.' };
  const before = JSON.stringify({ document, plan });
  let importWrites = 0, reviewed = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/v1/e-documents/incoming/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      if (pathname.endsWith('/reviewed')) { reviewed++; return route.fulfill({ json: { success: true, invoice: record } }); }
      importWrites++; return route.abort();
    }
    if (pathname.endsWith('/list')) return route.fulfill({ json: { success: true, data: [record], pagination: { total: 1, page: 1, limit: 25, totalPages: 1 } } });
    if (pathname.endsWith('/detail')) return route.fulfill({ json: { success: true, record, document } });
    if (pathname.endsWith('/plan')) return route.fulfill({ json: { success: true, plan } });
    return route.continue();
  });
  await page.goto('/');
  await page.locator('aside').getByText('Gelen e-Belgeler', { exact: true }).click();
  await page.getByTitle('Belgeyi incele (Belge / Kalemler / Görsel / XML)').click();
  await page.getByRole('button', { name: /^Kalemler/ }).click();
  for (let i = 0; i < codes.length; i++) {
    const cells = page.getByRole('row').filter({ hasText: `NIU Ürün ${i + 1}` }).locator('td');
    await expect(cells.nth(3)).toHaveText(labels[i] || '—');
    await expect(cells.nth(1)).toContainText('NIU');
    await expect(cells.nth(2)).toHaveText('2,5');
    await expect(cells.nth(4)).toHaveText('11,25 TRY');
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'İçeri Al', exact: true }).click();
  for (let i = 0; i < codes.length; i++) {
    const cells = page.getByRole('row').filter({ hasText: `NIU Ürün ${i + 1}` }).locator('td');
    await expect(cells.nth(3)).toHaveText(labels[i] || '—');
    await expect(cells.nth(1)).toContainText('Kod: NIU');
    await expect(cells.nth(2)).toHaveText('2.5');
    await expect(cells.nth(4)).toContainText('11,25');
  }
  expect(importWrites).toBe(0);
  await expect.poll(() => reviewed).toBe(1);
  expect(JSON.stringify({ document, plan })).toBe(before);
  expect(errors).toEqual([]);
});

test('all invoice print templates display legacy unit labels without mutating payloads or inventing missing units', async ({ page }) => {
  const items = codes.map((unit, index) => Object.freeze({ productCode: 'NIU', productName: `NIU Ürün ${index + 1}`, quantity: 2.5, unit: unit || undefined, unitPrice: 11.25, vatRate: 20, vatAmount: 5.625, lineTotal: 28.125, lineGrandTotal: 33.75 }));
  const payload = Object.freeze({ invoiceNo: 'UNIT-FIXTURE', date: '2026-10-01', customerTitle: 'Birim Test', items: Object.freeze(items), subTotal: 196.875, totalVat: 39.375, grandTotal: 236.25 });
  const before = JSON.stringify(payload);
  // A separate tsx runtime renders production React components without Playwright's JSX transform.
  const script = `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {DocumentTemplateEngine} from './src/components/templates/DocumentTemplateEngine.tsx';
    let raw='';for await(const chunk of process.stdin)raw+=chunk;const payload=JSON.parse(raw),before=JSON.stringify(payload);
    payload.items.forEach(Object.freeze);Object.freeze(payload.items);Object.freeze(payload);
    const rendered=['classic','modern','corporate','compact','professional'].map(template=>({template,html:renderToStaticMarkup(React.createElement(DocumentTemplateEngine,{type:'A4_INVOICE',payload,overrideTemplate:template}))}));
    console.log(JSON.stringify({rendered,unchanged:JSON.stringify(payload)===before}));`;
  const result = JSON.parse(execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e',script], { input: before, encoding: 'utf8' }));
  expect(result.unchanged).toBe(true);
  for (const { template, html } of result.rendered) {
    await page.setContent(html);
    for (let i = 0; i < codes.length; i++) {
      const row = page.getByRole('row').filter({ hasText: `NIU Ürün ${i + 1}` });
      const cells = (await row.locator('td').allTextContents()).map(cell => cell.trim());
      expect(cells.some(cell => cell.includes(`NIU Ürün ${i + 1}`))).toBe(true);
      expect(cells.some(cell => cell.startsWith(template === 'compact' ? '11.25' : '11,25'))).toBe(true);
      expect(cells.some(cell => cell.startsWith(template === 'compact' ? '33.75' : '33,75'))).toBe(true);
      if (labels[i]) expect(cells.some(cell => cell.trim() === labels[i] || cell.trim().endsWith(` ${labels[i]}`))).toBe(true);
      else {
        const quantities = cells.filter(cell => cell.trim() === '2.5' || cell.trim().startsWith('2.5 '));
        expect(quantities).toEqual(['2.5']);
        expect(cells.some(cell => cell.trim() === 'Adet')).toBe(false);
      }
    }
    expect(JSON.stringify(payload)).toBe(before);
  }
});
