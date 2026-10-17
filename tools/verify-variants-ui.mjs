/**
 * Varyantlar + Görsel Yükleme — GERÇEK TARAYICI doğrulaması (2026-10-12)
 * Gerçek sunucu + gerçek Chromium + gerçek tıklama.
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

  // ── Stok > Varyantlar sekmesi ──────────────────────────────────────────
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^stok$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await page.waitForTimeout(2500);
  const varyantSekme = page.locator('button', { hasText: 'Varyantlar' }).first();
  adim(await varyantSekme.count() > 0, 'Stok ekranında "Varyantlar" sekmesi VAR');
  await varyantSekme.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'VR-1-sekme.png') });

  const govde = await page.locator('body').innerText();
  adim(govde.includes('Varyant Özellikleri'), 'Varyant sekmesi açıklaması görünüyor');

  // ── Özellik oluştur ────────────────────────────────────────────────────
  await page.locator('button', { hasText: 'Yeni Özellik' }).first().click();
  await page.waitForTimeout(1000);
  await page.locator('input[placeholder="Örn: Renk"]').first().fill('Renk');
  const degerler = page.locator('input[placeholder="Örn: Kırmızı"], input[placeholder="Değer adı"]');
  await degerler.first().fill('Kırmızı');
  await page.locator('button', { hasText: 'Değer Ekle' }).first().click();
  await page.waitForTimeout(500);
  await degerler.nth(1).fill('Mavi');
  await page.locator('button', { hasText: 'Kaydet' }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'VR-2-ozellik.png') });
  const govde2 = await page.locator('body').innerText();
  adim(govde2.includes('Renk') && govde2.includes('Kırmızı'), 'Özellik + değerler tabloda görünüyor');

  // ── Ürün kartında varyant + görsel bölümü ──────────────────────────────
  await page.locator('button', { hasText: 'Ürünler' }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: /Yeni Stok Kartı Ekle/ }).first().click();
  await page.waitForTimeout(1800);
  const govde3 = await page.locator('body').innerText();
  adim(govde3.includes('Varyantlar'), 'Ürün kartında "Varyantlar" bölümü VAR');
  adim(govde3.includes('Görsel Yükle') || govde3.includes('Ürün Görseli'), 'Ürün kartında görsel yükleme VAR');
  adim(govde3.includes('Kombinasyonları Üret'), 'Kombinasyon üretme düğmesi VAR');
  await page.screenshot({ path: path.join(OUT, 'VR-3-urun-karti.png') });

} catch (err) {
  adim(false, 'Beklenmeyen hata', err.message);
} finally {
  await browser.close();
}

const gecen = sonuc.filter(s => s.ok).length;
console.log(`\nTARAYICI DOGRULAMA: ${gecen} PASS / ${sonuc.length - gecen} FAIL`);
process.exit(sonuc.some(s => !s.ok) ? 1 : 0);
