/**
 * Fiyat Listeleri — GERÇEK TARAYICI doğrulaması (2026-10-12)
 * Statik doğrulama değil: gerçek sunucu + gerçek Chromium + gerçek tıklama.
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
  // ── Giriş ────────────────────────────────────────────────────────────────
  // Uygulama önce TANITIM sayfasını gösterir; giriş formuna geçmek için
  // "Giriş Yap" düğmesine basmak gerekir (doğrudan /login yolu yok).
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const user = process.env.ADMIN_USER, pass = process.env.ADMIN_PASS;

  await page.locator('button', { hasText: /^Giriş Yap$/ }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'PL-0-giris.png') });

  // Kullanıcı adı alanı `type="text"` (placeholder: "admin veya e-posta").
  const kullanici = page.locator('input[placeholder="admin veya e-posta"]').first();
  adim(await kullanici.count() > 0, 'Giriş formu açıldı (kullanıcı adı alanı var)');
  await kullanici.fill(user);
  const sifre = page.locator('input[type="password"]').first();
  await sifre.fill(pass);
  await page.locator('button', { hasText: /^Giriş Yap$/ }).last().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, 'PL-0b-giris-sonrasi.png') });

  const girisOk = await page.locator('text=Yönetim').count() > 0
    || await page.locator('button', { hasText: /^Stok$/ }).count() > 0;
  adim(girisOk, 'Giriş yapıldı', page.url());

  // ── Ayarlar > Fiyat Listeleri ────────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => /ayarlar/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(2500);

  const fiyatSekmesi = page.locator('button', { hasText: 'Fiyat Listeleri' }).first();
  const sekmeVar = await fiyatSekmesi.count() > 0;
  adim(sekmeVar, 'Ayarlar ekranında "Fiyat Listeleri" sekmesi VAR');
  if (!sekmeVar) throw new Error('Sekme bulunamadı');

  await fiyatSekmesi.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'PL-1-sekme.png') });

  const aciklama = await page.locator('text=Perakende, Toptan, Bayi gibi isimli fiyat listeleri').count();
  adim(aciklama > 0, 'Sekme açıklaması görünüyor (kesilmiyor)');

  // ── Liste oluştur ────────────────────────────────────────────────────────
  await page.locator('button', { hasText: 'Yeni Liste' }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, 'PL-2-modal.png') });

  const adInput = page.locator('input[placeholder="Örn: Toptan"]');
  adim(await adInput.count() > 0, 'Yeni liste modalı açıldı (ad alanı var)');
  await adInput.fill('Toptan');
  await page.locator('input[placeholder="Otomatik: FL-00X"]').fill('FL-TOPTAN');
  await page.locator('button', { hasText: 'Kaydet' }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'PL-3-kaydedildi.png') });

  // Tablo içeriğini bir bütün olarak oku: hücre seçicisine bağlı kalmak
  // kırılgan (DataGrid hücreleri farklı etiketlerle basılıyor).
  const tabloMetni = await page.locator('table, [class*="datagrid"]').first().innerText().catch(() => '');
  const govdeMetni = tabloMetni || await page.locator('body').innerText();
  adim(govdeMetni.includes('Toptan'), 'Yeni liste tabloda görünüyor');
  adim(govdeMetni.includes('FL-TOPTAN'), 'Liste kodu tabloda görünüyor');
  adim(govdeMetni.includes('Varsayılan'), 'İlk liste VARSAYILAN olarak işaretlenmiş');
  adim(govdeMetni.includes('Etkin'), 'Liste "Etkin" durumda');

  // ── Ürün kartında fiyat listesi alanı ────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => /^stok$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'PL-4-stok.png') });

  const yeniUrun = page.locator('button', { hasText: /Yeni (Ürün|Stok)/ }).first();
  if (await yeniUrun.count() > 0) {
    await yeniUrun.click();
    await page.waitForTimeout(1800);
    const listeAlan = await page.locator('text=Satış Fiyat Listeleri').count();
    adim(listeAlan > 0, 'Ürün kartında "Satış Fiyat Listeleri" bölümü VAR');
    const tabanEtiket = await page.locator('text=Taban Satış Fiyatı').count();
    adim(tabanEtiket > 0, 'Ürün kartında "Taban Satış Fiyatı" etiketi VAR');
    await page.screenshot({ path: path.join(OUT, 'PL-5-urun-karti.png') });
  } else {
    adim(false, 'Ürün kartı açma düğmesi bulunamadı');
  }

  // ── Cari kartında fiyat listesi seçimi ───────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => /^cari$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await page.waitForTimeout(2500);
  const yeniCari = page.locator('button', { hasText: /Yeni Cari/ }).first();
  if (await yeniCari.count() > 0) {
    await yeniCari.click();
    await page.waitForTimeout(1800);
    const secim = await page.locator('text=Satış Fiyat Listesi').count();
    adim(secim > 0, 'Cari kartında "Satış Fiyat Listesi" seçimi VAR');
    await page.screenshot({ path: path.join(OUT, 'PL-6-cari-karti.png') });
  } else {
    adim(false, 'Cari kartı açma düğmesi bulunamadı');
  }

} catch (err) {
  adim(false, 'Beklenmeyen hata', err.message);
} finally {
  await browser.close();
}

const gecen = sonuc.filter(s => s.ok).length;
console.log(`\nTARAYICI DOGRULAMA: ${gecen} PASS / ${sonuc.length - gecen} FAIL`);
process.exit(sonuc.some(s => !s.ok) ? 1 : 0);
