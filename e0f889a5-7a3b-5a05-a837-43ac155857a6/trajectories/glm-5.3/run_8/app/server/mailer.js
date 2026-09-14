import nodemailer from 'nodemailer';
import { env } from './env.js';
import { minorToDecimal } from './util.js';

let transport = null;
function getTransport() {
  if (!transport) {
    const opts = { host: env.smtp.host, port: env.smtp.port, secure: env.smtp.port === 465, tls: { rejectUnauthorized: false } };
    if (env.smtp.user) {
      opts.auth = { user: env.smtp.user, pass: env.smtp.pass };
    }
    transport = nodemailer.createTransport(opts);
  }
  return transport;
}

export async function sendOrderConfirmation({ to, number, lines, totalMinor, url }) {
  const items = lines
    .map((l) => `  ${l.title_snapshot}${l.variant_label ? ` (${l.variant_label})` : ''} x${l.quantity} - ${minorToDecimal(l.total_minor)} USD`)
    .join('\n');
  const total = minorToDecimal(totalMinor);
  const text = [
    `Order confirmed: ${number}`,
    '',
    'Thank you for buying from Vela.',
    '',
    items,
    '',
    `Total ${total} USD`,
    '',
    `Track this order: ${url}`,
    '',
    'The Vela team.',
  ].join('\n');
  const html = `<pre style="font-family:ui-monospace,monospace">${text}</pre>`;
  const info = await getTransport().sendMail({
    from: 'orders@vela.example',
    to,
    cc: undefined,
    bcc: undefined,
    subject: `Order confirmed: ${number}`,
    text,
    html,
  });
  return info;
}
