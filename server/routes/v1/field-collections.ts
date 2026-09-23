import { Router } from 'express';
import { storage } from '../../db/storage';
import { FieldCollectionService } from '../../services/fieldCollectionService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/field-collections
 * Saha tahsilatlarını listeler
 */
router.get('/', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const { status, userId, startDate, endDate, customerId } = req.query;

  const db = storage.getState();
  let list = (db.fieldCollections || []).filter(
    c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
  );

  if (status) list = list.filter(c => c.status === status);
  if (userId) list = list.filter(c => c.userId === userId);
  if (customerId) list = list.filter(c => c.customerId === customerId);
  if (startDate) list = list.filter(c => c.collectionDate >= (startDate as string));
  if (endDate) list = list.filter(c => c.collectionDate <= (endDate as string));

  // Yeniden eskiye sırala
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json({ success: true, count: list.length, collections: list });
});

/**
 * POST /api/v1/field-collections
 * Yeni saha tahsilatı oluşturur (Cari + Kasa/Banka + Makbuz atomik yansır)
 */
router.post('/', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const result = await FieldCollectionService.createCollection({
      ...req.body,
      tenantId,
      userId: req.body.userId || 'usr-saha',
      userName: req.body.userName || 'Saha Personeli',
    });

    return res.status(201).json({
      success: true,
      message: `${result.collection.collectionNumber} numaralı tahsilat başarıyla oluşturuldu.`,
      collection: result.collection,
      receipt: result.receipt,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Tahsilat kaydedilemedi.' });
  }
});

/**
 * POST /api/v1/field-collections/:id/approve
 * Onay bekleyen yüksek tutarlı tahsilatı onaylar
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const approvedBy = req.body.approvedBy || 'Yönetici';
    const col = await FieldCollectionService.approveCollection(req.params.id, tenantId, approvedBy);

    return res.json({
      success: true,
      message: `${col.collectionNumber} numaralı tahsilat onaylandı ve cari hesaba yansıtıldı.`,
      collection: col,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Tahsilat onaylanamadı.' });
  }
});

/**
 * POST /api/v1/field-collections/:id/cancel
 * Saha tahsilatını iptal eder ve ters kayıt oluşturur
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { reason = 'Hatalı Tutar Girişi', cancelledBy = 'Yönetici' } = req.body;
    const col = await FieldCollectionService.cancelCollection(req.params.id, tenantId, reason, cancelledBy);

    return res.json({
      success: true,
      message: `${col.collectionNumber} numaralı tahsilat iptal edildi.`,
      collection: col,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Tahsilat iptal edilemedi.' });
  }
});

/**
 * GET /api/v1/field-collections/:id/receipt
 * Tahsilat makbuzu dökümü
 */
router.get('/:id/receipt', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const receipt = (db.fieldCollectionReceipts || []).find(
    r => r.collectionId === req.params.id && (r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey'))
  );

  if (!receipt) return res.status(404).json({ success: false, message: 'Makbuz bulunamadı.' });
  return res.json({ success: true, receipt });
});

export default router;
