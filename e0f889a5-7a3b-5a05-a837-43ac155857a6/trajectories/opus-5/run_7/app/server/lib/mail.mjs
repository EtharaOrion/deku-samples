// Mail goes over real SMTP. A body written to a log instead of sent is a contract
// violation, so this module only ever reports what the SMTP server accepted.
import nodemailer from 'nodemailer';
import { formatMinor } from './money.mjs';

let transport = null;

function getTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!host) throw new Error('SMTP_HOST is required');
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
    // Authenticate only where credentials are actually set.
    auth: user || pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transport;
}

const MAIL_FROM = process.env.MAIL_FROM || 'Vela <orders@vela.example>';

/**
 * Exactly one mail per confirmed order, to the order's email only, no cc, no bcc.
 * Subject is `Order confirmed: ` then the order number.
 */
export async function sendOrderConfirmation(order, lines) {
  const subject = `Order confirmed: ${order.number}`;
  const lineText = lines
    .map((l) => `  ${l.title_snapshot} x${l.quantity}  ${formatMinor(l.total_minor)}`)
    .join('\n');

  const text = [
    `Your order ${order.number} is confirmed.`,
    '',
    'What you bought:',
    lineText,
    '',
    `Subtotal: ${formatMinor(order.subtotal_minor)}`,
    `Delivery (${order.shipping_method}): ${formatMinor(order.shipping_minor)}`,
    `Tax: ${formatMinor(order.tax_minor)}`,
    `Total: ${formatMinor(order.total_minor)}`,
    '',
    'We will send tracking when it ships.',
    '',
    'The Vela team.',
  ].join('\n');

  const rows = lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.title_snapshot)}</td><td>${l.quantity}</td>` +
        `<td style="font-variant-numeric:tabular-nums">${formatMinor(l.total_minor)}</td></tr>`,
    )
    .join('');

  const html = [
    `<p>Your order <strong>${escapeHtml(order.number)}</strong> is confirmed.</p>`,
    '<table cellpadding="6"><thead><tr><th align="left">Item</th><th align="left">Qty</th>',
    '<th align="left">Total</th></tr></thead><tbody>',
    rows,
    '</tbody></table>',
    `<p>Subtotal: ${formatMinor(order.subtotal_minor)}<br>`,
    `Delivery (${escapeHtml(order.shipping_method)}): ${formatMinor(order.shipping_minor)}<br>`,
    `Tax: ${formatMinor(order.tax_minor)}<br>`,
    `<strong>Total: ${formatMinor(order.total_minor)}</strong></p>`,
    '<p>The Vela team.</p>',
  ].join('');

  const info = await getTransport().sendMail({
    from: MAIL_FROM,
    to: order.email, // the order's email only
    subject,
    text,
    html,
  });
  return { messageId: info.messageId, accepted: info.accepted };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}
