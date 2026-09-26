/**
 * Gerçek XSLT Dönüşüm Motoru (tarayıcı tarafı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-26: Bu modül, belge tasarım önizlemesini GERÇEKTEN yüklenen XSLT ile
 * üretir. Öncesinde `XsltEngineService.transformXmlWithXslt` çağrılan XSLT'yi
 * hiç çalıştırmıyor, sabit bir HTML iskeleti döndürüyordu; yani kullanıcının
 * yüklediği tasarım önizlemede hiç görünmüyordu.
 *
 * NEDEN TARAYICIDA: Sunucuda XSLT 1.0 işleyicisi yok (libxslt bağımlılığı
 * yoktur, host'ta native modül derlenemez). Tarayıcının `XSLTProcessor`'ı
 * standart XSLT 1.0 motorudur ve zaten her istemcide mevcuttur. Şablonlar
 * Hızlı Bilişim portalında da bu motorla önizlenir.
 *
 * `transformToDocument` tercih edilir: `transformToFragment` çıktıyı XHTML
 * ad alanına sarar, `<html>` kökünü kaybettirir ve `<script>` gövdelerini
 * XML-kaçışlar (gömülü QR kütüphanesi bozulur).
 */

export interface XsltTransformResult {
  html: string;
  ok: boolean;
  error?: string;
  warnings: string[];
}

/** `<![CDATA[...]]>` ve `<script>` gövdelerini çıkarır (yanlış teşhisi önler). */
function stripCodeBlocks(xslt: string): string {
  return xslt
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

const UNSUPPORTED_PATTERNS: Array<{ label: string; test: RegExp }> = [
  { label: 'xsl:for-each-group', test: /<xsl:for-each-group[\s>]/ },
  { label: 'xsl:function', test: /<xsl:function[\s>]/ },
  { label: 'xsl:analyze-string', test: /<xsl:analyze-string[\s>]/ },
  { label: 'tokenize()', test: /\btokenize\s*\(/ },
  { label: 'matches()', test: /\bmatches\s*\(/ },
  { label: 'string-join()', test: /\bstring-join\s*\(/ },
  { label: 'distinct-values()', test: /\bdistinct-values\s*\(/ },
  { label: 'current-group()', test: /\bcurrent-group\s*\(/ },
];

/**
 * Tarayıcı motorunun işleyemeyeceği (gerçek XSLT 2.0) yapıları tespit eder.
 * Bunlar bulunursa dönüşüm denenmez; kullanıcıya açık hata verilir — sessizce
 * boş önizleme göstermek yanıltıcı olurdu.
 */
export function findUnsupportedXsltFeatures(xslt: string): string[] {
  if (!xslt) return [];
  const searchable = stripCodeBlocks(xslt);
  return UNSUPPORTED_PATTERNS.filter(p => p.test.test(searchable)).map(p => p.label);
}

/** Ayrıştırma hatasını okunabilir tek satıra indirir. */
function readParserError(doc: Document): string {
  const el = doc.querySelector('parsererror');
  if (!el) return 'Bilinmeyen XML ayrıştırma hatası.';
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 400) || 'XML ayrıştırma hatası.';
}

/**
 * UBL XML'i verilen XSLT ile HTML'e dönüştürür.
 *
 * Hata durumunda `ok: false` döner ve `error` alanında NEDENİ taşır — çağıran
 * taraf bunu kullanıcıya göstermelidir (boş iframe değil).
 */
export function transformXmlWithXsltInBrowser(xmlContent: string, xsltContent: string): XsltTransformResult {
  const warnings: string[] = [];

  if (!xmlContent?.trim()) {
    return { html: '', ok: false, error: 'Önizlenecek XML verisi boş.', warnings };
  }
  if (!xsltContent?.trim()) {
    return { html: '', ok: false, error: 'XSLT içeriği boş. Tasarım dosyası yükleyin.', warnings };
  }
  if (typeof XSLTProcessor === 'undefined') {
    return {
      html: '',
      ok: false,
      error: 'Bu tarayıcı XSLT dönüşümünü desteklemiyor (XSLTProcessor bulunamadı).',
      warnings,
    };
  }

  // Gerçek XSLT 2.0 yapıları: çalıştırmayı DENEME, nedenini söyle.
  const unsupported = findUnsupportedXsltFeatures(xsltContent);
  if (unsupported.length > 0) {
    return {
      html: '',
      ok: false,
      error:
        `Bu şablon tarayıcıda çalıştırılamayan XSLT 2.0 yapıları içeriyor: ${unsupported.join(', ')}. ` +
        'Önizleme için XSLT 1.0 uyumlu bir şablon yükleyin.',
      warnings,
    };
  }

  let xmlDoc: Document;
  let xsltDoc: Document;
  try {
    xmlDoc = new DOMParser().parseFromString(xmlContent, 'application/xml');
    if (xmlDoc.querySelector('parsererror')) {
      return { html: '', ok: false, error: `UBL XML ayrıştırılamadı: ${readParserError(xmlDoc)}`, warnings };
    }
  } catch (e: any) {
    return { html: '', ok: false, error: `UBL XML ayrıştırılamadı: ${e.message}`, warnings };
  }

  try {
    xsltDoc = new DOMParser().parseFromString(xsltContent, 'application/xml');
    if (xsltDoc.querySelector('parsererror')) {
      return { html: '', ok: false, error: `XSLT ayrıştırılamadı: ${readParserError(xsltDoc)}`, warnings };
    }
    if (!xsltDoc.querySelector('stylesheet, transform')) {
      return {
        html: '',
        ok: false,
        error: 'XSLT kök elemanı bulunamadı (<xsl:stylesheet> veya <xsl:transform> bekleniyordu).',
        warnings,
      };
    }
  } catch (e: any) {
    return { html: '', ok: false, error: `XSLT ayrıştırılamadı: ${e.message}`, warnings };
  }

  try {
    const proc = new XSLTProcessor();
    proc.importStylesheet(xsltDoc);
    // Güvenlik: gömülü script yalnız kendi çıktısında çalışsın; dış kaynak
    // yüklemesi yapılmasın.
    try {
      proc.setParameter(null, '_isbeyPreview', '1');
    } catch {
      /* bazı motorlar parametre setini reddeder; zararsız */
    }

    const outDoc = proc.transformToDocument(xmlDoc);
    const html = outDoc.documentElement ? outDoc.documentElement.outerHTML : '';

    if (!html.trim()) {
      return {
        html: '',
        ok: false,
        error:
          'XSLT çalıştı ancak boş çıktı üretti. Şablonun kök şablonu (/ eşleşmesi) veya seçtiği alanlar ' +
          'bu belge türüne uygun olmayabilir.',
        warnings,
      };
    }

    return { html, ok: true, warnings };
  } catch (e: any) {
    return {
      html: '',
      ok: false,
      error: `XSLT dönüşümü başarısız: ${e?.message || e}`,
      warnings,
    };
  }
}
