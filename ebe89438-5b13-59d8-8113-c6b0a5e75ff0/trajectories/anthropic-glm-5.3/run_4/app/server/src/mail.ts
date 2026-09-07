import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from './config.js';
import { log } from './util.js';
import { MAIL_SUBJECTS } from './constants.js';
import { query, type Client, type EventRow, type Registration } from './db.js';

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: false,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

export type MailKind = keyof typeof MAIL_SUBJECTS | 'updated';

export type MailContext = {
  event: EventRow;
  registration?: Registration;
  recipient: { email: string; display_name: string };
  extra?: Record<string, string>;
};

function renderBody(kind: MailKind, ctx: MailContext): string {
  const { event, recipient, registration } = ctx;
  const when = `${event.starts_at.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
  const place = `${event.city}`;
  const code = registration?.ticket_code;
  const pos = registration?.waitlist_position;
  const reason = ctx.extra?.reason ?? event.cancel_reason ?? undefined;
  const lines: string[] = [];
  const hi = `Hi ${recipient.display_name},`;
  switch (kind) {
    case 'confirmed':
      lines.push(hi, '', `You're going to ${event.title}.`, '', `When: ${when}`, `Where: ${place}`);
      if (code) lines.push('', `Your ticket code: ${code}`, `Show it at ${config.publicUrl || ''}/t/${code}`);
      lines.push('', 'See you there.');
      break;
    case 'pending':
      lines.push(hi, '', `Your request to join ${event.title} is with the host for review.`, '', `When: ${when}`, `Where: ${place}`, '', 'You will hear from us as soon as the host decides.');
      break;
    case 'approved':
      lines.push(hi, '', `You're in: ${event.title}.`, '', `When: ${when}`, `Where: ${place}`);
      if (code) lines.push('', `Your ticket code: ${code}`, `Show it at ${config.publicUrl || ''}/t/${code}`);
      lines.push('', 'See you there.');
      break;
    case 'declined':
      lines.push(hi, '', `About your request to join ${event.title}: the host could not take it this time.`, '', 'You can browse other gatherings at any time.');
      break;
    case 'waitlisted':
      lines.push(hi, '', `${event.title} just filled up, and you are on the waiting list.`);
      if (pos) lines.push('', `You are number ${pos} on the waiting list.`);
      lines.push('', 'If a place opens up you will be confirmed automatically and mailed straight away.');
      break;
    case 'promoted':
      lines.push(hi, '', `A spot opened up for ${event.title}, and it is yours.`);
      if (code) lines.push('', `Your ticket code: ${code}`, `Show it at ${config.publicUrl || ''}/t/${code}`);
      lines.push('', `When: ${when}`, `Where: ${place}`, '', 'See you there.');
      break;
    case 'updated':
      lines.push(hi, '', `${event.title} has new details.`, '', `When: ${when}`, `Where: ${place}`, '', 'Check the event page for the latest information.');
      break;
    case 'cancelled':
      lines.push(hi, '', `${event.title} has been cancelled by the host.`);
      if (reason) lines.push('', 'The host wrote:', `"${reason}"`);
      lines.push('', 'No action is needed from you.');
      break;
  }
  return lines.join('\n');
}

/** Send one transition mail synchronously and log it after the SMTP send returns. */
const EXTRA_SUBJECTS: Record<string, (t: string) => string> = {
  updated: (t) => `${t} has new details`,
};

export async function sendTransitionMail(
  client: Client,
  kind: MailKind,
  ctx: MailContext,
): Promise<void> {
  const subject = (MAIL_SUBJECTS[kind as keyof typeof MAIL_SUBJECTS] ?? EXTRA_SUBJECTS[kind])(ctx.event.title);
  const text = renderBody(kind, ctx);
  const to = ctx.recipient.email;
  await getTransport().sendMail({
    from: 'Gatherline <no-reply@gatherline.test>',
    to,
    subject,
    text,
  });
  await query(client,
    `insert into email_log (registration_id, event_id, recipient, subject) values ($1, $2, $3, $4)`,
    [ctx.registration?.id ?? null, ctx.event.id, to, subject]);
  log({ level: 'info', msg: 'mail sent', kind, to, subject });
}

export async function verifySmtp(): Promise<void> {
  try {
    await getTransport().verify();
    log({ level: 'info', msg: 'smtp ready', host: config.smtp.host, port: config.smtp.port });
  } catch (err) {
    log({ level: 'warn', msg: 'smtp not ready yet', error: String(err) });
  }
}
