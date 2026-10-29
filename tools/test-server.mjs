import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
fs.mkdirSync('.verify-tmp', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('.verify-tmp/e2e-'));
Object.assign(process.env, {
  NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '4317', SERVE_STATIC: 'true',
  DATABASE_PATH: path.join(directory, 'database.json'), DOTENV_CONFIG_PATH: path.join(directory, 'no-env'),
  JWT_SECRET: crypto.randomBytes(48).toString('hex'), WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex'),
  HIZLI_BILISIM_ALLOW_PROD: 'false', HIZLI_BILISIM_IS_TEST_MODE: 'true',
  HIZLI_BILISIM_API_KEY: '', HIZLI_BILISIM_WS_USERNAME: '', HIZLI_BILISIM_WS_PASSWORD: '',
  CORS_ALLOW_ORIGINS: 'http://127.0.0.1:4317', LOCAL_DEV_ALLOW: 'false', TRUST_PROXY: '',
  PUBLIC_APP_URL: 'https://bey360.example.test', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
  // NOT: Giriş hız sınırı KASITLI olarak burada YÜKSELTİLMEZ. Üretim varsayılanı
  // (15 dk / 20 deneme) aynen geçerli kalır; böylece `application.spec.ts` içindeki
  // "login rate limit cannot be bypassed with forged X-Forwarded-For" testi gerçek
  // sınırlayıcıyı sınayabilir. Koşudaki giriş sayısı bu bütçenin ALTINDA tutulur
  // (bkz. tests/01-xslt-studio.spec.ts: oturum bir kez açılır ve paylaşılır).
});
const { initialDatabaseState } = await import('../server/db/seed.ts');
const { adminStoredHash } = await import('../server/tests/fixtures/e2eCredentials.ts');
const { migrateMemberships } = await import('../server/security/memberships.ts');
const fixture = structuredClone(initialDatabaseState);
// Borç takip tarayıcı testleri için yalnız izole veritabanında açık net bakiyeler.
for (const [suffix, debit, credit] of [['receivable', 125, 0], ['payable', 0, 75]]) {
  const id = `debt-e2e-${suffix}`;
  fixture.customers.push({ ...structuredClone(fixture.customers[0]), id, tenantId: 'tnt-isbey',
    code: `TEST-${suffix}`, title: `Takip Test ${suffix}`, currency: 'TRY',
    balance: debit - credit, totalDebit: debit, totalCredit: credit, deletedAt: undefined, active: true });
  fixture.currentTransactions.push({ id: `tx-${id}`, tenantId: 'tnt-isbey', customerId: id,
    customerCode: `TEST-${suffix}`, customerTitle: `Takip Test ${suffix}`, documentNo: `TEST-${suffix}`,
    documentType: 'OPENING_BALANCE', date: '2026-01-01', debit, credit, balance: debit - credit,
    description: 'İzole takip test bakiyesi', userId: 'usr-admin', createdAt: '2026-01-01T00:00:00Z' });
}
// XSLT alış faturası görüntüleyicisi için yalnız izole E2E verisi.
fixture.invoices.push({ ...structuredClone(fixture.invoices[0]), id: 'inv-xslt-purchase',
  invoiceNo: 'ALS-XSLT-000001', type: 'PURCHASE', tenantId: 'tnt-isbey',
  eInvoiceStatus: 'DRAFT', eInvoiceUUID: undefined });
fixture.invoices.push({ ...structuredClone(fixture.invoices[0]), id: 'inv-xslt-recorded-customer',
  invoiceNo: 'SAT-XSLT-SNAPSHOT', customerId: null, customerTitle: 'Kayıtlı Belge Alıcısı',
  invoiceProfile: undefined, invoiceCategory: undefined,
  hizliModel: { invoiceheader: { ProfileID: 'TEMELFATURA', InvoiceTypeCode: 'SATIS', IssueTime: '13:33' },
    customer: { PartyName: 'Kayıtlı Belge Alıcısı', IdentificationID: '0000000000' } } });
fixture.users.find(user => user.username === 'admin').passwordHash = adminStoredHash;
migrateMemberships(fixture);
fs.writeFileSync(process.env.DATABASE_PATH, JSON.stringify(fixture));
await import('../server/index.ts');
