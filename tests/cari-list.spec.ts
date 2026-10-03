import { test, expect } from '@playwright/test';

test('cari list opens for suppliers created from incoming documents without a risk limit', async ({ page, request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/customers?type=*', route => route.fulfill({
    json: { success: true, customers: [{
      id: 'cust-sup-fixture', code: '320.00001', title: 'Gelen Belge Tedarikçisi',
      type: 'SUPPLIER', currency: 'TRY', balance: 1250, totalDebit: 1250, totalCredit: 0,
      active: true,
    }] },
  }));
  await page.goto('/');
  await page.locator('aside').getByText('Cari', { exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Gelen Belge Tedarikçisi', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tüm Cariler (1)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '—', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Tedarikçiler', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Gelen Belge Tedarikçisi', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('cari list reports API failures and can retry without reloading the app', async ({ page, request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);
  let fail = true;
  await page.route('**/api/customers?type=*', route => route.fulfill(fail
    ? { status: 503, json: { success: false, message: 'Cari servisi geçici olarak kullanılamıyor.' } }
    : { json: { success: true, customers: [{
      id: 'cust-fixture', code: '120.00001', title: 'Tekrar Yüklenen Cari',
      type: 'CUSTOMER', riskLimit: 0, maturityDays: 0, balance: 0,
    }] } }));
  await page.goto('/');
  await page.locator('aside').getByText('Cari', { exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Cari servisi geçici olarak kullanılamıyor.');
  fail = false;
  await page.getByRole('button', { name: 'Tekrar dene', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Tekrar Yüklenen Cari', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '0 Gün', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
