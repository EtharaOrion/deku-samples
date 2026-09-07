import nodemailer from 'nodemailer';
import { formatMinor } from '../lib/money.js';
import { info } from '../lib/log.js';

let transport = null;

function getTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!host) throw new Error('SMTP_HOST is not set');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
    // Authenticate only where the credentials are actually set.
    auth: user ? { user, pass: pass || '' } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return transport;
}

const FROM = process.env.MAIL_FROM || 'Vela <orders@vela.example.com>';

// Exactly one mail, to the order's email only, no cc and no bcc.
export async function sendOrderConfirmation(order) {
  const subject = `Order confirmed: ${order.number}`;
  const lines = order.lines
    .map((l) => `  ${l.title_snapshot} (${l.option_snapshot || l.sku_snapshot}) x${l.quantity}   ${formatMinor(l.total_minor)}`)
    .join('\n');

  const text = [
    `Order ${order.number} is confirmed.`,
    '',
    'What you bought:',
    lines,
    '',
    `Subtotal    ${formatMinor(order.subtotal_minor)}`,
    `Delivery    ${formatMinor(order.shipping_minor)}`,
    `Tax         ${formatMinor(order.tax_minor)}`,
    `Total       ${formatMinor(order.total_minor)}`,
    '',
    `Delivery method: ${order.shipping_method_label || order.shipping_method}`,
    '',
    'We will write again when it ships.',
    '',
    'The Vela team.',
  ].join('\n');

  const rows = order.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.title_snapshot)}</td><td>${escapeHtml(l.option_snapshot || l.sku_snapshot)}</td><td>${l.quantity}</td><td>${formatMinor(l.total_minor)}</td></tr>`,
    )
    .join('');

  const html = `<div><p>Order ${escapeHtml(order.number)} is confirmed.</p>
<table><thead><tr><th>Item</th><th>Option</th><th>Quantity</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<p>Subtotal ${formatMinor(order.subtotal_minor)}<br>Delivery ${formatMinor(order.shipping_minor)}<br>Tax ${formatMinor(order.tax_minor)}<br>Total ${formatMinor(order.total_minor)}</p>
<p>We will write again when it ships.</p><p>The Vela team.</p></div>`;

  const result = await getTransport().sendMail({
    from: FROM,
    to: order.email,
    subject,
    text,
    html,
  });

  info('order_mail_sent', { order: order.number, to: order.email, message_id: result.messageId });
  return result;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
