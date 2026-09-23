/**
 * İŞBEY CLOUD — Kimlik Bilgisi Maskeleme Regresyon Testi
 * ======================================================
 * 2026-09-15: `server/security/credentialMask.ts` için regresyon testi.
 *
 * NEDEN GEREKLİ:
 *   Maskeleme, tek taraflı yapılırsa YENİ bir veri kaybı doğurur: GET maskeli
 *   döner, frontend aynı değeri PUT ile geri gönderirse sentinel gerçek
 *   anahtarın üzerine yazılır. Bu test ÜÇ ŞEYİ ayrı ayrı ölçer:
 *     1. Çıkışta secret düz metin DÖNMÜYOR.
 *     2. Girişte sentinel/boş değer mevcut anahtarı KORUYOR (silmiyor).
 *     3. Gerçek yeni değer gönderilince GÜNCELLENİYOR (aşırı koruma yok).
 *   (3) olmadan "her şeyi koru" davranışı, anahtar güncellemeyi imkânsız kılar.
 *
 * Kullanım: node --experimental-strip-types --experimental-loader /tmp/ts-resolve.mjs server/tests/credentialMaskRegressionTest.ts
 */

import {
  maskSecretField,
  maskSecretFields,
  maskHizliBilisimSettings,
  resolveSecretField,
  redactSecretsDeep,
  MASKED_SECRET,
} from '../security/credentialMask';

let pass = 0;
let fail = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS  ${name}`);
    pass++;
  } else {
    console.log(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    fail++;
  }
}

function section(t: string) {
  console.log('\n' + '─'.repeat(70));
  console.log(`… ${t}`);
  console.log('─'.repeat(70));
}

const GERCEK_ANAHTAR = 'e22f0bCANLIANAHTAR0123456789';

// ─── BÖLÜM 1: ÇIKIŞ MASKELEME ───────────────────────────────────────────────
section('1. ÇIKIŞ — secret düz metin DÖNMEMELİ');

assert(maskSecretField(GERCEK_ANAHTAR) === MASKED_SECRET,
  'apiKey değeri maskelenir');

assert(!maskSecretField(GERCEK_ANAHTAR).includes(GERCEK_ANAHTAR),
  'maskelenmiş değer orijinal anahtarın hiçbir parçasını İÇERMEZ');

assert(maskSecretField('') === '',
  'boş değer boş döner (yanlışlıkla "tanımlı" görünmez)');

assert(maskSecretField(undefined) === '' && maskSecretField(null as any) === '',
  'undefined/null güvenli şekilde boş döner');

// Uzunluk sızdırmamalı: farklı uzunluktaki anahtarlar aynı çıktıyı vermeli
assert(maskSecretField('kisa') === maskSecretField('cok-uzun-bir-anahtar-degeri-123456'),
  'maskeleme anahtar UZUNLUĞUNU sızdırmaz (kısa/uzun aynı çıktı)');

// ─── BÖLÜM 2: GİRİŞ — mevcut anahtar KORUNMALI ───────────────────────────────
section('2. GİRİŞ — sentinel/boş değer mevcut anahtarı KORUMALI (veri kaybı yok)');

assert(resolveSecretField(MASKED_SECRET, GERCEK_ANAHTAR) === GERCEK_ANAHTAR,
  'sentinel ("****") gönderilirse mevcut anahtar KORUNUR');

assert(resolveSecretField('', GERCEK_ANAHTAR) === GERCEK_ANAHTAR,
  'boş string gönderilirse mevcut anahtar KORUNUR');

assert(resolveSecretField('   ', GERCEK_ANAHTAR) === GERCEK_ANAHTAR,
  'yalnız boşluk gönderilirse mevcut anahtar KORUNUR');

assert(resolveSecretField(undefined, GERCEK_ANAHTAR) === GERCEK_ANAHTAR,
  'alan hiç gönderilmezse mevcut anahtar KORUNUR');

assert(resolveSecretField(null, GERCEK_ANAHTAR) === GERCEK_ANAHTAR,
  'null gönderilirse mevcut anahtar KORUNUR');

// En kritik senaryo: frontend GET'in maskesini forma yükleyip geri gönderirse
{
  const getYaniti = maskHizliBilisimSettings({ apiKey: GERCEK_ANAHTAR });
  const geriGonderilen = getYaniti.apiKey; // '****'
  const yazilacak = resolveSecretField(geriGonderilen, GERCEK_ANAHTAR);
  assert(yazilacak === GERCEK_ANAHTAR,
    'TAM DÖNGÜ: GET maskesi forma yüklenip geri gönderilse bile anahtar SİLİNMEZ');
  assert(yazilacak !== MASKED_SECRET,
    'TAM DÖNGÜ: sentinel asla gerçek anahtarın yerine yazılmaz');
}

// ─── BÖLÜM 3: GİRİŞ — gerçek yeni değer GÜNCELLENMELİ ───────────────────────
section('3. GİRİŞ — gerçek yeni değer güncellemeyi ENGELLEMEMELİ');

const YENI_ANAHTAR = 'yeni-anahtar-9876543210';
assert(resolveSecretField(YENI_ANAHTAR, GERCEK_ANAHTAR) === YENI_ANAHTAR,
  'gerçek yeni anahtar gönderilince GÜNCELLENİR (aşırı koruma yok)');

assert(resolveSecretField('*', GERCEK_ANAHTAR) === '*',
  'sentinel ile karışmayan kısa değer gerçek değer sayılır');

// ─── BÖLÜM 4: NESNE MASKELEME ───────────────────────────────────────────────
section('4. NESNE — settings objesi güvenli hâle gelmeli');

{
  const settings = {
    apiUrl: 'https://econnecttest.hizliteknoloji.com.tr',
    apiKey: GERCEK_ANAHTAR,
    apiUsername: 'isbey_admin',
    isTestMode: true,
  };
  const maskeli = maskHizliBilisimSettings(settings);
  const json = JSON.stringify(maskeli);

  assert(!json.includes(GERCEK_ANAHTAR),
    'maskelenmiş settings JSON\'unda gerçek anahtar YOK');
  assert(maskeli.hasApiKey === true,
    'hasApiKey=true döner (frontend "ayarlı mı" bilgisini bundan alır)');
  assert(maskeli.apiUrl === settings.apiUrl && maskeli.isTestMode === true,
    'secret OLMAYAN alanlar bozulmadan geçer (apiUrl, isTestMode)');
  assert(settings.apiKey === GERCEK_ANAHTAR,
    'girdi nesnesi MUTASYONA UĞRAMAZ (orijinal anahtar yerinde kalır)');
}

{
  const maskeli = maskHizliBilisimSettings({ apiKey: '', apiUrl: 'x' });
  assert(maskeli.hasApiKey === false,
    'anahtar yoksa hasApiKey=false (yanlış "tanımlı" izlenimi verilmez)');
}

assert(JSON.stringify(maskHizliBilisimSettings(undefined)) === '{}',
  'undefined settings güvenli şekilde boş obje döner');

// ─── BÖLÜM 5: DERİN SÜZGEÇ ──────────────────────────────────────────────────
section('5. DERİN SÜZGEÇ — iç içe yapılar da taranmalı');

{
  const icIce = {
    success: true,
    portalConfig: {
      apiKey: GERCEK_ANAHTAR,
      gbUrn: 'urn:mail:defaultgb',
      isTestMode: true,
    },
    dealers: [
      { id: 'd1', portalCredentials: { wsUsername: 'admin_x', wsPassword: 'gizli-sifre' } },
    ],
  };
  const suzulmus = redactSecretsDeep(icIce);
  const json = JSON.stringify(suzulmus);

  assert(!json.includes(GERCEK_ANAHTAR), 'iç içe apiKey temizlendi');
  assert(!json.includes('gizli-sifre'), 'iç içe wsPassword temizlendi');
  assert(suzulmus.portalConfig.gbUrn === 'urn:mail:defaultgb',
    'secret olmayan iç alan korunur (gbUrn)');
  assert(Array.isArray(suzulmus.dealers) && suzulmus.dealers.length === 1,
    'dizi yapısı bozulmaz (uzunluk korunur)');
  assert(suzulmus.dealers[0].portalCredentials.wsUsername === 'admin_x',
    'kullanıcı adı (secret değil) korunur — yalnız parola maskelenir');
}

// ─── BÖLÜM 6: TUTARLILIK ────────────────────────────────────────────────────
section('6. TUTARLILIK — sızıntı noktalarında aynı sentinel kullanılmalı');

assert(MASKED_SECRET === '****',
  'sentinel tanımı tek kaynaktan gelir (modüller arası tutarlılık)');

{
  const alanlar = maskSecretFields(
    { apiKey: GERCEK_ANAHTAR, apiSecret: 'sk-gizli' },
    ['apiKey', 'apiSecret'],
    { hasApiKey: (h) => h, hasApiSecret: (h) => h },
  );
  assert(alanlar.apiKey === MASKED_SECRET && alanlar.apiSecret === MASKED_SECRET,
    'çoklu secret alanı birlikte maskelenir');
  assert(alanlar.hasApiKey === true && alanlar.hasApiSecret === true,
    'her secret alanı için has* boolean üretilir');
}

// ─── ÖZET ───────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('ÖZET — Kimlik Bilgisi Maskeleme Regresyon Testi');
console.log('='.repeat(70));
console.log(`PASS: ${pass} | FAIL: ${fail}`);
console.log(`TOPLAM: ${pass + fail}`);
console.log('='.repeat(70));

if (fail > 0) {
  console.log(`\n❌ ${fail} test başarısız.`);
  process.exit(1);
} else {
  console.log('\n✅ Tüm maskeleme regresyon testleri geçti.');
  process.exit(0);
}
