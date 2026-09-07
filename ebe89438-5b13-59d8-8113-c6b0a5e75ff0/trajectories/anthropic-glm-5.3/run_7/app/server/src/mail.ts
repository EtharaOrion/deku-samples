import nodemailer, { type Transporter } from 'nodemailer';
import { Pool } from 'pg';
import { log } from './log.js';

let transporter: Transporter | null = null;

export function mailTransport(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST || 'localhost';
  const port = Number(process.env.SMTP_PORT || 1025);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transporter;
}

export type PendingMail = {
  registrationId: string | null;
  eventId: string | null;
  recipient: string;
  to?: string;
  subject: string;
  body: string;
};

/** One SMTP send, one email_log row written only after the send returned. */
export async function sendMail(db: Pool, mail: PendingMail): Promise<void> {
  const t = mailTransport();
  await t.sendMail({
    from: process.env.MAIL_FROM || 'Community Calendar <no-reply@calendar.local>',
    to: mail.recipient,
    subject: mail.subject,
    text: mail.body,
    headers: { 'X-Mailer': 'community-calendar' },
  });
  await db.query(
    `INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at)
     VALUES ($1, $2, $3, $4, now())`,
    [mail.registrationId, mail.eventId, mail.recipient, mail.subject],
  );
  log.info('mail_sent', { to: mail.recipient, subject: mail.subject, event_id: mail.eventId });
}
