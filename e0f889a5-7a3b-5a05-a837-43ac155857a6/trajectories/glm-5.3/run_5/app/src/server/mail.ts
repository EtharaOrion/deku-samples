import nodemailer from 'nodemailer';
import { env } from './env.js';
import { logEvent } from './log.js';

let cached: { key: string; transport: nodemailer.Transporter } | null = null;

function transport(): nodemailer.Transporter {
  const key = `${env.smtpHost}:${env.smtpPort}:${env.smtpUser}:${env.smtpPass}`;
  if (cached && cached.key === key) return cached.transport;
  const t = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: false,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
  cached = { key, transport: t };
  return t;
}

/** Send one mail to one address only: no cc, no bcc. */
export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const started = Date.now();
  try {
    const info = await transport().sendMail({
      from: process.env.MAIL_FROM || 'Vela <orders@vela.example>',
      to: [input.to],
      cc: undefined,
      bcc: undefined,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    logEvent('mail.sent', { to: input.to, subject: input.subject, ms: Date.now() - started, response: info?.response ?? null });
  } catch (err) {
    logEvent('mail.failed', { to: input.to, subject: input.subject, ms: Date.now() - started, error: String(err) });
    throw err;
  }
}
