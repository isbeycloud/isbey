/**
 * Görsel Tasarım → XSLT Derleyicisi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: XSLT Stüdyosu'nun görsel modu bu derleyiciyi kullanır.
 *
 * SINIRLAR (bilerek):
 *   • Üretilen XSLT **XSLT 1.0**'dır ve tarayıcı `XSLTProcessor`'ında çalışır.
 *   • `xsl:for-each-group`, `tokenize()`, `matches()`, `replace()` gibi XSLT 2.0
 *     yapıları KULLANILMAZ — sunucu doğrulayıcısı bunları reddeder.
 *   • `document()`, `xsl:include`, `xsl:import`, DTD/ENTITY KULLANILMAZ — XXE
 *     koruması bunları reddeder, ayrıca ağ erişimi zaten istenmez.
 *   • `disable-output-escaping` KULLANILMAZ.
 *
 * QR: Görsel modda üretilen XSLT, mevcut `general.xslt` içindeki ~21 KB QR
 * kütüphanesini tekrar ETMEZ (onu kopyalamak dosyayı şişirir ve iki farklı
 * kopyanın ayrışması riskini doğurur). Bunun yerine, görsel tasarımın QR
 * bloğu önizlemede `qrPayload` değişkeninden üretilen bir metni gösterir;
 * GERÇEK QR görüntüsü kararlı biçimde mevcut `general.xslt` ile üretilir.
 * Bu sınır kullanıcıya arayüzde açıkça bildirilir (bkz. GörselTasarimModu).
 *
 * XSS/kaçış: Kullanıcı metinleri HTML'e gömülmeden önce kaçışlanır. Üretilen
 * HTML'de `<script>` yoktur; bu yüzden `disable-output-escaping` gerekmez.
 */

import type {
  BlockStyle,
  ProductTableColumn,
  VisualBlock,
  VisualDesignDoc,
} from './visualDesign';
import { PRODUCT_COLUMN_DEFS, UBL_BINDINGS, findBinding } from './visualDesign';

export interface CompileResult {
  xslt: string;
  /** Üretilen XSLT'te kullanılan bağlayıcılar (kullanıcıya gösterilir). */
  usedBindings: string[];
  /** Derleme sırasında oluşan, kullanıcının bilmesi gereken durumlar. */
  warnings: string[];
  /** Kullanıcının boş bıraktığı ama anlamlı olan yerler. */
  problems: string[];
}

/** XML/HTML metin kaçışlaması — XSS ve bozuk çıktıyı önler. */
function esc(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CSS renk değerini güvenli aralığa indirger (stil enjeksiyonunu önler). */
function safeColor(v: string | undefined, fallback: string): string {
  if (!v) return fallback;
  // Yalnız hex (#rgb/#rrggbb) ve basit rgb()/isim kabul edilir.
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(v)) return v;
  if (/^[a-zA-Z]{3,20}$/.test(v)) return v;
  return fallback;
}

function safeNumber(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

/** Blok stilini CSS metnine çevirir. */
function styleToCss(s: BlockStyle | undefined, base: VisualDesignDoc['base']): string {
  if (!s) return '';
  const parts: string[] = [];
  if (s.fontSize !== undefined) parts.push(`font-size:${safeNumber(s.fontSize, base.fontSize, 6, 40)}px`);
  if (s.fontWeight) parts.push(`font-weight:${s.fontWeight}`);
  if (s.fontStyle) parts.push(`font-style:${s.fontStyle}`);
  if (s.textAlign) parts.push(`text-align:${s.textAlign}`);
  if (s.color) parts.push(`color:${safeColor(s.color, base.color)}`);
  if (s.marginTop !== undefined) parts.push(`margin-top:${safeNumber(s.marginTop, 0, 0, 120)}px`);
  if (s.marginBottom !== undefined) parts.push(`margin-bottom:${safeNumber(s.marginBottom, 0, 0, 120)}px`);
  if (s.padding !== undefined) parts.push(`padding:${safeNumber(s.padding, 0, 0, 60)}px`);
  if (s.background) parts.push(`background-color:${safeColor(s.background, '#ffffff')}`);
  if (s.borderTop) parts.push('border-top:1px solid #cbd5e1');
  if (s.borderBottom) parts.push('border-bottom:1px solid #cbd5e1');
  return parts.join(';');
}

/**
 * Bir UBL bağlayıcısı için XPath ifadesi üretir.
 *
 * NEDEN `*[local-name()='X']`: Belgenin ad alanı önekleri kaynağa göre
 * değişir (`n1:`, `cac:`, `cbc:` ya da öneksiz). `local-name()` kullanmak
 * önekten bağımsız çalışır ve mevcut şablonların da yaptığı şeydir.
 */
function pathToXPath(path: string): string {
  const parts = path.split('/');
  return parts
    .map(seg => {
      if (seg.startsWith('@')) {
        return `@*[local-name()='${seg.slice(1)}']`;
      }
      return `*[local-name()='${seg}']`;
    })
    .join('/');
}

/** Belge köküne göre tam XPath. */
function absoluteXPath(path: string, root: string): string {
  // Kök (Invoice / DespatchAdvice) zaten belge elemanıdır; göreli yolu
  // doğrudan kökten başlatıyoruz.
  return `/${root}/${pathToXPath(path)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blok derleyicileri
// ─────────────────────────────────────────────────────────────────────────────

interface Ctx {
  root: string;
  base: VisualDesignDoc['base'];
  usedBindings: Set<string>;
  warnings: string[];
  problems: string[];
  qrReady: boolean;
}

function compileField(block: VisualBlock, ctx: Ctx): string {
  const binding = findBinding(block.bind);
  const css = styleToCss(block.style, ctx.base);
  if (!binding) {
    ctx.problems.push(`Bir alan bloğunda bağlayıcı seçilmemiş (${block.label || block.id}). Boş görünecek.`);
    return `      <div style="${css}"></div>\n`;
  }
  ctx.usedBindings.add(binding.key);
  return `      <div style="${css}"><xsl:value-of select="${absoluteXPath(binding.path, ctx.root)}"/></div>\n`;
}

function compileText(block: VisualBlock, ctx: Ctx): string {
  const css = styleToCss(block.style, ctx.base);
  const binding = findBinding(block.bind);
  const text = esc(block.text || '');

  if (binding) {
    ctx.usedBindings.add(binding.key);
    const value = `<xsl:value-of select="${absoluteXPath(binding.path, ctx.root)}"/>`;
    const inner = block.textBefore ? `${text} ${value}` : `${value} ${text}`;
    return `      <div style="${css}">${inner}</div>\n`;
  }
  return `      <div style="${css}">${text}</div>\n`;
}

function compileDivider(block: VisualBlock, _ctx: Ctx): string {
  const mt = safeNumber(block.style?.marginTop, 6, 0, 120);
  const mb = safeNumber(block.style?.marginBottom, 6, 0, 120);
  return `      <hr style="border:none;border-top:1px solid #cbd5e1;margin:${mt}px 0 ${mb}px;" />\n`;
}

function compileSpacer(block: VisualBlock, _ctx: Ctx): string {
  const h = safeNumber(block.style?.marginTop, 8, 0, 200);
  return `      <div style="height:${h}px"></div>\n`;
}

function compileImage(block: VisualBlock, ctx: Ctx): string {
  const src = block.src === 'signature' ? 'signature' : 'logo';
  // GÖRSEL KAYNAĞI: Logo/imza kullanıcı tarafından yüklenir ve sunucuda
  // saklanır. XSLT'ye gömülü URL yerine bir yer tutucu kutu koyuyoruz; gerçek
  // görsel `general.xslt` düzeninde olduğu gibi şablon değişkeninden gelir.
  // Böylece üretilen XSLT veri URL'si taşımaz ve dosya şişmez.
  const label = src === 'signature' ? 'İmza / Kaşe' : 'Firma Logosu';
  ctx.warnings.push(
    `${label} bloğu yer tutucu olarak üretildi. Gerçek görsel, şablona yüklenen logo/imza ile gösterilir.`
  );
  const w = safeNumber(block.style?.widthPercent, 100, 5, 100);
  return `      <div style="width:${w}%;height:56px;border:1px dashed #cbd5e1;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;">${esc(label)}</div>\n`;
}

/** Ürün tablosu — DÖNGÜ KORUNUR: satırlar `cac:InvoiceLine` üzerinden üretilir. */
function compileInvoiceTable(columns: ProductTableColumn[], ctx: Ctx): string {
  const active = columns.filter(c => c.enabled);
  if (active.length === 0) {
    ctx.problems.push('Ürün tablosunda hiç sütun seçili değil. Tablo boş görünecek.');
    return `      <div style="color:#94a3b8;font-size:10px;padding:8px;">Ürün tablosu: sütun seçilmedi.</div>\n`;
  }

  // İki belge tipi desteklenir: Invoice (InvoiceLine) ve DespatchAdvice (DespatchLine).
  // Seçim tek bir XPath ile yapılır — döngü burada, sütunlar ayrı.
  const isDespatch = ctx.root === 'DespatchAdvice';
  const lineNode = isDespatch ? 'DespatchLine' : 'InvoiceLine';
  // Miktar/birim sütunları `PRODUCT_COLUMN_DEFS` içinde `InvoicedQuantity |
  // DeliveredQuantity` alternatifiyle çözülür — burada ayrıca seçim gerekmez.

  let head = '';
  for (const col of active) {
    const w = safeNumber(col.widthPercent, 10, 4, 60);
    head += `          <th style="width:${w}%;text-align:${col.align};padding:5px 4px;border-bottom:1px solid #cbd5e1;font-size:9.5px;">${esc(col.label)}</th>\n`;
  }

  let body = '';
  for (const col of active) {
    const def = PRODUCT_COLUMN_DEFS.find(d => d.key === col.key);
    if (!def) continue;
    // DİKKAT: Bu yollar `xsl:for-each` GÖVDESİNDE kullanılır ve bu yüzden
    // MUTLAK DEĞİL, cari `cac:InvoiceLine` düğümüne GÖRELİDİR. Başına `/${root}/`
    // eklemek XPath'i belge köküne döndürür ve iç içe düğümler bulunamaz —
    // tablo boş çıkardı. (Bu hata bir kez yapıldı; tekrarlamayın.)
    const xpath = def.xpath
      .split('|')
      .map(p => {
        const t = p.trim();
        const [nodePath, attr] = t.split('/@');
        const segs = nodePath.split('/').map(s => `*[local-name()='${s}']`).join('/');
        return attr ? `${segs}/@*[local-name()='${attr}']` : segs;
      })
      .join(' | ');
    const isBold = col.key === 'lineTotal';
    body += `              <td style="text-align:${col.align};padding:4px;${isBold ? 'font-weight:bold;' : ''}"><xsl:value-of select="${xpath}"/></td>\n`;
  }

  // Döngü: yalnız SATIR üreten kısım (`cac:InvoiceLine` / `cac:DespatchLine`).
  // Sütunlar bu bloğun İÇİNDE üretilir, yani sütun eklemek/çıkarmak döngüyü
  // bozmaz — istenen davranış budur.
  return `      <table style="width:100%;border-collapse:collapse;font-size:9.5px;">
        <thead>
          <tr style="background-color:${safeColor(ctx.base.primaryColor, '#0284c7')}14;">
${head.trimEnd()}
          </tr>
        </thead>
        <tbody>
          <xsl:for-each select="/${ctx.root}/*[local-name()='${lineNode}']">
            <tr>
${body.trimEnd()}
            </tr>
          </xsl:for-each>
        </tbody>
      </table>
`;
}

/** Toplamlar tablosu — UBL LegalMonetaryTotal alanlarından. */
function compileTotalsTable(ctx: Ctx): string {
  const rows: Array<{ label: string; key: string; path: string; strong?: boolean }> = [
    { label: 'Mal Hizmet Toplam Tutarı', key: 'total.lineExtension', path: 'LegalMonetaryTotal/LineExtensionAmount' },
    { label: 'Toplam İskonto', key: 'total.allowance', path: 'LegalMonetaryTotal/AllowanceTotalAmount' },
    { label: 'Hesaplanan KDV', key: 'total.vat', path: 'TaxTotal/TaxAmount' },
    { label: 'Vergiler Dahil Toplam Tutar', key: 'total.taxInclusive', path: 'LegalMonetaryTotal/TaxInclusiveAmount' },
    { label: 'Ödenecek Tutar', key: 'total.payable', path: 'LegalMonetaryTotal/PayableAmount', strong: true },
  ];

  let body = '';
  for (const r of rows) {
    ctx.usedBindings.add(r.key);
    body += `        <tr>
          <td style="padding:3px 6px;font-size:9.5px;${r.strong ? 'font-weight:bold;' : ''}">${esc(r.label)}</td>
          <td style="padding:3px 6px;text-align:right;font-size:9.5px;${r.strong ? 'font-weight:bold;' : ''}">
            <xsl:value-of select="/${ctx.root}/${pathToXPath(r.path)}"/>
          </td>
        </tr>\n`;
  }

  return `      <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;">
${body.trimEnd()}
      </table>
`;
}

/** IBAN / banka hesap tablosu. */
function compileBankTable(ctx: Ctx): string {
  // Banka hesapları UBL belgesinde DEĞİL, şablon yapılandırmasındadır
  // (bkz. DocumentDesignConfig.bankAccounts). Bu yüzden önizlemede
  // şablondan gelen değerler gösterilir; üretilen XSLT'te sabit bir yer
  // tutucu bırakılır ve kullanıcıya neden olduğu bildirilir.
  ctx.warnings.push(
    'Banka hesap tablosu şablon yapılandırmasından beslenir (UBL belgesinde yer almaz). Üretilen XSLT bu bölüm için yer tutucu içerir.'
  );
  return `      <div style="border:1px solid #cbd5e1;border-radius:4px;padding:6px 8px;">
        <div style="font-weight:bold;font-size:9.5px;margin-bottom:4px;">Banka Hesaplarımız</div>
        <div style="font-size:9px;color:#94a3b8;">IBAN bilgileri şablon ayarlarından gelir.</div>
      </div>
`;
}

/** QR bloğu — gerçek QR mevcut general.xslt ile üretilir; burada bildirilir. */
function compileQr(ctx: Ctx): string {
  ctx.warnings.push(
    'QR bloğu: üretilen XSLT gerçek QR kütüphanesini içermez. Gerçek QR görüntüsü, sistem şablonu (general.xslt) kullanıldığında üretilir. Görsel tasarımda QR alanı ayrılır.'
  );
  return `      <div style="width:78px;height:78px;border:1px dashed #cbd5e1;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:8px;text-align:center;">QR<br/>(sistem şablonunda)</div>
`;
}

function compileBarcode(ctx: Ctx): string {
  ctx.warnings.push('Barkod bloğu yer tutucu olarak üretildi; gerçek barkod sistem şablonundan gelir.');
  return `      <div style="height:36px;border:1px dashed #cbd5e1;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:8px;">BARKOD</div>
`;
}

function compileSignature(ctx: Ctx): string {
  ctx.warnings.push('İmza/Kaşe bloğu yer tutucu olarak üretildi; gerçek görsel şablon ayarlarından gelir.');
  return `      <div style="text-align:center;">
        <div style="width:120px;height:50px;border:1px dashed #cbd5e1;border-radius:4px;margin:0 auto;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:8px;">İMZA / KAŞE</div>
        <div style="font-size:9px;color:#64748b;margin-top:3px;">Kaşe / İmza</div>
      </div>
`;
}

function compileConditionalNote(block: VisualBlock, ctx: Ctx): string {
  const binding = findBinding(block.bind);
  const css = styleToCss(block.style, ctx.base);
  if (!binding) {
    ctx.problems.push(`Koşullu not bloğunda bağlayıcı yok (${block.label || block.id}). Gösterilmeyecek.`);
    return '';
  }
  ctx.usedBindings.add(binding.key);
  const path = absoluteXPath(binding.path, ctx.root);
  return `      <xsl:if test="string-length(normalize-space(${path})) &gt; 0">
        <div style="${css}"><xsl:value-of select="${path}"/></div>
      </xsl:if>
`;
}

function compileBlock(block: VisualBlock, doc: VisualDesignDoc, ctx: Ctx): string {
  switch (block.kind) {
    case 'field': return compileField(block, ctx);
    case 'text': return compileText(block, ctx);
    case 'divider': return compileDivider(block, ctx);
    case 'spacer': return compileSpacer(block, ctx);
    case 'image': return compileImage(block, ctx);
    case 'invoice-table': return compileInvoiceTable(doc.productColumns, ctx);
    case 'totals-table': return compileTotalsTable(ctx);
    case 'bank-table': return compileBankTable(ctx);
    case 'qr': return compileQr(ctx);
    case 'barcode': return compileBarcode(ctx);
    case 'signature': return compileSignature(ctx);
    case 'conditional-note': return compileConditionalNote(block, ctx);
    default: return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ana derleyici
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Görsel tasarımı çalışan XSLT 1.0'a çevirir.
 *
 * @param doc        Görsel tasarım modeli.
 * @param documentType Belge tipi — kök eleman adını belirler (`Invoice` / `DespatchAdvice`).
 */
export function compileVisualDesignToXslt(
  doc: VisualDesignDoc,
  documentType: 'EFATURA' | 'EARSIV' | 'EIRSALIYE' | 'ESMM' | string = 'EFATURA'
): CompileResult {
  const root = documentType === 'EIRSALIYE' ? 'DespatchAdvice' : 'Invoice';
  const base = doc.base;

  const ctx: Ctx = {
    root,
    base,
    usedBindings: new Set<string>(),
    warnings: [],
    problems: [],
    qrReady: false,
  };

  let body = '';
  for (const section of doc.sections) {
    const secStyle = section.style || {};
    const pad = safeNumber(secStyle.padding, 0, 0, 60);
    const bg = secStyle.background ? `background-color:${safeColor(secStyle.background, '#ffffff')};` : '';
    const styleAttr = pad || bg ? ` style="padding:${pad}px;${bg}"` : '';
    body += `    <div class="section"${styleAttr}>\n`;
    if (section.title) {
      body += `      <!-- Bölüm: ${esc(section.title)} -->\n`;
    }

    for (const row of section.rows) {
      const rStyle = row.style || {};
      const gap = safeNumber(rStyle.gap, 0, 0, 60);
      const rPad = safeNumber(rStyle.padding, 0, 0, 60);
      const rBg = rStyle.background ? `background-color:${safeColor(rStyle.background, '#ffffff')};` : '';
      const borders =
        (rStyle.borderTop ? 'border-top:1px solid #cbd5e1;' : '') +
        (rStyle.borderBottom ? 'border-bottom:1px solid #cbd5e1;' : '');
      const rowStyle = `display:flex;align-items:flex-start;${gap ? `gap:${gap}px;` : ''}${rPad ? `padding:${rPad}px;` : ''}${rBg}${borders}`;
      body += `      <div style="${rowStyle}">\n`;

      for (const col of row.columns) {
        const w = safeNumber(col.widthPercent, 100, 5, 100);
        body += `        <div style="width:${w}%;box-sizing:border-box;">\n`;
        for (const block of col.blocks) {
          body += compileBlock(block, doc, ctx);
        }
        body += `        </div>\n`;
      }

      body += `      </div>\n`;
    }

    body += `    </div>\n`;
    if (section.pageBreakAfter) {
      body += `    <div style="page-break-after:always;"></div>\n`;
    }
  }

  if (doc.sections.length === 0) {
    ctx.problems.push('Görsel tasarımda hiç bölüm yok. Üretilen XSLT boş bir belge üretir.');
  }

  const xslt = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  İŞBEY XSLT Stüdyosu — Görsel Tasarım çıktısı
  Bu dosya otomatik üretildi. Görsel düzenleyicide yapılan değişiklikler
  yeniden derlendiğinde bu içerik baştan yazılır.
  Hedef: tarayıcı XSLTProcessor (XSLT 1.0)
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  exclude-result-prefixes="xsl">
  <xsl:output method="html" encoding="UTF-8" indent="no" omit-xml-declaration="yes"/>

  <xsl:template match="/">
    <div style="font-family:${esc(base.fontFamily)};font-size:${safeNumber(base.fontSize, 11, 6, 40)}px;color:${safeColor(base.color, '#111827')};padding:${safeNumber(base.pagePadding, 24, 0, 80)}px;box-sizing:border-box;">
${body}    </div>
  </xsl:template>
</xsl:stylesheet>
`;

  // Yinelenen uyarıları tekilleştir (blok başına bir kez ekleniyor).
  const uniqueWarnings = Array.from(new Set(ctx.warnings));

  return {
    xslt,
    usedBindings: Array.from(ctx.usedBindings),
    warnings: uniqueWarnings,
    problems: ctx.problems,
  };
}

/**
 * Görsel tasarımın kapsadığı alanları raporlar — kullanıcı "neyi düzenledim,
 * neyi düzenlemedim" sorusunun cevabını görsün diye.
 */
export function describeCoverage(doc: VisualDesignDoc): { covered: string[]; notCovered: string[] } {
  const bound = new Set<string>();
  for (const s of doc.sections) {
    for (const r of s.rows) {
      for (const c of r.columns) {
        for (const b of c.blocks) {
          if (b.bind) bound.add(b.bind);
        }
      }
    }
  }

  const covered: string[] = [];
  const notCovered: string[] = [];
  for (const b of UBL_BINDINGS) {
    (bound.has(b.key) ? covered : notCovered).push(b.label);
  }
  return { covered, notCovered };
}

export function unusedColumnWarning(columns: ProductTableColumn[]): string | null {
  const active = columns.filter(c => c.enabled);
  if (active.length === 0) return 'Ürün tablosunda hiç sütun seçili değil.';
  const total = active.reduce((a, c) => a + (Number(c.widthPercent) || 0), 0);
  if (total < 95 || total > 105) {
    return `Sütun genişlikleri toplamı %${Math.round(total)}. Tablo A4 genişliğine tam oturmaz, sütunlar taşabilir.`;
  }
  return null;
}
