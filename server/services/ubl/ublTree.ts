/**
 * UBL-TR XML ÇÖZÜMLEYİCİ (ağaç kurucu)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 — Gelen e-Fatura / e-İrsaliye içeri aktarma için yazıldı.
 *
 * NEDEN ELLE YAZILDI: Sunucuda XML ayrıştırıcı bağımlılığı YOKTUR ve
 * eklenmemelidir (host'ta native modül derlenemez — bkz. `xsltCompatibility.ts`
 * içindeki aynı gerekçe). `parseXmlish` yalnız "belge iyi-biçimli mi" sorusunu
 * yanıtlar; alan ÇIKARMAZ. Gelen bir faturadan VKN, kalem, miktar ve KDV oranı
 * okunabilmesi için gerçek bir ağaç gerekiyordu.
 *
 * `parseXmlish` İYİ-BİÇİMLİLİK KAPISI olarak kullanılır: bozuk XML buraya
 * girmeden reddedilir, böylece iki tarayıcı aynı dili konuşur.
 *
 * DESTEKLENENLER: namespace öneki (`cbc:`/`cac:`/öneksiz), CDATA, yorum,
 * işlem yönergesi, DOCTYPE, self-closing etiket, XML entity (`&amp;` vb.),
 * nitelikler, iç içe yapı.
 *
 * KURAL: Bu modül XML'i YORUMLAMAZ, yalnız ağaca çevirir. UBL anlamı
 * `ublParser.ts` içindedir; böylece ayrıştırma ile iş kuralı karışmaz.
 */
import { localName, parseXmlish } from '../xsltCompatibility';

export interface XmlNode {
  /** Öneksiz etiket adı (`cbc:ID` → `ID`). */
  name: string;
  /** Ham etiket adı (hata ayıklama için). */
  rawName: string;
  /** Nitelikler, ad → değer (adlar olduğu gibi, önekli). */
  attrs: Record<string, string>;
  /** Doğrudan metin çocuklarının birleşimi (kırpılmış). */
  text: string;
  children: XmlNode[];
}

export interface UblParseResult {
  ok: boolean;
  error?: string;
  root?: XmlNode;
  /** 1 tabanlı satır (hata varsa). */
  line?: number;
  /** 1 tabanlı kolon (hata varsa). */
  column?: number;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

/**
 * Gelen belge boyutu üst sınırı (bayt).
 *
 * ⚠️ 2026-09-29 — NEDEN GEREKLİ: Bu yol entegratörden gelen ve son kullanıcının
 * DENETLEYEMEDİĞİ bir veriyi işler. Üst sınır olmadan çok büyük bir belge
 * belleği tüketip sunucuyu düşürebilir. Gerçek bir e-Fatura pratikte birkaç
 * yüz KB'dir; 25 MB cömert bir tavandır. Aşan belge kırpılmaz, REDDEDİLİR —
 * kırpılmış bir UBL sessizce eksik kalem üretirdi.
 */
export const MAX_UBL_BYTES = 25 * 1024 * 1024;

/** XML entity'lerini çözer. Bilinmeyen entity olduğu gibi bırakılır. */
export function decodeXmlText(raw: string): string {
  if (!raw.includes('&')) return raw;
  return raw.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : whole;
  });
}

/** Nitelik dizesini ayrıştırır (`a="1" b='2'`). Tırnak zorunludur. */
function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    attrs[m[1]] = decodeXmlText(m[3] !== undefined ? m[3] : m[4] ?? '');
  }
  return attrs;
}

/**
 * Bir nitelik değerini öneksiz adıyla arar.
 * `schemeID` gibi niteliklerde önek yoktur; yine de esneklik için yazıldı.
 */
export function attrOf(node: XmlNode, name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(node.attrs, name)) return node.attrs[name];
  for (const key of Object.keys(node.attrs)) {
    if (localName(key) === name) return node.attrs[key];
  }
  return undefined;
}

/** Doğrudan çocuklar arasından adı eşleşenleri döndürür. */
export function childrenOf(node: XmlNode | undefined, name: string): XmlNode[] {
  if (!node) return [];
  const want = localName(name);
  return node.children.filter(c => c.name === want);
}

/** Doğrudan çocuklar arasından İLK eşleşeni döndürür. */
export function childOf(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return childrenOf(node, name)[0];
}

/**
 * Adı eşleşen ilk çocuğun metnini döndürür.
 * NEDEN doğrudan çocuk: UBL'de aynı etiket hem üst hem kalem düzeyinde geçer
 * (`TaxTotal`/`TaxAmount` gibi). Derinlik sınırlamak, yanlış seviyeden değer
 * okumayı (ör. kalem KDV'si yerine belge KDV'si) engeller.
 */
export function textOf(node: XmlNode | undefined, name: string): string | undefined {
  const child = childOf(node, name);
  if (!child) return undefined;
  return child.text;
}

/** Sayı okur; geçersizse `undefined` döner (0'a düşürmek sessiz yanlış üretir). */
export function numOf(node: XmlNode | undefined, name: string): number | undefined {
  const raw = textOf(node, name);
  if (raw === undefined || raw === '') return undefined;
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Belgeyi ağaca çevirir.
 *
 * Akış: önce `parseXmlish` ile iyi-biçimlilik denetimi (konum bilgisi ondan
 * gelir), sonra yığın tabanlı ağaç kurulumu. Bozuk belge ASLA yarım ağaç
 * üretmez; `ok:false` döner.
 */
export function parseUblTree(input: string): UblParseResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, error: 'Belge içeriği boş.' };
  }
  // Savunma kapısı: aşırı büyük belge işlenmeden reddedilir (bkz. MAX_UBL_BYTES).
  if (input.length > MAX_UBL_BYTES) {
    return {
      ok: false,
      error: `Belge çok büyük (${Math.round(input.length / 1024 / 1024)} MB); en fazla ${MAX_UBL_BYTES / 1024 / 1024} MB işlenebilir.`,
    };
  }

  // Kapı: bozuk XML buradan geçemez. Hata konumu doğrudan taşınır.
  const gate = parseXmlish(input);
  if (!gate.ok) {
    return { ok: false, error: gate.error || 'XML iyi-biçimli değil.', line: gate.line, column: gate.column };
  }

  const root: XmlNode = { name: '', rawName: '', attrs: {}, text: '', children: [] };
  const stack: XmlNode[] = [];
  const n = input.length;
  let i = 0;

  /** Konum → 1 tabanlı satır/kolon. */
  const positionAt = (offset: number) => {
    const upto = input.slice(0, Math.max(0, Math.min(offset, n)));
    let line = 1;
    let lastBreak = -1;
    for (let k = 0; k < upto.length; k++) {
      if (upto[k] === '\n') { line++; lastBreak = k; }
    }
    return { line, column: offset - lastBreak };
  };
  const fail = (offset: number, message: string): UblParseResult => {
    const p = positionAt(offset);
    return { ok: false, error: message, line: p.line, column: p.column };
  };

  while (i < n) {
    const lt = input.indexOf('<', i);
    if (lt === -1) break;

    // Etiketten önceki metin → o anki düğümün metni
    if (lt > i && stack.length > 0) {
      const between = input.slice(i, lt);
      // Yalnız boşluk değilse metin katkısı sayılır.
      if (between.trim() !== '') {
        stack[stack.length - 1].text += between;
      }
    }

    // Yorum
    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      if (end === -1) return fail(lt, 'Kapatılmamış yorum bloğu.');
      i = end + 3;
      continue;
    }
    // CDATA → metin olarak eklenir (kaçış çözülmez, ham içerik korunur)
    if (input.startsWith('<![CDATA[', lt)) {
      const end = input.indexOf(']]>', lt + 9);
      if (end === -1) return fail(lt, 'Kapatılmamış CDATA bloğu.');
      if (stack.length > 0) stack[stack.length - 1].text += input.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    // İşlem yönergesi / DOCTYPE
    if (input.startsWith('<?', lt)) {
      const end = input.indexOf('?>', lt + 2);
      if (end === -1) return fail(lt, 'Kapatılmamış işlem yönergesi.');
      i = end + 2;
      continue;
    }
    if (input.startsWith('<!', lt)) {
      // DOCTYPE iç içe köşeli parantez barındırabilir (`[ ... ]`).
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const ch = input[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
      }
      if (j >= n) return fail(lt, 'Kapatılmamış DOCTYPE bildirimi.');
      i = j + 1;
      continue;
    }

    // Kapanış etiketi
    if (input.startsWith('</', lt)) {
      const gt = input.indexOf('>', lt);
      if (gt === -1) return fail(lt, 'Kapatılmamış bitiş etiketi.');
      const rawName = input.slice(lt + 2, gt).trim();
      const open = stack.pop();
      if (!open) return fail(lt, `Beklenmeyen bitiş etiketi: </${rawName}>`);
      if (open.rawName !== rawName && open.name !== localName(rawName)) {
        return fail(lt, `Etiket uyuşmuyor: <${open.rawName}> beklenirken </${rawName}> geldi.`);
      }
      i = gt + 1;
      continue;
    }

    // Açılış / self-closing etiket — tırnak içindeki '>' atlanır.
    let quote: string | null = null;
    let gt = -1;
    for (let j = lt + 1; j < n; j++) {
      const ch = input[j];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '>') { gt = j; break; }
    }
    if (gt === -1) return fail(lt, 'Kapatılmamış açılış etiketi.');

    const inner = input.slice(lt + 1, gt);
    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const spaceIdx = body.search(/[\s/]/);
    const rawName = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
    if (!rawName) return fail(lt, 'Etiket adı boş.');

    const node: XmlNode = {
      name: localName(rawName),
      rawName,
      attrs: spaceIdx === -1 ? {} : parseAttrs(body.slice(spaceIdx)),
      text: '',
      children: [],
    };

    if (stack.length === 0) {
      // Kök eleman: yalnız bir tane olabilir.
      if (root.name !== '') return fail(lt, `Birden fazla kök eleman: <${root.rawName}> ve <${rawName}>.`);
      Object.assign(root, node);
      if (!selfClosing) stack.push(root);
    } else {
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
    }
    i = gt + 1;
  }

  if (root.name === '') return { ok: false, error: 'Belgede kök eleman bulunamadı.' };
  // `parseXmlish` yığını zaten doğruladı; bu yalnız savunma amaçlıdır.
  if (stack.length > 0) return { ok: false, error: `Kapatılmamış etiket: <${stack[stack.length - 1].rawName}>` };

  // Metinleri son bir kez kırp (boşluk/girinti anlam taşımaz).
  const trimAll = (node: XmlNode): void => {
    node.text = node.text.trim();
    for (const c of node.children) trimAll(c);
  };
  trimAll(root);

  return { ok: true, root };
}

/**
 * Ağaçta (herhangi bir derinlikte) adı eşleşen ilk düğümü bulur.
 * UBL'de kalemler kökün doğrudan çocuğudur; yine de sarmalayıcı yapıya
 * toleranslı olmak için derin arama yapılır.
 */
export function findFirst(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined;
  const want = localName(name);
  if (node.name === want) return node;
  for (const c of node.children) {
    const hit = findFirst(c, want);
    if (hit) return hit;
  }
  return undefined;
}

/** Ağaçta adı eşleşen TÜM düğümleri (derinlik öncelikli) toplar. */
export function findAll(node: XmlNode | undefined, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const want = localName(name);
  const walk = (n: XmlNode) => {
    if (n.name === want) out.push(n);
    for (const c of n.children) walk(c);
  };
  if (node) walk(node);
  return out;
}

/** Sayı → UBL metni (2 hane). Fatura tutarları için ortak biçim. */
export function formatAmount(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
