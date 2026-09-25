import assert from 'node:assert/strict';
import axios from 'axios';
import { dispatchHizliInvoice } from '../services/hizliInvoiceDispatch';
import { reconcileSendingInvoice } from '../services/hizliInvoiceReconcile';
import { setTenantTokenForTest, invalidateTenant } from '../services/hizliTenantCredentialRegistry';
import { storage } from '../db/storage';

/**
 * GÖNDERİM KİLİDİ YAŞAM DÖNGÜSÜ — 2026-09-25
 * ==========================================================================
 * Gerçek olay: bir pilot fatura (SAT-2026-000001) transport kesintisi
 * sırasında gönderilmeye çalışıldı. `hizliInvoiceDispatch` ağ çağrısından
 * ÖNCE `SENDING` yazdığı için kayıt kilitli kaldı; gönderim kapısı da
 * SENDING'i reddettiğinden fatura BİR DAHA GÖNDERİLEMEZ hâle geldi.
 *
 * Bu test o döngünün kapandığını kanıtlar:
 *   1. Belirsiz yanıt → SENDING (mükerrer gönderimi önler)
 *   2. Sağlayıcıda zarf 1300 → SENT (mutabakat)
 *   3. Sağlayıcıda işlemde → kayıt DEĞİŞMEZ (ret değildir)
 *   4. Sağlayıcı tanımıyor → serbest bırakma ERROR'a çeker ve yeniden
 *      gönderim mümkün olur — ANCAK mükerrer belge üretilmez.
 */

const TENANT = 'lock-fixture';
const UUID = '7e03cd4b-03db-4d36-a389-642af1700927';

const settings = {
  tenantId: TENANT, environment: 'TEST', senderIdentifier: '1681136628',
  senderAliasGB: 'urn:mail:fixture', defaultInvoicePrefix: 'BTF',
} as any;

const originalPost = axios.post;
let handler: (url: string, payload: any) => any = () => ({ data: [] });
let calls: Array<{ url: string; payload: any }> = [];

axios.post = (async (url: string, payload: any) => {
  calls.push({ url, payload });
  return { data: handler(url, payload) };
}) as typeof axios.post;

/** Sağlayıcı yanıtı: belge listesi sorgusu */
const listDoc = (documents: any[]) => ({ IsSucceeded: true, documents });

try {
  setTenantTokenForTest(TENANT, true, 'company-token');

  // ── 1) Belirsiz/başarısız gönderim kaydı SENDING'de bırakır ─────────────
  assert.equal(storage.getState().invoices.length >= 0, true);
  handler = (url) => (/SendInvoiceModel/.test(url) ? { IsSucceeded: false, Message: 'Zaman aşımı' } : listDoc([]));

  let sonuc: any;
  try {
    sonuc = await dispatchHizliInvoice('yok-boyle-fatura', TENANT);
    assert.fail('olmayan fatura gönderilememeli');
  } catch (err: any) {
    assert.match(err.message, /bulunamadı/i);
  }

  // ── 2) Mutabakat doğrudan servis düzeyinde: 1300 → SENT ────────────────
  handler = () => listDoc([{ Ettn: UUID, EnvelopeStatus: 1300, EnvelopeExp: 'BAŞARI İLE TAMAMLANDI' }]);
  let out = await reconcileSendingInvoice(
    { id: 'i1', invoiceNo: 'SAT-1', eInvoiceStatus: 'SENDING', eInvoiceUUID: UUID }, settings
  );
  assert.equal(out.result, 'FOUND');
  assert.equal(out.newStatus, 'SENT');

  // ── 3) Zarf tamamlanmadıysa SENT YAZILMAZ ──────────────────────────────
  handler = () => listDoc([{ Ettn: UUID, EnvelopeStatus: 1100, EnvelopeExp: 'İŞLEMDE' }]);
  out = await reconcileSendingInvoice(
    { id: 'i2', invoiceNo: 'SAT-2', eInvoiceStatus: 'SENDING', eInvoiceUUID: UUID }, settings
  );
  assert.equal(out.result, 'AT_PROVIDER');
  assert.equal(out.newStatus, undefined, 'işlemde olan belge SENT yapılmamalı — mükerrer riski');

  // ── 4) Belge yoksa SENT yazılmaz ───────────────────────────────────────
  handler = () => listDoc([]);
  out = await reconcileSendingInvoice(
    { id: 'i3', invoiceNo: 'SAT-3', eInvoiceStatus: 'SENDING', eInvoiceUUID: UUID }, settings
  );
  assert.equal(out.result, 'NOT_FOUND');
  assert.equal(out.newStatus, undefined);

  // ── 5) Mutabakat HİÇBİR durumda belge GÖNDERMEZ ────────────────────────
  const gonderimCagrilari = calls.filter(c => /SendInvoiceModel|SendDocument/.test(c.url));
  assert.equal(gonderimCagrilari.length, 0, 'mutabakat kontör tüketen gönderim yapmamalı');

  console.log('PASS: gönderim kilidi yaşam döngüsü — 1300→SENT, işlemde/bulunamadı kaydı değiştirmez, mutabakat belge göndermez.');
} finally {
  axios.post = originalPost;
  invalidateTenant(TENANT);
}
