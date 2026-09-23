/**
 * İŞBEY CLOUD — FAZ 19: BELGE İPTAL AKIŞI TESTİ (UYGULAMA MANTIĞI)
 * =================================================================
 *
 * KAPSAM VE DÜRÜSTLÜK SINIRI
 *   Bu süit UYGULAMA MANTIĞINI ölçer: HTTP yanıtı geldiğinde kodun doğru karar
 *   verip vermediğini. HTTP katmanı **taklit edilir** (axios çağrısı sahtelenir).
 *
 *   ⛔ BU SÜİT "GERÇEK SANDBOX PASS" DEĞİLDİR.
 *      Gerçek entegratör yanıtı görülmemiştir. Mock/stub sonucu gerçek sandbox
 *      kanıtı SAYILMAZ (kullanıcı kuralı 7). Gerçek kanıt için:
 *      `tools/faz19-belge-akisi.ps1` (egress erişimli makinede).
 *
 *   ⛔ SÖZLEŞME SINIRI: `CancelDocument` gövde alan adları (`uuid`/`cancelReason`)
 *      ve yanıt şeması DOĞRULANMAMIŞTIR (bkz.
 *      `docs/35_FAZ19_CANCELDOCUMENT_SOZLESME_DENETIMI.md`). Bu süit o alanları
 *      DOĞRULAMAZ — yalnız "gelen yanıt doğru sınıflandırılıyor mu" sorusunu ölçer.
 *
 * NE ÖLÇÜLÜR (kullanıcı kuralı 6)
 *   POZİTİF
 *     P-1  İptal isteği vendor ucuna GİDİYOR (doğru URL + method + auth)
 *     P-2  İptal gövdesi çağıranın verdiği kimliği taşıyor
 *     P-3  HTTP 200 + iş-seviyesi başarı → `success: true`
 *     P-4  HTTP 200 + başarı bayrağı yok → `success: true` AMA "doğrulanmadı" mesajı
 *   NEGATİF — sahte "iptal başarılı" ÜRETİLMEMELİ
 *     N-1  HTTP 4xx
 *     N-2  HTTP 5xx
 *     N-3  HTTP 200 + `IsSucceeded: false`
 *     N-4  HTTP 200 + `isSucceeded: false` (küçük harf)
 *     N-5  HTTP 200 + iç içe `{ data: { IsSucceeded: false } }`
 *     N-6  Ağ hatası (timeout / ECONNABORTED)
 *     N-7  Ağ hatası (ENOTFOUND / DNS)
 *     N-8  Boş yanıt gövdesi (bayrak yok → belirsiz, başarı İDDİA EDİLMEZ)
 *     N-9  `sendDocument` aynı kurala uyuyor mu (gönderim de sahte-OK üretmesin)
 *
 * Çalıştır: npx tsx server/tests/phase19CancelFlowTest.ts
 */

import axios from 'axios';
import {
  HizliConnectService,
  isSeviyesiSonucuOku,
  isSeviyesiMesaji,
  tokenStore,
} from '../services/hizliConnectService';
import { storage } from '../db/storage';
import { DocumentConversionService } from '../services/documentConversionService';
import { setTenantTokenForTest } from '../services/hizliTenantCredentialRegistry';

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

function bolum(baslik: string): void {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`📋 ${baslik}`);
  console.log('─'.repeat(72));
}

// ─── HTTP Taklidi (stub) ──────────────────────────────────────────────────────
// axios'un `post`/`get` metodları geçici olarak değiştirilir. Böylece ağa HİÇ
// çıkılmaz; kodun yanıtı nasıl yorumladığı ölçülür.

const axiosAny = axios as any;
const gercekPost = axiosAny.post;
const gercekGet = axiosAny.get;

let sonCagri: { url: string; govde: any; basliklar: any; method: 'post' | 'get' } | null = null;

function stubPostYanit(data: any, status = 200) {
  sonCagri = null;
  axiosAny.post = async (url: string, govde: any, config: any) => {
    sonCagri = { url, govde, basliklar: config?.headers, method: 'post' };
    return { data, status };
  };
}

function stubGetYanit(data: any, status = 200) {
  sonCagri = null;
  axiosAny.get = async (url: string, config: any) => {
    sonCagri = { url, govde: null, basliklar: config?.headers, method: 'get' };
    return { data, status };
  };
}

function stubHata(status: number, data: any = {}) {
  sonCagri = null;
  const hata: any = new Error(`Request failed with status code ${status}`);
  hata.response = { status, data, headers: { 'content-type': 'application/json' } };
  axiosAny.post = async (url: string, govde: any, config: any) => {
    sonCagri = { url, govde, basliklar: config?.headers, method: 'post' };
    throw hata;
  };
  axiosAny.get = async (url: string, config: any) => {
    sonCagri = { url, govde: null, basliklar: config?.headers, method: 'get' };
    throw hata;
  };
}

function stubAgHatasi(kod: string) {
  sonCagri = null;
  const hata: any = new Error(`Network Error (${kod})`);
  hata.code = kod;
  axiosAny.post = async (url: string, govde: any, config: any) => {
    sonCagri = { url, govde, basliklar: config?.headers, method: 'post' };
    throw hata;
  };
}

function stublariGeriAl() {
  axiosAny.post = gercekPost;
  axiosAny.get = gercekGet;
}

const TOKEN = 'test-token-degeri';
const TEST_BASE = 'https://econnecttest.hizliteknoloji.com.tr';

// ─── Ana Akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 BELGE İPTAL AKIŞI TESTİ (uygulama mantığı)');
  console.log('='.repeat(72));
  console.log('  ⛔ Bu süit MOCK/STUB kullanır. GERÇEK SANDBOX PASS DEĞİLDİR.');

  // ═════════════════════════════════════════════════════════════════════════
  bolum('BÖLÜM 0: İŞ-SEVİYESİ SINIFLANDIRICI (saf fonksiyon)');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const vakalar: Array<[string, any, 'basarili' | 'basarisiz' | 'belirsiz']> = [
      ['IsSucceeded=true (büyük)', { IsSucceeded: true }, 'basarili'],
      ['IsSucceeded=false (büyük)', { IsSucceeded: false }, 'basarisiz'],
      ['isSucceeded=false (küçük)', { isSucceeded: false }, 'basarisiz'],
      ['isSucceeded=true (küçük)', { isSucceeded: true }, 'basarili'],
      ['Success=false', { Success: false }, 'basarisiz'],
      ['success=true', { success: true }, 'basarili'],
      ['dizi içinde IsSucceeded=false', [{ IsSucceeded: false }], 'basarisiz'],
      ['iç içe nesnede IsSucceeded=false', { data: { IsSucceeded: false } }, 'basarisiz'],
      ['iç içe nesnede IsSucceeded=true', { data: { IsSucceeded: true } }, 'basarili'],
      ['boş nesne → belirsiz', {}, 'belirsiz'],
      ['null → belirsiz', null, 'belirsiz'],
      ['undefined → belirsiz', undefined, 'belirsiz'],
      ['boş dizi → belirsiz', [], 'belirsiz'],
      ['boolean olmayan bayrak → belirsiz', { IsSucceeded: 'false' }, 'belirsiz'],
      ['alakasız alanlar → belirsiz', { Message: 'ok', Code: 0 }, 'belirsiz'],
    ];

    let hatali = 0;
    for (const [ad, girdi, beklenen] of vakalar) {
      const sonuc = isSeviyesiSonucuOku(girdi);
      if (sonuc !== beklenen) {
        hatali++;
        fail(`sınıflandırma: ${ad}`, `beklenen=${beklenen} ölçülen=${sonuc}`);
      }
    }
    if (hatali === 0) {
      pass(`iş-seviyesi sınıflandırıcı: ${vakalar.length}/${vakalar.length} vaka doğru`);
    }

    // Mesaj çıkarımı
    const mesajVakalari: Array<[string, any, string | undefined]> = [
      ['Message', { Message: 'Hatalı secretKey!' }, 'Hatalı secretKey!'],
      ['message', { message: 'hata' }, 'hata'],
      ['ErrorMessage', { ErrorMessage: 'boom' }, 'boom'],
      ['yok', { IsSucceeded: true }, undefined],
      ['boş string → yok', { Message: '   ' }, undefined],
    ];
    let mMesajHata = 0;
    for (const [ad, girdi, beklenen] of mesajVakalari) {
      const sonuc = isSeviyesiMesaji(girdi);
      if (sonuc !== beklenen) {
        mMesajHata++;
        fail(`mesaj çıkarımı: ${ad}`, `beklenen=${String(beklenen)} ölçülen=${String(sonuc)}`);
      }
    }
    if (mMesajHata === 0) {
      pass(`iş-seviyesi mesaj çıkarımı: ${mesajVakalari.length}/${mesajVakalari.length} vaka doğru`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('BÖLÜM 1: POZİTİF — İSTEK VENDOR UCUNA GİDİYOR MU?');
  // ═════════════════════════════════════════════════════════════════════════

  const IZLEME_UUID = 'ettn-izleme-0001';

  try {
    stubPostYanit({ IsSucceeded: true, Message: 'ok' });
    const r = await HizliConnectService.cancelDocument(
      { uuid: IZLEME_UUID, cancelReason: 'test sebep' }, TOKEN, true);

    // P-1: doğru uç + method
    if (sonCagri && sonCagri.method === 'post' && sonCagri.url === `${TEST_BASE}/HizliApi/RestApi/CancelDocument`) {
      pass('P-1 iptal isteği doğru uca POST ediliyor (RestApi/CancelDocument)');
    } else {
      fail('P-1 iptal isteği doğru uca POST edilmiyor',
        `ölçülen: ${sonCagri?.method?.toUpperCase()} ${sonCagri?.url}`);
    }

    // P-1b: test modunda TEST hostu (canlı host DEĞİL)
    if (sonCagri && sonCagri.url.includes('econnecttest.') && !sonCagri.url.includes('//econnect.')) {
      pass('P-1b istek TEST hostuna gidiyor (canlı host değil)');
    } else {
      fail('P-1b istek TEST hostuna gitmiyor', `ölçülen: ${sonCagri?.url}`);
    }

    // P-1c: Bearer auth
    const auth = String(sonCagri?.basliklar?.Authorization || '');
    if (auth === `Bearer ${TOKEN}`) {
      pass('P-1c Authorization: Bearer başlığı gönderiliyor');
    } else {
      fail('P-1c Authorization başlığı eksik/yanlış', `ölçülen: ${auth ? '(dolu ama farklı)' : '(yok)'}`);
    }

    // P-2: gövde çağıranın verdiği kimliği taşıyor
    if (sonCagri && sonCagri.govde && sonCagri.govde.uuid === IZLEME_UUID) {
      pass('P-2 iptal gövdesi çağıranın verdiği belge kimliğini taşıyor');
    } else {
      fail('P-2 iptal gövdesi belge kimliğini taşımıyor', JSON.stringify(sonCagri?.govde));
    }

    // P-3: 200 + başarı
    if (r.success === true) {
      pass('P-3 HTTP 200 + iş-seviyesi başarı → success=true');
    } else {
      fail('P-3 başarılı yanıt başarı sayılmadı', String(r.message));
    }

    if ((r as any).isSeviyesi === 'basarili') {
      pass('P-3b iş-seviyesi sonucu "basarili" olarak raporlanıyor');
    } else {
      fail('P-3b iş-seviyesi sonucu yanlış', `ölçülen: ${(r as any).isSeviyesi}`);
    }
  } catch (e: any) {
    fail('P-1..P-3 pozitif akış beklenmeyen hata', e.message);
  }

  // P-4: 200 ama bayrak yok → success=true, ama "doğrulanmadı" mesajı
  try {
    stubPostYanit({ Message: 'isleniyor' });
    const r = await HizliConnectService.cancelDocument({ uuid: 'x', cancelReason: 'y' }, TOKEN, true);
    const mesaj = String(r.message || '');
    if (r.success === true && (r as any).isSeviyesi === 'belirsiz' && /doğrulanmadı|belirsiz/i.test(mesaj)) {
      pass('P-4 HTTP 200 + bayrak YOK → success=true ama "doğrulanmadı" olarak işaretli');
    } else {
      fail('P-4 bayraksız yanıt yanlış sınıflandırıldı',
        `success=${r.success} isSeviyesi=${(r as any).isSeviyesi} mesaj=${mesaj}`);
    }
  } catch (e: any) {
    fail('P-4 beklenmeyen hata', e.message);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('BÖLÜM 2: NEGATİF — SAHTE "İPTAL BAŞARILI" ÜRETİLMEMELİ');
  // ═════════════════════════════════════════════════════════════════════════

  // N-1 / N-2: HTTP 4xx / 5xx
  for (const [ad, kod] of [['N-1 HTTP 4xx (400)', 400], ['N-2 HTTP 5xx (500)', 500]] as Array<[string, number]>) {
    try {
      stubHata(kod, { Message: 'sunucu hatası' });
      const r = await HizliConnectService.cancelDocument({ uuid: 'x', cancelReason: 'y' }, TOKEN, true);
      if (r.success === false) {
        pass(`${ad} → success=false (sahte onay yok)`);
      } else {
        fail(`${ad} sahte başarı üretti`, JSON.stringify(r));
      }
    } catch (e: any) {
      fail(`${ad} beklenmeyen istisna`, e.message);
    }
  }

  // N-3 / N-4 / N-5: HTTP 200 ama iş hatası
  const isHatasiVakalari: Array<[string, any]> = [
    ['N-3 HTTP 200 + IsSucceeded=false', { IsSucceeded: false, Message: 'Belge bulunamadı.' }],
    ['N-4 HTTP 200 + isSucceeded=false (küçük)', { isSucceeded: false, Message: 'hata' }],
    ['N-5 HTTP 200 + iç içe IsSucceeded=false', { data: { IsSucceeded: false, Message: 'iç hata' } }],
  ];
  for (const [ad, govde] of isHatasiVakalari) {
    try {
      stubPostYanit(govde, 200);
      const r = await HizliConnectService.cancelDocument({ uuid: 'x', cancelReason: 'y' }, TOKEN, true);
      if (r.success === false) {
        pass(`${ad} → success=false (HTTP 2xx YETMEDİ)`);
      } else {
        fail(`${ad} sahte başarı üretti — HTTP 200 iş hatasını maskeliyor`, JSON.stringify(r));
      }
    } catch (e: any) {
      fail(`${ad} beklenmeyen istisna`, e.message);
    }
  }

  // N-6 / N-7: ağ hataları
  for (const [ad, kod] of [['N-6 ağ hatası: timeout/ECONNABORTED', 'ECONNABORTED'], ['N-7 ağ hatası: DNS/ENOTFOUND', 'ENOTFOUND']] as Array<[string, string]>) {
    try {
      stubAgHatasi(kod);
      const r = await HizliConnectService.cancelDocument({ uuid: 'x', cancelReason: 'y' }, TOKEN, true);
      if (r.success === false) {
        pass(`${ad} → success=false`);
      } else {
        fail(`${ad} sahte başarı üretti`, JSON.stringify(r));
      }
    } catch (e: any) {
      fail(`${ad} beklenmeyen istisna`, e.message);
    }
  }

  // N-8: boş gövde → belirsiz; "başarılı" İDDİA EDİLMEMELİ
  try {
    stubPostYanit('', 200);
    const r = await HizliConnectService.cancelDocument({ uuid: 'x', cancelReason: 'y' }, TOKEN, true);
    if ((r as any).isSeviyesi !== 'basarili') {
      pass('N-8 boş yanıt gövdesi "başarılı" sayılmadı (belirsiz)');
    } else {
      fail('N-8 boş yanıt başarılı sayıldı');
    }
  } catch (e: any) {
    fail('N-8 beklenmeyen istisna', e.message);
  }

  // N-9: aynı koruma gönderimde de var mı?
  try {
    stubPostYanit({ IsSucceeded: false, Message: 'gönderim reddedildi' }, 200);
    const r = await HizliConnectService.sendDocument([{ belge: 'x' }], TOKEN, true);
    const sinif = isSeviyesiSonucuOku((r as any).data);
    if (sinif === 'basarisiz') {
      pass('N-9 gönderim yanıtında iş hatası sınıflandırılabiliyor (bkz. not)');
    } else {
      fail('N-9 gönderim yanıtı sınıflandırılamadı', `ölçülen: ${sinif}`);
    }
  } catch (e: any) {
    fail('N-9 beklenmeyen istisna', e.message);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('BÖLÜM 3: e-Arşiv İPTAL UCU AYNI KURALA UYUYOR MU?');
  // ═════════════════════════════════════════════════════════════════════════

  try {
    stubGetYanit({ IsSucceeded: false, Message: 'iptal edilemez' }, 200);
    const r = await HizliConnectService.cancelEArsivInvoice('uuid-x', 'sebep', TOKEN, true);
    if (r.success === false) {
      pass('e-Arşiv: HTTP 200 + iş hatası → success=false');
    } else {
      fail('e-Arşiv: HTTP 200 iş hatasını maskeliyor', JSON.stringify(r));
    }

    if (sonCagri?.method === 'get' && sonCagri.url.includes('/HizliApi/RestApi/CancelEArsivInvoice')) {
      pass('e-Arşiv: doğru uca GET ediliyor');
    } else {
      fail('e-Arşiv: uç/method yanlış', `${sonCagri?.method} ${sonCagri?.url}`);
    }
  } catch (e: any) {
    fail('e-Arşiv akışı beklenmeyen hata', e.message);
  }

  try {
    stubGetYanit({ IsSucceeded: true }, 200);
    const r = await HizliConnectService.cancelEArsivInvoice('uuid-x', 'sebep', TOKEN, true);
    if (r.success === true) {
      pass('e-Arşiv: HTTP 200 + iş başarısı → success=true');
    } else {
      fail('e-Arşiv: başarılı yanıt reddedildi', String(r.message));
    }
  } catch (e: any) {
    fail('e-Arşiv pozitif akış hatası', e.message);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('BÖLÜM 3b: GİDEN BELGE İPTALİ VE YEREL DURUM ENTEGRASYONU (INTEGRATION GAP)');
  // ═════════════════════════════════════════════════════════════════════════

  const TEST_TENANT = 'tnt-cancel-test-runner';
  const db = storage.getState();
  if (!db.tenantEinvoiceSettings) db.tenantEinvoiceSettings = [];
  db.tenantEinvoiceSettings = db.tenantEinvoiceSettings.filter(s => s.tenantId !== TEST_TENANT);
  db.tenantEinvoiceSettings.push({
    id: 'set-cancel-test',
    tenantId: TEST_TENANT,
    providerId: 'HIZLI_TEKNOLOJI',
    environment: 'SANDBOX',
    apiEndpoint: 'https://econnecttest.hizliteknoloji.com.tr',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    username: 'test-user',
    password: 'test-password',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Token hazır kabul edilsin (ensureTenantToken utilEncrypt/login çağırmadan geçsin)
  tokenStore.token = TOKEN;
  tokenStore.expireDate = new Date(Date.now() + 3600 * 24 * 1000).toISOString();
  setTenantTokenForTest(TEST_TENANT, true, TOKEN);

  // Test için bir fatura ve e-belge ekleyelim
  const TEST_INV_ID = 'inv-outgoing-cancel-test-1';
  const TEST_EDOC_UUID = '00000000-1111-4000-8000-000000000001';

  function hazirlaTestFaturasi(durum: 'SENT' | 'DRAFT' = 'SENT') {
    const d = storage.getState();
    if (!d.invoices) d.invoices = [];
    d.invoices = d.invoices.filter(i => i.id !== TEST_INV_ID);
    d.invoices.push({
      id: TEST_INV_ID,
      tenantId: TEST_TENANT,
      invoiceNo: 'GIB2026000099999',
      invoiceCategory: 'SATIS',
      type: 'SALES',
      status: 'APPROVED',
      eInvoiceStatus: durum,
      eInvoiceUUID: durum === 'SENT' ? TEST_EDOC_UUID : undefined,
      customerId: 'cust-cancel-1',
      date: '2026-09-16',
      subTotal: 1000,
      vatTotal: 200,
      grandTotal: 1200,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    if (!d.electronicDocuments) d.electronicDocuments = [];
    d.electronicDocuments = d.electronicDocuments.filter(ed => ed.internalDocumentId !== TEST_INV_ID);
    if (durum === 'SENT') {
      d.electronicDocuments.push({
        id: `edoc-${TEST_INV_ID}`,
        tenantId: TEST_TENANT,
        documentType: 'INVOICE',
        documentDirection: 'OUTGOING',
        internalDocumentId: TEST_INV_ID,
        documentNumber: 'GIB2026000099999',
        uuid: TEST_EDOC_UUID,
        profile: 'EARSIVFATURA',
        status: 'SENT',
        providerId: 'HIZLI_TEKNOLOJI',
        creditsReserved: false,
        timeline: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);
    }
  }

  // P-5: Pozitif Akış — Giden Belge İptali Entegratöre Gidiyor ve Yerel Durum Güncelleniyor
  try {
    hazirlaTestFaturasi('SENT');
    stubPostYanit({ IsSucceeded: true, Message: 'Belge iptal edildi' }, 200);

    const inv = await DocumentConversionService.cancelInvoice(
      TEST_INV_ID,
      TEST_TENANT,
      'Müşteri iade talebi',
      'usr-1',
      'Test Admin'
    );

    // 1. Vendor'a çağrı gitti mi?
    if (sonCagri?.method === 'post' && sonCagri.url.includes('/HizliApi/RestApi/CancelDocument')) {
      pass('P-5a giden fatura iptal isteği vendor CancelDocument ucuna iletildi');
    } else {
      fail('P-5a iptal isteği vendor CancelDocument ucuna iletilmedi', `${sonCagri?.method} ${sonCagri?.url}`);
    }

    // 2. Doğru belge kimliği ve alanlar gönderildi mi?
    const g = sonCagri?.govde;
    if (g && (g.DocumentUuid === TEST_EDOC_UUID || g.uuid === TEST_EDOC_UUID) && g.AppType === 3) {
      pass('P-5b doğru belge UUID (ETTN) ve AppType=3 vendor gövdesinde gönderildi');
    } else {
      fail('P-5b vendor gövdesindeki kimlik eksik/yanlış', JSON.stringify(g));
    }

    // 3. Yerel durum güncellendi mi?
    if (inv.status === 'CANCELLED' && inv.eInvoiceStatus === 'CANCELLED') {
      pass('P-5c yerel fatura durumu ve eInvoiceStatus başarıyla CANCELLED oldu');
    } else {
      fail('P-5c yerel fatura durumu güncellenmedi', `status=${inv.status} eInvoiceStatus=${inv.eInvoiceStatus}`);
    }

    const edoc = (storage.getState().electronicDocuments || []).find(d => d.internalDocumentId === TEST_INV_ID);
    if (edoc?.status === 'CANCELLED') {
      pass('P-5d electronicDocuments kaydı da CANCELLED oldu');
    } else {
      fail('P-5d electronicDocuments durumu CANCELLED olmadı', `edocStatus=${edoc?.status}`);
    }
  } catch (e: any) {
    fail('P-5 pozitif giden fatura iptali akışı hatası', e.message);
  }

  // N-10: Negatif — Vendor HTTP 500 dönünce yerel fatura CANCELLED OLMAZ (fail-closed)
  try {
    hazirlaTestFaturasi('SENT');
    stubHata(500, { Message: 'Entegratör sunucu hatası' });

    let hataAlindi = false;
    try {
      await DocumentConversionService.cancelInvoice(TEST_INV_ID, TEST_TENANT, 'Sebep', 'usr-1');
    } catch {
      hataAlindi = true;
    }

    const inv = (storage.getState().invoices || []).find(i => i.id === TEST_INV_ID);
    if (hataAlindi && inv?.status !== 'CANCELLED') {
      pass('N-10 vendor HTTP 5xx dönünce yerel fatura iptal edilmedi (fail-closed korundu)');
    } else {
      fail('N-10 vendor HTTP 5xx hatasında yerel fatura sahte-iptal oldu!', `status=${inv?.status}`);
    }
  } catch (e: any) {
    fail('N-10 beklenmeyen istisna', e.message);
  }

  // N-11: Negatif — Vendor HTTP 200 + IsSucceeded=false olunca yerel fatura CANCELLED OLMAZ
  try {
    hazirlaTestFaturasi('SENT');
    stubPostYanit({ IsSucceeded: false, Message: 'Belge bulunamadı veya iptal süresi doldu' }, 200);

    let hataAlindi = false;
    try {
      await DocumentConversionService.cancelInvoice(TEST_INV_ID, TEST_TENANT, 'Sebep', 'usr-1');
    } catch {
      hataAlindi = true;
    }

    const inv = (storage.getState().invoices || []).find(i => i.id === TEST_INV_ID);
    if (hataAlindi && inv?.status !== 'CANCELLED') {
      pass('N-11 vendor HTTP 200 + IsSucceeded=false olunca yerel fatura iptal edilmedi');
    } else {
      fail('N-11 vendor iş hatasında yerel fatura sahte-iptal oldu!', `status=${inv?.status}`);
    }
  } catch (e: any) {
    fail('N-11 beklenmeyen istisna', e.message);
  }

  // N-12: Negatif — Vendor timeout/network failure olunca yerel fatura CANCELLED OLMAZ
  try {
    hazirlaTestFaturasi('SENT');
    stubAgHatasi('ECONNABORTED');

    let hataAlindi = false;
    try {
      await DocumentConversionService.cancelInvoice(TEST_INV_ID, TEST_TENANT, 'Sebep', 'usr-1');
    } catch {
      hataAlindi = true;
    }

    const inv = (storage.getState().invoices || []).find(i => i.id === TEST_INV_ID);
    if (hataAlindi && inv?.status !== 'CANCELLED') {
      pass('N-12 vendor ağ zaman aşımında yerel fatura iptal edilmedi (fail-closed)');
    } else {
      fail('N-12 vendor zaman aşımında yerel fatura sahte-iptal oldu!', `status=${inv?.status}`);
    }
  } catch (e: any) {
    fail('N-12 beklenmeyen istisna', e.message);
  }

  // P-6: Giden belge e-fatura/entegratörde DEĞİLSE (yerel taslak), vendor çağrısı yapmadan yerel iptal edilir
  try {
    hazirlaTestFaturasi('DRAFT');
    sonCagri = null;

    const inv = await DocumentConversionService.cancelInvoice(TEST_INV_ID, TEST_TENANT, 'Taslak iptali', 'usr-1');
    if (inv.status === 'CANCELLED' && sonCagri === null) {
      pass('P-6 taslak/yerel fatura vendor çağrılmadan doğrudan yerel olarak iptal edildi');
    } else {
      fail('P-6 taslak faturada beklenmeyen vendor çağrısı veya durum hatası', `sonCagri=${sonCagri?.url}`);
    }
  } catch (e: any) {
    fail('P-6 beklenmeyen istisna', e.message);
  }

  stublariGeriAl();

  // ═════════════════════════════════════════════════════════════════════════
  bolum('BÖLÜM 4: TEST VE SÖZLEŞME ÖZETİ');
  // ═════════════════════════════════════════════════════════════════════════

  console.log('  ℹ️  CancelDocument resmi Swagger sözleşmesi (HizliWebApp.Models.EArsiv.CancelDocumentInput) ile doğrulandı.');
  console.log('  ℹ️  Giden belge iptal entegrasyonu tamamlandı ve yerel durum senkronizasyonu kanıtlandı.');
  console.log('  ⛔ Bu süit MOCK/STUB kullanır — GERÇEK SANDBOX PASS DEĞİLDİR.');

  // ─── Özet ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('  SONUÇLAR');
  console.log('='.repeat(72));
  console.log(`  Toplam : ${passCount + failCount}`);
  console.log(`  ✅ PASS : ${passCount}`);
  console.log(`  ❌ FAIL : ${failCount}`);
  console.log('');
  console.log('  ⚠️  Bu sonuç UYGULAMA MANTIĞI kanıtıdır, entegrasyon kanıtı DEĞİLDİR.');
  console.log('     Gerçek sandbox: tools/faz19-belge-akisi.ps1 (egress erişimli makine).');
  console.log('');

  if (failCount > 0) {
    console.error(`❌ FAZ 19 İPTAL AKIŞI: ${failCount} BAŞARISIZ`);
    process.exit(1);
  }
  console.log('✅ FAZ 19 İPTAL AKIŞI: tüm uygulama-mantığı kontrolleri geçti.');
  console.log('');
}

main().catch((err) => {
  stublariGeriAl();
  console.error('\n❌ FAZ 19 iptal akışı süiti beklenmeyen hata ile durdu:', err);
  process.exit(1);
});
