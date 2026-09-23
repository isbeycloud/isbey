import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import type { FormDesign } from '../db/schema';

const router = Router();

const generateId = () => 'fd-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

// GET /api/form-designs — tüm form tasarımları
router.get('/', (req: Request, res: Response) => {
  try {
    const state = storage.getState();
    const designs = state.formDesigns || [];
    const { documentType } = req.query;
    const filtered = documentType
      ? designs.filter(d => d.documentType === documentType)
      : designs;
    return res.json({ success: true, formDesigns: filtered, total: filtered.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/form-designs/:id — belirli tasarım
router.get('/:id', (req: Request, res: Response) => {
  try {
    const state = storage.getState();
    const design = (state.formDesigns || []).find(d => d.id === req.params.id);
    if (!design) return res.status(404).json({ success: false, error: 'Form tasarımı bulunamadı.' });
    return res.json({ success: true, formDesign: design });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/form-designs — yeni tasarım oluştur
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<FormDesign>;
    if (!body.name) return res.status(400).json({ success: false, error: 'Tasarım adı gerekli.' });
    if (!body.documentType) return res.status(400).json({ success: false, error: 'Belge türü gerekli.' });

    const newDesign: FormDesign = {
      id: generateId(),
      name: body.name,
      documentType: body.documentType,
      description: body.description,
      version: 1,
      isDefault: body.isDefault ?? false,
      isBuiltIn: false,
      paperSize: body.paperSize ?? 'A4',
      orientation: body.orientation ?? 'portrait',
      marginTop: body.marginTop ?? 10,
      marginBottom: body.marginBottom ?? 10,
      marginLeft: body.marginLeft ?? 15,
      marginRight: body.marginRight ?? 15,
      sections: body.sections ?? [],
      metadata: body.metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.headers['x-user-id'] as string || 'system',
    };

    await storage.runTransaction(draft => {
      if (!draft.formDesigns) draft.formDesigns = [];
      // Eğer varsayılan yapılıyorsa, aynı tipteki diğerlerini sıfırla
      if (newDesign.isDefault) {
        draft.formDesigns
          .filter(d => d.documentType === newDesign.documentType)
          .forEach(d => { d.isDefault = false; });
      }
      draft.formDesigns.push(newDesign);
    });

    return res.status(201).json({ success: true, formDesign: newDesign });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/form-designs/:id — güncelle
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body as Partial<FormDesign>;

    await storage.runTransaction(draft => {
      if (!draft.formDesigns) draft.formDesigns = [];
      const idx = draft.formDesigns.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('Form tasarımı bulunamadı.');

      const existing = draft.formDesigns[idx];
      if (existing.isBuiltIn && body.sections !== undefined) {
        // Built-in şablonlar için section değişikliğine izin ver ama isBuiltIn false yap
        existing.isBuiltIn = false;
      }

      if (body.isDefault && !existing.isDefault) {
        // Aynı tipteki diğerlerini sıfırla
        draft.formDesigns
          .filter(d => d.documentType === existing.documentType && d.id !== id)
          .forEach(d => { d.isDefault = false; });
      }

      draft.formDesigns[idx] = {
        ...existing,
        ...body,
        id: existing.id,
        createdAt: existing.createdAt,
        createdBy: existing.createdBy,
        updatedAt: new Date().toISOString(),
        version: existing.version + 1,
      };
    });

    const updated = storage.getState().formDesigns.find(d => d.id === id);
    return res.json({ success: true, formDesign: updated });
  } catch (err: any) {
    const status = err.message.includes('bulunamadı') ? 404 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// DELETE /api/form-designs/:id — sil
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.runTransaction(draft => {
      if (!draft.formDesigns) draft.formDesigns = [];
      const idx = draft.formDesigns.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('Form tasarımı bulunamadı.');
      if (draft.formDesigns[idx].isBuiltIn) throw new Error('Yerleşik form tasarımları silinemez.');
      draft.formDesigns.splice(idx, 1);
    });
    return res.json({ success: true, message: 'Form tasarımı silindi.' });
  } catch (err: any) {
    const status = err.message.includes('bulunamadı') ? 404 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// POST /api/form-designs/:id/default — varsayılan yap
router.post('/:id/default', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.runTransaction(draft => {
      if (!draft.formDesigns) draft.formDesigns = [];
      const target = draft.formDesigns.find(d => d.id === id);
      if (!target) throw new Error('Form tasarımı bulunamadı.');
      // Aynı tipteki diğerlerini sıfırla
      draft.formDesigns
        .filter(d => d.documentType === target.documentType)
        .forEach(d => { d.isDefault = false; });
      target.isDefault = true;
      target.updatedAt = new Date().toISOString();
    });
    return res.json({ success: true, message: 'Varsayılan form tasarımı güncellendi.' });
  } catch (err: any) {
    return res.status(404).json({ success: false, error: err.message });
  }
});

// POST /api/form-designs/:id/duplicate — kopyala
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const state = storage.getState();
    const source = (state.formDesigns || []).find(d => d.id === id);
    if (!source) return res.status(404).json({ success: false, error: 'Kaynak bulunamadı.' });

    const copy: FormDesign = {
      ...JSON.parse(JSON.stringify(source)),
      id: generateId(),
      name: source.name + ' (Kopya)',
      isDefault: false,
      isBuiltIn: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.headers['x-user-id'] as string || 'system',
    };

    await storage.runTransaction(draft => {
      if (!draft.formDesigns) draft.formDesigns = [];
      draft.formDesigns.push(copy);
    });

    return res.status(201).json({ success: true, formDesign: copy });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/form-designs/:id/export — JSON dışa aktar
router.get('/:id/export', (req: Request, res: Response) => {
  try {
    const state = storage.getState();
    const design = (state.formDesigns || []).find(d => d.id === req.params.id);
    if (!design) return res.status(404).json({ success: false, error: 'Form tasarımı bulunamadı.' });

    const exportData = { ...design, exportedAt: new Date().toISOString(), exportVersion: '2.0' };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${design.name.replace(/[^a-zA-Z0-9]/g, '_')}.form.json"`);
    return res.json(exportData);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/form-designs/import — JSON içe aktar
router.post('/import', async (req: Request, res: Response) => {
  try {
    const body = req.body as FormDesign & { exportedAt?: string; exportVersion?: string };
    if (!body.name || !body.documentType || !Array.isArray(body.sections)) {
      return res.status(400).json({ success: false, error: 'Geçersiz form tasarımı dosyası.' });
    }

    const imported: FormDesign = {
      ...body,
      id: generateId(),
      isDefault: false,
      isBuiltIn: false,
      version: 1,
      name: body.name + ' (İçe Aktarıldı)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.headers['x-user-id'] as string || 'system',
    };

    await storage.runTransaction(draft => {
      if (!draft.formDesigns) draft.formDesigns = [];
      draft.formDesigns.push(imported);
    });

    return res.status(201).json({ success: true, formDesign: imported });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export { router as formDesignsRouter };
