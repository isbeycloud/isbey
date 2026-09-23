import { Router } from 'express';
import { storage } from '../db/storage';
import { Customer } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';

export const customersRouter = Router();

customersRouter.use(requireAuth);
customersRouter.use(resolveTenant);

// List all customers (Tenant Isolated)
customersRouter.get('/', (req, res) => {
  const { type, search } = req.query;
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  
  // Sadece bu tenant'a ait veya varsayılan demo tenant müşterileri
  let list = db.customers.filter(c => 
    c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
  );

  if (type && type !== 'ALL') {
    list = list.filter(c => c.type === type || c.type === 'BOTH');
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.taxNumber?.includes(q) ||
      c.phone.includes(q)
    );
  }

  res.json({ success: true, customers: list });
});

// Get single customer (Tenant Isolated & IDOR Protected)
customersRouter.get('/:id', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const customer = db.customers.find(c => 
    c.id === req.params.id && (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey'))
  );
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Cari kart bulunamadı.' });
  }
  res.json({ success: true, customer });
});

// Get customer statement (Cari Ekstre)
customersRouter.get('/:id/statement', (req, res) => {
  const db = storage.getState();
  const customer = db.customers.find(c => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Cari kart bulunamadı.' });
  }

  const transactions = db.currentTransactions
    .filter(t => t.customerId === customer.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = 0;
  const statementRows = transactions.map(t => {
    runningBalance += Number(t.debit || 0) - Number(t.credit || 0);
    return {
      ...t,
      runningBalance: Math.round(runningBalance * 100) / 100,
    };
  });

  res.json({
    success: true,
    customer,
    statement: statementRows,
    summary: {
      totalDebit: customer.totalDebit,
      totalCredit: customer.totalCredit,
      currentBalance: customer.balance,
      riskLimit: customer.riskLimit,
      availableLimit: Math.max(0, customer.riskLimit - customer.balance),
    },
  });
});

// Create Customer
customersRouter.post('/', async (req, res) => {
  const { title, contactName, taxNumber, taxOffice, phone, email, address, city, district, iban, type, riskLimit, maturityDays, notes } = req.body;

  if (!title || !phone) {
    return res.status(400).json({ success: false, message: 'Ünvan ve Telefon alanları zorunludur.' });
  }

  try {
    const newCustomer = await storage.runTransaction(draft => {
      const nextNum = draft.customers.length + 1;
      const code = `CAR-${String(nextNum).padStart(3, '0')}`;

      const customer: Customer = {
        id: `cust-${Date.now()}`,
        tenantId: req.tenantId || 'tnt-isbey',
        code,
        title,
        contactName: contactName || '',
        taxNumber: taxNumber || '',
        taxOffice: taxOffice || '',
        phone,
        email: email || '',
        address: address || '',
        city: city || 'İstanbul',
        district: district || '',
        iban: iban || '',
        type: type || 'CUSTOMER',
        riskLimit: Number(riskLimit) || 100000,
        maturityDays: Number(maturityDays) || 30,
        notes: notes || '',
        balance: 0,
        totalDebit: 0,
        totalCredit: 0,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      draft.customers.push(customer);
      return customer;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'CUSTOMER',
      documentNo: newCustomer.code,
      ipAddress: req.ip || '127.0.0.1',
      details: `Yeni cari kart oluşturuldu: ${newCustomer.title} (${newCustomer.code})`,
    });

    res.json({ success: true, customer: newCustomer, message: 'Cari kart başarıyla kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update Customer
customersRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    const updated = await storage.runTransaction(draft => {
      const customer = draft.customers.find(c => c.id === id);
      if (!customer) {
        throw new Error('Cari kart bulunamadı.');
      }

      Object.assign(customer, {
        ...updateData,
        updatedAt: new Date().toISOString(),
      });

      return customer;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'UPDATE',
      module: 'CUSTOMER',
      documentNo: updated.code,
      ipAddress: req.ip || '127.0.0.1',
      details: `Cari kart güncellendi: ${updated.title}`,
    });

    res.json({ success: true, customer: updated, message: 'Cari kart güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
