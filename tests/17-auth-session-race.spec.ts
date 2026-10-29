import { test, expect } from './fixtures/adminSession';

test('a profile refresh completed after logout cannot restore the signed-out session', async ({ page, adminSession }) => {
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  let reads = 0, delayed = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/me', async route => {
    reads++;
    if (reads !== 2) return route.continue();
    // Fetch the real authenticated response before logout, then hold its delivery.
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    delayed = true;
    await pending;
    await route.fulfill({ response });
  });
  try {
    await page.goto('/');
    await expect(page.getByTitle('Güvenli Çıkış Yap')).toBeVisible();
    await expect.poll(() => delayed).toBe(true);
    await page.getByTitle('Güvenli Çıkış Yap').click();
    await expect(page.getByRole('button', { name: 'Giriş Yap', exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('isbey_token'))).toBeNull();
    const staleResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/me') && response.status() === 200);
    release();
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('button', { name: 'Giriş Yap', exact: true })).toBeVisible();
    await expect(page.getByTitle('Güvenli Çıkış Yap')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('isbey_token'))).toBeNull();
  } finally { release(); }
});
