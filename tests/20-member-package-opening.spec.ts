import { test, expect } from './fixtures/adminSession';

test('new member chooses once, failures remain visible, reload opens the selected service without trial nags', async ({ page, request, adminSession }) => {
  const original = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  let selected = false, fail = true, saves = 0;
  const plan = { id: 'opening-plan', name: 'Başlangıç Paketi', description: 'Cari ve ürün yönetimi', status: 'ACTIVE', monthlyPrice: 100, yearlyPrice: 1000, currency: 'TRY', maxUsers: 5, maxCompanies: 1, maxInvoicesPerMonth: 500, includedCredits: 0, features: [], activeModules: ['CARI', 'STOK'] };
  const profile = () => ({ ...original, user: { ...original.user, role: 'COMPANY_ADMIN', effectiveRoles: ['COMPANY_ADMIN'], serviceMenuIds: selected ? ['cari', 'stok'] : [], allowedMenuIds: null }, activeTenant: { ...original.activeTenant, status: 'TRIAL', selectedServicePlanIds: selected ? [plan.id] : [], expiresAt: '2099-01-15T12:00:00Z' }, trial: { state: 'ACTIVE', expiresAt: '2099-01-15T12:00:00Z', daysRemaining: 14, decisionRequired: false, packageSelectionRequired: !selected } });
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/auth/me', route => route.fulfill({ json: profile() }));
  await page.route('**/api/v1/plans', route => route.fulfill({ json: { success: true, plans: [plan] } }));
  await page.route('**/api/e-services/select-plans', async route => {
    saves++;
    expect(route.request().postDataJSON()).toEqual({ planIds: [plan.id] });
    if (fail) return route.fulfill({ status: 400, json: { success: false, message: 'Paket kaydedilemedi; tekrar deneyin.' } });
    selected = true;
    await route.fulfill({ json: { success: true, message: 'Paket kaydedildi.' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Paketinizi seçin', exact: true })).toBeVisible();
  await page.screenshot({ path: '.verify-tmp/member-package-opening-desktop.png', fullPage: true });
  const save = page.getByRole('button', { name: 'Seçtiğim paketleri etkinleştir', exact: true });
  await expect(save).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Başlangıç Paketi paketini seç' }).check();
  await save.click();
  await expect(page.getByRole('alert')).toHaveText('Paket kaydedilemedi; tekrar deneyin.');
  fail = false;
  await save.click();
  await expect(page.getByRole('heading', { name: 'Paketinizi seçin', exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder('Cari ünvan, kod, vergi no veya telefon ile ara...')).toBeVisible();
  await expect(page.getByText('Erişim Yetkiniz Yok', { exact: false })).toHaveCount(0);
  await page.reload();
  await expect(page.getByPlaceholder('Cari ünvan, kod, vergi no veya telefon ile ara...')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Paketinizi seçin', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Deneme ve e-Dönüşüm kararı' })).toHaveCount(0);
  expect(saves).toBe(2);
});

for (const expired of [false, true]) test(`trial decision panel is ${expired ? 'visible after expiry' : 'quiet during the first 14 days'}`, async ({ page, request, adminSession }) => {
  const original = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  const trial = { state: expired ? 'DECISION_REQUIRED' : 'ACTIVE', expiresAt: expired ? '2020-01-01T00:00:00Z' : '2099-01-01T00:00:00Z', daysRemaining: expired ? 0 : 1, decisionRequired: expired, packageSelectionRequired: false };
  // Empty legacy service scope opens the manual catalogue; it does not imply a new registration.
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...original, user: { ...original.user, role: 'COMPANY_ADMIN', effectiveRoles: ['COMPANY_ADMIN'], serviceMenuIds: [], allowedMenuIds: null }, trial } }));
  await page.route('**/api/v1/e-donusum/choice', route => route.fulfill({ json: { success: true, choice: null, choiceAt: null, trial } }));
  await page.route('**/api/v1/e-donusum/applications', route => route.fulfill({ json: { success: true, applications: [] } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hizmetler ve Paketler', exact: true })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Deneme ve e-Dönüşüm kararı' });
  if (expired) {
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('alert')).toContainText('Deneme süreniz doldu.');
  } else await expect(panel).toHaveCount(0);
});
