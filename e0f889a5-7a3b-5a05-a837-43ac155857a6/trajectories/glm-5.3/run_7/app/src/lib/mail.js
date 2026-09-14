// Confirmation mail over real SMTP to Mailpit. Only confirmed orders send mail.
import nodemailer from 'nodemailer';
import { minorToDecimalString } from './money.js';

let cached = null;

function transporter() {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT || 25);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
  });
  return cached;
}

export async function sendOrderConfirmedMail({ to, orderNumber, lines, totalMinor, currency }) {
  const from = process.env.MAIL_FROM || 'orders@vela.example';
  // Money is an integer count of minor units in every layer; formatting is
  // integer arithmetic, never floating point.
  const fmt = (minor) => `$${minorToDecimalString(minor)}`;
  const linesText = lines
    .map((l) => `${l.title_snapshot} x ${l.quantity} — ${fmt(Number(l.total_minor))}`)
    .join('\n');
  const text = [
    `Order ${orderNumber} is confirmed.`,
    '',
    linesText,
    '',
    `Total ${fmt(Number(totalMinor))} ${currency}.`,
  ].join('\n');

  const html = [
    `<p>Order ${orderNumber} is confirmed.</p>`,
    '<ul>',
    ...lines.map(
      (l) => `<li>${escapeHtml(l.title_snapshot)} &times; ${l.quantity} — ${fmt(Number(l.total_minor))}</li>`
    ),
    '</ul>',
    `<p>Total ${fmt(Number(totalMinor))} ${escapeHtml(currency)}.</p>`,
  ].join('\n');

  const info = await transporter().sendMail({
    from,
    to,
    subject: `Order confirmed: ${orderNumber}`,
    text,
    html,
  });
  return { messageId: info.messageId, to };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
