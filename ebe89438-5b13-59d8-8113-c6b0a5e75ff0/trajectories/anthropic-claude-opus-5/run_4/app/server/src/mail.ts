import nodemailer from 'nodemailer';
import { env } from './env.js';
import { log } from './log.js';
import { query } from './db.js';

const transport = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: false,
  ignoreTLS: true,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  pool: false,
} as nodemailer.TransportOptions);

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
      return `A change to ${title}`;
  }
}

export interface MailInput {
  kind: MailKind;
  to: string;
  displayName: string;
  eventTitle: string;
  eventSlug: string;
  eventId: number | null;
  registrationId?: number | null;
  ticketCode?: string | null;
  waitlistPosition?: number | null;
  cancelReason?: string | null;
  extra?: string | null;
}

function bodyFor(m: MailInput): string {
  const lines: string[] = [`Hello ${m.displayName},`, ''];
  const t = m.eventTitle;
  switch (m.kind) {
    case 'registration_confirmed':
      lines.push(`You have a seat at ${t}.`);
      if (m.ticketCode) lines.push('', `Your ticket code is ${m.ticketCode}.`);
      break;
    case 'registration_pending':
      lines.push(`Your request to join ${t} has reached the host, who reviews every request before a seat is held.`);
      break;
    case 'approved':
      lines.push(`The host approved your request to join ${t}. You have a seat.`);
      if (m.ticketCode) lines.push('', `Your ticket code is ${m.ticketCode}.`);
      break;
    case 'declined':
      lines.push(`The host was not able to offer you a place at ${t} this time.`);
      break;
    case 'waitlisted':
      lines.push(`${t} is full, so you hold waiting-list place ${m.waitlistPosition ?? ''}.`.trim());
      lines.push('We will write again the moment a seat opens up.');
      break;
    case 'waitlist_promoted':
      lines.push(`A seat opened up at ${t} and it is yours.`);
      if (m.ticketCode) lines.push('', `Your ticket code is ${m.ticketCode}.`);
      break;
    case 'event_cancelled':
      lines.push(`${t} has been called off by its host.`);
      if (m.cancelReason) lines.push('', `The host writes:`, m.cancelReason);
      break;
    case 'event_updated':
      lines.push(`Details of ${t} have changed.`);
      if (m.extra) lines.push('', m.extra);
      break;
  }
  if (env.publicUrl) lines.push('', `${env.publicUrl}/${m.eventSlug}`);
  if (m.ticketCode && env.publicUrl) lines.push(`${env.publicUrl}/t/${m.ticketCode}`);
  lines.push('', '— Community Calendar');
  return lines.join('\n');
}

/**
 * Sends over real SMTP, synchronously with the request that causes the
 * transition, and writes the log row only once the send has returned.
 */
export async function sendMail(m: MailInput): Promise<void> {
  const subject = subjectFor(m.kind, m.eventTitle);
  const text = bodyFor(m);
  try {
    const info = await transport.sendMail({
      from: env.mailFrom,
      to: m.to,
      subject,
      text,
    });
    await query(
      'INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at) VALUES ($1,$2,$3,$4, now())',
      [m.registrationId ?? null, m.eventId, m.to, subject],
    );
    log.info('mail sent', { to: m.to, subject, messageId: (info as any)?.messageId });
  } catch (err) {
    log.error('mail send failed', { to: m.to, subject, err: String(err) });
  }
}

export async function sendAll(list: MailInput[]): Promise<void> {
  for (const m of list) await sendMail(m);
}
