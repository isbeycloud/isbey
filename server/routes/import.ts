import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { Customer, Product } from '../db/schema';
import { requireAuth, resolveTenant } from '../middleware/authGuards';
import { assertOwnedWarehouse, isOwnedBy, stockMovementOwnedFields } from '../security/tenantOwnership';

const router = Router();

// 2026-10-17 GÜVENLİK: Bu router'da HİÇBİR kimlik doğrulaması ve firma
// çözümlemesi yoktu — `tenantId` dizesi dosyada hiç geçmiyordu. Sonuç:
// içe aktarılan cari/stok kartları SAHİPSİZ doğuyor, açılış stok hareketi
// sahipsiz depo kimliğine (`'wh-1'` — canlıda VAR OLMAYAN) yazılıyordu.
// `recalculateBalances` tenant'a bakmadığı için bu hareketler ürün stoğunu
// gerçekten değiştiriyordu. Artık her istek kimlik + firma ile gelir.
router.use(requireAuth);
router.use(resolveTenant);

// POST /api/import/customers
router.post('/customers', async (req: Request, res: Response) => {
  try {
    const { rows = [] } = req.body;
    const tenantId = req.tenantId!;
    const actingUserId = req.user?.id || 'system';
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
          // 2026-10-17: Sahiplik AÇIK yazılır; aksi hâlde kayıt "eski veri"
          // sayılıp varsayılan firmada birikir ve diğer firmalara görünür.
          tenantId,
          companyId: tenantId,
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

      // 2026-10-17: Denetim izi gerçek kullanıcıyı gösterir (sabit 'usr-1' değil).
      storage.addAuditLog({
        userId: actingUserId,
        username: req.user?.username || 'system',
        action: 'CREATE',
        module: 'CARİ',
        ipAddress: req.ip || '127.0.0.1',
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
    const tenantId = req.tenantId!;
    const actingUserId = req.user?.id || 'system';
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('İçe aktarılacak ürün verisi bulunamadı.');
    }

    // 2026-10-17 GÜVENLİK: Depo kapısı ÖNCE (transaction dışında) çalışır.
    // Eski hâlde hedef depo `draft.warehouses[0]?.id || 'wh-1'` idi: filtre
    // yok, sahiplik yok ve `'wh-1'` canlıda VAR OLMAYAN bir kimlikti.
    // Kural:
    //   - Satırda `warehouseId` varsa yalnız o depo kullanılır (sahiplik şart).
    //   - Satırda yoksa ve firmanın TEK yazılabilir deposu varsa o kullanılır
    //     (sunucu kararı; istek gövdesinden türetilmiş bir varsayılan DEĞİL).
    //   - Satırda yoksa ve birden çok depo varsa belirsizlik AÇIK hata verir;
    //     başka firmaya ya da rastgele bir depoya sessizce düşülmez.
    const rowWhIds = Array.from(
      new Set((rows as any[]).map(r => (typeof r?.warehouseId === 'string' ? r.warehouseId.trim() : '')).filter(Boolean))
    );
    const ownedWh = (storage.getState().warehouses || []).filter(w => isOwnedBy(w, tenantId));
    const impliedWhId = rowWhIds.length === 1 ? rowWhIds[0] : undefined;
    const singleOwnedWhId = ownedWh.length === 1 ? ownedWh[0].id : undefined;
    const targetWhId = impliedWhId ?? singleOwnedWhId;
    // Kapı hem dışarıda hem içeride doğrulanır; hiçbir koşulda varsayılana düşülmez.
    assertOwnedWarehouse(storage.getState().warehouses, targetWhId, tenantId);

    const inserted = await storage.runTransaction(async draft => {
      let count = 0;
      const warehouse = assertOwnedWarehouse(draft.warehouses, targetWhId, tenantId);
      const defaultGrp = draft.productGroups[0]?.id || 'grp-1';
      const defaultGrpName = draft.productGroups[0]?.name || 'Genel';

      for (const row of rows) {
        if (!row.name?.trim()) continue;

        const code = row.code?.trim() || `STK-${String(draft.products.length + 1).padStart(3, '0')}`;
        const barcode = row.barcode?.trim() || `8690000${Math.floor(100000 + Math.random() * 900000)}`;

        const newProd: Product = {
          id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          // 2026-10-17: Sahiplik açık yazılır; içe aktarılan kart sahipsiz doğmaz.
          // (Product tipinde `companyId` alanı YOKTUR — sahiplik `tenantId`'dir.)
          tenantId,
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
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
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
            // 2026-10-17: Hareket artık sahiplik + doğrulanmış depo taşır.
            ...stockMovementOwnedFields(tenantId, warehouse),
            productId: newProd.id,
            productCode: newProd.code,
            productName: newProd.name,
            documentNo: 'DEVIR-ILK-STOK',
            documentType: 'ADJUSTMENT',
            movementType: 'COUNT_ADJUSTMENT',
            quantity: newProd.currentStock,
            direction: 'IN',
            unitPrice: newProd.purchasePrice,
            totalAmount: newProd.currentStock * newProd.purchasePrice,
            date: new Date().toISOString().split('T')[0],
            notes: 'Toplu içe aktarım açılış stoğu',
            userId: actingUserId,
            createdAt: new Date().toISOString(),
          });
        }

        count++;
      }

      storage.addAuditLog({
        userId: actingUserId,
        username: req.user?.username || 'system',
        action: 'CREATE',
        module: 'STOK',
        ipAddress: req.ip || '127.0.0.1',
        details: `Toplu Excel/CSV ile ${count} adet yeni stok kartı içe aktarıldı.`,
      });

      return count;
    });

    res.json({ success: true, message: `${inserted} adet stok kartı başarıyla içe aktarıldı.` });
  } catch (error: any) {
    // Depo kapısı hatası ise HTTP kodu ve `code` alanı korunur (403/400).
    res.status(error?.statusCode || 400).json({ success: false, code: error?.code, message: error.message });
  }
});

export default router;
