/**
 * İŞBEY CLOUD — Hızlı Bilişim canlıdan sandbox'a yerel geri alma aracı
 *
 * Bu araç SADECE yerel yapılandırmayı ve yerel JSON veritabanını geri alır.
 * Sağlayıcıda kesilmiş/iptal edilmiş belgeleri veya kontör hareketlerini geri almaz.
 * Önce varsayılan kuru çalışmayı inceleyin. Uygulama manuel olarak durdurulmuş
 * olmalı ve uygulama için iki açık onay bayrağı birlikte verilmelidir.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env');
const DB_FILE = path.join(ROOT, 'data', 'database.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'rollback-snapshots');
const TEST_HOST = 'https://econnecttest.hizliteknoloji.com.tr';
const args = process.argv.slice(2);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function usage() {
  console.log('Kullanım:');
  console.log('  node tools/hizli-rollback-sandbox.mjs');
  console.log('  node tools/hizli-rollback-sandbox.mjs --execute --service-stopped [--backup <dosya-adı>]');
}

function parseArgs() {
  const result = { execute: false, serviceStopped: false, backupName: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--execute') result.execute = true;
    else if (arg === '--service-stopped') result.serviceStopped = true;
    else if (arg === '--backup') {
      result.backupName = args[index + 1] ?? null;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      return null;
    } else {
      fail(`Bilinmeyen parametre: ${arg}`);
      return null;
    }
  }
  if (result.backupName && path.basename(result.backupName) !== result.backupName) {
    fail('--backup sadece data/backups altındaki dosya adını kabul eder.');
    return null;
  }
  return result;
}

function resolveBackup(name) {
  if (name) return path.join(BACKUP_DIR, name);
  const candidates = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR)
      .filter((file) => /^backup_pre_hizli_live_.*\.json$/i.test(file))
      .map((file) => ({ file, mtime: fs.statSync(path.join(BACKUP_DIR, file)).mtimeMs }))
      .sort((left, right) => right.mtime - left.mtime)
    : [];
  return candidates.length ? path.join(BACKUP_DIR, candidates[0].file) : null;
}

function verifyBackup(backupFile) {
  if (!backupFile || !fs.existsSync(backupFile)) throw new Error('Geri yüklenecek backup bulunamadı.');
  if (path.resolve(path.dirname(backupFile)) !== path.resolve(BACKUP_DIR)) {
    throw new Error('Backup data/backups dizininin dışında olamaz.');
  }

  const content = fs.readFileSync(backupFile);
  JSON.parse(content.toString('utf8'));
  const checksumFile = `${backupFile}.sha256`;
  if (!fs.existsSync(checksumFile)) throw new Error(`Checksum dosyası bulunamadı: ${path.basename(checksumFile)}`);

  const expected = fs.readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0].toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(content) !== expected) {
    throw new Error('Backup checksum doğrulaması başarısız.');
  }
  return content;
}

function setEnvValue(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(contents) ? contents.replace(pattern, line) : `${contents.replace(/\s*$/, '')}\n${line}\n`;
}

function sandboxEnv(contents) {
  let result = contents;
  result = setEnvValue(result, 'HIZLI_BILISIM_API_URL', TEST_HOST);
  result = setEnvValue(result, 'HIZLI_BILISIM_IS_TEST_MODE', 'true');
  result = setEnvValue(result, 'HIZLI_BILISIM_ALLOW_PROD', '');
  return result;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const options = parseArgs();
if (options) {
  try {
    const backupFile = resolveBackup(options.backupName);
    const backupContent = verifyBackup(backupFile);
    const backupName = path.basename(backupFile);
    const envPresent = fs.existsSync(ENV_FILE);
    const dbPresent = fs.existsSync(DB_FILE);

    console.log('🔎 Hızlı Bilişim geri alma ön kontrolü');
    console.log(`   Backup: ${backupName} (checksum doğrulandı)`);
    console.log(`   .env mevcut: ${envPresent ? 'evet' : 'hayır'}`);
    console.log(`   Yerel DB mevcut: ${dbPresent ? 'evet' : 'hayır'}`);
    console.log(`   Hedef: HIZLI_BILISIM_API_URL=${TEST_HOST}, IS_TEST_MODE=true, ALLOW_PROD=boş`);
    console.log('   Not: Bu araç entegratördeki belgeleri, ETTN durumunu veya kontörü geri almaz.');

    if (!options.execute) {
      console.log('✅ Kuru çalışma tamamlandı. Uygulamak için servis durdurulduktan sonra --execute --service-stopped kullanın.');
    } else if (!options.serviceStopped) {
      fail('Uygulama için --service-stopped onayı olmadan geri alma uygulanmaz.');
    } else if (!envPresent || !dbPresent) {
      fail('.env ve data/database.json mevcut olmadan geri alma uygulanmaz.');
    } else {
      const currentEnv = fs.readFileSync(ENV_FILE, 'utf8');
      const nextEnv = sandboxEnv(currentEnv);
      const runId = timestamp();
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
      const dbSafetyCopy = path.join(SNAPSHOT_DIR, `database.before-hizli-rollback-${runId}.json`);
      const envSafetyCopy = path.join(SNAPSHOT_DIR, `env.before-hizli-rollback-${runId}`);
      fs.copyFileSync(DB_FILE, dbSafetyCopy);
      fs.copyFileSync(ENV_FILE, envSafetyCopy);

      const envTemporary = `${ENV_FILE}.hizli-rollback-${process.pid}.tmp`;
      const dbTemporary = `${DB_FILE}.hizli-rollback-${process.pid}.tmp`;
      try {
        fs.writeFileSync(envTemporary, nextEnv, 'utf8');
        fs.writeFileSync(dbTemporary, backupContent);
        fs.copyFileSync(envTemporary, ENV_FILE);
        fs.copyFileSync(dbTemporary, DB_FILE);
      } finally {
        if (fs.existsSync(envTemporary)) fs.unlinkSync(envTemporary);
        if (fs.existsSync(dbTemporary)) fs.unlinkSync(dbTemporary);
      }

      const manifest = {
        executedAt: new Date().toISOString(),
        backup: backupName,
        backupSha256: sha256(backupContent),
        databaseSafetyCopy: path.basename(dbSafetyCopy),
        environmentSafetyCopy: path.basename(envSafetyCopy),
        providerStateChanged: false,
      };
      fs.writeFileSync(path.join(SNAPSHOT_DIR, `hizli-rollback-${runId}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      console.log('✅ Yerel ayarlar sandbox moduna alındı ve yerel DB doğrulanmış backup ile geri yüklendi.');
      console.log(`   Güvenlik kopyaları: ${path.relative(ROOT, SNAPSHOT_DIR)}`);
      console.log('⚠️ Servisi başlatmadan önce canlıda oluşan ETTN ve kontör hareketlerini prosedüre göre mutabıklaştırın.');
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
