import { test, expect } from '@playwright/test';

test('direct signup selects a package once and can later request a plan', async ({ page, request }) => {
  // 2026-10-16 (VKN akışı): kayıt formunda şifre/firma ünvanı YOK; firma bilgisi
  // Hızlı Bilişim'den çekilir. E2E'de Hızlı Bilişim ağı yok, bu yüzden:
  //  - gerçek token + TAZE (paketsiz) tenant sunucudan (legacy /register) alınır,
  //  - VKN çağrısı arayüz sözleşmesiyle yakalanıp doğrulanır,
  //  - VKN backend mantığı server/tests/registrationTrialGateTest.ts'de koşar
  //    (sahte başarı ASLA ürün koduna girmez).
  const stamp = Date.now();
  const reg = await request.post('/api/auth/register', {
    data: {
      fullName: 'Katalog Test Kullanıcısı',
      email: `catalog-${stamp}@example.test`,
      companyName: 'Katalog Test Firması',
      taxNumber: '1234567890',
      password: 'TestPassword123!',
    },
  });
  expect(reg.status()).toBe(201);
  const seeded = await reg.json();
  expect(seeded.success).toBe(true);
  expect(seeded.token).toBeTruthy();
  expect(seeded.tenant?.id).toBeTruthy();

  await page.goto('/');
  await page.getByRole('button', { name: /Ücretsiz Deneyin|Ücretsiz Başla|Ücretsiz Dene/ }).first().click();

  // VKN sözleşmesi: formda şifre alanı ve firma ünvanı alanı YOKTUR.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByPlaceholder('ABC Teknoloji Ltd. Şti.')).toHaveCount(0);
  await expect(page.getByText('Şifrenizi siz belirlemezsiniz', { exact: false })).toBeVisible();

  const sentBodies: Record<string, unknown>[] = [];
  await page.route('**/api/auth/register-by-vkn', route => {
    sentBodies.push(route.request().postDataJSON());
    return route.fulfill({
      status: 201,
      json: {
        success: true,
        message: 'Hesabınız oluşturuldu.',
        token: seeded.token,
        user: seeded.user,
        tenant: seeded.tenant,
        trial: seeded.trial,
        username: seeded.user?.username || `catalog-${stamp}`,
        mailStatus: 'QUEUED',
        trialDays: 14,
        isFirstLogin: true,
        edonusumDecisionRequired: false,
      },
    });
  });

  await page.getByPlaceholder('Ahmet Yılmaz').fill('Yeni ERP Kullanıcısı');
  await page.getByPlaceholder('ornek@sirketiniz.com').fill(`catalog-${stamp}@example.test`);
  await page.getByPlaceholder('0532 000 00 00').fill('0532 000 00 00');
  // 9 hane geçersizdir: istemci reddeder, sunucuya TEK çağrı bile gitmez.
  await page.getByPlaceholder('10 veya 11 hane').fill('123456789');
  await page.getByRole('button', { name: '14 Günlük Ücretsiz Denemeyi Başlat' }).click();
  await expect(page.getByText('Geçerli bir VKN (10 hane) veya TCKN (11 hane) giriniz.', { exact: true })).toBeVisible();
  expect(sentBodies).toHaveLength(0);

  await page.getByPlaceholder('10 veya 11 hane').fill('1234567890');
  await page.getByRole('button', { name: '14 Günlük Ücretsiz Denemeyi Başlat' }).click();

  // Kayıt → oturum token'ı yazılır, kullanıcı hizmet kataloğuna düşer.
  expect(sentBodies).toHaveLength(1);
  expect(sentBodies[0]).not.toHaveProperty('password');
  expect(sentBodies[0]).not.toHaveProperty('companyName');
  expect(sentBodies[0].vknTckn).toBe('1234567890');
  expect(sentBodies[0].email).toBe(`catalog-${stamp}@example.test`);
  await expect(page.getByRole('heading', { name: 'Paketinizi seçin', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('isbey_token'))).toBe(seeded.token);
  await expect(page.getByRole('heading', { name: 'e-Dönüşüm hizmetleri' })).toHaveCount(0);
  await expect(page.locator('aside').getByText('Cari', { exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: /paketini seç/ }).first().check();
  await page.getByRole('button', { name: 'Seçtiğim paketleri etkinleştir', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paketinizi seçin', exact: true })).toHaveCount(0);
  await expect(page.locator('aside').getByText('Cari', { exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText('Banka', { exact: true })).toHaveCount(0);
  await page.locator('aside').getByRole('button', { name: 'Hizmetler ve Paketler', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'e-Dönüşüm hizmetleri' })).toBeVisible();
  await page.getByRole('button', { name: 'Paket talebi oluştur', exact: true }).first().click();
  await expect(page.getByText('paket talebiniz kaydedildi. Henüz ödeme alınmadı.', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Deneme ve e-Dönüşüm kararı' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('aside').getByText('Cari', { exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText('Banka', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: '.verify-tmp/service-catalog.png', fullPage: true });
});

test('customer operations, company switcher and service application form', async ({ page, request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Firma seç / değiştir', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Firma adı veya vergi numarası' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Firma adı veya vergi numarası' }).fill('no-such-company');
  await expect(page.getByRole('button', { name: /Seç$/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Firma adı veya vergi numarası' }).fill('');
  const other = page.getByRole('button', { name: /Seç$/ }).first();
  await expect(other).toBeVisible();
  const previous = await page.evaluate(() => localStorage.getItem('isbey_token'));
  await other.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('isbey_token'))).not.toBe(previous);
  await page.locator('aside').getByRole('button', { name: 'Müşteri & Firmalar', exact: true }).click();
  await page.getByRole('navigation', { name: 'Müşteri yönetimi bölümleri' }).getByRole('button', { name: /Müşteri Havuzu/ }).click();
  await expect(page.getByRole('heading', { name: 'Müşteri Havuzu', exact: true })).toBeVisible();
  await page.route('**/api/admin/hizli-bilisim/customers/dealer-portfolio?*', route => route.fulfill({ json: { success: true, total: 1273, filtered: 1273, customers: [{ externalId: 'test-provider', taxNumber: '1234567890', companyName: 'Bayi Portföy Firması', city: 'Adana', dealerName: 'Test bayi', isActive: true, existing: false }] } }));
  await page.route('**/api/admin/hizli-bilisim/portal/connect', route => route.fulfill({ json: { success: true, verificationRequired: true } }));
  await page.route('**/api/admin/hizli-bilisim/portal/verify', route => route.fulfill({ json: { success: true, verificationRequired: false } }));
  const dealerImported: string[] = [];
  await page.route('**/api/admin/hizli-bilisim/customers/dealer-import', route => {
    dealerImported.push(...route.request().postDataJSON().taxIds);
    return route.fulfill({ json: { success: true, results: [{ taxId: '1234567890', success: true, message: 'Bayi müşterisi portföye eklendi.' }] } });
  });
  await page.route('**/api/admin/hizli-bilisim/customers/portfolio-preview', route => route.fulfill({ json: { success: true, results: [
    { taxId: '1234567890', success: true, durum: 'BULUNDU', message: 'Müşteri bulundu.', musteri: { companyName: 'Seçilecek Firma' } },
    { taxId: '1234567891', success: false, durum: 'HATA', message: 'Sağlayıcıya ulaşılamadı.' },
  ] } }));
  const added: string[] = [];
  await page.route('**/api/admin/hizli-bilisim/customers/ekle', route => {
    added.push(route.request().postDataJSON().vknTckn);
    return route.fulfill({ json: { success: true, durum: 'EKLENDI', message: 'Müşteri portföye eklendi.' } });
  });
  await page.getByRole('button', { name: 'Portföyden müşteri seç', exact: true }).click();
  await expect(page.getByText('Bayi Portföy Firması', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bayi portalına bağlan', exact: true }).click();
  await page.getByLabel('Bayi kullanıcı adı', { exact: true }).fill('test-dealer');
  await page.getByLabel('Bayi şifresi', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Bağlan', exact: true }).click();
  await page.getByLabel('Doğrulama kodu', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Kodu doğrula', exact: true }).click();
  await expect(page.getByText('Bayi Portföy Firması', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '1234567890 müşterisini seç' }).check();
  await page.getByRole('button', { name: 'Seçilenleri portföye ekle (1)' }).click();
  await expect(page.getByRole('status')).toContainText('Bayi müşterisi portföye eklendi.');
  expect(dealerImported).toEqual(['1234567890']);
  await page.getByRole('button', { name: 'VKN listesiyle sorgula', exact: true }).click();
  await page.getByLabel('VKN/TCKN listesi (en fazla 50)').fill('1234567890\n1234567891');
  await page.getByRole('button', { name: 'Hızlı Bilişim’den sorgula', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '1234567891 müşterisini seç' })).toBeDisabled();
  await page.getByRole('checkbox', { name: '1234567890 müşterisini seç' }).check();
  await page.getByRole('button', { name: 'Seçilenleri portföye ekle (1)' }).click();
  await expect(page.getByRole('status')).toContainText('Müşteri portföye eklendi.');
  expect(added).toEqual(['1234567890']);
  await page.locator('.modal-header button').click();
  await page.getByText('e-Hizmet Başvuruları ve Ödeme Teklifleri', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'e-Hizmet Başvuru ve Ödeme' })).toBeVisible();
  await expect(page.getByText('Online ödeme henüz etkin değil.', { exact: false })).toBeVisible();
  await page.getByLabel('Yetkili adı', { exact: true }).fill('E2E Yetkili');
  await page.getByLabel('E-posta', { exact: true }).fill('service@example.test');
  await page.getByLabel('Telefon', { exact: true }).fill('05555555555');
  await page.getByLabel('e-Fatura', { exact: true }).check();
  await page.getByLabel('Seçili firma adına başvuru yapmaya yetkili olduğumu', { exact: false }).check();
  await page.getByRole('button', { name: 'Başvuruyu gönder', exact: true }).click();
  await expect(page.getByText('Başvurunuz kaydedildi.', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'İncelemede', exact: true })).toBeVisible();
  await page.screenshot({ path: '.verify-tmp/customer-operations.png', fullPage: true });
  expect(errors).toEqual([]);
});
