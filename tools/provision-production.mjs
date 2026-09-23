import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { register } from 'tsx/esm/api';

register();
const { createProductionDefaults } = await import('../server/db/productionDefaults.ts');
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node tools/provision-production.mjs <new-private-directory>');
const target = path.resolve(directory);
if (fs.existsSync(target)) throw new Error('Refusing to replace an existing directory or database.');
fs.mkdirSync(target, { recursive: true, mode: 0o700 });
const now = new Date().toISOString();
const end = new Date(Date.now() + 365 * 86400000).toISOString();
const tenantId = crypto.randomUUID();
const userId = crypto.randomUUID();
const password = crypto.randomBytes(24).toString('base64url');
const state = createProductionDefaults();
state.company = { ...state.company, id: tenantId, name: 'İŞBEY CLOUD', title: 'İŞBEY CLOUD' };
state.activeTenantId = tenantId;
state.tenants = [{ id: tenantId, companyCode: 'ISB-000001', name: state.company.name,
  title: state.company.title, slug: 'merkez', taxNumber: '', taxOffice: '', email: '', phone: '',
  plan: 'ENTERPRISE', status: 'ACTIVE', maxUsers: 25, currentUsers: 1, maxInvoicesPerMonth: 10000,
  eInvoiceCredits: 0, storageLimitMb: 5120, storageUsedMb: 0,
  activeModules: ['POS', 'STOK', 'CARI', 'FATURA', 'TEKLIF_SIPARIS', 'IRSALIYE', 'BANKA', 'KASA', 'CEK_SENET', 'PERSONEL', 'RAPORLAR', 'FORM_DESIGNER'],
  ownerName: 'Sistem Yöneticisi', ownerEmail: '', expiresAt: end, createdAt: now, updatedAt: now,
  license: { startDate: now, endDate: end, isTrial: false, trialDays: 0, status: 'ACTIVE' },
  erpSubscription: { startDate: now, endDate: end, expiryPolicy: 'READ_ONLY', updatedAt: now },
}];
state.users = [{ id: userId, username: 'admin', fullName: 'Sistem Yöneticisi', email: '',
  role: 'SUPER_ADMIN', passwordHash: bcrypt.hashSync(password, 12), active: true,
  companyId: tenantId, tenantId, allowedCompanyIds: [tenantId], createdAt: now }];
state.tenantConfigurations = { [tenantId]: { company: structuredClone(state.company),
  sequences: structuredClone(state.sequences), settings: structuredClone(state.settings) } };
const secret = () => crypto.randomBytes(48).toString('hex');
const env = {
  NODE_ENV: 'production', HOST: '0.0.0.0',
  JWT_SECRET: secret(), WEBHOOK_SECRET: secret(), PAYMENT_WEBHOOK_SECRET: secret(),
  CREDENTIAL_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  CORS_ALLOW_ORIGINS: 'https://bey360.com,https://www.bey360.com',
  LOCAL_DEV_ALLOW: 'false', TRUST_PROXY: 'loopback', ENABLE_HSTS: 'true',
  INTEGRATION_JOBS_ENABLED: 'false', HIZLI_BILISIM_ALLOW_PROD: 'false', HIZLI_BILISIM_IS_TEST_MODE: 'true',
  HIZLI_BILISIM_API_URL: 'https://econnecttest.hizliteknoloji.com.tr',
  HIZLI_BILISIM_WS_USERNAME: '', HIZLI_BILISIM_WS_PASSWORD: '', HIZLI_BILISIM_API_KEY: '',
  HIZLI_BILISIM_SECRET_KEY: '', BACKUP_RETENTION_COUNT: '20', BACKUP_RETENTION_DAYS: '30',
};
fs.writeFileSync(path.join(target, 'database.prod.json'), JSON.stringify(state, null, 2), { mode: 0o600 });
fs.writeFileSync(path.join(target, '.env'), Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
fs.writeFileSync(path.join(target, 'ADMIN-LOGIN.txt'), `Adres: https://bey360.com\nKullanıcı adı: admin\nŞifre: ${password}\n\nBu dosyayı GitHub veya FTP'ye yüklemeyin.\nFirma bilgilerini ilk girişte tamamlayın.\n`, { mode: 0o600 });
console.log('Created a new empty production database, private environment and local administrator login file. No credentials printed.');
