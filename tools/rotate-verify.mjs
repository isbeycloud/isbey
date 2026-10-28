#!/usr/bin/env node
/**
 * İŞBEY — KİMLİK ROTASYONU SONRASI DOĞRULAMA
 * ===========================================
 * NEDEN VAR
 * ---------
 * Rotasyonun "yapıldı" sayılması için iki şey AYRI AYRI kanıtlanmalı:
 *   1. YENİ kimlik ÇALIŞIYOR.
 *   2. ESKİ kimlik ARTIK ÇALIŞMIYOR.
 * İkincisi atlanırsa "iptal ettim" bir inanca dönüşür. Bu araç ikisini de
 * ölçer ve yalnız sınıflandırma basar — hiçbir kimlik değeri çıktıya yazılmaz.
 *
 * ESKİ KİMLİKLER NEREDEN OKUNUR
 * -----------------------------
 * Rotasyon sırasında `host.txt`/`hostinger.txt` silinebilir. Bu yüzden eski
 * değerlerin PARMAK İZLERİ (sha256 ilk 16) ayrı bir dosyada tutulur:
 *   `tools/.eski-kimlik-parmak-izleri.json`  (git'e GİRMEZ, .gitignore'da)
 * Parmak izi kimliği ele vermez; yalnız "aynı değer mi" sorusunu yanıtlar.
 *
 * KULLANIM
 *   node tools/rotate-verify.mjs parmak-izlerini-yaz        # bir kez, rotasyondan ÖNCE
 *   node tools/rotate-verify.mjs dogrula                    # rotasyondan SONRA
 *
 * `dogrula` her eski GitHub token'ı için TEK bir salt-okunur `/user` çağrısı
 * yapar. Yazma, kapsam değişikliği, repo erişimi YOKTUR.
 *
 * SSH tarafı: parola ile kimlik doğrulama denemesi YAPILMAZ (başarısız deneme
 * hesabı kilitleyebilir / log gürültüsü üretir). Bunun yerine kullanıcı yeni
 * parolayla `ssh` bağlantısını kendisi kurar; araç bunu bir kontrol listesi
 * maddesi olarak hatırlatır.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IZ_DOSYASI = path.join(KOK, 'tools', '.eski-kimlik-parmak-izleri.json');
const KAYNAKLAR = ['host.txt', 'hostinger.txt'];

const fp = v => crypto.createHash('sha256').update(v, 'utf8').digest('hex').slice(0, 16);

/**
 * Kaynak dosyalardan kimlik ADAYLARINI çıkarır. Değer asla basılmaz.
 * Biçimler: `<Etiket><TAB><değer>`, `<Etiket>: <değer>`, ve tek başına token
 * satırları (`ghp_…`, `github_pat_…`).
 */
function adaylariTopla() {
  const out = [];
  for (const ad of KAYNAKLAR) {
    const yol = path.join(KOK, ad);
    if (!fs.existsSync(yol)) continue;
    for (const satir of fs.readFileSync(yol, 'utf8').split(/\r?\n/)) {
      const s = satir.trim();
      if (!s || s.startsWith('#')) continue;
      if (/^(ghp_|github_pat_|gho_|ghs_|ghu_)/.test(s)) {
        out.push({ tur: 'github_token', deger: s, kaynak: ad });
        continue;
      }
      if (satir.includes('\t')) {
        const [etiket, ...geri] = satir.split('\t');
        const deger = geri.join('\t').trim();
        if (!deger) continue;
        const e = etiket.trim().toLowerCase();
        const tur = e.includes('şifre') || e.includes('sifre') ? 'ssh_pass'
          : e.includes('kullanıcı') || e.includes('kullanici') ? 'ssh_user' : 'other';
        out.push({ tur, deger, kaynak: ad });
        continue;
      }
      const m = satir.match(/^\s*(Şifre|Sifre|Kullanıcı adı|Kullanici adi|IP|Adres|Bağlantı noktası)\s*:\s*(\S.*)$/i);
      if (m) {
        const e = m[1].toLowerCase();
        const tur = e.startsWith('şifre') || e.startsWith('sifre') ? 'ssh_pass'
          : e.startsWith('kullanıcı') || e.startsWith('kullanici') ? 'ssh_user'
            : e === 'ip' ? 'host' : e === 'adres' ? 'url' : 'port';
        out.push({ tur, deger: m[2].trim(), kaynak: ad });
      }
    }
  }
  return out;
}

async function parmakIzleriniYaz() {
  const adaylar = adaylariTopla();
  if (!adaylar.length) {
    console.error('Kaynak dosyada kimlik bulunamadı (host.txt / hostinger.txt).');
    return 2;
  }
  const kayitlar = [];
  const gorulen = new Set();
  for (const a of adaylar) {
    const iz = fp(a.deger);
    if (gorulen.has(iz)) continue;
    gorulen.add(iz);
    // Yalnız YÜKSEK ENTROPİLİ olanlar (parola/token) rotasyon doğrulamasına girer.
    // IP/kullanıcı adı/port rotasyonun konusu değildir ama kayda geçer.
    kayitlar.push({ iz, tur: a.tur, uzunluk: a.deger.length, kaynaklar: [a.kaynak] });
  }
  fs.writeFileSync(IZ_DOSYASI, JSON.stringify({
    olusturuldu: new Date().toISOString(),
    not: 'Eski kimliklerin sha256 ilk 16 hanesi. Kimliğin KENDİSİ burada YOK.',
    kimlikler: kayitlar,
  }, null, 2), { mode: 0o600 });
  console.log(`Parmak izi dosyası yazıldı: ${path.relative(KOK, IZ_DOSYASI)}`);
  for (const k of kayitlar) console.log(`  ${k.iz}  ${k.tur.padEnd(14)} uzunluk=${k.uzunluk}`);
  console.log('\nŞimdi rotasyonu yapın. Ardından: node tools/rotate-verify.mjs dogrula');
  return 0;
}

async function dogrula() {
  if (!fs.existsSync(IZ_DOSYASI)) {
    console.error('Parmak izi dosyası yok. Önce: node tools/rotate-verify.mjs parmak-izlerini-yaz');
    return 2;
  }
  const izler = JSON.parse(fs.readFileSync(IZ_DOSYASI, 'utf8')).kimlikler;
  const tokenlar = izler.filter(k => k.tur === 'github_token');

  // ── 0) ESKİ DEĞER YOKSA "İPTAL EDİLDİ" DEME ──────────────────────────────
  // 2026-10-21'de ölçülen kusur: kullanıcı `host.txt`/`hostinger.txt` dosyalarını
  // sildiğinde eski değerler ortadan kalkıyor, araç bunları "diskte yok" diye
  // raporluyor ve canlılık sınaması atlanıyordu. Sonuç: "ROTASYON DOĞRULANDI"
  // hükmü, token'lar hâlâ geçerliyken ÇIKABİLİRDİ. Dosyanın silinmiş olması
  // iptal KANITI DEĞİLDİR; yalnız GitHub'ın 401'i kanıttır.
  //
  // Çözüm: elinde eski token DEĞERİ yoksa "bilinmiyor" say ve DOĞRULANMADI
  // hükmü ver. Kullanıcı yeni aracı çalıştırmadan önce değeri bir kez
  // kaydetmeli (`parmak-izlerini-yaz`), ya da GitHub ayarlarından token'ın
  // "last used" bilgisine bakmalıdır.
  const degerler0 = new Map();
  for (const a of adaylariTopla()) degerler0.set(fp(a.deger), a.deger);
  const sinanamayan = tokenlar.filter(k => !degerler0.has(k.iz));
  if (sinanamayan.length) {
    console.log('── 0) SINANAMAYAN ESKİ TOKEN ──');
    for (const k of sinanamayan) {
      console.log(`  ?  ${k.iz} değeri bulunamadı → İPTAL EDİLDİĞİ KANITLANAMAZ`);
    }
    console.log('  Bu token\'lar için "iptal edildi" DEMEK İÇİN: GitHub → Settings →');
    console.log('  Developer settings → token listesinde kaydın ARTIK OLMAMASI gerekir.');
    console.log('  Kayıt listede yoksa iptal edilmiştir; varsa geçerlidir.\n');
  }

  // ── 1) Eski değerler hâlâ diskte mi? ──────────────────────────────────────
  // Sızıntı diskte duruyorsa "iptal edildi" olsa bile yeni bir ifşa riski sürer.
  const mevcut = new Map(adaylariTopla().map(a => [fp(a.deger), a.tur]));
  console.log('── 1) ESKİ DEĞERLER HÂLÂ DİSKTE Mİ? ──');
  let diskteKalan = 0;
  for (const k of izler) {
    if (!['github_token', 'ssh_pass'].includes(k.tur)) continue;
    if (mevcut.has(k.iz)) { diskteKalan++; console.log(`  ⚠️  ${k.iz} (${k.tur}) HÂLÂ DİSKTE`); }
    else console.log(`  ✓  ${k.iz} (${k.tur}) diskte yok`);
  }

  // ── 2) Eski token'lar öldü mü? ────────────────────────────────────────────
  console.log('\n── 2) ESKİ GITHUB TOKEN\'LARI ÖLDÜ MÜ? ──');
  const degerler = degerler0;
  let yasayan = 0;
  for (const k of tokenlar) {
    const deger = degerler.get(k.iz);
    if (!deger) {
      // Yukarıdaki "0)" bölümünde zaten raporlandı; burada SAYILMAZ ama
      // DOĞRULANMADI hükmüne girer (aşağıdaki `sinanamayan` ile toplanır).
      continue;
    }
    try {
      const r = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${deger}`, 'User-Agent': 'isbey-rotate-verify', Accept: 'application/vnd.github+json' },
      });
      if (r.status === 401) console.log(`  ✓  ${k.iz} GEÇERSİZ (iptal edilmiş)`);
      else if (r.status === 200) { yasayan++; console.log(`  ❌ ${k.iz} HÂLÂ GEÇERLİ — rotasyon YAPILMAMIŞ`); }
      else console.log(`  ?  ${k.iz} HTTP ${r.status} — belirsiz`);
    } catch (e) {
      console.log(`  ?  ${k.iz} sorgu hatası: ${e.message}`);
    }
  }

  // ── 3) Sonuç ──────────────────────────────────────────────────────────────
  console.log('\n── 3) SSH PAROLASI ──');
  console.log('  Deneme YAPILMADI (başarısız deneme hesabı kilitleyebilir).');
  console.log('  Kontrol: yeni parolayla `ssh` ile bağlanın; ESKİ parolayla');
  console.log('  bağlanmayı DENEYİN — reddedilmelidir. Sonucu siz teyit edin.');

  console.log('\n── SONUÇ ──');
  if (sinanamayan.length) {
    console.log(`  ⛔ ROTASYON DOĞRULANAMADI: ${sinanamayan.length} eski token'ın değeri yok,`);
    console.log('     iptal edildiği KANITLANAMAZ. GitHub token listesinden teyit edin.');
    return 4;
  }
  if (yasayan === 0 && diskteKalan === 0) {
    console.log('  ROTASYON DOĞRULANDI: eski token\'lar geçersiz, eski değerler diskte yok.');
    console.log('  (SSH parolası yukarıdaki elle kontrole bağlıdır.)');
    return 0;
  }
  console.log(`  ROTASYON TAMAMLANMADI: ${yasayan} token hâlâ geçerli/bilinmiyor, ${diskteKalan} değer diskte.`);
  return 3;
}

const komut = process.argv[2];
if (komut === 'parmak-izlerini-yaz') process.exit(await parmakIzleriniYaz());
else if (komut === 'dogrula') process.exit(await dogrula());
else {
  console.log('Kullanım:');
  console.log('  node tools/rotate-verify.mjs parmak-izlerini-yaz   # rotasyondan ÖNCE');
  console.log('  node tools/rotate-verify.mjs dogrula                # rotasyondan SONRA');
  process.exit(2);
}
