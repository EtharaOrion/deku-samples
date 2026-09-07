import nodemailer from 'nodemailer';
import type pg from 'pg';
import { env, log } from './env.js';
import { pool } from './db.js';

const transport = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: false,
  ignoreTLS: true,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
});

export type Transition =
  | 'confirmed'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'waitlisted'
  | 'promoted'
  | 'event_cancelled'
  | 'event_updated';

export function subjectFor(transition: Transition, title: string): string {
  switch (transition) {
    case 'confirmed': return `You're going to ${title}`;
    case 'pending': return `Your request to join ${title}`;
    case 'approved': return `You're in: ${title}`;
    case 'declined': return `About your request to join ${title}`;
    case 'waitlisted': return `You're on the waiting list for ${title}`;
    case 'promoted': return `A spot opened up for ${title}`;
    case 'event_cancelled': return `${title} has been cancelled`;
    case 'event_updated': return `An update about ${title}`;
  }
}

interface Ctx {
  title: string;
  displayName: string;
  ticketCode?: string | null;
  waitlistPosition?: number | null;
  cancelReason?: string;
  eventUrl?: string;
  ticketUrl?: string;
  details?: string;
}

function bodyFor(transition: Transition, c: Ctx): string {
  const hi = `Hi ${c.displayName},`;
  const lines: string[] = [hi, ''];
  switch (transition) {
    case 'confirmed':
      lines.push(`You have a seat at ${c.title}.`, '',
        `Your ticket code is ${c.ticketCode}. Show it at the door.`);
      break;
    case 'pending':
      lines.push(`Your request to join ${c.title} has been received.`, '',
        'The host reviews each request. We will write again when they decide.');
      break;
    case 'approved':
      lines.push(`The host approved your request to join ${c.title}.`, '',
        `Your ticket code is ${c.ticketCode}. Show it at the door.`);
      break;
    case 'declined':
      lines.push(`The host is not able to offer you a place at ${c.title} this time.`);
      break;
    case 'waitlisted':
      lines.push(`${c.title} is full, so you are on the waiting list at position ${c.waitlistPosition}.`, '',
        'If a seat frees up we will pass it down the list and write to you.');
      break;
    case 'promoted':
      lines.push(`A seat opened up at ${c.title} and it is yours.`, '',
        `Your ticket code is ${c.ticketCode}. Show it at the door.`);
      break;
    case 'event_cancelled':
      lines.push(`${c.title} has been cancelled by the host.`, '',
        'The host gave this reason:', '', c.cancelReason ?? '');
      break;
    case 'event_updated':
      lines.push(`Details for ${c.title} have changed.`, '', c.details ?? '',
        '', 'Your place is unchanged.');
      break;
  }
  if (c.ticketUrl) lines.push('', `Your ticket: ${c.ticketUrl}`);
  else if (c.eventUrl) lines.push('', `Event page: ${c.eventUrl}`);
  lines.push('', '— Deku Events');
  return lines.join('\n');
}

export interface SendArgs {
  to: string;
  transition: Transition;
  ctx: Ctx;
  eventId: number | null;
  registrationId: number | null;
}

/**
 * Sends over real SMTP, synchronously, to that guest alone: no cc, no bcc.
 * The email_log row is written only after the SMTP send has returned, so its
 * absence is proof the app never sent.
 */
export async function sendMail(args: SendArgs, db: pg.PoolClient | pg.Pool = pool): Promise<void> {
  const subject = subjectFor(args.transition, args.ctx.title);
  const text = bodyFor(args.transition, args.ctx);
  try {
    await transport.sendMail({
      from: env.mailFrom,
      to: args.to,
      subject,
      text,
    });
  } catch (e) {
    log('error', 'smtp send failed', { to: args.to, subject, err: String(e) });
    return;
  }
  try {
    await db.query(
      `INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at)
       VALUES ($1, $2, $3, $4, now())`,
      [args.registrationId, args.eventId, args.to, subject],
    );
  } catch (e) {
    log('error', 'email_log write failed', { to: args.to, err: String(e) });
  }
  log('info', 'mail sent', { to: args.to, subject });
}

export async function verifyMailTransport(): Promise<boolean> {
  try {
    await transport.verify();
    log('info', 'smtp reachable', { host: env.smtpHost, port: env.smtpPort });
    return true;
  } catch (e) {
    log('warn', 'smtp not reachable at startup', { err: String(e) });
    return false;
  }
}
