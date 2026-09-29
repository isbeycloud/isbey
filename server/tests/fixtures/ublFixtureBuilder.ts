/**
 * A–O MATRİSİ İÇİN UBL-TR BELGE ÜRETİCİSİ (yalnız test aracı)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-29 eklendi.
 *
 * ⚠️ NEDEN `UblInvoiceBuilder` YETMİYOR: Uygulamanın kendi üreticisi İŞBEY'in
 * ÇIKTIĞI belgeleri taklit eder — satır iskontosu (`AllowanceCharge`), TRY dışı
 * para birimi, 100 satırlık hacim ve tek belgede karışık KDV oranları onun
 * kapsamı DIŞINDADIR. Zorunlu test matrisinin E (iskontolu satır), F (döviz),
 * B/C (10 ve 100 satır) ve D (1%+10%+20%) maddeleri bu yüzden üretilemiyordu.
 *
 * ⚠️ NEDEN ÜRETİCİYİ DEĞİŞTİRMİYORUZ: `UblInvoiceBuilder` CANLI kod yolundadır
 * (giden belge üretimi). Test için davranışını genişletmek, testin ölçtüğü şeyi
 * test için değiştirmek olurdu. Bu dosya YALNIZ test ağacındadır ve hiçbir
 * üretim kodundan import edilmez.
 *
 * Üretilen XML gerçek UBL-TR 2.1 yapısındadır: `cac:TaxCategory > cac:TaxScheme`
 * yolu, `cbc:TaxTypeCode` 0015 (KDV), `ChargeIndicator=false` iskonto. Yani
 * çözümleyici gerçek bir tedarikçi belgesiyle aynı yolu izler.
 */

export interface FixtureSatir {
  /** Satır numarası (cbc:ID). */
  no: string;
  ad: string;
  /** Satıcı ürün kodu (SellersItemIdentification). */
  kod: string;
  barkod?: string;
  aliciKod?: string;
  ureticiKod?: string;
  miktar: number;
  /** UBL birim kodu (C62=Adet, KGM=Kg, LTR=Litre). */
  birim?: string;
  /** İskonto ÖNCESİ birim fiyat. */
  fiyat: number;
  /** KDV yüzdesi. */
  kdv: number;
  /** Satır iskontosu — TUTAR. `AllowanceCharge` bloğu üretir. */
  iskontoTutar?: number;
  /** İskonto yüzdesi (yalnız `MultiplierFactorNumeric` için; hesaba katılmaz). */
  iskontoOran?: number;
  /** Satır düzeyi KDV dışı vergi (ör. ÖTV) — KDV'den AYRI blok. */
  digerVergi?: { ad: string; kod: string; oran?: number; tutar: number };
}

export interface FixtureBelge {
  uuid: string;
  belgeNo: string;
  tarih?: string;
  saat?: string;
  /** ISO 4217 — TRY dışı verilirse döviz kapısı sınanır. */
  paraBirimi?: string;
  saticiVkn: string;
  saticiUnvan: string;
  saticiVergiDairesi?: string;
  aliciVkn: string;
  aliciUnvan: string;
  satirlar: FixtureSatir[];
  /** `LegalMonetaryTotal` yazılsın mı (gerçek belgelerde vardır). */
  parasalToplamlar?: boolean;
}

const n2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

/** Satırın iskonto SONRASI net tutarı — UBL'de `LineExtensionAmount` budur. */
export function satirNet(s: FixtureSatir): number {
  return Math.round(((s.miktar * s.fiyat) - (s.iskontoTutar || 0)) * 100) / 100;
}

/** Satırın KDV tutarı (KDV dışı vergiler hariç). */
export function satirKdv(s: FixtureSatir): number {
  return Math.round(satirNet(s) * (s.kdv / 100) * 100) / 100;
}

/**
 * Belgeyi UBL-TR 2.1 `<Invoice>` olarak üretir.
 *
 * ⚠️ Girinti bilinçli olarak SADE tutulur: üretilen dizge testin okuduğu tek
 * şeydir; süslü biçimlendirme, hata ayıklamayı zorlaştırmaktan başka işe yaramaz.
 */
export function faturaXml(b: FixtureBelge): string {
  const currency = b.paraBirimi || 'TRY';
  const tarih = b.tarih || '2026-09-20';
  const saat = b.saat || '10:30:00';

  let satirlarXml = '';
  for (const s of b.satirlar) {
    const net = satirNet(s);
    const kdvTutar = satirKdv(s);
    const birim = s.birim || 'C62';

    // İskonto bloğu YALNIZ tutar verildiğinde yazılır. `ChargeIndicator=false`
    // UBL'de "bu bir iskontodur" demektir; `true` olsaydı masraf sayılırdı.
    const iskontoXml =
      s.iskontoTutar && s.iskontoTutar > 0
        ? `
      <cac:AllowanceCharge>
        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
        ${s.iskontoOran !== undefined ? `<cbc:MultiplierFactorNumeric>${s.iskontoOran}</cbc:MultiplierFactorNumeric>` : ''}
        <cbc:Amount currencyID="${currency}">${n2(s.iskontoTutar)}</cbc:Amount>
      </cac:AllowanceCharge>`
        : '';

    // ⚠️ KDV DIŞI VERGİ AYRI BİR `cac:TaxTotal` BLOĞUNDADIR — kasten.
    // UBL'de `TaxTotal/TaxAmount` o bloğun ALT TOPLAMIDIR; ÖTV'yi KDV ile aynı
    // bloğa koymak, bloğun `TaxAmount`'ını KDV+ÖTV yapar ve çözümleyici satır
    // KDV'sini o elemandan okuduğu için KDV şişerdi. Gerçek UBL-TR belgelerinde
    // de ayrı bloklardır; fixture da öyle olmalı ki testi geçen davranış canlıda
    // da geçerli olsun.
    const digerVergiXml = s.digerVergi
      ? `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${n2(s.digerVergi.tutar)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${n2(net)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${n2(s.digerVergi.tutar)}</cbc:TaxAmount>
        ${s.digerVergi.oran !== undefined ? `<cbc:Percent>${s.digerVergi.oran}</cbc:Percent>` : ''}
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>${s.digerVergi.ad}</cbc:Name>
            <cbc:TaxTypeCode>${s.digerVergi.kod}</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>`
      : '';

    satirlarXml += `
  <cac:InvoiceLine>
    <cbc:ID>${s.no}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${birim}">${s.miktar}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${n2(net)}</cbc:LineExtensionAmount>${iskontoXml}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${n2(kdvTutar)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${n2(net)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${n2(kdvTutar)}</cbc:TaxAmount>
        <cbc:Percent>${s.kdv}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>${digerVergiXml}
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name><![CDATA[${s.ad}]]></cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${s.kod}</cbc:ID>
      </cac:SellersItemIdentification>${s.aliciKod ? `
      <cac:BuyersItemIdentification>
        <cbc:ID>${s.aliciKod}</cbc:ID>
      </cac:BuyersItemIdentification>` : ''}${s.ureticiKod ? `
      <cac:ManufacturersItemIdentification>
        <cbc:ID>${s.ureticiKod}</cbc:ID>
      </cac:ManufacturersItemIdentification>` : ''}${s.barkod ? `
      <cac:StandardItemIdentification>
        <cbc:ID>${s.barkod}</cbc:ID>
      </cac:StandardItemIdentification>` : ''}
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${n2(s.fiyat)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }

  const altToplam = Math.round(b.satirlar.reduce((t, s) => t + satirNet(s), 0) * 100) / 100;
  const kdvToplam = Math.round(b.satirlar.reduce((t, s) => t + satirKdv(s), 0) * 100) / 100;
  const digerToplam = Math.round(
    b.satirlar.reduce((t, s) => t + (s.digerVergi?.tutar || 0), 0) * 100
  ) / 100;
  const genel = Math.round((altToplam + kdvToplam) * 100) / 100;
  const odenecek = Math.round((genel + digerToplam) * 100) / 100;

  // Belge düzeyi vergi blokları: KDV AYRI, KDV dışı vergiler AYRI `TaxTotal`.
  // Tek bloğa sıkıştırmak, çözümleyicinin vergi ayrımını sınamaz hâle getirirdi.
  const kdvBlogu = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${n2(kdvToplam)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${n2(altToplam)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${n2(kdvToplam)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;

  const digerBlogu =
    digerToplam > 0
      ? `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${n2(digerToplam)}</cbc:TaxAmount>
    ${b.satirlar
      .filter(s => s.digerVergi)
      .map(
        s => `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${n2(satirNet(s))}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${n2(s.digerVergi!.tutar)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>${s.digerVergi!.ad}</cbc:Name>
          <cbc:TaxTypeCode>${s.digerVergi!.kod}</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
      )
      .join('')}
  </cac:TaxTotal>`
      : '';

  const parasal =
    b.parasalToplamlar === false
      ? ''
      : `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${n2(altToplam)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${n2(altToplam)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${n2(genel)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${n2(odenecek)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TICARIFATURA</cbc:ProfileID>
  <cbc:ID>${b.belgeNo}</cbc:ID>
  <cbc:UUID>${b.uuid}</cbc:UUID>
  <cbc:IssueDate>${tarih}</cbc:IssueDate>
  <cbc:IssueTime>${saat}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>ALIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${b.satirlar.length}</cbc:LineCountNumeric>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${b.saticiVkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${b.saticiUnvan}]]></cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>İzmir</cbc:CityName>
        <cbc:CitySubdivisionName>Karşıyaka</cbc:CitySubdivisionName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${b.saticiVergiDairesi || 'Karşıyaka VD'}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${b.aliciVkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${b.aliciUnvan}]]></cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>İstanbul</cbc:CityName>
        <cbc:CitySubdivisionName>Merkez</cbc:CitySubdivisionName>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
${kdvBlogu}${digerBlogu}${parasal}
${satirlarXml}
</Invoice>`;
}

/**
 * Belgeyi `<DespatchAdvice>` (e-İrsaliye) olarak üretir — FİYAT ve KDV YOKTUR.
 *
 * ⚠️ Bu bilinçlidir: irsaliye mali belge değildir, fiyat taşımaz. Üreticiye
 * `Price`/`TaxTotal` eklemek, testin "irsaliyede fiyat uydurulmuyor" iddiasını
 * anlamsız kılardı.
 */
export function irsaliyeXml(b: {
  uuid: string;
  belgeNo: string;
  tarih?: string;
  saticiVkn: string;
  saticiUnvan: string;
  aliciVkn: string;
  aliciUnvan: string;
  satirlar: Array<{ no: string; ad: string; kod: string; barkod?: string; miktar: number; birim?: string }>;
}): string {
  const tarih = b.tarih || '2026-09-20';
  let satirlarXml = '';
  for (const s of b.satirlar) {
    satirlarXml += `
  <cac:DespatchLine>
    <cbc:ID>${s.no}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${s.birim || 'C62'}">${s.miktar}</cbc:DeliveredQuantity>
    <cac:Item>
      <cbc:Name><![CDATA[${s.ad}]]></cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${s.kod}</cbc:ID>
      </cac:SellersItemIdentification>${s.barkod ? `
      <cac:StandardItemIdentification>
        <cbc:ID>${s.barkod}</cbc:ID>
      </cac:StandardItemIdentification>` : ''}
    </cac:Item>
  </cac:DespatchLine>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
                xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>${b.belgeNo}</cbc:ID>
  <cbc:UUID>${b.uuid}</cbc:UUID>
  <cbc:IssueDate>${tarih}</cbc:IssueDate>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  <cbc:LineCountNumeric>${b.satirlar.length}</cbc:LineCountNumeric>

  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${b.saticiVkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${b.saticiUnvan}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:DespatchSupplierParty>

  <cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${b.aliciVkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${b.aliciUnvan}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:DeliveryCustomerParty>
${satirlarXml}
</DespatchAdvice>`;
}

/** N satırlı düz fatura — hacim testleri (B/C) için. */
export function cokSatirliBelge(
  uuid: string,
  belgeNo: string,
  n: number,
  opts: { kodOnEki?: string; kdv?: number; paraBirimi?: string; saticiVkn: string; saticiUnvan: string; aliciVkn: string; aliciUnvan: string }
): string {
  const satirlar: FixtureSatir[] = [];
  for (let i = 1; i <= n; i++) {
    satirlar.push({
      no: String(i),
      ad: `${opts.kodOnEki || 'KALEM'}-${i} ürünü`,
      kod: `${opts.kodOnEki || 'KALEM'}-${i}`,
      miktar: i,
      fiyat: 10,
      kdv: opts.kdv ?? 20,
    });
  }
  return faturaXml({
    uuid,
    belgeNo,
    paraBirimi: opts.paraBirimi,
    saticiVkn: opts.saticiVkn,
    saticiUnvan: opts.saticiUnvan,
    aliciVkn: opts.aliciVkn,
    aliciUnvan: opts.aliciUnvan,
    satirlar,
  });
}
