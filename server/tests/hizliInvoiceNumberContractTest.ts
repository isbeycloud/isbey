import assert from 'node:assert/strict';
import axios from 'axios';
import { HizliConnectService as H } from '../services/hizliConnectService';
import { setTenantTokenForTest, invalidateTenant } from '../services/hizliTenantCredentialRegistry';

/**
 * BELGE NUMARASI SÖZLEŞME TESTİ — 2026-09-25
 * ==========================================================================
 * Canlıda pilot fatura şu hatayla reddedilmişti:
 *   "(DocumentUUID: ...) Fatura Belge No Zorunludur! Gönderim İşlemi Durduruldu!"
 *
 * Kök neden: `Invoice_ID === 'Otomatik'` iken alan `null` gönderiliyordu.
 * "Otomatik" bir ARAYÜZ etiketidir; resmî belge numarası değildir ve
 * sağlayıcı bu alanı ZORUNLU tutar.
 *
 * Bu test üç kuralı kilitler:
 *   1. Numara sağlayıcının KENDİ sırasından okunur (NextDocumentId) — UYDURULMAZ.
 *   2. Seri, yıl içerir (ör. BTF2026) ve yıl faturanın düzenlenme tarihinden alınır.
 *   3. Numara alınamazsa GÖNDERİM YAPILMAZ (sıra dışı numara üretmek yasak).
 *
 * Her senaryoda gerçek gönderim çağrısı sayılır; başarısız senaryolarda
 * sağlayıcıya HİÇ belge gitmemelidir.
 */

const originalPost = axios.post;
const originalGet = axios.get;

let postCalls: Array<{ url: string; payload: any }> = [];
let getCalls: string[] = [];
let answer: any = [{ IsSucceeded: true }];

axios.post = (async (url: string, payload: any) => {
  postCalls.push({ url, payload });
  return { data: answer };
}) as typeof axios.post;

const settings = {
  tenantId: 'belgeno-fixture',
  environment: 'TEST',
  senderIdentifier: '1681136628',
  senderAliasGB: 'urn:mail:fixture',
  defaultInvoicePrefix: 'BTF',
} as any;

const company = { taxNumber: settings.senderIdentifier };
const customer = { taxNumber: '15512014278' };

function invoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-fixture',
    tenantId: settings.tenantId,
    status: 'DRAFT',
    invoiceNo: 'SAT-2026-000001',
    hizliModel: {
      invoiceheader: {
        Prefix: 'BTF',
        Invoice_ID: 'Otomatik',
        IssueDate: '2026-09-25',
        UUID: '7e03cd4b-03db-4d36-a389-642af1700927',
        DestinationUrn: 'urn:mail:defaultpk@gmail.com',
      },
      customer: { IdentificationID: customer.taxNumber },
      supplier: { supplierParty: { IdentificationID: company.taxNumber } },
      invoiceLines: [{ Item_Name: 'Fixture' }],
    },
    ...overrides,
  };
}

/** GetLastInvoiceIdAndDate yanıtını taklit eder (yalnız o uç için). */
function sonBelgeYaniti(nextDocumentId: string | undefined, basarili = true) {
  axios.get = (async (url: string) => {
    getCalls.push(url);
    if (!url.includes('GetLastInvoiceIdAndDate')) throw new Error(`Beklenmeyen GET: ${url}`);
    if (basarili && nextDocumentId) {
      return { data: { InvoiceId: nextDocumentId, NextDocumentId: nextDocumentId, IsSucceeded: true, Message: 'Başarılı' } };
    }
    return { data: { IsSucceeded: false, Message: 'Ön ek geçerli formatta değildir. (Örnek: ABC2025)!' } };
  }) as typeof axios.get;
}

try {
  setTenantTokenForTest(settings.tenantId, true, 'company-token');

  // ---- 1) 'Otomatik' → sağlayıcının sıradaki numarası yazılır -------------
  postCalls = []; getCalls = [];
  sonBelgeYaniti('BTF2026000000143');
  let sonuc = await H.sendInvoice(invoice(), customer, company, { tenantSettings: settings });
  assert.equal(sonuc.success, true, 'sağlayıcı kabul edince gönderim başarılı olmalı');
  assert.equal(postCalls.length, 1, 'tek belge gönderilmeli');
  const gonderilen = postCalls[0].payload[0].InvoiceModel.invoiceheader;
  assert.equal(gonderilen.Invoice_ID, 'BTF2026000000143', 'UYDURMA değil, sağlayıcının verdiği numara yazılmalı');
  assert.equal(gonderilen.Prefix, 'BTF', 'önek firma serisinden gelmeli (yıl EKLENMEZ)');

  // ---- 2) Seri yıl içermeli; yıl faturanın IssueDate'inden alınır ----------
  assert.equal(getCalls.length, 1, 'sıradaki numara için tek sorgu yapılmalı');
  assert.match(getCalls[0], /Seri=BTF2026/, 'seri prefix + fatura yılı olmalı (BTF2026)');

  // ---- 3) Farklı yılda farklı seri sorulur ---------------------------------
  postCalls = []; getCalls = [];
  sonBelgeYaniti('BTF2025000000286');
  const eskiYil = invoice();
  eskiYil.hizliModel.invoiceheader.IssueDate = '2025-08-05';
  sonuc = await H.sendInvoice(eskiYil, customer, company, { tenantSettings: settings });
  assert.equal(sonuc.success, true);
  assert.match(getCalls[0], /Seri=BTF2025/, 'yıl IssueDate ile değişmeli');
  assert.equal(postCalls[0].payload[0].InvoiceModel.invoiceheader.Invoice_ID, 'BTF2025000000286');

  // ---- 4) Numara ALINAMAZSA gönderim YAPILMAZ -----------------------------
  postCalls = []; getCalls = [];
  sonBelgeYaniti(undefined, false);
  sonuc = await H.sendInvoice(invoice(), customer, company, { tenantSettings: settings });
  assert.equal(sonuc.success, false, 'numara alınamazsa gönderim başarısız olmalı');
  assert.equal(postCalls.length, 0, 'belge sağlayıcıya GİTMEMELİ (sıra dışı numara üretmek yasak)');
  assert.match(sonuc.message, /Belge numarası sağlayıcıdan alınamadı/);
  assert.match(sonuc.message, /seri: BTF2026/, 'hata mesajı hangi serinin arandığını söylemeli');

  // ---- 5) Sağlayıcı boş NextDocumentId dönerse de gönderim YAPILMAZ -------
  postCalls = [];
  axios.get = (async (url: string) => {
    getCalls.push(url);
    return { data: { IsSucceeded: true, NextDocumentId: '   ' } };
  }) as typeof axios.get;
  sonuc = await H.sendInvoice(invoice(), customer, company, { tenantSettings: settings });
  assert.equal(sonuc.success, false, 'boş numara kabul edilmemeli');
  assert.equal(postCalls.length, 0, 'boş numarayla belge gönderilmemeli');

  // ---- 6) GERÇEK numara varsa ona DOKUNULMAZ ------------------------------
  // Kullanıcı numarayı elle verdiyse sağlayıcıya sorulmaz, numara korunur.
  postCalls = []; getCalls = [];
  sonBelgeYaniti('BASKABIRNUMARA');
  const elle = invoice();
  elle.hizliModel.invoiceheader.Invoice_ID = 'BTF2026000000123';
  sonuc = await H.sendInvoice(elle, customer, company, { tenantSettings: settings });
  assert.equal(sonuc.success, true);
  assert.equal(getCalls.length, 0, 'gerçek numara varken sağlayıcıya sorulmamalı');
  assert.equal(postCalls[0].payload[0].InvoiceModel.invoiceheader.Invoice_ID, 'BTF2026000000123', 'elle verilen numara değiştirilmemeli');

  // ---- 7) Kayıtlı model DEĞİŞTİRİLMEZ (immutability) ----------------------
  const sadeceOku = invoice();
  sonBelgeYaniti('BTF2026000000199');
  await H.sendInvoice(sadeceOku, customer, company, { tenantSettings: settings });
  assert.equal(sadeceOku.hizliModel.invoiceheader.Invoice_ID, 'Otomatik', 'kayıtlı model mutasyona uğratılmamalı');

  console.log('PASS: Belge numarası sağlayıcının sırasından alınır (prefix+yıl); numara yoksa gönderim YAPILMAZ; elle verilen numara korunur.');
} finally {
  axios.post = originalPost;
  axios.get = originalGet;
  invalidateTenant(settings.tenantId);
}
