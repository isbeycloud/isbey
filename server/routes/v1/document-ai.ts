import { Router } from 'express';
import { storage } from '../../db/storage';
import { DocumentAIService } from '../../services/ai/documentAIService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/document-ai/jobs
 * OCR işlerini listeler
 */
router.get('/jobs', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const jobs = (db.documentAIJobs || []).filter(
    j => j.tenantId === tenantId || (!j.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: jobs.length, jobs });
});

/**
 * POST /api/v1/document-ai/upload
 * Belge yükler ve OCR analizi çalıştırır
 */
router.post('/upload', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const userId = req.body.userId || 'usr-default';
    const { fileName, fileSize = 250000, mimeType = 'image/jpeg', fileUrl = 'https://isbey.cloud/sample-invoice.jpg', documentType = 'INVOICE' } = req.body;

    if (!fileName) {
      return res.status(400).json({ success: false, message: 'Dosya adı zorunludur.' });
    }

    const job = await DocumentAIService.processDocument({
      tenantId,
      userId,
      fileName,
      fileSize,
      mimeType,
      fileUrl,
      documentType,
    });

    return res.status(201).json({
      success: true,
      message: 'Belge başarıyla yüklendi ve OCR analizi tamamlandı.',
      job,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Belge işleme hatası.' });
  }
});

/**
 * GET /api/v1/document-ai/jobs/:id
 * OCR iş detayı
 */
router.get('/jobs/:id', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const job = (db.documentAIJobs || []).find(
    j => j.id === req.params.id && (j.tenantId === tenantId || (!j.tenantId && tenantId === 'tnt-isbey'))
  );

  if (!job) return res.status(404).json({ success: false, message: 'OCR işi bulunamadı.' });
  return res.json({ success: true, job });
});

/**
 * POST /api/v1/document-ai/jobs/:id/create-invoice
 * OCR sonucunu onaylayıp alış faturasına dönüştürür
 */
router.post('/jobs/:id/create-invoice', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const userId = req.body.userId || 'usr-default';
    const confirmedData = req.body.confirmedData;

    if (!confirmedData || !confirmedData.grandTotal) {
      return res.status(400).json({ success: false, message: 'Fatura verileri eksik veya geçersiz.' });
    }

    const result = await DocumentAIService.createInvoiceFromJob({
      tenantId,
      jobId: req.params.id,
      userId,
      confirmedData,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Fatura oluşturulamadı.' });
  }
});

export default router;
