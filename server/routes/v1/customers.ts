import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { Customer, AccountTransaction } from '../../db/schema';
import { FinancialTransactionService } from '../../services/financialTransactionService';

export const v1CustomersRouter = Router();

v1CustomersRouter.use(requireAuth, resolveTenant);

/**
 * GET /api/v1/customers
 * Sayfalanmış, filtrelenmiş ve sıralanmış cari listesi
 */
v1CustomersRouter.get('/', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const {
    page = '1',
    limit = '25',
    search = '',
    type,
    status,
    balanceType,
    sort = 'title',
    order = 'asc',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  let list = (db.customers || []).filter(
    c => (c.tenantId === tenantId || (tenantId === 'tnt-isbey' && !c.tenantId)) && !c.deletedAt
  );

  // Arama (Kod, Ünvan, Vergi No, Telefon, Yetkili)
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      c =>
        c.title?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.taxNumber?.includes(q) ||
        c.nationalId?.includes(q) ||
        c.phone?.includes(q) ||
        c.contactName?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
    );
  }

  // Cari Tipi Filtresi (CUSTOMER, SUPPLIER, BOTH)
  if (type && type !== 'ALL') {
    list = list.filter(c => c.type === type || c.type === 'BOTH');
  }

  // Durum Filtresi (ACTIVE, PASSIVE)
  if (status && status !== 'ALL') {
    const isActive = status === 'ACTIVE';
    list = list.filter(c => (c.active !== undefined ? c.active === isActive : true));
  }

  // Bakiye Filtresi (DEBTOR / BORÇLU, CREDITOR / ALACAKLI, ZERO / SIFIR)
  if (balanceType === 'DEBTOR') {
    list = list.filter(c => (c.balance || 0) > 0);
  } else if (balanceType === 'CREDITOR') {
    list = list.filter(c => (c.balance || 0) < 0);
  } else if (balanceType === 'ZERO') {
    list = list.filter(c => (c.balance || 0) === 0);
  }

  // Sıralama
  list.sort((a: any, b: any) => {
    const valA = a[sort] ?? '';
    const valB = b[sort] ?? '';
    if (typeof valA === 'number' && typeof valB === 'number') {
      return order === 'desc' ? valB - valA : valA - valB;
    }
    return order === 'desc'
      ? String(valB).localeCompare(String(valA), 'tr')
      : String(valA).localeCompare(String(valB), 'tr');
  });

  const total = list.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = list.slice(startIndex, startIndex + limitNum);

  // Genel İstatistik Özeti
  const summary = {
    totalCustomers: list.length,
    totalDebtorCount: list.filter(c => (c.balance || 0) > 0).length,
    totalCreditorCount: list.filter(c => (c.balance || 0) < 0).length,
    totalReceivables: list.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0),
    totalPayables: list.reduce((sum, c) => sum + Math.abs(Math.min(0, c.balance || 0)), 0),
  };

  res.json({
    success: true,
    data: paginated,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
    summary,
  });
});

/**
 * POST /api/v1/customers
 * Otomatik kod üretimi ve açılış fişi destekli yeni cari kaydı
 */
v1CustomersRouter.post('/', requirePermission(PERMISSIONS.CUSTOMERS_CREATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();

  const {
    code,
    type = 'CUSTOMER',
    title,
    firstName,
    lastName,
    contactName,
    taxNumber,
    nationalId,
    taxOffice,
    phone,
    mobilePhone,
    email,
    website,
    address,
    city,
    district,
    postalCode,
    country = 'Türkiye',
    iban,
    currency = 'TRY',
    creditLimit = 0,
    riskLimit = 0,
    maturityDays = 0,
    openingDebit = 0,
    openingCredit = 0,
    notes,
  } = req.body;

  if (!title && (!firstName || !lastName)) {
    return res.status(400).json({ success: false, message: 'Cari ünvanı veya Ad/Soyad zorunludur.' });
  }

  const finalTitle = (title || `${firstName} ${lastName}`).trim();

  // Otomatik Kod Üretimi (Eğer gönderilmediyse)
  let finalCode = code?.trim();
  if (!finalCode) {
    const count = (db.customers || []).filter(c => !c.tenantId || c.tenantId === tenantId).length + 1;
    const prefix = type === 'SUPPLIER' ? '320' : '120';
    finalCode = `${prefix}.${String(count).padStart(5, '0')}`;
  }

  // Unique Kod Denetimi (Tenant Bazlı)
  const existing = (db.customers || []).find(
    c => c.code === finalCode && (!c.tenantId || c.tenantId === tenantId) && !c.deletedAt
  );
  if (existing) {
    return res.status(400).json({ success: false, message: `'${finalCode}' cari kodu zaten kullanımda.` });
  }

  const now = new Date().toISOString();
  const customerId = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const initialBalance = (openingDebit || 0) - (openingCredit || 0);

  const newCustomer: Customer = {
    id: customerId,
    tenantId,
    code: finalCode,
    type,
    title: finalTitle,
    firstName,
    lastName,
    contactName: contactName || `${firstName || ''} ${lastName || ''}`.trim() || undefined,
    taxNumber,
    nationalId,
    taxOffice,
    phone: phone || '',
    mobilePhone,
    email,
    website,
    address,
    city,
    district,
    postalCode,
    country,
    iban,
    currency,
    creditLimit,
    riskLimit,
    maturityDays,
    openingDebit,
    openingCredit,
    notes,
    balance: initialBalance,
    totalDebit: openingDebit || 0,
    totalCredit: openingCredit || 0,
    status: 'ACTIVE',
    active: true,
    createdBy: user.fullName || user.username,
    createdAt: now,
    updatedAt: now,
  };

  if (!db.customers) db.customers = [];
  db.customers.push(newCustomer);

  // Açılış Borç/Alacak Hareketi varsa kaydet
  if (openingDebit > 0 || openingCredit > 0) {
    const openTx: AccountTransaction = {
      id: `actx-open-${Date.now()}`,
      tenantId,
      customerId,
      customerCode: finalCode,
      customerTitle: finalTitle,
      transactionType: 'OPENING',
      documentType: 'OPENING',
      documentNo: `DEVIR-${finalCode}`,
      date: now.slice(0, 10),
      description: 'Açılış Bakiyesi Devri',
      debit: openingDebit || 0,
      credit: openingCredit || 0,
      currency,
      createdBy: user.fullName || user.username,
      createdAt: now,
    };
    if (!db.accountTransactions) db.accountTransactions = [];
    db.accountTransactions.push(openTx);
  }

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'CUSTOMER_CREATED',
    module: 'CUSTOMERS',
    documentNo: finalCode,
    ipAddress: req.ip || '127.0.0.1',
    details: `'${finalTitle}' (${finalCode}) carisi oluşturuldu.`,
  });

  storage.save();
  res.status(201).json({ success: true, customer: newCustomer });
});

/**
 * GET /api/v1/customers/:id
 * Cari detay kartı
 */
v1CustomersRouter.get('/:id', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const customer = (db.customers || []).find(
    c => c.id === req.params.id && (c.tenantId === tenantId || (tenantId === 'tnt-isbey' && !c.tenantId)) && !c.deletedAt
  );

  if (!customer) {
    return res.status(404).json({ success: false, message: 'Cari hesap bulunamadı.' });
  }

  res.json({ success: true, customer });
});

/**
 * PUT /api/v1/customers/:id
 * Cari güncelleme
 */
v1CustomersRouter.put('/:id', requirePermission(PERMISSIONS.CUSTOMERS_UPDATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();
  const customer = (db.customers || []).find(
    c => c.id === req.params.id && (c.tenantId === tenantId || (tenantId === 'tnt-isbey' && !c.tenantId)) && !c.deletedAt
  );

  if (!customer) {
    return res.status(404).json({ success: false, message: 'Cari hesap bulunamadı.' });
  }

  const updates = req.body;
  delete updates.id;
  delete updates.tenantId;
  delete updates.balance;
  delete updates.totalDebit;
  delete updates.totalCredit;

  Object.assign(customer, updates, { updatedAt: new Date().toISOString() });

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'CUSTOMER_UPDATED',
    module: 'CUSTOMERS',
    documentNo: customer.code,
    ipAddress: req.ip || '127.0.0.1',
    details: `'${customer.title}' carisi güncellendi.`,
  });

  storage.save();
  res.json({ success: true, customer });
});

/**
 * DELETE /api/v1/customers/:id
 * Soft delete (deletedAt)
 */
v1CustomersRouter.delete('/:id', requirePermission(PERMISSIONS.CUSTOMERS_DELETE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const db = storage.getState();
  const customer = (db.customers || []).find(
    c => c.id === req.params.id && (c.tenantId === tenantId || (tenantId === 'tnt-isbey' && !c.tenantId)) && !c.deletedAt
  );

  if (!customer) {
    return res.status(404).json({ success: false, message: 'Cari hesap bulunamadı.' });
  }

  customer.deletedAt = new Date().toISOString();
  customer.deletedBy = user.fullName || user.username;
  customer.active = false;

  storage.addAuditLog({
    userId: user.id,
    username: user.fullName || user.username,
    companyId: tenantId,
    action: 'CUSTOMER_DELETED',
    module: 'CUSTOMERS',
    documentNo: customer.code,
    ipAddress: req.ip || '127.0.0.1',
    details: `'${customer.title}' carisi silindi (soft delete).`,
  });

  storage.save();
  res.json({ success: true, message: 'Cari hesap silindi.' });
});

/**
 * GET /api/v1/customers/:id/statement
 * Yürüyen bakiyeli cari hesap ekstresi
 */
v1CustomersRouter.get('/:id/statement', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

  try {
    const statement = FinancialTransactionService.getCustomerStatement(
      String(req.params.id),
      tenantId,
      startDate,
      endDate
    );
    res.json({ success: true, data: statement });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message });
  }
});
