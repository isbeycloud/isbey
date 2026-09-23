/**
 * İŞBEY CLOUD — Tek seferlik kimlik bilgisi migrasyonu (2026-09-14)
 * =================================================================
 * NEDEN VAR:
 *   `server/security/credentialVault.ts` yeni yazılan kimlik bilgilerini
 *   AES-256-GCM ile şifreliyor (`enc:v1:` önekli). Ancak `data/database.json`
 *   içinde ÖNCEDEN yazılmış kayıtlar hâlâ eski biçimde duruyor:
 *     - `tenantEinvoiceSettings[].encryptedPassword`  → base64 (şifreleme DEĞİL)
 *     - `tenantEinvoiceSettings[].apiKeyEncrypted`    → base64
 *     - `tenantEinvoiceSettings[].apiSecretEncrypted` → base64
 *     - `dealerCustomers[].portalCredentials.wsPassword` → DÜZ METİN
 *
 *   Okuma tarafı bu eski biçimleri anlıyor (geriye dönük uyum), ama kayıt
 *   dosyada hâlâ açık duruyor. Bu betik onları tek seferde yeni biçime taşır.
 *
 * NE YAPAR:
 *   - Yalnızca yukarıdaki alanları gezer; etiketsiz (`enc:v1:` olmayan) her
 *     değeri `migrateLegacyValue` ile şifreler.
 *   - İdempotenttir: zaten şifreli olan kayda dokunmaz; yazılacak değişiklik
 *     yoksa dosyayı HİÇ yazmaz.
 *
 * NEYE DOKUNMAZ:
 *   - Muhasebe / stok / KDV / cari / kasa / banka alanları.
 *   - `username`, `wsUsername`, `apiKey` gibi kullanıcı adı alanları (bunlar
 *     zaten kasa kapsamı dışıdır; yalnız ŞİFRELER şifrelenir).
 *   - Şema: alan adları bilinçli olarak korundu (salt okuma uyumu için).
 *
 * GÜVENLİK SINIRLARI:
 *   - NODE_ENV=production ise ÇALIŞMAZ.
 *   - Yazmadan önce `.verify-tmp/` altına zaman damgalı TAM yedek bırakır.
 *   - Yazma atomiktir: temp dosya + renameSync.
 *   - Çıktıda HİÇBİR kimlik bilgisi / anahtar materyali yazılmaz — yalnız sayılar.
 *   - Kasa anahtarı yoksa (JWT_SECRET ve CREDENTIAL_ENCRYPTION_KEY ikisi de yok)
 *     betik HİÇBİR ŞEY yazmaz, açık hatayla durur (fail-closed).
 *
 * KULLANIM (repo kökünden, sunucu KAPALIYKEN):
 *   npx tsx tools/credential-migration.ts            # kuru çalıştırma (yalnız rapor)
 *   npx tsx tools/credential-migration.ts --apply    # gerçekten yaz
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  isEncrypted,
  isLegacyValue,
  migrateLegacyValue,
  vaultStatus,
} from '../server/security/credentialVault';

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'data', 'database.json');
const TMP_DIR = path.join(ROOT, '.verify-tmp');

const APPLY = process.argv.includes('--apply');

/**
 * tenantEinvoiceSettings üzerinde şifrelenmesi gereken alanlar.
 *
 * `hint` alanın ESKİDEN hangi biçimde yazıldığını söyler — bu ZORUNLUDUR,
 * çünkü sezgisel çözüm ('auto') base64 alfabesinden oluşan bir düz metin
 * şifreyi yanlış çözüp kalıcı olarak bozabilir. Bu üç alan
 * `Buffer.from(x).toString('base64')` ile yazılıyordu → 'base64'.
 */
const SETTINGS_SECRET_FIELDS: ReadonlyArray<{ field: string; hint: 'base64' }> = [
  { field: 'encryptedPassword', hint: 'base64' },
  { field: 'apiKeyEncrypted', hint: 'base64' },
  { field: 'apiSecretEncrypted', hint: 'base64' },
];

interface Counters {
  settingsScanned: number;
  settingsMigrated: Record<string, number>;
  dealerScanned: number;
  dealerMigrated: number;
}

function log(etiket: string, mesaj: string): void {
  console.log(`${etiket} ${mesaj}`);
}

if (process.env.NODE_ENV === 'production') {
  log('MIGRASYON-HATA', 'NODE_ENV=production — bu araç üretimde çalışmaz.');
  process.exit(1);
}

if (!fs.existsSync(DATA_FILE)) {
  log('MIGRASYON-HATA', `Veritabanı bulunamadı: ${DATA_FILE}`);
  process.exit(1);
}

// ─── 0) Kasa anahtarı var mı? (fail-closed) ─────────────────────────────────
const status = vaultStatus();
if (!status.available) {
  // 'misconfigured' ile 'none' AYRI mesaj alır: ikisi de aynı sonucu (hiçbir şey
  // yazma) doğurur ama nedeni farklıdır ve yanlış teşhis saatler kaybettirir.
  log('MIGRASYON-HATA', status.keySource === 'misconfigured'
    ? 'CREDENTIAL_ENCRYPTION_KEY tanımlı ancak 32 bayta çözümlenemedi (base64 44 / hex 64 karakter olmalı). ' +
      'Hiçbir şey yazılmadı.'
    : 'Kasa anahtarı yok (CREDENTIAL_ENCRYPTION_KEY ve JWT_SECRET ikisi de tanımsız). ' +
      'Hiçbir şey yazılmadı.');
  process.exit(1);
}
log('MIGRASYON-BİLGİ', `Kasa anahtarı kaynağı: ${status.keySource}`);

// ─── 1) Oku ────────────────────────────────────────────────────────────────
const raw = fs.readFileSync(DATA_FILE, 'utf8');
let db: any;
try {
  db = JSON.parse(raw);
} catch (err: any) {
  log('MIGRASYON-HATA', `Veritabanı JSON olarak okunamadı: ${err?.message}`);
  process.exit(1);
}

const counters: Counters = {
  settingsScanned: 0,
  settingsMigrated: Object.fromEntries(SETTINGS_SECRET_FIELDS.map(f => [f.field, 0])),
  dealerScanned: 0,
  dealerMigrated: 0,
};

// ─── 2) tenantEinvoiceSettings ─────────────────────────────────────────────
const settingsList: any[] = Array.isArray(db.tenantEinvoiceSettings) ? db.tenantEinvoiceSettings : [];
for (const settings of settingsList) {
  if (!settings || typeof settings !== 'object') continue;
  counters.settingsScanned++;
  for (const { field, hint } of SETTINGS_SECRET_FIELDS) {
    const current = settings[field];
    if (!isLegacyValue(current)) continue; // boş veya zaten şifreli
    const migrated = migrateLegacyValue(current, hint);
    if (migrated && migrated !== current) {
      settings[field] = migrated;
      counters.settingsMigrated[field]++;
    }
  }
}

// ─── 3) dealerCustomers[].portalCredentials.wsPassword ─────────────────────
const dealerCustomers: any[] = Array.isArray(db.dealerCustomers) ? db.dealerCustomers : [];
for (const customer of dealerCustomers) {
  if (!customer || typeof customer !== 'object') continue;
  const creds = customer.portalCredentials;
  if (!creds || typeof creds !== 'object') continue;
  counters.dealerScanned++;

  const current = creds.wsPassword;
  if (!isLegacyValue(current)) continue; // boş veya zaten şifreli
  // Bu alan eskiden DÜZ METİN yazılıyordu (hizli-bilisim.ts:1260 eski hâli).
  // 'plaintext' ipucu ZORUNLU: 'auto' sezgisi base64 alfabesinden oluşan bir
  // şifreyi (örn. "Test2024") yanlış çözüp kalıcı olarak bozardı.
  const migrated = migrateLegacyValue(current, 'plaintext');
  if (migrated && migrated !== current) {
    creds.wsPassword = migrated;
    counters.dealerMigrated++;
  }
}

// ─── 4) Rapor (kimlik bilgisi İÇERMEZ) ─────────────────────────────────────
const totalMigrated =
  Object.values(counters.settingsMigrated).reduce((a, b) => a + b, 0) + counters.dealerMigrated;

log('MIGRASYON-RAPOR', `tenantEinvoiceSettings taranan kayıt : ${counters.settingsScanned}`);
for (const { field } of SETTINGS_SECRET_FIELDS) {
  log('MIGRASYON-RAPOR', `  ${field.padEnd(20)} : ${counters.settingsMigrated[field]} taşındı`);
}
log('MIGRASYON-RAPOR', `dealerCustomers (portalCredentials)  : ${counters.dealerScanned} tarandı, ${counters.dealerMigrated} taşındı`);
log('MIGRASYON-RAPOR', `TOPLAM taşınan alan                : ${totalMigrated}`);

if (totalMigrated === 0) {
  log('MIGRASYON-BİLGİ', 'Taşınacak legacy kayıt yok — dosya DEĞİŞTİRİLMEDİ (idempotent).');
  process.exit(0);
}

if (!APPLY) {
  log('MIGRASYON-KURU', 'KURU ÇALIŞTIRMA — hiçbir şey yazılmadı. Yazmak için: --apply');
  process.exit(0);
}

// ─── 5) Yedek + atomik yazma ───────────────────────────────────────────────
fs.mkdirSync(TMP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(TMP_DIR, `database.pre-credential-migration.${stamp}.json`);
fs.copyFileSync(DATA_FILE, backupPath);
log('MIGRASYON-YEDEK', `Yedek alındı: ${path.relative(ROOT, backupPath)}`);

const tmpPath = `${DATA_FILE}.tmp`;
fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
fs.renameSync(tmpPath, DATA_FILE);

log('MIGRASYON-TAMAM', `${totalMigrated} alan AES-256-GCM biçimine taşındı.`);
