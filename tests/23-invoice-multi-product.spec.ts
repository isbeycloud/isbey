import { test, expect } from './fixtures/adminSession';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page, request, adminSession }) => {
  const { products } = await (await request.get('/api/products', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  const plain = ['Alfa', 'Beta', 'Gama'].map((name, index) => ({ ...products[0], id: `multi-${index}`, code: `MULTI-${index}`, name: `Çoklu ${name}`, salePrice: 20 + index, purchasePrice: 10 + index, salePrices: [], variants: [] }));
  const variant = { ...plain[0], id: 'multi-variant', code: 'MULTI-V', name: 'Çoklu Renkli', variants: [
    { id: 'multi-red', name: 'Kırmızı', attributes: [], currentStock: 10, salePrice: 35, purchasePrice: 25, active: true },
    { id: 'multi-blue', name: 'Mavi', attributes: [], currentStock: 10, salePrice: 45, purchasePrice: 30, active: true },
  ] };
  await page.route('**/api/products', route => route.fulfill({ json: { success: true, products: [...plain, variant] } }));
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
});

const selector = (page: Page) => page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: '📦 Ürün & Stok Kartı Seçimi', exact: true }) });
const invoice = (page: Page) => page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: /Yeni Satış & E-Fatura Oluştur|Yeni Alış Faturası Girişi/ }) });
const row = (page: Page, name: string) => invoice(page).getByRole('row').filter({ has: page.getByText(name, { exact: true }) });

async function openInvoice(page: Page, type = 'Satış') {
  await page.goto('/');
  await page.locator('aside').getByText('Faturalar', { exact: true }).click();
  await page.getByRole('button', { name: `${type} Faturaları`, exact: true }).click();
  await page.getByRole('button', { name: type === 'Alış' ? 'Yeni Alış Faturası Girişi' : 'Yeni Satış Faturası', exact: true }).click();
  await page.getByRole('button', { name: /Ürünler Penceresi/ }).click();
}

for (const type of ['Satış', 'Alış']) test(`${type}: checked products survive search and are added together at the correct prices`, async ({ page }) => {
  await openInvoice(page, type);
  const window = selector(page);
  await expect(window.getByRole('button', { name: 'Seçilenleri Ekle (0)', exact: true })).toBeDisabled();
  await window.getByRole('checkbox', { name: 'Çoklu Alfa seç', exact: true }).check();
  await window.getByRole('checkbox', { name: 'Çoklu Beta seç', exact: true }).check();
  await window.getByPlaceholder('Ürün adı, stok kodu veya marka ile ara... (F3)').fill('Gama');
  await window.getByRole('checkbox', { name: 'Çoklu Gama seç', exact: true }).check();
  await window.getByRole('button', { name: 'Seçilenleri Ekle (3)', exact: true }).click();
  await expect(window).toHaveCount(0);
  for (const [index, name] of ['Alfa', 'Beta', 'Gama'].entries()) {
    await expect(row(page, `Çoklu ${name}`)).toHaveCount(1);
    await expect(row(page, `Çoklu ${name}`).getByRole('spinbutton').nth(0)).toHaveValue('1');
    await expect(row(page, `Çoklu ${name}`).getByRole('spinbutton').nth(1)).toHaveValue(String((type === 'Satış' ? 20 : 10) + index));
  }
});

test('a batch containing an existing product preserves its edited price and all other added rows', async ({ page }) => {
  await openInvoice(page);
  await selector(page).getByRole('row').filter({ hasText: 'Çoklu Alfa' }).getByRole('button', { name: 'Seç', exact: true }).click();
  await row(page, 'Çoklu Alfa').getByRole('spinbutton').nth(1).fill('77');
  await page.getByRole('button', { name: /Ürünler Penceresi/ }).click();
  for (const name of ['Alfa', 'Beta', 'Gama']) await selector(page).getByRole('checkbox', { name: `Çoklu ${name} seç`, exact: true }).check();
  await selector(page).getByRole('button', { name: 'Seçilenleri Ekle (3)', exact: true }).click();
  await expect(row(page, 'Çoklu Alfa').getByRole('spinbutton').nth(0)).toHaveValue('2');
  await expect(row(page, 'Çoklu Alfa').getByRole('spinbutton').nth(1)).toHaveValue('77');
  await expect(row(page, 'Çoklu Beta')).toHaveCount(1);
  await expect(row(page, 'Çoklu Gama')).toHaveCount(1);
});

test('cancel discards pending checks, reopening resets selection and mobile confirmation remains reachable', async ({ page }) => {
  await openInvoice(page);
  await page.setViewportSize({ width: 390, height: 750 });
  await selector(page).getByRole('checkbox', { name: 'Çoklu Alfa seç', exact: true }).check();
  await selector(page).getByRole('button', { name: 'Kapat', exact: true }).click();
  await expect(row(page, 'Çoklu Alfa')).toHaveCount(0);
  await page.getByRole('button', { name: /Ürünler Penceresi/ }).click();
  await expect(selector(page).getByRole('button', { name: 'Seçilenleri Ekle (0)', exact: true })).toBeDisabled();
  await selector(page).getByRole('checkbox', { name: 'Çoklu Beta seç', exact: true }).check();
  const confirm = selector(page).getByRole('button', { name: 'Seçilenleri Ekle (1)', exact: true });
  await confirm.scrollIntoViewIfNeeded();
  await expect(confirm).toBeInViewport();
  await confirm.click();
  await expect(row(page, 'Çoklu Beta')).toHaveCount(1);
});

test('select all affects only visible plain products, without picking an unspecified variant', async ({ page }) => {
  await openInvoice(page);
  const window = selector(page);
  await window.getByPlaceholder('Ürün adı, stok kodu veya marka ile ara... (F3)').fill('Beta');
  await window.getByRole('checkbox', { name: 'Listelenen varyantsız ürünlerin tümünü seç', exact: true }).check();
  await window.getByPlaceholder('Ürün adı, stok kodu veya marka ile ara... (F3)').clear();
  await expect(window.getByRole('button', { name: 'Seçilenleri Ekle (1)', exact: true })).toBeEnabled();
  await window.getByRole('checkbox', { name: 'Listelenen varyantsız ürünlerin tümünü seç', exact: true }).check();
  await expect(window.getByRole('checkbox', { name: 'Çoklu Renkli seç', exact: true })).not.toBeChecked();
  await window.getByRole('button', { name: 'Seçilenleri Ekle (3)', exact: true }).click();
  for (const name of ['Alfa', 'Beta', 'Gama']) await expect(row(page, `Çoklu ${name}`)).toHaveCount(1);
  await expect(row(page, 'Çoklu Renkli')).toHaveCount(0);
});

test('two variants and a plain product can be queued and added as separate invoice rows', async ({ page }) => {
  await openInvoice(page);
  const window = selector(page);
  await window.getByRole('checkbox', { name: 'Çoklu Renkli seç', exact: true }).click();
  const variant = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: 'Varyant Seçin: Çoklu Renkli', exact: true }) });
  await variant.getByText('Kırmızı', { exact: true }).click();
  await variant.getByRole('button', { name: 'Varyantı Seç', exact: true }).click();
  await expect(window).toBeVisible();
  await window.getByRole('row').filter({ hasText: 'Çoklu Renkli' }).getByRole('button', { name: 'Seç', exact: true }).click();
  await variant.getByText('Mavi', { exact: true }).click();
  await variant.getByRole('button', { name: 'Varyantı Seç', exact: true }).click();
  await window.getByRole('checkbox', { name: 'Çoklu Alfa seç', exact: true }).check();
  await window.getByRole('button', { name: 'Seçilenleri Ekle (3)', exact: true }).click();
  await expect(row(page, 'Çoklu Renkli (Kırmızı)').getByRole('spinbutton').nth(1)).toHaveValue('35');
  await expect(row(page, 'Çoklu Renkli (Mavi)').getByRole('spinbutton').nth(1)).toHaveValue('45');
  await expect(row(page, 'Çoklu Alfa')).toHaveCount(1);
});
