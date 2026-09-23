// Hızlı Bilişim / GİB E-Fatura & E-Arşiv Veri Tipleri ve Modelleri

export type HizliProfileId =
  | 'TICARIFATURA'
  | 'TEMELFATURA'
  | 'IHRACAT'
  | 'YOLCUBERABERFATURA'
  | 'KAMU'
  | 'HKS'
  | 'ILAC_TIBBICIHAZ'
  | 'YATIRIMTESVIK'
  | 'IDIS'
  | 'EARSIVFATURA';

export type HizliInvoiceTypeCode =
  | 'SATIS'
  | 'ISTISNA'
  | 'IADE'
  | 'TEVKIFAT'
  | 'TEVKIFATIADE'
  | 'OZELMATRAH'
  | 'IHRACKAYITLI'
  | 'SGK'
  | 'HKSSATIS'
  | 'HKSKOMISYONCU'
  | 'KOMISYONCU'
  | 'KONAKLAMAVERGISI'
  | 'TEKNOLOJIDESTEK'
  | 'YTBSATIS'
  | 'YTBISTISNA'
  | 'YTBIADE'
  | 'YTBTEVKIFAT'
  | 'YTBTEVKIFATIADE';

export interface HizliInvoiceHeader {
  SignedByUser: boolean;
  LocalReferenceId: string | null;
  SubeKodu: number;
  Prefix: string | null;
  SourceUrn: string | null;
  DestinationUrn: string | null;
  UpdateDocument: boolean;
  UUID: string;
  Invoice_ID: string;
  ProfileID: HizliProfileId;
  InvoiceTypeCode: HizliInvoiceTypeCode;
  IssueDate: string; // DD.MM.YYYY veya YYYY-MM-DD
  IssueTime: string; // HH:mm
  DocumentCurrencyCode: string; // TRY, USD, EUR...
  CalculationRate: number;
  XSLT_Adi: string;
  XSLT_Doc: string | null;
  LineExtensionAmount: number; // Mal/Hizmet Toplamı
  AllowanceTotalAmount: number; // Toplam İskonto
  TaxInclusiveAmount: number; // Vergiler Dahil Toplam
  ChargeTotalAmount: number;
  PayableRoundingAmount: number;
  PayableAmount: number; // Ödenecek Tutar
  Note: string | null;
  Notes: string[] | null;
  OrderReferenceId: string | null;
  OrderReferenceDate: string | null;
  EArchiveSendType: 'ELEKTRONIK' | 'KAGIT' | null;
  IsInternetSale: boolean;
  IsInternet_PaymentMeansCode?: string | null;
  IsInternet_PaymentDueDate?: string | null;
  IsInternet_InstructionNote?: string | null;
  IsInternet_WebsiteURI?: string | null;
  IsInternet_Delivery_TcknVkn?: string | null;
  IsInternet_Delivery_PartyName?: string | null;
  IsInternet_Delivery_FirstName?: string | null;
  IsInternet_Delivery_FamilyName?: string | null;
  IsInternet_ActualDespatchDate?: string | null;
  Sgk_AccountingCost?: string | null;
  Sgk_Period_StartDate?: string | null;
  Sgk_Period_EndDate?: string | null;
  Sgk_Mukellef_Kodu?: string | null;
  Sgk_Mukellef_Adi?: string | null;
  Sgk_DosyaNo?: string | null;
  Taxes?: HizliTaxSummary[] | null;
  Kdv_Statu: boolean; // false: Hariç, true: Dahil
  Manuel_Total: boolean;
  IsCashRegister?: boolean | null;
}

export interface HizliCustomer {
  IdentificationID: string; // VKN / TCKN
  customerIdentificationsOther?: any;
  PartyName: string;
  TaxSchemeName: string;
  StreetName: string;
  BuildingName?: string;
  BuildingNumber?: string;
  Room?: string;
  CitySubdivisionName: string; // İlçe
  CityName: string; // İl
  CountryName: string; // TURKIYE vb.
  Telephone: string;
  Telefax?: string;
  PostalZone: string;
  ElectronicMail: string;
  WebsiteURI?: string;
  Person_FirstName?: string;
  Person_FamilyName?: string;
  ManuelCityAndSubdivision?: boolean;
}

export interface HizliSupplierParty {
  IdentificationID: string;
  customerIdentificationsOther?: any[];
  PartyName: string;
  TaxSchemeName: string;
  StreetName: string;
  BuildingName?: string;
  BuildingNumber?: string;
  Room?: string;
  CitySubdivisionName: string;
  CityName: string;
  CountryName: string;
  Telephone: string;
  Telefax?: string;
  PostalZone: string;
  ElectronicMail: string;
  WebsiteURI?: string;
  Person_FirstName?: string;
  Person_FamilyName?: string;
  ManuelCityAndSubdivision?: boolean;
}

export interface HizliSupplier {
  supplierParty: HizliSupplierParty;
}

export interface HizliLineTax {
  Tax_Code: string; // 0015: KDV, 9015: KDV Tevkifatı, 0003: Stopaj vb.
  Tax_Name: string;
  Tax_Perc: number; // 20, 10, 1, 0 vb.
  Tax_Base: number;
  Tax_Amnt: number;
  Tax_Exem_Code?: string; // 350, 301 vb.
  Tax_Exem_Reason?: string;
  Tevkifat_Code?: string; // 601, 602, 603 vb.
  Tevkifat_Perc?: number; // 20, 30, 40, 50, 70, 90, 100
  Tevkifat_Amnt?: number;
}

export interface HizliInvoiceLine {
  ID: number;
  Item_Name: string;
  Item_ID_Seller?: string;
  Item_ID_Buyer?: string;
  Item_Description?: string;
  LineNote?: string;
  Item_Brand?: string;
  Item_Model?: string;
  Item_Classification?: string;
  Manufacturers_ItemIdentification?: string;
  Quantity_Amount: number;
  Quantity_Unit_User: string; // C62, NIU, KGM, LTR, MTR, PK vb.
  Price_Amount: number;
  AllowanceCalculatorType?: 'Percent' | 'Amount';
  Allowance_Percent: number;
  Allowance_Amount: number;
  Price_Total: number; // Mal/Hizmet Tutarı (İskonto düşülmüş matrah)
  lineTaxes: HizliLineTax[];
  itemInstances?: Array<{ SerialID?: string; ProductTraceID?: string }>;
}

export interface HizliDespatch {
  DespatchDocumentID: string;
  DespatchDocumentIssueDate: string;
}

export interface HizliPaymentMeans {
  PaymentMeansCode: string; // 10: Nakit, 42: Havale, 48: Kredi Kartı vb.
  PaymentDueDate: string;
  InstructionNote?: string;
  PaymentChannelCode?: string;
  PayeeFinancialAccount?: string;
  PayeeFinancialCurrencyCode?: string;
}

export interface HizliTaxSummary {
  Tax_Code: string;
  Tax_Name: string;
  Tax_Perc: number;
  Tax_Base: number;
  Tax_Amnt: number;
}

export interface HizliExtraField {
  DocumentTypeCode: string;
  DocumentType: string;
  DocumentDescription?: string;
  IssueDate?: string;
  ID?: string;
}

export interface HizliCustomField {
  SchemeID: string;
  Value: string;
}

export interface HizliInvoiceModel {
  invoiceheader: HizliInvoiceHeader;
  customer: HizliCustomer;
  supplier: HizliSupplier;
  customerAgent?: any;
  supplierAgent?: any;
  buyerCustomer?: any;
  taxRepresentative?: any;
  invoicePeriods?: any;
  despatchs: HizliDespatch[] | null;
  paymentMeans: HizliPaymentMeans | null;
  invoiceLines: HizliInvoiceLine[];
  additionalDocumentReferences?: any;
  billingReferences?: any;
  allowanceCharges?: any;
  contractDocumentReference?: any;
}

// ──────────────────────────────────────────────────────────────────────────
// HBT BAYİ YÖNETİMİ & E-DÖNÜŞÜM MERKEZİ TİPLERİ
// ──────────────────────────────────────────────────────────────────────────

export type DealerRole = 'SUPER_ADMIN' | 'BAYI_ADMIN' | 'BURO' | 'MUHASEBE' | 'SAHA' | 'MUSTERI_ADMIN' | 'MUSTERI_USER';

export interface DealerCustomer {
  id: string;
  externalId?: string;
  companyName: string;
  title: string;
  companyType: 'SAHIS' | 'LIMITED' | 'ANONIM' | 'DIGER';
  taxNumber: string;
  taxOffice: string;
  identityNumber?: string;
  mersisNo?: string;
  naceCode?: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  address: string;
  postalCode?: string;
  customerType: 'DIRECT' | 'DEALER_SUB' | 'INTEGRATION';
  status: 'ACTIVE' | 'PASSIVE' | 'PENDING_APPROVAL';
  services: {
    eFatura: boolean;
    eArsiv: boolean;
    eIrsaliye: boolean;
    eSmm: boolean;
    eMustahsil: boolean;
    eDefter: boolean;
    eDoviz: boolean;
    eKiymetliMaden: boolean;
  };
  credits: {
    total: number;
    used: number;
    remaining: number;
    warningLimit?: number;
  };
  portalCredentials?: {
    apiKey?: string;
    wsUsername?: string;
    gbUrn?: string;
    pkUrn?: string;
  };
  userCount: number;
  lastLoginAt?: string;
  lastTransactionAt?: string;
  activationToken?: string;
  activationExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreditTransactionType = 'PURCHASE' | 'GIFT' | 'TRANSFER' | 'REVERSAL' | 'USAGE';
export type CreditUnit = 'INVOICE_UNIT' | 'ARCHIVE_VAULT';

export interface CreditTransaction {
  id: string;
  customerId: string;
  customerTitle: string;
  targetCustomerId?: string;
  targetCustomerTitle?: string;
  type: CreditTransactionType;
  unit: CreditUnit;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  performedBy: string;
  performedByRole: string;
  createdAt: string;
}

export type EDocumentType =
  | 'EFATURA'
  | 'EARSIV'
  | 'EIRSALIYE'
  | 'ESMM'
  | 'EMUSTAHSIL'
  | 'EDOVIZ'
  | 'EKIYMETLIMADEN';

export type EDocumentStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'SIGNED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ERROR';

export interface EDocument {
  id: string;
  customerId: string;
  customerTitle: string;
  receiverTitle: string;
  receiverTaxNumber: string;
  documentType: EDocumentType;
  profileId: string;
  invoiceTypeCode: string;
  documentNo: string;
  prefix: string;
  uuid: string;
  issueDate: string;
  issueTime: string;
  currency: string;
  exchangeRate: number;
  lineExtensionAmount: number;
  taxTotal: number;
  payableAmount: number;
  status: EDocumentStatus;
  statusCode?: number;
  statusDescription?: string;
  gibTrackNo?: string;
  envelopeNo?: string;
  items: any[];
  taxes: any[];
  notes?: string;
  ublXml?: string;
  signedXml?: string;
  isTransferImport?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DefterRecord {
  id: string;
  customerId: string;
  customerTitle: string;
  taxNumber: string;
  year: number;
  month: number;
  yevmiyeStartNo: number;
  yevmiyeEndNo: number;
  yevmiyeLineCount: number;
  yevmiyeTotalDebit: number;
  yevmiyeTotalCredit: number;
  status: 'DRAFT' | 'PREPARING' | 'WAITING_SIGNATURE' | 'SIGNED' | 'SENDING' | 'SENT' | 'GIB_APPROVED' | 'ERROR';
  yevmiyeBeratStatus: string;
  kebirBeratStatus: string;
  gibEnvelopeId?: string;
  gibApprovedAt?: string;
  filePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeRecord {
  id: string;
  documentUuid: string;
  documentNo: string;
  documentType: EDocumentType;
  scenario: string;
  customerId: string;
  customerTitle: string;
  receiverTitle: string;
  disputeType: 'CANCEL' | 'OBJECTION' | 'RETURN';
  reason: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  requestedAt: string;
  processedAt?: string;
  processedBy?: string;
  gibResponseCode?: string;
  legalDeadlineDate?: string;
  createdAt: string;
}

export interface DealerCommissionReport {
  id: string;
  dealerId: string;
  periodYear: number;
  periodMonth: number;
  customerCount: number;
  totalDocumentCount: number;
  grossBillingAmount: number;
  commissionRate: number;
  commissionAmount: number;
  vatRate: number;
  vatAmount: number;
  netPayoutAmount: number;
  paymentStatus: 'UNPAID' | 'PAID' | 'PROCESSING';
  paidAt?: string;
  createdAt: string;
}

export interface DocumentPrefixConfig {
  id: string;
  documentType: EDocumentType;
  prefix: string;
  year: number;
  lastSequence: number;
  isDefault: boolean;
  isPriority: boolean;
  userSpecificId?: string;
  description?: string;
}

export interface TransferDocumentRecord {
  id: string;
  sourceIntegrator: string;
  documentType: EDocumentType;
  direction: 'INCOMING' | 'OUTGOING';
  uuid: string;
  documentNo: string;
  taxNumber: string;
  partyName: string;
  documentDate: string;
  totalAmount: number;
  xmlFileName: string;
  fileSize: number;
  status: 'IMPORTED' | 'DUPLICATE' | 'ERROR';
  errorMessage?: string;
  importedAt: string;
  importedBy: string;
}

export interface DealerAuditLog {
  id: string;
  userId: string;
  username: string;
  userRole: string;
  companyId?: string;
  action: string;
  module: string;
  documentNo?: string;
  ipAddress: string;
  device?: string;
  os?: string;
  browser?: string;
  details: string;
  previousData?: any;
  newData?: any;
  createdAt: string;
}

