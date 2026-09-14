import nodemailer from 'nodemailer';
import { env } from './env.js';
import { minorToDecimalString } from './util.js';

let transporter = null;
export function mailer() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    const opts = { host: env.smtp.host, port: env.smtp.port, secure: env.smtp.port === 465, pool: true };
    if (env.smtp.user || env.smtp.pass) opts.auth = { user: env.smtp.user, pass: env.smtp.pass };
    transporter = nodemailer.createTransport(opts);
  }
  return transporter;
}

export async function sendOrderConfirmed({ to, number, lines, totalMinor, currency }) {
  const t = mailer();
  if (!t) throw new Error('SMTP is not configured');
  const lineList = lines.map((l) => `${l.title_snapshot} × ${l.quantity} — ${minorToDecimalString(l.unit_price_minor)} ${currency}`).join('\n');
  const text = [
    `Order confirmed: ${number}`,
    '',
    lineList,
    '',
    `Total ${minorToDecimalString(totalMinor)} ${currency}`,
    '',
    'Thank you.',
    'The Vela team.'
  ].join('\n');
  const mail = {
    from: 'Vela <orders@vela.example>',
    to,
    subject: `Order confirmed: ${number}`,
    text
  };
  const info = await t.sendMail(mail);
  return { messageId: info.messageId, to, cc: mail.cc || null, bcc: mail.bcc || null };
}
