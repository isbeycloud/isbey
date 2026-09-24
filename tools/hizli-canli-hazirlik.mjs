/** Read-only offline preflight: no network, DB initialization or live-mode changes. */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabasePath } from '../server/config/environment.ts';
import { productionReadinessErrors } from '../server/config/productionReadiness.ts';
const checks = [];
const check = (id, pass, message) => checks.push({ id, status: pass ? 'PASS' : 'BLOCKED', message });
let db;
try { db = JSON.parse(fs.readFileSync(getDatabasePath(), 'utf8')); } catch { /* Never seed. */ }
check('database', !!db, 'Yapılandırılmış veritabanı okunabilir olmalı.');
const present = v => typeof v === 'string' && v.trim().length > 0 && !/^(YOUR_|CHANGE_|your-|000000)/i.test(v);
check('api-key', present(process.env.HIZLI_BILISIM_API_KEY), 'Hızlı Bilişim API anahtarı tanımlı olmalı.');
check('secret-key', present(process.env.HIZLI_BILISIM_SECRET_KEY), 'UtilEncrypt anahtarı tanımlı olmalı.');
check('credential-key', present(process.env.CREDENTIAL_ENCRYPTION_KEY), 'Kalıcı kasa anahtarı ve güvenli yedeği hazırlanmalı; mevcut anahtarı rastgele değiştirmeyin.');
for (const error of productionReadinessErrors()) check('production', false, error);
const settings = (db?.tenantEinvoiceSettings || []).filter(s => ['HIZLI', 'HIZLI_TEKNOLOJI'].includes(s.providerId));
check('firms', settings.length > 0, 'En az bir firma için Hızlı Bilişim ayarı bulunmalı.');
const firms = settings.map(s => {
  const t = db.tenants?.find(t => t.id === s.tenantId && !t.isArchived);
  const credentials = present(s.username) && present(s.encryptedPassword);
  const fallback = present(process.env.HIZLI_BILISIM_WS_USERNAME) && present(process.env.HIZLI_BILISIM_WS_PASSWORD) && /^\d{10,11}$/.test(process.env.HIZLI_BILISIM_VKN || '') && s.senderIdentifier === process.env.HIZLI_BILISIM_VKN;
  check(`firm:${s.tenantId}:identity`, !!t && /^\d{10,11}$/.test(t.taxNumber || '') && t.taxNumber === s.senderIdentifier, 'Firma ve entegratör gönderici VKN/TCKN eşleşmeli.');
  check(`firm:${s.tenantId}:credentials`, !!(credentials || fallback), 'Firma web servis kimliği veya eşleşen merkez firma hesabı gerekli.');
  check(`firm:${s.tenantId}:aliases`, !!s.senderAliasGB && !!s.senderAliasPK, 'Posta kutusu etiketleri sağlayıcıyla doğrulanmalı.');
  if (s.encryptedPassword) check(`firm:${s.tenantId}:vault`, s.encryptedPassword.startsWith('enc:v1:'), 'Firma parolası AES-GCM kasasında saklanmalı.');
  return { tenantId: s.tenantId, environment: s.environment, integrationEnabled: !!s.integrationEnabled, status: s.status };
});
check('vendor-acceptance', false, 'GİB kullanıcı sorgusu, etiket/seri doğrulaması, belge kabulü ve kontör mutabakatı için güncel sağlayıcı kanıtı gerekli.');
check('deployment-acceptance', false, 'Hedef sunucu HTTPS, benzersiz yönetici parolası, yedekten dönüş ve canlı geçiş onayı ayrıca doğrulanmalı.');
const report = { generatedAt: new Date().toISOString(), mode: 'OFFLINE_READ_ONLY', readyForLive: false,
  liveFlags: { allowProduction: process.env.HIZLI_BILISIM_ALLOW_PROD === 'true', testMode: process.env.HIZLI_BILISIM_IS_TEST_MODE !== 'false', integrationJobs: process.env.INTEGRATION_JOBS_ENABLED === 'true' }, firms, checks };
const index = process.argv.indexOf('--output');
if (index >= 0) {
  const arg = process.argv[index + 1];
  if (!arg) throw new Error('--output için rapor dosyası belirtin.');
  const target = path.resolve(arg), root = path.resolve('.verify-tmp');
  if (!target.startsWith(root + path.sep) || !target.endsWith('.json')) throw new Error('Rapor yalnız .verify-tmp altında JSON dosyasına yazılabilir.');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = checks.some(c => c.status === 'BLOCKED') ? 1 : 0;
