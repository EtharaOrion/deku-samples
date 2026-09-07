import nodemailer from 'nodemailer';
import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 1025);
const from = process.env.MAIL_FROM || 'ravel@example.com';

let transport = null;
function getTransport() {
  if (!transport) {
    if (!host) throw new Error('SMTP_HOST is not set');
    transport = nodemailer.createTransport({ host, port, secure: false, ignoreTLS: true });
  }
  return transport;
}

// Every mail leaves through mailpit, addressed to exactly one recipient with no copies.
export async function sendMail({ to, subject, text, kind, about, recipientName }) {
  const reference = 'NTF-' + randomUUID().slice(0, 8).toUpperCase();
  await getTransport().sendMail({ from, to, subject, text });
  await pool.query(
    `INSERT INTO notification (reference,kind,recipient,recipient_name,subject,body,about)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [reference, kind, to, recipientName || null, subject, text, about || null]
  );
  return reference;
}
