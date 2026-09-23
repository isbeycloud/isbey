import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
fs.mkdirSync('.verify-tmp', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('.verify-tmp/e2e-'));
Object.assign(process.env, {
  NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '4317', SERVE_STATIC: 'true',
  DATABASE_PATH: path.join(directory, 'database.json'), DOTENV_CONFIG_PATH: path.join(directory, 'no-env'),
  JWT_SECRET: crypto.randomBytes(48).toString('hex'), WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex'),
  HIZLI_BILISIM_ALLOW_PROD: 'false', HIZLI_BILISIM_IS_TEST_MODE: 'true',
  HIZLI_BILISIM_API_KEY: '', HIZLI_BILISIM_WS_USERNAME: '', HIZLI_BILISIM_WS_PASSWORD: '',
  CORS_ALLOW_ORIGINS: 'http://127.0.0.1:4317', LOCAL_DEV_ALLOW: 'false', TRUST_PROXY: '',
});
const { initialDatabaseState } = await import('../server/db/seed.ts');
const { adminStoredHash } = await import('../server/tests/fixtures/e2eCredentials.ts');
const fixture = structuredClone(initialDatabaseState);
fixture.users.find(user => user.username === 'admin').passwordHash = adminStoredHash;
fs.writeFileSync(process.env.DATABASE_PATH, JSON.stringify(fixture));
await import('../server/index.ts');
