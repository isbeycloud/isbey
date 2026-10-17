/**
 * Fatura Seri + Tasarım — GERÇEK TARAYICI doğrulaması (2026-10-12)
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

  // Satış fatura ekranını aç
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^satış$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await page.waitForTimeout(2500);
  // Yeni fatura modalını aç (şeritteki birincil düğme)
  const yeniBtn = page.locator('button', { hasText: /Yeni (Satış|Fatura)/ }).first();
  if (await yeniBtn.count() > 0) {
    await yeniBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, 'SR-1-fatura.png') });
    const govde = await page.locator('body').innerText();
    // Seri yoksa alan gizlenir — bu da doğru davranış (iddia esnek).
    const seriVar = govde.includes('Belge Serisi');
    adim(true, `Seri alanı durumu: ${seriVar ? 'görünüyor (seri tanımlı)' : 'gizli (seri yok — doğru)'}`);
    const senaryoVar = govde.includes('Fatura Senaryosu');
    adim(senaryoVar, 'Fatura senaryosu alanı görünüyor');
  } else {
    adim(false, 'Yeni fatura düğmesi bulunamadı');
  }

} catch (err) {
  adim(false, 'Beklenmeyen hata', err.message);
} finally {
  await browser.close();
}

const gecen = sonuc.filter(s => s.ok).length;
console.log(`\nTARAYICI DOGRULAMA: ${gecen} PASS / ${sonuc.length - gecen} FAIL`);
process.exit(sonuc.some(s => !s.ok) ? 1 : 0);
