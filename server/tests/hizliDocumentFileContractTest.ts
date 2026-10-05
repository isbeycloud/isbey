import assert from 'node:assert/strict';
import axios from 'axios';
import { HizliConnectService } from '../services/hizliConnectService';

const original = axios.get;
const xml = '<Invoice><UUID>test-uuid</UUID></Invoice>';
let scenario: 'ok' | 'invalid-token' | 'http-401' | 'not-found' = 'ok';
axios.get = (async (url: string) => {
  assert.equal(new URL(url).searchParams.get('AppType'), '2');
  if (scenario === 'http-401') throw { response: { status: 401, data: { Message: 'Unauthorized' } } };
  if (scenario === 'invalid-token') return { data: { IsSucceeded: false, Message: 'Geçersiz Token! Lütfen tekrar giriş yapınız!' } };
  if (scenario === 'not-found') return { data: { IsSucceeded: false, Message: 'İlgili belge bulunamadı!' } };
  return { data: { IsSucceeded: true, DocumentFile: Buffer.from(xml).toString('base64') } };
}) as typeof axios.get;
try {
  const read = () => HizliConnectService.getDocumentFile(2, 'test-uuid', 'XML', false, 'fixture-token', true);
  assert.equal((await read()).content, xml);
  scenario = 'invalid-token'; const expired = await read(); assert.equal(expired.success, false); assert.equal(expired.error, 401);
  scenario = 'http-401'; assert.equal((await read()).error, 401);
  scenario = 'not-found'; const missing = await read(); assert.equal(missing.success, false); assert.equal(missing.error, undefined);
  console.warn('hizliDocumentFileContractTest: özgün XML, HTTP/iş token hatası ve belge bulunamadı ayrımı PASS.');
} finally { axios.get = original; }
