import { Waybill, Tenant, Customer } from '../../db/schema';
import { UblInvoiceBuilder } from './ublInvoiceBuilder';

export interface UblDespatchBuildParams {
  waybill: Waybill;
  tenant: Tenant;
  customer: Customer;
  uuid: string;
}

export class UblDespatchBuilder {
  /**
   * GİB Standart UBL-TR 2.1 e-İrsaliye (DespatchAdvice) XML Oluşturucu
   */
  public static buildXml(params: UblDespatchBuildParams): string {
    const { waybill, tenant, customer, uuid } = params;

    const issueDate = waybill.date || new Date().toISOString().slice(0, 10);
    const issueTime = new Date().toTimeString().slice(0, 8);
    const shipmentDate = waybill.shipmentDate || issueDate;

    // Gönderici
    const senderVkn = tenant.taxNumber || '1111111111';
    const isSenderTckn = senderVkn.length === 11;
    const senderTitle = tenant.title || tenant.name || 'İŞBEY SaaS Firma';
    const senderCity = tenant.city || 'İstanbul';
    const senderDistrict = tenant.district || 'Merkez';
    const senderTaxOffice = tenant.taxOffice || 'Vergi Dairesi';

    // Alıcı
    const receiverVkn = customer.taxNumber || '11111111111';
    const isReceiverTckn = receiverVkn.length === 11;
    const receiverTitle = customer.title || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Müşteri';
    const receiverCity = customer.city || 'İstanbul';
    const receiverDistrict = customer.district || 'Merkez';
    const receiverTaxOffice = customer.taxOffice || 'Vergi Dairesi';

    // İrsaliye Satırları
    let linesXml = '';
    (waybill.items || []).forEach((item, index) => {
      const lineId = index + 1;
      const unitCode = UblInvoiceBuilder.mapUnitToUbl(item.unit);
      const qty = item.quantity || 1;

      linesXml += `
  <cac:DespatchLine>
    <cbc:ID>${lineId}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${unitCode}">${qty}</cbc:DeliveredQuantity>
    <cac:Item>
      <cbc:Name><![CDATA[${item.productName || 'Ürün'}]]></cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${item.productCode || `STK-${lineId}`}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
  </cac:DespatchLine>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
                xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                xmlns:ubltr="urn:oasis:names:specification:ubl:schema:xsd:TurkishCustomization"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>${waybill.waybillNo}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  <cbc:LineCountNumeric>${(waybill.items || []).length}</cbc:LineCountNumeric>

  <!-- Gönderici (Sevkiyatı Yapan) -->
  <cac:DespatchSupplierParty>
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
  </cac:DespatchSupplierParty>

  <!-- Alıcı (Sevkiyatı Alan) -->
  <cac:DeliveryCustomerParty>
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
  </cac:DeliveryCustomerParty>

  <!-- Sevkiyat ve Taşıma Bilgileri -->
  <cac:Shipment>
    <cbc:ID>${waybill.waybillNo}</cbc:ID>
    <cac:Delivery>
      <cac:Despatch>
        <cbc:ActualDespatchDate>${shipmentDate}</cbc:ActualDespatchDate>
        <cbc:ActualDespatchTime>${issueTime}</cbc:ActualDespatchTime>
      </cac:Despatch>
      <cac:CarrierParty>
        <cac:PartyName>
          <cbc:Name><![CDATA[${waybill.carrierTitle || senderTitle}]]></cbc:Name>
        </cac:PartyName>
        <cac:Person>
          <cbc:FirstName><![CDATA[${waybill.driverName || 'Yetkili Şoför'}]]></cbc:FirstName>
        </cac:Person>
      </cac:CarrierParty>
    </cac:Delivery>
    <cac:TransportHandlingUnit>
      <cac:TransportMeans>
        <cac:RoadTransport>
          <cbc:LicensePlateID>${waybill.plateNumber || '34XX000'}</cbc:LicensePlateID>
        </cac:RoadTransport>
      </cac:TransportMeans>
    </cac:TransportHandlingUnit>
  </cac:Shipment>

  <!-- Satırlar -->
  ${linesXml}
</DespatchAdvice>`;
  }
}
