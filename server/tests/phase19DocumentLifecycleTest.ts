/**
 * İŞBEY CLOUD — FAZ 19: BELGE YAŞAM DÖNGÜSÜ TESTİ (TEST/SANDBOX)
 * ================================================================
 * AMAÇ
 *   Belge yaşam döngüsünün (oluştur → gönder → sorgula → iptal) MEVCUT
 *   uygulama kodu ve mevcut API sözleşmesiyle gerçekten çalışıp
 *   çalışmadığını, GERÇEK TEST/SANDBOX ortamına dayanarak ölçmek.
 *
 * DEĞİŞMEZ KURALLAR (CLAUDE.md md.1 + kullanıcı talimatı)
 *   · Canlı (production) Hızlı Bilişim'e istek GÖNDERİLMEZ.
 *   · Canlı belge GÖNDERİLMEZ, canlı kontör TÜKETİLMEZ.
 *   · Kontör tüketen adım (SendDocument) ÇALIŞTIRILMAZ ve PASS sayılmaz.
 *   · HIZLI_BILISIM_IS_TEST_MODE=true ve HIZLI_BILISIM_ALLOW_PROD boş kalır.
 *   · API hatasında sahte/simüle başarılı yanıt ÜRETİLMEZ.
 *   · Mock server kullanılmaz; hiçbir yerel/mock sonuç PASS sayılmaz.
 *
 * BU TEST NEYİ KANITLAR — NEYİ KANITLAMAZ (dürüstlük sınırı)
 *   ✅ KANITLAR: sandbox auth zinciri (UtilEncrypt → Login → JWT);
 *      kontör tüketmeyen sorgulama uçlarının gerçek yanıt verdiği;
 *      belge XML'inin yerel üretimi ve şema doğrulaması; sözleşme
 *      düzeyinde yaşam döngüsü zincirinin kodda mevcut olduğu.
 *   ⛔ KANITLAMAZ: sandbox'ta GERÇEK BELGE GÖNDERİMİ. Bu adım bilinçli olarak
 *      çalıştırılmaz — kontör tüketir. Satıcı sözleşmesi (docs/21) test
 *      ortamının YALNIZCA base URL ile ayrıldığını söyler; test ortamında
 *      kontörün tüketilip tüketilmediği BELGELENMEMİŞTİR. Belgelenmemiş bir
 *      varsayıma dayanarak gönderim yapmak, "kontör yakılmayacak" iddiasını
 *      kanıtsız bırakırdı. Bu yüzden gönderim ayağı SKIP'tir ve nihai karar
 *      PASS DEĞİL, KOŞULLU'dur.
 *
 * Çalıştır: node --import tsx server/tests/phase19DocumentLifecycleTest.ts
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ─── Repo kökü ve .env (cwd'den BAĞIMSIZ) ────────────────────────────────────
// Bu test hangi dizinden koşulursa koşulsun repo kökündeki .env'i okur.
// (Aksi hâlde yanlış dizinden koşulduğunda credential "yok" görünür ve
//  test yanıltıcı biçimde BLOCKED'a düşerdi.)
//
// Yol, `import.meta.url` yerine `process.argv[1]`'den çözülür: böylece süit
// hem ESM (`node --import tsx`) hem de derlenmiş CJS olarak koşabilir.
// `ISBEY_REPO_ROOT` verilirse o kullanılır (derlenmiş kopya repo dışındayken).
const BU_DOSYA = path.resolve(
  process.argv[1] || path.join('server', 'tests', 'phase19DocumentLifecycleTest.ts'));
const KOK = process.env.ISBEY_REPO_ROOT
  ? path.resolve(process.env.ISBEY_REPO_ROOT)
  : path.resolve(path.dirname(BU_DOSYA), '..', '..');
dotenvConfig({ path: path.join(KOK, '.env') });

// ─── Test sayaçları ve yardımcıları ─────────────────────────────────────────

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

/** Credential değerlerini ASLA yazdırmaz — yalnız uzunluk raporlar. */
function maskeAdi(deger: string | undefined): string {
  if (!deger) return '(TANIMSIZ)';
  return `(dolu, ${deger.length} karakter)`;
}

const TEST_HOST = 'econnecttest.hizliteknoloji.com.tr';
const CANLI_HOST = 'econnect.hizliteknoloji.com.tr';

async function main(): Promise<void> {

const { HizliConnectService } = await import('../services/hizliConnectService');

// Servis sözleşmesi: isTest bayrağı hedefi GERÇEKTEN değiştiriyor mu?
// (Sabit bir URL'e kilitlenmiş olsaydı "test modundayız" iddiası kanıtsız kalırdı.)
const testBase = HizliConnectService.getBaseUrl(true);

// ─── Egress ön ölçümü ───────────────────────────────────────────────────────
//
// Bu Linux VM'in dış ağ erişimi bir allowlist proxy'siyle sınırlıdır. Sandbox
// hostu listede değilse istek hiç çıkmaz ve proxy `X-Proxy-Error:
// blocked-by-allowlist` ile 403 döner. Bu durumda API hakkında HİÇBİR ŞEY
// öğrenilemez: ne başarı ne başarısızlık kanıtıdır. Ölçmeden sınıflandırmak,
// ortam engelini ürün hatası sanmaya yol açar. Ölçüm, kimlik bilgisi
// GÖNDERMEYEN bir uca (Test ping) yapılır — hiçbir credential sızmaz.
let egressEngelli = false;
{
  try {
    const axios = (await import('axios')).default;
    await axios.get(`${testBase}/HizliApi/RestApi/Test`, { timeout: 15000 });
  } catch (err: any) {
    const proxyErr = err?.response?.headers?.['x-proxy-error'];
    const kodlar = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNABORTED'];
    egressEngelli = proxyErr === 'blocked-by-allowlist'
      || kodlar.some(k => String(err?.code || '').includes(k) || String(err?.message || '').includes(k));
  }
}

// ─── İzolasyon ölçümü (beyan değil, ÖLÇÜM) ──────────────────────────────────
//
// Bu süit uygulama servis katmanını (HizliConnectService) doğrudan çağırır —
// yani "mevcut uygulama kodu" gerçekten koşar. Servisin HER HTTP çağrısı
// hedefini `getBaseUrl(isTest)` üzerinden alır. Bu yüzden o metodu sarıp
// gerçekten kullanılan adresi kaydediyoruz: böylece "canlıya çıkmadı"
// iddiası bir söz değil, gözlemlenebilir bir ölçüm olur.
//
// Sarmalayıcı, BÖLÜM 1'deki kasıtlı `getBaseUrl(false)` karşılaştırmasından
// SONRA kurulur (aksi hâlde testin kendi karşılaştırması sayaca düşerdi).

const kullanilanAdresler: Array<{ url: string; isTest: boolean }> = [];
let sandboxAdresSayisi = 0;
let canliyaCikanSayisi = 0;

function izolelikOlcumunuKur() {
  const orijinal = HizliConnectService.getBaseUrl.bind(HizliConnectService);
  (HizliConnectService as any).getBaseUrl = (isTest: boolean) => {
    const url = orijinal(isTest);
    kullanilanAdresler.push({ url, isTest });
    if (url.includes(CANLI_HOST) && !url.includes(TEST_HOST)) canliyaCikanSayisi++;
    if (url.includes(TEST_HOST)) sandboxAdresSayisi++;
    return url;
  };
}

/**
 * Gerçek HTTP çağrılarının sınıflandırması. FAZ 18'de düzeltilen sahte-başarı
 * kusuru burada da tekrarlanmaz: erişim engeli / DNS / timeout "başarılı yanıt"
 * DEĞİLDİR; kanıtlanamadı sayılır, PASS yazılmaz.
 */
let hedefeUlasanSayisi = 0;
let erisimEngeliSayisi = 0;

type Sinif = 'ok' | 'kanitlanamadi' | 'hata';

const ERISIM_ENGELI_ISARETLERI = [
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET',
  'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNABORTED',
  'blocked-by-allowlist',
];

function yanitSiniflandir(res: { success?: boolean; message?: string }): Sinif {
  if (res?.success === true) {
    hedefeUlasanSayisi++;
    return 'ok';
  }
  // Egress engeli (X-Proxy-Error: blocked-by-allowlist) servis katmanında
  // yutulur ve geriye yalnız "status code 403" metni kalır. Egress engeli
  // önceden ölçüldüyse (bkz. §1b), 403 bir API reddi DEĞİL ortam engelidir →
  // kanıtlanamadı. Aksi hâlde 403 gerçek bir başarısızlıktır.
  if (egressEngelli) {
    erisimEngeliSayisi++;
    return 'kanitlanamadi';
  }
  const mesaj = String(res?.message || '');
  if (ERISIM_ENGELI_ISARETLERI.some(i => mesaj.includes(i)) || /timeout/i.test(mesaj)) {
    erisimEngeliSayisi++;
    return 'kanitlanamadi';
  }
  return 'hata';
}

// ─────────────────────────────────────────────────────────────────────────────
section('1. GÜVENLİK ÖN KOŞULLARI (canlıya çıkış fiziksel olarak engellenir)');
// ─────────────────────────────────────────────────────────────────────────────

const apiUrl = (process.env.HIZLI_BILISIM_API_URL || '').trim();
const isTestMode = process.env.HIZLI_BILISIM_IS_TEST_MODE === 'true';
const allowProd = (process.env.HIZLI_BILISIM_ALLOW_PROD || '').trim();
const apiKey = process.env.HIZLI_BILISIM_API_KEY || '';
const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY || '';
const wsUser = process.env.HIZLI_BILISIM_WS_USERNAME || '';
const wsPass = process.env.HIZLI_BILISIM_WS_PASSWORD || '';

assert(isTestMode, 'HIZLI_BILISIM_IS_TEST_MODE = true (test modu kilidi)',
  `değer: "${process.env.HIZLI_BILISIM_IS_TEST_MODE}"`);
assert(allowProd === '' || allowProd.toLowerCase() === 'false',
  'HIZLI_BILISIM_ALLOW_PROD boş/kapalı (production geçiş kilidi kapalı)',
  `değer: "${allowProd}"`);
assert(apiUrl.includes(TEST_HOST), 'HIZLI_BILISIM_API_URL TEST/SANDBOX hostunu gösteriyor',
  `host: ${apiUrl || '(boş)'}`);
assert(!apiUrl.includes(CANLI_HOST), 'HIZLI_BILISIM_API_URL canlı host içermiyor');

const credHepsiVar = !!(apiKey && secretKey && wsUser && wsPass);
assert(credHepsiVar, 'Sandbox credential\'ları .env\'de tanımlı (değerler yazdırılmaz)',
  `apiKey ${maskeAdi(apiKey)}, secretKey ${maskeAdi(secretKey)}, ` +
  `wsUser ${maskeAdi(wsUser)}, wsPass ${maskeAdi(wsPass)}`);

// Koşu ortamının dış ağ erişimi — sınıflandırmanın ön koşulu.
// Engel VARSA aşağıdaki hiçbir dış iddia kanıtlanamaz (SKIP), yoksa gerçek
// başarısızlıklar FAIL olarak raporlanır. Bu ayrım olmadan ortam engeli
// yanlışlıkla ürün hatası gibi görünür.
if (egressEngelli) {
  warn('Bu koşu ortamının dış ağ erişimi ENGELLİ (allowlist proxy)',
    'Sandbox hostuna istek hiç çıkmıyor → dış doğrulamalar kanıtlanamaz. ' +
    'Bu bir API/ürün hatası DEĞİLDİR. Gerçek kanıt için süiti ' +
    'egress erişimi olan makinede (ör. Windows doğrulama paketi) koşun.');
} else {
  pass('Koşu ortamının dış ağ erişimi açık (sandbox hostuna istek çıkabiliyor)');
}

// Servis sözleşmesi: isTest bayrağı hedefi GERÇEKTEN değiştiriyor mu?
// (Sabit bir URL'e kilitlenmiş olsaydı "test modundayız" iddiası kanıtsız kalırdı.)
const canliBase = HizliConnectService.getBaseUrl(false);
assert(testBase.includes(TEST_HOST) && !testBase.includes(CANLI_HOST),
  'getBaseUrl(true) → TEST/SANDBOX adresi', `değer: ${testBase}`);
assert(canliBase.includes(CANLI_HOST) && !canliBase.includes(TEST_HOST),
  'getBaseUrl(false) → canlı adres (bu testte ASLA kullanılmayacak)');

// Ölçüm sarmalayıcısı bundan SONRA kurulur.
izolelikOlcumunuKur();

// ─────────────────────────────────────────────────────────────────────────────
section('2. SANDBOX AUTH ZİNCİRİ — UtilEncrypt → Login → Bearer Token');
// ─────────────────────────────────────────────────────────────────────────────

let token = '';
let authKanitlandi = false;
{
  const t0 = Date.now();
  const enc = await HizliConnectService.utilEncrypt(secretKey, wsUser, wsPass, true);
  const encSinif = yanitSiniflandir(enc);
  if (encSinif === 'ok' && enc.hashedUsername && enc.hashedPassword) {
    pass(`UtilEncrypt gerçek sandbox yanıtı döndürdü (${Date.now() - t0}ms)`);
  } else if (encSinif === 'kanitlanamadi') {
    skip('UtilEncrypt — sandbox\'a ulaşılamadı (kanıtlanamadı)', enc.message);
  } else {
    fail('UtilEncrypt başarısız', enc.message);
  }

  if (enc.success && enc.hashedUsername && enc.hashedPassword) {
    const t1 = Date.now();
    const login = await HizliConnectService.login(apiKey, enc.hashedUsername, enc.hashedPassword, true);
    const loginSinif = yanitSiniflandir(login);
    if (loginSinif === 'ok' && login.token) {
      token = login.token;
      authKanitlandi = true;
      pass(`Login gerçek Bearer Token döndürdü (${Date.now() - t1}ms)`);
      pass(`Mükellef kimliği API yanıtından alındı: ${login.firmaAdi || '(ünvan dönmedi)'} / VKN: ${login.vkn || '(VKN dönmedi)'}`);
      const parcalar = token.split('.');
      assert(parcalar.length === 3, 'Token JWT biçiminde (3 parça)');
      let expVar = false;
      try {
        const p = JSON.parse(Buffer.from(parcalar[1], 'base64').toString());
        expVar = typeof p?.exp === 'number' && p.exp * 1000 > Date.now();
      } catch { /* yapı geçersizse aşağıda FAIL üretilir */ }
      assert(expVar, 'Token süresi dolmamış (exp gelecekte)');
    } else if (loginSinif === 'kanitlanamadi') {
      skip('Login — sandbox\'a ulaşılamadı (kanıtlanamadı)', login.message);
    } else {
      fail('Login başarısız', login.message);
    }
  } else {
    skip('Login atlandı — UtilEncrypt kanıtlanamadı');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. BELGE YAŞAM DÖNGÜSÜ — KONTÖR TÜKETMEYEN UÇLAR (gerçek sandbox)');
// ─────────────────────────────────────────────────────────────────────────────
//
// Yaşam döngüsünün "gönder" adımı kontör tüketir ve BÖLÜM 5'te bilinçli olarak
// atlanır. Buradaki uçlar YALNIZCA OKUMA yapar (sorgulama) ve kontör yakmaz:
//   · kontör bakiyesi sorgusu      → kontör DÜŞÜRMEZ, yalnız okur
//   · GİB mükellef sorgusu         → alıcı çözümlemesi
//   · belge durum sorgusu (GUID)   → "sorgula" ayağı
//   · gelen belge listesi          → gelen kutusu ayağı

const vkn = (process.env.HIZLI_BILISIM_VKN || '').replace(/\D/g, '');

if (!token) {
  skip('Tüm sorgulama uçları atlandı — geçerli token yok (auth kanıtlanamadı)');
} else {
  // 3.1 Kontör bakiyesi (OKUMA — kontör tüketmez)
  {
    const r = await HizliConnectService.kalanKontorSorgula(vkn, 'FaturaAdedi', token, true);
    const s = yanitSiniflandir(r);
    if (s === 'ok') pass('Kalan kontör sorgusu gerçek yanıt döndürdü (okuma — kontör tüketilmedi)');
    else if (s === 'kanitlanamadi') skip('Kalan kontör sorgusu — ulaşılamadı', r.message);
    else warn('Kalan kontör sorgusu okunamadı (uç farklı yanıt verdi)', r.message);
  }

  // 3.2 GetCredits (OKUMA)
  {
    const r = await HizliConnectService.getCredits(token, true);
    const s = yanitSiniflandir(r);
    if (s === 'ok') pass('GetCredits gerçek bakiye yanıtı döndürdü (okuma — kontör tüketilmedi)');
    else if (s === 'kanitlanamadi') skip('GetCredits — ulaşılamadı', r.message);
    else warn('GetCredits beklenen alanları döndürmedi (sözleşme farkı olabilir)', r.message);
  }

  // 3.3 GİB mükellef sorgusu (alıcı çözümlemesi)
  {
    const r = await HizliConnectService.checkGibUser(vkn, token, true);
    const s = yanitSiniflandir(r);
    if (s === 'ok') pass(`GİB mükellef sorgusu yanıtlandı (kendi VKN; mükellef: ${r.isEInvoiceUser ? 'EVET' : 'HAYIR'})`);
    else if (s === 'kanitlanamadi') skip('GİB mükellef sorgusu — ulaşılamadı', r.message);
    else warn('GİB mükellef sorgusu hata döndürdü (sandbox GİB-DB kısıtı — docs/51 §9)', r.message);
  }

  // 3.4 Belge durum sorgusu (GUID) — yaşam döngüsünün "SORGULA" ayağı
  //
  // Gerçek gönderim yapılmadığı için elimizde sandbox'a ait bir ETTN yok.
  // Rastgele bir UUID sorulur: beklenen sonuç "kayıt yok"tur. Ölçülen şey
  // belgenin BULUNMASI değil, UÇ ve SÖZLEŞME'nin çalışmasıdır — yani sistemin
  // bir GUID'i entegratöre sorup ayrıştırılabilir bir yanıt alabilmesi.
  {
    const yokUuid = crypto.randomUUID();
    const r = await HizliConnectService.getDocumentListByGUID([yokUuid], 1, token, true);
    const s = yanitSiniflandir(r);
    if (s === 'ok') {
      pass('Belge durum sorgusu (GetDocumentListGuid) sözleşmeye uygun yanıt verdi — sorgula ayağı çalışıyor');
    } else if (s === 'kanitlanamadi') {
      skip('Belge durum sorgusu (GUID) — ulaşılamadı', r.message);
    } else {
      warn('Belge durum sorgusu hata döndürdü (uç adı/şeması farklı olabilir)', r.message);
    }
  }

  // 3.5 Gelen belge listesi
  {
    const bitis = new Date().toISOString();
    const baslangic = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await HizliConnectService.getDocumentReceiverAllList(
      { dateType: 'CreateDate', startDate: baslangic, endDate: bitis }, token, true);
    const s = yanitSiniflandir(r);
    if (s === 'ok') pass('Gelen belge listesi (GetDocumentReceiverAllList) yanıtlandı');
    else if (s === 'kanitlanamadi') skip('Gelen belge listesi — ulaşılamadı', r.message);
    else warn('Gelen belge listesi okunamadı', r.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. BELGE ÜRETİMİ — YEREL (ağ yok, kontör yok)');
// ─────────────────────────────────────────────────────────────────────────────
//
// Bu bölüm dış ağa HİÇ çıkmaz; yalnız belge XML'inin üretildiğini ve
// şema doğrulamasından geçtiğini ölçer. Sandbox kanıtı DEĞİLDİR.

{
  const { UblInvoiceBuilder } = await import('../services/ubl/ublInvoiceBuilder');
  const { XmlValidatorService } = await import('../services/ubl/xmlValidatorService');

  const testUuid = crypto.randomUUID();
  const xml = UblInvoiceBuilder.buildXml({
    invoice: {
      id: 'inv-faz19-test',
      invoiceNo: 'FAZ19-TST-000001',
      date: '2026-09-15',
      invoiceCategory: 'SATIS',
      currency: 'TRY',
      subTotal: 1000,
      totalVat: 200,
      grandTotal: 1200,
      items: [{
        id: 'itl-1', productId: 'prd-1', productCode: 'STK-001', productName: 'Test Ürün',
        quantity: 2, unit: 'ADET', unitPrice: 500, vatRate: 20, vatAmount: 200, lineTotal: 1000,
      }],
    } as any,
    tenant: {
      taxNumber: '4810592817', name: 'İŞBEY', title: 'İŞBEY Teknoloji',
      city: 'İstanbul', district: 'Kadıköy', taxOffice: 'Kadıköy',
    } as any,
    customer: {
      taxNumber: '1029384756', title: 'Test Alıcı A.Ş.',
      city: 'İstanbul', district: 'Kadıköy', taxOffice: 'Kozyatağı',
    } as any,
    uuid: testUuid,
    profile: 'TEMELFATURA',
  });

  assert(typeof xml === 'string' && xml.length > 500, 'UBL-TR XML üretildi (yerel)');
  assert(xml.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>'), 'UBLVersionID = 2.1');
  assert(xml.includes('<cbc:CustomizationID>TR1.2</cbc:CustomizationID>'), 'CustomizationID = TR1.2');
  assert(xml.includes(`<cbc:UUID>${testUuid}</cbc:UUID>`), 'ETTN (UUID) belgeye yazıldı');
  assert(xml.includes('schemeID="VKN">4810592817<'), 'Gönderici VKN belgeye yazıldı');
  assert(xml.includes('schemeID="VKN">1029384756<'), 'Alıcı VKN belgeye yazıldı');

  const dogrulama = XmlValidatorService.validateUblXml(xml);
  assert(dogrulama.valid === true, 'Üretilen XML şema doğrulamasından geçti',
    dogrulama.errors?.join('; '));
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. BELGE GÖNDERİMİ (kontör tüketen adım) — BİLİNÇLİ OLARAK YAPILMADI');
// ─────────────────────────────────────────────────────────────────────────────

// Bu adımı PASS yazmak, kanıtı olmayan bir iddiayı doğrulanmış göstermek olurdu.
// SKIP olarak raporlanır ve nihai kararı "KOŞULLU"ya çeker (bkz. özet).
skip('Sandbox\'ta gerçek belge gönderimi (SendDocument)',
  'Kontör tüketir. Satıcı sözleşmesi (docs/21) test ortamının YALNIZCA base URL ile ' +
  'ayrıldığını söyler; test ortamında kontörün tüketilip tüketilmediğini BELGELEMİYOR. ' +
  'Belgelenmemiş varsayımla gönderim yapılmaz — ayrı onay fazı gerekir.');

skip('Belge iptali (CancelDocument) — gerçek belge olmadan çağrılamaz',
  'İptal edilecek gerçek bir ETTN yok; uydurma UUID ile çağırmak anlamsız istek üretir.');

// ─────────────────────────────────────────────────────────────────────────────
section('6. SÖZLEŞME DENETİMİ — yaşam döngüsü zinciri kodda mevcut mu? (statik)');
// ─────────────────────────────────────────────────────────────────────────────

{
  const svc = fs.readFileSync(path.join(KOK, 'server', 'services', 'hizliConnectService.ts'), 'utf-8');

  // Yaşam döngüsünün dört ayağı + auth, gerçek API adlarıyla
  const zincir: Array<[string, string, string]> = [
    ['Oluştur/Gönder', 'RestApi/SendDocument', 'static async sendDocument('],
    ['Sorgula (durum)', 'RestApi/GetDocumentListGUID', 'static async getDocumentListByGUID('],
    ['Sorgula (gelen)', 'RestApi/GetDocumentReceiverAllList', 'static async getDocumentReceiverAllList('],
    ['İptal', 'RestApi/CancelDocument', 'static async cancelDocument('],
    ['Mükellef sorgu', 'RestApi/GetGibUserList', 'static async checkGibUser('],
    ['Auth (şifrele)', 'RestApi/UtilEncrypt', 'static async utilEncrypt('],
    ['Auth (token)', 'RestApi/Login', 'static async login('],
  ];
  for (const [ad, uc, metot] of zincir) {
    assert(svc.includes(uc) && svc.includes(metot),
      `${ad}: uç (${uc}) + metot (${metot.split('(')[0]}) mevcut`);
  }

  // Üç fazlı kontör akışı
  const cws = fs.readFileSync(path.join(KOK, 'server', 'services', 'creditWalletService.ts'), 'utf-8');
  assert(
    cws.includes('reserveCredits(') && cws.includes('commitCredits(') && cws.includes('rollbackCredits('),
    'Kontör üç fazlı akış mevcut (reserveCredits / commitCredits / rollbackCredits)');

  // Kuyruk: test sağlayıcısında rezervasyon atlanır + düşüm yapılmaz
  const kuyruk = fs.readFileSync(path.join(KOK, 'server', 'services', 'electronicDocumentQueue.ts'), 'utf-8');
  assert(kuyruk.includes("provider.providerId.toUpperCase() === 'MOCK'"),
    'Kuyruk: test sağlayıcısı ayrımı kodda mevcut');
  assert(kuyruk.includes('if (isTestProvider)') && kuyruk.includes('if (rezervasyonVar)'),
    'Kuyruk: kontör kararı gönderim sonucuna + rezervasyon kaydına bağlı (türetme değil)');

  const eds = fs.readFileSync(path.join(KOK, 'server', 'services', 'electronicDocumentService.ts'), 'utf-8');
  assert(eds.includes('if (!testProviderMi)') && eds.includes('await CreditWalletService.reserveCredits('),
    'Kuyruklama: test sağlayıcısında kontör REZERVE EDİLMİYOR');
}

// Giden belge iptali entegratöre gidiyor mu? (BULGU — WARN)
//
// Bu denetim metot TANIMINA eşleşmemelidir; yalnız servis çağrısı biçimleri
// aranır (`HizliConnectService.cancelDocument(` / `provider.cancelInvoice(`).
// Aksi hâlde `static async cancelInvoice(` kendi kendine eşleşir ve yanlış
// PASS üretirdi.
{
  const dcs = fs.readFileSync(path.join(KOK, 'server', 'services', 'documentConversionService.ts'), 'utf-8');
  const entegratorCagrisiVar = /HizliConnectService\.cancelDocument\s*\(/.test(dcs)
    || /provider\.cancelInvoice\s*\(/.test(dcs);

  if (entegratorCagrisiVar) {
    pass('Giden belge iptali entegratöre bildiriliyor (CancelDocument)');
  } else {
    warn('Giden belge iptali entegratöre GİTMİYOR — yalnız ERP tarafı ters çevriliyor',
      'Bulgu: DocumentConversionService.cancelInvoice stok/cari/fatura durumunu geri alır ve ' +
      'faturayı CANCELLED yapar, ancak entegratöre CancelDocument çağrısı YAPMAZ. ' +
      'Sonuç: GİB/entegratör tarafında belge iptal edilmemiş kalır. ' +
      'Entegratör iptali yalnız GELEN belgelerde (incomingInvoiceService → provider.cancelInvoice) ' +
      've ham /hizli/cancel-earsiv rotasında yapılıyor.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('7. ÖLÇÜLMÜŞ İZOLASYON SAYAÇLARI');
// ─────────────────────────────────────────────────────────────────────────────

// Bu dosyanın KENDİSİNDE belge gönderen/iptal eden uç çağrısı olmadığının
// statik kanıtı — beyan değil, dosyanın içeriği taranır (FAZ 18 §11 düzeni).
{
  const kendi = fs.readFileSync(
    path.join(KOK, 'server', 'tests', 'phase19DocumentLifecycleTest.ts'), 'utf-8');
  const satirlar = kendi.split('\n').filter(s => !/^\s*(\/\/|\*|\/\*)/.test(s));
  const yasakliCagri = satirlar.filter(s =>
    /HizliConnectService\.(sendDocument|cancelDocument|sendInvoiceModel|sendEInvoice|sendEArsiv|cancelEArsivInvoice)\s*\(/.test(s));
  assert(yasakliCagri.length === 0,
    'Bu süitte belge gönderen/iptal eden uca GERÇEK çağrı yok (kontör yakılmaz)',
    yasakliCagri.join(' | '));
}

assert(canliyaCikanSayisi === 0,
  'Bu test sırasında canlı (production) endpoint\'e hiçbir istek GÖNDERİLMEDİ',
  `kullanılan adres sayısı: ${kullanilanAdresler.length}, sandbox: ${sandboxAdresSayisi}, ` +
  `canlıya çıkan: ${canliyaCikanSayisi}`);

assert(kullanilanAdresler.length > 0 && kullanilanAdresler.every(a => a.isTest === true),
  'Servise yapılan her çağrıda isTest=true geçildi (canlı yolu hiç seçilmedi)',
  kullanilanAdresler.filter(a => !a.isTest).map(a => a.url).join(', '));

// ─────────────────────────────────────────────────────────────────────────────
// SONUÇ
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('İŞBEY CLOUD — FAZ 19 BELGE YAŞAM DÖNGÜSÜ TEST SONUÇLARI');
console.log('='.repeat(70));

const total = passCount + failCount + warnCount + skipCount;
console.log(`\n  Toplam Test : ${total}`);
console.log(`  ✅ PASS     : ${passCount}`);
console.log(`  ❌ FAIL     : ${failCount}`);
console.log(`  ⚠️  WARN     : ${warnCount}`);
console.log(`  ⏭️  SKIP     : ${skipCount}`);

console.log('\n' + '─'.repeat(70));
console.log('\n  FAZ 19 BELGE YAŞAM DÖNGÜSÜ ÖZETİ:');
console.log(`  Hedef              : TEST/SANDBOX (${TEST_HOST})`);
console.log(`  Koşu ortamı egress : ${egressEngelli ? 'ENGELLİ (kanıt üretilemez)' : 'AÇIK'}`);
console.log(`  Auth zinciri       : ${authKanitlandi ? 'KANITLANDI (gerçek Bearer token)' : 'KANITLANAMADI'}`);
console.log(`  Hedefe ulaşan istek: ${hedefeUlasanSayisi} (erişim engeli: ${erisimEngeliSayisi})`);
console.log(`  Belge üretimi      : YEREL (ağ yok, kontör yok)`);
console.log(`  Belge GÖNDERİMİ    : ⛔ YAPILMADI (kontör tüketir — ayrı onay fazı gerekir)`);
console.log(`  Kontör tüketimi    : 0`);
console.log(`  Canlıya çıkan istek: ${canliyaCikanSayisi}`);

console.log('\n' + '─'.repeat(70));

if (failCount > 0) {
  console.error(`❌ FAZ 19: ${failCount} BAŞARISIZ TEST — Düzeltme gerekiyor!`);
} else if (egressEngelli || hedefeUlasanSayisi === 0) {
  console.log(`⛔ FAZ 19: KOŞULAMADI — sandbox'a hiç ulaşılamadı`);
  console.log(`   (koşu ortamı egress engeli: ${egressEngelli ? 'VAR — allowlist proxy' : 'yok'}, ` +
    `erişim engeli sayacı: ${erisimEngeliSayisi})`);
  console.log('   Hiçbir dış iddia doğrulanmadı. Bu sonuç PASS DEĞİLDİR.');
  console.log('   Gerçek kanıt için süiti egress erişimi OLAN makinede koşun.');
} else {
  // Belge gönderimi SKIP olduğu sürece karar PASS OLAMAZ — yaşam döngüsünün
  // yarısı (gönder / iptal) kanıtlanmamıştır.
  console.log(`🟡 FAZ 19: KOŞULLU — yaşam döngüsünün AUTH ve OKUMA ayağı gerçek sandbox`);
  console.log(`   yanıtıyla kanıtlandı; GÖNDERİM ve İPTAL ayakları KANITLANMADI`);
  console.log(`   (kontör tüketen adımlar bilinçli olarak çalıştırılmadı).`);
  console.log('   ⚠️  PASS DEĞİLDİR. Gönderim ayağı için ayrı onay fazı gerekir.');
}

if (warnCount > 0) {
  console.log('\n  ⚠️  WARN kalemleri production öncesi incelenmelidir.');
}
console.log('');

}

main().catch((err) => {
  console.error('\n❌ FAZ 19 süiti beklenmeyen hata ile durdu:', err);
  process.exit(1);
});
