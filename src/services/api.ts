import type {
  User,
  Customer,
  Product,
  Invoice,
  Quote,
  Order,
  Waybill,
  Expense,
  ExpenseCategory,
  CashRegister,
  CashTransaction,
  BankAccount,
  BankTransaction,
  CheckNote,
  Employee,
  Company,
  AuditLog,
  Tenant,
  ExternalCustomer,
  IntegrationSyncLog,
  HizliBilisimSettings,
  SubscriptionPlan,
  Subscription,
  ProrationResult,
  CreditWallet,
  CreditPackage,
  CreditTxRecord,
  Payment,
  BillingInvoice,
  UsageRecord,
  Dealer,
  DealerCommission,
  SaasKpis,
  FieldCollection,
  FieldCollectionReceipt,
  CustomerVisit,
  PosTransaction,
  BankMatchSuggestion,
  BankTransactionMatch,
  PaymentLink,
  MobileDevice,
  CustomerRiskScore,
  FieldAgentPerformance,
  AIConversation,
  AIMessage,
  DocumentAIJob,
  CashFlowForecastResult,
  AuditDeskIssue,
  AccountantClient,
  DocumentRequest,
  AutomationRule,
  AutomationRun,
  WebhookEndpoint,
  DocumentItem,
  PublicShareToken,
  WorkspaceTask,
  ApprovalRule,
  ApprovalRequest,
  TopicConversation,
  TopicMessage,
  SupportTicketFaz8,
  KnowledgeArticle,
  UserDevice,
  ActivityLog,
  OnboardingProgress,
  SaaSPlanItem,
  PartnerNode,
  CommissionPayoutTx,
  PromoCoupon,
  MarketplaceAppItem,
  TenantIntegrationConnection,
  ApiKeyCredential,
  ApiUsageLog,
  WebhookSubscriptionItem,
  WhiteLabelBrandProfile,
  SystemHealthIndicator,
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// FAZ 25.3-F: Teknik HTTP durumlarını kullanıcı dostu Türkçe mesajlara çevirir.
// Kural: Sunucunun kendi mesajı varsa AYNEN korunur; yalnızca boş mesajda fallback devreye girer.
function humanizeHttpError(status: number, serverMessage?: string): string {
  if (serverMessage && serverMessage.trim().length > 0) return serverMessage;
  switch (status) {
    case 400: return 'Gönderilen bilgiler eksik veya hatalı. Lütfen form alanlarını kontrol edip tekrar deneyin.';
    case 401: return 'Oturumunuz sona erdi veya geçersiz. Devam etmek için lütfen yeniden giriş yapın.';
    case 403: return 'Bu işlem için yetkiniz bulunmuyor. Gerekirse sistem yöneticinize danışın.';
    case 404: return 'Aradığınız kayıt bulunamadı. Silinmiş veya taşınmış olabilir.';
    case 409: return 'Bu kayıt zaten mevcut veya işlem çakışıyor. Lütfen bilgileri kontrol edin.';
    case 413: return 'Yüklemeye çalıştığınız içerik çok büyük. Daha küçük bir dosya deneyin.';
    case 429: return 'Çok fazla istek gönderildi. Lütfen kısa bir süre bekleyip tekrar deneyin.';
    case 500: case 502: case 503: case 504: return 'Sunucuda beklenmeyen bir sorun oluştu. Lütfen birkaç dakika sonra tekrar deneyin; sorun sürerse yöneticinize bildirin.';
    default: return 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const token = localStorage.getItem('isbey_token');
    const authHeaders: Record<string, string> = {};
    if (token) {
      authHeaders['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
      ...options,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      if (!res.ok) {
        throw new ApiError(`API sunucusu yanıt vermedi (HTTP ${res.status}). Lütfen backend sunucusunun (Port 4000) aktif olduğundan emin olun.`, res.status);
      }
      throw new ApiError('Sunucudan JSON formatında geçerli bir yanıt alınamadı.', res.status);
    }

    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new ApiError(humanizeHttpError(res.status, data.message), res.status);
    }
    return data;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.message || 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı ve sunucu durumunu kontrol edin.');
  }
}

export const api = {
  updateErpSubscription: (id: string, data: { startDate: string; endDate: string }) => request<{ success: boolean; message: string }>(`/companies/${id}/erp-subscription`, { method: 'PUT', body: JSON.stringify(data) }),
  getUserMemberships: (id: string) => request<{ success: boolean; companies: { id: string; name: string }[]; roles: { id: string; name: string; tenantId?: string; isSystem: boolean }[]; memberships: { tenantId: string; roleIds: string[]; status: string }[] }>(`/users/${id}/memberships`),
  saveUserMembership: (id: string, tenantId: string, data: { roleIds: string[]; status: string }) => request<{ success: boolean; message: string }>(`/users/${id}/memberships/${tenantId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUserMembership: (id: string, tenantId: string) => request<{ success: boolean; message: string }>(`/users/${id}/memberships/${tenantId}`, { method: 'DELETE' }),
  // Auth
  login: (credentials: { username?: string; email?: string; password: string }) =>
    request<{ success: boolean; user: any; token: string; activeTenant?: any; message?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  register: (data: {
    fullName: string;
    email: string;
    phone?: string;
    companyName: string;
    taxNumber?: string;
    taxOffice?: string;
    city?: string;
    password: string;
  }) =>
    request<{ success: boolean; message: string; token: string; user: any; tenant: any; isFirstLogin: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMe: () =>
    request<{ success: boolean; user: any; activeTenant?: any; allowedTenants?: any[] }>('/auth/me'),

  switchCompany: (targetTenantId: string) =>
    request<{ success: boolean; message: string; token: string; user: any; activeTenant: any }>('/auth/switch-company', {
      method: 'POST',
      body: JSON.stringify({ targetTenantId }),
    }),

  // Roles & Permissions (RBAC)
  getRoles: () => request<{ success: boolean; roles: any[] }>('/roles'),
  getRole: (id: string) => request<{ success: boolean; role: any }>(`/roles/${id}`),
  createRole: (data: { name: string; description?: string; permissions: string[] }) =>
    request<{ success: boolean; message: string; role: any }>('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<{ success: boolean; message: string; role: any }>(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRole: (id: string) =>
    request<{ success: boolean; message: string }>(`/roles/${id}`, { method: 'DELETE' }),
  getPermissions: () => request<{ success: boolean; permissions: any[]; grouped: Record<string, any[]> }>('/permissions'),

  // User Invitations
  getInvitations: () => request<{ success: boolean; invitations: any[] }>('/invitations'),
  createInvitation: (data: { email: string; fullName?: string; roleSlug: string }) =>
    request<{ success: boolean; message: string; invitation: any }>('/invitations', { method: 'POST', body: JSON.stringify(data) }),
  verifyInvitation: (token: string) =>
    request<{ success: boolean; invitation: any; message?: string }>(`/invitations/verify/${token}`),
  acceptInvitation: (data: { token: string; fullName?: string; password: string }) =>
    request<{ success: boolean; message: string; token: string; user: any }>('/invitations/accept', { method: 'POST', body: JSON.stringify(data) }),

  // Platform Admin Impersonation
  impersonateTenant: (targetTenantId: string, reason?: string) =>
    request<{ success: boolean; message: string; token: string; impersonatedTenant: any; sessionId: string }>('/admin/impersonate', {
      method: 'POST',
      body: JSON.stringify({ targetTenantId, reason }),
    }),
  stopImpersonation: () =>
    request<{ success: boolean; message: string; token: string; activeTenant: any }>('/admin/impersonate/stop', {
      method: 'POST',
    }),

  // Dashboard
  getDashboardSummary: () => request<{ success: boolean; data: any }>('/dashboard/summary'),

  // Customers & Suppliers
  getCustomers: (params?: { type?: string; search?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ success: boolean; customers: Customer[] }>(`/customers?${query}`);
  },
  getCustomer: (id: string) => request<{ success: boolean; customer: Customer }>(`/customers/${id}`),
  getCustomerStatement: (id: string) => request<{ success: boolean; customer: Customer; statement: any[]; summary: any }>(`/customers/${id}/statement`),
  createCustomer: (data: Partial<Customer>) => request<{ success: boolean; customer: Customer; message: string }>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: Partial<Customer>) => request<{ success: boolean; customer: Customer; message: string }>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Products & Stock
  getProducts: (params?: { groupId?: string; warehouseId?: string; search?: string; criticalOnly?: boolean }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{ success: boolean; products: Product[] }>(`/products?${query}`);
  },
  getProductByBarcode: (barcode: string) => request<{ success: boolean; product: Product }>(`/products/barcode/${barcode}`),
  getProductMeta: () => request<{ success: boolean; groups: any[]; warehouses: any[] }>('/products/meta/groups-warehouses'),
  getProductDetail: (id: string) => request<{ success: boolean; product: Product; movements: any[] }>(`/products/${id}`),
  createProduct: (data: any) => request<{ success: boolean; product: Product; message: string }>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: any) => request<{ success: boolean; product: Product; message: string }>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adjustStock: (data: any) => request<{ success: boolean; movement: any; message: string }>('/products/adjust', { method: 'POST', body: JSON.stringify(data) }),
  transferStock: (data: any) => request<{ success: boolean; message: string }>('/products/transfer', { method: 'POST', body: JSON.stringify(data) }),

  // Invoices & Sales
  getInvoices: (params?: { type?: string; customerId?: string; status?: string; search?: string; startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{ success: boolean; invoices: Invoice[] }>(`/invoices?${query}`);
  },
  getInvoice: (id: string) => request<{ success: boolean; invoice: Invoice }>(`/invoices/${id}`),
  createInvoice: (data: any) => request<{ success: boolean; invoice: Invoice; message: string }>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  deleteInvoice: (id: string) => request<{ success: boolean; message: string }>(`/invoices/${id}`, { method: 'DELETE' }),
  duplicateInvoice: (id: string) => request<{ success: boolean; invoice: Invoice; message: string }>(`/invoices/${id}/duplicate`, { method: 'POST' }),
  convertInvoiceToReturn: (id: string) => request<{ success: boolean; invoice: Invoice; message: string }>(`/invoices/${id}/convert-return`, { method: 'POST' }),

  // Cash Registers
  getCashRegisters: () => request<{ success: boolean; cashRegisters: CashRegister[] }>('/cash'),
  getCashTransactions: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; transactions: CashTransaction[] }>(`/cash/transactions?${query}`);
  },
  createCashTransaction: (data: any) => request<{ success: boolean; transaction: CashTransaction; message: string }>('/cash/transaction', { method: 'POST', body: JSON.stringify(data) }),
  transferCashToBank: (data: any) => request<{ success: boolean; message: string }>('/cash/transfer-to-bank', { method: 'POST', body: JSON.stringify(data) }),

  // Bank Accounts
  getBankAccounts: () => request<{ success: boolean; bankAccounts: BankAccount[] }>('/banks'),
  getBankTransactions: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; transactions: BankTransaction[] }>(`/banks/transactions?${query}`);
  },
  createBankTransaction: (data: any) => request<{ success: boolean; transaction: BankTransaction; message: string }>('/banks/transaction', { method: 'POST', body: JSON.stringify(data) }),
  transferBankToCash: (data: any) => request<{ success: boolean; message: string }>('/banks/transfer-to-cash', { method: 'POST', body: JSON.stringify(data) }),

  // Checks & Notes
  getChecksNotes: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; checksNotes: CheckNote[] }>(`/checks?${query}`);
  },
  createCheckNote: (data: any) => request<{ success: boolean; checkNote: CheckNote; message: string }>('/checks', { method: 'POST', body: JSON.stringify(data) }),
  updateCheckStatus: (id: string, data: any) => request<{ success: boolean; checkNote: CheckNote; message: string }>(`/checks/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Employees
  getEmployees: () => request<{ success: boolean; employees: Employee[] }>('/employees'),
  createEmployee: (data: any) => request<{ success: boolean; employee: Employee; message: string }>('/employees', { method: 'POST', body: JSON.stringify(data) }),
  payEmployee: (id: string, data: any) => request<{ success: boolean; transaction: any; message: string }>(`/employees/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),

  // Reports
  getProfitLossReport: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; data: any }>(`/reports/profit-loss?${query}`);
  },
  getAgingReport: () => request<{ success: boolean; report: any[] }>('/reports/aging'),
  getStockValuationReport: () => request<{ success: boolean; report: any[]; totals: any }>('/reports/stock-valuation'),
  getCashFlowReport: () => request<{ success: boolean; months: any[]; summary: any }>('/reports/cash-flow'),
  getVatReport: (params?: any) => { const query = new URLSearchParams(params).toString(); return request<{ success: boolean; rows: any[]; totals: any }>(`/reports/vat-report?${query}`); },
  getExpenseReport: (params?: any) => { const query = new URLSearchParams(params).toString(); return request<{ success: boolean; rows: any[]; byCategory: any[]; totals: any }>(`/reports/expense-report?${query}`); },
  getCollectionReport: (params?: any) => { const query = new URLSearchParams(params).toString(); return request<{ success: boolean; data: any; details: any }>(`/reports/collection-report?${query}`); },

  // Cost Centers
  getCostCenters: () => request<{ success: boolean; costCenters: any[] }>('/cost-centers'),
  createCostCenter: (data: any) => request<{ success: boolean; costCenter: any; message: string }>('/cost-centers', { method: 'POST', body: JSON.stringify(data) }),
  updateCostCenter: (id: string, data: any) => request<{ success: boolean; costCenter: any; message: string }>(`/cost-centers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCostCenter: (id: string) => request<{ success: boolean; message: string }>(`/cost-centers/${id}`, { method: 'DELETE' }),
  getCostCenterExpenses: (id: string, params?: any) => { const query = new URLSearchParams(params).toString(); return request<{ success: boolean; expenses: any[]; summary: any }>(`/cost-centers/${id}/expenses?${query}`); },

  // AI Assistant
  getAIInsights: () => request<{ success: boolean; insights: any }>('/ai/insights'),

  // Quotes & Orders
  getQuotes: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; quotes: Quote[] }>(`/quotes?${query}`);
  },
  getQuoteById: (id: string) => request<{ success: boolean; quote: Quote }>(`/quotes/${id}`),
  createQuote: (data: any) => request<{ success: boolean; quote: Quote; message: string }>('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  updateQuoteStatus: (id: string, status: string) => request<{ success: boolean; quote: Quote; message: string }>(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  convertQuoteToOrder: (id: string, data?: any) => request<{ success: boolean; message: string; data: any }>(`/quotes/${id}/convert-to-order`, { method: 'POST', body: JSON.stringify(data || {}) }),
  convertQuoteToInvoice: (id: string) => request<{ success: boolean; message: string; data: any }>(`/quotes/${id}/convert-to-invoice`, { method: 'POST' }),
  getOrders: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; orders: Order[] }>(`/quotes/orders/list?${query}`);
  },
  getOrderById: (id: string) => request<{ success: boolean; order: Order }>(`/quotes/orders/${id}`),
  createOrder: (data: any) => request<{ success: boolean; order: Order; message: string }>('/quotes/orders', { method: 'POST', body: JSON.stringify(data) }),
  convertOrderToWaybill: (id: string, data?: any) => request<{ success: boolean; message: string; data: any }>(`/quotes/orders/${id}/convert-to-waybill`, { method: 'POST', body: JSON.stringify(data || {}) }),

  // Waybills
  getWaybills: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; waybills: Waybill[] }>(`/waybills?${query}`);
  },
  createWaybill: (data: any) => request<{ success: boolean; waybill: Waybill; message: string }>('/waybills', { method: 'POST', body: JSON.stringify(data) }),
  convertWaybillToInvoice: (id: string) => request<{ success: boolean; message: string; data: any }>(`/waybills/${id}/convert-to-invoice`, { method: 'POST' }),
  bulkWaybillToInvoice: (waybillIds: string[]) => request<{ success: boolean; message: string; data: any }>('/waybills/bulk-invoice', { method: 'POST', body: JSON.stringify({ waybillIds }) }),

  // Expenses
  getExpenses: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; expenses: Expense[]; summary: any }>(`/expenses?${query}`);
  },
  getExpenseCategories: () => request<{ success: boolean; categories: ExpenseCategory[] }>('/expenses/categories'),
  createExpenseCategory: (data: any) => request<{ success: boolean; category: ExpenseCategory; message: string }>('/expenses/categories', { method: 'POST', body: JSON.stringify(data) }),
  createExpense: (data: any) => request<{ success: boolean; expense: Expense; message: string }>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  deleteExpense: (id: string) => request<{ success: boolean; message: string }>(`/expenses/${id}`, { method: 'DELETE' }),

  // Users & RBAC
  getUsers: () => request<{ success: boolean; users: User[] }>('/users'),
  createUser: (data: any) => request<{ success: boolean; user: User; message: string }>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request<{ success: boolean; user: User; message: string }>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<{ success: boolean; message: string }>(`/users/${id}`, { method: 'DELETE' }),

  // E-Invoice & E-Arşiv
  getEInvoiceXml: (invoiceId: string) => fetch(`${API_BASE}/efatura/${invoiceId}/xml`).then(r => r.text()),
  getEInvoiceStatus: (invoiceId: string) => request<{ success: boolean; eInvoice: any }>(`/efatura/${invoiceId}/status`),

  // Batch Import
  importCustomers: (rows: any[]) => request<{ success: boolean; message: string }>('/import/customers', { method: 'POST', body: JSON.stringify({ rows }) }),
  importProducts: (rows: any[]) => request<{ success: boolean; message: string }>('/import/products', { method: 'POST', body: JSON.stringify({ rows }) }),

  // Settings & Audit Logs
  getSettings: () => request<{ success: boolean; company: Company; sequences: any; settings: any }>('/settings'),
  getCompany: () => request<{ success: boolean; company: Company; sequences: any; settings: any }>('/settings'),
  updateCompany: (data: Partial<Company>) => request<{ success: boolean; company: Company; message: string }>('/settings/company', { method: 'PUT', body: JSON.stringify(data) }),

  updateSequences: (data: any) => request<{ success: boolean; message: string }>('/settings/sequences', { method: 'PUT', body: JSON.stringify({ sequences: data }) }),
  updateSystemSettings: (data: any) => request<{ success: boolean; settings: any; message: string }>('/settings/system', { method: 'PUT', body: JSON.stringify(data) }),
  createBackup: () => request<{ success: boolean; filename: string; message: string }>('/settings/backup', { method: 'POST' }),
  getAuditLogs: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return request<{ success: boolean; auditLogs: AuditLog[] }>(`/settings/audit-logs?${query}`);
  },

  // Global Search (F10)
  globalSearch: (q: string, type: string = 'all') =>
    request<{ success: boolean; query: string; totalCount: number; categories: any[] }>(
      `/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`
    ),

  // Offline Sync
  syncOfflineBatch: (actions: any[]) => request<{ success: boolean; processed: number; message: string }>('/sync/batch', { method: 'POST', body: JSON.stringify({ actions }) }),

  // Form Designs
  getFormDesigns: (documentType?: string) => {
    const query = documentType ? `?documentType=${encodeURIComponent(documentType)}` : '';
    return request<{ success: boolean; formDesigns: any[]; total: number }>(`/form-designs${query}`);
  },
  getFormDesign: (id: string) =>
    request<{ success: boolean; formDesign: any }>(`/form-designs/${id}`),
  createFormDesign: (data: any) =>
    request<{ success: boolean; formDesign: any }>('/form-designs', { method: 'POST', body: JSON.stringify(data) }),
  updateFormDesign: (id: string, data: any) =>
    request<{ success: boolean; formDesign: any }>(`/form-designs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFormDesign: (id: string) =>
    request<{ success: boolean; message: string }>(`/form-designs/${id}`, { method: 'DELETE' }),
  setDefaultFormDesign: (id: string) =>
    request<{ success: boolean; message: string }>(`/form-designs/${id}/default`, { method: 'POST' }),
  duplicateFormDesign: (id: string) =>
    request<{ success: boolean; formDesign: any }>(`/form-designs/${id}/duplicate`, { method: 'POST' }),
  exportFormDesign: (id: string) =>
    request<any>(`/form-designs/${id}/export`),
  importFormDesign: (data: any) =>
    request<{ success: boolean; formDesign: any }>('/form-designs/import', { method: 'POST', body: JSON.stringify(data) }),

  // FAZ 25.3-A: Fatura Tasarım Modülü (Invoice Design)
  getInvoiceDesigns: () =>
    request<{ success: boolean; invoiceDesigns: any[]; total: number }>('/invoice-designs'),
  getInvoiceDesign: (id: string) =>
    request<{ success: boolean; invoiceDesign: any }>(`/invoice-designs/${id}`),
  createInvoiceDesign: (data: any) =>
    request<{ success: boolean; invoiceDesign: any }>('/invoice-designs', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoiceDesign: (id: string, data: any) =>
    request<{ success: boolean; invoiceDesign: any }>(`/invoice-designs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInvoiceDesign: (id: string) =>
    request<{ success: boolean; message: string }>(`/invoice-designs/${id}`, { method: 'DELETE' }),
  setDefaultInvoiceDesign: (id: string) =>
    request<{ success: boolean; message: string }>(`/invoice-designs/${id}/set-default`, { method: 'POST' }),

  // FAZ 25.3-B: Rapor Tasarım Merkezi (Report Design)
  getReportDesigns: () =>
    request<{ success: boolean; reportDesigns: any[]; total: number; error?: string }>('/report-designs'),
  getReportDesign: (id: string) =>
    request<{ success: boolean; reportDesign: any; error?: string }>(`/report-designs/${id}`),
  createReportDesign: (data: any) =>
    request<{ success: boolean; reportDesign: any; error?: string }>('/report-designs', { method: 'POST', body: JSON.stringify(data) }),
  updateReportDesign: (id: string, data: any) =>
    request<{ success: boolean; reportDesign: any; error?: string }>(`/report-designs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReportDesign: (id: string) =>
    request<{ success: boolean; message: string; error?: string }>(`/report-designs/${id}`, { method: 'DELETE' }),

  // Multi-Tenant & Company Management
  getCompanies: (params?: any) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<{
      success: boolean;
      companies: Tenant[];
      activeCompanyId: string;
      kpis: {
        totalCompanies: number;
        activeCompanies: number;
        passiveCompanies: number;
        trialCompanies: number;
        expiringSoon: number;
        expiredCompanies: number;
        totalActiveUsers: number;
        newThisMonth: number;
        totalMRR: number;
      };
    }>(`/admin/companies${query}`);
  },
  getCompanyDetail: (id: string) =>
    request<{
      success: boolean;
      company: Tenant;
      details: {
        users: User[];
        auditLogs: AuditLog[];
        sessions: any[];
        warehouses: any[];
        cashRegisters: any[];
        bankAccounts: any[];
      };
    }>(`/admin/companies/${id}`),
  createCompany: (data: any) =>
    request<{ success: boolean; company: Tenant; message: string }>('/admin/companies', { method: 'POST', body: JSON.stringify(data) }),
  updateAdminCompany: (id: string, data: any) =>
    request<{ success: boolean; company: Tenant; message: string }>(`/admin/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateCompanyStatus: (id: string, status: string) =>
    request<{ success: boolean; company: Tenant; message: string }>(`/admin/companies/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  updateCompanyServices: (id: string, data: { action: string; serviceCode: string; startDate?: string; endDate?: string; limit?: number; notes?: string }) =>
    request<{ success: boolean; company: Tenant; message: string }>(`/admin/companies/${id}/services`, { method: 'POST', body: JSON.stringify(data) }),
  updateCompanyLicense: (id: string, data: any) =>
    request<{ success: boolean; company: Tenant; message: string }>(`/admin/companies/${id}/license`, { method: 'POST', body: JSON.stringify(data) }),
  adminSwitchCompany: (id: string) =>
    request<{ success: boolean; activeCompanyId: string; company: Tenant; message: string }>(`/admin/companies/${id}/switch`, { method: 'POST' }),
  deleteCompany: (id: string, data: { confirmCode: string; hardDelete?: boolean }) =>
    request<{ success: boolean; message: string }>(`/admin/companies/${id}/delete`, { method: 'POST', body: JSON.stringify(data) }),
  bulkCompanyAction: (data: { companyIds: string[]; action: string; serviceCode?: string }) =>
    request<{ success: boolean; message: string }>('/admin/companies/bulk-action', { method: 'POST', body: JSON.stringify(data) }),

  // Admin User Management & Security
  getAdminUsers: (params?: any) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<{ success: boolean; users: User[]; totalUsers: number; activeUsers: number }>(`/admin/users${query}`);
  },
  getAdminUser: (id: string) =>
    request<{ success: boolean; user: User; sessions: any[] }>(`/admin/users/${id}`),
  createAdminUser: (data: any) =>
    request<{ success: boolean; user: User; resetLink?: string; message: string }>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateAdminUser: (id: string, data: any) =>
    request<{ success: boolean; user: User; message: string }>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleUserStatus: (id: string, active: boolean) =>
    request<{ success: boolean; user: User; message: string }>(`/admin/users/${id}/toggle-status`, { method: 'POST', body: JSON.stringify({ active }) }),
  resetUserPassword: (id: string, newPassword?: string) =>
    request<{ success: boolean; token?: string; resetLink?: string; message: string }>(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  revokeUserSessions: (id: string) =>
    request<{ success: boolean; message: string }>(`/admin/users/${id}/revoke-sessions`, { method: 'POST' }),
  deleteAdminUser: (id: string) =>
    request<{ success: boolean; message: string }>(`/admin/users/${id}`, { method: 'DELETE' }),

  // Service & Plan Catalogs
  getServiceCatalog: () =>
    request<{ success: boolean; services: any[] }>('/admin/services'),
  getPlanCatalog: () =>
    request<{ success: boolean; plans: any[] }>('/admin/services/plans'),
  savePlanCatalog: (data: any) =>
    request<{ success: boolean; plan: any; message: string }>('/admin/services/plans', { method: 'POST', body: JSON.stringify(data) }),

  // Legacy Tenant Aliases
  getTenants: (params?: any) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<{
      success: boolean;
      tenants: Tenant[];
      activeTenantId: string;
      summary: {
        totalTenants: number;
        activeTenants: number;
        trialTenants: number;
        totalCredits: number;
        totalUsers: number;
        totalMRR: number;
      };
    }>(`/tenants${query}`);
  },
  getTenant: (id: string) =>
    request<{ success: boolean; tenant: Tenant }>(`/tenants/${id}`),
  createTenant: (data: any) =>
    request<{ success: boolean; tenant: Tenant; message: string }>('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  updateTenant: (id: string, data: any) =>
    request<{ success: boolean; tenant: Tenant; message: string }>(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addTenantCredits: (id: string, amount: number, notes?: string) =>
    request<{ success: boolean; tenant: Tenant; newCredits: number; message: string }>(`/tenants/${id}/credits`, { method: 'POST', body: JSON.stringify({ amount, notes }) }),
  switchTenant: (id: string) =>
    request<{ success: boolean; activeTenant: Tenant; message: string }>(`/tenants/${id}/switch`, { method: 'POST' }),
  deleteTenant: (id: string) =>
    request<{ success: boolean; message: string }>(`/tenants/${id}`, { method: 'DELETE' }),

  // Hızlı Teknoloji e-Connect Özel Entegratör API
  getHizliConfig: () =>
    request<{ success: boolean; config: any }>('/efatura/hizli/config'),
  // 2026-09-12: Yanıt artık hash DÖNDÜRMEZ (secretKey ile üretilen değerler
  // frontend'e taşınmaz). Yalnız "hash üretildi mi" bilgisi döner.
  encryptHizliCredentials: (data: { secretKey: string; username: string; password: string; isTest?: boolean }) =>
    request<{ success: boolean; hashesObtained?: boolean; isTestMode?: boolean; message?: string }>('/efatura/hizli/encrypt', { method: 'POST', body: JSON.stringify(data) }),
  testHizliConnection: (data?: any) =>
    request<{ success: boolean; token?: string; expireDate?: string; message: string }>('/efatura/hizli/test-connection', { method: 'POST', body: JSON.stringify(data || {}) }),
  checkGibUser: (vkn: string) =>
    request<{ success: boolean; isEInvoiceUser: boolean; title?: string; aliasPk?: string; aliasGb?: string; message?: string }>('/efatura/hizli/check-gib-user', { method: 'POST', body: JSON.stringify({ vkn }) }),
  checkTaxpayer: (vkn: string) =>
    request<{
      success: boolean;
      // 2026-09-12: Mükellefiyet alanları ÜÇ DEĞERLİ — true (mükellef),
      // false (değil), null (DOĞRULANAMADI: yerel kayıt var ama GİB durumu
      // bilinmiyor). Uydurma yerine "bilinmiyor" döndürüldüğü için tüketici
      // null'ı ayrı ele almalıdır.
      source?: 'GIB_ONLINE' | 'YEREL_KAYIT' | null;
      taxpayer: {
        vkn: string;
        title: string;
        isEInvoiceUser: boolean | null;
        isEArchiveUser: boolean | null;
        firstRegistrationDate?: string | null;
        aliases: Array<{ alias: string; type: 'GB' | 'PK'; creationDate?: string }>;
        taxOffice?: string;
        address?: string;
        city?: string;
        district?: string;
      } | null;
      message?: string;
    }>(`/efatura/taxpayer-check/${vkn}`),
  getHizliCredits: () =>
    request<{ success: boolean; totalCredits: number; remainingCredits: number; message: string }>('/efatura/hizli/credits'),
  sendHizliInvoice: (invoiceId: string) =>
    request<{
      success: boolean;
      uuid: string;
      invoiceNumber?: string;
      gibStatusCode?: string | number;
      gibStatusDescription?: string;
      message: string;
    }>('/efatura/hizli/send-invoice', { method: 'POST', body: JSON.stringify({ invoiceId }) }),
  batchSendEInvoices: (invoiceIds: string[]) =>
    request<{ success: boolean; message: string; sentCount: number; results: any[] }>('/efatura/batch-send', {
      method: 'POST',
      body: JSON.stringify({ invoiceIds }),
    }),
  batchSyncEInvoiceStatus: (invoiceIds?: string[]) =>
    request<{ success: boolean; message: string; syncedCount: number; updated: any[] }>('/efatura/batch-status-sync', {
      method: 'POST',
      body: JSON.stringify({ invoiceIds: invoiceIds || [] }),
    }),
  getIncomingEInvoices: () =>
    request<{ success: boolean; incomingInvoices: Invoice[] }>('/efatura/incoming'),
  convertIncomingToPurchase: (id: string, options?: { warehouseId?: string; updateStock?: boolean }) =>
    request<{ success: boolean; message: string }>(`/efatura/incoming/${id}/convert-to-purchase`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),
  // 2026-09-16: Gövde sözleşmeye uyduruldu (docs/43). Sunucu `Documents[]` için
  // gereken DocumentId/DocumentDate'i yerel kayıttan türetir; istemci yalnız
  // belge kimliği + yanıt kodu + neden gönderir.
  sendIncomingCommercialResponse: (data: { uuid: string; responseType: 'KABUL' | 'RED'; reason?: string }) =>
    request<{ success: boolean; message: string }>('/efatura/hizli/application-response', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Hızlı Bilişim Müşteri & Üye Entegrasyonu
  getHizliCustomers: (params?: { status?: string; search?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return request<{
      success: boolean;
      customers: ExternalCustomer[];
      kpis: {
        total: number;
        new: number;
        imported: number;
        userCreated: number;
        matched: number;
        error: number;
      };
      settings?: HizliBilisimSettings;
    }>(`/admin/hizli-bilisim/customers${query}`);
  },
  getHizliCustomer: (id: string) =>
    request<{
      success: boolean;
      customer: ExternalCustomer;
      linkedCompany?: Tenant;
      linkedUser?: User;
      duplicateCheck?: any;
    }>(`/admin/hizli-bilisim/customers/${id}`),
  syncHizliCustomers: () =>
    request<{
      success: boolean;
      totalFetched: number;
      newCount: number;
      updatedCount: number;
      matchedCount: number;
      message: string;
    }>('/admin/hizli-bilisim/sync', { method: 'POST' }),
  convertHizliToCompany: (data: {
    customerId: string;
    plan?: string;
    isTrial?: boolean;
    trialDays?: number;
    createAdminUser?: boolean;
    customAdminUsername?: string;
    customAdminFullName?: string;
    customAdminEmail?: string;
    customAdminPhone?: string;
  }) =>
    request<{
      success: boolean;
      company: Tenant;
      user?: User;
      activationLink?: string;
      message: string;
    }>('/admin/hizli-bilisim/create-company', { method: 'POST', body: JSON.stringify(data) }),
  createHizliUser: (data: { customerId: string; username?: string }) =>
    request<{
      success: boolean;
      user: User;
      activationLink?: string;
      message: string;
    }>('/admin/hizli-bilisim/create-user', { method: 'POST', body: JSON.stringify(data) }),
  matchHizliCompany: (data: { customerId: string; companyId: string }) =>
    request<{ success: boolean; message: string }>('/admin/hizli-bilisim/match-company', { method: 'POST', body: JSON.stringify(data) }),
  bulkConvertHizli: (data: { customerIds: string[]; plan?: string; createAdminUser?: boolean }) =>
    request<{
      success: boolean;
      processed: number;
      successCount: number;
      errors: string[];
      message: string;
    }>('/admin/hizli-bilisim/bulk-convert', { method: 'POST', body: JSON.stringify(data) }),
  testHizliIntegration: () =>
    request<{
      success: boolean;
      serverReachable: boolean;
      authSuccess: boolean;
      // 2026-09-12: backend bu alanı ölçmez; her zaman `null` döner
      // ("ölçülmedi"). Eski `totalRemoteCount` alanı da kaldırıldı — sabit VKN
      // listesinin uzunluğunu "uzak kayıt sayısı" diye raporluyordu.
      customerServiceAvailable: boolean | null;
      message: string;
      latencyMs: number;
    }>('/admin/hizli-bilisim/test-connection', { method: 'POST' }),
  getHizliIntegrationStats: () =>
    request<{
      success: boolean;
      stats: any;
      logs: IntegrationSyncLog[];
      settings?: HizliBilisimSettings;
    }>('/admin/hizli-bilisim/stats'),

  // Hızlı Bilişim Bayi / Mükellef Yönetimi (Plan B)
  getHizliDealers: () =>
    request<{
      success: boolean;
      dealers: Array<{
        id: string;
        companyName: string;
        title: string;
        taxNumber: string;
        taxOffice: string;
        contactName: string;
        phone: string;
        email: string;
        city: string;
        district: string;
        customerType: string;
        status: string;
        wsUsername: string;
        hasWsPassword: boolean;
        connectionStatus: 'ACTIVE' | 'ERROR' | 'PENDING';
        tokenStatus: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NONE';
        tokenExpiresAt: string | null;
        lastLoginAt: string | null;
        isbeyStatus: 'ACTIVE' | 'PENDING' | 'NONE';
        isbeyCompanyId: string | null;
        createdAt: string;
      }>;
      kpis: {
        total: number;
        activeIntegration: number;
        tokenIssue: number;
        pendingSetup: number;
      };
    }>('/admin/hizli-bilisim/dealers'),

  testDealerConnection: (data: { id?: string; wsUsername?: string; wsPassword?: string }) =>
    request<{
      success: boolean;
      message: string;
      expiresAt?: string;
    }>('/admin/hizli-bilisim/dealers/test-connection', { method: 'POST', body: JSON.stringify(data) }),

  refreshDealerToken: (id: string) =>
    request<{
      success: boolean;
      message: string;
      expiresAt?: string;
    }>(`/admin/hizli-bilisim/dealers/${id}/refresh-token`, { method: 'POST' }),

  createHizliDealer: (data: {
    companyName: string;
    title?: string;
    taxNumber: string;
    taxOffice?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    city?: string;
    district?: string;
    address?: string;
    wsUsername?: string;
    wsPassword?: string;
    createIsbeyAccount?: boolean;
  }) =>
    request<{
      success: boolean;
      message: string;
      dealerId?: string;
      connectionStatus?: string;
    }>('/admin/hizli-bilisim/dealers', { method: 'POST', body: JSON.stringify(data) }),

  updateHizliDealer: (id: string, data: any) =>
    request<{
      success: boolean;
      message: string;
    }>(`/admin/hizli-bilisim/dealers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getHizliDealerLogs: () =>
    request<{
      success: boolean;
      logs: Array<{
        id: string;
        provider: string;
        action: string;
        username: string;
        details: string;
        status: 'SUCCESS' | 'ERROR';
        errorMessage?: string;
        createdAt: string;
      }>;
    }>('/admin/hizli-bilisim/dealers/logs'),
  updateHizliIntegrationSettings: (data: Partial<HizliBilisimSettings>) =>
    request<{ success: boolean; settings: HizliBilisimSettings; message: string }>('/admin/hizli-bilisim/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Hızlı Bilişim E-Fatura Portal & Firma Eşleme Matrisi
  getHizliPortalMappingMatrix: () =>
    request<{
      success: boolean;
      matrix: Array<{
        companyId: string;
        companyCode: string;
        companyName: string;
        title: string;
        taxNumber: string;
        taxOffice?: string;
        city?: string;
        plan: string;
        status: string;
        isMatched: boolean;
        matchedCustomer: {
          id: string;
          externalId: string;
          companyName: string;
          status: string;
          syncedAt?: string;
        } | null;
        portalConfig: {
          apiKey: string;
          gbUrn: string;
          pkUrn: string;
          isTestMode: boolean;
          autoCheckGibUser: boolean;
          defaultProfile: string;
          customUsername?: string;
        };
        services: {
          eFatura: boolean;
          eArsiv: boolean;
          eIrsaliye: boolean;
          eDefter: boolean;
          eMustahsil: boolean;
        };
        credits: {
          total: number;
          remaining: number;
          used: number;
        };
        stats: {
          outgoingInvoices: number;
          incomingInvoices: number;
          syncedEInvoices: number;
          lastSyncAt?: string;
        };
      }>;
      summary: {
        totalCompanies: number;
        matchedCompanies: number;
        unmappedCompanies: number;
        totalRemainingCredits: number;
        totalSyncedDocs: number;
        portalConnected: boolean;
        isTestMode: boolean;
        lastSyncAt?: string;
      };
    }>('/admin/hizli-bilisim/portal-mapping-matrix'),

  mapCompanyPortal: (data: {
    companyId: string;
    apiKey?: string;
    username?: string;
    gbUrn?: string;
    pkUrn?: string;
    isTestMode?: boolean;
    autoCheckGibUser?: boolean;
    defaultProfile?: string;
    eInvoiceCredits?: number;
    services?: {
      eFatura?: boolean;
      eArsiv?: boolean;
      eIrsaliye?: boolean;
      eDefter?: boolean;
      eMustahsil?: boolean;
    };
  }) =>
    request<{ success: boolean; message: string }>('/admin/hizli-bilisim/map-company-portal', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  autoMatchPortalMatrix: () =>
    request<{
      success: boolean;
      matchedCount: number;
      matches: Array<{ companyName: string; externalName: string; taxNumber: string }>;
      message: string;
    }>('/admin/hizli-bilisim/auto-match-matrix', { method: 'POST' }),

  syncPortalInvoices: () =>
    request<{
      success: boolean;
      updatedCount: number;
      newIncomingCount: number;
      message: string;
    }>('/admin/hizli-bilisim/sync-portal-invoices', { method: 'POST' }),

  // e-Fatura XSLT Şablonu
  getEInvoiceXsltTemplate: async (type: string = 'EFATURA', code: string = 'general'): Promise<string> => {
    const res = await fetch(`/api/efatura/templates/content?type=${encodeURIComponent(type)}&code=${encodeURIComponent(code)}`);
    if (!res.ok) throw new Error('XSLT şablonu yüklenemedi.');
    return res.text();
  },

  // Profesyonel XSLT Belge Tasarımları (e-Fatura, e-Arşiv, e-İrsaliye, e-SMM)
  getDocumentTemplates: (params?: { documentType?: string; search?: string; companyId?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return request<{ success: boolean; templates: any[]; stats: any }>(`/document-templates${query}`);
  },
  getDocumentTemplate: (id: string) =>
    request<{ success: boolean; template: any; versions: any[] }>(`/document-templates/${id}`),
  createDocumentTemplate: (data: any) =>
    request<{ success: boolean; template: any; message: string }>('/document-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDocumentTemplate: (id: string, data: any) =>
    request<{ success: boolean; template: any; message: string }>(`/document-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteDocumentTemplate: (id: string) =>
    request<{ success: boolean; message: string }>(`/document-templates/${id}`, { method: 'DELETE' }),
  previewDocumentTemplate: (id: string, data?: { customXml?: string; config?: any }) =>
    request<{ success: boolean; html: string }>(`/document-templates/${id}/preview`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  previewCustomDocumentTemplate: (data: { documentType?: string; customXml?: string; config?: any; customXslt?: string }) =>
    request<{ success: boolean; html: string }>('/document-templates/preview-custom', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  validateXslt: (xsltContent: string) =>
    request<{ success: boolean; valid: boolean; message: string; error?: string }>('/document-templates/validate-xslt', {
      method: 'POST',
      body: JSON.stringify({ xsltContent }),
    }),
  uploadDocumentTemplateXslt: (id: string, data: { xsltContent: string; versionNote?: string }) =>
    request<{ success: boolean; message: string }>(`/document-templates/${id}/upload-xslt`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  setDefaultDocumentTemplate: (id: string) =>
    request<{ success: boolean; message: string }>(`/document-templates/${id}/set-default`, { method: 'POST' }),
  duplicateDocumentTemplate: (id: string) =>
    request<{ success: boolean; template: any; message: string }>(`/document-templates/${id}/duplicate`, { method: 'POST' }),
  getDocumentTemplateVersions: (id: string) =>
    request<{ success: boolean; versions: any[] }>(`/document-templates/${id}/versions`),
  restoreDocumentTemplateVersion: (id: string, version: number) =>
    request<{ success: boolean; message: string }>(`/document-templates/${id}/restore/${version}`, { method: 'POST' }),
  getSampleXml: async (documentType: string = 'EFATURA'): Promise<string> => {
    const res = await fetch(`/api/document-templates/sample-xml/${documentType}`);
    return res.text();
  },

  // Hızlı Bilişim e-Connect Belgeler & İşlemler
  getHizliDocuments: (params?: { appType?: number; dateType?: string; startDate?: string; endDate?: string; isNew?: boolean }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return request<{ success: boolean; documents: any[] }>(`/efatura/hizli/documents${query}`);
  },
  getHizliDocumentFile: (appType: number, uuid: string, format: 'PDF' | 'HTML' | 'XML' = 'PDF') =>
    request<{ success: boolean; content: string; format: string; message?: string }>(`/efatura/hizli/document-file?appType=${appType}&uuid=${uuid}&format=${format}`),
  sendHizliApplicationResponse: (data: { uuid: string; responseType: 'KABUL' | 'RED'; reason?: string }) =>
    request<{ success: boolean; data?: any; message: string }>('/efatura/hizli/application-response', { method: 'POST', body: JSON.stringify(data) }),
  cancelHizliEArsiv: (data: { uuid: string; cancelReason?: string }) =>
    request<{ success: boolean; message: string }>('/efatura/hizli/cancel-earsiv', { method: 'POST', body: JSON.stringify(data) }),
  sendHizliDespatch: (payload: any[]) =>
    request<{ success: boolean; data?: any; message: string }>('/efatura/hizli/send-despatch', { method: 'POST', body: JSON.stringify({ payload }) }),
  sendHizliReceipt: (payload: any[]) =>
    request<{ success: boolean; data?: any; message: string }>('/efatura/hizli/send-receipt', { method: 'POST', body: JSON.stringify({ payload }) }),
  getHizliCodeList: (type: string) =>
    request<{ success: boolean; list: Array<{ code: string; name: string }> }>(`/efatura/hizli/code-list?type=${type}`),
  getHizliTcmbRate: (currency: string = 'USD', type: 'SatisKur' | 'AlisKur' = 'SatisKur') =>
    request<{ success: boolean; rate: number; currency: string }>(`/efatura/hizli/tcmb-rate?currency=${currency}&type=${type}`),
  getHizliPrefixList: (type: number = 1) =>
    request<{ success: boolean; list: any[] }>(`/efatura/hizli/prefix-list?type=${type}`),
  saveHizliPrefix: (data: any) =>
    request<{ success: boolean; message: string }>('/efatura/hizli/prefix-save', { method: 'POST', body: JSON.stringify(data) }),
  getHizliXsltList: () =>
    request<{ success: boolean; list: any[] }>('/efatura/hizli/xslt-list'),
  importHizliXslt: (serviceType: string = 'ALL', xsltCode: string = 'general') =>
    request<{ success: boolean; importedCount: number; designs: any[]; message: string }>('/efatura/hizli/import-xslt', {
      method: 'POST',
      body: JSON.stringify({ serviceType, xsltCode }),
    }),

  // Hızlı Bilişim e-Defter (HizliDefter)
  getHizliDefterProcesses: () =>
    request<{ success: boolean; data: any; message?: string }>('/edefter/processes'),
  createHizliDefterProcess: (data: any) =>
    request<{ success: boolean; data: any; message: string }>('/edefter/create', { method: 'POST', body: JSON.stringify(data) }),
  getHizliDefterSequence: () =>
    request<{ success: boolean; data: any }>('/edefter/sequence'),
  getHizliDefterList: (year?: number) => {
    const query = year ? `?year=${year}` : '';
    return request<{ success: boolean; data: any[] }>(`/edefter/list${query}`);
  },
  createHizliInventoryDefter: (data: any) =>
    request<{ success: boolean; message: string }>('/edefter/inventory', { method: 'POST', body: JSON.stringify(data) }),
  // 2026-09-12: `sendToGib` parametresi kaldırıldı. Uç HİÇBİR gönderim yapmaz
  // (yalnız taslak kaydeder); `sendToGib: true` göndermek faturayı gönderilmiş
  // gibi varsaydırdığı için yanıltıcıydı. Gönderim için `sendHizliInvoice`.
  createHizliModelInvoice: (data: { model: any; isDraft?: boolean }) =>
    request<{
      success: boolean;
      message: string;
      invoice?: any;
      invoiceNo?: string;
      ettn?: string;
      gibSent?: boolean;
    }>('/efatura/hizli/create-model-invoice', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // HBT Bayi Yönetimi & E-Dönüşüm Merkezi
  getDealerDashboardStats: () =>
    request<{ success: boolean; stats: any }>('/hizli-bayi/dashboard-stats'),
  getDealerCustomers: (params?: { search?: string; status?: string; service?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return request<{ success: boolean; customers: any[]; count: number }>(`/hizli-bayi/customers${query}`);
  },
  createDealerCustomer: (data: any) =>
    request<{ success: boolean; message: string; customer: any; activationLink?: string }>('/hizli-bayi/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDealerCustomer: (id: string, data: any) =>
    request<{ success: boolean; message: string }>(`/hizli-bayi/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getDealerCredits: () =>
    request<{ success: boolean; transactions: any[] }>('/hizli-bayi/credits'),
  addDealerCredits: (data: { customerId: string; type?: string; unit?: string; amount: number; description?: string }) =>
    request<{ success: boolean; message: string; customer: any; transaction: any }>('/hizli-bayi/credits/add', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  transferDealerCredits: (data: { fromCustomerId: string; toCustomerId: string; amount: number; description?: string }) =>
    request<{ success: boolean; message: string }>('/hizli-bayi/credits/transfer', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getDealerCommissionReports: () =>
    request<{ success: boolean; reports: any[] }>('/hizli-bayi/commission-reports'),
  getDealerPrefixes: () =>
    request<{ success: boolean; prefixes: any[] }>('/hizli-bayi/prefixes'),
  saveDealerPrefix: (data: any) =>
    request<{ success: boolean; message: string; prefix: any }>('/hizli-bayi/prefixes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getDealerDisputes: () =>
    request<{ success: boolean; disputes: any[] }>('/hizli-bayi/disputes'),
  uploadDealerTransferXml: (documents: any[]) =>
    request<{
      success: boolean;
      importedCount: number;
      duplicateCount: number;
      totalCount: number;
      records: any[];
      message: string;
    }>('/hizli-bayi/transfer/upload-xml', {
      method: 'POST',
      body: JSON.stringify({ documents }),
    }),
  checkHizliGibUser: async (vkn: string) => {
    const isVkn = vkn.length === 10;
    const isGibUser = isVkn && !['1111111111', '2222222222'].includes(vkn);
    return {
      success: true,
      vkn,
      isGibUser,
      pkEtiket: isGibUser ? `urn:mail:defaultpk@${vkn}.com.tr` : undefined,
      gbEtiket: isGibUser ? `urn:mail:defaultgb@${vkn}.com.tr` : undefined,
      title: isGibUser ? 'Kayıtlı GİB e-Fatura Mükellefi' : 'Bireysel / e-Arşiv Mükellefi',
    };
  },
  // ── Yeni: Token & Mod Yönetimi ──────────────────────────────────────────────

  // Token durumunu kontrol et (sunucu-taraflı e-Connect token'ı)
  getHizliTokenStatus: () =>
    request<{
      success: boolean;
      hasToken: boolean;
      isExpired: boolean;
      token: string | null;
      expireDate: string | null;
      remainingHours: number;
      isTestMode: boolean;
      lastInitAt: string | null;
      apiUrl: string;
      message: string;
    }>('/efatura/hizli/token-status'),

  // Token yenile
  refreshHizliToken: () =>
    request<{ success: boolean; message: string }>('/efatura/hizli/refresh-token', { method: 'POST' }),

  // Test ↔ Canlı mod değiştir
  switchHizliMode: (isTestMode: boolean) =>
    request<{ success: boolean; message: string; isTestMode: boolean; apiUrl: string }>(
      '/efatura/hizli/switch-mode',
      { method: 'POST', body: JSON.stringify({ isTestMode }) }
    ),

  // WS kullanıcı adı/şifre kaydet + şifrele + login yap
  saveHizliCredentials: (data: { username: string; password: string; isTestMode?: boolean }) =>
    request<{
      success: boolean;
      message: string;
      hashedUsername: string;
      tokenObtained: boolean;
      expireDate: string;
    }>('/efatura/hizli/save-credentials', { method: 'POST', body: JSON.stringify(data) }),

  // ── Yeni: Cari Yönetimi ──────────────────────────────────────────────────
  getHizliCariList: () =>
    request<{ success: boolean; data: any }>('/efatura/hizli/cari-list'),

  getHizliCari: (vkn: string) =>
    request<{ success: boolean; data: any }>(`/efatura/hizli/cari/${vkn}`),

  // ── Yeni: Stok Yönetimi ──────────────────────────────────────────────────
  getHizliStockList: () =>
    request<{ success: boolean; data: any }>('/efatura/hizli/stock-list'),

  saveHizliStock: (data: any) =>
    request<{ success: boolean; data: any; message: string }>('/efatura/hizli/stock-save', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteHizliStock: (stokId: number) =>
    request<{ success: boolean; message: string }>('/efatura/hizli/stock-delete', {
      method: 'POST',
      body: JSON.stringify({ stokId }),
    }),

  // ── Yeni: Dashboard Bilgisi ───────────────────────────────────────────────
  getHizliDashboardInfo: (identifier?: string) => {
    const query = identifier ? `?identifier=${encodeURIComponent(identifier)}` : '';
    return request<{ success: boolean; data: any }>(`/efatura/hizli/dashboard-info${query}`);
  },

  // ── Yeni: E-posta İşlemleri ───────────────────────────────────────────────
  sendHizliEmail: (data: { uuid: string; emailList: string[]; appType?: number; subject?: string }) =>
    request<{ success: boolean; message: string }>('/efatura/hizli/send-email', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resendHizliEmail: (data: { uuid: string; appType?: number }) =>
    request<{ success: boolean; message: string }>('/efatura/hizli/resend-email', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Yeni: Belge Sorgulama ─────────────────────────────────────────────────
  getHizliDocumentViewer: (params: { vknTckn: string; documentNo: string; payableAmount: number; appType?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{ success: boolean; data: any }>(`/efatura/hizli/document-viewer?${query}`);
  },

  getHizliIncomingAll: (params?: { dateType?: string; startDate?: string; endDate?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return request<{ success: boolean; data: any }>(`/efatura/hizli/incoming-all${query}`);
  },

  setHizliDocumentFlag: (data: { uuid: string; flagName: string; flagValue: number; appType?: number }) =>
    request<{ success: boolean; message: string }>('/efatura/hizli/document-flag', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Yeni: Kontör Hareketleri ──────────────────────────────────────────────
  getHizliKontorHareketleri: (vkn?: string) => {
    const query = vkn ? `?vkn=${encodeURIComponent(vkn)}` : '';
    return request<{ success: boolean; data: any }>(`/efatura/hizli/kontor-hareketleri${query}`);
  },

  // ── Yeni: XML Doğrulama ───────────────────────────────────────────────────
  validateHizliXml: (data: { xmlContent: string; appType?: number }) =>
    request<{ success: boolean; isValid?: boolean; data?: any; message: string }>('/efatura/hizli/validate-xml', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Yeni: Son Fatura Numarası ─────────────────────────────────────────────
  getHizliLastInvoiceId: (params?: { appType?: number; seri?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return request<{ success: boolean; data: { lastInvoiceId: string; lastDate: string } }>(
      `/efatura/hizli/last-invoice-id${query}`
    );
  },

  // ── Support Tickets ──────────────────────────────────────────────────────
  getSupportTickets: () =>
    request<{ success: boolean; tickets: any[] }>('/support/tickets'),
  getSupportTicket: (id: string) =>
    request<{ success: boolean; ticket: any }>(`/support/tickets/${id}`),
  createSupportTicket: (data: { category: string; priority: string; subject: string; message: string }) =>
    request<{ success: boolean; message: string; ticket: any }>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  addSupportTicketResponse: (ticketId: string, message: string) =>
    request<{ success: boolean; message: string; ticket: any }>(`/support/tickets/${ticketId}/responses`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  updateSupportTicketStatus: (ticketId: string, status: string) =>
    request<{ success: boolean; message: string; ticket: any }>(`/support/tickets/${ticketId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // ── FAZ 5: SAAS ABONELİK + PAKET + KONTÖR + ONLİNE ÖDEME + BAYİ ──────────
  getSubscriptionPlans: () =>
    request<{ success: boolean; plans: SubscriptionPlan[] }>('/v1/plans'),
  getSubscriptionPlan: (slug: string) =>
    request<{ success: boolean; plan: SubscriptionPlan }>(`/v1/plans/${slug}`),

  getCurrentSubscription: () =>
    request<{
      success: boolean;
      subscription: Subscription;
      plan: SubscriptionPlan;
      tenantStatus: string;
      daysRemaining: number;
      isTrialActive: boolean;
      trialDaysRemaining: number;
      usage: UsageRecord[];
    }>('/v1/subscriptions/current'),

  previewSubscriptionChange: (data: { targetPlanSlug: string; billingCycle?: 'monthly' | 'yearly' }) =>
    request<{
      success: boolean;
      isDowngrade: boolean;
      proration: ProrationResult;
      message?: string;
    }>('/v1/subscriptions/preview-change', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  changeSubscription: (data: {
    targetPlanSlug: string;
    billingCycle?: 'monthly' | 'yearly';
    paymentDetails?: {
      cardNumber: string;
      cardHolder?: string;
      expireMonth: string;
      expireYear: string;
      cvv: string;
    };
  }) =>
    request<{ success: boolean; message: string; subscription: Subscription }>('/v1/subscriptions/change', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cancelSubscription: (data: { reason: string; note?: string }) =>
    request<{ success: boolean; message: string; subscription: Subscription }>('/v1/subscriptions/cancel', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  toggleAutoRenew: (autoRenew: boolean) =>
    request<{ success: boolean; message: string }>('/v1/subscriptions/auto-renew', {
      method: 'POST',
      body: JSON.stringify({ autoRenew }),
    }),

  // Kontör Cüzdanı
  getCreditWallet: () =>
    request<{
      success: boolean;
      wallet: CreditWallet;
      availableBalance: number;
      isLowCredit: boolean;
      lowCreditMessage?: string;
    }>('/v1/credits/wallet'),

  getCreditPackages: () =>
    request<{ success: boolean; packages: CreditPackage[] }>('/v1/credits/packages'),

  purchaseCredits: (data: {
    packageId: string;
    cardNumber: string;
    cardHolder?: string;
    expireMonth: string;
    expireYear: string;
    cvv: string;
  }) =>
    request<{
      success: boolean;
      message: string;
      payment: Payment;
      wallet: CreditWallet;
    }>('/v1/credits/purchase', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCreditTransactions: () =>
    request<{ success: boolean; transactions: CreditTxRecord[] }>('/v1/credits/transactions'),

  // Ödemeler ve Faturalandırma
  getPaymentHistory: () =>
    request<{ success: boolean; payments: Payment[]; invoices: BillingInvoice[] }>('/v1/payments/history'),

  getPaymentDetail: (id: string) =>
    request<{ success: boolean; payment: Payment; invoice?: BillingInvoice }>(`/v1/payments/${id}`),

  refundPayment: (id: string, data: { amount?: number; reason?: string }) =>
    request<{ success: boolean; message: string; refundResult: any }>(`/v1/payments/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Kullanım ve Limitler
  getUsageLimits: () =>
    request<{ success: boolean; usages: UsageRecord[] }>('/v1/usage/limits'),

  checkUsageLimit: (metric: string, count: number = 1) =>
    request<{ success: boolean; check: any }>(`/v1/usage/check/${metric}?count=${count}`),

  // Bayi Portalı
  getSaasDealerDashboard: () =>
    request<{
      success: boolean;
      dealer: Dealer;
      metrics: {
        totalCustomers: number;
        activeCustomers: number;
        trialCustomers: number;
        subDealersCount: number;
        totalCommissionEarned: number;
        currentBalance: number;
        pendingCommissions: number;
      };
      recentCommissions: DealerCommission[];
    }>('/v1/dealers/dashboard'),

  getSaasDealerCustomers: () =>
    request<{ success: boolean; customers: any[] }>('/v1/dealers/customers'),

  createSaasDealerCustomer: (data: {
    companyName: string;
    title?: string;
    taxNumber?: string;
    taxOffice?: string;
    city?: string;
    phone?: string;
    adminFullName?: string;
    adminEmail: string;
    adminPassword: string;
    planSlug?: string;
    externalCustomerId?: string;
    externalSource?: string;
  }) =>
    request<{ success: boolean; message: string; tenant: any; user: any }>('/v1/dealers/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSaasDealerSubDealers: () =>
    request<{ success: boolean; subDealers: Dealer[] }>('/v1/dealers/sub-dealers'),

  createSaasDealerSubDealer: (data: {
    name: string;
    email: string;
    phone?: string;
    contactPerson?: string;
    taxNumber?: string;
    taxOffice?: string;
    city?: string;
    commissionRate?: number;
  }) =>
    request<{ success: boolean; message: string; subDealer: Dealer }>('/v1/dealers/sub-dealers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSaasDealerCommissions: () =>
    request<{ success: boolean; commissions: DealerCommission[] }>('/v1/dealers/commissions'),

  // Super Admin SaaS Analytics & Management
  getAdminSaasKpis: () =>
    request<{
      success: boolean;
      kpis: SaasKpis;
      recentPayments: Payment[];
      recentSubscriptions: Subscription[];
    }>('/v1/admin/saas/kpis'),

  updateAdminPlan: (id: string, data: any) =>
    request<{ success: boolean; message: string; plan: SubscriptionPlan }>(`/v1/admin/saas/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  createAdminCreditPackage: (data: any) =>
    request<{ success: boolean; message: string; package: CreditPackage }>('/v1/admin/saas/credits/packages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAdminDealers: () =>
    request<{ success: boolean; dealers: Dealer[]; commissions: DealerCommission[] }>('/v1/admin/saas/dealers'),

  payoutAdminDealer: (id: string, data: { amount?: number; note?: string }) =>
    request<{ success: boolean; message: string; dealer: Dealer }>(`/v1/admin/saas/dealers/${id}/payout`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // FAZ 6: MOBİL + SAHA TAHSİLAT + POS + BANKA MUTABAKAT + QR + RAPORLAMA API
  // ──────────────────────────────────────────────────────────────────────────

  // Mobil Cihaz & Sync
  getMobileBootstrap: () =>
    request<{
      success: boolean;
      serverTime: string;
      tenantId: string;
      company: any;
      customers: any[];
      products: any[];
      warehouses: any[];
      settings: any;
    }>('/v1/mobile/bootstrap'),

  syncMobileData: (data: {
    tenantId?: string;
    userId?: string;
    userName?: string;
    deviceId?: string;
    operations: any[];
  }) =>
    request<{
      success: boolean;
      syncedCount: number;
      failedCount: number;
      serverTimestamp: string;
      results: any[];
    }>('/v1/mobile/sync', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMobileDevices: () =>
    request<{ success: boolean; devices: MobileDevice[] }>('/v1/mobile/devices'),

  revokeMobileDevice: (id: string, data?: { revokedBy?: string }) =>
    request<{ success: boolean; message: string; device: MobileDevice }>(`/v1/mobile/devices/${id}/revoke`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  getMobileDashboard: () =>
    request<{
      success: boolean;
      kpis: {
        todaySales: number;
        todayCollections: number;
        pendingCollections: number;
        totalCash: number;
        totalBank: number;
        totalReceivables: number;
        criticalStockCount: number;
        plannedVisitsCount: number;
        completedVisitsCount: number;
      };
    }>('/v1/mobile/dashboard'),

  // Saha Tahsilat
  getFieldCollections: (params?: { status?: string; userId?: string; customerId?: string; startDate?: string; endDate?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return request<{ success: boolean; count: number; collections: FieldCollection[] }>(`/v1/field-collections${query}`);
  },

  createFieldCollection: (data: {
    customerId: string;
    amount: number;
    currency?: 'TRY' | 'USD' | 'EUR';
    paymentMethod: any;
    description?: string;
    latitude?: number;
    longitude?: number;
    locationAccuracy?: number;
    signatureFileUrl?: string;
    photoFileUrl?: string;
    clientTransactionId?: string;
    targetCashRegisterId?: string;
    targetBankAccountId?: string;
  }) =>
    request<{ success: boolean; message: string; collection: FieldCollection; receipt: FieldCollectionReceipt }>('/v1/field-collections', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  approveFieldCollection: (id: string, data?: { approvedBy?: string }) =>
    request<{ success: boolean; message: string; collection: FieldCollection }>(`/v1/field-collections/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  cancelFieldCollection: (id: string, data: { reason: string; cancelledBy?: string }) =>
    request<{ success: boolean; message: string; collection: FieldCollection }>(`/v1/field-collections/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getFieldCollectionReceipt: (collectionId: string) =>
    request<{ success: boolean; receipt: FieldCollectionReceipt }>(`/v1/field-collections/${collectionId}/receipt`),

  // Ziyaretler & Rota
  getVisits: (params?: { date?: string; agentId?: string; status?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return request<{ success: boolean; count: number; visits: CustomerVisit[] }>(`/v1/visits${query}`);
  },

  createVisit: (data: any) =>
    request<{ success: boolean; message: string; visit: CustomerVisit }>('/v1/visits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getVisitMapPins: () =>
    request<{ success: boolean; count: number; pins: any[] }>('/v1/visits/map'),

  // Mobil POS
  chargeMobilePos: (data: {
    amount: number;
    currency?: 'TRY' | 'USD' | 'EUR';
    cardNumber?: string;
    cardHolderName?: string;
    cardExpiry?: string;
    cardCvv?: string;
    installment?: number;
    referenceType?: string;
    referenceId?: string;
  }) =>
    request<{ success: boolean; message: string; transaction: PosTransaction; authCode?: string }>('/v1/pos/charge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPosTransactions: () =>
    request<{ success: boolean; count: number; transactions: PosTransaction[] }>('/v1/pos/transactions'),

  // Banka Mutabakat
  getBankMatchingSuggestions: () =>
    request<{ success: boolean; count: number; suggestions: BankMatchSuggestion[] }>('/v1/bank-matching/suggestions'),

  reconcileBankTransaction: (data: {
    bankTransactionId: string;
    customerId: string;
    invoiceId?: string;
    notes?: string;
    reconciledBy?: string;
  }) =>
    request<{ success: boolean; message: string; match: BankTransactionMatch }>('/v1/bank-matching/reconcile', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Ödeme & QR Linkleri
  getPaymentLinks: () =>
    request<{ success: boolean; count: number; paymentLinks: PaymentLink[] }>('/v1/payment-links'),

  createPaymentLink: (data: {
    customerId: string;
    amount: number;
    currency?: 'TRY' | 'USD' | 'EUR';
    description?: string;
    expiresInDays?: number;
  }) =>
    request<{ success: boolean; message: string; paymentLink: PaymentLink }>('/v1/payment-links', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resolvePublicPaymentLink: (token: string) =>
    request<{ success: boolean; paymentLink: any }>(`/v1/payment-links/resolve/${token}`),

  payPublicPaymentLink: (data: {
    token: string;
    cardNumber: string;
    cardHolder: string;
    expiry: string;
    cvv: string;
  }) =>
    request<{ success: boolean; message: string; paymentId?: string }>('/v1/payment-links/pay', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Gelişmiş Raporlar
  getAdvancedDashboardReports: () =>
    request<{ success: boolean; data: any }>('/v1/reports/advanced/dashboard'),

  getFieldAgentPerformance: () =>
    request<{ success: boolean; count: number; performance: FieldAgentPerformance[] }>('/v1/reports/advanced/field-performance'),

  getCustomerRiskScores: () =>
    request<{ success: boolean; count: number; riskScores: CustomerRiskScore[] }>('/v1/reports/advanced/customer-risk'),

  getCashBankFlowReports: () =>
    request<{ success: boolean; cashRegisters: any[]; bankAccounts: any[]; recentCashTxs: any[]; recentBankTxs: any[] }>('/v1/reports/advanced/cash-bank-flow'),

  // ──────────────────────────────────────────────────────────────────────────
  // FAZ 7: AI MUHASEBE + OCR + AKILLI FİNANS + OTOMASYON + MALİ MÜŞAVİR API
  // ──────────────────────────────────────────────────────────────────────────

  // AI Asistan & Chat
  sendAIChatMessage: (data: { message: string; conversationId?: string; userId?: string }) =>
    request<{
      success: boolean;
      conversationId: string;
      answer: string;
      sources?: string[];
      suggestedActions?: any[];
      confidence: number;
      model: string;
    }>('/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAIDashboardSummary: () =>
    request<{
      success: boolean;
      summary: any;
      recommendations: any[];
    }>('/v1/ai/dashboard'),

  getAIConversations: () =>
    request<{ success: boolean; count: number; conversations: AIConversation[] }>('/v1/ai/conversations'),

  getAIConversationMessages: (conversationId: string) =>
    request<{ success: boolean; count: number; messages: AIMessage[] }>(`/v1/ai/conversations/${conversationId}/messages`),

  // Akıllı Finans & Tahmin
  getCashFlowForecast: (period: '7_DAYS' | '30_DAYS' | '90_DAYS' = '30_DAYS') =>
    request<{ success: boolean; forecast: CashFlowForecastResult }>(`/v1/ai-insights/forecast/cashflow?period=${period}`),

  getStockDepletionForecast: () =>
    request<{ success: boolean; count: number; products: any[] }>('/v1/ai-insights/forecast/stock'),

  getAccountingAuditDesk: () =>
    request<{ success: boolean; count: number; issues: AuditDeskIssue[] }>('/v1/ai-insights/audit-desk'),

  // Document AI / OCR
  getDocumentAIJobs: () =>
    request<{ success: boolean; count: number; jobs: DocumentAIJob[] }>('/v1/document-ai/jobs'),

  uploadDocumentAI: (data: {
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    fileUrl?: string;
    documentType?: string;
  }) =>
    request<{ success: boolean; message: string; job: DocumentAIJob }>('/v1/document-ai/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDocumentAIJobDetails: (id: string) =>
    request<{ success: boolean; job: DocumentAIJob }>(`/v1/document-ai/jobs/${id}`),

  createInvoiceFromDocumentJob: (jobId: string, confirmedData: any) =>
    request<{ success: boolean; invoiceId: string; message: string }>(`/v1/document-ai/jobs/${jobId}/create-invoice`, {
      method: 'POST',
      body: JSON.stringify({ confirmedData }),
    }),

  // Mali Müşavir Portalı
  getAccountantClients: () =>
    request<{ success: boolean; count: number; clients: AccountantClient[] }>('/v1/accountant/clients'),

  getAccountantMonthlyReport: (tenantId: string, period?: string) =>
    request<{ success: boolean; report: any }>(`/v1/accountant/clients/${tenantId}/monthly-report${period ? `?period=${period}` : ''}`),

  getAccountantDocumentRequests: () =>
    request<{ success: boolean; count: number; requests: DocumentRequest[] }>('/v1/accountant/requests'),

  createAccountantDocumentRequest: (data: {
    tenantId?: string;
    accountantUserId?: string;
    accountantName?: string;
    companyName?: string;
    documentType: string;
    period: string;
    description: string;
    dueDate?: string;
  }) =>
    request<{ success: boolean; message: string; request: DocumentRequest }>('/v1/accountant/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Otomasyon & Webhook
  getAutomationRules: () =>
    request<{ success: boolean; count: number; rules: AutomationRule[] }>('/v1/automations/rules'),

  createAutomationRule: (data: any) =>
    request<{ success: boolean; message: string; rule: AutomationRule }>('/v1/automations/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAutomationRuns: () =>
    request<{ success: boolean; count: number; runs: AutomationRun[] }>('/v1/automations/runs'),

  testTriggerAutomation: (data: { triggerEvent: string; payload?: any }) =>
    request<{ success: boolean; message: string; runs: AutomationRun[] }>('/v1/automations/test-trigger', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getWebhookEndpoints: () =>
    request<{ success: boolean; count: number; webhooks: WebhookEndpoint[] }>('/v1/automations/webhooks'),

  createWebhookEndpoint: (data: { url: string; description?: string; events?: string[] }) =>
    request<{ success: boolean; message: string; webhook: WebhookEndpoint }>('/v1/automations/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // FAZ 8: MÜŞTERİ PORTALI + BELGE MERKEZİ + GÖREV & ONAY + İLETİŞİM API
  // ──────────────────────────────────────────────────────────────────────────

  // Müşteri Portalı Dashboard
  getClientDashboard: () =>
    request<{ success: boolean; data: any }>('/v1/client/dashboard'),

  // Belge Merkezi & Dijital Arşiv
  getDocuments: (params?: { folder?: string; category?: string }) =>
    request<{ success: boolean; count: number; documents: DocumentItem[] }>(
      `/v1/documents${params?.folder ? `?folder=${encodeURIComponent(params.folder)}` : params?.category ? `?category=${encodeURIComponent(params.category)}` : ''}`
    ),

  uploadDocumentItem: (data: any) =>
    request<{ success: boolean; message: string; document: DocumentItem }>('/v1/documents/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createDocumentShareToken: (data: {
    entityType?: 'DOCUMENT' | 'ACCOUNT_STATEMENT' | 'INVOICE';
    entityId: string;
    title: string;
    password?: string;
    expiresInHours?: number;
    downloadLimit?: number;
  }) =>
    request<{ success: boolean; message: string; shareToken: PublicShareToken }>('/v1/documents/share', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resolvePublicShareToken: (token: string, password?: string) =>
    request<{
      success: boolean;
      requiresPassword?: boolean;
      title?: string;
      token?: PublicShareToken;
      data?: any;
    }>(`/v1/documents/public-share/${token}${password ? `?password=${encodeURIComponent(password)}` : ''}`),

  // Görev Yönetimi
  getWorkspaceTasks: (status?: string) =>
    request<{ success: boolean; count: number; tasks: WorkspaceTask[] }>(`/v1/tasks${status ? `?status=${status}` : ''}`),

  createWorkspaceTask: (data: any) =>
    request<{ success: boolean; message: string; task: WorkspaceTask }>('/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWorkspaceTaskStatus: (id: string, status: string) =>
    request<{ success: boolean; message: string; task: WorkspaceTask }>(`/v1/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Onay Merkezi
  getApprovalRequests: (status?: string) =>
    request<{ success: boolean; count: number; requests: ApprovalRequest[] }>(`/v1/approvals/requests${status ? `?status=${status}` : ''}`),

  getApprovalRules: () =>
    request<{ success: boolean; count: number; rules: ApprovalRule[] }>('/v1/approvals/rules'),

  createApprovalRequest: (data: any) =>
    request<{ success: boolean; message: string; request: ApprovalRequest }>('/v1/approvals/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  processApprovalDecision: (id: string, data: { decision: 'APPROVE' | 'REJECT'; rejectReason?: string }) =>
    request<{ success: boolean; message: string; request: ApprovalRequest }>(`/v1/approvals/requests/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // İletişim & Mesajlaşma
  getTopicConversations: () =>
    request<{ success: boolean; count: number; conversations: TopicConversation[] }>('/v1/messages/conversations'),

  getTopicMessages: (convId: string) =>
    request<{ success: boolean; count: number; messages: TopicMessage[] }>(`/v1/messages/conversations/${convId}/messages`),

  sendTopicMessage: (data: any) =>
    request<{ success: boolean; conversation: TopicConversation; message: TopicMessage }>('/v1/messages/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Destek & Bilgi Bankası
  getSupportTicketsFaz8: () =>
    request<{ success: boolean; count: number; tickets: SupportTicketFaz8[] }>('/v1/support-faz8/tickets'),

  createSupportTicketFaz8: (data: any) =>
    request<{ success: boolean; message: string; ticket: SupportTicketFaz8 }>('/v1/support-faz8/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getKnowledgeArticles: (q?: string) =>
    request<{ success: boolean; count: number; articles: KnowledgeArticle[] }>(`/v1/support-faz8/knowledge${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  // Cihazlar & Güvenlik
  getUserDevices: () =>
    request<{ success: boolean; count: number; devices: UserDevice[] }>('/v1/devices'),

  terminateUserDevice: (id: string) =>
    request<{ success: boolean; message: string }>(`/v1/devices/${id}/terminate`, {
      method: 'POST',
    }),

  // Aktivite & Audit Logları
  getActivityLogs: () =>
    request<{ success: boolean; count: number; logs: ActivityLog[] }>('/v1/activity-logs'),

  // Onboarding & Demo Veri
  getOnboardingProgress: () =>
    request<{ success: boolean; progress: OnboardingProgress }>('/v1/onboarding/progress'),

  injectDemoData: () =>
    request<{ success: boolean; message: string }>('/v1/onboarding/demo-data', {
      method: 'POST',
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // FAZ 9: SAAS PLATFORM + BAYİ + MARKETPLACE + API + WHITE-LABEL API
  // ──────────────────────────────────────────────────────────────────────────

  // Platform Admin
  getPlatformMetrics: () =>
    request<{ success: boolean; totalTenants: number; activeTenants: number; mrr: number; arr: number; arpu: number; activeDealersCount: number; healthIndicators: SystemHealthIndicator[] }>('/v1/platform-admin/metrics'),

  getPlatformTenants: () =>
    request<{ success: boolean; count: number; tenants: any[] }>('/v1/platform-admin/tenants'),

  startPlatformImpersonation: (targetTenantId: string, reason: string) =>
    request<{ success: boolean; message: string; token: string; targetTenantName: string }>('/v1/platform-admin/impersonate', {
      method: 'POST',
      body: JSON.stringify({ targetTenantId, reason }),
    }),

  createPlatformAnnouncement: (data: { title: string; content: string; targetAudience?: string; priority?: string }) =>
    request<{ success: boolean; announcement: any }>('/v1/platform-admin/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Bayi & Alt Bayi
  getDealerPartners: (parentId?: string) =>
    request<{ success: boolean; count: number; partners: PartnerNode[] }>(`/v1/dealer/partners${parentId ? `?parentId=${parentId}` : ''}`),

  getDealerCommissions: (partnerId?: string) =>
    request<{ success: boolean; count: number; commissions: CommissionPayoutTx[] }>(`/v1/dealer/commissions${partnerId ? `?partnerId=${partnerId}` : ''}`),

  createDealerPartner: (data: any) =>
    request<{ success: boolean; partner: PartnerNode }>('/v1/dealer/partners', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  approveDealerCommission: (id: string) =>
    request<{ success: boolean; message: string; transaction: CommissionPayoutTx }>(`/v1/dealer/commissions/${id}/approve`, {
      method: 'POST',
    }),

  // Developer & API Platform
  getDeveloperKeys: () =>
    request<{ success: boolean; count: number; keys: ApiKeyCredential[] }>('/v1/developer/keys'),

  createDeveloperKey: (data: { name: string; isSandbox?: boolean; scopes?: string[]; rateLimitTier?: string }) =>
    request<{ success: boolean; credential: ApiKeyCredential; plainSecretKey: string }>('/v1/developer/keys', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDeveloperLogs: () =>
    request<{ success: boolean; count: number; logs: ApiUsageLog[] }>('/v1/developer/logs'),

  getDeveloperWebhooks: () =>
    request<{ success: boolean; count: number; webhooks: WebhookSubscriptionItem[] }>('/v1/developer/webhooks'),

  createDeveloperWebhook: (data: { url: string; events?: string[] }) =>
    request<{ success: boolean; webhook: WebhookSubscriptionItem; plainSecret: string }>('/v1/developer/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Marketplace
  getMarketplaceApps: (category?: string) =>
    request<{ success: boolean; count: number; apps: MarketplaceAppItem[] }>(`/v1/marketplace/apps${category ? `?category=${category}` : ''}`),

  getMarketplaceConnections: () =>
    request<{ success: boolean; count: number; connections: TenantIntegrationConnection[] }>('/v1/marketplace/connections'),

  connectMarketplaceApp: (data: { appSlug: string; credentials?: Record<string, string> }) =>
    request<{ success: boolean; message: string; connection: TenantIntegrationConnection }>('/v1/marketplace/connect', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  disconnectMarketplaceApp: (appSlug: string) =>
    request<{ success: boolean; message: string }>('/v1/marketplace/disconnect', {
      method: 'POST',
      body: JSON.stringify({ appSlug }),
    }),

  testMarketplaceConnection: (appSlug: string) =>
    request<{ healthy: boolean; latencyMs: number; message: string }>('/v1/marketplace/test-connection', {
      method: 'POST',
      body: JSON.stringify({ appSlug }),
    }),

  // Billing & Subscriptions
  getBillingPortalSummary: () =>
    request<{ success: boolean; data: any }>('/v1/billing/portal'),

  upgradeBillingPlan: (data: { planSlug: string; billingCycle?: 'monthly' | 'yearly'; couponCode?: string; paymentProvider?: string }) =>
    request<{ success: boolean; subscription: any; paidAmount: number }>('/v1/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  buyBillingCredits: (data: { quantity: number; amount: number; paymentProvider?: string }) =>
    request<{ success: boolean; newBalance: number; paymentId: string }>('/v1/billing/buy-credits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cancelBillingSubscription: (data: { reason?: string; cancelImmediately?: boolean }) =>
    request<{ success: boolean; message: string; subscription: any }>('/v1/billing/cancel', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // White-Label
  getWhiteLabelProfile: () =>
    request<{ success: boolean; profile: WhiteLabelBrandProfile }>('/v1/whitelabel/profile'),

  saveWhiteLabelProfile: (data: Partial<WhiteLabelBrandProfile>) =>
    request<{ success: boolean; message: string; profile: WhiteLabelBrandProfile }>('/v1/whitelabel/profile', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verifyWhiteLabelDomain: (domain: string) =>
    request<{ success: boolean; message: string; verification: any }>('/v1/whitelabel/verify-domain', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),

  // Promotions & Coupons
  validatePromoCoupon: (code: string, amount?: number) =>
    request<{ valid: boolean; discountAmount: number; message?: string }>('/v1/promotions/validate-coupon', {
      method: 'POST',
      body: JSON.stringify({ code, amount }),
    }),

  getReferralProgramCode: () =>
    request<{ success: boolean; referralCode: string; shareUrl: string; inviterReward: string; inviteeReward: string }>('/v1/promotions/referral-code'),

  // AI Agents & Copilot
  getAIAgents: () =>
    request<{ success: boolean; agents: any[] }>('/v1/ai/agents'),

  runAIAgentScan: (agentId: string) =>
    request<{ success: boolean; result: any }>(`/v1/ai/agents/${agentId}/scan`, {
      method: 'POST',
    }),

  sendAIChat: (data: { message: string; conversationId?: string; agentId?: string }) =>
    request<{ success: boolean; conversationId: string; answer: string; sources?: string[]; suggestedActions?: any[]; confidence: number; model: string }>('/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Canlı QA Test Ekranı (FAZ 25 doğrulama paneli — yalnız SUPER_ADMIN/ADMIN)
  // Uç requireAuth + requireRole ile korunur; token yukarıdaki request() ile otomatik eklenir.
  runQaTestReport: () =>
    request<{ success: boolean; report: any }>('/test-screen/run', { method: 'POST' }),

  // ─── Hızlı Bilişim Entegrasyon Yönetimi (2026-09-14) ───
  // Credential (secretKey/apiKey/token) backend'de kalır, frontend'e dönmez.
  getHizliIntegrations: () =>
    request<{ success: boolean; integrations: any[]; summary: any }>(
      '/admin/integrations/hizli-bilisim'
    ),

  getHizliIntegrationDetail: (tenantId: string) =>
    request<{ success: boolean; integration: any }>(
      `/admin/integrations/hizli-bilisim/${tenantId}`
    ),

  setHizliIntegration: (tenantId: string, enabled: boolean) =>
    request<{ success: boolean; message: string; integrationEnabled: boolean }>(
      `/admin/integrations/hizli-bilisim/${tenantId}`,
      { method: 'PUT', body: JSON.stringify({ enabled }) }
    ),
};

