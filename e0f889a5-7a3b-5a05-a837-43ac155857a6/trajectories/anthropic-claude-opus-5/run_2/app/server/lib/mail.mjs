import nodemailer from 'nodemailer';
import { formatMoney } from './money.mjs';

let transport = null;

function transporter() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 1025);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
    // Authenticate only where the credentials are actually set.
    ...(user ? { auth: { user, pass: pass || '' } } : {}),
  });
  return transport;
}

/**
 * A confirmed order sends exactly one mail to the order's email only, no cc and
 * no bcc. Nothing else in the product sends mail.
 */
export async function sendOrderConfirmation(order) {
  const subject = `Order confirmed: ${order.number}`;
  const lines = order.lines.map(
    (l) => `${l.title_snapshot}  x${l.quantity}  ${formatMoney(l.total_minor, order.currency)}`,
  );
  const text = [
    `Thank you. Order ${order.number} is confirmed.`,
    '',
    ...lines,
    '',
    `Subtotal: ${formatMoney(order.subtotal_minor, order.currency)}`,
    `Delivery: ${formatMoney(order.shipping_minor, order.currency)}`,
    `Tax: ${formatMoney(order.tax_minor, order.currency)}`,
    `Total: ${formatMoney(order.total_minor, order.currency)}`,
    '',
    'We will send another note when it ships.',
    'The Vela team.',
  ].join('\n');

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1a1a19">
<p>Thank you. Order <strong>${order.number}</strong> is confirmed.</p>
<table cellpadding="6" style="border-collapse:collapse;font-variant-numeric:tabular-nums">
<tbody>
${order.lines.map((l) => `<tr><td>${escapeHtml(l.title_snapshot)}</td><td>x${l.quantity}</td><td align="right">${formatMoney(l.total_minor, order.currency)}</td></tr>`).join('\n')}
<tr><td colspan="2">Subtotal</td><td align="right">${formatMoney(order.subtotal_minor, order.currency)}</td></tr>
<tr><td colspan="2">Delivery</td><td align="right">${formatMoney(order.shipping_minor, order.currency)}</td></tr>
<tr><td colspan="2">Tax</td><td align="right">${formatMoney(order.tax_minor, order.currency)}</td></tr>
<tr><td colspan="2"><strong>Total</strong></td><td align="right"><strong>${formatMoney(order.total_minor, order.currency)}</strong></td></tr>
</tbody></table>
<p>We will send another note when it ships.<br>The Vela team.</p>
</body></html>`;

  const from = process.env.MAIL_FROM || 'Vela <orders@vela.example>';
  await transporter().sendMail({ from, to: order.email, subject, text, html });
  return { subject, to: order.email };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
