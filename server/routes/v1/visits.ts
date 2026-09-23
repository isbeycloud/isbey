import { Router } from 'express';
import crypto from 'crypto';
import { storage } from '../../db/storage';
import { CustomerVisit, DatabaseState } from '../../db/schema';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/visits
 * Ziyaret listesi
 */
router.get('/', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const { date, agentId, status } = req.query;

  const db = storage.getState();
  let visits = (db.customerVisits || []).filter(
    v => v.tenantId === tenantId || (!v.tenantId && tenantId === 'tnt-isbey')
  );

  if (date) visits = visits.filter(v => v.visitDate === date);
  if (agentId) visits = visits.filter(v => v.fieldAgentId === agentId);
  if (status) visits = visits.filter(v => v.status === status);

  visits.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());

  return res.json({ success: true, count: visits.length, visits });
});

/**
 * POST /api/v1/visits
 * Yeni müşteri ziyareti oluşturur veya tamamlar
 */
router.post('/', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const {
      customerId,
      fieldAgentId = 'usr-saha',
      fieldAgentName = 'Saha Personeli',
      visitDate = new Date().toISOString().split('T')[0],
      startTime = new Date().toISOString(),
      endTime,
      latitude,
      longitude,
      notes,
      photoFileUrl,
      outcome = 'COLLECTION_MADE',
      status = 'COMPLETED',
      clientTransactionId = crypto.randomUUID(),
    } = req.body;

    const db = storage.getState();
    const customer = (db.customers || []).find(c => c.id === customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });

    const newVisit: CustomerVisit = {
      id: `vst-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      tenantId,
      customerId: customer.id,
      customerTitle: customer.title,
      fieldAgentId,
      fieldAgentName,
      visitDate,
      startTime,
      endTime,
      latitude: latitude || (customer.city === 'İstanbul' ? 41.0082 : 39.9334),
      longitude: longitude || (customer.city === 'İstanbul' ? 28.9784 : 32.8597),
      notes,
      photoFileUrl,
      outcome,
      status,
      clientTransactionId,
      syncStatus: 'SYNCED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.customerVisits) draft.customerVisits = [];
      draft.customerVisits.unshift(newVisit);
    });

    return res.status(201).json({ success: true, message: 'Ziyaret başarıyla kaydedildi.', visit: newVisit });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Ziyaret kaydedilemedi.' });
  }
});

/**
 * GET /api/v1/visits/map
 * Harita pinleri ve müşteri koordinatları
 */
router.get('/map', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();

  const customers = (db.customers || []).filter(
    c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
  );

  const pins = customers.map((c, idx) => {
    // Örnek harita koordinatları
    const baseLat = 41.015137;
    const baseLng = 28.979530;
    const offset = (idx % 10) * 0.015;

    return {
      customerId: c.id,
      customerCode: c.code,
      title: c.title,
      city: c.city || 'İstanbul',
      district: c.district || 'Merkez',
      address: c.address || 'Adres bilgisi girilmemiş',
      phone: c.phone || '-',
      balance: c.balance || 0,
      latitude: baseLat + offset,
      longitude: baseLng + (offset * 1.2),
      status: c.status,
    };
  });

  return res.json({ success: true, count: pins.length, pins });
});

export default router;
