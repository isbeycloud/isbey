import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { replaceFileWithRetry } from '../db/atomicWrite';

assert.equal(process.env.NODE_ENV, 'test');
const databasePath = process.env.DATABASE_PATH!;
assert.ok(path.resolve(databasePath).startsWith(path.resolve('.verify-tmp') + path.sep));
const { storage } = await import('../db/storage');
const rename = fs.renameSync;
const beforeDisk = fs.readFileSync(databasePath, 'utf8');
const beforeState = JSON.stringify(storage.getState());
let attempts = 0;
try {
  fs.renameSync = () => {
    attempts++;
    throw Object.assign(new Error('Injected permanent lock'), { code: 'EPERM' });
  };
  await assert.rejects(storage.runTransaction(draft => { draft.company.name = 'Must not commit'; }), /Injected permanent lock/);
  assert.equal(attempts, 5);
  assert.equal(fs.readFileSync(databasePath, 'utf8'), beforeDisk);
  assert.equal(JSON.stringify(storage.getState()), beforeState);
  assert.throws(() => storage.update(draft => { draft.company.name = 'Must not update'; }), /Injected permanent lock/);
  assert.equal(JSON.stringify(storage.getState()), beforeState);
  attempts = 0;
  fs.renameSync = (source, destination) => {
    attempts++;
    if (attempts < 3) throw Object.assign(new Error('Injected temporary lock'), { code: 'EBUSY' });
    rename(source, destination);
  };
  storage.update(draft => { draft.company.name = 'Committed after retry'; });
  assert.equal(attempts, 3);
  assert.equal(JSON.parse(fs.readFileSync(databasePath, 'utf8')).company.name, 'Committed after retry');
  attempts = 0;
  fs.renameSync = () => { attempts++; throw Object.assign(new Error('No such file'), { code: 'ENOENT' }); };
  assert.throws(() => replaceFileWithRetry('missing', 'unused'), /No such file/);
  assert.equal(attempts, 1);
} finally {
  fs.renameSync = rename;
}
console.log('PASS: transient locks retry; permanent failures reject; transaction/update preserve previous disk and memory; non-transient failures do not retry.');
