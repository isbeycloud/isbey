import type { DocumentType, DocumentDesignConfig } from '../db/schema';

export class XsltEngineService {
  /**
   * Generates a standard, valid XSLT 1.0 stylesheet for UBL-TR documents
   */
  public static generateXslt(
    documentType: DocumentType,
    config: DocumentDesignConfig,
    templateName: string = 'Standard'
  ): string {
    const isDespatch = documentType === 'EIRSALIYE';
    const isEArsiv = documentType === 'EARSIV';
    const isSmm = documentType === 'ESMM';

    const primaryColor = config.primaryColor || '#0284c7';
    const secondaryColor = config.secondaryColor || '#1e293b';
    const fontFamily = config.fontFamily || 'Arial, Helvetica, sans-serif';
    const fontSize = config.fontSize || 12;

    const logoHtml = config.showLogo && config.logoUrl
      ? `<img src="${config.logoUrl}" style="max-width:${config.logoWidth || 220}px; max-height:${config.logoHeight || 80}px; object-fit:contain;" alt="Firma Logo" />`
      : `<div style="font-size:20px; font-weight:900; color:${primaryColor}; text-transform:uppercase;">
          <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='PartyName']/*[local-name()='Name'] | //*[local-name()='DespatchSupplierParty']//*[local-name()='PartyName']/*[local-name()='Name']"/>
        </div>`;

    const signatureHtml = config.showSignature && config.signatureUrl
      ? `<div style="margin-top:10px; text-align:center;">
          <div style="font-size:10px; color:#64748b; margin-bottom:4px;">Yetkili İmza &amp; Kaşe</div>
          <img src="${config.signatureUrl}" style="max-width:${config.signatureWidth || 160}px; max-height:${config.signatureHeight || 70}px; object-fit:contain;" alt="Kaşe / İmza" />
        </div>`
      : '';

    const bankAccountsRows = (config.bankAccounts || []).map(b => `
      <tr>
        <td style="padding:4px 8px; font-weight:bold; border-bottom:1px solid #e2e8f0;">${b.bankName} (${b.currency})</td>
        <td style="padding:4px 8px; font-family:monospace; border-bottom:1px solid #e2e8f0;">${b.iban}</td>
      </tr>
    `).join('');

    const bankAccountsTable = (config.bankAccounts && config.bankAccounts.length > 0) ? `
      <div style="margin-top:14px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
        <div style="font-size:11px; font-weight:bold; color:${primaryColor}; margin-bottom:6px;">Banka Hesap Bilgileri</div>
        <table style="width:100%; font-size:10px; border-collapse:collapse;">
          <tbody>
            ${bankAccountsRows}
          </tbody>
        </table>
      </div>
    ` : '';

    const notesSection = config.notes ? `
      <div style="margin-top:10px; font-size:10px; color:#475569;">
        <strong>Not:</strong> ${config.notes}
      </div>
    ` : '';

    const paymentTermsSection = config.paymentTerms ? `
      <div style="margin-top:6px; font-size:10px; color:#475569;">
        <strong>Ödeme Koşulları:</strong> ${config.paymentTerms}
      </div>
    ` : '';

    // Document Title Banner by Type
    let docTitleText = 'e-FATURA';
    if (isEArsiv) docTitleText = 'e-ARŞİV FATURA';
    if (isDespatch) docTitleText = 'e-İRSALİYE';
    if (isSmm) docTitleText = 'e-SERBEST MESLEK MAKBUZU';

    return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:ubltr="urn:oasis:names:specification:ubl:schema:xsd:TurkishCustomization"
  exclude-result-prefixes="cac cbc ext ubltr">

  <xsl:output method="html" doctype-system="about:legacy-compat" encoding="UTF-8" indent="yes" />

  <xsl:template match="/">
    <html>
      <head>
        <meta charset="UTF-8" />
        <title><xsl:value-of select="//*[local-name()='ID']"/> - ${docTitleText}</title>
        <style type="text/css">
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: ${fontFamily};
            font-size: ${fontSize}px;
            color: #1e293b;
            background: #ffffff;
            margin: 0;
            padding: 0;
            line-height: 1.35;
          }
          .a4-container {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            background: #fff;
            padding: 10px;
          }
          .header-grid {
            display: table;
            width: 100%;
            margin-bottom: 12px;
          }
          .header-col-left {
            display: table-cell;
            width: 45%;
            vertical-align: top;
          }
          .header-col-center {
            display: table-cell;
            width: 20%;
            vertical-align: top;
            text-align: center;
          }
          .header-col-right {
            display: table-cell;
            width: 35%;
            vertical-align: top;
            text-align: right;
          }
          .doc-title {
            font-size: 18px;
            font-weight: 900;
            color: ${primaryColor};
            letter-spacing: 0.5px;
            margin-top: 4px;
          }
          .meta-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px;
            font-size: 11px;
            text-align: left;
            margin-top: 6px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
          }
          .meta-label { font-weight: bold; color: #64748b; }
          .meta-value { font-weight: bold; color: #0f172a; }
          
          .parties-grid {
            display: table;
            width: 100%;
            margin-top: 10px;
            margin-bottom: 12px;
          }
          .party-card {
            display: table-cell;
            width: 48%;
            vertical-align: top;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-top: 3px solid ${primaryColor};
            border-radius: 4px;
            padding: 10px;
          }
          .party-card-gap {
            display: table-cell;
            width: 4%;
          }
          .party-title {
            font-size: 11px;
            font-weight: 800;
            color: ${primaryColor};
            text-transform: uppercase;
            margin-bottom: 6px;
            border-bottom: 1px dashed #e2e8f0;
            padding-bottom: 3px;
          }
          .party-name {
            font-size: 12px;
            font-weight: bold;
            color: #0f172a;
            margin-bottom: 4px;
          }
          .party-info-row {
            font-size: 10.5px;
            color: #334155;
            margin-bottom: 2px;
          }
          
          table.lines-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 11px;
          }
          table.lines-table th {
            background: ${primaryColor};
            color: #ffffff;
            font-weight: bold;
            text-align: left;
            padding: 6px 8px;
            border: 1px solid ${primaryColor};
          }
          table.lines-table td {
            padding: 5px 8px;
            border: 1px solid #e2e8f0;
            vertical-align: top;
          }
          table.lines-table tr:nth-child(even) td {
            background: #f8fafc;
          }
          
          .bottom-section {
            display: table;
            width: 100%;
            margin-top: 14px;
          }
          .bottom-left {
            display: table-cell;
            width: 55%;
            vertical-align: top;
            padding-right: 15px;
          }
          .bottom-right {
            display: table-cell;
            width: 45%;
            vertical-align: top;
          }
          table.totals-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          table.totals-table td {
            padding: 4px 8px;
            border-bottom: 1px solid #e2e8f0;
          }
          table.totals-table tr.grand-total td {
            background: #f1f5f9;
            font-weight: 900;
            font-size: 13px;
            color: ${primaryColor};
            border-top: 2px solid ${primaryColor};
            border-bottom: 2px solid ${primaryColor};
          }
          
          .qr-placeholder {
            width: 80px;
            height: 80px;
            border: 1px dashed #94a3b8;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            color: #64748b;
            text-align: center;
            background: #f8fafc;
          }
          
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .a4-container { width: 100%; max-width: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="a4-container">
          <!-- ─── ÜST BAŞLIK ALANI (HEADER) ─── -->
          <div class="header-grid">
            <div class="header-col-left">
              ${logoHtml}
            </div>
            <div class="header-col-center">
              <img src="https://cdn.gib.gov.tr/gib_logo.png" style="height:48px; object-fit:contain;" alt="GİB" onerror="this.style.display='none'" />
              <div class="doc-title">${docTitleText}</div>
            </div>
            <div class="header-col-right">
              ${config.showQrCode ? `
                <div style="display:inline-block; text-align:center;">
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=85x85&amp;data=GIB_INVOICE" style="width:75px; height:75px;" alt="GİB Karekod" />
                </div>
              ` : ''}
              
              <div class="meta-box">
                <div class="meta-row">
                  <span class="meta-label">Özelleştirme No:</span>
                  <span class="meta-value"><xsl:value-of select="//*[local-name()='CustomizationID']"/></span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Senaryo:</span>
                  <span class="meta-value"><xsl:value-of select="//*[local-name()='ProfileID']"/></span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Fatura Tipi:</span>
                  <span class="meta-value"><xsl:value-of select="//*[local-name()='InvoiceTypeCode']"/></span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Fatura No:</span>
                  <span class="meta-value" style="color:${primaryColor}; font-size:12px;"><xsl:value-of select="//*[local-name()='ID']"/></span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Fatura Tarihi:</span>
                  <span class="meta-value"><xsl:value-of select="//*[local-name()='IssueDate']"/></span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Fatura Saati:</span>
                  <span class="meta-value"><xsl:value-of select="//*[local-name()='IssueTime']"/></span>
                </div>
                <div class="meta-row" style="font-size:9.5px; word-break:break-all;">
                  <span class="meta-label">ETTN:</span>
                  <span class="meta-value"><xsl:value-of select="//*[local-name()='UUID']"/></span>
                </div>
              </div>
            </div>
          </div>

          <!-- ─── TARAFLAR (SATICI & ALICI BİLGİLERİ) ─── -->
          <div class="parties-grid">
            <!-- SATICI (FİRMA) -->
            <div class="party-card">
              <div class="party-title">SATICI (DÜZENLEYEN)</div>
              <div class="party-name">
                <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='PartyName']/*[local-name()='Name'] | //*[local-name()='DespatchSupplierParty']//*[local-name()='PartyName']/*[local-name()='Name']"/>
              </div>
              <div class="party-info-row">
                <strong>Adres:</strong> <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='PostalAddress']/*[local-name()='StreetName']"/>
                <xsl:if test="//*[local-name()='AccountingSupplierParty']//*[local-name()='PostalAddress']/*[local-name()='CitySubdivisionName']">
                  , <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='PostalAddress']/*[local-name()='CitySubdivisionName']"/>
                </xsl:if>
                <xsl:if test="//*[local-name()='AccountingSupplierParty']//*[local-name()='PostalAddress']/*[local-name()='CityName']">
                  / <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='PostalAddress']/*[local-name()='CityName']"/>
                </xsl:if>
              </div>
              <div class="party-info-row">
                <strong>Vergi Dairesi:</strong> <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='PartyTaxScheme']/*[local-name()='TaxScheme']/*[local-name()='Name']"/>
              </div>
              <div class="party-info-row">
                <strong>VKN / TCKN:</strong> <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='PartyIdentification']/*[local-name()='ID']"/>
              </div>
              <div class="party-info-row">
                <strong>İletişim:</strong> <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='Contact']/*[local-name()='Telephone']"/> - <xsl:value-of select="//*[local-name()='AccountingSupplierParty']//*[local-name()='Contact']/*[local-name()='ElectronicMail']"/>
              </div>
            </div>

            <div class="party-card-gap"></div>

            <!-- ALICI (MÜŞTERİ) -->
            <div class="party-card">
              <div class="party-title">SAYIN (ALICI)</div>
              <div class="party-name">
                <xsl:value-of select="//*[local-name()='AccountingCustomerParty']//*[local-name()='PartyName']/*[local-name()='Name'] | //*[local-name()='DeliveryCustomerParty']//*[local-name()='PartyName']/*[local-name()='Name']"/>
              </div>
              <div class="party-info-row">
                <strong>Adres:</strong> <xsl:value-of select="//*[local-name()='AccountingCustomerParty']//*[local-name()='PostalAddress']/*[local-name()='StreetName']"/>
                <xsl:if test="//*[local-name()='AccountingCustomerParty']//*[local-name()='PostalAddress']/*[local-name()='CitySubdivisionName']">
                  , <xsl:value-of select="//*[local-name()='AccountingCustomerParty']//*[local-name()='PostalAddress']/*[local-name()='CitySubdivisionName']"/>
                </xsl:if>
                <xsl:if test="//*[local-name()='AccountingCustomerParty']//*[local-name()='PostalAddress']/*[local-name()='CityName']">
                  / <xsl:value-of select="//*[local-name()='AccountingCustomerParty']//*[local-name()='PostalAddress']/*[local-name()='CityName']"/>
                </xsl:if>
              </div>
              <div class="party-info-row">
                <strong>Vergi Dairesi:</strong> <xsl:value-of select="//*[local-name()='AccountingCustomerParty']//*[local-name()='PartyTaxScheme']/*[local-name()='TaxScheme']/*[local-name()='Name']"/>
              </div>
              <div class="party-info-row">
                <strong>VKN / TCKN:</strong> <xsl:value-of select="//*[local-name()='AccountingCustomerParty']//*[local-name()='PartyIdentification']/*[local-name()='ID']"/>
              </div>
              <div class="party-info-row">
                <strong>E-Posta:</strong> <xsl:value-of select="//*[local-name()='AccountingCustomerParty']//*[local-name()='Contact']/*[local-name()='ElectronicMail']"/>
              </div>
            </div>
          </div>

          <!-- ─── KALEMLER TABLOSU (MAL / HİZMET SATIRLARI) ─── -->
          <table class="lines-table">
            <thead>
              <tr>
                ${config.columns.showLineNumber ? '<th style="width:30px; text-align:center;">Sıra</th>' : ''}
                ${config.columns.showProductCode ? '<th style="width:70px;">Ürün Kodu</th>' : ''}
                ${config.columns.showBarcode ? '<th style="width:70px;">Barkod</th>' : ''}
                <th>Mal / Hizmet Açıklaması</th>
                ${config.columns.showQuantity ? '<th style="width:60px; text-align:right;">Miktar</th>' : ''}
                ${config.columns.showUnit ? '<th style="width:50px; text-align:center;">Birim</th>' : ''}
                ${config.columns.showUnitPrice ? '<th style="width:75px; text-align:right;">Birim Fiyat</th>' : ''}
                ${config.columns.showDiscount ? '<th style="width:60px; text-align:right;">İskonto</th>' : ''}
                ${config.columns.showVatRate ? '<th style="width:50px; text-align:center;">KDV %</th>' : ''}
                ${config.columns.showVatAmount ? '<th style="width:70px; text-align:right;">KDV Tutarı</th>' : ''}
                ${config.columns.showLineTotal ? '<th style="width:85px; text-align:right;">Satır Tutarı</th>' : ''}
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="//*[local-name()='InvoiceLine'] | //*[local-name()='DespatchLine']">
                <tr>
                  ${config.columns.showLineNumber ? '<td style="text-align:center;"><xsl:value-of select="*[local-name()=\'ID\']"/></td>' : ''}
                  ${config.columns.showProductCode ? '<td><xsl:value-of select="*[local-name()=\'Item\']/*[local-name()=\'SellersItemIdentification\']/*[local-name()=\'ID\']"/></td>' : ''}
                  ${config.columns.showBarcode ? '<td><xsl:value-of select="*[local-name()=\'Item\']/*[local-name()=\'StandardItemIdentification\']/*[local-name()=\'ID\']"/></td>' : ''}
                  <td>
                    <strong><xsl:value-of select="*[local-name()='Item']/*[local-name()='Name']"/></strong>
                    <xsl:if test="*[local-name()='Item']/*[local-name()='Description']">
                      <div style="font-size:10px; color:#64748b;"><xsl:value-of select="*[local-name()='Item']/*[local-name()='Description']"/></div>
                    </xsl:if>
                  </td>
                  ${config.columns.showQuantity ? '<td style="text-align:right;"><xsl:value-of select="*[local-name()=\'InvoicedQuantity\'] | *[local-name()=\'DeliveredQuantity\']"/></td>' : ''}
                  ${config.columns.showUnit ? '<td style="text-align:center;"><xsl:value-of select="*[local-name()=\'InvoicedQuantity\']/@unitCode | *[local-name()=\'DeliveredQuantity\']/@unitCode"/></td>' : ''}
                  ${config.columns.showUnitPrice ? '<td style="text-align:right;"><xsl:value-of select="*[local-name()=\'Price\']/*[local-name()=\'PriceAmount\']"/></td>' : ''}
                  ${config.columns.showDiscount ? '<td style="text-align:right;"><xsl:value-of select="*[local-name()=\'AllowanceCharge\']/*[local-name()=\'Amount\']"/></td>' : ''}
                  ${config.columns.showVatRate ? '<td style="text-align:center;">%<xsl:value-of select="*[local-name()=\'TaxTotal\']/*[local-name()=\'TaxSubtotal\']/*[local-name()=\'Percent\']"/></td>' : ''}
                  ${config.columns.showVatAmount ? '<td style="text-align:right;"><xsl:value-of select="*[local-name()=\'TaxTotal\']/*[local-name()=\'TaxAmount\']"/></td>' : ''}
                  ${config.columns.showLineTotal ? '<td style="text-align:right; font-weight:bold;"><xsl:value-of select="*[local-name()=\'LineExtensionAmount\']"/></td>' : ''}
                </tr>
              </xsl:for-each>
            </tbody>
          </table>

          <!-- ─── ALT ALANLAR & TOPLAMLAR ─── -->
          <div class="bottom-section">
            <div class="bottom-left">
              <!-- Notlar -->
              <xsl:if test="//*[local-name()='Note']">
                <div style="margin-top:10px; padding:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; font-size:10.5px;">
                  <strong style="color:${primaryColor};">Belge Notu:</strong>
                  <div><xsl:value-of select="//*[local-name()='Note']"/></div>
                </div>
              </xsl:if>
              
              ${notesSection}
              ${paymentTermsSection}
              ${bankAccountsTable}
              ${signatureHtml}
            </div>

            <div class="bottom-right">
              <table class="totals-table">
                <tbody>
                  <tr>
                    <td style="font-weight:bold; color:#64748b;">Mal / Hizmet Toplamı:</td>
                    <td style="text-align:right; font-weight:bold;">
                      <xsl:value-of select="//*[local-name()='LegalMonetaryTotal']/*[local-name()='LineExtensionAmount']"/> 
                      &#160;<xsl:value-of select="//*[local-name()='DocumentCurrencyCode']"/>
                    </td>
                  </tr>
                  <xsl:if test="//*[local-name()='LegalMonetaryTotal']/*[local-name()='AllowanceTotalAmount'] &gt; 0">
                    <tr>
                      <td style="color:#dc2626;">Toplam İskonto:</td>
                      <td style="text-align:right; color:#dc2626;">
                        -<xsl:value-of select="//*[local-name()='LegalMonetaryTotal']/*[local-name()='AllowanceTotalAmount']"/>
                        &#160;<xsl:value-of select="//*[local-name()='DocumentCurrencyCode']"/>
                      </td>
                    </tr>
                  </xsl:if>
                  <xsl:for-each select="//*[local-name()='TaxTotal']/*[local-name()='TaxSubtotal']">
                    <tr>
                      <td style="color:#64748b;">KDV Matrahı (%<xsl:value-of select="*[local-name()='Percent']"/>):</td>
                      <td style="text-align:right;"><xsl:value-of select="*[local-name()='TaxableAmount']"/></td>
                    </tr>
                    <tr>
                      <td style="font-weight:bold; color:#64748b;">Hesaplanan KDV (%<xsl:value-of select="*[local-name()='Percent']"/>):</td>
                      <td style="text-align:right; font-weight:bold;"><xsl:value-of select="*[local-name()='TaxAmount']"/></td>
                    </tr>
                  </xsl:for-each>
                  <tr class="grand-total">
                    <td>GENEL TOPLAM:</td>
                    <td style="text-align:right;">
                      <xsl:value-of select="//*[local-name()='LegalMonetaryTotal']/*[local-name()='PayableAmount']"/>
                      &#160;<xsl:value-of select="//*[local-name()='DocumentCurrencyCode']"/>
                    </td>
                  </tr>
                </tbody>
              </table>
              
              <div style="margin-top:8px; text-align:right; font-size:10px; color:#64748b;">
                Yalnız: <strong><xsl:value-of select="//*[local-name()='LegalMonetaryTotal']/*[local-name()='PayableAmount']"/> TRY</strong>
              </div>
            </div>
          </div>

          <!-- ─── FOOTER ─── -->
          <div style="margin-top:20px; border-top:1px solid #e2e8f0; padding-top:6px; font-size:9.5px; color:#94a3b8; display:flex; justify-content:space-between;">
            <div>${config.footerNote || 'Bu belge 213 sayılı V.U.K. hükümlerine göre elektronik ortamda düzenlenmiştir.'}</div>
            <div>Sayfa 1 / 1</div>
          </div>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;
  }

  /**
   * Validates that an XSLT string is well-formed XML with stylesheet elements
   */
  public static validateXslt(xsltContent: string): { valid: boolean; error?: string } {
    if (!xsltContent || typeof xsltContent !== 'string') {
      return { valid: false, error: 'XSLT içeriği boş olamaz.' };
    }

    const trimmed = xsltContent.trim();
    if (!trimmed.includes('<xsl:stylesheet') && !trimmed.includes('<stylesheet')) {
      return { valid: false, error: 'Geçersiz XSLT: <xsl:stylesheet> kök elemanı bulunamadı.' };
    }

    if (!trimmed.includes('<xsl:template') && !trimmed.includes('<template')) {
      return { valid: false, error: 'Geçersiz XSLT: En az bir <xsl:template> bloğu tanımlanmalıdır.' };
    }

    // Basic tag balancing check
    const openTags = (trimmed.match(/<xsl:[a-zA-Z0-9_-]+/g) || []).map(t => t.replace('<xsl:', ''));
    const selfClosing = (trimmed.match(/<xsl:[a-zA-Z0-9_-]+[^>]*\/>/g) || []).length;
    const closeTags = (trimmed.match(/<\/xsl:[a-zA-Z0-9_-]+>/g) || []).map(t => t.replace('</xsl:', '').replace('>', ''));

    if (openTags.length - selfClosing !== closeTags.length) {
      return {
        valid: false,
        error: `XSLT XML Syntax Hatası: Açılan ve kapatılan <xsl:...> etiketleri uyuşmuyor (${openTags.length - selfClosing} açılan vs ${closeTags.length} kapatılan).`,
      };
    }

    return { valid: true };
  }

  /**
   * Transforms XML data with given XSLT or built-in renderer
   */
  public static async transformXmlWithXslt(
    xmlContent: string,
    xsltContent: string,
    config?: DocumentDesignConfig
  ): Promise<string> {
    try {
      // Parse basic XML values to populate HTML preview template
      const getValue = (tagName: string, defaultVal: string = '') => {
        const regex = new RegExp(`<(?:cbc:|cac:|ext:|)[a-zA-Z0-9]*${tagName}[^>]*>([\\s\\S]*?)<\\/(?:cbc:|cac:|ext:|)[a-zA-Z0-9]*${tagName}>`, 'i');
        const m = xmlContent.match(regex);
        return m ? m[1].trim() : defaultVal;
      };

      const docNo = getValue('ID', 'ISB2026000001');
      const uuid = getValue('UUID', '4a81b21f-8294-4d81-9872-918239019283');
      const issueDate = getValue('IssueDate', new Date().toISOString().split('T')[0]);
      const issueTime = getValue('IssueTime', '14:30:00');
      const profileId = getValue('ProfileID', 'TEMELFATURA');
      const invoiceType = getValue('InvoiceTypeCode', 'SATIS');
      const currency = getValue('DocumentCurrencyCode', 'TRY');

      // 2026-09-12 (uydurma temizliği): Bu tasarım-önizleme varsayılanları sabit
      // GERÇEK bir mükellef kimliği taşıyordu (BEYOĞLU TEKNOLOJİ / VKN 1681136628 /
      // Adana adresi, karşı taraf için de MEGA TAŞ / VKN 6141904078). Şablon
      // tasarımcısı önizlemesinde başka firmaların kimliği "varsayılan" gibi
      // görünüyordu. Nötr yer tutucularla değiştirildi; gerçek değerler XML'den
      // okunur (getValue), bunlar yalnız etiket yoksa devreye girer.
      const supplierName = getValue('Name', 'FİRMA UNVANI');
      const supplierStreet = getValue('StreetName', 'Adres');
      const supplierCity = getValue('CityName', 'Şehir');
      const supplierVkn = getValue('ID', '0000000000');
      const supplierTaxOffice = getValue('TaxScheme', '—');

      // Customer
      const customerName = 'ALICI UNVANI';
      const customerStreet = 'Adres';
      const customerVkn = '0000000000';
      const customerTaxOffice = getValue('TaxScheme', '—');

      // Totals
      const lineExtAmount = getValue('LineExtensionAmount', '25.000,00');
      const payableAmount = getValue('PayableAmount', '30.000,00');
      const taxAmount = getValue('TaxAmount', '5.000,00');

      const pColor = config?.primaryColor || '#0284c7';
      const font = config?.fontFamily || 'Arial, sans-serif';

      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: ${font}; color: #1e293b; line-height: 1.35; padding: 20px; margin: 0; background: #fff; }
    .a4-wrapper { max-width: 800px; margin: 0 auto; background: #fff; }
    .top-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 2px solid ${pColor}; padding-bottom: 12px; }
    .doc-badge { font-size: 20px; font-weight: 900; color: ${pColor}; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .card { border: 1px solid #cbd5e1; border-top: 3px solid ${pColor}; border-radius: 4px; padding: 10px; background: #fff; font-size: 11.5px; }
    .card-title { font-weight: 800; color: ${pColor}; font-size: 11px; margin-bottom: 5px; text-transform: uppercase; }
    table.data-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
    table.data-table th { background: ${pColor}; color: #fff; padding: 6px 8px; text-align: left; font-weight: bold; }
    table.data-table td { padding: 6px 8px; border: 1px solid #e2e8f0; }
    table.data-table tr:nth-child(even) td { background: #f8fafc; }
    .totals-box { margin-left: auto; width: 280px; font-size: 11.5px; margin-top: 15px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #e2e8f0; }
    .grand-total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; font-weight: 900; color: ${pColor}; border-top: 2px solid ${pColor}; border-bottom: 2px solid ${pColor}; }
  </style>
</head>
<body>
  <div class="a4-wrapper">
    <div class="top-header">
      <div>
        ${config?.showLogo && config?.logoUrl ? `<img src="${config.logoUrl}" style="max-height:65px; object-fit:contain;" />` : `<div style="font-size:18px; font-weight:900; color:${pColor};">${supplierName}</div>`}
        <div style="font-size:11px; color:#64748b; margin-top:3px;">${supplierStreet} ${supplierCity}</div>
        <div style="font-size:11px; color:#64748b;">VKN: ${supplierVkn}</div>
      </div>
      <div style="text-align:right;">
        <div class="doc-badge">e-FATURA</div>
        <div style="font-size:12px; font-weight:bold; color:${pColor}; margin-top:4px;">No: ${docNo}</div>
        <div style="font-size:10.5px; color:#64748b;">Tarih: ${issueDate} ${issueTime}</div>
        <div style="font-size:9.5px; color:#94a3b8; font-family:monospace; margin-top:2px;">ETTN: ${uuid}</div>
        <div style="font-size:10px; font-weight:600; color:#334155; margin-top:2px;">Senaryo: ${profileId} (${invoiceType})</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">SATICI BİLGİLERİ</div>
        <div style="font-weight:bold; font-size:12px; margin-bottom:3px;">${supplierName}</div>
        <div>${supplierStreet} / ${supplierCity}</div>
        <div><strong>VKN:</strong> ${supplierVkn} · <strong>V.D.:</strong> ${supplierTaxOffice || '—'}</div>
      </div>

      <div class="card">
        <div class="card-title">ALICI (MÜŞTERİ) BİLGİLERİ</div>
        <div style="font-weight:bold; font-size:12px; margin-bottom:3px;">${customerName}</div>
        <div>${customerStreet}</div>
        <div><strong>VKN/TCKN:</strong> ${customerVkn} · <strong>V.D.:</strong> ${customerTaxOffice || '—'}</div>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:30px;">#</th>
          <th>Mal / Hizmet Açıklaması</th>
          <th style="width:60px; text-align:right;">Miktar</th>
          <th style="width:50px; text-align:center;">Birim</th>
          <th style="width:75px; text-align:right;">Birim Fiyat</th>
          <th style="width:50px; text-align:center;">KDV</th>
          <th style="width:85px; text-align:right;">Toplam Tutar</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td><strong>Yüksek Dayanımlı Hazır Beton C35/45</strong><div style="font-size:9.5px; color:#64748b;">TS EN 206 Standardı Uyumlu</div></td>
          <td style="text-align:right;">10</td>
          <td style="text-align:center;">m3</td>
          <td style="text-align:right;">2.500,00</td>
          <td style="text-align:center;">%20</td>
          <td style="text-align:right; font-weight:bold;">25.000,00 TRY</td>
        </tr>
      </tbody>
    </table>

    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:15px;">
      <div style="font-size:11px; color:#475569; max-width:450px;">
        ${config?.notes ? `<div><strong>Not:</strong> ${config.notes}</div>` : '<div><strong>Not:</strong> Mal teslim alınmış ve faturaya itiraz edilmemiştir.</div>'}
        ${config?.paymentTerms ? `<div style="margin-top:4px;"><strong>Vade:</strong> ${config.paymentTerms}</div>` : ''}
        ${config?.bankAccounts && config.bankAccounts.length > 0 ? `
          <div style="margin-top:8px; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
            <strong style="color:${pColor};">Banka Hesaplarımız:</strong>
            ${config.bankAccounts.map(b => `<div style="font-size:10px; font-family:monospace;">${b.bankName} (${b.currency}): ${b.iban}</div>`).join('')}
          </div>
        ` : ''}
      </div>

      <div class="totals-box">
        <div class="totals-row"><span>Ara Toplam:</span><span>${lineExtAmount} ${currency}</span></div>
        <div class="totals-row"><span>KDV Toplamı (%20):</span><span>${taxAmount} ${currency}</span></div>
        <div class="grand-total-row"><span>ÖDENECEK TUTAR:</span><span>${payableAmount} ${currency}</span></div>
      </div>
    </div>

    <div style="margin-top:25px; border-top:1px solid #e2e8f0; padding-top:6px; font-size:9px; color:#94a3b8; display:flex; justify-content:space-between;">
      <div>${config?.footerNote || 'Bu belge 213 sayılı V.U.K. hükümlerine göre düzenlenmiştir.'}</div>
      <div>İŞBEY ERP Belge Tasarım Motoru</div>
    </div>
  </div>
</body>
</html>`;
    } catch (err: any) {
      return `<div style="color:red; padding:20px;">Önizleme oluşturulamadı: ${err.message}</div>`;
    }
  }

  /**
   * Sample UBL-TR 2.1 XML for live testing and preview
   */
  public static getSampleXml(documentType: DocumentType, company?: any): string {
    const isDespatch = documentType === 'EIRSALIYE';
    const isEArsiv = documentType === 'EARSIV';
    const isSmm = documentType === 'ESMM';

    // 2026-09-12 (uydurma temizliği): Bu örnek XML (şablon tasarımcısı önizlemesi)
    // varsayılan olarak GERÇEK görünümlü bir mükellef kimliği taşıyordu
    // (BEYOĞLU TEKNOLOJİ / VKN 1681136628 / Adana adresi). Önizlemede başka bir
    // firmanın kimliğinin görünmesi yanıltıcıdır; nötr yer tutucu kullanılır.
    // Gerçek değerler çağıran taraftan (company) gelir.
    const companyName = company?.title || company?.name || 'FİRMA UNVANI';
    const companyVkn = company?.taxNumber || '0000000000';
    const companyTaxOffice = company?.taxOffice || 'Vergi Dairesi';
    const companyAddress = company?.address || 'Adres';
    const companyCity = company?.city || 'Şehir';

    if (isDespatch) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
                xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>IRS202600000012</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>8b92c10a-3456-4d81-9872-918239019999</cbc:UUID>
  <cbc:IssueDate>2026-08-28</cbc:IssueDate>
  <cbc:IssueTime>10:15:00</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  <cbc:Note>Şantiye teslimidir. İrsaliye muhteviyatı malzeme eksiksiz sevk edilmiştir.</cbc:Note>

  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">${companyVkn}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${companyName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${companyAddress}</cbc:StreetName>
        <cbc:CityName>${companyCity}</cbc:CityName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${companyTaxOffice}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:DespatchSupplierParty>

  <cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">0000000000</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>ALICI UNVANI</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Adres</cbc:StreetName>
        <cbc:CityName>Şehir</cbc:CityName>
      </cac:PostalAddress>
    </cac:Party>
  </cac:DeliveryCustomerParty>

  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cac:Delivery>
      <cbc:ActualDeliveryDate>2026-08-28</cbc:ActualDeliveryDate>
      <cbc:ActualDeliveryTime>11:00:00</cbc:ActualDeliveryTime>
      <cac:CarrierParty>
        <cac:PartyName><cbc:Name>ÖZEL NAKLİYAT TAŞIMACILIK</cbc:Name></cac:PartyName>
      </cac:CarrierParty>
      <cac:DeliveryAddress>
        <cbc:StreetName>Liman Şantiyesi Depo Alanı No:4</cbc:StreetName>
        <cbc:CityName>İSKENDERUN</cbc:CityName>
      </cac:DeliveryAddress>
    </cac:Delivery>
    <cac:TransportHandlingUnit>
      <cac:TransportMeans>
        <cac:RoadTransport>
          <cbc:LicensePlateID>01 ISB 1923</cbc:LicensePlateID>
        </cac:RoadTransport>
      </cac:TransportMeans>
    </cac:TransportHandlingUnit>
  </cac:Shipment>

  <cac:DespatchLine>
    <cbc:ID>1</cbc:ID>
    <cbc:DeliveredQuantity unitCode="C62">50</cbc:DeliveredQuantity>
    <cac:OrderLineReference><cbc:LineID>1</cbc:LineID></cac:OrderLineReference>
    <cac:Item>
      <cbc:Name>İnşaat Demiri Q14 Nervürlü</cbc:Name>
      <cbc:Description>12 Metre Boy Kesilmiş Çelik</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>DMR-Q14</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
  </cac:DespatchLine>
</DespatchAdvice>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${isEArsiv ? 'EARSIVFATURA' : isSmm ? 'SERBESTMESLEK' : 'TEMELFATURA'}</cbc:ProfileID>
  <cbc:ID>${isEArsiv ? 'EAR202600000045' : isSmm ? 'SMM202600000008' : 'EFT202600000189'}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>4a81b21f-8294-4d81-9872-918239019283</cbc:UUID>
  <cbc:IssueDate>2026-08-28</cbc:IssueDate>
  <cbc:IssueTime>14:30:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${isSmm ? 'SERBESTMESLEK' : 'SATIS'}</cbc:InvoiceTypeCode>
  <cbc:Note>İşbu fatura bedeli 15 gün içinde banka hesabımıza ödenecektir.</cbc:Note>
  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">${companyVkn}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${companyName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${companyAddress}</cbc:StreetName>
        <cbc:CityName>${companyCity}</cbc:CityName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${companyTaxOffice}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone></cbc:Telephone>
        <cbc:ElectronicMail></cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">0000000000</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>ALICI UNVANI</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Adres</cbc:StreetName>
        <cbc:CityName>Şehir</cbc:CityName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>Vergi Dairesi</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone></cbc:Telephone>
        <cbc:ElectronicMail></cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>

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

  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">25000.00</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="TRY">5000.00</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="TRY">25000.00</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="TRY">5000.00</cbc:TaxAmount>
        <cbc:Percent>20</cbc:Percent>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>Hazır Beton C35/45</cbc:Name>
      <cbc:Description>TS EN 206 Standardı Uyumlu Hazır Beton</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>BTN-C35</cbc:ID></cac:SellersItemIdentification>
      <cac:StandardItemIdentification><cbc:ID>8690001002003</cbc:ID></cac:StandardItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="TRY">2500.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
  }
}
