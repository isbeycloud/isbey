/**
 * İŞBEY CLOUD — YAYIN KAPISI (release gate)
 * =========================================
 * 2026-10-17: NEDEN VAR?
 * -----------------------
 * Bu depoda `main` dalına push, GitHub Actions'tan BAĞIMSIZ olarak Hostinger
 * `hbuilds` webhook'unu tetikler ve CANLIYA dağıtım yapar. Yani:
 *
 *     git push origin main  ==  canlıya dağıtım
 *
 * Bu gerçeğin eski hâlde karşılığı yoktu: kırmızı CI olsa bile push canlıya
 * gidiyordu ve `.github/workflows/ci.yml` yalnızca "rapor" üretiyordu — hiçbir
 * şeyi ENGELLEMİYORDU. Bu dosya, dağıtımı tetikleyen eylemin (push) önüne
 * gerçek bir kapı koyar.
 *
 * KAPI NE YAPAR?
 * --------------
 * Sırayla: typecheck → lint → build → yerel izole test süitleri.
 * (`--with-e2e` verilirse Playwright koşumu da eklenir; E2E `dist/` test
 * ettiği için build'den SONRA gelir.)
 * Adımlardan HERHANGİ BİRİ yeşil değilse kapı KIRMIZI olur ve push reddedilir.
 *
 * TASARIM KARARI: KAÇIŞ YOLU YOK.
 * Bu dosyada "--skip-test" benzeri bir bayrak BİLEREK yoktur. Kaçış yolu,
 * kapıyı kapı olmaktan çıkarır. Acil durumda bilinçli bir `git push --no-verify`
 * kullanılabilir; o da açıkça "kapıyı elle atladım" demektir (iz bırakır).
 * Force push ayrıca `.githooks/pre-push` tarafından REDDEDİLİR.
 *
 * KULLANIM
 * --------
 *   npm run release:gate              → tam kapı
 *   npm run release:gate -- --with-e2e → + Playwright
 *   node tools/release-gate.mjs --list → yalnız koşacak adımları yazdır (kapıyı koşmaz)
 *
 * `--list` bilinçli olarak SINIRLI bir istisnadır: hiçbir şey çalıştırmaz,
 * yalnız planı yazdırır. Kapı kararı VERMEZ, dolayısıyla delik açmaz.
 */
import { spawnSync } from 'node:child_process';

const withE2E = process.argv.includes('--with-e2e') || process.env.RELEASE_GATE_E2E === '1';

/** Adımlar sıralıdır ve sıra BAĞLAYICIDIR: E2E, build çıktısını (`dist/`) test eder. */
const steps = [
  { label: 'Typecheck (tsc -b)', script: 'typecheck' },
  { label: 'Lint (oxlint src server)', script: 'lint' },
  { label: 'Production build (tsc -b && vite build)', script: 'build' },
  { label: 'Yerel izole test süitleri (tools/test-local.mjs)', script: 'test' },
  // 2026-10-20: CARİ İSTİSNA KAPISI. `cari-tutarlilik.py --kabul` bir kaydı
  // affederken kimlik + süre şartı arıyor; bu sözleşme Python tarafında ve
  // Node süitlerinden geçmiyordu. Kapı olmadan mekanizma sessizce genişleyebilir.
  { label: 'Cari tutarlılık istisna sözleşmesi (python)', script: 'test:cari' },
  ...(withE2E ? [{ label: 'Playwright E2E (dist/ üzerinde)', script: 'test:e2e' }] : []),
];

if (process.argv.includes('--list')) {
  console.log('Yayın kapısı adımları (sıralı):');
  for (const [i, s] of steps.entries()) console.log(`  ${i + 1}. ${s.label}  →  npm run ${s.script}`);
  if (!withE2E) console.log('\nNot: Playwright adımı kapalı. Açmak için: npm run release:gate -- --with-e2e');
  process.exit(0);
}

const started = Date.now();
console.log('════════════════════════════════════════════════════════════════');
console.log(' İŞBEY YAYIN KAPISI — main push = CANLI DAĞITIM');
console.log(' Bu kapı kırmızıysa push REDDEDİLİR.');
console.log('════════════════════════════════════════════════════════════════');

const results = [];
for (const [i, step] of steps.entries()) {
  const t0 = Date.now();
  console.log(`\n── [${i + 1}/${steps.length}] ${step.label} ──`);
  // stdio: 'inherit' → çıktı gizlenmez. Bir adımı "sessizce geçti" göstermek
  // yasaktır; kullanıcı gerçek çıktıyı görmelidir.
  const r = spawnSync('npm', ['run', step.script], { stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  results.push({ ...step, ok, seconds: ((Date.now() - t0) / 1000).toFixed(1), status: r.status });
  console.log(ok ? `✅ ${step.label} — GEÇTİ (${results.at(-1).seconds}s)` : `❌ ${step.label} — KIRMIZI (exit=${r.status}${r.error ? `, ${r.error.message}` : ''})`);
  // FAIL-FAST: kırmızı adımdan sonra devam etmek zaman kaybıdır ve gürültü
  // üretir; kapı zaten kapalıdır.
  if (!ok) break;
}

const failed = results.filter(r => !r.ok);
console.log('\n════════════════════════════════════════════════════════════════');
for (const r of results) console.log(` ${r.ok ? '✅' : '❌'} ${r.label} (${r.seconds}s)`);
const skipped = steps.slice(results.length);
for (const s of skipped) console.log(` ⏭️  ${s.label} — koşulmadı (önceki adım kırmızı)`);
console.log('════════════════════════════════════════════════════════════════');

if (failed.length) {
  console.error(`\n❌ YAYIN KAPISI KIRMIZI — ${failed.map(f => f.label).join(', ')}`);
  console.error('   Bu hâlde main\'e push CANLIYA DAĞITIM yapar ve YAPILMAMALIDIR.');
  console.error('   Önce kırmızı adımı düzeltip kapıyı yeniden koşun.');
  process.exitCode = 1;
} else {
  console.log(`\n✅ YAYIN KAPISI YEŞİL — ${results.length}/${results.length} adım geçti (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (!withE2E) console.log('   Not: Playwright adımı koşulmadı (--with-e2e ile açılır).');
  console.log('   Kapı yeşil; push canlıya dağıtım tetikleyecektir.');
  process.exitCode = 0;
}
