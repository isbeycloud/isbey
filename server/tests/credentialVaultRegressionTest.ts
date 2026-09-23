/**
 * İŞBEY CLOUD — KİMLİK BİLGİSİ KASASI REGRESYON TESTİ
 * ===================================================
 * Kapsam: `server/security/credentialVault.ts` (AES-256-GCM kasa)
 *
 * NEDEN VAR:
 *   2026-09-14'te `encryptedPassword` / `apiKeyEncrypted` / `apiSecretEncrypted`
 *   alanları base64'ten gerçek şifrelemeye taşındı ve
 *   `portalCredentials.wsPassword` düz metinden çıkarıldı. Bu değişiklik
 *   VERİ KAYBI riski taşır (yanlış anahtar → okunamayan kayıt). Bu süit
 *   şunları ölçer:
 *     1. Anahtar kaynağı: CREDENTIAL_ENCRYPTION_KEY mi, JWT_SECRET türetimi mi
 *     2. Tur    : şifrele → çöz → aynı düz metin (Türkçe/UTF-8 dahil)
 *     3. Rastgele IV: aynı girdi iki kez şifrelenince farklı çıktı (IV tekrarı yok)
 *     4. Bütünlük: kurcalanmış/bozuk kripto metin SESSİZCE boş dönmez — hata fırlatır
 *     5. Legacy : etiketsiz base64 okunur (eski `encryptedPassword` kayıtları)
 *    5b. Sezgi tuzağı: 'auto' sezgisinin neden varsayılan olmaması gerektiğinin
 *        gösterimi (bu blok TEST DEĞİL — sayaçları artırmaz)
 *     6. Boş    : '' / undefined / null → '' veya undefined (uydurma değer üretilmez)
 *     7. Migrasyon idempotent: şifreli değer ikinci kez şifrelenmez
 *     8. Anahtar yokken: `encrypt` DÜZ METİN YAZMAZ; şifreli kayıt çözülemez —
 *        ikisi de AÇIK HATA (sessiz '' yok)
 *     9. HKDF türetimi: JWT_SECRET ile çalışır, JWT_SECRET değişince eski kayıt açılmaz
 *    10. Bozuk anahtar: sessizce JWT_SECRET'e DÜŞMEZ; `vaultStatus()` fırlatmaz,
 *        'misconfigured' raporlar
 *
 * ⚠️ Ağ çağrısı YAPMAZ. .env'i okumaz; anahtarı test içinde kurar.
 *
 * Çalıştır: npx tsx server/tests/credentialVaultRegressionTest.ts
 */

import crypto from 'crypto';

// ─── Test Yardımcıları ────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function pass(name: string): void {
  passCount++;
  console.log(`  ✅ PASS  ${name}`);
}

function fail(name: string, detail?: string): void {
  failCount++;
  console.error(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) pass(name);
  else fail(name, detail);
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(70));
}

/** Beklenen hata fırlatıldı mı? */
function assertThrows(fn: () => unknown, name: string): void {
  try {
    fn();
    fail(name, 'hata beklendi ancak hata fırlatılmadı');
  } catch {
    pass(name);
  }
}

/**
 * Bilgilendirme satırı — SAYAÇLARI ARTIRMAZ.
 *
 * Neden ayrı: her iki durumda da "geçen" bir blok, test değil açıklamadır. Onu
 * `pass()` ile saymak PASS sayısını şişirir ve kanıt sözleşmesini bozar
 * (bkz. feedback_kanit_sozlesmesi). Bu yüzden `console.log` ile yazılır.
 */
function info(mesaj: string): void {
  console.log(`  ℹ️  ${mesaj}`);
}

// ─── İzolasyon: kasa modülü env okur, test kendi anahtarını kurar ────────────
//
// `dotenv` BİLEREK yüklenmez; aksi hâlde gerçek `.env` anahtarı testi gizlice
// etkiler ve "anahtar yok" senaryosu ölçülemez.

const GERCEK_ANAHTAR = crypto.randomBytes(32).toString('base64');
const SAHTE_ANAHTAR = crypto.randomBytes(32).toString('base64');

process.env.CREDENTIAL_ENCRYPTION_KEY = GERCEK_ANAHTAR;
delete process.env.JWT_SECRET;

// Modül env'i import sırasında DEĞİL, `getVaultKey()` çağrısında okur ve
// sonucu önbelleğe alır. Bu yüzden anahtarı değiştirdikten sonra
// `resetVaultKeyCache()` çağırmak gerekir.
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  isLegacyValue,
  migrateLegacyValue,
  resetVaultKeyCache,
  vaultStatus,
} from '../security/credentialVault';

// ─── BÖLÜM 1: Anahtar kaynağı ────────────────────────────────────────────────

section('1. ANAHTAR KAYNAĞI');

resetVaultKeyCache();
assert(vaultStatus().available, 'Kasa kullanılabilir (CREDENTIAL_ENCRYPTION_KEY tanımlı)');
assert(vaultStatus().keySource === 'CREDENTIAL_ENCRYPTION_KEY', 'Anahtar kaynağı CREDENTIAL_ENCRYPTION_KEY',
       `gerçek: ${vaultStatus().keySource}`);

// ─── BÖLÜM 2: Tur (şifrele → çöz) ────────────────────────────────────────────

section('2. ŞİFRELE → ÇÖZ TURU');

const ORNEK_SIFRE = 'aOw873JRxb';
const sifreli = encryptSecret(ORNEK_SIFRE);

assert(typeof sifreli === 'string' && sifreli.length > 0, 'Şifreleme çıktı üretti');
assert(!!sifreli && isEncrypted(sifreli), 'Çıktı `enc:v1:` etiketli');
assert(!!sifreli && !sifreli.includes(ORNEK_SIFRE), 'Çıktı düz metni İÇERMİYOR');
assert(decryptSecret(sifreli) === ORNEK_SIFRE, 'Çözülen değer girdiyle birebir aynı');

// Türkçe karakter + uzun metin (UTF-8 sınırı)
const TURKCE = 'Şifre-ĞÜŞİÖÇ-2026-ğüşiöç-çok-uzun-bir-şifre-denemesi-1234567890';
const sifreliTr = encryptSecret(TURKCE);
assert(decryptSecret(sifreliTr) === TURKCE, 'Türkçe karakterli şifre tur atlattı (UTF-8)');

// ─── BÖLÜM 3: Rastgele IV ────────────────────────────────────────────────────

section('3. RASTGELE IV (aynı girdi → farklı kripto metin)');

const a = encryptSecret(ORNEK_SIFRE);
const b = encryptSecret(ORNEK_SIFRE);
assert(!!a && !!b && a !== b, 'Aynı girdi iki kez şifrelenince FARKLI çıktı üretti');
assert(decryptSecret(a) === decryptSecret(b) && decryptSecret(a) === ORNEK_SIFRE,
       'Her iki çıktı da aynı düz metne çözülüyor');

// ─── BÖLÜM 4: Bütünlük (GCM auth tag) ────────────────────────────────────────

section('4. BÜTÜNLÜK — KURCALANMIŞ KAYIT SESSİZCE GEÇMEZ');

{
  // Kripto metnin son karakterlerini boz
  const bozuk = sifreli!.slice(0, -4) + (sifreli!.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assertThrows(() => decryptSecret(bozuk), 'Kurcalanmış kripto metin HATA fırlattı (sessiz boş dönmedi)');
}
{
  // Etiket var ama gövde eksik
  assertThrows(() => decryptSecret('enc:v1:yalnızca-iv'),
               'Bozuk biçimli (eksik parça) etiketli kayıt HATA fırlattı');
}
{
  // Farklı anahtarla şifrelenmiş kayıt → çözülemez
  const sifreli2 = encryptSecret('başka-anahtar-testi');
  process.env.CREDENTIAL_ENCRYPTION_KEY = SAHTE_ANAHTAR;
  resetVaultKeyCache();
  assertThrows(() => decryptSecret(sifreli2),
               'YANLIŞ anahtarla çözme HATA fırlattı (sessizce boş şifre üretmedi)');

  // Eski anahtara dön — sonraki bölümler bozulmasın
  process.env.CREDENTIAL_ENCRYPTION_KEY = GERCEK_ANAHTAR;
  resetVaultKeyCache();
  assert(decryptSecret(sifreli) === ORNEK_SIFRE, 'Doğru anahtara dönünce kayıt yeniden çözülebiliyor');
}

// ─── BÖLÜM 5: Legacy uyumluluk ───────────────────────────────────────────────

section('5. GERİYE DÖNÜK UYUMLULUK (eski kayıtlar)');

// Eski `encryptedPassword`: base64 kodlu — ipucu AÇIKÇA verilir
const legacyB64 = Buffer.from('eski-base64-sifre', 'utf8').toString('base64');
assert(decryptSecret(legacyB64, 'base64') === 'eski-base64-sifre', "Etiketsiz base64 kayıt 'base64' ipucuyla doğru çözüldü");

// Eski `wsPassword`: düz metin — ipucu AÇIKÇA verilir
const legacyPlain = 'Düz-Metin-Şifre!2026';
assert(decryptSecret(legacyPlain, 'plaintext') === legacyPlain, "Etiketsiz kayıt 'plaintext' ipucuyla olduğu gibi döndü");

assert(isLegacyValue(legacyB64), 'isLegacyValue(base64) → true');
assert(isLegacyValue(legacyPlain), 'isLegacyValue(düz metin) → true');
assert(!isLegacyValue(sifreli), 'isLegacyValue(yeni şifreli) → false');
assert(!isLegacyValue(''), 'isLegacyValue(boş) → false');

// ─── BÖLÜM 5b: SEZGİ TUZAĞI — 'auto' neden varsayılan olmamalı ───────────────

section("5b. SEZGİ TUZAĞI — base64 alfabesindeki DÜZ METİN şifre");

// TUZAK seçimi HESAPLANMIŞTIR, tahmin değil. Sezgisel yolun kaydı bozabilmesi için
// değerin base64 çözümünün GEÇERLİ UTF-8 üretmesi VE yeniden kodlandığında birebir
// aynı çıkması gerekir (decodeLegacy'deki tur kontrolü).
//
//   'TWFu'  → base64 çözümü 'Man' (geçerli UTF-8) → tur tutuyor → BOZULUR
//   'Test2024' → çözümü geçersiz UTF-8 → tur tutmaz → bozulmaz (yanlış örnek olurdu)
//
// Yani tuzak dar ama GERÇEKTİR: şifresi base64 metni gibi görünen bir kullanıcıda
// gerçek şifre sessizce başka bir şifreye dönüşür.
const TUZAK = 'TWFu';
assert(decryptSecret(TUZAK, 'plaintext') === TUZAK,
       "'plaintext' ipucu ile base64 alfabesindeki düz metin şifre KORUNDU");

{
  // Belgeleyici karşı-örnek: ipucsuz ('auto') çağrı bu değeri bozar. Bu bir TEST
  // DEĞİLDİR — 'auto'nun neden kullanılmaması gerektiğinin gösterimidir. Bu yüzden
  // `pass/fail` DEĞİL `info` kullanılır (sayaçları şişirmemesi için).
  const sezgiselSonuc = decryptSecret(TUZAK);
  if (sezgiselSonuc === TUZAK) {
    info(`'auto' sezgisi bu örnekte kaydı bozmadı (${TUZAK}) — sezgi her zaman bozmaz, ama güvenilir de değil`);
  } else {
    info(`'auto' sezgisi kaydı BOZDU: '${TUZAK}' → çözülemeyen bayt dizisi — ipucunun neden zorunlu olduğunun gösterimi`);
  }
}

// ─── BÖLÜM 6: Boş / tanımsız ─────────────────────────────────────────────────

section('6. BOŞ VE TANIMSIZ GİRDİ');

assert(encryptSecret('') === undefined, "encryptSecret('') → undefined (boş şifre yazılmaz)");
assert(encryptSecret(undefined) === undefined, 'encryptSecret(undefined) → undefined');
assert(encryptSecret(null) === undefined, 'encryptSecret(null) → undefined');
assert(decryptSecret('') === '', "decryptSecret('') → ''");
assert(decryptSecret(undefined) === '', 'decryptSecret(undefined) → \'\'');
assert(decryptSecret(null) === '', 'decryptSecret(null) → \'\'');

// ─── BÖLÜM 7: Migrasyon idempotentliği ───────────────────────────────────────

section('7. MİGRASYON (idempotent)');

const tasindi = migrateLegacyValue(legacyB64, 'base64');
assert(!!tasindi && isEncrypted(tasindi), 'Legacy base64 → yeni biçime taşındı');
assert(decryptSecret(tasindi) === 'eski-base64-sifre', 'Taşınan değer doğru çözülüyor');

const ikinciKez = migrateLegacyValue(tasindi, 'base64');
assert(ikinciKez === tasindi, 'Zaten şifreli değer İKİNCİ kez şifrelenmedi (idempotent)');

const tasindiPlain = migrateLegacyValue(legacyPlain, 'plaintext');
assert(decryptSecret(tasindiPlain) === legacyPlain, 'Legacy düz metin taşındıktan sonra doğru çözülüyor');

// Sezgi tuzağı migrasyonda da kapalı olmalı: 'plaintext' ipucuyla bozulmaz.
const tasindiTuzak = migrateLegacyValue(TUZAK, 'plaintext');
assert(decryptSecret(tasindiTuzak) === TUZAK,
       "Migrasyon 'plaintext' ipucuyla base64 alfabesindeki şifreyi BOZMADI");

assert(migrateLegacyValue('', 'base64') === undefined, "migrateLegacyValue('') → undefined");

// ─── BÖLÜM 8: Fail-closed (anahtar yokken) ───────────────────────────────────

section('8. FAIL-CLOSED — ANAHTAR YOKKEN');

process.env.CREDENTIAL_ENCRYPTION_KEY = '';
delete process.env.JWT_SECRET;
resetVaultKeyCache();

assert(!vaultStatus().available, 'Anahtar yokken vaultStatus().available → false');
assert(vaultStatus().keySource === 'none', "Anahtar yokken keySource → 'none'");

// KRİTİK: anahtar yokken düz metin YAZILMAZ
assertThrows(() => encryptSecret('olmamalı'), 'Anahtar yokken encryptSecret HATA fırlattı (düz metin yazmadı)');

// KRİTİK: anahtar yokken şifreli kayıt sessizce '' dönmez
assertThrows(() => decryptSecret(sifreli), 'Anahtar yokken şifreli kayıt çözülemedi — açık hata');

// Etiketsiz legacy okuma anahtarsız da çalışır (mevcut kurulum kırılmaz)
assert(decryptSecret(legacyB64, 'base64') === 'eski-base64-sifre',
       'Anahtar yokken etiketsiz legacy kayıt yine okunabiliyor');

// ─── BÖLÜM 9: HKDF türetimi (CREDENTIAL_ENCRYPTION_KEY yokken) ───────────────

section('9. HKDF TÜRETİMİ (JWT_SECRET ile)');

process.env.CREDENTIAL_ENCRYPTION_KEY = '';
process.env.JWT_SECRET = 'test-jeton-anahtari-en-az-32-karakter-uzunlugunda';
resetVaultKeyCache();

assert(vaultStatus().available, 'JWT_SECRET varken kasa kullanılabilir');
assert(vaultStatus().keySource === 'JWT_SECRET-derived', 'Anahtar kaynağı JWT_SECRET-derived');

const turetilmisSifreli = encryptSecret('turetilmis-anahtar-testi');
assert(decryptSecret(turetilmisSifreli) === 'turetilmis-anahtar-testi', 'Türetilmiş anahtarla tur başarılı');

// Farklı JWT_SECRET → türetilmiş anahtar da farklı olmalı
process.env.JWT_SECRET = 'baska-bir-jeton-anahtari-en-az-32-karakter-uzunluk';
resetVaultKeyCache();
assertThrows(() => decryptSecret(turetilmisSifreli),
             'JWT_SECRET değişince eski kayıt çözülemedi (türetim gerçekten bağlı)');

// ─── BÖLÜM 10: Bozuk anahtar yapılandırması ──────────────────────────────────

section('10. BOZUK ANAHTAR YAPILANDIRMASI');

process.env.CREDENTIAL_ENCRYPTION_KEY = 'kisa-ve-gecersiz';
process.env.JWT_SECRET = 'test-jeton-anahtari-en-az-32-karakter-uzunlugunda';
resetVaultKeyCache();

assert(!vaultStatus().available, '32 bayta çözülemeyen anahtar → kasa kullanılamaz sayılır');
// 'none' DEĞİL 'misconfigured': anahtar var ama geçersiz. İkisini ayırmak önemli —
// 'none' deyip geçmek "anahtar tanımlamamışsınız" gibi okunur ve yanlış yapılandırmayı
// gizlerdi. Ayrıca vaultStatus() bu durumda HATA FIRLATMAMALIDIR (teşhis fonksiyonu).
assert(vaultStatus().keySource === 'misconfigured',
       "Bozuk anahtar keySource='misconfigured' olarak raporlandı (sessizce 'none' denmedi)",
       `gerçek: ${vaultStatus().keySource}`);
assertThrows(() => encryptSecret('x'),
             'Bozuk CREDENTIAL_ENCRYPTION_KEY sessizce JWT_SECRET\'e DÜŞMEDİ — açık hata');

// ─── Temizlik ────────────────────────────────────────────────────────────────

delete process.env.CREDENTIAL_ENCRYPTION_KEY;
delete process.env.JWT_SECRET;
resetVaultKeyCache();

// ─── Özet ────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(70)}`);
console.log(`ÖZET — Kimlik Bilgisi Kasası Regresyon Testi`);
console.log(`${'═'.repeat(70)}`);
// NOT: Özet biçimi BİLEREK `PASS: N | FAIL: N` — tools/dogrulama.ps1 içindeki
// `Invoke-Suite -Tip 'PASSFAIL'` çözümleyicisi bu kalıbı arar. Biçim değişirse
// paket "ozet satiri okunamadi" diyerek FAIL üretir.
console.log(`PASS: ${passCount} | FAIL: ${failCount}`);
console.log(`TOPLAM: ${passCount + failCount}`);
console.log(`${'═'.repeat(70)}\n`);

if (failCount > 0) {
  console.error(`❌ ${failCount} test BAŞARISIZ.`);
  process.exit(1);
}
console.log('✅ Tüm kasa regresyon testleri geçti.');
