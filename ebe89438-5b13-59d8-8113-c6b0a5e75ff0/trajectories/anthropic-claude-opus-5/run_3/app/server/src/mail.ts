import nodemailer from 'nodemailer';
import { query } from './db.js';
import { log } from './log.js';

/**
 * Real SMTP, synchronously from the request that causes the transition.
 * No vendor SDK, no queue, no batching, no in-process stub.
 */
let transport: nodemailer.Transporter | null = null;

function getTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!host) throw new Error('SMTP_HOST is not set');
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
    requireTLS: false,
    ...(user ? { auth: { user, pass } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transport;
}

export const MAIL_FROM = process.env.MAIL_FROM || 'Deku Events <no-reply@deku.events>';

export type Transition =
  | 'confirmed'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'waitlisted'
  | 'promoted'
  | 'event_cancelled'
  | 'event_updated';

/** Each transition owns one subject; only <title> is substituted. */
export function subjectFor(transition: Transition, title: string) {
  switch (transition) {
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
      return `An update to ${title}`;
  }
}

export type MailContext = {
  title: string;
  eventSlug: string;
  displayName: string;
  ticketCode?: string | null;
  waitlistPosition?: number | null;
  startsAt?: string | null;
  timeZone?: string | null;
  location?: string | null;
  cancelReason?: string | null;
  publicUrl: string;
};

function whenLine(ctx: MailContext) {
  if (!ctx.startsAt) return '';
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: ctx.timeZone || 'UTC',
    });
    return `${fmt.format(new Date(ctx.startsAt))} (${ctx.timeZone || 'UTC'})`;
  } catch {
    return ctx.startsAt;
  }
}

function bodyFor(transition: Transition, ctx: MailContext): string {
  const hi = `Hi ${ctx.displayName},`;
  const when = whenLine(ctx);
  const whereLine = ctx.location ? `Where: ${ctx.location}\n` : '';
  const link = `${ctx.publicUrl.replace(/\/$/, '')}/${ctx.eventSlug}`;
  const details = `${when ? `When: ${when}\n` : ''}${whereLine}Event: ${link}\n`;
  const ticket =
    ctx.ticketCode
      ? `\nYour ticket code is ${ctx.ticketCode}\nShow it at the door: ${ctx.publicUrl.replace(/\/$/, '')}/t/${ctx.ticketCode}\n`
      : '';

  switch (transition) {
    case 'confirmed':
      return `${hi}\n\nYou have a seat at ${ctx.title}.\n\n${details}${ticket}\nSee you there.\n`;
    case 'pending':
      return `${hi}\n\nYour request to join ${ctx.title} has been received. The host is deciding, and we will write again as soon as they have.\n\n${details}`;
    case 'approved':
      return `${hi}\n\nThe host approved your request to join ${ctx.title}. You have a seat.\n\n${details}${ticket}`;
    case 'declined':
      return `${hi}\n\nAbout your request to join ${ctx.title}: the host was not able to offer you a place this time.\n\n${details}`;
    case 'waitlisted':
      return `${hi}\n\n${ctx.title} is full, so you are on the waiting list at position ${ctx.waitlistPosition}. If a seat frees up we will write to you.\n\n${details}`;
    case 'promoted':
      return `${hi}\n\nA spot opened up for ${ctx.title} and it is yours. You have moved from the waiting list to a seat.\n\n${details}${ticket}`;
    case 'event_cancelled':
      return `${hi}\n\n${ctx.title} has been cancelled by the host.\n\nThe host's reason:\n${ctx.cancelReason || ''}\n\n${details}`;
    case 'event_updated':
      return `${hi}\n\nThe details of ${ctx.title} have changed. Your place is unaffected.\n\n${details}${ticket}`;
  }
}

export type SendArgs = {
  to: string;
  transition: Transition;
  ctx: MailContext;
  registrationId?: string | null;
  eventId?: string | null;
};

/**
 * Sends one message to that guest alone: no cc, no bcc. The email_log row is
 * written only after the SMTP send has returned, so its absence is proof the
 * app never sent.
 */
export async function sendMail({ to, transition, ctx, registrationId, eventId }: SendArgs) {
  const subject = subjectFor(transition, ctx.title);
  try {
    const info = await getTransport().sendMail({
      from: MAIL_FROM,
      to,
      subject,
      text: bodyFor(transition, ctx),
    });
    await query(
      'INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at) VALUES ($1,$2,$3,$4, now())',
      [registrationId ?? null, eventId ?? null, to, subject]
    );
    log.info('mail_sent', { to, subject, transition, message_id: info.messageId });
    return true;
  } catch (err: any) {
    log.error('mail_failed', { to, subject, transition, message: err?.message });
    return false;
  }
}

export async function verifyMailReady() {
  try {
    await getTransport().verify();
    log.info('smtp_ready', { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT });
    return true;
  } catch (err: any) {
    log.warn('smtp_unavailable', { message: err?.message });
    return false;
  }
}
