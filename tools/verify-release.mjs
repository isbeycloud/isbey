import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { initialDatabaseState } from '../server/db/seed.ts';

const target = path.resolve(process.argv[2] || '');
const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.sha256.json'), 'utf8'));
for (const [file, hash] of Object.entries(manifest)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(target, file))).digest('hex'), hash, file);
  assert.ok(!file.startsWith('data/') && file !== '.env' && !file.startsWith('node_modules/'), file);
}
fs.mkdirSync('.verify-tmp', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('.verify-tmp/release-smoke-'));
const db = structuredClone(initialDatabaseState);
const hash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
for (const user of db.users) user.passwordHash = hash;
const database = path.join(directory, 'database.prod.json');
fs.writeFileSync(database, JSON.stringify(db));
const child = spawn(process.execPath, ['--import', 'tsx', 'tools/start-production.mjs'], {
  cwd: target, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '4318',
    DATABASE_PATH: database, DOTENV_CONFIG_PATH: path.join(directory, 'no-env'),
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex'),
    CORS_ALLOW_ORIGINS: 'https://erp.example.com', LOCAL_DEV_ALLOW: 'false', TRUST_PROXY: '',
    INTEGRATION_JOBS_ENABLED: 'false', HIZLI_BILISIM_ALLOW_PROD: 'false', HIZLI_BILISIM_IS_TEST_MODE: 'true',
  },
});
let output = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });
const exited = new Promise(resolve => child.once('exit', resolve));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Production process exited: ${output}`);
    try {
      const response = await fetch('http://127.0.0.1:4318/api/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Production health did not become ready: ${output}`);
  const page = await fetch('http://127.0.0.1:4318/');
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-type').includes('text/html'));
  assert.equal((await fetch('http://127.0.0.1:4318/api/customers')).status, 401);
  console.log(`PASS: ${Object.keys(manifest).length} package hashes; production startup, health, SPA and unauthenticated API denial. Isolated test database only.`);
} finally {
  child.kill();
  await exited;
}
