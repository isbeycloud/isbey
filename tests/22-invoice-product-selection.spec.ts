import { test, expect } from './fixtures/adminSession';

for (const type of ['Satış', 'Alış']) test(`${type} invoice product window accepts clicks and adds the chosen product`, async ({ page, request, adminSession }) => {
  const response = await request.get('/api/products', { headers: { Authorization: `Bearer ${adminSession.token}` } });
  const { products } = await response.json();
  const product = products.find((item: any) => !item.variants?.length);
  expect(product).toBeTruthy();
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.goto('/');
  await page.locator('aside').getByText('Faturalar', { exact: true }).click();
  await page.getByRole('button', { name: `${type} Faturaları`, exact: true }).click();
  await page.getByRole('button', { name: type === 'Alış' ? 'Yeni Alış Faturası Girişi' : 'Yeni Satış Faturası', exact: true }).click();
  await page.getByRole('button', { name: /Ürünler Penceresi/ }).click();
  const selector = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: '📦 Ürün & Stok Kartı Seçimi', exact: true }) });
  await expect(selector).toBeVisible();
  const row = selector.getByRole('row').filter({ hasText: product.code }).first();
  await row.getByRole('button', { name: 'Seç', exact: true }).click();
  await expect(selector).toHaveCount(0);
  await expect(page.locator('.modal-dialog').getByText(product.name, { exact: true })).toBeVisible();
});

test('product selection remains usable when product groups fail to load', async ({ page, request, adminSession }) => {
  const { products } = await (await request.get('/api/products', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  const product = products.find((item: any) => !item.variants?.length);
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/products/meta/groups-warehouses', route => route.fulfill({ status: 503, json: { success: false, message: 'Ürün grupları alınamadı.' } }));
  await page.goto('/');
  await page.locator('aside').getByText('Faturalar', { exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Satış Faturası', exact: true }).click();
  await page.getByRole('button', { name: /Ürünler Penceresi/ }).click();
  const selector = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: '📦 Ürün & Stok Kartı Seçimi', exact: true }) });
  await selector.getByRole('row').filter({ hasText: product.code }).first().getByRole('button', { name: 'Seç', exact: true }).click();
  await expect(selector).toHaveCount(0);
  await expect(page.locator('.modal-dialog').getByText(product.name, { exact: true })).toBeVisible();
});

test('product list load failure is visible and can be retried without losing the invoice', async ({ page, adminSession }) => {
  let fail = true;
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/products', route => fail ? route.fulfill({ status: 503, json: { success: false, message: 'Ürünler alınamadı; tekrar deneyin.' } }) : route.continue());
  await page.goto('/');
  await page.locator('aside').getByText('Faturalar', { exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Satış Faturası', exact: true }).click();
  await page.getByRole('button', { name: /Ürünler Penceresi/ }).click();
  const selector = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: '📦 Ürün & Stok Kartı Seçimi', exact: true }) });
  await expect(selector.getByRole('alert')).toContainText('Ürünler alınamadı');
  await expect(selector.getByText('Aradığınız kriterlere uygun ürün bulunamadı.', { exact: true })).toHaveCount(0);
  fail = false;
  await selector.getByRole('button', { name: 'Tekrar Dene', exact: true }).click();
  await expect(selector.getByRole('button', { name: 'Seç', exact: true }).first()).toBeVisible();
});

for (const doubleClick of [false, true]) test(`variant ${doubleClick ? 'double-click' : 'confirmation'} adds the chosen variant and closes both selection windows`, async ({ page, request, adminSession }) => {
  const { products } = await (await request.get('/api/products', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  const product = { ...products[0], name: 'Seçim Test Ürünü', variants: [
    { id: 'selection-red', name: 'Kırmızı', attributes: [], currentStock: 5, salePrice: 13.5, active: true },
    { id: 'selection-blue', name: 'Mavi', attributes: [], currentStock: 5, salePrice: 17.5, active: true },
  ] };
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/products', route => route.fulfill({ json: { success: true, products: [product] } }));
  await page.goto('/');
  await page.locator('aside').getByText('Faturalar', { exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Satış Faturası', exact: true }).click();
  await page.getByRole('button', { name: /Ürünler Penceresi/ }).click();
  const selector = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: '📦 Ürün & Stok Kartı Seçimi', exact: true }) });
  await selector.getByRole('button', { name: 'Seç', exact: true }).click();
  const variant = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: 'Varyant Seçin: Seçim Test Ürünü', exact: true }) });
  if (doubleClick) await variant.getByText('Mavi', { exact: true }).dblclick();
  else {
    await variant.getByText('Kırmızı', { exact: true }).click();
    await variant.getByRole('button', { name: 'Varyantı Ekle', exact: true }).click();
  }
  await expect(variant).toHaveCount(0);
  await expect(selector).toHaveCount(0);
  await expect(page.locator('.modal-dialog').getByText(`Seçim Test Ürünü (${doubleClick ? 'Mavi' : 'Kırmızı'})`, { exact: true })).toBeVisible();
});

test('a product with a missing price does not crash the selection window', async ({ page, request, adminSession }) => {
  const { products } = await (await request.get('/api/products', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  const product = { ...products[0], name: 'Fiyatı Eksik Ürün', salePrice: null, variants: [] };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/products', route => route.fulfill({ json: { success: true, products: [product] } }));
  await page.goto('/');
  await page.locator('aside').getByText('Faturalar', { exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Satış Faturası', exact: true }).click();
  await page.getByRole('button', { name: /Ürünler Penceresi/ }).click();
  await expect(page.getByText('Fiyat tanımlı değil', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
