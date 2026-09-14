import nodemailer from 'nodemailer';
import { env } from '../env.js';
import { formatUsd } from './money.js';
import { logEvent, logError } from './log.js';

let cached = null;
function transport() {
  if (!cached) {
    const s = env.smtp;
    cached = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: false,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }
  return cached;
}

// Exactly one mail to the order's email only, no cc and no bcc.
export async function sendOrderConfirmation({ to, orderNumber, lines, totalMinor }) {
  const bodyLines = lines.map(
    (l) => `${l.title_snapshot} x ${l.quantity} ${formatUsd(l.total_minor)}`
  );
  const text = [
    `Order ${orderNumber} is confirmed.`,
    '',
    ...bodyLines,
    '',
    `Total ${formatUsd(totalMinor)}`,
    '',
    'Vela'
  ].join('\n');

  const html = [
    '<p>', `Order ${orderNumber} is confirmed.`, '</p>',
    '<ul>',
    ...lines.map((l) => `<li>${escapeHtml(l.title_snapshot)} &times; ${l.quantity} ${escapeHtml(formatUsd(l.total_minor))}</li>`),
    '</ul>',
    '<p>', `Total ${escapeHtml(formatUsd(totalMinor))}`, '</p>',
    '<p>Vela</p>'
  ].join('');

  const info = await transport().sendMail({
    from: process.env.MAIL_FROM || 'orders@vela.example',
    to,
    subject: `Order confirmed: ${orderNumber}`,
    text,
    html
  });
  logEvent('mail.order_confirmation_sent', { to, order_number: orderNumber, message_id: info.messageId });
  return info;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
