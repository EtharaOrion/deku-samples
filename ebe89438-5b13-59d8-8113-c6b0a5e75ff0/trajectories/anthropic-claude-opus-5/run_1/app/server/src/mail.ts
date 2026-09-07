import nodemailer from 'nodemailer';
import { env, log } from './env.js';
import { query } from './db.js';

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: false,
  ignoreTLS: true,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  pool: false,
} as any);

export interface MailInput {
  to: string;
  subject: string;
  lines: string[];
  eventId?: string | null;
  registrationId?: string | null;
}

function textBody(lines: string[]): string {
  return lines.join('\n\n') + '\n';
}

function htmlBody(subject: string, lines: string[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<!doctype html><html><body style="font-family:Georgia,serif;color:#151515;background:#ffffff;padding:24px">',
    `<h1 style="font-size:22px;line-height:26px;font-weight:700">${esc(subject)}</h1>`,
    ...lines.map(
      (l) => `<p style="font-size:16px;line-height:25.6px">${esc(l)}</p>`
    ),
    '</body></html>',
  ].join('');
}

/**
 * Sends over real SMTP, synchronously, to one recipient with no cc and no bcc,
 * then records the send. The email_log row is written only after the SMTP
 * conversation has returned.
 */
export async function sendMail(input: MailInput): Promise<void> {
  const started = Date.now();
  try {
    await transporter.sendMail({
      from: env.mailFrom,
      to: input.to,
      subject: input.subject,
      text: textBody(input.lines),
      html: htmlBody(input.subject, input.lines),
    });
  } catch (e) {
    log('error', 'mail.send_failed', {
      to: input.to,
      subject: input.subject,
      err: (e as Error).message,
    });
    throw e;
  }
  await query(
    `INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at)
     VALUES ($1, $2, $3, $4, now())`,
    [input.registrationId ?? null, input.eventId ?? null, input.to, input.subject]
  );
  log('info', 'mail.sent', {
    to: input.to,
    subject: input.subject,
    ms: Date.now() - started,
  });
}

/** Never let a mail failure turn a completed transition into a server error. */
export async function sendMailSafe(input: MailInput): Promise<void> {
  try {
    await sendMail(input);
  } catch {
    /* logged in sendMail; the state transition already committed */
  }
}

export async function verifyMailTransport(): Promise<boolean> {
  try {
    await transporter.verify();
    return true;
  } catch (e) {
    log('warn', 'mail.verify_failed', { err: (e as Error).message });
    return false;
  }
}
