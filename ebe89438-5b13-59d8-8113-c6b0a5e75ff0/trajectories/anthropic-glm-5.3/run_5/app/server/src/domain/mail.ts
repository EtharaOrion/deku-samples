import { bodyFor, subjectFor, type MailTransition } from '../mailcopy.js';
import { formatInZone, zoneOffsetLabel } from '../time.js';
import { sendMail } from '../mailer.js';
import type { EventRow } from './events.js';

export type MailRecipient = {
  registrationId: string | null;
  email: string;
  displayName: string;
  ticketCode?: string | null;
  waitlistPosition?: number | null;
};

export type QueuedMail = {
  event: EventRow;
  transition: MailTransition;
  recipient: MailRecipient;
  cancelReason?: string | null;
};

/**
 * Mail is queued inside the transaction and dispatched after it commits, still
 * within the same request. Holding a row lock across an SMTP round trip would
 * serialise unrelated requests on the mail server.
 */
export function queueMail(event: EventRow, transition: MailTransition, recipient: MailRecipient, cancelReason?: string | null): QueuedMail {
  return { event, transition, recipient, cancelReason: cancelReason ?? event.cancel_reason ?? null };
}

export async function dispatchMail(queued: QueuedMail[]): Promise<void> {
  const publicUrl = (process.env.APP_PUBLIC_URL || '').replace(/\/+$/, '');
  for (const q of queued) {
    const event = q.event;
    const subject = subjectFor(q.transition, event.title);
    const startsAt = new Date(event.starts_at);
    const body = bodyFor(q.transition, {
      displayName: q.recipient.displayName,
      title: event.title,
      startsAtLabel: formatInZone(startsAt, event.time_zone),
      zoneLabel: `${event.time_zone} ${zoneOffsetLabel(startsAt, event.time_zone)}`,
      city: event.city,
      ticketCode: q.recipient.ticketCode ?? null,
      waitlistPosition: q.recipient.waitlistPosition ?? null,
      cancelReason: q.cancelReason ?? null,
      eventUrl: `${publicUrl}/event/${event.slug}`,
      ticketUrl: q.recipient.ticketCode ? `${publicUrl}/t/${q.recipient.ticketCode}` : null,
    });
    try {
      await sendMail({
        registration_id: q.recipient.registrationId,
        event_id: event.id,
        recipient: q.recipient.email,
        subject,
        body,
      });
    } catch (err) {
      console.log(
        JSON.stringify({
          level: 'warn',
          scope: 'mail',
          message: `mail send failed to ${q.recipient.email} for ${event.slug}: ${err instanceof Error ? err.message : String(err)}`,
          ts: new Date().toISOString(),
        }),
      );
    }
  }
}
