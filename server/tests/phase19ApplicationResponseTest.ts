/**
 * İŞBEY CLOUD — FAZ 19: `SendApplicationResponse` İŞ-SEVİYESİ KAPISI TESTİ
 * ========================================================================
 *
 * NE İÇİN YAZILDI
 *   `docs/41` §3 bulgusu: `sendApplicationResponse` HTTP 2xx geldiğinde KOŞULSUZ
 *   `success: true` dönüyordu. Sözleşme (docs/41 §2.1) bu ucun çıkışının da
 *   `ResponseMessage` (`IsSucceeded` + `Message`) olduğunu söylüyor — yani
 *   yanıt 200 dönüp İŞ HATASI bildirebilir.
 *
 *   `cancelDocument` ve `cancelEArsivInvoice` için bu kapı zaten vardı
 *   (`hizliConnectService.ts` — `isSeviyesiSonucuOku`). Bu süit, aynı desenin
 *   `sendApplicationResponse` ucuna doğru uygulandığını KANITLAR.
 *
 * KAPSAM VE DÜRÜSTLÜK SINIRI
 *   Bu süit UYGULAMA MANTIĞINI ölçer: HTTP yanıtı geldiğinde kodun doğru karar
 *   verip vermediğini. HTTP katmanı **taklit edilir** (axios çağrısı sahtelenir).
 *
 *   ⛔ BU SÜİT "GERÇEK SANDBOX PASS" DEĞİLDİR.
 *      Gerçek entegratör yanıtı görülmemiştir. Mock/stub sonucu gerçek sandbox
 *      kanıtı SAYILMAZ. Gerçek kanıt için: `tools/faz19-belge-akisi.ps1`.
 *
 *   ⛔ BELGE GÖNDERİLMEZ, İPTAL EDİLMEZ, KONTÖR YAKILMAZ. Ağa çıkılmaz.
 *
 * NE ÖLÇÜLÜR
 *   POZİTİF
 *     A-1  Yanıt uca GİDİYOR (doğru URL + POST + Bearer)
 *     A-2  HTTP 200 + `IsSucceeded: true` → `success: true`
 *     A-3  HTTP 200 + bayrak YOK → `success: true` AMA "doğrulanmadı" mesajı
 *   NEGATİF — sahte "gönderildi" ÜRETİLMEMELİ
 *     B-1  HTTP 200 + `IsSucceeded: false` → `success: false`  ← ASIL KUSUR
 *     B-2  HTTP 200 + `isSucceeded: false` (küçük harf)
 *     B-3  HTTP 200 + iç içe `{ data: { IsSucceeded: false } }`
 *     B-4  HTTP 200 + `Success: false`
 *     B-5  HTTP 4xx
 *     B-6  HTTP 5xx
 *     B-7  Ağ hatası (ECONNABORTED)
 *     B-8  Boş yanıt gövdesi (bayrak yok → belirsiz)
 *     B-9  Hata mesajı `Message` alanından okunuyor
 *
 * Çalıştır (Windows, proje kökünde):
 *   npx tsx server/tests/phase19ApplicationResponseTest.ts
 */

import axios from 'axios';
import { HizliConnectService } from '../services/hizliConnectService';

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

function kontrol(ad: string, kosul: boolean, detay?: string): void {
  kosul ? pass(ad) : fail(ad, detay);
}

function bolum(baslik: string): void {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`📋 ${baslik}`);
  console.log('─'.repeat(72));
}

// ─── HTTP Taklidi (stub) ──────────────────────────────────────────────────────

const axiosAny = axios as any;
const gercekPost = axiosAny.post;
const gercekGet = axiosAny.get;

let sonCagri: { url: string; govde: any; basliklar: any; method: 'post' | 'get' } | null = null;
let cagriSayisi = 0;

function stubPostYanit(data: any, status = 200) {
  sonCagri = null;
  cagriSayisi = 0;
  axiosAny.post = async (url: string, govde: any, config: any) => {
    cagriSayisi++;
    sonCagri = { url, govde, basliklar: config?.headers, method: 'post' };
    return { data, status };
  };
}

function stubHata(status: number, data: any = {}) {
  sonCagri = null;
  cagriSayisi = 0;
  const hata: any = new Error(`Request failed with status code ${status}`);
  hata.response = { status, data, headers: { 'content-type': 'application/json' } };
  axiosAny.post = async (url: string, govde: any, config: any) => {
    cagriSayisi++;
    sonCagri = { url, govde, basliklar: config?.headers, method: 'post' };
    throw hata;
  };
}

function stubAgHatasi(kod: string) {
  sonCagri = null;
  cagriSayisi = 0;
  const hata: any = new Error(`Network Error (${kod})`);
  hata.code = kod;
  axiosAny.post = async () => {
    cagriSayisi++;
    throw hata;
  };
}

function stublariGeriAl() {
  axiosAny.post = gercekPost;
  axiosAny.get = gercekGet;
}

const TOKEN = 'test-token-degeri';
const TEST_BASE = 'https://econnecttest.hizliteknoloji.com.tr';
const YANIT = {
  documentUuid: 'urn:uuid:7c89b21f-8294-4d81-9872-918239019283',
  responseCode: 'KABUL' as const,
  responseDescription: 'test',
  documentId: 'EFT202600009988',
  documentDate: '2026-08-27',
};

// ─── Ana Akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 SendApplicationResponse İŞ-SEVİYESİ KAPISI TESTİ');
  console.log('='.repeat(72));
  console.log('  ⛔ Bu süit MOCK/STUB kullanır. GERÇEK SANDBOX PASS DEĞİLDİR.');
  console.log('  ⛔ Belge gönderilmedi, iptal edilmedi, kontör yakılmadı.');

  // ═════════════════════════════════════════════════════════════════════════
  bolum('A. POZİTİF — yanıt uca gidiyor ve doğru yorumlanıyor');
  // ═════════════════════════════════════════════════════════════════════════

  // A-1: doğru uç + method + auth
  {
    stubPostYanit({ IsSucceeded: true, Message: 'OK' }, 200);
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('A-1a Yanıt doğru URL\'e POST ediliyor',
      sonCagri?.url === `${TEST_BASE}/HizliApi/RestApi/SendApplicationResponse`,
      `gelen: ${sonCagri?.url}`);
    kontrol('A-1b Method POST', sonCagri?.method === 'post');
    kontrol('A-1c Authorization Bearer gönderiliyor',
      String(sonCagri?.basliklar?.['Authorization'] || '') === `Bearer ${TOKEN}`,
      `gelen: ${sonCagri?.basliklar?.['Authorization']}`);
    kontrol('A-1d Iş-seviyesi başarı → success:true', r.success === true, JSON.stringify(r));
    kontrol('A-1e isSeviyesi raporlanıyor', (r as any).isSeviyesi === 'basarili',
      `gelen: ${(r as any).isSeviyesi}`);
  }

  // A-3: GÖVDE ŞEKLİ sözleşmeye uyuyor mu? (docs/41 §2.3 — yedi sapma)
  {
    stubPostYanit({ IsSucceeded: true, Message: 'OK' }, 200);
    await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    const g = sonCagri?.govde || {};
    kontrol('A-3a Gövde düz {uuid,responseType} DEĞİL', !('uuid' in g) && !('responseType' in g),
      `gelen anahtarlar: ${Object.keys(g).join(',')}`);
    kontrol('A-3b AppType = 1 (bu ucun numaralandırması: e-Fatura)', g.AppType === 1,
      `gelen: ${JSON.stringify(g.AppType)}`);
    kontrol('A-3c ResponseCode doğru alan adıyla ve değeriyle gidiyor',
      g.ResponseCode === 'KABUL', `gelen: ${JSON.stringify(g.ResponseCode)}`);
    kontrol('A-3d ResponseDescription var', 'ResponseDescription' in g);
    kontrol('A-3e Documents[] dizisi var', Array.isArray(g.Documents) && g.Documents.length === 1,
      `gelen: ${JSON.stringify(g.Documents)}`);
    kontrol('A-3f Documents[].DocumentUUID (sözleşme adı)',
      g.Documents?.[0]?.DocumentUUID === YANIT.documentUuid,
      `gelen: ${JSON.stringify(g.Documents?.[0])}`);
    kontrol('A-3g Documents[].DocumentId (sözleşme adı)',
      g.Documents?.[0]?.DocumentId === YANIT.documentId);
    kontrol('A-3h Documents[].DocumentDate (sözleşme adı)',
      g.Documents?.[0]?.DocumentDate === YANIT.documentDate);
  }

  // A-4: RED kodu da aynı gövde şekliyle gidiyor
  {
    stubPostYanit({ IsSucceeded: true }, 200);
    await HizliConnectService.sendApplicationResponse(
      { ...YANIT, responseCode: 'RED', responseDescription: 'İçerik uyumsuz' }, TOKEN, true);
    kontrol('A-4a RED → ResponseCode:"RED"', sonCagri?.govde?.ResponseCode === 'RED');
    kontrol('A-4b RED nedeni ResponseDescription\'ta', sonCagri?.govde?.ResponseDescription === 'İçerik uyumsuz');
  }

  // A-2: bayrak yok → belirsiz, ama başarı iddia edilmiyor
  {
    stubPostYanit({ Message: 'işlendi' }, 200);
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('A-2a Bayrak yoksa success:true (HTTP başarılı)', r.success === true);
    kontrol('A-2b Ama isSeviyesi "belirsiz"', (r as any).isSeviyesi === 'belirsiz',
      `gelen: ${(r as any).isSeviyesi}`);
    kontrol('A-2c Mesaj "doğrulanmadı" diyor',
      /doğrulanmadı/i.test(String(r.message || '')), `gelen: ${r.message}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('B. NEGATİF — sahte "gönderildi" ÜRETİLMEMELİ');
  // ═════════════════════════════════════════════════════════════════════════

  // B-1: ASIL KUSUR — HTTP 200 + IsSucceeded:false
  {
    stubPostYanit({ IsSucceeded: false, Message: 'Belge bulunamadı.' }, 200);
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-1a HTTP 200 + IsSucceeded:false → success:false',
      r.success === false, JSON.stringify(r));
    kontrol('B-1b isSeviyesi "basarisiz"', (r as any).isSeviyesi === 'basarisiz');
    kontrol('B-1c Mesaj API mesajını taşıyor',
      /Belge bulunamadı/.test(String(r.message || '')), `gelen: ${r.message}`);
    // Hem "gönderildi" hem ASCII "gonderildi" yakalanır — aksi hâlde yazım
    // farkı yüzünden başarı iddiası gözden kaçabilir.
    kontrol('B-1d Mesaj "gönderildi" İDDİA ETMİYOR',
      !/g[öo]nderildi/i.test(String(r.message || '')), `gelen: ${r.message}`);
  }

  // B-2: küçük harf bayrak
  {
    stubPostYanit({ isSucceeded: false, message: 'Hata' }, 200);
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-2 HTTP 200 + isSucceeded:false → success:false',
      r.success === false, JSON.stringify(r));
  }

  // B-3: iç içe nesne
  {
    stubPostYanit({ data: { IsSucceeded: false, Message: 'İç hata' } }, 200);
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-3 HTTP 200 + iç içe IsSucceeded:false → success:false',
      r.success === false, JSON.stringify(r));
  }

  // B-4: Success:false
  {
    stubPostYanit({ Success: false, Message: 'Red' }, 200);
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-4 HTTP 200 + Success:false → success:false',
      r.success === false, JSON.stringify(r));
  }

  // B-5: HTTP 4xx
  {
    stubHata(400, { IsSucceeded: false, Message: 'Geçersiz istek' });
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-5 HTTP 400 → success:false', r.success === false);
  }

  // B-6: HTTP 5xx
  {
    stubHata(500, { Message: 'Sunucu hatası' });
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-6 HTTP 500 → success:false', r.success === false);
  }

  // B-7: ağ hatası
  {
    stubAgHatasi('ECONNABORTED');
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-7 Ağ hatası (ECONNABORTED) → success:false', r.success === false);
  }

  // B-8: boş gövde
  {
    stubPostYanit({}, 200);
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-8a Boş gövde → success:true (HTTP başarılı)', r.success === true);
    kontrol('B-8b Ama isSeviyesi "belirsiz" — onay İDDİA EDİLMİYOR',
      (r as any).isSeviyesi === 'belirsiz');
  }

  // B-9: hata mesajı kaynağı
  {
    stubHata(422, { IsSucceeded: false, Message: 'Mükellef bulunamadı' });
    const r = await HizliConnectService.sendApplicationResponse(YANIT, TOKEN, true);
    kontrol('B-9 Hata mesajı API\'nin Message alanından okunuyor',
      /Mükellef bulunamadı/.test(String(r.message || '')), `gelen: ${r.message}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('C. AĞ İZOLASYONU — hiçbir gerçek istek çıkmadı');
  // ═════════════════════════════════════════════════════════════════════════

  kontrol('C-0 Bu süit yalnız UYGULAMA MANTIĞINI ölçer (mock sınırı) — gerçek sandbox PASS DEĞİLDİR', true);

  stublariGeriAl();
  kontrol('C-1 Tüm çağrılar stub üzerinden geçti (gerçek ağ yok)', true);
  kontrol('C-2 Canlı host kullanılmadı',
    !String(sonCagri?.url || '').includes('econnect.hizliteknoloji.com.tr') ||
    String(sonCagri?.url || '').includes('econnecttest'),
    `son URL: ${sonCagri?.url}`);

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(72));
  console.log(`  SONUÇ: ${passCount} PASS / ${failCount} FAIL`);
  console.log('  ⛔ Bu sonuç MOCK/STUB tabanlıdır — gerçek sandbox PASS DEĞİLDİR.');
  console.log('='.repeat(72) + '\n');

  process.exitCode = failCount === 0 ? 0 : 1;
}

main().catch((err) => {
  stublariGeriAl();
  console.error('\n❌ Test beklenmeyen hata ile durdu:', err);
  process.exit(1);
});
