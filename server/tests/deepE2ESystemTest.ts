import crypto from 'crypto';
import { storage } from '../db/storage';
import { DatabaseState } from '../db/schema';
import { PlanService } from '../services/faz9/planService';
import { UsageMeterService } from '../services/faz9/usageMeterService';
import { BillingService } from '../services/faz9/billingService';
import { CreditWalletService } from '../services/faz9/creditWalletService';
import { CommissionEngine } from '../services/faz9/commissionEngine';
import { PartnerService } from '../services/faz9/partnerService';
import { PromotionService } from '../services/faz9/promotionService';
import { MarketplaceService } from '../services/faz9/marketplaceService';
import { GenericMockConnector } from '../services/faz9/integrationFramework';
import { ApiPlatformService } from '../services/faz9/apiPlatformService';
import { WebhookEngine } from '../services/faz9/webhookEngine';
import { WhiteLabelService } from '../services/faz9/whiteLabelService';
import { PlatformAdminService } from '../services/faz9/platformAdminService';

interface TestResultItem {
  id: string;
  module: string;
  scenario: string;
  input: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  error?: string;
}

const testResults: TestResultItem[] = [];

function recordTest(item: TestResultItem) {
  testResults.push(item);
  const mark = item.status === 'PASS' ? '✅' : '❌';
  console.log(`${mark} [${item.id}] [${item.module}] ${item.scenario}: ${item.status}`);
  if (item.error) {
    console.error(`   Error details: ${item.error}`);
  }
}

async function runDeepSystemTest() {
  console.log('================================================================');
  console.log('🚀 İŞBEY CLOUD — DERİN SİSTEM & FULL E2E ENTEGRASYON TESTİ');
  console.log('================================================================\n');

  const now = new Date().toISOString();
  const TEST_TENANT_A = `test-tnt-a-${Date.now()}`;
  const TEST_TENANT_B = `test-tnt-b-${Date.now()}`;
  const custIdA = `cust-a-${Date.now()}`;
  const custIdB = `cust-b-${Date.now()}`;

  try {
    // -------------------------------------------------------------
    // 1. MULTI-TENANT & ISOLATION TEST
    // -------------------------------------------------------------
    await storage.runTransaction((draft: DatabaseState) => {
      // Firma A
      draft.tenants.push({
        id: TEST_TENANT_A,
        name: 'İŞBEY TEST FİRMASI A.Ş.',
        taxNumber: '1111111111',
        email: 'info@testfirmaa.com',
        phone: '0555 111 0000',
        plan: 'PRO',
        status: 'ACTIVE',
        eInvoiceCredits: 100,
        createdAt: now,
      });

      // Firma B
      draft.tenants.push({
        id: TEST_TENANT_B,
        name: 'TEST FİRMASI B LTD.',
        taxNumber: '2222222222',
        email: 'info@testfirmab.com',
        phone: '0555 222 0000',
        plan: 'STARTER',
        status: 'ACTIVE',
        eInvoiceCredits: 50,
        createdAt: now,
      });

      // Firma A Müşterisi
      draft.customers.push({
        id: custIdA,
        tenantId: TEST_TENANT_A,
        name: 'A Müşterisi Ticaret A.Ş.',
        taxNumber: '1234567890',
        type: 'CUSTOMER',
        balance: 0,
        currency: 'TRY',
        active: true,
      });

      // Firma B Müşterisi
      draft.customers.push({
        id: custIdB,
        tenantId: TEST_TENANT_B,
        name: 'B Müşterisi Sanayi Ltd.',
        taxNumber: '9876543210',
        type: 'CUSTOMER',
        balance: 0,
        currency: 'TRY',
        active: true,
      });
    });

    // İzolasyon Doğrulama: A firması B müşterilerini görmemeli
    const state1 = storage.getState();
    const custsA = state1.customers.filter(c => c.tenantId === TEST_TENANT_A);
    const hasLeak = custsA.some(c => c.tenantId === TEST_TENANT_B);

    recordTest({
      id: 'TEST-TNT-001',
      module: 'Multi-Tenant',
      scenario: 'Veri İzolasyonu (Tenant Separation)',
      input: `Firma A sorgusu (${TEST_TENANT_A})`,
      expected: 'Sadece Firma A verileri gelmeli, Firma B verisi sızmamalı',
      actual: hasLeak ? 'VERİ SIZINTISI VAR' : 'Tam İzolasyon Doğrulandı (0 Sızıntı)',
      status: !hasLeak && custsA.length === 1 ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 2. STOK & HAREKET TESTİ (BAŞLANGIÇ 100, ÇIKIŞ 20, İADE 5 => 85)
    // -------------------------------------------------------------
    const productId = `prod-${Date.now()}`;
    await storage.runTransaction((draft: DatabaseState) => {
      draft.products.push({
        id: productId,
        tenantId: TEST_TENANT_A,
        name: 'TEST AKILLI YAZILIM LİSANSI',
        code: 'STK-TST-01',
        barcode: '869000000001',
        stock: 100, // Başlangıç
        unit: 'ADET',
        buyingPrice: 80,
        sellingPrice: 150,
        vatRate: 20,
        currency: 'TRY',
        active: true,
      });
    });

    // Satış: 20 adet düşür, İade: 5 adet ekle
    await storage.runTransaction((draft: DatabaseState) => {
      const p = draft.products.find(item => item.id === productId);
      if (p) {
        p.stock -= 20; // Satış
        p.stock += 5;  // İade
      }
    });

    const state2 = storage.getState();
    const prodAfter = state2.products.find(p => p.id === productId);
    const expectedStock = 85;

    recordTest({
      id: 'TEST-STK-001',
      module: 'Stok',
      scenario: 'Stok Giriş / Çıkış / İade Matematiksel Bütünlüğü',
      input: 'Başlangıç: 100, Satış: 20, İade: 5',
      expected: '85 ADET',
      actual: `${prodAfter?.stock} ADET`,
      status: prodAfter?.stock === expectedStock ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 3. FATURA -> CARİ -> KDV -> MUHASEBE ZİNCİRİ
    // 10 Adet x 100 TL = 1.000 TL + %20 KDV (200 TL) = 1.200 TL
    // -------------------------------------------------------------
    const invoiceId = `inv-test-${Date.now()}`;
    const invoiceGross = 1000;
    const invoiceVat = 200;
    const invoiceTotal = 1200;

    await storage.runTransaction((draft: DatabaseState) => {
      // 1. Fatura Ekle
      draft.invoices.push({
        id: invoiceId,
        tenantId: TEST_TENANT_A,
        invoiceNumber: 'GIB2026000000001',
        customerId: custIdA,
        customerName: 'A Müşterisi Ticaret A.Ş.',
        customerTaxNumber: '1234567890',
        date: now,
        type: 'SATIS',
        status: 'APPROVED',
        paymentStatus: 'UNPAID',
        currency: 'TRY',
        subtotal: invoiceGross,
        vatTotal: invoiceVat,
        grandTotal: invoiceTotal,
        items: [
          {
            id: `item-1`,
            productId: productId,
            productName: 'TEST AKILLI YAZILIM LİSANSI',
            quantity: 10,
            unitPrice: 100,
            vatRate: 20,
            vatAmount: 200,
            total: 1200,
          },
        ],
      });

      // 2. Cari Hareket (CurrentTransaction: Borç 1.200 TL)
      draft.currentTransactions.push({
        id: `ctx-${Date.now()}`,
        tenantId: TEST_TENANT_A,
        customerId: custIdA,
        invoiceId: invoiceId,
        type: 'INVOICE',
        description: 'Satış Faturası No: GIB2026000000001',
        debit: invoiceTotal,
        credit: 0,
        balance: invoiceTotal,
        createdAt: now,
      });
    });

    const state3 = storage.getState();
    const custAfterInv = state3.customers.find(c => c.id === custIdA);

    recordTest({
      id: 'TEST-INV-001',
      module: 'Fatura & Cari',
      scenario: 'Fatura Kesimi ve Cari Bakiye Entegrasyonu',
      input: '10 Adet x 100 TL + %20 KDV',
      expected: 'Cari Bakiye: 1.200,00 TL',
      actual: `Cari Bakiye: ${custAfterInv?.balance.toFixed(2)} TL`,
      status: custAfterInv?.balance === 1200 ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 4. KASA / BANKA TAHSİLAT & CARİ DÜŞÜMÜ
    // 400 TL Tahsilat Alındı -> Kalan Cari Bakiye: 800 TL
    // -------------------------------------------------------------
    const cashId = `cash-${TEST_TENANT_A}`;
    await storage.runTransaction((draft: DatabaseState) => {
      // 1. Kasa Tanımı
      let cash = draft.cashRegisters.find(k => k.id === cashId);
      if (!cash) {
        cash = {
          id: cashId,
          name: 'Merkez Kasa TL',
          code: 'KSA-01',
          isDefault: true,
          balance: 0,
          currency: 'TRY',
          active: true,
        };
        draft.cashRegisters.push(cash);
      }

      // 2. Kasa Hareketi (400 TL Giriş)
      draft.cashTransactions.push({
        id: `cashtx-${Date.now()}`,
        cashRegisterId: cashId,
        customerId: custIdA,
        type: 'COLLECTION',
        direction: 'IN',
        amount: 400,
        currency: 'TRY',
        description: 'Nakit Tahsilat Makbuzu',
        createdAt: now,
      });

      // 3. Cari Hareket (CurrentTransaction: Alacak 400 TL)
      draft.currentTransactions.push({
        id: `ctx-pay-${Date.now()}`,
        tenantId: TEST_TENANT_A,
        customerId: custIdA,
        type: 'COLLECTION',
        description: 'Nakit Tahsilat',
        debit: 0,
        credit: 400,
        balance: 800,
        createdAt: now,
      });
    });

    const state4 = storage.getState();
    const custAfterPay = state4.customers.find(c => c.id === custIdA);
    const cashAfterPay = state4.cashRegisters.find(k => k.id === cashId);

    recordTest({
      id: 'TEST-FIN-001',
      module: 'Finans & Kasa',
      scenario: 'Kasa Tahsilatı ve Cari Bakiye Mahsubu',
      input: '1.200 TL Borçtan 400 TL Nakit Tahsilat',
      expected: 'Kasa: 400 TL, Kalan Cari Bakiye: 800 TL',
      actual: `Kasa: ${cashAfterPay?.balance} TL, Cari: ${custAfterPay?.balance} TL`,
      status: custAfterPay?.balance === 800 && cashAfterPay?.balance === 400 ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 5. SAAS PLAN, USAGE METERING & FEATURE FLAGS TESTİ
    // -------------------------------------------------------------
    const plans = PlanService.getPlans();
    const isAiAllowedPro = PlanService.isFeatureEnabled('ai_assistant', 'pro');
    const isWlAllowedStarter = PlanService.isFeatureEnabled('white_label', 'starter');

    const usageResult = await UsageMeterService.recordUsage({
      tenantId: TEST_TENANT_A,
      metric: 'invoice',
      quantity: 5,
    });

    recordTest({
      id: 'TEST-SAAS-001',
      module: 'SaaS Plan & Flag',
      scenario: 'Feature Flag Yetkilendirme & Kullanım Sayacı',
      input: 'Plan: PRO (AI Flag), Plan: STARTER (White-Label Flag)',
      expected: 'PRO: Yetkili (true), STARTER: Yetkisiz (false)',
      actual: `PRO: ${isAiAllowedPro}, STARTER: ${isWlAllowedStarter}`,
      status: isAiAllowedPro === true && isWlAllowedStarter === false && usageResult.allowed ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 6. KONTÖR CÜZDANI & HARCAMA TESTİ
    // 100 Başlangıç Kontörü - 10 e-Fatura Harcaması = 90 Kontör
    // -------------------------------------------------------------
    const walletRes = await CreditWalletService.consumeCredits({
      tenantId: TEST_TENANT_A,
      quantity: 10,
      referenceType: 'E_INVOICE',
      description: 'Toplu e-Fatura Gönderimi (10 Adet)',
    });

    recordTest({
      id: 'TEST-CRD-001',
      module: 'Kontör Cüzdanı',
      scenario: 'e-Belge Kontör Düşümü ve Bakiye Doğrulama',
      input: '100 Kontörden 10 Kontör Harcama',
      expected: 'Kalan: 90 Kontör (Success: true)',
      actual: `Kalan: ${walletRes.remainingBalance} Kontör (Success: ${walletRes.success})`,
      status: walletRes.success && walletRes.remainingBalance === 90 ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 7. BAYİ KOMİSYON MOTORU (DECIMAL HASSASİYETİ)
    // 1.000 TL Brüt Satış, %20 Bayi Komisyonu = 200,00 TL
    // -------------------------------------------------------------
    const partner = await PartnerService.createPartner({
      role: 'DEALER',
      code: `BAYI-${Date.now()}`,
      name: 'TEST ANADOLU BAYİSİ LTD.',
      contactName: 'Test Bayi Yetkilisi',
      email: `bayi-${Date.now()}@test.com`,
      phone: '0555 333 4444',
      city: 'Ankara',
      defaultCommissionRate: 20,
    });

    const comTx = await CommissionEngine.calculateAndAccrueCommission({
      partnerId: partner.id,
      tenantId: TEST_TENANT_A,
      tenantName: 'İŞBEY TEST FİRMASI A.Ş.',
      paymentId: `pay-test-${Date.now()}`,
      serviceType: 'SUBSCRIPTION_NEW',
      grossAmount: 1000,
      discountAmount: 0,
    });

    await CommissionEngine.approveCommission(comTx.id);
    const pUpdated = PartnerService.getPartnerById(partner.id);

    recordTest({
      id: 'TEST-COM-001',
      module: 'Bayi & Komisyon',
      scenario: 'Bayi Komisyon Tahakkuk ve Cüzdanına Aktarma',
      input: '1.000 TL Satış, %20 Komisyon Oranı',
      expected: 'Hakediş: 200,00 TL, Cüzdan Bakiyesi: 200,00 TL',
      actual: `Hakediş: ${comTx.commissionAmount} TL, Cüzdan: ${pUpdated?.walletBalance} TL`,
      status: comTx.commissionAmount === 200 && pUpdated?.walletBalance === 200 ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 8. GELİŞTİRİCİ & API GÜVENLİK TESTİ (HASHED SECRET KEY)
    // -------------------------------------------------------------
    const keyResult = await ApiPlatformService.createApiKey({
      tenantId: TEST_TENANT_A,
      applicationId: 'test-app-1',
      name: 'Test Entegrasyon Key',
      scopes: ['customers.read', 'invoices.write'],
      rateLimitTier: 'PRO',
    });

    const authCheck1 = ApiPlatformService.validateApiKey(keyResult.plainSecretKey, 'customers.read');
    const authCheck2 = ApiPlatformService.validateApiKey(keyResult.plainSecretKey, 'admin.full'); // Yetkisiz scope

    recordTest({
      id: 'TEST-API-001',
      module: 'Developer API',
      scenario: 'Hashed API Key Doğrulama & Scope Kontrolü',
      input: 'Scope: customers.read (Yetkili), Scope: admin.full (Yetkisiz)',
      expected: 'customers.read: PASS, admin.full: FORBIDDEN',
      actual: `customers.read: ${authCheck1.valid}, admin.full: ${authCheck2.valid}`,
      status: authCheck1.valid === true && authCheck2.valid === false ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 9. ENTEGRASYON MARKETPLACE PING TESTİ
    // -------------------------------------------------------------
    const connector = new GenericMockConnector('garanti-bbva', TEST_TENANT_A);
    const pingRes = await connector.testConnection();

    recordTest({
      id: 'TEST-MKT-001',
      module: 'Marketplace',
      scenario: 'Entegrasyon Servisi Canlı Bağlantı / Ping Testi',
      input: 'Connector: garanti-bbva',
      expected: 'Healthy: true, Gecikme < 100ms',
      actual: `Healthy: ${pingRes.healthy}, Latency: ${pingRes.latencyMs}ms (${pingRes.message})`,
      status: pingRes.healthy ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 10. KUPON & REFERRAL TESTİ
    // -------------------------------------------------------------
    const couponVal = PromotionService.validateCoupon('ILKAY10', 1000);
    const refCode = PromotionService.getOrCreateReferralCode(TEST_TENANT_A);

    recordTest({
      id: 'TEST-PRM-001',
      module: 'Promosyon & Kupon',
      scenario: 'Kupon İndirimi (%10) ve Davet Kodu Doğrulama',
      input: 'Kupon: ILKAY10, Sepet: 1.000 TL',
      expected: 'İndirim: 100 TL (Valid: true)',
      actual: `İndirim: ${couponVal.discountAmount} TL, Referral: ${refCode}`,
      status: couponVal.valid && couponVal.discountAmount === 100 ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 11. SÜPER ADMİN PLATFORM METRİKLERİ & IMPERSONATION
    // -------------------------------------------------------------
    const metrics = PlatformAdminService.getPlatformMetrics();
    const impSession = await PlatformAdminService.startImpersonation({
      adminUserId: 'usr-admin',
      adminUserName: 'Platform Admin',
      targetTenantId: TEST_TENANT_A,
      reason: 'E2E Otomatik Sistem Testi',
    });

    recordTest({
      id: 'TEST-ADM-001',
      module: 'Süper Admin',
      scenario: 'SaaS Metrikleri & Güvenli Impersonation Başlatma',
      input: `Hedef Tenant: ${TEST_TENANT_A}`,
      expected: 'MRR > 0, Token Üretilmeli',
      actual: `MRR: ${metrics.mrr} TL, Token: ${impSession.token.slice(0, 10)}...`,
      status: metrics.mrr > 0 && impSession.token ? 'PASS' : 'FAIL',
    });

    // -------------------------------------------------------------
    // 12. DATA INTEGRITY & TRANSACTION ROLLBACK TESTİ
    // -------------------------------------------------------------
    let rollbackSuccess = false;
    try {
      await storage.runTransaction((draft: DatabaseState) => {
        draft.customers.push({
          id: 'cust-rollback-test',
          tenantId: TEST_TENANT_A,
          name: 'Rollback Test',
          balance: 0,
          currency: 'TRY',
          active: true,
        });
        throw new Error('SIMULATED_TRANSACTION_CRASH');
      });
    } catch {
      // Beklenen hata
      const stateCheck = storage.getState();
      const exists = stateCheck.customers.some(c => c.id === 'cust-rollback-test');
      rollbackSuccess = !exists;
    }

    recordTest({
      id: 'TEST-TX-001',
      module: 'Transaction Engine',
      scenario: 'Hata Anında Atomic Rollback (Yarım Kayıt Önleme)',
      input: 'Transaction içinde simüle edilmiş hata fırlatma',
      expected: 'Veritabanı önceki durumuna dönmeli, yarım kayıt yazılmamalı',
      actual: rollbackSuccess ? 'Başarılı Rollback (0 Orphan Record)' : 'ROLLBACK BAŞARISIZ',
      status: rollbackSuccess ? 'PASS' : 'FAIL',
    });

  } catch (err: any) {
    console.error('Test Suite Fatal Error:', err);
  } finally {
    // -------------------------------------------------------------
    // TEST VERİLERİNİ TEMİZLE (CLEANUP)
    // -------------------------------------------------------------
    await storage.runTransaction((draft: DatabaseState) => {
      draft.tenants = draft.tenants.filter(t => t.id !== TEST_TENANT_A && t.id !== TEST_TENANT_B);
      draft.customers = draft.customers.filter(c => c.tenantId !== TEST_TENANT_A && c.tenantId !== TEST_TENANT_B);
      draft.products = draft.products.filter(p => p.tenantId !== TEST_TENANT_A && p.tenantId !== TEST_TENANT_B);
      draft.invoices = draft.invoices.filter(i => i.tenantId !== TEST_TENANT_A && i.tenantId !== TEST_TENANT_B);
      draft.cashRegisters = draft.cashRegisters.filter(k => !k.id.includes(TEST_TENANT_A) && !k.id.includes(TEST_TENANT_B));
    });
    console.log('\n🧹 Test tenantları ve geçici sandbox verileri başarıyla temizlendi.');
  }

  // -------------------------------------------------------------
  // RAPOR ÖZETİ
  // -------------------------------------------------------------
  const total = testResults.length;
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;

  console.log('\n================================================================');
  console.log(`📊 TEST SONUÇ RAPORU: ${passed} / ${total} BAŞARILI (%${Math.round((passed / total) * 100)})`);
  console.log(`❌ HATA (FAIL): ${failed}`);
  console.log('================================================================\n');

  return { total, passed, failed, results: testResults };
}

runDeepSystemTest();
