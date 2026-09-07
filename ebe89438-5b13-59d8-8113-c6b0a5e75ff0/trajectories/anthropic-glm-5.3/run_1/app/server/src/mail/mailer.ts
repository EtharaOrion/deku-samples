import nodemailer from 'nodemailer';
import { db } from '../db/client.js';
import { id } from '../lib/util.js';

const host = process.env.SMTP_HOST || '';
const port = Number(process.env.SMTP_PORT || 1025);

export const transporter = nodemailer.createTransport({
  host,
  port,
  secure: false,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
});

export interface MailPayload {
  to: string;
  subject: string;
  text: string;
  registrationId?: string | null;
  eventId?: string | null;
}

/**
 * Sends over real SMTP, synchronously from the causing request, and logs a row
 * only once the SMTP send has returned.
 */
export async function sendMail(p: MailPayload): Promise<void> {
  const from = process.env.SMTP_FROM || 'Deku <no-reply@deku.events>';
  await transporter.sendMail({
    from,
    to: p.to,
    subject: p.subject,
    text: p.text,
  });
  await db.query(
    `INSERT INTO email_log (id, registration_id, event_id, recipient, subject, sent_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [id(), p.registrationId ?? null, p.eventId ?? null, p.to, p.subject]
  );
}

export function confirmationMail(event: { title: string; slug: string; city: string; time_zone: string; starts_at: string; ticket_code: string }) {
  return {
    subject: `You're going to ${event.title}`,
    text: [
      `Your seat at ${event.title} is confirmed.`,
      ``,
      `Ticket code: ${event.ticket_code}`,
      `When: ${event.starts_at} (${event.time_zone})`,
      `Where: ${event.city}`,
      ``,
      `Show this ticket code at the door: /t/${event.ticket_code}`,
    ].join('\n'),
  };
}

export function waitlistMail(event: { title: string }, position: number) {
  return {
    subject: `You're on the waiting list for ${event.title}`,
    text: `You are number ${position} on the waiting list for ${event.title}. If a seat opens up, we will confirm you straight away.`,
  };
}

export function pendingMail(event: { title: string }) {
  return {
    subject: `Your request to join ${event.title}`,
    text: `The host of ${event.title} has your request and will decide shortly. You hold no seat until they approve.`,
  };
}

export function approvedMail(event: { title: string; ticket_code: string }) {
  return {
    subject: `You're in: ${event.title}`,
    text: `The host approved your request. Your ticket code is ${event.ticket_code}. See you at ${event.title}.`,
  };
}

export function declinedMail(event: { title: string }) {
  return {
    subject: `About your request to join ${event.title}`,
    text: `The host of ${event.title} could not take your request this time.`,
  };
}

export function promotedMail(event: { title: string; ticket_code: string }) {
  return {
    subject: `A spot opened up for ${event.title}`,
    text: `A seat opened up at ${event.title} and it is yours. Your ticket code is ${event.ticket_code}.`,
  };
}

export function eventCancelledMail(event: { title: string; cancel_reason: string }) {
  return {
    subject: `${event.title} has been cancelled`,
    text: [
      `${event.title} has been cancelled by the host.`,
      ``,
      `The host's words:`,
      `${event.cancel_reason}`,
    ].join('\n'),
  };
}

export function rescheduleMail(event: { title: string; starts_at: string; time_zone: string; city: string }) {
  return {
    subject: `Details changed for ${event.title}`,
    text: `The details of ${event.title} changed. It now starts ${event.starts_at} (${event.time_zone}) in ${event.city}.`,
  };
}
