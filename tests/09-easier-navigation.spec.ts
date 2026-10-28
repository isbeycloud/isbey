import { test, expect } from '@playwright/test';

let session: { token: string; activeTenant: { id: string } };
test.beforeAll(async ({ request }) => {
  const response = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(response.status()).toBe(200); session = await response.json();
});

test('one search dialog navigates local menus offline and keeps mobile controls in view', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), session.token);
  await page.goto('/');
  await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Menüyü Daralt', exact: true }).click();
  await page.getByRole('button', { name: 'Menüyü Genişlet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Menüyü Daralt', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Menü ve Kayıt Ara' });
  await expect(dialog).toHaveCount(1); await expect(page.locator('.modal-overlay')).toHaveCount(1);
  const input = dialog.getByRole('combobox', { name: 'Menü veya kayıt ara' }); await expect(input).toBeFocused();
  await dialog.getByRole('button', { name: 'Menüler', exact: true }).click();
  await page.route('**/api/search?*', route => route.abort());
  await input.fill('YAZAR KASA');
  await expect(dialog.getByRole('option', { name: /Hızlı Satış \(POS\)/ })).toBeVisible();
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Yazar Kasa / POS Bağlantıları', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).click();
  await dialog.getByRole('button', { name: 'Menüler', exact: true }).click();
  await input.fill('masraf'); await input.press('Enter');
  await expect(dialog).toHaveCount(0); await expect(page.locator('.workspace-header-titles').getByText('Gider Takibi', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.top-header').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const name of ['Menüyü aç/kapat', 'Menü ve kayıt ara', 'Firma seç / değiştir', 'Kullanıcı menüsü', 'Bildirimler']) {
    const button = page.getByRole('button', { name, exact: true }); await expect(button).toBeVisible();
    expect(await button.evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1; })).toBe(true);
  }
  await page.screenshot({ path: '.verify-tmp/usability-after-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '.verify-tmp/usability-after-search-mobile.png', fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true })).toBeFocused();
});

test('record search exposes failure and retry and ignores older responses after typing or clearing', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), session.token);
  let fail = true, oldStarted = false;
  let finishOld!: () => void;
  const oldFinished = new Promise<void>(resolve => { finishOld = resolve; });
  await page.route('**/api/search?*', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'bozuk' && fail) { await route.fulfill({ status: 503, json: { success: false } }); return; }
    if (q === 'eski') { oldStarted = true; await new Promise(r => setTimeout(r, 450)); }
    const title = q === 'eski' ? 'ESKI SONUC' : 'Yeni arama sonucu';
    await route.fulfill({ json: { success: true, categories: [{ key: 'CUSTOMER', title: 'Cari Kayıtlar', count: 1, items: [{ id: title, type: 'CUSTOMER', title, subtitle: 'Test kaydı', code: 'TEST', score: 1 }] }] } });
    if (q === 'eski') finishOld();
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Menü ve Kayıt Ara' });
  const input = dialog.getByRole('combobox');
  await dialog.getByRole('button', { name: 'Cariler', exact: true }).click(); await input.fill('bozuk');
  await expect(dialog.getByRole('alert')).toContainText('Kayıt araması tamamlanamadı');
  fail = false; await dialog.getByRole('button', { name: 'Tekrar Dene', exact: true }).click();
  await expect(dialog.getByRole('option', { name: /Yeni arama sonucu/ })).toBeVisible();
  await input.fill('eski'); await expect.poll(() => oldStarted).toBe(true);
  await input.fill('yeni'); await expect(dialog.getByRole('option', { name: /Yeni arama sonucu/ })).toBeVisible();
  await oldFinished; await expect(dialog.getByText('ESKI SONUC', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Aramayı temizle', exact: true }).click();
  await expect(dialog.getByRole('option')).toHaveCount(0); await expect(input).toBeFocused();
});

test('new-customer shortcut opens one form and global shortcuts do not replace its unsaved input', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), session.token);
  await page.goto('/'); await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Menü ve Kayıt Ara' });
  await dialog.getByRole('button', { name: 'Menüler', exact: true }).click();
  await dialog.getByRole('combobox').fill('yeni cari');
  await dialog.getByRole('option', { name: /Yeni Cari/ }).click();
  await expect(dialog).toHaveCount(0); await expect(page.locator('.modal-overlay')).toHaveCount(1);
  const form = page.locator('.modal-dialog'); const field = form.locator('input').first();
  await field.fill('123'); await field.press('F6'); await field.press('F8');
  await expect(page.locator('.modal-overlay')).toHaveCount(1); await expect(field).toHaveValue('123');
  await expect(page.locator('.workspace-header-titles')).toContainText('Cari');
});

test('read-only user sees permitted menus and no create or platform commands', async ({ page, request }) => {
  const created = await request.post('/api/users', { headers: { Authorization: `Bearer ${session.token}` }, data: {
    username: 'usability-viewer', fullName: 'Usability Viewer', email: 'usability-viewer@example.test', password: 'ViewerTest123!', role: 'RAPOR', companyId: session.activeTenant.id,
  } });
  expect(created.status()).toBe(200);
  const response = await request.post('/api/auth/login', { data: { username: 'usability-viewer', password: 'ViewerTest123!' } });
  expect(response.status()).toBe(200); const { token } = await response.json();
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);
  await page.goto('/'); await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Menü ve Kayıt Ara' });
  await expect(dialog.getByRole('option', { name: /Yeni Cari|Yeni Ürün|Tahsilat Ekle|Ödeme Ekle|Yeni Satış Faturası/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Menüler', exact: true }).click();
  await dialog.getByRole('combobox').fill('platform'); await expect(dialog.getByRole('option')).toHaveCount(0);
});
