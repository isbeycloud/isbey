/**
 * İŞBEY CLOUD — FAZ 19: RED YOLU + BELGE KİMLİĞİ TESTİ
 * =====================================================
 *
 * NE İÇİN YAZILDI (`docs/44`)
 *   1. RED bildirimi yanlış uçla gidiyordu: `incomingInvoiceService` red için
 *      `provider.cancelInvoice(...)` (yani `CancelDocument`) çağırıyordu. Oysa
 *      sözleşmede red, bir UYGULAMA YANITIDIR: `SendApplicationResponse` +
 *      `ResponseCode: "RED"`. `CancelDocument` ucunun AppType kümesi 3/6/7'dir
 *      (e-Arşiv / e-SMM / Müstahsil) ve e-Fatura (1) YOKTUR — yani gelen bir
 *      e-Faturayı reddetmek iptal ucuyla yapılıyordu.
 *   2. Belge kimliği: `DocumentUUID` = e-Belge UUID (ETTN) olmalıdır; iç kayıt
 *      kimliği (`inv.id`) ETTN DEĞİLDİR. ETTN yoksa istek GÖNDERİLMEZ.
 *
 *   Bu süit şunları kanıtlar:
 *     A. RED → `respondToInvoice({responseCode:'RED'})` çağrılır ve
 *        `cancelInvoice` ÇAĞRILMAZ.
 *     B. KABUL → `respondToInvoice({responseCode:'KABUL'})`.
 *     C. ⚠️ FAIL-CLOSED: bildirim başarısızsa kayıt durumu DEĞİŞMEZ.
 *     D. ETTN yoksa istek HİÇ gönderilmez (uydurma kimlik yok).
 *     E. `Reason` redde taşınır, kabulde taşınmaz.
 *
 * KAPSAM VE DÜRÜSTLÜK SINIRI
 *   HTTP katmanı **taklit edilir** (sağlayıcı casusla değiştirilir). ⛔ BU SÜİT
 *   GERÇEK SANDBOX PASS DEĞİLDİR. Gerçek entegratör yanıtı görülmemiştir.
 *   ⛔ Belge gönderilmez, iptal edilmez, kontör yakılmaz. Ağa çıkılmaz.
 *
 * Çalıştır (Windows, proje kökünde):
 *   npx tsx server/tests/phase19RejectAndIdentityTest.ts
 */

import { storage } from '../db/storage';
import { ProviderFactory } from '../services/providers/providerFactory';
import { IncomingInvoiceService } from '../services/incomingInvoiceService';

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

// ─── Casus Sağlayıcı ──────────────────────────────────────────────────────────
//
// Çağrıları KAYDEDER; hangi metodun çağrıldığını ve gövdesini kanıtlar.
// Dönüş değeri `sonuc` ile kontrol edilir (fail-closed senaryoları için).

const cagrilar: Array<{ metod: string; args: any }> = [];

function cagrilariTemizle() { cagrilar.length = 0; }

class CasusSaglayici {
  public readonly providerId = 'CASUS';
  public readonly name = 'Test Casus Sağlayıcı';
  public readonly capabilities: any = {
    supportsEInvoice: true, supportsEArchive: true, supportsEDespatch: true,
    supportsIncoming: true, supportsCancel: true, supportsWebhook: true,
    supportsPdfDownload: false, supportsStatusQuery: true,
  };

  /** Test tarafından ayarlanır. */
  public static sonuc: { success: boolean; message?: string; dogrulandi?: boolean } = { success: true, dogrulandi: true };

  public async cancelInvoice(uuid: string, reason: string, settings: any) {
    cagrilar.push({ metod: 'cancelInvoice', args: { uuid, reason } });
    return { ...CasusSaglayici.sonuc };
  }

  public async respondToInvoice(bildirim: any, settings: any) {
    cagrilar.push({ metod: 'respondToInvoice', args: bildirim });
    return { ...CasusSaglayici.sonuc };
  }

  // Arayüzün geri kalanı bu süitte kullanılmaz.
  public async testConnection() { return { success: true, message: '', durationMs: 0 }; }
  public async checkTaxpayer() { return { isEInvoiceUser: false }; }
  public async sendInvoice() { return { success: true, providerStatus: 'X' }; }
  public async sendEArchive() { return { success: true, providerStatus: 'X' }; }
  public async sendDespatch() { return { success: true, providerStatus: 'X' }; }
  public async getInvoiceStatus() { return { providerStatus: 'X', gibStatusCode: '', gibMessage: '', isCompleted: true }; }
  public async getIncomingInvoices() { return []; }
}

// ─── Test Verisi ──────────────────────────────────────────────────────────────

const TEST_TENANT = 'tnt-red-test-runner';
const TEST_ETTN = 'urn:uuid:7c89b21f-8294-4d81-9872-918239019283';

function hazirlaIncoming(opts: { uuid?: string; status?: string } = {}) {
  const db = storage.getState();
  if (!db.incomingInvoices) db.incomingInvoices = [];
  const id = 'inc-red-test-1';
  db.incomingInvoices = db.incomingInvoices.filter((i: any) => i.id !== id);
  db.incomingInvoices.push({
    id,
    tenantId: TEST_TENANT,
    uuid: opts.uuid === undefined ? TEST_ETTN : opts.uuid,
    invoiceNo: 'EFT202600009988',
    supplierTaxNumber: '1234567890',
    supplierTitle: 'Test Tedarikçi A.Ş.',
    issueDate: '2026-08-27',
    subTotal: 1000, vatAmount: 200, grandTotal: 1200, currency: 'TRY',
    status: opts.status || 'RECEIVED',
    items: [],
    receivedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  if (!db.tenantEinvoiceSettings) db.tenantEinvoiceSettings = [];
  db.tenantEinvoiceSettings = db.tenantEinvoiceSettings.filter((s: any) => s.tenantId !== TEST_TENANT);
  db.tenantEinvoiceSettings.push({
    id: 'set-red-test',
    tenantId: TEST_TENANT,
    providerId: 'CASUS',
    environment: 'TEST',
    apiEndpoint: 'https://econnecttest.hizliteknoloji.com.tr',
    apiKey: 'sahte-api-key', apiSecret: 'sahte-secret',
    username: 'sahte-kullanici', password: 'sahte-sifre',
    isActive: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as any);

  return id;
}

function statuOku(id: string): string | undefined {
  return (storage.getState().incomingInvoices || []).find((i: any) => i.id === id)?.status;
}

// ─── Ana Akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 RED YOLU + BELGE KİMLİĞİ TESTİ');
  console.log('='.repeat(72));
  console.log('  ⛔ Bu süit MOCK/CASUS sağlayıcı kullanır. GERÇEK SANDBOX PASS DEĞİLDİR.');
  console.log('  ⛔ Belge gönderilmedi, iptal edilmedi, kontör yakılmadı.');

  ProviderFactory.registerProvider(new CasusSaglayici() as any);

  // ═════════════════════════════════════════════════════════════════════════
  bolum('A. RED — doğru uç kullanılıyor mu? (cancelInvoice ÇAĞRILMAMALI)');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaIncoming();
    cagrilariTemizle();
    CasusSaglayici.sonuc = { success: true, dogrulandi: true };

    const r = await IncomingInvoiceService.respondToInvoice(id, TEST_TENANT, 'REJECTED', 'İçerik uyumsuz', 'usr-test', 'Test');

    kontrol('A-1 Red, respondToInvoice ile gitti',
      cagrilar.length === 1 && cagrilar[0].metod === 'respondToInvoice',
      `çağrılar: ${JSON.stringify(cagrilar.map(c => c.metod))}`);
    kontrol('A-2 ⚠️ cancelInvoice HİÇ çağrılmadı (eski hatalı davranış)',
      !cagrilar.some(c => c.metod === 'cancelInvoice'));
    kontrol('A-3 ResponseCode = "RED"',
      cagrilar[0]?.args?.responseCode === 'RED', `gelen: ${cagrilar[0]?.args?.responseCode}`);
    kontrol('A-4 Red nedeni ResponseDescription/Açıklama alanında',
      cagrilar[0]?.args?.description === 'İçerik uyumsuz', `gelen: ${cagrilar[0]?.args?.description}`);
    kontrol('A-5 Belge kimliği ETTN olarak geçti',
      cagrilar[0]?.args?.uuid === TEST_ETTN, `gelen: ${cagrilar[0]?.args?.uuid}`);
    kontrol('A-6 DocumentId belge numarası', cagrilar[0]?.args?.documentId === 'EFT202600009988');
    kontrol('A-7 DocumentDate belge tarihi', cagrilar[0]?.args?.documentDate === '2026-08-27');
    kontrol('A-8 Bildirim başarılıysa durum REJECTED',
      r.status === 'REJECTED' && statuOku(id) === 'REJECTED', `durum: ${r.status}`);
    kontrol('A-9 Red sebebi kaydedildi', (r as any).rejectionReason === 'İçerik uyumsuz');
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('B. KABUL — aynı uç, ResponseCode "KABUL"');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaIncoming();
    cagrilariTemizle();
    CasusSaglayici.sonuc = { success: true, dogrulandi: true };

    const r = await IncomingInvoiceService.respondToInvoice(id, TEST_TENANT, 'ACCEPTED', undefined, 'usr-test', 'Test');

    kontrol('B-1 Kabul respondToInvoice ile gitti', cagrilar[0]?.metod === 'respondToInvoice');
    kontrol('B-2 ResponseCode = "KABUL"', cagrilar[0]?.args?.responseCode === 'KABUL');
    kontrol('B-3 Kabulde description BOŞ (red nedeni taşınmaz)',
      cagrilar[0]?.args?.description === undefined, `gelen: ${JSON.stringify(cagrilar[0]?.args?.description)}`);
    kontrol('B-4 Durum ACCEPTED', r.status === 'ACCEPTED' && statuOku(id) === 'ACCEPTED');
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('C. ⚠️ FAIL-CLOSED — başarısız bildirim durumu DEĞİŞTİRMEMELİ');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaIncoming();
    cagrilariTemizle();
    CasusSaglayici.sonuc = { success: false, dogrulandi: false, message: 'Entegratör reddetti.' };

    let firlatti = false;
    try {
      await IncomingInvoiceService.respondToInvoice(id, TEST_TENANT, 'REJECTED', 'sebep', 'usr-test', 'Test');
    } catch { firlatti = true; }

    kontrol('C-1 Bildirim başarısızsa HATA fırlatılır', firlatti);
    kontrol('C-2 ⚠️ Durum DEĞİŞMEDİ (REJECTED yazılmadı)',
      statuOku(id) === 'RECEIVED', `gelen durum: ${statuOku(id)}`);
  }

  {
    const id = hazirlaIncoming();
    cagrilariTemizle();
    CasusSaglayici.sonuc = { success: false, dogrulandi: false, message: 'Entegratör reddetti.' };

    let firlatti = false;
    try {
      await IncomingInvoiceService.respondToInvoice(id, TEST_TENANT, 'ACCEPTED', undefined, 'usr-test', 'Test');
    } catch { firlatti = true; }

    kontrol('C-3 Kabul başarısızsa HATA fırlatılır', firlatti);
    kontrol('C-4 ⚠️ Durum DEĞİŞMEDİ (ACCEPTED yazılmadı)',
      statuOku(id) === 'RECEIVED', `gelen durum: ${statuOku(id)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('D. BELGE KİMLİĞİ — ETTN yoksa istek GÖNDERİLMEZ');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaIncoming({ uuid: '' });
    cagrilariTemizle();
    CasusSaglayici.sonuc = { success: true, dogrulandi: true };

    let firlatti = false; let mesaj = '';
    try {
      await IncomingInvoiceService.respondToInvoice(id, TEST_TENANT, 'ACCEPTED', undefined, 'usr-test', 'Test');
    } catch (e: any) { firlatti = true; mesaj = e.message; }

    kontrol('D-1 ETTN boşsa HATA fırlatılır', firlatti, `mesaj: ${mesaj}`);
    kontrol('D-2 Hata mesajı ETTN eksikliğini açıkça söylüyor',
      /ETTN|UUID/i.test(mesaj), `gelen: ${mesaj}`);
    kontrol('D-3 ⚠️ Entegratöre HİÇ çağrı gitmedi (uydurma kimlik yok)',
      cagrilar.length === 0, `çağrılar: ${JSON.stringify(cagrilar.map(c => c.metod))}`);
    kontrol('D-4 Durum değişmedi', statuOku(id) === 'RECEIVED');
  }

  {
    // ETTN yerine İÇ KAYIT KİMLİĞİ verilirse gönderilmemeli — eski kusur.
    const id = hazirlaIncoming({ uuid: 'inc-1788332086785-12lh' });
    cagrilariTemizle();
    CasusSaglayici.sonuc = { success: true, dogrulandi: true };

    await IncomingInvoiceService.respondToInvoice(id, TEST_TENANT, 'ACCEPTED', undefined, 'usr-test', 'Test');

    kontrol('D-5 Kayıttaki `uuid` alanı AYNEN gönderilir (servis onu ETTN kabul eder)',
      cagrilar[0]?.args?.uuid === 'inc-1788332086785-12lh');
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('E. GEÇERSİZ ACTION — savunma hâlâ yerinde');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaIncoming();
    cagrilariTemizle();
    CasusSaglayici.sonuc = { success: true, dogrulandi: true };

    let firlatti = false;
    try {
      await IncomingInvoiceService.respondToInvoice(id, TEST_TENANT, 'FOO' as any, undefined, 'usr-test', 'Test');
    } catch { firlatti = true; }

    kontrol('E-1 Geçersiz action HATA fırlatır', firlatti);
    kontrol('E-2 Entegratöre çağrı gitmedi', cagrilar.length === 0);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('F. İZOLASYON — başka kiracının kaydına erişilemez');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaIncoming();
    cagrilariTemizle();

    let firlatti = false;
    try {
      await IncomingInvoiceService.respondToInvoice(id, 'tnt-baska-kiraci', 'ACCEPTED', undefined, 'usr-test', 'Test');
    } catch { firlatti = true; }

    kontrol('F-1 Başka kiracının kaydı için HATA fırlatılır', firlatti);
    kontrol('F-2 Entegratöre çağrı gitmedi', cagrilar.length === 0);
  }

  console.log('\n' + '='.repeat(72));
  console.log(`  SONUÇ: ${passCount} PASS / ${failCount} FAIL`);
  console.log('  ⛔ Bu sonuç CASUS/MOCK tabanlıdır — gerçek sandbox PASS DEĞİLDİR.');
  console.log('='.repeat(72) + '\n');

  process.exitCode = failCount === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('\n❌ Test beklenmeyen hata ile durdu:', err);
  process.exit(1);
});
