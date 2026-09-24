import assert from 'node:assert/strict';
import axios from 'axios';
import { HizliConnectService as H } from '../services/hizliConnectService';

const original = axios.get;
const calls: string[] = [];
let response: (url: string) => unknown;
axios.get = (async (url: string) => { calls.push(url); return { data: response(url) }; }) as typeof axios.get;
const vkn = '1681136628';
const user = (alias: string) => ({ Identifier: vkn, Title: 'Fixture company', Alias: alias });
try {
  response = url => ({ IsSucceeded: true, gibUserLists: [user(url.includes('Type=PK') ? 'urn:mail:pk@example.test' : 'urn:mail:gb@example.test')] });
  const result = await H.checkGibUser(vkn, 'fixture-token', true);
  assert.equal(result.success, true); assert.equal(result.isEInvoiceUser, true);
  assert.equal(result.aliasPk, 'urn:mail:pk@example.test'); assert.equal(result.aliasGb, 'urn:mail:gb@example.test');
  assert.equal(calls.length, 2); assert.ok(calls.every(u => u.includes('Identifier=' + vkn) && !u.includes('Type=VKN_TCKN')));
  response = () => ({ IsSucceeded: true, gibUserLists: [] });
  assert.equal((await H.checkGibUser(vkn, '', true)).isEInvoiceUser, false);
  for (const bad of [{ IsSucceeded: false, gibUserLists: [] }, {}, { IsSucceeded: true, gibUserLists: [null] },
    { IsSucceeded: true, gibUserLists: [{ ...user('urn:mail:pk@example.test'), Identifier: '1234567890' }] },
    { IsSucceeded: true, gibUserLists: [user('')] }]) {
    response = () => bad;
    assert.equal((await H.checkGibUser(vkn, '', true)).success, false);
  }
  response = url => { if (url.includes('Type=GB')) throw new Error('fixture outage'); return { IsSucceeded: true, gibUserLists: [] }; };
  assert.equal((await H.checkGibUser(vkn, '', true)).success, false);
  response = () => ({ IsSucceeded: true, gibUserLists: [user('urn:mail:first@example.test'), user('urn:mail:second@example.test')] });
  assert.equal((await H.checkGibUser(vkn, '', true)).aliasPk, '');
  response = () => ({ IsSucceeded: true, Prefix: ['BTE', 'BTF'] });
  assert.deepEqual((await H.getPrefixCodeList(1, '', true)).list, ['BTE', 'BTF']);
  response = () => ({ IsSucceeded: false, Prefix: ['BTE'] });
  assert.equal((await H.getPrefixCodeList(1, '', true)).success, false);
  response = () => ({ IsSucceeded: false, Message: 'Invalid prefix' });
  assert.equal((await H.getLastInvoiceIdAndDate(1, 'BTE', '', true)).success, false);
  response = () => ({ IsSucceeded: true, InvoiceId: 'BTE2026000000137', NextDocumentId: 'BTE2026000000138' });
  assert.equal((await H.getLastInvoiceIdAndDate(1, 'BTE2026', '', true)).success, true);
  console.log('PASS: mailbox query parameters, provider failures, company isolation, ambiguous aliases and prefix response contract.');
} finally { axios.get = original; }
