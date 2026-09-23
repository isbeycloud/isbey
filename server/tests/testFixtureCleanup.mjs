/**
 * FAZ 25.2-A/d — TEST FIXTURE TEMİZLİĞİ (ortak modül)
 *
 * Neden var: Canlı suite'ler her koşuda GERÇEK kullanıcı kaydı açıyor ve kapanışta
 * silmiyordu. Dört koşu sonunda `tnt-isbey` kiracısının kullanıcı kotası (maxUsers=15)
 * doldu; `admin-users.ts:153` yeni kaydı 400 ile reddetmeye başladı ve `FAZ 25.2-A smoke`
 * C1 kalemleri — testin ölçmek istediği asıl iddia olan "başka tenant'a kullanıcı açılamaz"
 * — hiç sınanamadan FAIL/ölçülemez hale geldi (koşu #4).
 *
 * Bu modül, paketi İDEMPOTENT yapar: her suite kendi açtığı kullanıcıları kapanışta siler.
 *
 * ═══ GÜVENLİK SINIRI (silme yıkıcıdır — denetim bulgusu A1 sonrası sıkılaştırıldı) ═══
 * Denetim (2026-09-12) şunu gösterdi: yalnız önek eşleşmesine dayanan ve TÜM kiracıları
 * tarayan bir temizlik, başka bir kiracıdaki gerçek bir kullanıcı adı önekle çakışırsa
 * onu silebilirdi (`POST /api/admin/users` kullanıcı adını serbest metin alır).
 * Bu yüzden silme artık ÜÇ koşulun BİRDEN sağlanmasını ister:
 *
 *   1. KİRACI KAPSAMI — kullanıcı, çağıranın verdiği `companies` listesindeki bir kiracıya
 *      ait olmalı (varsayılan YOK; suite açıkça belirtir). Kapsam dışı kiracılar hiç taranmaz.
 *   2. ÖNEK — ad, `TEST_FIXTURE_PREFIXES` içindeki bilinen bir test önekiyle başlamalı.
 *   3. KORUMA — ad, `PROTECTED_USERNAMES` içinde OLMAMALI.
 *
 * Ek olarak `usernames` verilirse (suite'in gerçekten açtığı adlar), silme yalnız o
 * listeyle sınırlanır — en dar ve en güvenli mod. Suite'ler bunu tercih etmelidir.
 *
 * Kiracının `maxUsers` değeri DEĞİŞTİRİLMEZ. Silme başarısız olursa suite çökmez.
 */

/** Test fixture'ı olduğu bilinen kullanıcı adı önekleri. */
export const TEST_FIXTURE_PREFIXES = ['rt-', 'yeni-', 'pf-', 'esc-', 'crm-', 'satis-', 'ah-'];

/** Önek eşleşse bile ASLA silinmeyecek isimler (emniyet kemeri). */
export const PROTECTED_USERNAMES = [
  'admin', 'muhasebe', 'kasiyer', 'firmaadmin', 'rapor', 'pasifkullanici',
];

/**
 * ÖNEK TAŞIMAYAN eski test fixture'ları (artık üretilmiyor ama DB'de birikmiş).
 * Denetim bulgusu A4: `crmtest1` öneki tutmadığı için ne siliniyor ne korunuyordu —
 * sessizce kotada kalıyordu. Bunlar test ürünüdür, gerçek kullanıcı değildir.
 * (satis262a: koşu #2 öncesi smoke'un sabit adı; artık `satis-<tag>` üretiliyor.)
 */
export const LEGACY_FIXTURE_USERNAMES = ['crmtest1', 'satis262a'];

/** Bir kullanıcı test fixture'ı mı? (önek/kalıntı + koruma — kiracı kontrolü çağırana ait) */
export const isTestFixtureUser = (u) => {
  const name = String(u?.username || '').toLowerCase();
  if (!name) return false;
  if (PROTECTED_USERNAMES.includes(name)) return false;
  if (LEGACY_FIXTURE_USERNAMES.includes(name)) return true;
  return TEST_FIXTURE_PREFIXES.some(p => name.startsWith(p));
};

/**
 * Test fixture'larını siler.
 *
 * @param {(method: string, path: string, body?: any, token?: string) => Promise<{status:number,json:any}>} api
 *        Suite'in kendi `api` yardımcısı.
 * @param {string} adminToken  SUPER_ADMIN token'ı — silme ucu SUPER_ADMIN/ADMIN ister.
 * @param {{companies?: string[], usernames?: string[], verbose?: boolean, dryRun?: boolean}} [opts]
 *        `companies`  : taranacak kiracılar (ZORUNLU — boşsa temizlik yapılmaz).
 *        `usernames`  : verilirse silme yalnız bu adlarla sınırlanır (en dar mod).
 * @returns {Promise<{found:number, deleted:number, failed:number, skippedScope:number, usernames:string[]}>}
 */
export async function cleanupTestFixtures(api, adminToken, opts = {}) {
  const { companies = [], usernames = null, verbose = false, dryRun = false } = opts;
  const summary = { found: 0, deleted: 0, failed: 0, skippedScope: 0, usernames: [] };

  if (!adminToken) {
    console.log('  ⚠️  [fixture-temizlik] admin token yok — temizlik atlandı');
    return summary;
  }
  // Kiracı kapsamı verilmediyse HİÇBİR ŞEY silinmez (güvenli varsayılan).
  if (!Array.isArray(companies) || companies.length === 0) {
    console.log('  ⚠️  [fixture-temizlik] kiracı kapsamı (companies) verilmedi — temizlik atlandı (güvenli varsayılan)');
    return summary;
  }
  const scope = new Set(companies);
  const restrict = usernames ? new Set(usernames.map(n => String(n).toLowerCase())) : null;

  const list = await api('GET', '/api/admin/users', null, adminToken);
  if (list.status !== 200) {
    console.log(`  ⚠️  [fixture-temizlik] kullanıcı listesi alınamadı (HTTP ${list.status}) — temizlik atlandı`);
    return summary;
  }
  const users = list.json?.users || [];

  const targets = [];
  for (const u of users) {
    if (!isTestFixtureUser(u)) continue;                 // önek + koruma
    const cid = u.companyId || (Array.isArray(u.allowedCompanyIds) ? u.allowedCompanyIds[0] : null);
    if (!cid || !scope.has(cid)) { summary.skippedScope++; continue; }   // kiracı kapsamı
    if (restrict && !restrict.has(String(u.username).toLowerCase())) continue; // açık liste
    targets.push(u);
  }

  summary.found = targets.length;
  summary.usernames = targets.map(u => u.username);

  if (restrict) {
    const eksik = [...restrict].filter(n => !targets.some(t => t.username.toLowerCase() === n));
    if (eksik.length && verbose) console.log(`  ℹ️  [fixture-temizlik] listede olup DB'de bulunmayan: ${eksik.join(', ')}`);
  }
  if (!targets.length) {
    if (verbose) console.log('  ✓ [fixture-temizlik] silinecek test kullanıcısı yok (paket temiz)');
    return summary;
  }
  if (dryRun) {
    console.log(`  ℹ️  [fixture-temizlik] dry-run: ${targets.length} fixture silinecekti → ${summary.usernames.join(', ')}`);
    return summary;
  }

  for (const u of targets) {
    const r = await api('DELETE', `/api/admin/users/${u.id}`, null, adminToken);
    if (r.status === 200 && r.json?.success !== false) {
      summary.deleted++;
      if (verbose) console.log(`  ✓ [fixture-temizlik] silindi: ${u.username} (${u.companyId})`);
    } else {
      summary.failed++;
      console.log(`  ⚠️  [fixture-temizlik] silinemedi: ${u.username} → HTTP ${r.status}${r.json?.message ? ` — ${r.json.message}` : ''}`);
    }
  }

  console.log(`  🧹 [fixture-temizlik] ${summary.deleted}/${summary.found} test kullanıcısı silindi`
    + (summary.failed ? ` (${summary.failed} başarısız)` : '')
    + (summary.skippedScope ? ` · ${summary.skippedScope} kayıt kapsam dışı kiracıda (dokunulmadı)` : ''));
  return summary;
}
