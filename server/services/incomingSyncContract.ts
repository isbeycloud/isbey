/**
 * GELEN BELGE SENKRON SÖZLEŞMESİ (fatura + irsaliye ORTAK)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-29 eklendi.
 *
 * NEDEN ORTAK DOSYA: Gelen e-Fatura ve gelen e-İrsaliye senkronları AYNI
 * entegratör ucundan (`GetDocumentReceiverAllList`) beslenir ve AYNI soruları
 * yanıtlamak zorundadır: "kaç belge bulundu, kaçı yeni, kaçı mükerrer, kaçı
 * hatalı ve HANGİ belge neden hatalı?". İki akış ayrı ayrı sayı üretirse
 * kullanıcı iki sekmede çelişkili toplamlar görür.
 *
 * ⚠️ SÖZLEŞMENİN İKİ KURALI:
 *   1. Senkron YALNIZ gelen belge havuzunu doldurur. Stok, cari, alış faturası
 *      ve stok hareketi ÜRETMEZ (bkz. CLAUDE.md md.3 ve kullanıcı kuralı §3).
 *   2. Mükerrerlik ETTN/UUID üzerinden, TRANSACTION İÇİNDE belirlenir; aynı
 *      belgeyi iki kez çekmek ikinci bir kayıt yaratmaz.
 */

/** Tek bir belgenin senkron sonucu. */
export type SyncDocumentOutcome =
  /** İçeriği indirildi, çözümlendi ve havuza YENİ kayıt olarak yazıldı. */
  | 'NEW'
  /** Aynı ETTN/UUID zaten havuzda — hiç dokunulmadı. */
  | 'DUPLICATE'
  /** Listede vardı ama içeriği alınamadı/çözümlenemedi → havuzda HATA durumunda. */
  | 'ERROR'
  /** İndirme sınırı dolduğu için bu turda işlenmedi (belge kaybolmaz, tekrar denenir). */
  | 'SKIPPED'
  /**
   * Daha önce içeriği okunamamıştı; TEKRAR denemede içerik alındı ve kayıt
   * okunabilir hâle geldi.
   *
   * ⚠️ NEDEN GEREKLİ: "okunamadı" kalıcı bir kader olmamalıdır. Belge
   * entegratörde sonradan erişilebilir hâle gelebilir (işlenme gecikmesi).
   * Mükerrer sayıp hiç dokunmasaydık kullanıcının "Tekrar dene" düğmesi
   * hiçbir şey yapmayan bir düğme olurdu.
   */
  | 'UPDATED';

export interface SyncDocumentResult {
  /** Belgenin entegratördeki kimliği (ETTN). */
  uuid: string;
  /** Belge numarası — listeden geldiyse. Bilinmiyorsa boş. */
  documentNo: string;
  /** Kullanıcıya gösterilecek tek satırlık sonuç açıklaması (hata varsa nedeni). */
  message?: string;
  outcome: SyncDocumentOutcome;
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  /** Entegratöre GÖNDERİLEN aralık (kullanıcının seçtiği). */
  dateRange: { startDate: string; endDate: string };
  /** Entegratörün listesinde dönen belge sayısı. */
  foundCount: number;
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  /** Öncekiler okunamamışken bu turda okunabilir hâle gelenler. */
  updatedCount: number;
  /** İndirme sınırı nedeniyle bu turda işlenmeyenler. */
  skippedCount: number;
  /** Sınıra takıldı mı — kullanıcıya "tekrar çekin" demek için. */
  truncated: boolean;
  /** Belge bazlı sonuçlar (kullanıcı hangi belgenin neden hatalı olduğunu görür). */
  documents: SyncDocumentResult[];

  /**
   * Aralık kısaltıldıysa/ters çevrildiyse ne yapıldığının AÇIK metni.
   *
   * ⚠️ Sessiz kısaltma yasağı: kullanıcı "son 1 yıl" isteyip sessizce 90 günlük
   * veri alırsa "eski belgelerim gelmiyor" diye saatlerce uğraşır.
   */
  rangeAdjustment?: string;
  /** Sunucunun çözdüğü aralık ön ayarı (`TODAY` | `LAST_7` | `LAST_30` | `CUSTOM`). */
  rangePreset?: DateRangePreset;

  // ── Geriye dönük uyum ────────────────────────────────────────────────────
  // Eski istemciler ve mevcut testler bu iki alanı okuyor. Anlamları korunur:
  // `syncedCount` = yeni kayıt sayısı, `unreadableCount` = hataya düşen sayı.
  syncedCount: number;
  unreadableCount: number;
}

/**
 * Tek senkronda indirilecek AZAMİ belge içeriği.
 *
 * ⚠️ NEDEN SINIR: Hızlı Bilişim'in gelen kutusu ucu SAYFALAMA DESTEKLEMEZ —
 * istenen aralığın tamamı tek yanıtta döner. Kullanıcı yanlışlıkla 3 yıllık bir
 * aralık seçerse ilk senkron yüzlerce XML indirip entegratörü ve sunucuyu
 * boğabilir ("kontrolsüz toplu indirme" yasağı).
 *
 * Sınır MÜKERRERLERİ SAYMAZ: havuzda zaten bulunan belgeler için içerik hiç
 * indirilmez. Böylece aynı aralığı tekrar çekmek ilerleme kaydeder — her turda
 * yeni belgelerin bir kısmı işlenir, hiçbiri kaybolmaz.
 */
export const MAX_CONTENT_DOWNLOADS_PER_SYNC = 100;

/** Senkron tarih aralığı seçenekleri — arayüz ve sunucu AYNI kimlikleri kullanır. */
export type DateRangePreset = 'TODAY' | 'LAST_7' | 'LAST_30' | 'CUSTOM';

/** Senkron ucunun kabul ettiği aralık girdisi. */
export interface SyncRangeInput {
  preset?: DateRangePreset;
  /** Yalnız `preset: 'CUSTOM'` iken kullanılır (`yyyy-MM-dd`). */
  startDate?: string;
  endDate?: string;
}

/**
 * Seçilen aralığı `yyyy-MM-dd` çiftine çevirir.
 *
 * ⚠️ SUNUCU TARAFINDA DA UYGULANIR: arayüz "son 7 gün" gönderdiğinde sunucu
 * bunu kendisi hesaplar. Hesabı yalnız istemciye bırakmak, elle atılan bir
 * istekle 5 yıllık aralık çekilmesine kapı açardı.
 *
 * Aralık ÜST SINIRI 90 gündür: daha geniş bir aralık, sayfalamasız bir uçta
 * kontrolsüz indirme demektir.
 */
export const MAX_RANGE_DAYS = 90;

export function resolveDateRange(
  preset: DateRangePreset | undefined,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string; preset: DateRangePreset } {
  const bugun = new Date();
  const gun = (d: Date) => d.toISOString().slice(0, 10);

  // ⚠️ Ön ayar verilmemiş ama TARİH verilmişse bu bir özel aralıktır. Eski
  // istemciler yalnız `{ startDate }` gönderiyordu; bunu "son 30 gün" saymak
  // kullanıcının seçtiği başlangıcı SESSİZCE yok sayardı.
  const ozelAralik = preset === 'CUSTOM' || (!preset && (customStart || customEnd));
  if (ozelAralik) {
    return {
      startDate: (customStart || '').trim() || gun(new Date(bugun.getTime() - 30 * 86400000)),
      endDate: (customEnd || '').trim() || gun(bugun),
      preset: 'CUSTOM',
    };
  }

  const gunSayisi = preset === 'TODAY' ? 0 : preset === 'LAST_7' ? 6 : 29;
  return {
    startDate: gun(new Date(bugun.getTime() - gunSayisi * 86400000)),
    endDate: gun(bugun),
    preset: preset || 'LAST_30',
  };
}

/**
 * Aralığı sözleşme sınırlarına göre doğrular ve gerekirse KISALTMAZ.
 *
 * ⚠️ SESSİZ KISALTMA YOKTUR: sonuç `adjustment` alanında ne yapıldığını
 * söyler. Kullanıcı "son 1 yıl" isteyip sessizce 90 günlük veri alırsa,
 * "eski belgelerim gelmiyor" diye saatlerce uğraşır.
 */
export function clampDateRange(
  startDate: string,
  endDate: string
): { startDate: string; endDate: string; adjustment?: string } {
  const gecerliMi = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
  if (!gecerliMi(startDate) || !gecerliMi(endDate)) {
    return { startDate, endDate, adjustment: 'Tarih biçimi geçersiz (yyyy-AA-gg bekleniyor).' };
  }
  const bas = new Date(startDate + 'T00:00:00.000Z').getTime();
  const son = new Date(endDate + 'T00:00:00.000Z').getTime();

  if (son < bas) {
    // Ters aralık sessizce "düzeltilmez" — kullanıcı hatayı görmeli.
    return { startDate: endDate, endDate: startDate, adjustment: 'Başlangıç ve bitiş tarihleri yer değiştirildi.' };
  }

  const gunFarki = Math.floor((son - bas) / 86400000);
  if (gunFarki > MAX_RANGE_DAYS) {
    return {
      startDate: new Date(son - MAX_RANGE_DAYS * 86400000).toISOString().slice(0, 10),
      endDate,
      adjustment: `Aralık en fazla ${MAX_RANGE_DAYS} gün olabilir; başlangıç ${startDate} yerine kısaltıldı.`,
    };
  }
  return { startDate, endDate };
}
