import nodemailer from 'nodemailer';
import { formatMinor } from './money.js';
import { logLine } from './log.js';

let transport = null;

function getTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!host) throw new Error('SMTP_HOST is not set');
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transport;
}

const FROM = process.env.MAIL_FROM || 'Vela <orders@vela.example>';

// Exactly one mail to the order's email only. No cc, no bcc.
export async function sendOrderConfirmation(order) {
  const subject = `Order confirmed: ${order.number}`;
  const lines = order.lines
    .map((l) => `  ${l.title_snapshot}  x${l.quantity}  ${formatMinor(l.total_minor)}`)
    .join('\n');

  const text = [
    `Your order ${order.number} is confirmed.`,
    '',
    'What you bought:',
    lines,
    '',
    `Subtotal: ${formatMinor(order.subtotal_minor)}`,
    `Delivery: ${formatMinor(order.shipping_minor)}`,
    `Tax: ${formatMinor(order.tax_minor)}`,
    `Total: ${formatMinor(order.total_minor)}`,
    '',
    'We will write again when it ships.',
    '',
    'The Vela team.',
  ].join('\n');

  const rows = order.lines
    .map((l) => `<tr><td>${esc(l.title_snapshot)}</td><td>${l.quantity}</td><td>${formatMinor(l.total_minor)}</td></tr>`)
    .join('');

  const html = `<!doctype html><html><body>
<p>Your order ${esc(order.number)} is confirmed.</p>
<table><thead><tr><th>Item</th><th>Quantity</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<p>Subtotal: ${formatMinor(order.subtotal_minor)}<br>
Delivery: ${formatMinor(order.shipping_minor)}<br>
Tax: ${formatMinor(order.tax_minor)}<br>
Total: ${formatMinor(order.total_minor)}</p>
<p>We will write again when it ships.</p>
<p>The Vela team.</p>
</body></html>`;

  const info = await getTransport().sendMail({
    from: FROM,
    to: order.email,
    subject,
    text,
    html,
  });
  logLine({ level: 'info', msg: 'order confirmation sent', order: order.number, to: order.email, message_id: info.messageId });
  return info;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
