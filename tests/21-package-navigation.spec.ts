import { test, expect } from './fixtures/adminSession';
import { menusForModules } from '../src/data/serviceAccess';

for (const sample of [
  { name: 'Cari', modules: ['CARI'], present: 'Cari', absent: ['Stok', 'Faturalar', 'Hızlı Satış (POS)', 'e-Belge & GİB'] },
  { name: 'Stok', modules: ['STOK'], present: 'Stok', absent: ['Cari', 'Faturalar', 'Hızlı Satış (POS)'] },
  { name: 'Fatura', modules: ['FATURA'], present: 'Faturalar', absent: ['Stok', 'Cari', 'Satış Faturaları', 'Alış Faturaları', 'e-Belge & GİB'] },
  { name: 'e-Fatura', modules: ['EFATURA'], present: 'e-Belge & GİB', absent: ['Faturalar', 'Stok', 'Cari'] },
  { name: 'POS', modules: ['POS'], present: 'Hızlı Satış (POS)', absent: ['Faturalar', 'Stok', 'Cari'] },
]) test(`${sample.name} package shows only its services without duplicate navigation`, async ({ page, request, adminSession }) => {
  const original = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...original,
    user: { ...original.user, role: 'COMPANY_ADMIN', effectiveRoles: ['COMPANY_ADMIN'], serviceMenuIds: menusForModules(sample.modules), serviceModuleIds: sample.modules, allowedMenuIds: null },
    activeTenant: { ...original.activeTenant, selectedServicePlanIds: ['test-plan'] },
    trial: { state: 'ACTIVE', decisionRequired: false, packageSelectionRequired: false },
  } }));
  await page.goto('/');
  const sidebar = page.locator('aside');
  await expect(sidebar.getByText(sample.present, { exact: true })).toHaveCount(1);
  for (const name of sample.absent) await expect(sidebar.getByText(name, { exact: true })).toHaveCount(0);
  await expect(page.locator('.ribbon-tabs-row')).toHaveCount(0);
  await expect(page.locator('.quick-action-fab')).toHaveCount(0);
  await expect(page.locator('.status-bar')).toHaveCount(0);
  if (sample.name === 'Fatura') {
    await sidebar.getByText('Faturalar', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Satış Faturaları', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alış Faturaları', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'e-Fatura & e-Arşiv Portalı', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'e-İrsaliyeler & Sevk', exact: true })).toHaveCount(0);
  }
  if (sample.name === 'Stok') {
    await sidebar.getByText('Ayarlar', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Fiyat Listeleri', exact: true })).toBeVisible();
    for (const name of ['e-Dönüşüm (GİB)', 'Hızlı Bilişim Entegrasyonu', 'Fatura Tasarımı', 'Belge & Fatura Tasarımları', 'Belge Numaraları & Seriler']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 700 });
    await expect(page.getByRole('button', { name: 'Fiyat Listeleri', exact: true })).toBeVisible();
  }
});

test('activating a replacement package updates menus immediately and persists on reload', async ({ page, request, adminSession }) => {
  const original = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  let modules = ['CARI'], ids = ['cari-plan'];
  const plan = { status: 'ACTIVE', monthlyPrice: 100, yearlyPrice: 1000, currency: 'TRY', maxUsers: 5, maxCompanies: 1, maxInvoicesPerMonth: 500, includedCredits: 0, features: [] };
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...original, user: { ...original.user, role: 'COMPANY_ADMIN', effectiveRoles: ['COMPANY_ADMIN'], serviceMenuIds: menusForModules(modules), serviceModuleIds: modules, allowedMenuIds: null }, activeTenant: { ...original.activeTenant, selectedServicePlanIds: ids }, trial: { state: 'ACTIVE', decisionRequired: false, packageSelectionRequired: false } } }));
  await page.route('**/api/v1/plans', route => route.fulfill({ json: { success: true, plans: [{ ...plan, id: 'cari-plan', name: 'Cari Paketi', activeModules: ['CARI'] }, { ...plan, id: 'stok-plan', name: 'Stok Paketi', activeModules: ['STOK'] }] } }));
  await page.route('**/api/e-services/select-plans', route => {
    expect(route.request().postDataJSON()).toEqual({ planIds: ['stok-plan'] });
    modules = ['STOK']; ids = ['stok-plan'];
    return route.fulfill({ json: { success: true, message: 'Paket etkinleştirildi.' } });
  });
  await page.goto('/');
  await page.locator('aside').getByText('Hizmetler ve Paketler', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Cari Paketi paketini seç' }).uncheck();
  await page.getByRole('checkbox', { name: 'Stok Paketi paketini seç' }).check();
  await page.getByRole('button', { name: 'Seçtiğim paketleri etkinleştir', exact: true }).click();
  await expect(page.getByText('Aktif paketler: Stok Paketi', { exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText('Stok', { exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText('Cari', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('aside').getByText('Stok', { exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText('Cari', { exact: true })).toHaveCount(0);
});
