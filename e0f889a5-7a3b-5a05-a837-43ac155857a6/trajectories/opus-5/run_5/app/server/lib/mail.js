import nodemailer from 'nodemailer';
import { formatMinor } from './money.js';
import { log } from './log.js';

// Real SMTP, read from the environment. A mail body written to a log is not a mail.
let transport = null;
function tx() {
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
    tls: { rejectUnauthorized: false },
  });
  return transport;
}

export const MAIL_FROM = () => process.env.MAIL_FROM || 'orders@vela.example.com';

/**
 * Exactly one mail to the order's email only. No cc and no bcc.
 * Subject is `Order confirmed: ` then the order number.
 */
export async function sendOrderConfirmation({ order, lines, requestId }) {
  const subject = `Order confirmed: ${order.number}`;
  const lineText = lines
    .map((l) => `  ${l.title_snapshot} x${l.quantity}  ${formatMinor(l.total_minor)}`)
    .join('\n');

  const text = [
    `Your order is confirmed.`,
    ``,
    `Order ${order.number}`,
    ``,
    lineText,
    ``,
    `Subtotal  ${formatMinor(order.subtotal_minor)}`,
    `Delivery  ${formatMinor(order.shipping_minor)} (${order.shipping_method})`,
    `Tax       ${formatMinor(order.tax_minor)}`,
    `Total     ${formatMinor(order.total_minor)}`,
    ``,
    `We will send the tracking details when it ships.`,
    ``,
    `The Vela team.`,
  ].join('\n');

  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(l.title_snapshot)}</td>` +
        `<td style="padding:4px 12px 4px 0;font-variant-numeric:tabular-nums">${l.quantity}</td>` +
        `<td style="padding:4px 0;font-variant-numeric:tabular-nums">${formatMinor(l.total_minor)}</td></tr>`,
    )
    .join('');

  const html = `<div style="font-family:system-ui,sans-serif;color:#14110f">
<p>Your order is confirmed.</p>
<p>Order <strong>${escapeHtml(order.number)}</strong></p>
<table style="border-collapse:collapse">${rows}</table>
<p style="font-variant-numeric:tabular-nums">
Subtotal ${formatMinor(order.subtotal_minor)}<br>
Delivery ${formatMinor(order.shipping_minor)} (${escapeHtml(order.shipping_method)})<br>
Tax ${formatMinor(order.tax_minor)}<br>
<strong>Total ${formatMinor(order.total_minor)}</strong></p>
<p>We will send the tracking details when it ships.</p>
<p>The Vela team.</p></div>`;

  const info = await tx().sendMail({
    from: MAIL_FROM(),
    to: order.email,
    subject,
    text,
    html,
  });
  log({ level: 'info', msg: 'order confirmation sent', request_id: requestId, order: order.number, to: order.email, message_id: info.messageId });
  return info;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
