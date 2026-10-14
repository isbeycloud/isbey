/**
 * İŞBEY CLOUD — Taslak Fatura PDF Uçları (2026-10-12)
 * ===================================================
 *  - GET /api/v1/draft-pdfs/report?kind=ALL — taslak raporu (giden + gelen).
 *  - GET /api/v1/draft-pdfs/outgoing/:id/html — giden taslak HTML.
 *  - GET /api/v1/draft-pdfs/incoming/:id/html — gelen taslak HTML.
 *
 * İstemci HTML'i PrintModal akışıyla PDF'e çevirir (sunucuda PDF motoru yok).
 * HTML'e dönmeden önce `?download=1` ile dosya adı verilir (yazdırma/PDF adı).
 *
 * GÜVENLİK: requireAuth + resolveTenant + `invoices.view` (giden) /
 * `einvoice.view` (gelen). Tenant izolasyonu + IDOR serviste zorunlu.
 * Gönderilmiş faturaların HTML'i BURADAN alınamaz (e-belge portalından).
 */

import { Router, Request, Response } from 'express';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { buildDraftReport, renderIncomingDraftHtml, renderOutgoingDraftHtml } from '../../services/draftPdfService';

export const v1DraftPdfsRouter = Router();

v1DraftPdfsRouter.use(requireAuth, resolveTenant);

function downloadName(documentNo: string): string {
  const safe = String(documentNo || 'taslak').replace(/[^\w\-çğıöşüÇĞİÖŞÜ]+/g, '_').slice(0, 60);
  return `Taslak_${safe}.html`;
}

/**
 * GET /api/v1/draft-pdfs/report?kind=ALL|OUTGOING|INCOMING
 * Taslak raporu (listeler + sayaçlar + toplamlar).
 */
v1DraftPdfsRouter.get(
  '/report',
  requirePermission(PERMISSIONS.INVOICES_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const kind = String(req.query.kind || 'ALL').toUpperCase();
    if (kind !== 'ALL' && kind !== 'OUTGOING' && kind !== 'INCOMING') {
      return res.status(400).json({ success: false, message: 'kind ALL, OUTGOING veya INCOMING olmalı.' });
    }
    res.json({ success: true, report: buildDraftReport(tenantId, kind as any) });
  }
);

/**
 * GET /api/v1/draft-pdfs/outgoing/:id/html
 * Giden taslak faturanın yazdırılabilir HTML'i.
 */
v1DraftPdfsRouter.get(
  '/outgoing/:id/html',
  requirePermission(PERMISSIONS.INVOICES_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');
    try {
      const { html, documentNo } = renderOutgoingDraftHtml(id, tenantId);
      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName(documentNo)}"`);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: any) {
      const msg = String(err?.message || 'Taslak görüntülenemedi.');
      const status = /bulunamadı/i.test(msg) ? 404 : /taslak değil/i.test(msg) ? 409 : 400;
      res.status(status).json({ success: false, message: msg });
    }
  }
);

/**
 * GET /api/v1/draft-pdfs/incoming/:id/html
 * Gelen havuz belgesinin yazdırılabilir HTML'i.
 */
v1DraftPdfsRouter.get(
  '/incoming/:id/html',
  requirePermission(PERMISSIONS.EINVOICE_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');
    try {
      const { html, documentNo } = renderIncomingDraftHtml(id, tenantId);
      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName(documentNo)}"`);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: any) {
      const msg = String(err?.message || 'Gelen belge görüntülenemedi.');
      const status = /bulunamadı/i.test(msg) ? 404 : /taslak değil|işlenmiş/i.test(msg) ? 409 : 400;
      res.status(status).json({ success: false, message: msg });
    }
  }
);
