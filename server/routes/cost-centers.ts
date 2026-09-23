import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { CostCenter } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const costCenters = (db.costCenters || []).filter(cc => cc.active);
    res.json({ success: true, costCenters });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, code, type = 'DEPARTMENT', description, parentId } = req.body;
    if (!name?.trim()) throw new Error('Masraf merkezi adi zorunludur.');
    const result = await storage.runTransaction(async draft => {
      if (!draft.costCenters) draft.costCenters = [];
      if (draft.costCenters.some(cc => cc.code === code?.trim())) throw new Error('Bu masraf merkezi kodu zaten mevcut.');
      const newCC: CostCenter = { id: 'cc-' + Date.now(), name: name.trim(), code: code?.trim() || 'MC-' + Date.now().toString().slice(-4), type, description, parentId, active: true, createdAt: new Date().toISOString() };
      draft.costCenters.push(newCC);
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'CREATE', module: 'MASRAF_MERKEZI', ipAddress: '127.0.0.1', details: 'Masraf merkezi olusturuldu: ' + name });
      return newCC;
    });
    res.json({ success: true, message: 'Masraf merkezi eklendi.', costCenter: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, type, parentId, active } = req.body;
    const result = await storage.runTransaction(async draft => {
      const cc = (draft.costCenters || []).find(c => c.id === req.params.id);
      if (!cc) throw new Error('Masraf merkezi bulunamadi.');
      if (name) cc.name = name.trim();
      if (description !== undefined) cc.description = description;
      if (type) cc.type = type;
      if (parentId !== undefined) cc.parentId = parentId;
      if (active !== undefined) cc.active = active;
      return cc;
    });
    res.json({ success: true, message: 'Masraf merkezi guncellendi.', costCenter: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await storage.runTransaction(async draft => {
      const idx = (draft.costCenters || []).findIndex(c => c.id === req.params.id);
      if (idx === -1) throw new Error('Masraf merkezi bulunamadi.');
      const expenseCount = (draft.expenses || []).filter(e => e.costCenterId === req.params.id && !e.deletedAt).length;
      if (expenseCount > 0) throw new Error('Bu masraf merkezine bagli ' + expenseCount + ' gider kaydi var. Once giderleri tasiniz.');
      draft.costCenters[idx].active = false;
      storage.addAuditLog({ userId: 'usr-1', username: 'admin', action: 'DELETE', module: 'MASRAF_MERKEZI', ipAddress: '127.0.0.1', details: 'Masraf merkezi pasife alindi: ' + draft.costCenters[idx].name });
    });
    res.json({ success: true, message: 'Masraf merkezi kaldirildi.' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/cost-centers/:id/expenses - Masraf merkezi bazında gider listesi
router.get('/:id/expenses', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const { startDate, endDate } = req.query;
    let expenses = (db.expenses || []).filter(e => e.costCenterId === req.params.id && !e.deletedAt);
    if (startDate) expenses = expenses.filter(e => e.date >= String(startDate));
    if (endDate) expenses = expenses.filter(e => e.date <= String(endDate));
    const totalAmount = expenses.reduce((s, e) => s + e.totalAmount, 0);
    res.json({ success: true, expenses, summary: { totalAmount: Math.round(totalAmount * 100) / 100, count: expenses.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export const costCentersRouter = router;
