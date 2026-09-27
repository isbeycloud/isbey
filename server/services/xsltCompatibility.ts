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

/**
 * Gerçekten XSLT 2.0/3.0'a özgü, tarayıcı motorunun desteklemediği yapılar.
 *
 * 2026-09-27: `export` edildi — doğrulayıcı, bulduğu yapının dosyada KAÇINCI
 * karakterde olduğunu bularak Monaco marker'ının doğru satıra düşmesini sağlar.
 * Kalıpların kendisi değişmedi; yalnız görünürlük açıldı.
 */
export const UNSUPPORTED_PATTERNS: Array<{ label: string; test: RegExp }> = [
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
  // 2026-09-27: Bloklar SİLİNMEZ, AYNI UZUNLUKTA boşlukla değiştirilir.
  // NEDEN: Silme işlemi sonraki karakterlerin ofsetini kaydırır ve editörde
  // marker'ı yanlış satıra düşürür. Uzunluk korunduğunda `test.exec(...).index`
  // doğrudan ÖZGÜN metindeki konuma karşılık gelir.
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return xslt
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, blank)
    .replace(/<script\b[\s\S]*?<\/script>/gi, blank)
    .replace(/<style\b[\s\S]*?<\/style>/gi, blank);
}

/**
 * Tarayıcıda çalıştırılamayan XSLT 2.0 yapılarından İLK'ini dosyada bulur ve
 * konumunu döndürür. `stripCodeBlocks` uzunluğu koruduğu için ofset özgün
 * metinle birebir uyuşur.
 *
 * NEDEN: Kullanıcı "bu şablon 2.0 yapıları içeriyor" mesajını görünce hangi
 * satırda olduğunu görmek ister; 368 KB'lık dosyada elle aramak gerçekçi değil.
 */
export function findUnsupportedFeatureLocation(
  xsltContent: string,
  labels?: string[]
): { feature: string; line: number; column: number } | null {
  const searchable = stripCodeBlocks(xsltContent);
  let best: { feature: string; offset: number } | null = null;
  for (const { label, test } of UNSUPPORTED_PATTERNS) {
    if (labels && labels.length > 0 && !labels.includes(label)) continue;
    const re = new RegExp(test.source, test.flags.includes('g') ? test.flags : test.flags + 'g');
    const m = re.exec(searchable);
    if (m && (best === null || m.index < best.offset)) {
      best = { feature: label, offset: m.index };
    }
  }
  if (!best) return null;
  const before = xsltContent.slice(0, best.offset);
  const breaks = before.split('\n');
  return { feature: best.feature, line: breaks.length, column: breaks[breaks.length - 1].length + 1 };
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
  /** 1 tabanlı satır numarası (hata varsa). */
  line?: number;
  /** 1 tabanlı kolon numarası (hata varsa). */
  column?: number;
  /**
   * Hatanın ağırlığı: `error` = dosya kullanılamaz, `warning` = çalışır ama
   * şüpheli. Editörde marker rengini belirler.
   */
  severity?: 'error' | 'warning';
}

export function parseXmlish(input: string): XmlishParseResult {
  const stack: string[] = [];
  let rootName: string | undefined;
  let hasTemplate = false;
  let i = 0;
  const n = input.length;

  /**
   * Karakter ofsetini 1 tabanlı satır/kolon konumuna çevirir.
   *
   * NEDEN: Kullanıcı hatayı Monaco'da görebilmeli ve tıklayınca satıra
   * gidebilmeli. `error` metninde konum olmadan mesaj yalnız "bir yerde
   * kapatılmamış etiket var" diyordu; 368 KB'lık bir şablonda bu işe yaramaz.
   *
   * Performans: giriş 400 KB'a kadar olabilir; her `fail` çağrısında baştan
   * satır saymak kabul edilebilir (hata yolu nadirdir, mutlu yol etkilenmez).
   */
  const positionAt = (offset: number): { line: number; column: number } => {
    const upto = input.slice(0, Math.max(0, Math.min(offset, n)));
    let line = 1;
    let lastBreak = -1;
    for (let k = 0; k < upto.length; k++) {
      if (upto.charCodeAt(k) === 10 /* \n */) {
        line++;
        lastBreak = k;
      }
    }
    return { line, column: offset - lastBreak };
  };

  const fail = (msg: string, offset: number = i, severity: 'error' | 'warning' = 'error'): XmlishParseResult => {
    const { line, column } = positionAt(offset);
    return { ok: false, error: msg, line, column, severity };
  };

  while (i < n) {
    const lt = input.indexOf('<', i);
    if (lt === -1) break;

    // Metin düğümü: lt'den önce kalan kısım (yok sayılır).
    i = lt;

    // <!-- yorum -->
    if (input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4);
      if (end === -1) return fail('Kapatılmamış yorum bloğu (<!-- ... -->).', i);
      i = end + 3;
      continue;
    }

    // <![CDATA[ ... ]]>  — içerik XML olarak YORUMLANMAZ, atlanır.
    if (input.startsWith('<![CDATA[', i)) {
      const end = input.indexOf(']]>', i + 9);
      if (end === -1) return fail('Kapatılmamış CDATA bloğu (<![CDATA[ ... ]]>) .', i);
      i = end + 3;
      continue;
    }

    // <? ... ?> işlem yönergesi (XML bildirimi dahil)
    if (input.startsWith('<?', i)) {
      const end = input.indexOf('?>', i + 2);
      if (end === -1) return fail('Kapatılmamış işlem yönergesi (<? ... ?>).', i);
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
      if (j >= n) return fail('Kapatılmamış <!DOCTYPE ...> bildirimi.', i);
      i = j + 1;
      continue;
    }

    // </kapanış>
    if (input.startsWith('</', i)) {
      const end = input.indexOf('>', i);
      if (end === -1) return fail('Kapatılmamış bitiş etiketi.', i);
      const name = input.slice(i + 2, end).trim().split(/\s/)[0];
      const expected = stack.pop();
      if (expected === undefined) {
        return fail(`Fazladan bitiş etiketi: </${name}>.`, i);
      }
      if (expected !== name) {
        return fail(`Etiket eşleşmiyor: <${expected}> kapatılırken </${name}> bulundu.`, i);
      }
      i = end + 1;
      continue;
    }

    // <açılış ...> veya <kendi-kendini-kapatan />
    const end = findTagEnd(input, i);
    if (end === -1) return fail('Kapatılmamış etiket (> bulunamadı).', i);
    const raw = input.slice(i + 1, end);
    const selfClosing = raw.trimEnd().endsWith('/');
    const name = raw.trim().replace(/\/$/, '').trim().split(/[\s/]/)[0];

    if (!name) return fail('Etiket adı boş.', i);
    // XML adı kaba kontrolü (isim alanı öneki dahil).
    if (!/^[A-Za-z_:][\w.:-]*$/.test(name)) {
      return fail(`Geçersiz etiket adı: <${name}>.`, i);
    }

    if (name === 'xsl:template' || name === 'template') hasTemplate = true;

    if (stack.length === 0 && rootName === undefined) rootName = name;
    if (!selfClosing) stack.push(name);

    i = end + 1;
  }

  if (stack.length > 0) {
    // Açık etiketlerin en dıştakini göster: kullanıcının düzeltmesi gereken yer
    // genellikle açılan ama kapanmayan etiketin TA KENDİSİDİR, dosyanın sonu
    // değil. Konum için açılış etiketinin ofsetini yeniden buluruz.
    const open = stack[stack.length - 1];
    const escaped = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<${escaped}(?=[\\s/>])`);
    const m = re.exec(input);
    const offset = m ? m.index : n;
    return fail(
      `Kapatılmayan etiket(ler): ${stack.slice(-3).map(t => `<${t}>`).join(', ')}.`,
      offset
    );
  }
  if (rootName === undefined) {
    return fail('Hiç XML elemanı bulunamadı.', 0);
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
