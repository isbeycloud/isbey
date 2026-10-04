import assert from 'node:assert/strict';
import { HizliDealerPortal } from '../services/hizliBilisim/hizliDealerPortal';

const requests: { url: string; init: RequestInit }[] = [];
let mode = 'good';
const transport = (async (url: string, init: RequestInit) => {
  requests.push({ url, init });
  if (url.includes('/User/VerificationUser?')) return new Response('<form action="/User/VerificationUserCheck"><input name="__RequestVerificationToken" value="otp-csrf" /><input name="dogrulamakod" /><select name="dogrulamatip" id="dogrulamatip"><option value="EMAIL">E-posta</option></select></form>');
  if (url.endsWith('/User/VerificationUserCheck')) return new Response('', { status: 302, headers: { Location: '/Home/Index' } });
  if (url.endsWith('/User/Login')) return new Response('<input name="__RequestVerificationToken" value="test-csrf" />', { headers: { 'Set-Cookie': 'csrf=test-cookie; HttpOnly' } });
  if (url.endsWith('/User/UserCheck')) return new Response('', { status: 302, headers: { Location: mode === 'bad-login' ? '/User/Login' : mode === 'otp' ? '/User/VerificationUser?verificationType=EMAIL' : '/Home/Index', 'Set-Cookie': 'session=test-session; HttpOnly' } });
  assert.ok(url.endsWith('/AdminPanel/CustomerList'));
  if (mode === 'html') return new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } });
  return Response.json(mode === 'malformed' ? { data: [], recordsTotal: 'unknown' } : { data: [{ FirmaId: 42, VergiNoTCKimlikNo: '0012345678', FirmaAdi: 'Test müşteri', AktifPasif: true, Bayi: 'Test bayi' }], recordsTotal: 1273, recordsFiltered: 1 });
}) as typeof fetch;
const create = () => new HizliDealerPortal(transport, { username: 'test', password: 'test-password' });
const result = await create().list(0, 25, 'Test');
assert.equal(result.total, 1273); assert.equal(result.customers[0].taxNumber, '0012345678');
assert.equal(result.customers[0].isActive, true); assert.equal(JSON.stringify(result).includes('test-password'), false);
const login = requests[1]; const form = new URLSearchParams(String(login.init.body));
assert.equal(form.get('__RequestVerificationToken'), 'test-csrf'); assert.equal(form.get('username'), 'test');
assert.match((login.init.headers as Record<string, string>).Cookie, /csrf=test-cookie/);
const query = requests[2]; assert.match((query.init.headers as Record<string, string>).Cookie, /session=test-session/);
const body = new URLSearchParams(String(query.init.body)); assert.equal(body.get('start'), '0'); assert.equal(body.get('length'), '25'); assert.equal(body.get('MusteriAdi'), 'Test');
assert.equal(body.get('Bayi'), ''); // Account scope is established by the authenticated portal session.
assert.equal(query.init.redirect, 'manual');
for (const invalid of [-1, 0.5]) await assert.rejects(() => create().list(invalid));
await assert.rejects(() => create().list(0, 101));
for (mode of ['bad-login', 'html', 'malformed']) await assert.rejects(() => create().list());
await assert.rejects(() => new HizliDealerPortal(transport, { username: '', password: '' }).list());
mode = 'otp';
const portal = create();
assert.equal((await portal.authenticate()).verificationRequired, true);
await assert.rejects(() => portal.list(), /PORTAL_VERIFICATION_REQUIRED/);
assert.equal((await portal.authenticate('123456')).verificationRequired, false);
assert.equal((await portal.list()).total, 1273);
const verifyRequest = requests.find(r => r.url.endsWith('/VerificationUserCheck'))!;
assert.equal(new URLSearchParams(String(verifyRequest.init.body)).get('__RequestVerificationToken'), 'otp-csrf');
assert.equal(new URLSearchParams(String(verifyRequest.init.body)).get('dogrulamakod'), '123456');
assert.equal(new URLSearchParams(String(verifyRequest.init.body)).get('dogrulamatip'), 'EMAIL');
const expiredPortal = create();
await expiredPortal.authenticate();
const originalNow = Date.now;
const requestCount = requests.length;
try {
  const future = originalNow() + 3 * 60_000 + 1;
  Date.now = () => future;
  await assert.rejects(() => expiredPortal.authenticate('123456'), /süresi geçersiz/);
  assert.equal(requests.length, requestCount, 'Expired verification must not be sent to the provider');
} finally { Date.now = originalNow; }
console.log('Dealer portal: authentication, cookies, paging, malformed response checks PASS');
