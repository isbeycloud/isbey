/**
 * İŞBEY CLOUD — Test fixture onarımı (seed kullanıcıları)
 * ======================================================
 * NEDEN VAR:
 *   `server/db/storage.ts` içindeki `loadDatabase()` çoğu koleksiyon için
 *   "DB'de yoksa seed'den doldur" koruması taşır; ancak `users` için bu
 *   koruma YOKTUR (`...parsed` doğrudan kazanır). Sonuç: seed kullanıcıları
 *   bir kez silinirse (ör. bir test/oturum DELETE /api/users/:id çağırdıysa)
 *   bir daha geri gelmez.
 *
 *   Bu durum 2026-08-20'den beri fark edilmeden sürdü: `firmaadmin` (usr-4),
 *   `rapor` (usr-5) ve `pasifkullanici` (usr-6) DB'de yoktu. Bu yüzden
 *   firmaadmin ile giriş yapan suitler (faz252a, izolasyon, security gate,
 *   runtime authz) zincirleme 401 alıyordu.
 *
 * NE YAPAR:
 *   Seed'deki kullanıcılardan, DB'de (ne id ne de username olarak) BULUNMAYANLARI
 *   geri ekler. İdempotenttir: eksik yoksa hiçbir şey yazmaz.
 *
 * GÜVENLİK SINIRLARI:
 *   - NODE_ENV=production ise ÇALIŞMAZ (üretimde silinmiş kullanıcı diriltilmez).
 *   - Yazmadan önce `.verify-tmp/` altına zaman damgalı kopya bırakır.
 *   - Yazma, uygulamanın kendi kalıbıyla aynıdır: JSON.stringify(x, null, 2)
 *     + temp dosyaya yazıp renameSync ile atomik taşıma.
 *
 * KULLANIM (repo kökünden):
 *   node --import tsx tools/ensure-test-fixtures.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'data', 'database.json');
const TMP_DIR = path.join(ROOT, '.verify-tmp');

function cikti(etiket, mesaj) {
  console.log(`${etiket} ${mesaj}`);
}

// ─── Üretim koruması ────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  cikti('FIXTURE-HATA', 'NODE_ENV=production — bu araç üretimde çalışmaz.');
  process.exit(1);
}

if (!fs.existsSync(DATA_FILE)) {
  cikti('FIXTURE-ATLANDI', `data/database.json yok (${DATA_FILE}) — uygulama ilk açılışta seed üretecek.`);
  process.exit(0);
}

// ─── Seed'i yükle (tsx yükleyicisi TS'i doğrudan çözer) ─────────────────────
let seedUsers;
try {
  const seedUrl = pathToFileURL(path.join(ROOT, 'server', 'db', 'seed.ts')).href;
  const seed = await import(seedUrl);
  seedUsers = seed.initialDatabaseState?.users || [];
} catch (e) {
  cikti('FIXTURE-HATA', `seed yüklenemedi: ${e.message}`);
  process.exit(1);
}

if (seedUsers.length === 0) {
  cikti('FIXTURE-HATA', 'seed\'de kullanıcı bulunamadı.');
  process.exit(1);
}

// ─── Mevcut durumu oku ──────────────────────────────────────────────────────
let state;
try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
} catch (e) {
  cikti('FIXTURE-HATA', `database.json okunamadı/parse edilemedi: ${e.message}`);
  process.exit(1);
}

const mevcut = state.users || [];
const eksik = seedUsers.filter(su =>
  !mevcut.some(u => u.id === su.id) &&
  !mevcut.some(u => String(u.username).toLowerCase() === String(su.username).toLowerCase())
);

if (eksik.length === 0) {
  cikti('FIXTURE-OK', `${seedUsers.length} seed kullanıcısının tamamı DB'de mevcut (${mevcut.length} kayıtlı kullanıcı).`);
  process.exit(0);
}

// ─── Yedek + atomik yazma ───────────────────────────────────────────────────
fs.mkdirSync(TMP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const yedek = path.join(TMP_DIR, `fixtures-before-${stamp}.json`);
fs.copyFileSync(DATA_FILE, yedek);

state.users = [...mevcut, ...eksik];

const tempFile = `${DATA_FILE}.tmp-fixture`;
fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
fs.renameSync(tempFile, DATA_FILE);

for (const u of eksik) {
  cikti('FIXTURE-EKLENDI', `${u.id}  ${u.username}  rol=${u.role}  aktif=${u.active}`);
}
cikti('FIXTURE-OK', `${eksik.length} kullanıcı geri eklendi (yedek: ${path.relative(ROOT, yedek)}).`);
process.exit(0);
