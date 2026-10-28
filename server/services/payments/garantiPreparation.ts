import { createHash } from 'node:crypto';
import type { DatabaseState } from '../../db/schema';
import { selectedPlans } from '../serviceEntitlements';

const fields = [
  ['GARANTI_MERCHANT_ID', 'Üye işyeri numarası'],
  ['GARANTI_TERMINAL_ID', 'Terminal numarası'],
  ['GARANTI_PROV_USER_ID', 'Provizyon kullanıcı adı'],
  ['GARANTI_TERMINAL_USER_ID', 'Terminal kullanıcı adı'],
  ['GARANTI_PROVISION_PASSWORD', 'Provizyon parolası'],
  ['GARANTI_STORE_KEY', '3D güvenlik anahtarı'],
] as const;

export function garantiPreparationStatus(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.GARANTI_MODE === 'TEST' || env.GARANTI_MODE === 'PROD' ? env.GARANTI_MODE : null;
  const checks = fields.map(([key, label]) => ({ key, label, configured: !!env[key]?.trim() }));
  const terminal = env.GARANTI_TERMINAL_ID?.trim() || '';
  const merchant = env.GARANTI_MERCHANT_ID?.trim() || '';
  const identifiersValid = /^\d{8}$/.test(terminal) && /^\d{1,20}$/.test(merchant);
  let publicUrlValid = false;
  try {
    const url = new URL(env.APP_PUBLIC_URL || '');
    publicUrlValid = url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  } catch { /* Eksik/hatalı adres hazır sayılmaz. */ }
  return {
    provider: 'GARANTI_BBVA' as const, model: '3D_OOS_PAY' as const,
    stage: 'PREPARATION' as const, checkoutAvailable: false as const, mode,
    configurationComplete: !!mode && checks.every(c => c.configured) && identifiersValid && publicUrlValid,
    checks, identifiersValid, publicUrlValid,
    message: 'Banka test bilgileri bekleniyor. Online ödeme henüz kullanıma açık değil.',
  };
}

// Bankanın ISO-8859-9 / SHA1 + SHA512 sözleşmesi. Bu yardımcı bankaya istek göndermez.
function bankBytes(value: string): Buffer {
  const turkish: Record<string, number> = { 'Ğ': 0xd0, 'İ': 0xdd, 'Ş': 0xde, 'ğ': 0xf0, 'ı': 0xfd, 'ş': 0xfe };
  return Buffer.from([...value].map(char => {
    if (turkish[char] !== undefined) return turkish[char];
    const code = char.codePointAt(0)!;
    if (code > 255 || [0xd0, 0xdd, 0xde, 0xf0, 0xfd, 0xfe].includes(code)) throw new Error('Banka karakter kodlaması desteklenmiyor.');
    return code;
  }));
}

export function garantiRequestHash(input: {
  terminalId: string; provisionPassword: string; storeKey: string; orderId: string;
  amountMinor: number; successUrl: string; errorUrl: string;
}) {
  if (!/^\d{8}$/.test(input.terminalId) || !/^[A-Za-z0-9-]{1,36}$/.test(input.orderId)
    || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0
    || !input.provisionPassword || !input.storeKey) throw new Error('Geçersiz banka istek bilgisi.');
  for (const value of [input.successUrl, input.errorUrl]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Güvenli dönüş adresi gerekli.');
  }
  const hash = (algorithm: string, value: string) => createHash(algorithm).update(bankBytes(value)).digest('hex').toUpperCase();
  const passwordHash = hash('sha1', input.provisionPassword + '0' + input.terminalId);
  return hash('sha512', input.terminalId + input.orderId + input.amountMinor + '949'
    + input.successUrl + input.errorUrl + 'sales' + '0' + input.storeKey + passwordHash);
}

export function previewPackageCheckout(db: DatabaseState, tenantId: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Paket ve dönem seçin.');
  const body = input as Record<string, unknown>;
  // Fiyat, firma, kart veya ödeme sonucu istemciden kabul edilmez.
  if (Object.keys(body).some(key => !['planId', 'billingCycle'].includes(key))) throw new Error('Yalnız paket ve dönem gönderilebilir.');
  if (typeof body.planId !== 'string' || !['monthly', 'yearly'].includes(body.billingCycle as string)) throw new Error('Paket ve dönem seçin.');
  const tenant = db.tenants.find(t => t.id === tenantId && !t.isArchived);
  if (!tenant || ['SUSPENDED', 'INACTIVE'].includes(tenant.status)) throw new Error('Firma için satın alma kullanılamıyor.');
  const plan = selectedPlans(db, [body.planId])[0];
  if (plan.currency !== 'TRY') throw new Error('Bu hazırlık yalnız TL paketlerini kapsıyor.');
  const price = body.billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(Math.round(price * 100))
    || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) throw new Error('Paketin satış fiyatı geçerli değil.');
  return {
    tenantId, planId: plan.id, planName: plan.name, billingCycle: body.billingCycle as 'monthly' | 'yearly',
    catalogAmount: price, currency: 'TRY' as const, checkoutAvailable: false as const,
    priceFinalized: false as const, paymentCollected: false as const,
    message: 'Bu bir tarife önizlemesidir. Vergi, yıllık toplam ve yenileme koşulları kesinleştirilmeden ödeme alınmaz. Paketiniz değiştirilmedi.',
  };
}
