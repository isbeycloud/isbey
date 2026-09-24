export const APP_VERSION = '2.0.0';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'COMPANY_ADMIN' | 'MUHASEBE' | 'SATIS' | 'KASA' | 'DEPO' | 'PERSONEL' | 'SAHA' | 'RAPOR';

export interface UserPermission {
  module: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPrint: boolean;
  canExport: boolean;
  canApprove?: boolean;
}

export interface User {
  roleSlugs?: string[];
  effectiveRoles?: UserRole[];
  permissionCodes?: string[];
  allowedMenuIds?: string[] | null;
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  companyId?: string;
  companyName?: string;
  allowedCompanyIds?: string[];
  department?: string;
  branch?: string;
  permissions?: UserPermission[];
  createdAt: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  lastLoginDevice?: string;
  passwordChangedAt?: string;
  failedLoginAttempts?: number;
}

export interface UserSession {
  id: string;
  userId: string;
  username: string;
  companyId: string;
  device: string;
  browser: string;
  ipAddress: string;
  lastActiveAt: string;
  isRevoked: boolean;
  createdAt: string;
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  userEmail: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface AuthorizedPerson {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
}

export interface CompanyLicense {
  startDate: string;
  endDate: string;
  isTrial: boolean;
  trialDays: number;
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED';
}

export interface CompanyLimits {
  maxUsers: number;
  maxBranches: number;
  maxWarehouses: number;
  maxInvoicesPerMonth: number;
  storageLimitMb: number;
  storageUsedMb: number;
}

export interface CompanyBranch {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  phone?: string;
  address?: string;
  city?: string;
  managerName?: string;
}

export interface CompanyService {
  serviceCode: string;
  serviceName: string;
  startDate: string;
  endDate: string;
  limit?: number;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  notes?: string;
}

export interface ServiceCatalogItem {
  id: string;
  code: string;
  name: string;
  description: string;
  category: 'CORE' | 'FINANCE' | 'EDOCUMENT' | 'OPERATIONS' | 'ADVANCED';
  isActive: boolean;
  price: number;
  billingPeriod: 'MONTHLY' | 'YEARLY' | 'ONE_TIME';
  sortOrder: number;
}

export interface PlanCatalogItem {
  id: string;
  code: TenantPlan;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  maxUsers: number;
  maxBranches: number;
  maxWarehouses: number;
  maxInvoicesPerMonth: number;
  storageLimitMb: number;
  includedServices: string[];
  isPopular?: boolean;
}

export type TenantPlan = 'FREE' | 'STARTER' | 'PRO' | 'PROFESSIONAL' | 'ENTERPRISE';
export type TenantStatus = 'ACTIVE' | 'INACTIVE' | 'TRIAL' | 'SUSPENDED' | 'EXPIRED';
export type TenantModule =
  | 'POS'
  | 'STOK'
  | 'CARI'
  | 'FATURA'
  | 'TEKLIF_SIPARIS'
  | 'IRSALIYE'
  | 'BANKA'
  | 'KASA'
  | 'CEK_SENET'
  | 'E_FATURA'
  | 'PERSONEL'
  | 'RAPORLAR'
  | 'AI_ASISTAN'
  | 'FORM_DESIGNER';

export interface TenantStats {
  totalCustomers: number;
  totalProducts: number;
  totalInvoices: number;
  totalRevenue: number;
  monthlyInvoiceCount: number;
  userCount?: number;
  activeServicesCount?: number;
  warehouseCount?: number;
  branchCount?: number;
  lastLoginAt?: string;
}

export interface Tenant {
  id: string;
  companyCode?: string;
  name: string;
  slug: string;
  title: string;
  taxNumber: string;
  taxOffice: string;
  identityNumber?: string;
  mersisNo?: string;
  email: string;
  phone: string;
  gsm?: string;
  website?: string;
  address?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  logoUrl?: string;
  plan: TenantPlan;
  status: TenantStatus;
  maxUsers: number;
  currentUsers: number;
  maxInvoicesPerMonth: number;
  eInvoiceCredits: number;
  storageLimitMb: number;
  storageUsedMb: number;
  activeModules: TenantModule[];
  activeServices?: CompanyService[];
  license?: CompanyLicense;
  limits?: CompanyLimits;
  branches?: CompanyBranch[];
  authorizedPerson?: AuthorizedPerson;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  stats?: TenantStats;
  isArchived?: boolean;
  deletedAt?: string;
  externalCustomerId?: string;
  externalProvider?: string;
  syncedAt?: string;
  edonusumConfig?: {
    apiKey?: string;
    username?: string;
    gbUrn?: string;
    pkUrn?: string;
    isTestMode?: boolean;
    autoCheckGibUser?: boolean;
    defaultProfile?: string;
    updatedAt?: string;
  };
}

export interface Company {
  id: string;
  companyCode?: string;
  name: string;
  title: string;
  taxNumber: string;
  taxOffice: string;
  identityNumber?: string;
  mersisNo?: string;
  phone: string;
  gsm?: string;
  email: string;
  website?: string;
  address: string;
  city: string;
  district: string;
  postalCode?: string;
  currency: string;
  logoUrl?: string;
  costingMethod: 'FIFO' | 'AVG_COST' | 'LAST_PRICE';
  fiscalYear: number;
  authorizedPerson?: AuthorizedPerson;
  plan?: TenantPlan;
  status?: TenantStatus;
  license?: CompanyLicense;
  limits?: CompanyLimits;
  branches?: CompanyBranch[];
  activeServices?: CompanyService[];
  documentSettings?: any;
}

export type CustomerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

export interface Customer {
  id: string;
  code: string;
  title: string;
  contactName?: string;
  taxNumber?: string;
  taxOffice?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  iban?: string;
  type: CustomerType;
  riskLimit: number;
  maturityDays: number;
  notes?: string;
  balance: number;
  totalDebit: number;
  totalCredit: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductGroup {
  id: string;
  name: string;
  code: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  address?: string;
}

export interface Product {
  id: string;
  barcode: string;
  code: string;
  name: string;
  groupId: string;
  groupName?: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  vatRate: number;
  criticalStock: number;
  currentStock: number;
  warehouseId: string;
  warehouseName?: string;
  description?: string;
  imageUrl?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseName?: string;
  documentNo: string;
  documentType: 'INVOICE' | 'WAYBILL' | 'TRANSFER' | 'ADJUSTMENT';
  movementType: 'PURCHASE' | 'SALE' | 'PURCHASE_RETURN' | 'SALE_RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'COUNT_ADJUSTMENT';
  quantity: number;
  direction: 'IN' | 'OUT';
  unitPrice: number;
  totalAmount: number;
  date: string;
  notes?: string;
  userId: string;
  createdAt: string;
}

export type InvoiceProfile = 'TICARIFATURA' | 'TEMELFATURA' | 'EARSIVFATURA' | 'IHRACAT' | 'KAMU' | 'HAL';
export type InvoiceCategory = 'SATIS' | 'IADE' | 'TEVKIFAT' | 'ISTISNA' | 'OZELMATRAH' | 'IHRACKAYITLI';

export interface InvoiceItem {
  id?: string;
  invoiceId?: string;
  productId: string;
  productCode: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount1: number;
  discount2: number;
  discountAmount: number;
  vatRate: number;
  vatAmount: number;
  vatIncluded: boolean;
  withholdingCode?: string;
  withholdingRate?: number; // e.g. 0.2, 0.5, 0.7, 0.9 (2/10, 5/10, 7/10, 9/10)
  withholdingAmount?: number;
  exemptionReasonCode?: string; // e.g. 301, 350
  gtipCode?: string;
  lineTotal: number;
  lineGrandTotal: number;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  type: 'SALES' | 'PURCHASE' | 'RETAIL_POS' | 'PROFORMA' | 'WAYBILL';
  status: 'ACTIVE' | 'CANCELLED';
  customerId: string;
  customerCode: string;
  customerTitle: string;
  date: string;
  maturityDate: string;
  subTotal: number;
  totalDiscount: number;
  totalVat: number;
  totalWithholding?: number;
  payableVat?: number;
  grandTotal: number;
  paidAmount: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  paymentType?: 'CASH' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'OPEN_ACCOUNT' | 'SPLIT';
  cashRegisterId?: string;
  bankAccountId?: string;
  warehouseId: string;
  notes?: string;
  items: InvoiceItem[];
  currency?: 'TRY' | 'USD' | 'EUR' | 'GBP';
  exchangeRate?: number;
  invoiceProfile?: InvoiceProfile;
  invoiceCategory?: InvoiceCategory;
  withholdingCode?: string;
  withholdingRate?: number;
  withholdingAmount?: number;
  exemptionCode?: string;
  recipientTaxNumber?: string;
  recipientAliasGB?: string;
  senderAliasPK?: string;
  sourceQuoteId?: string;
  sourceQuoteNo?: string;
  sourceOrderId?: string;
  sourceOrderNo?: string;
  sourceWaybillId?: string;
  sourceWaybillNo?: string;
  eInvoiceStatus?: 'DRAFT' | 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'ERROR' | string;
  eInvoiceUUID?: string;
  gibStatusCode?: number | string;
  gibStatusDescription?: string;
  gibEnvelopeId?: string;
  commercialResponseStatus?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  commercialResponseDate?: string;
  isIncomingEInvoice?: boolean;
  incomingSupplierVkn?: string;
  userId: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaxpayerInfo {
  vkn: string;
  title: string;
  isEInvoiceUser: boolean;
  isEArchiveUser: boolean;
  firstRegistrationDate?: string;
  aliases: Array<{
    alias: string;
    type: 'GB' | 'PK';
    creationDate: string;
    deletionDate?: string;
  }>;
}

export interface CurrentTransaction {
  id: string;
  customerId: string;
  customerCode: string;
  customerTitle: string;
  documentNo: string;
  documentType: string;
  date: string;
  maturityDate?: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
  paymentMethod?: string;
  relatedInvoiceId?: string;
  runningBalance?: number;
  userId: string;
  createdAt: string;
}

export interface CashRegister {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  balance: number;
  currency: string;
  description?: string;
  active: boolean;
}

export interface CashTransaction {
  id: string;
  cashRegisterId: string;
  cashRegisterName: string;
  documentNo: string;
  type: string;
  direction: 'IN' | 'OUT';
  amount: number;
  date: string;
  customerId?: string;
  customerTitle?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  category?: string;
  description: string;
  userId: string;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNo: string;
  branchName: string;
  iban: string;
  currency: string;
  balance: number;
  isDefault: boolean;
  active: boolean;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  bankAccountName: string;
  documentNo: string;
  type: string;
  direction: 'IN' | 'OUT';
  amount: number;
  date: string;
  customerId?: string;
  customerTitle?: string;
  description: string;
  userId: string;
  createdAt: string;
}

export interface CheckNote {
  id: string;
  type: 'INCOMING_CHECK' | 'OUTGOING_CHECK' | 'INCOMING_PROMISSORY' | 'OUTGOING_PROMISSORY';
  documentNo: string;
  bankName?: string;
  branchName?: string;
  accountNo?: string;
  checkNumber?: string;
  drawer: string;
  amount: number;
  issueDate: string;
  maturityDate: string;
  customerId: string;
  customerTitle: string;
  status: CheckStatus;
  statusChangeDate?: string;
  endorsedToCustomerId?: string;
  endorsedToCustomerTitle?: string;
  description?: string;
  userId: string;
  createdAt: string;
}

export type CheckType = 'CUSTOMER_CHECK' | 'CUSTOMER_PROMISSORY' | 'OWN_CHECK' | 'OWN_PROMISSORY';
export type CheckStatus = 'IN_PORTFOLIO' | 'COLLECTED' | 'PAID' | 'ENDORSED' | 'BOUNCED' | 'CANCELLED';

export interface Employee {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  email?: string;
  department: string;
  title: string;
  salary: number;
  commissionRate: number;
  totalSales: number;
  totalCommission: number;
  totalPaid: number;
  balance: number;
  active: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  companyId?: string;
  companyName?: string;
  action: string;
  module: string;
  documentNo?: string;
  ipAddress: string;
  details: string;
  timestamp: string;
}

export interface SystemNotification {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface QuoteItem {
  id?: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount1: number;
  discount2: number;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
  lineGrandTotal: number;
}

export type QuoteStatus = 'DRAFT' | 'SENT' | 'WAITING_APPROVAL' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';

export interface Quote {
  id: string;
  quoteNo: string;
  type: 'SALES_QUOTE' | 'PURCHASE_QUOTE';
  customerId: string;
  customerCode: string;
  customerTitle: string;
  date: string;
  validUntil: string;
  subTotal: number;
  totalDiscount: number;
  totalVat: number;
  grandTotal: number;
  status: QuoteStatus;
  termsAndConditions?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
  convertedInvoiceId?: string;
  convertedInvoiceNo?: string;
  convertedOrderId?: string;
  convertedOrderNo?: string;
  items: QuoteItem[];
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'PARTIALLY_SHIPPED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  id?: string;
  productId: string;
  productCode: string;
  productName: string;
  orderedQuantity: number;
  shippedQuantity: number;
  remainingQuantity: number;
  unit: string;
  unitPrice: number;
  discount1: number;
  discount2: number;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
  lineGrandTotal: number;
}

export interface Order {
  id: string;
  orderNo: string;
  type: 'SALES_ORDER' | 'PURCHASE_ORDER';
  customerId: string;
  customerCode: string;
  customerTitle: string;
  date: string;
  deliveryDate: string;
  subTotal: number;
  totalDiscount: number;
  totalVat: number;
  grandTotal: number;
  status: OrderStatus;
  warehouseId: string;
  sourceQuoteId?: string;
  sourceQuoteNo?: string;
  convertedInvoiceId?: string;
  convertedInvoiceNo?: string;
  notes?: string;
  items: OrderItem[];
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type WaybillType = 'SALES_DESPATCH' | 'PURCHASE_DESPATCH';
export type WaybillStatus = 'PENDING' | 'INVOICED' | 'CANCELLED';

export interface WaybillItem {
  id?: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount1: number;
  discount2: number;
  vatRate: number;
  lineTotal: number;
  lineGrandTotal: number;
}

export interface Waybill {
  id: string;
  waybillNo: string;
  type: WaybillType;
  customerId: string;
  customerCode: string;
  customerTitle: string;
  date: string;
  shipmentDate: string;
  warehouseId: string;
  status: WaybillStatus;
  carrierTitle?: string;
  plateNumber?: string;
  driverName?: string;
  invoiceId?: string;
  invoiceNo?: string;
  sourceOrderId?: string;
  sourceOrderNo?: string;
  notes?: string;
  items: WaybillItem[];
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  code: string;
  description?: string;
  color?: string;
}

export interface Expense {
  id: string;
  documentNo: string;
  expenseCategoryId: string;
  expenseCategoryName: string;
  costCenterId?: string;
  costCenterName?: string;
  title: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  date: string;
  paymentMethod: 'CASH' | 'BANK' | 'OTHER';
  cashRegisterId?: string;
  cashRegisterName?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  supplierId?: string;
  supplierTitle?: string;
  receiptNo?: string;
  notes?: string;
  userId: string;
  createdAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface CostCenter {
  id: string;
  name: string;
  code: string;
  type: 'BRANCH' | 'DEPARTMENT' | 'PROJECT';
  description?: string;
  parentId?: string;
  active: boolean;
  createdAt: string;
}

export type InvoiceTemplateType = 'classic' | 'modern' | 'corporate' | 'compact' | 'professional';

export interface DocumentTemplateSettings {
  invoiceTemplate: InvoiceTemplateType;
  primaryColor: string;
  accentColor?: string;
  fontFamily?: string;
  fontSize?: 'sm' | 'md' | 'lg';
  showLogo?: boolean;
  showQrCode: boolean;
  showBankAccounts: boolean;
  selectedBankIds?: string[];
  showStampAndSignature: boolean;
  headerNote?: string;
  footerNotes?: string;
}

export type SearchResultType =
  | 'COMPANY'
  | 'USER'
  | 'SERVICE'
  | 'HIZLI_CUSTOMER'
  | 'CUSTOMER'
  | 'PRODUCT'
  | 'INVOICE'
  | 'WAYBILL'
  | 'QUOTE'
  | 'ORDER'
  | 'CASH'
  | 'BANK'
  | 'EXPENSE'
  | 'MODULE';

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  code: string;
  title: string;
  subtitle: string;
  metadata?: {
    badge?: string;
    balance?: number;
    phone?: string;
    taxNumber?: string;
    stock?: number;
    price?: number;
    unit?: string;
    barcode?: string;
    amount?: number;
    date?: string;
    status?: string;
    view?: string;
    tab?: string;
    action?: () => void;
  };
  score: number;
}

export interface GlobalSearchCategory {
  key: SearchResultType;
  title: string;
  count: number;
  items: SearchResultItem[];
}

// ──────────────────────────────────────────────────────────────────────────
// Hızlı Bilişim Müşteri / Üye Entegrasyonu Tipleri
// ──────────────────────────────────────────────────────────────────────────

export type ExternalCustomerStatus = 'NEW' | 'IMPORTED' | 'USER_CREATED' | 'MATCHED' | 'ERROR';

export interface ExternalCustomer {
  id: string;
  externalId: string;
  provider: 'HIZLI_BILISIM';
  companyName: string;
  title: string;
  taxNumber: string;
  taxOffice: string;
  contactName: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  district?: string;
  status: ExternalCustomerStatus;
  isbeyCompanyId?: string;
  isbeyCompanyCode?: string;
  isbeyUserId?: string;
  isbeyUsername?: string;
  activationToken?: string;
  activationExpiresAt?: string;
  isActivated?: boolean;
  registeredAt: string;
  syncedAt: string;
  lastError?: string;
}

export type SyncActionType =
  | 'SYNC_STARTED'
  | 'CUSTOMER_IMPORTED'
  | 'CUSTOMER_UPDATED'
  | 'CUSTOMER_MATCHED'
  | 'COMPANY_CREATED'
  | 'USER_CREATED'
  | 'INVITATION_SENT'
  | 'DUPLICATE_DETECTED'
  | 'SYNC_ERROR';

export interface IntegrationSyncLog {
  id: string;
  provider: string;
  action: SyncActionType;
  userId?: string;
  username?: string;
  companyId?: string;
  externalCustomerId?: string;
  customerName?: string;
  details: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  createdAt: string;
}

export interface HizliBilisimSettings {
  apiUrl?: string;
  apiKey?: string;
  apiUsername?: string;
  isTestMode: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  autoCreateCompany: boolean;
  defaultPlan: TenantPlan;
  sendActivationEmail: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  totalSynced?: number;
  totalConverted?: number;
}

export type DocumentType = 'EFATURA' | 'EARSIV' | 'EIRSALIYE' | 'ESMM';

export interface DocumentDesignConfig {
  theme: 'CLASSIC' | 'MODERN' | 'CORPORATE' | 'COMPACT' | 'PROFESSIONAL';
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  fontSize: number;
  logoUrl?: string;
  logoWidth: number;
  logoHeight: number;
  showLogo: boolean;
  signatureUrl?: string;
  signatureWidth: number;
  signatureHeight: number;
  showSignature: boolean;
  showQrCode: boolean;
  showBarcode: boolean;
  bankAccounts: Array<{
    bankName: string;
    currency: string;
    iban: string;
    accountNo?: string;
    branchName?: string;
  }>;
  columns: {
    showLineNumber: boolean;
    showProductCode: boolean;
    showBarcode: boolean;
    showDescription: boolean;
    showQuantity: boolean;
    showUnit: boolean;
    showUnitPrice: boolean;
    showDiscount: boolean;
    showVatRate: boolean;
    showVatAmount: boolean;
    showWithholding?: boolean;
    showLineTotal: boolean;
  };
  notes?: string;
  paymentTerms?: string;
  footerNote?: string;
  internetSalesInfo?: {
    showSalesUrl: boolean;
    showPaymentType: boolean;
    showCarrierInfo: boolean;
  };
}

export interface DocumentTemplate {
  id: string;
  companyId: string;
  documentType: DocumentType;
  name: string;
  description?: string;
  theme: 'CLASSIC' | 'MODERN' | 'CORPORATE' | 'COMPACT' | 'PROFESSIONAL';
  config: DocumentDesignConfig;
  xsltContent: string;
  xsltPath: string;
  previewHtml?: string;
  version: number;
  isActive: boolean;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentTemplateVersion {
  id: string;
  templateId: string;
  companyId: string;
  version: number;
  xsltContent: string;
  config: DocumentDesignConfig;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface SupportTicketResponse {
  id: string;
  userId: string;
  userName: string;
  isAdmin: boolean;
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNo: string;
  tenantId?: string;
  companyName?: string;
  userId: string;
  userName: string;
  userEmail: string;
  category: 'FATURA' | 'EDONUSUM' | 'MUHASEBE' | 'ENTEGRASYON' | 'ODEME' | 'DIGER';
  priority: 'DUSUK' | 'NORMAL' | 'YUKSEK' | 'ACIL';
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  responses?: SupportTicketResponse[];
}

export interface TenantUser {
  id: string;
  tenantId: string;
  userId: string;
  roleId?: string;
  roleSlug: 'platform_admin' | 'company_admin' | 'accountant' | 'employee' | 'viewer' | string;
  isOwner: boolean;
  status: 'active' | 'passive' | 'pending';
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Role {
  id: string;
  tenantId?: string | null;
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  code: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permissionCode: string;
}

export interface Invitation {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  fullName?: string;
  roleSlug: string;
  tokenHash: string;
  tokenPlain?: string;
  expiresAt: string;
  acceptedAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface ImpersonationSession {
  id: string;
  originalUserId: string;
  originalUserName: string;
  impersonatedTenantId: string;
  impersonatedTenantName: string;
  token: string;
  startedAt: string;
  endedAt?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 5: SAAS ABONELİK + PAKET + KONTÖR + ONLİNE ÖDEME + BAYİ TİPLERİ
// ──────────────────────────────────────────────────────────────────────────

export interface PlanFeature {
  id: string;
  planId: string;
  featureCode: string;
  featureName: string;
  featureValue: string;
  featureType: 'BOOLEAN' | 'NUMERIC' | 'TEXT';
  description?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: 'STARTER' | 'PRO' | 'PREMIUM' | 'ENTERPRISE' | string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: 'TRY' | 'USD' | 'EUR';
  trialDays: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  displayOrder: number;
  isPopular?: boolean;
  maxUsers: number;
  maxCompanies: number;
  maxProducts: number;
  maxCustomers: number;
  maxInvoicesPerMonth: number;
  includedCredits: number;
  storageLimitMb: number;
  activeModules: string[];
  features?: string[];
  detailedFeatures?: PlanFeature[];
  createdAt?: string;
  updatedAt?: string;
}

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled'
  | 'expired';

export type SubscriptionBillingCycle = 'monthly' | 'yearly';

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  planSlug: string;
  status: SubscriptionStatus;
  billingCycle: SubscriptionBillingCycle;
  startDate: string;
  endDate: string;
  trialStart?: string;
  trialEnd?: string;
  nextBillingDate?: string;
  gracePeriodDays: number;
  cancelledAt?: string;
  cancelReason?: string;
  cancelNote?: string;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProrationResult {
  currentPlan: SubscriptionPlan;
  newPlan: SubscriptionPlan;
  billingCycle: 'monthly' | 'yearly';
  daysInPeriod: number;
  daysRemaining: number;
  daysUsed: number;
  unusedCurrentPlanValue: number;
  newPlanCost: number;
  netProratedAmount: number;
  vatAmount: number;
  totalPayableAmount: number;
}

export interface CreditWallet {
  id: string;
  tenantId: string;
  balance: number;
  reservedBalance: number;
  expiresAt?: string;
  lowCreditThreshold: number;
  updatedAt: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  quantity: number;
  creditAmount?: number;
  price: number;
  currency: 'TRY' | 'USD' | 'EUR';
  vatRate: number;
  totalPrice: number;
  unitPrice: number;
  isPopular?: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  active?: boolean;
  displayOrder: number;
  expiresInDays?: number;
}

export interface CreditTxRecord {
  id: string;
  tenantId: string;
  type: string;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId?: string;
  description: string;
  performedBy?: string;
  createdAt: string;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type PaymentType = 'SUBSCRIPTION' | 'CREDIT_PURCHASE' | 'PLAN_UPGRADE';

export interface Payment {
  id: string;
  tenantId: string;
  subscriptionId?: string;
  paymentProvider: string;
  providerPaymentId: string;
  orderNumber: string;
  amount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  vatAmount: number;
  totalAmount: number;
  status: PaymentStatus;
  paymentType: PaymentType;
  description: string;
  cardLast4?: string;
  cardBrand?: string;
  paidAt?: string;
  failedAt?: string;
  errorMessage?: string;
  refundedAmount?: number;
  refundedAt?: string;
  billingInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
}

export interface BillingInvoice {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantTaxNumber?: string;
  tenantAddress?: string;
  subscriptionId?: string;
  paymentId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  status: 'draft' | 'issued' | 'paid' | 'past_due' | 'cancelled' | 'refunded';
  items: BillingInvoiceItem[];
  pdfUrl?: string;
  paidAt?: string;
  createdAt: string;
}

export type UsageMetric =
  | 'users'
  | 'companies'
  | 'customers'
  | 'products'
  | 'invoices'
  | 'storage_mb'
  | 'einvoices'
  | 'earchives'
  | 'edespatches';

export interface UsageRecord {
  id: string;
  tenantId: string;
  metric: UsageMetric;
  currentValue: number;
  limitValue: number;
  isHardLimit: boolean;
  updatedAt: string;
}

export interface Dealer {
  id: string;
  parentDealerId?: string | null;
  name: string;
  code: string;
  email: string;
  phone?: string;
  contactPerson?: string;
  taxNumber?: string;
  taxOffice?: string;
  city?: string;
  commissionRate: number;
  balance: number;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}

export interface DealerCommission {
  id: string;
  dealerId: string;
  dealerName: string;
  tenantId: string;
  tenantName: string;
  paymentId: string;
  subscriptionId?: string;
  paymentAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  notes?: string;
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
}

export interface SaasKpis {
  mrr: number;
  arr: number;
  arpu: number;
  totalRevenue: number;
  subscriptionRevenue: number;
  creditSalesRevenue: number;
  churnRate: number;
  trialConversionRate: number;
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  pastDueTenants: number;
  suspendedTenants: number;
  totalDealers: number;
  totalCommissionsPaid: number;
  pendingCommissions: number;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 6: MOBİL + SAHA TAHSİLAT + POS + BANKA + QR + BİLDİRİM TİPLERİ
// ──────────────────────────────────────────────────────────────────────────

export type FieldPaymentMethod = 'CASH' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'CHECK' | 'PROMISSORY_NOTE';
export type FieldCollectionStatus = 'PENDING_APPROVAL' | 'CONFIRMED' | 'CANCELLED';

export interface FieldCollection {
  id: string;
  tenantId: string;
  companyId: string;
  collectionNumber: string; // THS-2026-000001
  customerId: string;
  customerTitle: string;
  userId: string;
  userName: string;
  amount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  paymentMethod: FieldPaymentMethod;
  collectionDate: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  signatureFileUrl?: string;
  photoFileUrl?: string;
  receiptNumber?: string;
  status: FieldCollectionStatus;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  clientTransactionId: string;
  syncStatus: 'SYNCED' | 'PENDING' | 'FAILED';
  currentTransactionId?: string;
  cashTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FieldCollectionReceipt {
  id: string;
  collectionId: string;
  collectionNumber: string;
  receiptNumber: string;
  tenantId: string;
  companyTitle: string;
  customerTitle: string;
  amount: number;
  currency: string;
  paymentMethod: FieldPaymentMethod;
  collectedBy: string;
  signedAt: string;
  notes?: string;
  createdAt: string;
}

export type VisitOutcome =
  | 'COLLECTION_MADE'
  | 'ORDER_TAKEN'
  | 'DELIVERY_MADE'
  | 'NOT_FOUND'
  | 'REVISIT_REQUIRED'
  | 'OTHER';

export type VisitStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface CustomerVisit {
  id: string;
  tenantId: string;
  customerId: string;
  customerTitle: string;
  fieldAgentId: string;
  fieldAgentName: string;
  visitDate: string;
  startTime: string;
  endTime?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  photoFileUrl?: string;
  outcome?: VisitOutcome;
  status: VisitStatus;
  clientTransactionId: string;
  syncStatus: 'SYNCED' | 'PENDING';
  createdAt: string;
  updatedAt: string;
}

export type PosProviderType = 'MOCK' | 'PAYTR' | 'IYZICO' | 'GARANTI_POS' | 'YAPIKREDI_POS';
export type PosTransactionStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUNDED';
export type PosTransactionType = 'SALE' | 'PRE_AUTH' | 'CAPTURE' | 'VOID' | 'REFUND';

export interface PosTransaction {
  id: string;
  tenantId: string;
  companyId: string;
  provider: PosProviderType;
  providerTransactionId: string;
  amount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  status: PosTransactionStatus;
  transactionType: PosTransactionType;
  referenceType: 'INVOICE' | 'FIELD_COLLECTION' | 'DIRECT_SALE';
  referenceId?: string;
  cardLast4?: string;
  cardBrand?: string;
  authCode?: string;
  errorMessage?: string;
  installment?: number;
  createdAt: string;
  updatedAt: string;
}

export type BankMatchStatus = 'PROPOSED' | 'CONFIRMED' | 'REJECTED';

export interface BankTransactionMatch {
  id: string;
  tenantId: string;
  bankTransactionId: string;
  matchedCustomerId?: string;
  matchedCustomerTitle?: string;
  matchedInvoiceId?: string;
  matchedInvoiceNo?: string;
  matchScore: number;
  matchRules: string[];
  status: BankMatchStatus;
  reconciledAt?: string;
  reconciledBy?: string;
  notes?: string;
  createdAt: string;
}

export interface BankMatchSuggestion {
  bankTransaction: any;
  match: BankTransactionMatch;
  matchedCustomer?: any;
  matchedInvoice?: any;
}

export type PaymentLinkStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';

export interface PaymentLink {
  id: string;
  tenantId: string;
  customerId: string;
  customerTitle: string;
  amount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  token: string;
  tokenHash?: string;
  description: string;
  expiresAt: string;
  status: PaymentLinkStatus;
  paymentId?: string;
  qrData: string;
  viewCount: number;
  paidAt?: string;
  createdAt: string;
}

export interface MobileDevice {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  deviceId: string;
  deviceModel: string;
  platform: 'ANDROID' | 'IOS' | 'WEB_MOBILE';
  appVersion: string;
  pushToken?: string;
  biometricEnabled: boolean;
  isRevoked: boolean;
  revokedAt?: string;
  revokedBy?: string;
  lastActiveAt: string;
  createdAt: string;
}

export interface StockCountItem {
  productId: string;
  productCode: string;
  productName: string;
  barcode: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  unit: string;
}

export interface StockCount {
  id: string;
  tenantId: string;
  warehouseId: string;
  warehouseName: string;
  countNumber: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  countedBy: string;
  items: StockCountItem[];
  notes?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CustomerRiskScore {
  customerId: string;
  customerTitle: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  totalDebt: number;
  overdueDebt: number;
  maxOverdueDays: number;
  paymentHabitScore: number;
  suggestedAction: string;
  evaluatedAt: string;
}

export interface FieldAgentPerformance {
  agentId: string;
  agentName: string;
  totalCollections: number;
  collectionCount: number;
  totalVisits: number;
  completedVisits: number;
  targetAmount: number;
  successRate: number;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 7: AI MUHASEBE + OCR + AKILLI FİNANS + OTOMASYON + MALİ MÜŞAVİR TİPLERİ
// ──────────────────────────────────────────────────────────────────────────

export interface AIConversation {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  tenantId: string;
  sender: 'USER' | 'AI';
  content: string;
  sources?: string[];
  suggestedActions?: Array<{
    type: string;
    label: string;
    payload: any;
  }>;
  confidence?: number;
  createdAt: string;
}

export interface AIRecommendation {
  id: string;
  tenantId: string;
  userId?: string;
  type: string;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  sourceType: string;
  sourceId?: string;
  suggestedPayload?: any;
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'APPLIED';
  createdAt: string;
}

export interface DocumentAIField {
  fieldName: string;
  fieldLabel: string;
  fieldValue: string | number;
  confidence: number;
  isLowConfidence?: boolean;
}

export interface DocumentAIJob {
  id: string;
  tenantId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
  documentType: 'INVOICE' | 'RECEIPT' | 'WAYBILL' | 'BANK_STATEMENT' | 'CONTRACT' | 'OTHER';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVIEWED';
  overallConfidence: number;
  extractedFields: DocumentAIField[];
  extractedDraftInvoice?: {
    supplierTitle?: string;
    taxNumber?: string;
    invoiceNo?: string;
    invoiceDate?: string;
    dueDate?: string;
    lineItems?: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      total: number;
    }>;
    subtotal?: number;
    vatTotal?: number;
    grandTotal?: number;
    suggestedCategory?: string;
  };
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CashFlowForecastResult {
  period: '7_DAYS' | '30_DAYS' | '90_DAYS';
  currentLiquidAssets: number;
  expectedCollections: number;
  expectedPayables: number;
  projectedEndingBalance: number;
  isDeficitExpected: boolean;
  deficitAmount: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  dailyProjections: Array<{
    date: string;
    dayLabel: string;
    projectedInflow: number;
    projectedOutflow: number;
    endingBalance: number;
  }>;
  explanation: string[];
}

export interface AuditDeskIssue {
  id: string;
  category: 'DUPLICATE_INVOICE' | 'VAT_MISMATCH' | 'MISSING_VKN' | 'SUSPICIOUS_AMOUNT' | 'UNMATCHED_BANK';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  sourceType: string;
  sourceId: string;
  actionLabel: string;
  createdAt: string;
}

export interface AccountantClient {
  id: string;
  accountantUserId: string;
  tenantId: string;
  companyName: string;
  taxNumber: string;
  taxOffice: string;
  contactEmail: string;
  contactPhone?: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  missingDocumentsCount: number;
  unreconciledBankCount: number;
  lastAuditDate?: string;
  createdAt: string;
}

export interface DocumentRequest {
  id: string;
  tenantId: string;
  accountantUserId: string;
  accountantName: string;
  companyName: string;
  documentType: string;
  period: string;
  description: string;
  status: 'PENDING' | 'UPLOADED' | 'APPROVED' | 'REJECTED';
  uploadedFileUrl?: string;
  uploadedAt?: string;
  dueDate: string;
  createdAt: string;
}

export interface AutomationRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isActive: boolean;
  triggerEvent: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
  actionType: string;
  actionConfig: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  tenantId: string;
  ruleId: string;
  ruleName: string;
  triggerEvent: string;
  status: 'SUCCESS' | 'FAILED';
  actionExecuted: string;
  errorMessage?: string;
  executedAt: string;
}

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  description?: string;
  secret: string;
  events: string[];
  isActive: boolean;
  lastDeliveryStatus?: 'SUCCESS' | 'FAILED';
  lastDeliveryAt?: string;
  createdAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 8: MÜŞTERİ PORTALI + BELGE MERKEZİ + GÖREV & ONAY + İLETİŞİM + MOBİL
// ──────────────────────────────────────────────────────────────────────────

export interface DocumentVersion {
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  uploadedByUserId: string;
  uploadedByName: string;
  uploadedAt: string;
  changeSummary?: string;
}

export interface DocumentItem {
  id: string;
  tenantId: string;
  companyId?: string;
  customerId?: string;
  category: string;
  folderName: string;
  documentNo?: string;
  title: string;
  description?: string;
  tags: string[];
  currentVersion: number;
  versions: DocumentVersion[];
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sharedWithMaliMusavir: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicShareToken {
  id: string;
  tenantId: string;
  entityType: 'DOCUMENT' | 'ACCOUNT_STATEMENT' | 'INVOICE';
  entityId: string;
  token: string;
  hasPassword: boolean;
  passwordHash?: string;
  expiresAt: string;
  downloadLimit: number;
  downloadCount: number;
  isRevoked: boolean;
  title: string;
  createdAt: string;
}

export interface WorkspaceTask {
  id: string;
  tenantId: string;
  companyId?: string;
  title: string;
  description: string;
  assignedToUserId: string;
  assignedToName: string;
  createdByUserId: string;
  createdByName: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'NEW' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED' | 'CANCELLED';
  dueDate: string;
  tags: string[];
  attachments?: string[];
  commentsCount: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRule {
  id: string;
  tenantId: string;
  documentType: string;
  minAmount: number;
  maxAmount: number;
  approverRole: string;
  approvalOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  documentNo: string;
  title: string;
  requestedByUserId: string;
  requestedByName: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requiredRole: string;
  approverUserId?: string;
  approverName?: string;
  rejectReason?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface TopicConversation {
  id: string;
  tenantId: string;
  topicTitle: string;
  clientCompanyName: string;
  accountantUserId: string;
  accountantName: string;
  lastMessageSnippet: string;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
}

export interface TopicMessage {
  id: string;
  conversationId: string;
  tenantId: string;
  senderId: string;
  senderName: string;
  senderRole: 'CLIENT' | 'ACCOUNTANT';
  content: string;
  attachments?: string[];
  createdAt: string;
}

export interface SupportTicketFaz8 {
  id: string;
  tenantId: string;
  ticketNo: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  userEmail: string;
  responses: Array<{
    id: string;
    sender: string;
    message: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
  id: string;
  category: string;
  title: string;
  summary: string;
  contentMarkdown: string;
  tags: string[];
  viewsCount: number;
  isPopular: boolean;
}

export interface UserDevice {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  deviceName: string;
  platform: 'Windows' | 'Android' | 'iOS' | 'Web';
  ipAddress: string;
  lastActiveAt: string;
  isCurrent: boolean;
  isTrusted: boolean;
  isBlocked: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  actionType: string;
  entityType: string;
  entityId: string;
  title: string;
  details?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  createdAt: string;
}

export interface OnboardingProgress {
  id: string;
  tenantId: string;
  companyInfoDone: boolean;
  taxInfoDone: boolean;
  logoUploaded: boolean;
  bankAdded: boolean;
  eInvoiceConfigured: boolean;
  firstCustomerCreated: boolean;
  firstInvoiceCreated: boolean;
  completionPercentage: number;
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 9: SAAS PLATFORM + BAYİ + MARKETPLACE + API + WHITE-LABEL
// ──────────────────────────────────────────────────────────────────────────

export interface FeatureFlagConfig {
  id: string;
  key: string;
  name: string;
  description: string;
  isEnabledGlobally: boolean;
  rolloutPercentage: number;
  allowedPlans: string[];
}

export interface SaaSPlanItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: 'TRY' | 'USD' | 'EUR';
  trialDays: number;
  isActive: boolean;
  displayOrder: number;
  isPopular?: boolean;
  limits: {
    maxUsers: number;
    maxCompanies: number;
    maxCustomers: number;
    maxProducts: number;
    maxInvoicesMonthly: number;
    maxWarehouses: number;
    aiRequestLimit: number;
    ocrDocumentLimit: number;
    apiRateLimitDaily: number;
    storageMb: number;
  };
  featureFlags: string[];
}

export interface TenantUsageMeter {
  id: string;
  tenantId: string;
  period: string;
  invoiceCount: number;
  eDocumentCount: number;
  ocrCount: number;
  aiTokensCount: number;
  smsCount: number;
  storageUsedMb: number;
  apiRequestsCount: number;
  webhookEventsCount: number;
}

export interface PartnerNode {
  id: string;
  parentPartnerId?: string | null;
  role: 'MAIN_PLATFORM' | 'DEALER' | 'SUB_DEALER';
  code: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  taxNumber?: string;
  defaultCommissionRate: number;
  walletBalance: number;
  pendingCommission: number;
  paidCommissionTotal: number;
  assignedTenantIds: string[];
  subDealerIds?: string[];
  isActive: boolean;
}

export interface CommissionPayoutTx {
  id: string;
  partnerId: string;
  partnerName: string;
  tenantId: string;
  tenantName: string;
  paymentId: string;
  serviceType: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  createdAt: string;
}

export interface PromoCoupon {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  maxRedemptions: number;
  currentRedemptions: number;
  perTenantLimit: number;
  minAmount?: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

export interface MarketplaceAppItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  logoUrl?: string;
  version: string;
  pricingType: 'FREE' | 'MONTHLY_PAID' | 'USAGE_BASED';
  priceMonthly?: number;
  author: string;
  isVerified: boolean;
  rating: number;
  installedTenantsCount: number;
  status: string;
  requiredScopes: string[];
}

export interface TenantIntegrationConnection {
  id: string;
  tenantId: string;
  appSlug: string;
  appName: string;
  category: string;
  isConnected: boolean;
  lastHealthStatus: 'HEALTHY' | 'WARNING' | 'ERROR';
  connectedAt: string;
}

export interface ApiKeyCredential {
  id: string;
  tenantId: string;
  applicationId: string;
  name: string;
  keyPrefix: string;
  keyFingerprint: string;
  scopes: string[];
  rateLimitTier: 'BASIC' | 'PRO' | 'ENTERPRISE';
  lastUsedAt?: string;
  isRevoked: boolean;
  createdAt: string;
}

export interface ApiUsageLog {
  id: string;
  tenantId: string;
  endpoint: string;
  method: string;
  httpStatus: number;
  latencyMs: number;
  ipAddress: string;
  createdAt: string;
}

export interface WebhookSubscriptionItem {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  createdAt: string;
}

export interface WhiteLabelBrandProfile {
  id: string;
  tenantId: string;
  brandName: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  accentColor: string;
  supportEmail: string;
  supportPhone?: string;
  loginScreenMessage?: string;
  customCss?: string;
  isActive: boolean;
}

export interface SystemHealthIndicator {
  serviceName: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'DOWN';
  latencyMs: number;
  uptimePercentage: number;
  lastCheckedAt: string;
}

export * from '../components/formdesigner/formDesignerTypes';

