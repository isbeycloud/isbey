import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UBL_TEST_SCENARIOS, buildScenarioXml, isUblTestScenario } from '../services/ublTestXmlScenarios';
import { normalizeXsltForBrowser, parseXmlish } from '../services/xsltCompatibility';
import { XsltEngineService } from '../services/xsltEngineService';
import { compileVisualDesignToXslt } from '../../src/components/modules/ayarlar/xslt-studio/visualToXslt';
import { defaultVisualDesign } from '../../src/components/modules/ayarlar/xslt-studio/visualDesign';

/**
 * XSLT STÜDYOSU — TEST XML SENARYOLARI + GÖRSEL DERLEYİCİ SÖZLEŞMESİ
 * ==========================================================================
 * 2026-09-27
 *
 * NEDEN BU TEST: Stüdyonun iki yeni parçası, şablona GİRDİ üreten kod içerir
 * (test XML ve görsel→XSLT derleyicisi). Yanlış üretilen bir girdi,
 * kullanıcının şablonunu bozuk sanmasına yol açar. Ayrıca bu kod yolları
 * gerçek e-fatura gönderimine ASLA dokunmamalıdır.
 *
 * KAPSAM DIŞI: Gerçek tarayıcı XSLTProcessor dönüşümü. Burada yapısal ve
 * güvenlik sözleşmeleri doğrulanır; tarayıcı dönüşümü Playwright işidir.
 *
 * 2026-09-27 DÜZELTME NOTU (dürüstlük kaydı): Bu süitenin ilk hâli 5 testte
 * başarısızdı. Kök nedenlerin 4'ü TESTİN kendi hatasıydı (kaynak metinde
 * yorum içindeki kelimeleri "yasak yapı" sanmak, `res.send()` çağrısını
 * "gönderim" saymak, ProfileID tekilliği beklemek). 1'i GERÇEK ürün hatasıydı:
 * TICARIFATURA senaryosu `AllowanceTotalAmount=1500.00` ilan edip iskontoyu
 * hiçbir yere uygulamıyordu (matrah ve ödenecek tutar düşülmemişti). İkisi de
 * burada düzeltildi.
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

// ESM: `__dirname` yok. Süite depo kökünden çalıştırılır.
const REPO = path.resolve(process.cwd());

const COMPANY = {
  title: 'TEST FİRMA A.Ş.',
  taxNumber: '1234567890',
  taxOffice: 'Test VD',
  address: 'Test Cad. No 1',
  city: 'İstanbul',
};

/** XML içinden tek bir `cbc:X` değerini çeker. */
function num(xml: string, tag: string): number {
  const m = xml.match(new RegExp(`<cbc:${tag}[^>]*>([^<]+)<`));
  assert.ok(m, `${tag} bulunamadı`);
  return Number(m![1]);
}

// ── 1. Senaryo kataloğu ───────────────────────────────────────────────────

test('beş UBL-TR senaryosu tanımlı ve kimlikleri benzersiz', () => {
  assert.equal(UBL_TEST_SCENARIOS.length, 5);
  const ids = UBL_TEST_SCENARIOS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, 'senaryo kimlikleri tekrar ediyor');
  for (const s of UBL_TEST_SCENARIOS) {
    assert.ok(s.label?.trim(), `${s.id}: etiket boş`);
    assert.ok(s.description?.trim(), `${s.id}: açıklama boş`);
    assert.ok(Array.isArray(s.highlights) && s.highlights.length > 0, `${s.id}: highlights boş`);
  }
});

test('istenen senaryoların hepsi var', () => {
  for (const id of ['TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA', 'IADE', 'ISTISNA']) {
    assert.ok(isUblTestScenario(id), `${id} senaryosu tanımlı değil`);
  }
});

test('bilinmeyen senaryo reddedilir (yanlış girdi sessizce kabul edilmez)', () => {
  assert.equal(isUblTestScenario('MUTABAKAT'), false);
  assert.equal(isUblTestScenario(''), false);
  assert.equal(isUblTestScenario('temelfatura'), false); // uçta .toUpperCase() yapılır
});

// ── 2. Üretilen XML iyi-biçimli ve doğru kök/senaryoda ───────────────────

for (const s of UBL_TEST_SCENARIOS) {
  test(`${s.id}: üretilen XML iyi-biçimli ve ayrıştırılabilir`, () => {
    const xml = buildScenarioXml(s.id, COMPANY);
    const parsed = parseXmlish(xml);
    assert.ok(parsed.ok, `${s.id}: ${parsed.ok === false ? parsed.error : ''}`);
    assert.match(xml, /<Invoice[\s>]/, `${s.id}: Invoice kökü yok`);
    assert.match(xml, /UBLVersionID>2\.1</, `${s.id}: UBLVersionID 2.1 değil`);
    assert.match(xml, /ProfileID>[A-Z]+</, `${s.id}: ProfileID yok`);
    assert.match(xml, /<cbc:UUID>/, `${s.id}: UUID (ETTN) yok`);
  });
}

test('senaryolar BİRBİRİNDEN farklı (kopyala-yapıştır değil)', () => {
  const xmls = UBL_TEST_SCENARIOS.map(s => buildScenarioXml(s.id, COMPANY));
  assert.equal(new Set(xmls).size, xmls.length, 'iki senaryo aynı XML üretiyor');

  // DİKKAT: ProfileID tekilliği ARANMAZ. UBL-TR'de IADE ve ISTISNA da
  // `TEMELFATURA` profil kimliği taşır (profil ≠ belge tipi); yalnız 3 farklı
  // profil değeri vardır. Senaryo ayrımı belge numarası ve ETTN ile yapılır.
  const ids = xmls.map(x => (x.match(/<cbc:ID>([^<]+)</) || [])[1]);
  assert.equal(new Set(ids).size, ids.length, 'senaryolar aynı belge numarasını taşıyor');
  const uuids = xmls.map(x => (x.match(/<cbc:UUID>([^<]+)</) || [])[1]);
  assert.equal(new Set(uuids).size, uuids.length, 'senaryolar aynı ETTN (UUID) taşıyor');
  assert.ok(uuids.every(Boolean), 'bir senaryoda UUID eksik');
});

test('IADE senaryosu negatif tutar ve IADE tip kodu taşır', () => {
  const xml = buildScenarioXml('IADE', COMPANY);
  assert.match(xml, /InvoiceTypeCode>IADE</);
  assert.match(xml, /-25000/, 'iade tutarı negatif değil');
  assert.match(xml, /-30000/, 'ödenecek tutar negatif değil');
});

test('ISTISNA senaryosu istisna kodu taşır ve KDV hesaplanmaz', () => {
  const xml = buildScenarioXml('ISTISNA', COMPANY);
  assert.match(xml, /TaxExemptionReasonCode>301</);
  assert.equal(num(xml, 'TaxAmount'), 0, 'istisna senaryosunda KDV 0 değil');
});

test('EARSIVFATURA senaryosu alıcıda TCKN taşır', () => {
  const xml = buildScenarioXml('EARSIVFATURA', COMPANY);
  assert.match(xml, /schemeID="TCKN"/);
});

test('TICARIFATURA senaryosu çok satırlı ve iskonto gerçekten uygulanmış', () => {
  const xml = buildScenarioXml('TICARIFATURA', COMPANY);
  const lines = xml.match(/<cac:InvoiceLine>/g) || [];
  assert.ok(lines.length >= 3, `beklenen >=3 satır, bulunan ${lines.length}`);

  // İskonto bloğu VAR olmalı...
  assert.match(xml, /<cac:AllowanceCharge>/, 'iskonto bloğu yok');
  assert.match(xml, /<cbc:ChargeIndicator>false<\/cbc:ChargeIndicator>/, 'iskonto ChargeIndicator=false değil');

  // ...ve TUTARLARA YANSIYOR olmalı. `AllowanceTotalAmount` tek başına bir
  // gösterge değil, gerçekten düşülen tutardır: matrah ve ödenecek tutar
  // iskonto kadar azalmış olmalıdır. (Bu test yazılmadan önce senaryo
  // 1500,00 TL iskonto ilan edip tutarları düşmüyordu — gerçek hata.)
  const allowance = num(xml, 'AllowanceTotalAmount');
  const lineExt = num(xml, 'LineExtensionAmount');
  const taxExclusive = num(xml, 'TaxExclusiveAmount');
  const taxInclusive = num(xml, 'TaxInclusiveAmount');
  const payable = num(xml, 'PayableAmount');
  const vat = num(xml, 'TaxAmount');

  assert.ok(allowance > 0, 'iskonto tutarı 0');
  assert.equal(taxExclusive, lineExt - allowance, 'matrah iskonto kadar düşülmemiş');
  assert.equal(taxInclusive, taxExclusive + vat, 'vergiler dahil toplam tutarsız');
  assert.equal(payable, taxInclusive, 'ödenecek tutar vergiler dahil toplama eşit değil');
});

// ── 3. Başka firmanın kimliği sızmaz ─────────────────────────────────────

test('firma verilmezse nötr yer tutucu kullanılır (başka firma kimliği görünmez)', () => {
  const xml = buildScenarioXml('TEMELFATURA');
  assert.match(xml, /FİRMA UNVANI/);
  assert.match(xml, /0000000000/);
  assert.doesNotMatch(xml, /BEYOĞLU/i, 'başka firma unvanı sızmış');
});

test('verilen firma bilgisi XML e yansır', () => {
  const xml = buildScenarioXml('TEMELFATURA', COMPANY);
  assert.match(xml, /TEST FİRMA A\.Ş\./);
  assert.match(xml, /1234567890/);
});

// ── 4. GÖNDERİM YOKLUĞU — en kritik kural ────────────────────────────────

test('senaryo servisi hiçbir gönderim/sağlayıcı servisini içe aktarmıyor', () => {
  const src = fs.readFileSync(path.join(REPO, 'server', 'services', 'ublTestXmlScenarios.ts'), 'utf8');
  const imports = Array.from(src.matchAll(/^\s*import\s.+?from\s+['"](.+?)['"]/gm)).map(m => m[1]);
  assert.deepEqual(imports, [], `beklenmeyen import: ${imports.join(', ')}`);
  for (const bad of ['sendDocument', 'SENDING', 'SENT', 'hizliBilisim', 'econnect', 'runTransaction', 'storage.']) {
    assert.equal(src.includes(bad), false, `senaryo servisinde gönderim izi: ${bad}`);
  }
});

test('test XML uçları yalnız XML üretir; gönderim ucu çağırmaz', () => {
  const src = fs.readFileSync(path.join(REPO, 'server', 'routes', 'document-templates.ts'), 'utf8');
  const start = src.indexOf("documentTemplatesRouter.get('/test-scenarios'");
  const end = src.indexOf("documentTemplatesRouter.post('/validate-xslt'");
  assert.ok(start > 0 && end > start, 'test XML uçları bulunamadı');
  const block = src.slice(start, end);

  // DİKKAT: Düz `send` kelimesi ARANMAZ — `res.send(xml)` bu uçların normal
  // çıktı yoludur ve yanlış pozitif üretir. Aranan şey GÖNDERİM sözlüğüdür.
  for (const bad of ['SENDING', 'SENT', 'sendDocument', 'hizliBilisim', 'econnect', 'queue', 'dispatch']) {
    assert.equal(block.includes(bad), false, `test XML uçlarında gönderim izi: ${bad}`);
  }
  // Yalnız okuma ucu (GET) olmalı; POST/PUT/DELETE ile durum değiştirmemeli.
  assert.equal(
    /documentTemplatesRouter\.(post|put|delete|patch)\(/.test(block),
    false,
    'test XML uçlarında durum değiştiren metot var'
  );
  assert.match(block, /requireAuth/, 'test XML uçları requireAuth ile korunmuyor');
});

test('test XML uçları kontör/kuyruk durumuna yazmıyor (salt okunur)', () => {
  const src = fs.readFileSync(path.join(REPO, 'server', 'routes', 'document-templates.ts'), 'utf8');
  const start = src.indexOf("documentTemplatesRouter.get('/test-xml/:scenario'");
  const end = src.indexOf("documentTemplatesRouter.post('/validate-xslt'");
  assert.ok(start > 0 && end > start);
  const block = src.slice(start, end);
  for (const bad of ['storage.save', 'setState', 'writeFileSync', 'credit', 'kontör']) {
    assert.equal(block.includes(bad), false, `test XML ucunda yazma izi: ${bad}`);
  }
});

// ── 5. Görsel derleyici çıktısı güvenlik kapısından geçer ────────────────
//
// ÖNEMLİ: Burada derleyicinin KAYNAK METNİ değil, ÜRETTİĞİ XSLT taranır.
// Kaynak metni taramak yanlış pozitif üretir: dosyanın başındaki açıklama
// bloğu "for-each-group KULLANILMAZ" gibi ifadeler içerir. Denetlenmesi
// gereken şey kullanıcıya giden ÇIKTIDIR.

const compiled = compileVisualDesignToXslt(defaultVisualDesign(), 'EFATURA');

test('görsel derleyici çıktısı iyi-biçimli XSLT üretiyor', () => {
  assert.ok(compiled.xslt.length > 1000, 'üretilen XSLT beklenenden kısa');
  const parsed = parseXmlish(compiled.xslt);
  assert.ok(parsed.ok, `üretilen XSLT ayrıştırılamadı: ${parsed.ok === false ? parsed.error : ''}`);
  assert.match(compiled.xslt, /<xsl:stylesheet version="1\.0"/, 'XSLT 1.0 bildirimi yok');
});

test('görsel derleyici çıktısı XSLT 2.0 / XXE yapısı İÇERMİYOR', () => {
  for (const bad of [
    'for-each-group',
    'tokenize(',
    'matches(',
    'replace(',
    'current-group(',
    'xsl:function',
    'disable-output-escaping',
    '<!ENTITY',
    '<!DOCTYPE',
    'xsl:include',
    'xsl:import',
    'document(',
  ]) {
    assert.equal(compiled.xslt.includes(bad), false, `üretilen XSLT'te yasaklı yapı: ${bad}`);
  }
});

test('görsel derleyici çıktısında <script> yok (XSS yüzeyi yok)', () => {
  assert.equal(/<script/i.test(compiled.xslt), false, 'üretilen XSLT içine script gömülüyor');
});

test('görsel derleyici ürün satırı döngüsünü KORUYOR (InvoiceLine)', () => {
  assert.match(
    compiled.xslt,
    /<xsl:for-each select="\/Invoice\/\*\[local-name\(\)='InvoiceLine'\]">/,
    'InvoiceLine döngüsü üretilmedi — ürün tablosu satır üretmez'
  );
  // Döngü gövdesindeki sütun yolları GÖRELİ olmalı, köke dönmemeli.
  assert.equal(
    /<xsl:value-of select="\/Invoice\/\*\[local-name\(\)='InvoiceLine'\]/.test(compiled.xslt),
    false,
    'sütun XPath köke dönmüş (döngü içinde daima boş çıkar)'
  );
});

test('görsel derleyici e-İrsaliye için DespatchLine döngüsü üretir', () => {
  const r = compileVisualDesignToXslt(defaultVisualDesign(), 'EIRSALIYE');
  assert.match(
    r.xslt,
    /<xsl:for-each select="\/DespatchAdvice\/\*\[local-name\(\)='DespatchLine'\]">/,
    'e-İrsaliye için DespatchLine döngüsü üretilmedi'
  );
});

test('görsel derleyici çıktısı mevcut normalize katmanından geçebiliyor', () => {
  // Regresyon kapısı: üretilen şablon, mevcut XSLT'lerin geçtiği
  // uyumluluk denetiminden geçebilmeli.
  const n = normalizeXsltForBrowser(compiled.xslt);
  assert.ok(n.content.length > 0, 'normalize sonrası içerik boş');
  assert.deepEqual(n.unsupportedFeatures, [], `desteklenmeyen yapı üretilmiş: ${n.unsupportedFeatures.join(', ')}`);
  assert.deepEqual(n.externalEntityViolations, [], 'dış varlık ihlali üretilmiş');
});

test('kullanıcı metni kaçışlanır (HTML enjeksiyonu mümkün değil)', () => {
  const doc = defaultVisualDesign();
  // Kullanıcının yazdığı bir metin bloğuna kaçış gerektiren karakterler koy.
  doc.sections[0].rows[0].columns[0].blocks.push({
    id: 'xss-test',
    kind: 'text',
    text: '<script>alert(1)</script> & "tırnak"',
  });
  const r = compileVisualDesignToXslt(doc, 'EFATURA');
  assert.equal(r.xslt.includes('<script>alert(1)</script>'), false, 'kullanıcı metni kaçışlanmadan gömülmüş');
  assert.match(r.xslt, /&lt;script&gt;/, 'beklenen kaçışlama yapılmamış');
  const parsed = parseXmlish(r.xslt);
  assert.ok(parsed.ok, `kaçışlama sonrası XSLT bozuldu: ${parsed.ok === false ? parsed.error : ''}`);
});

// ── 6. Mevcut güvenlik/normalize katmanı KORUNUYOR ──────────────────────

test('normalize katmanı mevcut general.xslt üzerinde hâlâ çalışıyor (regresyon kontrolü)', () => {
  const p = path.join(REPO, '.verify-tmp', 'general.xslt');
  if (!fs.existsSync(p)) {
    console.log('      (atlandı: .verify-tmp/general.xslt bulunamadı)');
    return;
  }
  const raw = fs.readFileSync(p, 'utf8');
  const n = normalizeXsltForBrowser(raw);
  assert.ok(n.adjustments.length > 0, 'general.xslt için normalize ayarı üretilmedi — katman bozulmuş olabilir');
  assert.ok(n.content.length > 1000, 'normalize edilmiş içerik beklenenden kısa');
});

test('XXE kalıpları hâlâ reddediliyor (güvenlik kapısı açık)', () => {
  const evil =
    `<!DOCTYPE x [<!ENTITY f SYSTEM "file:///etc/passwd">]>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/"><html><body/></html></xsl:template>
</xsl:stylesheet>`;
  const r = XsltEngineService.validateXslt(evil);
  assert.equal(r.valid, false);
  assert.match(r.error || '', /Güvenlik/);
});

test('görsel derleyici çıktısı XXE denetiminden geçiyor', () => {
  const r = XsltEngineService.validateXslt(compiled.xslt);
  assert.equal(r.valid, true, `üretilen XSLT güvenlik denetimini geçemedi: ${r.error}`);
});

console.log(`\nXSLT stüdyo sözleşmesi: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
