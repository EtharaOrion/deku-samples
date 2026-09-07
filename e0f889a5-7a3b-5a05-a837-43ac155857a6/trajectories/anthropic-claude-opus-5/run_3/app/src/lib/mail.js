import nodemailer from 'nodemailer';
import { formatMoney } from './money.js';

// Mail goes over real SMTP. Host, port and credentials come from the
// environment; a body written to a log instead of sent is not mail.
let transport;
function getTransport() {
  if (!transport) {
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
      // Authenticate with SMTP_USER and SMTP_PASS where they are set.
      ...(user ? { auth: { user, pass: pass || '' } } : {}),
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

const FROM = process.env.MAIL_FROM || 'Vela Electronics <orders@vela.example>';

/**
 * A confirmed order sends exactly one mail to the order's email only, with no
 * cc and no bcc. The subject is `Order confirmed: ` then the order number.
 */
export async function sendOrderConfirmation(order, lines) {
  const subject = `Order confirmed: ${order.number}`;
  const lineText = lines
    .map((l) => `  ${l.title_snapshot} x${l.quantity}  ${formatMoney(l.total_minor)}`)
    .join('\n');
  const text = [
    `Your order is confirmed.`,
    ``,
    `Order ${order.number}`,
    ``,
    lineText,
    ``,
    `Subtotal: ${formatMoney(order.subtotal_minor)}`,
    `Delivery (${order.shipping_method}): ${formatMoney(order.shipping_minor)}`,
    `Tax: ${formatMoney(order.tax_minor)}`,
    `Total: ${formatMoney(order.total_minor)}`,
    ``,
    `We will send the serial numbers when it ships.`,
    ``,
    `The Vela team.`,
  ].join('\n');

  const rows = lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.title_snapshot)}</td><td align="right">${l.quantity}</td><td align="right">${formatMoney(l.total_minor)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif">
<p>Your order is confirmed.</p>
<p>Order <strong>${escapeHtml(order.number)}</strong></p>
<table cellpadding="6" style="border-collapse:collapse">${rows}</table>
<p>Subtotal: ${formatMoney(order.subtotal_minor)}<br>
Delivery (${escapeHtml(order.shipping_method)}): ${formatMoney(order.shipping_minor)}<br>
Tax: ${formatMoney(order.tax_minor)}<br>
<strong>Total: ${formatMoney(order.total_minor)}</strong></p>
<p>The Vela team.</p>
</body></html>`;

  const info = await getTransport().sendMail({
    from: FROM,
    to: order.email, // the order's email only, no cc and no bcc
    subject,
    text,
    html,
  });
  return info;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
