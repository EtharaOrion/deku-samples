import nodemailer from 'nodemailer';
import { log } from './log.js';
import { formatMinor } from './money.js';

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
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15_000,
  });
  return transport;
}

export async function sendOrderConfirmation(order, lines, requestId) {
  const subject = `Order confirmed: ${order.number}`;
  const body = [
    `Your order is confirmed.`,
    ``,
    `Order ${order.number}`,
    ``,
    ...lines.map((l) => `${l.title_snapshot} x${l.quantity}  ${formatMinor(l.total_minor)}`),
    ``,
    `Subtotal ${formatMinor(order.subtotal_minor)}`,
    `Delivery ${formatMinor(order.shipping_minor)}`,
    `Tax ${formatMinor(order.tax_minor)}`,
    `Total ${formatMinor(order.total_minor)}`,
    ``,
    `We will write again when it ships.`,
    ``,
    `The Vela team.`,
  ].join('\n');

  const info = await getTransport().sendMail({
    from: process.env.MAIL_FROM || 'orders@vela.example.com',
    to: order.email,
    subject,
    text: body,
  });
  log({ level: 'info', request_id: requestId, msg: 'order confirmation sent', order: order.number, message_id: info.messageId });
  return info;
}
