export interface XmlValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * GELEN belge için yalnız GÜVENLİK kapısı sonucu.
 *
 * 2026-09-29 eklendi. Neden ayrı: `validateUblXml` aynı zamanda İŞ KURALI
 * denetler (UBLVersionID tam `2.1`, CustomizationID tam `TR1.2`, en az bir
 * `<cac:InvoiceLine>`). Bu koşullar İŞBEY'in KENDİ ürettiği belge için
 * doğrudur, ama GELEN bir belge için fazla katıdır: tedarikçi farklı bir
 * özelleştirme kimliği kullanıyorsa GERÇEK bir fatura "geçersiz" sayılıp
 * reddedilirdi. Gelen akışta reddedilmesi gereken tek şey GÜVENLİK ihlalidir.
 */
export interface XmlSecurityResult {
  safe: boolean;
  /** Güvenlik ihlali varsa gerekçe (kullanıcıya gösterilir). */
  reason?: string;
}

/** XXE/DTD göstergesi arayan desenler — tek kaynak, iki kapı da bunu kullanır. */
const XXE_MARKERS = ['<!doctype', '<!entity', 'system "', 'public "'];

/** Harici DTD veya ENTITY tanımı içeriyor mu (XXE koruması)? */
export function hasXxeMarkers(xmlContent: string): boolean {
  if (!xmlContent || typeof xmlContent !== 'string') return false;
  const lower = xmlContent.toLowerCase();
  return XXE_MARKERS.some(m => lower.includes(m));
}

/** Kullanıcıya gösterilen XXE reddi gerekçesi — tek kaynak. */
export const XXE_ERROR_MESSAGE =
  'Güvenlik İhlali: XML içinde harici DTD veya ENTITY tanımlamalarına izin verilmez (XXE Koruması).';

export class XmlValidatorService {
  /**
   * GELEN belge için GÜVENLİK kapısı — yalnız XXE/DTD denetimi.
   *
   * Neden `validateUblXml` değil: o metot İŞBEY'in kendi ürettiği belgeye
   * yönelik İŞ KURALI koşulları da arar (tam `2.1`, tam `TR1.2`). Gelen bir
   * belgeyi onlarla reddetmek, farklı özelleştirme kimliği kullanan GERÇEK
   * faturaları düşürürdü. Bkz. `XmlSecurityResult` açıklaması.
   */
  public static validateIncomingXml(xmlContent: string): XmlSecurityResult {
    if (!xmlContent || typeof xmlContent !== 'string' || xmlContent.trim().length === 0) {
      return { safe: false, reason: 'Belge içeriği boş.' };
    }
    if (hasXxeMarkers(xmlContent)) {
      return { safe: false, reason: XXE_ERROR_MESSAGE };
    }
    return { safe: true };
  }

  /**
   * Güvenli XML ve UBL-TR İş Kuralı Doğrulayıcısı (XXE Korumalı)
   */
  public static validateUblXml(xmlContent: string): XmlValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!xmlContent || typeof xmlContent !== 'string' || xmlContent.trim().length === 0) {
      return { valid: false, errors: ['XML içeriği boş olamaz.'], warnings: [] };
    }

    // 1. XXE (XML External Entity) ve DTD Injection Koruması
    if (hasXxeMarkers(xmlContent)) {
      return {
        valid: false,
        errors: [XXE_ERROR_MESSAGE],
        warnings: [],
      };
    }

    // 2. Kök Düğüm Kontrolü
    const isInvoice = xmlContent.includes('<Invoice') && xmlContent.includes('</Invoice>');
    const isDespatch = xmlContent.includes('<DespatchAdvice') && xmlContent.includes('</DespatchAdvice>');

    if (!isInvoice && !isDespatch) {
      errors.push('Geçersiz UBL Kök Elemanı: Belge <Invoice> veya <DespatchAdvice> standartında olmalıdır.');
    }

    // 3. Temel UBL-TR 2.1 Başlık Alanları
    if (!xmlContent.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>')) {
      errors.push('Eksik/Hatalı UBLVersionID (2.1 bekleniyor).');
    }
    if (!xmlContent.includes('<cbc:CustomizationID>TR1.2</cbc:CustomizationID>')) {
      errors.push('Eksik/Hatalı CustomizationID (TR1.2 bekleniyor).');
    }
    if (!xmlContent.includes('<cbc:UUID>') || !xmlContent.includes('</cbc:UUID>')) {
      errors.push('Zorunlu UUID (ETTN) alanı bulunamadı.');
    }

    // 4. Tarafların VKN/TCKN Varlığı
    const vknTcknRegex = /schemeID="(VKN|TCKN)">([0-9]{10,11})<\/cbc:ID>/g;
    const matches = Array.from(xmlContent.matchAll(vknTcknRegex));
    if (matches.length < 2) {
      errors.push('Gönderici ve Alıcı VKN/TCKN tanımlayıcıları eksik veya geçersiz formatta (10 veya 11 hane olmalıdır).');
    }

    // 5. En Az Bir Satır Varlığı
    const hasInvoiceLine = xmlContent.includes('<cac:InvoiceLine>');
    const hasDespatchLine = xmlContent.includes('<cac:DespatchLine>');
    if (!hasInvoiceLine && !hasDespatchLine) {
      errors.push('Belgede en az bir ürün/hizmet kalem satırı bulunmalıdır.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
