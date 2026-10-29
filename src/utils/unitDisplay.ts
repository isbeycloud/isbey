/** Okunabilir etiketler; belge/entegratör kodları ve miktarlar değiştirilmez. */
export const UNIT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  C62: 'Adet', NIU: 'Adet', NAR: 'Adet', PR: 'Adet-Çift',
  KGM: 'Kg', GRM: 'Gram', KNI: 'Azotun Kilogramı', TNE: 'Ton', '26': 'Ton',
  LTR: 'Litre', MLT: 'Mililitre', MTR: 'Metre', CMT: 'Santimetre', MMT: 'mm',
  MTK: 'm²', MTQ: 'm³',
  BX: 'Kutu', PK: 'Paket', PA: 'Paket', CT: 'Karton', SL: 'Palet', SET: 'Set',
  DZN: 'Düzine', SA: 'Çuval', BO: 'Şişe', TN: 'Teneke', J57: 'Varil', DRL: 'Rulo',
  DR: 'Bidon', T3: 'Bin Adet', D40: 'Bin Litre', R9: 'Bin Metre Küp',
  CL: 'Bobin', D30: 'Brüt Kalori Değeri', '5H': 'C.Boxes',
  HUR: 'Saat', DAY: 'Gün', MON: 'Ay', ANN: 'Yıl',
  KWH: 'kWh', MWH: 'MWh', TL: 'TL',
});

/** Bilinmeyen kod/ad aynen korunur; eksik birimin gösterimini çağıran seçer. */
export function formatUnitLabel(value?: string | null, fallback = 'Adet'): string {
  if (!value?.trim()) return fallback;
  return UNIT_LABELS[value.trim().toUpperCase()] || value;
}

/** Yalnız HTML metin hücreleri için; React metinleri normal eşleyiciyi kullanır. */
export function formatUnitLabelHtml(value?: string | null, fallback = 'Adet'): string {
  return formatUnitLabel(value, fallback).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
