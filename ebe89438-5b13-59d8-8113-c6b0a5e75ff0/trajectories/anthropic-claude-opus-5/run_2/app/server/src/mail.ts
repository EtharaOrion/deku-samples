import nodemailer from 'nodemailer';
import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { log } from './util.js';

const host = process.env.SMTP_HOST || 'localhost';
const port = Number(process.env.SMTP_PORT || 1025);
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASS || '';
const from =
  process.env.MAIL_FROM || 'Community Calendar <no-reply@community-calendar.test>';

const transport = nodemailer.createTransport({
  host,
  port,
  secure: false,
  ignoreTLS: true,
  auth: user ? { user, pass } : undefined,
  pool: false,
});

/** Each transition owns exactly one subject line. */
export const SUBJECTS = {
  confirmed: (title: string) => `You're going to ${title}`,
  pending: (title: string) => `Your request to join ${title}`,
  approved: (title: string) => `You're in: ${title}`,
  declined: (title: string) => `About your request to join ${title}`,
  waitlisted: (title: string) => `You're on the waiting list for ${title}`,
  promoted: (title: string) => `A spot opened up for ${title}`,
  cancelled: (title: string) => `${title} has been cancelled`,
} as const;

export interface MailInput {
  to: string;
  subject: string;
  lines: string[];
  eventId: string | null;
  registrationId?: string | null;
}

function textBody(lines: string[]) {
  return lines.filter((l) => l !== undefined && l !== null).join('\n\n') + '\n';
}

function htmlBody(lines: string[]) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<!doctype html><html><body style="font-family:Georgia,serif;color:#151515;background:#ffffff;padding:24px">',
    ...lines.map(
      (l) =>
        `<p style="font:16px/25.6px Georgia,serif;margin:0 0 16px">${esc(l)}</p>`,
    ),
    '</body></html>',
  ].join('');
}

/**
 * Sends over real SMTP, synchronously, from the request that causes the
 * transition. The email_log row is written only after the send has returned,
 * so its absence is proof the app never sent.
 */
export async function sendMail(input: MailInput, client?: PoolClient): Promise<void> {
  const started = Date.now();
  try {
    const info = await transport.sendMail({
      from,
      to: input.to, // to that guest alone: no cc, no bcc
      subject: input.subject,
      text: textBody(input.lines),
      html: htmlBody(input.lines),
    });
    const runner = client ?? pool;
    await runner.query(
      `INSERT INTO email_log (registration_id, event_id, recipient, subject, sent_at)
       VALUES ($1, $2, $3, $4, now())`,
      [input.registrationId ?? null, input.eventId, input.to, input.subject],
    );
    log('info', 'mail_sent', {
      to: input.to,
      subject: input.subject,
      message_id: (info as { messageId?: string }).messageId,
      ms: Date.now() - started,
    });
  } catch (err) {
    // A failed send must never undo the transition that has already committed.
    log('error', 'mail_failed', {
      to: input.to,
      subject: input.subject,
      message: (err as Error).message,
    });
  }
}

export async function verifyMailTransport(): Promise<boolean> {
  try {
    await transport.verify();
    log('info', 'smtp_ready', { host, port });
    return true;
  } catch (err) {
    log('warn', 'smtp_unverified', { host, port, message: (err as Error).message });
    return false;
  }
}

/* ------------------------------------------------------------ body builders */

const when = (startsAt: Date | string | null, zone: string) => {
  if (!startsAt) return 'a date to be announced';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: zone || 'UTC',
    }).format(new Date(startsAt));
  } catch {
    return new Date(startsAt).toISOString();
  }
};

export interface EventBits {
  title: string;
  slug: string;
  city: string;
  time_zone: string;
  starts_at: Date | string | null;
}

const appUrl = () =>
  (process.env.APP_PUBLIC_URL || 'http://localhost:4173').replace(/\/+$/, '');

export function bodyConfirmed(ev: EventBits, name: string, ticket: string) {
  return [
    `Hello ${name},`,
    `You have a seat at ${ev.title}.`,
    `${when(ev.starts_at, ev.time_zone)} (${ev.time_zone}) in ${ev.city}.`,
    `Your ticket code is ${ticket}. Show it at the door.`,
    `${appUrl()}/t/${ticket}`,
  ];
}

export function bodyPending(ev: EventBits, name: string) {
  return [
    `Hello ${name},`,
    `Your request to join ${ev.title} has reached the host, who reviews every request before a seat is held.`,
    `${when(ev.starts_at, ev.time_zone)} (${ev.time_zone}) in ${ev.city}.`,
    `We will write again once the host has decided.`,
  ];
}

export function bodyApproved(ev: EventBits, name: string, ticket: string) {
  return [
    `Hello ${name},`,
    `The host has approved your request to join ${ev.title}. You have a seat.`,
    `${when(ev.starts_at, ev.time_zone)} (${ev.time_zone}) in ${ev.city}.`,
    `Your ticket code is ${ticket}. Show it at the door.`,
    `${appUrl()}/t/${ticket}`,
  ];
}

export function bodyDeclined(ev: EventBits, name: string) {
  return [
    `Hello ${name},`,
    `The host is not able to offer you a place at ${ev.title} this time.`,
    `Other events are open for registration at ${appUrl()}/discover.`,
  ];
}

export function bodyWaitlisted(ev: EventBits, name: string, position: number) {
  return [
    `Hello ${name},`,
    `${ev.title} is full, so you are on the waiting list at position ${position}.`,
    `${when(ev.starts_at, ev.time_zone)} (${ev.time_zone}) in ${ev.city}.`,
    `If a seat is freed we will confirm you automatically and send your ticket.`,
  ];
}

export function bodyPromoted(ev: EventBits, name: string, ticket: string) {
  return [
    `Hello ${name},`,
    `A spot opened up for ${ev.title} and it is yours. You are now confirmed.`,
    `${when(ev.starts_at, ev.time_zone)} (${ev.time_zone}) in ${ev.city}.`,
    `Your ticket code is ${ticket}. Show it at the door.`,
    `${appUrl()}/t/${ticket}`,
  ];
}

export function bodyEventCancelled(ev: EventBits, name: string, reason: string) {
  return [
    `Hello ${name},`,
    `${ev.title} has been cancelled by its host. It was to be held ${when(ev.starts_at, ev.time_zone)} (${ev.time_zone}) in ${ev.city}.`,
    `The host's reason, in their own words:`,
    reason,
    `Your registration has been cancelled and no seat is held.`,
  ];
}

export function bodyEventChanged(ev: EventBits, name: string, changes: string[]) {
  return [
    `Hello ${name},`,
    `The details of ${ev.title} have changed and you are holding a seat.`,
    changes.join(' '),
    `${when(ev.starts_at, ev.time_zone)} (${ev.time_zone}) in ${ev.city}.`,
    `${appUrl()}/${ev.slug}`,
  ];
}
