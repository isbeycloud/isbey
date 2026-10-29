import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { UserAccountsStore } from '../server/services/userAccounts';

const token = 'aB9_-'.repeat(8) + 'xyA';
const validPassword = 'YeniParola-2026!';

test('password setup rejects missing or malformed fragments and removes sensitive URL parts', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/account-password-reset', route => { writes++; return route.abort(); });
  await page.goto('/reset-password?token=not-accepted#token=bad');
  await expect(page.getByRole('alert')).toContainText('geçersiz');
  await expect(page.getByLabel('Yeni parola', { exact: true })).toHaveCount(0);
  expect(page.url()).toMatch(/\/reset-password$/);
  expect(writes).toBe(0);
  await page.goto('about:blank');
  await page.goto(`/reset-password#token=${'a1'.repeat(32)}`);
  await expect(page.getByRole('alert')).toContainText('geçersiz');
  await expect(page.getByLabel('Yeni parola', { exact: true })).toHaveCount(0);
});

test('password page accepts the actual link produced by the account mail service', async ({ page }) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'password-page-contract-'));
  const database = path.join(folder, 'database.json');
  const previousUrl = process.env.PUBLIC_APP_URL, previousSecret = process.env.JWT_SECRET;
  const actingPassword = 'ContractFixture-2026!';
  let actualLink = '';
  try {
    process.env.PUBLIC_APP_URL = 'https://accounts.example.test';
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    fs.writeFileSync(database, JSON.stringify({
      users: [{ id: 'fixture-owner', username: 'fixture-owner', fullName: 'Fixture Owner', email: 'owner@example.test', active: true, role: 'SUPER_ADMIN', passwordHash: bcrypt.hashSync(actingPassword, 4) }],
      tenants: [{ id: 'fixture-company', status: 'ACTIVE' }], tenantUsers: [], roles: [],
    }));
    const service = new UserAccountsStore(database, { deliver: async message => {
      actualLink = message.text.split('\n').find(line => line.startsWith('https://')) || '';
      return { accepted: [message.to], rejected: [] };
    } });
    const sent = await service.sendPasswordEmail('fixture-owner', 'fixture-company', 'fixture-owner', { expectedRevision: '', actingPassword, requestId: randomUUID() });
    expect(sent.mail.status).toBe('SENT');
    const link = new URL(actualLink);
    const actualToken = new URLSearchParams(link.hash.slice(1)).get('token');
    expect(actualToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await page.route('**/api/account-password-reset', async route => {
      const body = route.request().postDataJSON();
      expect(body.token).toBe(actualToken);
      await service.resetPassword(body);
      await route.fulfill({ json: { success: true, message: 'Parolanız oluşturuldu.' } });
    });
    await page.goto(link.pathname + link.hash);
    await page.getByLabel('Yeni parola', { exact: true }).fill(validPassword);
    await page.getByLabel('Yeni parola tekrar', { exact: true }).fill(validPassword);
    await page.getByRole('button', { name: 'Parolayı Oluştur', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Parolanız oluşturuldu');
  } finally {
    if (previousUrl === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    for (const file of [database, database + '.user-accounts.json']) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(folder);
  }
});

test('password setup validates UTF-8 size, retains failed inputs and clears them after success', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/account-password-reset', async route => {
    writes++;
    const body = route.request().postDataJSON();
    expect(body).toEqual({ token, newPassword: validPassword, confirmPassword: validPassword });
    if (writes === 1) return route.fulfill({ status: 400, json: { success: false, message: 'Bağlantı geçersiz veya süresi dolmuş.' } });
    return route.fulfill({ json: { success: true, message: 'Parolanız oluşturuldu. Giriş yapabilirsiniz.' } });
  });
  await page.goto(`/reset-password#token=${token}`);
  const password = page.getByLabel('Yeni parola', { exact: true });
  const confirmation = page.getByLabel('Yeni parola tekrar', { exact: true });
  await expect(password).toBeVisible();
  expect(page.url()).toMatch(/\/reset-password$/);
  await password.fill('ü'.repeat(37)); await confirmation.fill('ü'.repeat(37));
  await page.getByRole('button', { name: 'Parolayı Oluştur', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('72'); expect(writes).toBe(0);
  await password.fill(validPassword); await confirmation.fill('FarkliParola-2026!');
  await page.getByRole('button', { name: 'Parolayı Oluştur', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('eşleşmiyor'); expect(writes).toBe(0);
  await confirmation.fill(validPassword);
  await page.getByRole('button', { name: 'Parolayı Oluştur', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('süresi dolmuş');
  await expect(password).toHaveValue(validPassword); await expect(confirmation).toHaveValue(validPassword);
  await page.getByRole('button', { name: 'Parolayı Oluştur', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Parolanız oluşturuldu');
  await expect(password).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Giriş ekranına dön' })).toHaveAttribute('href', '/');
  expect(writes).toBe(2);
  const persistedValues = await page.evaluate(() => [localStorage, sessionStorage].flatMap(storage => Object.keys(storage).map(key => storage.getItem(key) || '')));
  expect(persistedValues.join(' ')).not.toContain(token);
  expect(persistedValues.join(' ')).not.toContain(validPassword);
});

test('password setup keeps mobile submit reachable and blocks duplicate submissions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let writes = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/account-password-reset', async route => {
    writes++;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { success: true, message: 'Parolanız oluşturuldu.' } });
  });
  await page.goto(`/reset-password#token=${token}`);
  await page.getByLabel('Yeni parola', { exact: true }).fill(validPassword);
  await page.getByLabel('Yeni parola tekrar', { exact: true }).fill(validPassword);
  await page.getByRole('button', { name: 'Parolayı Oluştur', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toBeDisabled();
  await expect.poll(() => writes).toBe(1);
  await page.locator('.password-setup-panel form').evaluate(form => (form as HTMLFormElement).requestSubmit());
  expect(writes).toBe(1);
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
  release?.();
  await expect(page.getByRole('status')).toContainText('Parolanız oluşturuldu');
});
