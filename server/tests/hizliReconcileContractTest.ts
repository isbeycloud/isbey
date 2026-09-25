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
 * Her senaryoda belge GÖNDERİLMEZ; yalnız `GetDocumentListGUID` sorgulanır.
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
    ...overrides,
  };
}

const originalPost = axios.post;
let calls: Array<{ url: string; payload: any }> = [];
let handler: (payload: any) => any = () => ({ IsSucceeded: true, documents: [] });

axios.post = (async (url: string, payload: any) => {
  calls.push({ url, payload });
  return { data: handler(payload) };
}) as typeof axios.post;

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
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'NOT_FOUND');
  assert.equal(out.newStatus, undefined);
  assert.equal(calls.length, 2, 'iki appType kapsamı da denenmeli');

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
    calls.push({ url, payload });
    return { data: { IsSucceeded: true, documents: [] } };
  }) as any;
  out = await reconcileSendingInvoice(invoice(), settings);
  assert.equal(out.result, 'NOT_FOUND', 'başarılı sorguda belge yoksa NOT_FOUND denebilir');
  assert.match(out.message, /sorgusu yapıldı/);

  console.log('PASS: SENDING mutabakatı — 1300→SENT; işlemde/bulunamadı/ETTN yok kaydı DEĞİŞTİRMEZ; sorgu yapılamazsa QUERY_FAILED (asla "yok" denmez); belge gönderilmez.');
} finally {
  axios.post = originalPost;
  invalidateTenant(settings.tenantId);
}
