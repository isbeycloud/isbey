/**
 * VKN / TCKN biçim doğrulaması.
 *
 * ⚠️ NEDEN CHECKSUM YOK (2026-10-01 kararı):
 * Türkiye VKN'leri için dolaşan "mod 10" checksum algoritması, gerçek bir
 * mükellefin VKN'sini (ör. 4810592817) GEÇERSİZ sayıyor. Yanlış bir checksum
 * eklemek, gerçek mükellefleri "hatalı VKN" diye reddetmek demektir — bu,
 * doğrulamadan daha kötü bir hatadır. Kimin mükellef olduğunun OTORİTESİ
 * Hızlı Bilişim'dir; burada yalnız biçim (hane + rakam) kontrol edilir ve
 * gerçek sorgu sağlayıcıya bırakılır.
 */

export type TaxIdKind = 'VKN' | 'TCKN';

export interface TaxIdCheck {
  ok: boolean;
  kind?: TaxIdKind;
  /** Kullanıcıya gösterilecek, teknik olmayan mesaj. */
  message?: string;
}

/**
 * Girdi rakamlardan oluşmalı; boşluk/nokta/tire tolere edilir (kullanıcı
 * kopyala-yapıştırda sık sık ayraç bırakır). 10 hane → VKN, 11 hane → TCKN.
 * Başka uzunluk REDDEDİLİR (sağlayıcıya boşuna istek atılmaz).
 */
export function validateTaxId(raw: string | undefined | null): TaxIdCheck {
  const temiz = String(raw ?? '').replace(/[^0-9]/g, '');

  if (!temiz) {
    return { ok: false, message: 'VKN veya TCKN giriniz.' };
  }
  if (temiz.length === 10) {
    return { ok: true, kind: 'VKN' };
  }
  if (temiz.length === 11) {
    return { ok: true, kind: 'TCKN' };
  }
  return {
    ok: false,
    message: `VKN 10 hane, TCKN 11 hane olmalıdır. Girdiğiniz değer ${temiz.length} hane.`,
  };
}

/** Ayraçlardan arındırılmış hâli döndürür (sorguya bu gönderilir). */
export function normalizeTaxId(raw: string | undefined | null): string {
  return String(raw ?? '').replace(/[^0-9]/g, '');
}
