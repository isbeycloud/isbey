import { Invoice, Tenant, Customer } from '../../db/schema';

export interface UblInvoiceBuildParams {
  invoice: Invoice;
  tenant: Tenant;
  customer: Customer;
  uuid: string;
  profile?: 'TEMELFATURA' | 'TICARIFATURA' | 'EARSIVFATURA' | 'IHRACAT' | 'KAMU' | string;
  xsltIdentifier?: string;
}

export class UblInvoiceBuilder {
  /**
   * GİB Standart UBL-TR 2.1 e-Fatura / e-Arşiv XML Oluşturucu
   */
  public static buildXml(params: UblInvoiceBuildParams): string {
    const { invoice, tenant, customer, uuid, profile = 'TEMELFATURA', xsltIdentifier } = params;

    const issueDate = invoice.date || new Date().toISOString().slice(0, 10);
    const issueTime = new Date().toTimeString().slice(0, 8);
    const invoiceType = invoice.invoiceCategory || 'SATIS';
    const currency = invoice.currency || 'TRY';

    // Gönderici VKN / TCKN
    const senderVkn = tenant.taxNumber || '1111111111';
    const isSenderTckn = senderVkn.length === 11;
    const senderTitle = tenant.title || tenant.name || 'İŞBEY SaaS Firma';
    const senderCity = tenant.city || 'İstanbul';
    const senderDistrict = tenant.district || 'Merkez';
    const senderTaxOffice = tenant.taxOffice || 'Vergi Dairesi';

    // Alıcı VKN / TCKN
    const receiverVkn = customer.taxNumber || '11111111111';
    const isReceiverTckn = receiverVkn.length === 11;
    const receiverTitle = customer.title || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Müşteri';
    const receiverCity = customer.city || 'İstanbul';
    const receiverDistrict = customer.district || 'Merkez';
    const receiverTaxOffice = customer.taxOffice || 'Vergi Dairesi';

    // Satır XML'leri
    let linesXml = '';
    (invoice.items || []).forEach((item, index) => {
      const lineId = index + 1;
      const unitCode = this.mapUnitToUbl(item.unit);
      const qty = item.quantity || 1;
      const unitPrice = item.unitPrice || 0;
      const vatRate = item.vatRate !== undefined ? item.vatRate : 20;
      const vatAmount = item.vatAmount || (item.lineTotal * (vatRate / 100));
      const lineTotal = item.lineTotal || (qty * unitPrice);

      linesXml += `
  <cac:InvoiceLine>
    <cbc:ID>${lineId}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${unitCode}">${qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${lineTotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${vatAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${lineTotal.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${vatAmount.toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${vatRate}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name><![CDATA[${item.productName || 'Ürün'}]]></cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${item.productCode || `STK-${lineId}`}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    });

    const subTotal = invoice.subTotal || 0;
    const totalVat = invoice.totalVat || 0;
    const grandTotal = invoice.grandTotal || (subTotal + totalVat);
    const payableAmount = invoice.payableVat !== undefined ? (subTotal + invoice.payableVat) : grandTotal;

    const xsltPi = xsltIdentifier
      ? `<?xml-stylesheet type="text/xsl" href="${xsltIdentifier}"?>\n`
      : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
${xsltPi}<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ubltr="urn:oasis:names:specification:ubl:schema:xsd:TurkishCustomization"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profile}</cbc:ProfileID>
  <cbc:ID>${invoice.invoiceNo || (invoice as any).invoiceNumber || 'GIB2026000000001'}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${invoiceType}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${(invoice.items || []).length}</cbc:LineCountNumeric>
  
  <!-- Gönderici (Satıcı) Bilgileri -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${isSenderTckn ? 'TCKN' : 'VKN'}">${senderVkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${senderTitle}]]></cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>${senderCity}</cbc:CityName>
        <cbc:CitySubdivisionName>${senderDistrict}</cbc:CitySubdivisionName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${senderTaxOffice}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Alıcı (Müşteri) Bilgileri -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${isReceiverTckn ? 'TCKN' : 'VKN'}">${receiverVkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${receiverTitle}]]></cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>${receiverCity}</cbc:CityName>
        <cbc:CitySubdivisionName>${receiverDistrict}</cbc:CitySubdivisionName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${receiverTaxOffice}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- Vergi Özeti -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${totalVat.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${subTotal.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${totalVat.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <!-- Parasal Toplamlar -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${subTotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${subTotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${grandTotal.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${payableAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- Kalem Satırları -->
  ${linesXml}
</Invoice>`;
  }

  /**
   * UN/ECE Standart Birim Kod Eşleştirmesi
   */
  public static mapUnitToUbl(unitName?: string): string {
    if (!unitName) return 'C62'; // Adet
    const u = unitName.toLowerCase().trim();
    if (u.includes('adet') || u.includes('tane') || u.includes('piece')) return 'C62';
    if (u.includes('kg') || u.includes('kilo')) return 'KGM';
    if (u.includes('gram') || u.includes('gr')) return 'GRM';
    if (u.includes('litre') || u.includes('lt')) return 'LTR';
    if (u.includes('metre') || u.includes('mt')) return 'MTR';
    if (u.includes('kutu') || u.includes('box')) return 'BX';
    if (u.includes('paket') || u.includes('pack')) return 'PK';
    if (u.includes('ton')) return 'TNE';
    if (u.includes('gün') || u.includes('day')) return 'DAY';
    if (u.includes('saat') || u.includes('hour')) return 'HUR';
    return 'C62';
  }
}
