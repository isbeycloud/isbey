/**
 * İŞBEY CLOUD — E-posta Gönderim Servisi (2026-10-15)
 * ====================================================
 * Kapsam: kayıt sonrası otomatik şifre maili ve deneme bilgilendirmeleri.
 *
 * KURALLAR (CLAUDE.md md.1 ve md.4):
 *  - Credential YALNIZ `.env`'den okunur; kaynak koda asla yazılmaz.
 *  - Yapılandırma eksikse "gönderildi" DENMEZ: açık hata döndürülür ve mail
 *    kuyrukta (`db.emailOutbox`) `QUEUED` olarak bekler. Simülasyon/sahte
 *    başarı yasaktır; `console.warn` ile sebep raporlanır.
 *  - Gönderim hatası hâlinde kayıt geri alınmaz: kayıt ile gönderim ayrı
 *    adımlardır. Kuyruk gerçek durumu saklar.
 *  - Şifre ve SMTP parolası loglanmaz.
 *
 * Yapılandırma anahtarları:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_FROM_NAME
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailResult {
  success: boolean;
  /** Başarısızsa operatörün anlayacağı sebep (kimlik bilgisi İÇERMEZ). */
  message?: string;
  /** Yapılandırma eksik → çağıran maili kuyrukta bırakmalıdır. */
  configurationMissing?: boolean;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

/**
 * `.env`'den SMTP yapılandırmasını okur. Eksikse `null` döner —
 * varsayılan/fallback sunucu ASLA uydurulmaz.
 */
export function readSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = (env.SMTP_HOST || '').trim();
  const user = (env.SMTP_USER || '').trim();
  const pass = env.SMTP_PASS || '';
  const from = (env.MAIL_FROM || user).trim();
  if (!host || !user || !pass || !from) return null;

  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  // SMTP_SECURE tanımsızsa porta göre karar verilir (465 → TLS, 587 → STARTTLS).
  // Bu bir "uydurma sunucu" değil, protokol kuralıdır.
  const secure = env.SMTP_SECURE != null && env.SMTP_SECURE !== ''
    ? env.SMTP_SECURE === 'true'
    : port === 465;

  return { host, port, secure, user, pass, from, fromName: (env.MAIL_FROM_NAME || 'İŞBEY CLOUD').trim() };
}

let cachedTransporter: { key: string; transporter: Transporter } | null = null;

function getTransporter(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}`;
  if (cachedTransporter?.key === key) return cachedTransporter.transporter;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  cachedTransporter = { key, transporter };
  return transporter;
}

/** Test/izolasyon için taşıyıcı önbelleğini temizler. */
export function resetMailTransporter(): void {
  cachedTransporter = null;
}

/**
 * Tek bir mail gönderir. Hata ASLA yutulmaz; çağıran gerçek sonucu görür.
 */
export async function sendMail(message: MailMessage, env: NodeJS.ProcessEnv = process.env): Promise<MailResult> {
  const config = readSmtpConfig(env);
  if (!config) {
    return {
      success: false,
      configurationMissing: true,
      message: 'SMTP yapılandırması eksik (SMTP_HOST/SMTP_USER/SMTP_PASS). Mail kuyrukta bekletildi.',
    };
  }

  if (!message.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
    return { success: false, message: 'Geçersiz alıcı e-posta adresi.' };
  }

  try {
    await getTransporter(config).sendMail({
      from: `"${config.fromName}" <${config.from}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { success: true };
  } catch (err: any) {
    // Sunucu yanıtı loglanır ama kimlik bilgisi/token YAZILMAZ.
    const reason = err?.response || err?.code || err?.message || 'bilinmeyen hata';
    return { success: false, message: `Mail gönderilemedi: ${String(reason).slice(0, 200)}` };
  }
}

/** Kayıt sonrası otomatik şifre bilgilendirmesi (düz metin + HTML). */
export function registrationPasswordMail(input: {
  fullName: string;
  username: string;
  password: string;
  companyName: string;
  trialEndsAt: string;
  loginUrl: string;
}): { subject: string; text: string; html: string } {
  const bitis = new Date(input.trialEndsAt).toLocaleDateString('tr-TR');
  const subject = `İŞBEY CLOUD hesabınız hazır — ${input.companyName}`;
  const text = [
    `Sayın ${input.fullName},`,
    '',
    `İŞBEY CLOUD hesabınız oluşturuldu. 14 günlük deneme süreniz ${bitis} tarihinde sona erecek.`,
    '',
    `Firma: ${input.companyName}`,
    `Kullanıcı adı: ${input.username}`,
    `Geçici şifre: ${input.password}`,
    '',
    `Giriş adresi: ${input.loginUrl}`,
    '',
    'Güvenliğiniz için ilk girişten sonra şifrenizi değiştirmenizi öneririz.',
    'Deneme süreniz boyunca ön muhasebe modüllerini serbestçe kullanabilirsiniz.',
    'Süre sonunda e-Dönüşüm tercihinizi seçmeniz istenecektir.',
    '',
    'İŞBEY CLOUD',
  ].join('\n');

  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <h2 style="margin:0 0 16px;font-size:20px">İŞBEY CLOUD hesabınız hazır</h2>
    <p style="margin:0 0 16px">Sayın ${escapeHtml(input.fullName)}, hesabınız oluşturuldu. 14 günlük deneme süreniz <strong>${escapeHtml(bitis)}</strong> tarihinde sona erecek.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
      <tr><td style="padding:8px 0;color:#6b7280">Firma</td><td style="padding:8px 0;font-weight:600">${escapeHtml(input.companyName)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Kullanıcı adı</td><td style="padding:8px 0;font-weight:600">${escapeHtml(input.username)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Geçici şifre</td><td style="padding:8px 0;font-weight:600;letter-spacing:1px">${escapeHtml(input.password)}</td></tr>
    </table>
    <p style="margin:0 0 20px"><a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;background:#0066cc;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Sisteme Giriş Yap</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Güvenliğiniz için ilk girişten sonra şifrenizi değiştirmenizi öneririz.</p>
    <p style="margin:0;font-size:13px;color:#6b7280">Deneme süreniz boyunca ön muhasebe modüllerini serbestçe kullanabilirsiniz. Süre sonunda e-Dönüşüm tercihinizi seçmeniz istenecektir.</p>
  </div></body></html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
