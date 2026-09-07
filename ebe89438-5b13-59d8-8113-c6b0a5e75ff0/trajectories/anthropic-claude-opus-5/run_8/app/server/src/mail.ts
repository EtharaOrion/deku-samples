import nodemailer from 'nodemailer';
import { env, log } from './env.js';
import { query } from './db.js';

const transportOptions = {
  host: env.smtpHost,
  port: env.smtpPort,
  secure: false,
  ignoreTLS: true,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  pool: false,
} as unknown as nodemailer.TransportOptions;

const transporter = nodemailer.createTransport(transportOptions);

export type MailKind =
  | 'confirmed'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'waitlisted'
  | 'promoted'
  | 'event_cancelled'
  | 'event_updated';

export function subjectFor(kind: MailKind, title: string): string {
  switch (kind) {
    case 'confirmed':
      return `You're going to ${title}`;
    case 'pending':
      return `Your request to join ${title}`;
    case 'approved':
      return `You're in: ${title}`;
    case 'declined':
      return `About your request to join ${title}`;
    case 'waitlisted':
      return `You're on the waiting list for ${title}`;
    case 'promoted':
      return `A spot opened up for ${title}`;
    case 'event_cancelled':
      return `${title} has been cancelled`;
    case 'event_updated':
      return `Details changed for ${title}`;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface SendArgs {
  to: string;
  subject: string;
  text: string;
  registrationId?: string | number | null;
  eventId?: string | number | null;
}

export async function sendMail(args: SendArgs): Promise<void> {
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#151515;background:#ffffff;padding:24px">
<p style="white-space:pre-wrap;font-size:16px;line-height:25.6px">${escapeHtml(args.text)}</p>
</body></html>`;
  try {
    await transporter.sendMail({
      from: env.mailFrom,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html,
    });
  } catch (e) {
    log('error', 'smtp send failed', { to: args.to, subject: args.subject, err: String(e) });
    throw e;
  }
  await query(
    'INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at) VALUES ($1,$2,$3,$4, now())',
    [args.registrationId ?? null, args.eventId ?? null, args.to, args.subject],
  );
  log('info', 'mail sent', { to: args.to, subject: args.subject });
}

export interface EventBrief {
  id: string | number;
  title: string;
  slug: string;
  starts_at: Date | string | null;
  time_zone: string;
  city: string | null;
}

function whenLine(ev: EventBrief): string {
  if (!ev.starts_at) return '';
  const d = ev.starts_at instanceof Date ? ev.starts_at : new Date(ev.starts_at);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: ev.time_zone || 'UTC',
  });
  return `When: ${fmt.format(d)} (${ev.time_zone || 'UTC'})\n`;
}

export function bodyFor(kind: MailKind, ev: EventBrief, extra: { name?: string; ticket?: string | null; position?: number | null; reason?: string } = {}): string {
  const link = `${env.publicUrl || ''}/${ev.slug}`;
  const head = `Hello${extra.name ? ' ' + extra.name : ''},\n\n`;
  const details = `${whenLine(ev)}${ev.city ? `Where: ${ev.city}\n` : ''}Event page: ${link}\n`;
  switch (kind) {
    case 'confirmed':
      return `${head}You have a seat at ${ev.title}.\n\n${details}Your ticket code is ${extra.ticket}. Show it at the door.\n`;
    case 'pending':
      return `${head}Your request to join ${ev.title} has been received. The host is deciding and you will hear back here.\n\n${details}`;
    case 'approved':
      return `${head}The host approved your request to join ${ev.title}. You have a seat.\n\n${details}Your ticket code is ${extra.ticket}. Show it at the door.\n`;
    case 'declined':
      return `${head}The host could not offer you a place at ${ev.title} this time.\n\n${details}`;
    case 'waitlisted':
      return `${head}${ev.title} is full, so you are number ${extra.position} on the waiting list. If a seat frees up we will write again.\n\n${details}`;
    case 'promoted':
      return `${head}A spot opened up for ${ev.title} and it is yours. You are now confirmed.\n\n${details}Your ticket code is ${extra.ticket}. Show it at the door.\n`;
    case 'event_cancelled':
      return `${head}${ev.title} has been cancelled by the host.\n\nThe host's reason: ${extra.reason}\n\n${details}`;
    case 'event_updated':
      return `${head}The details of ${ev.title} have changed. Please check the new time and place.\n\n${details}`;
  }
}

export async function mailRegistration(
  kind: MailKind,
  ev: EventBrief,
  recipient: { email: string; display_name: string },
  registrationId: string | number | null,
  extra: { ticket?: string | null; position?: number | null; reason?: string } = {},
): Promise<void> {
  await sendMail({
    to: recipient.email,
    subject: subjectFor(kind, ev.title),
    text: bodyFor(kind, ev, { name: recipient.display_name, ...extra }),
    registrationId,
    eventId: ev.id,
  });
}

export async function verifySmtp(): Promise<boolean> {
  try {
    await transporter.verify();
    return true;
  } catch (e) {
    log('warn', 'smtp not ready', { err: String(e) });
    return false;
  }
}
