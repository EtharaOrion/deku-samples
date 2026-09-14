import nodemailer from 'nodemailer';
import { env } from './env.js';

let transporter = null;

/** Built on first send so importing never needs the SMTP address. */
function getTransport() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: false,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, text, html }) {
  const t = getTransport();
  const info = await t.sendMail({
    from: 'Vela <no-reply@vela.example>',
    to,
    subject,
    text,
    html,
  });
  return info;
}
