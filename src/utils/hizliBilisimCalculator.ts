import type {
  HizliInvoiceHeader,
  HizliInvoiceLine,
  HizliLineTax,
  HizliTaxSummary,
} from '../types/hizliBilisim';

/**
 * UUID v4 / ETTN Üretici
 */
export function generateEttn(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * Para Formatı (2 Ondalık)
 */
export function formatCurrency(val: number, symbol: string = '₺'): string {
  if (isNaN(val)) return `0,00 ${symbol}`;
  return `${val.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${symbol}`;
}

/**
 * Tek bir fatura satırını hesaplar
 */
export function calculateHizliLine(
  line: HizliInvoiceLine,
  isKdvDahil: boolean = false
): HizliInvoiceLine {
  const qty = Math.max(0, Number(line.Quantity_Amount) || 0);
  const rawPrice = Math.max(0, Number(line.Price_Amount) || 0);
  const rawTotal = qty * rawPrice;

  // İskonto Hesaplama
  let discAmount = 0;
  let discPercent = Number(line.Allowance_Percent) || 0;

  if (line.AllowanceCalculatorType === 'Percent' || !line.AllowanceCalculatorType) {
    discPercent = Math.min(100, Math.max(0, discPercent));
    discAmount = (rawTotal * discPercent) / 100;
  } else {
    discAmount = Math.min(rawTotal, Math.max(0, Number(line.Allowance_Amount) || 0));
    discPercent = rawTotal > 0 ? (discAmount / rawTotal) * 100 : 0;
  }

  const baseAfterDiscount = Math.max(0, rawTotal - discAmount);

  // KDV ve Vergi Hesaplama
  const updatedTaxes: HizliLineTax[] = (line.lineTaxes || []).map((t) => {
    const perc = Number(t.Tax_Perc) || 0;
    let taxBase = baseAfterDiscount;
    let taxAmount = 0;

    if (t.Tax_Code === '0015') {
      // KDV
      if (isKdvDahil && perc > 0) {
        // Matrah = Tutar / (1 + KDV/100)
        taxBase = baseAfterDiscount / (1 + perc / 100);
        taxAmount = baseAfterDiscount - taxBase;
      } else {
        taxAmount = (taxBase * perc) / 100;
      }

      // Tevkifat Hesaplama
      let tevkAmnt = 0;
      if (t.Tevkifat_Perc && t.Tevkifat_Perc > 0) {
        tevkAmnt = (taxAmount * t.Tevkifat_Perc) / 100;
      }

      return {
        ...t,
        Tax_Base: Number(taxBase.toFixed(2)),
        Tax_Amnt: Number(taxAmount.toFixed(2)),
        Tevkifat_Amnt: Number(tevkAmnt.toFixed(2)),
      };
    } else {
      // Ek vergiler (Stopaj vb.)
      taxAmount = (taxBase * perc) / 100;
      return {
        ...t,
        Tax_Base: Number(taxBase.toFixed(2)),
        Tax_Amnt: Number(taxAmount.toFixed(2)),
      };
    }
  });

  // Eğer satırda hiç KDV tanımlı değilse varsayılan %20 KDV ekle
  if (updatedTaxes.length === 0) {
    const kdvPerc = 20;
    const taxAmount = (baseAfterDiscount * kdvPerc) / 100;
    updatedTaxes.push({
      Tax_Code: '0015',
      Tax_Name: 'KDV',
      Tax_Perc: kdvPerc,
      Tax_Base: Number(baseAfterDiscount.toFixed(2)),
      Tax_Amnt: Number(taxAmount.toFixed(2)),
    });
  }

  return {
    ...line,
    Allowance_Percent: Number(discPercent.toFixed(2)),
    Allowance_Amount: Number(discAmount.toFixed(2)),
    Price_Total: Number(
      (isKdvDahil ? updatedTaxes[0]?.Tax_Base || baseAfterDiscount : baseAfterDiscount).toFixed(2)
    ),
    lineTaxes: updatedTaxes,
  };
}

/**
 * Tüm Fatura Başlığı ve Genel Toplamlarını Hesaplar
 */
export function calculateHizliInvoiceTotals(
  header: HizliInvoiceHeader,
  lines: HizliInvoiceLine[]
): {
  header: HizliInvoiceHeader;
  taxSummaries: HizliTaxSummary[];
  totalTevkifat: number;
} {
  let lineExtensionAmount = 0; // Mal/Hizmet Toplamı (İskonto öncesi matrah)
  let allowanceTotalAmount = 0; // Toplam İskonto
  let totalKdv = 0;
  let totalTevkifat = 0;
  let totalOtherTaxes = 0;

  const taxMap = new Map<string, HizliTaxSummary>();

  for (const line of lines) {
    const rawSum = (line.Quantity_Amount || 0) * (line.Price_Amount || 0);
    const discSum = line.Allowance_Amount || 0;
    lineExtensionAmount += rawSum;
    allowanceTotalAmount += discSum;

    for (const tax of line.lineTaxes || []) {
      const key = `${tax.Tax_Code}_${tax.Tax_Perc}`;
      const existing = taxMap.get(key) || {
        Tax_Code: tax.Tax_Code,
        Tax_Name: tax.Tax_Name || (tax.Tax_Code === '0015' ? 'KDV' : 'Vergi'),
        Tax_Perc: tax.Tax_Perc,
        Tax_Base: 0,
        Tax_Amnt: 0,
      };

      existing.Tax_Base += tax.Tax_Base || 0;
      existing.Tax_Amnt += tax.Tax_Amnt || 0;
      taxMap.set(key, existing);

      if (tax.Tax_Code === '0015') {
        totalKdv += tax.Tax_Amnt || 0;
        if (tax.Tevkifat_Amnt) {
          totalTevkifat += tax.Tevkifat_Amnt;
        }
      } else {
        totalOtherTaxes += tax.Tax_Amnt || 0;
      }
    }
  }

  const netBase = Math.max(0, lineExtensionAmount - allowanceTotalAmount);
  // Vergiler Dahil Toplam = Net Matrah + KDV + Diğer Vergiler
  const taxInclusiveAmount = netBase + totalKdv + totalOtherTaxes;
  // Ödenecek Tutar = Vergiler Dahil Toplam - Alıcı Tarafından Tevkif Edilen KDV
  const payableAmount = Math.max(0, taxInclusiveAmount - totalTevkifat);

  const taxSummaries: HizliTaxSummary[] = Array.from(taxMap.values()).map((t) => ({
    ...t,
    Tax_Base: Number(t.Tax_Base.toFixed(2)),
    Tax_Amnt: Number(t.Tax_Amnt.toFixed(2)),
  }));

  const updatedHeader: HizliInvoiceHeader = {
    ...header,
    LineExtensionAmount: Number(lineExtensionAmount.toFixed(2)),
    AllowanceTotalAmount: Number(allowanceTotalAmount.toFixed(2)),
    TaxInclusiveAmount: Number(taxInclusiveAmount.toFixed(2)),
    PayableAmount: Number(payableAmount.toFixed(2)),
    Taxes: taxSummaries,
  };

  return {
    header: updatedHeader,
    taxSummaries,
    totalTevkifat: Number(totalTevkifat.toFixed(2)),
  };
}
