import type { Pool, PoolClient } from 'pg';
import type { Mailer } from './mailer.js';
import { newId, utcNowRfc3339 } from './util.js';

export type MailJob = { to: string; subject: string; body: string; event_id: string | null; registration_id: string | null };

export function fmtDay(instant: string, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: zone }).format(new Date(instant));
  } catch { return instant; }
}
export function fmtTime(instant: string, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date(instant));
  } catch { return instant; }
}

export function confirmedSubject(title: string) { return `You're going to ${title}`; }
export function pendingSubject(title: string) { return `Your request to join ${title}`; }
export function approvedSubject(title: string) { return `You're in: ${title}`; }
export function declinedSubject(title: string) { return `About your request to join ${title}`; }
export function waitlistedSubject(title: string) { return `You're on the waiting list for ${title}`; }
export function seatSubject(title: string) { return `A spot opened up for ${title}`; }
export function cancelledSubject(title: string) { return `${title} has been cancelled`; }

export function queue(
  jobs: MailJob[],
  to: string,
  subject: string,
  body: string,
  event_id: string | null,
  registration_id: string | null,
) {
  jobs.push({ to, subject, body, event_id, registration_id });
}

export function eventBody(title: string, instant: string, zone: string, city: string, extra: string): string {
  return (
    `${title}\n` +
    `${fmtDay(instant, zone)} at ${fmtTime(instant, zone)} (${zone})\n` +
    `${city}\n` +
    extra
  );
}

/** Send every queued mail over SMTP and log each one only after the send returned. */
export async function flushMail(pg: Pool | PoolClient, mailer: Mailer, jobs: MailJob[]): Promise<void> {
  const c = pg as any;
  for (const j of jobs) {
    await mailer(j.to, j.subject, j.body);
    await c.query(
      'INSERT INTO email_log (id, registration_id, event_id, recipient, subject, sent_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [newId('eml'), j.registration_id, j.event_id, j.to, j.subject, utcNowRfc3339()],
    );
  }
}

export const SENT_AT_NOW = () => utcNowRfc3339();
