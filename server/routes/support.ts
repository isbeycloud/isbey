import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth } from '../middleware/authGuards';
import { SupportTicket, SupportTicketResponse } from '../db/schema';

export const supportRouter = Router();

supportRouter.use(requireAuth);

// GET /api/support/tickets - Destek taleplerini listele
supportRouter.get('/tickets', (req: Request, res: Response) => {
  const db = storage.getState();
  const user = req.user;
  const tenantId = req.tenantId;

  const tickets = db.supportTickets || [];
  
  // Super Admin veya Admin tüm talepleri görür, normal kullanıcı kendi tenant'ını görür
  const filtered = (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN')
    ? tickets
    : tickets.filter(t => t.tenantId === tenantId || t.userId === user.id);

  res.json({ success: true, tickets: filtered });
});

// POST /api/support/tickets - Yeni destek talebi oluştur
supportRouter.post('/tickets', async (req: Request, res: Response) => {
  const { category, priority, subject, message } = req.body;
  const user = req.user;
  const tenantId = req.tenantId;

  if (!subject || !message) {
    return res.status(400).json({ success: false, message: 'Konu ve mesaj alanları zorunludur.' });
  }

  const db = storage.getState();
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  const now = new Date().toISOString();
  const ticketNumber = `DEST-${new Date().getFullYear()}-${String((db.supportTickets?.length || 0) + 1).padStart(4, '0')}`;

  const newTicket: SupportTicket = {
    id: `ticket-${Date.now()}`,
    ticketNo: ticketNumber,
    tenantId: tenantId,
    companyName: tenant?.name || user.companyName || 'İŞBEY',
    userId: user.id,
    userName: user.fullName,
    userEmail: user.email,
    category: category || 'DIGER',
    priority: priority || 'NORMAL',
    subject: subject.trim(),
    message: message.trim(),
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
    responses: [],
  };

  try {
    await storage.runTransaction(draft => {
      if (!draft.supportTickets) draft.supportTickets = [];
      draft.supportTickets.unshift(newTicket);
    });

    storage.addAuditLog({
      userId: user.id,
      username: user.username,
      companyId: tenantId,
      companyName: tenant?.name || 'İŞBEY',
      action: 'CREATE',
      module: 'SUPPORT',
      documentNo: ticketNumber,
      ipAddress: req.ip || '127.0.0.1',
      details: `Yeni destek talebi oluşturuldu: ${ticketNumber} - ${subject}`,
    });

    res.status(201).json({
      success: true,
      message: 'Destek talebiniz başarıyla oluşturuldu. Uzman ekibimiz en kısa sürede yanıtlayacaktır.',
      ticket: newTicket,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/support/tickets/:id - Talep detayı
supportRouter.get('/tickets/:id', (req: Request, res: Response) => {
  const db = storage.getState();
  const ticket = (db.supportTickets || []).find(t => t.id === req.params.id);

  if (!ticket) {
    return res.status(404).json({ success: false, message: 'Destek talebi bulunamadı.' });
  }

  res.json({ success: true, ticket });
});

// POST /api/support/tickets/:id/responses - Yanıt ekle
supportRouter.post('/tickets/:id/responses', async (req: Request, res: Response) => {
  const { message } = req.body;
  const user = req.user;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Yanıt mesajı boş olamaz.' });
  }

  const now = new Date().toISOString();
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const newResponse: SupportTicketResponse = {
    id: `resp-${Date.now()}`,
    userId: user.id,
    userName: user.fullName,
    isAdmin,
    message: message.trim(),
    createdAt: now,
  };

  try {
    const updated = await storage.runTransaction(draft => {
      const t = (draft.supportTickets || []).find(item => item.id === req.params.id);
      if (!t) throw new Error('Destek talebi bulunamadı.');

      if (!t.responses) t.responses = [];
      t.responses.push(newResponse);
      t.updatedAt = now;

      // Durumu güncelle
      if (isAdmin) {
        t.status = 'IN_PROGRESS';
      }

      return t;
    });

    res.json({ success: true, message: 'Yanıtınız eklendi.', ticket: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/support/tickets/:id/status - Durum güncelle
supportRouter.patch('/tickets/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, message: 'status zorunludur.' });

  try {
    const updated = await storage.runTransaction(draft => {
      const t = (draft.supportTickets || []).find(item => item.id === req.params.id);
      if (!t) throw new Error('Destek talebi bulunamadı.');
      t.status = status;
      t.updatedAt = new Date().toISOString();
      return t;
    });

    res.json({ success: true, message: 'Talep durumu güncellendi.', ticket: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default supportRouter;
