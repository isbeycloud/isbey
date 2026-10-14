/**
 * İŞBEY CLOUD — Kullanıcı Görünürlük Kapsamı Sözleşme Testi (2026-10-12)
 * =====================================================================
 * Kapsam: muhasebeci/personel için menü + hesap (kasa/banka/personel/vergi)
 * kısıtlaması ve bu kısıtlamanın VERİ uçlarında gerçekten uygulanması.
 *
 * KORUNAN DEĞİŞMEZLER:
 *  1. Kapsam YOKSA kullanıcı her şeyi görür (mevcut davranış korunur).
 *  2. Hesap listesi BOŞSA o türün tamamı görünür (boş = kısıtlama yok).
 *  3. Kapsam yalnız KENDİ tenant'ının kullanıcısına tanımlanabilir (IDOR).
 *  4. Başka firmanın hesap kimliği kapsama GİREMEZ (sessizce atılır).
 *  5. Menü belirtilmemişse AÇIK; false yazılan menü kapalı.
 *  6. `me` ucu kendi kapsamını döndürür (izin kapısı yok, yalnız auth).
 *  7. Yazma yetkisi olmayan kullanıcı kapsam DEĞİŞTİREMEZ.
 *  8. Kasa/banka listeleme uçları kapsamı UYGULAR (sadece sidebar değil).
 *
 * Çalıştırma: tools/test-local.mjs (izole DATABASE_PATH + NODE_ENV=test).
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

if (process.env.NODE_ENV !== 'test' || path.basename(process.env.DATABASE_PATH || '') !== 'userScopeContractTest.ts.json') {
  throw new Error('Test yalnız NODE_ENV=test ve izole userScopeContractTest.ts.json ile çalıştırılabilir.');
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.ISBEY_DATA_DIR = path.join(path.dirname(process.env.DATABASE_PATH!), 'scope-data');

const { storage } = await import('../db/storage');
const { v1UserScopesRouter } = await import('../routes/v1/userScopes');
const { cashRouter } = await import('../routes/cash');
const { banksRouter } = await import('../routes/banks');

const TENANT_A = 'tnt-a';
const TENANT_B = 'tnt-b';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
const tokens: Record<string, string> = {};

function signToken(userId: string, tenantId: string): string {
  return jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!, { expiresIn: '5m' });
}
function headers(t: 'A' | 'B' | 'MUH' | 'VIEW'): Record<string, string> {
  return { Authorization: `Bearer ${tokens[t]}`, 'Content-Type': 'application/json' };
}

function kurulum() {
  storage.update(db => {
    db.tenants = [
      { id: TENANT_A, name: 'A Firması', subdomain: 'a' } as any,
      { id: TENANT_B, name: 'B Firması', subdomain: 'b' } as any,
    ];
    db.users = [
      { id: 'usr-a', tenantId: TENANT_A, username: 'a-admin', fullName: 'A Admin', email: 'a@x.com', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any,
      { id: 'usr-b', tenantId: TENANT_B, username: 'b-admin', fullName: 'B Admin', email: 'b@x.com', phone: '', role: 'ADMIN', permissions: ['*'], active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any,
      // Muhasebeci: kapsam tanımlanabilir; kendisi kapsam DEĞİŞTİREMEZ.
      { id: 'usr-muh', tenantId: TENANT_A, username: 'muh', fullName: 'Muhasebeci', email: 'm@x.com', phone: '', role: 'MUHASEBE', permissions: [], active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any,
      // Yalnız görüntüleme yetkisi olan kullanıcı (yazma reddi için).
      { id: 'usr-view', tenantId: TENANT_A, username: 'view', fullName: 'İzleyici', email: 'v@x.com', phone: '', role: 'RAPOR', permissions: [], active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any,
    ];
    // Üyelikler `tenantUsers` koleksiyonundadır (`memberships` diye bir
    // koleksiyon YOKTUR — eski adla yazmak sessizce etkisiz kalır ve platform
    // dışı kullanıcılar MEMBERSHIP_REQUIRED 403 alır).
    const now0 = new Date().toISOString();
    db.tenantUsers = [
      { id: 'tu-a', userId: 'usr-a', tenantId: TENANT_A, roleSlug: 'company_admin', status: 'active', isOwner: true, joinedAt: now0, createdAt: now0, updatedAt: now0 },
      { id: 'tu-b', userId: 'usr-b', tenantId: TENANT_B, roleSlug: 'company_admin', status: 'active', isOwner: true, joinedAt: now0, createdAt: now0, updatedAt: now0 },
      { id: 'tu-m', userId: 'usr-muh', tenantId: TENANT_A, roleSlug: 'accountant', status: 'active', isOwner: false, joinedAt: now0, createdAt: now0, updatedAt: now0 },
      { id: 'tu-v', userId: 'usr-view', tenantId: TENANT_A, roleSlug: 'viewer', status: 'active', isOwner: false, joinedAt: now0, createdAt: now0, updatedAt: now0 },
    ] as any;

    const now = new Date().toISOString();
    db.cashRegisters = [
      { id: 'cash-a1', tenantId: TENANT_A, name: 'TL Kasa', code: 'K1', isDefault: true, balance: 10000, currency: 'TRY', active: true, createdAt: now },
      { id: 'cash-a2', tenantId: TENANT_A, name: 'USD Kasa', code: 'K2', isDefault: false, balance: 500, currency: 'USD', active: true, createdAt: now },
      { id: 'cash-b1', tenantId: TENANT_B, name: 'B Kasası', code: 'KB', isDefault: true, balance: 1, currency: 'TRY', active: true, createdAt: now },
    ] as any;
    db.bankAccounts = [
      { id: 'bank-a1', tenantId: TENANT_A, bankName: 'Ziraat', accountName: 'POS Hesabı', accountNo: '1', branchName: 'M', iban: 'TR1', currency: 'TRY', balance: 999, isDefault: true, active: true, createdAt: now },
      { id: 'bank-a2', tenantId: TENANT_A, bankName: 'İş', accountName: 'Kredi Kartı', accountNo: '2', branchName: 'M', iban: 'TR2', currency: 'TRY', balance: 0, isDefault: false, active: true, createdAt: now },
    ] as any;
    db.userScopes = [];
  });
}

async function basla() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/user-scopes', v1UserScopesRouter);
  app.use('/api/cash', cashRouter);
  app.use('/api/banks', banksRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokens.A = signToken('usr-a', TENANT_A);
  tokens.B = signToken('usr-b', TENANT_B);
  tokens.MUH = signToken('usr-muh', TENANT_A);
  tokens.VIEW = signToken('usr-view', TENANT_A);
}

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push({ name, fn }); }

// ─── 1. Temel okuma/yazma ──────────────────────────────────────────────────

test('KAPSAM YOKKEN: muhasebeci hiç kayıt görmez (scope null) ve tüm kasaları görür', async () => {
  const me = await (await fetch(`${base}/api/v1/user-scopes/me`, { headers: headers('MUH') })).json() as any;
  assert.equal(me.success, true);
  assert.equal(me.scope, null, 'Kapsam yoksa null dönmeli (tam görünüm)');

  const cash = await (await fetch(`${base}/api/cash`, { headers: headers('MUH') })).json() as any;
  assert.equal(cash.success, true);
  assert.ok(cash.cashRegisters.length >= 2, 'Kapsam yokken tüm kasalar görünmeli');
});

test('yönetici muhasebeci için kapsam tanımlar (menü + kasa seçimi)', async () => {
  const res = await fetch(`${base}/api/v1/user-scopes/usr-muh`, {
    method: 'PUT', headers: headers('A'),
    body: JSON.stringify({
      menus: { 'stok-durum': false, 'banka-hareketleri': true, 'dashboard': true },
      cashRegisterIds: ['cash-a1'],
      bankAccountIds: ['bank-a1'],
      employeeIds: [],
      taxTypes: ['KDV'],
    }),
  });
  assert.equal(res.status, 200);
  const scope = (await res.json() as any).scope;
  assert.equal(scope.userId, 'usr-muh');
  assert.equal(scope.menus['stok-durum'], false);
  assert.deepEqual(scope.cashRegisterIds, ['cash-a1']);
  assert.deepEqual(scope.taxTypes, ['KDV']);
});

test('kaydedilen kapsam `me` ucundan okunur', async () => {
  const me = await (await fetch(`${base}/api/v1/user-scopes/me`, { headers: headers('MUH') })).json() as any;
  assert.ok(me.scope, 'Kapsam okunmalı');
  assert.equal(me.scope.menus['stok-durum'], false);
  assert.deepEqual(me.scope.cashRegisterIds, ['cash-a1']);
});

test('VARSAYILAN-AÇIK: belirtilmeyen menü kapalı SAYILMAZ', async () => {
  const me = await (await fetch(`${base}/api/v1/user-scopes/me`, { headers: headers('MUH') })).json() as any;
  assert.equal(me.scope.menus['cekler'], undefined, 'Belirtilmeyen menü kayıtta yok');
  assert.notEqual(me.scope.menus['cekler'], false, 'varsayılan AÇIK olmalı');
});

// ─── 2. Veri uçlarında gerçek filtre ───────────────────────────────────────

test('KASA FİLTRESİ: kapsam dolu → yalnız seçili kasa döner', async () => {
  const cash = await (await fetch(`${base}/api/cash`, { headers: headers('MUH') })).json() as any;
  assert.equal(cash.cashRegisters.length, 1, 'Yalnız seçili kasa görünmeli');
  assert.equal(cash.cashRegisters[0].id, 'cash-a1');
});

test('BANKA FİLTRESİ: kapsam dolu → yalnız seçili hesap döner', async () => {
  const banks = await (await fetch(`${base}/api/banks`, { headers: headers('MUH') })).json() as any;
  assert.equal(banks.bankAccounts.length, 1, 'Yalnız seçili hesap görünmeli');
  assert.equal(banks.bankAccounts[0].id, 'bank-a1');
});

test('YÖNETİCİ etkilenmez: kendi kapsamı olmadığı için tüm kasaları görür', async () => {
  const cash = await (await fetch(`${base}/api/cash`, { headers: headers('A') })).json() as any;
  assert.ok(cash.cashRegisters.length >= 2, 'Yöneticide kapsam yok → tüm kasalar');
});

test('BOŞ LİSTE = kısıtlama yok: hesap listesi boşaltılınca tamamı görünür', async () => {
  const res = await fetch(`${base}/api/v1/user-scopes/usr-muh`, {
    method: 'PUT', headers: headers('A'),
    body: JSON.stringify({ cashRegisterIds: [] }),
  });
  assert.equal(res.status, 200);
  const cash = await (await fetch(`${base}/api/cash`, { headers: headers('MUH') })).json() as any;
  assert.ok(cash.cashRegisters.length >= 2, 'Boş liste kısıtlama DEĞİL — tamamı görünmeli');
  // Geri koy (sonraki testler için).
  await fetch(`${base}/api/v1/user-scopes/usr-muh`, {
    method: 'PUT', headers: headers('A'), body: JSON.stringify({ cashRegisterIds: ['cash-a1'] }),
  });
});

// ─── 3. Tenant izolasyonu (IDOR) ───────────────────────────────────────────

test('IDOR: B firması A kullanıcısına kapsam TANIMLAYAMAZ (404)', async () => {
  const res = await fetch(`${base}/api/v1/user-scopes/usr-muh`, {
    method: 'PUT', headers: headers('B'), body: JSON.stringify({ menus: { dashboard: false } }),
  });
  assert.equal(res.status, 404);
  // Gerçekten değişmediğini kanıtla.
  const me = await (await fetch(`${base}/api/v1/user-scopes/me`, { headers: headers('MUH') })).json() as any;
  assert.notEqual(me.scope.menus['dashboard'], false, 'A kapsamı değişmemeli');
});

test('IDOR: başka firmanın hesap kimliği kapsama GİREMEZ (sessizce atılır)', async () => {
  const res = await fetch(`${base}/api/v1/user-scopes/usr-muh`, {
    method: 'PUT', headers: headers('A'),
    body: JSON.stringify({ cashRegisterIds: ['cash-a1', 'cash-b1'] }),
  });
  assert.equal(res.status, 200);
  const scope = (await res.json() as any).scope;
  assert.ok(!scope.cashRegisterIds.includes('cash-b1'), 'B firmasının kasası kapsama girmemeli');
  assert.deepEqual(scope.cashRegisterIds, ['cash-a1']);
});

// ─── 4. Yetki kapıları ─────────────────────────────────────────────────────

test('YETKİ: yazma yetkisi olmayan kullanıcı kapsam DEĞİŞTİREMEZ (403)', async () => {
  const res = await fetch(`${base}/api/v1/user-scopes/usr-muh`, {
    method: 'PUT', headers: headers('VIEW'), body: JSON.stringify({ menus: { dashboard: false } }),
  });
  assert.ok(res.status === 403, `403 beklenir, gelen: ${res.status}`);
});

test('YETKİ: authsuz istek REDDEDİLİR (401)', async () => {
  const res = await fetch(`${base}/api/v1/user-scopes/me`);
  assert.equal(res.status, 401);
  const res2 = await fetch(`${base}/api/v1/user-scopes/usr-muh`, {
    method: 'PUT', body: JSON.stringify({ menus: {} }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(res2.status, 401);
});

// ─── 5. Kaldırma + audit ───────────────────────────────────────────────────

test('KALDIRMA: kapsam silinince kullanıcı her şeyi görür', async () => {
  const del = await fetch(`${base}/api/v1/user-scopes/usr-muh`, { method: 'DELETE', headers: headers('A') });
  assert.equal(del.status, 200);
  const me = await (await fetch(`${base}/api/v1/user-scopes/me`, { headers: headers('MUH') })).json() as any;
  assert.equal(me.scope, null);
  const cash = await (await fetch(`${base}/api/cash`, { headers: headers('MUH') })).json() as any;
  assert.ok(cash.cashRegisters.length >= 2, 'Kapsam kalkınca tam görünüm');
});

test('AUDIT: kapsam güncellemesi denetim kaydı bırakır', async () => {
  const before = (storage.getState().auditLogs || []).length;
  await fetch(`${base}/api/v1/user-scopes/usr-muh`, {
    method: 'PUT', headers: headers('A'), body: JSON.stringify({ menus: { dashboard: false } }),
  });
  assert.ok((storage.getState().auditLogs || []).length > before, 'Audit kaydı yazılmalı');
});

test('TENANT VERİSİ: kapsamı olmayan kiracı etkilenmez', async () => {
  const cashB = await (await fetch(`${base}/api/cash`, { headers: headers('B') })).json() as any;
  assert.ok(cashB.cashRegisters.length >= 1, 'B kiracısı kendi kasasını görmeli');
});

// ─── Koşucu ────────────────────────────────────────────────────────────────
async function main() {
  kurulum();
  await basla();

  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`PASS: ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`FAIL: ${name}\n      ${err?.message || err}`);
    }
  }

  server.close();
  console.log(`\nuserScopeContractTest: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
