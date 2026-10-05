import { test, expect, type Page } from '@playwright/test';
let token = '';
test.beforeAll(async ({ request }) => {
  const r = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(r.status()).toBe(200); token = (await r.json()).token;
});
async function open(page: Page) {
  await page.addInitScript(t => localStorage.setItem('isbey_token', t), token);
  await page.goto('/');
  await page.locator('aside').getByText('e-Belge & GİB', { exact: true }).click();
  await page.getByRole('button', { name: 'Yeni e-Fatura / e-Arşiv Oluştur', exact: true }).click();
}
const profile = (page: Page) => page.locator('select').filter({ has: page.locator('option[value="TICARIFATURA"]') });
for (const registered of [true, false]) {
  test(`alıcı sorgusu ${registered ? 'e-Fatura' : 'e-Arşiv'} türünü otomatik seçer`, async ({ page }) => {
    let query = '';
    await page.route('**/api/v1/taxpayers/check?*', route => {
      query = route.request().url();
      return route.fulfill({ json: { success: true, taxpayer: { identifier: '2222222222', title: 'Test Alıcı', isEInvoiceUser: registered, aliasPK: registered ? 'urn:mail:pk@example.test' : undefined } } });
    });
    await open(page);
    await page.getByPlaceholder('10 veya 11 haneli kimlik no').fill('2222222222');
    await expect(page.getByRole('status').filter({ hasText: registered ? 'e-Fatura hazırlanacak' : 'e-Arşiv hazırlanacak' })).toBeVisible();
    await expect(profile(page)).toHaveValue(registered ? 'TICARIFATURA' : 'EARSIVFATURA');
    await expect(profile(page).locator(`option[value="${registered ? 'EARSIVFATURA' : 'TEMELFATURA'}"]`)).toBeDisabled();
    expect(query).toContain('force=true');
    await page.screenshot({ path: `.verify-tmp/recipient-${registered ? 'einvoice' : 'earchive'}.png` });
  });
}
test('sorgu hatasında taslak kaydı ve gönderim durur; tekrar sorgulanabilir', async ({ page }) => {
  let failed = true, writes = 0;
  await page.route('**/api/efatura/hizli/create-model-invoice', route => { writes++; return route.abort(); });
  await page.route('**/api/v1/taxpayers/check?*', route => route.fulfill(failed
    ? { status: 502, json: { success: false, message: 'Sorgu geçici olarak kullanılamıyor.' } }
    : { json: { success: true, taxpayer: { identifier: '2222222222', title: 'Test Alıcı', isEInvoiceUser: false } } }));
  await open(page); await page.getByPlaceholder('10 veya 11 haneli kimlik no').fill('2222222222');
  await expect(page.getByRole('alert')).toContainText('Sorgu geçici olarak');
  await page.getByRole('button', { name: 'Taslak Kaydet', exact: true }).click();
  expect(writes).toBe(0);
  failed = false; await page.getByRole('button', { name: 'Tekrar sorgula' }).click();
  await expect(profile(page)).toHaveValue('EARSIVFATURA');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('önceki alıcının geç gelen sorgusu yeni alıcının profilini değiştirmez', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(r => { release = r; });
  let firstStarted = false;
  await page.route('**/api/v1/taxpayers/check?*', async route => {
    const id = new URL(route.request().url()).searchParams.get('vkn');
    if (id === '2222222222') { firstStarted = true; await pending; }
    await route.fulfill({ json: { success: true, taxpayer: { identifier: id, title: 'Test Alıcı', isEInvoiceUser: id === '2222222222', aliasPK: 'urn:mail:pk@example.test' } } });
  });
  await open(page); const input = page.getByPlaceholder('10 veya 11 haneli kimlik no');
  await input.fill('2222222222'); await expect.poll(() => firstStarted).toBe(true);
  await input.fill('33333333333'); await expect(profile(page)).toHaveValue('EARSIVFATURA');
  const response = page.waitForResponse(r => r.url().includes('vkn=2222222222'));
  release(); await response;
  await expect(profile(page)).toHaveValue('EARSIVFATURA');
  await expect(page.getByRole('status').filter({ hasText: 'e-Arşiv hazırlanacak' })).toBeVisible();
});
