import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth } from '../middleware/authGuards';
import { XsltEngineService } from '../services/xsltEngineService';
import { normalizeXsltForBrowser } from '../services/xsltCompatibility';
import type { DocumentType, DocumentTemplate, DocumentTemplateVersion, DocumentDesignConfig } from '../db/schema';

export const documentTemplatesRouter = Router();

// GET /api/document-templates - List templates with filters
documentTemplatesRouter.get('/', requireAuth, (req: Request, res: Response) => {
  try {
    const { documentType, companyId, search } = req.query;
    const db = storage.getState();
    const effectiveCompanyId = (companyId as string) || req.user?.companyId || db.activeTenantId || 'tnt-isbey';

    let list = (db.documentTemplates || []).filter(t => {
      // Super admin can see all or filter by companyId
      if (req.user?.role !== 'SUPER_ADMIN' && t.companyId && t.companyId !== effectiveCompanyId && t.companyId !== 'tnt-isbey') {
        return false;
      }
      return true;
    });

    if (documentType && documentType !== 'ALL') {
      list = list.filter(t => t.documentType === documentType);
    }

    if (search) {
      const q = String(search).toLowerCase().trim();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }

    // Stats
    const all = db.documentTemplates || [];
    const stats = {
      total: all.length,
      efatura: all.filter(t => t.documentType === 'EFATURA').length,
      earsiv: all.filter(t => t.documentType === 'EARSIV').length,
      eirsaliye: all.filter(t => t.documentType === 'EIRSALIYE').length,
      esmm: all.filter(t => t.documentType === 'ESMM').length,
    };

    res.json({
      success: true,
      templates: list,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/document-templates/sample-xml/:documentType - Get realistic sample XML for live preview
documentTemplatesRouter.get('/sample-xml/:documentType', requireAuth, (req: Request, res: Response) => {
  try {
    const docType = (String(req.params.documentType).toUpperCase() as DocumentType) || 'EFATURA';
    const db = storage.getState();
    const company = db.company || db.tenants?.[0];
    const xml = XsltEngineService.getSampleXml(docType, company);

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/document-templates/validate-xslt - Validate XSLT Syntax
documentTemplatesRouter.post('/validate-xslt', requireAuth, (req: Request, res: Response) => {
  try {
    const { xsltContent } = req.body;
    const result = XsltEngineService.validateXslt(xsltContent);
    res.json({
      success: result.valid,
      valid: result.valid,
      message: result.valid ? (result.warning || 'XSLT başarıyla doğrulandı.') : result.error,
      error: result.error,
      warning: result.warning,
      unsupportedFeatures: result.unsupportedFeatures || [],
    });
  } catch (err: any) {
    res.status(400).json({ success: false, valid: false, message: err.message });
  }
});

// POST /api/document-templates/preview-custom - Generate live HTML preview using XML + config/XSLT
//
// 2026-09-26: Dönüşüm artık İSTEMCİDE yapılır (tarayıcının XSLTProcessor'ı).
// Sunucu XSLT'yi hazırlar ve istemciye verir; XSLT hiç yoksa veya tarayıcıda
// çalıştırılamıyorsa yedek HTML döner. Bu uç `renderedBy` alanıyla hangisinin
// geçerli olduğunu bildirir — böylece istemci ne yapacağını bilir.
documentTemplatesRouter.post('/preview-custom', requireAuth, async (req: Request, res: Response) => {
  try {
    const { documentType = 'EFATURA', customXml, config, customXslt } = req.body;
    const db = storage.getState();
    const xml = customXml || XsltEngineService.getSampleXml(documentType as DocumentType, db.company);
    const out = await XsltEngineService.transformXmlWithXslt(
      xml,
      customXslt || '',
      config
    );
    res.json({
      success: true,
      xml,
      html: out.html,
      xslt: out.xslt,
      renderedBy: out.renderedBy,
      adjustments: out.adjustments,
      unsupportedFeatures: out.unsupportedFeatures,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/document-templates/:id - Single template details
documentTemplatesRouter.get('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Belge tasarımı bulunamadı.' });
    }

    const versions = (db.documentTemplateVersions || [])
      .filter(v => v.templateId === template.id)
      .sort((a, b) => b.version - a.version);

    res.json({
      success: true,
      template,
      versions,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/document-templates - Create new document template
documentTemplatesRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      name,
      documentType = 'EFATURA',
      description,
      theme = 'MODERN',
      config,
      customXslt,
      isDefault = false,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Tasarım adı zorunludur.' });
    }

    const db = storage.getState();
    const companyId = req.user?.companyId || db.activeTenantId || 'tnt-isbey';

    // Generate or use custom XSLT
    let xsltContent = customXslt;
    if (!xsltContent || typeof xsltContent !== 'string') {
      xsltContent = XsltEngineService.generateXslt(documentType as DocumentType, config, name);
    }

    // Validate XSLT
    const val = XsltEngineService.validateXslt(xsltContent);
    if (!val.valid) {
      return res.status(400).json({ success: false, message: `XSLT Hatası: ${val.error}` });
    }

    const templateId = `tmpl-${Date.now()}`;
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
    const fileName = `${documentType.toLowerCase()}_${safeName}_${Date.now().toString().slice(-4)}.xslt`;
    const filePath = storage.saveXsltFile(documentType, fileName, xsltContent);

    const newTemplate: DocumentTemplate = {
      id: templateId,
      companyId,
      documentType: documentType as DocumentType,
      name: name.trim(),
      description: description?.trim(),
      theme,
      config: config || {
        theme,
        primaryColor: '#0284c7',
        secondaryColor: '#1e293b',
        fontFamily: 'Arial, sans-serif',
        fontSize: 11,
        showLogo: true,
        logoWidth: 200,
        logoHeight: 65,
        showSignature: true,
        signatureWidth: 140,
        signatureHeight: 60,
        showQrCode: true,
        showBarcode: true,
        bankAccounts: [],
        columns: {
          showLineNumber: true,
          showProductCode: true,
          showBarcode: false,
          showDescription: true,
          showQuantity: true,
          showUnit: true,
          showUnitPrice: true,
          showDiscount: true,
          showVatRate: true,
          showVatAmount: true,
          showLineTotal: true,
        },
      },
      xsltContent,
      xsltPath: filePath,
      version: 1,
      isActive: true,
      isDefault: Boolean(isDefault),
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const initialVersion: DocumentTemplateVersion = {
      id: `tmpl-ver-${Date.now()}`,
      templateId,
      companyId,
      version: 1,
      xsltContent,
      config: newTemplate.config,
      notes: 'İlk sürüm (v1)',
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
    };

    await storage.runTransaction(draft => {
      if (!draft.documentTemplates) draft.documentTemplates = [];
      if (!draft.documentTemplateVersions) draft.documentTemplateVersions = [];

      // If set as default, reset other defaults for this documentType & company
      if (isDefault) {
        draft.documentTemplates.forEach(t => {
          if (t.documentType === documentType && t.companyId === companyId) {
            t.isDefault = false;
          }
        });
      }

      draft.documentTemplates.push(newTemplate);
      draft.documentTemplateVersions.push(initialVersion);
    });

    storage.addSyncLog({
      provider: 'DOCUMENT_DESIGNER',
      action: 'TEMPLATE_CREATED' as any,
      username: req.user?.username || 'admin',
      companyId,
      customerName: name,
      details: `${documentType} için yeni XSLT belge tasarımı ("${name}" v1) oluşturuldu.`,
      status: 'SUCCESS',
    });

    res.json({
      success: true,
      template: newTemplate,
      message: `"${name}" XSLT tasarımı başarıyla oluşturuldu ve kaydedildi.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/document-templates/:id - Update template & create new version
documentTemplatesRouter.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, description, theme, config, customXslt, isDefault, versionNote } = req.body;
    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Belge tasarımı bulunamadı.' });
    }

    // Generate or use custom XSLT
    let xsltContent = customXslt;
    if (!xsltContent || typeof xsltContent !== 'string') {
      xsltContent = XsltEngineService.generateXslt(template.documentType, config || template.config, name || template.name);
    }

    // Validate XSLT
    const val = XsltEngineService.validateXslt(xsltContent);
    if (!val.valid) {
      return res.status(400).json({ success: false, message: `XSLT Hatası: ${val.error}` });
    }

    const nextVersion = (template.version || 1) + 1;
    const safeName = (name || template.name).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
    const fileName = `${template.documentType.toLowerCase()}_${safeName}_v${nextVersion}.xslt`;
    const filePath = storage.saveXsltFile(template.documentType, fileName, xsltContent);

    const newVersion: DocumentTemplateVersion = {
      id: `tmpl-ver-${Date.now()}`,
      templateId: template.id,
      companyId: template.companyId,
      version: nextVersion,
      xsltContent,
      config: config || template.config,
      notes: versionNote || `Sürüm v${nextVersion} güncellemesi`,
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
    };

    let updatedTemplate: DocumentTemplate | null = null;

    await storage.runTransaction(draft => {
      const target = draft.documentTemplates?.find(t => t.id === req.params.id);
      if (target) {
        if (name) target.name = name.trim();
        if (description !== undefined) target.description = description?.trim();
        if (theme) target.theme = theme;
        if (config) target.config = config;
        target.xsltContent = xsltContent;
        target.xsltPath = filePath;
        target.version = nextVersion;
        target.updatedAt = new Date().toISOString();

        if (isDefault !== undefined) {
          if (isDefault) {
            draft.documentTemplates?.forEach(t => {
              if (t.documentType === target.documentType && t.companyId === target.companyId) {
                t.isDefault = false;
              }
            });
          }
          target.isDefault = isDefault;
        }
        updatedTemplate = { ...target };
      }

      if (!draft.documentTemplateVersions) draft.documentTemplateVersions = [];
      draft.documentTemplateVersions.push(newVersion);
    });

    res.json({
      success: true,
      template: updatedTemplate,
      message: `"${updatedTemplate?.name}" XSLT tasarımı başarıyla güncellendi (v${nextVersion}).`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/document-templates/:id/preview - Generate live HTML preview using XML + XSLT
documentTemplatesRouter.post('/:id/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const { customXml, config } = req.body;
    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Belge tasarımı bulunamadı.' });
    }

    const xml = customXml || XsltEngineService.getSampleXml(template.documentType, db.company);
    const out = await XsltEngineService.transformXmlWithXslt(
      xml,
      template.xsltContent,
      config || template.config
    );

    res.json({
      success: true,
      xml,
      html: out.html,
      xslt: out.xslt,
      renderedBy: out.renderedBy,
      adjustments: out.adjustments,
      unsupportedFeatures: out.unsupportedFeatures,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/document-templates/:id/xslt - Download / View raw XSLT file
documentTemplatesRouter.get('/:id/xslt', requireAuth, (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Belge tasarımı bulunamadı.' });
    }

    const download = req.query.download === 'true';
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${template.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.xslt"`);
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(template.xsltContent);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/document-templates/:id/upload-xslt - Upload custom raw XSLT directly
documentTemplatesRouter.post('/:id/upload-xslt', requireAuth, async (req: Request, res: Response) => {
  try {
    const { xsltContent, versionNote } = req.body;
    if (!xsltContent || typeof xsltContent !== 'string') {
      return res.status(400).json({ success: false, message: 'XSLT içeriği zorunludur.' });
    }

    const val = XsltEngineService.validateXslt(xsltContent);
    if (!val.valid) {
      return res.status(400).json({ success: false, message: `Geçersiz XSLT: ${val.error}` });
    }

    // Yüklenen dosyayı tarayıcı motoru için normalleştir (XSLT 2.0 bildirimi →
    // 1.0, desteklenmeyen çıktı yönergelerinin kaldırılması). Ham hâliyle
    // saklanırsa önizlemede derlenemezdi.
    const normalized = normalizeXsltForBrowser(xsltContent);
    const storedXslt = normalized.content;
    const adjustmentNote = normalized.adjustments.length > 0
      ? ` Otomatik uyumlulaştırma: ${normalized.adjustments.join(' ')}`
      : '';

    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Belge tasarımı bulunamadı.' });
    }

    const nextVersion = (template.version || 1) + 1;
    const fileName = `${template.documentType.toLowerCase()}_custom_v${nextVersion}.xslt`;
    const filePath = storage.saveXsltFile(template.documentType, fileName, storedXslt);

    await storage.runTransaction(draft => {
      const target = draft.documentTemplates?.find(t => t.id === req.params.id);
      if (target) {
        target.xsltContent = storedXslt;
        target.xsltPath = filePath;
        target.version = nextVersion;
        target.updatedAt = new Date().toISOString();
      }

      if (!draft.documentTemplateVersions) draft.documentTemplateVersions = [];
      draft.documentTemplateVersions.push({
        id: `tmpl-ver-${Date.now()}`,
        templateId: template.id,
        companyId: template.companyId,
        version: nextVersion,
        xsltContent: storedXslt,
        config: template.config,
        notes: (versionNote || `Dışarıdan yüklenen XSLT (v${nextVersion})`) + adjustmentNote,
        createdBy: req.user?.username || 'admin',
        createdAt: new Date().toISOString(),
      });
    });

    res.json({
      success: true,
      version: nextVersion,
      adjustments: normalized.adjustments,
      message:
        `Özel XSLT dosyası başarıyla yüklendi ve uygulandı (v${nextVersion}).` + adjustmentNote,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/document-templates/:id/set-default - Set template as default for its type
documentTemplatesRouter.post('/:id/set-default', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Belge tasarımı bulunamadı.' });
    }

    await storage.runTransaction(draft => {
      draft.documentTemplates?.forEach(t => {
        if (t.documentType === template.documentType && t.companyId === template.companyId) {
          t.isDefault = t.id === template.id;
        }
      });
    });

    res.json({
      success: true,
      message: `"${template.name}" tasarımı ${template.documentType} için varsayılan yapıldı.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/document-templates/:id/duplicate - Duplicate template
documentTemplatesRouter.post('/:id/duplicate', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Belge tasarımı bulunamadı.' });
    }

    const newId = `tmpl-${Date.now()}`;
    const newName = `${template.name} (Kopya)`;
    const fileName = `${template.documentType.toLowerCase()}_copy_${Date.now().toString().slice(-4)}.xslt`;
    const filePath = storage.saveXsltFile(template.documentType, fileName, template.xsltContent);

    const duplicated: DocumentTemplate = {
      ...template,
      id: newId,
      name: newName,
      isDefault: false,
      version: 1,
      xsltPath: filePath,
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.runTransaction(draft => {
      if (!draft.documentTemplates) draft.documentTemplates = [];
      draft.documentTemplates.push(duplicated);

      if (!draft.documentTemplateVersions) draft.documentTemplateVersions = [];
      draft.documentTemplateVersions.push({
        id: `tmpl-ver-${Date.now()}`,
        templateId: newId,
        companyId: template.companyId,
        version: 1,
        xsltContent: template.xsltContent,
        config: template.config,
        notes: `"${template.name}" şablonundan kopyalandı`,
        createdBy: req.user?.username || 'admin',
        createdAt: new Date().toISOString(),
      });
    });

    res.json({
      success: true,
      template: duplicated,
      message: `"${template.name}" tasarımı başarıyla çoğaltıldı.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/document-templates/:id/versions - List version history
documentTemplatesRouter.get('/:id/versions', requireAuth, (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const versions = (db.documentTemplateVersions || [])
      .filter(v => v.templateId === req.params.id)
      .sort((a, b) => b.version - a.version);

    res.json({ success: true, versions });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/document-templates/:id/restore/:version - Restore older version
documentTemplatesRouter.post('/:id/restore/:version', requireAuth, async (req: Request, res: Response) => {
  try {
    const targetVersionNum = Number(req.params.version);
    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);
    const versionRecord = (db.documentTemplateVersions || []).find(
      v => v.templateId === req.params.id && v.version === targetVersionNum
    );

    if (!template || !versionRecord) {
      return res.status(404).json({ success: false, message: 'İlgili şablon veya sürüm kaydı bulunamadı.' });
    }

    const nextVersion = (template.version || 1) + 1;
    const fileName = `${template.documentType.toLowerCase()}_restored_v${targetVersionNum}_to_v${nextVersion}.xslt`;
    const filePath = storage.saveXsltFile(template.documentType, fileName, versionRecord.xsltContent);

    await storage.runTransaction(draft => {
      const target = draft.documentTemplates?.find(t => t.id === req.params.id);
      if (target) {
        target.xsltContent = versionRecord.xsltContent;
        target.config = versionRecord.config;
        target.xsltPath = filePath;
        target.version = nextVersion;
        target.updatedAt = new Date().toISOString();
      }

      if (!draft.documentTemplateVersions) draft.documentTemplateVersions = [];
      draft.documentTemplateVersions.push({
        id: `tmpl-ver-${Date.now()}`,
        templateId: template.id,
        companyId: template.companyId,
        version: nextVersion,
        xsltContent: versionRecord.xsltContent,
        config: versionRecord.config,
        notes: `Sürüm v${targetVersionNum}'den geri yüklendi (v${nextVersion})`,
        createdBy: req.user?.username || 'admin',
        createdAt: new Date().toISOString(),
      });
    });

    res.json({
      success: true,
      message: `Şablon başarıyla v${targetVersionNum} sürümüne geri yüklendi (Yeni sürüm: v${nextVersion}).`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/document-templates/:id - Delete template
documentTemplatesRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const template = (db.documentTemplates || []).find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Belge tasarımı bulunamadı.' });
    }

    // Check if it's the only default
    const sameType = (db.documentTemplates || []).filter(t => t.documentType === template.documentType);
    if (sameType.length <= 1) {
      return res.status(400).json({ success: false, message: `${template.documentType} için kalan son şablon silinemez.` });
    }

    await storage.runTransaction(draft => {
      draft.documentTemplates = (draft.documentTemplates || []).filter(t => t.id !== req.params.id);
      draft.documentTemplateVersions = (draft.documentTemplateVersions || []).filter(v => v.templateId !== req.params.id);

      // If deleted was default, make another one default
      if (template.isDefault) {
        const fallback = draft.documentTemplates?.find(t => t.documentType === template.documentType);
        if (fallback) fallback.isDefault = true;
      }
    });

    res.json({
      success: true,
      message: `"${template.name}" tasarımı başarıyla silindi.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
