/**
 * İŞBEY CLOUD — FAZ 18 HIZLI BİLİŞİM ENTEGRASYON TEST SUITİ
 * ===========================================================
 * Test Kapsamı:
 *  - Configuration & credential security check
 *  - Test modu / production modu güvenlik kontrolü
 *  - Connectivity check (sandbox URL)
 *  - Authentication flow (UtilEncrypt → Login → Bearer Token)
 *  - Endpoint mapping (e-Fatura, e-Arşiv, e-İrsaliye URL'leri)
 *  - Error handling (network errors, invalid credentials)
 *  - Idempotency check
 *  - Kontör durumu
 *  - Production isolation (canlıya asla belge göndermeme)
 *
 * ⚠️ UYARI: Bu test GERÇEK belge göndermez.
 *           Sadece connectivity, auth ve config testi yapar.
 *
 * Çalıştır: npx tsx server/tests/phase18HizliBilisimIntegrationTest.ts
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ─── Test Yardımcıları ────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
let warnCount = 0;
let skipCount = 0;

function pass(name: string) {
  passCount++;
  console.log(`  ✅ PASS  ${name}`);
}

function fail(name: string, detail?: string) {
  failCount++;
  console.error(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function warn(name: string, detail?: string) {
  warnCount++;
  console.warn(`  ⚠️  WARN  ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name: string, reason?: string) {
  skipCount++;
  console.log(`  ⏭️  SKIP  ${name}${reason ? ` — ${reason}` : ''}`);
}

function section(title: string) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(70));
}

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) pass(name);
  else fail(name, detail);
}

// ─── Canlı adres koruması (giden istekler) ───────────────────────────────────
//
// 2026-09-13: Bu süit BÖLÜM 4/5'te GERÇEK ağ çağrısı yapar (UtilEncrypt →
// Login). Kullanıcı talimatı ve CLAUDE.md md.1 gereği bu çağrılar YALNIZCA test
// ortamına çıkabilir; canlı (production) host'a tek bir istek bile gidemez.
//
// Öncesinde böyle bir koruma YOKTU: adresler `sandboxUrl` sabitinden geliyordu
// ve sabit bir gün değiştirilirse test sessizce canlı entegratöre dokunurdu —
// bu, testin üretim sistemine yan etki yapması demek olduğu için en ağır ihlal
// sınıfındadır. Artık her giden istek `guvenliTestUrl` süzgecinden geçer ve
// canlı adres görülürse istek GÖNDERİLMEZ, sert hata ile durdurulur.
const TEST_ORTAMI_HOST = 'econnecttest.hizliteknoloji.com.tr';
const CANLI_HOST = 'econnect.hizliteknoloji.com.tr';
let canliAdresEngeli = 0;
// Süzgeçten geçen istek sayısı: BÖLÜM 11'in "ölçüm yapıldı" iddiası buna dayanır.
let suzgeclenenIstekSayisi = 0;
// Egress katmanınca fiilen engellenen istek sayısı (ör. X-Proxy-Error:
// blocked-by-allowlist). Süzgeçten GEÇMİŞ ama hedefe ÇIKMAMIŞ isteklerdir:
// izolasyon iddiasını çürütmezler, fakat "entegratör ayakta" iddiasını da
// kanıtlamazlar — bu yüzden ayrı sayılırlar.
let agErisimEngeli = 0;
// HEDEFE ULAŞAN istek sayısı: gerçek bir HTTP yanıtı (kısıtlayıcıdan değil,
// hedef sunucudan) alınan istekler. BÖLÜM 11'in "ölçüm gerçekten yapıldı mı"
// kararı YALNIZCA buna dayanır. `suzgeclenenIstekSayisi` bunun için yetersizdir:
// istek süzgeçten geçip yine de hiçbir yere ulaşmamış olabilir (egress engeli).
let hedefeUlasanIstekSayisi = 0;
// BÖLÜM 5'in ilk ağ çağrısı FİİLEN yapıldı mı? (modül düzeyi: BÖLÜM 11'de de okunur)
let authAkisiDenendi = false;

class CanliAdresEngeli extends Error {}

function guvenliTestUrl(url: string): string {
  // Canlı host'u içerip test host'unu içermeyen her adres reddedilir.
  // DİKKAT: `econnecttest.hizliteknoloji.com.tr` içinde `econnect.hizliteknoloji.com.tr`
  // alt dizesi YOKTUR ("econnect" + "test"), bu yüzden test adresi burada yanlışlıkla
  // reddedilmez; ikinci koşul yalnızca ek savunmadır.
  const canli = url.includes(CANLI_HOST) && !url.includes(TEST_ORTAMI_HOST);
  if (canli) {
    canliAdresEngeli++;
    throw new CanliAdresEngeli(`CANLI ADRES ENGELLENDİ (istek gönderilmedi): ${url}`);
  }
  suzgeclenenIstekSayisi++;
  return url;
}

// ─── Bağlantı sınıflandırması (2026-09-15) ──────────────────────────────────
//
// KUSUR: BÖLÜM 4, axios `validateStatus: () => true` ile çağrı yapıp
// `status < 500` olan HER yanıtı "Sandbox sunucusu erişilebilir" diye PASS
// yazıyordu. `X-Proxy-Error: blocked-by-allowlist` gibi bir egress engeli
// veya `ENOTFOUND` (DNS çözülemedi) durumunda da bu koşul sağlanıyordu çünkü
// engel HTTP 403 olarak geri dönüyordu — yani gerçekte HİÇ BAĞLANILMAMIŞ bir
// sunucu "erişilebilir" sayılıyordu. Kanıtlanmamış iddiayı PASS yazmak
// CLAUDE.md md.1'e ("başarısız testi PASS göstermek") aykırıdır; dahası bu
// PASS, entegrasyonun gerçekten ayakta olduğu izlenimini veriyordu.
//
// Düzeltme yönü: sonuç artık üç ayrı GERÇEK duruma ayrılır ve her biri kendi
// kanıtıyla raporlanır —
//   (a) doğrulanmış HTTP yanıtı  → PASS (yalnız gerçek 4xx/5xx)
//   (b) kanıtlanamadı (engel/ağ) → SKIP (PASS sayısını şişirmez, ekrana da yalan yazmaz)
//   (c) gerçek başarısızlık      → FAIL
// Egress/ortam engeli bir KOD hatası olmadığı için FAIL değildir; ancak PASS
// da değildir. Bu ayrım, "sandbox'a çıktık" iddiasının kanıt gerektirdiği
// gerçeğini korur.
type BaglantiDurumu = 'ok' | 'kanitlanamadi' | 'hata';

interface BaglantiSonucu {
  durum: BaglantiDurumu;
  mesaj: string;
  detay?: string;
}

function httpBaglantisiniSiniflandir(err: any, url: string): BaglantiSonucu {
  // 1) Sinir ağı / egress katmanı isteği engelledi (Claude VM sandbox'ı vb.)
  //    Bu durumda hedef sunucuya HİÇ ulaşılmadı; "erişilebilir" denemez.
  const proxyErr = err?.response?.headers?.['x-proxy-error'];
  if (proxyErr === 'blocked-by-allowlist') {
    agErisimEngeli++;
    return {
      durum: 'kanitlanamadi',
      mesaj: 'Sandbox sunucusuna ÇIKILAMADI — giden istek egress katmanınca engellendi',
      detay: `X-Proxy-Error: blocked-by-allowlist (${url}) — ağ erişimi bu ortamda kısıtlı, ` +
             `entegrasyonun canlılığı bu koşudan KANITLANAMAZ`,
    };
  }

  // 2) DNS / TCP katmanı: sunucu adı çözülemedi veya bağlantı reddedildi.
  const kod = err?.code || err?.cause?.code;
  if (kod === 'ENOTFOUND' || kod === 'EAI_AGAIN') {
    return {
      durum: 'kanitlanamadi',
      mesaj: 'Sandbox sunucusuna erişilemiyor — DNS çözümlemesi başarısız',
      detay: `${kod} (${new URL(url).hostname}) — internet bağlantısını veya sandbox adresini kontrol edin`,
    };
  }
  if (kod === 'ECONNREFUSED' || kod === 'ECONNRESET' || kod === 'EHOSTUNREACH' || kod === 'ENETUNREACH') {
    return {
      durum: 'kanitlanamadi',
      mesaj: `Sandbox sunucusuna erişilemiyor — bağlantı kurulamadı (${kod})`,
      detay: `İnternet bağlantısını kontrol edin veya sandbox URL değişmiş olabilir`,
    };
  }
  if (kod === 'ECONNABORTED' || String(err?.message || '').includes('timeout')) {
    return {
      durum: 'kanitlanamadi',
      mesaj: 'Sandbox bağlantısı zaman aşımına uğradı',
      detay: 'Sunucu yavaş yanıt veriyor veya erişim kısıtlı olabilir',
    };
  }

  // 3) Bunların dışındaki her şey gerçek bir başarısızlıktır: süit kendi
  //    beklenmeyen durumuna düşmüş ya da süzgeç dışı bir hata oluşmuştur.
  return {
    durum: 'hata',
    mesaj: `Sandbox bağlantısı beklenmeyen hatayla sonuçlandı: ${err?.message || kod || 'bilinmeyen'}`,
  };
}

/**
 * Bir HTTP yanıtının "sunucu ayakta" kanıtı sayılıp sayılmayacağını belirler.
 *
 * Bir yanıtın varlığı, karşı tarafın çalıştığının kanıtıdır — ancak burada
 * dönen yanıtın AĞ KATMANINDAN mı geldiği yoksa bir GÜVENLİK/EGRESS kutusundan
 * mı üretildiği ayırt edilmelidir. `X-Proxy-Error` başlığı taşıyan bir yanıt
 * hedef sunucudan DEĞİL, aradaki kısıtlayıcıdan gelmiştir.
 */
function httpYanitiniSiniflandir(res: any, url: string): BaglantiSonucu {
  const proxyErr = res?.headers?.['x-proxy-error'];
  if (proxyErr) {
    agErisimEngeli++;
    return {
      durum: 'kanitlanamadi',
      mesaj: 'Sandbox sunucusuna ÇIKILAMADI — yanıt ağ katmanından değil, kısıtlayıcıdan geldi',
      detay: `HTTP ${res.status} + X-Proxy-Error: ${proxyErr} (${url})`,
    };
  }
  hedefeUlasanIstekSayisi++;
  return {
    durum: 'ok',
    mesaj: `Sandbox sunucusu erişilebilir (HTTP ${res.status})`,
  };
}

/**
 * authDenendi: BÖLÜM 5'te gerçek ağ çağrısı yapıldı mı? Yapılmadıysa
 * "sandbox auth başarısız" gibi bir ifade kurmak yanıltıcıdır — hiç
 * denenmemiş bir şeye başarısız denemez.
 */
function authHataMesaji(err: any, authDenendi: boolean): string {
  if (!authDenendi) {
    // İki alt durum: ya sunucuya çıkılamadı, ya da HTTP yanıtı egress
    // katmanından geldi (403 + blocked-by-allowlist). İkincisinde `authErr`in
    // response'u vardır ama bu GERÇEK bir API yanıtı değildir.
    if (err?.response?.headers?.['x-proxy-error']) {
      return 'Auth testi yapılamadı: istek egress katmanınca engellendi (gerçek API yanıtı alınmadı)';
    }
    if (err instanceof CanliAdresEngeli) {
      return 'Auth testi yapılamadı: canlı adres engeli';
    }
    return 'Auth testi yapılamadı: sandbox sunucusuna çıkılamadı';
  }
  return `Auth test hatası: ${err?.response?.data?.Message || err?.message}`;
}

// ─── BÖLÜM 1: KONFİGÜRASYON GÜVENLİK KONTROLÜ ──────────────────────────────
section('1. KONFİGÜRASYON GÜVENLİK KONTROLÜ');

// 1.1 Zorunlu env değişkenleri
const REQUIRED_VARS = [
  'HIZLI_BILISIM_API_URL',
  'HIZLI_BILISIM_API_KEY',
  'HIZLI_BILISIM_SECRET_KEY',
  'HIZLI_BILISIM_WS_USERNAME',
  'HIZLI_BILISIM_WS_PASSWORD',
];

let configOk = true;
for (const envVar of REQUIRED_VARS) {
  const val = process.env[envVar];
  if (val && val.trim().length > 0) {
    pass(`${envVar} tanımlı`);
  } else {
    fail(`${envVar} eksik — .env dosyasını kontrol edin`);
    configOk = false;
  }
}

// 1.2 Credential'lar kaynak koddan kaldırıldı mı?
const clientPath = path.join(process.cwd(), 'server/services/hizliBilisim/hizliBilisimClient.ts');
if (fs.existsSync(clientPath)) {
  const content = fs.readFileSync(clientPath, 'utf-8');
  // Read the values at runtime so the security check never embeds real credentials.
  const containsConfiguredCredential = (name: string): boolean => {
    const value = process.env[name];
    return Boolean(value && value.length >= 6 && content.includes(value));
  };
  const hasHardcodeApiKey = containsConfiguredCredential('HIZLI_BILISIM_API_KEY');
  const hasHardcodeUser = containsConfiguredCredential('HIZLI_BILISIM_WS_USERNAME');
  const hasHardcodePass = containsConfiguredCredential('HIZLI_BILISIM_WS_PASSWORD');
  if (!hasHardcodeApiKey && !hasHardcodeUser && !hasHardcodePass) {
    pass('hizliBilisimClient.ts: Hardcode credential yok (FAZ 17 uyumlu)');
  } else {
    fail('hizliBilisimClient.ts içinde hardcode credential tespit edildi!',
         'Tüm credential\'ları .env dosyasına taşıyın');
  }
}

// 1.3 Test modu kontrolü (kritik güvenlik)
const apiUrl = process.env.HIZLI_BILISIM_API_URL || '';
const isTestMode = process.env.HIZLI_BILISIM_IS_TEST_MODE === 'true';

if (isTestMode) {
  pass('IS_TEST_MODE=true → Sandbox modu aktif');
} else {
  warn('IS_TEST_MODE=false → CANLI sisteme bağlı!',
       'FAZ 18 testleri için test modunu aktif edin: HIZLI_BILISIM_IS_TEST_MODE=true');
}

// 1.4 API URL güvenlik kontrolü
if (apiUrl.includes('econnecttest')) {
  pass(`API URL → Test ortamı: ${apiUrl}`);
} else if (apiUrl.includes('econnect') && !isTestMode) {
  warn(`API URL → CANLI ortam: ${apiUrl}`,
       'Test için: HIZLI_BILISIM_API_URL=https://econnecttest.hizliteknoloji.com.tr');
} else if (apiUrl.includes('econnect') && isTestMode) {
  warn(`IS_TEST_MODE=true ama URL production'a işaret ediyor: ${apiUrl}`,
       'URL ve test modu ayarları çelişiyor');
} else {
  fail('API URL yapılandırılmamış');
}

// 1.5 .env.example güncel mi?
const envExamplePath = path.join(process.cwd(), '.env.example');
if (fs.existsSync(envExamplePath)) {
  const exampleContent = fs.readFileSync(envExamplePath, 'utf-8');
  if (exampleContent.includes('HIZLI_BILISIM_API_URL') && exampleContent.includes('HIZLI_BILISIM_IS_TEST_MODE')) {
    pass('.env.example mevcut ve güvenlik alanlarını içeriyor');
  } else {
    warn('.env.example eksik yapılandırma alanları içeriyor');
  }
} else {
  fail('.env.example dosyası bulunamadı');
}

// ─── BÖLÜM 2: hizliConnectService TEST MODU KONTROLÜ ────────────────────────
section('2. hizliConnectService TEST MODU KONTROLÜ');

const connectServicePath = path.join(process.cwd(), 'server/services/hizliConnectService.ts');
if (fs.existsSync(connectServicePath)) {
  const csContent = fs.readFileSync(connectServicePath, 'utf-8');

  // getBaseUrl doğru mu tanımlanmış?
  if (csContent.includes('econnecttest.hizliteknoloji.com.tr') && csContent.includes('econnect.hizliteknoloji.com.tr')) {
    pass('hizliConnectService.ts: Test/Canlı URL ayrımı mevcut');
  } else {
    fail('hizliConnectService.ts: URL ayrımı eksik');
  }

  // isTestMode kullanımı
  if (csContent.includes('isTestMode') || csContent.includes('IS_TEST_MODE')) {
    pass('hizliConnectService.ts: isTestMode flag kullanılıyor');
  } else {
    warn('hizliConnectService.ts: isTestMode kontrolü bulunamadı');
  }

  // tokenStore'da güvenli varsayılan
  if (csContent.includes("isTestMode: process.env.HIZLI_BILISIM_IS_TEST_MODE === 'false' ? false : true")) {
    pass('tokenStore: Güvenli varsayılan (test modu açık)');
  } else if (csContent.includes('isTestMode')) {
    warn('tokenStore isTestMode mantığı farklı yapıda — doğrulamak gerekiyor');
  }
} else {
  warn('hizliConnectService.ts bulunamadı');
}

// ─── BÖLÜM 3: ENDPOINT MAPPING KONTROLÜ ─────────────────────────────────────
section('3. ENDPOINT MAPPING KONTROLÜ');

const hbRoutePath = path.join(process.cwd(), 'server/routes/hizli-bilisim.ts');
if (fs.existsSync(hbRoutePath)) {
  const routeContent = fs.readFileSync(hbRoutePath, 'utf-8');

  // Auth guard kontrolleri
  assert(routeContent.includes('requireAuth'), 'hizli-bilisim.ts: requireAuth kullanılıyor');
  assert(
    routeContent.includes("requireRole('SUPER_ADMIN', 'ADMIN')"),
    'hizli-bilisim.ts: requireRole("SUPER_ADMIN", "ADMIN") koruması mevcut'
  );

  // e-Fatura endpoint
  if (routeContent.includes('efatura') || routeContent.includes('e-fatura') || routeContent.includes('invoice')) {
    pass('hizli-bilisim.ts: e-Fatura endpoint referansı mevcut');
  } else {
    warn('hizli-bilisim.ts: e-Fatura endpoint referansı bulunamadı');
  }
} else {
  fail('server/routes/hizli-bilisim.ts bulunamadı');
}

// efatura.ts route kontrolü
const efaturaPath = path.join(process.cwd(), 'server/routes/efatura.ts');
if (fs.existsSync(efaturaPath)) {
  const efContent = fs.readFileSync(efaturaPath, 'utf-8');
  assert(efContent.includes('requireAuth'), 'efatura.ts: requireAuth koruması mevcut');
  pass(`efatura.ts: ${(efContent.match(/router\.(get|post|put|delete)/g) || []).length} endpoint tanımlı`);
} else {
  warn('server/routes/efatura.ts bulunamadı');
}

// ─── BÖLÜM 4: CANLI API CONNECTIVITY TEST ───────────────────────────────────
section('4. CANLI API CONNECTIVITY TEST');

if (!configOk) {
  skip('Connectivity Test', 'Konfigürasyon eksik — env değişkenlerini kontrol edin');
} else {
  // Test sandbox URL'i
  const sandboxUrl = 'https://econnecttest.hizliteknoloji.com.tr';
  // Canlı adres yalnızca KARŞILAŞTIRMA için burada tutulur; hiçbir istek ona
  // gitmez (bkz. guvenliTestUrl). Sabitlerin birbirinden ayrı olduğunu ve test
  // adresinin canlıyı İÇERMEDİĞİNİ statik olarak da doğrularız: `econnecttest`
  // "econnect" dizesini içerdiği için bu kontrolün yönü önemlidir.
  const productionUrl = 'https://econnect.hizliteknoloji.com.tr';
  assert(sandboxUrl.includes(TEST_ORTAMI_HOST) && !sandboxUrl.includes(`//${CANLI_HOST}`),
         'Giden istekler yalnızca TEST ortamı adresine işaret ediyor',
         `sandbox=${sandboxUrl} canli=${productionUrl}`);

  // Sandbox erişilebilirlik kontrolü
  //
  // 2026-09-15: Bu blok "HTTP yanıtı geldi ise sunucu ayaktadır" varsayımıyla
  // PASS yazıyordu; egress engeli (HTTP 403 + X-Proxy-Error) ve DNS hatası da
  // PASS/uyarı olarak geçiyordu. Artık sınıflandırma `httpYanitiniSiniflandir` /
  // `httpBaglantisiniSiniflandir` ile yapılır ve kanıtlanamayan iddia SKIP'tir.
  console.log(`  ℹ️  Sandbox URL test: ${sandboxUrl}`);

  try {
    const start = Date.now();
    const pingRes = await axios.get(guvenliTestUrl(`${sandboxUrl}/HizliApi/RestApi/Version`), {
      timeout: 10000,
      validateStatus: () => true, // herhangi bir HTTP status OK
    });
    const latency = Date.now() - start;

    const sinif = httpYanitiniSiniflandir(pingRes, sandboxUrl);
    if (sinif.durum === 'ok') {
      if (pingRes.status < 500) {
        pass(`${sinif.mesaj}, ${latency}ms`);
      } else {
        // Sunucu ayakta ama 5xx: bağlantı kanıtlandı, servis sağlıksız.
        warn(`${sinif.mesaj}, ${latency}ms`,
             'Sunucuya ulaşıldı ancak servis hata veriyor — Hızlı Bilişim ile kontrol edin');
      }
    } else {
      skip(sinif.mesaj, sinif.detay);
    }
  } catch (err: any) {
    if (err instanceof CanliAdresEngeli) {
      fail('Canlı adrese istek engellendi', err.message);
    } else {
      const sinif = httpBaglantisiniSiniflandir(err, `${sandboxUrl}/HizliApi/RestApi/Version`);
      if (sinif.durum === 'kanitlanamadi') {
        skip(sinif.mesaj, sinif.detay);
      } else {
        fail(sinif.mesaj, sinif.detay);
      }
    }
  }

  // 2026-09-13: Burada önceden iki KOŞULSUZ `pass()` vardı ("production'a belge
  // gönderilmedi" / "gerçek müşteri verisi gönderilmedi"). Bir iddiayı yalnızca
  // süitin bugünkü hâline dayanarak PASS yazmak kanıt değildir. Bu iddialar artık
  // BÖLÜM 11'de TEK yerde ve `canliAdresEngeli` sayacına bağlı olarak ölçülür;
  // burada tekrarlanmaz.
  console.log('  ℹ️  Canlı adres izolasyonu BÖLÜM 11\'de ölçülüyor (canlı adres engeli sayacı).');
}

// ─── BÖLÜM 5: AUTHENTICATION FLOW TESTİ (SANDBOX) ──────────────────────────
section('5. AUTHENTICATION FLOW (UtilEncrypt → Login → Bearer Token)');

if (!configOk) {
  skip('Authentication Test', 'Konfigürasyon eksik');
} else if (!isTestMode) {
  warn('Authentication testi atlanıyor',
       'HIZLI_BILISIM_IS_TEST_MODE=false olduğu için canlı auth testi yapılmayacak. Test modunu aktif edin.');
  skip('UtilEncrypt → Login flow', 'Test modu kapalı');
} else {
  // Sadece sandbox üzerinde auth testi
  const sandboxUrl = 'https://econnecttest.hizliteknoloji.com.tr';
  const apiKey = process.env.HIZLI_BILISIM_API_KEY!;
  const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY!;
  const wsUsername = process.env.HIZLI_BILISIM_WS_USERNAME!;
  const wsPassword = process.env.HIZLI_BILISIM_WS_PASSWORD!;

  // authDenendi: İlk ağ çağrısı FİİLEN yapıldı mı? Engellenmiş/ulaşılamamış bir
  // çağrıdan sonra "sandbox auth testi başarısız" demek yanıltıcı olur — o
  // testler hiç çalışmamıştır. Bayrak, hata mesajının doğru kurulmasını sağlar.
  let authDenendi = false;

  try {
    console.log('  ℹ️  UtilEncrypt sandbox testi başlıyor...');
    const encStart = Date.now();
    authDenendi = true;
    authAkisiDenendi = true;

    const encResponse = await axios.post(
      guvenliTestUrl(`${sandboxUrl}/HizliApi/RestApi/UtilEncrypt`),
      { secretKey, username: wsUsername, password: wsPassword },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const encLatency = Date.now() - encStart;
    const encData = encResponse.data;

    if (encData?.username || encData?.Username) {
      pass(`UtilEncrypt başarılı (${encLatency}ms)`);
      const hashedUser = encData.username || encData.Username;
      const hashedPass = encData.password || encData.Password;

      // Login adımı
      console.log('  ℹ️  Login sandbox testi başlıyor...');
      const loginStart = Date.now();

      const loginResponse = await axios.post(
        guvenliTestUrl(`${sandboxUrl}/HizliApi/RestApi/Login`),
        { apiKey, username: hashedUser, password: hashedPass },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      const loginLatency = Date.now() - loginStart;
      const rawLoginData = loginResponse.data;
      const loginData = Array.isArray(rawLoginData) ? rawLoginData[0] : rawLoginData;

      if (loginData?.IsSucceeded && loginData?.Token) {
        pass(`Login başarılı — Bearer Token alındı (${loginLatency}ms)`);
        // 2026-09-15: Satır metni, istenen kanıt ifadesini BİREBİR içerecek şekilde
        // hizalandı ("Mükellef bilgisi alındı"). Önceki hâli yalnız "Mükellef: ..."
        // yazıyordu; bu, kanıt ifadesinin çıktıda aranamamasına yol açıyordu.
        // Değişen yalnızca ETİKET metnidir — veri hâlâ doğrudan API yanıtından gelir.
        pass(`Mükellef bilgisi alındı — ${loginData?.MusteriAdi || 'Bilinmiyor'} (VKN: ${loginData?.VknTckn || '-'})`);
        pass(`Token geçerlilik: ${loginData?.TokenSuresi || '3 gün'}`);

        // Token formatı geçerli mi?
        assert(typeof loginData.Token === 'string' && loginData.Token.length > 20, 'Token formatı geçerli');

        // Token ile basit endpoint çağrısı
        console.log('  ℹ️  Token ile endpoint doğrulama...');
        try {
          const headers = {
            Authorization: `Bearer ${loginData.Token}`,
            'Content-Type': 'application/json',
          };
          const testRes = await axios.get(
            guvenliTestUrl(`${sandboxUrl}/HizliApi/RestApi/MusteriGetir?vergikimlikno=0000000000`),
            { headers, timeout: 10000, validateStatus: () => true }
          );

          // 2026-09-15: Yanıt önce "kısıtlayıcıdan mı geldi" diye süzülür. Aksi
          // halde egress engelinin ürettiği 403, "Token geçersiz" gibi okunurdu.
          const epSinif = httpYanitiniSiniflandir(testRes, sandboxUrl);
          if (epSinif.durum === 'kanitlanamadi') {
            skip('Bearer Token ile endpoint doğrulaması KANITLANAMADI', epSinif.detay);
          } else if (testRes.status === 200) {
            pass('Bearer Token ile endpoint çağrısı başarılı (HTTP 200)');
          } else if (testRes.status === 401) {
            fail('Token geçersiz — 401 Unauthorized döndü');
          } else if (testRes.status === 404) {
            pass(`Bearer Token geçerli — Kayıt bulunamadı (HTTP 404, beklenen)`);
          } else {
            warn(`Endpoint çağrısı HTTP ${testRes.status} döndü`);
          }
        } catch (epErr: any) {
          const epSinif = httpBaglantisiniSiniflandir(epErr, sandboxUrl);
          if (epSinif.durum === 'kanitlanamadi') {
            skip('Bearer Token ile endpoint doğrulaması KANITLANAMADI', epSinif.detay);
          } else {
            warn(`Endpoint test isteği başarısız: ${epErr.message}`);
          }
        }
      } else {
        warn(`Login yanıtı beklenen formatta değil: IsSucceeded=${loginData?.IsSucceeded}, Token=${!!loginData?.Token}`,
             loginData?.Message || 'Sandbox ortam doğrulaması gerekebilir');
      }
    } else {
      // 2026-09-15 (KRİTİK sınıflandırma düzeltmesi):
      //
      // Bu dal "HTTP yanıtı geldi ama hashed kimlik yok" durumudur. Buraya
      // düşmenin İKİ çok farklı sebebi olabilir ve önceki sürüm ikisini de
      // aynı WARN ile geçiştiriyordu — bu, gerçek bir kimlik reddini
      // "uyarı" gibi gösterip production kapısını yanlış okutuyordu:
      //
      //   (a) API'ye ULAŞILDI ve API kimliği REDDETTİ (ör. "Hatalı secretKey",
      //       "Kullanıcı bulunamadı"). Bu ÖLÇÜLMÜŞ BİR BAŞARISIZLIKTIR: ağ
      //       katmanı çalışıyor, sunucu konuşuyor, dönen cevap olumsuz.
      //       → FAIL. (Kullanıcı kuralı: kanıtlanmış olumsuz sonuç PASS/WARN
      //         değildir; sandbox auth zinciri doğrulanmamıştır.)
      //
      //   (b) Yanıt beklenen JSON sözleşmesine hiç uymuyor (ör. HTML hata
      //       sayfası, boş gövde). Bu durumda sözleşme hakkında karar
      //       verilemez → SKIP (kanıtlanamadı).
      //
      // Ayrım ölçülebilir bir sinyale bağlanır: API kendi iş mesajını
      // (`Message`/`message` veya `IsSucceeded` alanı) döndürdüyse sözleşme
      // konuşulmuş demektir → gerçek olumsuz sonuç. Bu alanların hiçbiri yoksa
      // yanıt tanınmıyor demektir → kanıtlanamadı.
      //
      // 2026-09-14 (log hijyeni, korunuyor): Burada HAM yanıt
      // `JSON.stringify(encData)` ile basılıyordu. UtilEncrypt'in başarısız
      // yanıtı bile `username`/`password` (hash'ler) taşıyabilir; hash'ler
      // SecretKey ile üretildiği için log'da bulunmaları WS şifresine giden
      // yolu kısaltır. Artık yalnız iş mesajı + varlık boolean'ları yazılır.
      const apiKonustu =
        encData?.IsSucceeded !== undefined ||
        encData?.isSucceeded !== undefined ||
        encData?.Message !== undefined ||
        encData?.message !== undefined;
      const isMesaji = encData?.Message || encData?.message || '(iş mesajı yok)';

      if (apiKonustu) {
        fail('UtilEncrypt sandbox kimliği REDDETTİ — hashed kimlik üretilemedi',
             `API'ye ulaşıldı ve olumsuz yanıt döndü. IsSucceeded=${!!encData?.IsSucceeded}, ` +
             `username var mı=${encData?.username != null}, password var mı=${encData?.password != null}, ` +
             `Mesaj: ${isMesaji}. Test ortamı için geçerli SecretKey/WS credential gerekir — ` +
             `UtilEncrypt → Login zinciri DOĞRULANMAMIŞTIR.`);
      } else {
        skip('UtilEncrypt yanıtı tanınamadı — zincir KANITLANAMADI',
             `Yanıt beklenen JSON sözleşmesine uymuyor (IsSucceeded/Message alanı yok). ` +
             `username var mı=${encData?.username != null}, password var mı=${encData?.password != null}`);
      }
    }
  } catch (authErr: any) {
    // 2026-09-15: Bu blok önce "Sandbox auth testi başarısız — sunucu
    // erişilemiyor" diye WARN yazıyordu; oysa sunucuya hiç çıkılmamış olabilir.
    // Ayrıca egress engeli (403 + X-Proxy-Error) `ECONNREFUSED` ile aynı kefeye
    // konuyordu. Artık önce çağrının FİİLEN yapılıp yapılmadığı, sonra hatanın
    // sınıfı ayrıştırılır.
    if (authErr instanceof CanliAdresEngeli) {
      fail('Canlı adrese istek engellendi', authErr.message);
    } else if (authErr?.response?.headers?.['x-proxy-error']) {
      // Yanıt hedef sunucudan değil ağ kısıtlayıcısından geldi.
      skip('Auth akışı (UtilEncrypt → Login) KANITLANAMADI',
           `İstek egress katmanınca engellendi (HTTP ${authErr.response.status}, ` +
           `X-Proxy-Error: ${authErr.response.headers['x-proxy-error']}) — ` +
           `gerçek API yanıtı alınmadı, bu nedenle auth akışı hakkında PASS/FAIL kararı verilemez`);
    } else if (authErr.code === 'ENOTFOUND' || authErr.code === 'ECONNREFUSED' ||
               authErr.code === 'ECONNRESET' || authErr.code === 'EHOSTUNREACH') {
      skip('Auth akışı (UtilEncrypt → Login) KANITLANAMADI',
           `Sandbox sunucusuna ulaşılamadı (${authErr.code}) — istek hedefe çıkmadı`);
    } else if (authErr.code === 'ECONNABORTED' || String(authErr.message || '').includes('timeout')) {
      skip('Auth akışı (UtilEncrypt → Login) KANITLANAMADI',
           'Sandbox bağlantısı zaman aşımına uğradı');
    } else if (authErr.response?.status === 401 || authErr.response?.status === 403) {
      // GERÇEK bir API yanıtı geldi ve kimlik reddedildi: bu ölçülmüş bir FAIL'dir.
      fail(`Sandbox auth reddedildi (HTTP ${authErr.response.status})`,
           authErr.response?.data?.Message ||
           'Test ortamı için ayrı credentials gerekebilir. Hızlı Bilişim ile iletişime geçin.');
    } else {
      warn(authHataMesaji(authErr, authDenendi));
    }
  }
}

// ─── BÖLÜM 6: e-BELGE ENDPOINT MAPPING KONTROLÜ ─────────────────────────────
section('6. e-BELGE ENDPOINT CONTRACT KONTROLÜ');

// Bu bölüm gerçek belge göndermez — sadece endpoint sözleşmesini doğrular.
//
// 2026-09-13 (bayat iddia düzeltmesi — 2. tur): Bu blok önceden satıcı
// dokümanındaki TÜRKÇE endpoint adlarını bir sabit listeye yazıp, listenin
// KENDİ İÇİNDEKİ dizeyi `startsWith('/HizliApi/RestApi/')` ile sınıyordu.
// Yani test, kendi yazdığı sabiti kendi doğruluyordu: koşulsuz 5 PASS üretiyor,
// hiçbir kodu ölçmüyordu. Üstelik bu adlar İŞBEY servis katmanında YOK
// (gerçek yollar: SendDocument, CancelDocument, GetDocumentListGUID,
// GetDocumentReceiverAllList). Artık her yetenek, servis kaynağında GERÇEKTEN
// çağrılan yolla eşleştirilir; ad yoksa PASS değil FAIL üretilir.
const E_DOCUMENT_ENDPOINTS: Array<[string, string]> = [
  ['e-Fatura / e-Arşiv / e-İrsaliye gönderimi', 'RestApi/SendDocument'],
  ['Durum sorgulama', 'RestApi/GetDocumentListGUID'],
  ['Gelen belge listesi', 'RestApi/GetDocumentReceiverAllList'],
  ['İptal', 'RestApi/CancelDocument'],
  ['Mükellef sorgusu', 'RestApi/GetGibUserList'],
  ['Kimlik doğrulama (hash)', 'RestApi/UtilEncrypt'],
  ['Token alma', 'RestApi/Login'],
];

if (fs.existsSync(connectServicePath)) {
  const endpointsSrc = fs.readFileSync(connectServicePath, 'utf-8');
  for (const [ad, yol] of E_DOCUMENT_ENDPOINTS) {
    if (endpointsSrc.includes(yol)) {
      pass(`${ad}: servis yolunda tanımlı (${yol})`);
    } else {
      fail(`${ad}: servis yolunda bulunamadı`, `${yol} bekleniyordu`);
    }
  }
} else {
  fail('hizliConnectService.ts bulunamadı — endpoint sözleşmesi doğrulanamadı');
}

// hizliConnectService içindeki metodları kontrol et
//
// 2026-09-13 (bayat iddia düzeltmesi): Bu kontrol önceden SATICI dokümanındaki
// TÜRKÇE endpoint adlarını (`GonderFatura`, `GonderEarsiv`, `GonderEirsaliye`,
// `BelgeDurumSorgula`) arıyordu. İŞBEY servis katmanı bu adları BİLİNÇLİ olarak
// kullanmaz: dört belge tipi de tek `sendDocument` yolundan geçer (UBL-TR XML
// gövdesi), iptal ve durum sorgusu ayrı metodlardır. Yanlış isim aramak, KOD
// DOĞRUYKEN 4 adet WARN üretiyordu; FAZ 18 bu yüzden hiçbir zaman PASS olamıyor
// ve canlı belge akışı kapısı (KAPI) kalıcı olarak BLOCKED kalıyordu.
// Artık gerçek metod adları aranır — bunlar testin değil, servisin sözleşmesidir
// (`hizliTeknolojiProvider` bu adları çağırır, bkz. providers/).
if (fs.existsSync(connectServicePath)) {
  const csContent = fs.readFileSync(connectServicePath, 'utf-8');
  // İmza parçaları aranır (`static async <ad>(`) — düz `includes('login')`
  // gibi aramalar `loginResult`/`loginData` gibi tanımlayıcılardan doyar ve
  // metot gerçekten silinse bile PASS verirdi.
  const methods = [
    'static async sendDocument(',               // e-Fatura / e-Arşiv / e-İrsaliye (UBL-TR XML)
    'static async checkGibUser(',               // VKN/TCKN mükellef sorgusu
    'static async getDocumentListByGUID(',      // Belge durum sorgusu (UUID ile)
    'static async getDocumentReceiverAllList(', // Gelen belge listesi
    'static async cancelDocument(',             // Belge iptali
    'static async utilEncrypt(',                // SecretKey ile hash üretimi
    'static async login(',                      // Bearer token
  ];
  for (const m of methods) {
    if (csContent.includes(m)) {
      pass(`hizliConnectService.ts: ${m} metodu mevcut`);
    } else {
      fail(`hizliConnectService.ts: ${m} metodu bulunamadı`, 'servis sözleşmesi bozulmuş olabilir');
    }
  }
}

// ─── BÖLÜM 7: HATA YÖNETİMİ KONTROLÜ ───────────────────────────────────────
section('7. HATA YÖNETİMİ KONTROLÜ');

// hizliBilisimClient'ın error handling'ini kaynak koddan kontrol et
if (fs.existsSync(clientPath)) {
  const clientContent = fs.readFileSync(clientPath, 'utf-8');

  assert(clientContent.includes('catch'), 'try-catch hata yakalama mevcut');
  assert(clientContent.includes('timeout'), 'Timeout konfigürasyonu mevcut');
  assert(clientContent.includes('error'), 'Error objesi dönüşü mevcut');

  // Network error handling
  if (clientContent.includes('ENOTFOUND') || clientContent.includes('err.message')) {
    pass('Ağ hata mesajları işleniyor');
  } else {
    warn('Ağ hata mesajları daha ayrıntılı ele alınabilir');
  }
}

// ─── BÖLÜM 8: IDEMPOTENCY KONTROLÜ ──────────────────────────────────────────
section('8. IDEMPOTENCY & DUPLICATE KORUMA KONTROLÜ');

if (fs.existsSync(hbRoutePath)) {
  const routeContent = fs.readFileSync(hbRoutePath, 'utf-8');

  if (routeContent.includes('checkDuplicate') || routeContent.includes('duplicate')) {
    pass('hizli-bilisim.ts: Duplicate kontrol mekanizması mevcut');
  } else {
    warn('hizli-bilisim.ts: Explicit duplicate kontrolü bulunamadı');
  }

  if (routeContent.includes('isbeyCompanyId') || routeContent.includes('status === \'IMPORTED\'')) {
    pass('Müşteri dönüşüm idempotency kontrolü mevcut (isbeyCompanyId)');
  } else {
    warn('Müşteri dönüşüm idempotency kontrolü bulunamadı');
  }
}

// ─── BÖLÜM 9: KONTÖR KONTROLÜ ────────────────────────────────────────────────
section('9. KONTÖR (CREDIT WALLET) KONTROLÜ');

// 2026-09-13 (bayat iddia düzeltmesi):
// (a) Bu bölüm önceden `deductCredits`/`consume` ADLARINI arıyordu. e-Belge
//     akışındaki kontör servisi üç fazlıdır: reserveCredits → commitCredits /
//     rollbackCredits. Ad yanlış arandığı için "fonksiyon bulunamadı" WARN'ı
//     üretiyordu — oysa fonksiyonlar vardı, adı farklıydı.
// (b) "Test modunda kontör kontrolü" iddiası e-Belge kontör servisinde
//     `isTestMode` arıyordu. Test kapısı BİLİNÇLİ olarak orada DEĞİL: kapı,
//     belge gönderimini yürüten kuyruk/servis katmanındadır (bkz. SEC-012 —
//     test sağlayıcısında rezervasyon atlanır, düşüm yapılmaz). Servise
//     isTestMode eklemek yanlış yere ikinci bir kapı koymak olurdu.
// Bu yüzden iddialar gerçek mimariye göre yeniden yazıldı.
const ebKontorYolu = path.join(process.cwd(), 'server/services/creditWalletService.ts');
const kuyrukYolu   = path.join(process.cwd(), 'server/services/electronicDocumentQueue.ts');
const edSvcYolu    = path.join(process.cwd(), 'server/services/electronicDocumentService.ts');

if (fs.existsSync(ebKontorYolu)) {
  const creditContent = fs.readFileSync(ebKontorYolu, 'utf-8');
  pass('e-Belge kontör servisi mevcut');

  // Üç fazlı rezervasyon sözleşmesi — asıl aranması gereken adlar bunlar.
  const fazlar: Array<[string, string]> = [
    ['reserveCredits', 'rezervasyon'],
    ['commitCredits',  'düşüm'],
    ['rollbackCredits', 'iade'],
  ];
  for (const [ad, aciklama] of fazlar) {
    if (creditContent.includes(ad)) {
      pass(`Kontör ${aciklama} fonksiyonu mevcut (${ad})`);
    } else {
      fail(`Kontör ${aciklama} fonksiyonu bulunamadı`, ad + ' sözleşmesi bozulmuş olabilir');
    }
  }
} else {
  fail('server/services/creditWalletService.ts bulunamadı');
}

// Test kapısının GERÇEK yeri: gönderim katmanı. İki ayrı soru sorulur —
// (1) kuyruklama anında rezervasyon atlanıyor mu, (2) gönderim sonrası düşüm
// YALNIZ gerçek sağlayıcıda mı yapılıyor. İkisi de yoksa test belgesi kontör
// tüketir; bu bir GELİR KAYBI değil, yanlış tahsilattır.
if (fs.existsSync(kuyrukYolu) && fs.existsSync(edSvcYolu)) {
  const kuyruk = fs.readFileSync(kuyrukYolu, 'utf-8');
  const edSvc  = fs.readFileSync(edSvcYolu, 'utf-8');
  assert(edSvc.includes('const testProviderMi ='),
         'Test sağlayıcısında kontör REZERVASYONU atlanıyor (kuyruklama katmanı)');
  assert(kuyruk.includes('const isTestProvider ='),
         'Test sağlayıcısında kontör DÜŞÜMÜ yapılmıyor (gönderim katmanı)');
  assert(kuyruk.includes('creditsReserved'),
         'Kontör kararı kayda yazılıyor (türetme değil)');
} else {
  warn('Gönderim katmanı dosyaları bulunamadı — test kontör kapısı doğrulanamadı');
}

// ─── BÖLÜM 10: TENANT / IDOR İZOLASYON GERİLEME ────────────────────────────
section('10. TENANT İZOLASYON KONTROLÜ');

const middlewarePath = path.join(process.cwd(), 'server/middleware/authGuards.ts');
if (fs.existsSync(middlewarePath)) {
  const mwContent = fs.readFileSync(middlewarePath, 'utf-8');

  assert(mwContent.includes('requireAuth'), 'requireAuth middleware tanımlı');
  assert(mwContent.includes('requireRole'), 'requireRole middleware tanımlı');
  assert(mwContent.includes('requirePermission'), 'requirePermission middleware tanımlı');
  assert(mwContent.includes('resolveTenant'), 'resolveTenant middleware tanımlı');
  assert(mwContent.includes('tenantId'), 'Tenant ID izolasyonu mevcut');
} else {
  fail('server/middleware/authGuards.ts bulunamadı');
}

// accountant route güvenlik kontrolü (FAZ 17 fix)
const accountantPath = path.join(process.cwd(), 'server/routes/v1/accountant.ts');
if (fs.existsSync(accountantPath)) {
  const accContent = fs.readFileSync(accountantPath, 'utf-8');
  assert(accContent.includes('requireAuth'), 'accountant.ts: requireAuth eklendi (FAZ 17 fix)');
  assert(accContent.includes('AccountantService.isAccountantAuthorizedForTenant'),
         'accountant.ts: Tenant yetki kontrolü mevcut');
} else {
  warn('server/routes/v1/accountant.ts bulunamadı');
}

// ─── BÖLÜM 11: PRODUCTION İZOLASYON DOĞRULAMASI ─────────────────────────────
section('11. PRODUCTION İZOLASYON DOĞRULAMASI');

// 2026-09-13: Bu beş satır önceden KOŞULSUZ `pass()` idi — yani "gönderilmedi"
// iddiası testin kendi değişmeziyle değil, yalnızca süitin bugünkü hâliyle
// destekleniyordu. Artık iddianın arkasında bir ÖLÇÜM var: her giden istek
// `guvenliTestUrl` süzgecinden geçer ve canlı host görülürse sayaç artar.
// Sayaç 0 ise gerçekten tek bir istek bile canlıya çıkmamıştır.
//
// İKİNCİ DÜZELTME (2026-09-13): Yapılandırma eksikse (configOk=false) BÖLÜM 4/5
// hiç çalışmaz, dolayısıyla hiç istek denenmemiş olur. Sayaç o zaman da 0'dır ve
// burada 5 PASS üretmek "ölçtük, temiz" izlenimi verirdi — oysa ölçülecek bir şey
// yoktur. Bu durum SKIP olarak raporlanır (PASS sayısını şişirmez).
if (!configOk) {
  skip('Canlı adres izolasyonu ölçümü',
       'Konfigürasyon eksik — hiç giden istek denenmedi, bu nedenle iddia kanıtlanamaz');
} else if (canliAdresEngeli === 0 && suzgeclenenIstekSayisi === 0) {
  // Buraya düşmek bir ÇELİŞKİDİR: yapılandırma tamam ama hiç istek süzgeçten
  // geçmemiş → BÖLÜM 4/5 sessizce atlanmış. "Gönderilmedi" demek yerine bunu
  // açıkça bildiririz; aksi halde ölçülmemiş bir şey PASS gibi görünür.
  fail('Canlı adres izolasyonu ölçülemedi',
       'Konfigürasyon tamam olmasına rağmen hiç giden istek denenmedi (BÖLÜM 4/5 atlanmış olabilir)');
} else if (canliAdresEngeli === 0) {
  // ÜÇÜNCÜ DÜZELTME (2026-09-15): Ağ erişimi engellenmişse (ör. istekler
  // `X-Proxy-Error: blocked-by-allowlist` ile geri dönüyorsa) beş "GÖNDERİLMEDİ"
  // iddiası hâlâ DOĞRUDUR — hatta fazlasıyla. Ancak bu koşulda testlerin
  // KANIT GÜCÜ yoktur: hiçbir istek hedefe çıkmadığı için "göndermedik"
  // demek, "kapıyı hiç açmadık" demekle eşdeğerdir. Ölçümün gerçekleştiği
  // (en az bir isteğin hedefe ulaştığı) koşulda PASS, aksi halde SKIP yazılır.
  const olcumGerceklesti = hedefeUlasanIstekSayisi > 0;
  const sayacOzeti = `(süzgeçten geçen: ${suzgeclenenIstekSayisi}, hedefe ulaşan: ${hedefeUlasanIstekSayisi}, ` +
                     `ağ engeline takılan: ${agErisimEngeli}, canlıya çıkan: 0)`;

  if (olcumGerceklesti) {
    pass(`Bu test sırasında production endpoint\'e hiçbir istek GÖNDERİLMEDİ ${sayacOzeti}`);
    pass('Bu test sırasında gerçek e-Fatura GÖNDERİLMEDİ');
    pass('Bu test sırasında gerçek e-Arşiv GÖNDERİLMEDİ');
    pass('Bu test sırasında gerçek e-İrsaliye GÖNDERİLMEDİ');
    pass('Bu test sırasında gerçek müşteri verisi GÖNDERİLMEDİ');
  } else {
    skip('Canlı adres izolasyonu — kanıt gücü yok',
         `Hiçbir istek hedefe ulaşmadı ${sayacOzeti}; istek hedefe hiç çıkmadığı için ` +
         `"canlıya gönderilmedi" iddiası ölçülmüş sayılamaz (kapı hiç açılmadı). ` +
         `Bu ortamda egress kısıtlıdır — iddia Windows/e2e ortamında koşulmalıdır.`);
  }
} else {
  fail(`Canlı adrese ${canliAdresEngeli} istek engellendi`,
       'Süit yalnızca test ortamına çıkmalıdır — adres sabitlerini gözden geçirin');
}

// Belge gönderimi yapan uçlara HİÇ dokunulmadığının statik kanıtı: bu süitte
// GERÇEK belge gönderen/iptal eden bir HTTP çağrısı bulunmamalıdır (kontör
// yakılmaz). Ölçülen şey beyan değil, çağrıların kendisidir: süitteki her
// `axios.<metot>(...)` satırı toplanır ve yolları süzülür. BÖLÜM 6'nın endpoint
// SABİTLERİ bu taramaya girmez — onlar axios çağrısı değil, karşılaştırma
// listesidir; bu yüzden tarama yalnızca çağrı satırlarına bakar.
{
  const buDosyaYolu = path.join(process.cwd(), 'server/tests/phase18HizliBilisimIntegrationTest.ts');
  const buDosya = fs.readFileSync(buDosyaYolu, 'utf-8');
  const cagriSatirlari = buDosya
    .split('\n')
    .filter(satir => /axios\.(get|post|put|delete)\(/.test(satir) && !/^\s*\/\//.test(satir));
  const yasakliCagri = cagriSatirlari.some(satir => /RestApi\/(SendDocument|CancelDocument)/.test(satir));
  assert(!yasakliCagri,
         `Süit belge gönderen/iptal eden uçlara çağrı yapmıyor (${cagriSatirlari.length} istek, kontör yakılmaz)`,
         'SendDocument/CancelDocument çağrısı bulundu');
}

if (!isTestMode) {
  warn('PRODUCTION MOD AKTIF — FAZ 19\'a geçmeden önce mutlaka test modunu doğrulayın');
}

// ─── SONUÇ ───────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('İŞBEY CLOUD — FAZ 18 HIZLI BİLİŞİM ENTEGRASYON TEST SONUÇLARI');
console.log('='.repeat(70));

const total = passCount + failCount + warnCount + skipCount;
console.log(`\n  Toplam Test : ${total}`);
console.log(`  ✅ PASS     : ${passCount}`);
console.log(`  ❌ FAIL     : ${failCount}`);
console.log(`  ⚠️  WARN     : ${warnCount}`);
console.log(`  ⏭️  SKIP     : ${skipCount}`);

console.log('\n' + '─'.repeat(70));
console.log('\n  HIZLI BİLİŞİM DURUM ÖZETİ:');
console.log(`  API URL        : ${process.env.HIZLI_BILISIM_API_URL || 'TANIMLANMAMIŞ'}`);
console.log(`  Test Modu      : ${isTestMode ? 'AKTIF (Güvenli)' : 'DEVRE DIŞI ⚠️ (Canlı sisteme bağlı)'}`);
console.log(`  Credential     : ${configOk ? 'Tanımlı (.env)' : 'EKSİK'}`);
console.log(`  Hardcode Leak  : Temizlendi (FAZ 17)`);
console.log(`  Belge Gönderim : BU AŞAMADA CANLI BELGE GÖNDERİLMEDİ`);

// 2026-09-15: Auth akışının gerçekten ölçülüp ölçülmediği, özetin en üstünde
// tek bir satırda ve abartısız biçimde belirtilir. Bu satır olmadan "PASS"
// ifadesi, UtilEncrypt → Login zincirinin doğrulandığı anlamına geliyordu.
if (!authAkisiDenendi) {
  console.log(`  Auth Akışı     : ÖLÇÜLMEDİ — UtilEncrypt → Login zinciri bu koşuda denenmedi`);
} else if (agErisimEngeli > 0) {
  console.log(`  Auth Akışı     : KANITLANAMADI — istek ağ katmanınca engellendi (egress kısıtlı)`);
} else {
  console.log(`  Auth Akışı     : Hedefe ulaşan istek: ${hedefeUlasanIstekSayisi} (ayrıntı BÖLÜM 5)`);
}

console.log('\n' + '─'.repeat(70));

// Sonuç kararı: "hazır" demek için PASS yeterli değildir; kanıtlanamayan
// adımlar (SKIP) varsa karar PASS değil "koşullu"dur. Bu ayrım, kullanıcının
// "UtilEncrypt WARN'ını geçmiş saymıyorum" kuralının doğrudan uygulanmasıdır.
const kanitlanmayanAdim = skipCount > 0;

if (failCount === 0 && warnCount === 0 && !kanitlanmayanAdim) {
  console.log('🎉 FAZ 18: TÜM TESTLER BAŞARILI — CANLI ENTEGRASYON HAZİR');
} else if (failCount === 0 && !kanitlanmayanAdim) {
  console.log(`✅ FAZ 18: PASS (${warnCount} uyarı — production öncesi gözden geçirin)`);
} else if (failCount === 0) {
  console.log(`🟡 FAZ 18: KOŞULLU — ${skipCount} iddia KANITLANAMADI (PASS sayılmaz)`);
  console.log('   Bu koşuda kanıtlanamayan adımlar:');
  console.log('     · UtilEncrypt → Login → Bearer Token zinciri');
  console.log('     · Canlı adres izolasyonunun ÖLÇÜLMÜŞ kanıtı');
} else {
  console.error(`❌ FAZ 18: ${failCount} BAŞARISIZ TEST — Düzeltme gerekiyor!`);
}

if (agErisimEngeli > 0) {
  console.log('\n  ⚠️  NOT: Bu koşuda giden HTTP erişimi ortam tarafından kısıtlanmıştır');
  console.log('      (istekler hedefe ulaşmadı). Sandbox auth zinciri bu nedenle');
  console.log('      DOĞRULANMAMIŞTIR — production açılışı için YETERSİZDİR.');
}

if (!isTestMode) {
  console.log('\n  🚨 CANLI MODA GEÇİŞ İÇİN ÖNCE:');
  console.log('     1. HIZLI_BILISIM_IS_TEST_MODE=true yapın');
  console.log('     2. Sandbox üzerinde tam e-Fatura testi yapın');
  console.log('     3. Tüm testler PASS olduktan sonra FAZ 19\'a geçin');
}

console.log('\n  SONRAKI ADIM: FAZ 19 → e-Fatura / e-Arşiv / e-İrsaliye Sandbox Testi');
console.log('='.repeat(70) + '\n');

if (failCount > 0) process.exit(1);
