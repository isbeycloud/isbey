import { test, expect } from './fixtures/adminSession';
import fs from 'node:fs';
import { HIZLI_UNIT_CATALOG, HIZLI_UNIT_CATALOG_SOURCE } from '../src/data/hizliUnitCatalog';
import { HIZLI_BIRIM_LISTESI } from '../src/data/hizliBilisimConstants';
import { UNIT_LABELS, resolveHizliUnitCode } from '../src/utils/unitDisplay';
import { standardDocumentXslt } from '../server/services/ubl/standardDocumentXslt';
import { XsltEngineService } from '../server/services/xsltEngineService';

const rareUnits = { KTM: 'KİLOMETRE', MIN: 'DAKİKA', GLL: 'GALON', SM3: 'STANDART METREKÜP' };

test('verified catalog keeps 96 source descriptions as 95 unique selectable codes without invented numeric IDs', () => {
  expect(HIZLI_UNIT_CATALOG_SOURCE.sourceRowCount).toBe(96);
  expect(HIZLI_UNIT_CATALOG_SOURCE.unitCount).toBe(95);
  expect(HIZLI_UNIT_CATALOG_SOURCE.sourceUrl).toBe('https://econnect.hizliteknoloji.com.tr/HizliApi/RestApi/GetCodeList?type=BIRIM');
  expect(HIZLI_UNIT_CATALOG_SOURCE.normalizedRowsSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(HIZLI_UNIT_CATALOG).toHaveLength(95);
  expect(new Set(HIZLI_UNIT_CATALOG.map(unit => unit.code)).size).toBe(95);
  expect(HIZLI_UNIT_CATALOG.reduce((count, unit) => count + 1 + (unit.alternativeNames?.length || 0), 0)).toBe(96);
  expect(HIZLI_UNIT_CATALOG.find(unit => unit.code === 'MWH')).toEqual({ code: 'MWH', name: 'MEGAWATT SAAT', alternativeNames: ['MEGAWATT SAAT (1000 kW.h)'] });
  expect(HIZLI_UNIT_CATALOG_SOURCE.normalizedCodeWhitespace).toEqual(['CEN']);
  expect(HIZLI_UNIT_CATALOG.find(unit => unit.code === 'CEN')?.name).toBe('YÜZ ADET');
  for (const [code, name] of Object.entries(rareUnits)) expect(HIZLI_UNIT_CATALOG.find(unit => unit.code === code)?.name).toBe(name);
  expect(HIZLI_BIRIM_LISTESI.map(unit => unit.BirimKodu)).toEqual(HIZLI_UNIT_CATALOG.map(unit => unit.code));
  expect(HIZLI_BIRIM_LISTESI.every(unit => !('BirimId' in unit))).toBe(true);
  expect(HIZLI_BIRIM_LISTESI.every(unit => unit.BirimKodu === unit.BirimKodu.trim())).toBe(true);
  for (const unit of HIZLI_UNIT_CATALOG) expect(resolveHizliUnitCode(unit.code)).toBe(unit.code);
  for (const [name, code] of Object.entries({ Adet: 'C62', Ton: 'TNE', Paket: 'PA', Kg: 'KGM', Metre: 'MTR', Kilometre: 'KTM', 'MEGAWATT SAAT (1000 kW.h)': 'MWH' })) expect(resolveHizliUnitCode(name)).toBe(code);
  expect(resolveHizliUnitCode('NIU')).toBe('NIU');
  expect(resolveHizliUnitCode('Özel Ölçü')).toBeUndefined();
  expect(resolveHizliUnitCode('')).toBeUndefined();
  expect(resolveHizliUnitCode(undefined)).toBeUndefined();
});

test('invoice unit selector exposes all 95 codes and local model export retains rare unit codes and numeric values', async ({ page, adminSession }) => {
  let writes = 0;
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/**', route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) { writes++; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.locator('aside').getByText('Faturalar', { exact: true }).click();
  await page.getByRole('button', { name: /e-Fatura & e-Arşiv Portalı/ }).first().click();
  await page.getByRole('button', { name: 'Yeni e-Fatura / e-Arşiv Oluştur', exact: true }).click();
  for (let i = 1; i < Object.keys(rareUnits).length; i++) await page.getByRole('button', { name: 'Yeni Kalem Ekle', exact: true }).click();
  const selectors = page.locator('select').filter({ has: page.locator('option[value="KTM"]') });
  await expect(selectors).toHaveCount(4);
  const optionValues = await selectors.first().locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
  expect(optionValues).toHaveLength(95);
  expect(new Set(optionValues).size).toBe(95);
  expect(optionValues).toEqual(HIZLI_UNIT_CATALOG.map(unit => unit.code));
  for (let i = 0; i < 4; i++) {
    const row = selectors.nth(i).locator('xpath=ancestor::tr');
    await row.getByPlaceholder('Ürün adı yazın veya listeden seçin...').fill(`Birim Kataloğu Testi ${i + 1}`);
    await row.locator('td').nth(2).locator('input').fill('3.5');
    await row.locator('td').nth(4).locator('input').fill('12.4');
  }
  async function exportModel() {
    const pending = page.waitForEvent('download');
    await page.getByTitle('Fatura Modelini JSON/XML olarak indir').click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const localFile = await download.path();
    expect(localFile).toBeTruthy();
    return JSON.parse(fs.readFileSync(localFile!, 'utf8'));
  }
  const before = await exportModel();
  for (const [i, [code, name]] of Object.entries(rareUnits).entries()) {
    await expect(selectors.nth(i).locator(`option[value="${code}"]`)).toHaveText(`${name} (${code})`);
    await selectors.nth(i).selectOption(code);
    await expect(selectors.nth(i)).toHaveValue(code);
  }
  const after = await exportModel();
  expect(after.invoiceLines.map((line: { Quantity_Unit_User: string }) => line.Quantity_Unit_User)).toEqual(Object.keys(rareUnits));
  after.invoiceLines.forEach((line: Record<string, unknown>, i: number) => {
    expect(line).toEqual({ ...before.invoiceLines[i], Quantity_Unit_User: Object.keys(rareUnits)[i] });
    expect(line.Quantity_Amount).toBe(3.5); expect(line.Price_Amount).toBe(12.4);
  });
  expect(after.invoiceheader.PayableAmount).toBe(before.invoiceheader.PayableAmount);
  expect(writes).toBe(0);
  expect(pageErrors).toEqual([]);
});

test('selecting products resolves catalog unit names and codes without inventing Adet for an unknown unit', async ({ page, adminSession }) => {
  const cases = [
    { unit: 'Kg', code: 'KGM' }, { unit: 'Metre', code: 'MTR' },
    { unit: 'KTM', code: 'KTM' }, { unit: 'Kilometre', code: 'KTM' },
    { unit: 'Özel Ölçü', code: '' },
  ];
  const products = cases.map((entry, i) => ({ id: `catalog-product-${i}`, code: `CAT-${i}`, name: `Birimli Test Ürünü ${i + 1}`, unit: entry.unit, salePrice: 12.4 }));
  let writes = 0;
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/**', route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) { writes++; return route.abort(); }
    if (new URL(route.request().url()).pathname === '/api/products') return route.fulfill({ json: { success: true, products } });
    return route.continue();
  });
  await page.goto('/');
  await page.locator('aside').getByText('Faturalar', { exact: true }).click();
  await page.getByRole('button', { name: /e-Fatura & e-Arşiv Portalı/ }).first().click();
  await page.getByRole('button', { name: 'Yeni e-Fatura / e-Arşiv Oluştur', exact: true }).click();
  const selector = page.locator('select').filter({ has: page.locator('option[value="KTM"]') });
  const row = selector.locator('xpath=ancestor::tr');
  await expect(page.locator('datalist#products-datalist-0 option')).toHaveCount(products.length);
  await row.locator('td').nth(2).locator('input').fill('3.5');
  for (const [index, entry] of cases.entries()) {
    await row.getByPlaceholder('Ürün adı yazın veya listeden seçin...').fill(products[index].name);
    await expect(selector).toHaveValue(entry.code);
    await expect(row.locator('td').nth(2).locator('input')).toHaveValue('3.5');
    await expect(row.locator('td').nth(4).locator('input')).toHaveValue('12.4');
  }
  await expect(selector.locator('option[value=""]')).toBeDisabled();
  const pending = page.waitForEvent('download');
  await page.getByTitle('Fatura Modelini JSON/XML olarak indir').click();
  const exported = await pending;
  const model = JSON.parse(fs.readFileSync((await exported.path())!, 'utf8'));
  expect(model.invoiceLines[0].Quantity_Unit_User).toBe('');
  expect(model.invoiceLines[0].Quantity_Amount).toBe(3.5);
  expect(model.invoiceLines[0].Price_Amount).toBe(12.4);
  expect(writes).toBe(0);
});

test('standard and generated XSLT display all 95 catalog units while leaving source unit codes untouched', async ({ page }) => {
  const generated = XsltEngineService.generateXslt('EFATURA', {
    theme:'CLASSIC',primaryColor:'#333333',secondaryColor:'#555555',fontFamily:'Arial',fontSize:12,
    logoWidth:220,logoHeight:80,showLogo:false,signatureWidth:160,signatureHeight:70,showSignature:false,
    showQrCode:false,showBarcode:false,bankAccounts:[],columns:{showLineNumber:true,showProductCode:false,
      showBarcode:false,showDescription:true,showQuantity:true,showUnit:true,showUnitPrice:true,
      showDiscount:false,showVatRate:false,showVatAmount:true,showLineTotal:true},
  });
  const xml = `<Invoice xmlns:cbc="urn:cbc" xmlns:cac="urn:cac"><cbc:ID>UNIT-CATALOG-TEST</cbc:ID>${HIZLI_UNIT_CATALOG.map((unit, i) => `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="${unit.code}">3.5</cbc:InvoicedQuantity><cbc:LineExtensionAmount>43.4</cbc:LineExtensionAmount><cac:Item><cbc:Name>NIU Katalog ${i + 1}</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount>12.4</cbc:PriceAmount></cac:Price><cac:TaxTotal><cbc:TaxAmount>8.68</cbc:TaxAmount></cac:TaxTotal></cac:InvoiceLine>`).join('')}</Invoice>`;
  await page.goto('/');
  for (const xslt of [standardDocumentXslt, generated]) {
    const result = await page.evaluate(({ xml, xslt }) => {
      const parser = new DOMParser(), source = parser.parseFromString(xml, 'application/xml');
      const serializer = new XMLSerializer(), before = serializer.serializeToString(source);
      const processor = new XSLTProcessor(); processor.importStylesheet(parser.parseFromString(xslt, 'application/xml'));
      const rendered = processor.transformToDocument(source);
      const cells = Array.from(rendered.querySelectorAll('table tr')).map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '')).filter(row => row.length === 7 && /^\d+$/.test(row[0]));
      return { cells, unchanged: before === serializer.serializeToString(source), rawCodes: Array.from(source.getElementsByTagNameNS('urn:cbc', 'InvoicedQuantity')).map(node => node.getAttribute('unitCode')) };
    }, { xml, xslt });
    expect(result.unchanged).toBe(true);
    expect(result.rawCodes).toEqual(HIZLI_UNIT_CATALOG.map(unit => unit.code));
    expect(result.cells).toHaveLength(95);
    expect(result.cells.map(row => row[3])).toEqual(HIZLI_UNIT_CATALOG.map(unit => UNIT_LABELS[unit.code]));
    for (const [code, name] of Object.entries(rareUnits)) {
      const index = HIZLI_UNIT_CATALOG.findIndex(unit => unit.code === code);
      expect(result.cells[index]).toEqual([String(index + 1), `NIU Katalog ${index + 1}`, '3.5', name, '12.4', '8.68', '43.4']);
    }
  }
});
