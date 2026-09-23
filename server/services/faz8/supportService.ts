import crypto from 'crypto';
import { storage } from '../../db/storage';
import { SupportTicketFaz8, KnowledgeArticle, DatabaseState } from '../../db/schema';

export class SupportService {
  /**
   * Yeni destek bileti oluşturur
   */
  public static async createTicket(params: {
    tenantId: string;
    category: SupportTicketFaz8['category'];
    subject: string;
    description: string;
    priority?: SupportTicketFaz8['priority'];
    userEmail: string;
  }): Promise<SupportTicketFaz8> {
    const { tenantId, category, subject, description, priority = 'NORMAL', userEmail } = params;
    const now = new Date().toISOString();
    const ticketNo = `SUP-${Math.floor(100000 + Math.random() * 900000)}`;

    const newTicket: SupportTicketFaz8 = {
      id: `ticket-${Date.now()}`,
      tenantId,
      ticketNo,
      category,
      subject,
      description,
      priority,
      status: 'OPEN',
      userEmail,
      responses: [
        {
          id: `resp-1`,
          sender: 'USER',
          message: description,
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.supportTicketsFaz8) draft.supportTicketsFaz8 = [];
      draft.supportTicketsFaz8.unshift(newTicket);
      return newTicket;
    });
  }

  /**
   * Bilgi bankası araması yapar
   */
  public static searchKnowledgeBase(query: string): KnowledgeArticle[] {
    const db = storage.getState();
    const q = query.toLowerCase().trim();
    if (!q) return db.knowledgeArticles || [];

    return (db.knowledgeArticles || []).filter(
      a =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
    );
  }
}
