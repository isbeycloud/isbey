/**
 * Belge sorgulama uçları için ortak yardımcılar.
 *
 * SALT OKUNUR: bu modül hiçbir şey yazmaz, hiçbir transaction başlatmaz.
 * Yalnız filtre doğrulama ve karşı-taraf VKN çözümlemesi yapar.
 */

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tarih parametrelerini doğrular.
 * Geçersiz biçim veya ters aralıkta { error } döner — sessizce yutulmaz.
 */
export function parseDateRange(startDate?: string, endDate?: string): DateRange | { error: string } {
  const pairs: Array<[string, string | undefined]> = [
    ['startDate', startDate],
    ['endDate', endDate],
  ];
  for (const [name, value] of pairs) {
    if (value !== undefined && value !== '' && !DATE_RE.test(value)) {
      return { error: `${name} YYYY-AA-GG biçiminde olmalıdır.` };
    }
  }
  const s = startDate || undefined;
  const e = endDate || undefined;
  if (s && e && s > e) {
    return { error: 'Başlangıç tarihi bitiş tarihinden sonra olamaz.' };
  }
  return { startDate: s, endDate: e };
}

/** VKN/TCKN: rakam dışı karakterleri atar. Karşılaştırma tam eşleşmedir. */
export function normalizeTaxNumber(value?: string): string {
  return (value || '').replace(/\D/g, '');
}

/** Bir cari kaydının vergi kimlik numarası; taxNumber yoksa nationalId'ye düşer. */
export function customerTaxNumberOf(c: { taxNumber?: string; nationalId?: string }): string {
  return normalizeTaxNumber(c.taxNumber || c.nationalId);
}

/**
 * Tenant'a ait carilerin id → VKN haritası.
 *
 * Belge listesiyle AYNI tenant kuralını uygular (tnt-isbey legacy fallback dahil);
 * böylece bir carinin başka tenant üzerinden filtre/sütun sızıntısı yapması engellenir.
 */
export function tenantCustomerTaxMap(
  customers: Array<{ id: string; tenantId?: string; taxNumber?: string; nationalId?: string }>,
  tenantId: string
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of customers) {
    if (c.tenantId === tenantId || (tenantId === 'tnt-isbey' && !c.tenantId)) {
      map.set(c.id, customerTaxNumberOf(c));
    }
  }
  return map;
}

/**
 * Bir belgenin KARŞI TARAF vergi numarasını çözer.
 *
 * ⚠️ `Invoice.recipientTaxNumber` belgenin ALICISIDIR, karşı tarafı değil:
 *   - SATIŞ (giden) belgede alıcı = müşteri → `recipientTaxNumber` doğru kaynaktır.
 *   - ALIŞ (gelen) belgede alıcı = BİZİM firmamız → `recipientTaxNumber` KULLANILMAZ;
 *     tedarikçi `incomingSupplierVkn` alanındadır.
 * Cari kaydı varsa (customerId) her zaman o kazanır; yoksa belge üzerindeki alana düşülür.
 * Hiçbiri yoksa boş döner — TAHMİN EDİLMEZ.
 */
export function resolveCounterpartyTaxNumber(
  doc: { customerId?: string; type?: string; recipientTaxNumber?: string; incomingSupplierVkn?: string },
  customerTaxMap: Map<string, string>
): string {
  const fromCustomer = doc.customerId ? customerTaxMap.get(doc.customerId) : undefined;
  if (fromCustomer) return fromCustomer;
  return doc.type === 'PURCHASE'
    ? normalizeTaxNumber(doc.incomingSupplierVkn)
    : normalizeTaxNumber(doc.recipientTaxNumber);
}

/**
 * Liste yanıtı için karşı-taraf VKN'sini belgeye EKLER (salt-okunur türetme).
 *
 * `_counterpartyTaxNumber` alanı istemciye "şu VKN'ye göre filtreledim" bilgisini
 * verir; böylece sütun, filtrenin kullandığı DEĞERİ gösterir ve ikisi çelişmez.
 * Bir VKN'nin başka tenant'ın carisinden gelmesi `tenantCustomerTaxMap` ile
 * zaten engellenmiştir; burada yalnız türetilmiş bir kopya eklenir, belge DB'ye
 * YAZILMAZ (döndürülen nesne kopyasıdır).
 */
export function attachCounterpartyTaxNumber<T extends { customerId?: string; type?: string }>(
  doc: T,
  customerTaxMap: Map<string, string>
): T & { _counterpartyTaxNumber: string } {
  return {
    ...doc,
    _counterpartyTaxNumber: resolveCounterpartyTaxNumber(doc as any, customerTaxMap),
  };
}
