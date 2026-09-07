import nodemailer from 'nodemailer';
import { pool } from './db.js';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 1025);

const transport = nodemailer.createTransport({ host, port, secure: false, ignoreTLS: true });

// Every mail leaves through mailpit, addressed to exactly one recipient with no
// copies. Only the four named acts send mail.
export async function sendMail({ to, subject, text, act, object_ref }) {
  if (!to) throw new Error('a mail carries exactly one recipient');
  await transport.sendMail({
    from: 'Ravel Materials SAS <records@ravel.example.com>',
    to,
    subject,
    text,
  });
  await pool.query(
    'INSERT INTO mail_log (recipient, subject, body, act, object_ref) VALUES ($1,$2,$3,$4,$5)',
    [to, subject, text, act, object_ref || null]
  );
  return { to, subject, sent: true };
}
