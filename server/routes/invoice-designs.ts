/**
 * İŞBEY CLOUD — FAZ 25.3-A3 FATURA TASARIM BACKEND ROUTE
 * =======================================================
 * Ayarlar → Fatura Tasarımı sekmesinin kalıcı veri katmanı.
 *
 * GÜVENLİK (FAZ 25.2-A konvansiyonu — CLAUDE.md kuralı):
 *   - Tüm endpoint'ler requireAuth ile korunur.
 *   - tenantId YALNIZCA token'dan (req.tenantId) alınır; query/body/header
 *     kaynaklı tenant kimliği asla yetki kaynağı kabul edilmez.
 *   - Kayıt sahipliği: design.tenantId === req.tenantId (platform admin hariç).
 *   - Hata mesajları iç detay sızmaz.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission, PERMISSIONS } from '../middleware/authGuards';
import { storage } from '../db/storage';
import type { InvoiceDesignRecord } from '../db/schema';

const router = Router();

const generateId = () => 'invd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

const VALID_THEMES = ['CORPORATE', 'MINIMAL', 'MODERN', 'ECOMMERCE', 'OFFICIAL', 'CUSTOM'];

interface AuthedRequest extends Request {
  tenantId?: string;
  user?: { id: string; role: string; [k: string]: unknown };
}

/** token'dan tenant çöz — token yoksa 401 (requireAuth zaten yakalar; savunma katmanı) */
const resolveTenantFromToken = (req: AuthedRequest): string | null => {
  const t = req.tenantId;
  return typeof t === 'string' && t ? t : null;
};

/** Body'den güvenli tasarım alanları — tanınmayan/büyük alanlar atılır */
const pickDesignFields = (body: any): Partial<InvoiceDesignRecord> => {
  const out: Partial<InvoiceDesignRecord> = {};
  if (typeof body?.name === 'string' && body.name.trim()) out.name = body.name.trim().slice(0, 120);
  if (typeof body?.theme === 'string' && VALID_THEMES.includes(body.theme)) out.theme = body.theme;
  if (typeof body?.accentColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(body.accentColor)) out.accentColor = body.accentColor;
  if (typeof body?.logoDataUrl === 'string') out.logoDataUrl = body.logoDataUrl.slice(0, 400_000); // ~300KB dataURL
  if (typeof body?.stampDataUrl === 'string') out.stampDataUrl = body.stampDataUrl.slice(0, 400_000);
  if (body?.showSections && typeof body.showSections === 'object') {
    out.showSections = Object.fromEntries(
      Object.entries(body.showSections)
        .filter(([, v]) => typeof v === 'boolean')
        .slice(0, 20)
    ) as Record<string, boolean>;
  }
  if (Array.isArray(body?.sectionOrder)) out.sectionOrder = body.sectionOrder.filter((x: unknown) => typeof x === 'string').slice(0, 30);
  if (Array.isArray(body?.columnOrder)) out.columnOrder = body.columnOrder.filter((x: unknown) => typeof x === 'string').slice(0, 30);
  if (typeof body?.headerNote === 'string') out.headerNote = body.headerNote.slice(0, 500);
  if (typeof body?.footerNotes === 'string') out.footerNotes = body.footerNotes.slice(0, 2000);
  return out;
};

// GET /api/invoice-designs — tenant'ın tasarımları (default flag tenant bazlı)
router.get('/', requireAuth, requirePermission(PERMISSIONS.COMPANY_UPDATE), (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const all = storage.getState().invoiceDesigns || [];
    const list = all.filter(d => d.tenantId === tenantId);
    return res.json({ success: true, invoiceDesigns: list, total: list.length });
  } catch {
    return res.status(500).json({ success: false, error: 'Tasarımlar yüklenemedi' });
  }
});

// GET /api/invoice-designs/:id
router.get('/:id', requireAuth, requirePermission(PERMISSIONS.COMPANY_UPDATE), (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const all = storage.getState().invoiceDesigns || [];
    const found = all.find(d => d.id === req.params.id && d.tenantId === tenantId);
    if (!found) return res.status(404).json({ success: false, error: 'Tasarım bulunamadı' });
    return res.json({ success: true, invoiceDesign: found });
  } catch {
    return res.status(500).json({ success: false, error: 'Tasarım yüklenemedi' });
  }
});

// POST /api/invoice-designs — yeni tasarım
router.post('/', requireAuth, requirePermission(PERMISSIONS.COMPANY_UPDATE), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const fields = pickDesignFields(req.body);
    if (!fields.name) return res.status(400).json({ success: false, error: 'Tasarım adı zorunlu' });

    const rec: InvoiceDesignRecord = {
      id: generateId(),
      tenantId,
      name: fields.name,
      theme: fields.theme || 'OFFICIAL',
      isDefault: false,
      accentColor: fields.accentColor,
      logoDataUrl: fields.logoDataUrl,
      stampDataUrl: fields.stampDataUrl,
      showSections: fields.showSections,
      sectionOrder: fields.sectionOrder,
      columnOrder: fields.columnOrder,
      headerNote: fields.headerNote,
      footerNotes: fields.footerNotes,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await storage.runTransaction(draft => {
      if (!draft.invoiceDesigns) draft.invoiceDesigns = [];
      // İlk tasarım otomatik varsayılan olur
      if (!draft.invoiceDesigns.some(d => d.tenantId === tenantId && d.isDefault)) {
        rec.isDefault = true;
      }
      draft.invoiceDesigns.push(rec);
    });
    return res.status(201).json({ success: true, invoiceDesign: rec });
  } catch {
    return res.status(500).json({ success: false, error: 'Tasarım kaydedilemedi' });
  }
});

// PUT /api/invoice-designs/:id — güncelleme (tenant sahipliği zorunlu)
router.put('/:id', requireAuth, requirePermission(PERMISSIONS.COMPANY_UPDATE), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });

    const fields = pickDesignFields(req.body);
    let updated: InvoiceDesignRecord | undefined;
    let notFound = false;
    await storage.runTransaction(draft => {
      if (!draft.invoiceDesigns) draft.invoiceDesigns = [];
      const list: InvoiceDesignRecord[] = draft.invoiceDesigns;
      // GÜVENLİK DÜZELTMESİ (TOCTOU): kimlik + sahiplik doğrulaması transaction
      // İÇİNDE yapılır — indeks yerine id+tenant eşleşmesi aranır. Böylece iki istek
      // arasında dizideki kayma başka tenant'ın kaydının üzerine yazılmasına yol açmaz.
      const idx = list.findIndex(d => d.id === req.params.id && d.tenantId === tenantId);
      if (idx === -1) {
        notFound = true;
        return;
      }
      const cur = list[idx];
      // isDefault body üzerinden değiştirilemez (set-default endpoint'i kullanılır)
      list[idx] = {
        ...cur,
        ...fields,
        isDefault: cur.isDefault,
        id: cur.id,
        tenantId: cur.tenantId,
        createdAt: cur.createdAt,
        updatedAt: nowIso(),
      };
      updated = list[idx];
    });
    if (notFound || !updated) return res.status(404).json({ success: false, error: 'Tasarım bulunamadı' });
    return res.json({ success: true, invoiceDesign: updated });
  } catch {
    return res.status(500).json({ success: false, error: 'Tasarım güncellenemedi' });
  }
});

// POST /api/invoice-designs/:id/set-default — tenant bazlı tek varsayılan
router.post('/:id/set-default', requireAuth, requirePermission(PERMISSIONS.COMPANY_UPDATE), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const all = storage.getState().invoiceDesigns || [];
    const target = all.find(d => d.id === req.params.id && d.tenantId === tenantId);
    if (!target) return res.status(404).json({ success: false, error: 'Tasarım bulunamadı' });
    await storage.runTransaction(draft => {
      if (!draft.invoiceDesigns) draft.invoiceDesigns = [];
      const list: InvoiceDesignRecord[] = draft.invoiceDesigns;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (d.tenantId === tenantId) {
          list[i] = {
            ...d,
            isDefault: d.id === target.id,
            updatedAt: d.id === target.id ? nowIso() : d.updatedAt,
          };
        }
      }
    });
    return res.json({ success: true, message: 'Varsayılan tasarım güncellendi' });
  } catch {
    return res.status(500).json({ success: false, error: 'Varsayılan atanamadı' });
  }
});

// DELETE /api/invoice-designs/:id
router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.COMPANY_UPDATE), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = resolveTenantFromToken(req);
    if (!tenantId) return res.status(401).json({ success: false, error: 'Oturum gerekli' });
    const all = storage.getState().invoiceDesigns || [];
    const target = all.find(d => d.id === req.params.id && d.tenantId === tenantId);
    if (!target) return res.status(404).json({ success: false, error: 'Tasarım bulunamadı' });
    await storage.runTransaction(draft => {
      if (!draft.invoiceDesigns) draft.invoiceDesigns = [];
      let list: InvoiceDesignRecord[] = draft.invoiceDesigns;
      list = list.filter(d => !(d.id === target.id && d.tenantId === tenantId));
      // Varsayılan silindiyse kalan ilk tasarıma devret
      if (target.isDefault) {
        const remaining = list.filter(d => d.tenantId === tenantId);
        if (remaining.length > 0) {
          const heirId = remaining[0].id;
          list = list.map(d => (d.id === heirId ? { ...d, isDefault: true } : d));
        }
      }
      draft.invoiceDesigns = list;
    });
    return res.json({ success: true, message: 'Tasarım silindi' });
  } catch {
    return res.status(500).json({ success: false, error: 'Tasarım silinemedi' });
  }
});

export default router;
