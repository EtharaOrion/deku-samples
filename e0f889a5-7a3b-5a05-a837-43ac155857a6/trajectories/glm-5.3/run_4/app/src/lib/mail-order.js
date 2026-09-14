import { sendMail } from './mail.js';
import { dollars } from './money.js';

/**
 * Exactly one mail to the order email only. No cc, no bcc.
 * Subject: "Order confirmed: <number>". Body names each line and the total.
 */
export async function sendOrderConfirmationMail({ order, lines }) {
  const lineText = lines
    .map((l) => `- ${l.product_title}${l.option_value ? ` (${l.option_value})` : ''} x${l.quantity}`)
    .join('\n');

  const text = [
    `Order confirmed: ${order.number}`,
    '',
    'Thank you. Your order is confirmed.',
    '',
    lineText,
    '',
    `Subtotal ${dollars(order.subtotal_minor)}`,
    `Shipping ${dollars(order.shipping_minor)}`,
    `Tax ${dollars(order.tax_minor)}`,
    `Total ${dollars(order.total_minor)}`,
    '',
    'The Vela team.',
  ].join('\n');

  const html = [
    '<div style="font-family:system-ui,sans-serif">',
    `<p>Thank you. Your order is confirmed.</p>`,
    '<ul>',
    ...lines.map(
      (l) => `<li>${escapeHtml(l.product_title)}${l.option_value ? ` (${escapeHtml(l.option_value)})` : ''} &times;${l.quantity}</li>`
    ),
    '</ul>',
    `<p>Subtotal ${dollars(order.subtotal_minor)}<br>Shipping ${dollars(order.shipping_minor)}<br>Tax ${dollars(order.tax_minor)}<br><strong>Total ${dollars(order.total_minor)}</strong></p>`,
    '<p>The Vela team.</p>',
    '</div>',
  ].join('');

  return sendMail({
    to: order.email,
    subject: `Order confirmed: ${order.number}`,
    text,
    html,
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
