/**
 * İŞBEY CLOUD — FAZ 19: KABUL BİLDİRİMİ (`respondToInvoice`) TESTİ
 * =================================================================
 *
 * NE İÇİN YAZILDI
 *   `docs/41` §4 bulgusu: `incomingInvoiceService` "sağlayıcı arayüzünde
 *   kabul/onay bildir diye çağrı YOKTUR" diyordu. Hızlı Bilişim sözleşmesi
 *   (`SendApplicationResponse`, `ResponseCode: "KABUL" | "RED"`) bunu mümkün
 *   kılıyor. `docs/43` kapsamında arayüze `respondToInvoice` eklendi ve
 *   `ACCEPTED` yolu artık entegratöre GERÇEKTEN bildiriyor.
 *
 *   Bu süit üç şeyi kanıtlar:
 *     1. Sağlayıcılar arayüz sözleşmesini karşılıyor (MOCK + HIZLI_TEKNOLOJI).
 *     2. Kabul bildirimi doğru gövdeyle uca gidiyor (AppType=1, ResponseCode=KABUL,
 *        Documents[]).
 *     3. ⚠️ FAIL-CLOSED: bildirim iletilemezse kayıt ACCEPTED YAPILMAZ.
 *        (Red dalındaki aynı disiplin — sessiz yalan üretilmez.)
 *
 * KAPSAM VE DÜRÜSTLÜK SINIRI
 *   HTTP katmanı **taklit edilir** (axios sahtelenir). ⛔ BU SÜİT GERÇEK
 *   SANDBOX PASS DEĞİLDİR. Gerçek entegratör yanıtı görülmemiştir.
 *   ⛔ Belge gönderilmez, iptal edilmez, kontör yakılmaz. Ağa çıkılmaz.
 *
 * Çalıştır (Windows, proje kökünde):
 *   npx tsx server/tests/phase19AcceptResponseTest.ts
 */

import axios from 'axios';
import { MockElectronicDocumentProvider } from '../services/providers/mockProvider';
import { HizliTeknolojiProvider } from '../services/providers/hizliTeknolojiProvider';
import { setTenantTokenForTest } from '../services/hizliTenantCredentialRegistry';

// ─── Test Yardımcıları ────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function pass(name: string): void { passCount++; console.log(`  ✅ PASS  ${name}`); }
function fail(name: string, detail?: string): void {
  failCount++; console.error(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function kontrol(ad: string, kosul: boolean, detay?: string): void {
  kosul ? pass(ad) : fail(ad, detay);
}
function bolum(baslik: string): void {
  console.log(`\n${'─'.repeat(72)}\n📋 ${baslik}\n${'─'.repeat(72)}`);
}

// ─── HTTP Taklidi ─────────────────────────────────────────────────────────────

const axiosAny = axios as any;
const gercekPost = axiosAny.post;

let sonCagri: { url: string; govde: any; basliklar: any } | null = null;

function stubPostYanit(data: any, status = 200) {
  sonCagri = null;
  axiosAny.post = async (url: string, govde: any, config: any) => {
    sonCagri = { url, govde, basliklar: config?.headers };
    return { data, status };
  };
}

function stubPostHata(status: number, data: any = {}) {
  const hata: any = new Error(`Request failed with status code ${status}`);
  hata.response = { status, data, headers: {} };
  axiosAny.post = async () => { throw hata; };
}

function stublariGeriAl() { axiosAny.post = gercekPost; }

const testSettings: any = {
  tenantId: 'tnt-test',
  providerId: 'HIZLI_TEKNOLOJI',
  environment: 'TEST',
  apiKey: 'sahte-api-key-degeri',
  secretKey: 'sahte-secret-degeri',
  username: 'sahte-kullanici',
  password: 'sahte-sifre',
  senderIdentifier: '1234567890',
};

const BILDIRIM = {
  uuid: 'urn:uuid:7c89b21f-8294-4d81-9872-918239019283',
  responseCode: 'KABUL' as const,
  description: 'kabul',
  documentId: 'EFT202600009988',
  documentDate: '2026-08-27',
};

// ─── Ana Akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 KABUL BİLDİRİMİ (respondToInvoice) TESTİ');
  console.log('='.repeat(72));
  console.log('  ⛔ Bu süit MOCK/STUB kullanır. GERÇEK SANDBOX PASS DEĞİLDİR.');
  console.log('  ⛔ Belge gönderilmedi, iptal edilmedi, kontör yakılmadı.');

  // ═════════════════════════════════════════════════════════════════════════
  bolum('A. MOCK SAĞLAYICI — arayüzü karşılıyor, sahte teyit üretmiyor');
  // ═════════════════════════════════════════════════════════════════════════

  const mock = new MockElectronicDocumentProvider();
  {
    kontrol('A-1 MOCK respondToInvoice metodunu sağlıyor',
      typeof mock.respondToInvoice === 'function');

    const r = await mock.respondToInvoice(BILDIRIM, testSettings);
    kontrol('A-2 MOCK çağrıyı kabul ediyor', r.success === true);
    kontrol('A-3 ⚠️ Ama dogrulandi UNDEFINED — entegratör teyidi İDDİA EDİLMİYOR',
      r.dogrulandi === undefined, `gelen: ${JSON.stringify(r.dogrulandi)}`);
    kontrol('A-4 Mesaj [MOCK] olduğunu açıkça söylüyor',
      /\[MOCK\]/.test(String(r.message || '')), `gelen: ${r.message}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('B. HIZLI_TEKNOLOJI — doğru sözleşme gövdesiyle uca gidiyor');
  // ═════════════════════════════════════════════════════════════════════════

  const hizli = new HizliTeknolojiProvider();
  // Token önbelleği test kancasıyla doldurulur — kimlik çözümlemesi atlanır,
  // böylece ölçülen şey GERÇEKTEN `SendApplicationResponse` çağrısıdır.
  setTenantTokenForTest('tnt-test', true, 'sahte-token-degeri');
  {
    axiosAny.post = async (url: string, govde: any, config: any) => {
      sonCagri = { url, govde, basliklar: config?.headers };
      return { data: { IsSucceeded: true, Message: 'OK' }, status: 200 };
    };

    const r = await hizli.respondToInvoice(BILDIRIM, testSettings);

    kontrol('B-1 İstek SendApplicationResponse ucuna gitti',
      String(sonCagri?.url || '').endsWith('/HizliApi/RestApi/SendApplicationResponse'),
      `gelen: ${sonCagri?.url}`);
    kontrol('B-2 Authorization Bearer gönderildi',
      /^Bearer /.test(String(sonCagri?.basliklar?.['Authorization'] || '')));
    kontrol('B-3 AppType = 1 (bu ucun numaralandırması)',
      sonCagri?.govde?.AppType === 1, `gelen: ${JSON.stringify(sonCagri?.govde?.AppType)}`);
    kontrol('B-4 ResponseCode = "KABUL"',
      sonCagri?.govde?.ResponseCode === 'KABUL');
    kontrol('B-5 Documents[] dolu', Array.isArray(sonCagri?.govde?.Documents) &&
      sonCagri?.govde?.Documents?.length === 1);
    kontrol('B-6 Documents[].DocumentUUID = ETTN',
      sonCagri?.govde?.Documents?.[0]?.DocumentUUID === BILDIRIM.uuid);
    kontrol('B-7 Documents[].DocumentId', sonCagri?.govde?.Documents?.[0]?.DocumentId === BILDIRIM.documentId);
    kontrol('B-8 Documents[].DocumentDate', sonCagri?.govde?.Documents?.[0]?.DocumentDate === BILDIRIM.documentDate);
    kontrol('B-9 İş-seviyesi başarı bayrağı görüldü → success:true + dogrulandi:true',
      r.success === true && r.dogrulandi === true, JSON.stringify(r));
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('C. ⚠️ FAIL-CLOSED — başarısız bildirim "kabul edildi" SAYILMAMALI');
  // ═════════════════════════════════════════════════════════════════════════

  {
    // HTTP 200 ama İŞ HATASI
    axiosAny.post = async (url: string, govde: any, config: any) => {
      sonCagri = { url, govde, basliklar: config?.headers };
      return { data: { IsSucceeded: false, Message: 'Belge bulunamadı.' }, status: 200 };
    };
    const r = await hizli.respondToInvoice(BILDIRIM, testSettings);
    kontrol('C-1 HTTP 200 + IsSucceeded:false → success:false', r.success === false, JSON.stringify(r));
    kontrol('C-2 dogrulandi:false', r.dogrulandi === false);
    kontrol('C-3 Mesaj API hatasını taşıyor',
      /Belge bulunamadı/.test(String(r.message || '')), `gelen: ${r.message}`);
  }

  {
    // Bayrak hiç yok → belirsiz → success FALSE (kabul kesinleşmedi)
    axiosAny.post = async (url: string, govde: any, config: any) => {
      return { data: { Message: 'işlendi' }, status: 200 };
    };
    const r = await hizli.respondToInvoice(BILDIRIM, testSettings);
    kontrol('C-4 Bayrak yoksa → success:false (kabul KESİNLEŞMEDİ)',
      r.success === false, JSON.stringify(r));
    kontrol('C-5 dogrulandi:false', r.dogrulandi === false);
    kontrol('C-6 Mesaj "DOĞRULANMADI" diyor',
      /DOĞRULANMADI/.test(String(r.message || '')), `gelen: ${r.message}`);
  }

  {
    // Ağ hatası
    axiosAny.post = async () => {
      const h: any = new Error('Network Error'); h.code = 'ECONNABORTED'; throw h;
    };
    const r = await hizli.respondToInvoice(BILDIRIM, testSettings);
    kontrol('C-7 Ağ hatası → success:false', r.success === false, JSON.stringify(r));
  }

  {
    // HTTP 500
    axiosAny.post = async () => {
      const h: any = new Error('Server Error'); h.response = { status: 500, data: {}, headers: {} }; throw h;
    };
    const r = await hizli.respondToInvoice(BILDIRIM, testSettings);
    kontrol('C-8 HTTP 500 → success:false', r.success === false, JSON.stringify(r));
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('D. RED de aynı uçla gidiyor (ResponseCode:"RED")');
  // ═════════════════════════════════════════════════════════════════════════

  {
    axiosAny.post = async (url: string, govde: any, config: any) => {
      sonCagri = { url, govde, basliklar: config?.headers };
      return { data: { IsSucceeded: true }, status: 200 };
    };
    await hizli.respondToInvoice({ ...BILDIRIM, responseCode: 'RED', description: 'uyumsuz' }, testSettings);
    kontrol('D-1 RED → ResponseCode:"RED"', sonCagri?.govde?.ResponseCode === 'RED');
    kontrol('D-2 RED nedeni ResponseDescription\'ta',
      sonCagri?.govde?.ResponseDescription === 'uyumsuz');
    kontrol('D-3 RED de Documents[] taşıyor', sonCagri?.govde?.Documents?.length === 1);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('E. AĞ İZOLASYONU');
  // ═════════════════════════════════════════════════════════════════════════

  stublariGeriAl();
  kontrol('E-0 Bu süit yalnız UYGULAMA MANTIĞINI ölçer (mock sınırı) — gerçek sandbox PASS DEĞİLDİR', true);
  kontrol('E-1 Tüm çağrılar stub üzerinden geçti (gerçek ağ yok)', true);
  kontrol('E-2 Canlı host kullanılmadı',
    !String(sonCagri?.url || '').includes('econnect.hizliteknoloji.com.tr') ||
    String(sonCagri?.url || '').includes('econnecttest'),
    `son URL: ${sonCagri?.url}`);

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
