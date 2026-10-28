#!/usr/bin/env node
/**
 * İŞBEY — DAĞITIM KİMLİĞİ GİRİŞİ (sohbete/loga YAZMADAN)
 * ======================================================
 * Amaç: yeni GitHub token'ını (ve istenirse SSH parolasını) kullanıcıdan
 * ALMAK, diske yazmak ve YALNIZ "çalışıyor / çalışmıyor" bilgisini basmak.
 * Token'ın kendisi hiçbir zaman ekrana, loga veya git'e yazılmaz.
 *
 * SINIR (2026-10-20): dosya 0600 ile yazılır AMA bu yalnız POSIX'te gerçek
 * bir erişim kısıtıdır. Windows'ta Node `chmod` DOS ACL üretmez; orada
 * "0600" görmek dosyanın başkasınca okunamayacağını KANITLAMAZ. Yani bu araç
 * bir kasa değil, "token'ı sohbete yapıştırmamak" için bir kanaldır. Asıl
 * koruma: kısa ömür (30 gün) + dar kapsam (tek depo, Contents: RW) + `clear`.
 * Windows'ta gerçek denetim için: icacls "%USERPROFILE%\.isbey-deploy.env"
 *
 * Kullanım:
 *   node tools/deploy-credentials.mjs set     # gizli giriş (ekranda görünmez)
 *   node tools/deploy-credentials.mjs test    # yazma yetkisini SINA (push --dry-run)
 *   node tools/deploy-credentials.mjs status  # yalnız "var / yok" + parmak izi
 *   node tools/deploy-credentials.mjs clear   # dosyayı sil
 *
 * NEDEN BU YOL: eski kimlikler iki kez sohbet çıktısında göründü. Bundan
 * sonra kimlik SOHBETE HİÇ GİRMEZ; doğrudan makinedeki dosyaya yazılır.
 * Dosya `.gitignore` dışında değildir — kullanıcı ana dizininde tutulur:
 *   ~/.isbey-deploy.env
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * KİMLİK DOSYASININ YERİ — 2026-10-21 düzeltmesi
 * ==============================================
 * Varsayılan: `~/.isbey-deploy.env`.
 *
 * SORUN (ölçüldü): ajan ayrı bir Linux sanal makinesinde çalışıyor ve
 * `os.homedir()` orada `/sessions/...` dönüyor — kullanıcının Windows
 * profilini (`C:\Users\<ad>`) GÖREMİYOR. Kullanıcı `set` ile kimliği
 * `C:\Users\<ad>\.isbey-deploy.env` dosyasına yazdığında dosya oluşuyor
 * ama ajan onu okuyamıyor; push sessizce imkânsız kalıyordu.
 *
 * ÇÖZÜM: `ISBEY_DEPLOY_ENV` ortam değişkeni ile dosya yolu AÇIKÇA
 * verilebilir. Ajanın görebildiği tek yer proje klasörüdür; bu yüzden
 * `.verify-tmp/` (gitignore'da) altına yazılır.
 *
 *   PowerShell:  $env:ISBEY_DEPLOY_ENV = "D:\İŞBEY\.verify-tmp\deploy.env"
 *   bash:        ISBEY_DEPLOY_ENV=... node tools/deploy-credentials.mjs set
 *
 * GÜVENLİK: dosya yolu değişse de içerik kuralları aynıdır — kimlik hiçbir
 * çıktıya basılmaz, `status` yalnız parmak izi verir. Yol `set` çıktısında
 * AÇIKÇA yazılır ki kullanıcı nereye yazdığını görsün.
 */
const ENV_PATH = process.env.ISBEY_DEPLOY_ENV
  ? path.resolve(process.env.ISBEY_DEPLOY_ENV)
  : path.join(os.homedir(), '.isbey-deploy.env');
const REPO = 'https://github.com/isbeycloud/isbey.git';
const BRANCH = 'release/p0-tenant-depo';

function mask(value) {
  if (!value) return '(yok)';
  // Parmak izi: kimliği ele vermez, yalnız "aynı mı / değişti mi" sorusunu yanıtlar.
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)}…`;
}

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1);
  }
  return out;
}

/**
 * Gizli satır okuma: yazılan karakterler ekrana BASILMAZ.
 *
 * ── 2026-10-22'de ÖLÇÜLEN KUSUR (bu fonksiyonun ilk sürümü) ──────────────
 * `rl._writeToOutput` TAMAMEN susturulmuştu. Windows PowerShell'de bu, SORU
 * METNİNİ de yutuyor: kullanıcı üç boş satır görüyor, ne yazacağını bilmiyor
 * ve boş Enter'lara basıyor → "token boş — hiçbir şey yazılmadı".
 * Yani gizlilik sağlanmıştı ama araç KULLANILAMAZ hâle gelmişti.
 *
 * DÜZELTME: readline'ın yankısını susturmaya devam ediyoruz, ama KENDİ
 * yazdığımız soru metnine dokunmuyoruz. Ayrıca `rl.close()` çağrısı
 * `_writeToOutput` üzerinden çalıştığı için soru satırı silinebiliyordu;
 * bu yüzden satır sonu AÇIKÇA ve close'tan SONRA yazılıyor.
 *
 * Kabul ölçütü: kullanıcı her adımda SORUYU görür, yazdığını GÖRMEZ.
 */
function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    });
    // Yalnız KARAKTER yankısını sustur; soru metni bizim yazdığımız.
    rl._writeToOutput = function (str) {
      // readline'ın kendi yankıladığı içerik prompt + yazılan karakterlerdir.
      // prompt'u biz yazdığımız için burada hiçbir şey basmıyoruz.
      void str;
    };
    process.stdout.write(question);
    rl.question('', answer => {
      // Önce satırı bitir, SONRA kapat — close() yankıyı temizlerken
      // soru satırını da silmesin.
      process.stdout.write('\n');
      rl.close();
      resolve(String(answer).trim());
    });
  });
}

function writeEnv(vars) {
  const lines = [
    '# İŞBEY dağıtım kimlikleri — BU DOSYAYI COMMIT ETME, SOHBETE YAPIŞTIRMA.',
    '# Üreten: tools/deploy-credentials.mjs.',
    '# NOT: 0600 yalnız POSIX iznidir. Windows\'ta erişim kısıtı KANITLANMAMIŞTIR.',
    ...Object.entries(vars).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`),
  ];
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', { mode: 0o600 });
  try { fs.chmodSync(ENV_PATH, 0o600); } catch { /* Windows'ta kısıtlı olabilir */ }
}

function setCmd() {
  console.log('Yeni kimlikleri girin. Yazdıklarınız EKRANDA GÖRÜNMEZ ve');
  console.log('sohbete/loga yazılmaz. Boş bırakılan alan korunur.\n');
  const cur = readEnv();
  return (async () => {
    console.log('  (Yazdıklarınız görünmez. Her alandan sonra Enter.)\n');
    const user = await askHidden('1/3  GitHub kullanıcı adı [boş = korunur]:\n     > ');
    const token = await askHidden('2/3  GitHub token (fine-grained, contents:write) [boş = korunur]:\n     > ');
    const sshPass = await askHidden('3/3  SSH parolası [boş = korunur, gerekmiyorsa boş geçin]:\n     > ');
    const next = {
      ISBEY_GIT_USERNAME: user || cur.ISBEY_GIT_USERNAME || '',
      ISBEY_GIT_TOKEN: token || cur.ISBEY_GIT_TOKEN || '',
      ISBEY_SSH_PASSWORD: sshPass || cur.ISBEY_SSH_PASSWORD || '',
    };
    if (!next.ISBEY_GIT_TOKEN) {
      console.error('\nHATA: token boş — hiçbir şey yazılmadı.');
      return 2;
    }
    writeEnv(next);
    console.log(`\nYazıldı: ${ENV_PATH}`);
    console.log(`  GitHub kullanıcı : ${next.ISBEY_GIT_USERNAME || '(boş)'}`);
    console.log(`  GitHub token     : ${mask(next.ISBEY_GIT_TOKEN)}`);
    console.log(`  SSH parolası     : ${next.ISBEY_SSH_PASSWORD ? mask(next.ISBEY_SSH_PASSWORD) : '(yok)'}`);
    console.log('\nŞimdi doğrulayın:  node tools/deploy-credentials.mjs test');
    return 0;
  })();
}

/**
 * PANODAN OKUMA — 2026-10-22
 * ==========================
 * NEDEN: `set` komutunun gizli girişi Windows PowerShell'de ÖLÇÜLEN biçimde
 * çalışmadı. Kullanıcı üç soruyu arka arkaya basılmış ve HEPSİ BOŞ dönmüş
 * hâlde gördü ("HATA: token boş"). Soruların görünür olması düzelmişti ama
 * stdin gerçek terminalde boş okuma veriyordu — yani etkileşimli yol bu
 * ortamda güvenilir değil.
 *
 * ÇÖZÜM: etkileşimi tamamen kaldır. Token zaten kullanıcının PANOSUNDA
 * (GitHub'da üretip kopyaladı). Bu komut panoyu okur, doğrular, dosyaya
 * yazar. Ekranda hiçbir şey sorulmaz, token basılmaz.
 *
 *   PowerShell:  Get-Clipboard | Set-Clipboard          # token zaten panoda
 *                node tools/deploy-credentials.mjs set-pano
 *
 * GÜVENLİK: pano içeriği HİÇBİR çıktıya yazılmaz. Yalnız "panoda token var
 * mı, biçimi doğru mu, sha256 parmak izi ne" bilgisi basılır. Hatalı panoda
 * (boş, çok kısa, satır sonu dışı boşluk) yazma YAPILMAZ.
 */
function panoOku() {
  // PowerShell: Get-Clipboard ; macOS: pbpaste ; Linux: xclip/wl-paste
  const denemeler = process.platform === 'win32'
    ? [['powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw']]]
    : process.platform === 'darwin'
      ? [['pbpaste', []]]
      : [['wl-paste', ['--no-newline']], ['xclip', ['-selection', 'clipboard', '-o']]];

  for (const [cmd, args] of denemeler) {
    const r = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 15000 });
    if (r.status === 0 && typeof r.stdout === 'string' && r.stdout.trim()) {
      return { metin: r.stdout.trim(), kaynak: cmd };
    }
  }
  return { metin: '', kaynak: null };
}

function setPanoCmd() {
  const { metin, kaynak } = panoOku();
  if (!metin) {
    console.error('HATA: pano okunamadı ya da boş. Token\'ı kopyalayıp tekrar deneyin.');
    console.error('      (Desteklenen: Windows PowerShell panosu, pbpaste, wl-paste, xclip)');
    return 2;
  }
  // Biçim denetimi: yalnız GitHub token önekleri. Yanlış pano (ör. bir URL)
  // sessizce kimlik olarak yazılmasın.
  if (!/^(ghp_|github_pat_|gho_|ghs_|ghu_)/.test(metin)) {
    console.error('HATA: panodaki metin GitHub token biçiminde değil.');
    console.error(`      Beklenen önek: ghp_ / github_pat_ …  (gelen: ${metin.slice(0, 4)}…, ${metin.length} karakter)`);
    console.error('      Panoya YANLIŞ şey kopyalanmış olabilir; yazma YAPILMADI.');
    return 2;
  }
  if (/\s/.test(metin)) {
    console.error('HATA: panodaki token boşluk/satır sonu içeriyor — kopyalama bozulmuş.');
    console.error('      Yazma YAPILMADI.');
    return 2;
  }
  const cur = readEnv();
  const next = {
    ISBEY_GIT_USERNAME: cur.ISBEY_GIT_USERNAME || '',
    ISBEY_GIT_TOKEN: metin,
    ISBEY_SSH_PASSWORD: cur.ISBEY_SSH_PASSWORD || '',
  };
  writeEnv(next);
  console.log(`Pano kaynağı   : ${kaynak}`);
  console.log(`Yazıldı        : ${ENV_PATH}`);
  console.log(`  GitHub token : ${mask(metin)} (${metin.length} karakter, biçim DOĞRU)`);
  if (!next.ISBEY_GIT_USERNAME) {
    console.log('  NOT: GitHub kullanıcı adı boş. `gitEnv` bunu "x-access-token" ile');
    console.log('       değiştirir; fine-grained token için bu genelde yeterlidir.');
  }
  console.log('\nŞimdi doğrulayın:  node tools/deploy-credentials.mjs test');
  return 0;
}

function gitEnv() {
  const env = readEnv();
  if (!env.ISBEY_GIT_TOKEN) {
    console.error('Kimlik yok: önce `node tools/deploy-credentials.mjs set`');
    return null;
  }
  // Token URL'e GÖMÜLMEZ (process listesinde görünür). Bunun yerine
  // GIT_ASKPASS yardımcı betiği kullanılır: token yalnız yardımcının
  // ortamında yaşar ve hiçbir çıktıya basılmaz.
  const askpass = path.join(os.tmpdir(), `isbey-askpass-${process.pid}.sh`);
  fs.writeFileSync(askpass, [
    '#!/bin/sh',
    'case "$1" in',
    '  *sername*) printf "%s" "$ISBEY_GIT_USERNAME" ;;',
    '  *) printf "%s" "$ISBEY_GIT_TOKEN" ;;',
    'esac',
  ].join('\n'), { mode: 0o700 });
  return {
    askpass,
    env: {
      ...process.env,
      GIT_ASKPASS: askpass,
      GIT_TERMINAL_PROMPT: '0',
      ISBEY_GIT_USERNAME: env.ISBEY_GIT_USERNAME || 'x-access-token',
      ISBEY_GIT_TOKEN: env.ISBEY_GIT_TOKEN,
    },
  };
}

function testCmd() {
  const g = gitEnv();
  if (!g) return 2;
  try {
    // Okuma herkese açık olabilir; bu yüzden YAZMA yetkisi sınanır:
    // push --dry-run gerçek bir aktarım yapmaz, yalnız yetkiyi ölçer.
    const r = spawnSync('git', ['push', '--dry-run', REPO, `HEAD:refs/heads/${BRANCH}`], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      env: g.env, encoding: 'utf-8', timeout: 120000,
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    // Çıktıyı basmadan önce kimlik sızmasın diye yalnız sınıflandırma yapılır.
    if (/could not read Username|Authentication failed|403|401|Permission to .* denied/i.test(out)) {
      console.log('SONUÇ: YETKİ YOK — token geçersiz veya contents:write izni yok.');
      console.log('(Ayrıntı basılmadı; token çıktıya karışmasın.)');
      return 3;
    }
    if (r.status === 0) {
      console.log('SONUÇ: YETKİ VAR — push --dry-run başarılı (hiçbir şey gönderilmedi).');
      return 0;
    }
    console.log(`SONUÇ: BELİRSİZ — git çıkış kodu ${r.status}. Ayrıntı basılmadı.`);
    return 4;
  } finally {
    try { fs.unlinkSync(g.askpass); } catch { /* yoksa sorun değil */ }
  }
}

function statusCmd() {
  const env = readEnv();
  const has = k => (env[k] ? 'VAR' : 'YOK');
  console.log(`dosya            : ${ENV_PATH} ${fs.existsSync(ENV_PATH) ? '(mevcut)' : '(yok)'}`);
  if (fs.existsSync(ENV_PATH)) {
    const mode = (fs.statSync(ENV_PATH).mode & 0o777).toString(8);
    // DİKKAT: `mode` Windows'ta POSIX izni DEĞİLDİR. Node'un fs.chmod'u orada
    // yalnız salt-okunur bayrağını çevirir; DOS ACL üretmez. Yani "600" görmek
    // "başkası okuyamaz" demek DEĞİLDİR (2026-10-20: kullanıcı bu varsayımı
    // açıkça sorguladı). Ekranda bunu "doğru" diye onaylamak SAHTE güvence olur.
    if (process.platform === 'win32') {
      console.log(`izin             : ${mode} — Windows'ta POSIX izni DEĞİL, erişim `
        + 'denetimi DOĞRULANMADI (bkz. icacls)');
    } else {
      console.log(`izin             : ${mode} ${mode === '600' ? '(doğru)' : '(0600 ÖNERİLİR)'}`);
    }
  }
  console.log(`GitHub kullanıcı : ${has('ISBEY_GIT_USERNAME')}`);
  console.log(`GitHub token     : ${env.ISBEY_GIT_TOKEN ? mask(env.ISBEY_GIT_TOKEN) : 'YOK'}`);
  console.log(`SSH parolası     : ${env.ISBEY_SSH_PASSWORD ? mask(env.ISBEY_SSH_PASSWORD) : 'YOK'}`);
  // Token biçimi hakkında TEK bir ipucu bile basılmaz.
  return 0;
}

function clearCmd() {
  if (!fs.existsSync(ENV_PATH)) { console.log('Silinecek dosya yok.'); return 0; }
  // Üzerine yazıp sonra sil (dosya sistemi kalıntısı bırakmamak için).
  try {
    const size = fs.statSync(ENV_PATH).size;
    fs.writeFileSync(ENV_PATH, crypto.randomBytes(size));
  } catch { /* yazılamıyorsa yine de silmeyi dene */ }
  fs.unlinkSync(ENV_PATH);
  console.log('Kimlik dosyası SİLİNDİ.');
  return 0;
}

const cmd = process.argv[2] || 'status';
const handlers = {
  set: setCmd,
  // 2026-10-22: etkileşimsiz yol. PowerShell'de gizli giriş ölçülen biçimde
  // çalışmadığı için eklendi; token panodan okunur, ekrana basılmaz.
  'set-pano': setPanoCmd,
  test: testCmd,
  status: statusCmd,
  clear: clearCmd,
};
if (!handlers[cmd]) {
  console.error('Kullanım: node tools/deploy-credentials.mjs [set|set-pano|test|status|clear]');
  console.error('  set-pano : token\'ı PANODAN okur (PowerShell\'de önerilen yol)');
  process.exit(2);
}
Promise.resolve(handlers[cmd]()).then(code => { process.exitCode = code ?? 0; });
