/**
 * İŞBEY CLOUD — FAZ 25.3-B RAPOR TASARIM MERKEZİ BACKEND ROUTE
 * =============================================================
 * Rapor şablonlarının (alan/grafik/filtre/kolon seçimi) kalıcı veri katmanı.
 *
 * GÜVENLİK (FAZ 25.2-A konvansiyonu — CLAUDE.md kuralı):
 *   - Tüm endpoint'ler requireAuth ile korunur.
 *   - tenantId YALNIZCA token'dan (req.tenantId) alınır.
 *   - Kayıt sahipliği: design.tenantId === req.tenantId.
 *   - Hata mesajları iç detay sızmaz.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission, PERMISSIONS } from '../middleware/authGuards';
import { storage } from '../db/storage';
import type { ReportDesignRecord } from '../db/schema';

const router = Router();

const generateId = () => 'rptd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

const VALID_SOURCES = ['SALES', 'PURCHASE', 'CUSTOMER', 'CASH', 'STOCK', 'VAT'];
const VALID_CHARTS = ['BAR', 'LINE', 'DOUGHNUT', 'TABLE'];
const VALID_FIELDS = ['date', 'customer', 'product', 'vat', 'employee', 'region', 'warehouse'];
const VALID_KPIS = ['revenue', 'growth', 'count', 'avg', 'receivable', 'payable'];

interface AuthedRequest extends Request {
  tenantId?: string;
}

const resolveTenantFromToken = (req: AuthedRequest): string | null => {
  const t = req.tenantId;
  return typeof t === 'string' && t ? t : null;
};

/** Body'den güvenli tasarım alanları */
const pickDesignFields = (body: any): Partial<ReportDesignRecord> => {
  const out: Partial<ReportDesignRecord> = {};
  if (typeof body?.name === 'string' && body.name.trim()) out.name = body.name.trim().slice(0, 120);
  if (typeof body?.dataSource === 'string' && VALID_SOURCES.includes(body.dataSource)) out.dataSource = body.dataSource;
  if (typeof body?.chartType === 'string' && VALID_CHARTS.includes(body.chartType)) out.chartType = body.chartType;
  if (Array.isArray(body?.fields)) out.fields = body.fields.filter((f: unknown) => typeof f === 'string' && VALID_FIELDS.includes(f as string));
  if (Array.isArray(body?.columns)) out.columns = body.columns.filter((f: unknown) => typeof f === 'string').slice(0, 30);
  if (Array.isArray(body?.kpis)) out.kpis = body.kpis.filter((f: unknown) => typeof f === 'string' && VALID_KPIS.includes(f as string));
  if (body?.filters && typeof body.filters === 'object') {
    const f = body.filters;
    out.filters = {
      dateFrom: typeof f.dateFrom === 'string' ? f.dateFrom.slice(0, 20) : undefined,
      dateTo: typeof f.dateTo === 'string' ? f.dateTo.slice(0, 20) : undefined,
      customerIds: Array.isArray(f.customerIds) ? f.customerIds.filter((x: unknown) => typeof x === 'string').slice(0, 100) : undefined,
      warehouseIds: Array.isArray(f.warehouseIds) ? f.warehouseIds.filter((x: unknown) => typeof x === 'string').slice(0, 100) : undefined,
    };
  }
  return out;
};

// GET /api/report-designs
router.get('/', requireAuth, requirePermission(PERMISSIONS.REPORTS_VIEW), (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const all = storage.getState().reportDesigns || [];
    const list = all.filter(d => d.tenantId === tenantId);
    return res.json({ success: true, reportDesigns: list, total: list.length });
  } catch {
    return res.status(500).json({ success: false, error: 'Rapor tasarımları yüklenemedi' });
  }
});

// GET /api/report-designs/:id
router.get('/:id', requireAuth, requirePermission(PERMISSIONS.REPORTS_VIEW), (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const all = storage.getState().reportDesigns || [];
    const found = all.find(d => d.id === req.params.id && d.tenantId === tenantId);
    if (!found) return res.status(404).json({ success: false, error: 'Rapor tasarımı bulunamadı' });
    return res.json({ success: true, reportDesign: found });
  } catch {
    return res.status(500).json({ success: false, error: 'Rapor tasarımı yüklenemedi' });
  }
});

// POST /api/report-designs
router.post('/', requireAuth, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const fields = pickDesignFields(req.body);
    if (!fields.name) return res.status(400).json({ success: false, error: 'Rapor adı zorunlu' });
    if (!fields.dataSource) return res.status(400).json({ success: false, error: 'Veri kaynağı zorunlu' });

    const rec: ReportDesignRecord = {
      id: generateId(),
      tenantId,
      name: fields.name,
      dataSource: fields.dataSource,
      chartType: fields.chartType || 'BAR',
      fields: fields.fields || ['date', 'customer'],
      filters: fields.filters,
      columns: fields.columns,
      kpis: fields.kpis,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await storage.runTransaction(draft => {
      if (!draft.reportDesigns) draft.reportDesigns = [];
      draft.reportDesigns.push(rec);
    });
    return res.status(201).json({ success: true, reportDesign: rec });
  } catch {
    return res.status(500).json({ success: false, error: 'Rapor tasarımı kaydedilemedi' });
  }
});

// PUT /api/report-designs/:id
router.put('/:id', requireAuth, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });

    const fields = pickDesignFields(req.body);
    let updated: ReportDesignRecord | undefined;
    let notFound = false;
    await storage.runTransaction(draft => {
      if (!draft.reportDesigns) draft.reportDesigns = [];
      const list: ReportDesignRecord[] = draft.reportDesigns;
      // GÜVENLİK DÜZELTMESİ (TOCTOU): kimlik + sahiplik doğrulaması transaction
      // İÇİNDE id+tenant eşleşmesiyle yapılır (indeks dışarıdan taşınmaz).
      const idx = list.findIndex(d => d.id === req.params.id && d.tenantId === tenantId);
      if (idx === -1) {
        notFound = true;
        return;
      }
      const cur = list[idx];
      list[idx] = {
        ...cur,
        ...fields,
        id: cur.id,
        tenantId: cur.tenantId,
        createdAt: cur.createdAt,
        updatedAt: nowIso(),
      };
      updated = list[idx];
    });
    if (notFound || !updated) return res.status(404).json({ success: false, error: 'Rapor tasarımı bulunamadı' });
    return res.json({ success: true, reportDesign: updated });
  } catch {
    return res.status(500).json({ success: false, error: 'Rapor tasarımı güncellenemedi' });
  }
});

// DELETE /api/report-designs/:id
router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const all = storage.getState().reportDesigns || [];
    const target = all.find(d => d.id === req.params.id && d.tenantId === tenantId);
    if (!target) return res.status(404).json({ success: false, error: 'Rapor tasarımı bulunamadı' });
    await storage.runTransaction(draft => {
      if (!draft.reportDesigns) draft.reportDesigns = [];
      const list: ReportDesignRecord[] = draft.reportDesigns;
      draft.reportDesigns = list.filter(d => !(d.id === target.id && d.tenantId === tenantId));
    });
    return res.json({ success: true, message: 'Rapor tasarımı silindi' });
  } catch {
    return res.status(500).json({ success: false, error: 'Rapor tasarımı silinemedi' });
  }
});

export default router;
