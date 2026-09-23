import { Router } from 'express';
import { storage } from '../../db/storage';
import { ApprovalEngine } from '../../services/faz8/approvalEngine';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/approvals/requests
 * Bekleyen ve tamamlanan onay talepleri
 */
router.get('/requests', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const status = req.query.status as string;
  const db = storage.getState();

  let list = (db.approvalRequests || []).filter(
    r => r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')
  );

  if (status) list = list.filter(r => r.status === status);

  return res.json({ success: true, count: list.length, requests: list });
});

/**
 * GET /api/v1/approvals/rules
 * Onay kuralları
 */
router.get('/rules', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const rules = (db.approvalRules || []).filter(
    r => r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: rules.length, rules });
});

/**
 * POST /api/v1/approvals/requests
 * Yeni onay talebi oluşturur
 */
router.post('/requests', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { entityType = 'EXPENSE', entityId, documentNo, title, amount, currency, requestedByUserId = 'usr-user', requestedByName = 'Personel' } = req.body;

    if (!documentNo || !amount) {
      return res.status(400).json({ success: false, message: 'Belge no ve tutar zorunludur.' });
    }

    const request = await ApprovalEngine.requestApproval({
      tenantId,
      entityType,
      entityId: entityId || `ent-${Date.now()}`,
      documentNo,
      title: title || `${documentNo} Onay Talebi`,
      amount: Number(amount),
      currency,
      requestedByUserId,
      requestedByName,
    });

    return res.status(201).json({ success: true, message: 'Onay talebi iletildi.', request });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Onay talebi oluşturulamadı.' });
  }
});

/**
 * POST /api/v1/approvals/requests/:id/decision
 * Onay veya Red işlemi
 */
router.post('/requests/:id/decision', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { decision, approverUserId = 'usr-admin', approverName = 'Yönetici', rejectReason } = req.body;

    if (!decision || !['APPROVE', 'REJECT'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Geçersiz karar (APPROVE veya REJECT olmalı).' });
    }

    const request = await ApprovalEngine.processApproval({
      tenantId,
      requestId: req.params.id,
      decision,
      approverUserId,
      approverName,
      rejectReason,
    });

    return res.json({ success: true, message: `İşlem başarıyla kaydedildi (${decision}).`, request });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Karar işlenemedi.' });
  }
});

export default router;
