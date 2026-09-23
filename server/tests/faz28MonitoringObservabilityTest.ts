import assert from 'assert';
import { MonitoringService } from '../services/monitoringService';

console.log('--- [FAZ 28] MONITORING & OBSERVABILITY TEST BAŞLIYOR ---');

let passed = 0;
let total = 0;

function test(name: string, fn: () => void) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

try {
  // Test 1: Başlangıç sıfırlama
  test('MonitoringService belleği sıfırlanabilir', () => {
    MonitoringService.resetForTesting();
    const metrics = MonitoringService.getAggregatedMetrics();
    assert.strictEqual(metrics.requests.total, 0);
    assert.strictEqual(metrics.requests.errorRatePercent, 0);
  });

  // Test 2: İstek kaydı ve durum dağılımı
  test('İstek kayıtları 2xx, 3xx, 4xx, 5xx olarak doğru ayrıştırılır', () => {
    MonitoringService.resetForTesting();
    MonitoringService.recordRequest('GET', '/api/invoices', 200, 45);
    MonitoringService.recordRequest('POST', '/api/invoices', 201, 120);
    MonitoringService.recordRequest('GET', '/api/customers/redirect', 302, 15);
    MonitoringService.recordRequest('GET', '/api/users/999', 404, 25);
    MonitoringService.recordRequest('POST', '/api/sync', 500, 250);

    const metrics = MonitoringService.getAggregatedMetrics();
    assert.strictEqual(metrics.requests.total, 5);
    assert.strictEqual(metrics.requests.statusBreakdown['2xx'], 2);
    assert.strictEqual(metrics.requests.statusBreakdown['3xx'], 1);
    assert.strictEqual(metrics.requests.statusBreakdown['4xx'], 1);
    assert.strictEqual(metrics.requests.statusBreakdown['5xx'], 1);
  });

  // Test 3: Hata oranı yüzdesi hesaplaması
  test('Hata oranı yüzdesi (5xx) doğru hesaplanır', () => {
    const metrics = MonitoringService.getAggregatedMetrics();
    // 1 tane 500 / 5 toplam = %20.0
    assert.strictEqual(metrics.requests.errorRatePercent, 20);
    assert.strictEqual(metrics.requests.clientErrorRatePercent, 20);
  });

  // Test 4: Gecikme süreleri (ortalama, max, p95) ve yavaş istekler
  test('Gecikme süreleri ve p95 istatistiği hesaplanır', () => {
    MonitoringService.resetForTesting();
    // 20 istek: 19 tanesi 10ms, 1 tanesi 1500ms (yavaş istek)
    for (let i = 0; i < 19; i++) {
      MonitoringService.recordRequest('GET', '/api/fast', 200, 10);
    }
    MonitoringService.recordRequest('GET', '/api/slow', 200, 1500);

    const metrics = MonitoringService.getAggregatedMetrics();
    assert.strictEqual(metrics.requests.total, 20);
    assert.strictEqual(metrics.requests.slowRequestsCount, 1);
    assert.strictEqual(metrics.requests.latencyMs.max, 1500);
    // 20 elemanın %95'i index 19 (1500)
    assert.strictEqual(metrics.requests.latencyMs.p95, 1500);
    assert.ok(metrics.requests.latencyMs.avg > 80 && metrics.requests.latencyMs.avg < 90);
  });

  // Test 5: 5xx istekleri otomatik ERROR logu üretir
  test('HTTP 500 hatası otomatik ERROR yapılandırılmış log üretir', () => {
    MonitoringService.resetForTesting();
    MonitoringService.recordRequest('POST', '/api/fail', 500, 300, 'tnt-test');

    const logs = MonitoringService.getStructuredLogs({ category: 'ERROR' });
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, 'error');
    assert.strictEqual(logs[0].tenantId, 'tnt-test');
    assert.ok(logs[0].message.includes('500'));
  });

  // Test 6: Yapılandırılmış loglama ve kategori filtreleme
  test('Yapılandırılmış loglar kategoriye ve seviyeye göre filtrelenir', () => {
    MonitoringService.resetForTesting();
    MonitoringService.log('info', 'AUTH', 'Kullanıcı giriş yaptı', { userId: 'u1' });
    MonitoringService.log('warn', 'PAYMENT', 'Ödeme provizyon bekliyor', { details: { amount: 100 } });
    MonitoringService.log('error', 'SYSTEM', 'Disk doluluk uyarısı');

    const authLogs = MonitoringService.getStructuredLogs({ category: 'AUTH' });
    assert.strictEqual(authLogs.length, 1);
    assert.strictEqual(authLogs[0].message, 'Kullanıcı giriş yaptı');

    const warnLogs = MonitoringService.getStructuredLogs({ level: 'warn' });
    assert.strictEqual(warnLogs.length, 1);
    assert.strictEqual(warnLogs[0].category, 'PAYMENT');
  });

  // Test 7: Log arama (search query) filtresi
  test('Log arama metne göre filtreler', () => {
    const searchResult = MonitoringService.getStructuredLogs({ search: 'provizyon' });
    assert.strictEqual(searchResult.length, 1);
    assert.strictEqual(searchResult[0].category, 'PAYMENT');
  });

  // Test 8: Login denemeleri izleme ve top failed IPs
  test('Login denemeleri başarı, başarısızlık ve en çok hata alan IP olarak izlenir', () => {
    MonitoringService.resetForTesting();
    MonitoringService.recordAuthEvent('SUCCESS', 'admin', '192.168.1.10');
    MonitoringService.recordAuthEvent('FAILED', 'hacker', '10.0.0.99', { reason: 'Şifre hatalı' });
    MonitoringService.recordAuthEvent('FAILED', 'hacker', '10.0.0.99', { reason: 'Şifre hatalı' });
    MonitoringService.recordAuthEvent('RATE_LIMIT', 'hacker', '10.0.0.99', { reason: 'Rate limit aşıldı' });
    MonitoringService.recordAuthEvent('FAILED', 'user2', '10.0.0.50', { reason: 'Kullanıcı yok' });

    const stats = MonitoringService.getLoginStats();
    assert.strictEqual(stats.totalRecorded, 5);
    assert.strictEqual(stats.successCount, 1);
    assert.strictEqual(stats.failCount, 3);
    assert.strictEqual(stats.rateLimitCount, 1);
    assert.strictEqual(stats.topFailedIps[0].ip, '10.0.0.99');
    assert.strictEqual(stats.topFailedIps[0].failedAttempts, 3);
  });

  // Test 9: Webhook olayları ve sağlayıcı bazlı istatistikler
  test('Webhook olayları sağlayıcı bazında ayrıştırılır ve durumları kaydedilir', () => {
    MonitoringService.resetForTesting();
    MonitoringService.recordWebhookEvent('hizli', '/api/v1/integrations/hizli/webhook', 'SUCCESS', 'Fatura onaylandı');
    MonitoringService.recordWebhookEvent('hizli', '/api/v1/integrations/hizli/webhook', 'INVALID_SIGNATURE', 'İmza uyuşmadı');
    MonitoringService.recordWebhookEvent('mock-payment', '/api/v1/payments/webhook', 'SUCCESS', 'Tahsilat alındı');
    MonitoringService.recordWebhookEvent('mock-payment', '/api/v1/payments/webhook', 'REJECTED', 'Secret yok');

    const stats = MonitoringService.getWebhookStats();
    assert.strictEqual(stats.totalRecorded, 4);
    assert.strictEqual(stats.byProvider['hizli'].total, 2);
    assert.strictEqual(stats.byProvider['hizli'].success, 1);
    assert.strictEqual(stats.byProvider['hizli'].invalidSignature, 1);

    assert.strictEqual(stats.byProvider['mock-payment'].total, 2);
    assert.strictEqual(stats.byProvider['mock-payment'].success, 1);
    assert.strictEqual(stats.byProvider['mock-payment'].failed, 1);
  });

  // Test 10: Sistem bellek ve uptime metrikleri
  test('Sistem uptime ve bellek bilgisi eksiksiz döner', () => {
    const metrics = MonitoringService.getAggregatedMetrics();
    assert.ok(typeof metrics.system.uptimeSeconds === 'number');
    assert.ok(metrics.system.memoryMb.heapUsed > 0);
    assert.ok(metrics.system.memoryMb.rss > 0);
  });

  console.log(`\n✅ [FAZ 28 TEST SONUCU] ${passed}/${total} test BAŞARIYLA GEÇTİ!`);
} finally {
  MonitoringService.resetForTesting();
}
