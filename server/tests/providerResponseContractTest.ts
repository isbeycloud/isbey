/**
 * SAĞLAYICI GELEN-BELGE EŞLEME SÖZLEŞMESİ — regresyon testi
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-30 eklendi. NEDEN VAR:
 *
 * Canlıda `Entegratörden Çek` çağrıldığında 16 belge geldi ama arayüz
 * "1 yeni, 15 mükerrer" dedi ve havuzda TEK, ÜSTELİK İÇERİĞİ OKUNAMAYAN bir
 * kayıt oluştu. Kök neden ÖLÇÜLDÜ (salt okunur, canlı `econnect`):
 *
 *   1) `GetDocumentReceiverAllList` gövdesi **PascalCase** döner
 *      (`UUID`, `DocumentId`, `TargetIdentifier`, `TargetTitle`, `IssueDate`,
 *      `TaxTotal`, `PayableAmount`, `DocumentCurrencyCode`, `AppType`, `IsRead`).
 *      Eşleme yalnız camelCase okuduğu için `uuid` DAİMA `undefined` geliyordu.
 *      Mükerrer kontrolü `uuid` üzerinden yapıldığından ilk belge kaydediliyor,
 *      kalan TÜM belgeler "mükerrer" sayılıp atlanıyordu — yani hata sessizdi,
 *      operatör "zaten hepsi var" sanıyordu.
 *
 *   2) `GetDocumentFile` gövdesi `{ "DocumentFile": "<base64>" }` sarmalayıcısıyla
 *      döner. Eski kod `data.content`/`data.Content` okuyordu; ikisi de yoktu,
 *      sonuç olarak belge İÇERİĞİ hiçbir koşulda alınamıyordu (`UNREADABLE`).
 *
 * Bu dosya o iki sözleşmeyi CANLI YANITIN GERÇEK ŞEKLİYLE sabitler. Sağlayıcı
 * yarın camelCase'e dönerse testler yine geçer (her iki yazım desteklenir), ama
 * bugünkü gerçek şekil sessizce bozulamaz.
 *
 * ⚠️ Bu test AĞA ÇIKMAZ: ağ çağrısı yapılmaz, token kullanılmaz, dosya yazılmaz.
 */

import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const configuredPath = process.env.DATABASE_PATH || '';
if (
  process.env.NODE_ENV !== 'test' ||
  path.basename(configuredPath) !== 'providerResponseContractTest.ts.json'
) {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/providerResponseContractTest.ts.json ile çalıştırılabilir.'
  );
}

let gecti = 0;
const gecenler: string[] = [];
function test(ad: string, fn: () => void): void {
  try {
    fn();
    gecti++;
    gecenler.push(ad);
  } catch (err: any) {
    console.error(`\n✗ FAIL: ${ad}\n  ${err?.message}`);
    console.error(err?.stack?.split('\n').slice(1, 6).join('\n'));
    process.exitCode = 1;
  }
}

const { gelenBelgeSatiriCevir } = await import('../services/providers/hizliTeknolojiProvider');
// ⚠️ GERÇEK fonksiyon içe aktarılır (test ikizi DEĞİL). `belgeGovdesiCoz` bu
// testin ihtiyacı için `export` edildi: saf, ağsız, DB'siz bir fonksiyondur ve
// kopyasının yazılması "asıl kod testten sessizce ayrışır" riskini doğururdu.
const { belgeGovdesiCoz } = await import('../services/hizliConnectService');

// ─── CANLI YANITIN GERÇEK ŞEKLİ ─────────────────────────────────────────────
// 2026-09-30'da canlı `econnect` yanıtından birebir alınmış alan adları ve
// değer tipleri (değerler temsilîdir; KİMLİK bilgisi taşımaz).
function canliSatir(ek: Record<string, any> = {}): Record<string, any> {
  return {
    ReportNo: null,
    UUID: 'BB2DEF5E-3E67-41FB-9BA5-FE8D6901579C',
    EnvelopeUUID: '434d14ef-09ab-45e9-8607-04b19d76384c',
    AppType: 1,
    IsArchive: false,
    IsRead: false,
    IsAccount: false,
    IsTransferred: false,
    IsPrinted: false,
    DocumentId: 'NDE2026000003022',
    DocumentTypeCode: 'SATIS',
    ProfileId: 'TICARIFATURA',
    DocumentCurrencyCode: 'TRY',
    TargetTitle: 'NOKTA DONANIM TEKNOLOJİ TİCARET LİMİTED ŞİRKETİ',
    TargetIdentifier: '6311458947',
    TargetAlias: 'urn:mail:noktatekgb@default.com.tr',
    SourceAlias: 'urn:mail:defaultpk@beyogluteknoloji.com',
    IsInternetSale: false,
    SendType: '',
    TaxTotal: 96,
    PayableAmount: 576,
    LocalReferenceId: null,
    Status: 8,
    StatusExp: 'Cevap Bekliyor',
    EnvelopeStatus: 1300,
    EnvelopeExp: 'BAŞARI İLE TAMAMLANDI',
    Messsage: '',
    IssueDate: '2026-09-28',
    CreatedDate: '2026-09-29T09:51:11.71',
    CancelDate: null,
    CancelOption: true,
    SubeKodu: 1,
    KdvStr: '%20:96,00',
    EMailDate: null,
    HasEMail: false,
    PrefixAndYear: 'NDE2026',
    AppResGibResult: 0,
    AppResGibEnvUUID: null,
    IsInvoiced: false,
    IsPaid: false,
    ...ek,
  };
}

console.log('═══ SAĞLAYICI GELEN-BELGE EŞLEME SÖZLEŞMESİ ═══\n');

// ── 1. CANLI PASCALCASE ŞEKLİ DOĞRU OKUNUR ────────────────────────────────
test('1) PascalCase liste satırı: UUID ve belge no DOĞRU okunur', () => {
  const c = gelenBelgeSatiriCevir(canliSatir());
  assert.equal(c.uuid, 'BB2DEF5E-3E67-41FB-9BA5-FE8D6901579C');
  assert.equal(c.invoiceNo, 'NDE2026000003022');
});

test('2) PascalCase: tedarikçi VKN ve unvanı DOĞRU okunur', () => {
  const c = gelenBelgeSatiriCevir(canliSatir());
  assert.equal(c.supplierVkn, '6311458947');
  assert.equal(c.supplierTitle, 'NOKTA DONANIM TEKNOLOJİ TİCARET LİMİTED ŞİRKETİ');
});

test('3) PascalCase: tarih, tutar ve para birimi DOĞRU okunur', () => {
  const c = gelenBelgeSatiriCevir(canliSatir());
  assert.equal(c.issueDate, '2026-09-28');
  assert.equal(c.grandTotal, 576);
  assert.equal(c.vatAmount, 96);
  assert.equal(c.currency, 'TRY');
});

test('4) subTotal listede yoksa Toplam−KDV ile TÜRETİLİR (576−96=480)', () => {
  assert.equal(gelenBelgeSatiriCevir(canliSatir()).subTotal, 480);
});

test('5) subTotal listede VARSA türetilmez, verilen değer kullanılır', () => {
  assert.equal(gelenBelgeSatiriCevir(canliSatir({ SubTotal: 111 })).subTotal, 111);
});

test('6) AppType 3 → DESPATCH; AppType 1 → INVOICE', () => {
  assert.equal(gelenBelgeSatiriCevir(canliSatir({ AppType: 1 })).documentKind, 'INVOICE');
  assert.equal(gelenBelgeSatiriCevir(canliSatir({ AppType: 3 })).documentKind, 'DESPATCH');
});

test('7) IsRead okunur ve metne çevrilir', () => {
  assert.equal(gelenBelgeSatiriCevir(canliSatir({ IsRead: true })).readState, 'true');
  assert.equal(gelenBelgeSatiriCevir(canliSatir({ IsRead: false })).readState, 'false');
});

// ── 2. SESSİZ BOZULMA GERİ GELMEZ ─────────────────────────────────────────
test('8) ⚠️ uuid ASLA tanımsız/boş olmaz — mükerrer kontrolü buna bağlı', () => {
  const c = gelenBelgeSatiriCevir(canliSatir());
  assert.ok(c.uuid, 'uuid boş olamaz: aksi hâlde TÜM belgeler tek belgenin mükerreri sayılır');
  assert.equal(typeof c.uuid, 'string');
});

test('9) ⚠️ 18 farklı canlı satır → 18 FARKLI uuid (hiçbiri mükerrer değil)', () => {
  const sayilar = Array.from({ length: 18 }, (_, i) =>
    canliSatir({ UUID: `BB2DEF5E-3E67-41FB-9BA5-FE8D6901${String(1000 + i)}` })
  );
  const cevrilen = sayilar.map(gelenBelgeSatiriCevir);
  const tekil = new Set(cevrilen.map(c => c.uuid));
  assert.equal(tekil.size, 18, 'her belge TEKİL bir uuid üretmeli');
  assert.ok(cevrilen.every(c => c.uuid), 'hiçbir uuid boş kalmamalı');
});

test('10) ⚠️ invoiceNo/supplierTitle/grandTotal de boş kalmaz (arayüz "—" göstermesin)', () => {
  const c = gelenBelgeSatiriCevir(canliSatir());
  assert.ok(c.invoiceNo, 'belge no boş olamaz');
  assert.ok(c.supplierTitle, 'tedarikçi unvanı boş olamaz');
  assert.ok(c.grandTotal > 0, 'tutar 0 olamaz');
});

// ── 3. GERİYE DÖNÜK UYUM (camelCase sağlayıcı) ────────────────────────────
test('11) camelCase yanıt da desteklenir (sağlayıcı yazım değiştirirse akış bozulmaz)', () => {
  const c = gelenBelgeSatiriCevir({
    uuid: 'aaaa-1111',
    invoiceNo: 'FTR-9',
    supplierVkn: '1112223334',
    supplierTitle: 'ÖRNEK A.Ş.',
    issueDate: '2026-01-02',
    vatAmount: 20,
    grandTotal: 120,
    currency: 'USD',
    appType: 3,
  });
  assert.equal(c.uuid, 'aaaa-1111');
  assert.equal(c.invoiceNo, 'FTR-9');
  assert.equal(c.supplierVkn, '1112223334');
  assert.equal(c.currency, 'USD');
  assert.equal(c.documentKind, 'DESPATCH');
});

test('12) PascalCase öncelikli: iki yazım da varsa PASCAL kazanır (ölçülen gerçek şekil)', () => {
  const c = gelenBelgeSatiriCevir(canliSatir({ uuid: 'yanlis-camel', UUID: 'dogru-pascal' }));
  assert.equal(c.uuid, 'dogru-pascal');
});

test('13) Boş/null gövde çökmez, boş değerler üretir', () => {
  for (const girdi of [{}, { UUID: null, DocumentId: null }]) {
    const c = gelenBelgeSatiriCevir(girdi);
    assert.equal(c.uuid, '');
    assert.equal(c.appType, 1);
    assert.equal(c.documentKind, 'INVOICE');
    assert.equal(c.currency, 'TRY');
  }
});

test('14) Türkçe karakterler bozulmadan taşınır', () => {
  const c = gelenBelgeSatiriCevir(canliSatir({ TargetTitle: 'ŞİŞLİ ÇAĞDAŞ İNŞAAT — ĞÜŞİÖÇ ıİ' }));
  assert.equal(c.supplierTitle, 'ŞİŞLİ ÇAĞDAŞ İNŞAAT — ĞÜŞİÖÇ ıİ');
});

// ── 4. BELGE İÇERİĞİ SARMALAYICISI (GetDocumentFile) ──────────────────────
// Aşağıdaki testler GERÇEK `belgeGovdesiCoz` fonksiyonunu çağırır; ayrıca
// çağrı yerinin (`getDocumentFile`) hâlâ bu fonksiyondan geçtiği kaynak
// denetimiyle sabitlenir (test 19).
const coz = belgeGovdesiCoz;

test('15) ⚠️ `{DocumentFile:"<base64>"}` sarmalayıcısı ÇÖZÜLÜR (canlı şekil)', () => {
  const xml = '<Invoice><cbc:ID>X</cbc:ID></Invoice>';
  const b64 = Buffer.from(xml, 'utf8').toString('base64');
  assert.equal(coz({ DocumentFile: b64 }), xml);
});

test('16) Sarmalayıcı base64 DEĞİL de düz XML ise aynen döner', () => {
  const xml = '<Invoice><cbc:ID>X</cbc:ID></Invoice>';
  assert.equal(coz({ DocumentFile: xml }), xml);
});

test('17) Düz metin gövde (sarmalayıcısız) da desteklenir', () => {
  const xml = '<Invoice/>';
  assert.equal(coz(xml), xml);
});

test('18) Boş/undefined gövde çökmez, boş dize döner', () => {
  assert.equal(coz(undefined), '');
  assert.equal(coz(null), '');
  assert.equal(coz({}), '');
  assert.equal(coz({ DocumentFile: '' }), '');
});

test('19) ⚠️ KAYNAK DENETİMİ: `getDocumentFile` sarmalayıcıyı GERÇEKTEN çözer', () => {
  // Bu testin varlık nedeni: yukarıdaki yardımcı "doğru sözleşme"yi tarif eder;
  // asıl kod ondan ayrılırsa regresyon sessizce geri gelir. Bu yüzden GERÇEK
  // kaynak dosya okunur ve sarmalayıcı çözümünün oraya bağlı olduğu doğrulanır.
  const kaynak = fs.readFileSync(
    path.join(process.cwd(), 'server/services/hizliConnectService.ts'),
    'utf8'
  );
  assert.match(
    kaynak,
    /belgeGovdesiCoz\(res\.data\)/,
    'getDocumentFile gövdesi belgeGovdesiCoz ile çözülmeli'
  );
  assert.match(kaynak, /DocumentFile/, 'sarmalayıcı anahtarı DocumentFile koddan kaldırılmamalı');
});

test('20) ⚠️ KAYNAK DENETİMİ: liste eşlemesi PascalCase adları okur', () => {
  const kaynak = fs.readFileSync(
    path.join(process.cwd(), 'server/services/providers/hizliTeknolojiProvider.ts'),
    'utf8'
  );
  for (const ad of [
    "alan('UUID', 'uuid')",
    "alan('DocumentId', 'invoiceNo')",
    "alan('TargetIdentifier', 'supplierVkn')",
    "alan('TargetTitle', 'supplierTitle')",
    "alan('IssueDate', 'issueDate')",
    "alan('TaxTotal', 'vatAmount')",
    "alan('PayableAmount', 'grandTotal')",
    "alan('DocumentCurrencyCode', 'currency')",
    "alan('AppType', 'appType')",
  ]) {
    assert.ok(kaynak.includes(ad), `eşleme eksik: ${ad}`);
  }
});

test('21) ⚠️ Liste eşlemesi camelCase-only BİÇİME geri dönmemiş', () => {
  const kaynak = fs.readFileSync(
    path.join(process.cwd(), 'server/services/providers/hizliTeknolojiProvider.ts'),
    'utf8'
  );
  // Eski hatalı biçim: yalnız camelCase okuyan tek satırlık eşleme.
  assert.ok(
    !/uuid:\s*inv\.uuid\s*\|\|\s*inv\.ettn/.test(kaynak),
    'eski camelCase-only eşleme geri gelmiş — canlıda TÜM belgeler mükerrer sayılır'
  );
});

// ── 5. İŞ SEVİYESİ KAPISI (HTTP 2xx YETMEZ) ───────────────────────────────
//
// ⚠️ 2026-10-01'de koddan çıkarılan ÜÇÜNCÜ sessiz bozulma. `docs/48` §229–232
// ölçümü `GetDocumentList`/`GetDocumentReceiverAllList` yanıtlarında kökte
// `IsSucceeded` (boolean) + `Message` alanlarının VARLIĞINI doğruluyor. Bu API
// iş hatasını HTTP 2xx İÇİNDE bildirir (bkz. `IsSeviyesiSonuc` dürüstlük notu).
//
// Kapı olmadan: `IsSucceeded:false` gövdesinde `documents` dizisi yoktur →
// `res.data?.documents || res.data || []` NESNEYİ liste sanıp `Array.isArray`
// kapısında sessizce boşa indirir → "0 belge bulundu" → operatör "gelen kutum
// boş" sanar. İş hatası ile boş gelen kutusu AYNI görünemez.

test('22) ⚠️ iş hatası (`IsSucceeded:false`) "0 belge" SAYILMAZ — kaynak denetimi', () => {
  const kaynak = fs.readFileSync(
    path.join(process.cwd(), 'server/services/hizliConnectService.ts'),
    'utf8'
  );
  // Gelen belge listesi ucu.
  assert.match(
    kaynak,
    /GetDocumentReceiverAllList iş hatası/,
    'GetDocumentReceiverAllList iş-seviyesi kapısı kaldırılmış — iş hatası sessizce "boş gelen kutusu" olur'
  );
  // Belge içeriği ucu.
  assert.match(
    kaynak,
    /GetDocumentFile iş hatası/,
    'GetDocumentFile iş-seviyesi kapısı kaldırılmış'
  );
  // Belge listesi ucu.
  assert.match(
    kaynak,
    /GetDocumentList iş hatası/,
    'GetDocumentList iş-seviyesi kapısı kaldırılmış'
  );
});

test('23) iş-seviyesi bayrağı OKUYUCUSU kökte `IsSucceeded:false` görür', async () => {
  const { isSeviyesiSonucuOku, isSeviyesiMesaji } = await import('../services/hizliConnectService');
  // Canlı iş hatası gövdesi — `documents` dizisi YOKTUR (kök neden bu).
  const govde = { IsSucceeded: false, Message: 'Yetkisiz işlem', documents: undefined };
  assert.equal(isSeviyesiSonucuOku(govde), 'basarisiz', 'IsSucceeded:false "basarisiz" olmalı');
  assert.equal(isSeviyesiMesaji(govde), 'Yetkisiz işlem', 'API iş mesajı okunmalı');
  // Başarılı gövde.
  assert.equal(isSeviyesiSonucuOku({ IsSucceeded: true, documents: [] }), 'basarili');
  // ⚠️ Alan YOKSA "belirsiz" kalır — "başarısız" demek uydurma olurdu (dar kapı).
  assert.equal(
    isSeviyesiSonucuOku({ documents: [] }), 'belirsiz',
    'IsSucceeded alanı yoksa davranış DEĞİŞMEMELİ (belirsiz)'
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TCMB KURU SÖZLEŞMESİ (2026-10-03)
//
// ⚠️ NEDEN VAR: Canlıda dövizli (USD) alış faturası İÇERİ ALINAMIYORDU; onay
// ekranında "TCMB kuru alınamadı; bu belge şu an içeri alınamaz" görünüyordu.
// Kök neden ÖLÇÜLDÜ (salt okunur, canlı `econnect`):
//
//   GET /HizliApi/RestApi/TcbmKurGetir?kurTipi=SatisKur&paraBirimi=USD
//   → {"Kuru":49.0582,"IsSucceeded":true,"Message":"Başarılı, Kur Getirildi."}
//
// Kur alanının adı **`Kuru`**'dur. Servis `rate`/`Kur`/`Rate` arıyordu; hiçbiri
// tutmadığı için `Number({...})` → NaN oluyor ve kur "yok" sayılıyordu. Üstelik
// `IsSucceeded:false` (geçersiz token) durumunda da `Kuru:0` döndüğü için,
// iş-seviyesi hata kontrol edilmezse 0 (sıfır) kur sanılabilirdi.
//
// Bu test CANLI YANITIN GERÇEK ŞEKLİNİ sabitler: alan adı `Kuru` sessizce
// değişirse veya iş-seviyesi kapı kaldırılırsa burada kırılır. Ağa ÇIKMAZ.
// ════════════════════════════════════════════════════════════════════════════

const { tcbmKurCoz } = await import('../services/hizliConnectService');

test('24) TCMB kur çözücü: canlı `Kuru` alanı okunur (regresyon)', () => {
  // 2026-10-03 canlı yanıt şekli — birebir.
  const canli = { Kuru: 49.0582, IsSucceeded: true, Message: 'Başarılı, Kur Getirildi.' };
  const r = tcbmKurCoz(canli);
  assert.equal(r.success, true, 'canlı gövde çözülmeli');
  assert.equal(r.rate, 49.0582, 'kur değeri AYNEN okunmalı — eski kod NaN veriyordu');
});

test('25) TCMB kur çözücü: `IsSucceeded:false` iş hatası — `Kuru:0` kur SAYILMAZ', () => {
  // Geçersiz token'da sağlayıcı HTTP 200 + bu gövdeyi döner.
  const gecersizToken = { Kuru: 0, IsSucceeded: false, Message: 'Geçersiz Token! Lütfen tekrar giriş yapınız!' };
  const r = tcbmKurCoz(gecersizToken);
  assert.equal(r.success, false, 'iş hatası başarı sayılmamalı');
  assert.equal(r.rate, null, 'kur YOK — 0 sıfır kur olarak kullanılmamalı');
  assert.match(String(r.message), /Geçersiz Token/, 'sağlayıcının iş mesajı iletilmeli');
});

test('26) TCMB kur çözücü: alan adı değişse de (camel/alias) çalışır, kur UYDURULMAZ', () => {
  // İleri uyum: sağlayıcı camelCase'e dönerse.
  assert.equal(tcbmKurCoz({ kuru: 47.5, isSucceeded: true }).rate, 47.5);
  assert.equal(tcbmKurCoz({ rate: 47.5, IsSucceeded: true }).rate, 47.5);
  // Kur alanı HİÇ yoksa: uydurma yok, dürüst başarısızlık.
  const bos = tcbmKurCoz({ IsSucceeded: true });
  assert.equal(bos.success, false, 'kur yoksa başarı DENMEMELİ');
  assert.equal(bos.rate, null, 'varsayılan kur ÜRETİLMEMELİ');
  // Sağlayıcı düz sayı dönerse de kabul (küçük olasılık).
  assert.equal(tcbmKurCoz(49.0582).rate, 49.0582);
});

test('27) TCMB kur ayrıştırması TEK yerde (`tcbmKurCoz`) — kopya ayrışma kapısı', () => {
  const kaynak = fs.readFileSync(
    path.join(process.cwd(), 'server/services/hizliConnectService.ts'),
    'utf8'
  );
  // `tcmbKurGetirGuvenli` artık KENDİ sayı çözümünü yapmamalı; ortak fonksiyonu kullanmalı.
  assert.match(
    kaynak,
    /export function tcbmKurCoz/,
    'tcbmKurCoz saf fonksiyonu kaldırılmış'
  );
  assert.doesNotMatch(
    kaynak,
    /ham\?\.rate \?\? ham\?\.Kur/,
    'eski (bozuk) alan-adı sırası geri gelmiş — `Kuru` alanı okunmaz ve döviz faturası içeri alınamaz'
  );
});

console.log(`\nSonuç: ${gecti} PASS`);
if (process.exitCode === 1) {
  console.error('BAZI TESTLER BAŞARISIZ — PASS sayılmaz.');
} else {
  console.log('Tüm sağlayıcı sözleşme testleri geçti.');
}
