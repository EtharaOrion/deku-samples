import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 1025);

const transport = nodemailer.createTransport({
  host,
  port,
  secure: false,
  tls: { rejectUnauthorized: false },
  ignoreTLS: true,
});

// Every mail leaves through mailpit, addressed to exactly one recipient with no
// copies. Nothing beyond the four acts sends mail.
export async function sendMail({ to, subject, text }) {
  if (!to || !subject) return { sent: false, reason: 'no_recipient' };
  const info = await transport.sendMail({
    from: 'Ravel <no-reply@ravel.example.com>',
    to,
    subject,
    text,
  });
  return { sent: true, message_id: info.messageId, to, subject };
}
