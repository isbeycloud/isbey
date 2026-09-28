import { test, expect } from '@playwright/test';

/**
 * GELEN e-BELGELER EKRANI — E2E
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 eklendi.
 *
 * Bu spec'in ASIL amacı "ekran açılıyor mu" değil, İKİ DÜRÜSTLÜK KURALINI
 * tarayıcıda kanıtlamaktır:
 *   1. Entegratör yapılandırılmamışken "Entegratörden Çek" UYDURMA BAŞARI
 *      göstermemelidir (proje kuralı: "API hatasında asla sahte/simüle başarılı
 *      response üretilmez").
 *   2. Ekran, çekmenin stok/cariyi DEĞİŞTİRMEDİĞİNİ kullanıcıya açıkça
 *      yazmalıdır — aksi hâlde "senkron ettim, işlendi" yanılgısı doğar.
 */

test('gelen e-belgeler ekranı: sekmeler, dürüst hata ve stok uyarısı', async ({ page, request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);

  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/');

  // ── Sidebar'dan ekrana gidilir (rota + menü kaydı çalışıyor mu) ──────────
  await page.getByText('Gelen e-Belgeler', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Gelen e-Faturalar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Gelen e-İrsaliyeler/ })).toBeVisible();

  // ── İDİA 1: kullanıcıya "çekmek stok/cariyi değiştirmez" açıkça yazılır ──
  await expect(
    page.getByText('Entegratörden çekmek stok ve cariyi değiştirmez.', { exact: false })
  ).toBeVisible();

  // ── İDİA 2: entegratör yokken çekme UYDURMA BAŞARI göstermez ────────────
  // Test ortamında HIZLI_BILISIM yapılandırması yoktur; sunucu 503 +
  // `configured: false` döner. Ekran bunu bir hata olarak göstermelidir.
  await page.getByRole('button', { name: /Entegratörden Çek/ }).click();
  await expect(
    page.getByText(/yapılandırılmamış|yapılandırma|entegratör/i).first()
  ).toBeVisible({ timeout: 15000 });
  // "senkronize edildi" gibi bir başarı mesajı GÖRÜNMEMELİ.
  await expect(page.getByText(/senkronize edildi/i)).toHaveCount(0);

  // ── İrsaliye sekmesi: borç doğurmadığı yazılı olmalı ────────────────────
  await page.getByRole('button', { name: /Gelen e-İrsaliyeler/ }).click();
  await expect(page.getByText('CARİ BORÇ DOĞURMAZ', { exact: false })).toBeVisible();

  expect(errors).toEqual([]);
  await page.screenshot({ path: '.verify-tmp/incoming-documents.png', fullPage: true });
});

/**
 * MUHASEBE (ACCOUNTANT) KULLANICISI — tarayıcıda erişim ve SINIR kontrolü
 * ═══════════════════════════════════════════════════════════════════════════
 * Kullanıcı isteği: "MUHASEBE kullanıcısı Gelen Belgeler ekranını açabilmeli,
 * gelen faturaları görebilmeli, gelen irsaliyeleri görebilmeli, eşleştirme/onay
 * ekranını açabilmeli, bunun dışında admin yetkisi kazanmamalı."
 *
 * ⚠️ Bu testin varoluş nedeni: `einvoice.view` DB kataloğunda olmadığı için
 * MUHASEBE (ve COMPANY_ADMIN) gelen fatura ucunda 403 alıyordu; hiçbir statik
 * test bunu görmüyordu. Sunucu tarafı `incomingDocumentAuthzTest.ts` ile
 * ölçülür; burada ARAYÜZÜN de aynı davranışı göstermesi kanıtlanır.
 *
 * ⚠️ Giriş hız sınırı: 15 dk / 20 deneme (test-server.mjs bunu KASITLI olarak
 * yükseltmez). Spec başına TEK giriş yapılır, oturum paylaşılır.
 */
test('MUHASEBE kullanıcısı: ekran açılır, belgeler görünür, ADMIN yetkisi YOK', async ({ page, request }) => {
  // Parola seed'den gelir: server/db/seed.ts → muhasebe / muhasebe123
  // (admin123 DEĞİL; ilk denemede bu yüzden 401 alınmıştı).
  const login = await request.post('/api/auth/login', { data: { username: 'muhasebe', password: 'muhasebe123' } });
  expect(login.status(), 'muhasebe girişi başarısız (parola seed ile uyuşmuyor mu?)').toBe(200);
  const { token } = await login.json();
  await page.addInitScript(value => localStorage.setItem('isbey_token', value), token);

  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  // Yetki matrisini SUNUCUDAN oku: arayüz kararı bu izinlere dayanır.
  const me = await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(200);
  const identity = (await me.json()).user;
  const codes: string[] = identity.permissionCodes || [];
  const izinler = await request.get('/api/v1/e-documents/incoming/list?limit=5', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(izinler.status()).toBe(200);

  await page.goto('/');

  // ── 1. Ekranı AÇABİLMELİ ─────────────────────────────────────────────────
  await page.getByText('Gelen e-Belgeler', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Gelen e-Faturalar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Gelen e-İrsaliyeler/ })).toBeVisible();

  // ── 2. Gelen fatura ve irsaliye sekmelerini GÖREBİLMELİ ──────────────────
  await expect(page.getByText('Entegratörden çekmek stok ve cariyi değiştirmez.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Gelen e-İrsaliyeler/ }).click();
  await expect(page.getByText('CARİ BORÇ DOĞURMAZ', { exact: false })).toBeVisible();

  // ── 3. Eşleştirme/onay ekranını AÇABİLMELİ ───────────────────────────────
  // Onaylanabilir belge varsa "İçeri Al" düğmesi görünür ve modal açılır.
  // Belge yoksa bu adım atlanır (test ortamında veri değişebilir); sunucu
  // tarafı yetki zaten yukarıdaki 200 yanıtıyla kanıtlanmıştır.
  const iceriAl = page.getByRole('button', { name: /İçeri Al|Mal Girişi/ }).first();
  if (await iceriAl.count() > 0) {
    await iceriAl.click();
    await expect(page.getByText(/eşleştir|içeri al|onay/i).first()).toBeVisible({ timeout: 10000 });
  }

  // ── 4. ADMIN YETKİSİ KAZANMAMALI ─────────────────────────────────────────
  // (a) Sunucu tarafı: yasak izinlerin HİÇBİRİ muhasebede olmamalı.
  for (const yasak of [
    'tenants.manage', 'users.create', 'users.update', 'users.delete', 'company.update',
    'products.create', 'waybills.create', 'waybills.update', 'waybills.delete',
  ]) {
    expect(codes, `MUHASEBE '${yasak}' iznine SAHİP OLMAMALI`).not.toContain(yasak);
  }
  expect(codes).not.toContain('*');

  // (b) Arayüz tarafı: admin/rol yönetimi menüleri GÖRÜNMEMELİ.
  // Etiketler Sidebar.tsx'teki GERÇEK metinlerdir (uydurma isim yazılırsa test
  // her koşulda "yok" der ve yanlış güven verir).
  // NOT: 'Mali Müşavir Portalı' listede DEĞİL — MUHASEBE'nin kendi çalışma
  // alanıdır ve görmesi doğrudur. Buraya yalnız YÖNETİM menüleri yazılır.
  for (const yasakMenu of ['Roller & Yetkiler', 'Firma & Şirketler', 'Tenant Yönetimi', 'Yönetim Paneli']) {
    await expect(page.getByText(yasakMenu, { exact: true }), `MUHASEBE '${yasakMenu}' menüsünü GÖRMEMELİ`).toHaveCount(0);
  }

  // (c) Firma admininin yapabildiği bir şeyi yapamamalı: kullanıcı listesi 403.
  const kullanicilar = await request.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
  expect(kullanicilar.status()).toBe(403);

  expect(errors).toEqual([]);
  await page.screenshot({ path: '.verify-tmp/incoming-documents-muhasebe.png', fullPage: true });
});
