import nodemailer from 'nodemailer';
import { env } from './env.js';
import { log } from './log.js';
import { query, type Db } from './db.js';

const transport = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: false,
  ignoreTLS: true,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  pool: false,
} as any);

export type MailKind =
  | 'registration_confirmed'
  | 'registration_pending'
  | 'approved'
  | 'declined'
  | 'waitlisted'
  | 'waitlist_promoted'
  | 'event_cancelled'
  | 'event_updated';

export function subjectFor(kind: MailKind, title: string): string {
  switch (kind) {
    case 'registration_confirmed':
      return `You're going to ${title}`;
    case 'registration_pending':
      return `Your request to join ${title}`;
    case 'approved':
      return `You're in: ${title}`;
    case 'declined':
      return `About your request to join ${title}`;
    case 'waitlisted':
      return `You're on the waiting list for ${title}`;
    case 'waitlist_promoted':
      return `A spot opened up for ${title}`;
    case 'event_cancelled':
      return `${title} has been cancelled`;
    case 'event_updated':
      return `An update to ${title}`;
  }
}

export interface MailRequest {
  kind: MailKind;
  to: string;
  eventTitle: string;
  eventId: number | null;
  registrationId: number | null;
  lines: string[];
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sends over real SMTP, synchronously, and only writes the email_log row after
 * the send has returned.
 */
export async function sendMail(req: MailRequest, db?: Db): Promise<void> {
  const subject = subjectFor(req.kind, req.eventTitle);
  const text = req.lines.join('\n\n');
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#151515;background:#ffffff;padding:24px">
${req.lines.map((l) => `<p style="font-size:16px;line-height:25.6px">${escapeHtml(l)}</p>`).join('\n')}
</body></html>`;

  try {
    await transport.sendMail({
      from: env.mailFrom,
      to: req.to,
      subject,
      text,
      html,
    });
  } catch (e) {
    log.error('smtp send failed', { to: req.to, subject, err: String(e) });
    throw e;
  }
  log.info('mail sent', { to: req.to, subject, kind: req.kind });
  try {
    await query(
      `INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at)
       VALUES ($1, $2, $3, $4, now())`,
      [req.registrationId, req.eventId, req.to, subject],
      db,
    );
  } catch (e) {
    log.error('email_log write failed', { err: String(e) });
  }
}

/** Mail must never take the request down; the transition itself is committed. */
export async function sendMailSafely(req: MailRequest): Promise<void> {
  try {
    await sendMail(req);
  } catch {
    /* logged in sendMail */
  }
}

export async function verifyMailTransport(): Promise<boolean> {
  try {
    await transport.verify();
    log.info('smtp ready', { host: env.smtpHost, port: env.smtpPort });
    return true;
  } catch (e) {
    log.warn('smtp not ready', { host: env.smtpHost, port: env.smtpPort, err: String(e) });
    return false;
  }
}
