import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'management-reports-')), 'database.json');
const { storage } = await import('../db/storage');
const { migrateMemberships } = await import('../security/memberships');
const { generateToken } = await import('../routes/auth');
const { managementReportsRouter } = await import('../routes/managementReports');
const { buildManagementReports, parseManagementReportFilters } = await import('../services/managementReports');
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
            id: 'c1', tenantId: 'a', code: 'CAR1', title: 'Müşteri', balance: 300, currency: 'TRY'
        }, {
            id: 'c2', tenantId: 'a', code: 'CAR2', title: 'Tedarikçi', balance: -80, currency: 'TRY'
        }, {
            id: 'fx', tenantId: 'a', code: 'FX', title: 'Döviz', balance: 50, currency: 'USD'
        }, {
            id: 'foreign', tenantId: 'b', code: 'FOREIGN', title: 'Foreign Secret', balance: 99999, currency: 'TRY'
        }] as never;
    db.products = [{
            id: 'p1', tenantId: 'a', code: 'P1', name: 'Ürün', unit: 'Adet', currency: 'TRY', purchasePrice: 20, currentStock: 2, criticalStock: 5, active: true, trackStock: true
        }, {
            id: 'p2', tenantId: 'a', code: 'P2', name: 'Maliyetsiz', unit: 'Kg', currency: 'TRY', purchasePrice: 0, currentStock: 8, criticalStock: 3, active: true
        }, {
            id: 'foreign-product', tenantId: 'b', code: 'OTHER', name: 'Foreign Stock', unit: 'Adet', currency: 'TRY', purchasePrice: 5, currentStock: 9, criticalStock: 10, active: true
        }] as never;
    const line = (id: string, productId = 'p1', quantity = 2, net = 100, unit = 'NIU') => ({
        id, productId, productCode: productId, productName: productId, quantity, lineTotal: net, unit, unitPrice: net / quantity
    });
    const invoice = (id: string, type = 'SALES', net = 100, other = {}) => ({
        id, tenantId: 'a', invoiceNo: id, type, status: 'ACTIVE', eInvoiceStatus: 'DRAFT', date: '2026-10-10', currency: 'TRY', subTotal: net, totalVat: net * .2, grandTotal: net * 1.2, items: [line(id)], ...other
    });
    db.invoices = [invoice('sale'), invoice('sales-return', 'PURCHASE', 20, { invoiceCategory: 'IADE', items: [line('return', 'p1', .4, 20)] }), invoice('purchase', 'PURCHASE', 80, { items: [line('purchase', 'p1', 4, 80)] }), invoice('purchase-return', 'SALES', 10, { invoiceCategory: 'IADE', items: [line('preturn', 'p1', .5, 10)] }), invoice('unknown-cost', 'SALES', 30, { items: [line('unknown', 'p2', 1, 30, 'KGM')] }), invoice('draft', 'SALES', 999, { status: 'DRAFT' }), invoice('cancelled', 'SALES', 999, { status: 'CANCELLED' }), invoice('deleted', 'SALES', 999, { isDeleted: true }), invoice('outside', 'SALES', 999, { date: '2026-09-30' }), invoice('foreign-sale', 'SALES', 99999, { tenantId: 'b' }), invoice('usd-sale', 'SALES', 50, { currency: 'USD', items: [line('usd', 'p1', 1, 50)] }), invoice('legacy-unposted', 'SALES', 999, { status: undefined }), invoice('legacy-posted', 'SALES', 10, { status: undefined, items: [line('legacy', 'p1', 1, 10)] })] as never;
    db.currentTransactions = [{
            id: 'tx1', tenantId: 'a', customerId: 'c1', date: '2026-10-10', debit: 120, credit: 0, relatedInvoiceId: 'sale'
        }, {
            id: 'tx2', tenantId: 'a', customerId: 'c1', date: '2026-10-15', debit: 0, credit: 20
        }, {
            id: 'oldtx', tenantId: 'a', customerId: 'c1', date: '2026-01-01', debit: 200, credit: 0
        }, {
            id: 'legacy-posting', tenantId: 'a', customerId: 'c1', date: '2026-10-10', debit: 12, credit: 0, relatedInvoiceId: 'legacy-posted'
        }] as never;
    db.cashRegisters = [{
            id: 'cash', tenantId: 'a', name: 'Kasa', currency: '₺', balance: 70, active: true
        }, {
            id: 'hidden', tenantId: 'a', name: 'Gizli Kasa', currency: 'TRY', balance: 900, active: true
        }] as never;
    db.bankAccounts = [{
            id: 'bank', tenantId: 'a', accountName: 'Banka', bankName: 'Banka', currency: 'TRY', balance: 90, active: true
        }] as never;
    db.cashTransactions = [{
            id: 'cash-expense', tenantId: 'a', cashRegisterId: 'cash', type: 'EXPENSE', amount: 12, date: '2026-10-12', currency: 'TRY'
        }] as never;
    db.bankTransactions = [];
    db.expenses = [{
            id: 'expense', tenantId: 'a', expenseCategoryId: 'office', expenseCategoryName: 'Ofis', amount: 10, vatAmount: 2, totalAmount: 12, date: '2026-10-12', paymentMethod: 'CASH', cashRegisterId: 'cash'
        }, {
            id: 'oldexpense', tenantId: 'a', expenseCategoryId: 'office', expenseCategoryName: 'Ofis', amount: 999, vatAmount: 0, totalAmount: 999, date: '2026-09-01', paymentMethod: 'OTHER', currency: 'TRY'
        }] as never;
    db.stockMovements = [{
            id: 'stock', tenantId: 'a', productId: 'p2', date: '2026-01-01', documentId: 'outside'
        }] as never;
    db.userScopes = [{
            id: 'scope', tenantId: 'a', userId: 'viewer', menus: {}, cashRegisterIds: ['cash'], bankAccountIds: ['bank'], employeeIds: [], taxTypes: [], updatedAt: ''
        }];
});
const tokens = Object.fromEntries(storage.getState().users.map(u => [u.id, generateToken(u, u.companyId!)]));
const app = express();
app.use('/api/reports', managementReportsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/reports/management`;
let checks = 0;
async function call(query = 'currency=TRY&startDate=2026-10-01&endDate=2026-10-31', status = 200, user = 'owner') {
    const before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const response = await fetch(base + '?' + query, { headers: tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {} });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    checks++;
    assert.equal(fs.readFileSync(process.env.DATABASE_PATH!, 'utf8'), before, 'Report request wrote financial source');
    return result;
}
try {
    await call(undefined, 401, '');
    await call(undefined, 403, 'employee');
    const report = await call();
    assert.equal(report.overview.netSales, 120);
    assert.equal(report.overview.netPurchases, 70);
    assert.equal(report.overview.expenseNet, 10);
    assert.equal(report.balances.receivable, 300);
    assert.equal(report.balances.payable, 80);
    assert.equal(report.balances.periodDebit, 132);
    assert.equal(report.balances.periodCredit, 20);
    assert.equal(report.profitability.knownCostLines, 3);
    assert.equal(report.profitability.unknownCostLines, 1);
    assert.equal(report.profitability.complete, false);
    assert.equal(report.profitability.estimatedGrossProfit, 38);
    assert.equal(report.profitability.estimatedCost, 52);
    assert.equal(report.profitability.coveredNetSales, 90);
    assert.equal(report.expenses.totalGross, 12, 'Expense cash transaction double counted');
    assert.equal(report.monthly[0].netSales, 120);
    assert(!JSON.stringify(report).includes('Foreign Secret'));
    assert(!JSON.stringify(report).includes('Foreign Stock'));
    assert(report.stock.critical.some((r: {
        productId: string;
    }) => r.productId === 'p1'));
    assert(report.stock.idle.some((r: {
        productId: string;
    }) => r.productId === 'p2'));
    const usd = await call('currency=USD&startDate=2026-10-01&endDate=2026-10-31');
    assert.equal(usd.overview.netSales, 50);
    assert.equal(usd.balances.receivable, 0);
    assert.equal(usd.profitability.knownCostLines, 0);
    assert.equal(usd.profitability.unknownCostLines, 1);
    const scoped = await call(undefined, 200, 'viewer');
    assert.equal(scoped.overview.cashBalance, 70);
    assert(!JSON.stringify(scoped.cashBank).includes('hidden'));
    const september = await call('currency=TRY&startDate=2026-09-01&endDate=2026-09-30');
    assert.equal(september.balances.receivable, 300, 'Current snapshot was filtered by historical period');
    assert.equal(september.balances.periodDebit, 0);
    assert.equal(september.expenses.totalNet, 999);
    for (const query of ['currency=TRY&startDate=2026-02-30', 'currency=TRY&startDate=2026-10-31&endDate=2026-10-01', 'currency=ALL', 'currency=TRY&tenantId=b', 'currency=TRY&startDate[]=2026-01-01', 'startDate=2026-01-01'])
        await call(query, 400);
    const before = fs.readFileSync(process.env.DATABASE_PATH!, 'utf8');
    const raw = JSON.parse(before);
    raw.customers.find((c: {
        id: string;
    }) => c.id === 'c1').balance = 450;
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(raw));
    assert.equal((await call()).balances.receivable, 450, 'Report used stale in-memory financial cache');
    const now = new Date('2026-10-28T21:00:00Z');
    assert.equal(parseManagementReportFilters({ currency: 'TRY' }, now).endDate, '2026-10-29');
    const mismatch = structuredClone(raw);
    mismatch.invoices.find((i: {
        id: string;
    }) => i.id === 'sale').items = [];
    const incomplete = buildManagementReports(mismatch, 'a', {
        currency: 'TRY', startDate: '2026-10-01', endDate: '2026-10-31'
    }, { now });
    assert.equal(incomplete.profitability.complete, false);
    assert(incomplete.warnings.some(w => w.code === 'INVOICE_LINE_RECONCILIATION'));
    const filters = {
        currency: 'TRY', startDate: '2026-10-01', endDate: '2026-10-31'
    };
    const mixed = structuredClone(raw);
    mixed.invoices.find((i: {
        id: string;
    }) => i.id === 'usd-sale').customerId = 'c1';
    mixed.accountTransactions = [{
            id: 'fx-evidence', tenantId: 'a', customerId: 'c2', currency: 'USD'
        }];
    const mixedReport = buildManagementReports(mixed, 'a', filters, { now });
    assert.equal(mixedReport.balances.receivable, 0);
    assert.equal(mixedReport.balances.payable, 0);
    assert(mixedReport.balances.rows.filter(r => r.customerId === 'c1' || r.customerId === 'c2').every(r => r.balance === null));
    const hiddenExpense = structuredClone(raw);
    hiddenExpense.expenses.push({
        id: 'hidden-expense', tenantId: 'a', expenseCategoryId: 'hidden-category', expenseCategoryName: 'Hidden Expense Secret', amount: 50, vatAmount: 10, totalAmount: 60, date: '2026-10-12', cashRegisterId: 'hidden'
    });
    const visibleReport = buildManagementReports(hiddenExpense, 'a', filters, { now, actorId: 'viewer' });
    assert.equal(visibleReport.expenses.totalNet, 10);
    assert(!JSON.stringify(visibleReport).includes('Hidden Expense Secret'));
    assert(visibleReport.warnings.some(w => w.code === 'SCOPED_EXPENSE'));
    const aliases = structuredClone(raw);
    aliases.invoices.find((i: {
        id: string;
    }) => i.id === 'sales-return').items[0].unit = 'C62';
    aliases.invoices.find((i: {
        id: string;
    }) => i.id === 'legacy-posted').items[0].unit = 'Adet';
    const aliasesBefore = JSON.stringify(aliases);
    const merged = buildManagementReports(aliases, 'a', filters, { now });
    const p1 = merged.products.filter(r => r.productId === 'p1');
    assert.equal(p1.length, 1);
    assert.equal(p1[0].netQuantity, 2.6);
    assert.equal(p1[0].netSales, 90);
    assert.equal(p1[0].unit, 'NIU');
    assert.equal(JSON.stringify(aliases), aliasesBefore, 'Reporting canonicalized saved unit codes');
    const packaging = structuredClone(raw);
    packaging.products.find((p: { id: string }) => p.id === 'p1').unit = 'PK';
    packaging.invoices.find((i: { id: string }) => i.id === 'sale').items[0].unit = 'PK';
    packaging.invoices.find((i: { id: string }) => i.id === 'sales-return').items[0].unit = 'PA';
    const packagesBefore = JSON.stringify(packaging);
    const packagingReport = buildManagementReports(packaging, 'a', filters, { now });
    const pk = packagingReport.products.find(r => r.productId === 'p1' && r.unit === 'PK')!;
    const pa = packagingReport.products.find(r => r.productId === 'p1' && r.unit === 'PA')!;
    assert(pk && pa, 'Distinct PA and PK packaging codes were merged by their shared label');
    assert.equal(pk.netQuantity, 2);
    assert.equal(pa.netQuantity, -.4);
    assert.equal(pk.currentUnitCost, 20);
    assert.equal(pa.currentUnitCost, null, 'PA line borrowed a PK product cost without proof');
    assert.equal(pa.estimatedCost, null);
    assert.equal(JSON.stringify(packaging), packagesBefore);
    const variants = structuredClone(aliases);
    variants.products.find((p: {
        id: string;
    }) => p.id === 'p1').variants = [{
            id: 'v1', purchasePrice: 12, currentStock: 1, active: true
        }, {
            id: 'v2', currentStock: 9, active: true
        }];
    variants.products.find((p: {
        id: string;
    }) => p.id === 'p1').currentStock = 10;
    variants.invoices.find((i: {
        id: string;
    }) => i.id === 'sale').items[0].variantId = 'v1';
    variants.invoices.find((i: {
        id: string;
    }) => i.id === 'sales-return').items[0].variantId = 'v1';
    const variantReport = buildManagementReports(variants, 'a', filters, { now });
    assert.equal(variantReport.products.find(r => r.variantId === 'v1')!.currentUnitCost, 12);
    assert(!variantReport.stock.critical.some(r => r.productId === 'p1'), 'Product threshold was applied independently to each variant');
    variants.invoices.find((i: {
        id: string;
    }) => i.id === 'sale').items[0].variantId = 'missing-variant';
    const missingVariant = buildManagementReports(variants, 'a', filters, { now });
    assert.equal(missingVariant.products.find(r => r.variantId === 'missing-variant')!.estimatedCost, null);
    const unknownExpense = structuredClone(raw);
    unknownExpense.expenses.push({
        id: 'no-currency', tenantId: 'a', date: '2026-10-12', amount: 500, vatAmount: 0, totalAmount: 500, paymentMethod: 'OTHER'
    });
    assert.equal(buildManagementReports(unknownExpense, 'a', filters, { now }).expenses.totalNet, 10, 'Unknown expense currency was guessed');
    const fractionalExpense = structuredClone(raw);
    fractionalExpense.expenses = [{ ...fractionalExpense.expenses.find((e: { tenantId: string }) => e.tenantId === 'a'), id: 'native-fractional', amount: 10.01, vatAmount: 10.01 * .2, totalAmount: 10.01 + 10.01 * .2 }];
    const fractionalBefore = JSON.stringify(fractionalExpense);
    const fractionalReport = buildManagementReports(fractionalExpense, 'a', filters, { now });
    assert.equal(fractionalReport.expenses.totalNet, 10.01);
    assert.equal(fractionalReport.expenses.totalVat, 2);
    assert.equal(fractionalReport.expenses.totalGross, 12.01);
    assert(fractionalReport.warnings.some(w => w.code === 'EXPENSE_PRECISION_ROUNDED'));
    assert.equal(JSON.stringify(fractionalExpense), fractionalBefore);
    const futureStock = structuredClone(raw);
    futureStock.stockMovements.push({
        id: 'future-stock', tenantId: 'a', productId: 'p2', date: '2099-01-01'
    });
    const stockReport = buildManagementReports(futureStock, 'a', filters, { now });
    assert.equal(stockReport.stock.idle.find(r => r.productId === 'p2')!.lastMovementDate, '2026-01-01');
    assert(stockReport.warnings.some(w => w.code === 'FUTURE_STOCK_MOVEMENT'));
    assert(!stockReport.stock.idle.some(r => r.productId === 'p1'), 'Unknown last activity was invented');
    fs.writeFileSync(process.env.DATABASE_PATH!, '{broken');
    const res = await fetch(base + '?currency=TRY', { headers: { Authorization: `Bearer ${tokens.owner}` } });
    assert.equal(res.status, 503);
    fs.writeFileSync(process.env.DATABASE_PATH!, before);
    console.log(`Management reports: ${checks} HTTP checks; tenant/RBAC, dates, currencies, returns, cost coverage, scoped accounts and unchanged fresh source PASS.`);
}
finally {
    server.close();
}
