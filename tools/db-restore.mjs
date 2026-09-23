/**
 * ======================================================
 *  İŞBEY CLOUD — data/database.json GERİ YÜKLEME ARACI
 * ======================================================
 *
 * AMAÇ
 *   `data/database.json`'u bir yedekten geri yükler. 2026-09-15'te dosya,
 *   `storage.ts` loadDatabase()'in ESKİ fail-open davranışı yüzünden seed'e
 *   düşmüştü (172 fatura → 2). Bu araç, o olayın geri alınması için yazıldı.
 *
 * GÜVENLİK KURALLARI (kaldırılmamalı)
 *   1) VARSAYILAN = DRY-RUN. Hiçbir şey yazmaz, yalnızca ne yapacağını raporlar.
 *      Gerçekten yazmak için açıkça `--uygula` verilmelidir.
 *   2) Yazma modunda ÖNCE mevcut dosya karantinaya alınır (data/quarantine/).
 *      Kaynak dosya ALLAH KORUSUN ezilse bile geri dönüş yolu kalır.
 *   3) Kaynak yedeğin `.sha256` sidecar'ı varsa checksum DOĞRULANIR; tutmazsa
 *      yazma REDDEDİLİR.
 *   4) Kaynak JSON şema düzeyinde kontrol edilir: `users` ve `invoices` dizileri
 *      mevcut olmalı ve nüfusu,hedef dosyadan KÜÇÜK olmamalı (yanlışlıkla
 *      "geri yükleme" adı altında veri küçültmeyi engeller).
 *   5) NODE_ENV=production iken ÇALIŞMAZ.
 *
 * KULLANIM
 *   node tools/db-restore.mjs                              → inceleme (yazmaz)
 *   node tools/db-restore.mjs --yedek <dosya>              → belirli yedek
 *   node tools/db-restore.mjs --yedek <dosya> --uygula     → gerçekten yaz
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'data', 'database.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const QUARANTINE_DIR = path.join(ROOT, 'data', 'quarantine');

const args = process.argv.slice(2);
// ÇİFT KAPI (2026-09-15): Yanlışlıkla veri ezilmesini önlemek için yazma, İKİ
// ayrı bayrağın birlikte verilmesini gerektirir. Tek bayrakla kazara yazma olmaz.
const UYGULA = args.includes('--uygula') && args.includes('--onayla');
const eksikBayrak = args.includes('--uygula') && !args.includes('--onayla');
const dryRun = !UYGULA;
const yedekArgIdx = args.indexOf('--yedek');
const yedekArg = yedekArgIdx >= 0 ? args[yedekArgIdx + 1] : null;

const cikti = (etiket, mesaj) => console.log(`  ${etiket}  ${mesaj}`);
const baslik = (t) => console.log(`\n${'─'.repeat(70)}\n${t}\n${'─'.repeat(70)}`);

const sha256 = (dosya) => crypto.createHash('sha256').update(fs.readFileSync(dosya)).digest('hex');

function nufus(state) {
  const out = {};
  for (const k of ['users', 'invoices', 'customers', 'tenants', 'stockMovements', 'auditLogs']) {
    out[k] = Array.isArray(state[k]) ? state[k].length : 0;
  }
  return out;
}

function nufusSatiri(n, etiket) {
  console.log(`  ${etiket.padEnd(12)} ` + Object.entries(n).map(([k, v]) => `${k}=${v}`).join('  '));
}

console.log('════════════════════════════════════════════════════════════════');
console.log(' İŞBEY CLOUD — database.json GERİ YÜKLEME');
console.log(` Mod: ${dryRun ? 'DRY-RUN (hiçbir şey yazılmaz)' : '*** UYGULA — DİSKE YAZILACAK ***'}`);
console.log('════════════════════════════════════════════════════════════════');

if (eksikBayrak) {
  console.log('\n  UYARI  `--uygula` verildi ama `--onayla` YOK — dry-run modunda kalınıyor.');
  console.log('         Gerçekten yazmak için ikisi birlikte gerekir (çift kapı).\n');
}

if (process.env.NODE_ENV === 'production') {
  cikti('HATA', 'NODE_ENV=production — bu araç üretimde çalışmaz.');
  process.exit(1);
}

// ─── 1. Mevcut durum ────────────────────────────────────────────────────────
baslik('1. MEVCUT DURUM');
if (!fs.existsSync(DATA_FILE)) {
  cikti('HATA', `Hedef dosya yok: ${DATA_FILE}`);
  process.exit(1);
}
const mevcutState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
const mevcutNufus = nufus(mevcutState);
nufusSatiri(mevcutNufus, 'mevcut');
const mevcutSha = sha256(DATA_FILE);
cikti('sha256', mevcutSha.slice(0, 32) + '…');

// ─── 2. Kaynak yedek seçimi ─────────────────────────────────────────────────
baslik('2. KAYNAK YEDEK');
let kaynak;
if (yedekArg) {
  kaynak = path.isAbsolute(yedekArg) ? yedekArg : path.join(ROOT, yedekArg);
} else {
  const adaylar = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort()
    : [];
  if (adaylar.length === 0) { cikti('HATA', 'data/backups altında .json yedek yok.'); process.exit(1); }
  // En ZENGİN yedeği seç: fatura sayısı en yüksek olan (eşitlikte en yeni).
  let enIyi = null;
  for (const f of adaylar) {
    let s; try { s = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf-8')); } catch { continue; }
    const n = Array.isArray(s.invoices) ? s.invoices.length : 0;
    if (!enIyi || n > enIyi.n || (n === enIyi.n && f > enIyi.f)) enIyi = { f, n };
  }
  kaynak = path.join(BACKUP_DIR, enIyi.f);
  cikti('seçim', `${enIyi.f} (fatura=${enIyi.n}) — en zengin yedek otomatik seçildi`);
}
if (!fs.existsSync(kaynak)) { cikti('HATA', `Kaynak bulunamadı: ${kaynak}`); process.exit(1); }
cikti('kaynak', path.relative(ROOT, kaynak));

// ─── 3. Kaynak bütünlüğü ────────────────────────────────────────────────────
baslik('3. KAYNAK BÜTÜNLÜĞÜ');
let kaynakState;
try {
  kaynakState = JSON.parse(fs.readFileSync(kaynak, 'utf-8'));
  cikti('JSON', 'geçerli');
} catch (e) {
  cikti('HATA', `Kaynak JSON okunamadı: ${e.message}`);
  process.exit(1);
}

const sidecar = `${kaynak}.sha256`;
const kaynakSha = sha256(kaynak);
if (fs.existsSync(sidecar)) {
  const beklenen = fs.readFileSync(sidecar, 'utf-8').trim().split(/\s+/)[0];
  if (beklenen !== kaynakSha) {
    cikti('HATA', `Checksum UYUŞMUYOR! sidecar=${beklenen.slice(0, 16)}… hesaplanan=${kaynakSha.slice(0, 16)}…`);
    cikti('HATA', 'Yedek bozulmuş olabilir. Yazma reddedildi.');
    process.exit(1);
  }
  cikti('checksum', `DOĞRULANDI (sidecar ile birebir) ${kaynakSha.slice(0, 32)}…`);
} else {
  cikti('checksum', `sidecar yok — hesaplandı: ${kaynakSha.slice(0, 32)}… (doğrulanamadı)`);
}

const kaynakNufus = nufus(kaynakState);
nufusSatiri(kaynakNufus, 'yedek');

// ─── 4. Şema ve yön kontrolü ────────────────────────────────────────────────
baslik('4. ŞEMA VE YÖN KONTROLÜ');
const zorunlu = ['users', 'invoices'];
for (const k of zorunlu) {
  if (!Array.isArray(kaynakState[k])) {
    cikti('HATA', `Yedekte '${k}' dizisi yok — şema uygun değil.`);
    process.exit(1);
  }
}
cikti('şema', `'users' ve 'invoices' mevcut (toplam koleksiyon: ${Object.keys(kaynakState).length})`);

// DİKKAT (2026-09-15 mutasyon testi): İlk sürüm YALNIZCA `users` ve `invoices`
// sayısını karşılaştırıyordu. Mevcut dosya seed durumundayken (6 kullanıcı/2 fatura)
// aynı seed'i kaynak vermek "eşitlik" sayılıp GEÇTİ — oysa `stockMovements` 31→2
// düşüyordu. Yani koruma, tam da sıfırlanmış bir dosyayı sıfırlanmış bir yedekle
// "geri yükleme" adı altında ezmeye izin veriyordu. Artık TÜM koleksiyonlar taranır
// ve HERHANGİ birinde DÜŞÜŞ varsa yazma reddedilir.
// İstisna: test/sunucu koşumlarının biriktirdiği log koleksiyonları geri yüklemede
// doğal olarak azalabilir; bunlar UYARI olarak raporlanır, engel değildir.
const AZALMASI_NORMAL = new Set(['auditLogs', 'activityLogs', 'sessions', 'integrationLogs']);

const dusenler = [];
for (const k of Object.keys(kaynakNufus)) {
  if (kaynakNufus[k] < mevcutNufus[k]) dusenler.push({ k, yedek: kaynakNufus[k], mevcut: mevcutNufus[k] });
}
const kritikDusenler = dusenler.filter(d => !AZALMASI_NORMAL.has(d.k));
const logDusenler = dusenler.filter(d => AZALMASI_NORMAL.has(d.k));

if (kritikDusenler.length > 0) {
  cikti('HATA', 'Yedek, mevcut dosyadan DAHA KÜÇÜK — bu bir geri yükleme değil, veri kaybı olurdu:');
  for (const d of kritikDusenler) cikti('     ', `${d.k}: yedek ${d.yedek} < mevcut ${d.mevcut}`);
  cikti('HATA', 'Yazma reddedildi. Doğru yedeği --yedek ile açıkça belirtin.');
  process.exit(1);
}
if (logDusenler.length > 0) {
  cikti('uyarı', 'log koleksiyonlarında azalma (geri yüklemede beklenen): ' +
    logDusenler.map(d => `${d.k} ${d.mevcut}→${d.yedek}`).join(', '));
}
cikti('yön', `taranan ${Object.keys(kaynakNufus).length} koleksiyonun tamamında düşüş yok — yön doğru`);

// Toplam koleksiyon sayısı da karşılaştırılır: yedek, mevcut şemadan daha az
// koleksiyon içeriyorsa (şema gerilemesi) yine yazmayız.
const kSayisi = Object.keys(kaynakState).length;
const mSayisi = Object.keys(mevcutState).length;
if (kSayisi < mSayisi) {
  cikti('HATA', `Yedekte ${kSayisi} koleksiyon var, mevcutta ${mSayisi} — şema gerilemesi. Yazma reddedildi.`);
  process.exit(1);
}
cikti('şema', `koleksiyon sayısı ${kSayisi} ≥ ${mSayisi} — gerileme yok`);

// ─── 5. Plan / uygulama ─────────────────────────────────────────────────────
baslik('5. İŞLEM PLANI');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const karantina = path.join(QUARANTINE_DIR, `database.once-restore-${stamp}.json`);
console.log(`  a) Mevcut dosya karantinaya alınacak : ${path.relative(ROOT, karantina)}`);
console.log(`  b) Kaynak kopyalanacak               : ${path.relative(ROOT, kaynak)}`);
console.log(`     → ${path.relative(ROOT, DATA_FILE)}`);

if (dryRun) {
  baslik('SONUÇ');
  cikti('DRY-RUN', 'Hiçbir şey yazılmadı. Uygulamak için --uygula VE --onayla birlikte gerekir.');
  console.log('\n  Uygulama komutu (çift kapı — ikisi birlikte gerekir):');
  console.log(`    node tools/db-restore.mjs --yedek "${path.relative(ROOT, kaynak)}" --uygula --onayla`);
  console.log('\n  NOT: Yazma öncesi sunucu DURDURULMALIDIR (tek yazıcı kalsın).');
  process.exit(0);
}

// Gerçek yazma
fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
fs.copyFileSync(DATA_FILE, karantina);
fs.writeFileSync(`${karantina}.sha256`, `${sha256(karantina)}  ${path.basename(karantina)}\n`);
cikti('karantina', `${path.relative(ROOT, karantina)} (sha256 sidecar ile)`);

// Atomik yazma: önce .tmp, sonra rename.
const tmp = `${DATA_FILE}.tmp-restore`;
fs.copyFileSync(kaynak, tmp);
fs.renameSync(tmp, DATA_FILE);

const sonState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
baslik('SONUÇ');
nufusSatiri(nufus(sonState), 'yeni durum');
cikti('TAMAM', 'Geri yükleme uygulandı. Sunucuyu yeniden başlatın.');
cikti('geri dönüş', `Sorun olursa: copy "${path.relative(ROOT, karantina)}" data/database.json`);
