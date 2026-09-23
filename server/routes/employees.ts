import { Router } from 'express';
import { storage } from '../db/storage';
import { Employee, EmployeeTransaction } from '../db/schema';

export const employeesRouter = Router();

// List all employees
employeesRouter.get('/', (req, res) => {
  const db = storage.getState();
  res.json({ success: true, employees: db.employees });
});

// List employee transactions
employeesRouter.get('/:id/transactions', (req, res) => {
  const db = storage.getState();
  const txs = db.employeeTransactions.filter(t => t.employeeId === req.params.id);
  res.json({ success: true, transactions: txs });
});

// Create Employee
employeesRouter.post('/', async (req, res) => {
  const { fullName, phone, email, department, title, salary, commissionRate } = req.body;

  if (!fullName || !phone) {
    return res.status(400).json({ success: false, message: 'İsim ve telefon zorunludur.' });
  }

  try {
    const employee = await storage.runTransaction(draft => {
      const nextNum = draft.employees.length + 1;
      const code = `PER-${String(nextNum).padStart(3, '0')}`;

      const emp: Employee = {
        id: `emp-${Date.now()}`,
        code,
        fullName,
        phone,
        email: email || '',
        department: department || 'Genel',
        title: title || 'Personel',
        salary: Number(salary) || 0,
        commissionRate: Number(commissionRate) || 0,
        totalSales: 0,
        totalCommission: 0,
        totalPaid: 0,
        balance: 0,
        active: true,
        createdAt: new Date().toISOString(),
      };

      draft.employees.push(emp);
      return emp;
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'EMPLOYEES',
      documentNo: employee.code,
      ipAddress: req.ip || '127.0.0.1',
      details: `Yeni personel kaydedildi: ${employee.fullName} (${employee.department})`,
    });

    res.json({ success: true, employee, message: 'Personel başarıyla kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Make Salary / Advance / Commission Payment
employeesRouter.post('/:id/pay', async (req, res) => {
  const { id } = req.params;
  const { type, amount, date, cashRegisterId, bankAccountId, description } = req.body;
  const amt = Number(amount);

  if (amt <= 0) {
    return res.status(400).json({ success: false, message: 'Geçerli bir ödeme tutarı giriniz.' });
  }

  try {
    const result = await storage.runTransaction(draft => {
      const emp = draft.employees.find(e => e.id === id);
      if (!emp) throw new Error('Personel bulunamadı.');

      const docNo = `PER-TX-${Date.now().toString().slice(-6)}`;
      const txDate = date || new Date().toISOString().split('T')[0];

      // Kasa veya Bankadan düş
      if (cashRegisterId) {
        const cash = draft.cashRegisters.find(c => c.id === cashRegisterId);
        if (cash) {
          if (cash.balance < amt) throw new Error(`Kasada yetersiz bakiye! Mevcut: ${cash.balance} ₺`);
          cash.balance -= amt;
          draft.cashTransactions.push({
            id: `cx-${Date.now()}`,
            cashRegisterId: cash.id,
            cashRegisterName: cash.name,
            documentNo: docNo,
            type: 'EXPENSE',
            direction: 'OUT',
            amount: amt,
            date: txDate,
            category: 'Personel Ödemesi',
            description: `${emp.fullName} - ${type === 'SALARY' ? 'Maaş' : type === 'ADVANCE' ? 'Avans' : 'Prim'} Ödemesi`,
            userId: 'admin',
            createdAt: new Date().toISOString(),
          });
        }
      } else if (bankAccountId) {
        const bank = draft.bankAccounts.find(b => b.id === bankAccountId);
        if (bank) {
          if (bank.balance < amt) throw new Error(`Bankada yetersiz bakiye! Mevcut: ${bank.balance} ₺`);
          bank.balance -= amt;
          draft.bankTransactions.push({
            id: `bx-${Date.now()}`,
            bankAccountId: bank.id,
            bankAccountName: bank.accountName,
            documentNo: docNo,
            type: 'HAVALE_EFT_OUT',
            direction: 'OUT',
            amount: amt,
            date: txDate,
            description: `${emp.fullName} - ${type === 'SALARY' ? 'Maaş' : type === 'ADVANCE' ? 'Avans' : 'Prim'} Transferi`,
            userId: 'admin',
            createdAt: new Date().toISOString(),
          });
        }
      }

      emp.totalPaid += amt;
      emp.balance = Math.max(0, emp.balance - amt);

      const tx: EmployeeTransaction = {
        id: `etx-${Date.now()}`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        documentNo: docNo,
        type: type || 'SALARY',
        amount: amt,
        date: txDate,
        description: description || 'Personel ödemesi yapıldı',
        cashRegisterId,
        bankAccountId,
        userId: 'admin',
        createdAt: new Date().toISOString(),
      };
      draft.employeeTransactions.push(tx);

      return { emp, tx };
    });

    storage.addAuditLog({
      userId: 'admin',
      username: 'admin',
      action: 'CREATE',
      module: 'EMPLOYEES',
      documentNo: result.tx.documentNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `${result.emp.fullName} personeline ${amt.toLocaleString('tr-TR')} ₺ ödeme yapıldı.`,
    });

    res.json({ success: true, transaction: result.tx, message: 'Personel ödemesi tamamlandı.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
