/** Nötr görünüm: yalnız UBL'deki alanlar; firma logosu, IBAN veya hesaplanan tutar eklenmez. */
export const standardDocumentXslt = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" encoding="UTF-8"/>
<xsl:decimal-format name="tr" decimal-separator="," grouping-separator="."/>
<xsl:template match="/">
<html><head><meta charset="UTF-8"/><style>
@page{size:A4;margin:12mm}body{font:13px Arial,sans-serif;color:#202938;background:white;margin:0;padding:24px}
main{max-width:800px;margin:auto}h1{font-size:24px}header{border-bottom:2px solid #202938;padding-bottom:14px}
.parties{display:flex;gap:24px;margin:20px 0}.party{flex:1}h2{font-size:13px;color:#586477}p{margin:6px 0}
table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:8px;border-bottom:1px solid #dce1e7;text-align:left}
th{background:#f2f4f7}.totals{margin-left:auto;width:320px}.totals td:last-child{text-align:right}.notes{white-space:pre-wrap}
</style></head><body><main><header>
<h1><xsl:choose><xsl:when test="local-name(/*)='DespatchAdvice'">İrsaliye</xsl:when><xsl:otherwise>Fatura</xsl:otherwise></xsl:choose></h1>
<p>Belge No: <strong><xsl:value-of select="/*/*[local-name()='ID']"/></strong></p>
<p>Tarih: <xsl:value-of select="/*/*[local-name()='IssueDate']"/></p>
<xsl:if test="/*/*[local-name()='UUID']"><p>ETTN: <xsl:value-of select="/*/*[local-name()='UUID']"/></p></xsl:if>
<xsl:if test="/*/*[local-name()='ProfileID']"><p><xsl:value-of select="/*/*[local-name()='ProfileID']"/></p></xsl:if>
</header><div class="parties">
<xsl:for-each select="/*/*[local-name()='AccountingSupplierParty' or local-name()='DespatchSupplierParty' or local-name()='AccountingCustomerParty' or local-name()='DeliveryCustomerParty']">
<section class="party"><h2><xsl:choose><xsl:when test="local-name()='AccountingSupplierParty' or local-name()='DespatchSupplierParty'">Gönderici / Satıcı</xsl:when><xsl:otherwise>Alıcı</xsl:otherwise></xsl:choose></h2>
<strong><xsl:value-of select=".//*[local-name()='PartyName']/*[local-name()='Name'] | .//*[local-name()='PartyLegalEntity']/*[local-name()='RegistrationName']"/></strong>
<p><xsl:value-of select=".//*[local-name()='PartyIdentification']/*[local-name()='ID']"/></p>
<p><xsl:value-of select=".//*[local-name()='PostalAddress']/*[local-name()='StreetName']"/><xsl:text> </xsl:text><xsl:value-of select=".//*[local-name()='PostalAddress']/*[local-name()='CityName']"/></p>
</section></xsl:for-each></div>
<table><thead><tr><th>Sıra</th><th>Ürün / Hizmet</th><th>Miktar</th><th>Birim</th><xsl:if test="local-name(/*)='Invoice'"><th>Birim Fiyat</th><th>KDV</th><th>Tutar</th></xsl:if></tr></thead><tbody>
<xsl:for-each select="/*/*[local-name()='InvoiceLine' or local-name()='DespatchLine']"><tr>
<td><xsl:value-of select="*[local-name()='ID']"/></td><td><xsl:value-of select="*[local-name()='Item']/*[local-name()='Name']"/></td>
<td><xsl:value-of select="*[local-name()='InvoicedQuantity' or local-name()='DeliveredQuantity']"/></td><td><xsl:value-of select="*[local-name()='InvoicedQuantity' or local-name()='DeliveredQuantity']/@unitCode"/></td>
<xsl:if test="local-name(/*)='Invoice'"><td><xsl:value-of select="*[local-name()='Price']/*[local-name()='PriceAmount']"/></td><td><xsl:value-of select="*[local-name()='TaxTotal']/*[local-name()='TaxAmount']"/></td><td><xsl:value-of select="*[local-name()='LineExtensionAmount']"/></td></xsl:if>
</tr></xsl:for-each></tbody></table>
<xsl:if test="/*/*[local-name()='LegalMonetaryTotal']"><table class="totals"><tbody>
<xsl:for-each select="/*/*[local-name()='LegalMonetaryTotal']/*"><tr><td><xsl:choose>
<xsl:when test="local-name()='LineExtensionAmount'">Mal / Hizmet Toplamı</xsl:when><xsl:when test="local-name()='AllowanceTotalAmount'">İskonto</xsl:when>
<xsl:when test="local-name()='TaxExclusiveAmount'">Vergi Hariç</xsl:when><xsl:when test="local-name()='TaxInclusiveAmount'">Vergi Dahil</xsl:when>
<xsl:when test="local-name()='PayableAmount'">Ödenecek Tutar</xsl:when><xsl:otherwise><xsl:value-of select="local-name()"/></xsl:otherwise>
</xsl:choose></td><td><xsl:value-of select="format-number(., '#.##0,00', 'tr')"/><xsl:text> </xsl:text><xsl:value-of select="@currencyID"/></td></tr></xsl:for-each>
</tbody></table></xsl:if>
<div class="notes"><xsl:for-each select="/*/*[local-name()='Note']"><p><xsl:value-of select="."/></p></xsl:for-each></div>
</main></body></html></xsl:template></xsl:stylesheet>`;
