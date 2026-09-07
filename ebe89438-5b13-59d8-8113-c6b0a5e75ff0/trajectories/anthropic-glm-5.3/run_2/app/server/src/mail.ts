import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from './config.js';
import { pool, withTxn } from './db.js';

let transporter: Transporter | null = null;
export function mailer(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/** Sends one message and logs it only after the SMTP send returns. */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  registrationId?: string | null;
  eventId?: string | null;
}): Promise<void> {
  await mailer().sendMail({
    from: process.env.MAIL_FROM ?? 'Community Calendar <no-reply@calendar.local>',
    to: opts.to,
    cc: undefined,
    bcc: undefined,
    subject: opts.subject,
    text: opts.text,
  });
  await pool.query(
    `INSERT INTO email_log (registration_id, event_id, recipient, subject)
     VALUES ($1, $2, $3, $4)`,
    [opts.registrationId ?? null, opts.eventId ?? null, opts.to, opts.subject],
  );
}

export { withTxn };
