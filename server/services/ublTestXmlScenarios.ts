/**
 * UBL-TR Test XML Senaryoları
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: XSLT Stüdyosu'nun "Test XML" sekmesi için yazıldı.
 *
 * NEDEN AYRI DOSYA: `XsltEngineService.getSampleXml()` mevcut ve ÇALIŞAN bir
 * yoldur (tasarımcı önizlemesi onu kullanır). Onu senaryo parametresiyle
 * genişletmek, her çağrıyı riske atardı. Bu modül EK bir yetenektir; mevcut
 * akışa dokunmaz.
 *
 * GÜVENLİK: Bu dosya YALNIZ XML üretir. Hiçbir yerde ağ çağrısı, dosya
 * sistemi erişimi veya Hızlı Bilişim gönderimi yoktur. Test XML seçmek
 * e-fatura GÖNDERMEZ — yalnız önizleme dönüşümünün girdisini değiştirir.
 *
 * SENARYOLAR: GİB'in yaygın fatura profilleri. Amaç, şablonun farklı
 * senaryolarda (istisna/navlun satırı, iade, çok satır, vergi muafiyeti)
 * nasıl göründüğünü gerçek UBL yapısıyla sınamaktır.
 */

/** Desteklenen test senaryoları. */
export type UblTestScenario =
  | 'TEMELFATURA'
  | 'TICARIFATURA'
  | 'EARSIVFATURA'
  | 'IADE'
  | 'ISTISNA';

export interface ScenarioInfo {
  id: UblTestScenario;
  label: string;
  description: string;
  /** Belgenin öne çıkan özellikleri — kullanıcı neyi test ettiğini bilsin. */
  highlights: string[];
}

export const UBL_TEST_SCENARIOS: ScenarioInfo[] = [
  {
    id: 'TEMELFATURA',
    label: 'Temel Fatura',
    description: 'Standart satış faturası; tek satır, %20 KDV.',
    highlights: ['Tek ürün satırı', 'KDV %20', 'Temel alanların tamamı dolu'],
  },
  {
    id: 'TICARIFATURA',
    label: 'Ticari Fatura',
    description: 'Çok satırlı, iskontolu ticari fatura; iki farklı KDV oranı.',
    highlights: ['3 ürün satırı', 'İskonto satırı', 'KDV %20 ve %10 karışık', 'Vade ve ödeme koşulu'],
  },
  {
    id: 'EARSIVFATURA',
    label: 'e-Arşiv Fatura',
    description: 'Nihai tüketiciye (TCKN) düzenlenen e-Arşiv faturası.',
    highlights: ['TCKN ile alıcı', 'Tek satır', 'e-Arşiv profil kimliği'],
  },
  {
    id: 'IADE',
    label: 'İade Faturası',
    description: 'İade faturası; negatif tutarlar ve iade nedeni.',
    highlights: ['Negatif miktar/tutar', 'İade notu', 'Uzun açıklama (satır kırılması testi)'],
  },
  {
    id: 'ISTISNA',
    label: 'İstisna / Muafiyet',
    description: 'KDV istisnası uygulanan fatura (ör. ihracat, istisna kodu 301).',
    highlights: ['KDV tutarı 0,00', 'İstisna kodu ve açıklaması', 'Tek satır'],
  },
];

export function isUblTestScenario(value: string): value is UblTestScenario {
  return UBL_TEST_SCENARIOS.some(s => s.id === value);
}

interface ScenarioCompany {
  title?: string;
  name?: string;
  taxNumber?: string;
  taxOffice?: string;
  address?: string;
  city?: string;
}

const esc = (v: string): string =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Ortak satıcı bloğu. */
function supplierParty(c: Required<ScenarioCompany>): string {
  return `  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">${esc(c.taxNumber)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${esc(c.title)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(c.address)}</cbc:StreetName>
        <cbc:CityName>${esc(c.city)}</cbc:CityName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${esc(c.taxOffice)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone>0212 000 00 00</cbc:Telephone>
        <cbc:ElectronicMail>bilgi@ornek.com.tr</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
}

function customerParty(name: string, id: string, scheme: 'VKN' | 'TCKN', address: string, city: string, taxOffice: string): string {
  return `  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="${scheme}">${esc(id)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${esc(name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(address)}</cbc:StreetName>
        <cbc:CityName>${esc(city)}</cbc:CityName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${esc(taxOffice)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

/** Bir fatura satırı üretir. */
interface LineSpec {
  id: number;
  name: string;
  code: string;
  description: string;
  quantity: string;
  unitCode: string;
  unitPrice: string;
  lineTotal: string;
  vatPercent: string;
  vatAmount: string;
  /** İstisna kodu (varsa) — 301, 351 vb. */
  exemptionCode?: string;
  exemptionReason?: string;
}

function invoiceLine(l: LineSpec): string {
  const taxSubtotal = l.exemptionCode
    ? `      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="TRY">${l.lineTotal}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="TRY">${l.vatAmount}</cbc:TaxAmount>
        <cbc:Percent>${l.vatPercent}</cbc:Percent>
        <cbc:TaxExemptionReasonCode>${l.exemptionCode}</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>${esc(l.exemptionReason || '')}</cbc:TaxExemptionReason>
        <cac:TaxCategory>
          <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`
    : `      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="TRY">${l.lineTotal}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="TRY">${l.vatAmount}</cbc:TaxAmount>
        <cbc:Percent>${l.vatPercent}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`;

  return `  <cac:InvoiceLine>
    <cbc:ID>${l.id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${l.unitCode}">${l.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">${l.lineTotal}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="TRY">${l.vatAmount}</cbc:TaxAmount>
${taxSubtotal}
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${esc(l.name)}</cbc:Name>
      <cbc:Description>${esc(l.description)}</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>${esc(l.code)}</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="TRY">${l.unitPrice}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
}

/**
 * Verilen senaryo için gerçekçi UBL-TR XML üretir.
 *
 * @param scenario Test senaryosu.
 * @param company  Firma bilgisi (yoksa nötr yer tutucular kullanılır — önizlemede
 *                 başka bir firmanın kimliği görünmemelidir).
 */
export function buildScenarioXml(scenario: UblTestScenario, company?: ScenarioCompany): string {
  const c: Required<ScenarioCompany> = {
    title: company?.title || company?.name || 'FİRMA UNVANI',
    name: company?.name || company?.title || 'FİRMA UNVANI',
    taxNumber: company?.taxNumber || '0000000000',
    taxOffice: company?.taxOffice || 'Vergi Dairesi',
    address: company?.address || 'Adres',
    city: company?.city || 'Şehir',
  };

  const head = (id: string, uuid: string, profile: string, typeCode: string, date: string, time: string, note?: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profile}</cbc:ProfileID>
  <cbc:ID>${id}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:IssueTime>${time}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
${note ? `  <cbc:Note>${esc(note)}</cbc:Note>\n` : ''}  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>1</cbc:LineCountNumeric>`;

  switch (scenario) {
    case 'TEMELFATURA':
      return `${head(
        'EFT202600000201',
        'a1b2c3d4-0001-4a11-9c01-000000000201',
        'TEMELFATURA',
        'SATIS',
        '2026-09-24',
        '10:30:00',
        'İşbu fatura bedeli 15 gün içinde banka hesabımıza ödenecektir.'
      )}

${supplierParty(c)}

${customerParty('KAREN TEKNOLOJİ LTD. ŞTİ.', '15512014278', 'VKN', 'Sanayi Mah. 1201 Sok. No:7', 'ANKARA', 'Çankaya')}

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">5000.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">25000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">5000.00</cbc:TaxAmount>
      <cbc:Percent>20</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">25000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">25000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">30000.00</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="TRY">0.00</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="TRY">30000.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${invoiceLine({
  id: 1,
  name: 'Hazır Beton C35/45',
  code: 'BTN-C35',
  description: 'TS EN 206 Standardı Uyumlu Hazır Beton',
  quantity: '10',
  unitCode: 'C62',
  unitPrice: '2500.00',
  lineTotal: '25000.00',
  vatPercent: '20',
  vatAmount: '5000.00',
})}
</Invoice>`;

    case 'TICARIFATURA':
      return `${head(
        'EFT202600000202',
        'a1b2c3d4-0002-4a11-9c01-000000000202',
        'TICARIFATURA',
        'SATIS',
        '2026-09-24',
        '11:45:00',
        'Ödeme vadesi 30 gündür. Gecikme hâlinde aylık %2 vade farkı uygulanır.'
      )}

${supplierParty(c)}

${customerParty('ABDULLAH KARADUMAN - KAREN TEKNOLOJİ', '15512014278', 'VKN', 'Sanayi Mah. 1201 Sok. No:7', 'İSTANBUL', 'Kadıköy')}

  <!-- Belge düzeyinde iskonto. DİKKAT: Bu blok kaldırılırsa aşağıdaki
       LegalMonetaryTotal/TaxTotal tutarları da tutarsız kalır —
       AllowanceTotalAmount tek başına bir "gösterge" değil, gerçekten
       düşülen tutardır. Matrah: 20% bandı 37.500 - 1.500 = 36.000,
       10% bandı 8.100 sabit. -->
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Erken ödeme iskontosu</cbc:AllowanceChargeReason>
    <cbc:MultiplierFactorNumeric>3.95</cbc:MultiplierFactorNumeric>
    <cbc:Amount currencyID="TRY">1500.00</cbc:Amount>
  </cac:AllowanceCharge>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">8010.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">36000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">7200.00</cbc:TaxAmount>
      <cbc:Percent>20</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">8100.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">810.00</cbc:TaxAmount>
      <cbc:Percent>10</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">45600.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">44100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">52110.00</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="TRY">1500.00</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="TRY">52110.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${invoiceLine({
  id: 1,
  name: 'İnşaat Demiri Q14 Nervürlü',
  code: 'DMR-Q14',
  description: '12 Metre Boy Kesilmiş Çelik, S420 Sınıfı',
  quantity: '10',
  unitCode: 'TNE',
  unitPrice: '2500.00',
  lineTotal: '25000.00',
  vatPercent: '20',
  vatAmount: '5000.00',
})}

${invoiceLine({
  id: 2,
  name: 'Çimento Portland CEM I 42,5 R',
  code: 'CMT-425',
  description: '50 kg Torba, TS EN 197-1 Uyumlu',
  quantity: '100',
  unitCode: 'C62',
  unitPrice: '125.00',
  lineTotal: '12500.00',
  vatPercent: '20',
  vatAmount: '2500.00',
})}

${invoiceLine({
  id: 3,
  name: 'Nakliye ve Şantiye Teslim Hizmeti',
  code: 'HIZ-NAK',
  description: 'Şantiye içi nakliye, boşaltma dahil',
  quantity: '1',
  unitCode: 'C62',
  unitPrice: '8100.00',
  lineTotal: '8100.00',
  vatPercent: '10',
  vatAmount: '810.00',
})}
</Invoice>`;

    case 'EARSIVFATURA':
      return `${head(
        'EAR202600000303',
        'a1b2c3d4-0003-4a11-9c01-000000000303',
        'EARSIVFATURA',
        'SATIS',
        '2026-09-25',
        '09:15:00',
        'Bu belge e-Arşiv fatura olarak düzenlenmiştir.'
      )}

${supplierParty(c)}

${customerParty('AYŞE YILMAZ', '12345678901', 'TCKN', 'Atatürk Cad. No:45 Daire:3', 'İZMİR', 'Vergi Dairesi')}

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">236.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">1180.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">236.00</cbc:TaxAmount>
      <cbc:Percent>20</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">1180.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">1180.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">1416.00</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="TRY">0.00</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="TRY">1416.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${invoiceLine({
  id: 1,
  name: 'Vidalı Bağlantı Elemanı Seti',
  code: 'VBE-100',
  description: 'Paslanmaz çelik, 100 parça set',
  quantity: '4',
  unitCode: 'SET',
  unitPrice: '295.00',
  lineTotal: '1180.00',
  vatPercent: '20',
  vatAmount: '236.00',
})}
</Invoice>`;

    case 'IADE':
      return `${head(
        'EFT202600000404',
        'a1b2c3d4-0004-4a11-9c01-000000000404',
        'TEMELFATURA',
        'IADE',
        '2026-09-25',
        '16:05:00',
        'İade faturasıdır. EFT202600000201 numaralı faturaya istinaden düzenlenmiştir. Teslim alınan ürünlerin teknik şartnameye uygun olmaması nedeniyle iade edilmiştir.'
      )}

${supplierParty(c)}

${customerParty('KAREN TEKNOLOJİ LTD. ŞTİ.', '15512014278', 'VKN', 'Sanayi Mah. 1201 Sok. No:7', 'ANKARA', 'Çankaya')}

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">-5000.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">-25000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">-5000.00</cbc:TaxAmount>
      <cbc:Percent>20</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">-25000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">-25000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">-30000.00</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="TRY">0.00</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="TRY">-30000.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${invoiceLine({
  id: 1,
  name: 'Hazır Beton C35/45',
  code: 'BTN-C35',
  description:
    'TS EN 206 Standardı Uyumlu Hazır Beton — şantiyede yapılan basınç dayanımı deneyleri sonucunda 28 günlük dayanım değerlerinin proje şartnamesinde öngörülen C35/45 sınıfının altında kaldığı tespit edilmiş olup, ilgili tüm partiler iade edilmiştir.',
  quantity: '-10',
  unitCode: 'C62',
  unitPrice: '2500.00',
  lineTotal: '-25000.00',
  vatPercent: '20',
  vatAmount: '-5000.00',
})}
</Invoice>`;

    case 'ISTISNA':
      return `${head(
        'EFT202600000505',
        'a1b2c3d4-0005-4a11-9c01-000000000505',
        'TEMELFATURA',
        'SATIS',
        '2026-09-26',
        '14:20:00',
        'KDV istisnası uygulanmıştır. İstisna kodu 301 — 3065 sayılı Kanunun 11/1-a maddesi kapsamında ihracat istisnası.'
      )}

${supplierParty(c)}

${customerParty('EURO BUILD GMBH', '0000000000', 'VKN', 'Industriestrasse 14', 'BERLİN', 'Vergi Dairesi')}

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">120000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">0.00</cbc:TaxAmount>
      <cbc:Percent>0</cbc:Percent>
      <cbc:TaxExemptionReasonCode>301</cbc:TaxExemptionReasonCode>
      <cbc:TaxExemptionReason>İhracat istisnası (3065 s.K. 11/1-a)</cbc:TaxExemptionReason>
      <cac:TaxCategory>
        <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">120000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">120000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">120000.00</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="TRY">0.00</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="TRY">120000.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${invoiceLine({
  id: 1,
  name: 'Hazır Beton C40/50 (İhracat)',
  code: 'BTN-C40',
  description: 'TS EN 206 Standardı Uyumlu Hazır Beton, ihracat sevkiyatı',
  quantity: '40',
  unitCode: 'C62',
  unitPrice: '3000.00',
  lineTotal: '120000.00',
  vatPercent: '0',
  vatAmount: '0.00',
  exemptionCode: '301',
  exemptionReason: 'İhracat istisnası (3065 s.K. 11/1-a)',
})}
</Invoice>`;
  }
}
