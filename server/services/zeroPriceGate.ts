import type { InvoiceType } from '../db/schema';

/**
 * SIFIR TUTARLI SATIŞ KAPISI — 2026-10-20
 * ========================================================================
 * NEDEN VAR
 * ---------
 * Canlıda `SAT-2026-000005` (RETAIL_POS, 3 kalem, hepsi `unitPrice: 0`) 0 TL
 * olarak kesildi ama 3 adet stok ÇIKIŞI doğurdu: mal elden çıkmış, alacak
 * doğmamış. Aynı sınıfın kaynağı ölçüldü: 13 ürünün `salePrice` alanı 0.
 * Kasiyer/operatör bu ürünü sepete attığında satır sessizce 0 TL oluyor —
 * hiçbir uyarı yok, fatura "başarılı" diyor.
 *
 * NE YAPAR / NE YAPMAZ
 * --------------------
 * Sıfır tutarı YASAKLAMAZ. Sıfır tutarın MEŞRU olduğu işler vardır (numune,
 * promosyon, garanti kapsamında bedelsiz değişim, personel satışı). Yasaklamak
 * bu işleri kırardı. Yaptığı şey: **sessizliği kaldırmak**. Sıfır tutarlı bir
 * satış faturası ancak GEREKÇESİ yazılarak kesilebilir; gerekçe belgeye ve
 * denetim kaydına yazılır. Kazara oluşan 0 TL fatura artık "fark edilmeden"
 * geçemez.
 *
 * KAPI NEREDE: satış yönlü (SALES / RETAIL_POS) ve toplamı <= 0 olan her fatura.
 * ALIŞ faturaları KAPSAM DIŞIDIR: gelen belge tedarikçinin belgesidir, bizim
 * kabul/ret hakkımız GİB sürecidir — ERP'nin kapısı orada karar vermez.
 * PROFORMA da kapsam dışıdır (stok/cari hareketi doğurmaz, teklif niteliğinde).
 *
 * TEK KAYNAK: `documentConversionService.createInvoiceCore` (v1 ucu, belge
 * dönüşümleri, POS) ve legacy `POST /api/invoices` aynı fonksiyonu çağırır.
 * İki yazma yolu olduğu için kapı iki yerde AYRICA yazılmaz — kopyalanan kapı
 * bir gün birinde düzeltilip diğerinde kalır.
 */

/** Gerekçe metni için en az uzunluk: "0" ya da "boş" gibi kaçamakları eler. */
export const ZERO_TOTAL_REASON_MIN = 10;

/** Kapı yalnız bu türlerde çalışır (satış yönü = alacak doğuran belgeler). */
const GATED_TYPES: ReadonlySet<InvoiceType> = new Set<InvoiceType>(['SALES', 'RETAIL_POS']);

export interface ZeroPriceLineInput {
  productCode?: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  /** Ürünün kendi taban satış fiyatı — varsa "fiyatı var ama 0 girilmiş" sinyali. */
  productSalePrice?: number;
}

export interface ZeroTotalEvaluation {
  /** true → fatura YAZILMAZ (route 400 döner). */
  blocked: boolean;
  /** Makine okunur hata kodu (istemci ayırt edebilsin diye). */
  code?: 'ZERO_TOTAL_REASON_REQUIRED';
  /** Kullanıcıya gösterilecek, NE yapacağını söyleyen mesaj. */
  message?: string;
  /** Kesilmeyecek ama denetim kaydına yazılacak gözlemler. */
  warnings: string[];
}

/** Satır toplamı: miktar × birim fiyat (iskonto öncesi brüt, KDV hariç). */
function lineGross(line: ZeroPriceLineInput): number {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  return (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
}

/**
 * Kapıyı değerlendirir. SAF FONKSİYON: DB'ye/ağa dokunmaz, yan etkisi yoktur.
 *
 * @param type          belge türü
 * @param grandTotal    hesaplanmış genel toplam (kuruş yuvarlanmış)
 * @param lines         yazılacak satırlar
 * @param zeroTotalReason istemcinin beyan ettiği gerekçe (varsa)
 */
export function evaluateZeroTotalGate(
  type: InvoiceType | string,
  grandTotal: number,
  lines: ZeroPriceLineInput[],
  zeroTotalReason?: unknown
): ZeroTotalEvaluation {
  const warnings: string[] = [];
  const total = Number(grandTotal);

  // ── Gözlem (kapı değil): fiyatı olan ürüne 0 fiyat girilmiş satırlar ──
  // Fatura toplamı 0 olmasa bile bu satır "bedava mal" demektir. Engellemiyoruz
  // (iskonto/ikram meşru olabilir) ama görünür kılıyoruz.
  for (const line of lines) {
    const sale = Number(line.productSalePrice);
    if (lineGross(line) === 0 && Number.isFinite(sale) && sale > 0) {
      warnings.push(
        `${line.productCode || '?'} ${line.productName || ''}`.trim() +
        ` — ürünün satış fiyatı ${sale} TL ama satıra 0 girilmiş`
      );
    }
  }

  if (!GATED_TYPES.has(type as InvoiceType)) {
    return { blocked: false, warnings };
  }
  if (Number.isFinite(total) && total > 0) {
    return { blocked: false, warnings };
  }

  // ── Sıfır (veya negatif) tutarlı satış: gerekçe ZORUNLU ──
  const gerekce = typeof zeroTotalReason === 'string' ? zeroTotalReason.trim() : '';
  if (gerekce.length >= ZERO_TOTAL_REASON_MIN) {
    return { blocked: false, warnings };
  }

  const sifirSatirlar = lines.filter(l => lineGross(l) <= 0);
  const liste = sifirSatirlar.length
    ? sifirSatirlar
        .map(l => `${l.productCode || '?'} ${l.productName || ''}`.trim() +
          ` (${Number(l.quantity) || 0} × ${Number(l.unitPrice) || 0} TL)`)
        .join(', ')
    : `${lines.length} satır`;

  return {
    blocked: true,
    code: 'ZERO_TOTAL_REASON_REQUIRED',
    message:
      `Bu satış faturasının toplamı ${total.toFixed(2)} TL. Sıfır tutarlı satış ` +
      `faturası stok çıkışı doğurur ama alacak doğurmaz; yanlışlıkla kesilmesi ` +
      `malın bedelsiz çıkması demektir. Kalemler: ${liste}. ` +
      `Bu bilinçli bir işlemse (numune, promosyon vb.) en az ` +
      `${ZERO_TOTAL_REASON_MIN} karakterlik bir GEREKÇE yazıp tekrar kaydedin; ` +
      `gerekçe belgeye ve denetim kaydına işlenir.`,
    warnings,
  };
}

/**
 * Kapı düştüğünde fırlatılan hata — route katmanı `err.statusCode`/`err.code`
 * okuyabilsin diye (bkz. `WarehouseGateError` ile aynı desen).
 */
export class ZeroTotalGateError extends Error {
  readonly code = 'ZERO_TOTAL_REASON_REQUIRED';
  readonly statusCode = 400;
  readonly warnings: string[];
  constructor(message: string, warnings: string[]) {
    super(message);
    this.name = 'ZeroTotalGateError';
    this.warnings = warnings;
  }
}

/** Değerlendirir ve düşerse FIRLATIR (çağıran kodda tip daraltma gerekmez). */
export function assertZeroTotalAllowed(
  type: InvoiceType | string,
  grandTotal: number,
  lines: ZeroPriceLineInput[],
  zeroTotalReason?: unknown
): string[] {
  const sonuc = evaluateZeroTotalGate(type, grandTotal, lines, zeroTotalReason);
  if (sonuc.blocked) throw new ZeroTotalGateError(sonuc.message || 'Sıfır tutarlı fatura gerekçesi gerekli.', sonuc.warnings);
  return sonuc.warnings;
}
