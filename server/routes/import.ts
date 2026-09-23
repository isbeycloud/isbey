import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { Customer, Product } from '../db/schema';

const router = Router();

// POST /api/import/customers
router.post('/customers', async (req: Request, res: Response) => {
  try {
    const { rows = [] } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('İçe aktarılacak cari verisi bulunamadı.');
    }

    const inserted = await storage.runTransaction(async draft => {
      let count = 0;
      for (const row of rows) {
        if (!row.title?.trim()) continue;

        const code = row.code?.trim() || `M-${1000 + draft.customers.length + 1}`;
        const newCust: Customer = {
          id: `cust-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          code,
          title: row.title.trim(),
          contactName: row.contactName || '',
          taxNumber: row.taxNumber || '',
          taxOffice: row.taxOffice || '',
          phone: row.phone || '0500 000 00 00',
          email: row.email || '',
          address: row.address || '',
          city: row.city || 'İstanbul',
          district: row.district || '',
          type: (row.type as any) || 'CUSTOMER',
          riskLimit: Number(row.riskLimit) || 50000,
          maturityDays: Number(row.maturityDays) || 30,
          notes: row.notes || 'Toplu Excel/CSV içe aktarımı ile eklendi.',
          balance: 0,
          totalDebit: 0,
          totalCredit: 0,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        draft.customers.push(newCust);
        count++;
      }

      storage.addAuditLog({
        userId: 'usr-1',
        username: 'Yönetici Kullanıcı',
        action: 'CREATE',
        module: 'CARİ',
        ipAddress: '127.0.0.1',
        details: `Toplu Excel/CSV ile ${count} adet yeni cari kart içe aktarıldı.`,
      });

      return count;
    });

    res.json({ success: true, message: `${inserted} adet cari kart başarıyla içe aktarıldı.` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/import/products
router.post('/products', async (req: Request, res: Response) => {
  try {
    const { rows = [] } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('İçe aktarılacak ürün verisi bulunamadı.');
    }

    const inserted = await storage.runTransaction(async draft => {
      let count = 0;
      const defaultWh = draft.warehouses[0]?.id || 'wh-1';
      const defaultWhName = draft.warehouses[0]?.name || 'Merkez Depo';
      const defaultGrp = draft.productGroups[0]?.id || 'grp-1';
      const defaultGrpName = draft.productGroups[0]?.name || 'Genel';

      for (const row of rows) {
        if (!row.name?.trim()) continue;

        const code = row.code?.trim() || `STK-${String(draft.products.length + 1).padStart(3, '0')}`;
        const barcode = row.barcode?.trim() || `8690000${Math.floor(100000 + Math.random() * 900000)}`;

        const newProd: Product = {
          id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          barcode,
          code,
          name: row.name.trim(),
          groupId: row.groupId || defaultGrp,
          groupName: row.groupName || defaultGrpName,
          unit: row.unit || 'Adet',
          purchasePrice: Number(row.purchasePrice) || 0,
          salePrice: Number(row.salePrice) || 0,
          vatRate: Number(row.vatRate ?? 20),
          criticalStock: Number(row.criticalStock) || 5,
          currentStock: Number(row.currentStock) || 0,
          warehouseId: row.warehouseId || defaultWh,
          warehouseName: row.warehouseName || defaultWhName,
          description: row.description || 'Toplu Excel/CSV içe aktarımı ile eklendi.',
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        draft.products.push(newProd);

        // If initial stock > 0, create stock movement
        if (newProd.currentStock > 0) {
          draft.stockMovements.push({
            id: `sm-imp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            productId: newProd.id,
            productCode: newProd.code,
            productName: newProd.name,
            warehouseId: newProd.warehouseId,
            documentNo: 'DEVIR-ILK-STOK',
            documentType: 'ADJUSTMENT',
            movementType: 'COUNT_ADJUSTMENT',
            quantity: newProd.currentStock,
            direction: 'IN',
            unitPrice: newProd.purchasePrice,
            totalAmount: newProd.currentStock * newProd.purchasePrice,
            date: new Date().toISOString().split('T')[0],
            notes: 'Toplu içe aktarım açılış stoğu',
            userId: 'usr-1',
            createdAt: new Date().toISOString(),
          });
        }

        count++;
      }

      storage.addAuditLog({
        userId: 'usr-1',
        username: 'Yönetici Kullanıcı',
        action: 'CREATE',
        module: 'STOK',
        ipAddress: '127.0.0.1',
        details: `Toplu Excel/CSV ile ${count} adet yeni stok kartı içe aktarıldı.`,
      });

      return count;
    });

    res.json({ success: true, message: `${inserted} adet stok kartı başarıyla içe aktarıldı.` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
