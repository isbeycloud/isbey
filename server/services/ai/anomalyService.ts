import { storage } from '../../db/storage';
import { AIAnomaly } from '../../db/schema';

export interface AuditDeskIssue {
  id: string;
  category: 'DUPLICATE_INVOICE' | 'VAT_MISMATCH' | 'MISSING_VKN' | 'SUSPICIOUS_AMOUNT' | 'UNMATCHED_BANK';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  sourceType: string;
  sourceId: string;
  actionLabel: string;
  createdAt: string;
}

export class AnomalyService {
  /**
   * Tenant finansal kayıtlarında anomalileri ve mükerrer kayıtları tarar
   */
  public static detectAnomalies(tenantId: string): AuditDeskIssue[] {
    const db = storage.getState();
    const issues: AuditDeskIssue[] = [];
    const now = new Date().toISOString();

    const invoices = (db.invoices || []).filter(
      i => (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey')) && i.status !== 'CANCELLED'
    );
    const customers = (db.customers || []).filter(
      c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
    );
    const bankMatches = (db.bankTransactionMatches || []).filter(
      m => m.tenantId === tenantId && m.status === 'PROPOSED'
    );

    // 1. Mükerrer Fatura Kontrolü
    const seenMap: Record<string, typeof invoices[0]> = {};
    for (const inv of invoices) {
      const key = `${inv.customerId}_${inv.grandTotal}_${inv.date}`;
      if (seenMap[key]) {
        issues.push({
          id: `audit-dup-${inv.id}`,
          category: 'DUPLICATE_INVOICE',
          priority: 'HIGH',
          title: `Muhtemel Mükerrer Fatura (${inv.customerTitle})`,
          description: `${inv.invoiceNo} ve ${seenMap[key].invoiceNo} aynı cari ve aynı tutar (${inv.grandTotal} TL) ile kaydedilmiş.`,
          sourceType: 'INVOICE',
          sourceId: inv.id,
          actionLabel: 'Faturayı İncele',
          createdAt: now,
        });
      } else {
        seenMap[key] = inv;
      }
    }

    // 2. Eksik VKN / TCKN Kontrolü
    for (const cust of customers) {
      if (!cust.taxNumber || cust.taxNumber.trim().length < 10) {
        issues.push({
          id: `audit-vkn-${cust.id}`,
          category: 'MISSING_VKN',
          priority: 'MEDIUM',
          title: `Eksik Vergi Numarası (${cust.title})`,
          description: `Cari hesapta kayıtlı geçerli bir VKN veya TCKN bulunmuyor. e-Fatura ve beyannamelerde hata oluşabilir.`,
          sourceType: 'CUSTOMER',
          sourceId: cust.id,
          actionLabel: 'Cariyi Güncelle',
          createdAt: now,
        });
      }
    }

    // 3. KDV Matematiksel Yuvarlama / Uyumsuzluk Kontrolü
    for (const inv of invoices.slice(0, 10)) {
      if (inv.subtotal && inv.vatTotal && inv.grandTotal) {
        const expectedGrand = inv.subtotal + inv.vatTotal;
        if (Math.abs(expectedGrand - inv.grandTotal) > 0.5) {
          issues.push({
            id: `audit-vat-${inv.id}`,
            category: 'VAT_MISMATCH',
            priority: 'CRITICAL',
            title: `KDV Matrah Uyumsuzluğu (${inv.invoiceNo})`,
            description: `Ara Toplam (${inv.subtotal} TL) + KDV (${inv.vatTotal} TL) Genel Toplam (${inv.grandTotal} TL) ile eşleşmiyor.`,
            sourceType: 'INVOICE',
            sourceId: inv.id,
            actionLabel: 'Düzeltme Faturası Oluştur',
            createdAt: now,
          });
        }
      }
    }

    // 4. Eşleşmemiş Banka Hareketleri
    if (bankMatches.length > 0) {
      issues.push({
        id: `audit-bank-${Date.now()}`,
        category: 'UNMATCHED_BANK',
        priority: 'MEDIUM',
        title: `${bankMatches.length} Adet Eşleşme Bekleyen Banka Hareketi`,
        description: `Banka ekstrenizde cari hesaplara henüz bağlanmamış hareketler mevcuttur.`,
        sourceType: 'BANK_MATCH',
        sourceId: bankMatches[0].id,
        actionLabel: 'Banka Masasını Aç',
        createdAt: now,
      });
    }

    // 5. Olağandışı Yüksek Tutar Uyarısı
    const avgInvoiceAmount = invoices.length > 0 ? invoices.reduce((s, i) => s + (i.grandTotal || 0), 0) / invoices.length : 10000;
    for (const inv of invoices) {
      if (inv.grandTotal > avgInvoiceAmount * 4 && inv.grandTotal > 50000) {
        issues.push({
          id: `audit-suspicious-${inv.id}`,
          category: 'SUSPICIOUS_AMOUNT',
          priority: 'HIGH',
          title: `Olağandışı Yüksek Tutar (${inv.invoiceNo})`,
          description: `${inv.customerTitle} adına düzenlenen ${inv.grandTotal.toLocaleString('tr-TR')} TL tutarındaki fatura ortalamanın 4 katından yüksektir.`,
          sourceType: 'INVOICE',
          sourceId: inv.id,
          actionLabel: 'İşlemi Denetle',
          createdAt: now,
        });
        break;
      }
    }

    return issues;
  }
}
