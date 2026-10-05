import { storage } from '../db/storage';
import type { Customer, DocumentType, Invoice, Tenant, Waybill } from '../db/schema';
import { DocumentStorageService } from './documentStorageService';
import { XsltEngineService } from './xsltEngineService';
import { normalizeXsltForBrowser } from './xsltCompatibility';
import { attrOf, decodeXmlText, findAll, findFirst, parseUblTree, textOf } from './ubl/ublTree';
import { standardDocumentXslt } from './ubl/standardDocumentXslt';
import { UblInvoiceBuilder } from './ubl/ublInvoiceBuilder';

export class DocumentVisualError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

/** XML'i ve XSLT'yi salt okunur hazırlar; dönüşüm tarayıcıda yapılır. */
export function prepareDocumentVisual(xml: string, type: DocumentType, tenantId: string, incoming: boolean) {
  const tree = parseUblTree(xml);
  if (!tree.ok || !tree.root) throw new DocumentVisualError(tree.error || 'Belge XML içeriği okunamadı.');
  if (tree.root.name !== (type === 'EIRSALIYE' ? 'DespatchAdvice' : 'Invoice')) {
    throw new DocumentVisualError('XML içeriği seçilen belge türüyle eşleşmiyor.');
  }
  let xslt = '';
  let templateSource: 'embedded' | 'company' | 'standard' = 'standard';
  for (const reference of findAll(tree.root, 'AdditionalDocumentReference')) {
    const binary = findFirst(reference, 'EmbeddedDocumentBinaryObject');
    if (!binary) continue;
    const filename = attrOf(binary, 'filename') || '';
    const mime = attrOf(binary, 'mimeCode') || '';
    if (!/\.xslt?$/i.test(filename) && !/xslt/i.test(mime) && !/xslt/i.test(textOf(reference, 'DocumentType') || textOf(reference, 'DocumentTypeCode') || '')) continue;
    const encoded = binary.text.replace(/\s/g, '');
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
      throw new DocumentVisualError('Belgeye gömülü XSLT içeriği geçerli base64 değil.');
    }
    xslt = Buffer.from(encoded, 'base64').toString('utf8').replace(/^\uFEFF/, '');
    templateSource = 'embedded';
    break;
  }
  // Gelen belgeye alıcı firmanın logo/IBAN/tasarımı eklenmez.
  if (!xslt && !incoming) {
    const template = storage.getState().documentTemplates?.find(t =>
      t.companyId === tenantId && t.documentType === type && t.isActive && t.isDefault);
    if (template) {
      xslt = template.xsltContent;
      if (!xslt.trim()) throw new DocumentVisualError('Firmanın varsayılan XSLT tasarımı boş.');
      templateSource = 'company';
    }
  }
  if (!xslt) xslt = standardDocumentXslt;
  const validation = XsltEngineService.validateXslt(xslt);
  if (!validation.valid) throw new DocumentVisualError(`XSLT görüntülenemedi: ${validation.error}`);
  const xsltTree = parseUblTree(xslt);
  // Alternatif namespace önekleri de denetlenir; dış kaynaklar yüklenmez.
  if (!xsltTree.ok || !xsltTree.root) throw new DocumentVisualError('XSLT içeriği ayrıştırılamadı.');
  const external = findAll(xsltTree.root, 'include').length || findAll(xsltTree.root, 'import').length;
  const resourceXPath = (node: typeof xsltTree.root): boolean => !!node && (
    Object.values(node.attrs).some(value => /\b(?:document|unparsed-text|collection)\s*\(/.test(decodeXmlText(value))) ||
    node.children.some(resourceXPath));
  if (external || resourceXPath(xsltTree.root)) throw new DocumentVisualError('XSLT dış kaynak çağrısı içeriyor; belge görüntülenemedi.');
  const normalized = normalizeXsltForBrowser(xslt);
  return { success: true, renderedBy: 'client' as const, xml, xslt: normalized.content, templateSource,
    adjustments: normalized.adjustments };
}

const escapeXml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const tag = (name: string, value: unknown, attrs = '') => value === undefined || value === null || value === ''
  ? '' : `<${name}${attrs}>${escapeXml(value)}</${name}>`;
const amount = (name: string, value: unknown, currency: string) =>
  tag(name, value, ` currencyID="${escapeXml(currency)}"`);

type DocumentParty = Pick<Customer, 'title' | 'taxNumber' | 'address' | 'city' | 'district' | 'taxOffice'>;

/** Cari kart bağlantısı olmayan eski belgelerde yalnız belgenin kendi alıcı kaydı okunur. */
function recordedCustomer(record: Invoice | Waybill): DocumentParty | null {
  const model = (record as Invoice & { hizliModel?: { customer?: Record<string, unknown> } }).hizliModel?.customer;
  const text = (value: unknown) => typeof value === 'string' ? value : undefined;
  const title = text(model?.PartyName) || record.customerTitle;
  if (!title) return null;
  return { title, taxNumber: text(model?.IdentificationID) || ('recipientTaxNumber' in record ? record.recipientTaxNumber : undefined),
    address: text(model?.StreetName), city: text(model?.CityName), district: text(model?.CitySubdivisionName), taxOffice: text(model?.TaxSchemeName) };
}

/** Yalnız kayıtlı alanları seri hale getirir; muhasebe hesaplaması/kimlik üretimi yapmaz. */
function erpPreviewXml(record: Invoice | Waybill, tenant: Tenant, customer: DocumentParty, kind: 'INVOICE' | 'DESPATCH') {
  const invoice = kind === 'INVOICE' ? record as Invoice : null;
  const waybill = kind === 'DESPATCH' ? record as Waybill : null;
  const incoming = invoice?.type === 'PURCHASE' || waybill?.type === 'PURCHASE_DESPATCH';
  const currency = invoice?.currency || 'TRY';
  const verifiedUuid = invoice && (incoming || ['SENT', 'DELIVERED', 'ACCEPTED'].includes(invoice.eInvoiceStatus || ''))
    ? invoice.eInvoiceUUID : undefined;
  const party = (p: Tenant | DocumentParty, name: string) => `<cac:${name}><cac:Party>
    <cac:PartyIdentification>${tag('cbc:ID', p.taxNumber, ` schemeID="${p.taxNumber?.length === 11 ? 'TCKN' : 'VKN'}"`)}</cac:PartyIdentification>
    <cac:PartyName>${tag('cbc:Name', p.title || ('name' in p ? p.name : ''))}</cac:PartyName>
    <cac:PostalAddress>${tag('cbc:StreetName', p.address)}${tag('cbc:CitySubdivisionName', p.district)}${tag('cbc:CityName', p.city)}</cac:PostalAddress>
    <cac:PartyTaxScheme><cac:TaxScheme>${tag('cbc:Name', p.taxOffice)}</cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party></cac:${name}>`;
  const root = invoice ? 'Invoice' : 'DespatchAdvice';
  const supplier = invoice ? 'AccountingSupplierParty' : 'DespatchSupplierParty';
  const buyer = invoice ? 'AccountingCustomerParty' : 'DeliveryCustomerParty';
  const lines = record.items.map((item, i) => `<cac:${invoice ? 'InvoiceLine' : 'DespatchLine'}>
    ${tag('cbc:ID', i + 1)}${tag(invoice ? 'cbc:InvoicedQuantity' : 'cbc:DeliveredQuantity', item.quantity, ` unitCode="${escapeXml(UblInvoiceBuilder.mapUnitToUbl(item.unit))}"`)}
    ${invoice ? amount('cbc:LineExtensionAmount', item.lineTotal, currency) : ''}
    <cac:Item>${tag('cbc:Name', item.productName)}<cac:SellersItemIdentification>${tag('cbc:ID', item.productCode)}</cac:SellersItemIdentification></cac:Item>
    ${invoice ? `<cac:Price>${amount('cbc:PriceAmount', item.unitPrice, currency)}</cac:Price>
    <cac:TaxTotal>${amount('cbc:TaxAmount', 'vatAmount' in item ? item.vatAmount : undefined, currency)}<cac:TaxSubtotal>${tag('cbc:Percent', item.vatRate)}</cac:TaxSubtotal></cac:TaxTotal>` : ''}
    </cac:${invoice ? 'InvoiceLine' : 'DespatchLine'}>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
    <${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    ${tag('cbc:ID', invoice?.invoiceNo || waybill?.waybillNo)}${tag('cbc:UUID', verifiedUuid)}
    ${tag('cbc:IssueDate', record.date)}${tag('cbc:ProfileID', invoice?.invoiceProfile || (waybill ? 'TEMELIRSALIYE' : undefined))}
    ${tag('cbc:InvoiceTypeCode', invoice?.invoiceCategory)}${tag('cbc:DocumentCurrencyCode', invoice ? currency : undefined)}
    ${tag('cbc:Note', 'ERP kaydından oluşturulan önizleme; arşivlenmiş UBL belgesi değildir.')}${tag('cbc:Note', record.notes)}
    ${party(incoming ? customer : tenant, supplier)}${party(incoming ? tenant : customer, buyer)}
    ${invoice ? `<cac:TaxTotal>${amount('cbc:TaxAmount', invoice.totalVat, currency)}</cac:TaxTotal>
    <cac:LegalMonetaryTotal>${amount('cbc:LineExtensionAmount', invoice.subTotal, currency)}${amount('cbc:AllowanceTotalAmount', invoice.totalDiscount, currency)}${amount('cbc:TaxInclusiveAmount', invoice.grandTotal, currency)}${amount('cbc:PayableAmount', invoice.grandTotal, currency)}</cac:LegalMonetaryTotal>` : ''}
    ${lines}</${root}>`;
}

export function getErpDocumentVisual(id: string, tenantId: string, kind: 'INVOICE' | 'DESPATCH') {
  const db = storage.getState();
  const owned = (r: { tenantId?: string }) => r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey');
  const record = kind === 'INVOICE' ? db.invoices.find(r => r.id === id && owned(r) && !r.isDeleted)
    : db.waybills.find(r => r.id === id && owned(r));
  if (!record) throw new DocumentVisualError('Belge bulunamadı.', 404);
  const tenant = db.tenants.find(t => t.id === tenantId);
  const customer = db.customers.find(c => c.id === record.customerId && owned(c));
  const incoming = record.type === 'PURCHASE' || record.type === 'PURCHASE_DESPATCH';
  const type = kind === 'DESPATCH' ? 'EIRSALIYE' : (record as Invoice).invoiceProfile === 'EARSIVFATURA' ? 'EARSIV' : 'EFATURA';
  const archived = db.electronicDocuments?.find(d => d.tenantId === tenantId && d.documentType === kind && d.internalDocumentId === id && d.xmlStoragePath);
  let xml = archived?.xmlStoragePath ? DocumentStorageService.readXml(tenantId, archived.xmlStoragePath) : null;
  let xmlSource: 'archive' | 'erp' = archived ? 'archive' : 'erp';
  if (archived && !xml) throw new DocumentVisualError('Arşivlenmiş XML dosyası okunamadı.', 404);
  if (!xml && kind === 'INVOICE' && incoming) {
    const uuid = (record as Invoice).eInvoiceUUID;
    const source = (db.incomingInvoices || []).find(i => i.tenantId === tenantId && (i.convertedPurchaseInvoiceId === id || (!!uuid && i.uuid === uuid)));
    if (source) {
      xml = source.xmlStoragePath ? DocumentStorageService.readXml(tenantId, source.xmlStoragePath) : null;
      if (!xml) throw new DocumentVisualError('Gelen faturanın arşivlenmiş XML dosyası okunamadı.', 404);
      xmlSource = 'archive';
    }
  }
  if (!xml) {
    const party = customer || recordedCustomer(record);
    if (!tenant || !party) throw new DocumentVisualError('Belgenin firma veya kayıtlı alıcı bilgisi bulunamadı.');
    xml = erpPreviewXml(record, tenant, party, kind);
  }
  return { ...prepareDocumentVisual(xml, type, tenantId, incoming), xmlSource };
}
