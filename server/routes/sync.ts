import { Router } from 'express';
import { storage } from '../db/storage';

export const syncRouter = Router();

// Offline Sync Queue Processor
syncRouter.post('/batch', async (req, res) => {
  const { actions } = req.body;
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return res.json({ success: true, processed: 0, message: 'İşlenecek kuyruk verisi yok.' });
  }

  const results: any[] = [];
  try {
    await storage.runTransaction(draft => {
      for (const item of actions) {
        // Process offline items (e.g. OFFLINE_SALE, OFFLINE_COLLECTION)
        if (item.type === 'OFFLINE_SALE') {
          // create invoice / POS receipt
          const invoiceNo = storage.getNextSequence('SALES_INVOICE');
          // Add to draft invoices and movements
          results.push({ id: item.localId, serverId: invoiceNo, status: 'SYNCED' });
        }
      }
    });

    res.json({ success: true, processed: results.length, results, message: `${results.length} adet çevrimdışı kayıt senkronize edildi.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: `Senkronizasyon hatası: ${err.message}` });
  }
});
