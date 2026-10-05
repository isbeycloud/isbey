import { TaxpayerService } from './taxpayerService';
import type { InvoiceProfile } from '../db/schema';
import { ProviderFactory } from './providers/providerFactory';

/** Yalnız doğrulanmış mükellef sonucu belge türüne çevrilir; bilinmeyen sonuç tahmin edilmez. */
export function decideInvoiceRecipient(taxpayer: { isEInvoiceUser: boolean | null; aliasPK?: string }, requestedProfile?: string) {
  if (typeof taxpayer.isEInvoiceUser !== 'boolean') throw new Error('Alıcının e-Fatura durumu doğrulanamadı. İşlem yapılmadı; tekrar sorgulayın.');
  if (!taxpayer.isEInvoiceUser) return { profile: 'EARSIVFATURA' as InvoiceProfile, aliasPK: undefined };
  if (!taxpayer.aliasPK?.startsWith('urn:mail:') || !taxpayer.aliasPK.slice(9).trim()) {
    throw new Error('Alıcı e-Fatura mükellefi ancak tekil posta kutusu (PK) doğrulanamadı. Alıcının posta kutusunu kontrol edin.');
  }
  return { profile: (requestedProfile && requestedProfile !== 'EARSIVFATURA' ? requestedProfile : 'TICARIFATURA') as InvoiceProfile, aliasPK: taxpayer.aliasPK };
}

export async function resolveInvoiceRecipient(identifier: string, tenantId: string, requestedProfile?: string) {
  const { provider } = ProviderFactory.getProviderForTenant(tenantId);
  if (provider.providerId.toUpperCase() === 'MOCK') throw new Error('Alıcı mükellefiyeti test sağlayıcısından doğrulanamaz. Gerçek entegratör bağlantısını seçin.');
  const taxpayer = await TaxpayerService.checkTaxpayer(identifier, tenantId, true);
  return { ...decideInvoiceRecipient(taxpayer, requestedProfile), identifier: taxpayer.identifier, aliasGB: taxpayer.isEInvoiceUser ? taxpayer.aliasGB : undefined };
}
