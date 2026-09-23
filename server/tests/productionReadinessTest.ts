import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { productionReadinessErrors } from '../config/productionReadiness';
import { getDatabasePath } from '../config/environment';

const originalEnv = { ...process.env };
fs.mkdirSync('.verify-tmp', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('.verify-tmp/preflight-'));
try {
  Object.assign(process.env, {
    NODE_ENV: 'production', DATABASE_PATH: path.join(directory, 'db.json'),
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex'),
    CORS_ALLOW_ORIGINS: 'https://erp.example.com', LOCAL_DEV_ALLOW: 'false', TRUST_PROXY: 'loopback',
  });
  const db = { tenants: [{ id: 'test' }], users: [{ passwordHash: bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10) }] };
  assert.ok(productionReadinessErrors().some(error => error.includes('database is missing')));
  assert.equal(fs.existsSync(process.env.DATABASE_PATH!), false, 'Preflight must not seed a missing database');
  fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(db));
  assert.deepEqual(productionReadinessErrors(), []);
  const before = fs.readFileSync(process.env.DATABASE_PATH!);
  productionReadinessErrors();
  assert.deepEqual(fs.readFileSync(process.env.DATABASE_PATH!), before, 'Preflight is read-only');
  for (const password of ['admin123', bcrypt.hashSync('admin123', 10)]) {
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify({ ...db, users: [{ passwordHash: password }] }));
    assert.ok(productionReadinessErrors().some(error => error.includes('demo passwords')));
  }
  fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(db));
  process.env.CORS_ALLOW_ORIGINS = '*';
  assert.ok(productionReadinessErrors().some(error => error.includes('CORS_ALLOW_ORIGINS')));
  process.env.CORS_ALLOW_ORIGINS = 'https://erp.example.com';
  process.env.LOCAL_DEV_ALLOW = 'true';
  assert.ok(productionReadinessErrors().some(error => error.includes('LOCAL_DEV_ALLOW')));
  process.env.TRUST_PROXY = 'true';
  assert.ok(productionReadinessErrors().some(error => error.includes('TRUST_PROXY')));
  delete process.env.DATABASE_PATH;
  assert.equal(getDatabasePath(), path.resolve('data/database.prod.json'));
  process.env.NODE_ENV = 'staging';
  assert.equal(getDatabasePath(), path.resolve('data/database.staging.json'));
  console.log('PASS: production preflight rejects missing DB, demo/plaintext credentials, unsafe CORS/proxy and development DB fallback.');
} finally {
  process.env = originalEnv;
}
