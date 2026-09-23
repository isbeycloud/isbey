/**
 * İŞBEY CLOUD — FAZ 19: `CancelDocument` SÖZLEŞME İSPAT ARACI
 * =============================================================
 *
 * NE İŞE YARAR
 *   `CancelDocument` uçunun GERÇEK sözleşmesini ölçer. Şu an bilinmeyenler
 *   (bkz. `docs/35_FAZ19_CANCELDOCUMENT_SOZLESME_DENETIMI.md` §2):
 *     S-1  İstek gövdesi alan adları: `uuid`/`cancelReason` mi, `Uuid`/`CancelReason` mi?
 *     S-2  Yanıt gövdesi şeması nedir?
 *     S-3  Yanıtta iş-seviyesi başarı alanı (IsSucceeded) var mı?
 *     S-4  `AppType` numaralandırması hangisi? (repoda İKİ ZIT sözlük var — §2B)
 *
 * NASIL ÖLÇER — İKİ KONTROLLÜ DENEY
 *   Deney A: gövde `{ uuid, cancelReason }`     (mevcut kodun varsayımı)
 *   Deney B: gövde `{ Uuid, CancelReason }`     (CancelEArsivInvoice'ın kuralı)
 *
 *   Her ikisi de AYNI uydurma belge kimliğiyle çağrılır. API'nin hangi gövdeye
 *   "zorunlu alan eksik" dediği, doğru alan adını KANITLAR. İkisi de aynı hatayı
 *   veriyorsa alan adı ayrımı yoktur (serbest).
 *
 * ⛔ BELGE GÖNDERMEZ — KONTÖR YAKMAZ
 *   Yalnız `CancelDocument` çağrılır, uydurma bir kimlikle. `SendDocument`
 *   çağrılmaz. Var olmayan bir belge iptal edilemez → gerçek iptal OLUŞMAZ.
 *
 * ⛔ BU ARAÇ "PASS" ÜRETMEZ
 *   Çıktısı SÖZLEŞME KANITIDIR, uygulama doğrulaması değil. Sonuç etiketi:
 *   `[SOZLESME_OLCUMU:...]` — asla PASS/FAIL kararı değil.
 *
 * ÖN KOŞULLAR (sağlanmazsa HİÇBİR İSTEK GÖNDERİLMEZ)
 *   · HIZLI_BILISIM_IS_TEST_MODE=true
 *   · HIZLI_BILISIM_ALLOW_PROD boş/kapalı
 *   · HIZLI_BILISIM_API_URL → econnecttest hostu (canlı host İÇERMEZ)
 *   · Auth zinciri kanıtlanmış olmalı (UtilEncrypt → Login)
 *
 * Çalıştır (Windows, proje kökünde):
 *   powershell -ExecutionPolicy Bypass -File tools\faz19-cancel-sozlesme-ispeti.ps1
 */

import path from 'path';
import fs from 'fs';
import { config as dotenvConfig } from 'dotenv';

const BU_DOSYA = path.resolve(process.argv[1] || path.join('server', 'tests', 'phase19CancelContractProbe.ts'));
const KOK = process.env.ISBEY_REPO_ROOT
  ? path.resolve(process.env.ISBEY_REPO_ROOT)
  : path.resolve(path.dirname(BU_DOSYA), '..', '..');
dotenvConfig({ path: path.join(KOK, '.env') });

import axios from 'axios';
import { HizliConnectService, tokenStore } from '../services/hizliConnectService';

const CANLI_HOST = 'econnect.hizliteknoloji.com.tr';
const TEST_HOST = 'econnecttest.hizliteknoloji.com.tr';

// ─── Sayıçlar ────────────────────────────────────────────────────────────────
let olcumSayisi = 0;
let engelSayisi = 0;

function bilgi(m: string) { console.log(`  ℹ️  ${m}`); }
function tamam(m: string) { olcumSayisi++; console.log(`  ✅ ÖLÇÜLDÜ  ${m}`); }
function engel(m: string, d?: string) { engelSayisi++; console.warn(`  ⛔ ENGELLENDİ  ${m}${d ? ` — ${d}` : ''}`); }

function bolum(b: string) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`📋 ${b}`);
  console.log('─'.repeat(72));
}

// ─── Kanıt kaydı ─────────────────────────────────────────────────────────────
interface Olcum {
  deney: string;
  zaman: string;
  hedef: string;
  istekGovdesi: string;
  httpDurum: number | null;
  yanitGovdesi: string;
  yanitAlanlari: string[];
  basariBayragi: { ad: string; tip: string; deger: unknown } | null;
  sinif: 'ok' | 'hata' | 'kanitlanamadi';
  not?: string;
}
const olcumler: Olcum[] = [];

/** Token/JWT ve credential sızdırmadan özet üretir. */
function guvenli(veri: unknown, max = 1200): string {
  let s: string;
  try {
    s = typeof veri === 'string' ? veri : JSON.stringify(veri);
  } catch { return '(serileştirilemedi)'; }
  if (!s) return '(boş)';
  return s
    .replace(/\b[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '(JWT-maskeli)')
    .slice(0, max);
}

/** Yanıt gövdesindeki TÜM alan adlarını (iç içe dahil) toplar. */
function alanAdlari(veri: unknown, derinlik = 0, toplam: string[] = []): string[] {
  if (derinlik > 4 || !veri || typeof veri !== 'object') return toplam;
  const nesneler = Array.isArray(veri) ? veri : [veri];
  for (const n of nesneler) {
    if (!n || typeof n !== 'object') continue;
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      const yol = derinlik === 0 ? k : `  ${'·'.repeat(derinlik)}${k}`;
      if (!toplam.includes(yol)) toplam.push(yol);
      if (v && typeof v === 'object') alanAdlari(v, derinlik + 1, toplam);
    }
  }
  return toplam;
}

/** Yanıtta iş-seviyesi başarı bayrağı arar (adı + tipi + değeriyle). */
function bayrakBul(veri: unknown, derinlik = 0): { ad: string; tip: string; deger: unknown } | null {
  if (derinlik > 4 || !veri || typeof veri !== 'object') return null;
  const nesneler = Array.isArray(veri) ? veri : [veri];
  for (const n of nesneler) {
    if (!n || typeof n !== 'object') continue;
    const d = n as Record<string, unknown>;
    for (const aday of ['IsSucceeded', 'isSucceeded', 'Success', 'success', 'Basarili', 'basarili']) {
      if (aday in d) return { ad: aday, tip: typeof d[aday], deger: d[aday] };
    }
    for (const v of Object.values(d)) {
      if (v && typeof v === 'object') {
        const ic = bayrakBul(v, derinlik + 1);
        if (ic) return { ad: `(iç içe) ${ic.ad}`, tip: ic.tip, deger: ic.deger };
      }
    }
  }
  return null;
}

// ─── Ana akış ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 CancelDocument SÖZLEŞME İSPAT ARACI');
  console.log('='.repeat(72));
  console.log('  ⛔ Bu araç PASS üretmez. Yalnız SÖZLEŞME ÖLÇER.');
  console.log('  ⛔ Belge GÖNDERMEZ — kontör yakmaz.');

  // ═══════════════════════════════════════════════════════════════════════
  bolum('0. GÜVENLİK KAPISI — hedef TEST değilse HİÇBİR ÇAĞRI YAPILMAZ');
  // ═══════════════════════════════════════════════════════════════════════

  const isTestMode = process.env.HIZLI_BILISIM_IS_TEST_MODE === 'true';
  const allowProd = String(process.env.HIZLI_BILISIM_ALLOW_PROD || '').trim();
  const apiUrl = String(process.env.HIZLI_BILISIM_API_URL || '');
  const apiKey = process.env.HIZLI_BILISIM_API_KEY || '';
  const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY || '';
  const wsUser = process.env.HIZLI_BILISIM_WS_USERNAME || '';
  const wsPass = process.env.HIZLI_BILISIM_WS_PASSWORD || '';

  const guvenlikHatalari: string[] = [];

  if (!isTestMode) {
    guvenlikHatalari.push(`HIZLI_BILISIM_IS_TEST_MODE = '${process.env.HIZLI_BILISIM_IS_TEST_MODE}' (true olmalı)`);
    engel('IS_TEST_MODE true değil');
  } else bilgi('IS_TEST_MODE = true');

  if (allowProd && allowProd.toLowerCase() !== 'false') {
    guvenlikHatalari.push(`HIZLI_BILISIM_ALLOW_PROD açık ('${allowProd}')`);
    engel('ALLOW_PROD açık — production kilidi kapalı');
  } else bilgi('ALLOW_PROD boş/kapalı');

  if (apiUrl.includes(CANLI_HOST)) {
    guvenlikHatalari.push('HIZLI_BILISIM_API_URL canlı host içeriyor');
    engel('API URL canlı host içeriyor');
  } else if (!apiUrl.includes(TEST_HOST)) {
    guvenlikHatalari.push('HIZLI_BILISIM_API_URL TEST hostunu göstermiyor');
    engel('API URL TEST hostunu göstermiyor');
  } else bilgi('API URL → TEST/SANDBOX');

  if (!apiKey || !secretKey || !wsUser || !wsPass) {
    const eksik = [
      !apiKey && 'API_KEY', !secretKey && 'SECRET_KEY',
      !wsUser && 'WS_USERNAME', !wsPass && 'WS_PASSWORD',
    ].filter(Boolean);
    guvenlikHatalari.push(`Eksik credential: ${eksik.join(', ')}`);
    engel(`Sandbox credential eksik: ${eksik.join(', ')}`);
  } else bilgi('Sandbox credential tanımlı (değerler yazdırılmaz)');

  const baseUrl = HizliConnectService.getBaseUrl(true);
  if (baseUrl.includes(CANLI_HOST)) {
    guvenlikHatalari.push('getBaseUrl(true) canlı host döndürdü');
    engel('getBaseUrl(true) canlı host döndürüyor');
  } else bilgi(`getBaseUrl(true) → ${baseUrl}`);

  if (guvenlikHatalari.length > 0) {
    console.log('');
    console.error('  ⛔ GÜVENLİK KAPISI İHLALİ — hiçbir istek GÖNDERİLMEDİ.');
    guvenlikHatalari.forEach(h => console.error(`     · ${h}`));
    console.log('');
    console.log('  [SOZLESME_OLCUMU:GUVENLIK_IHLALI]');
    console.log('');
    process.exitCode = 1;
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('1. AUTH ZİNCİRİ — sözleşme ölçümü için token gerekli');
  // ═══════════════════════════════════════════════════════════════════════

  let token = '';
  let authKanitlandi = false;

  try {
    const enc = await HizliConnectService.utilEncrypt(secretKey, wsUser, wsPass);
    if (enc.success && enc.hashedUsername && enc.hashedPassword) {
      tamam('UtilEncrypt başarılı');
      const lg = await HizliConnectService.login(apiKey, enc.hashedUsername, enc.hashedPassword, true);
      if (lg.success && lg.token) {
        token = lg.token;
        authKanitlandi = true;
        tamam('Login başarılı (token alındı, değeri yazdırılmaz)');
      } else {
        engel('Login başarısız', lg.message);
      }
    } else {
      engel('UtilEncrypt başarısız — sandbox kimliği reddedildi', enc.message);
    }
  } catch (e: any) {
    const durum = e?.response?.status;
    const hdr = e?.response?.headers || {};
    const proxyImzasi = !!hdr['x-proxy-error'] || (durum === 403 && String(hdr['content-type'] || '').includes('text/plain'));
    if (proxyImzasi) {
      engel('Sandbox\'a ulaşılamıyor — ortam egress engeli (allowlist proxy)',
        'Bu bir API hatası DEĞİLDİR; ortam engelidir');
    } else {
      engel('Auth zinciri hatası', e.message);
    }
  }

  if (!authKanitlandi) {
    console.log('');
    console.error('  ⛔ AUTH KANITLANAMADI — sözleşme ölçümüne GEÇİLMEDİ.');
    console.error('     Hiçbir CancelDocument çağrısı yapılmadı. Hiçbir belge gönderilmedi.');
    console.log('');
    console.log('  Sözleşme ÖLÇÜLEMEDİ (sandbox erişimi veya kimlik gerekli).');
    console.log('');
    console.log('  [SOZLESME_OLCUMU:KOSULAMADI]');
    console.log('');
    process.exitCode = 0;
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('2. SÖZLEŞME DENEYLERİ — aynı uydurma kimlik, iki farklı gövde');
  // ═══════════════════════════════════════════════════════════════════════

  // Kasten GEÇERSİZ ama biçimsel olarak makul bir kimlik. Var olmayan bir belge
  // olduğu için iptal EDİLEMEZ — gerçek bir belge etkilenmez.
  const UYDURMA_UUID = '00000000-0000-4000-8000-000000000000';
  const SEBEP = 'FAZ 19 sözleşme ölçümü (bu bir iptal talebi değildir)';

  const deneyler: Array<[string, Record<string, string>]> = [
    ['Deney A — mevcut kod varsayımı', { uuid: UYDURMA_UUID, cancelReason: SEBEP }],
    ['Deney B — CancelEArsivInvoice kuralı', { Uuid: UYDURMA_UUID, CancelReason: SEBEP }],
  ];

  const url = `${baseUrl}/HizliApi/RestApi/CancelDocument`;

  for (const [deneyAdi, govde] of deneyler) {
    try {
      const res = await axios.post(url, govde, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      const alanlar = alanAdlari(res.data);
      olcumler.push({
        deney: deneyAdi,
        zaman: new Date().toISOString(),
        hedef: url,
        istekGovdesi: guvenli(govde),
        httpDurum: res.status,
        yanitGovdesi: guvenli(res.data),
        yanitAlanlari: alanlar,
        basariBayragi: bayrakBul(res.data),
        sinif: 'ok',
      });

      tamam(`${deneyAdi} — HTTP ${res.status}, ${alanlar.length} alan döndü`);
      console.log(`      İstek : ${guvenli(govde, 200)}`);
      console.log(`      Yanıt : ${guvenli(res.data, 400)}`);
      console.log(`      Alanlar: ${alanlar.join(', ') || '(yok)'}`);
      const b = bayrakBul(res.data);
      console.log(`      Başarı bayrağı: ${b ? `${b.ad} (${b.tip}) = ${String(b.deger)}` : 'YOK'}`);
    } catch (err: any) {
      const durum = err?.response?.status ?? null;
      const hdr = err?.response?.headers || {};
      const ctype = String(hdr['content-type'] || '');
      const proxyImzasi = !!hdr['x-proxy-error'] || (durum === 403 && ctype.includes('text/plain'));
      const govdeVeri = err?.response?.data;
      const alanlar = alanAdlari(govdeVeri);

      olcumler.push({
        deney: deneyAdi,
        zaman: new Date().toISOString(),
        hedef: url,
        istekGovdesi: guvenli(govde),
        httpDurum: durum,
        yanitGovdesi: guvenli(govdeVeri ?? err.message),
        yanitAlanlari: alanlar,
        basariBayragi: bayrakBul(govdeVeri),
        sinif: proxyImzasi ? 'kanitlanamadi' : 'hata',
        not: proxyImzasi ? 'Ortam egress engeli — API hakkında hiçbir şey kanıtlamaz' : undefined,
      });

      if (proxyImzasi) {
        engel(`${deneyAdi} — ortam egress engeli`, 'API hakkında hiçbir şey kanıtlamaz');
      } else {
        // HTTP hatası DA kanıttır: hata mesajı alan adı beklentisini açığa çıkarır.
        tamam(`${deneyAdi} — HTTP ${durum} (hata yanıtı da sözleşme kanıtıdır)`);
        console.log(`      İstek : ${guvenli(govde, 200)}`);
        console.log(`      Yanıt : ${guvenli(govdeVeri ?? err.message, 400)}`);
        console.log(`      Alanlar: ${alanlar.join(', ') || '(yok)'}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('2B. AppType NUMARALANDIRMASI — hangi değerler geçerli?');
  // ═══════════════════════════════════════════════════════════════════════

  // NEDEN GEREKLİ: Repoda AYNI uç için İKİ ZIT AppType sözlüğü var:
  //   hizliConnectService.ts:486 → 3=e-Arşiv, 6=e-SMM, 7=e-Müstahsil
  //   hizliConnectService.ts:631 → 1=e-Fatura, 2=e-Arşiv, 3=e-İrsaliye, 4=e-SMM, 5=e-Müstahsil
  // Çağrıda `AppType:3` SABİT kodlanmış (hizliTeknolojiProvider.ts:348). Hangisinin
  // doğru olduğu repodan kanıtlanamıyor. Bu deney hata mesajı farkından ayırır.
  //
  // GÜVENLİK: Aynı UYDURMA kimlik kullanılır. Var olmayan belge iptal EDİLEMEZ.
  // AppType DEĞİŞKENİ dışında gövde sabittir → tek değişkenli kontrollü deney.

  const appTypeDeneyleri: Olcum[] = [];

  // C0 — KONTROL: AppType hiç gönderilmezse hata ne der? (baseline)
  //      Bu, "AppType eksik" mesajının imzasını verir; C1..C7 bundan ayrıştırılır.
  const kontroller: Array<[string, Record<string, unknown>]> = [
    ['Deney C0 — kontrol: AppType YOK', {
      DocumentUuid: UYDURMA_UUID, CancelReason: SEBEP,
      CancelDate: new Date().toISOString().slice(0, 10),
    }],
  ];
  for (let t = 1; t <= 7; t++) {
    kontroller.push([`Deney C${t} — AppType=${t}`, {
      AppType: t, DocumentUuid: UYDURMA_UUID, CancelReason: SEBEP,
      CancelDate: new Date().toISOString().slice(0, 10),
    }]);
  }

  /** Yanıttan iş-seviyesi mesajı çıkarır (özet karşılaştırma için). */
  function mesajOzeti(veri: unknown): string {
    if (!veri || typeof veri !== 'object') return '(mesaj yok)';
    const d = (Array.isArray(veri) ? veri[0] : veri) as Record<string, unknown>;
    const m = d?.Message ?? d?.message ?? d?.ErrorMessage ?? d?.error;
    return typeof m === 'string' && m.trim() ? m.trim() : '(mesaj yok)';
  }

  for (const [deneyAdi, govde] of kontroller) {
    try {
      const res = await axios.post(url, govde, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });
      const alanlar = alanAdlari(res.data);
      appTypeDeneyleri.push({
        deney: deneyAdi, zaman: new Date().toISOString(), hedef: url,
        istekGovdesi: guvenli(govde), httpDurum: res.status,
        yanitGovdesi: guvenli(res.data), yanitAlanlari: alanlar,
        basariBayragi: bayrakBul(res.data), sinif: 'ok',
      });
      tamam(`${deneyAdi} — HTTP ${res.status}`);
      console.log(`      Yanıt : ${guvenli(res.data, 300)}`);
    } catch (err: any) {
      const durum = err?.response?.status ?? null;
      const hdr = err?.response?.headers || {};
      const proxyImzasi = !!hdr['x-proxy-error'] || (durum === 403 && String(hdr['content-type'] || '').includes('text/plain'));
      const govdeVeri = err?.response?.data;
      appTypeDeneyleri.push({
        deney: deneyAdi, zaman: new Date().toISOString(), hedef: url,
        istekGovdesi: guvenli(govde), httpDurum: durum,
        yanitGovdesi: guvenli(govdeVeri ?? err.message), yanitAlanlari: alanAdlari(govdeVeri),
        basariBayragi: bayrakBul(govdeVeri),
        sinif: proxyImzasi ? 'kanitlanamadi' : 'hata',
        not: proxyImzasi ? 'Ortam egress engeli — API hakkında hiçbir şey kanıtlamaz' : undefined,
      });
      if (proxyImzasi) engel(`${deneyAdi} — ortam egress engeli`);
      else { tamam(`${deneyAdi} — HTTP ${durum} (hata yanıtı da sözleşme kanıtıdır)`); console.log(`      Yanıt : ${guvenli(govdeVeri ?? err.message, 300)}`); }
    }
  }

  // ─── AppType mesaj imzası çözümlemesi ──────────────────────────────────
  const appOlculen = appTypeDeneyleri.filter(o => o.sinif !== 'kanitlanamadi');
  if (appOlculen.length > 0) {
    const imzalar = new Map<string, string[]>();
    for (const o of appOlculen) {
      const imza = `${o.httpDurum}|${mesajOzeti(JSON.parse(o.yanitGovdesi || 'null'))}`;
      if (!imzalar.has(imza)) imzalar.set(imza, []);
      imzalar.get(imza)!.push(o.deney.replace(/^Deney /, ''));
    }

    console.log('');
    console.log('  S-4 AppType MESAJ İMZALARI (aynı imza = aynı davranış)');
    for (const [imza, gruplar] of imzalar) {
      console.log(`      [${gruplar.join(', ')}]`);
      console.log(`         → ${imza.split('|')[0]} · ${imza.split('|').slice(1).join('|')}`);
    }

    const kontrol = appOlculen.find(o => o.deney.startsWith('Deney C0'));
    if (kontrol) {
      const kontrolImza = `${kontrol.httpDurum}|${mesajOzeti(JSON.parse(kontrol.yanitGovdesi || 'null'))}`;
      const ayrISan = appOlculen
        .filter(o => !o.deney.startsWith('Deney C0'))
        .filter(o => `${o.httpDurum}|${mesajOzeti(JSON.parse(o.yanitGovdesi || 'null'))}` !== kontrolImza)
        .map(o => o.deney.replace(/^Deney /, ''));
      console.log('');
      if (ayrISan.length > 0) {
        console.log(`      → Kontrolden (AppType yok) AYRIŞAN türler: ${ayrISan.join(', ')}`);
        console.log('         Bu türler API tarafından TANINIYOR demektir (farklı doğrulama yolu).');
        const taninmayan = appOlculen
          .filter(o => !o.deney.startsWith('Deney C0'))
          .filter(o => `${o.httpDurum}|${mesajOzeti(JSON.parse(o.yanitGovdesi || 'null'))}` === kontrolImza)
          .map(o => o.deney.replace(/^Deney /, ''));
        if (taninmayan.length > 0) console.log(`         Kontrolle AYNI kalan (tanınmadığı olası): ${taninmayan.join(', ')}`);
      } else {
        console.log('      → Hiçbir AppType kontrolden ayrışmadı: AppType değeri bu uçta');
        console.log('         doğrulanmıyor olabilir (tüm değerler aynı yola giriyor).');
      }
    }
    console.log('');
    console.log('  ⚠️  NOT: AppType ayrımı hata mesajı FARKINDAN çıkarılmıştır. Bu güçlü bir');
    console.log('      göstergedir ama tek başına kesin kanıt değildir; gerçek bir belgeyle');
    console.log('      doğrulanması gerekir (tools/faz19-belge-akisi.ps1).');
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('3. SÖZLEŞME ÖLÇÜM ÖZETİ');
  // ═══════════════════════════════════════════════════════════════════════

  const olculebilen = olcumler.filter(o => o.sinif !== 'kanitlanamadi');

  if (olculebilen.length === 0) {
    console.log('  ⛔ Hiçbir deney ölçülemedi (ortam engeli).');
    console.log('     Sözleşme hakkında HİÇBİR ŞEY kanıtlanmadı.');
    console.log('');
    console.log('  [SOZLESME_OLCUMU:KOSULAMADI]');
  } else {
    // S-1: alan adı ayrımı var mı?
    const a = olcumler.find(o => o.deney.startsWith('Deney A'));
    const b = olcumler.find(o => o.deney.startsWith('Deney B'));
    console.log(`  S-1 İSTEK GÖVDESİ ALAN ADLARI`);
    console.log(`      Deney A (uuid/cancelReason)     → HTTP ${a?.httpDurum ?? '—'}`);
    console.log(`      Deney B (Uuid/CancelReason)     → HTTP ${b?.httpDurum ?? '—'}`);
    if (a && b && a.httpDurum !== null && b.httpDurum !== null) {
      if (a.httpDurum === b.httpDurum) {
        console.log('      → İki yazım da AYNI sonucu verdi: alan adı ayrımı yok (serbest).');
      } else {
        console.log('      → İki yazım FARKLI sonuç verdi: doğru alan adı ayırt edilebilir.');
        console.log(`        Kabul edilen: ${a.httpDurum === 200 || (a.httpDurum < 400) ? 'Deney A (uuid/cancelReason)' : 'Deney B (Uuid/CancelReason)'}`);
      }
    }
    console.log('');

    // S-2: yanıt şeması
    console.log(`  S-2 YANIT GÖVDESİ ŞEMASI`);
    for (const o of olculebilen) {
      console.log(`      ${o.deney}: ${o.yanitAlanlari.join(', ') || '(alan yok)'}`);
    }
    console.log('');

    // S-3: iş-seviyesi başarı alanı
    console.log(`  S-3 İŞ-SEVİYESİ BAŞARI ALANI (IsSucceeded)`);
    const bayraklar = olculebilen.map(o => o.basariBayragi).filter(Boolean);
    if (bayraklar.length > 0) {
      console.log(`      ✅ VAR — yanıtta bulundu:`);
      bayraklar.forEach(b => console.log(`         ${b!.ad} (${b!.tip}) = ${String(b!.deger)}`));
    } else {
      console.log('      ❌ YOK — ölçülen yanıtlarda başarı bayrağı BULUNMADI.');
      console.log('         (Bu, uygulama kodundaki "belirsiz" dalının doğru olduğunu gösterir.)');
    }

    console.log('');
    console.log('  ⚠️  NOT: Bu ölçüm UYDURMA bir belge kimliğiyle yapılmıştır. Gerçek bir');
    console.log('      belgenin iptalinde yanıt şeması farklı olabilir. Kesin kanıt için');
    console.log('      gerçek belge akışı gerekir: tools/faz19-belge-akisi.ps1');
    console.log('');
    console.log('  [SOZLESME_OLCUMU:OLCULDU]');
  }

  // ─── Kanıt dosyası ───────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const cikti = path.join(KOK, '.verify-tmp', `faz19-cancel-sozlesme-${stamp}.json`);
  try {
    fs.mkdirSync(path.dirname(cikti), { recursive: true });
    fs.writeFileSync(cikti, JSON.stringify({
      kosuZamani: new Date().toISOString(),
      hedef: url,
      uydurmaKimlik: UYDURMA_UUID,
      belgeGonderildi: false,
      authKanitlandi,
      olcumler,
      appTypeOlcumleri: appTypeDeneyleri,
    }, null, 2), 'utf-8');
    console.log(`  Kanıt dosyası: ${cikti}`);
  } catch (e: any) {
    console.warn(`  [WARN] Kanıt dosyası yazılamadı: ${e.message}`);
  }

  console.log('');
  console.log('  Bu araç MOCK kullanmaz. Belge GÖNDERMEDİ. Canlı ortama istek gitmedi.');
  console.log('');

  if (engelSayisi > 0 && olcumSayisi === 0) process.exitCode = 0;
}

// ─── Token deposunu temizle ──────────────────────────────────────────────────
process.on('exit', () => {
  try {
    tokenStore.token = '';
    tokenStore.expireDate = '';
  } catch { /* yoksay */ }
});

main().catch((err) => {
  console.error('\n❌ Sözleşme ispat aracı beklenmeyen hata ile durdu:', err);
  process.exit(1);
});
