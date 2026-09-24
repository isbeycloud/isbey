import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.HIZLI_BILISIM_ALLOW_PROD = 'false';
const { HizliConnectService } = await import('../services/hizliConnectService');
const { resolveTenantWsCredentials, ensureTenantToken, setTenantTokenForTest } = await import('../services/hizliTenantCredentialRegistry');
const settings: any = { tenantId: 'firm-a', senderIdentifier: '1234567890' };
assert.throws(() => HizliConnectService.getBaseUrl(false), /kilidi kapalı/);
assert.match(HizliConnectService.getBaseUrl(true), /econnecttest/);
setTenantTokenForTest(settings.tenantId, false, 'cached-token');
await assert.rejects(ensureTenantToken(settings, false), /kilidi kapalı/);
process.env.HIZLI_BILISIM_WS_USERNAME = 'fixture-user';
process.env.HIZLI_BILISIM_WS_PASSWORD = 'fixture-password';
process.env.HIZLI_BILISIM_API_KEY = 'fixture-key';
process.env.HIZLI_BILISIM_SECRET_KEY = 'fixture-secret';
process.env.HIZLI_BILISIM_VKN = '1234567891';
assert.throws(() => resolveTenantWsCredentials(settings), /bu firmaya ait değil/);
process.env.HIZLI_BILISIM_VKN = settings.senderIdentifier;
assert.equal(resolveTenantWsCredentials(settings).source, 'env-default-firm');
delete process.env.HIZLI_BILISIM_VKN;
assert.throws(() => resolveTenantWsCredentials(settings), /bu firmaya ait değil/);
process.env.HIZLI_BILISIM_ALLOW_PROD = 'true';
assert.equal(HizliConnectService.getBaseUrl(false), 'https://econnect.hizliteknoloji.com.tr');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'isbey-live-preflight-'));
const database = path.join(directory, 'database.json');
const source = JSON.stringify({ tenants: [], users: [], tenantEinvoiceSettings: [] });
fs.writeFileSync(database, source);
fs.writeFileSync(path.join(directory, '.env'), '# fixture, must not change\n');
const tool = path.resolve('tools/hizli-canli-hazirlik.mjs');
const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), tool, '--output', '.verify-tmp/readiness.json'], {
  cwd: directory, encoding: 'utf8', env: { ...process.env, DATABASE_PATH: database, HIZLI_BILISIM_ALLOW_PROD: 'false', HIZLI_BILISIM_IS_TEST_MODE: 'true', INTEGRATION_JOBS_ENABLED: 'false' },
});
assert.equal(result.status, 1, result.stderr);
const report = JSON.parse(fs.readFileSync(path.join(directory, '.verify-tmp/readiness.json'), 'utf8'));
assert.equal(report.readyForLive, false);
assert.equal(report.mode, 'OFFLINE_READ_ONLY');
assert.equal(fs.readFileSync(database, 'utf8'), source);
assert.equal(fs.readFileSync(path.join(directory, '.env'), 'utf8'), '# fixture, must not change\n');
assert.equal(fs.existsSync(path.join(directory, 'tools/hizli-rollback-sandbox.mjs')), false);
for (const secret of ['fixture-user', 'fixture-password', 'fixture-key', 'fixture-secret']) assert.equal(result.stdout.includes(secret), false);
console.log('PASS: live lock, cached-token lock, company credential isolation, read-only and secret-free preflight.');
