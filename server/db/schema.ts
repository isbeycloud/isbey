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
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  role: UserRole;
  passwordHash: string;
  active: boolean;
  companyId?: string;
  companyName?: string;
  tenantId?: string;
  allowedCompanyIds?: string[];
  department?: string;
  branch?: string;
  permissions?: UserPermission[];
  createdAt: string;
  updatedAt?: string;
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
  tenantId?: string;
  code: string;
  type: CustomerType;
  title: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  taxNumber?: string;
  nationalId?: string;
  taxOffice?: string;
  phone?: string;
  mobilePhone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  country?: string;
  iban?: string;
  currency?: string; // 'TRY' | 'USD' | 'EUR' | 'GBP'
  creditLimit?: number;
  riskLimit?: number;
  maturityDays?: number;
  openingDebit?: number;
  openingCredit?: number;
  notes?: string;
  balance: number;
  totalDebit: number;
  totalCredit: number;
  status?: 'ACTIVE' | 'PASSIVE';
  active: boolean;
  companyId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface AccountTransaction {
  id: string;
  tenantId: string;
  customerId: string;
  customerCode?: string;
  customerTitle?: string;
  transactionType: 'OPENING' | 'INVOICE' | 'COLLECTION' | 'PAYMENT' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER';
  documentType: string;
  documentId?: string;
  documentNo?: string;
  date: string;
  dueDate?: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  currency?: string;
  exchangeRate?: number;
  originalAmount?: number;
  referenceNo?: string;
  relatedCashTxId?: string;
  relatedBankTxId?: string;
  relatedInvoiceId?: string;
  isCancelled?: boolean;
  cancelReason?: string;
  createdBy?: string;
  createdAt: string;
}

export interface ProductGroup {
  id: string;
  tenantId?: string;
  name: string;
  code: string;
}

export interface ProductCategory {
  id: string;
  tenantId?: string;
  parentId?: string | null;
  name: string;
  code: string;
  status: 'ACTIVE' | 'PASSIVE';
  createdAt?: string;
}

export interface Unit {
  id: string;
  tenantId?: string;
  name: string;
  code: string;
  isDefault?: boolean;
}

export interface ProductBarcode {
  id: string;
  tenantId: string;
  productId: string;
  barcode: string;
  barcodeType?: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  tenantId?: string;
  name: string;
  code: string;
  isDefault: boolean;
  address?: string;
  city?: string;
  status?: 'ACTIVE' | 'PASSIVE';
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  tenantId?: string;
  barcode?: string;
  barcodes?: ProductBarcode[];
  code: string;
  name: string;
  groupId?: string;
  groupName?: string;
  group?: string;
  categoryId?: string;
  categoryName?: string;
  category?: string;
  brand?: string;
  model?: string;
  sku?: string;
  unit: string;
  unitId?: string;
  purchasePrice: number;
  salePrice: number;
  currency?: string; // 'TRY' | 'USD' | 'EUR'
  vatRate: number;
  otvRate?: number;
  criticalStock: number;
  maximumStock?: number;
  currentStock: number;
  stock?: number;
  minStock?: number;
  warehouseId?: string;
  warehouseName?: string;
  trackStock?: boolean;
  trackSerial?: boolean;
  trackLot?: boolean;
  description?: string;
  imageUrl?: string;
  status?: 'ACTIVE' | 'PASSIVE';
  active: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export type MovementType =
  | 'OPENING'
  | 'PURCHASE'
  | 'SALE'
  | 'PURCHASE_RETURN'
  | 'SALE_RETURN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'COUNT_ADJUSTMENT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'WAYBILL_IN'
  | 'WAYBILL_OUT'
  | 'IN'
  | 'OUT'
  | 'TRANSFER'
  | 'ADJUSTMENT';

export interface StockMovement {
  id: string;
  tenantId?: string;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseName?: string;
  documentNo: string;
  documentType: 'INVOICE' | 'WAYBILL' | 'TRANSFER' | 'ADJUSTMENT' | 'OPENING';
  documentId?: string;
  movementType: MovementType;
  quantity: number;
  direction: 'IN' | 'OUT';
  unitPrice: number;
  totalAmount: number;
  currency?: string;
  date: string;
  notes?: string;
  referenceNo?: string;
  userId: string;
  createdBy?: string;
  createdAt: string;
}

export type InvoiceType = 'SALES' | 'PURCHASE' | 'RETAIL_POS' | 'PROFORMA' | 'WAYBILL';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type InvoiceStatus = 'ACTIVE' | 'CANCELLED' | 'APPROVED' | 'DRAFT';
export type InvoiceProfile = 'TICARIFATURA' | 'TEMELFATURA' | 'EARSIVFATURA' | 'IHRACAT' | 'KAMU' | 'HAL';
export type InvoiceCategory = 'SATIS' | 'IADE' | 'TEVKIFAT' | 'ISTISNA' | 'OZELMATRAH' | 'IHRACKAYITLI';

export interface InvoiceItem {
  id: string;
  invoiceId: string;
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
  withholdingRate?: number;
  withholdingAmount?: number;
  exemptionReasonCode?: string;
  gtipCode?: string;
  lineTotal: number;
  lineGrandTotal: number;
}

export interface Invoice {
  id: string;
  tenantId?: string;
  companyId?: string;
  invoiceNo: string;
  type: InvoiceType;
  status?: InvoiceStatus;
  customerId: string;
  customerCode: string;
  customerTitle: string;
  date: string;
  maturityDate: string;
  subTotal: number;
  subtotal?: number;
  totalDiscount: number;
  totalVat: number;
  vatTotal?: number;
  totalWithholding?: number;
  payableVat?: number;
  grandTotal: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
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

export type CurrentTransactionType =
  | 'SALES_INVOICE'
  | 'PURCHASE_INVOICE'
  | 'COLLECTION'
  | 'PAYMENT'
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'OPENING_BALANCE'
  | 'TRANSFER'
  | 'EXPENSE';

export interface CurrentTransaction {
  id: string;
  tenantId?: string;
  companyId?: string;
  customerId: string;
  customerCode: string;
  customerTitle: string;
  documentNo: string;
  documentType?: CurrentTransactionType;
  transactionType?: string;
  date: string;
  maturityDate?: string;
  dueDate?: string;
  debit?: number;
  debt?: number;
  credit: number;
  balance: number;
  description: string;
  paymentMethod?: string;
  relatedInvoiceId?: string;
  userId: string;
  createdAt: string;
}

export interface CashRegister {
  id: string;
  tenantId?: string;
  name: string;
  code: string;
  isDefault: boolean;
  openingBalance?: number;
  balance: number;
  currency: string;
  description?: string;
  status?: 'ACTIVE' | 'PASSIVE';
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CashTransactionType =
  | 'COLLECTION'
  | 'PAYMENT'
  | 'EXPENSE'
  | 'INCOME'
  | 'TRANSFER_TO_BANK'
  | 'TRANSFER_FROM_BANK'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'OPENING'
  | 'ADJUSTMENT'
  | 'CHECK_COLLECTION'
  | 'CHECK_PAYMENT'
  | 'EMPLOYEE_SALARY'
  | 'EMPLOYEE_ADVANCE'
  | 'GİDER ÖDEMESİ'
  | 'GİDER_ÖDEMESİ';

export interface CashTransaction {
  id: string;
  tenantId?: string;
  companyId?: string;
  cashRegisterId: string;
  cashRegisterName?: string;
  documentNo?: string;
  type: CashTransactionType;
  direction?: 'IN' | 'OUT';
  amount: number;
  currency?: string;
  exchangeRate?: number;
  originalAmount?: number;
  date: string;
  customerId?: string;
  customerTitle?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  targetCashRegisterId?: string;
  targetCashRegisterName?: string;
  category?: string;
  description: string;
  referenceNo?: string;
  relatedDocumentId?: string;
  relatedAccountTxId?: string;
  isCancelled?: boolean;
  cancelReason?: string;
  userId: string;
  createdBy?: string;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  tenantId?: string;
  companyId?: string;
  bankName: string;
  accountName: string;
  accountNo: string;
  branchName: string;
  iban: string;
  currency: string;
  openingBalance?: number;
  balance: number;
  isDefault: boolean;
  status?: 'ACTIVE' | 'PASSIVE';
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type BankTransactionType =
  | 'HAVALE_EFT_IN'
  | 'HAVALE_EFT_OUT'
  | 'POS_COLLECTION'
  | 'TRANSFER_TO_CASH'
  | 'TRANSFER_FROM_CASH'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'EXPENSE'
  | 'INTEREST'
  | 'BANK_FEE'
  | 'OPENING'
  | 'ADJUSTMENT'
  | 'CHECK_COLLECTION'
  | 'CHECK_PAYMENT'
  | 'INCOME'
  | 'GİDER ÖDEMESİ'
  | 'GİDER_ÖDEMESİ';

export interface BankTransaction {
  id: string;
  tenantId?: string;
  companyId?: string;
  bankAccountId: string;
  bankAccountName?: string;
  documentNo?: string;
  type: BankTransactionType;
  direction?: 'IN' | 'OUT';
  category?: string;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  originalAmount?: number;
  date: string;
  customerId?: string;
  customerTitle?: string;
  cashRegisterId?: string;
  cashRegisterName?: string;
  targetBankAccountId?: string;
  targetBankAccountName?: string;
  description: string;
  referenceNo?: string;
  relatedDocumentId?: string;
  relatedAccountTxId?: string;
  isCancelled?: boolean;
  cancelReason?: string;
  userId: string;
  createdBy?: string;
  createdAt: string;
}

export type CheckType = 'INCOMING_CHECK' | 'OUTGOING_CHECK' | 'INCOMING_PROMISSORY' | 'OUTGOING_PROMISSORY';
export type CheckStatus = 'IN_PORTFOLIO' | 'COLLECTED' | 'PAID' | 'ENDORSED' | 'BOUNCED' | 'CANCELLED';

export interface CheckNote {
  id: string;
  type: CheckType;
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
  collectedCashRegisterId?: string;
  collectedBankAccountId?: string;
  endorsedToCustomerId?: string;
  endorsedToCustomerTitle?: string;
  description?: string;
  userId: string;
  createdAt: string;
}

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

export interface EmployeeTransaction {
  id: string;
  employeeId: string;
  employeeName: string;
  documentNo: string;
  type: 'SALARY' | 'COMMISSION' | 'ADVANCE' | 'PAYMENT';
  amount: number;
  date: string;
  description: string;
  cashRegisterId?: string;
  bankAccountId?: string;
  userId: string;
  createdAt: string;
}

export type AuditLogAction =
  | 'COMPANY_CREATED'
  | 'COMPANY_UPDATED'
  | 'COMPANY_ACTIVATED'
  | 'COMPANY_DEACTIVATED'
  | 'COMPANY_DELETED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DISABLED'
  | 'USER_ENABLED'
  | 'USER_DELETED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_CHANGED'
  | 'ROLE_CHANGED'
  | 'PERMISSION_CHANGED'
  | 'SERVICE_ADDED'
  | 'SERVICE_REMOVED'
  | 'SERVICE_ACTIVATED'
  | 'SERVICE_DEACTIVATED'
  | 'LICENSE_CHANGED'
  | 'SESSION_REVOKED'
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'CANCEL'
  | 'PRINT'
  | 'EXPORT'
  | 'SETTINGS_CHANGE'
  | 'INTEGRATION_ENABLED'
  | 'INTEGRATION_DISABLED';

export interface AuditLog {
  id: string;
  tenantId?: string;
  userId: string;
  username?: string;
  userName?: string;
  userRole?: string;
  companyId?: string;
  companyName?: string;
  action: AuditLogAction | string;
  module: string;
  documentNo?: string;
  ipAddress: string;
  details: string;
  timestamp: string;
}

export interface SystemNotification {
  id: string;
  type: 'CRITICAL_STOCK' | 'OVERDUE_MATURITY' | 'UPCOMING_CHECK' | 'LOW_CASH' | 'SYSTEM_INFO';
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DocumentSequence {
  prefix: string;
  year: number;
  lastNumber: number;
  length: number;
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
  tenantId?: string;
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
  quantity?: number;
  orderedQuantity?: number;
  shippedQuantity?: number;
  remainingQuantity?: number;
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
  tenantId?: string;
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
  discount1?: number;
  discount2?: number;
  vatRate: number;
  lineTotal: number;
  lineGrandTotal?: number;
}

export interface Waybill {
  id: string;
  tenantId?: string;
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

export interface Expense {
  id: string;
  tenantId?: string;
  documentNo: string;
  expenseCategoryId: string;
  expenseCategoryName: string;
  categoryName?: string;
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

// ─── Form Designer Types ───────────────────────────────────────────────────

export type FormDocumentType =
  | 'INVOICE_SALES'
  | 'INVOICE_PURCHASE'
  | 'WAYBILL'
  | 'QUOTE'
  | 'ORDER'
  | 'STATEMENT'
  | 'RECEIPT'
  | 'EXPENSE'
  | 'CHEQUE'
  | 'EFATURA'
  | 'EARSIV'
  | 'EIRSALIYE'
  | 'ESMM'
  | 'EMM';

export type FormElementType =
  // Basic
  | 'LABEL' | 'TEXTBOX' | 'NUMBERBOX' | 'DATEPICKER' | 'COMBOBOX' | 'CHECKBOX'
  // ERP
  | 'CUSTOMER_FIELD' | 'PRODUCT_TABLE' | 'TOTALS_TABLE'
  // Document
  | 'IMAGE' | 'LOGO' | 'QRCODE' | 'SIGNATURE' | 'DIVIDER' | 'GROUP_BOX'
  // Layout
  | 'SPACER';

export type FormSectionType =
  | 'HEADER' | 'CUSTOMER' | 'LINES' | 'TOTALS' | 'PAYMENT' | 'FOOTER' | 'CUSTOM';

export interface FormElementProps {
  label?: string;
  placeholder?: string;
  value?: string;
  dataBinding?: string;
  format?: string;
  required?: boolean;
  readOnly?: boolean;
  visible?: boolean;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | '500' | '600' | '700';
  fontAlign?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
  border?: string;
  borderRadius?: number;
  paddingH?: number;
  paddingV?: number;
  src?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineThickness?: number;
  lineColor?: string;
  qrData?: string;
  title?: string;
}

export interface FormElement {
  id: string;
  type: FormElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  props: FormElementProps;
  zIndex?: number;
  locked?: boolean;
}

export interface FormSection {
  id: string;
  type: FormSectionType;
  label: string;
  order: number;
  height: number;
  visible: boolean;
  elements: FormElement[];
  backgroundColor?: string;
  paddingH?: number;
  paddingV?: number;
}

export interface FormDesign {
  id: string;
  name: string;
  documentType: FormDocumentType;
  description?: string;
  version: number;
  isDefault: boolean;
  isBuiltIn: boolean;
  paperSize: 'A4' | 'A5' | 'THERMAL_80';
  orientation: 'portrait' | 'landscape';
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  sections: FormSection[];
  metadata?: {
    primaryColor?: string;
    showPageNumbers?: boolean;
    showWatermark?: boolean;
    watermarkText?: string;
  };
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// MULTI-TENANT (KİRACI & ŞİRKET) SİSTEMİ
// ──────────────────────────────────────────────────────────────────────────

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
  erpSubscription?: { startDate: string; endDate: string; expiryPolicy: 'READ_ONLY'; updatedAt: string };
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
  externalProvider?: 'HIZLI_BILISIM' | 'MANUAL';
  externalCustomerId?: string;
  syncedAt?: string;
  isArchived?: boolean;
  deletedAt?: string;
  edonusumConfig?: {
    apiKey?: string;
    gbUrn?: string;
    pkUrn?: string;
    isTestMode?: boolean;
    autoCheckGibUser?: boolean;
    defaultProfile?: string;
    username?: string;
    password?: string;
    [key: string]: any;
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Hızlı Bilişim Müşteri / Üye Entegrasyonu Modelleri
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
  | 'SYNC_ERROR'
  | 'PORTAL_MAPPING_UPDATED'
  | 'AUTO_MATCH_COMPLETED'
  | 'PORTAL_INVOICES_SYNC_ERROR'
  | 'PORTAL_INVOICES_SYNCED'
  | 'DEALER_CONNECTION_TEST'
  | 'DEALER_TOKEN_REFRESH'
  | 'DEALER_CREATED'
  | 'DEALER_UPDATED';

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
  errorMessage?: string;
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

// ──────────────────────────────────────────────────────────────────────────
// HIZLI BİLİŞİM BAYİ YÖNETİMİ & E-DÖNÜŞÜM VERİ MODELLERİ (HBT EĞİTİM STANDARTLARI)
// ──────────────────────────────────────────────────────────────────────────

export type DealerRole = 'SUPER_ADMIN' | 'BAYI_ADMIN' | 'BURO' | 'MUHASEBE' | 'SAHA' | 'MUSTERI_ADMIN' | 'MUSTERI_USER';

export interface DealerCustomer {
  id: string;
  // 2026-09-12 (IDOR düzeltmesi): Bu alan olmadan `dealerCustomers` global
  // bir koleksiyon olarak tüm kiracılara görünürdü. Artık her kayıt kendi
  // kiracısına bağlı; route'lar bu alana göre filtreler.
  tenantId?: string;
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
  customerTitle?: string;
  customerName?: string;
  dealerId?: string;
  taxNumber?: string;
  targetCustomerId?: string;
  targetCustomerTitle?: string;
  type: CreditTransactionType;
  unit?: CreditUnit;
  amount: number;
  unitPrice?: number;
  totalPrice?: number;
  note?: string;
  balanceBefore?: number;
  balanceAfter: number;
  description?: string;
  performedBy: string;
  performedByRole?: string;
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
  | 'QUEUED'
  | 'SIGNED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ERROR'
  | 'FAILED';

export interface EDocument {
  id: string;
  customerId: string;
  customerTitle: string;
  receiverTitle: string;
  receiverTaxNumber: string;
  documentType: EDocumentType;
  profileId: string; // TICARIFATURA, TEMELFATURA, IHRACAT, KAMU vb.
  invoiceTypeCode: string; // SATIS, IADE, ISTISNA, TEVKIFAT vb.
  documentNo: string;
  prefix: string;
  uuid: string; // ETTN
  issueDate: string;
  issueTime: string;
  currency: string;
  exchangeRate: number;
  lineExtensionAmount: number; // Net Matrah
  taxTotal: number;
  payableAmount: number;
  status: EDocumentStatus;
  statusCode?: number; // 1300, 1200 vb.
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
  month: number; // 1-12
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
  commissionRate: number; // % Örn: 20
  commissionAmount: number;
  vatRate: number; // % Örn: 20
  vatAmount: number;
  netPayoutAmount: number;
  paymentStatus: 'UNPAID' | 'PAID' | 'PROCESSING';
  paidAt?: string;
  createdAt: string;
}

export interface DocumentPrefixConfig {
  id: string;
  documentType: EDocumentType;
  prefix: string; // Örn: HBT, IRS, SMM, MST
  year: number;
  lastSequence: number; // Örn: 1045
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

// ──────────────────────────────────────────────────────────────────────────

export interface DatabaseState {
  tenantConfigurations?: Record<string, {
    company: Company;
    sequences: Record<string, DocumentSequence>;
    settings: DatabaseState['settings'];
  }>;
  company: Company;
  activeTenantId?: string;
  tenants: Tenant[];
  eServiceApplications?: import('../services/eServiceApplications').EServiceApplication[];
  servicePlanRequests?: { id: string; tenantId: string; userId: string; planId: string; planName: string; period: 'MONTHLY' | 'YEARLY'; amount: number; currency: string; status: 'REQUESTED'; createdAt: string }[];
  users: User[];
  customers: Customer[];
  productGroups: ProductGroup[];
  warehouses: Warehouse[];
  products: Product[];
  stockMovements: StockMovement[];
  costCenters: CostCenter[];
  quotes: Quote[];
  orders: Order[];
  waybills: Waybill[];
  invoices: Invoice[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  currentTransactions: CurrentTransaction[];
  accountTransactions?: AccountTransaction[];
  productCategories?: ProductCategory[];
  productBarcodes?: ProductBarcode[];
  units?: Unit[];
  cashRegisters: CashRegister[];
  cashTransactions: CashTransaction[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  checksNotes: CheckNote[];
  employees: Employee[];
  employeeTransactions: EmployeeTransaction[];
  auditLogs: AuditLog[];
  notifications: SystemNotification[];
  sequences: Record<string, DocumentSequence>;
  formDesigns: FormDesign[];
  documentTemplates?: DocumentTemplate[];
  documentTemplateVersions?: DocumentTemplateVersion[];
  services?: ServiceCatalogItem[];
  plans?: PlanCatalogItem[];
  sessions?: UserSession[];
  passwordResetTokens?: PasswordResetToken[];
  externalCustomers?: ExternalCustomer[];
  integrationSyncLogs?: IntegrationSyncLog[];
  hizliBilisimSettings?: HizliBilisimSettings;
  
  // Hızlı Bilişim Bayi & E-Dönüşüm Merkezi Tabloları
  dealerCustomers?: DealerCustomer[];
  creditTransactions?: CreditTransaction[];
  eDocuments?: EDocument[];
  defterRecords?: DefterRecord[];
  disputeRecords?: DisputeRecord[];
  commissionReports?: DealerCommissionReport[];
  documentPrefixConfigs?: DocumentPrefixConfig[];
  transferDocuments?: TransferDocumentRecord[];
  dealerAuditLogs?: DealerAuditLog[];
  supportTickets?: SupportTicket[];
  tenantUsers?: TenantUser[];
  roles?: Role[];
  permissions?: Permission[];
  rolePermissions?: RolePermission[];
  invitations?: Invitation[];
  impersonationSessions?: ImpersonationSession[];
  
  // FAZ 4: E-Dönüşüm Entegrasyon Motoru
  tenantEinvoiceSettings?: TenantEinvoiceSettings[];
  electronicDocuments?: ElectronicDocument[];
  incomingInvoices?: IncomingInvoice[];
  taxpayerCache?: TaxpayerCacheItem[];
  integrationLogs?: IntegrationLog[];
  electronicDocumentUsage?: ElectronicDocumentUsage[];
  productSupplierMappings?: ProductSupplierMapping[];

  // FAZ 5: Kontör + Abonelik + Paket Yönetimi + Online Ödeme + Bayi
  subscriptionPlans?: SubscriptionPlan[];
  planFeatures?: PlanFeature[];
  subscriptions?: Subscription[];
  creditWallets?: CreditWallet[];
  creditPackages?: CreditPackage[];
  paymentOrders?: PaymentOrder[];
  payments?: Payment[];
  billingInvoices?: BillingInvoice[];
  usageRecords?: UsageRecord[];
  dealers?: Dealer[];
  dealerCommissions?: DealerCommission[];

  // FAZ 6: Mobil + Saha Tahsilat + POS + Banka Mutabakat + QR + Bildirim
  fieldCollections?: FieldCollection[];
  fieldCollectionReceipts?: FieldCollectionReceipt[];
  customerVisits?: CustomerVisit[];
  posTransactions?: PosTransaction[];
  bankTransactionMatches?: BankTransactionMatch[];
  paymentLinks?: PaymentLink[];
  mobileDevices?: MobileDevice[];
  mobileSyncQueues?: MobileSyncQueue[];
  pushNotifications?: PushNotificationRecord[];
  stockCounts?: StockCount[];
  customerRiskScores?: CustomerRiskScore[];

  // FAZ 7: AI Muhasebe + OCR + Akıllı Finans + Otomasyon + Mali Müşavir Platformu
  aiConversations?: AIConversation[];
  aiMessages?: AIMessage[];
  aiInteractions?: AIInteraction[];
  aiUsage?: AIUsage[];
  aiRecommendations?: AIRecommendation[];
  aiAnomalies?: AIAnomaly[];
  aiPredictions?: AIPrediction[];
  documentAIJobs?: DocumentAIJob[];
  automationRules?: AutomationRule[];
  automationRuns?: AutomationRun[];
  webhookEndpoints?: WebhookEndpoint[];
  webhookDeliveries?: WebhookDelivery[];
  accountantClients?: AccountantClient[];
  documentRequests?: DocumentRequest[];

  // FAZ 8: Müşteri Portalı + Ortak Workspace + Belge Merkezi + Görev & Onay + İletişim
  documents?: DocumentItem[];
  publicShareTokens?: PublicShareToken[];
  workspaceTasks?: WorkspaceTask[];
  approvalRules?: ApprovalRule[];
  approvalRequests?: ApprovalRequest[];
  topicConversations?: TopicConversation[];
  topicMessages?: TopicMessage[];
  supportTicketsFaz8?: SupportTicketFaz8[];
  knowledgeArticles?: KnowledgeArticle[];
  userDevices?: UserDevice[];
  activityLogs?: ActivityLog[];
  onboardingProgress?: OnboardingProgress[];

  // FAZ 9: SaaS Ticari Platform + Bayi + Marketplace + API + White-Label
  saasPlans?: SaaSPlanItem[];
  featureFlags?: FeatureFlagConfig[];
  tenantUsageMeters?: TenantUsageMeter[];
  autoTopupRules?: AutoTopupRule[];
  partnerNodes?: PartnerNode[];
  commissionRuleRecords?: CommissionRuleRecord[];
  commissionPayoutTxs?: CommissionPayoutTx[];
  promoCoupons?: PromoCoupon[];
  referralRecords?: ReferralProgramRecord[];
  marketplaceApps?: MarketplaceAppItem[];
  integrationConnections?: TenantIntegrationConnection[];
  integrationSyncJobs?: IntegrationSyncJobRecord[];
  apiApplications?: ApiApplication[];
  apiKeyCredentials?: ApiKeyCredential[];
  apiUsageLogs?: ApiUsageLog[];
  webhookSubscriptions?: WebhookSubscriptionItem[];
  webhookDeliveryLogs?: WebhookDeliveryLog[];
  whiteLabelProfiles?: WhiteLabelBrandProfile[];
  customDomains?: CustomDomainVerification[];
  brandEmailConfigs?: BrandEmailConfig[];
  platformAnnouncements?: PlatformAnnouncement[];
  systemHealthIndicators?: SystemHealthIndicator[];
  tenantSuccessMetrics?: TenantSuccessMetric[];
  tenantDataExportJobs?: TenantDataExportJob[];

  settings: {
    receiptHeader: string;
    receiptFooter: string;
    printerType: 'THERMAL_80MM' | 'A4_INVOICE';
    enableSoundEffects: boolean;
    autoBackupDaily: boolean;
    barcodeStandard: 'EAN13' | 'CODE128' | 'QR';
    taxRates: number[];
  };

  // FAZ 25.3: Fatura + Rapor Tasarım Modülleri (tenant kapsamlı, optional —
  // eski database.json dosyaları alan yokluğunda sorunsuz açılır)
  invoiceDesigns?: InvoiceDesignRecord[];
  reportDesigns?: ReportDesignRecord[];
}

/** FAZ 25.3-A: Fatura tasarım kaydı (Ayarlar → Fatura Tasarımı) */
export interface InvoiceDesignRecord {
  id: string;
  tenantId: string;            // YALNIZCA token'dan doldurulur (25.2-A kuralı)
  name: string;
  theme: 'CORPORATE' | 'MINIMAL' | 'MODERN' | 'ECOMMERCE' | 'OFFICIAL' | 'CUSTOM' | string;
  isDefault: boolean;
  accentColor?: string;
  logoDataUrl?: string;
  stampDataUrl?: string;
  showSections?: Record<string, boolean>;
  sectionOrder?: string[];
  columnOrder?: string[];
  headerNote?: string;
  footerNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/** FAZ 25.3-B: Rapor tasarım kaydı (Rapor Tasarım Merkezi) */
export interface ReportDesignRecord {
  id: string;
  tenantId: string;            // YALNIZCA token'dan doldurulur (25.2-A kuralı)
  name: string;
  dataSource: 'SALES' | 'PURCHASE' | 'CUSTOMER' | 'CASH' | 'STOCK' | 'VAT' | string;
  chartType: 'BAR' | 'LINE' | 'DOUGHNUT' | 'TABLE' | string;
  fields: string[];            // alan seçimi: date, customer, product, vat, employee, region, warehouse
  filters?: { dateFrom?: string; dateTo?: string; customerIds?: string[]; warehouseIds?: string[] };
  columns?: string[];          // kolon yönetimi (gösterim sırası)
  kpis?: string[];             // dashboard tarzı KPI seçimi: revenue, growth, count, avg
  createdAt: string;
  updatedAt: string;
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
  allowedMenuIds?: string[] | null;
  id: string;
  tenantId: string;
  userId: string;
  roleId?: string;
  roleIds?: string[]; // Roles belong to this user/company membership only.
  legacyRole?: UserRole; // Preserved at migration, never read from the account for authorization.
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
  tenantId?: string | null; // null ise sistem genelindeki roldür
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  permissions: string[]; // İzin kodları listesi (örn: ['customers.view', 'invoices.create'])
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  code: string; // Örn: 'invoices.create'
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
  tokenHash: string; // SHA-256 hash
  tokenPlain?: string; // Sadece davet anında döner
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
// FAZ 4: E-DÖNÜŞÜM ENTEGRASYON MOTORU MODELLERİ
// ──────────────────────────────────────────────────────────────────────────

export interface TenantEinvoiceSettings {
  id: string;
  tenantId: string;
  providerId: 'MOCK' | 'HIZLI_TEKNOLOJI' | string;
  environment: 'TEST' | 'PRODUCTION';
  username?: string;
  encryptedPassword?: string;
  apiKeyEncrypted?: string;
  apiSecretEncrypted?: string;
  senderIdentifier: string; // VKN veya TCKN
  senderTitle?: string;
  senderAliasGB?: string; // Gelen kutusu etiketi (urn:mail:defaultgb)
  senderAliasPK?: string; // Gönderici posta kutusu (urn:mail:defaultpk)
  defaultInvoiceProfile?: 'TEMELFATURA' | 'TICARIFATURA' | 'EARSIVFATURA';
  defaultDespatchProfile?: 'TEMELIRSALIYE';
  autoSendToGib?: boolean;
  status: 'ACTIVE' | 'PASSIVE' | 'PENDING_VERIFICATION';
  /**
   * 2026-09-14: İŞBEY ERP kullanıcı entegrasyonunun aktif olup olmadığını belirtir.
   * true  → Hızlı Bilişim → İŞBEY ERP otomatik entegrasyon çalışır.
   * false → Entegrasyon durur; mevcut kullanıcılar SİLİNMEZ.
   * Varsayılan: false (fail-safe; yanlışlıkla aktive olmaz).
   */
  integrationEnabled?: boolean;
  integrationEnabledAt?: string;
  integrationDisabledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type EDocumentKind = 'INVOICE' | 'DESPATCH';
export type EDocumentDirection = 'OUTGOING' | 'INCOMING';

export interface EDocumentTimelineItem {
  status: string;
  description: string;
  timestamp: string;
}

export interface ElectronicDocument {
  id: string;
  tenantId: string;
  documentType: EDocumentKind;
  documentDirection: EDocumentDirection;
  internalDocumentId?: string; // ERP Invoice ID (inv-xxx) veya Waybill ID (wb-xxx)
  documentNumber: string; // Fatura / İrsaliye Numarası (GİB / HBT format)
  uuid: string; // RFC 4122 v4 ETTN
  profile: string; // TEMELFATURA, TICARIFATURA, EARSIVFATURA, TEMELIRSALIYE
  invoiceType?: string; // SATIS, IADE, TEVKIFAT, ISTISNA
  senderIdentifier: string; // Gönderici VKN / TCKN
  senderTitle: string;
  receiverIdentifier: string; // Alıcı VKN / TCKN
  receiverTitle: string;
  currency: string;
  exchangeRate?: number;
  totalAmount: number;
  payableAmount: number;
  status: EDocumentStatus;
  providerId: string; // 'MOCK', 'HIZLI_TEKNOLOJI'
  /**
   * 2026-09-12: Kuyruklama anında kontör REZERVE EDİLDİ mi?
   * `providerId` string'inden türetmek fail-open'dı (boş/legacy/tanınmayan
   * değer "rezervasyon var" sayılıyor, karşılıksız düşüm veya başkasının
   * rezervasyonunun iadesine yol açıyordu). Bu alan kararın kendisini taşır.
   * Eski kayıtlarda `undefined` olur ve hiçbir kontör işlemi YAPILMAZ (fail-safe).
   */
  creditsReserved?: boolean;
  providerStatus?: string;
  providerDocumentId?: string;
  xmlStoragePath?: string;
  pdfStoragePath?: string;
  idempotencyKey?: string;
  retryCount: number;
  maxRetries: number;
  lastRetryAt?: string;
  sentAt?: string;
  receivedAt?: string;
  cancelledAt?: string;
  errorCode?: string;
  errorMessage?: string;
  timeline: EDocumentTimelineItem[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncomingInvoiceItem {
  id: string;
  incomingInvoiceId: string;
  supplierProductCode?: string;
  name: string;
  barcode?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
  mappedProductId?: string;
}

export interface IncomingInvoice {
  id: string;
  tenantId: string;
  uuid: string;
  invoiceNo: string;
  supplierTaxNumber: string;
  supplierTitle: string;
  issueDate: string;
  subTotal: number;
  vatAmount: number;
  grandTotal: number;
  currency: string;
  status: 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED_TO_PURCHASE';
  rejectionReason?: string;
  convertedPurchaseInvoiceId?: string;
  xmlStoragePath?: string;
  pdfStoragePath?: string;
  items: IncomingInvoiceItem[];
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxpayerCacheItem {
  id: string;
  identifier: string; // VKN veya TCKN
  title: string;
  isEInvoiceUser: boolean;
  isEDespatchUser?: boolean;
  aliasGB?: string; // Gelen Kutusu URN
  aliasPK?: string; // Posta Kutusu URN
  firstRegisteredAt?: string;
  lastCheckedAt: string;
  expiresAt: string;
}

export interface IntegrationLog {
  id: string;
  tenantId: string;
  providerId: string;
  documentId?: string;
  operation: string;
  requestId?: string;
  status: 'SUCCESS' | 'ERROR' | 'RETRY';
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
  requestPayloadMasked?: any;
  responsePayloadMasked?: any;
  createdAt: string;
}

export interface ElectronicDocumentUsage {
  id: string;
  tenantId: string;
  documentId: string;
  documentType: 'EINVOICE' | 'EARSIV' | 'EIRSALIYE';
  providerId: string;
  quantity: number; // 1
  createdAt: string;
}

export interface ProductSupplierMapping {
  id: string;
  tenantId: string;
  supplierTaxNumber: string;
  supplierProductCode: string;
  barcode?: string;
  localProductId: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 5: KONTÖR + ABONELİK + PAKET YÖNETİMİ + ONLİNE ÖDEME + BAYİ MODELLERİ
// ──────────────────────────────────────────────────────────────────────────

export interface PlanFeature {
  id: string;
  planId: string;
  featureCode: string; // 'max_users', 'einvoice_enabled', 'bank_integration', vb.
  featureName: string;
  featureValue: string; // '5', 'true', 'unlimited'
  featureType: 'BOOLEAN' | 'NUMERIC' | 'TEXT';
  description?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: 'STARTER' | 'PRO' | 'PREMIUM' | 'ENTERPRISE' | string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number; // Yıllık peşin veya aylığa vurulmuş indirimli fiyat
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
  createdAt: string;
  updatedAt: string;
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
  gracePeriodDays: number; // Varsayılan 7 gün
  cancelledAt?: string;
  cancelReason?: 'too_expensive' | 'not_using' | 'missing_feature' | 'technical_issue' | 'switched_service' | 'other' | string;
  cancelNote?: string;
  autoRenew: boolean;
  paymentMethodId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditWallet {
  id: string;
  tenantId: string;
  balance: number;
  reservedBalance: number;
  expiresAt?: string;
  lowCreditThreshold: number; // Varsayılan 20
  updatedAt: string;
}

export type CreditTransactionKind =
  | 'purchase'
  | 'usage'
  | 'refund'
  | 'bonus'
  | 'adjustment'
  | 'expiration'
  | 'PURCHASE'
  | 'USAGE'
  | 'REFUND';

export interface CreditPackage {
  id: string;
  name: string;
  quantity: number; // Kontör adedi
  creditAmount?: number; // Geriye dönük uyumluluk
  price: number; // KDV hariç birim/toplam
  currency?: 'TRY' | 'USD' | 'EUR';
  vatRate: number; // %20
  totalPrice: number; // KDV dahil toplam
  unitPrice: number; // Adet başı maliyet
  isPopular?: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  active?: boolean;
  displayOrder: number;
  expiresInDays?: number; // Opsiyonel kontör geçerlilik süresi (örn: 365 gün)
  createdAt?: string;
}

export interface CreditTxRecord {
  id: string;
  tenantId: string;
  type: CreditTransactionKind;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: 'INVOICE' | 'DESPATCH' | 'ONLINE_PAYMENT' | 'ADMIN_GRANT' | 'REFUND' | 'EXPIRY';
  referenceId?: string;
  description: string;
  performedBy?: string;
  createdAt: string;
}

export type SaasPaymentStatus =
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'SUCCESS'
  | 'FAILED';

export type PaymentType = 'SUBSCRIPTION' | 'CREDIT_PURCHASE' | 'PLAN_UPGRADE';
export type PaymentProviderType = 'MOCK' | 'IYZICO' | 'PAYTR' | 'STRIPE';

export interface Payment {
  id: string;
  tenantId: string;
  subscriptionId?: string;
  paymentProvider: PaymentProviderType;
  providerPaymentId: string; // Gateway transaction token / ID
  orderNumber: string;
  amount: number; // KDV hariç
  currency: 'TRY' | 'USD' | 'EUR';
  vatAmount: number;
  totalAmount: number; // KDV dahil
  status: SaasPaymentStatus;
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
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export type BillingInvoiceStatus =
  | 'draft'
  | 'issued'
  | 'paid'
  | 'past_due'
  | 'cancelled'
  | 'refunded';

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
  invoiceNumber: string; // ISB-2026-00001
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  status: BillingInvoiceStatus;
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
  limitValue: number; // -1 = Unlimited
  isHardLimit: boolean;
  updatedAt: string;
}

export type DealerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface Dealer {
  id: string;
  parentDealerId?: string | null; // Alt bayi hiyerarşisi için
  name: string;
  code: string; // Örn: 'BAYI-001'
  email: string;
  phone?: string;
  contactPerson?: string;
  taxNumber?: string;
  taxOffice?: string;
  city?: string;
  commissionRate: number; // % cinsinden örn: 20 (%20)
  balance: number; // Toplam birikmiş / hakediş bakiyesi
  status: DealerStatus;
  externalSource?: string;
  externalDealerId?: string;
  createdAt: string;
  updatedAt: string;
}

export type DealerCommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';

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
  status: DealerCommissionStatus;
  notes?: string;
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
}

export type PaymentOrderStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type PaymentOrderType = 'PLAN_UPGRADE' | 'CREDIT_PURCHASE';

export interface PaymentOrder {
  id: string;
  tenantId: string;
  orderType: PaymentOrderType;
  orderNumber: string;
  amount: number;
  currency: string;
  planSlug?: string;
  billingPeriod?: 'MONTHLY' | 'YEARLY';
  creditPackageId?: string;
  creditAmount?: number;
  paymentMethod: 'CREDIT_CARD' | 'BANK_TRANSFER';
  status: PaymentOrderStatus;
  paymentGateway: 'MOCK' | 'IYZICO' | 'PAYTR';
  gatewayTransactionId?: string;
  cardLast4?: string;
  paidAt?: string;
  receiptInvoiceId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 6: MOBİL UYGULAMA + SAHA TAHSİLAT + POS + BANKA + QR + BİLDİRİM TİPLERİ
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
  clientTransactionId: string; // Idempotency key
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
  matchScore: number; // 0 - 100
  matchRules: string[];
  status: BankMatchStatus;
  reconciledAt?: string;
  reconciledBy?: string;
  notes?: string;
  createdAt: string;
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
  tokenHash: string;
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

export interface MobileSyncQueue {
  id: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  clientTransactionId: string;
  operationType: 'CREATE_COLLECTION' | 'CREATE_VISIT' | 'STOCK_COUNT' | 'UPDATE_CUSTOMER';
  payload: any;
  status: 'PENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED';
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface PushNotificationRecord {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  eventType: 'NEW_COLLECTION' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'NEW_ORDER' | 'STOCK_ALERT' | 'OVERDUE_MATURITY';
  data?: Record<string, any>;
  isRead: boolean;
  isSent: boolean;
  channel: 'PUSH' | 'SMS' | 'EMAIL';
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
  countNumber: string; // SAY-2026-00001
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
  riskScore: number; // 0 (en riskli) - 100 (en güvenilir)
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  totalDebt: number;
  overdueDebt: number;
  maxOverdueDays: number;
  paymentHabitScore: number;
  suggestedAction: string;
  evaluatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 7: AI MUHASEBE + OCR + AKILLI FİNANS + OTOMASYON + MALİ MÜŞAVİR MODELLERİ
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

export interface AIInteraction {
  id: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
  requestType: 'CHAT' | 'DOCUMENT_OCR' | 'CASH_FORECAST' | 'ANOMALY_DETECTION' | 'RISK_ANALYSIS';
  inputSummary: string;
  outputSummary: string;
  model: string;
  confidence?: number;
  createdAt: string;
}

export interface AIUsage {
  id: string;
  tenantId: string;
  userId: string;
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  period: string; // YYYY-MM
  createdAt: string;
}

export type RecommendationType =
  | 'COLLECTION_REMINDER'
  | 'STOCK_REORDER'
  | 'BANK_RECONCILIATION'
  | 'MISSING_DOCUMENT'
  | 'CASH_DEFICIT_WARNING'
  | 'TAX_OPTIMIZATION';

export interface AIRecommendation {
  id: string;
  tenantId: string;
  userId?: string;
  type: RecommendationType;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  sourceType: 'CUSTOMER' | 'INVOICE' | 'STOCK' | 'BANK_TX';
  sourceId?: string;
  suggestedPayload?: any;
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'APPLIED';
  expiresAt?: string;
  createdAt: string;
}

export interface AIAnomaly {
  id: string;
  tenantId: string;
  anomalyType:
    | 'UNUSUAL_HIGH_AMOUNT'
    | 'UNUSUAL_TIME'
    | 'DUPLICATE_INVOICE_SUSPICION'
    | 'SUDDEN_STOCK_DROP'
    | 'VAT_MISMATCH'
    | 'SUSPICIOUS_EXPENSE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  sourceRecordType: 'INVOICE' | 'EXPENSE' | 'STOCK_MOVEMENT' | 'BANK_TX';
  sourceRecordId: string;
  confidence: number;
  isResolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface AIPrediction {
  id: string;
  tenantId: string;
  predictionType: 'CASH_FLOW' | 'SALES_VOLUME' | 'STOCK_DEPLETION';
  targetType?: string;
  targetId?: string;
  period: '7_DAYS' | '30_DAYS' | '90_DAYS';
  predictedValue: number;
  currency?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  breakdown?: Record<string, any>;
  explanation: string[];
  createdAt: string;
}

export type DocumentTypeEnum = 'INVOICE' | 'RECEIPT' | 'WAYBILL' | 'BANK_STATEMENT' | 'CONTRACT' | 'OTHER';
export type DocumentAIJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVIEWED';

export interface DocumentAIField {
  fieldName: string;
  fieldLabel: string;
  fieldValue: string | number;
  confidence: number; // 0 - 100
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
  documentType: DocumentTypeEnum;
  status: DocumentAIJobStatus;
  overallConfidence: number; // 0 - 100
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

export interface AutomationRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isActive: boolean;
  triggerEvent:
    | 'INVOICE_OVERDUE'
    | 'PAYMENT_RECEIVED'
    | 'STOCK_LOW'
    | 'BANK_TX_UNMATCHED'
    | 'DOCUMENT_MISSING'
    | 'LARGE_EXPENSE_CREATED';
  conditions: Array<{
    field: string;
    operator: 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';
    value: any;
  }>;
  actionType: 'SEND_NOTIFICATION' | 'SEND_EMAIL' | 'TRIGGER_WEBHOOK' | 'CREATE_TASK';
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
  secret: string; // HMAC secret
  events: string[];
  isActive: boolean;
  lastDeliveryStatus?: 'SUCCESS' | 'FAILED';
  lastDeliveryAt?: string;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  tenantId: string;
  webhookId: string;
  event: string;
  payload: any;
  responseStatus?: number;
  responseBody?: string;
  attemptCount: number;
  status: 'DELIVERED' | 'FAILED' | 'RETRYING';
  deliveredAt?: string;
  createdAt: string;
}

export interface AccountantClient {
  id: string;
  accountantUserId: string; // Mali Müşavir User ID
  tenantId: string; // Müşteri Firma Tenant ID
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
  documentType: DocumentTypeEnum;
  period: string; // YYYY-MM
  description: string;
  status: 'PENDING' | 'UPLOADED' | 'APPROVED' | 'REJECTED';
  uploadedFileUrl?: string;
  uploadedAt?: string;
  dueDate: string;
  createdAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// FAZ 8: MÜŞTERİ PORTALI + BELGE MERKEZİ + GÖREV & ONAY + İLETİŞİM + MOBİL
// ──────────────────────────────────────────────────────────────────────────

export interface DocumentVersion {
  versionNumber: number; // 1, 2, 3 ...
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
  category:
    | 'INCOMING_INVOICE'
    | 'OUTGOING_INVOICE'
    | 'EXPENSE_RECEIPT'
    | 'BANK_STATEMENT'
    | 'BANK_RECEIPT'
    | 'CONTRACT'
    | 'PAYROLL'
    | 'TAX_DOCUMENT'
    | 'OTHER';
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

export interface TaskComment {
  id: string;
  taskId: string;
  tenantId: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: string;
}

export interface ApprovalRule {
  id: string;
  tenantId: string;
  documentType: 'INVOICE' | 'EXPENSE' | 'COLLECTION' | 'PAYMENT' | 'PURCHASE_ORDER';
  minAmount: number;
  maxAmount: number;
  approverRole: 'MANAGER' | 'GENERAL_MANAGER' | 'OWNER' | 'ACCOUNTANT';
  approvalOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  entityType: 'INVOICE' | 'EXPENSE' | 'COLLECTION' | 'PAYMENT' | 'PURCHASE_ORDER';
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
  category: 'E_FATURA' | 'CARI' | 'BANKA' | 'MOBIL' | 'GENEL';
  subject: string;
  description: string;
  priority: 'NORMAL' | 'PRIORITY' | 'PREMIUM';
  status: 'OPEN' | 'IN_REVIEW' | 'WAITING' | 'RESOLVED' | 'CLOSED';
  userEmail: string;
  responses: Array<{
    id: string;
    sender: 'USER' | 'SUPPORT_AGENT' | 'AI';
    message: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
  id: string;
  category: 'E_FATURA' | 'E_ARSIV' | 'CARI' | 'FATURA' | 'KASA_BANKA' | 'MOBIL';
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
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'UPLOAD' | 'SHARE' | 'LOGIN';
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
// FAZ 9: SAAS TİCARİ PLATFORM + BAYİ + MARKETPLACE + API + WHITE-LABEL MODELLERİ
// ──────────────────────────────────────────────────────────────────────────

export interface FeatureFlagConfig {
  id: string;
  key: 'ai_assistant' | 'ocr' | 'e_invoice' | 'bank_integration' | 'api_access' | 'white_label' | string;
  name: string;
  description: string;
  isEnabledGlobally: boolean;
  rolloutPercentage: number; // 0 - 100
  allowedPlans: string[];
  allowedTenantIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaaSPlanItem {
  id: string;
  slug: string; // 'starter' | 'pro' | 'kurumsal' | 'musavir' | 'enterprise'
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
  createdAt: string;
  updatedAt: string;
}

export interface TenantUsageMeter {
  id: string;
  tenantId: string;
  period: string; // YYYY-MM
  invoiceCount: number;
  eDocumentCount: number;
  ocrCount: number;
  aiTokensCount: number;
  smsCount: number;
  storageUsedMb: number;
  apiRequestsCount: number;
  webhookEventsCount: number;
  updatedAt: string;
}

export interface AutoTopupRule {
  id: string;
  tenantId: string;
  triggerThreshold: number; // örn: 50 kontör
  purchaseQuantity: number; // örn: 100 kontör
  paymentMethodToken: string;
  isActive: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
}

export type PartnerRole = 'MAIN_PLATFORM' | 'DEALER' | 'SUB_DEALER';

export interface PartnerNode {
  id: string;
  parentPartnerId?: string | null;
  role: PartnerRole;
  code: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  taxNumber?: string;
  defaultCommissionRate: number; // %20
  walletBalance: number;
  pendingCommission: number;
  paidCommissionTotal: number;
  assignedTenantIds: string[];
  subDealerIds?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionRuleRecord {
  id: string;
  ruleName: string;
  targetService: 'SUBSCRIPTION_NEW' | 'SUBSCRIPTION_RENEWAL' | 'CREDIT_PURCHASE' | 'MARKETPLACE_APP';
  commissionRate: number; // % örn: 20
  partnerRole?: PartnerRole;
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
  paidAt?: string;
  createdAt: string;
}

export interface PromoCoupon {
  id: string;
  code: string; // 'ILKAY10', 'YAZ2026'
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  maxRedemptions: number;
  currentRedemptions: number;
  perTenantLimit: number;
  minAmount?: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  createdAt: string;
}

export interface ReferralProgramRecord {
  id: string;
  inviterTenantId: string;
  referralCode: string;
  invitedTenantId?: string;
  status: 'INVITED' | 'REGISTERED' | 'CONVERTED';
  inviterRewardCredits: number; // 100 AI kredisi
  inviteeRewardCredits: number; // 50 AI kredisi
  rewardGranted: boolean;
  createdAt: string;
  convertedAt?: string;
}

export interface MarketplaceAppItem {
  id: string;
  slug: string;
  name: string;
  category: 'BANKA' | 'ODEME' | 'E_DONUSUM' | 'KARGO' | 'E_TICARET' | 'CRM' | 'POS' | 'IK' | 'BORDRO' | 'DEPO' | 'API' | 'AI';
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
  status: 'DRAFT' | 'TESTING' | 'PUBLISHED' | 'DEPRECATED' | 'RETIRED';
  requiredScopes: string[];
  createdAt: string;
}

export interface TenantIntegrationConnection {
  id: string;
  tenantId: string;
  appSlug: string;
  appName: string;
  category: string;
  isConnected: boolean;
  credentialsEncrypted?: Record<string, string>;
  syncSettings?: Record<string, any>;
  lastSyncAt?: string;
  lastHealthStatus: 'HEALTHY' | 'WARNING' | 'ERROR';
  connectedAt: string;
}

export interface IntegrationSyncJobRecord {
  id: string;
  tenantId: string;
  appSlug: string;
  direction: 'INCOMING' | 'OUTGOING' | 'BIDIRECTIONAL';
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage?: string;
  durationMs: number;
  createdAt: string;
}

export interface ApiApplication {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  allowedOrigins: string[];
  isActive: boolean;
  createdAt: string;
}

export interface ApiKeyCredential {
  id: string;
  tenantId: string;
  applicationId: string;
  name: string;
  keyPrefix: string; // 'isb_live_' | 'isb_test_'
  keyFingerprint: string; // SHA-256 hash
  scopes: string[];
  rateLimitTier: 'BASIC' | 'PRO' | 'ENTERPRISE';
  lastUsedAt?: string;
  expiresAt?: string;
  isRevoked: boolean;
  createdAt: string;
}

export interface ApiUsageLog {
  id: string;
  tenantId: string;
  applicationId?: string;
  endpoint: string;
  method: string;
  httpStatus: number;
  latencyMs: number;
  ipAddress: string;
  requestId: string;
  createdAt: string;
}

export interface WebhookSubscriptionItem {
  id: string;
  tenantId: string;
  url: string;
  secretHash: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  createdAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  tenantId: string;
  subscriptionId: string;
  event: string;
  payloadSnippet: string;
  httpStatus?: number;
  status: 'SUCCESS' | 'RETRYING' | 'DEAD_LETTER';
  retryAttempt: number;
  nextRetryAt?: string;
  errorMessage?: string;
  deliveredAt?: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface CustomDomainVerification {
  id: string;
  tenantId: string;
  domain: string; // 'muhasebe.musterifirma.com'
  verificationToken: string;
  dnsStatus: 'VERIFIED' | 'PENDING' | 'FAILED';
  sslStatus: 'ACTIVE' | 'ISSUING' | 'PENDING';
  verifiedAt?: string;
  createdAt: string;
}

export interface BrandEmailConfig {
  id: string;
  tenantId: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPasswordEncrypted: string;
  isVerified: boolean;
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  content: string;
  targetAudience: 'ALL' | 'SPECIFIC_PLAN' | 'DEALERS' | 'ENTERPRISE';
  targetPlanSlug?: string;
  priority: 'NORMAL' | 'URGENT';
  isActive: boolean;
  createdAt: string;
}

export interface SystemHealthIndicator {
  serviceName: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'DOWN';
  latencyMs: number;
  uptimePercentage: number;
  lastCheckedAt: string;
  message?: string;
}

export interface TenantSuccessMetric {
  tenantId: string;
  companyName: string;
  planSlug: string;
  healthScore: number; // 0 - 100
  churnRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  lastActivityAt: string;
  activeUsersCount: number;
  monthlyRevenue: number;
  suggestedUpgradePlan?: string;
}

export interface TenantDataExportJob {
  id: string;
  tenantId: string;
  requestedByUserId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileUrl?: string;
  fileSizeBytes?: number;
  expiresAt?: string;
  createdAt: string;
  completedAt?: string;
}
