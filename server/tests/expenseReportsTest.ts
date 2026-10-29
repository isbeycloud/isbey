import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'expense-reports-')), 'database.json');
const { storage } = await import('../db/storage');
const { migrateMemberships } = await import('../security/memberships');
const { generateToken } = await import('../routes/auth');
const { expenseReportsRouter } = await import('../routes/expenseReports');
const { buildExpenseReports, parseExpenseReportFilters } = await import('../services/expenseReports');
storage.update(db => {
    db.tenants = ['a', 'b'].map(id => ({
        ...structuredClone(db.tenants[0]), id, status: 'ACTIVE', isArchived: false, selectedServicePlanIds: undefined, erpSubscription: undefined
    }));
    db.users = ['owner', 'other', 'employee', 'viewer'].map(id => ({
        id, username: id, fullName: id, email: `${id}@example.test`, passwordHash: bcrypt.hashSync('OnlyFixturePassword-123', 4), active: true, role: id === 'employee' ? 'PERSONEL' : id === 'viewer' ? 'RAPOR' : 'COMPANY_ADMIN', companyId: id === 'other' ? 'b' : 'a', allowedCompanyIds: [id === 'other' ? 'b' : 'a'], createdAt: new Date().toISOString()
    }));
    db.tenantUsers = [];
    migrateMemberships(db);
    db.customers = [{
            id: 'supplier', tenantId: 'a', title: 'Tedarikçi A'
        }, {
            id: 'foreign-supplier', tenantId: 'b', title: 'Foreign Supplier Secret'
        }] as never;
    db.cashRegisters = [{
            id: 'cash-a', tenantId: 'a', name: 'Ön Kasa', currency: '₺', active: true
        }, {
            id: 'hidden-cash', tenantId: 'a', name: 'Hidden Account Secret', currency: 'TRY', active: true
        }, {
            id: 'cash-b', tenantId: 'b', name: 'Foreign Account Secret', currency: 'TRY', active: true
        }] as never;
    db.bankAccounts = [{
            id: 'bank-a', tenantId: 'a', bankName: 'Banka', accountName: 'Ticari', currency: 'TRY', active: true
        }, {
            id: 'usd-bank', tenantId: 'a', bankName: 'Banka', accountName: 'USD', currency: 'USD', active: true
        }] as never;
    db.expenseCategories = [{
            id: 'office', tenantId: 'a', name: 'Ofis Güncel'
        }, {
            id: 'travel', tenantId: 'a', name: 'Seyahat'
        }, {
            id: 'foreign-category', tenantId: 'b', name: 'Foreign Category Secret'
        }] as never;
    db.costCenters = [{
            id: 'branch', tenantId: 'a', name: 'Merkez'
        }, {
            id: 'project', tenantId: 'a', name: 'Proje'
        }, {
            id: 'foreign-center', tenantId: 'b', name: 'Foreign Center Secret'
        }] as never;
    const expense = (id: string, amount: number, vat: number, extra = {}) => ({
        id, tenantId: 'a', date: '2026-10-10', documentNo: 'GDR-' + id, title: 'Ofis kâğıdı', expenseCategoryId: 'office', expenseCategoryName: 'Ofis', costCenterId: 'branch', costCenterName: 'Merkez', amount, vatAmount: vat, totalAmount: amount + vat, vatRate: 20, paymentMethod: 'CASH', cashRegisterId: 'cash-a', supplierId: 'supplier', receiptNo: 'R-' + id, notes: 'Deneme notu', ...extra
    });
    db.expenses = [expense('cash', 100, 20), expense('bank', 50, 0, {
            expenseCategoryId: 'travel', expenseCategoryName: 'Seyahat', costCenterId: 'project', costCenterName: 'Proje', paymentMethod: 'BANK', cashRegisterId: undefined, bankAccountId: 'bank-a', title: 'Ulaşım', supplierTitle: 'Eski Tedarikçi'
        }), expense('other', 25, 5, {
            paymentMethod: 'OTHER', cashRegisterId: undefined, currency: 'TRY', costCenterId: undefined, costCenterName: undefined, title: 'Aidat'
        }), expense('hidden', 15, 3, {
            cashRegisterId: 'hidden-cash', costCenterId: 'foreign-center', costCenterName: undefined, expenseCategoryId: 'foreign-category', expenseCategoryName: undefined, supplierId: 'foreign-supplier'
        }), expense('usd', 20, 4, {
            paymentMethod: 'BANK', cashRegisterId: undefined, bankAccountId: 'usd-bank', currency: 'USD'
        }), expense('foreign', 999, 0, {
            tenantId: 'b', cashRegisterId: 'cash-b', title: 'Foreign Expense Secret'
        }), expense('deleted', 999, 0, { deletedAt: '2026-10-11' }), expense('old', 999, 0, { date: '2026-09-01' }), expense('unknown', 70, 14, { paymentMethod: 'OTHER', cashRegisterId: undefined }), expense('mixed', 60, 12, { currency: 'USD' }), expense('foreign-parent', 80, 16, { cashRegisterId: 'cash-b' }), expense('invalid', 30, 6, { totalAmount: 99 })] as never;
    db.cashTransactions = [{
            id: 'cash-copy', tenantId: 'a', cashRegisterId: 'cash-a', type: 'EXPENSE', amount: 120, date: '2026-10-10'
        }] as never;
    db.userScopes = [{
            id: 'viewer-scope', tenantId: 'a', userId: 'viewer', menus: {}, cashRegisterIds: ['cash-a'], bankAccountIds: ['bank-a'], employeeIds: [], taxTypes: [], updatedAt: ''
        }];
});
const tokens = Object.fromEntries(storage.getState().users.map(u => [u.id, generateToken(u, u.companyId!)]));
const app = express();
app.use('/api/reports', expenseReportsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/reports/expense-transactions`;
const query = 'currency=TRY&startDate=2026-10-01&endDate=2026-10-31';
let checks = 0;
async function call(q = query, status = 200, user = 'owner') {
    const before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const response = await fetch(base + '?' + q, { headers: tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {} });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    checks++;
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before, 'Expense report wrote source');
    return result;
}
try {
    await call(undefined, 401, '');
    await call(undefined, 403, 'employee');
    const result = await call();
    assert.deepEqual(result.summary, {
        count: 4, netAmount: 190, vatAmount: 28, grossAmount: 218
    });
    assert.equal(result.rows.find((r: {
        id: string;
    }) => r.id === 'cash').supplierTitle, 'Tedarikçi A');
    assert.equal(result.rows.find((r: {
        id: string;
    }) => r.id === 'bank').supplierTitle, 'Eski Tedarikçi');
    assert.equal(result.byCategory.reduce((s: number, r: {
        netAmount: number;
    }) => s + r.netAmount, 0), 190);
    assert.equal(result.byCostCenter.reduce((s: number, r: {
        grossAmount: number;
    }) => s + r.grossAmount, 0), 218);
    assert(!JSON.stringify(result).includes('Foreign '));
    assert(!JSON.stringify(result).includes('cash-copy'));
    const method = await call(query + '&paymentMethod=OTHER');
    assert.equal(method.summary.netAmount, 25);
    assert.equal(method.summary.count, 1);
    const center = await call(query + '&costCenterId=branch');
    assert.equal(center.summary.netAmount, 100);
    const category = await call(query + '&categoryId=travel');
    assert.equal(category.summary.netAmount, 50);
    const account = await call(query + '&account=CASH%3Acash-a');
    assert.equal(account.summary.netAmount, 100);
    const search = await call(query + '&search=' + encodeURIComponent('kagidi R-cash'));
    assert.equal(search.summary.count, 1);
    const scoped = await call(undefined, 200, 'viewer');
    assert.equal(scoped.summary.netAmount, 175);
    assert(!JSON.stringify(scoped).includes('Hidden Account Secret'));
    const usd = await call('currency=USD&startDate=2026-10-01&endDate=2026-10-31');
    assert.equal(usd.summary.netAmount, 20);
    assert.equal(usd.rows.length, 1);
    await call(query + '&account=CASH%3Acash-b');
    assert.equal((await call(query + '&account=CASH%3Acash-b')).summary.count, 0);
    for (const bad of ['currency=TRY&startDate=2026-02-30', query + '&paymentMethod=CARD', query + '&account=foreign-id', query + '&tenantId=b', query + '&search=' + encodeURIComponent('x'.repeat(201)), query + '&categoryId[]=office', 'startDate=2026-10-01'])
        await call(bad, 400);
    const before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const raw = JSON.parse(before);
    raw.expenses.find((e: {
        id: string;
    }) => e.id === 'cash').amount = 110;
    raw.expenses.find((e: {
        id: string;
    }) => e.id === 'cash').totalAmount = 130;
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(raw));
    assert.equal((await call()).summary.netAmount, 200, 'Expense report used cached values');
    const malformed = structuredClone(raw);
    const valid = malformed.expenses.find(e => e.id === 'cash');
    malformed.expenses.push({
        ...valid, id: 'swapped-method', paymentMethod: 'BANK'
    }, {
        ...valid, id: 'missing-account', cashRegisterId: undefined, currency: 'TRY'
    }, {
        ...valid, id: 'other-linked', paymentMethod: 'OTHER'
    });
    const malformedResult = buildExpenseReports(malformed, 'a', parseExpenseReportFilters({
        currency: 'TRY', startDate: '2026-10-01', endDate: '2026-10-31'
    }));
    assert.equal(malformedResult.summary.netAmount, 200);
    assert(malformedResult.warnings.some(w => w.code === 'INCONSISTENT_EXPENSE_PAYMENT'));
    assert(!malformedResult.rows.some(r => ['swapped-method', 'missing-account', 'other-linked'].includes(r.id)));
    const fractional = structuredClone(raw);
    fractional.expenses = [{
            ...valid, id: 'fractional', amount: 10.01, vatAmount: 10.01 * .2, totalAmount: 10.01 + 10.01 * .2
        }, {
            ...valid, id: 'oversized', amount: 1e13, vatAmount: 0, totalAmount: 1e13
        }, {
            ...valid, id: 'negative', amount: -1, vatAmount: 0, totalAmount: -1
        }];
    const fractionalBefore = JSON.stringify(fractional);
    const fractionalResult = buildExpenseReports(fractional, 'a', parseExpenseReportFilters({
        currency: 'TRY', startDate: '2026-10-01', endDate: '2026-10-31'
    }));
    assert.deepEqual(fractionalResult.summary, {
        count: 1, netAmount: 10.01, vatAmount: 2, grossAmount: 12.01
    });
    assert(fractionalResult.warnings.some(w => w.code === 'EXPENSE_PRECISION_ROUNDED'));
    assert.equal(JSON.stringify(fractional), fractionalBefore);
    const fixed = new Date('2026-10-28T21:00:00Z');
    assert.equal(parseExpenseReportFilters({ currency: 'TRY' }, fixed).endDate, '2026-10-29');
    const rawBefore = JSON.stringify(raw);
    buildExpenseReports(raw, 'a', parseExpenseReportFilters({
        currency: 'TRY', startDate: '2026-10-01', endDate: '2026-10-31'
    }, fixed), { now: fixed });
    assert.equal(JSON.stringify(raw), rawBefore);
    const m = structuredClone(storage.getState().tenantUsers.find(v => v.userId === 'owner'))!;
    storage.update(db => {
        db.tenantUsers.find(v => v.userId === 'owner')!.allowedMenuIds = ['raporlar'];
    });
    await call(undefined, 403);
    storage.update(db => {
        db.tenantUsers[db.tenantUsers.findIndex(v => v.userId === 'owner')] = m;
    });
    const scopeBefore = structuredClone(storage.getState().userScopes[0]);
    storage.update(db => {
        db.userScopes[0].menus = { masraflar: false };
    });
    await call(undefined, 403, 'viewer');
    storage.update(db => {
        db.userScopes[0] = scopeBefore;
    });
    const ownerMembership = structuredClone(storage.getState().tenantUsers.find(m => m.userId === 'owner'));
    storage.update(db => {
        db.roles.push({
            id: 'report-only', tenantId: 'a', slug: 'report_viewer', name: 'Only reports', permissions: ['reports.view'], isSystem: false
        } as never);
        db.tenantUsers.find(m => m.userId === 'owner').roleIds = ['report-only'];
    });
    await call(undefined, 403);
    storage.update(db => {
        db.tenantUsers[db.tenantUsers.findIndex(m => m.userId === 'owner')] = ownerMembership;
    });
    console.log(`Expense reports: ${checks} HTTP checks; scoped native expense rows, all filters, equal totals, currency proof, fresh read and no source writes PASS.`);
}
finally {
    server.close();
}
