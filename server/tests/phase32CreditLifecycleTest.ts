/**
 * FAZ 32 — Yerel kontör yaşam döngüsü davranış testi.
 *
 * Bu test Hızlı Bilişim'e istek yapmaz. DATABASE_PATH ile izole edilmiş geçici
 * bir JSON DB üzerinde yerel rezervasyon, sağlayıcı-başarılı düşüm, başarısız
 * gönderimde rezervasyon serbest bırakma ve muhasebe iadesini ölçer.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { storage } from '../db/storage';
import { CreditWalletService } from '../services/creditWalletService';

const tenantId = 'tnt-phase32-credit-lifecycle';
const configuredPath = process.env.DATABASE_PATH || '';
const temporaryFileName = 'phase32-credit-lifecycle.test.json';

if (process.env.NODE_ENV !== 'test' || path.basename(configuredPath) !== temporaryFileName) {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=data/phase32-credit-lifecycle.test.json ile çalıştırılabilir.'
  );
}

const databasePath = path.resolve(process.cwd(), configuredPath);

async function main(): Promise<void> {
  const db = storage.getState();
  db.creditWallets = (db.creditWallets || []).filter(wallet => wallet.tenantId !== tenantId);
  db.creditTransactions = (db.creditTransactions || []).filter(transaction => transaction.tenantId !== tenantId);
  db.creditWallets.push({
    id: `wlt-${tenantId}`,
    tenantId,
    balance: 3,
    reservedBalance: 0,
    lowCreditThreshold: 1,
    updatedAt: new Date().toISOString(),
  });
  storage.save();

  const reservation = await CreditWalletService.reserveCredits(tenantId, 1, 'INVOICE', 'INV-CREDIT-1');
  assert.deepEqual(reservation, { success: true, availableBalance: 2, reservedBalance: 1 });

  const afterReservation = await CreditWalletService.getWallet(tenantId);
  assert.equal(afterReservation.balance, 3);
  assert.equal(afterReservation.reservedBalance, 1);

  const commit = await CreditWalletService.commitCredits(
    tenantId,
    1,
    'INVOICE',
    'INV-CREDIT-1',
    'Sağlayıcı belge kabulü'
  );
  assert.deepEqual(commit, { success: true, newBalance: 2 });

  const afterCommit = await CreditWalletService.getWallet(tenantId);
  assert.equal(afterCommit.balance, 2);
  assert.equal(afterCommit.reservedBalance, 0);
  assert.equal((storage.getState().creditTransactions || []).filter(transaction =>
    transaction.tenantId === tenantId && transaction.type === 'USAGE'
  ).length, 1);

  await CreditWalletService.reserveCredits(tenantId, 1, 'INVOICE', 'INV-CREDIT-2');
  const rollback = await CreditWalletService.rollbackCredits(
    tenantId,
    1,
    'INVOICE',
    'INV-CREDIT-2',
    'Sağlayıcı gönderim hatası'
  );
  assert.deepEqual(rollback, { success: true, availableBalance: 2 });

  const afterRollback = await CreditWalletService.getWallet(tenantId);
  assert.equal(afterRollback.balance, 2, 'Başarısız gönderimde yalnız rezervasyon serbest bırakılır.');
  assert.equal(afterRollback.reservedBalance, 0);

  const refund = await CreditWalletService.addCredits(
    tenantId,
    1,
    'refund' as any,
    'Sağlayıcı onaylı kontör iadesi',
    'REFUND',
    'INV-CREDIT-1'
  );
  assert.deepEqual(refund, { success: true, newBalance: 3 });
  assert.equal((await CreditWalletService.getWallet(tenantId)).reservedBalance, 0);
  assert.equal((storage.getState().creditTransactions || []).filter(transaction =>
    transaction.tenantId === tenantId && transaction.type === 'REFUND'
  ).length, 1);

  console.log('✅ Yerel kontör yaşam döngüsü doğrulandı: rezervasyon → düşüm → serbest bırakma → iade.');
  console.log('ℹ️ Bu sonuç, entegratörün canlı kontör iadesi kanıtı değildir; bunun için gerçek belge ve sağlayıcı yanıtı gerekir.');
}

main()
  .finally(() => {
    if (fs.existsSync(databasePath)) fs.unlinkSync(databasePath);
  })
  .catch(error => {
    console.error('❌ Yerel kontör yaşam döngüsü testi başarısız:', error);
    process.exitCode = 1;
  });
