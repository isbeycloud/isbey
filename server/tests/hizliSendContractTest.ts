import assert from 'node:assert/strict';
import axios from 'axios';
import { HizliConnectService as H } from '../services/hizliConnectService';
import { setTenantTokenForTest, invalidateTenant } from '../services/hizliTenantCredentialRegistry';
import { validateHizliSendResponse } from '../services/hizliSendContract';

const ok = { IsSucceeded: true };
for (const data of [undefined, {}, [], [null], [{ IsSucceeded: false }], [ok, { IsSucceeded: false }], [ok, ok]]) {
  assert.equal(validateHizliSendResponse(data, 1).success, false);
}
assert.equal(validateHizliSendResponse([ok], 1).success, true);
assert.equal(validateHizliSendResponse([ok, { IsSucceeded: false }], 2).success, false);
const originalPost = axios.post;
let calls = 0;
let answer: any = [ok];
let sent: any;
axios.post = (async (_url: string, payload: any, config: any) => {
  calls++; sent = structuredClone(payload);
  assert.equal(config.headers.Authorization, 'Bearer company-token');
  return { data: answer };
}) as typeof axios.post;
const settings = { tenantId: 'send-fixture', environment: 'TEST', senderIdentifier: '1681136628', senderAliasGB: 'urn:mail:fixture', defaultInvoicePrefix: 'BTF' } as any;
const customer = { taxNumber: '1234567890' };
const company = { taxNumber: settings.senderIdentifier };
const invoice = { tenantId: settings.tenantId, status: 'DRAFT', hizliModel: {
  invoiceheader: { Prefix: 'BTF', Invoice_ID: 'Otomatik' }, customer: { IdentificationID: customer.taxNumber },
  supplier: { supplierParty: { IdentificationID: company.taxNumber } }, invoiceLines: [{ Item_Name: 'Fixture' }],
} };
try {
  setTenantTokenForTest(settings.tenantId, true, 'company-token');
  assert.equal((await H.sendInvoice(invoice, customer, company, { tenantSettings: settings }, 'wrong-global-token')).success, true);
  assert.equal(sent[0].invoiceheader.Prefix, 'BTF');
  assert.equal(sent[0].invoiceheader.Invoice_ID, null);
  assert.equal(sent[0].invoiceheader.SourceUrn, settings.senderAliasGB);
  assert.equal(sent[0].tenantId, undefined);
  assert.equal(invoice.hizliModel.invoiceheader.Invoice_ID, 'Otomatik');
  for (const inv of [{ ...invoice, tenantId: 'other' }, { ...invoice, hizliModel: undefined },
    { ...invoice, status: 'CANCELLED' }, { ...invoice, eInvoiceStatus: 'SENT' }]) {
    const before = calls;
    assert.equal((await H.sendInvoice(inv, customer, company, { tenantSettings: settings })).success, false);
    assert.equal(calls, before);
  }
  answer = [{ IsSucceeded: false, Message: 'Rejected' }];
  assert.equal((await H.sendInvoiceModel([invoice.hizliModel], 'company-token', true)).success, false);
  assert.equal((await H.sendDocument([{ XmlContent: '<Invoice/>', DestinationIdentifier: customer.taxNumber }], 'company-token', true)).success, false);
  console.log('PASS: provider acceptance, partial/malformed responses, model payload, tenant token and resend rejection.');
} finally { axios.post = originalPost; invalidateTenant(settings.tenantId); }
