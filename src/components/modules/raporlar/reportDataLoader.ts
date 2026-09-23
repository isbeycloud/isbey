/**
 * İŞBEY CLOUD — FAZ 25.3-C: RAPOR VERİ KAYNAĞI TOPLAYICI
 * =======================================================
 * ReportDesignerView'ın seçtiği veri kaynağını (SALES/PURCHASE/CUSTOMER/
 * CASH/STOCK/VAT) mevcut API endpoint'lerinden çeker ve ReportRow'a
 * normalize eder. MEVCUT endpoint imzaları değiştirilmez.
 */

import { api } from '../../../services/api';
import type { ReportDataSource, ReportRow } from './reportBuilderTypes';

export interface LoadedDataset {
  rows: ReportRow[];
  warnings: string[];
}

/** Tarih aralığı + cari/depo filtreleri loader'a da aktarılır (server-side date filtresi) */
export interface LoadParams {
  dateFrom?: string;
  dateTo?: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── Satış / Alış: fatura item'ları satır bazına açılır ─────────────────────

async function loadInvoiceRows(type: 'SALES' | 'PURCHASE' | 'RETAIL_POS', params: LoadParams): Promise<ReportRow[]> {
  const res = await api.getInvoices({
    type,
    startDate: params.dateFrom,
    endDate: params.dateTo,
  });
  if (!res?.success || !Array.isArray(res.invoices)) return [];
  const rows: ReportRow[] = [];
  for (const inv of res.invoices) {
    if (inv.status === 'CANCELLED') continue;
    const items = Array.isArray(inv.items) && inv.items.length > 0 ? inv.items : null;
    if (items) {
      // Item bazlı açılım: ürün / KDV / depo kırılımı çalışır
      for (const it of items) {
        rows.push({
          date: inv.date,
          customer: inv.customerTitle,
          customerId: inv.customerId,
          product: it.productName,
          vat: num(it.vatRate),
          warehouseId: inv.warehouseId,
          amount: num(it.lineGrandTotal ?? it.lineTotal),
        });
      }
    } else {
      rows.push({
        date: inv.date,
        customer: inv.customerTitle,
        customerId: inv.customerId,
        warehouseId: inv.warehouseId,
        amount: num(inv.grandTotal),
      });
    }
  }
  return rows;
}

// ─── Ana yükleme fonksiyonu ─────────────────────────────────────────────────

export async function loadReportRows(source: ReportDataSource, params: LoadParams): Promise<LoadedDataset> {
  const warnings: string[] = [];
  try {
    switch (source) {
      case 'SALES': {
        // Satış faturaları + POS satışları birlikte
        const [sales, pos] = await Promise.all([
          loadInvoiceRows('SALES', params),
          loadInvoiceRows('RETAIL_POS', params).catch(() => [] as ReportRow[]),
        ]);
        return { rows: [...sales, ...pos], warnings };
      }
      case 'PURCHASE':
        return { rows: await loadInvoiceRows('PURCHASE', params), warnings };
      case 'CUSTOMER': {
        const res = await api.getCustomers();
        const rows: ReportRow[] = (res?.customers || []).map(c => ({
          customer: c.title,
          customerId: c.id,
          region: c.city || '-',
          // Bakiye: pozitif → alacak (borçlu), negatif → borç
          amount: num(c.balance),
        }));
        return { rows, warnings };
      }
      case 'CASH': {
        const res = await api.getCashTransactions();
        const rows: ReportRow[] = (res?.transactions || []).map(t => ({
          date: t.date,
          customer: t.customerTitle || t.description || '-',
          customerId: t.customerId,
          // Giren pozitif, çıkan negatif
          amount: t.direction === 'OUT' ? -num(t.amount) : num(t.amount),
        }));
        return { rows, warnings };
      }
      case 'STOCK': {
        const res = await api.getProducts();
        const rows: ReportRow[] = (res?.products || []).map(p => ({
          product: p.name,
          warehouse: p.warehouseName || p.warehouseId,
          warehouseId: p.warehouseId,
          vat: num(p.vatRate),
          amount: num(p.currentStock),
        }));
        return { rows, warnings };
      }
      case 'VAT': {
        // URLSearchParams undefined değerleri "undefined" string'e çevirir —
        // yalnız dolu tarihleri ilet
        const vatParams: Record<string, string> = {};
        if (params.dateFrom) vatParams.startDate = params.dateFrom;
        if (params.dateTo) vatParams.endDate = params.dateTo;
        const res = await api.getVatReport(vatParams);
        const rows: ReportRow[] = (res?.rows || []).map(r => ({
          product: `KDV %${r.rate}`,
          vat: num(r.rate),
          amount: num(r.salesVat),
        }));
        if (rows.length === 0) warnings.push('Seçili dönemde KDV kaydı bulunamadı.');
        return { rows, warnings };
      }
      default:
        return { rows: [], warnings: ['Bilinmeyen veri kaynağı.'] };
    }
  } catch {
    // Hata mesajı iç detay sızmaz; kullanıcıya nötr uyarı gösterilir
    return { rows: [], warnings: ['Veri kaynağı şu anda yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.'] };
  }
}
