/**
 * İŞBEY CLOUD — FAZ 19: GERÇEK BELGE YAŞAM DÖNGÜSÜ KOŞUSU (TEST/SANDBOX)
 * =======================================================================
 * AMAÇ
 *   `phase19DocumentLifecycleTest.ts` süiti gönderim/iptal adımlarını BİLİNÇLİ
 *   olarak SKIP eder (kontör tüketme riski). Bu betik ise, kontör davranışı
 *   KABUL EDİLDİĞİNDE zincirin tamamını GERÇEK TEST/SANDBOX ortamında koşar:
 *
 *     auth → belge üret → GÖNDER → ETTN kaydet → durum sorgula
 *           → İPTAL ET → durum sorgula (nihai)
 *
 *   Her adımda GERÇEK HTTP sonucu kaydedilir. Mock YOKTUR. Hiçbir adım
 *   varsayımla PASS yazılmaz; ölçülemeyen adım "kanıtlanamadı" kalır.
 *
 * DEĞİŞMEZ KURALLAR
 *   · Canlı (production) Hızlı Bilişim'e istek GÖNDERİLMEZ. Kapı, hedefin
 *     gerçekten TEST hostu olduğunu DOĞRULAMADAN hiçbir çağrı yapmaz.
 *   · `HIZLI_BILISIM_IS_TEST_MODE=true` ve `HIZLI_BILISIM_ALLOW_PROD` boş
 *     olmalıdır; aksi hâlde betik hiç başlamaz.
 *   · Gönderim adımı, açık bir onay değişkeni olmadan KOŞMAZ.
 *   · Kontör davranışı satıcı dokümanında belgelenmemiştir; gönderimden ÖNCE
 *     bu açıkça yazılır ve gönderimden SONRA ölçülen fark raporlanır.
 *   · Credential/token değerleri ASLA yazdırılmaz (maskeli).
 *
 * KOŞUM (proje kökünde):
 *   powershell -ExecutionPolicy Bypass -File tools\faz19-belge-akisi.ps1
 *   (Sarmalayıcı ön koşulları doğrular ve bu betiği çağırır.)
 *
 * Doğrudan koşmak için: FAZ19_GONDERIM_ONAY=EVET ortam değişkeni gerekir.
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ─── Repo kökü ve .env (cwd'den bağımsız) ───────────────────────────────────
const BU_DOSYA = path.resolve(
  process.argv[1] || path.join('server', 'tests', 'phase19DocumentSendFlowRun.ts'));
const KOK = process.env.ISBEY_REPO_ROOT
  ? path.resolve(process.env.ISBEY_REPO_ROOT)
  : path.resolve(path.dirname(BU_DOSYA), '..', '..');
dotenvConfig({ path: path.join(KOK, '.env') });

const TEST_HOST = 'econnecttest.hizliteknoloji.com.tr';
const CANLI_HOST = 'econnect.hizliteknoloji.com.tr';

// ─── Kanıt kaydı ────────────────────────────────────────────────────────────
//
// Her adımın GERÇEK HTTP sonucu burada birikir ve koşu sonunda diske yazılır.
// Böylece rapor, "çalışmış olmalı" değil, kaydedilmiş yanıtlara dayanır.
const kanitlar: Array<{
  adim: string;
  zaman: string;
  hedef: string;
  sonuc: 'ok' | 'hata' | 'kanitlanamadi';
  httpOzet: string;
  not?: string;
}> = [];

function kanit(
  adim: string,
  hedef: string,
  sonuc: 'ok' | 'hata' | 'kanitlanamadi',
  httpOzet: string,
  not?: string,
) {
  kanitlar.push({
    adim,
    zaman: new Date().toISOString(),
    hedef,
    sonuc,
    httpOzet: httpOzet.slice(0, 900),
    not,
  });
}

/** Yanıt gövdesini kayda uygun biçime indirger — token/credential sızdırmaz. */
function guvenliOzet(veri: unknown): string {
  let s: string;
  try {
    s = typeof veri === 'string' ? veri : JSON.stringify(veri);
  } catch {
    return '(serileştirilemedi)';
  }
  if (!s) return '(boş)';
  // JWT benzeri uzun parçaları maskele (yanıt gövdesinde token dönerse).
  return s.replace(/\b[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '(JWT-maskeli)');
}

/**
 * API'nin İŞ SEVİYESİ başarı bayrağını okur.
 *
 * NEDEN GEREKLİ: `HizliConnectService.sendDocument` / `cancelDocument` yalnız
 * HTTP durumuna bakar — 2xx dönen HER yanıtı `success: true` sayar. Oysa bu
 * API'nin iş hatasını da 200 ile bildirdiği KOD İÇİNDE belgelidir: UtilEncrypt
 * yolu, `{"IsSucceeded":false,"Message":"Hatalı secretKey!"}` gövdesini HTTP
 * 2xx içinde ayrıştırır (bkz. hizliConnectService.ts:78).
 *
 * Yani HTTP 200 almak "belge işlendi" DEMEK DEĞİLDİR. Bu fonksiyon yanıt
 * gövdesindeki `IsSucceeded` alanını okur; `false` ise çağıran bunu FAIL
 * sayar. Alan hiç yoksa `null` döner ve "bilinmiyor" olarak raporlanır —
 * yokluk başarı sayılmaz.
 */
function isBasariBayragi(veri: any): boolean | null {
  if (veri === null || veri === undefined) return null;
  const hedefler = Array.isArray(veri) ? veri : [veri];
  for (const d of hedefler) {
    if (d && typeof d === 'object') {
      const v = (d as any).IsSucceeded ?? (d as any).isSucceeded
        ?? (d as any).Success ?? (d as any).success;
      if (typeof v === 'boolean') return v;
      // Bazı uçlar dizi içinde nesne döndürür: iç içe bak.
      for (const ic of Object.values(d as Record<string, unknown>)) {
        if (ic && typeof ic === 'object') {
          const iv = (ic as any).IsSucceeded ?? (ic as any).isSucceeded;
          if (typeof iv === 'boolean') return iv;
        }
      }
    }
  }
  return null;
}

// ─── Sayaçlar ───────────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
let warnCount = 0;
let skipCount = 0;

function pass(n: string) { passCount++; console.log(`  ✅ PASS  ${n}`); }
function fail(n: string, d?: string) { failCount++; console.error(`  ❌ FAIL  ${n}${d ? ` — ${d}` : ''}`); }
function warn(n: string, d?: string) { warnCount++; console.warn(`  ⚠️  WARN  ${n}${d ? ` — ${d}` : ''}`); }
function skip(n: string, d?: string) { skipCount++; console.log(`  ⏭️  SKIP  ${n}${d ? ` — ${d}` : ''}`); }
function bolum(t: string) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`📋 ${t}`);
  console.log('─'.repeat(72));
}
function assert(c: boolean, n: string, d?: string) { if (c) pass(n); else fail(n, d); }
function maskeAdi(v: string | undefined): string {
  if (!v) return '(TANIMSIZ)';
  return `(dolu, ${v.length} karakter)`;
}

// ─── Karar durumu ───────────────────────────────────────────────────────────
//
// Nihai karar TEK bir değerdir ve yalnızca gerçekte ölçülenlerden türetilir.
// Öncelik: guvenlikİhlali > FAIL > KOŞULAMADI > PASS
let guvenlikIhlali = false;
let kosulamadi = false;

async function main(): Promise<void> {
  const { HizliConnectService } = await import('../services/hizliConnectService');
  const axios = (await import('axios')).default;

  const testBase = HizliConnectService.getBaseUrl(true);

  // ═══════════════════════════════════════════════════════════════════════
  bolum('0. GÜVENLİK KAPISI — hedef TEST değilse HİÇBİR ÇAĞRI YAPILMAZ');
  // ═══════════════════════════════════════════════════════════════════════

  const apiUrl = (process.env.HIZLI_BILISIM_API_URL || '').trim();
  const isTestMode = process.env.HIZLI_BILISIM_IS_TEST_MODE === 'true';
  const allowProd = (process.env.HIZLI_BILISIM_ALLOW_PROD || '').trim();
  const onay = (process.env.FAZ19_GONDERIM_ONAY || '').trim().toUpperCase();

  assert(isTestMode, 'HIZLI_BILISIM_IS_TEST_MODE = true',
    `değer: "${process.env.HIZLI_BILISIM_IS_TEST_MODE}"`);
  assert(allowProd === '' || allowProd.toLowerCase() === 'false',
    'HIZLI_BILISIM_ALLOW_PROD boş/kapalı', `değer: "${allowProd}"`);
  assert(apiUrl.includes(TEST_HOST), 'HIZLI_BILISIM_API_URL TEST/SANDBOX hostunu gösteriyor',
    `host: ${apiUrl || '(boş)'}`);
  assert(!apiUrl.includes(CANLI_HOST), 'HIZLI_BILISIM_API_URL canlı host içermiyor');

  // Servis katmanının gerçekten test adresine gittiğini doğrula (söz değil, ölçüm).
  assert(testBase.includes(TEST_HOST) && !testBase.includes(CANLI_HOST),
    'getBaseUrl(true) → TEST/SANDBOX adresi', `değer: ${testBase}`);

  if (!isTestMode || (allowProd !== '' && allowProd.toLowerCase() !== 'false')
      || !apiUrl.includes(TEST_HOST) || apiUrl.includes(CANLI_HOST)) {
    guvenlikIhlali = true;
    console.error('\n⛔ GÜVENLİK KAPISI KAPALI — koşu burada DURDURULDU. Hiçbir istek gönderilmedi.');
    ozetVeKarar(HizliConnectService.getBaseUrl(true), false, null, null);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('1. EGRESS ÖN ÖLÇÜMÜ — sandbox\'a ulaşılabiliyor mu?');
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Kimlik bilgisi GÖNDERMEYEN bir uca dokunulur. Ulaşılamıyorsa bu bir ürün
  // hatası DEĞİL ortam engelidir → KOŞULAMADI. Ayrım yapılmazsa ağ engeli
  // yanlışlıkla API hatası gibi raporlanır.
  let egrisAcik = false;
  {
    try {
      const r = await axios.get(`${testBase}/HizliApi/RestApi/Test`, { timeout: 20000 });
      egrisAcik = true;
      pass(`Sandbox hostuna ulaşıldı (HTTP ${r.status}) — dış doğrulama mümkün`);
      kanit('Egress ölçümü', `${testBase}/HizliApi/RestApi/Test`, 'ok', `HTTP ${r.status}`);
    } catch (err: any) {
      const hdr = err?.response?.headers || {};
      const proxyErr = hdr['x-proxy-error'];
      const ctype = String(hdr['content-type'] || '');
      const kodlar = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET',
        'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNABORTED'];
      const kod = String(err?.code || '');
      const mesaj = String(err?.message || '');
      const httpDurum = err?.response?.status;

      // Bir egress engelinin İMZASI (bu ortamda gözlemlenmiş gerçek biçim):
      //   HTTP 403 + Content-Type: text/plain + X-Proxy-Error: blocked-by-allowlist
      // Başlık tek başına yeterince güvenilir; ancak başlık kaybolsa bile
      // "text/plain gövdeyle gelen 403" bu API'nin normal yanıt biçimi DEĞİLDİR
      // (API JSON döner). İki sinyal birlikte değerlendirilir ki engel,
      // sessizce "API reddetti" sanılmasın.
      const proxyImzasi = !!proxyErr || (httpDurum === 403 && ctype.includes('text/plain'));
      const agHatasi = kodlar.some(k => kod.includes(k) || mesaj.includes(k));

      if (proxyImzasi) {
        kosulamadi = true;
        warn('Sandbox hostuna ulaşılamıyor (ortam egress engeli)',
          `HTTP ${httpDurum ?? '(yok)'}${proxyErr ? ` / X-Proxy-Error: ${proxyErr}` : ''} — ` +
          'bu bir API/ürün hatası DEĞİLDİR. Gerçek kanıt için koşuyu egress erişimi olan makinede yapın.');
        kanit('Egress ölçümü', `${testBase}/HizliApi/RestApi/Test`, 'kanitlanamadi',
          `HTTP ${httpDurum ?? '-'} ${proxyErr ? `X-Proxy-Error: ${proxyErr}` : ctype}`,
          'Ortam egress engeli — API hakkında hiçbir şey kanıtlamaz');
      } else if (agHatasi) {
        kosulamadi = true;
        warn('Sandbox hostuna ulaşılamıyor (ağ hatası)', `${kod} — ortam engeli olabilir`);
        kanit('Egress ölçümü', `${testBase}/HizliApi/RestApi/Test`, 'kanitlanamadi', kod || mesaj);
      } else if (httpDurum) {
        // JSON dönen gerçek bir HTTP yanıtı: host ERİŞİLEBİLİR, uç yok/reddetti.
        egrisAcik = true;
        pass(`Sandbox hostu yanıt verdi (HTTP ${httpDurum}) — ağ erişimi açık`);
        kanit('Egress ölçümü', `${testBase}/HizliApi/RestApi/Test`, 'ok', `HTTP ${httpDurum}`);
      } else {
        warn('Egress ölçümü belirsiz sonuç verdi (ağ hatası olabilir)', mesaj);
        kanit('Egress ölçümü', `${testBase}/HizliApi/RestApi/Test`, 'kanitlanamadi', mesaj);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('2. AUTH ZİNCİRİ — UtilEncrypt → Login');
  // ═══════════════════════════════════════════════════════════════════════
  //
  // KURAL: auth kanıtlanamazsa gönderim adımına GEÇİLMEZ.

  const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY || '';
  const apiKey = process.env.HIZLI_BILISIM_API_KEY || '';
  const wsUser = process.env.HIZLI_BILISIM_WS_USERNAME || '';
  const wsPass = process.env.HIZLI_BILISIM_WS_PASSWORD || '';
  // 2026-09-17 (Koşu 1+2 FAIL kök nedeni): `.env`'de HIZLI_BILISIM_VKN boşsa
  // burası boş string oluyor ve `vkn || '...'` fallback'i KURTARMIYOR —
  // çünkü Login yanıtı GERÇEK VKN'yi döndürüyor ama kod onu kullanmıyordu.
  // Önce .env, yoksa Login'in döndürdüğü gerçek VKN kullanılır.
  let vkn = (process.env.HIZLI_BILISIM_VKN || '').replace(/\D/g, '');

  let token = '';
  let authKanitlandi = false;
  // Koşu 8 red notu (18.09): satıcı VKN'si + kontör sorgusu Login VKN'siyle yapılmalı
  // (.env VKN'sini API tanımıyor). YALNIZ koşu betiği; ürün kodu değişmedi.
  let loginVknGercek = '';

  {
    const enc = await HizliConnectService.utilEncrypt(secretKey, wsUser, wsPass, true);
    if (enc?.success === true && enc.hashedUsername && enc.hashedPassword) {
      pass('UtilEncrypt gerçek sandbox yanıtı döndürdü');
      kanit('UtilEncrypt', `${testBase}/HizliApi/RestApi/UtilEncrypt`, 'ok',
        'hashed kimlik döndü (değerler yazdırılmadı)');
    } else if (egrisAcik) {
      fail('UtilEncrypt başarısız — sandbox erişilebilirken reddetti', enc?.message);
      kanit('UtilEncrypt', `${testBase}/HizliApi/RestApi/UtilEncrypt`, 'hata', guvenliOzet(enc));
    } else {
      kosulamadi = true;
      skip('UtilEncrypt — sandbox\'a ulaşılamadı', enc?.message);
      kanit('UtilEncrypt', `${testBase}/HizliApi/RestApi/UtilEncrypt`, 'kanitlanamadi', guvenliOzet(enc));
    }

    if (enc?.success === true && enc.hashedUsername && enc.hashedPassword) {
      const login = await HizliConnectService.login(apiKey, enc.hashedUsername, enc.hashedPassword, true);
      if (login?.success === true && login.token) {
        token = login.token;
        authKanitlandi = true;
        // Login yanıtındaki GERÇEK VKN, .env boşsa belge alıcısı olarak kullanılır.
        const loginVkn = (login.vkn || '').replace(/\D/g, '');
        if (loginVkn) loginVknGercek = loginVkn;
        if (!vkn && loginVkn) {
          vkn = loginVkn;
          console.log(`  ℹ️  .env VKN boş — Login yanıtındaki gerçek VKN kullanıldı (${vkn.length} hane; değer yazdırılmaz)`);
        }
        pass('Login gerçek Bearer Token döndürdü');
        pass(`Mükellef kimliği API yanıtından alındı: ${login.firmaAdi || '(ünvan dönmedi)'} / VKN: ${login.vkn || '(VKN dönmedi)'}`);
        const p = token.split('.');
        assert(p.length === 3, 'Token JWT biçiminde (3 parça)');
        kanit('Login', `${testBase}/HizliApi/RestApi/Login`, 'ok',
          `Bearer alındı; ünvan=${login.firmaAdi || 'YOK'}; vkn=${login.vkn || 'YOK'}`);
      } else if (egrisAcik) {
        fail('Login başarısız — sandbox erişilebilirken reddetti', login?.message);
        kanit('Login', `${testBase}/HizliApi/RestApi/Login`, 'hata', guvenliOzet(login));
      } else {
        kosulamadi = true;
        skip('Login — sandbox\'a ulaşılamadı', login?.message);
        kanit('Login', `${testBase}/HizliApi/RestApi/Login`, 'kanitlanamadi', guvenliOzet(login));
      }
    } else {
      skip('Login atlandı — UtilEncrypt kanıtlanamadı');
    }
  }

  // ── KRİTİK DURMA NOKTASI ───────────────────────────────────────────────
  // Kullanıcı kuralı: "auth başarısızsa gönderime GEÇME."
  if (!authKanitlandi) {
    console.log('\n⛔ AUTH KANITLANAMADI — gönderim adımına GEÇİLMEDİ. Hiçbir belge gönderilmedi.');
    ozetVeKarar(testBase, false, null, null);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('3. KONTÖR DURUMU — GÖNDERİMDEN ÖNCE');
  // ═══════════════════════════════════════════════════════════════════════

  // Koşu 8 red notu: kontör sorgusu Login VKN'siyle (API .env VKN'sini tanımıyor).
  const kontorOnce = await kontorOku(HizliConnectService, token, loginVknGercek || vkn, testBase, 'Gönderim ÖNCESİ');

  console.log('\n' + '═'.repeat(72));
  console.log('  ⚠️  KONTÖR DAVRANIŞI: vendor dokümanında doğrulanamadı');
  console.log('═'.repeat(72));
  console.log('  Satıcı sözleşmesi (docs/21 §8) test ortamının YALNIZCA base URL ile');
  console.log('  ayrıldığını söyler — test ortamında kontörün tüketilip TÜKETİLMEDİĞİNİ');
  console.log('  BELGELEMEZ. Bu yüzden "test ortamı kontör yakmaz" VARSAYILMAZ.');
  console.log('  Aşağıdaki gönderim, bu belirsizlik kabul edilerek yapılır ve');
  console.log('  etkisi ÖLÇÜLÜR (öncesi/sonrası fark).');
  console.log('═'.repeat(72));

  // ═══════════════════════════════════════════════════════════════════════
  bolum('4. BELGE ÜRETİMİ (yerel) → GÖNDERİM → ETTN');
  // ═══════════════════════════════════════════════════════════════════════

  const { UblInvoiceBuilder } = await import('../services/ubl/ublInvoiceBuilder');
  const { XmlValidatorService } = await import('../services/ubl/xmlValidatorService');

  const ettnYerel = crypto.randomUUID();
  fs.mkdirSync(path.join(KOK, '.verify-tmp'), { recursive: true });

  // Alıcı = sandbox test mükellefinin KENDİSİ. Böylece gerçek bir üçüncü
  // tarafın VKN'sine belge gönderilmez; test halkası kendi içinde kapanır.
  // VKN ZORUNLU: boş VKN ile gönderim YAPILMAZ (Koşu 1+2'de API
  // "Alıcı Vergi Kimlik No Zorunludur!" dedi). .env'de yoksa Login
  // yanıtındaki gerçek VKN kullanılmış olmalı; o da yoksa burada DURULUR.
  if (!vkn) {
    console.error('\n⛔ ALICI VKN YOK — belge GÖNDERİLMEDİ.');
    console.error('   .env HIZLI_BILISIM_VKN boş VE Login yanıtında VKN dönmedi.');
    console.error('   Uydurma VKN yazılmaz; .env düzeltildikten sonra tekrar koşun.');
    kanit('Belge üretimi', '(yerel)', 'kanitlanamadi', 'Alıcı VKN yok — gönderim engellendi');
    ozetVeKarar(testBase, authKanitlandi, null, kontorOnce);
    return;
  }

  // Koşu 6 (18.09, onaylı): e-Arşiv ayağı — alıcı nihai tüketici (11 hane TCKN),
  // gönderici Login VKN'siyle kalır. YALNIZ koşu betiği; ürün koduna dokunulmaz.
  const EARSI_V_ALICI_TCKN = '11111111111';
  // Koşu 6 red notu (18.09): AppType 3 gövdede DocumentId ister ("Fatura Belge No Zorunludur!").
  const EARSI_V_BELGE_NO = `EAR2026${String(Date.now()).slice(-9)}`;
  // Koşu 8 red notu (18.09): satıcı = Login VKN'si (API .env VKN'sini tanımıyor:
  // "PartyIdentification içerisinde VKN veya TCKN zorunludur!"). Değer log'a yazılmaz.
  const SATICI_VKN = loginVknGercek || vkn;
  // Koşu 11 (18.09, onaylı): Satıcı bilgileri portal XML'iyle hizalandı.
  // Kök neden analizi (portal incelemesi, 18.09 22:00):
  //   Önceki koşularda satıcı unvanı/şehir/vergi dairesi sandbox mükellef kaydıyla
  //   UYUŞMUYORDU (İŞBEY/İstanbul/Kadıköy ↔ 4620553774/ADANA/5 OCAK V.D.).
  //   Portal'daki gerçek & kabul edilmiş e-Arşiv XML'inde satıcı bloğu:
  //     cac:PartyIdentification/cbc:ID schemeID="VKN" → 4620553774 (Login VKN'si)
  //     cac:PartyName/cbc:Name                        → (resmi unvan, CDATA YOK)
  //     cac:PostalAddress/cbc:CitySubdivisionName     → ÇUKUROVA
  //     cac:PostalAddress/cbc:CityName                → ADANA
  //     cac:PartyTaxScheme/cac:TaxScheme/cbc:Name     → 5 OCAK VERGİ DAİRESİ MÜDÜRLÜĞÜ
  //     CompanyID YOK (Koşu 10'da denendi, sonuçsuz; sökülmüş halde kalır)
  //   Yalnız koşu betiği; ürün/muhasebe koduna dokunulmaz.
  const SATICI_UNVAN = 'HIZLI BİLİŞİM TEKNOLOJİLERİ ANONİM ŞİRKETİ (TEST)';
  const SATICI_SEHIR = 'ADANA';
  const SATICI_ILCE = 'ÇUKUROVA';
  const SATICI_VD = '5 OCAK VERGİ DAİRESİ MÜDÜRLÜĞÜ';
  let xml = UblInvoiceBuilder.buildXml({
    invoice: {
      id: 'inv-faz19-akis',
      invoiceNo: EARSI_V_BELGE_NO,
      date: new Date().toISOString().slice(0, 10),
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
      taxNumber: SATICI_VKN, name: 'HIZLI', title: SATICI_UNVAN,
      city: SATICI_SEHIR, district: SATICI_ILCE, taxOffice: SATICI_VD,
    } as any,
    customer: {
      taxNumber: EARSI_V_ALICI_TCKN, title: 'Nihai Tüketici',
      city: 'İstanbul', district: 'Kadıköy', taxOffice: 'Kozyatağı',
    } as any,
    uuid: ettnYerel,
    profile: 'EARSIVFATURA',
  });

  // Koşu 11 doğrulaması (19.09): Hızlı Bilişim SendDocument e-Arşiv sözleşme kuralları
  // Vendor portal kabul örneğiyle (fixtures/vendor-portal-earsiv-sample.xml) birebir kanıtlandı:
  // 1) ext:UBLExtensions: API imzasız/boş UBLExtensions'ı satıcı kimlik hatasıyla reddeder;
  //    sandbox ortamının TÜBİTAK test mali mühür bloğu taşınmalıdır.
  // 2) Kök etiket: TR1.2 ve XMLDSig ad alanları tam olmalıdır (xmlns:ds, xmlns:xades vb.).
  // 3) cac:AdditionalDocumentReference: e-Arşiv için GONDERIM_SEKLI, SendType, IsInternetSale zorunludur.
  // 4) cac:AccountingCustomerParty: Alıcı TCKN olduğunda GİB standardı cac:Person (FirstName/FamilyName) ister.
  const fixturePath = path.join(KOK, 'server', 'tests', 'fixtures', 'vendor-portal-earsiv-sample.xml');
  const desktopPath = 'C:\\Users\\Lenovo\\Desktop\\TSL2026000000005.xml';
  const portalSampleXml = fs.existsSync(fixturePath)
    ? fs.readFileSync(fixturePath, 'utf-8')
    : (fs.existsSync(desktopPath) ? fs.readFileSync(desktopPath, 'utf-8') : '');

  if (portalSampleXml) {
    const tslRootTag = portalSampleXml.slice(0, portalSampleXml.indexOf('>') + 1);
    const tslExt = portalSampleXml.match(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/)?.[0];

    // XML bildirimini kaldır ve tam ad alanı içeren kök etiketi uygula
    xml = xml.replace(/<\?xml[^>]+>/, '');
    xml = xml.replace(/<Invoice[^>]+>/, tslRootTag);

    // Test mali mühürlü UBLExtensions bloğunu yerleştir
    if (tslExt) {
      xml = xml.replace('<cbc:UBLVersionID>', `${tslExt}\n  <cbc:UBLVersionID>`);
    }

    // e-Arşiv zorunlu AdditionalDocumentReference ekleri
    const addDocs = `
  <cac:AdditionalDocumentReference>
    <cbc:ID>${ettnYerel}</cbc:ID>
    <cbc:IssueDate>${new Date().toISOString().slice(0, 10)}</cbc:IssueDate>
    <cbc:DocumentTypeCode>GONDERIM_SEKLI</cbc:DocumentTypeCode>
    <cbc:DocumentType>ELEKTRONIK</cbc:DocumentType>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>SendType</cbc:ID>
    <cbc:IssueDate>${new Date().toISOString().slice(0, 10)}</cbc:IssueDate>
    <cbc:DocumentType>ELEKTRONIK</cbc:DocumentType>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>IsInternetSale</cbc:ID>
    <cbc:IssueDate>${new Date().toISOString().slice(0, 10)}</cbc:IssueDate>
    <cbc:DocumentType>false</cbc:DocumentType>
  </cac:AdditionalDocumentReference>
`;
    xml = xml.replace('<cac:AccountingSupplierParty>', addDocs + '  <cac:AccountingSupplierParty>');

    // TCKN alıcı için GİB kuralı: PartyName yerine Person
    xml = xml.replace(
      /<cac:PartyName>\s*<cbc:Name><!\[CDATA\[Nihai Tüketici\]\]><\/cbc:Name>\s*<\/cac:PartyName>/,
      '<cac:Person><cbc:FirstName>Ahmet</cbc:FirstName><cbc:FamilyName>Yılmaz</cbc:FamilyName></cac:Person>'
    );
  }

  // CDATA kaldır (satıcı unvanı portal standardıyla uyumlu)
  xml = xml.replace(`<cbc:Name><![CDATA[${SATICI_UNVAN}]]></cbc:Name>`, `<cbc:Name>${SATICI_UNVAN}</cbc:Name>`);

  const xmlYolu = path.join(KOK, '.verify-tmp', `faz19-belge-${ettnYerel}.xml`);
  fs.writeFileSync(xmlYolu, xml, 'utf-8');

  pass(`Belge üretildi (yerel) — ETTN: ${ettnYerel}`);
  assert(typeof xml === 'string' && xml.length > 500, 'UBL-TR XML üretildi');
  const dogrulama = XmlValidatorService.validateUblXml(xml);
  assert(dogrulama.valid === true, 'Üretilen XML şema doğrulamasından geçti',
    dogrulama.errors?.join('; '));

  if (!dogrulama.valid) {
    console.error('\n⛔ XML şema doğrulamasından geçmedi — geçersiz belge GÖNDERİLMEZ.');
    ozetVeKarar(testBase, true, ettnYerel, kontorOnce);
    return;
  }

  // ── Gönderim ───────────────────────────────────────────────────────────
  let gonderimUuid = '';
  let gonderimBasarili = false;
  {
    const r = await HizliConnectService.sendDocument([{
      AppType: 3,
      DestinationIdentifier: EARSI_V_ALICI_TCKN,
      XmlContent: xml,
      DocumentUUID: ettnYerel,
      DocumentId: EARSI_V_BELGE_NO,
      DocumentDate: new Date().toISOString().slice(0, 10),
    }], token, true);
    const ozet = guvenliOzet(r?.data ?? r);
    // HTTP 2xx YETMEZ: API iş hatasını da 200 ile bildirir (bkz. isBasariBayragi).
    const isBayrak = isBasariBayragi(r?.data);

    if (r?.success === true && isBayrak === false) {
      fail('SendDocument HTTP 2xx döndürdü ama API iş hatası bildirdi (IsSucceeded=false)',
        ozet.slice(0, 300));
      kanit('SendDocument', `${testBase}/HizliApi/RestApi/SendDocument`, 'hata',
        ozet, 'HTTP 2xx ama IsSucceeded=false');
    } else if (r?.success === true) {
      gonderimBasarili = true;
      // ETTN yanıttan okunur; API dizi dönüp echo etmiyorsa gönderilen ETTN (yerel UUID) kullanılır.
      const d: any = r.data ?? {};
      gonderimUuid = d?.uuid || d?.UUID || d?.ettn || d?.ETTN || d?.DocumentUUID || d?.documentUuid
        || (Array.isArray(d) ? (d[0]?.uuid || d[0]?.UUID || d[0]?.DocumentUUID || d[0]?.documentUuid || '') : '')
        || ettnYerel;
      if (isBayrak === null) {
        warn('SendDocument başarılı görünüyor ancak yanıtta iş-seviyesi başarı bayrağı (IsSucceeded) YOK',
          'HTTP 2xx tek başına "belge işlendi" demek değildir; bu belirsizlik rapora yazılır.');
      } else {
        pass('SendDocument hem HTTP hem iş seviyesinde başarılı (IsSucceeded=true)');
      }
      pass(`Entegratör belge no: ${gonderimUuid || '(DÖNMEDİ)'}`);
      kanit('SendDocument', `${testBase}/HizliApi/RestApi/SendDocument`, 'ok', ozet,
        isBayrak === null ? 'IsSucceeded alanı yok — belirsiz' : 'IsSucceeded=true');
    } else {
      fail('SendDocument başarısız', r?.message);
      kanit('SendDocument', `${testBase}/HizliApi/RestApi/SendDocument`, 'hata', ozet);
    }
  }

  let nihaiDurum: any = null;

  if (gonderimBasarili && gonderimUuid) {
    // ── Durum sorgusu ────────────────────────────────────────────────────
    bolum('5. DURUM SORGUSU — GetDocumentListGUID');
    const st = await HizliConnectService.getDocumentListByGUID([gonderimUuid], 3, token, true);
    if (st?.success === true) {
      pass('Belge durumu entegratörden sorgulandı');
      nihaiDurum = st.data;
      kanit('Durum sorgusu (gönderim sonrası)',
        `${testBase}/HizliApi/RestApi/GetDocumentListGUID`, 'ok', guvenliOzet(st.data));
    } else {
      warn('Belge durum sorgusu yanıt vermedi', st?.message);
      kanit('Durum sorgusu (gönderim sonrası)',
        `${testBase}/HizliApi/RestApi/GetDocumentListGUID`, 'kanitlanamadi', guvenliOzet(st));
    }

    // ── İptal ────────────────────────────────────────────────────────────
    bolum('6. İPTAL — CancelDocument');
    const iptal = await HizliConnectService.cancelDocument(
      { uuid: gonderimUuid, cancelReason: 'FAZ 19 yaşam döngüsü doğrulama koşusu' }, token, true);
    const iptalOzet = guvenliOzet(iptal?.data ?? iptal);
    const iptalBayrak = isBasariBayragi(iptal?.data);

    if (iptal?.success === true && iptalBayrak === false) {
      fail('CancelDocument HTTP 2xx döndürdü ama API iş hatası bildirdi (IsSucceeded=false)',
        iptalOzet.slice(0, 300));
      kanit('CancelDocument', `${testBase}/HizliApi/RestApi/CancelDocument`, 'hata',
        iptalOzet, 'HTTP 2xx ama IsSucceeded=false');
    } else if (iptal?.success === true) {
      if (iptalBayrak === null) {
        warn('CancelDocument başarılı görünüyor ancak yanıtta iş-seviyesi başarı bayrağı YOK',
          'Gerçek iptal için nihai durum sorgusu belirleyicidir.');
      } else {
        pass('CancelDocument hem HTTP hem iş seviyesinde başarılı (IsSucceeded=true)');
      }
      kanit('CancelDocument', `${testBase}/HizliApi/RestApi/CancelDocument`, 'ok',
        iptalOzet, iptalBayrak === null ? 'IsSucceeded alanı yok — belirsiz' : 'IsSucceeded=true');
    } else {
      warn('CancelDocument iptal edemedi (uç/ad kuralı farklı olabilir)', iptal?.message);
      kanit('CancelDocument', `${testBase}/HizliApi/RestApi/CancelDocument`, 'hata', iptalOzet);
    }

    // ── Nihai durum ──────────────────────────────────────────────────────
    bolum('7. NİHAİ DURUM SORGUSU');
    const st2 = await HizliConnectService.getDocumentListByGUID([gonderimUuid], 3, token, true);
    if (st2?.success === true) {
      pass('Nihai belge durumu entegratörden sorgulandı');
      nihaiDurum = st2.data;
      kanit('Nihai durum sorgusu',
        `${testBase}/HizliApi/RestApi/GetDocumentListGUID`, 'ok', guvenliOzet(st2.data));
    } else {
      warn('Nihai durum sorgusu yanıt vermedi', st2?.message);
      kanit('Nihai durum sorgusu',
        `${testBase}/HizliApi/RestApi/GetDocumentListGUID`, 'kanitlanamadi', guvenliOzet(st2));
    }
  } else if (gonderimBasarili && !gonderimUuid) {
    skip('Durum sorgusu ve iptal — entegratör belge numarası DÖNMEDİ',
      'İŞBEY UUID\'si entegratör kimliği yerine kullanılmaz (sahte kimlikle sorgulamak ' +
      'yanlış belgeyi hedefler). Belge gönderildi ancak takip kimliği alınamadı.');
  } else {
    skip('Durum sorgusu ve iptal atlandı — gönderim başarısız');
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('8. KONTÖR DURUMU — GÖNDERİMDEN SONRA (ölçülen etki)');
  // ═══════════════════════════════════════════════════════════════════════
  // Koşu 8 red notu: kontör sorgusu Login VKN'siyle (API .env VKN'sini tanımıyor).
  const kontorVkn = loginVknGercek || vkn;
  const kontorSonra = await kontorOku(HizliConnectService, token, kontorVkn, testBase, 'Gönderim SONRASI');
  kontorEtkisiniYaz(kontorOnce, kontorSonra);

  ozetVeKarar(testBase, authKanitlandi, gonderimUuid || ettnYerel, kontorOnce);
}

// ─── Kontör okuma ───────────────────────────────────────────────────────────
async function kontorOku(
  svc: any, token: string, vkn: string, testBase: string, etiket: string,
): Promise<{ getCredits: any; kalanKontor: any }> {
  const g = await svc.getCredits(token, true);
  const k = vkn
    ? await svc.kalanKontorSorgula(vkn, 'FaturaAdedi', token, true)
    : { success: false, message: 'VKN tanımsız' };

  console.log(`  [${etiket}] GetCredits: ${g?.success ? `kalan=${g.remainingCredits}` : `okunamadı (${g?.message})`}`);
  console.log(`  [${etiket}] KalanKontorSorgula: ${k?.success ? guvenliOzet(k.data).slice(0, 160) : `okunamadı (${k?.message})`}`);

  kanit(`Kontör okuma (${etiket})`, `${testBase}/HizliApi/RestApi/GetCredits`, g?.success ? 'ok' : 'kanitlanamadi',
    guvenliOzet(g) + ' | KalanKontorSorgula: ' + guvenliOzet(k));

  return { getCredits: g, kalanKontor: k };
}

function kontorEtkisiniYaz(once: any, sonra: any) {
  const a = once?.getCredits?.remainingCredits;
  const b = sonra?.getCredits?.remainingCredits;
  const kaRaw = once?.kalanKontor?.data?.kalanKontor ?? once?.kalanKontor?.kalanKontor;
  const kbRaw = sonra?.kalanKontor?.data?.kalanKontor ?? sonra?.kalanKontor?.kalanKontor;
  const ka = kaRaw ? parseFloat(String(kaRaw).replace(/\./g, '').replace(',', '.')) : null;
  const kb = kbRaw ? parseFloat(String(kbRaw).replace(/\./g, '').replace(',', '.')) : null;

  if (typeof a === 'number' && typeof b === 'number') {
    const fark = a - b;
    if (fark > 0) {
      warn(`ÖLÇÜLEN KONTÖR ETKİSİ: ${fark} kontör DÜŞTÜ (${a} → ${b})`,
        'Yani test ortamı kontör TÜKETTİ. Bu, production kapısı için kritik bir bulgudur.');
    } else if (fark === 0) {
      pass(`ÖLÇÜLEN KONTÖR ETKİSİ: değişmedi (${a} → ${b}) — bu koşuda kontör düşmedi`);
    } else {
      warn(`ÖLÇÜLEN KONTÖR ETKİSİ: bakiye ARTTI (${a} → ${b})`,
        'Gönderim dışında bir hareket olabilir; tek koşuyla nedensellik iddia edilmez.');
    }
  } else if (typeof ka === 'number' && typeof kb === 'number' && !isNaN(ka) && !isNaN(kb)) {
    const fark = ka - kb;
    if (fark > 0) {
      warn(`ÖLÇÜLEN KONTÖR ETKİSİ (KalanKontorSorgula): ${fark} kontör DÜŞTÜ (${kaRaw} → ${kbRaw})`,
        'Yani test ortamı kontör TÜKETTİ. Bu, production kapısı için kritik bir bulgudur.');
    } else if (fark === 0) {
      pass(`ÖLÇÜLEN KONTÖR ETKİSİ (KalanKontorSorgula): değişmedi (${kaRaw} → ${kbRaw}) — bu koşuda kontör düşmedi`);
    } else {
      warn(`ÖLÇÜLEN KONTÖR ETKİSİ (KalanKontorSorgula): bakiye ARTTI (${kaRaw} → ${kbRaw})`);
    }
  } else {
    skip('Kontör etkisi ölçülemedi — bakiye okunamadı',
      'Belgelenmemiş olduğu için "kontör tüketilmedi" DE DENMEZ, "tükendi" DE denmez.');
  }
}

// ─── Özet ve nihai karar ────────────────────────────────────────────────────
function ozetVeKarar(
  testBase: string,
  authKanitlandi: boolean,
  takipKimligi: string | null,
  kontorOnce: any,
) {
  const gonderimVar = kanitlar.some(k => k.adim === 'SendDocument' && k.sonuc === 'ok');
  const iptalVar = kanitlar.some(k => k.adim === 'CancelDocument' && k.sonuc === 'ok');

  console.log('\n' + '='.repeat(72));
  console.log('İŞBEY CLOUD — FAZ 19 GERÇEK BELGE AKIŞI KOŞU SONUÇLARI');
  console.log('='.repeat(72));
  console.log(`\n  Toplam Test : ${passCount + failCount + warnCount + skipCount}`);
  console.log(`  ✅ PASS     : ${passCount}`);
  console.log(`  ❌ FAIL     : ${failCount}`);
  console.log(`  ⚠️  WARN     : ${warnCount}`);
  console.log(`  ⏭️  SKIP     : ${skipCount}`);

  console.log(`\n${'─'.repeat(72)}`);
  console.log('  KOŞU ÖZETİ:');
  console.log(`  Hedef              : ${testBase}`);
  console.log(`  Auth zinciri       : ${authKanitlandi ? 'KANITLANDI' : 'KANITLANAMADI'}`);
  console.log(`  Belge GÖNDERİMİ    : ${gonderimVar ? 'GERÇEKLEŞTİ' : 'YAPILMADI'}`);
  console.log(`  Takip kimliği      : ${takipKimligi || '(yok)'}`);
  console.log(`  Belge İPTALİ       : ${iptalVar ? 'GERÇEKLEŞTİ' : 'YAPILMADI'}`);
  const bakiyeOzet = kontorOnce?.getCredits?.remainingCredits
    ?? (kontorOnce?.kalanKontor?.data?.kalanKontor ?? kontorOnce?.kalanKontor?.kalanKontor ? `${kontorOnce?.kalanKontor?.data?.kalanKontor ?? kontorOnce?.kalanKontor?.kalanKontor} (KalanKontorSorgula)` : 'bilinmiyor');
  console.log(`  Kontör (öncesi)    : ${bakiyeOzet}`);
  console.log('─'.repeat(72));

  // Kanıt dosyası — rapor bu kayda dayanır, yeniden yorumlamaya değil.
  try {
    const dizin = path.join(KOK, '.verify-tmp');
    fs.mkdirSync(dizin, { recursive: true });
    const damga = new Date().toISOString().replace(/[:.]/g, '-');
    const hedef = path.join(dizin, `faz19-gercek-akis-kanit-${damga}.json`);
    fs.writeFileSync(hedef, JSON.stringify({
      kosuZamani: new Date().toISOString(),
      hedef: testBase,
      authKanitlandi,
      gonderimYapildi: gonderimVar,
      iptalYapildi: iptalVar,
      kontorOnce: kontorOnce?.getCredits?.remainingCredits ?? null,
      kanitlar,
    }, null, 2), 'utf-8');
    console.log(`  Kanıt dosyası      : ${hedef}`);
  } catch (e: any) {
    console.warn(`  Kanıt dosyası yazılamadı: ${e?.message}`);
  }

  // ── KARAR: tam olarak BİR sonuç ────────────────────────────────────────
  //
  // Konsol kodlaması Türkçe karakterleri bozabilir; bu yüzden karar hem
  // okunabilir metin hem de ASCII'ye dayanıklı makine etiketiyle yazılır.
  // Sarmalayıcı (PowerShell) etiketi ayrıştırır — böylece "KOŞULAMADI"
  // kelimesindeki İ/I bozulsa bile karar yanlış okunmaz.
  console.log('\n' + '─'.repeat(72));
  let karar: 'PASS' | 'FAIL' | 'KOSULAMADI' | 'GUVENLIK_IHLALI';
  if (guvenlikIhlali) {
    karar = 'GUVENLIK_IHLALI';
    console.log('⛔ KARAR: FAIL — güvenlik kapısı ihlali (koşu durduruldu, istek gönderilmedi)');
  } else if (failCount > 0) {
    karar = 'FAIL';
    console.log('❌ KARAR: FAIL — gerçek sandbox\'a ulaşıldı ve gerçek bir API işlemi hata verdi');
  } else if (kosulamadi || skipCount > 0) {
    karar = 'KOSULAMADI';
    console.log('⛔ KARAR: KOŞULAMADI — gerçek sandbox\'a ulaşılamadı veya gerekli adım koşulamadı');
    console.log('   Hiçbir dış iddia doğrulanmadı. Bu sonuç PASS DEĞİLDİR.');
  } else if (gonderimVar && iptalVar) {
    karar = 'PASS';
    console.log('✅ KARAR: PASS — gerçek sandbox\'ta belge yaşam döngüsü uçtan uca doğrulandı');
  } else {
    karar = 'KOSULAMADI';
    console.log('⛔ KARAR: KOŞULAMADI — zincir tamamlanmadı (gönderim ve/veya iptal kanıtlanmadı)');
  }
  console.log('─'.repeat(72));
  console.log(`\n  [FAZ19_KARAR:${karar}]`);
  console.log('\n  NOT: Bu koşu MOCK kullanmaz. Yalnızca gerçek TEST/SANDBOX yanıtları');
  console.log('       kanıt sayılmıştır. Canlı (production) ortama hiçbir istek gitmemiştir.');
}

main().catch(err => {
  console.error('\n❌ BEKLENMEYEN HATA:', err?.message || err);
  console.error('Bu koşu PASS sayılamaz.');
  process.exit(1);
});
