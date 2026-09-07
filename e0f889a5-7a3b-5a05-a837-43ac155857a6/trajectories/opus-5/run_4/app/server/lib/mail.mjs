import nodemailer from 'nodemailer';
import { formatMinor } from './money.mjs';
import { log } from './log.mjs';

function transport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!host) throw new Error('SMTP_HOST is not set');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    // Mailpit accepts plain SMTP; authenticate only where credentials are set.
    ...(user ? { auth: { user, pass } } : {}),
    tls: { rejectUnauthorized: false },
  });
}

const MAIL_FROM = process.env.MAIL_FROM || 'Vela <orders@vela.example.com>';

/**
 * Exactly one mail, to the order's email only, with no cc and no bcc.
 * Subject is "Order confirmed: " then the order number.
 */
export async function sendOrderConfirmation({ order, lines, requestId }) {
  const subject = `Order confirmed: ${order.number}`;

  const lineText = lines
    .map((l) => `  ${l.title_snapshot}${l.option_snapshot ? ` (${l.option_snapshot})` : ''} × ${l.quantity}   ${formatMinor(l.total_minor)}`)
    .join('\n');

  const text = [
    `Your order ${order.number} is confirmed.`,
    '',
    'What you bought:',
    lineText,
    '',
    `Subtotal: ${formatMinor(order.subtotal_minor)}`,
    `Delivery: ${formatMinor(order.shipping_minor)}`,
    `Tax: ${formatMinor(order.tax_minor)}`,
    `Total: ${formatMinor(order.total_minor)}`,
    '',
    'We will send another note when it ships.',
    'The Vela team.',
  ].join('\n');

  const rows = lines
    .map((l) => `<tr><td>${escapeHtml(l.title_snapshot)}${l.option_snapshot ? ` (${escapeHtml(l.option_snapshot)})` : ''}</td>`
      + `<td align="right">${l.quantity}</td>`
      + `<td align="right">${formatMinor(l.total_minor)}</td></tr>`)
    .join('');

  const html = `<!doctype html><html><body>
<p>Your order <strong>${escapeHtml(order.number)}</strong> is confirmed.</p>
<table cellpadding="6" cellspacing="0" border="0">
<thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Total</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot>
<tr><td colspan="2" align="right">Subtotal</td><td align="right">${formatMinor(order.subtotal_minor)}</td></tr>
<tr><td colspan="2" align="right">Delivery</td><td align="right">${formatMinor(order.shipping_minor)}</td></tr>
<tr><td colspan="2" align="right">Tax</td><td align="right">${formatMinor(order.tax_minor)}</td></tr>
<tr><td colspan="2" align="right"><strong>Total</strong></td><td align="right"><strong>${formatMinor(order.total_minor)}</strong></td></tr>
</tfoot></table>
<p>We will send another note when it ships.<br>The Vela team.</p>
</body></html>`;

  const info = await transport().sendMail({
    from: MAIL_FROM,
    to: order.email,
    subject,
    text,
    html,
  });

  log({ level: 'info', msg: 'mail.sent', request_id: requestId, to: order.email, subject, message_id: info.messageId });
  return info;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
