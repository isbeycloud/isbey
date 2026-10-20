import assert from 'node:assert/strict';
import axios from 'axios';
import { reconcileSendingInvoice } from '../services/hizliInvoiceReconcile';
import { setTenantTokenForTest, invalidateTenant } from '../services/hizliTenantCredentialRegistry';

/**
 * SENDING MUTABAKAT SÖZLEŞME TESTİ — 2026-09-25
 * ==========================================================================
 * Kilitli (SENDING) bir faturanın sağlayıcıyla mutabakatı, CLAUDE.md md.1
 * gereği "gerçek hata / gerçek durum" ilkesine uymalıdır:
 *
 *   - Zarf GİB'e iletildiyse (1300)  → SENT yazılır.
 *   - Belge kayıtlı ama zarf bitmedi → kayıt DEĞİŞTİRİLMEZ (ret değildir!).
 *   - Belge bulunamadı               → kayıt DEĞİŞTİRİLMEZ.
 *   - ETTN yok                       → hiç sorgu yapılmaz, kayıt değiştirilmez.
 *
 * Her senaryoda belge GÖNDERİLMEZ; yalnız `GetDocumentListGUID` ve (GUID
 * bulamazsa) `GetDocumentList` sorgulanır.
 *
 * ── 2026-10-20: 11. SENARYO CANLI ÖLÇÜMLE EKLENDİ ───────────────────────────
 * GUID ucu `guids` filtresini uygulamıyor ve yalnız çok yakın tarihli bir alt
 * küme döndürüyor. Bu yüzden "GUID'de yok" ≠ "sağlayıcıda yok". Canlıda tam
 * bu oldu: SAT-2026-000001 GUID ucunda görünmedi, tarih aralıklı listede
 * BULUNDU (zarf 1300). Eski kod ikisini eşitliyordu → belge GİB'e iletilmişken
 * "yok" deyip SENDING kilidini açtırıyordu (mükerrer fatura riski).
 */

const UUID = '7e03cd4b-03db-4d36-a389-642af1700927';

const settings = {
  tenantId: 'reconcile-fixture',
  environment: 'TEST',
  senderIdentifier: '1681136628',
  senderAliasGB: 'urn:mail:fixture',
  defaultInvoicePrefix: 'BTF',
} as any;

function invoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-fixture',
    tenantId: settings.tenantId,
    invoiceNo: 'SAT-2026-000001',
    eInvoiceStatus: 'SENDING',
    eInvoiceUUID: UUID,
    // Tarih ZORUNLU: aralık taraması faturanın kendi tarihinden kurulur.
    // Verilmezse ikinci (kesin) doğrulama yolu hiç denenmez.
    date: '2026-09-25',
    ...overrides,
  };
}

const originalPost = axios.post;
const originalGet = axios.get;
let calls: Array<{ url: string; payload: any; method: string }> = [];
let handler: (payload: any) => any = () => ({ IsSucceeded: true, documents: [] });
// GUID ucunun döndürdüğü liste (uç filtre uygulamıyor → alakasız belgeler)
let guidHandler: (payload: any) => any = (payload) => handler(payload);
// GetDocumentList (tarih aralıklı) yanıtı
let listHandler: (params: any) => any = () => ({ success: true, documents: [] });

axios.post = (async (url: string, payload: any) => {
  calls.push({ url, payload, method: 'POST' });
  return { data: guidHandler(payload) };
}) as typeof axios.post;

axios.get = (async (url: string) => {
  calls.push({ url, payload: null, method: 'GET' });
  return { data: listHandler(url) };
}) as typeof axios.get;

try {
  setTenantTokenForTest(settings.tenantId, true, 'company-token');

  // ---- 1) Zarf GİB'e iletildi → SENT yazılır -------------------------------
  calls = [];
  handler = () => ({
    IsSucceeded: true,
    documents: [{ Ettn: UUID, EnvelopeStatus: 1300, EnvelopeExp: 'BAŞARI İLE TAMAMLANDI' }],
  });
  let out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'FOUND');
  assert.equal(out.newStatus, 'SENT');
  assert.equal(out.previousStatus, 'SENDING');
  assert.equal(out.gibStatus, '1300');
  assert.match(out.message, /BAŞARI İLE TAMAMLANDI/);
  assert.equal(calls.length, 1, 'bulunduğunda ikinci appType denenmemeli');
  assert.match(calls[0].url, /GetDocumentListGUID$/);
  assert.deepEqual(calls[0].payload.guids, [UUID]);

  // ---- 2) Belge kayıtlı ama zarf TAMAMLANMADI → kayıt değişmez ------------
  calls = [];
  handler = () => ({
    IsSucceeded: true,
    documents: [{ Ettn: UUID, EnvelopeStatus: 1100, EnvelopeExp: 'İŞLEMDE' }],
  });
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'AT_PROVIDER');
  assert.equal(out.newStatus, undefined, 'işlemde olan belge SENT yapılmamalı');
  assert.equal(out.previousStatus, 'SENDING');
  assert.equal(out.gibStatus, '1100');

  // ---- 3) Sağlayıcı belgeyi tanımıyor → kayıt değişmez --------------------
  calls = [];
  handler = () => ({ IsSucceeded: true, documents: [] });
  listHandler = () => ({ success: true, documents: [] });
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'NOT_FOUND');
  assert.equal(out.newStatus, undefined);
  const guidCalls = calls.filter(c => /GetDocumentListGUID$/.test(c.url));
  assert.equal(guidCalls.length, 2, 'iki appType kapsamı da denenmeli');
  const listCalls = calls.filter(c => /GetDocumentList\?/.test(c.url));
  assert.equal(listCalls.length, 2, 'GUID bulamayınca tarih aralıklı liste de taranmalı');

  // ---- 4) Yanlış belge döndüyse KABUL EDİLMEZ -----------------------------
  // Uç `guids` filtresini uygulamazsa başka bir belge gelebilir; onu "bizim
  // belgemiz" sanmak uydurma olurdu.
  handler = () => ({
    IsSucceeded: true,
    documents: [{ Ettn: 'baska-bir-ettn', EnvelopeStatus: 1300 }],
  });
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'NOT_FOUND', 'başka belgenin sonucu bize yazılmamalı');

  // ---- 5) IsSucceeded !== true → "yok" DEĞİL, sorgu doğrulanmadı ---------
  handler = () => ({ IsSucceeded: false, Message: 'Yetkisiz işlem' });
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'QUERY_FAILED', 'doğrulanmayan sorgu "belge yok" sayılamaz');
  assert.match(out.message, /Yetkisiz işlem/);

  // ---- 6) ETTN yoksa HİÇ sorgu yapılmaz -----------------------------------
  calls = [];
  out = await reconcileSendingInvoice(invoice({ eInvoiceUUID: null }), settings);
  assert.equal(out.result, 'NO_UUID');
  assert.equal(calls.length, 0, 'ETTN yokken sağlayıcıya sorgu gidilmemeli');

  // ---- 7) eInvoiceUUID boşsa sağlayıcı modelindeki ETTN kullanılır --------
  // Gönderim kesintiye uğradığında `eInvoiceUUID` henüz yazılmamış olabilir.
  handler = () => ({
    IsSucceeded: true,
    documents: [{ Ettn: UUID, EnvelopeStatus: 1300, EnvelopeExp: 'BAŞARI İLE TAMAMLANDI' }],
  });
  out = await reconcileSendingInvoice(
    invoice({ eInvoiceUUID: null, hizliModel: { invoiceheader: { UUID } } }),
    settings
  );
  assert.equal(out.result, 'FOUND');
  assert.equal(out.newStatus, 'SENT');

  // ---- 8) Sağlayıcıya ULAŞILAMIYORSA "belge yok" DENEMEZ -------------------
  // Bu ayrım kritiktir: sorgu yapılamadıysa belge gönderilmiş olabilir.
  // "NOT_FOUND" demek, serbest bırakma ucunu açıp MÜKERRER fatura ürettirir.
  calls = [];
  axios.post = (async (url: string, payload: any) => {
    calls.push({ url, payload });
    throw new Error('socket hang up');
  }) as any;
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'QUERY_FAILED', 'ağ hatası "belge yok" sayılmamalı');
  assert.notEqual(out.result, 'NOT_FOUND');
  assert.equal(out.newStatus, undefined);
  assert.match(out.message, /socket hang up/);

  // ---- 9) Sağlayıcı IsSucceeded=false dönerse de "yok" DENEMEZ -----------
  axios.post = (async (url: string, payload: any) => {
    calls.push({ url, payload });
    return { data: { IsSucceeded: false, Message: 'Yetkisiz işlem' } };
  }) as any;
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'QUERY_FAILED', 'doğrulanmamış sorgu cevabı "yok" sayılmamalı');
  assert.match(out.message, /Yetkisiz işlem/);

  // ---- 10) Başarılı sorgu + belge yok = GERÇEKTEN NOT_FOUND --------------
  axios.post = (async (url: string, payload: any) => {
    calls.push({ url, payload, method: 'POST' });
    return { data: { IsSucceeded: true, documents: [] } };
  }) as any;
  axios.get = (async (url: string) => {
    calls.push({ url, payload: null, method: 'GET' });
    return { data: { success: true, documents: [] } };
  }) as any;
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'NOT_FOUND', 'İKİ uç da başarılı ve belge yoksa NOT_FOUND denebilir');
  assert.match(out.message, /sorgusu yapıldı/);

  // ---- 11) CANLI VAKA: GUID ucu bulamaz, tarih aralıklı liste BULUR --------
  // 2026-10-20 ölçümü: `GetDocumentListGUID` `guids` filtresini uygulamıyor ve
  // yalnız yakın tarihli alt kümeyi döndürüyor. SAT-2026-000001 (ETTN
  // 7e03cd4b…) GUID ucunda YOKTU ama tarih aralıklı listede VARDI (zarf 1300).
  // Eski kod bu durumda NOT_FOUND deyip SENDING kilidini açtırıyordu →
  // belge GİB'e iletilmişken yeniden gönderim = MÜKERRER FATURA.
  calls = [];
  axios.post = (async (url: string, payload: any) => {
    calls.push({ url, payload, method: 'POST' });
    // Uç filtre uygulamıyor: alakasız belgeler dönüyor, aranan YOK.
    return { data: { IsSucceeded: true, documents: [{ UUID: 'baska-belge-1' }, { UUID: 'baska-belge-2' }] } };
  }) as any;
  axios.get = (async (url: string) => {
    calls.push({ url, payload: null, method: 'GET' });
    // Tarih aralıklı liste aranan belgeyi İÇERİYOR.
    if (/AppType=2/.test(url)) {
      return { data: { success: true, documents: [{ UUID: UUID, EnvelopeStatus: 1300, EnvelopeExp: 'BAŞARI İLE TAMAMLANDI', Status: 12 }] } };
    }
    return { data: { success: true, documents: [] } };
  }) as any;
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'FOUND', 'GUID bulamasa bile LIST bulursa belge VARDIR');
  assert.equal(out.newStatus, 'SENT');
  assert.equal(out.gibStatus, '1300');
  assert.ok(calls.some(c => /GetDocumentList\?/.test(c.url)), 'tarih aralıklı liste sorgulanmalı');
  assert.ok(calls.some(c => /StartDate=2026-08-11/.test(c.url)), 'aralık faturanın KENDİ tarihinden kurulmalı');

  // ---- 12) Tarih yoksa aralık taraması yapılmaz (uydurma tarih ÜRETİLMEZ) --
  calls = [];
  out = await reconcileSendingInvoice(invoice({ date: undefined, issueDate: undefined, createdAt: undefined }), settings);
  assert.equal(out.result, 'NOT_FOUND');
  assert.equal(calls.filter(c => /GetDocumentList\?/.test(c.url)).length, 0, 'tarih yokken aralık uydurulmamalı');

  // ---- 13) GUID "yok" + LIST sorgusu HATA = "yok" DEĞİL -------------------
  // Belge gönderilmiş olabilir; doğrulanamayan ikinci yol "yok" kanıtı sayılamaz.
  axios.post = (async (url: string, payload: any) => {
    calls.push({ url, payload, method: 'POST' });
    return { data: { IsSucceeded: true, documents: [] } };
  }) as any;
  axios.get = (async (url: string) => {
    calls.push({ url, payload: null, method: 'GET' });
    throw new Error('liste alınamadı');
  }) as any;
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'QUERY_FAILED', 'doğrulanamayan liste "belge yok" sayılamaz');
  assert.match(out.message, /yok" sayılamaz|sayılamaz/);

  console.log('PASS: SENDING mutabakatı — 1300→SENT; işlemde/bulunamadı/ETTN yok kaydı DEĞİŞTİRMEZ; GUID bulamazsa tarih aralıklı liste taranır (13/13 canlı vaka); sorgu yapılamazsa QUERY_FAILED (asla "yok" denmez); belge gönderilmez.');
} finally {
  axios.post = originalPost;
  axios.get = originalGet;
  invalidateTenant(settings.tenantId);
}
