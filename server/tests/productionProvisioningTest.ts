import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import bcrypt from 'bcryptjs';

const root = fs.mkdtempSync(path.resolve('.verify-tmp/provision-'));
const directory = path.join(root, 'private');
const provision = () => spawnSync(process.execPath, ['tools/provision-production.mjs', directory], { encoding: 'utf8' });
const result = provision();
assert.equal(result.status, 0, result.stderr);
const databasePath = path.join(directory, 'database.prod.json');
const original = fs.readFileSync(databasePath, 'utf8');
assert.notEqual(provision().status, 0, 'Provisioning must refuse an existing directory');
assert.equal(fs.readFileSync(databasePath, 'utf8'), original);
Object.assign(process.env, parse(fs.readFileSync(path.join(directory, '.env'))), {
  ISBEY_DATA_DIR: directory, DATABASE_PATH: databasePath,
});
const { productionReadinessErrors } = await import('../config/productionReadiness');
assert.deepEqual(productionReadinessErrors(), []);
const { storage } = await import('../db/storage');
const state = storage.getState();
assert.equal(state.users.length, 1);
assert.equal(state.tenants.length, 1);
const password = fs.readFileSync(path.join(directory, 'ADMIN-LOGIN.txt'), 'utf8').match(/Şifre: (.+)/)![1];
assert.ok(bcrypt.compareSync(password, state.users[0].passwordHash));
for (const key of ['customers', 'products', 'invoices', 'payments', 'billingInvoices', 'dealers',
  'accountantClients', 'automationRules', 'approvalRules', 'documents', 'workspaceTasks',
  'userDevices', 'promoCoupons', 'partnerNodes'] as const) {
  assert.equal(state[key].length, 0, `${key} must remain empty after production migrations`);
}
assert.equal(state.creditWallets[0].balance, 0);
assert.ok(storage.getXsltStoragePath('efatura', 'test').startsWith(directory + path.sep));
console.log('PASS: clean production provisioning, password, preflight, persistent storage and demo-free migrations.');
