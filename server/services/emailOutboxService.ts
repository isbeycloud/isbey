/**
 * İŞBEY CLOUD — E-posta Kuyruğu (Outbox) Servisi (2026-10-15)
 * ============================================================
 * Kayıt akışında mail gönderimi kaydı GERİ ALMAMALIDIR: kayıt ile gönderim
 * ayrı adımlardır. Bu servis maili önce kuyruğa yazar, sonra göndermeyi
 * dener ve sonucu GERÇEK hâliyle işaretler:
 *
 *   QUEUED  → henüz gönderilmedi (SMTP yapılandırması yok veya deneme başarısız)
 *   SENT    → SMTP kabul etti
 *   FAILED  → SMTP reddetti (kalıcı hata); sebep `lastError`'da
 *
 * SAHTE BAŞARI YASAK (CLAUDE.md md.1): SMTP yokken kayıt SENT'e çevrilmez.
 * Bu, kayıt akışında "mail gönderildi" denip gönderilmemesini engeller.
 */
import { storage } from '../db/storage';
import type { EmailOutboxItem } from '../db/schema';
import { sendMail, type MailMessage } from './mailService';

export interface QueueMailInput extends MailMessage {
  tenantId?: string;
  kind: EmailOutboxItem['kind'];
}

/**
 * Maili kuyruğa yazar ve hemen göndermeyi dener.
 * Dönen nesne kuyruktaki GERÇEK kaydı taşır (SENT ise gönderilmiştir).
 */
export async function queueAndSendMail(input: QueueMailInput): Promise<EmailOutboxItem> {
  const now = new Date().toISOString();
  const item: EmailOutboxItem = {
    id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: input.tenantId,
    to: input.to.trim().toLowerCase(),
    subject: input.subject,
    text: input.text,
    html: input.html,
    kind: input.kind,
    status: 'QUEUED',
    attempts: 0,
    createdAt: now,
  };

  storage.update(draft => {
    if (!draft.emailOutbox) draft.emailOutbox = [];
    draft.emailOutbox.unshift(item);
    if (draft.emailOutbox.length > 2000) draft.emailOutbox = draft.emailOutbox.slice(0, 2000);
  });

  return await attemptDelivery(item.id);
}

/**
 * Kuyuktaki tek bir maili göndermeyi dener ve durumunu günceller.
 * Kayıt bulunamazsa `null` döner (sessizce "gönderildi" denmez).
 */
export async function attemptDelivery(id: string): Promise<EmailOutboxItem | null> {
  const current = (storage.getState().emailOutbox || []).find(m => m.id === id);
  if (!current) return null;
  if (current.status === 'SENT') return current;

  const result = await sendMail({ to: current.to, subject: current.subject, text: current.text, html: current.html });

  let updated: EmailOutboxItem | null = null;
  storage.update(draft => {
    const target = (draft.emailOutbox || []).find(m => m.id === id);
    if (!target) return;
    target.attempts = (target.attempts || 0) + 1;
    if (result.success) {
      target.status = 'SENT';
      target.sentAt = new Date().toISOString();
      target.lastError = undefined;
    } else {
      // Yapılandırma eksikliği KALICI bir hata değildir: mail kuyrukta kalır ve
      // SMTP kurulduğunda yeniden denenebilir. Diğer hatalar FAILED işaretlenir.
      target.status = result.configurationMissing ? 'QUEUED' : 'FAILED';
      target.lastError = result.message;
    }
    updated = { ...target };
  });

  if (!result.success) {
    console.warn(`[MAIL] Gönderilemedi (${current.kind}/${current.to}): ${result.message}`);
  }
  return updated;
}

/** Kuyrukta bekleyenleri (QUEUED) göndermeyi dener — SMTP kurulduktan sonra çağrılır. */
export async function retryQueuedMails(limit = 25): Promise<{ sent: number; failed: number; remaining: number }> {
  const queued = (storage.getState().emailOutbox || []).filter(m => m.status === 'QUEUED').slice(0, limit);
  let sent = 0;
  let failed = 0;
  for (const item of queued) {
    const after = await attemptDelivery(item.id);
    if (after?.status === 'SENT') sent++;
    else if (after?.status === 'FAILED') failed++;
  }
  const remaining = (storage.getState().emailOutbox || []).filter(m => m.status === 'QUEUED').length;
  return { sent, failed, remaining };
}
