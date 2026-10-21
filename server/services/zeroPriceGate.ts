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

/**
 * SIFIR TUTAR YETKİSİ — 2026-10-21
 * ================================
 * 2026-10-20'de eklenen ilk kapı yalnız "≥10 karakter gerekçe" istiyordu.
 * ÖLÇÜLDÜ ve YETERSİZ BULUNDU: `"asdfasdfasdf"` ve `"1111111111"` kapıyı
 * geçiyordu. Yani herhangi bir kasiyer, anlamsız 10 karakter yazarak malı
 * bedelsiz çıkarabiliyordu; kapı "sessizliği kaldırıyordu" ama **yetki
 * sormuyordu**. İş emri (P3) bunu açıkça istiyor: meşru bedelsiz işlemler
 * AYRI ve AÇIK yetkilendirmeyle desteklenmeli.
 *
 * Bu yüzden artık ÜÇ şey birlikte aranıyor:
 *   1. YETKİ  — yalnız yönetici rolleri bedelsiz satış kesebilir
 *                (açık izin listesi; listede olmayan rol REDDEDİLİR).
 *   2. GEREKÇE — en az `ZERO_TOTAL_REASON_MIN` karakter VE en az
 *                `ZERO_TOTAL_REASON_MIN_WORDS` kelime. Tek kelimelik ya da
 *                klavye ezberi ("asdf…", "1111…") artık geçmez.
 *   3. İZ     — ikisi de sağlanınca gerekçe belgeye + denetim kaydına yazılır
 *                (mevcut davranış korunur).
 *
 * NEDEN ROL, NEDEN YENİ BİR PERMISSION KODU DEĞİL: ayrı bir permission kodu
 * eklemek `server/security/permissions.ts` kataloğunu ve ona bağlı iki
 * sözleşme testini (registry + frontend matris) değiştirmeyi gerektirir; bu
 * katalog, canlıdaki MEVCUT müşteri paketlerinin yetkilerini besliyor.
 * Katalog değişikliği bu işin kapsamı dışında ve risklidir. Rol listesi ise
 * kimlik katmanında zaten var olan bir olgudur ve dar tutulabilir.
 * (Katalog genişletmesi ayrı bir karar olarak açık bırakıldı.)
 */
const ZERO_TOTAL_AUTHORIZED_ROLES: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'COMPANY_ADMIN',
  // Kimlik katmanı firma üyeliğinde slug taşır (authGuards → userRole).
  'company_admin',
  'platform_admin',
]);

/** Gerekçede aranan en az KELİME sayısı ("asdfasdfasdf" tek kelimedir). */
export const ZERO_TOTAL_REASON_MIN_WORDS = 2;

/** Kapı yalnız bu türlerde çalışır (satış yönü = alacak doğuran belgeler). */
const GATED_TYPES: ReadonlySet<InvoiceType> = new Set<InvoiceType>(['SALES', 'RETAIL_POS']);

/** Çağıranın kimliği — kapı bunu YETKİ için okur, hiçbir yere yazmaz. */
export interface ZeroPriceActor {
  /** `req.user.role` (UserRole) ve/veya `req.userRole` (firma üyeliği slug'ı). */
  role?: string | null;
  /** Firma üyeliği slug'ları — çoklu rol desteği için. */
  roleSlugs?: string[] | null;
}

/** Gerekçe "anlamlı" mı: yeterli uzunluk + yeterli kelime + tek karakter tekrarı değil. */
export function isMeaningfulReason(gerekce: string): boolean {
  const t = gerekce.trim();
  if (t.length < ZERO_TOTAL_REASON_MIN) return false;
  const kelimeler = t.split(/\s+/).filter(w => /[A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(w));
  if (kelimeler.length < ZERO_TOTAL_REASON_MIN_WORDS) return false;
  // Tek karakterin tekrarı ("1111111111", "----------") anlamlı değildir.
  const benzersiz = new Set(t.replace(/\s/g, ''));
  if (benzersiz.size < 3) return false;
  return true;
}

/** Aktörün bedelsiz satış yetkisi var mı? Liste DIŞI her şey reddedilir. */
export function isZeroTotalAuthorized(actor?: ZeroPriceActor): boolean {
  if (!actor) return false;
  const adaylar = [actor.role, ...(actor.roleSlugs || [])]
    .filter((r): r is string => typeof r === 'string' && r.trim().length > 0);
  return adaylar.some(r => ZERO_TOTAL_AUTHORIZED_ROLES.has(r));
}

export interface ZeroPriceLineInput {
  productCode?: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  /** Ürünün kendi taban satış fiyatı — varsa "fiyatı var ama 0 girilmiş" sinyali. */
  productSalePrice?: number;
}

export interface ZeroTotalEvaluation {
  /** true → fatura YAZILMAZ (route 400/403 döner). */
  blocked: boolean;
  /** Makine okunur hata kodu (istemci ayırt edebilsin diye). */
  code?: 'ZERO_TOTAL_REASON_REQUIRED' | 'ZERO_TOTAL_FORBIDDEN';
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
  zeroTotalReason?: unknown,
  actor?: ZeroPriceActor
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

  const gerekce = typeof zeroTotalReason === 'string' ? zeroTotalReason.trim() : '';

  // ── 1) YETKİ: bedelsiz satış yalnız yönetici rollerinde ──
  // Sıra önemli: yetkisiz çağırana "gerekçe yaz" demek, ona deneme-yanılma
  // ile kapıyı aşma imkânı verir. Önce YETKİ sorulur.
  if (!isZeroTotalAuthorized(actor)) {
    return {
      blocked: true,
      code: 'ZERO_TOTAL_FORBIDDEN',
      message:
        `Sıfır tutarlı satış faturası kesme yetkiniz yok. Bu işlem malın ` +
        `bedelsiz çıkmasına yol açar ve yalnız yönetici onayıyla yapılabilir. ` +
        `Gerekliysa yöneticinizden işlemi kendisinin yapmasını isteyin.`,
      warnings,
    };
  }

  // ── 2) GEREKÇE: yeterli uzunluk + kelime + anlamlılık ──
  if (isMeaningfulReason(gerekce)) {
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
      `${ZERO_TOTAL_REASON_MIN} karakter ve en az ${ZERO_TOTAL_REASON_MIN_WORDS} ` +
      `kelimelik bir GEREKÇE yazıp tekrar kaydedin; gerekçe belgeye ve denetim ` +
      `kaydına işlenir.`,
    warnings,
  };
}

/**
 * Kapı düştüğünde fırlatılan hata — route katmanı `err.statusCode`/`err.code`
 * okuyabilsin diye (bkz. `WarehouseGateError` ile aynı desen).
 *
 * 2026-10-21: `code` ve `statusCode` artık DEĞERDEN geliyor. Yetkisiz çağıran
 * `400` değil `403` almalı: 400 "isteğin biçimi bozuk" der, oysa burada istek
 * kusursuz — çağıranın YETKİSİ yok. İstemci ikisini ayırt edebilmeli.
 */
export class ZeroTotalGateError extends Error {
  readonly code: 'ZERO_TOTAL_REASON_REQUIRED' | 'ZERO_TOTAL_FORBIDDEN';
  readonly statusCode: 400 | 403;
  readonly warnings: string[];
  constructor(
    message: string,
    warnings: string[],
    code: ZeroTotalGateError['code'] = 'ZERO_TOTAL_REASON_REQUIRED',
  ) {
    super(message);
    this.name = 'ZeroTotalGateError';
    this.code = code;
    this.statusCode = code === 'ZERO_TOTAL_FORBIDDEN' ? 403 : 400;
    this.warnings = warnings;
  }
}

/** Değerlendirir ve düşerse FIRLATIR (çağıran kodda tip daraltma gerekmez). */
export function assertZeroTotalAllowed(
  type: InvoiceType | string,
  grandTotal: number,
  lines: ZeroPriceLineInput[],
  zeroTotalReason?: unknown,
  actor?: ZeroPriceActor
): string[] {
  const sonuc = evaluateZeroTotalGate(type, grandTotal, lines, zeroTotalReason, actor);
  if (sonuc.blocked) {
    throw new ZeroTotalGateError(
      sonuc.message || 'Sıfır tutarlı fatura gerekçesi gerekli.',
      sonuc.warnings,
      sonuc.code === 'ZERO_TOTAL_FORBIDDEN' ? 'ZERO_TOTAL_FORBIDDEN' : 'ZERO_TOTAL_REASON_REQUIRED',
    );
  }
  return sonuc.warnings;
}
