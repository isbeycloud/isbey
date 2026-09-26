/**
 * XSLT Uyumluluk Katmanı
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-26: Bu modül, dışarıdan yüklenen (Hızlı Bilişim portalı, GİB, tedarikçi)
 * XSLT dosyalarının tarayıcı motorunda (XSLT 1.0) çalışabilmesi için gereken
 * normalleştirmeyi yapar.
 *
 * NEDEN GEREKLİ:
 * Türkiye'deki e-fatura XSLT şablonları pratikte iki biçimde gelir:
 *
 *   1. `version="2.0"` bildirirler — çünkü kaynak editörler (Altova, Oxygen)
 *      varsayılan olarak 2.0 yazar — ama gövdede yalnız 1.0 yapıları kullanırlar
 *      (for-each, if, value-of, call-template). Bu dosyalar tarayıcıda ÇALIŞIR;
 *      tek engel bildirilen sürüm numarası ve 2.0'a özgü birkaç yönerge.
 *
 *   2. Gerçekten 2.0 yapıları kullanırlar (for-each-group, tokenize, matches,
 *      xsl:function). Bunlar tarayıcıda ÇALIŞTIRILAMAZ; sessizce boş çıktı
 *      üretmek yerine kullanıcıya açıkça söylenmelidir.
 *
 * Bu modül (1)'i otomatik uyumlu hale getirir ve (2)'yi tespit edip bildirir.
 * Kural: dönüşüm SESSİZCE başarısız olmaz — ya çalışır ya da nedenini söyler.
 */

export interface XsltNormalizeResult {
  /** Tarayıcı motoruna verilecek (uyumlu) XSLT metni. */
  content: string;
  /** Yapılan otomatik düzeltmeler — kullanıcıya gösterilir. */
  adjustments: string[];
  /** Bu dosya tarayıcıda çalıştırılamaz (gerçek XSLT 2.0 yapıları var). */
  unsupported: boolean;
  /** `unsupported` ise hangi yapıların bulunduğu. */
  unsupportedFeatures: string[];
  /**
   * Reddedilmesi gereken dış varlık/DTD girişimleri (XXE). Boş değilse dosya
   * kaydedilmemeli ve dönüştürülmemelidir — bkz. EXTERNAL_ENTITY_PATTERNS.
   */
  externalEntityViolations: string[];
}

/**
 * Dış varlık / DTD sızıntısı (XXE) kalıpları.
 *
 * NEDEN AYRI: Tarayıcı `DOMParser`'ı harici DTD'yi İNDİRMEZ, yani tarayıcı
 * tarafında XXE zaten sömürülemez. Yine de dışarıdan yüklenen bir şablonun
 * `SYSTEM`/`PUBLIC` ile dosya veya ağ kaynağı gösterme girişimi bir tasarım
 * hatasıdır ve SESSİZCE kabul edilmemelidir: ileride sunucu tarafında gerçek
 * bir XML ayrıştırıcı devreye girerse bu dosya doğrudan açık hâline gelir.
 * Bu yüzden reddedilir, uyarılmaz.
 *
 * Not: `general.xslt` gibi gerçek e-fatura şablonlarında DOCTYPE BULUNMAZ;
 * bu denetim mevcut şablonların hiçbirini etkilemez.
 */
const EXTERNAL_ENTITY_PATTERNS: Array<{ label: string; test: RegExp }> = [
  { label: 'DTD dış varlık bildirimi (<!ENTITY ... SYSTEM/PUBLIC ...>)', test: /<!ENTITY\s+[^>]*\b(SYSTEM|PUBLIC)\b/i },
  { label: 'DTD dış alt küme (<!DOCTYPE ... SYSTEM/PUBLIC ...>)', test: /<!DOCTYPE[^>]*\b(SYSTEM|PUBLIC)\b/i },
  { label: 'XSLT dış şablon içe aktarma (xsl:include / xsl:import)', test: /<xsl:(?:include|import)[\s>]/i },
];

/** Gerçekten XSLT 2.0/3.0'a özgü, tarayıcı motorunun desteklemediği yapılar. */
const UNSUPPORTED_PATTERNS: Array<{ label: string; test: RegExp }> = [
  { label: 'xsl:for-each-group', test: /<xsl:for-each-group[\s>]/ },
  { label: 'xsl:function', test: /<xsl:function[\s>]/ },
  { label: 'xsl:analyze-string', test: /<xsl:analyze-string[\s>]/ },
  { label: 'xsl:perform-sort', test: /<xsl:perform-sort[\s>]/ },
  // XPath 2.0 fonksiyonları — 1.0'da yoktur, derleme hatası verir.
  { label: 'tokenize()', test: /\btokenize\s*\(/ },
  { label: 'matches()', test: /\bmatches\s*\(/ },
  { label: 'replace()', test: /\breplace\s*\(/ },
  { label: 'string-join()', test: /\bstring-join\s*\(/ },
  { label: 'distinct-values()', test: /\bdistinct-values\s*\(/ },
  { label: 'current-group()', test: /\bcurrent-group\s*\(/ },
  { label: 'xsl:sequence', test: /<xsl:sequence[\s>]/ },
];

/**
 * `<![CDATA[...]]>` bloklarını ve `<script>...</script>` gövdelerini devre dışı
 * bırakır; geri kalan metin XSLT yapılarını aramak için kullanılır.
 *
 * NEDEN: Hızlı Bilişim'in `general.xslt` dosyası yaklaşık 100 KB gömülü QR
 * kütüphanesi taşır. Bu kod JS'dir ve içinde `replace(`, `matches(` gibi dizi
 * çağrıları geçer. Bunları XSLT 2.0 fonksiyonu sanmak yanlış teşhis olurdu.
 */
function stripCodeBlocks(xslt: string): string {
  return xslt
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

/**
 * XSLT 2.0 çıktı yönergelerini (`xsl:character-map`, `use-character-maps`)
 * kaldırır. Bu yönergeler yalnız karakter eşleme yapar; belge içeriğini
 * değiştirmezler. kaldırılmadıklarında 1.0 derleyicisi hata verir.
 */
function stripXslt20OutputDirectives(xslt: string): { content: string; changes: string[] } {
  const changes: string[] = [];
  let content = xslt;

  const charMapCount = (content.match(/<xsl:character-map[\s>]/g) || []).length;
  if (charMapCount > 0) {
    // <xsl:character-map ...> ... </xsl:character-map> bloklarını (iç içe olmayan) kaldır.
    content = content.replace(/<xsl:character-map\b[^>]*>[\s\S]*?<\/xsl:character-map>\s*/g, '');
    changes.push(`${charMapCount} adet <xsl:character-map> kaldırıldı (XSLT 2.0 yönergesi).`);
  }

  if (/use-character-maps\s*=/.test(content)) {
    content = content.replace(/\s*use-character-maps\s*=\s*"[^"]*"/g, '');
    changes.push('<xsl:output use-character-maps> niteliği kaldırıldı.');
  }

  // version="2.0" / "3.0" → "1.0". Yalnız kök stylesheet etiketinde.
  const versionMatch = content.match(/<xsl:(?:transform|stylesheet)\b[^>]*\bversion\s*=\s*["']([^"']+)["']/);
  if (versionMatch && versionMatch[1] !== '1.0') {
    content = content.replace(
      /(<xsl:(?:transform|stylesheet)\b[^>]*\bversion\s*=\s*["'])[^"']+(["'])/,
      '$11.0$2'
    );
    changes.push(`XSLT sürüm bildirimi "${versionMatch[1]}" → "1.0" yapıldı (gövdedeki yapılar 1.0 uyumlu).`);
  }

  return { content, changes };
}

/**
 * Yüklenen XSLT'yi tarayıcı motoru için hazırlar.
 */
export function normalizeXsltForBrowser(xsltContent: string): XsltNormalizeResult {
  const result: XsltNormalizeResult = {
    content: xsltContent,
    adjustments: [],
    unsupported: false,
    unsupportedFeatures: [],
    externalEntityViolations: [],
  };

  if (!xsltContent || typeof xsltContent !== 'string') return result;

  // 0) Dış varlık / DTD girişimi (XXE). Bu kontrol CDATA'dan ÖNCE yapılır:
  // `<!ENTITY ... SYSTEM ...>` bir yorum veya script içinde gizlenmiş olsa bile
  // dosya reddedilmelidir — gizleme girişiminin kendisi niyeti gösterir.
  for (const { label, test } of EXTERNAL_ENTITY_PATTERNS) {
    if (test.test(xsltContent)) result.externalEntityViolations.push(label);
  }

  // 1) Bu dosya tarayıcıda hiç çalıştırılamaz mı?
  const searchable = stripCodeBlocks(xsltContent);
  for (const { label, test } of UNSUPPORTED_PATTERNS) {
    if (test.test(searchable)) result.unsupportedFeatures.push(label);
  }
  if (result.unsupportedFeatures.length > 0) {
    result.unsupported = true;
    return result; // Normalleştirmenin anlamı yok; kullanıcıya açıkça söylenecek.
  }

  // 2) 2.0 çıktı yönergelerini ve sürüm bildirimini temizle.
  const { content, changes } = stripXslt20OutputDirectives(xsltContent);
  result.content = content;
  result.adjustments.push(...changes);

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Hafif XML iyi-biçimlilik denetimi
// ────────────────────────────────────────────────────────────────────────────
//
// NEDEN: Sunucuda XML ayrıştırıcı bağımlılığı yoktur ve eklenmemelidir (host'ta
// native modül derlenemez). Ancak XSLT doğrulaması için gerçek bir ayrıştırma
// gerekir: eski `validateXslt` yalnız `<xsl:` etiketlerini sayıyordu ve CDATA
// içindeki ~100 KB gömülü JS'i (QR kütüphanesi) ayırt edemiyordu; bu da yanlış
// sonuç üretiyordu. Aşağıdaki tarayıcı; CDATA, yorum, işlem yönergesi ve DOCTYPE
// bloklarını atlar, kalan etiketleri yığınla eşleştirir.

export interface XmlishParseResult {
  ok: boolean;
  error?: string;
  rootName?: string;
  hasTemplate?: boolean;
}

export function parseXmlish(input: string): XmlishParseResult {
  const stack: string[] = [];
  let rootName: string | undefined;
  let hasTemplate = false;
  let i = 0;
  const n = input.length;

  const fail = (msg: string): XmlishParseResult => ({ ok: false, error: msg });

  while (i < n) {
    const lt = input.indexOf('<', i);
    if (lt === -1) break;

    // Metin düğümü: lt'den önce kalan kısım (yok sayılır).
    i = lt;

    // <!-- yorum -->
    if (input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4);
      if (end === -1) return fail('Kapatılmamış yorum bloğu (<!-- ... -->).');
      i = end + 3;
      continue;
    }

    // <![CDATA[ ... ]]>  — içerik XML olarak YORUMLANMAZ, atlanır.
    if (input.startsWith('<![CDATA[', i)) {
      const end = input.indexOf(']]>', i + 9);
      if (end === -1) return fail('Kapatılmamış CDATA bloğu (<![CDATA[ ... ]]>) .');
      i = end + 3;
      continue;
    }

    // <? ... ?> işlem yönergesi (XML bildirimi dahil)
    if (input.startsWith('<?', i)) {
      const end = input.indexOf('?>', i + 2);
      if (end === -1) return fail('Kapatılmamış işlem yönergesi (<? ... ?>).');
      i = end + 2;
      continue;
    }

    // <!DOCTYPE ...> — iç alt küme ([ ... ]) içerebilir.
    if (input.startsWith('<!', i)) {
      let j = i + 2;
      let depth = 0;
      while (j < n) {
        const ch = input[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
        j++;
      }
      if (j >= n) return fail('Kapatılmamış <!DOCTYPE ...> bildirimi.');
      i = j + 1;
      continue;
    }

    // </kapanış>
    if (input.startsWith('</', i)) {
      const end = input.indexOf('>', i);
      if (end === -1) return fail('Kapatılmamış bitiş etiketi.');
      const name = input.slice(i + 2, end).trim().split(/\s/)[0];
      const expected = stack.pop();
      if (expected === undefined) {
        return fail(`Fazladan bitiş etiketi: </${name}>.`);
      }
      if (expected !== name) {
        return fail(`Etiket eşleşmiyor: <${expected}> kapatılırken </${name}> bulundu.`);
      }
      i = end + 1;
      continue;
    }

    // <açılış ...> veya <kendi-kendini-kapatan />
    const end = findTagEnd(input, i);
    if (end === -1) return fail('Kapatılmamış etiket (> bulunamadı).');
    const raw = input.slice(i + 1, end);
    const selfClosing = raw.trimEnd().endsWith('/');
    const name = raw.trim().replace(/\/$/, '').trim().split(/[\s/]/)[0];

    if (!name) return fail('Etiket adı boş.');
    // XML adı kaba kontrolü (isim alanı öneki dahil).
    if (!/^[A-Za-z_:][\w.:-]*$/.test(name)) {
      return fail(`Geçersiz etiket adı: <${name}>.`);
    }

    if (name === 'xsl:template' || name === 'template') hasTemplate = true;

    if (stack.length === 0 && rootName === undefined) rootName = name;
    if (!selfClosing) stack.push(name);

    i = end + 1;
  }

  if (stack.length > 0) {
    return fail(`Kapatılmayan etiket(ler): ${stack.slice(-3).map(t => `<${t}>`).join(', ')}.`);
  }
  if (rootName === undefined) {
    return fail('Hiç XML elemanı bulunamadı.');
  }

  return { ok: true, rootName: localName(rootName), hasTemplate };
}

/**
 * `xsl:stylesheet` → `stylesheet`. XSLT kök elemanı önekli (`xsl:`) ya da
 * öneksiz (varsayılan ad alanı) yazılabilir; ikisi de kabul edilir.
 */
export function localName(qname: string): string {
  const i = qname.indexOf(':');
  return i === -1 ? qname : qname.slice(i + 1);
}

/**
 * `<` konumundan başlayarak etiketi kapatan `>` işaretini bulur.
 * Tırnak içindeki `>` karakterlerini (ör. XPath `select="a > b"`) atlar.
 */
function findTagEnd(input: string, start: number): number {
  let quote: string | null = null;
  for (let j = start + 1; j < input.length; j++) {
    const ch = input[j];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return j;
    }
  }
  return -1;
}
