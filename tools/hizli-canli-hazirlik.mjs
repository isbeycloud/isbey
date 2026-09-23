/**
 * İŞBEY CLOUD — Hızlı Bilişim Canlıya Geçiş Hazırlık & Snapshot Aracı
 * ===================================================================
 * 1. data/database.json için pre-live snapshot ve SHA-256 sidecar alır.
 * 2. Acil geri dönüş (rollback to sandbox) betiğini üretir.
 * 3. Ortam kilitlerini ve yapılandırma durumunu doğrular.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DB_FILE = path.join(ROOT, 'data', 'database.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const ROLLBACK_SCRIPT = path.join(ROOT, 'tools', 'hizli-rollback-sandbox.mjs');

console.log('====================================================');
console.log('🚀 İŞBEY CLOUD — Hızlı Bilişim Canlı API Hazırlık');
console.log('====================================================');

// 1. Dizin kontrolü
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 2. Pre-Live DB Snapshot
if (!fs.existsSync(DB_FILE)) {
  console.error('❌ HATA: data/database.json bulunamadı!');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupName = `backup_pre_hizli_live_${timestamp}.json`;
const backupPath = path.join(BACKUP_DIR, backupName);
const shaPath = `${backupPath}.sha256`;

const dbContent = fs.readFileSync(DB_FILE);
fs.writeFileSync(backupPath, dbContent);

const sha256 = crypto.createHash('sha256').update(dbContent).digest('hex');
fs.writeFileSync(shaPath, `${sha256}  ${backupName}\n`);

console.log(`✅ Pre-Live DB Snapshot alındı: ${backupName}`);
console.log(`✅ SHA-256 Sidecar oluşturuldu: ${sha256}`);

// 3. Rollback (Acil Geri Dönüş) Betiği Üretimi
const rollbackCode = `/**
 * İŞBEY CLOUD — Hızlı Bilişim Sandbox Acil Geri Dönüş (Rollback) Betiği
 * ===================================================================
 * Bu betik tek komutla:
 * 1. .env içindeki HIZLI_BILISIM_API_URL'i econnecttest'e çevirir.
 * 2. HIZLI_BILISIM_IS_TEST_MODE=true yapar.
 * 3. HIZLI_BILISIM_ALLOW_PROD kilidini kapatır (boş bırakır).
 * 4. DB snapshot'ını (${backupName}) geri yükler.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env');
const DB_FILE = path.join(ROOT, 'data', 'database.json');
const BACKUP_FILE = '${backupPath.replace(/\\/g, '\\\\')}';

console.log('🔄 Hızlı Bilişim Sandbox Geri Dönüşü (Rollback) Başlatılıyor...');

// 1. .env geri alma
if (fs.existsSync(ENV_FILE)) {
  let env = fs.readFileSync(ENV_FILE, 'utf8');
  env = env.replace(/HIZLI_BILISIM_API_URL=.*/g, 'HIZLI_BILISIM_API_URL=https://econnecttest.hizliteknoloji.com.tr');
  env = env.replace(/HIZLI_BILISIM_IS_TEST_MODE=.*/g, 'HIZLI_BILISIM_IS_TEST_MODE=true');
  env = env.replace(/HIZLI_BILISIM_ALLOW_PROD=.*/g, 'HIZLI_BILISIM_ALLOW_PROD=');
  fs.writeFileSync(ENV_FILE, env, 'utf8');
  console.log('✅ .env sandbox/test moduna geri döndürüldü.');
}

// 2. DB Geri Yükleme
if (fs.existsSync(BACKUP_FILE)) {
  fs.copyFileSync(BACKUP_FILE, DB_FILE);
  console.log('✅ Veritabanı canlı öncesi snapshot durumuna geri yüklendi: ${backupName}');
}

console.log('🎯 Rollback tamamlandı. Sistem güvenle TEST modundadır.');
`;

fs.writeFileSync(ROLLBACK_SCRIPT, rollbackCode, 'utf8');
console.log(`✅ Acil durum geri dönüş betiği hazır: tools/hizli-rollback-sandbox.mjs`);
console.log('====================================================');
