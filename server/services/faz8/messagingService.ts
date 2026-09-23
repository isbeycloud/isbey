import crypto from 'crypto';
import { storage } from '../../db/storage';
import { TopicConversation, TopicMessage, DatabaseState } from '../../db/schema';

export class MessagingService {
  /**
   * Konuşma başlatır veya mevcut konuşmaya mesaj ekler
   */
  public static async sendMessage(params: {
    tenantId: string;
    conversationId?: string;
    topicTitle?: string;
    clientCompanyName: string;
    accountantUserId: string;
    accountantName: string;
    senderId: string;
    senderName: string;
    senderRole: 'CLIENT' | 'ACCOUNTANT';
    content: string;
    attachments?: string[];
  }): Promise<{ conversation: TopicConversation; message: TopicMessage }> {
    const {
      tenantId,
      conversationId,
      topicTitle = 'Genel Muhasebe İletişimi',
      clientCompanyName,
      accountantUserId,
      accountantName,
      senderId,
      senderName,
      senderRole,
      content,
      attachments = [],
    } = params;

    const now = new Date().toISOString();

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.topicConversations) draft.topicConversations = [];
      if (!draft.topicMessages) draft.topicMessages = [];

      let conv = conversationId
        ? draft.topicConversations.find(c => c.id === conversationId && (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')))
        : undefined;

      if (!conv) {
        conv = {
          id: `conv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          tenantId,
          topicTitle,
          clientCompanyName,
          accountantUserId,
          accountantName,
          lastMessageSnippet: content.slice(0, 60),
          lastMessageAt: now,
          unreadCount: 1,
          createdAt: now,
        };
        draft.topicConversations.unshift(conv);
      } else {
        conv.lastMessageSnippet = content.slice(0, 60);
        conv.lastMessageAt = now;
        conv.unreadCount += 1;
      }

      const msg: TopicMessage = {
        id: `msg-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        conversationId: conv.id,
        tenantId,
        senderId,
        senderName,
        senderRole,
        content,
        attachments,
        createdAt: now,
      };

      draft.topicMessages.push(msg);

      return { conversation: conv, message: msg };
    });
  }
}
