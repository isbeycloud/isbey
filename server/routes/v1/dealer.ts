import { Router } from 'express';
import { PartnerService } from '../../services/faz9/partnerService';
import { CommissionEngine } from '../../services/faz9/commissionEngine';
import { storage } from '../../db/storage';

const router = Router();

/**
 * GET /api/v1/dealer/partners
 * Bayi ve Alt Bayi listesi
 */
router.get('/partners', (req, res) => {
  const parentId = req.query.parentId as string;
  const list = PartnerService.getPartners(parentId);
  return res.json({ success: true, count: list.length, partners: list });
});

/**
 * GET /api/v1/dealer/commissions
 * Komisyon hareketleri
 */
router.get('/commissions', (req, res) => {
  const partnerId = req.query.partnerId as string;
  const db = storage.getState();
  let list = db.commissionPayoutTxs || [];
  if (partnerId) {
    list = list.filter(c => c.partnerId === partnerId);
  }
  return res.json({ success: true, count: list.length, commissions: list });
});

/**
 * POST /api/v1/dealer/partners
 * Yeni bayi veya alt bayi kaydı
 */
router.post('/partners', async (req, res) => {
  try {
    const { parentPartnerId, role = 'DEALER', code, name, contactName, email, phone, city, taxNumber, defaultCommissionRate } = req.body;
    if (!name || !email || !code) {
      return res.status(400).json({ success: false, message: 'Bayi adı, kodu ve e-posta zorunludur.' });
    }

    const partner = await PartnerService.createPartner({
      parentPartnerId,
      role,
      code,
      name,
      contactName: contactName || name,
      email,
      phone: phone || '0555 000 0000',
      city: city || 'İstanbul',
      taxNumber,
      defaultCommissionRate: Number(defaultCommissionRate) || 20,
    });

    return res.status(201).json({ success: true, partner });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/v1/dealer/commissions/:id/approve
 * Komisyon onaylama
 */
router.post('/commissions/:id/approve', async (req, res) => {
  try {
    const tx = await CommissionEngine.approveCommission(req.params.id);
    return res.json({ success: true, message: 'Komisyon onaylandı ve bayi cüzdanına aktarıldı.', transaction: tx });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
