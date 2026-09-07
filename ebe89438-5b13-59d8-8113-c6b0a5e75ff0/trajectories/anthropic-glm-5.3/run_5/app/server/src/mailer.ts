import nodemailer from 'nodemailer';
import { ENV } from './env.js';
import { pool } from './db.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: ENV.smtp.host,
      port: ENV.smtp.port,
      secure: false,
      auth: ENV.smtp.user ? { user: ENV.smtp.user, pass: ENV.smtp.pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

export type MailPayload = {
  registration_id: string | null;
  event_id: string;
  recipient: string;
  subject: string;
  body: string;
};

/**
 * Every mail is sent synchronously from the request that caused the transition
 * and logged only after the SMTP send has returned.
 */
export async function sendMail(payload: MailPayload): Promise<void> {
  await getTransporter().sendMail({
    from: ENV.mailFrom,
    to: payload.recipient,
    subject: payload.subject,
    text: payload.body,
  });
  await pool.query(
    `INSERT INTO email_log (registration_id, event_id, recipient, subject) VALUES ($1, $2, $3, $4)`,
    [payload.registration_id, payload.event_id, payload.recipient, payload.subject],
  );
}

export function logError(scope: string, err: unknown) {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.log(JSON.stringify({ level: 'error', scope, message, ts: new Date().toISOString() }));
}
