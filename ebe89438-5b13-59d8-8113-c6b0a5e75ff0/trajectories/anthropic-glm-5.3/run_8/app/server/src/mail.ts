import type { PoolClient } from 'pg';
import { config, log, mailTransport, shortId } from './config.js';

export const SUBJECTS = {
  confirmed: (title: string) => `You're going to ${title}`,
  awaiting: (title: string) => `Your request to join ${title}`,
  approved: (title: string) => `You're in: ${title}`,
  declined: (title: string) => `About your request to join ${title}`,
  waitlisted: (title: string) => `You're on the waiting list for ${title}`,
  promoted: (title: string) => `A spot opened up for ${title}`,
  cancelled: (title: string) => `${title} has been cancelled`,
  details: (title: string) => `Details changed for ${title}`,
} as const;

export type MailKind = keyof typeof SUBJECTS;

function titleCase(kind: MailKind): string {
  switch (kind) {
    case 'confirmed': return 'Your seat is confirmed';
    case 'awaiting': return 'The host is reviewing your request';
    case 'approved': return 'Your request was approved';
    case 'declined': return 'Your request was declined';
    case 'waitlisted': return 'You hold a waiting-list place';
    case 'promoted': return 'A seat opened up for you';
    case 'cancelled': return 'The host called this event off';
    case 'details': return 'Details changed for this event';
    default: return 'An update about your place';
  }
}

function detail(kind: MailKind, ev: EventFacts, ctx: { position?: number; ticketCode?: string; reason?: string }): string {
  switch (kind) {
    case 'confirmed':
      return `Your place at ${ev.title} is confirmed. Show this ticket code at the door: ${ctx.ticketCode ?? ''}`;
    case 'awaiting':
      return `Your request to join ${ev.title} has reached the host. You hold no seat until the host approves it.`;
    case 'approved':
      return `The host approved your request for ${ev.title}. Show this ticket code at the door: ${ctx.ticketCode ?? ''}`;
    case 'declined':
      return `The host could not take your request for ${ev.title} this time.`;
    case 'waitlisted':
      return `You are number ${ctx.position ?? ''} on the waiting list for ${ev.title}. You hold no seat yet.`;
    case 'promoted':
      return `A seat opened up at ${ev.title} and it is yours. Show this ticket code at the door: ${ctx.ticketCode ?? ''}`;
    case 'cancelled':
      return `${ev.title} has been cancelled.\n\nThe host's reason, in their own words:\n${ctx.reason ?? ''}`;
    case 'details':
      return `The details of ${ev.title} have changed.`;
  }
}

export interface EventFacts {
  slug: string;
  title: string;
  city?: string;
  starts_at?: string | Date | null;
  time_zone?: string;
}

function stamp(ev: EventFacts): string {
  if (!ev.starts_at || !ev.time_zone) return '';
  const when = ev.starts_at instanceof Date ? ev.starts_at.toISOString() : ev.starts_at;
  return `\n\nWhen: ${when} (${ev.time_zone})`;
}

export function bodyText(kind: MailKind, ev: EventFacts, guestName: string, ctx: { position?: number; ticketCode?: string; reason?: string }): string {
  return [
    `Hi ${guestName},`,
    '',
    detail(kind, ev, ctx) + stamp(ev),
    '',
    kind === 'cancelled' ? `Event page: ${config.appUrl}/${ev.slug}` : `Event page: ${config.appUrl}/${ev.slug}`,
    kind === 'details' ? `Where: ${ev.city ?? ''}` : '',
    ctx.ticketCode ? `Ticket: ${config.appUrl}/t/${ctx.ticketCode}` : '',
    '',
    `— ${ev.title}`,
  ].filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Sends one mail over SMTP synchronously and writes the email_log row only
 * after the transport has returned. Callers invoke this inside the request
 * that causes the transition; a failure to send surfaces as a thrown error
 * so the transition itself never reports success silently.
 */
export async function sendMail(
  client: PoolClient,
  kind: MailKind,
  ev: EventFacts,
  to: string,
  guestName: string,
  ctx: { position?: number; ticketCode?: string; reason?: string; registrationId?: string | null; eventId?: string | null },
): Promise<void> {
  const subject = SUBJECTS[kind](ev.title);
  const text = bodyText(kind, ev, guestName, ctx);
  const transport = mailTransport();
  try {
    await transport.sendMail({
      from: `Gather <no-reply@${(config.smtpHost.split(':')[0] || 'gather.local')}>`,
      to: [to],
      subject,
      text,
      headers: { 'X-Gather-Transition': kind },
    });
  } catch (err) {
    log('mail_failed', { to, subject, message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  await client.query(
    `INSERT INTO email_log (id, registration_id, event_id, recipient, subject, sent_at)
     VALUES ($1,$2,$3,$4,$5,now())`,
    [shortId(16), ctx.registrationId ?? null, ctx.eventId ?? null, to, subject],
  );
  log('mail_sent', { to, subject });
}
