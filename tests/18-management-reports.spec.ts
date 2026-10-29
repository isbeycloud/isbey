import { test, expect } from './fixtures/adminSession';
import fs from 'node:fs';
import type { ManagementReportsResponse } from '../src/types/managementReports';

function fixture(currency = 'TRY', name = '=Riskli cari'): ManagementReportsResponse {
  return {
    success: true, filters: { startDate: '2026-09-01', endDate: '2026-09-30', currency }, snapshotAt: '2026-10-29T12:00:00.000Z', snapshotDate: '2026-10-29', currencyOptions: ['TRY', 'EUR'], warnings: [{ code: 'COST_UNKNOWN', message: 'Bazı ürünlerin maliyeti bilinmiyor.', count: 1 }],
    overview: { netSales: currency === 'TRY' ? 1200 : 75, netPurchases: 400, salesVat: 240, purchaseVat: 80, expenseNet: 100, expenseGross: 120, receivable: 300, payable: 90, cashBalance: 40, bankBalance: 250, postedInvoiceCount: 2, excludedInvoiceCount: 1 },
    balances: { rows: [{ customerId: 'c-report', code: 'CAR-1', name, currency, balance: 300, receivable: 300, payable: 0, periodDebit: 500, periodCredit: 200, needsReview: false, reviewReason: '' }], receivable: 300, payable: 90, periodDebit: 500, periodCredit: 200, excludedCount: 0 },
    products: [{ productId: 'p-report', code: 'PR-1', name: 'Bilinmeyen maliyetli ürün', variantId: '', variantName: '', unit: 'KGM', currency, salesQuantity: 4, returnQuantity: 1, netQuantity: 3, salesNet: 1200, salesReturnNet: 200, netSales: 1000, currentUnitCost: null, estimatedCost: null, estimatedGrossProfit: null, knownCostLines: 0, unknownCostLines: 1 }],
    profitability: { basis: 'CURRENT_PURCHASE_COST_ESTIMATE', netSales: 1200, coveredNetSales: 600, uncoveredNetSales: 600, estimatedCost: 200, estimatedGrossProfit: 400, knownCostLines: 1, unknownCostLines: 1, coveragePercent: 50, expensesNet: 100, complete: false },
    monthly: [{ month: '2026-09', salesNet: 1400, salesReturnsNet: 200, netSales: 1200, purchaseNet: 400, purchaseReturnsNet: 0, netPurchases: 400, invoiceCount: 2 }],
    expenses: { rows: [{ categoryId: 'e-report', categoryName: 'Ofis gideri', netAmount: 100, vatAmount: 20, grossAmount: 120, count: 1 }], totalNet: 100, totalVat: 20, totalGross: 120, excludedCount: 0 },
    stock: { critical: [{ productId: 'p-report', code: 'PR-1', name: 'Kritik ürün', variantId: '', variantName: '', unit: 'KGM', currentStock: 2, criticalStock: 5, lastMovementDate: '2026-09-01' }], idle: [], idleDays: 90 },
    cashBank: [{ id: 'bank-report', kind: 'BANK', name: 'Yönetim Bankası', currency, balance: 250, needsReview: false, reviewReason: '' }],
  };
}

test('management reports separate periods and currencies, show missing cost and export safe active-tab CSV', async ({ page, adminSession }) => {
  const queries: URLSearchParams[] = [];
  let writes = 0;
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/reports/management?*', route => {
    const params = new URL(route.request().url()).searchParams; queries.push(params);
    return route.fulfill({ json: fixture(params.get('currency') || 'TRY') });
  });
  page.on('request', request => { if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method())) writes++; });
  await page.goto('/');await page.locator('aside').getByRole('button', { name: 'Raporlar', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Yönetici raporları', exact: true });
  await expect(panel.getByRole('heading', { name: 'Yönetici Raporları', exact: true })).toBeVisible();
  await expect(panel.getByText('1.200,00 TL', { exact: true }).first()).toBeVisible();
  await expect(panel).toContainText('Anlık bakiyeler');
  await page.screenshot({ path: '.verify-tmp/management-reports-desktop.png', fullPage: true });
  await panel.getByRole('tab', { name: 'Ürünler', exact: true }).click();
  const unknown = panel.getByRole('row').filter({ hasText: 'Bilinmeyen maliyetli ürün' });
  await expect(unknown).toContainText('Bilinmiyor');await expect(unknown).toContainText('Kg');
  await panel.getByRole('tab', { name: 'Tahmini Brüt Kâr', exact: true }).click();
  await expect(panel).toContainText('Net kâr değildir');await expect(panel).toContainText('%50');
  const profitDownload = page.waitForEvent('download');await panel.getByRole('button', { name: 'CSV İndir', exact: true }).click();
  const profitCsv = fs.readFileSync((await (await profitDownload).path())!, 'utf8');
  expect(profitCsv).toContain('Güncel alış maliyetiyle tahmin; net kâr değildir');expect(profitCsv).toContain('maliyeti bilinmeyen 1 satır');
  await panel.getByRole('button', { name: 'Yazdır', exact: true }).click();
  const preview = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: 'Tahmini Brüt Kâr · TRY', exact: true }) });
  await expect(preview).toContainText('Güncel alış maliyetiyle tahmin; net kâr değildir');
  await preview.locator('.modal-header button').last().click();
  await panel.getByRole('tab', { name: 'Borç / Alacak', exact: true }).click();
  const download = page.waitForEvent('download');await panel.getByRole('button', { name: 'CSV İndir', exact: true }).click();
  const file = await (await download).path();const bytes = fs.readFileSync(file!);
  expect(Array.from(bytes.subarray(0, 3))).toEqual([239, 187, 191]);
  const csv = bytes.toString('utf8');expect(csv).toContain("'=Riskli cari");expect(csv).toContain('TRY');
  await panel.getByLabel('Başlangıç tarihi', { exact: true }).fill('2026-09-01');
  await panel.getByLabel('Bitiş tarihi', { exact: true }).fill('2026-09-30');
  await panel.getByLabel('Para birimi', { exact: true }).selectOption('EUR');
  await panel.getByRole('button', { name: 'Raporu Getir', exact: true }).click();
  await panel.getByRole('tab', { name: 'Özet', exact: true }).click();
  await expect(panel.getByText('75,00 EUR', { exact: true }).first()).toBeVisible();
  expect(queries.at(-1)?.get('currency')).toBe('EUR');expect(queries.at(-1)?.get('startDate')).toBe('2026-09-01');
  await expect(panel.getByText('1.200,00 TL', { exact: true })).toHaveCount(0);
  for (const tab of ['Aylık Seyir', 'Giderler', 'Stok Riskleri']) await panel.getByRole('tab', { name: tab, exact: true }).click();
  await expect(panel).toContainText('Kritik ürün');
  await panel.getByRole('tab', { name: 'Özet', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '.verify-tmp/management-reports-mobile.png', fullPage: true });
  expect(writes).toBe(0);
});

test('management report read errors hide previous data and retry uses the requested filters', async ({ page, adminSession }) => {
  let fail = false;
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/reports/management?*', route => route.fulfill(fail ? { status: 503, json: { success: false, message: 'Yönetici raporu alınamadı.' } } : { json: fixture() }));
  await page.goto('/');await page.locator('aside').getByRole('button', { name: 'Raporlar', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Yönetici raporları', exact: true });
  await expect(panel.getByText('1.200,00 TL', { exact: true }).first()).toBeVisible();
  fail = true;await panel.getByRole('button', { name: 'Raporu Getir', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Yönetici raporu alınamadı');
  await expect(panel.getByText('1.200,00 TL', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'CSV İndir', exact: true })).toBeDisabled();
  fail = false;await panel.getByRole('button', { name: 'Tekrar Dene', exact: true }).click();
  await expect(panel.getByText('1.200,00 TL', { exact: true }).first()).toBeVisible();
});

test('late management response from the previous company cannot replace the new company report', async ({ page, request, adminSession }) => {
  const me = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();
  const other = { ...me.activeTenant, id: 'reports-tenant-b', name: 'Rapor Test Firması B' };
  let switched = false, delayed = false;
  let release!: () => void;const pending = new Promise<void>(resolve => { release = resolve; });
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...me, activeTenant: switched ? other : me.activeTenant, allowedTenants: [me.activeTenant, other] } }));
  await page.route('**/api/auth/switch-company', route => { switched = true;return route.fulfill({ json: { success: true, token: adminSession.token, user: me.user, activeTenant: other } }); });
  await page.route('**/api/reports/management?*', async route => {
    if (!switched) { delayed = true;await pending;return route.fulfill({ json: fixture('TRY', 'ESKİ FİRMA KAYDI') }); }
    return route.fulfill({ json: fixture('TRY', 'YENİ FİRMA KAYDI') });
  });
  try {
    await page.goto('/');await page.locator('aside').getByRole('button', { name: 'Raporlar', exact: true }).click();
    await expect.poll(() => delayed).toBe(true);
    await page.getByRole('button', { name: 'Firma seç / değiştir', exact: true }).click();
    await page.getByRole('button', { name: /Rapor Test Firması B/ }).click();
    await expect(page.getByRole('button', { name: 'Firma seç / değiştir', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Firma seç / değiştir', exact: true })).toContainText('Rapor Test Firması B');
    await page.locator('aside').getByRole('button', { name: 'Raporlar', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Yönetici raporları', exact: true });
    await panel.getByRole('tab', { name: 'Borç / Alacak', exact: true }).click();
    await expect(panel).toContainText('YENİ FİRMA KAYDI');
    release();await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(panel).not.toContainText('ESKİ FİRMA KAYDI');await expect(panel).toContainText('YENİ FİRMA KAYDI');
  } finally { release(); }
});
