import { test, expect } from './fixtures/adminSession';
import fs from 'node:fs';
import type { ExpenseReportFilters, ExpenseReportsResponse, ExpenseReportRow } from '../src/types/expenseReports';

function report(params = new URLSearchParams(), title = '=Ofis alımı'): ExpenseReportsResponse {
  const currency = params.get('currency') || 'TRY';
  const base: ExpenseReportRow = { id: 'exp-report-1', date: '2026-09-14', documentNo: 'GID-19-1', title, categoryId: 'office', categoryName: 'Ofis masrafları', costCenterId: 'hq', costCenterName: 'Merkez', supplierTitle: 'Test Tedarikçisi 19', receiptNo: 'FIS-19', paymentMethod: 'BANK', account: 'BANK:bank-19', accountName: 'Ana banka', currency, netAmount: 100, vatRate: 20, vatAmount: 20, grossAmount: 120, notes: 'Görüşme notu\nİkinci satır' };
  const all = [base, { ...base, id: 'exp-report-2', documentNo: 'GID-19-2', title: 'Yakıt', categoryId: 'fuel', categoryName: 'Akaryakıt', costCenterId: 'warehouse', costCenterName: 'Depo', receiptNo: '', paymentMethod: 'CASH' as const, account: 'CASH:cash-19', accountName: 'Merkez kasa', netAmount: 200, vatAmount: 40, grossAmount: 240 }];
  const rows = all.filter(row => (!params.get('categoryId') || row.categoryId === params.get('categoryId')) && (!params.get('costCenterId') || row.costCenterId === params.get('costCenterId')) && (!params.get('paymentMethod') || row.paymentMethod === params.get('paymentMethod')) && (!params.get('account') || row.account === params.get('account')) && (!params.get('search') || row.title.includes(params.get('search')!)));
  const summary = { count: rows.length, netAmount: rows.reduce((n, row) => n + row.netAmount, 0), vatAmount: rows.reduce((n, row) => n + row.vatAmount, 0), grossAmount: rows.reduce((n, row) => n + row.grossAmount, 0) };
  return { success: true, filters: { startDate: params.get('startDate') || '2026-09-01', endDate: params.get('endDate') || '2026-09-30', currency, ...Object.fromEntries(['categoryId', 'costCenterId', 'paymentMethod', 'account', 'search'].filter(key => params.get(key)).map(key => [key, params.get(key)])) } as ExpenseReportFilters, snapshotAt: '2026-10-29T12:00:00.000Z', snapshotDate: '2026-10-29', rows, summary,
    byCategory: rows.map(row => ({ id: row.categoryId, name: row.categoryName, count: 1, netAmount: row.netAmount, vatAmount: row.vatAmount, grossAmount: row.grossAmount })), byCostCenter: rows.map(row => ({ id: row.costCenterId, name: row.costCenterName, count: 1, netAmount: row.netAmount, vatAmount: row.vatAmount, grossAmount: row.grossAmount })),
    options: { currencies: ['TRY', 'EUR'], categories: [{ id: 'office', name: 'Ofis masrafları' }, { id: 'fuel', name: 'Akaryakıt' }], costCenters: [{ id: 'hq', name: 'Merkez' }, { id: 'warehouse', name: 'Depo' }], accounts: [{ value: 'BANK:bank-19', label: 'Ana banka', kind: 'BANK', id: 'bank-19' }, { value: 'CASH:cash-19', label: 'Merkez kasa', kind: 'CASH', id: 'cash-19' }], paymentMethods: ['BANK', 'CASH', 'OTHER'] }, warnings: [], excludedCount: 0 };
}

test('expense report filters transactions and totals, expands actual expense details and exports safe CSV', async ({ page, adminSession }) => {
  const queries: URLSearchParams[] = [];let writes = 0;
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/reports/expense-transactions?*', route => { const params = new URL(route.request().url()).searchParams;queries.push(params);return route.fulfill({ json: report(params) }); });
  page.on('request', request => { if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method())) writes++; });
  await page.goto('/');await page.locator('aside').getByRole('button', { name: 'Raporlar', exact: true }).click();
  await page.getByRole('navigation', { name: 'Rapor bölümleri' }).getByRole('button', { name: 'Gider İşlem Dökümü', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Gider işlem dökümü', exact: true });
  await expect(panel.getByTestId('expense-report-count')).toHaveText('2');
  const row = panel.getByRole('row').filter({ hasText: 'GID-19-1' });await row.getByRole('button', { name: /Ayrıntılar/ }).click();
  await expect(panel.getByRole('region', { name: 'Gider ayrıntısı GID-19-1', exact: true })).toContainText('FIS-19');
  await expect(panel).toContainText('Test Tedarikçisi 19');await expect(panel).toContainText('İkinci satır');
  await page.screenshot({ path: '.verify-tmp/expense-report-desktop.png', fullPage: true });
  await panel.getByLabel('Para birimi', { exact: true }).selectOption('EUR');
  await panel.getByLabel('Başlangıç tarihi', { exact: true }).fill('2026-09-01');await panel.getByLabel('Bitiş tarihi', { exact: true }).fill('2026-09-30');
  await panel.locator('summary').filter({ hasText: 'Diğer filtreler' }).click();
  await panel.getByLabel('Masraf kalemi', { exact: true }).selectOption('office');await panel.getByLabel('Maliyet merkezi', { exact: true }).selectOption('hq');
  await panel.getByLabel('Ödeme yöntemi', { exact: true }).selectOption('BANK');await panel.getByLabel('Kasa / banka hesabı', { exact: true }).selectOption('BANK:bank-19');
  await panel.getByLabel('Gider ara', { exact: true }).fill('=Ofis');await panel.getByRole('button', { name: 'Raporu Getir', exact: true }).click();
  await expect(panel.getByTestId('expense-report-count')).toHaveText('1');await expect(panel.getByTestId('expense-report-gross')).toHaveText('120,00 EUR');
  const last = queries.at(-1)!;for (const [key, value] of Object.entries({ currency: 'EUR', startDate: '2026-09-01', endDate: '2026-09-30', categoryId: 'office', costCenterId: 'hq', paymentMethod: 'BANK', account: 'BANK:bank-19', search: '=Ofis' })) expect(last.get(key)).toBe(value);
  const pending = page.waitForEvent('download');await panel.getByRole('button', { name: 'CSV İndir', exact: true }).click();const bytes = fs.readFileSync((await (await pending).path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);const csv = bytes.toString('utf8');expect(csv).toContain("'=Ofis alımı");expect(csv).toContain('EUR');expect(csv).toContain('FIS-19');expect(csv).not.toContain('GID-19-2');
  await panel.getByRole('button', { name: 'Yazdır', exact: true }).click();
  const preview = page.locator('.modal-dialog').filter({ has: page.getByRole('heading', { name: 'Gider İşlem Dökümü · EUR', exact: true }) });
  await expect(preview).toContainText('120,00 EUR');await expect(preview).toContainText('FIS-19');await expect(preview).toContainText('Masraf kalemi: Ofis masrafları');
  await preview.locator('.modal-header button').last().click();
  await panel.getByRole('tab', { name: 'Masraf Kalemleri', exact: true }).click();await expect(panel.getByRole('table')).toContainText('Ofis masrafları');
  await panel.getByRole('tab', { name: 'Maliyet Merkezleri', exact: true }).click();await expect(panel.getByRole('table')).toContainText('Merkez');
  await panel.getByRole('tab', { name: 'İşlem Dökümü', exact: true }).click();await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '.verify-tmp/expense-report-mobile.png', fullPage: true });expect(writes).toBe(0);
});

test('expense report errors remove stale totals and exports then retry restores the filtered report', async ({ page, adminSession }) => {
  let failed = false;await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/reports/expense-transactions?*', route => route.fulfill(failed ? { status: 503, json: { success: false, message: 'Gider raporu alınamadı.' } } : { json: report() }));
  await page.goto('/');await page.locator('aside').getByRole('button', { name: 'Raporlar', exact: true }).click();await page.getByRole('navigation', { name: 'Rapor bölümleri' }).getByRole('button', { name: 'Gider İşlem Dökümü', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Gider işlem dökümü', exact: true });await expect(panel.getByTestId('expense-report-count')).toHaveText('2');
  failed = true;await panel.getByRole('button', { name: 'Raporu Getir', exact: true }).click();await expect(panel.getByRole('alert')).toContainText('Gider raporu alınamadı');
  await expect(panel.getByTestId('expense-report-count')).toHaveCount(0);await expect(panel.getByRole('button', { name: 'CSV İndir', exact: true })).toBeDisabled();
  failed = false;await panel.getByRole('button', { name: 'Tekrar Dene', exact: true }).click();await expect(panel.getByTestId('expense-report-count')).toHaveText('2');
});

test('late expense data from the previous company never enters the new company report', async ({ page, request, adminSession }) => {
  const me = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${adminSession.token}` } })).json();const other = { ...me.activeTenant, id: 'expense-tenant-b', name: 'Gider Test Firması B' };
  let switched = false, delayed = false;let release!: () => void;const pending = new Promise<void>(resolve => { release = resolve; });
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...me, activeTenant: switched ? other : me.activeTenant, allowedTenants: [me.activeTenant, other] } }));
  await page.route('**/api/auth/switch-company', route => { switched = true;return route.fulfill({ json: { success: true, token: adminSession.token, user: me.user, activeTenant: other } }); });
  await page.route('**/api/reports/expense-transactions?*', async route => { if (!switched) { delayed = true;await pending;return route.fulfill({ json: report(new URLSearchParams(), 'ESKİ GİDER KAYDI') }); }return route.fulfill({ json: report(new URLSearchParams(), 'YENİ GİDER KAYDI') }); });
  try {
    await page.goto('/');await page.locator('aside').getByRole('button', { name: 'Raporlar', exact: true }).click();await page.getByRole('navigation', { name: 'Rapor bölümleri' }).getByRole('button', { name: 'Gider İşlem Dökümü', exact: true }).click();await expect.poll(() => delayed).toBe(true);
    await page.getByRole('button', { name: 'Firma seç / değiştir', exact: true }).click();await page.getByRole('button', { name: /Gider Test Firması B/ }).click();await expect(page.getByRole('button', { name: 'Firma seç / değiştir', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await page.locator('aside').getByRole('button', { name: 'Raporlar', exact: true }).click();await page.getByRole('navigation', { name: 'Rapor bölümleri' }).getByRole('button', { name: 'Gider İşlem Dökümü', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Gider işlem dökümü', exact: true });await expect(panel).toContainText('YENİ GİDER KAYDI');
    const oldResponse = page.waitForResponse(response => response.url().includes('/api/reports/expense-transactions'));
    release();await (await oldResponse).finished();await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));await expect(panel).not.toContainText('ESKİ GİDER KAYDI');await expect(panel).toContainText('YENİ GİDER KAYDI');
  } finally { release(); }
});
