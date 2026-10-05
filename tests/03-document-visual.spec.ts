import { test, expect, type Page } from '@playwright/test';

let token = '';
test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  token = (await login.json()).token;
});
async function openApp(page: Page, menu: string) {
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);
  await page.goto('/');
  await page.locator('aside').getByText(menu, { exact: true }).click();
}

test('satış faturası oturumla alınır, XSLT ile görünür ve XML indirilebilir', async ({ page }) => {
  let authorization = '';
  page.on('request', request => {
    if (request.url().includes('/erp-invoices/') && request.url().endsWith('/visual')) authorization = request.headers().authorization;
  });
  await openApp(page, 'Satış Faturaları');
  await page.getByTitle('Resmi GİB Görselini İncele (HTML / XSLT)').first().click();
  const frame = page.frameLocator('#einvoice-preview-iframe');
  await expect(frame.locator('body')).toContainText(/SAT-|Mal.*Hizmet/, { timeout: 15000 });
  expect(authorization).toBe(`Bearer ${token}`);
  await expect(page.getByRole('button', { name: 'Yazdır', exact: true })).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'UBL XML' }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.xml$/);
  await page.screenshot({ path: '.verify-tmp/xslt-invoice-viewer.png', fullPage: true });
});

test('alış faturası ve irsaliye A4 düğmeleri XSLT görünümünü açar', async ({ page }) => {
  await openApp(page, 'Alış Faturaları');
  await page.getByTitle('A4 Yazdır').first().click();
  await expect(page.frameLocator('#einvoice-preview-iframe').locator('body')).toContainText(/Fatura|FATURA/);
  await expect(page.getByRole('button', { name: "GİB'e Gönder", exact: true })).toHaveCount(0);
  await page.goto('/');
  await page.locator('aside').getByText('İrsaliyeler', { exact: true }).click();
  await page.getByTitle('XSLT Görüntüle / Yazdır').first().click();
  await expect(page.frameLocator('iframe[title="İrsaliye XSLT Önizleme"]').locator('body')).toContainText('IRS-2026');
  await page.screenshot({ path: '.verify-tmp/xslt-waybill-viewer.png', fullPage: true });
});

for (const kind of ['INVOICE', 'DESPATCH'] as const) {
  test(`gelen ${kind}: tedarikçinin XSLT çıktısı görünür, aktif içerik çalışmaz`, async ({ page }) => {
    const despatch = kind === 'DESPATCH';
    const prefix = despatch ? 'incoming-despatches' : 'incoming';
    const record = { id: 'e2e-visual', invoiceNo: 'GEL-42', despatchNo: 'GEL-42', supplierTitle: 'Tedarikçi',
      supplierTaxNumber: '2222222222', issueDate: '2026-10-01', currency: 'TRY', status: 'RECEIVED', operationalStatus: 'NEW', items: [] };
    await page.route(`**/api/v1/e-documents/${prefix}/list*`, route => route.fulfill({ json: {
      success: true, data: [record], pagination: { total: 1, page: 1, limit: 25, totalPages: 1 },
    } }));
    await page.route(`**/api/v1/e-documents/${prefix}/e2e-visual/detail`, route => route.fulfill({ json: {
      success: true, record, document: { kind, documentNo: 'GEL-42', currency: 'TRY', lines: [],
        supplier: { title: 'Tedarikçi', taxNumber: '2222222222' }, customer: { title: 'Alıcı', taxNumber: '1111111111' }, warnings: [], errors: [] },
    } }));
    const root = despatch ? 'DespatchAdvice' : 'Invoice';
    await page.route(`**/api/v1/e-documents/${prefix}/e2e-visual/visual`, route => route.fulfill({ json: {
      success: true, renderedBy: 'client', templateSource: 'embedded', xml: `<${root}><ID>GEL-42</ID></${root}>`,
      xslt: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template match="/"><html><body onload="window.parent.__unsafe=true"><h1>Tedarikçi Özgün XSLT</h1><p><xsl:value-of select="/*/ID"/></p><script>window.parent.__unsafe=true</script></body></html></xsl:template></xsl:stylesheet>`,
    } }));
    await openApp(page, 'Gelen e-Belgeler');
    if (despatch) await page.getByRole('button', { name: /Gelen e-İrsaliyeler/ }).click();
    await page.getByTitle('Belgeyi incele (Belge / Kalemler / Görsel / XML)').first().click();
    await page.getByRole('button', { name: 'Görsel', exact: true }).click();
    const frame = page.frameLocator('iframe[title="Gelen Belge Görünümü"]');
    await expect(frame.locator('body')).toContainText('Tedarikçi Özgün XSLT');
    await expect(frame.locator('body')).toContainText('GEL-42');
    await expect(frame.locator('script')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__unsafe)).toBeUndefined();
  });
}

test('önizleme hatası görünür ve yeniden denenebilir', async ({ page }) => {
  let fail = true;
  await page.route('**/api/v1/e-documents/erp-invoices/*/visual', route => fail
    ? route.fulfill({ status: 422, json: { success: false, message: 'XSLT tasarımı okunamadı.' } }) : route.continue());
  await openApp(page, 'Satış Faturaları');
  await page.getByTitle('Resmi GİB Görselini İncele (HTML / XSLT)').first().click();
  await expect(page.getByRole('alert')).toContainText('XSLT tasarımı okunamadı.');
  await expect(page.getByRole('button', { name: 'Yazdır', exact: true })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Yeniden dene', exact: true }).click();
  await expect(page.frameLocator('#einvoice-preview-iframe').locator('body')).toContainText(/SAT-|Mal.*Hizmet/);
});

test('BOM taşıyan arşiv XML ve XSLT görüntülenir; indirilen XML korunur', async ({ page }) => {
  let archivedXml = '';
  await page.route('**/api/v1/e-documents/erp-invoices/*/visual', async route => {
    const upstream = await route.fetch();
    const visual = await upstream.json();
    archivedXml = '\uFEFF' + visual.xml;
    await route.fulfill({ json: { ...visual, xml: archivedXml, xslt: '\uFEFF' + visual.xslt } });
  });
  await openApp(page, 'Satış Faturaları');
  await page.getByTitle('Resmi GİB Görselini İncele (HTML / XSLT)').first().click();
  await expect(page.frameLocator('#einvoice-preview-iframe').locator('body')).toContainText(/SAT-(?:2026|XSLT)/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'UBL XML' }).click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toBe(archivedXml);
});

test('cari kart bağlantısı boş fatura kendi kayıtlı alıcısıyla görüntülenir', async ({ page }) => {
  await openApp(page, 'Satış Faturaları');
  const row = page.getByRole('row').filter({ hasText: 'SAT-XSLT-SNAPSHOT' });
  await row.locator('button[title="Resmi GİB Görselini İncele (HTML / XSLT)"]').click();
  const frame = page.frameLocator('#einvoice-preview-iframe');
  await expect(frame.locator('body')).toContainText('Kayıtlı Belge Alıcısı');
  await expect(frame.locator('body')).toContainText('SAT-XSLT-SNAPSHOT');
  await expect(page.getByText('ERP kaydından önizleme', { exact: true })).toBeVisible();
  await expect(page.getByText('TEMELFATURA', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yazdır', exact: true })).toBeEnabled();
});
