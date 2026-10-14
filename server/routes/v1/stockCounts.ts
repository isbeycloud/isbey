/**
 * İŞBEY CLOUD — Sayım Fişleri (2026-10-12)
 * ========================================
 *  - GET /api/v1/stock-counts — tenant'ın sayım fişleri (yeniden eskiye).
 *  - GET /api/v1/stock-counts/:id/html — sayım fişi rapor HTML'i.
 *
 * GÜVENLİK: requireAuth + resolveTenant + `products.view`. Tenant izolasyonu
 * zorunlu. Yalnız COMPLETED fişler raporlanır.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { renderStockCountHtml } from '../../services/stockCountReportService';

export const v1StockCountsRouter = Router();

v1StockCountsRouter.use(requireAuth, resolveTenant);

v1StockCountsRouter.get('/', requirePermission(PERMISSIONS.PRODUCTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const list = (db.stockCounts || [])
    .filter(s => s.tenantId === tenantId)
    .map(s => ({
      ...s,
      plusCount: s.items.filter(i => i.variance > 0).length,
      minusCount: s.items.filter(i => i.variance < 0).length,
      exactCount: s.items.filter(i => i.variance === 0).length,
    }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json({ success: true, stockCounts: list });
});

v1StockCountsRouter.get('/:id/html', requirePermission(PERMISSIONS.PRODUCTS_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');
  try {
    const { html, documentNo } = renderStockCountHtml(id, tenantId);
    if (req.query.download === '1') {
      const safe = String(documentNo || 'sayim').replace(/[^\w\-]+/g, '_').slice(0, 60);
      res.setHeader('Content-Disposition', `attachment; filename="Sayim_${safe}.html"`);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    const msg = String(err?.message || 'Sayım fişi görüntülenemedi.');
    const status = /bulunamadı/i.test(msg) ? 404 : /tamamlanmış/i.test(msg) ? 409 : 400;
    res.status(status).json({ success: false, message: msg });
  }
});
