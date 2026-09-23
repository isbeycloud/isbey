/**
 * İŞBEY CLOUD — FAZ 19: `GetDocumentListGUID` SÖZLEŞME İSPAT ARACI
 * ==================================================================
 *
 * NE İŞE YARAR
 *   `GetDocumentListGUID` ucunun GERÇEK sözleşmesini ölçer (bkz. `docs/48`).
 *   Bilinmeyenler:
 *     S-G1  `AppType` numaralandırması hangisi? Giden beş çağrı yolu da `1`
 *           gönderiyor (`hizliConnectService.ts:1567`, `hizliTeknolojiProvider.ts:236`,
 *           `hizli-bilisim.ts:951`). Bu değer hiç ÖLÇÜLMEDİ — `docs/40` yalnız
 *           `CancelDocument` ucunu ölçtü ve orada `1` TANINMIYOR çıktı.
 *     S-G2  Yanıt gövdesi şeması nedir? (`documents` dizisi alanları)
 *     S-G3  Yanıtta iş-seviyesi başarı alanı var mı?
 *
 * NASIL ÖLÇER — KONTROLLÜ DENEY
 *   Aynı UYDURMA belge kimliğiyle (var olmayan UUID) SEKİZ deney:
 *     Deney D0 — kontrol: `appType` HİÇ GÖNDERİLMEZ (baseline imzası)
 *     Deney D1…D7 — `appType` = 1…7, gövde sabit `{ appType, guids }`
 *
 *   Hangi değerlerin kontrolden AYRIŞTIĞI, o değerlerin API tarafından
 *   TANINDIĞINI gösterir (farklı doğrulama yolu). Örn. `CancelDocument`
 *   ölçümünde (`docs/40`) geçerli değerler "ilgili fatura bulunamadı" derken
 *   geçersiz değerler "yalnız 3/6/7 olabilir" demişti.
 *
 * ⛔ BELGE GÖNDERMEZ — KONTÖR YAKTIĞI BİLİNMİYOR, İDDİA EDİLMİYOR
 *   Yalnız `GetDocumentListGUID` çağrılır, uydurma bir kimlikle. `SendDocument`
 *   çağrılmaz, iptal çağrılmaz. Bu bir OKUMA sorgusudur; yazma/mutasyon yoktur.
 *   Ancak sorgu ucunun sandbox'ta kontör tüketip tüketmediği BU ARAÇLA
 *   kanıtlanamaz — ölçümden ÖNCE doğrulanmalıdır (`docs/48` §6).
 *
 * ⛔ `GetDocumentReceiverAllList` BU ARACIN KAPSAMI DIŞINDADIR
 *   O uç `AppType` almıyor (`dateType/startDate/endDate/takenFromEntegrator`
 *   sorgu parametreleri). Ayrı ölçüme tabidir.
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
 *   powershell -ExecutionPolicy Bypass -File tools\faz19-guid-sozlesme-ispeti.ps1
 */

import path from 'path';
import fs from 'fs';
import { config as dotenvConfig } from 'dotenv';

const BU_DOSYA = path.resolve(process.argv[1] || path.join('server', 'tests', 'phase19GuidContractProbe.ts'));
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
  mesaj: string;
  belgeSayisi: number;
  donenUUIDler: string[];
  istenenKimlikDonduMu: boolean;
  donenAppType: number | null;
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

/** Yanıttan iş-seviyesi mesajı çıkarır (imza karşılaştırma için). */
function mesajOzeti(veri: unknown): string {
  if (!veri || typeof veri !== 'object') return '(mesaj yok)';
  const d = (Array.isArray(veri) ? veri[0] : veri) as Record<string, unknown>;
  const m = d?.Message ?? d?.message ?? d?.ErrorMessage ?? d?.error;
  return typeof m === 'string' && m.trim() ? m.trim() : '(mesaj yok)';
}

/** `documents` dizisini güvenli çıkarır (dizi değilse boş döner). */
function belgeDizisi(veri: unknown): Array<Record<string, unknown>> {
  if (!veri || typeof veri !== 'object') return [];
  const d = veri as Record<string, unknown>;
  const docs = d.documents ?? d.Documents;
  return Array.isArray(docs) ? (docs as Array<Record<string, unknown>>) : [];
}

/** Dönen belgelerin UUID'lerini çıkarır (kanıt: istenen kimlik döndü mü?). */
function uuidListesi(docs: Array<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const b of docs) {
    const u = b.UUID ?? b.uuid ?? b.Id ?? b.id;
    if (typeof u === 'string' && u.trim() && !out.includes(u)) out.push(u);
  }
  return out;
}

// ─── Ana akış ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 GetDocumentListGUID SÖZLEŞME İSPAT ARACI');
  console.log('='.repeat(72));
  console.log('  ⛔ Bu araç PASS üretmez. Yalnız SÖZLEŞME ÖLÇER.');
  console.log('  ⛔ Belge GÖNDERMEZ, iptal ETMEZ — yalnız OKUMA sorgusu yapar.');

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
    console.error('     Hiçbir GetDocumentListGUID çağrısı yapılmadı. Hiçbir belge gönderilmedi.');
    console.log('');
    console.log('  Sözleşme ÖLÇÜLEMEDİ (sandbox erişimi veya kimlik gerekli).');
    console.log('');
    console.log('  [SOZLESME_OLCUMU:KOSULAMADI]');
    console.log('');
    process.exitCode = 0;
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  bolum('2. SÖZLEŞME DENEYLERİ — aynı uydurma kimlik, AppType D0…D7');
  // ═══════════════════════════════════════════════════════════════════════

  // Kasten GEÇERSİZ ama biçimsel olarak makul bir kimlik. Var olmayan bir belge
  // olduğu için durumu SORGULANAMAZ — ama sorgu YAPILIR; API'nin AppType'a verdiği
  // doğrulama yanıtı sözleşmeyi açığa çıkarır. Belge GÖNDERİLMEZ, iptal EDİLMEZ.
  const UYDURMA_UUID = '00000000-0000-4000-8000-000000000000';

  const url = `${baseUrl}/HizliApi/RestApi/GetDocumentListGUID`;

  const deneyler: Array<[string, Record<string, unknown>]> = [
    // D0 — KONTROL: appType hiç gönderilmezse hata ne der? (baseline)
    ['Deney D0 — kontrol: appType YOK', { guids: [UYDURMA_UUID] }],
  ];
  for (let t = 1; t <= 7; t++) {
    deneyler.push([`Deney D${t} — appType=${t}`, { appType: t, guids: [UYDURMA_UUID] }]);
  }

  for (const [deneyAdi, govde] of deneyler) {
    try {
      const res = await axios.post(url, govde, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      const alanlar = alanAdlari(res.data);
      const docs = belgeDizisi(res.data);
      const uuidler = uuidListesi(docs);
      const donenType = docs.length > 0 && typeof docs[0].AppType === 'number'
        ? (docs[0].AppType as number) : null;
      olcumler.push({
        deney: deneyAdi,
        zaman: new Date().toISOString(),
        hedef: url,
        istekGovdesi: guvenli(govde),
        httpDurum: res.status,
        yanitGovdesi: guvenli(res.data),
        mesaj: mesajOzeti(res.data),
        belgeSayisi: docs.length,
        donenUUIDler: uuidler,
        istenenKimlikDonduMu: uuidler.includes(UYDURMA_UUID),
        donenAppType: donenType,
        yanitAlanlari: alanlar,
        basariBayragi: bayrakBul(res.data),
        sinif: 'ok',
      });

      tamam(`${deneyAdi} — HTTP ${res.status}, ${alanlar.length} alan, ${docs.length} belge döndü`);
      console.log(`      İstek : ${guvenli(govde, 200)}`);
      console.log(`      Yanıt : ${guvenli(res.data, 400)}`);
      console.log(`      Alanlar: ${alanlar.join(', ') || '(yok)'}`);
      const b = bayrakBul(res.data);
      console.log(`      Başarı bayrağı: ${b ? `${b.ad} (${b.tip}) = ${String(b.deger)}` : 'YOK'}`);
      console.log(`      İstenen kimlik döndü mü: ${uuidler.includes(UYDURMA_UUID) ? 'EVET' : 'HAYIR'} (dönen AppType: ${donenType ?? '—'})`);
    } catch (err: any) {
      const durum = err?.response?.status ?? null;
      const hdr = err?.response?.headers || {};
      const ctype = String(hdr['content-type'] || '');
      const proxyImzasi = !!hdr['x-proxy-error'] || (durum === 403 && ctype.includes('text/plain'));
      const govdeVeri = err?.response?.data;
      const alanlar = alanAdlari(govdeVeri);

      const hDocs = belgeDizisi(govdeVeri);
      const hUuidler = uuidListesi(hDocs);
      olcumler.push({
        deney: deneyAdi,
        zaman: new Date().toISOString(),
        hedef: url,
        istekGovdesi: guvenli(govde),
        httpDurum: durum,
        yanitGovdesi: guvenli(govdeVeri ?? err.message),
        mesaj: mesajOzeti(govdeVeri),
        belgeSayisi: hDocs.length,
        donenUUIDler: hUuidler,
        istenenKimlikDonduMu: hUuidler.includes(UYDURMA_UUID),
        donenAppType: hDocs.length > 0 && typeof hDocs[0].AppType === 'number'
          ? (hDocs[0].AppType as number) : null,
        yanitAlanlari: alanlar,
        basariBayragi: bayrakBul(govdeVeri),
        sinif: proxyImzasi ? 'kanitlanamadi' : 'hata',
        not: proxyImzasi ? 'Ortam egress engeli — API hakkında hiçbir şey kanıtlamaz' : undefined,
      });

      if (proxyImzasi) {
        engel(`${deneyAdi} — ortam egress engeli`, 'API hakkında hiçbir şey kanıtlamaz');
      } else {
        // HTTP hatası DA kanıttır: hata mesajı AppType beklentisini açığa çıkarır.
        tamam(`${deneyAdi} — HTTP ${durum} (hata yanıtı da sözleşme kanıtıdır)`);
        console.log(`      İstek : ${guvenli(govde, 200)}`);
        console.log(`      Yanıt : ${guvenli(govdeVeri ?? err.message, 400)}`);
        console.log(`      Alanlar: ${alanlar.join(', ') || '(yok)'}`);
      }
    }
  }

  // ─── AppType mesaj imzası çözümlemesi ──────────────────────────────────
  // NOT: `mesaj` ölçüm anında TAM yanıttan çıkarılıp saklanır; kesilmiş
  // `yanitGovdesi` BİR DAHA parse edilmez (12:56 koşusundaki JSON.parse
  // çökmesinin kök nedeni buydu).
  const appOlculen = olcumler.filter(o => o.sinif !== 'kanitlanamadi');
  if (appOlculen.length > 0) {
    // İmza: HTTP + iş mesajı + belge sayısı + istenen kimlik döndü mü.
    // TÜM karşılaştırmalar bu formülü kullanır (kontrol dahil).
    const imzaOf = (o: Olcum) =>
      `${o.httpDurum}|${o.mesaj}|belge:${o.belgeSayisi}|kimlik:${o.istenenKimlikDonduMu ? 'EVET' : 'HAYIR'}`;
    const imzalar = new Map<string, string[]>();
    for (const o of appOlculen) {
      const imza = imzaOf(o);
      if (!imzalar.has(imza)) imzalar.set(imza, []);
      imzalar.get(imza)!.push(o.deney.replace(/^Deney /, ''));
    }

    console.log('');
    console.log('  S-G1 AppType MESAJ İMZALARI (aynı imza = aynı davranış)');
    for (const [imza, gruplar] of imzalar) {
      console.log(`      [${gruplar.join(', ')}] → ${imza}`);
    }

    const kontrol = appOlculen.find(o => o.deney.startsWith('Deney D0'));
    if (kontrol) {
      const kontrolImza = imzaOf(kontrol);
      const ayrISan = appOlculen
        .filter(o => !o.deney.startsWith('Deney D0'))
        .filter(o => imzaOf(o) !== kontrolImza)
        .map(o => o.deney.replace(/^Deney /, ''));
      console.log('');
      if (ayrISan.length > 0) {
        console.log(`      → Kontrolden (appType yok) AYRIŞAN türler: ${ayrISan.join(', ')}`);
        console.log('         Bu türler API tarafından TANINIYOR demektir (farklı doğrulama yolu).');
        const taninmayan = appOlculen
          .filter(o => !o.deney.startsWith('Deney D0'))
          .filter(o => imzaOf(o) === kontrolImza)
          .map(o => o.deney.replace(/^Deney /, ''));
        if (taninmayan.length > 0) console.log(`         Kontrolle AYNI kalan (tanınmadığı olası): ${taninmayan.join(', ')}`);
      } else {
        console.log('      → Hiçbir appType kontrolden ayrışmadı: appType değeri bu uçta');
        console.log('         doğrulanmıyor olabilir (tüm değerler aynı yola giriyor).');
      }
    }

    // ─── `guids` filtresi hükmü ─────────────────────────────────────────
    console.log('');
    console.log('  S-G4 GUIDS FİLTRESİ (istenen kimlik yanıtta döndü mü?)');
    for (const o of appOlculen) {
      console.log(`      ${o.deney.replace(/^Deney /, '')}: ${o.belgeSayisi} belge, ` +
        `kimlik ${o.istenenKimlikDonduMu ? 'DÖNDÜ' : 'DÖNMEDİ'}` +
        `${o.donenAppType !== null ? `, dönen AppType=${o.donenAppType}` : ''}`);
    }
    const kimlikDonen = appOlculen.filter(o => o.istenenKimlikDonduMu);
    console.log('');
    if (kimlikDonen.length === 0) {
      console.log('      → HİÇBİR deneyde istenen kimlik dönmedi: uç `guids` filtresini');
      console.log('         UYGULAMIYOR görünüyor (türe göre listeliyor). `sync-portal-invoices`');
      console.log('         akışının "UUID ver, durum al" varsayımı ŞÜPHELİ — ayrı bulgu.');
    } else {
      console.log(`      → İstenen kimlik şu deneylerde DÖNDÜ: ${kimlikDonen.map(o => o.deney.replace(/^Deney /, '')).join(', ')}`);
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
    console.log(`  S-G1 AppType NUMARALANDIRMASI (yukarıdaki imza çözümlemesine bakın)`);
    console.log(`      Kodun gönderdiği değer: 1 (beş çağrı yolunun hepsi)`);
    console.log(`      Bu değer kontrolden ayrıştıysa TANINIYOR, ayrışmadıysa ÖLÇÜMSÜZ kalır.`);
    console.log('');

    console.log(`  S-G2 YANIT GÖVDESİ ŞEMASI`);
    for (const o of olculebilen) {
      console.log(`      ${o.deney}: ${o.yanitAlanlari.join(', ') || '(alan yok)'}`);
    }
    console.log('');

    console.log(`  S-G3 İŞ-SEVİYESİ BAŞARI ALANI`);
    const bayraklar = olculebilen.map(o => o.basariBayragi).filter(Boolean);
    if (bayraklar.length > 0) {
      console.log(`      ✅ VAR — yanıtta bulundu:`);
      bayraklar.forEach(b => console.log(`         ${b!.ad} (${b!.tip}) = ${String(b!.deger)}`));
    } else {
      console.log('      ❌ YOK — ölçülen yanıtlarda başarı bayrağı BULUNMADI.');
    }

    console.log('');
    console.log('  ⚠️  NOT: Bu ölçüm UYDURMA bir belge kimliğiyle yapılmıştır. Gerçek bir');
    console.log('      belgenin sorgusunda yanıt şeması farklı olabilir. Kesin kanıt için');
    console.log('      gerçek belge akışı gerekir: tools/faz19-belge-akisi.ps1');
    console.log('');
    console.log('  [SOZLESME_OLCUMU:OLCULDU]');
  }

  // ─── Kanıt dosyası ───────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const cikti = path.join(KOK, '.verify-tmp', `faz19-guid-sozlesme-${stamp}.json`);
  try {
    fs.mkdirSync(path.dirname(cikti), { recursive: true });
    fs.writeFileSync(cikti, JSON.stringify({
      kosuZamani: new Date().toISOString(),
      hedef: url,
      uydurmaKimlik: UYDURMA_UUID,
      belgeGonderildi: false,
      authKanitlandi,
      kodunGonderdigiAppType: 1,
      olcumler,
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
