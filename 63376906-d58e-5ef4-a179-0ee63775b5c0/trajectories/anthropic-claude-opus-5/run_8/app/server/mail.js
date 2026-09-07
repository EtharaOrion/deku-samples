import nodemailer from 'nodemailer';
import { query } from './db.js';
import { randomUUID } from 'node:crypto';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 1025);

const transport = nodemailer.createTransport({
  host,
  port,
  secure: false,
  tls: { rejectUnauthorized: false },
});

// Four acts send mail and nothing else does. One recipient, no copies.
export async function sendMail({ to, subject, text, act, object_reference }) {
  if (!host) throw new Error('SMTP_HOST is not set');
  const reference = `MAIL-${randomUUID().slice(0, 8).toUpperCase()}`;
  await transport.sendMail({
    from: 'Ravel Materials SAS <no-reply@ravel.example.com>',
    to,
    subject,
    text,
  });
  await query(
    'insert into mail_log (reference, recipient, subject, body, act, object_reference) values ($1,$2,$3,$4,$5,$6)',
    [reference, to, subject, text, act, object_reference || null],
  );
  return { reference, recipient: to, subject };
}
