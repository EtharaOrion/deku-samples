import nodemailer from 'nodemailer';
import { env } from './env.mjs';

let cached = null;
export function mailer() {
  if (cached) return cached;
  if (!env.smtp.host) {
    cached = { send: async () => ({ skipped: true, reason: 'SMTP_HOST not set' }) };
    return cached;
  }
  const opts = { host: env.smtp.host, port: env.smtp.port, secure: false, tls: { rejectUnauthorized: false } };
  if (env.smtp.user) {
    opts.auth = { user: env.smtp.user, pass: env.smtp.pass };
  }
  cached = nodemailer.createTransport(opts);
  return cached;
}

export async function sendOrderConfirmation({ to, orderNumber, lines, totalMinor, currency }) {
  const t = mailer();
  const bodyLines = lines
    .map((l) => `${l.title} x ${l.quantity} - ${l.lineTotal}`)
    .join('\n');
  const body = [
    `Order ${orderNumber} is confirmed.`,
    '',
    bodyLines,
    '',
    `Total ${totalMinor} ${currency}`,
    '',
    'The Vela team.',
  ].join('\n');
  const info = await t.sendMail({
    from: '"Vela" <orders@vela.example>',
    to: [to],
    subject: `Order confirmed: ${orderNumber}`,
    text: body,
  });
  return info;
}
