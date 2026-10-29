import { HIZLI_UNIT_CATALOG } from '../data/hizliUnitCatalog';

/** Okunabilir etiketler; belge/entegratör kodları ve miktarlar değiştirilmez. */
export const UNIT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(HIZLI_UNIT_CATALOG.map(unit => [unit.code, unit.name])),
  // Yerleşik kısa adlar ve eski belge kodlarıyla uyumluluk.
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

const unitCodes = new Set(HIZLI_UNIT_CATALOG.map(unit => unit.code));
const unitNameKey = (value: string) => value.trim().normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/ı/g, 'i').toLowerCase().replace(/\s+/g, ' ');
const codesByName = new Map<string, Set<string>>();
for (const unit of HIZLI_UNIT_CATALOG) {
  for (const name of [unit.name, ...(unit.alternativeNames || []), UNIT_LABELS[unit.code]]) {
    const key = unitNameKey(name), codes = codesByName.get(key) || new Set<string>();
    codes.add(unit.code); codesByName.set(key, codes);
  }
}
const preferredUnitNames: Readonly<Record<string, string>> = Object.freeze({
  adet: 'C62', tane: 'C62', nar: 'C62', ton: 'TNE', paket: 'PA',
  gr: 'GRM', lt: 'LTR', m: 'MTR',
});

/** Ürün seçimi için: bilinen kod korunur; bilinmeyen birime Adet tahmin edilmez. */
export function resolveHizliUnitCode(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const code = value.trim().toUpperCase();
  if (unitCodes.has(code)) return code;
  const key = unitNameKey(value);
  if (Object.hasOwn(preferredUnitNames, key)) return preferredUnitNames[key];
  const candidates = codesByName.get(key);
  return candidates?.size === 1 ? candidates.values().next().value : undefined;
}
