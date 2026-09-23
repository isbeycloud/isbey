// FAZ 25.2-E — /api/auth/users sertleştirme doğrulaması
//
// NEDEN BU TEST VAR:
// Runtime authz paketi bu ucu ÖLÇEMİYOR. Kanıt (server/tests/output/runtime-authz-results.json):
//   - "GET /api/auth/users [COMPANY_ADMIN]" → PASS, mesaj "beklenti ALLOW → 200"
//     Yani test yalnız HTTP kodunu gördü; dönen listenin TENANT KAPSAMINI hiç denetlemedi.
//   - "POST /api/auth/users [COMPANY_ADMIN]" → SKIP, "ALLOW beklentili yazma ucu —
//     yan etkiden kaçınıldı". Yani hiç koşulmadı.
// Bu test o boşluğu kapatır: 200 dönmesi DEĞİL, yetki sınırının kendisi ölçülür.
//
// ÖLÇÜLEN İDDİALAR
//   1. COMPANY_ADMIN başka kiracıya kullanıcı AÇAMAZ (cross-tenant yazma).
//   2. COMPANY_ADMIN SUPER_ADMIN/ADMIN rolü ATAYAMAZ (yetki yükseltme).
//   3. Kota uygulanır (yalnız aktif kullanıcılar sayılır) ve AŞILAMAZ.
//   4. GET, COMPANY_ADMIN'e YALNIZ kendi kiracısının kullanıcılarını döndürür.
//   5. SUPER_ADMIN davranışı bozulmaz (tüm kiracıları görmeye devam eder).
//
// BOŞ-OLMAZLIK (non-vacuous): "başka kiracıda hiç kullanıcı yoksa" 4. iddia
// kendiliğinden doğru olurdu. Bu yüzden beklenen yabancı kullanıcı kümesi DB
// dosyasından BAĞIMSIZ olarak çıkarılır ve küme boşsa test SKIP değil, açıkça
// "ölçülemedi" diye raporlanır.
//
// KİRLETME SINIRI: Bu test yalnız `ah-<damga>` önekli fixture açar; kapanışta
// finally içinde ortak temizlik modülüyle siler. Gerçek kullanıcıya ve
// `maxUsers` değerine dokunulmaz.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupTestFixtures } from './testFixtureCleanup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DB_PATH = path.join(ROOT, 'data/database.json');
const BASE = process.env.ISBEY_BASE_URL || 'http://127.0.0.1:4000';

let pass = 0, fail = 0, skip = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const sk = (m) => { skip++; console.log('  ⏭️  SKIP: ' + m); };

async function api(method, p, body, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
}
const login = async (u, p) => (await api('POST', '/api/auth/login', { username: u, password: p })).json?.token;

const OUR_TENANT = 'tnt-isbey';       // firmaadmin'in kiracısı
const OTHER_TENANT = 'tnt-kadikoy';   // cross-tenant denemesi için hedef
const stamp = Date.now().toString(36).slice(-5);
const CREATED = [];

console.log('════════ FAZ 25.2-E — /api/auth/users sertleştirme ════════\n');

// ─── Beklenen yabancı kullanıcı kümesi (bağımsız, DB'den) ───────────────────
// Ucun kodundan DEĞİL, veri dosyasından türetilir.
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const foreignUsernames = new Set(
  (db.users || [])
    .filter(u => u.companyId && u.companyId !== OUR_TENANT)
    .map(u => String(u.username).toLowerCase())
);
console.log(`  (referans: ${foreignUsernames.size} kullanıcı "${OUR_TENANT}" dışındaki kiracılarda)`);

const admin = await login('admin', 'admin123');            // SUPER_ADMIN
const firma = await login('firmaadmin', 'firmaadmin123');  // COMPANY_ADMIN (tnt-isbey)

if (!admin || !firma) {
  console.log('\n  ✗ FAIL: seed hesaplarıyla giriş yapılamadı — test koşulamaz');
  process.exit(1);
}

try {
  // ─── 0. Ön temizlik: kotayı aç (idempotentlik) ────────────────────────────
  try { await cleanupTestFixtures(api, admin, { companies: [OUR_TENANT, OTHER_TENANT], verbose: true }); }
  catch (e) { console.log(`  ⚠️  [fixture-temizlik] ön temizlik hatası: ${e.message}`); }

  // ─── 1. Cross-tenant yazma engeli ────────────────────────────────────────
  console.log('\n📋 1. Cross-tenant kullanıcı oluşturma engeli');
  const xtName = `ah-xt-${stamp}`;
  let r = await api('POST', '/api/auth/users', {
    username: xtName, fullName: 'Cross Tenant', role: 'SATIS', password: 'AhTest1234', companyId: OTHER_TENANT,
  }, firma);
  // 4xx beklenir: yalnız "200 değil" demek bir 500'ü de geçirirdi (sunucu hatası ≠ yetki reddi).
  ok(r.status >= 400 && r.status < 500,
    `COMPANY_ADMIN → "${OTHER_TENANT}" hedefine kullanıcı → ${r.status} (4xx beklenir: yetki reddi, 200/sunucu hatası değil)`);

  // Yan etki denetimi (asıl iddia bu): kayıt GERÇEKTEN açılmamış olmalı.
  const afterXt = await api('GET', '/api/auth/users', null, admin);
  const xtLeak = (afterXt.json?.users || []).some(u => String(u.username).toLowerCase() === xtName.toLowerCase());
  ok(!xtLeak, `engellenen istek yan etki bırakmadı → "${xtName}" hiçbir kiracıda yok`);

  // ─── 2. Yetki yükseltme yasağı ───────────────────────────────────────────
  console.log('\n📋 2. Yetki yükseltme yasağı');
  const escName = `ah-esc-${stamp}`;
  r = await api('POST', '/api/auth/users', {
    username: escName, fullName: 'Esc Test', role: 'SUPER_ADMIN', password: 'AhTest1234',
  }, firma);
  ok(r.status === 403, `COMPANY_ADMIN → SUPER_ADMIN rolü atama → ${r.status} (403 beklenir)`);
  const afterEsc = await api('GET', '/api/auth/users', null, admin);
  ok(!(afterEsc.json?.users || []).some(u => String(u.username).toLowerCase() === escName.toLowerCase()),
    `yükseltme denemesi kullanıcı açmadı → "${escName}" yok`);

  // ─── 3. Kota uygulanıyor mu? (ölçülebilir biçimde) ───────────────────────
  console.log('\n📋 3. Kota uygulanıyor');
  // Firmanın kendi kiracısında SATIS açabilmeli (pozitif kontrol).
  const ownName = `ah-own-${stamp}`;
  r = await api('POST', '/api/auth/users', {
    username: ownName, fullName: 'Own Tenant', role: 'SATIS', password: 'AhTest1234',
  }, firma);
  if (r.status === 200) {
    CREATED.push(ownName);
    const created = (await api('GET', '/api/auth/users', null, admin)).json?.users?.find(u => u.username === ownName);
    ok(created?.companyId === OUR_TENANT, `kendi kiracısında oluşturma → companyId=${created?.companyId} (${OUR_TENANT} beklenir)`);
    ok(!JSON.stringify(r.json).includes('passwordHash'), 'yanıtta passwordHash sızmıyor');
  } else {
    // Kota engeli = testin ölçemediği durum. PASS sayılmaz (kullanıcı kuralı).
    ok(false, `kendi kiracısında SATIS oluşturma → ${r.status} — "${r.json?.message}" (kota/başka engel; pozitif kontrol ölçülemedi)`);
  }

  // ─── 3b. Kota ZORLAMASI — gerçekten ölçülür (invariant DEĞİL) ────────────
  // Önceki hâli yalnız `activeCount <= maxUsers` invariant'ını kontrol ediyordu; bu
  // "kota uygulandı" iddiasını ÖLÇMEZ — sınır hiçbir zaman zorlanmıyordu ve kota
  // tamamen kaldırılsa bile bu kontrol PASS verirdi. İş emri §7C/§8: sınır gerçekten
  // doldurulup BİR SONRAKİ create'in reddedildiği görülmeli.
  // Dolgu yalnız `ah-q-<damga>-<i>` önekli fixture açar ve hepsi CREATED'e eklenir;
  // kapanış temizliği (finally) bunları siler → koşular arası birikim olmaz.
  const tenants = (JSON.parse(fs.readFileSync(DB_PATH, 'utf8')).tenants || []);
  const ourTenant = tenants.find(t => t.id === OUR_TENANT);
  const FILL_CAP = 40; // makul olmayan büyüklükteki kotayı doldurmaya çalışma
  if (!ourTenant?.maxUsers) {
    sk(`"${OUR_TENANT}" için maxUsers tanımlı değil — kota zorlaması ölçülemedi`);
  } else {
    const listNow = (await api('GET', '/api/auth/users', null, admin)).json?.users || [];
    const activeCount = listNow.filter(u => u.companyId === OUR_TENANT && u.active).length;
    const needed = ourTenant.maxUsers - activeCount;
    console.log(`  (kota durumu: ${activeCount}/${ourTenant.maxUsers} aktif — ${needed > 0 ? needed + ' boşluk' : 'sınırda/dolu'})`);

    if (needed > FILL_CAP) {
      sk(`maxUsers=${ourTenant.maxUsers} doldurma sınırının (${FILL_CAP}) üstünde — kota zorlaması ölçek dışı`);
    } else if (needed <= 0) {
      // Kota zaten dolu/aşılmış: dolgu yapılamaz. "0/0 açıldı" PASS'ı VACUOUS olurdu
      // (döngü hiç çalışmadı) — §8 non-vacuous kuralı gereği SKIP raporlanır.
      sk(`kota zaten sınırda/aşılmış (${activeCount}/${ourTenant.maxUsers}) — dolgu adımı ölçülemedi`);
    } else {
      // 1) Sınırı firmaadmin ile doldur.
      let filled = 0;
      for (let i = 0; i < needed; i++) {
        const n = `ah-q-${stamp}-${i}`;
        const cr = await api('POST', '/api/auth/users', {
          username: n, fullName: 'Kota Dolgu', role: 'SATIS', password: 'AhTest1234',
        }, firma);
        if (cr.status === 200) { CREATED.push(n); filled++; }
        else { ok(false, `kota dolgusu ${i + 1}/${needed} → ${cr.status} — "${cr.json?.message}" (zorlama yarıda kaldı)`); break; }
      }
      if (filled === needed) {
        ok(true, `kota sınırına kadar dolgu → ${filled}/${needed} açıldı (${activeCount}→${activeCount + filled}/${ourTenant.maxUsers})`);

        // 2) Sınır doluyken BİR fazlası REDDEDİLMELİ — ölçülen asıl iddia.
        const overName = `ah-over-${stamp}`;
        const over = await api('POST', '/api/auth/users', {
          username: overName, fullName: 'Kota Aşım', role: 'SATIS', password: 'AhTest1234',
        }, firma);
        // 4xx beklenir — "200 değil" demek bir 500'ü de geçirirdi (sunucu hatası ≠ kota reddi).
        ok(over.status >= 400 && over.status < 500,
          `kota dolu iken fazladan kullanıcı → ${over.status} (4xx beklenir; maxUsers=${ourTenant.maxUsers} dayatılmalı)`);
        // Reddin yan etkisi olmamalı (kayıt gerçekten açılmamış).
        const overLeak = ((await api('GET', '/api/auth/users', null, admin)).json?.users || [])
          .some(u => String(u.username).toLowerCase() === overName.toLowerCase());
        ok(!overLeak, `kota reddi yan etki bırakmadı → "${overName}" hiçbir kiracıda yok`);
      } else {
        // Dolgu tamamlanmadı → sınır dolu değil; "fazlası reddedildi" kontrolü VACUOUS olurdu.
        sk(`kota dolgusu tamamlanmadı (${filled}/${needed}) — aşım reddi ölçülemedi`);
      }
    }
  }

  // ─── 4. GET tenant izolasyonu (non-vacuous) ──────────────────────────────
  console.log('\n📋 4. GET tenant izolasyonu');
  const asFirma = await api('GET', '/api/auth/users', null, firma);
  ok(asFirma.status === 200, `COMPANY_ADMIN GET /api/auth/users → ${asFirma.status} (200 beklenir)`);

  const firmaNames = new Set((asFirma.json?.users || []).map(u => String(u.username).toLowerCase()));
  const leaked = [...foreignUsernames].filter(n => firmaNames.has(n));
  if (foreignUsernames.size === 0) {
    sk(`başka kiracıda hiç kullanıcı yok — izolasyon iddiası ölçülemedi (boş küme kendiliğinden doğru olurdu)`);
  } else {
    ok(leaked.length === 0,
      `dış kiracı kullanıcısı sızmıyor → ${foreignUsernames.size} yabancı addan ${leaked.length} tanesi görünüyor`
      + (leaked.length ? ` (SIZAN: ${leaked.slice(0, 5).join(', ')})` : ''));
  }
  // Ayrıca dönen her kaydın kapsam içi olduğunu doğrula (isim listesinden bağımsız ikinci kanıt).
  // STATİK DENETİM DÜZELTMESİ (2026-09-12): Bu kontrol önceden hedefin kendi
  // `allowedCompanyIds` alanını da "kapsam içi" sayıyordu — yani auth.ts'te düzeltilen
  // hatanın AYNISINI tolere ediyor, dolayısıyla o hataya geri dönüşü yakalayamazdı.
  // Kanonik users.ts kuralı: COMPANY_ADMIN yalnız `u.companyId === caller.companyId`
  // olan kayıtları görür (firmaadmin için tnt-isbey). Bu yüzden kapsam-dışı =
  // kendi kiracısı tnt-isbey olmayan HER kayıt.
  const outOfScope = (asFirma.json?.users || []).filter(u => u.companyId !== OUR_TENANT);
  ok(outOfScope.length === 0,
    `yanıttaki tüm kayıtlar kapsam içi → ${outOfScope.length} kapsam dışı kayıt`
    + (outOfScope.length ? ` (ör. ${outOfScope.slice(0, 3).map(u => `${u.username}@${u.companyId}`).join(', ')})` : ''));

  // ─── 5. SUPER_ADMIN davranışı bozulmadı ──────────────────────────────────
  console.log('\n📋 5. SUPER_ADMIN davranışı korunuyor');
  const asAdmin = await api('GET', '/api/auth/users', null, admin);
  ok(asAdmin.status === 200, `SUPER_ADMIN GET /api/auth/users → ${asAdmin.status} (200 beklenir)`);
  if (foreignUsernames.size > 0) {
    const adminNames = new Set((asAdmin.json?.users || []).map(u => String(u.username).toLowerCase()));
    const visible = [...foreignUsernames].filter(n => adminNames.has(n)).length;
    ok(visible > 0,
      `SUPER_ADMIN dış kiracı kullanıcılarını GÖRMEYE DEVAM EDİYOR → ${visible}/${foreignUsernames.size} görünüyor (kısıtlama yalnız COMPANY_ADMIN'e uygulandı)`);
  }
  // SUPER_ADMIN başka kiracıya kullanıcı açabilmeli (davranış korunuyor)
  const pfName = `ah-pf-${stamp}`;
  r = await api('POST', '/api/auth/users', {
    username: pfName, fullName: 'PF User', role: 'SATIS', password: 'AhTest1234', companyId: OTHER_TENANT,
  }, admin);
  if (r.status === 200) {
    CREATED.push(pfName);
    const made = (await api('GET', '/api/auth/users', null, admin)).json?.users?.find(u => u.username === pfName);
    ok(made?.companyId === OTHER_TENANT, `SUPER_ADMIN başka kiracıya kullanıcı açabiliyor → companyId=${made?.companyId} (${OTHER_TENANT} beklenir)`);
  } else {
    ok(false, `SUPER_ADMIN başka kiracıya kullanıcı açamadı → ${r.status} — "${r.json?.message}" (davranış BOZULMUŞ olabilir)`);
  }

  // ─── 6. Kimlik doğrulama kapısı ──────────────────────────────────────────
  console.log('\n📋 6. Kimlik doğrulama kapısı');
  ok((await api('POST', '/api/auth/users', { username: 'ah-anon', fullName: 'X', password: 'y' })).status === 401,
    "token'sız POST /api/auth/users → 401");
  ok((await api('GET', '/api/auth/users')).status === 401,
    "token'sız GET /api/auth/users → 401");

} finally {
  // KİRLETME TEMİZLİĞİ — test FAIL olsa bile çalışır (finally).
  try {
    await cleanupTestFixtures(api, admin, {
      companies: [OUR_TENANT, OTHER_TENANT],
      usernames: CREATED.length ? CREATED : null,
      verbose: true,
    });
  } catch (e) { console.log(`  ⚠️  [fixture-temizlik] kapanış temizliği hatası: ${e.message}`); }
}

console.log(`\n════════ SONUÇ: ${pass} PASS / ${fail} FAIL / ${skip} SKIP (PASS: ${pass} | FAIL: ${fail} | SKIP: ${skip}) ════════`);
process.exit(fail ? 1 : 0);
