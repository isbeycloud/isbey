import { test, expect } from '@playwright/test';
import { marketing, marketingFaqs } from '../src/data/marketingContent';

test('search crawlers receive real page content and matching structured data before JavaScript', async ({ request, browser, baseURL }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('Ön muhasebe ve');
  expect(html).toContain('Hesabınızı oluşturun');
  expect(html).toContain(`rel="canonical" href="${marketing.url}/"`);
  expect(html).not.toMatch(/aggregateRating|ratingValue|ISO 27001|Türkiye'nin lider|0850 300|SearchAction|₺349/);
  const rawSchema = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  expect(rawSchema).toBeTruthy();
  const graph = JSON.parse(rawSchema!)['@graph'];
  const faq = graph.find((item: any) => item['@type'] === 'FAQPage');
  expect(faq.mainEntity.map((item: any) => [item.name, item.acceptedAnswer.text])).toEqual(marketingFaqs.map(item => [item.question, item.answer]));
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Bugünkü işinize uygun başlayın.', exact: true })).toBeVisible();
    await page.getByText(marketingFaqs[0].question, { exact: true }).click();
    await expect(page.getByText(marketingFaqs[0].answer, { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('canonical, sitemap, crawler controls and AI summary use the approved domain and safe scope', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('OAI-SearchBot');
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toContain(`Sitemap: ${marketing.url}/sitemap.xml`);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(`<loc>${marketing.url}/</loc>`);
  expect(sitemap.match(/<loc>/g)).toHaveLength(1);
  expect(sitemap).not.toContain('#');
  const social = await request.get('/brand/isbey-social.png');
  expect(social.status()).toBe(200);
  expect(social.headers()['content-type']).toContain('image/png');
  const summary = await (await request.get('/llms.txt')).text();
  expect(summary).toContain(marketing.url);
  expect(summary).not.toMatch(/isbey\.cloud|bey360\.com|ISO 27001|0850|Trendyol|₺349/);
  for (const path of ['/accept-invite', '/reset-password', '/pay/example', '/share/example']) expect((await request.get(path)).headers()['x-robots-tag']).toBe('noindex, nofollow');
});

test('modern landing is responsive, interactive and loads the ERP only when requested', async ({ page }) => {
  const errors: string[] = [];
  const scripts: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto('/');
  await expect(page).toHaveTitle(marketing.title);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Cari', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Stok', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('128 ürün');
  await page.getByRole('tab', { name: 'Stok', exact: true }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Nakit', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(scripts.some(url => /\/App-[^/]+\.js/.test(url))).toBe(false);
  await page.screenshot({ path: '.verify-tmp/landing-modern-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Menüyü aç', exact: true }).click();
    await page.getByRole('navigation', { name: 'Tanıtım menüsü' }).getByRole('link', { name: 'Sık sorulanlar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Menüyü aç', exact: true })).toHaveAttribute('aria-expanded', 'false');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.verify-tmp/landing-modern-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  await expect(page.getByPlaceholder('admin veya e-posta')).toBeVisible();
  expect(scripts.some(url => /\/App-[^/]+\.js/.test(url))).toBe(true);
  expect(errors).toEqual([]);
});

test('free-trial action opens the real registration flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ücretsiz Dene', exact: true }).click();
  await expect(page.getByRole('button', { name: '14 Günlük Ücretsiz Denemeyi Başlat', exact: true })).toBeVisible();
});
