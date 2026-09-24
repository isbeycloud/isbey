import { test, expect } from '@playwright/test';
import { adminStoredHash } from '../server/tests/fixtures/e2eCredentials';

test('API authentication, role boundaries and tenant isolation', async ({ request }) => {
  const invalidInput = await request.post('/api/auth/login', { data: { username: 'admin', password: { invalid: true } } });
  expect(invalidInput.status()).toBe(400);
  const hashLogin = await request.post('/api/auth/login', { data: { username: 'admin', password: adminStoredHash } });
  expect(hashLogin.status()).toBe(401);
  const mobileHash = await request.post('/api/v1/mobile/auth/login', { data: { email: 'admin', password: adminStoredHash } });
  expect(mobileHash.status()).toBe(401);
  const mobileLogin = await request.post('/api/v1/mobile/auth/login', { data: { email: 'admin', password: 'admin123', deviceId: 'e2e-mobile' } });
  expect(mobileLogin.status()).toBe(200);
  expect((await request.get('/api/customers', { headers: { Authorization: 'Bearer forged.token.value' } })).status()).toBe(401);
  for (const route of ['/api/customers', '/api/auth/users', '/api/admin/users']) {
    expect((await request.get(route)).status(), route).toBe(401);
  }
  const login = await request.post('/api/auth/login', { data: { username: 'firmaadmin', password: 'firmaadmin123' } });
  expect(login.status()).toBe(200);
  const body = await login.json();
  expect(body.user.passwordHash).toBeUndefined();
  const headers = { Authorization: `Bearer ${body.token}` };
  const users = await request.get('/api/auth/users', { headers });
  expect(users.status()).toBe(200);
  const rows = (await users.json()).users;
  expect(Array.isArray(rows)).toBeTruthy();
  expect(rows.length).toBeGreaterThan(0);
  for (const user of rows) {
    expect(user.companyId).toBe(body.user.companyId);
    expect(user.passwordHash).toBeUndefined();
  }
  const escalation = await request.post('/api/auth/users', {
    headers, data: { username: 'forbidden-escalation', fullName: 'Forbidden', role: 'SUPER_ADMIN', password: 'NotUsed123!', companyId: 'tnt-ankara' },
  });
  expect(escalation.status()).toBe(403);
  const unknown = await request.get('/api/no-such-endpoint', { headers });
  expect(unknown.status()).toBe(404);
  expect(unknown.headers()['content-type']).toContain('application/json');
});

test('health and static responses have security headers', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect((await health.json()).status).toBe('healthy');
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  expect(health.headers()['x-frame-options']).toBe('DENY');
  const deniedOrigin = await request.get('/api/health', { headers: { Origin: 'https://untrusted.example' } });
  expect(deniedOrigin.headers()['access-control-allow-origin']).toBeUndefined();
  const spa = await request.get('/accept-invite');
  expect(spa.status()).toBe(200);
  expect(spa.headers()['cache-control']).toContain('no-store');
  expect((await request.get('/assets/missing.js')).status()).toBe(404);
});

test('real login rejects invalid credentials, persists session and logs out', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  await expect(page.getByText('Test Girişi Doldur', { exact: false })).toHaveCount(0);
  await page.getByPlaceholder('admin veya e-posta').fill('admin');
  await page.getByPlaceholder('••••••••', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  await expect(page.getByText('Geçersiz kullanıcı adı, e-posta veya şifre!')).toBeVisible();
  await page.getByPlaceholder('••••••••', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  await expect(page.getByTitle('Güvenli Çıkış Yap')).toBeVisible();
  await page.reload();
  await expect(page.getByTitle('Güvenli Çıkış Yap')).toBeVisible();
  await page.getByTitle('Güvenli Çıkış Yap').click();
  await expect(page.getByRole('button', { name: 'Giriş Yap', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('isbey_token'))).toBeNull();
  expect(pageErrors).toEqual([]);
});

test('membership editor saves independent company roles and status', async ({ page, request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  const session = await login.json();
  const headers = { Authorization: `Bearer ${session.token}` };
  const companies = (await (await request.get('/api/companies', { headers })).json()).companies;
  const other = companies.find((c: any) => c.id !== session.activeTenant.id && c.status === 'ACTIVE');
  expect(other).toBeTruthy();
  const created = await request.post('/api/users', { headers, data: { username: 'membership-e2e', fullName: 'Membership E2E', email: 'membership@example.test', password: 'TestPassword123!', role: 'COMPANY_ADMIN' } });
  expect(created.status()).toBe(200);
  const account = (await created.json()).user;
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), session.token);
  await page.goto('/');
  await page.getByRole('button', { name: 'Kullanıcı menüsü' }).click();
  await page.getByText('Kullanıcı Yönetimi', { exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'membership-e2e' }).getByTitle('Yetki ve Bilgileri Düzenle').click();
  const editor = page.getByRole('region', { name: 'Firma üyelikleri' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Firma', { exact: true }).selectOption(other.id);
  await editor.getByLabel('Mali Müşavir / Muhasebeci', { exact: true }).check();
  await editor.getByLabel('İzleyici (Salt Okunur)', { exact: true }).check();
  await editor.getByLabel('Rolün izin verdiği tüm menüler', { exact: true }).uncheck();
  await editor.getByLabel('Stok ve ürünler', { exact: true }).uncheck();
  const saved = page.waitForResponse(r => r.url().endsWith(`/users/${account.id}/memberships/${other.id}`) && r.request().method() === 'PUT');
  await editor.getByRole('button', { name: 'Firma Üyeliğini Kaydet' }).click();
  expect((await saved).status()).toBe(200);
  await expect(editor.getByRole('button', { name: 'Firma Üyeliğini Kaydet' })).toBeEnabled();
  const data = (await (await request.get(`/api/users/${account.id}/memberships`, { headers })).json()).memberships;
  expect(data.find((m: any) => m.tenantId === other.id).roleIds.sort()).toEqual(['role-accountant', 'role-viewer']);
  expect(data.find((m: any) => m.tenantId === other.id).allowedMenuIds).not.toContain('stok');
  expect(data.find((m: any) => m.tenantId === session.activeTenant.id).roleIds).toEqual(['role-company-admin']);
  await editor.getByLabel('Üyelik durumu').selectOption('passive');
  const deactivated = page.waitForResponse(r => r.url().endsWith(`/users/${account.id}/memberships/${other.id}`) && r.request().method() === 'PUT');
  await editor.getByRole('button', { name: 'Firma Üyeliğini Kaydet' }).click();
  expect((await deactivated).status()).toBe(200);
  await expect(editor.getByRole('button', { name: 'Firma Üyeliğini Kaydet' })).toBeEnabled();
  await page.screenshot({ path: '.verify-tmp/membership-editor.png', fullPage: true });
});

test('ERP subscription dates can be renewed from company license screen', async ({ page, request }) => {
  const session = await (await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } })).json();
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), session.token);
  await page.goto('/');
  await page.getByRole('button', { name: 'Firma & Şirketler', exact: true }).click();
  await page.getByTitle('Firma Yönetim Detayı (11 Sekme)').first().click();
  await page.getByRole('button', { name: 'Paket / Lisans', exact: true }).click();
  const editor = page.getByRole('region', { name: 'ERP aboneliği' });
  await editor.getByLabel('ERP başlangıç tarihi').fill('2020-01-01');
  await editor.getByLabel('ERP bitiş tarihi').fill('2030-12-31');
  const saved = page.waitForResponse(r => r.url().includes('/erp-subscription') && r.request().method() === 'PUT');
  await editor.getByRole('button', { name: 'ERP Aboneliğini Kaydet / Yenile' }).click();
  expect((await saved).status()).toBe(200);
  await expect(editor.getByLabel('ERP bitiş tarihi')).toHaveValue('2030-12-31');
  await page.screenshot({ path: '.verify-tmp/erp-subscription.png', fullPage: true });
});

// Last: exhausting the real limiter must not interfere with preceding login tests.
test('login rate limit cannot be bypassed with forged X-Forwarded-For', async ({ request }) => {
  let limited = false;
  for (let attempt = 0; attempt < 21; attempt++) {
    const response = await request.post('/api/auth/login', {
      headers: { 'X-Forwarded-For': `198.51.100.${attempt + 1}` },
      data: { username: 'no-such-user', password: 'invalid' },
    });
    if (response.status() === 429) {
      expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
      limited = true;
      break;
    }
    expect(response.status()).toBe(401);
  }
  expect(limited).toBe(true);
});
