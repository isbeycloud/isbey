import { Router } from 'express';
import { storage } from '../../db/storage';
import { DocumentCenterService } from '../../services/faz8/documentCenterService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/documents
 * Belge listesi ve filtreleme
 */
router.get('/', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const folder = req.query.folder as string;
  const category = req.query.category as string;
  const db = storage.getState();

  let list = (db.documents || []).filter(
    d => (d.tenantId === tenantId || (!d.tenantId && tenantId === 'tnt-isbey')) && !d.isArchived
  );

  if (folder) list = list.filter(d => d.folderName === folder);
  if (category) list = list.filter(d => d.category === category);

  return res.json({ success: true, count: list.length, documents: list });
});

/**
 * POST /api/v1/documents/upload
 * Yeni belge veya versiyon yükleme
 */
router.post('/upload', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const {
      existingDocumentId,
      category = 'OTHER',
      folderName = 'Genel',
      documentNo,
      title,
      description,
      tags,
      fileName,
      fileSize = 100000,
      mimeType = 'application/pdf',
      fileUrl = 'https://isbey.cloud/sample-document.pdf',
      uploadedByUserId = 'usr-admin',
      uploadedByName = 'Yönetici',
      changeSummary,
      sharedWithMaliMusavir = true,
    } = req.body;

    if (!title || !fileName) {
      return res.status(400).json({ success: false, message: 'Belge başlığı ve dosya adı zorunludur.' });
    }

    const doc = await DocumentCenterService.uploadDocument({
      tenantId,
      existingDocumentId,
      category,
      folderName,
      documentNo,
      title,
      description,
      tags,
      fileName,
      fileSize,
      mimeType,
      fileUrl,
      uploadedByUserId,
      uploadedByName,
      changeSummary,
      sharedWithMaliMusavir,
    });

    return res.status(201).json({ success: true, message: 'Belge başarıyla yüklendi.', document: doc });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Belge yükleme hatası.' });
  }
});

/**
 * POST /api/v1/documents/share
 * Güvenli harici paylaşım bağlantısı üretir
 */
router.post('/share', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { entityType = 'DOCUMENT', entityId, title, password, expiresInHours, downloadLimit } = req.body;

    if (!entityId || !title) {
      return res.status(400).json({ success: false, message: 'Belge/Ekstre ID ve başlık zorunludur.' });
    }

    const token = await DocumentCenterService.createShareToken({
      tenantId,
      entityType,
      entityId,
      title,
      password,
      expiresInHours,
      downloadLimit,
    });

    return res.status(201).json({ success: true, message: 'Güvenli paylaşım bağlantısı oluşturuldu.', shareToken: token });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Paylaşım bağlantısı oluşturulamadı.' });
  }
});

/**
 * GET /api/v1/documents/public-share/:token
 * Public güvenli paylaşım çözücü
 */
router.get('/public-share/:token', (req, res) => {
  try {
    const password = req.query.password as string;
    const result = DocumentCenterService.resolveShareToken(req.params.token, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
