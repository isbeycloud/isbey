import { test, expect } from './fixtures/adminSession';

test('company cards persist expenses, refunds and repayment tracking without posting a second expense', async ({ page, adminSession }) => {
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.goto('/');
  await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Menü ve Kayıt Ara' });
  await search.getByRole('button', { name: 'Menüler', exact: true }).click();
  await search.getByRole('combobox').fill('kredi kart'); await search.getByRole('combobox').press('Enter');
  await page.getByRole('button', { name: 'Şirket Kredi Kartları', exact: true }).click();
  await page.getByRole('button', { name: 'Kart Tanımla', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Kredi Kartı Tanımla', exact: true });
  const cardName = `Ofis Kartı ${Date.now().toString(36)}`;
  await dialog.getByLabel('Kart adı', { exact: true }).fill(cardName);
  await dialog.getByLabel('Banka', { exact: true }).fill('Test Bankası');
  await dialog.getByLabel('Son 4 hane', { exact: true }).fill('1234');
  await dialog.getByLabel('Kart limiti (TL)', { exact: true }).fill('12000');
  await dialog.getByLabel('Başlangıç borcu (TL)', { exact: true }).fill('100');
  await dialog.getByRole('button', { name: 'Kartı Kaydet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(cardName) }).click();
  await expect(page.getByTestId('card-balance')).toContainText('100,00');
  async function entry(type: string, amount: string, merchant = '') {
    await page.getByRole('button', { name: 'Hareket Ekle', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Kart Hareketi Ekle', exact: true });
    await dialog.getByRole('combobox', { name: 'İşlem türü', exact: true }).selectOption(type);
    await dialog.getByLabel('Tutar (TL)', { exact: true }).fill(amount);
    if (merchant) await dialog.getByLabel('İşyeri / muhatap', { exact: true }).fill(merchant);
    if (type === 'SPEND') {
      await page.route('**/api/company-cards/*/entries', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Geçici kayıt hatası' }) }), { times: 1 });
      await dialog.getByRole('button', { name: 'Hareketi Kaydet', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Geçici kayıt hatası');
      await expect(dialog.getByLabel('Tutar (TL)', { exact: true })).toHaveValue(amount);
      await expect(dialog.getByLabel('İşyeri / muhatap', { exact: true })).toHaveValue(merchant);
    }
    await dialog.getByRole('button', { name: 'Hareketi Kaydet', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await entry('SPEND', '240', 'Kırtasiye');
  await entry('REFUND', '40', 'Kırtasiye');
  await entry('REPAYMENT', '100', 'Borç ödemesi');
  await expect(page.getByTestId('card-balance')).toContainText('200,00');
  await expect(page.getByText('Muhasebe gideri veya banka hareketi oluşturmaz.', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).click();
  const reloadedSearch = page.getByRole('dialog', { name: 'Menü ve Kayıt Ara' });
  await reloadedSearch.getByRole('button', { name: 'Menüler', exact: true }).click();
  await reloadedSearch.getByRole('combobox').fill('kredi kart'); await reloadedSearch.getByRole('combobox').press('Enter');
  await page.getByRole('button', { name: 'Şirket Kredi Kartları', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(cardName) }).click();
  await expect(page.getByTestId('card-balance')).toContainText('200,00');
  await page.getByRole('combobox', { name: 'İşlem filtresi', exact: true }).selectOption('SPEND');
  await expect(page.getByRole('row').filter({ hasText: 'Kırtasiye' })).toHaveCount(1);
  await page.getByRole('combobox', { name: 'İşlem filtresi', exact: true }).selectOption('ALL');
  await page.getByRole('row').filter({ hasText: 'Borç ödemesi' }).getByRole('button', { name: 'İptal Et', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Kart Hareketini İptal Et', exact: true });
  await dialog.getByLabel('İptal gerekçesi', { exact: true }).fill('Yanlış girilmiş ödeme');
  await dialog.getByRole('button', { name: 'İptali Kaydet', exact: true }).click();
  await expect(page.getByTestId('card-balance')).toContainText('300,00');
  await page.screenshot({ path: '.verify-tmp/company-cards-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.company-cards').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Kartı Düzenle', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Kredi Kartını Düzenle', exact: true });
  await expect(dialog.getByLabel('Başlangıç borcu (TL)', { exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Kart durumu', exact: true }).selectOption('ARCHIVED');
  await dialog.getByRole('button', { name: 'Kartı Kaydet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hareket Ekle', exact: true })).toBeDisabled();
  await page.screenshot({ path: '.verify-tmp/company-cards-mobile.png', fullPage: true });
});

test('card loading error stays distinct from empty state and can be retried', async ({ page, adminSession }) => {
  await page.addInitScript(token => localStorage.setItem('isbey_token', token), adminSession.token);
  await page.route('**/api/company-cards', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Kart kayıtları şu anda alınamadı.' }) }), { times: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menü ve kayıt ara', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Menü ve Kayıt Ara' });
  await search.getByRole('button', { name: 'Menüler', exact: true }).click();
  await search.getByRole('combobox').fill('kredi kart'); await search.getByRole('combobox').press('Enter');
  await page.getByRole('button', { name: 'Şirket Kredi Kartları', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Kart kayıtları şu anda alınamadı.');
  await expect(page.getByRole('button', { name: 'Kart Tanımla', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tekrar Dene', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kart Tanımla', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
