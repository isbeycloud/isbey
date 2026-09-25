import { storage } from '../db/storage';
import { HizliConnectService } from './hizliConnectService';

/** Persist the in-flight state before any provider call, including across restarts. */
export async function dispatchHizliInvoice(invoiceId: string, tenantId: string) {
  const reserved = await storage.runTransaction(draft => {
    const invoice = draft.invoices.find(i => i.id === invoiceId && i.tenantId === tenantId);
    if (!invoice) throw new Error('Fatura bulunamadı.');
    if (invoice.status === 'CANCELLED' || ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'ACCEPTED'].includes(invoice.eInvoiceStatus || '')) {
      throw new Error('Fatura gönderilmiş veya işlemde. Yeniden göndermeden önce sağlayıcı durumunu kontrol edin.');
    }
    const snapshot = structuredClone(invoice);
    invoice.eInvoiceStatus = 'SENDING';
    return {
      invoice: snapshot,
      customer: structuredClone(draft.customers.find(c => c.id === invoice.customerId)),
      company: structuredClone(draft.company),
      settings: structuredClone(draft.tenantEinvoiceSettings?.find(s => s.tenantId === tenantId)),
    };
  });
  // Unexpected exceptions leave SENDING in place: never silently retry uncertain delivery.
  const result = await HizliConnectService.sendInvoice(reserved.invoice, reserved.customer, reserved.company, { tenantSettings: reserved.settings });
  await storage.runTransaction(draft => {
    const invoice = draft.invoices.find(i => i.id === invoiceId && i.tenantId === tenantId);
    if (!invoice) throw new Error('Gönderim sonrası kayıt bulunamadı; sağlayıcı durumunu kontrol edin.');
    if (result.success) invoice.eInvoiceStatus = 'SENT';
    else if (!result.requiresReconciliation) invoice.eInvoiceStatus = reserved.invoice.eInvoiceStatus;
    // An uncertain response remains SENDING and blocks retries until reconciled.
  });
  return result;
}
