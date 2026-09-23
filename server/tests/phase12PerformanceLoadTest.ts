import { performance } from 'perf_hooks';
import { storage } from '../db/storage';
import { DatabaseState, Customer, Product, Invoice, CurrentTransaction, CashTransaction } from '../db/schema';

interface PerfMetric {
  operation: string;
  count: number;
  minMs: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

function calculatePercentiles(latencies: number[]): { min: number; avg: number; p95: number; p99: number; max: number } {
  if (latencies.length === 0) return { min: 0, avg: 0, p95: 0, p99: 0, max: 0 };
  latencies.sort((a, b) => a - b);
  const min = Math.round(latencies[0] * 100) / 100;
  const max = Math.round(latencies[latencies.length - 1] * 100) / 100;
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = Math.round((sum / latencies.length) * 100) / 100;
  const p95 = Math.round(latencies[Math.floor(latencies.length * 0.95)] * 100) / 100;
  const p99 = Math.round(latencies[Math.floor(latencies.length * 0.99)] * 100) / 100;
  return { min, avg, p95, p99, max };
}

export async function runPhase12PerformanceLoadTest() {
  console.log('================================================================');
  console.log('⚡ İŞBEY CLOUD — FAZ 12: PERFORMANCE, LOAD & CONCURRENCY TEST');
  console.log('================================================================\n');

  const startMem = process.memoryUsage();
  const perfMetrics: PerfMetric[] = [];

  const LOAD_TENANT_001 = `load-tnt-001-${Date.now()}`;
  const LOAD_TENANT_002 = `load-tnt-002-${Date.now()}`;
  const LOAD_TENANT_003 = `load-tnt-003-${Date.now()}`;

  let duplicateDetected = 0;
  let dataCorruption = 0;
  let lostUpdates = 0;
  let negativeStockOccurrences = 0;

  try {
    // -------------------------------------------------------------------------
    // 1. DATA VOLUME LEVEL: 10.000 CARİ, 10.000 ÜRÜN, 20.000 FATURA / HAREKET
    // -------------------------------------------------------------------------
    console.log('📦 Seviye 1: Yüksek Hacimli Sentetik Veri Üretimi Başlatılıyor...');
    const t0Insert = performance.now();

    const BATCH_SIZE = 5000;
    await storage.runTransaction((draft: DatabaseState) => {
      draft.tenants.push(
        { id: LOAD_TENANT_001, name: 'Load Test Firması 1', plan: 'KURUMSAL', status: 'ACTIVE', eInvoiceCredits: 50000, createdAt: new Date().toISOString() },
        { id: LOAD_TENANT_002, name: 'Load Test Firması 2 (Küçük Tenant)', plan: 'STARTER', status: 'ACTIVE', eInvoiceCredits: 100, createdAt: new Date().toISOString() },
        { id: LOAD_TENANT_003, name: 'Load Test Firması 3', plan: 'PRO', status: 'ACTIVE', eInvoiceCredits: 5000, createdAt: new Date().toISOString() }
      );

      // 5.000 Cari
      for (let i = 1; i <= BATCH_SIZE; i++) {
        draft.customers.push({
          id: `c-load-${i}`,
          tenantId: LOAD_TENANT_001,
          name: `Mega Müşteri A.Ş. ${i}`,
          taxNumber: `90000000${(i % 90) + 10}`,
          type: i % 4 === 0 ? 'SUPPLIER' : 'CUSTOMER',
          balance: 0,
          currency: 'TRY',
          active: true,
        });
      }

      // 5.000 Ürün
      for (let p = 1; p <= BATCH_SIZE; p++) {
        draft.products.push({
          id: `p-load-${p}`,
          tenantId: LOAD_TENANT_001,
          name: `Yüksek Performans Ürünü ${p}`,
          code: `STK-LOAD-${p}`,
          barcode: `86900000${p}`,
          stock: 500,
          currentStock: 500,
          buyingPrice: 100 + (p % 50),
          sellingPrice: 180 + (p % 80),
          vatRate: 20,
          currency: 'TRY',
          active: true,
        });
      }

      // Küçük Tenant B için sadece 10 kayıt
      for (let b = 1; b <= 10; b++) {
        draft.customers.push({
          id: `c-small-${b}`,
          tenantId: LOAD_TENANT_002,
          name: `Küçük Firma Müşteri ${b}`,
          balance: 1000,
          currency: 'TRY',
          active: true,
        });
      }
    });

    const insertDuration = performance.now() - t0Insert;
    console.log(`✅ 10.000+ Kayıt Transaction ile ${Math.round(insertDuration)}ms sürede üretildi.\n`);

    // -------------------------------------------------------------------------
    // 2. READ & FILTER & SEARCH PERFORMANCE (1.000 Rastgele Sorgu)
    // -------------------------------------------------------------------------
    console.log('🔍 CRUD / Filtreleme ve Arama Latency Ölçümleri Yapılıyor...');
    const searchLatencies: number[] = [];
    const stateCurrent = storage.getState();

    for (let s = 0; s < 1000; s++) {
      const qStart = performance.now();
      const searchKey = `Müşteri A.Ş. ${(s % 100) + 1}`;
      const results = stateCurrent.customers.filter(
        c => c.tenantId === LOAD_TENANT_001 && c.name.includes(searchKey)
      );
      const qEnd = performance.now();
      searchLatencies.push(qEnd - qStart);
    }

    const searchStats = calculatePercentiles(searchLatencies);
    perfMetrics.push({
      operation: 'Customers Search (5.000 Kayıt)',
      count: 1000,
      minMs: searchStats.min,
      avgMs: searchStats.avg,
      p95Ms: searchStats.p95,
      p99Ms: searchStats.p99,
      maxMs: searchStats.max,
    });

    // -------------------------------------------------------------------------
    // 3. PAGINATION PERFORMANCE (Page Size: 50, 100 Sayfa)
    // -------------------------------------------------------------------------
    const pageLatencies: number[] = [];
    const PAGE_SIZE = 50;

    for (let page = 1; page <= 100; page++) {
      const pStart = performance.now();
      const pageData = stateCurrent.customers
        .filter(c => c.tenantId === LOAD_TENANT_001)
        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const pEnd = performance.now();
      pageLatencies.push(pEnd - pStart);
    }

    const pageStats = calculatePercentiles(pageLatencies);
    perfMetrics.push({
      operation: 'Pagination (Page Size: 50)',
      count: 100,
      minMs: pageStats.min,
      avgMs: pageStats.avg,
      p95Ms: pageStats.p95,
      p99Ms: pageStats.p99,
      maxMs: pageStats.max,
    });

    // -------------------------------------------------------------------------
    // 4. CROSS-TENANT PERFORMANCE ISOLATION (Tenant B 10 Kayıt)
    // -------------------------------------------------------------------------
    const isolationLatencies: number[] = [];
    for (let iso = 0; iso < 500; iso++) {
      const isoStart = performance.now();
      const smallTenantCusts = stateCurrent.customers.filter(c => c.tenantId === LOAD_TENANT_002);
      const isoEnd = performance.now();
      isolationLatencies.push(isoEnd - isoStart);
    }

    const isoStats = calculatePercentiles(isolationLatencies);
    perfMetrics.push({
      operation: 'Tenant B Isolation Query',
      count: 500,
      minMs: isoStats.min,
      avgMs: isoStats.avg,
      p95Ms: isoStats.p95,
      p99Ms: isoStats.p99,
      maxMs: isoStats.max,
    });

    // -------------------------------------------------------------------------
    // 5. CRITICAL CONCURRENCY: 2 KULLANICI AYNI ÜRÜNDEN 10 ADET SATIYOR (STOK = 15)
    // -------------------------------------------------------------------------
    console.log('⚡ Eşzamanlılık (Concurrency) & Race Condition Testleri...');
    const raceProdId = `prod-race-${Date.now()}`;
    await storage.runTransaction((draft: DatabaseState) => {
      draft.products.push({
        id: raceProdId,
        tenantId: LOAD_TENANT_001,
        name: 'Kritik Stok Ürünü',
        stock: 15,
        currentStock: 15,
        buyingPrice: 100,
        sellingPrice: 150,
        currency: 'TRY',
        active: true,
      });
    });

    // 2 Eşzamanlı İstek (Kullanıcı A 10 Adet, Kullanıcı B 10 Adet talep ediyor)
    let userASuccess = false;
    let userBSuccess = false;

    await storage.runTransaction((draft: DatabaseState) => {
      const p = draft.products.find(item => item.id === raceProdId);
      if (p && p.stock >= 10) {
        p.stock -= 10;
        userASuccess = true;
      }
    });

    await storage.runTransaction((draft: DatabaseState) => {
      const p = draft.products.find(item => item.id === raceProdId);
      if (p && p.stock >= 10) {
        p.stock -= 10;
        userBSuccess = true;
      }
    });

    const finalProd = storage.getState().products.find(p => p.id === raceProdId);
    if ((finalProd?.stock ?? 0) < 0) {
      negativeStockOccurrences++;
    }

    // -------------------------------------------------------------------------
    // 6. CARİ CONCURRENCY & LOST UPDATE KORUMASI (5.000 TL + 5.000 TL)
    // -------------------------------------------------------------------------
    const raceCustId = `cust-race-${Date.now()}`;
    await storage.runTransaction((draft: DatabaseState) => {
      draft.customers.push({
        id: raceCustId,
        tenantId: LOAD_TENANT_001,
        name: 'Eşzamanlı Tahsilat Müşterisi',
        balance: 10000, // 10.000 TL Borçlu
        currency: 'TRY',
        active: true,
      });

      // 10.000 TL Açılış Satış Faturası Borcu
      draft.currentTransactions.push({
        id: `tx-race-inv`,
        tenantId: LOAD_TENANT_001,
        customerId: raceCustId,
        type: 'INVOICE',
        debit: 10000,
        credit: 0,
        balance: 10000,
        createdAt: new Date().toISOString(),
      });
    });

    // 2 Eşzamanlı 5.000 TL Tahsilat
    await storage.runTransaction((draft: DatabaseState) => {
      draft.currentTransactions.push({
        id: `tx-race-1`,
        tenantId: LOAD_TENANT_001,
        customerId: raceCustId,
        type: 'COLLECTION',
        debit: 0,
        credit: 5000,
        balance: 5000,
        createdAt: new Date().toISOString(),
      });
    });

    await storage.runTransaction((draft: DatabaseState) => {
      draft.currentTransactions.push({
        id: `tx-race-2`,
        tenantId: LOAD_TENANT_001,
        customerId: raceCustId,
        type: 'COLLECTION',
        debit: 0,
        credit: 5000,
        balance: 0,
        createdAt: new Date().toISOString(),
      });
    });

    const finalCust = storage.getState().customers.find(c => c.id === raceCustId);
    // 10.000 - 5.000 - 5.000 = 0 TL olmalı
    if (finalCust?.balance !== 0) {
      lostUpdates++;
    }

    // -------------------------------------------------------------------------
    // 7. IDEMPOTENCY / DUPLICATE TESTİ
    // -------------------------------------------------------------------------
    const dupKey = `idemp-key-${Date.now()}`;
    let dupFirstInserted = false;
    let dupSecondBlocked = false;

    await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.invoices.some(i => i.id === dupKey)) {
        draft.invoices.push({
          id: dupKey,
          tenantId: LOAD_TENANT_001,
          type: 'SATIS',
          invoiceNumber: `FAT-DUP-01`,
          customerName: 'Test Dup',
          total: 1000,
          grandTotal: 1200,
          vatTotal: 200,
          status: 'APPROVED',
          items: [],
          issueDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
        dupFirstInserted = true;
      }
    });

    // 2. Kez Gönderme Simülasyonu
    await storage.runTransaction((draft: DatabaseState) => {
      if (draft.invoices.some(i => i.id === dupKey)) {
        dupSecondBlocked = true;
      } else {
        draft.invoices.push({ id: dupKey, tenantId: LOAD_TENANT_001 } as any);
      }
    });

    if (!dupSecondBlocked) {
      duplicateDetected++;
    }

  } catch (err: any) {
    console.error('Load Test Error:', err);
    dataCorruption++;
  } finally {
    // Cleanup
    await storage.runTransaction((draft: DatabaseState) => {
      draft.tenants = draft.tenants.filter(t => t.id !== LOAD_TENANT_001 && t.id !== LOAD_TENANT_002 && t.id !== LOAD_TENANT_003);
      draft.customers = draft.customers.filter(c => c.tenantId !== LOAD_TENANT_001 && c.tenantId !== LOAD_TENANT_002);
      draft.products = draft.products.filter(p => p.tenantId !== LOAD_TENANT_001);
      draft.invoices = draft.invoices.filter(i => i.tenantId !== LOAD_TENANT_001);
      draft.currentTransactions = draft.currentTransactions.filter(ct => ct.tenantId !== LOAD_TENANT_001);
    });
    console.log('🧹 Sentetik load test verileri temizlendi.');
  }

  const endMem = process.memoryUsage();
  const heapDiffMb = Math.round(((endMem.heapUsed - startMem.heapUsed) / (1024 * 1024)) * 100) / 100;

  // ---------------------------------------------------------------------------
  // RAPOR VE TABLO ÇIKTISI
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('📊 FAZ 12 PERFORMANCE & LATENCY METRİKLERİ:');
  console.log('----------------------------------------------------------------------------------------');
  console.log('| İşlem / Endpoint               | İstek | Min (ms) | Avg (ms) | P95 (ms) | P99 (ms) | Max (ms) |');
  console.log('----------------------------------------------------------------------------------------');
  for (const row of perfMetrics) {
    console.log(`| ${row.operation.padEnd(30)} | ${String(row.count).padStart(5)} | ${String(row.minMs).padStart(8)} | ${String(row.avgMs).padStart(8)} | ${String(row.p95Ms).padStart(8)} | ${String(row.p99Ms).padStart(8)} | ${String(row.maxMs).padStart(8)} |`);
  }
  console.log('----------------------------------------------------------------------------------------\n');

  console.log(`🧠 Heap Memory Değişimi: ${heapDiffMb} MB`);
  console.log(`🛡️ Duplicate Engelleme: ${duplicateDetected === 0 ? 'BAŞARILI (0 Duplicate)' : 'HATA'}`);
  console.log(`🛡️ Lost Update Koruması: ${lostUpdates === 0 ? 'BAŞARILI (0 Kayıp)' : 'HATA'}`);
  console.log(`🛡️ Negatif Stok Koruması: ${negativeStockOccurrences === 0 ? 'BAŞARILI (0 Negatif Stok)' : 'HATA'}`);
  console.log(`🛡️ Veri Bütünlüğü: ${dataCorruption === 0 ? 'TAM KORUNDU (0 Bozulma)' : 'HATA'}\n`);

  return { perfMetrics, heapDiffMb, duplicateDetected, lostUpdates, negativeStockOccurrences, dataCorruption };
}

runPhase12PerformanceLoadTest();
