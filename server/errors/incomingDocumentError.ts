/**
 * GELEN BELGE ALAN HATASI (domain error)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-29 eklendi.
 *
 * NEDEN GEREKLİ: Gelen belge akışında `400` "isteğin bozuk" demektir ve
 * istemciye "bir daha denersen düzelir" izlenimi verir. Oysa "bu belge zaten
 * alış faturasına dönüştürülmüş" durumu KALICI bir çakışmadır: aynı istek bin
 * kez tekrarlansa da sonuç aynıdır ve istemcinin YENİDEN DENEMEMESİ gerekir.
 * Doğru cevap `409 Conflict`'tir.
 *
 * ⚠️ AYRICA GÜVENLİK/İDEMPOTENTLİK: Mükerrer içeri alma koruması yalnız arayüz
 * düğmesinin kapalı olmasına DAYANAMAZ. Düğme bir kolaylıktır; kural sunucuda
 * uygulanır ve bu hata sınıfı kuralın ihlal edildiğini AÇIKÇA bildirir.
 *
 * `ProviderTransportError` ile karıştırılmamalıdır: o "entegratöre ulaşılamadı"
 * (502, geçici) demektir; bu ise "belge durumu buna izin vermiyor" (kalıcı).
 */
export class IncomingDocumentError extends Error {
  /** Makine tarafından okunabilir kod — istemci buna göre dallanır. */
  public readonly code: IncomingDocumentErrorCode;
  /** Önerilen HTTP durum kodu. */
  public readonly httpStatus: number;

  constructor(code: IncomingDocumentErrorCode, message: string) {
    super(message);
    this.name = 'IncomingDocumentError';
    this.code = code;
    this.httpStatus = HTTP_STATUS_FOR[code];
  }

  /** `instanceof` sınıf kimliğine bağlı kalmasın (çoklu modül yüklemesi). */
  public static is(err: unknown): err is IncomingDocumentError {
    return !!err && typeof err === 'object' && (err as any).name === 'IncomingDocumentError';
  }
}

export type IncomingDocumentErrorCode =
  /** Aynı ETTN/ belge zaten içeri alınmış — kalıcı çakışma (409). */
  | 'ALREADY_INGESTED'
  /** Belge durumu bu işleme izin vermiyor (red edilmiş, onaylanmış…). */
  | 'INVALID_STATE'
  /** Belge kaydı yok. */
  | 'NOT_FOUND'
  /** Belge içeriği okunamıyor/eksik — içeri alma engelli. */
  | 'NOT_INGESTIBLE';

const HTTP_STATUS_FOR: Record<IncomingDocumentErrorCode, number> = {
  ALREADY_INGESTED: 409,
  INVALID_STATE: 409,
  NOT_FOUND: 404,
  NOT_INGESTIBLE: 422,
};
