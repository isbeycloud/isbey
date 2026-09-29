/**
 * GELEN BELGE OPERASYON DURUMU
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-29 eklendi.
 *
 * NE YAPAR: Kayıtta saklanan HAM durumu (`RECEIVED`, `APPROVED`…) operasyonun
 * diline çevirir: YENİ / EŞLEŞTİRME BEKLİYOR / HAZIR / İÇERİ ALINDI / HATA.
 *
 * ⚠️ NEDEN TÜRETİLİR, SAKLANMAZ: "EŞLEŞTİRME BEKLİYOR" belgenin kendi özelliği
 * DEĞİLDİR; o an stok kartlarının var olup olmadığına bağlıdır. Kullanıcı eksik
 * ürün kartını açtığında belge KENDİLİĞİNDEN "HAZIR" olmalıdır — ama belge
 * kaydına dokunulmaz. Durumu kayda yazsaydık, kart açıldıktan sonra belge
 * sonsuza dek "eşleştirme bekliyor" görünürdü. Tek gerçek kaynak eşleştirmedir.
 *
 * ⚠️ MALİYET: Bu fonksiyon liste ucunda her belge için çağrılır. Bu yüzden
 * XML ÇÖZÜMLENMEZ; eşleşme belgenin zaten çözümlenmiş `items` alanından
 * yapılır ve arama kodları bir kez indekslenir (aşağıda `kodIndeksi`).
 */
import type { Product } from '../db/schema';

/** Operasyon dilindeki durum. */
export type OperationalStatus =
  /** İçeriği okundu, henüz kullanıcı bakmadı/eşleştirmedi. */
  | 'NEW'
  /** Kartı olmayan kalem var — içeri almadan önce eşleştirme gerekir. */
  | 'PENDING_MATCH'
  /** Tüm kalemler bir karta bağlı; içeri alınabilir. */
  | 'READY'
  /** Alış faturasına / mal girişine dönüştürüldü. */
  | 'INGESTED'
  /** İçerik okunamadı (bozuk/güvensiz/eksik belge). */
  | 'ERROR';

export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  NEW: 'Yeni',
  PENDING_MATCH: 'Eşleştirme Bekliyor',
  READY: 'Hazır',
  INGESTED: 'İçeri Alındı',
  ERROR: 'Hata',
};

/** Eşleşme için gereken asgari kalem şekli (fatura ve irsaliye ortak). */
export interface StatusLine {
  supplierProductCode?: string;
  barcode?: string;
  name?: string;
}

/** Saklanan ham durumlar — fatura ve irsaliye birleşimi. */
export type RawStatus =
  | 'RECEIVED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CONVERTED_TO_PURCHASE'
  | 'APPROVED'
  | 'UNREADABLE';

/** Kod karşılaştırması — büyük/küçük harf ve boşluk farkı eşleşmeyi bozmaz. */
function normalizeCode(raw: string | undefined): string {
  return (raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeName(raw: string | undefined): string {
  return (raw || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:()\[\]'"]/g, '');
}

/**
 * Ürün kartlarından arama indeksi kurar — liste başına BİR kez.
 *
 * ⚠️ Her belge için `products.find(...)` çağırmak, 100 belge × 100 kalem × 5000
 * ürün araması demektir. İndeks bunu sabit zamana indirir.
 */
export interface UrunIndeksi {
  kodlar: Map<string, Product>;
  adlar: Map<string, Product>;
}

export function urunIndeksiKur(products: Product[]): UrunIndeksi {
  const kodlar = new Map<string, Product>();
  const adlar = new Map<string, Product>();
  for (const p of products) {
    if (p.deletedAt) continue;
    for (const k of [p.code, p.barcode]) {
      const n = normalizeCode(k);
      // İlk kayıt kazanır — aynı kodu iki kart taşıyorsa (veri hatası) hangi
      // kartın seçildiği belirsizleşmesin diye kararlı davranırız.
      if (n && !kodlar.has(n)) kodlar.set(n, p);
    }
    const a = normalizeName(p.name);
    if (a && !adlar.has(a)) adlar.set(a, p);
  }
  return { kodlar, adlar };
}

/**
 * Tek bir kalemin karşılık gelen kartı var mı?
 *
 * ⚠️ Burada `matchLine`'ın TAM kademeleri kullanılmaz (eşleştirme hafızası
 * hariç): durum göstergesi "kullanıcı bir kart bulabilecek mi" sorusunu
 * yanıtlar. Hafıza kademesi `getIngestionPlan`da tam olarak çalışır ve orada
 * zaten gösterilir; burada onu da saymak liste ucuna her belge için ek bir
 * arama yükü bindirirdi.
 */
function kalemEslesti(line: StatusLine, idx: UrunIndeksi): boolean {
  for (const k of [line.barcode, line.supplierProductCode]) {
    const n = normalizeCode(k);
    if (n && idx.kodlar.has(n)) return true;
  }
  const ad = normalizeName(line.name);
  if (ad && idx.adlar.has(ad)) return true;
  return false;
}

/**
 * Saklanan durum + eşleştirme sonucundan OPERASYON durumunu üretir.
 *
 * Öncelik sırası ÖNEMLİDİR: içeri alınmış belge, kalemi eşleşmese bile
 * "İçeri Alındı"dır (geçmişte olan biten, bugünkü kart durumundan üstündür);
 * okunamayan belge de aynı şekilde her şeyden önce "Hata"dır.
 */
export function operationalStatus(
  raw: RawStatus,
  lines: StatusLine[],
  idx: UrunIndeksi,
  /**
   * Kullanıcı bu belgenin eşleştirme ekranını AÇTI MI?
   *
   * ⚠️ NEDEN GEREKLİ: "Yeni" ile "Eşleştirme Bekliyor" arasındaki fark belgenin
   * kendi verisinden ÇIKARILAMAZ — ikisi de aynı ham durumda (`RECEIVED`) ve
   * aynı kalemlere sahiptir. Fark tamamen "kullanıcı baktı mı" sorusundadır.
   * Bu bilgiyi yok sayıp her belgeye "Yeni" demek, operatöre "bunlara hiç
   * bakılmadı" diye yanlış bir iş yükü gösterirdi; her belgeye "Eşleştirme
   * Bekliyor" demek ise yeni gelen belgeyi işaretlemeyi imkânsız kılardı.
   * Bu yüzden işaret AÇIKÇA saklanır (`reviewedAt`), tahmin edilmez.
   */
  reviewed?: boolean
): OperationalStatus {
  // 1. Geçmişte kesinleşmiş sonuçlar.
  if (raw === 'CONVERTED_TO_PURCHASE' || raw === 'APPROVED') return 'INGESTED';
  if (raw === 'UNREADABLE') return 'ERROR';
  // Reddedilmiş belge kullanıcının kararıdır; "içeri alındı" değildir ama
  // yeniden eşleştirme de beklenmez. Hata sınıfında gösterilir ki listeden
  // düşüp kaybolmasın.
  if (raw === 'REJECTED') return 'ERROR';

  // 2. Kalemsiz okunmuş belge içeri alınamaz — bunu "yeni" saymak, kullanıcıyı
  //    açtığında hiçbir şey yapamayacağı bir belgeye yönlendirirdi.
  if (lines.length === 0) return 'ERROR';

  // 3. Henüz içeri alınmamış belge: kalemlerin kartı var mı?
  const eksik = lines.filter(l => !kalemEslesti(l, idx)).length;
  if (eksik === 0) return 'READY';
  // 4. Eksik kalem var. Kullanıcı ekranı hiç açmadıysa belge YENİ'dir; açtıysa
  //    artık "eşleştirme bekliyor"dur (bakıldı, bitirilmedi).
  return reviewed ? 'PENDING_MATCH' : 'NEW';
}

/** Liste üstü sayaçlar — pano kartları ve sekme rozetleri bunu kullanır. */
export interface StatusCounts {
  NEW: number;
  PENDING_MATCH: number;
  READY: number;
  INGESTED: number;
  ERROR: number;
  /** Operasyon bekleyen toplam: NEW + PENDING_MATCH + READY. */
  pendingOperation: number;
}

export function sayilariTopla(durumlar: OperationalStatus[]): StatusCounts {
  const s: StatusCounts = {
    NEW: 0,
    PENDING_MATCH: 0,
    READY: 0,
    INGESTED: 0,
    ERROR: 0,
    pendingOperation: 0,
  };
  for (const d of durumlar) s[d]++;
  s.pendingOperation = s.NEW + s.PENDING_MATCH + s.READY;
  return s;
}

/**
 * Operasyon durumuna göre süzme — liste ucundaki `status` parametresi.
 *
 * ⚠️ `'ALL'` ve tanınmayan değer süzmez: bilinmeyen bir süzgeç yüzünden BOŞ
 * liste dönmek, kullanıcıya "belge yok" dedirtirdi.
 */
export function operasyonDurumunaUygun(d: OperationalStatus, filtre: string | undefined): boolean {
  if (!filtre || filtre === 'ALL') return true;
  return d === filtre;
}
