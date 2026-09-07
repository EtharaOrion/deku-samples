import nodemailer from 'nodemailer';
import { env, log } from './env.js';
import { query } from './db.js';
import { formatInZone, MailKind, subjectFor } from './domain.js';

const transport = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: false,
  ignoreTLS: true,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  pool: false,
} as nodemailer.TransportOptions);

export type PendingMail = {
  kind: MailKind;
  recipient: string;
  displayName: string;
  registrationId: number | null;
  eventId: number;
  eventTitle: string;
  eventSlug: string;
  startsAt: string | null;
  timeZone: string;
  city: string;
  ticketCode?: string | null;
  waitlistPosition?: number | null;
  cancelReason?: string | null;
  note?: string | null;
};

function bodyFor(m: PendingMail): { text: string; html: string } {
  const when = m.startsAt ? formatInZone(m.startsAt, m.timeZone) : 'a date to be announced';
  const link = env.appPublicUrl ? `${env.appPublicUrl.replace(/\/$/, '')}/${m.eventSlug}` : `/${m.eventSlug}`;
  const lines: string[] = [`Hello ${m.displayName},`, ''];
  switch (m.kind) {
    case 'confirmed':
      lines.push(`You have a seat at ${m.eventTitle}.`,
        `It takes place on ${when} in ${m.city}.`,
        `Your ticket code is ${m.ticketCode}. Show it at the door.`);
      break;
    case 'pending':
      lines.push(`Your request to join ${m.eventTitle} has reached the host.`,
        `The event takes place on ${when} in ${m.city}.`,
        `You are holding no seat yet; we will write again once the host decides.`);
      break;
    case 'approved':
      lines.push(`The host approved your request to join ${m.eventTitle}.`,
        `It takes place on ${when} in ${m.city}.`,
        `Your ticket code is ${m.ticketCode}. Show it at the door.`);
      break;
    case 'declined':
      lines.push(`The host could not take your request to join ${m.eventTitle} this time.`,
        `The event takes place on ${when} in ${m.city}.`);
      break;
    case 'waitlisted':
      lines.push(`${m.eventTitle} is full, so you are on the waiting list.`,
        `You are number ${m.waitlistPosition} in line.`,
        `The event takes place on ${when} in ${m.city}. We will write the moment a seat opens.`);
      break;
    case 'promoted':
      lines.push(`A spot opened up for ${m.eventTitle} and it is yours.`,
        `It takes place on ${when} in ${m.city}.`,
        `Your ticket code is ${m.ticketCode}. Show it at the door.`);
      break;
    case 'event_cancelled':
      lines.push(`The host has called off ${m.eventTitle}, which was to take place on ${when}.`,
        '', `The host's reason: ${m.cancelReason ?? ''}`);
      break;
    case 'event_updated':
      lines.push(`Details changed for ${m.eventTitle}, which you are registered for.`,
        m.note ?? '', `It now takes place on ${when} in ${m.city}.`);
      break;
  }
  lines.push('', `Event page: ${link}`, '', 'Deku Events');
  const text = lines.join('\n');
  const html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#151515">${
    lines.map((l) => (l ? `<p style="margin:0 0 12px">${escapeHtml(l)}</p>` : '')).join('')
  }</div>`;
  return { text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/**
 * Sends one message per recipient over real SMTP, then records the send.
 * The email_log row is written only after the SMTP transaction returns.
 */
export async function sendMails(mails: PendingMail[]): Promise<void> {
  for (const m of mails) {
    const subject = subjectFor(m.kind, m.eventTitle);
    const { text, html } = bodyFor(m);
    try {
      const info = await transport.sendMail({
        from: env.mailFrom,
        to: m.recipient,
        subject,
        text,
        html,
      });
      await query(
        `INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at)
         VALUES ($1,$2,$3,$4, now())`,
        [m.registrationId, m.eventId, m.recipient, subject],
      );
      log('info', 'mail sent', { to: m.recipient, subject, messageId: info.messageId });
    } catch (err) {
      log('error', 'mail send failed', { to: m.recipient, subject, err: String(err) });
    }
  }
}

export async function verifyMailer(): Promise<boolean> {
  try {
    await transport.verify();
    return true;
  } catch (e) {
    log('warn', 'smtp not verified', { err: String(e) });
    return false;
  }
}
