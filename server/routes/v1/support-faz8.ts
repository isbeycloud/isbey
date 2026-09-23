import { Router } from 'express';
import { storage } from '../../db/storage';
import { SupportService } from '../../services/faz8/supportService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/support-faz8/tickets
 * Destek biletleri listesi
 */
router.get('/tickets', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const list = (db.supportTicketsFaz8 || []).filter(
    t => t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: list.length, tickets: list });
});

/**
 * POST /api/v1/support-faz8/tickets
 * Yeni destek bileti oluşturur
 */
router.post('/tickets', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { category = 'GENEL', subject, description, priority = 'NORMAL', userEmail = 'destek@isbey.cloud' } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ success: false, message: 'Konu ve açıklama zorunludur.' });
    }

    const ticket = await SupportService.createTicket({
      tenantId,
      category,
      subject,
      description,
      priority,
      userEmail,
    });

    return res.status(201).json({ success: true, message: 'Destek bileti oluşturuldu.', ticket });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Destek talebi açılamadı.' });
  }
});

/**
 * GET /api/v1/support-faz8/knowledge
 * Bilgi bankası makaleleri
 */
router.get('/knowledge', (req, res) => {
  const q = (req.query.q as string) || '';
  const list = SupportService.searchKnowledgeBase(q);
  return res.json({ success: true, count: list.length, articles: list });
});

export default router;
