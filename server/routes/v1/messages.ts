import { Router } from 'express';
import { storage } from '../../db/storage';
import { MessagingService } from '../../services/faz8/messagingService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/messages/conversations
 * Konuşma başlıkları listesi
 */
router.get('/conversations', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const list = (db.topicConversations || []).filter(
    c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: list.length, conversations: list });
});

/**
 * GET /api/v1/messages/conversations/:id/messages
 * Belirli konuşmanın mesaj geçmişi
 */
router.get('/conversations/:id/messages', (req, res) => {
  const db = storage.getState();
  const list = (db.topicMessages || []).filter(m => m.conversationId === req.params.id);
  return res.json({ success: true, count: list.length, messages: list });
});

/**
 * POST /api/v1/messages/send
 * Yeni mesaj gönderir
 */
router.post('/send', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const {
      conversationId,
      topicTitle,
      clientCompanyName = 'İŞBEY Teknoloji A.Ş.',
      accountantUserId = 'usr-accountant',
      accountantName = 'SMMM Yetkilisi',
      senderId = 'usr-admin',
      senderName = 'Firma Sahibi',
      senderRole = 'CLIENT',
      content,
      attachments,
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Mesaj içeriği boş olamaz.' });
    }

    const result = await MessagingService.sendMessage({
      tenantId,
      conversationId,
      topicTitle,
      clientCompanyName,
      accountantUserId,
      accountantName,
      senderId,
      senderName,
      senderRole,
      content,
      attachments,
    });

    return res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Mesaj iletilemedi.' });
  }
});

export default router;
