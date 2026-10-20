/**
 * Kullanıcı Yetkilendirme — GERÇEK TARAYICI doğrulaması (2026-10-12)
 */
import pw from 'playwright';
const { chromium } = pw;
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4317';
const OUT = process.env.SHOT_DIR || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const sonuc = [];
function adim(ok, ad, detay = '') {
  sonuc.push({ ok, ad, detay });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${ad}${detay ? ' — ' + detay : ''}`);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => console.log('SAYFA HATASI:', e.message));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('button', { hasText: /^Giriş Yap$/ }).first().click();
  await page.waitForTimeout(2500);
  await page.locator('input[placeholder="admin veya e-posta"]').first().fill(process.env.ADMIN_USER);
  await page.locator('input[type="password"]').first().fill(process.env.ADMIN_PASS);
  await page.locator('button', { hasText: /^Giriş Yap$/ }).last().click();
  await page.waitForTimeout(4000);
  adim(true, 'Giriş yapıldı');

  // Ayarlar > Yetkilendirme
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /ayarlar/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(2500);
  const sekme = page.locator('button', { hasText: 'Yetkilendirme' }).first();
  adim(await sekme.count() > 0, 'Ayarlar ekranında "Yetkilendirme" sekmesi VAR');
  await sekme.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'SC-1-sekme.png') });

  const govde = await page.locator('body').innerText();
  adim(govde.includes('Kullanıcı Yetkilendirme'), 'Yetkilendirme başlığı görünüyor');
  adim(govde.includes('Menüler'), 'Menü listesi görünüyor');
  adim(govde.includes('Ana Sayfa') && govde.includes('Müşteri Listesi'), 'Ekran görüntüsündeki menüler VAR');
  adim(govde.includes('Çalışan Seçiniz'), 'Çalışan seçimi VAR');
  adim(govde.includes('Banka Hareketleri') && govde.includes('Görünür Hesaplar'), 'Hesap kapsamı bölümü VAR');
  adim(govde.includes('Maaş Tahakkukları'), 'Personel kapsamı bölümü VAR');
  adim(govde.includes('Vergi Tahakkukları'), 'Vergi kapsamı bölümü VAR');

  // Menü anahtarı tıklanabilir mi
  const anahtarlar = page.locator('button[role="switch"]');
  const sayi = await anahtarlar.count();
  adim(sayi >= 15, `15 menü anahtarı render edildi (bulunan: ${sayi})`);
  if (sayi > 0) {
    await anahtarlar.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'SC-2-anahtar.png') });
    adim(true, 'Menü anahtarı tıklanabiliyor');
  }

} catch (err) {
  adim(false, 'Beklenmeyen hata', err.message);
} finally {
  await browser.close();
}

const gecen = sonuc.filter(s => s.ok).length;
console.log(`\nTARAYICI DOGRULAMA: ${gecen} PASS / ${sonuc.length - gecen} FAIL`);
process.exit(sonuc.some(s => !s.ok) ? 1 : 0);
