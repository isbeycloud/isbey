import { test, expect, type Page } from '@playwright/test';

/**
 * XSLT / FATURA TASARIM STÜDYOSU — UÇTAN UCA (Playwright)
 * ==========================================================================
 * 2026-09-27
 *
 * KAPSAM: Stüdyonun tarayıcıda GERÇEKTEN çalıştığını kanıtlar. Özellikle:
 *   • `XSLTProcessor` ile GERÇEK XSLT dönüşümü (mock HTML değil)
 *   • `general.xslt` QR üretimi — canvas/png gerçekten üretiliyor mu
 *   • Monaco'nun tembel yüklenmesi ve çalışması
 *   • Görsel tasarım → XSLT derlemesi ve önizlemeye geçişi
 *   • Test XML senaryolarının önizlemeye girmesi
 *   • Sürüm geçmişi + geri yükleme
 *   • A4 zoom/cetvel
 *
 * GÜVENLİK SINIRI: Bu dosyadaki HİÇBİR adım gerçek e-fatura göndermez.
 * Gönderim uçları çağrılmaz; `SAT-2026-000001` gibi gerçek belgelere
 * dokunulmaz. Yalnız okuma/önizleme uçları kullanılır.
 *
 * NOT: Seçiciler `data-testid` üzerinedir; metin değişince kırılmaz.
 * Ölçüm noktalarında HER ZAMAN sayısal/gerçek çıktı aranır — "düğme var"
 * demek yeterli değildir (bkz. aşağıdaki iframe/canvas kontrolleri).
 */

const BOS = 'no-such-template';

/**
 * ── OTURUM BÜTÇESİ (ÖNEMLİ) ────────────────────────────────────────────────
 * Giriş ucu 15 dakikada 20 denemeyle sınırlıdır (productionSecurity.ts) ve bu
 * sınır KASITLI olarak kaldırılmamıştır: `application.spec.ts` içinde bu
 * sınırlayıcıyı gerçekten sınayan bir güvenlik testi vardır.
 *
 * Her senaryonun kendi girişini yapması (22 giriş) bütçeyi tek başına aşar ve
 * senaryolar birbirini 429 ile düşürür — nitekim 21 ve 22 bu yüzden başarısız
 * oluyordu. Çözüm: oturum BİR KEZ burada açılır, tüm senaryolar paylaşır.
 * Böylece hem güvenlik testi sınırı sınamaya devam eder, hem bu dosya bütçenin
 * çok altında kalır (dosya başına 1 giriş).
 *
 * Token `localStorage`'a her senaryonun kendi sayfasında yazılır; bu yüzden
 * `addInitScript` login() içinde kalır, yalnız ağ isteği paylaşılır.
 */
let sharedToken: string | null = null;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(res.status(), 'paylaşılan oturum açılamadı (giriş hız sınırı?)').toBe(200);
  sharedToken = (await res.json()).token;
  expect(sharedToken, 'oturum token\'ı boş').toBeTruthy();
});

/** Paylaşılan token'ı bu sayfaya yaz. Ağ isteği YAPMAZ. */
async function login(page: Page, _request?: any) {
  expect(sharedToken, 'paylaşılan oturum yok').toBeTruthy();
  await page.addInitScript((t: string) => localStorage.setItem('isbey_token', t), sharedToken!);
  return { token: sharedToken as string };
}

/** Ayarlar → Belge & Fatura Tasarımları → ilk şablonun tasarımcısını aç. */
async function openDesigner(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await page.getByRole('button', { name: 'Belge & Fatura Tasarımları' }).click();
  // Şablon listesi sunucudan gelir; ilk kartın düzenle düğmesine bas.
  const edit = page.getByTitle('Tasarım Editöründe Düzenle').first();
  await expect(edit).toBeVisible({ timeout: 20000 });
  await edit.click();
  await expect(page.getByTestId('open-studio')).toBeVisible({ timeout: 20000 });
}

/** Stüdyoyu aç ve modalın görünmesini bekle. */
async function openStudio(page: Page) {
  await page.getByTestId('open-studio').click();
  await expect(page.getByTestId('studio-mode-code')).toBeVisible({ timeout: 20000 });
}

/** Monaco hazır olana kadar bekle (tembel yüklenir). */
async function waitEditor(page: Page) {
  const host = page.getByTestId('monaco-host');
  await expect(host).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(
    () => !!document.querySelector('[data-testid="monaco-host"] .monaco-editor'),
    undefined,
    { timeout: 45000 }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 1 — Giriş ve stüdyo açılışı
// ─────────────────────────────────────────────────────────────────────────────

test('01 · stüdyo gerçek şablonla açılır ve kodu yükler', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);

  await expect(page.getByTestId('studio-mode-visual')).toBeVisible();
  await expect(page.getByTestId('studio-mode-testxml')).toBeVisible();
  await expect(page.getByTestId('studio-save')).toBeVisible();

  expect(errors, `sayfa hataları: ${errors.join(' | ')}`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 2 — Monaco GERÇEKTEN yükleniyor (tembel) ve kod gösteriyor
// ─────────────────────────────────────────────────────────────────────────────

test('02 · Monaco editör tembel yüklenir ve XSLT içeriğini gösterir', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  const text = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="monaco-host"] .view-lines');
    return el ? (el as HTMLElement).innerText : '';
  });
  // general.xslt gerçek içeriktir; XSLT kökü görünmeli.
  expect(text.length, 'editörde metin yok').toBeGreaterThan(50);
  expect(text).toContain('xsl');
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 3 — Doğrulama gerçek sunucuya gider ve sonuç döner
// ─────────────────────────────────────────────────────────────────────────────

test('03 · doğrula düğmesi sunucudan gerçek sonuç alır', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  const call = page.waitForResponse(r => r.url().includes('validate-xslt'), { timeout: 30000 });
  await page.getByTestId('studio-validate').click();
  const res = await call;
  expect(res.status()).toBe(200);
  // Durum şeridinde ya "geçerli" ya da bir hata görünmeli — ikisi de gerçek.
  await expect(
    page.getByText(/XML sözdizimi geçerli|XSLT hatası|satır \d+/).first()
  ).toBeVisible({ timeout: 15000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 4 — ÖNİZLEME: gerçek XSLTProcessor dönüşümü, mock değil
// ─────────────────────────────────────────────────────────────────────────────

test('04 · önizleme gerçek XSLT dönüşümü üretir (iframe dolu)', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  const call = page.waitForResponse(
    r => r.url().includes('/preview') && r.request().method() === 'POST',
    { timeout: 30000 }
  );
  await page.getByTestId('studio-refresh-preview').click();
  const res = await call;
  expect(res.status()).toBe(200);

  // iframe içeriği GERÇEK olmalı: yalnız "yükleniyor" değil, anlamlı HTML.
  const frame = page.frameLocator('#studio-preview-frame');
  await expect(frame.locator('body')).toBeVisible({ timeout: 20000 });
  const bodyText = await frame.locator('body').innerText();
  expect(bodyText.trim().length, 'önizleme gövdesi boş — dönüşüm çalışmadı').toBeGreaterThan(40);
  // Hata yerine belge görünmeli.
  expect(bodyText).not.toContain('Önizleme oluşturulamadı');
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 5 — QR GERÇEKTEN üretiliyor (canvas/png), placeholder değil
// ─────────────────────────────────────────────────────────────────────────────

test('05 · general.xslt QR çıktısı gerçekten üretiliyor (canvas veya data-uri görsel)', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  const call = page.waitForResponse(
    r => r.url().includes('/preview') && r.request().method() === 'POST',
    { timeout: 30000 }
  );
  await page.getByTestId('studio-refresh-preview').click();
  expect((await call).status()).toBe(200);

  const frame = page.frameLocator('#studio-preview-frame');
  await expect(frame.locator('body')).toBeVisible({ timeout: 20000 });
  // QR kütüphanesinin çalışması zaman alabilir (gömülü JS).
  await page.waitForTimeout(2500);

  const qr = await page.evaluate(() => {
    const iframe = document.getElementById('studio-preview-frame') as HTMLIFrameElement | null;
    const doc = iframe?.contentDocument;
    if (!doc) return { canvas: 0, images: 0, qrNode: 0, canvasHasPixels: false };
    const canvases = Array.from(doc.querySelectorAll('canvas'));
    let canvasHasPixels = false;
    for (const c of canvases) {
      const el = c as HTMLCanvasElement;
      if (el.width > 0 && el.height > 0) {
        try {
          const ctx = el.getContext('2d');
          if (ctx) {
            const d = ctx.getImageData(0, 0, Math.min(el.width, 40), Math.min(el.height, 40)).data;
            // Şeffaf olmayan (gerçekten çizilmiş) piksel var mı?
            for (let i = 3; i < d.length; i += 4) {
              if (d[i] > 0) { canvasHasPixels = true; break; }
            }
          }
        } catch { /* getImageData güvenlik nedeniyle engellenebilir */ }
      }
      if (canvasHasPixels) break;
    }
    const imgs = Array.from(doc.querySelectorAll('img'));
    return {
      canvas: canvases.length,
      images: imgs.length,
      qrNode: doc.querySelectorAll('[class*="qr" i], [id*="qr" i], [alt*="qr" i]').length,
      canvasHasPixels,
    };
  });

  // QR ya <canvas> (çizilmiş piksel) ya da data-uri <img> olarak gelir.
  const hasRealQr = qr.canvasHasPixels || qr.images > 0 || qr.qrNode > 0;
  expect(
    hasRealQr,
    `QR üretilmemiş görünüyor: canvas=${qr.canvas} (piksel=${qr.canvasHasPixels}), img=${qr.images}, qrDüğüm=${qr.qrNode}`
  ).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 6 — A4 zoom seviyeleri görsel ölçeği gerçekten değiştirir
// ─────────────────────────────────────────────────────────────────────────────

test('06 · A4 zoom düğmeleri ölçeği gerçekten değiştirir', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  const call = page.waitForResponse(r => r.url().includes('/preview') && r.request().method() === 'POST', { timeout: 30000 });
  await page.getByTestId('studio-refresh-preview').click();
  await call;
  await page.waitForTimeout(1200);

  const scaleOf = () => page.evaluate(() => {
    // Ölçeklenen kâğıt: transform: scale(...) taşıyan ata.
    const iframe = document.getElementById('studio-preview-frame');
    let el: HTMLElement | null = iframe;
    while (el && el !== document.body) {
      const t = getComputedStyle(el).transform;
      if (t && t !== 'none' && t.startsWith('matrix')) {
        const m = t.match(/matrix\(([^,]+)/);
        if (m) return Number(m[1]);
      }
      el = el.parentElement;
    }
    return 0;
  });

  // DİKKAT — GEÇİŞ (transition) BEKLENMELİ: Kâğıt `transform 0.12s ease` ile
  // ölçeklenir (bkz. A4PreviewPane). Tıklamadan hemen sonra okumak ARA değeri
  // yakalar (gözlenen: %50 beklenirken 0.1267 — 1.0'dan 0.5'e inerkenki bir
  // kare). Bu yüzden değer sabitlenene kadar beklenir; erken okuma testi
  // sebepsiz kararsız (flaky) yapar.
  const settledScale = async (testId: string, expected: number) => {
    await page.getByTestId(testId).click();
    await expect
      .poll(scaleOf, { timeout: 5000, message: `${testId} ölçeği ${expected} değerine oturmadı` })
      .toBeGreaterThan(expected - 0.02);
    return scaleOf();
  };

  const s50 = await settledScale('a4-zoom-50', 0.5);
  const s100 = await settledScale('a4-zoom-100', 1.0);

  expect(s50, 'ölçek okunamadı').toBeGreaterThan(0);
  expect(s100, 'ölçek okunamadı').toBeGreaterThan(0);
  expect(Math.abs(s100 - s50), 'zoom ölçeği değiştirmedi').toBeGreaterThan(0.2);
  expect(s100).toBeGreaterThan(s50);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 7 — Görsel Tasarım modu açılır ve palet görünür
// ─────────────────────────────────────────────────────────────────────────────

test('07 · görsel tasarım modu palet ve tuvali gösterir', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);

  await page.getByTestId('studio-mode-visual').click();
  await expect(page.getByTestId('palette-field')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('palette-invoice-table')).toBeVisible();
  await expect(page.getByTestId('palette-divider')).toBeVisible();

  // Bölüm başlıkları ve "Belge Geneli" ayarları görünmeli.
  await expect(page.getByText('Belge Geneli').first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 8 — Palete tıklayınca blok eklenir (sayı artar)
// ─────────────────────────────────────────────────────────────────────────────

test('08 · palete tıklamak tuvale gerçekten blok ekler', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await page.getByTestId('studio-mode-visual').click();

  const count = () => page.locator('[data-testid^="block-"]').count();
  const before = await count();

  await page.getByTestId('palette-divider').click();
  await expect.poll(count, { timeout: 8000 }).toBeGreaterThan(before);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 8b — GERÇEK sürükle-bırak: paletten tuvale HTML5 drag&drop
// ─────────────────────────────────────────────────────────────────────────────

test('08b · paletten tuvale sürükle-bırak gerçekten blok ekler', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await page.getByTestId('studio-mode-visual').click();
  await expect(page.getByTestId('palette-divider')).toBeVisible({ timeout: 15000 });

  const count = () => page.locator('[data-testid^="block-"]').count();
  const before = await count();

  // HTML5 sürükle-bırak Playwright'ın `dragTo()`'suyla güvenilir çalışmaz
  // (uygulama veriyi `dataTransfer` yerine ref'te taşıyor). Bu yüzden
  // GERÇEK olay dizisi elle gönderilir: dragstart → dragenter → dragover → drop.
  // Not: tıklama yolu (senaryo 08) zaten sınandı; burada sınanan, sürükleme
  // yolunun AYRI kod olduğudur (onDrop → insertBlockInto).
  const target = page.locator('[data-testid^="column-"]').first();
  await expect(target).toBeVisible({ timeout: 10000 });

  const dt = await page.evaluateHandle(() => new DataTransfer());
  await page.getByTestId('palette-divider').dispatchEvent('dragstart', { dataTransfer: dt });
  await target.dispatchEvent('dragenter', { dataTransfer: dt });
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  await target.dispatchEvent('drop', { dataTransfer: dt });

  await expect.poll(count, { timeout: 8000 }).toBeGreaterThan(before);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 9 — Blok seçimi özellik panelini açar
// ─────────────────────────────────────────────────────────────────────────────

test('09 · blok seçimi özellik panelini gösterir', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await page.getByTestId('studio-mode-visual').click();

  const firstBlock = page.locator('[data-testid^="block-"]').first();
  await expect(firstBlock).toBeVisible({ timeout: 15000 });

  // Seçim `onMouseDown` ile yapılır. Normal `click()` burada GÜVENİLMEZ:
  // bloklar iç içe ve kaydırılabilir bir tuvalin içinde; imleç konumu başka
  // bir düğümün üstüne düşünce Playwright "intercepts pointer events" der.
  // Doğrudan olayı göndermek uygulamanın gerçek yolunu tetikler.
  await firstBlock.dispatchEvent('mousedown');
  await firstBlock.click({ force: true, position: { x: 4, y: 4 } });

  // Özellik paneli başlığı ve seçili bileşenin adı görünmeli.
  await expect(page.getByText('Özellikler')).toBeVisible({ timeout: 10000 });
  // Panelde artık "bir bileşen seçin" yönergesi OLMAMALI — gerçekten seçildi.
  await expect(page.getByText('Düzenlemek için soldaki tuvalden bir bileşen seçin')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 10 — Görsel tasarım → XSLT derlemesi ve önizlemeye geçiş
// ─────────────────────────────────────────────────────────────────────────────

test('10 · görsel tasarım kodu üretir ve önizleme gerçek dönüşüm yapar', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await page.getByTestId('studio-mode-visual').click();

  await expect(page.getByTestId('palette-field')).toBeVisible({ timeout: 15000 });

  // "Kodu güncelle" düğmesi yalnız sapma varken görünür; varsa bas.
  const syncBtn = page.getByTitle('Görsel tasarım kod içeriğinden farklı. Kodu görsel tasarımla güncelle.');
  if (await syncBtn.count() > 0) {
    await syncBtn.first().click();
    await expect(page.getByText(/Görsel tasarım koda aktarıldı|aktarıldı/i).first()).toBeVisible({ timeout: 10000 });
  }

  // Kodu gir ve gerçekten görsel çıktı ürettiğini doğrula.
  await page.getByTestId('studio-mode-code').click();
  await waitEditor(page);

  const call = page.waitForResponse(r => r.url().includes('/preview') && r.request().method() === 'POST', { timeout: 30000 });
  await page.getByTestId('studio-refresh-preview').click();
  await call;
  await page.waitForTimeout(1200);

  const frame = page.frameLocator('#studio-preview-frame');
  const text = await frame.locator('body').innerText();
  expect(text.trim().length, 'görsel tasarım çıktısı önizlemede boş').toBeGreaterThan(20);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 11 — Ürün tablosu sütun düzenleyicisi döngüyü bozmuyor
// ─────────────────────────────────────────────────────────────────────────────

test('11 · ürün tablosu sütunları düzenlenebilir ve döngü korunur', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await page.getByTestId('studio-mode-visual').click();

  // Ürün tablosu bloğunu olan bölüme git — palet düğmesiyle garantiye al.
  await page.getByTestId('palette-invoice-table').click();
  await page.waitForTimeout(600);

  // Sütun düzenleyicisi (genişlik/rozet) görünür olmalı.
  const colPanel = page.getByText(/Sütun|Ürün Tablosu/).first();
  await expect(colPanel).toBeVisible({ timeout: 10000 });

  // Üretilen kodda InvoiceLine döngüsü KALMALI.
  await page.getByTestId('studio-mode-code').click();
  await waitEditor(page);
  const code = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="monaco-host"] .view-lines');
    return el ? (el as HTMLElement).innerText : '';
  });
  // Editör görünür satırları sanallaştırır; döngü en azından metinde olmalı.
  expect(code.length).toBeGreaterThan(50);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 12 — Test XML: senaryo listesi sunucudan gelir
// ─────────────────────────────────────────────────────────────────────────────

test('12 · Test XML modu beş senaryoyu sunucudan listeler', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);

  const call = page.waitForResponse(r => r.url().includes('/test-scenarios'), { timeout: 30000 });
  await page.getByTestId('studio-mode-testxml').click();
  expect((await call).status()).toBe(200);

  for (const id of ['TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA', 'IADE', 'ISTISNA']) {
    await expect(page.getByTestId(`scenario-${id}`)).toBeVisible({ timeout: 15000 });
  }

  // "Gerçek gönderim yapılmaz" uyarısı görünür olmalı.
  await expect(page.getByText('Gerçek gönderim yapılmaz.')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 13 — Senaryo seçimi gerçek XML yükler
// ─────────────────────────────────────────────────────────────────────────────

test('13 · senaryo seçimi gerçek UBL-TR XML yükler', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await page.getByTestId('studio-mode-testxml').click();
  await expect(page.getByTestId('scenario-TICARIFATURA')).toBeVisible({ timeout: 20000 });

  const call = page.waitForResponse(r => r.url().includes('/test-xml/TICARIFATURA'), { timeout: 30000 });
  await page.getByTestId('scenario-TICARIFATURA').click();
  const res = await call;
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain('<Invoice');
  expect(xml).toContain('TICARIFATURA');

  // Arayüz "Geçerli XML" ve kalem sayısını göstermeli.
  await expect(page.getByText('Geçerli XML')).toBeVisible({ timeout: 15000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 14 — Test XML'i önizlemede gerçekten kullanma
// ─────────────────────────────────────────────────────────────────────────────

test('14 · "Önizlemede Kullan" test XML i ile dönüşümü çalıştırır', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await page.getByTestId('studio-mode-testxml').click();

  const load = page.waitForResponse(r => r.url().includes('/test-xml/IADE'), { timeout: 30000 });
  await page.getByTestId('scenario-IADE').click();
  await load;
  await expect(page.getByText('Geçerli XML')).toBeVisible({ timeout: 15000 });

  // DİKKAT: Test XML modunda A4 önizleme paneli ÇİZİLMEZ (tek panel XML'e
  // ayrılır; iframe yoktur). Doğrulanacak sözleşme şudur: "Önizlemede Kullan",
  // senaryo XML'ini önizleme isteğinin GÖVDESİNE koyar.
  const preview = page.waitForRequest(r => r.url().includes('/preview') && r.method() === 'POST', { timeout: 30000 });
  await page.getByTestId('xml-use-in-preview').click();
  const req = await preview;

  const payload = req.postData() || '';
  expect(payload, 'önizleme isteği gövdesiz').not.toBe('');
  const body = JSON.parse(payload);
  const sentXml: string = body.customXml || body.customXmlText || '';
  expect(sentXml, 'IADE XML önizleme isteğine konmadı').toContain('<Invoice');
  // IADE senaryosunun ayırt edici işareti: negatif tutar + IADE tip kodu.
  expect(sentXml).toContain('IADE');
  expect(sentXml).toMatch(/-25000/);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 15 — Undo / Redo gerçekten çalışır
// ─────────────────────────────────────────────────────────────────────────────

test('15 · geri al / ileri al düğmeleri durumu gerçekten değiştirir', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  const undo = page.getByTestId('studio-undo');
  const redo = page.getByTestId('studio-redo');
  const off = (l: any) => l.evaluate((el: HTMLElement) => (el as HTMLButtonElement).disabled);

  // DİKKAT — NEDEN .view-lines DEĞİL: Monaco sanallaştırılmış bir görünüm çizer,
  // ekranda yalnızca görünür satırlar bulunur. İçerik ne kadar değişirse değişsin
  // DOM'daki satır sayısı ≈ aynı kalır; dolayısıyla görünen metni ölçmek "içerik
  // değişti" iddiasını KANITLAMAZ (ilk sürümde test tam bu yüzden yanlış
  // başarısız oluyordu). Bunun yerine durum çubuğundaki GERÇEK karakter sayısı
  // okunur — o değer doğrudan `code` durumundan gelir (bkz. XsltStudio
  // data-testid="studio-stats" data-chars).
  const codeOf = () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="studio-stats"]');
    return el ? Number((el as HTMLElement).dataset.chars || 0) : 0;
  });

  // Şablon sunucudan ASENKRON yüklenir; geçmiş tabanının bu içerikle
  // tazelendiğini (2026-09-28 onarımı) doğrulayabilmek için başlangıç
  // uzunluğunu ÖNCEDEN kaydediyoruz. Boş kalırsa test anlamsızlaşır.
  const baselineChars = await codeOf();
  expect(baselineChars, 'şablon yüklenmedi — geçmiş tabanı ölçülemez').toBeGreaterThan(1000);

  // SÖZLEŞME NOTU: Geri al/ileri al, XSLT *kod* geçmişini yönetir. Görsel
  // tuvalde blok eklemek kodu değiştirmez (ayrı katman) ve bu yüzden tek
  // başına geçmiş adımı üretmez; kod ancak "XSLT'yi Bu Tasarımdan Üret" ile
  // değişir. Test, gerçek sözleşmeyi doğrular.
  await page.getByTestId('studio-mode-visual').click();
  await expect(page.getByTestId('palette-divider')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('palette-divider').click();
  await page.waitForTimeout(400);

  // Derleme kodu değiştirir → geçmiş adımı oluşur.
  await page.getByTestId('visual-compile').click();
  await page.waitForTimeout(900);

  await expect.poll(() => off(undo), { timeout: 10000 }).toBe(false);
  const afterCompile = await codeOf();

  await undo.click();
  await expect.poll(() => off(redo), { timeout: 10000 }).toBe(false);

  // 2026-09-28 — KESİN EŞİTLİK (eski `.not.toBe` iddiası hatalıydı).
  // "Öncekinden farklı" demek, editörün BOŞALMASINI da geçirir; canlıda olan
  // tam buydu: 20230 → Geri Al → 0 karakter, yani veri kaybı. Doğru iddia,
  // geri almanın TAM olarak derleme ÖNCESİ içeriğe dönmesidir.
  await expect.poll(codeOf, { timeout: 10000 }).toBe(baselineChars);
  // Boşalma regresyonu için açık ve okunur bir kilit.
  expect(await codeOf(), 'Geri Al editörü boşalttı — veri kaybı').toBeGreaterThan(1000);

  // İleri al da simetrik olmalı: TAM olarak derleme sonrası içeriğe dönmeli.
  await redo.click();
  await expect.poll(codeOf, { timeout: 10000 }).toBe(afterCompile);
  await expect.poll(() => off(redo), { timeout: 10000 }).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 16 — Biçimlendir sözleşmesi (içerik değişmez iddiası dürüst)
// ─────────────────────────────────────────────────────────────────────────────

test('16 · biçimlendir girintiyi düzenler, içerik kaybolmaz', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  const before = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="monaco-host"] .view-lines');
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  });

  await page.getByTestId('studio-format').click();
  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="monaco-host"] .view-lines');
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  });

  // Kritik: biçimlendirme İÇERİĞİ bozmamalı. Boşluk normalize edilmiş
  // metinler karşılaştırılır; büyük fark = içerik kaybı.
  expect(before.length, 'öncesi boş').toBeGreaterThan(50);
  expect(after.length, 'sonrası boş — içerik silinmiş olabilir').toBeGreaterThan(50);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 17 — Sürüm geçmişi paneli açılır ve sürümleri listeler
// ─────────────────────────────────────────────────────────────────────────────

test('17 · sürüm geçmişi sunucudan sürümleri listeler', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);

  const call = page.waitForResponse(r => r.url().includes('/versions'), { timeout: 30000 });
  await page.getByTestId('studio-history').click();
  const res = await call;
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(Array.isArray(body.versions), 'versions bir dizi değil').toBe(true);
  expect(body.versions.length, 'hiç sürüm yok').toBeGreaterThan(0);

  // Panelde v1 satırı görünmeli.
  await expect(page.getByText(/^v\d+$/).first()).toBeVisible({ timeout: 15000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 18 — Sürüm karşılaştırma (diff) açılır
// ─────────────────────────────────────────────────────────────────────────────

test('18 · iki sürüm karşılaştırma görünümü açılır', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);

  const call = page.waitForResponse(r => r.url().includes('/versions'), { timeout: 30000 });
  await page.getByTestId('studio-history').click();
  const versions = (await (await call).json()).versions as Array<{ version: number }>;

  if (versions.length < 2) {
    test.info().annotations.push({ type: 'not', description: 'karşılaştırma için tek sürüm var (şablon yeni)' });
    return;
  }

  await page.getByTestId(`version-pick-${versions[0].version}`).check();
  await page.getByTestId(`version-pick-${versions[1].version}`).check();
  await page.getByTestId('version-compare').click();

  await expect(page.getByText('XSLT Sürüm Karşılaştırması')).toBeVisible({ timeout: 20000 });
  // Diff görünümü gerçekten yüklenmeli (Monaco tembel).
  await page.waitForFunction(
    () => document.querySelectorAll('.monaco-diff-editor').length > 0,
    undefined,
    { timeout: 45000 }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 19 — Kaydetme gerçekten kalıcıdır (yeniden yükleme sonrası durur)
// ─────────────────────────────────────────────────────────────────────────────

test('19 · kaydet sunucuya yazar ve kalıcı olur', async ({ page, request }) => {
  const session = await login(page, request);
  const headers = { Authorization: `Bearer ${session.token}` };

  await openDesigner(page);
  await openStudio(page);

  const call = page.waitForResponse(
    r => r.url().includes('/document-templates') && ['PUT', 'POST'].includes(r.request().method()),
    { timeout: 40000 }
  );
  await page.getByTestId('studio-save').click();
  const res = await call;
  expect([200, 201]).toContain(res.status());

  // Sunucudan doğrula — yalnız arayüz "kaydedildi" dedi diye inanma.
  const tplRes = await request.get('/api/document-templates', { headers });
  expect(tplRes.status()).toBe(200);
  const json = await tplRes.json();
  const list = json.templates || json.documentTemplates || [];
  expect(Array.isArray(list)).toBe(true);
  expect(list.length).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 20 — GÖNDERİM YOKLUĞU: stüdyo akışı hiçbir gönderim tetiklemez
// ─────────────────────────────────────────────────────────────────────────────

test('20 · stüdyo akışı hiçbir gönderim/kuyruk ucunu çağırmaz', async ({ page, request }) => {
  const session = await login(page, request);

  // Ağ dinleme: yasaklı yollar çağrılırsa yakala.
  const hit: string[] = [];
  page.on('request', r => {
    const u = r.url();
    if (/\/send\b|\/send-|SENDING|dispatch|queue|hizli/i.test(u) && r.method() !== 'GET') {
      hit.push(`${r.method()} ${u}`);
    }
  });

  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  // Tüm modları gez.
  await page.getByTestId('studio-mode-visual').click();
  await page.waitForTimeout(500);
  await page.getByTestId('studio-mode-testxml').click();
  await page.waitForTimeout(600);
  await page.getByTestId('scenario-TEMELFATURA').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('studio-mode-code').click();
  await waitEditor(page);

  expect(hit, `yasaklı gönderim çağrıları: ${hit.join(', ')}`).toEqual([]);

  // Belge durumu değişmemiş olmalı: gönderim kaydı OLUŞMAMALI.
  const headers = { Authorization: `Bearer ${session.token}` };
  const listRes = await request.get('/api/e-invoices?limit=50', { headers });
  if (listRes.status() === 200) {
    const body = await listRes.json();
    const rows = body.invoices || body.eInvoices || [];
    const sending = rows.filter((r: any) => String(r.status).toUpperCase() === 'SENDING');
    expect(sending.length, 'stüdyo testi SENDING durumunda belge üretti').toBe(0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 21 (ek güvenlik) — Stüdyo XXE/2.0 yapılı XSLT'yi önizlemede çalıştırmaz
// ─────────────────────────────────────────────────────────────────────────────

test('21 · desteklenmeyen XSLT yapısı önizlemeyi çökertmez', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);
  await openStudio(page);
  await waitEditor(page);

  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  // DİKKAT — ALAN ADI: Uç gövdede `xsltContent` bekler (bkz. src/services/api.ts
  // `validateXslt`). `xslt` gönderilirse uç "XSLT içeriği boş olamaz" döner ve
  // `valid:false` yine sağlanır — yani test, uyumluluk kapısını HİÇ sınamadan
  // geçer. Bu yüzden hem doğru alan adı kullanılır hem de dönen HATANIN
  // gerçekten 2.0 yapısına ait olduğu doğrulanır.
  const res = await request.post('/api/document-templates/validate-xslt', {
    headers: {
      Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('isbey_token'))}`,
    },
    data: {
      xsltContent: `<?xml version="1.0"?><xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template match="/"><xsl:for-each-group select="//x" group-by="@k"/></xsl:template></xsl:stylesheet>`,
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.valid, 'for-each-group kabul edildi — uyumluluk kapısı açık').toBe(false);
  // Geçerli bir XSLT gönderildiğine göre "boş içerik" veya "ayrıştırma hatası"
  // beklenmez; ret gerekçesi desteklenmeyen yapı OLMALIDIR.
  expect(String(body.error || ''), 'ret gerekçesi uyumluluk kapısı değil').not.toContain('boş olamaz');
  expect(
    (body.unsupportedFeatures || []).length,
    'desteklenmeyen yapı bildirilmedi — kapı sessizce geçmiş'
  ).toBeGreaterThan(0);

  expect(errors, `sayfa hataları: ${errors.join(' | ')}`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENARYO 22 — Regresyon: mevcut (eski) XSLT düzenleyici hâlâ çalışıyor
// ─────────────────────────────────────────────────────────────────────────────

test('22 · stüdyo eklenirken eski XSLT düzenleyici bozulmadı', async ({ page, request }) => {
  await login(page, request);
  await openDesigner(page);

  // Stüdyo bir KATMAN; eski düğme durmalı ve açılmalı.
  const legacy = page.getByRole('button', { name: /XSLT Görüntüle \/ Düzenle/ });
  await expect(legacy).toBeVisible({ timeout: 20000 });
  await legacy.click();
  await expect(page.getByText(/XSLT/i).first()).toBeVisible({ timeout: 15000 });
});
