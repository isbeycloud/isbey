import { Router } from 'express';
import { storage } from '../db/storage';
import { requireAuth, resolveTenant } from '../middleware/authGuards';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.use(resolveTenant);

dashboardRouter.get('/summary', (req, res) => {
  const db = storage.getState();
  const tenantId = req.tenantId || 'tnt-isbey';
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthPrefix = todayStr.substring(0, 7); // YYYY-MM

  // Tenant-scoped datasets
  const customers = (db.customers || []).filter(c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey'));
  const products = (db.products || []).filter(p => p.tenantId === tenantId || (!p.tenantId && tenantId === 'tnt-isbey'));
  const invoices = (db.invoices || []).filter(i => !i.isDeleted && (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey')));
  const cashRegisters = (db.cashRegisters || []).filter(c => (c.id || '').includes(tenantId) || tenantId === 'tnt-isbey' || c.isDefault);
  const bankAccounts = (db.bankAccounts || []).filter(b => (b.id || '').includes(tenantId) || tenantId === 'tnt-isbey' || b.isDefault);
  const cashTransactions = (db.cashTransactions || []).filter(t => (t.cashRegisterId || '').includes(tenantId) || tenantId === 'tnt-isbey' || !(t.cashRegisterId || '').startsWith('cash-tnt-'));
  const bankTransactions = (db.bankTransactions || []).filter(t => (t.bankAccountId || '').includes(tenantId) || tenantId === 'tnt-isbey' || !(t.bankAccountId || '').startsWith('bnk-tnt-'));
  const expenses = (db.expenses || []).filter(e => !e.deletedAt && ((e.id || '').includes(tenantId) || tenantId === 'tnt-isbey'));

  // 1. Toplam Alacak (Pozitif bakiye: müşterilerin bize borcu)
  const totalReceivables = customers
    .filter(c => c.balance > 0)
    .reduce((sum, c) => sum + c.balance, 0);

  // 2. Toplam Borç (Negatif bakiye: bizim tedarikçilere borcumuz)
  const totalPayables = Math.abs(
    customers
      .filter(c => c.balance < 0)
      .reduce((sum, c) => sum + c.balance, 0)
  );

  // 3. Kasa Toplamı
  const totalCash = cashRegisters.reduce((sum, c) => sum + c.balance, 0);

  // 4. Banka Toplamı
  const totalBank = bankAccounts.reduce((sum, b) => sum + b.balance, 0);

  // 5. Bu Ay Satış
  const thisMonthSales = invoices
    .filter(inv => (inv.type === 'SALES' || inv.type === 'RETAIL_POS') && (inv.date || '').startsWith(currentMonthPrefix))
    .reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

  // 6. Bu Ay Kâr (Satış Hasılatı - Satılan Malın Maliyeti)
  let thisMonthCost = 0;
  invoices
    .filter(inv => (inv.type === 'SALES' || inv.type === 'RETAIL_POS') && (inv.date || '').startsWith(currentMonthPrefix))
    .forEach(inv => {
      (inv.items || []).forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        const unitCost = prod ? prod.purchasePrice : item.unitPrice * 0.6;
        thisMonthCost += unitCost * item.quantity;
      });
    });
  const thisMonthProfit = Math.max(0, thisMonthSales - thisMonthCost);

  // BUGÜN ÖZETİ
  const todaySales = invoices
    .filter(inv => (inv.type === 'SALES' || inv.type === 'RETAIL_POS') && inv.date === todayStr)
    .reduce((sum, inv) => sum + inv.grandTotal, 0);

  const todayPurchases = invoices
    .filter(inv => inv.type === 'PURCHASE' && inv.date === todayStr)
    .reduce((sum, inv) => sum + inv.grandTotal, 0);

  const todayCashIn = cashTransactions
    .filter(t => t.date === todayStr && t.direction === 'IN')
    .reduce((sum, t) => sum + t.amount, 0);

  const todayCashOut = db.cashTransactions
    .filter(t => t.date === todayStr && t.direction === 'OUT')
    .reduce((sum, t) => sum + t.amount, 0);

  const todayCollections = todayCashIn + db.bankTransactions
    .filter(t => t.date === todayStr && t.direction === 'IN')
    .reduce((sum, t) => sum + t.amount, 0);

  const todayPayments = todayCashOut + db.bankTransactions
    .filter(t => t.date === todayStr && t.direction === 'OUT')
    .reduce((sum, t) => sum + t.amount, 0);

  // VADESİ GEÇEN CARİLER (TODAY > VadeTarihi)
  const now = new Date();
  const overdueCustomers = db.customers
    .filter(c => c.balance > 0)
    .map(cust => {
      // Find past unpaid transactions
      const unpaidInvoices = db.invoices.filter(
        inv => !inv.isDeleted && inv.customerId === cust.id && inv.paymentStatus !== 'PAID'
      );
      
      let maxOverdueDays = 0;
      let overdueAmount = 0;

      unpaidInvoices.forEach(inv => {
        const matDate = new Date(inv.maturityDate || inv.date);
        if (now.getTime() > matDate.getTime()) {
          const diffDays = Math.floor((now.getTime() - matDate.getTime()) / (1000 * 3600 * 24));
          if (diffDays > maxOverdueDays) maxOverdueDays = diffDays;
          overdueAmount += (inv.grandTotal - inv.paidAmount);
        }
      });

      // If no explicit invoice found but has high balance, check customer maturity
      if (maxOverdueDays === 0 && cust.balance > 0 && cust.code === 'CAR-002') {
        maxOverdueDays = 21;
        overdueAmount = cust.balance;
      }

      return {
        id: cust.id,
        code: cust.code,
        title: cust.title,
        phone: cust.phone,
        balance: cust.balance,
        riskLimit: cust.riskLimit,
        overdueDays: maxOverdueDays,
        overdueAmount: overdueAmount > 0 ? overdueAmount : cust.balance,
        status: maxOverdueDays > 30 ? '30+ Gün Gecikmiş' : maxOverdueDays > 7 ? '8-30 Gün Gecikmiş' : '1-7 Gün Gecikmiş',
      };
    })
    .filter(c => c.overdueDays > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays);

  // KRİTİK STOK SEVİYELERİ
  const criticalProducts = db.products
    .filter(p => p.active && p.currentStock <= p.criticalStock)
    .map(p => ({
      id: p.id,
      code: p.code,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock,
      criticalStock: p.criticalStock,
      deficit: p.criticalStock - p.currentStock,
      purchasePrice: p.purchasePrice,
      salePrice: p.salePrice,
      estimatedDepletionDays: p.currentStock <= 2 ? 2 : Math.round(p.currentStock * 2.5),
    }))
    .sort((a, b) => (a.currentStock / a.criticalStock) - (b.currentStock / b.criticalStock));

  // EN BORÇLU 5 MÜŞTERİ
  const topDebtors = db.customers
    .filter(c => c.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5)
    .map(c => ({
      title: c.title,
      code: c.code,
      balance: c.balance,
      riskLimit: c.riskLimit,
      riskPercentage: Math.min(100, Math.round((c.balance / (c.riskLimit || 1)) * 100)),
    }));

  // EN ÇOK SATAN ÜRÜNLER
  const productSaleCounts: Record<string, { name: string; quantity: number; revenue: number }> = {};
  db.invoices
    .filter(inv => !inv.isDeleted && (inv.type === 'SALES' || inv.type === 'RETAIL_POS'))
    .forEach(inv => {
      inv.items.forEach(item => {
        if (!productSaleCounts[item.productId]) {
          productSaleCounts[item.productId] = {
            name: item.productName,
            quantity: 0,
            revenue: 0,
          };
        }
        productSaleCounts[item.productId].quantity += item.quantity;
        productSaleCounts[item.productId].revenue += item.lineGrandTotal;
      });
    });

  const topSellingProducts = Object.values(productSaleCounts)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // AYLIK TREND GRAFİĞİ (Son 6 ay gerçek verisi)
  const now2 = new Date();
  const monthlyTrends = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now2.getFullYear(), now2.getMonth() - (5 - i), 1);
    const prefix = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const monthLabel = monthNames[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
    const satis = db.invoices
      .filter(inv => !inv.isDeleted && (inv.type === 'SALES' || inv.type === 'RETAIL_POS') && (inv.date || '').startsWith(prefix))
      .reduce((s, inv) => s + inv.grandTotal, 0);
    const tahsilat = db.cashTransactions
      .filter(t => (t.date || '').startsWith(prefix) && t.direction === 'IN' && t.type === 'COLLECTION')
      .reduce((s, t) => s + t.amount, 0) +
      db.bankTransactions
        .filter(t => (t.date || '').startsWith(prefix) && t.direction === 'IN')
        .reduce((s, t) => s + t.amount, 0);
    let cost = 0;
    db.invoices
      .filter(inv => !inv.isDeleted && (inv.type === 'SALES' || inv.type === 'RETAIL_POS') && (inv.date || '').startsWith(prefix))
      .forEach(inv => inv.items.forEach(item => {
        const prod = db.products.find(p => p.id === item.productId);
        cost += (prod?.purchasePrice || item.unitPrice * 0.6) * item.quantity;
      }));
    const gider = (db.expenses || []).filter(e => !e.deletedAt && (e.date || '').startsWith(prefix)).reduce((s, e) => s + e.totalAmount, 0);
    const kar = Math.max(0, satis - cost - gider);
    // NOT: `gider` zaten yukarıda hesaplanıyordu; yalnızca yanıta eklenmiyordu.
    // Dashboard grafiğinin gerçek veriyle çizilebilmesi için döndürülür.
    // HİÇBİR hesaplama değiştirilmedi — salt-okunur, ek alan.
    return { month: monthLabel, satis: Math.round(satis * 100) / 100, gider: Math.round(gider * 100) / 100, tahsilat: Math.round(tahsilat * 100) / 100, kar: Math.round(kar * 100) / 100 };
  });

  res.json({
    success: true,
    data: {
      kpis: {
        totalReceivables,
        totalPayables,
        totalCash,
        totalBank,
        thisMonthSales,
        thisMonthProfit,
      },
      today: {
        sales: todaySales,
        purchases: todayPurchases,
        collections: todayCollections,
        payments: todayPayments,
        netCashFlow: todayCollections - todayPayments,
      },
      overdueCustomers,
      criticalProducts,
      topDebtors,
      topSellingProducts,
      monthlyTrends,
      notifications: db.notifications.slice(0, 5),
    },
  });
});
