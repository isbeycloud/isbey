export interface XmlValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class XmlValidatorService {
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
    const lower = xmlContent.toLowerCase();
    if (lower.includes('<!doctype') || lower.includes('<!entity') || lower.includes('system "') || lower.includes('public "')) {
      return {
        valid: false,
        errors: ['Güvenlik İhlali: XML içinde harici DTD veya ENTITY tanımlamalarına izin verilmez (XXE Koruması).'],
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
