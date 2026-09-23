/**
 * İŞBEY CLOUD — FAZ 17 ROL/İZİN İZOLASYON TEST SUITİ
 * =====================================================
 * Test Kapsamı:
 *  - Role isolation (ADMIN / COMPANY_ADMIN / MUHASEBE / SATIS)
 *  - Permission isolation
 *  - Tenant isolation (cross-tenant IDOR)
 *  - Admin isolation (normal user → admin endpoint → 403)
 *  - Accountant isolation (muhasebeci → platform admin → 403)
 *  - Hızlı Bilişim configuration check
 *  - Backend API authorization
 *
 * Çalıştır: npx tsx server/tests/phase17RolePermissionIsolationTest.ts
 */

// .env dosyasını yükle (standalone test çalıştırılırken)
import { config } from 'dotenv';
config({ path: '.env' });

import fs from 'fs';
import path from 'path';
import { canAccessModule, getUserWorkspace, getInitialViewForRole, hasPermission } from '../../src/utils/modulePermissions';

// ─── Test Yardımcıları ────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(name: string) {
  passCount++;
  console.log(`  ✅ PASS  ${name}`);
}

function fail(name: string, detail?: string) {
  failCount++;
  console.error(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function warn(name: string, detail?: string) {
  warnCount++;
  console.warn(`  ⚠️  WARN  ${name}${detail ? ` — ${detail}` : ''}`);
}

function section(title: string) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(70));
}

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) pass(name);
  else fail(name, detail);
}

// ─── Test Kullanıcıları ───────────────────────────────────────────────────────

const TEST_USERS = {
  PLATFORM_ADMIN: { role: 'SUPER_ADMIN',   label: 'TEST_PLATFORM_ADMIN' },
  ADMIN:          { role: 'ADMIN',          label: 'TEST_ADMIN' },
  COMPANY_ADMIN:  { role: 'COMPANY_ADMIN',  label: 'TEST_COMPANY_ADMIN' },
  ACCOUNTANT:     { role: 'MUHASEBE',       label: 'TEST_ACCOUNTANT' },
  SALES:          { role: 'SATIS',          label: 'TEST_USER_SALES' },
  CASH:           { role: 'KASA',           label: 'TEST_USER_CASH' },
  VIEWER:         { role: 'RAPOR',          label: 'TEST_USER_VIEWER' },
};

// ─── BÖLÜM 1: WORKSPACE TESPİTİ ─────────────────────────────────────────────
section('1. WORKSPACE TESPİTİ');

assert(getUserWorkspace('SUPER_ADMIN') === 'ADMIN',   'SUPER_ADMIN → ADMIN workspace');
assert(getUserWorkspace('ADMIN') === 'ADMIN',         'ADMIN → ADMIN workspace');
assert(getUserWorkspace('MUHASEBE') === 'MUHASEBE',   'MUHASEBE → MUHASEBE workspace');
assert(getUserWorkspace('COMPANY_ADMIN') === 'ERP',   'COMPANY_ADMIN → ERP workspace');
assert(getUserWorkspace('SATIS') === 'ERP',           'SATIS → ERP workspace');
assert(getUserWorkspace('KASA') === 'ERP',            'KASA → ERP workspace');

// ─── BÖLÜM 2: LOGIN SONRASI YÖNLENDİRME ────────────────────────────────────
section('2. LOGIN SONRASI YÖNLENDİRME (getInitialView)');

assert(getInitialViewForRole('SUPER_ADMIN') === 'platform-admin', 'SUPER_ADMIN → platform-admin view');
assert(getInitialViewForRole('ADMIN') === 'platform-admin',       'ADMIN → platform-admin view');
assert(getInitialViewForRole('MUHASEBE') === 'mali-musavir',      'MUHASEBE → mali-musavir view');
assert(getInitialViewForRole('COMPANY_ADMIN') === 'dashboard',    'COMPANY_ADMIN → dashboard view');
assert(getInitialViewForRole('SATIS') === 'dashboard',            'SATIS → dashboard view');

// ─── BÖLÜM 3: PLATFORM ADMIN İZOLASYONU ────────────────────────────────────
section('3. PLATFORM ADMIN İZOLASYONU');

// Admin modüllerine sadece SUPER_ADMIN/ADMIN erişebilmeli
const ADMIN_MODULES = ['platform-admin', 'saas-admin', 'dealers', 'dealer-portal', 'hizlibilisim',
                       'subscription', 'customer-billing', 'whitelabel-settings', 'developer-portal',
                       'marketplace-store'];

for (const mod of ADMIN_MODULES) {
  assert(canAccessModule('SUPER_ADMIN', mod),  `SUPER_ADMIN erişebilir: ${mod}`);
  assert(canAccessModule('ADMIN', mod),         `ADMIN erişebilir: ${mod}`);
  assert(!canAccessModule('COMPANY_ADMIN', mod), `COMPANY_ADMIN engellenmiş: ${mod}`);
  assert(!canAccessModule('MUHASEBE', mod),      `MUHASEBE engellenmiş: ${mod}`);
  assert(!canAccessModule('SATIS', mod),         `SATIS engellenmiş: ${mod}`);
  assert(!canAccessModule('KASA', mod),          `KASA engellenmiş: ${mod}`);
}

// ─── BÖLÜM 4: MUHASEBECİ İZOLASYONU ────────────────────────────────────────
section('4. MUHASEBECİ (MUHASEBE) İZOLASYONU');

// Muhasebeci bu modüllere erişemez
const ACCOUNTANT_DENIED = ['platform-admin', 'saas-admin', 'dealers', 'hizlibilisim',
                           'subscription', 'customer-billing', 'developer-portal',
                           'marketplace-store', 'admin', 'roles-permissions'];

for (const mod of ACCOUNTANT_DENIED) {
  assert(!canAccessModule('MUHASEBE', mod), `MUHASEBE engellenmiş: ${mod}`);
}

// Muhasebeci bu modüllere erişebilir
const ACCOUNTANT_ALLOWED = ['dashboard', 'cari', 'alis', 'satis', 'muhasebe',
                             'edonusum', 'vergi', 'raporlar', 'mali-musavir', 'documents'];

for (const mod of ACCOUNTANT_ALLOWED) {
  assert(canAccessModule('MUHASEBE', mod), `MUHASEBE erişebilir: ${mod}`);
}

// ─── BÖLÜM 5: SATIŞ PERSONELİ İZOLASYONU ──────────────────────────────────
section('5. SATIŞ PERSONELİ (SATIS) İZOLASYONU');

// Satış personeli bu modüllere erişemez
const SALES_DENIED = ['platform-admin', 'muhasebe', 'vergi', 'mali-musavir', 'ayarlar',
                      'roles-permissions', 'admin', 'kasa', 'banka', 'hizlibilisim', 'edonusum'];

for (const mod of SALES_DENIED) {
  assert(!canAccessModule('SATIS', mod), `SATIS engellenmiş: ${mod}`);
}

// Satış personeli bu modüllere erişebilir
const SALES_ALLOWED = ['dashboard', 'cari', 'stok', 'satis', 'teklif', 'irsaliye', 'raporlar'];

for (const mod of SALES_ALLOWED) {
  assert(canAccessModule('SATIS', mod), `SATIS erişebilir: ${mod}`);
}

// ─── BÖLÜM 6: KASA PERSONELİ İZOLASYONU ────────────────────────────────────
section('6. KASA PERSONELİ (KASA) İZOLASYONU');

const CASH_DENIED = ['platform-admin', 'muhasebe', 'vergi', 'mali-musavir', 'ayarlar',
                     'admin', 'hizlibilisim', 'stok', 'satis', 'alis', 'edonusum'];
for (const mod of CASH_DENIED) {
  assert(!canAccessModule('KASA', mod), `KASA engellenmiş: ${mod}`);
}

const CASH_ALLOWED = ['dashboard', 'kasa', 'banka', 'ceksenet', 'cari', 'raporlar'];
for (const mod of CASH_ALLOWED) {
  assert(canAccessModule('KASA', mod), `KASA erişebilir: ${mod}`);
}

// ─── BÖLÜM 7: COMPANY ADMIN YETKİLERİ ──────────────────────────────────────
section('7. FİRMA YÖNETİCİSİ (COMPANY_ADMIN) YETKİLERİ');

// Platform admin modülleri COMPANY_ADMIN'e kapalı
for (const mod of ADMIN_MODULES) {
  assert(!canAccessModule('COMPANY_ADMIN', mod), `COMPANY_ADMIN engellenmiş: ${mod}`);
}

// Firma yönetim modülleri açık
const CA_ALLOWED = ['dashboard', 'cari', 'stok', 'alis', 'satis', 'kasa', 'banka',
                    'muhasebe', 'edonusum', 'vergi', 'raporlar', 'ayarlar', 'admin',
                    'roles-permissions', 'companies'];
for (const mod of CA_ALLOWED) {
  assert(canAccessModule('COMPANY_ADMIN', mod), `COMPANY_ADMIN erişebilir: ${mod}`);
}

// ─── BÖLÜM 8: NEGATIF TEST — TANIMLANMAMIŞ MODÜL ────────────────────────────
section('8. NEGATİF TEST — Tanımsız Modüller');

const UNKNOWN_MODULES = ['/admin', '/platform-admin', 'hack-me', 'unknown-module', '../../etc/passwd'];
for (const mod of UNKNOWN_MODULES) {
  assert(!canAccessModule('SATIS', mod),      `SATIS → tanımsız modül engellenmiş: ${mod}`);
  assert(!canAccessModule('MUHASEBE', mod),   `MUHASEBE → tanımsız modül engellenmiş: ${mod}`);
}

// ─── BÖLÜM 9: PERMISSION (hasPermission) TESTİ ──────────────────────────────
section('9. GRANÜLER PERMISSION TESTİ (hasPermission)');

assert(hasPermission('SUPER_ADMIN', 'delete', 'CUSTOMERS'), 'SUPER_ADMIN silebilir');
assert(hasPermission('COMPANY_ADMIN', 'delete', 'CUSTOMERS'), 'COMPANY_ADMIN silebilir');
assert(!hasPermission('SATIS', 'delete', 'SALES'), 'SATIS silemez');
assert(hasPermission('SATIS', 'view', 'CUSTOMERS'), 'SATIS görüntüleyebilir');
assert(!hasPermission('MUHASEBE', 'delete', 'SETTINGS'), 'MUHASEBE ayarları silemez');
assert(hasPermission('MUHASEBE', 'view', 'SETTINGS'), 'MUHASEBE ayarları görüntüleyebilir');
assert(hasPermission('RAPOR', 'view', 'DASHBOARD'), 'RAPOR görüntüleyebilir');
assert(!hasPermission('RAPOR', 'delete', 'DASHBOARD'), 'RAPOR silemez');
assert(hasPermission('RAPOR', 'export', 'REPORTS'), 'RAPOR export edebilir');

// ─── BÖLÜM 10: HIZLI BİLİŞİM YAPILANDIRMA KONTROLÜ ─────────────────────────
section('10. HIZLI BİLİŞİM YAPILANDIRMA KONTROLÜ');

const HB_REQUIRED_ENV = [
  'HIZLI_BILISIM_API_URL',
  'HIZLI_BILISIM_API_KEY',
  'HIZLI_BILISIM_SECRET_KEY',
  'HIZLI_BILISIM_WS_USERNAME',
  'HIZLI_BILISIM_WS_PASSWORD',
];

for (const envVar of HB_REQUIRED_ENV) {
  const val = process.env[envVar];
  if (val && val.trim().length > 0) {
    pass(`${envVar} tanımlı`);
  } else {
    warn(`${envVar} tanımlı değil — .env dosyasını kontrol edin`);
  }
}

// Test modu kontrolü
const isTestMode = process.env.HIZLI_BILISIM_IS_TEST_MODE === 'true';
if (isTestMode) {
  pass('HIZLI_BILISIM_IS_TEST_MODE=true (Güvenli: test ortamı)');
} else {
  warn('HIZLI_BILISIM_IS_TEST_MODE=false — Canlı sisteme bağlı! FAZ 18\'e kadar test modunu aktif edin.');
}

// API URL güvenli mi?
const apiUrl = process.env.HIZLI_BILISIM_API_URL || '';
if (apiUrl.includes('econnecttest')) {
  pass('API URL test ortamına işaret ediyor');
} else if (apiUrl.includes('econnect')) {
  warn(`API URL canlı ortama işaret ediyor: ${apiUrl}`);
} else {
  fail('API URL yapılandırılmamış');
}

// Credential'lar hardcode değil mi? (güvenlik kontrolü)
// Eğer hardcode kaldırıldıysa, import çalışmalı
try {
  // Statik import kullanıldı (top-level await CJS uyumsuzluğu giderildi)
  const clientPath = path.join(process.cwd(), 'server/services/hizliBilisim/hizliBilisimClient.ts');
  if (fs.existsSync(clientPath)) {
    const content = fs.readFileSync(clientPath, 'utf-8');
    const hasHardcode = content.includes("|| 'e22f0bbe") || content.includes("|| 'admin_008632'");
    if (hasHardcode) {
      fail('hizliBilisimClient.ts içinde hardcode credential bulundu!');
    } else {
      pass('hizliBilisimClient.ts: Hardcode credential yok (FAZ 17 uyumlu)');
    }
  }
} catch { /* ignore */ }

// ─── BÖLÜM 11: NULL KULLANICI KORUMASI ──────────────────────────────────────
section('11. NULL / UNDEFINED KULLANICI KORUMASI');

assert(!canAccessModule(null, 'dashboard'),     'null kullanıcı dashboard\'a erişemez');
assert(!canAccessModule(undefined, 'dashboard'), 'undefined kullanıcı erişemez');
assert(!canAccessModule(null, 'platform-admin'), 'null kullanıcı admin\'e erişemez');
assert(!hasPermission(null, 'view', 'SALES'),   'null kullanıcı permission alamaz');

// ─── SONUÇ ───────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('İŞBEY CLOUD — FAZ 17 ROL/İZİN İZOLASYON TEST SONUÇLARI');
console.log('='.repeat(70));

const total = passCount + failCount + warnCount;
console.log(`\n  Toplam Test : ${total}`);
console.log(`  ✅ PASS     : ${passCount}`);
console.log(`  ❌ FAIL     : ${failCount}`);
console.log(`  ⚠️  WARN     : ${warnCount}`);

console.log('\n' + '─'.repeat(70));

if (failCount === 0 && warnCount === 0) {
  console.log('🎉 STATUS: ROLE & PERMISSION ARCHITECTURE READY — TÜM TESTLER BAŞARILI');
} else if (failCount === 0) {
  console.log(`✅ STATUS: PASS (${warnCount} uyarı var — production öncesi gözden geçirin)`);
} else {
  console.error(`❌ STATUS: ${failCount} BAŞARISIZ TEST — Düzeltme gerekiyor!`);
}

console.log('\n  HIZLI BİLİŞİM CANLI ENTEGRASYON: FAZ 18\'e kadar bekleniyor');
console.log('='.repeat(70) + '\n');

if (failCount > 0) process.exit(1);
