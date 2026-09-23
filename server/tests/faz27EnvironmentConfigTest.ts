import assert from 'assert';
import path from 'path';
import {
  getEnvironment,
  isProduction,
  isStaging,
  isDevelopment,
  isTest,
  getDatabasePath,
  validateEnvironmentConfig
} from '../config/environment';

console.log('--- [FAZ 27] ENVIRONMENT & CONFIG TEST BAŞLIYOR ---');

const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
}

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
  // Test 1: getEnvironment & predicates default
  test('Ortam varsayılanı development veya geçerli tespit edilir', () => {
    delete process.env.NODE_ENV;
    assert.strictEqual(getEnvironment(), 'development');
    assert.strictEqual(isDevelopment(), true);
    assert.strictEqual(isProduction(), false);
  });

  // Test 2: Staging ortamı
  test('NODE_ENV=staging algılanır', () => {
    process.env.NODE_ENV = 'staging';
    assert.strictEqual(getEnvironment(), 'staging');
    assert.strictEqual(isStaging(), true);
  });

  // Test 3: Production ortamı
  test('NODE_ENV=production algılanır', () => {
    process.env.NODE_ENV = 'production';
    assert.strictEqual(getEnvironment(), 'production');
    assert.strictEqual(isProduction(), true);
  });

  // Test 4: Explicit DATABASE_PATH
  test('Explicit DATABASE_PATH önceliklidir', () => {
    process.env.DATABASE_PATH = 'custom/test-db.json';
    const resolved = getDatabasePath();
    assert.strictEqual(resolved, path.resolve(process.cwd(), 'custom/test-db.json'));
    delete process.env.DATABASE_PATH;
  });

  // Test 5: Default database path fallback
  test('DATABASE_PATH tanımsızken default path döner', () => {
    delete process.env.DATABASE_PATH;
    process.env.NODE_ENV = 'development';
    const resolved = getDatabasePath();
    assert.strictEqual(resolved, path.join(process.cwd(), 'data', 'database.json'));
  });

  // Test 6: Development ortamında validation başarılıdır
  test('Development ortamında default doğrulama geçer', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.HIZLI_BILISIM_ALLOW_PROD;
    const res = validateEnvironmentConfig();
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.errors.length, 0);
  });

  // Test 7: Production ortamında zayıf JWT secret reddedilir (fail-closed)
  test('Production ortamında zayıf JWT_SECRET fail-closed üretir', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short';
    process.env.WEBHOOK_SECRET = 'valid-long-webhook-secret-1234';
    const res = validateEnvironmentConfig();
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some(e => e.includes('JWT_SECRET')));
  });

  // Test 8: Production ortamında eksik WEBHOOK_SECRET reddedilir
  test('Production ortamında eksik WEBHOOK_SECRET fail-closed üretir', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-very-long-and-secure-jwt-production-secret-key-32-chars';
    delete process.env.WEBHOOK_SECRET;
    const res = validateEnvironmentConfig();
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some(e => e.includes('WEBHOOK_SECRET')));
  });

  // Test 9: Production ortamında güçlü konfigürasyon geçer
  test('Production ortamında geçerli anahtarlar doğrulamayı geçer', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'production-random-secure-jwt-secret-9876543210123456';
    process.env.WEBHOOK_SECRET = 'production-secure-webhook-secret-98765';
    process.env.HIZLI_BILISIM_ALLOW_PROD = 'true';
    const res = validateEnvironmentConfig();
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.errors.length, 0);
  });

  // Test 10: Non-prod ortamda canlı Hızlı Bilişim kapısı uyarı üretir
  test('Development ortamında HIZLI_BILISIM_ALLOW_PROD uyarı verir', () => {
    process.env.NODE_ENV = 'development';
    process.env.HIZLI_BILISIM_ALLOW_PROD = 'true';
    const res = validateEnvironmentConfig();
    assert.ok(res.warnings.some(w => w.includes('HIZLI_BILISIM_ALLOW_PROD')));
  });

  console.log(`\n✅ [FAZ 27 TEST SONUCU] ${passed}/${total} test BAŞARIYLA GEÇTİ!`);
} finally {
  resetEnv();
}
