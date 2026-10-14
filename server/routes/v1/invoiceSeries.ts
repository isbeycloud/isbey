/**
 * İŞBEY CLOUD — Fatura Serileri (2026-10-12)
 * ==========================================
 * Fatura kayıt ekranında SERİ seçilir (A Serisi, B Serisi…); belge numarası
 * o serinin sayacından üretilir. Mevcut tek sayaç (SALES_INVOICE) korunur —
 * seri SEÇİLMEZSE eski davranış aynen devam eder (geriye dönük uyum).
 *
 * GÜVENLİK: requireAuth + resolveTenant + mevcut fatura izinleri
 * (`invoices.view/create/update`). Yeni izin kodu YOK. Tenant izolasyonu
 * her okuma/yazmada zorunlu. Seri SİLİNMEZ — pasife alınır (kullanılmış
 * numaralar korunur, sayaç geri alınmaz).
 */

import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import type { InvoiceSeries } from '../../db/schema';

export const v1InvoiceSeriesRouter = Router();

v1InvoiceSeriesRouter.use(requireAuth, resolveTenant);

function visibleSeries(state: ReturnType<typeof storage.getState>, tenantId: string): InvoiceSeries[] {
  return (state.invoiceSeries || []).filter(
    s => s.tenantId === tenantId || (tenantId === 'tnt-isbey' && !s.tenantId)
  );
}

function cleanPrefix(input: unknown): string {
  const p = typeof input === 'string' ? input.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') : '';
  return p.slice(0, 12);
}

/**
 * GET /api/v1/invoice-series?type=SALES
 * Tenant'ın serileri (türe göre süzülebilir; pasifler dahil).
 */
v1InvoiceSeriesRouter.get('/', requirePermission(PERMISSIONS.INVOICES_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { type, activeOnly } = req.query as Record<string, string>;

  let list = visibleSeries(storage.getState(), tenantId);
  if (type === 'SALES' || type === 'PURCHASE') {
    list = list.filter(s => s.invoiceTypes.length === 0 || s.invoiceTypes.includes(type as any));
  }
  if (activeOnly === 'true') {
    list = list.filter(s => s.active !== false);
  }
  list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const yr = new Date().getFullYear();
  const withPreview = list.map(s => ({
    ...s,
    nextPreview: `${s.prefix}-${yr}-${String(s.lastNumber + 1).padStart(s.length || 6, '0')}`,
  }));

  res.json({ success: true, invoiceSeries: withPreview });
});

/**
 * POST /api/v1/invoice-series
 * Yeni seri. Aynı ad veya ön ek ikinci kez açılamaz.
 */
v1InvoiceSeriesRouter.post('/', requirePermission(PERMISSIONS.INVOICES_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { name, prefix, invoiceTypes, isDefault, length } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Seri adı zorunludur (örn. A Serisi).' });
  }
  const cleanName = name.trim();
  const cleanPfx = cleanPrefix(prefix);
  if (!cleanPfx) {
    return res.status(400).json({ success: false, message: 'Seri ön eki zorunludur (harf/rakam).' });
  }

  try {
    const created = await storage.runTransaction(draft => {
      const mevcut = visibleSeries(draft, tenantId);
      if (mevcut.some(s => s.name.toLocaleLowerCase('tr') === cleanName.toLocaleLowerCase('tr'))) {
        throw new Error(`Bu adda bir seri zaten var: ${cleanName}`);
      }
      if (mevcut.some(s => s.prefix.toUpperCase() === cleanPfx)) {
        throw new Error(`Bu ön ek zaten kullanılıyor: ${cleanPfx}`);
      }

      const now = new Date().toISOString();
      const types: Array<'SALES' | 'PURCHASE'> = Array.isArray(invoiceTypes)
        ? (invoiceTypes as string[]).filter((t): t is 'SALES' | 'PURCHASE' => t === 'SALES' || t === 'PURCHASE')
        : [];
      const makeDefault = Boolean(isDefault) || mevcut.length === 0;

      if (makeDefault) {
        for (const s of draft.invoiceSeries || []) {
          if (s.tenantId === tenantId || (tenantId === 'tnt-isbey' && !s.tenantId)) s.isDefault = false;
        }
      }

      const series: InvoiceSeries = {
        id: `isr-${Date.now()}`,
        tenantId,
        name: cleanName,
        prefix: cleanPfx,
        lastNumber: 0,
        length: Math.min(10, Math.max(3, Number(length) || 6)),
        invoiceTypes: types,
        isDefault: makeDefault,
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      if (!draft.invoiceSeries) draft.invoiceSeries = [];
      draft.invoiceSeries.push(series);
      return series;
    });

    storage.addAuditLog({
      userId: (req as any).user?.id || 'admin',
      username: (req as any).user?.username || 'admin',
      action: 'CREATE',
      module: 'FATURA',
      documentNo: created.prefix,
      ipAddress: req.ip || '127.0.0.1',
      details: `Fatura serisi oluşturuldu: ${created.name} (${created.prefix})`,
    });

    res.json({ success: true, invoiceSeries: created, message: 'Fatura serisi kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/v1/invoice-series/:id
 * Seri tanımını günceller. Sayaç (`lastNumber`) GERİ ALINAMAZ — yalnız ileri
 * alınabilir (kullanılmış numaranın tekrar üretilmesi engellenir).
 */
v1InvoiceSeriesRouter.put('/:id', requirePermission(PERMISSIONS.INVOICES_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');

  if (!visibleSeries(storage.getState(), tenantId).some(s => s.id === id)) {
    return res.status(404).json({ success: false, message: 'Fatura serisi bulunamadı.' });
  }

  const { name, prefix, invoiceTypes, isDefault, active, lastNumber, length } = req.body || {};

  try {
    const updated = await storage.runTransaction(draft => {
      const series = (draft.invoiceSeries || []).find(
        s => s.id === id && (s.tenantId === tenantId || (tenantId === 'tnt-isbey' && !s.tenantId))
      );
      if (!series) throw new Error('Fatura serisi bulunamadı.');

      if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed) throw new Error('Seri adı boş olamaz.');
        const others = visibleSeries(draft, tenantId).filter(s => s.id !== id);
        if (others.some(s => s.name.toLocaleLowerCase('tr') === trimmed.toLocaleLowerCase('tr'))) {
          throw new Error(`Bu adda bir seri zaten var: ${trimmed}`);
        }
        series.name = trimmed;
      }
      if (prefix !== undefined) {
        const pfx = cleanPrefix(prefix);
        if (!pfx) throw new Error('Seri ön eki boş olamaz.');
        const others = visibleSeries(draft, tenantId).filter(s => s.id !== id);
        if (others.some(s => s.prefix.toUpperCase() === pfx)) {
          throw new Error(`Bu ön ek zaten kullanılıyor: ${pfx}`);
        }
        series.prefix = pfx;
      }
      if (invoiceTypes !== undefined) {
        series.invoiceTypes = Array.isArray(invoiceTypes)
          ? (invoiceTypes as string[]).filter((t): t is 'SALES' | 'PURCHASE' => t === 'SALES' || t === 'PURCHASE')
          : [];
      }
      if (length !== undefined) {
        series.length = Math.min(10, Math.max(3, Number(length) || series.length || 6));
      }
      if (lastNumber !== undefined) {
        const next = Number(lastNumber);
        if (!Number.isFinite(next) || next < series.lastNumber) {
          throw new Error(`Sayaç geri alınamaz (mevcut: ${series.lastNumber}).`);
        }
        series.lastNumber = Math.floor(next);
      }
      if (active !== undefined) series.active = Boolean(active);
      if (isDefault === true) {
        for (const s of draft.invoiceSeries || []) {
          if (s.tenantId === tenantId || (tenantId === 'tnt-isbey' && !s.tenantId)) s.isDefault = false;
        }
        series.isDefault = true;
      } else if (isDefault === false) {
        series.isDefault = false;
      }

      series.updatedAt = new Date().toISOString();
      return series;
    });

    res.json({ success: true, invoiceSeries: updated, message: 'Fatura serisi güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/v1/invoice-series/:id
 * Silmez — PASİFE alır. Kullanılmış numaralar korunur.
 */
v1InvoiceSeriesRouter.delete('/:id', requirePermission(PERMISSIONS.INVOICES_UPDATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');

  if (!visibleSeries(storage.getState(), tenantId).some(s => s.id === id)) {
    return res.status(404).json({ success: false, message: 'Fatura serisi bulunamadı.' });
  }

  try {
    const updated = await storage.runTransaction(draft => {
      const series = (draft.invoiceSeries || []).find(
        s => s.id === id && (s.tenantId === tenantId || (tenantId === 'tnt-isbey' && !s.tenantId))
      );
      if (!series) throw new Error('Fatura serisi bulunamadı.');
      series.active = false;
      series.isDefault = false;
      series.updatedAt = new Date().toISOString();
      return series;
    });
    res.json({ success: true, invoiceSeries: updated, message: 'Fatura serisi pasife alındı.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
