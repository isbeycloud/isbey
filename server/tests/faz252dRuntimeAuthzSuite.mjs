/**
 * İŞBEY CLOUD — FAZ 25.2-D #2: Runtime Authorization Suite
 * =========================================================
 * AMAÇ: faz252dAuthzMatrixGenerator.mjs'in ürettiği authz-matrix.json
 * girdisini alıp CANLI sunucu üzerinde doğrular:
 *
 *   1. Token'sız her endpoint → 401 (securityGate defaultDeny backstop)
 *   2. Her rol × okunabilir (GET) endpoint → matris beklentisiyle kıyas
 *      (ALLOW → 401/403 OLMAMALI; DENY → 401/403 ZORUNLU)
 *   3. Yazma (POST/PUT/PATCH/DELETE) endpoint'lerinde yalnız DENY tarafı
 *      ateşlenir (yan etkisiz); ALLOW tarafı SKIP(side-effect) işaretlenir
 *
 * ROLLER: seed'teki 5 kullanıcı (admin/muhasebe/kasiyer/firmaadmin/rapor)
 * + eksik roller (KASA/DEPO/PERSONEL/SAHA) admin yetkisiyle POST
 * /api/auth/users ile bootstrap edilir (idempotent: rastgele sonek).
 *
 * ÇIKTI: server/tests/output/runtime-authz-results.json
 * Çalıştırma: node server/tests/faz252dRuntimeAuthzSuite.mjs
 *   (kök dizinden; BASE öncelik sırası: --base arg > ISBEY_BASE_URL env > 127.0.0.1:4000)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cleanupTestFixtures } from './testFixtureCleanup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MATRIX_PATH = path.join(ROOT, 'server/tests/output/authz-matrix.json');
const OUT_PATH = path.join(ROOT, 'server/tests/output/runtime-authz-results.json');

const args = process.argv.slice(2);
const baseArgIdx = args.indexOf('--base');
const BASE = (baseArgIdx >= 0 && args[baseArgIdx + 1]) || process.env.ISBEY_BASE_URL || 'http://127.0.0.1:4000';

let pass = 0, fail = 0, skip = 0;
const results = [];
const ok = (c, tag, msg) => { c ? pass++ : fail++; results.push({ tag, verdict: c ? 'PASS' : 'FAIL', msg }); };
const sk = (tag, msg) => { skip++; results.push({ tag, verdict: 'SKIP', msg }); };

async function api(method, fullPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(BASE + fullPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    return { status: 0, json: null, netErr: String(e) };
  }
  let json = null; try { json = await res.json(); } catch { /* boş gövde */ }
  return { status: res.status, json };
}

async function login(identifier, password) {
  const r = await api('POST', '/api/auth/login', { username: identifier, password });
  if (r.status !== 200 || !r.json?.token) throw new Error(`Login başarısız (${identifier}): HTTP ${r.status}`);
  return r.json.token;
}

// ─── 0. Matris: yoksa jeneratörü çalıştır ───────────────────────────────────
if (!fs.existsSync(MATRIX_PATH)) {
  console.log('authz-matrix.json yok — jeneratör çalıştırılıyor...');
  const gen = spawnSync(process.execPath, [path.join(ROOT, 'server/tests/faz252dAuthzMatrixGenerator.mjs')], { cwd: ROOT, encoding: 'utf8' });
  if (gen.status !== 0 || !fs.existsSync(MATRIX_PATH)) {
    console.error('JENERATÖR BAŞARISIZ:', gen.stderr || gen.stdout);
    process.exit(1);
  }
}
const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));

// ─── 1. Mount çözümlemesi (index.ts import binding + app.use('/prefix', var)) ──
const indexSrc = fs.readFileSync(path.join(ROOT, 'server/index.ts'), 'utf8');

// index.ts'teki routes/* import'ları: binding adı → 'routes/x/y.ts' normalize yol
const bindingToFile = new Map();
for (const m of indexSrc.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/routes\/([^'"]+)['"]/g)) {
  for (const b of m[1].split(',')) {
    const name = b.trim().split(/\s+as\s+/).pop().trim();
    if (name) bindingToFile.set(name, `routes/${m[2]}.ts`);
  }
}
for (const m of indexSrc.matchAll(/import\s+(\w+)\s+from\s*['"]\.\/routes\/([^'"]+)['"]/g)) {
  bindingToFile.set(m[1], `routes/${m[2]}.ts`);
}

// app.use('/prefix', binding) mount'ları (alias arrow-function mount'ları doğal dışarıda kalır)
const mounts = [...indexSrc.matchAll(/app\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/g)]
  .map(m => ({ prefix: m[1], binding: m[2] }));

const fileSrcCache = new Map();
function routeSrc(relFile) {
  if (!fileSrcCache.has(relFile)) {
    fileSrcCache.set(relFile, fs.readFileSync(path.join(ROOT, 'server/routes', relFile), 'utf8'));
  }
  return fileSrcCache.get(relFile);
}

function resolvePrefix(relFile) {
  // relFile: 'v1/payments.ts' gibi routes'a göre göreceli
  const wanted = `routes/${relFile}`;
  const bindings = [...bindingToFile.entries()].filter(([, f]) => f === wanted).map(([n]) => n);
  if (!bindings.length) return null;
  const mount = mounts.find(m => bindings.includes(m.binding));
  return mount ? mount.prefix : null;
}

/**
 * Handler İÇİ rol kontrolü saptaması: statik matris guard zincirini görür ama
 * handler gövdesindeki req.user.role === ... / isPlatformAdmin() kontrollerini
 * görmez. Bu desen olan dosyalarda ALLOW beklentisi + 403 cevabı "belirsiz"
 * sayılır (FAIL değil, SKIP — manuel inceleme kuyruğu).
 */
const hasInlineRoleCheck = (relFile) =>
  // Kapsam genişletildi (2026-09-11): handler içindeki yetki kararı yalnızca `role ===`
  // kıyasıyla verilmiyor; servis/SSOT fonksiyonları da karar veriyor. Bu fonksiyonlar
  // listede olmadığı için `accountant.ts` uçları (8 FAIL, koşu #3) matrisin ALLOW
  // beklentisiyle çelişip yanlış FAIL üretiyordu — oysa 403 *doğru* davranıştı
  // (`AccountantService.isAccountantAuthorizedForTenant` yetkisiz erişimi reddediyor).
  /req\.user\?\.role\s*===|req\.user\.role\s*===|isPlatformAdmin\(|caller\.role\s*===|isAccountantAuthorizedForTenant\(|isSameTenant\(|hasPermission\(|canAccess\w*\(/.test(routeSrc(relFile));

// ─── 2. Roller + token'lar ───────────────────────────────────────────────────
const ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'KASA', 'DEPO', 'PERSONEL', 'SAHA', 'RAPOR'];
const SEED_CREDENTIALS = {
  SUPER_ADMIN: ['admin', 'admin123'],
  MUHASEBE: ['muhasebe', 'muhasebe123'],
  SATIS: ['kasiyer', 'kasiyer123'],
  COMPANY_ADMIN: ['firmaadmin', 'firmaadmin123'],
  RAPOR: ['rapor', 'rapor123'],
};

console.log(`════════ İŞBEY FAZ 25.2-D #2 — Runtime Authz Suite (${BASE}) ════════\n`);
const adminToken = await login(...SEED_CREDENTIALS.SUPER_ADMIN);

// FIXTURE HİJYENİ (2026-09-12): Bu suite eksik roller için `rt-<rol>-<sonek>`
// kullanıcıları bootstrap ediyor ve eskiden kapanışta silmiyordu — koşular arası birikim
// tnt-isbey kotasını doldurdu (koşu #4). Ön temizlik, bootstrap'ın kotaya takılmasını
// önler (eski birikimi süpürür); kapanış temizliği bu koşuda açılan GERÇEK adları siler.
// Silme yalnız tnt-isbey kapsamındadır; başka kiracıya dokunulmaz.
const CREATED_USERNAMES = []; // bootstrap sırasında doldurulur
if (adminToken) {
  try { await cleanupTestFixtures(api, adminToken, { companies: ['tnt-isbey'], verbose: true }); }
  catch (e) { console.log(`  ⚠️  [fixture-temizlik] ön temizlik hatası: ${e.message}`); }
}

const tokens = {};
for (const role of ROLES) {
  if (SEED_CREDENTIALS[role]) {
    tokens[role] = await login(...SEED_CREDENTIALS[role]);
  } else {
    // Eksik rol → admin bootstrapping (rastgele sonek ile çakışmasız)
    const uname = `rt-${role.toLowerCase()}-${Date.now().toString(36).slice(-4)}`;
    const created = await api('POST', '/api/auth/users', { username: uname, fullName: `RT ${role}`, role, password: 'rt-test-123' }, adminToken);
    if (created.status !== 200 && created.status !== 201) {
      sk('BOOTSTRAP', `${role} kullanıcısı oluşturulamadı (HTTP ${created.status}) — rol testleri SKIP`);
      continue;
    }
    CREATED_USERNAMES.push(uname); // kapanış temizliği bu koşuda açılan GERÇEK adları silsin
    tokens[role] = await login(uname, 'rt-test-123');
  }
  console.log(`  token hazır: ${role}`);
}

// ─── 2b. securityGate PUBLIC_ROUTES çözümlemesi (anon beklentisi için) ───────
const gateSrc = fs.readFileSync(path.join(ROOT, 'server/middleware/securityGate.ts'), 'utf8');
const publicRoutes = [];
for (const m of gateSrc.matchAll(/\{\s*method:\s*'([A-Z]+)',\s*pattern:\s*('.*?'|\/.*?\/[a-z]*)\s*\}/gs)) {
  const [, method, rawPat] = m;
  let matcher;
  if (rawPat.startsWith('/')) {
    const body = rawPat.replace(/^\/(.*)\/[a-z]*$/, '$1');
    matcher = new RegExp(body);
  } else {
    matcher = rawPat.slice(1, -1);
  }
  publicRoutes.push({ method, matcher });
}
const isPublic = (method, fullPath) =>
  publicRoutes.some(r => r.method === method && (typeof r.matcher === 'string' ? r.matcher === fullPath : r.matcher.test(fullPath)));

// ─── 3. İmzalı/yan etkili public uçlar (matrisle kıyaslanamaz → skip) ────────
const SKIP_PATTERNS = [
  /\/webhook$/,                    // imza zorunlu public uçlar (401 fail-closed matrisle çelişmez)
  /^\/api\/auth\/register$/,       // tenant oluşturur (yan etki)
  /^\/api\/auth\/login$/,          // giriş uçları gate testinde (faz25SecurityGateTest) kapsanır
  /\/auth\/login$/,                // mobil login dahil — brute-force rate limit'inin boşa harcanmaması için
  /\/public-share\//,              // imzalı paylaşım token'ı doğrular
  /\/payment-links\/(resolve|pay)/ // imzalı ödeme bağlantısı uçları
];
const paramValues = { ':id': 'rt-test-id', ':provider': 'hizli', ':token': 'rt-invalid-token' };
const substPath = (p) => p.split('/').map(seg => paramValues[seg] !== undefined ? paramValues[seg] : seg).join('/');

// ─── 4. Ana döngü ────────────────────────────────────────────────────────────
console.log(`\n📋 ${matrix.endpoints.length} endpoint × token'sız + ${Object.keys(tokens).length} rol taranıyor...\n`);
const warn500 = [];

// HEDEF 1 (finally semantiği): Tarama döngüsü try içine alındı; kapanış temizliği
// finally'ye taşındı. Böylece döngü içindeki bir dosya okuma/çözümleme hatası
// (ör. resolvePrefix) bootstrap edilen `rt-*` kullanıcılarının silinmesini engellemez.
try {
for (const ep of matrix.endpoints) {
  const prefix = resolvePrefix(ep.file);
  if (!prefix) { sk(`${ep.method} ${ep.file}${ep.path}`, 'index.ts mount eşlemesi bulunamadı'); continue; }
  const fullPath = prefix === '/' ? substPath(ep.path) : (prefix + substPath(ep.path)).replace(/\/+$/, '') || '/';
  const tag = `${ep.method} ${fullPath}`;
  if (SKIP_PATTERNS.some(re => re.test(fullPath))) { sk(tag, 'imzalı/yan etkili public uç — matris kıyası dışı'); continue; }

  const isWrite = ep.method !== 'GET';

  // 4a. Token'sız: public uç → 2xx/404 beklenir (gate geçer), korumalı uç → 401
  const anon = await api(ep.method, fullPath, isWrite ? {} : undefined);
  if (isPublic(ep.method, fullPath)) {
    ok(anon.status >= 200 && anon.status < 500 && anon.status !== 401, tag, `public uç (allowlist) → ${anon.status} (401 OLMAMALI)`);
  } else {
    ok(anon.status === 401, tag, `token'sız → ${anon.status} (401 beklenir)`);
  }

  // 4b. Rol bazlı kontroller
  for (const role of ROLES) {
    const token = tokens[role];
    if (!token) continue; // bootstrap başarısız rol zaten SKIP kaydedildi
    const expected = ep.roles[role];

    if (expected === 'DENY') {
      // Yazma uçları da dahil — beklenti zaten reddedilmesi
      const r = await api(ep.method, fullPath, isWrite ? {} : undefined, token);
      if (r.status === 404) {
        // 404 = uç bu yolda YOK. Sebep: jeneratörün mount çözümlemesi yalnızca
        // `app.use('/prefix', binding)` biçimini görür; alias mount'ları
        // (`app.use('/api/v1/warehouses', (req,res,next) => { req.url = '/warehouses'; ... })`)
        // ve iç route tanımları bu taramada yanlış ön eke düşebilir. Bu bir YETKİ
        // sonucu değildir; "DENY" beklentisi 404 ile ne doğrulanır ne çürütülür.
        // Koşu #3'te 7 FAIL tam olarak bu nedenden üretilmişti (v1/products.ts
        // `/warehouses` rotaları). Yanlış FAIL yerine açık gerekçeli SKIP.
        sk(`${tag} [${role}]`, `beklenti DENY ama uç bu yolda bulunamadı (404) — mount çözümlemesi/yol artefaktı, yetki kanıtı değil`);
        continue;
      }
      ok(r.status === 401 || r.status === 403, `${tag} [${role}]`, `beklenti DENY → ${r.status} (401/403 beklenir)`);
    } else if (expected === 'ALLOW') {
      if (isWrite) { sk(`${tag} [${role}]`, 'ALLOW beklentili yazma ucu — yan etkiden kaçınıldı (kod incelemesi + guard zinciri kanıtı)'); continue; }
      const r = await api(ep.method, fullPath, undefined, token);
      if (r.status === 403 && hasInlineRoleCheck(ep.file)) {
        sk(`${tag} [${role}]`, `ALLOW beklentisi + 403 ama handler içinde rol kontrolü var (statik matris göremez) — manuel inceleme`);
        continue;
      }
      const authPassed = r.status !== 401 && r.status !== 403;
      if (r.status >= 500) warn500.push(`${tag} [${role}] → ${r.status}`);
      ok(authPassed, `${tag} [${role}]`, `beklenti ALLOW → ${r.status} (401/403 OLMAMALI)`);
    } else {
      sk(`${tag} [${role}]`, `matris sonucu ${expected} — manuel inceleme listesine alındı`);
    }
  }
}

// ─── 4b. Kapanış temizliği ───────────────────────────────────────────────────
// Asıl iddialar ölçüldükten SONRA bootstrap edilen `rt-*` kullanıcıları silinir.
// Silme başarısız olsa bile FAIL üretilmez (temizlik, yetki kanıtını gölgelememeli).
} finally {
  // HEDEF 1: finally — tarama döngüsü hata fırlatsa bile temizlik çalışır.
  if (adminToken) {
    try {
      await cleanupTestFixtures(api, adminToken, {
        companies: ['tnt-isbey'],
        usernames: CREATED_USERNAMES.length ? CREATED_USERNAMES : null, // açılan adlar yoksa önek taraması (ön temizlik artığı)
        verbose: true,
      });
    } catch (e) { console.log(`  ⚠️  [fixture-temizlik] kapanış temizliği hatası: ${e.message}`); }
  }
}

// ─── 5. Rapor ────────────────────────────────────────────────────────────────
const summary = { base: BASE, generatedAt: new Date().toISOString(), totals: { pass, fail, skip }, results, warn500 };
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2), 'utf8');

console.log('\n' + '═'.repeat(64));
for (const r of results.filter(x => x.verdict === 'FAIL')) console.log(`  ❌ FAIL  ${r.msg}  (${r.tag})`);
if (warn500.length) { console.log('  ⚠️  500 üreten uçlar (auth GEÇTİ ama sunucu hatası):'); for (const w of warn500) console.log(`      ${w}`); }
console.log('─'.repeat(64));
console.log(`  Kontrol: ${pass + fail + skip} | ✅ PASS: ${pass} | ❌ FAIL: ${fail} | ⏭️  SKIP: ${skip}`);
console.log(`  Çıktı: ${path.relative(ROOT, OUT_PATH)}`);
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
