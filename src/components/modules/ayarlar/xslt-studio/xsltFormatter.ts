/**
 * XSLT / XML Biçimlendirici (güvenli)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: Editörde "Biçimlendir" düğmesi için yazıldı.
 *
 * NEDEN "GÜVENLİ": Fatura şablonunda boşluk anlam taşır. `<xsl:text>`, `<pre>`,
 * `<script>`, `<style>` ve CDATA bloklarındaki boşluklar ÇIKTIYA aynen geçer.
 * Naif bir biçimlendirici (satırları birleştirip yeniden bölen) faturayı
 * görsel olarak bozabilir — kullanıcı hiçbir şeyi değiştirmediği hâlde
 * basılan belge değişir. Bu kabul edilemez.
 *
 * Bu yüzden burada yalnızca ŞUNU yapıyoruz:
 *   • satırları BİRLEŞTİRMİYORUZ, BÖLMÜYORUZ
 *   • yalnızca satır başındaki girinti (leading whitespace) yeniden hesaplanır
 *   • ve yalnızca içeriği `<` ile başlayan satırlarda
 *   • korunan bölgelerde (CDATA, yorum, xsl:text, script, style, pre) HİÇBİR
 *     ŞEY değiştirilmez
 *
 * Sonuç: biçimlendirme sonrası belgenin metin düğümleri birebir aynı kalır;
 * değişen tek şey elemanların önündeki boşluk miktarıdır ve bu, eleman-içerikli
 * (element-only) içerikte XSLT/XML için anlamsızdır.
 */

const PROTECTED_TAGS = new Set(['xsl:text', 'text', 'script', 'style', 'pre', 'textarea']);

export interface FormatResult {
  /** Biçimlendirilmiş metin (başarısızsa özgün metin). */
  output: string;
  /** Kaç satırın girintisi değişti. */
  changedLines: number;
  /** Biçimlendirme uygulanamadıysa nedeni. */
  error?: string;
  /** Kullanıcıya gösterilecek uyarılar (bilgilendirici). */
  warnings: string[];
}

/** Bir satırın etiket yapısını çözümler. */
function scanLine(line: string): {
  opens: number;
  closes: number;
  selfClosingOrDeclaration: number;
  startsWithClose: boolean;
} {
  let opens = 0;
  let closes = 0;
  let selfClosingOrDeclaration = 0;
  let startsWithClose = false;
  let first = true;

  let i = 0;
  while (i < line.length) {
    const lt = line.indexOf('<', i);
    if (lt === -1) break;

    if (line.startsWith('<!--', lt)) {
      const end = line.indexOf('-->', lt + 4);
      i = end === -1 ? line.length : end + 3;
      first = false;
      continue;
    }
    if (line.startsWith('<?', lt) || line.startsWith('<!', lt)) {
      const end = line.indexOf('>', lt);
      selfClosingOrDeclaration++;
      i = end === -1 ? line.length : end + 1;
      first = false;
      continue;
    }

    // Etiket sonunu tırnak farkındalıklı bul.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < line.length) {
      const ch = line[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j++;
    }
    const raw = line.slice(lt + 1, j);
    if (first) {
      startsWithClose = raw.startsWith('/');
      first = false;
    }
    if (raw.startsWith('/')) closes++;
    else if (raw.trimEnd().endsWith('/')) selfClosingOrDeclaration++;
    else opens++;

    i = j + 1;
  }

  // Satırda etiketten başka anlamlı metin var mı? (metin düğümü)
  return { opens, closes, selfClosingOrDeclaration, startsWithClose };
}

/** Satır, korunan bir bölgenin (CDATA/yorum/script) içinde mi başlıyor? */
function opensProtectedRegion(line: string): 'cdata' | 'comment' | null {
  if (/<!\[CDATA\[/.test(line) && !/\]\]>/.test(line)) return 'cdata';
  if (/<!--/.test(line) && !/-->/.test(line)) return 'comment';
  return null;
}

/**
 * XSLT/XML metnini yeniden girintiler. İçeriği değiştirmez.
 */
export function formatXslt(source: string): FormatResult {
  const warnings: string[] = [];
  if (!source || !source.trim()) {
    return { output: source, changedLines: 0, warnings };
  }
  if (/\r\n/.test(source)) {
    warnings.push('Satır sonları CRLF; girinti hesabı LF kabul edilerek yapıldı.');
  }

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);

  let depth = 0;
  let changedLines = 0;
  let protectedRegion: 'cdata' | 'comment' | null = null;
  /** Korunan eleman yığını (xsl:text, script, style, pre...). */
  const protectedStack: string[] = [];

  const out: string[] = [];

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const trimmed = raw.trim();

    // ── Korunan bölge içindeyiz: satırı AYNEN koru.
    if (protectedRegion) {
      out.push(raw);
      if (protectedRegion === 'cdata' && raw.includes(']]>')) protectedRegion = null;
      if (protectedRegion === 'comment' && raw.includes('-->')) protectedRegion = null;
      continue;
    }

    if (!trimmed) {
      out.push('');
      continue;
    }

    // ── Korunan eleman içindeyiz: satırı AYNEN koru, yalnız yığını güncelle.
    if (protectedStack.length > 0) {
      out.push(raw);
      const { opens, closes } = scanLine(trimmed);
      // İç içe korunan elemanları da izle (script içinde <pre> gibi).
      const nameMatch = /^<\/?([A-Za-z_:][\w.:-]*)/.exec(trimmed);
      if (nameMatch) {
        const nm = nameMatch[1];
        if (trimmed.startsWith('</')) {
          const idx = protectedStack.lastIndexOf(nm);
          if (idx !== -1) protectedStack.length = idx;
        } else if (!trimmed.endsWith('/>') && PROTECTED_TAGS.has(nm)) {
          protectedStack.push(nm);
        }
      }
      void opens; void closes;
      const guard = opensProtectedRegion(trimmed);
      if (guard) protectedRegion = guard;
      continue;
    }

    // ── Metin düğümü satırı ( `<` ile başlamıyor ): DOKUNMA.
    // NEDEN: Bu satır kullanıcının yazdığı görünür metin olabilir; girintisini
    // değiştirmek çıktıya yansır.
    if (!trimmed.startsWith('<')) {
      out.push(raw);
      continue;
    }

    const { opens, closes, selfClosingOrDeclaration, startsWithClose } = scanLine(trimmed);
    const effectiveOpen = opens;
    const effectiveClose = closes;

    const indentDepth = startsWithClose
      ? Math.max(0, depth - effectiveClose)
      : depth - (effectiveClose > effectiveOpen ? effectiveClose - effectiveOpen : 0);

    const reindented = '  '.repeat(Math.max(0, indentDepth)) + trimmed;
    if (reindented !== raw) changedLines++;
    out.push(reindented);

    depth = depth + effectiveOpen - effectiveClose;
    if (depth < 0) depth = 0;
    void selfClosingOrDeclaration;

    // Korunan bölge başladı mı?
    const guard = opensProtectedRegion(trimmed);
    if (guard) {
      protectedRegion = guard;
      continue;
    }

    // Korunan eleman açıldı mı?
    const openTag = /<([A-Za-z_:][\w.:-]*)/.exec(trimmed);
    if (openTag && !trimmed.startsWith('</') && !trimmed.endsWith('/>')) {
      const nm = openTag[1];
      if (PROTECTED_TAGS.has(nm)) {
        // Aynı satırda kapanıyorsa yığını kirletme.
        const closeRe = new RegExp(`</${nm}\\s*>`);
        if (!closeRe.test(trimmed)) protectedStack.push(nm);
      }
    }
  }

  const output = out.join(newline);
  // Güvenlik ağı: yeniden birleştirme girdiyi tanınmaz hâle getirdiyse
  // biçimlendirmeyi reddet. (Satır sayısı korunur; bu kontrol yalnız bir
  // mantık hatasına karşı sigortadır.)
  if (out.length !== lines.length) {
    return {
      output: source,
      changedLines: 0,
      error: 'Biçimlendirme satır yapısını değiştirdi; güvenlik gereği uygulanmadı.',
      warnings,
    };
  }

  if (protectedRegion || protectedStack.length > 0) {
    warnings.push(
      'Dosyada kapanmamış bir korunan blok (CDATA/yorum/script) var; biçimlendirme o noktadan sonra uygulanmadı.'
    );
  }

  return { output, changedLines, warnings };
}
