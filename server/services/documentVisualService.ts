import { storage } from '../db/storage';
import type { Customer, DocumentType, Invoice, Tenant, Waybill } from '../db/schema';
import { DocumentStorageService } from './documentStorageService';
import { XsltEngineService } from './xsltEngineService';
import { normalizeXsltForBrowser } from './xsltCompatibility';
import { attrOf, decodeXmlText, findAll, findFirst, parseUblTree, textOf } from './ubl/ublTree';
import { standardDocumentXslt } from './ubl/standardDocumentXslt';
import { UblInvoiceBuilder } from './ubl/ublInvoiceBuilder';
import { ProviderFactory } from './providers/providerFactory';

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
    documentProfile: textOf(tree.root, 'ProfileID'), documentNumber: textOf(tree.root, 'ID'), adjustments: normalized.adjustments };
}

const escapeXml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const tag = (name: string, value: unknown, attrs = '') => value === undefined || value === null || value === ''
  ? '' : `<${name}${attrs}>${escapeXml(value)}</${name}>`;
const amount = (name: string, value: unknown, currency: string) =>
  tag(name, value, ` currencyID="${escapeXml(currency)}"`);

type DocumentParty = Pick<Customer, 'title' | 'taxNumber' | 'address' | 'city' | 'district' | 'taxOffice' | 'firstName' | 'lastName' | 'phone' | 'email' | 'website' | 'country' | 'postalCode'>;
type SavedInvoiceModel = { invoiceheader?: Record<string, unknown>; customer?: Record<string, unknown>; supplier?: { supplierParty?: Record<string, unknown> } };
const savedModel = (record: Invoice | Waybill) => (record as Invoice & { hizliModel?: SavedInvoiceModel }).hizliModel;
const textValue = (value: unknown) => typeof value === 'string' ? value : undefined;
const numericValue = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : undefined;
function savedParty(p: Record<string, unknown> | undefined): Partial<DocumentParty> {
  return Object.fromEntries(Object.entries({ title: textValue(p?.PartyName), taxNumber: textValue(p?.IdentificationID),
    address: textValue(p?.StreetName), city: textValue(p?.CityName), district: textValue(p?.CitySubdivisionName), taxOffice: textValue(p?.TaxSchemeName),
    firstName: textValue(p?.Person_FirstName), lastName: textValue(p?.Person_FamilyName), phone: textValue(p?.Telephone), email: textValue(p?.ElectronicMail),
    website: textValue(p?.WebsiteURI), country: textValue(p?.CountryName), postalCode: textValue(p?.PostalZone) }).filter(([, v]) => v !== undefined));
}

/** Cari kart bağlantısı olmayan eski belgelerde yalnız belgenin kendi alıcı kaydı okunur. */
function recordedCustomer(record: Invoice | Waybill): DocumentParty | null {
  const model = savedParty(savedModel(record)?.customer);
  const title = model.title || record.customerTitle;
  if (!title) return null;
  return { ...model, title, taxNumber: model.taxNumber || ('recipientTaxNumber' in record ? record.recipientTaxNumber : undefined) };
}

/** Kayıtlı satır tutarlarını oranlarına göre toplar; KDV oranından vergi hesaplamaz. */
function recordedTaxGroups(invoice: Invoice) {
  const groups = new Map<number, { rate: number; base: number; tax: number }>();
  let totalTax = 0;
  for (const item of invoice.items) {
    const rate = numericValue(item.vatRate), base = numericValue(item.lineTotal), tax = numericValue(item.vatAmount);
    if (rate === undefined || base === undefined || tax === undefined) return [];
    const group = groups.get(rate) || { rate, base: 0, tax: 0 };
    group.base += Math.round(base * 100); group.tax += Math.round(tax * 100);
    totalTax += Math.round(tax * 100); groups.set(rate, group);
  }
  // Eksik/tutarsız satır verisinden belge toplamı yerine yeni bir vergi tutarı türetilmez.
  if (numericValue(invoice.totalVat) === undefined || totalTax !== Math.round(invoice.totalVat * 100)) return [];
  return [...groups.values()].map(g => ({ ...g, base: g.base / 100, tax: g.tax / 100 }));
}

/** Kayıtlı belge alanlarını seri hale getirir; muhasebe verisi/kimlik üretimi yapmaz. */
function erpPreviewXml(record: Invoice | Waybill, tenant: Tenant, customer: DocumentParty, kind: 'INVOICE' | 'DESPATCH') {
  const invoice = kind === 'INVOICE' ? record as Invoice : null;
  const waybill = kind === 'DESPATCH' ? record as Waybill : null;
  const incoming = invoice?.type === 'PURCHASE' || waybill?.type === 'PURCHASE_DESPATCH';
  const header = savedModel(record)?.invoiceheader;
  const currency = invoice?.currency || textValue(header?.DocumentCurrencyCode) || 'TRY';
  const savedSupplier = savedParty(savedModel(record)?.supplier?.supplierParty);
  const companyParty = savedSupplier.taxNumber && savedSupplier.taxNumber === tenant.taxNumber ? { ...tenant, ...savedSupplier } : tenant;
  const groups = invoice ? recordedTaxGroups(invoice) : [];
  const verifiedUuid = invoice && (incoming || ['SENT', 'DELIVERED', 'ACCEPTED'].includes(invoice.eInvoiceStatus || ''))
    ? invoice.eInvoiceUUID : undefined;
  const party = (p: DocumentParty & { name?: string }, name: string) => `<cac:${name}><cac:Party>
    ${tag('cbc:WebsiteURI', p.website)}
    <cac:PartyIdentification>${tag('cbc:ID', p.taxNumber, ` schemeID="${p.taxNumber?.length === 11 ? 'TCKN' : 'VKN'}"`)}</cac:PartyIdentification>
    <cac:PartyName>${tag('cbc:Name', p.title || ('name' in p ? p.name : ''))}</cac:PartyName>
    <cac:PostalAddress>${tag('cbc:StreetName', p.address)}${tag('cbc:CitySubdivisionName', p.district)}${tag('cbc:CityName', p.city)}${tag('cbc:PostalZone', p.postalCode)}${p.country ? `<cac:Country>${tag('cbc:Name', p.country)}</cac:Country>` : ''}</cac:PostalAddress>
    <cac:PartyTaxScheme><cac:TaxScheme>${tag('cbc:Name', p.taxOffice)}</cac:TaxScheme></cac:PartyTaxScheme>
    <cac:Contact>${tag('cbc:Telephone', p.phone)}${tag('cbc:ElectronicMail', p.email)}</cac:Contact>
    ${p.firstName || p.lastName ? `<cac:Person>${tag('cbc:FirstName', p.firstName)}${tag('cbc:FamilyName', p.lastName)}</cac:Person>` : ''}
    </cac:Party></cac:${name}>`;
  const root = invoice ? 'Invoice' : 'DespatchAdvice';
  const supplier = invoice ? 'AccountingSupplierParty' : 'DespatchSupplierParty';
  const buyer = invoice ? 'AccountingCustomerParty' : 'DeliveryCustomerParty';
  const lines = record.items.map((item, i) => `<cac:${invoice ? 'InvoiceLine' : 'DespatchLine'}>
    ${tag('cbc:ID', i + 1)}${tag(invoice ? 'cbc:InvoicedQuantity' : 'cbc:DeliveredQuantity', item.quantity, ` unitCode="${escapeXml(UblInvoiceBuilder.mapUnitToUbl(item.unit))}"`)}
    ${invoice ? amount('cbc:LineExtensionAmount', item.lineTotal, currency) : ''}
    <cac:Item>${tag('cbc:Name', item.productName)}<cac:SellersItemIdentification>${tag('cbc:ID', item.productCode)}</cac:SellersItemIdentification></cac:Item>
    ${invoice ? `<cac:Price>${amount('cbc:PriceAmount', item.unitPrice, currency)}</cac:Price>
    <cac:TaxTotal>${amount('cbc:TaxAmount', 'vatAmount' in item ? item.vatAmount : undefined, currency)}<cac:TaxSubtotal>${amount('cbc:TaxableAmount', item.lineTotal, currency)}${amount('cbc:TaxAmount', 'vatAmount' in item ? item.vatAmount : undefined, currency)}${tag('cbc:Percent', item.vatRate)}<cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>` : ''}
    </cac:${invoice ? 'InvoiceLine' : 'DespatchLine'}>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
    <${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    ${tag('cbc:UBLVersionID', '2.1')}${tag('cbc:CustomizationID', 'TR1.2')}
    ${tag('cbc:ID', invoice?.invoiceNo || waybill?.waybillNo)}${tag('cbc:UUID', verifiedUuid)}
    ${tag('cbc:IssueDate', record.date)}${tag('cbc:IssueTime', textValue(header?.IssueTime))}${tag('cbc:ProfileID', invoice?.invoiceProfile || textValue(header?.ProfileID) || (waybill ? 'TEMELIRSALIYE' : undefined))}
    ${tag('cbc:InvoiceTypeCode', invoice?.invoiceCategory || textValue(header?.InvoiceTypeCode))}${tag('cbc:DocumentCurrencyCode', invoice ? currency : undefined)}
    ${tag('cbc:Note', 'ERP kaydından oluşturulan önizleme; arşivlenmiş UBL belgesi değildir.')}${tag('cbc:Note', record.notes)}
    ${party(incoming ? customer : companyParty, supplier)}${party(incoming ? companyParty : customer, buyer)}
    ${invoice ? `<cac:TaxTotal>${amount('cbc:TaxAmount', invoice.totalVat, currency)}${groups.map(g => `<cac:TaxSubtotal>${amount('cbc:TaxableAmount', g.base, currency)}${amount('cbc:TaxAmount', g.tax, currency)}${tag('cbc:Percent', g.rate)}<cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`).join('')}</cac:TaxTotal>
    <cac:LegalMonetaryTotal>${amount('cbc:LineExtensionAmount', invoice.subTotal, currency)}${amount('cbc:AllowanceTotalAmount', invoice.totalDiscount, currency)}${amount('cbc:TaxExclusiveAmount', numericValue(header?.TaxExclusiveAmount) ?? (groups.length ? groups.reduce((sum, g) => sum + Math.round(g.base * 100), 0) / 100 : undefined), currency)}${amount('cbc:TaxInclusiveAmount', invoice.grandTotal, currency)}${amount('cbc:ChargeTotalAmount', numericValue(header?.ChargeTotalAmount), currency)}${amount('cbc:PayableAmount', numericValue(header?.PayableAmount) ?? invoice.grandTotal, currency)}</cac:LegalMonetaryTotal>` : ''}
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
  const type = kind === 'DESPATCH' ? 'EIRSALIYE' : ((record as Invoice).invoiceProfile || textValue(savedModel(record)?.invoiceheader?.ProfileID)) === 'EARSIVFATURA' ? 'EARSIV' : 'EFATURA';
  const archived = db.electronicDocuments?.find(d => d.tenantId === tenantId && d.documentType === kind && d.internalDocumentId === id && d.xmlStoragePath);
  let xml = archived?.xmlStoragePath ? DocumentStorageService.readXml(tenantId, archived.xmlStoragePath) : null;
  let xmlSource: 'archive' | 'erp' = archived ? 'archive' : 'erp';
  if (archived && !xml) throw new DocumentVisualError('Arşivlenmiş XML dosyası okunamadı.', 404);
  const invoiceUuid = kind === 'INVOICE' ? (record as Invoice).eInvoiceUUID : undefined;
  if (!xml && invoiceUuid && record.tenantId === tenantId) {
    xml = DocumentStorageService.readOriginalInvoice(tenantId, invoiceUuid);
    if (xml) xmlSource = 'archive';
  }
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
    const party = customer ? { ...customer, ...savedParty(savedModel(record)?.customer) } : recordedCustomer(record);
    if (!tenant || !party) throw new DocumentVisualError('Belgenin firma veya kayıtlı alıcı bilgisi bulunamadı.');
    xml = erpPreviewXml(record, tenant, party, kind);
  }
  return { ...prepareDocumentVisual(xml, type, tenantId, incoming), xmlSource };
}

/** Kullanıcının sağladığı özgün UBL'yi mevcut gönderilmiş faturayla eşleştirir. */
export function archiveOriginalInvoice(id: string, tenantId: string, xml: unknown) {
  const db = storage.getState();
  const invoice = db.invoices.find(r => r.id === id && r.tenantId === tenantId && !r.isDeleted);
  if (!invoice) throw new DocumentVisualError('Fatura bulunamadı.', 404);
  if (invoice.type !== 'SALES' || !invoice.eInvoiceUUID || !['SENT', 'DELIVERED', 'ACCEPTED'].includes(invoice.eInvoiceStatus || '')) {
    throw new DocumentVisualError('Özgün XML yalnız gönderilmiş satış faturasına bağlanabilir.', 409);
  }
  if (typeof xml !== 'string' || Buffer.byteLength(xml, 'utf8') > 5 * 1024 * 1024) throw new DocumentVisualError('XML içeriği geçersiz veya çok büyük.');
  const tree = parseUblTree(xml);
  const supplier = findFirst(tree.root, 'AccountingSupplierParty');
  const supplierId = textOf(findFirst(supplier, 'PartyIdentification'), 'ID');
  const tenant = db.tenants.find(t => t.id === tenantId);
  const payable = textOf(findFirst(tree.root, 'LegalMonetaryTotal'), 'PayableAmount');
  if (!tree.ok || tree.root?.name !== 'Invoice' || !tenant?.taxNumber || supplierId !== tenant.taxNumber ||
    textOf(tree.root, 'UUID')?.toLowerCase() !== invoice.eInvoiceUUID.toLowerCase() || !textOf(tree.root, 'ID') ||
    textOf(tree.root, 'IssueDate') !== invoice.date.slice(0, 10) || payable === undefined ||
    !Number.isFinite(Number(payable)) || Math.round(Number(payable) * 100) !== Math.round(invoice.grandTotal * 100) ||
    textOf(tree.root, 'DocumentCurrencyCode') !== (invoice.currency || 'TRY')) {
    throw new DocumentVisualError('XML belgesinin ETTN, satıcı, tarih, para birimi veya toplamı faturayla eşleşmiyor.');
  }
  const profile = textOf(tree.root, 'ProfileID');
  const visual = prepareDocumentVisual(xml, profile === 'EARSIVFATURA' ? 'EARSIV' : 'EFATURA', tenantId, false);
  try { DocumentStorageService.saveOriginalInvoice(tenantId, invoice.eInvoiceUUID, xml); }
  catch (err: any) { throw new DocumentVisualError(err.message, 409); }
  return { success: true, documentNumber: textOf(tree.root, 'ID'), templateSource: visual.templateSource, xmlSource: 'archive' as const };
}

/** Gönderilmiş belgenin ERP taslağı yerine tenant'a ait özgün UBL içeriğini okur. */
export async function resolveErpDocumentVisual(id: string, tenantId: string, kind: 'INVOICE' | 'DESPATCH') {
  const visual = getErpDocumentVisual(id, tenantId, kind);
  if (visual.xmlSource === 'archive' || kind !== 'INVOICE') return visual;
  const record = storage.getState().invoices.find(r => r.id === id && r.tenantId === tenantId && !r.isDeleted);
  if (!record || record.type !== 'SALES' || !record.eInvoiceUUID ||
    !['SENT', 'DELIVERED', 'ACCEPTED'].includes(record.eInvoiceStatus || '')) return visual;
  const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);
  if (provider.providerId === 'MOCK') throw new DocumentVisualError('Gönderilmiş belgenin özgün içeriği test sağlayıcısından alınamaz.', 503);
  const profile = record.invoiceProfile || textValue(savedModel(record)?.invoiceheader?.ProfileID);
  // GetDocumentFile hem gelen hem giden belgeleri ETTN ile okur; tenant token'ını adapter seçer.
  const result = await provider.getIncomingDocumentContent(record.eInvoiceUUID, profile === 'EARSIVFATURA' ? 2 : 1, settings);
  if (!result.success || !result.content) throw new DocumentVisualError(result.message || 'Gönderilmiş faturanın özgün XML içeriği alınamadı.', 502);
  const tree = parseUblTree(result.content);
  const supplier = findFirst(tree.root, 'AccountingSupplierParty');
  const supplierId = textOf(findFirst(supplier, 'PartyIdentification'), 'ID');
  const tenant = storage.getState().tenants.find(t => t.id === tenantId);
  if (!tree.ok || !tree.root || textOf(tree.root, 'UUID')?.toLowerCase() !== record.eInvoiceUUID.toLowerCase() ||
    !tenant?.taxNumber || supplierId !== tenant.taxNumber) {
    throw new DocumentVisualError('Entegratör XML içeriği istenen faturanın ETTN veya satıcı bilgisiyle eşleşmiyor.', 502);
  }
  return { ...prepareDocumentVisual(result.content, profile === 'EARSIVFATURA' ? 'EARSIV' : 'EFATURA', tenantId, false), xmlSource: 'provider' as const };
}
