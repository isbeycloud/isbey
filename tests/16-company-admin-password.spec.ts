import { test, expect } from './fixtures/adminSession';

test('new company requires a private valid Unicode administrator password before attempting a request', async ({ page, adminSession }) => {
  const attemptedCompanies: Record<string, unknown>[] = [];
  let otherWrites = 0;
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/**', route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/companies') {
        attemptedCompanies.push(request.postDataJSON());
        return route.fulfill({ status: 503, json: { success: false, message: 'Test kaydı sunucuya iletilmedi.' } });
      }
      otherWrites++; return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  await page.locator('aside').getByRole('button', { name: 'Müşteri & Firmalar', exact: true }).click();
  await page.getByRole('button', { name: /Yeni Firma Kaydı/ }).click();
  const modal = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: /Yeni Kurumsal Firma Kaydı/ }) });
  await modal.getByPlaceholder('Örn: ABC Teknoloji', { exact: true }).fill('Şifre Kontrol Testi');
  await modal.getByPlaceholder('10 Haneli VKN', { exact: true }).fill('1234567890');
  await modal.getByRole('button', { name: '4. Kurulum & Onay', exact: true }).click();
  const password = modal.getByLabel('Yönetici şifresi:', { exact: true });
  await expect(password).toHaveValue('');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'new-password');
  const submit = modal.getByRole('button', { name: '✓ Firmayı ve Sistemi Başlat', exact: true });
  for (const invalid of ['', '12345678901', '🧭'.repeat(6), 'ü'.repeat(37)]) {
    await password.fill(invalid);
    await submit.click();
    await expect(page.getByText('Yönetici şifresi en az 12 karakter, en fazla 72 bayt olmalıdır.', { exact: true }).last()).toBeVisible();
    await expect(password).toHaveValue(invalid);
    expect(attemptedCompanies).toHaveLength(0);
  }
  // Twelve Unicode code points including an astral character and significant spaces.
  const valid = ' Abcdefg🧭Ö1 ';
  expect(Array.from(valid)).toHaveLength(12);
  expect(new TextEncoder().encode(valid).length).toBeLessThanOrEqual(72);
  await password.fill(valid);
  await submit.click();
  await expect.poll(() => attemptedCompanies.length).toBe(1);
  expect(attemptedCompanies[0]).toMatchObject({ name: 'Şifre Kontrol Testi', taxNumber: '1234567890', createAdminUser: true, adminPassword: valid });
  await expect(page.getByText('Test kaydı sunucuya iletilmedi.', { exact: true })).toBeVisible();
  await expect(password).toHaveValue(valid);
  expect(otherWrites).toBe(0);
});
