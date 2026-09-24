// Shared by the API and UI. Selections restrict existing roles; they never grant new roles.
export const ERP_MENUS = [
  { id: 'cari', label: 'Cari hesaplar', views: ['cari'], paths: ['customers'] },
  { id: 'stok', label: 'Stok ve ürünler', views: ['stok'], paths: ['products'] },
  { id: 'faturalar', label: 'Alış ve satış faturaları', views: ['faturalar', 'alis', 'satis'], paths: ['invoices'] },
  { id: 'kasa', label: 'Kasa ve tahsilatlar', views: ['kasa', 'finans'], paths: ['cash', 'collections', 'financial-transactions', 'payment-links', 'field-collections'] },
  { id: 'banka', label: 'Banka hesapları', views: ['banka'], paths: ['banks', 'bank-matching'] },
  { id: 'teklif', label: 'Teklif ve siparişler', views: ['teklif'], paths: ['quotes', 'orders'] },
  { id: 'irsaliye', label: 'İrsaliyeler', views: ['irsaliye'], paths: ['waybills'] },
  { id: 'gider', label: 'Giderler', views: ['gider'], paths: ['expenses'] },
  { id: 'ceksenet', label: 'Çek ve senet', views: ['ceksenet'], paths: ['checks'] },
  { id: 'personel', label: 'Personel', views: ['personel'], paths: ['employees'] },
  { id: 'pos', label: 'Hızlı satış (POS)', views: ['pos'], paths: ['pos'] },
  { id: 'muhasebe', label: 'Muhasebe ve müşavir portföyü', views: ['muhasebe', 'mali-musavir', 'muhasebe-kontrol'], paths: ['accounting', 'accountant'] },
  { id: 'edonusum', label: 'e-Fatura ve e-Dönüşüm', views: ['edonusum', 'edonusummerkezi'], paths: ['efatura', 'e-documents', 'e-invoice', 'taxpayers', 'edefter', 'hizli-bayi'] },
  { id: 'raporlar', label: 'Raporlar ve beyanname', views: ['raporlar', 'vergi', 'rapor-tasarimci'], paths: ['reports', 'report-designs', 'tax'] },
  { id: 'documents', label: 'Belge merkezi', views: ['documents'], paths: ['documents'] },
  { id: 'ai', label: 'AI asistan', views: ['ai', 'ai-merkezi'], paths: ['ai', 'ai-insights'] },
  { id: 'otomasyon', label: 'Otomasyon', views: ['otomasyon'], paths: ['automations'] },
] as const;

export function menuAllowsView(ids: string[] | null | undefined, view: string): boolean {
  const menu = ERP_MENUS.find(m => (m.views as readonly string[]).includes(view));
  return ids == null || !menu || ids.includes(menu.id);
}

export function menuAllowsPath(ids: string[] | null | undefined, path: string): boolean {
  if (ids == null) return true;
  const normalized = path.split('?')[0].replace(/^\/api\/(v1\/)?/, '');
  if (normalized === 'e-services/invoice-history') return ids.includes('edonusum');
  // Search/import/sync aggregate multiple ERP resources and must not bypass a restriction.
  if (/^(search|import|sync)(\/|$)/.test(normalized)) return ERP_MENUS.every(m => ids.includes(m.id));
  const resource = normalized.split('/')[0];
  const menu = ERP_MENUS.find(m => (m.paths as readonly string[]).includes(resource));
  return !menu || ids.includes(menu.id);
}
