import { test, expect } from '@playwright/test';

let adminSession: { token: string; activeTenant: { id: string }; user: { id: string; username: string } };
test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  adminSession = await login.json();
});

test('one customer management entry connects company details, provider portfolio and platform settings', async ({ page }) => {
  const { token } = adminSession;
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const writes: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) writes.push(r.method()); });
  await page.goto('/');
  const entry = page.locator('aside').getByRole('button', { name: 'Müşteri & Firmalar', exact: true });
  await expect(entry).toHaveCount(1);
  await expect(page.locator('aside').getByText('Müşteri İşlemleri', { exact: true })).toHaveCount(0);
  await expect(page.locator('aside').getByText('Admin & SaaS Paneli', { exact: true })).toHaveCount(0);
  await entry.click();
  const sections = page.getByRole('navigation', { name: 'Müşteri yönetimi bölümleri' });
  await expect(sections.getByRole('button')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Firma Detayı', exact: true }).first()).toBeVisible();
  const count = await page.getByRole('button', { name: 'Firma Detayı', exact: true }).count();
  await page.getByRole('button', { name: 'Firma Detayı', exact: true }).first().click();
  await page.getByRole('button', { name: /Kullanıcılar/ }).click();
  await expect(page.getByRole('heading', { name: /Firma Kullanıcıları/ })).toBeVisible();
  await page.locator('.modal-header button').click();
  await page.getByRole('button', { name: 'Gerekçeli destek erişimi' }).first().click();
  await expect(page.getByLabel('Destek erişimi gerekçesi')).toBeVisible();
  await page.getByRole('button', { name: 'İptal', exact: true }).click();
  await sections.getByRole('button', { name: /Müşteri Havuzu/ }).click();
  await expect(page.getByRole('heading', { name: 'Müşteri Havuzu', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Portföyden müşteri seç', exact: true })).toBeVisible();
  await sections.getByRole('button', { name: /Platform Ayarları/ }).click();
  await page.getByRole('button', { name: /Paket Tarifeleri/ }).click();
  await expect(page.getByRole('heading', { name: 'Başlangıç Paketi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Firma Listesini Aç', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Firma Detayı', exact: true })).toHaveCount(count);
  await page.screenshot({ path: '.verify-tmp/customer-hub-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sections.getByRole('button', { name: /^Firmalar/ })).toBeVisible();
  expect(await page.locator('.customer-management-hub').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.locator('.customer-management-hub').evaluate(el => el.getBoundingClientRect().right <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '.verify-tmp/customer-hub-mobile.png', fullPage: true });
  expect(errors).toEqual([]); expect(writes).toEqual([]);
});

test('company administrator only sees their company and cannot enter platform or portfolio management', async ({ page, request }) => {
  const session = adminSession;
  const headers = { Authorization: `Bearer ${session.token}` };
  const username = 'hub-company-owner';
  const created = await request.post('/api/users', { headers, data: { username, fullName: 'Hub Company Owner', email: 'hub-owner@example.test', password: 'HubOwnerTest123!', role: 'COMPANY_ADMIN', companyId: session.activeTenant.id } });
  expect(created.status()).toBe(200);
  const login = await request.post('/api/auth/login', { data: { username, password: 'HubOwnerTest123!' } });
  expect(login.status()).toBe(200); const { token } = await login.json();
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);
  await page.goto('/');
  await page.locator('aside').getByRole('button', { name: 'Müşteri & Firmalar', exact: true }).click();
  const sections = page.getByRole('navigation', { name: 'Müşteri yönetimi bölümleri' });
  await expect(sections.getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Firma Detayı', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Paket / Ücret', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gerekçeli destek erişimi' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Yeni Firma Kaydı/ })).toHaveCount(0);
  for (const route of ['/api/v1/platform-admin/metrics', '/api/v1/platform-admin/tenants', '/api/companies/' + session.activeTenant.id + '/package']) {
    expect((await request.get(route, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403);
  }
  for (const route of ['/api/v1/platform-admin/impersonate', '/api/v1/platform-admin/announcements']) {
    expect((await request.post(route, { headers: { Authorization: `Bearer ${token}` }, data: { targetTenantId: session.activeTenant.id, reason: 'Yetkisiz erişim denemesi', title: 'Unauthorized', content: 'Should not be saved' } })).status()).toBe(403);
  }
  expect((await request.get('/api/v1/platform-admin/metrics')).status()).toBe(401);
});

test('support access switches the real company context, records the reason and can return to the administrator', async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${adminSession.token}` };
  const companies = (await (await request.get('/api/companies', { headers })).json()).companies;
  const target = companies.find((c: any) => c.id !== adminSession.activeTenant.id && c.status === 'ACTIVE');
  expect(target).toBeTruthy();
  const invoicesBefore = await (await request.get('/api/invoices', { headers })).json();
  expect((await request.post('/api/admin/impersonate', { headers, data: { targetTenantId: target.id } })).status()).toBe(400);
  expect((await request.post('/api/admin/companies/' + target.id + '/status', { headers, data: { status: 'INACTIVE' } })).status()).toBe(200);
  try {
    expect((await request.post('/api/admin/impersonate', { headers, data: { targetTenantId: target.id, reason: 'Pasif firma erişimi reddedilmeli' } })).status()).toBe(403);
  } finally {
    expect((await request.post('/api/admin/companies/' + target.id + '/status', { headers, data: { status: 'ACTIVE' } })).status()).toBe(200);
  }
  await page.addInitScript(token => { if (!localStorage.getItem('isbey_token')) localStorage.setItem('isbey_token', token); }, adminSession.token);
  await page.goto('/');
  await page.locator('aside').getByRole('button', { name: 'Müşteri & Firmalar', exact: true }).click();
  await page.getByRole('row').filter({ hasText: target.name }).getByRole('button', { name: 'Gerekçeli destek erişimi' }).click();
  const reason = 'Müşteri talebiyle firma destek ekranı kontrolü';
  await page.getByLabel('Destek erişimi gerekçesi').fill(reason);
  const response = page.waitForResponse(r => r.url().endsWith('/api/admin/impersonate') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Destek Erişimini Başlat', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText('Platform Admin Denetim Modu:', { exact: true })).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem('isbey_token'));
  const me = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(me.activeTenant.id).toBe(target.id);
  const detail = await (await request.get('/api/companies/' + target.id, { headers })).json();
  expect(detail.details.auditLogs.some((row: any) => row.action === 'ADMIN_IMPERSONATION' && row.userId === adminSession.user.id && row.details.includes(reason))).toBe(true);
  await page.getByRole('button', { name: 'Yönetici Hesabına Geri Dön', exact: true }).click();
  await expect(page.getByText('Platform Admin Denetim Modu:', { exact: true })).toHaveCount(0);
  const restored = await page.evaluate(() => localStorage.getItem('isbey_token'));
  const original = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${restored}` } })).json();
  expect(original.activeTenant.id).toBe(adminSession.activeTenant.id);
  expect(await (await request.get('/api/invoices', { headers })).json()).toEqual(invoicesBefore);
});
