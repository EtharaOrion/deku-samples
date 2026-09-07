import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 1025);

const transport = nodemailer.createTransport({ host, port, secure: false, ignoreTLS: true });

// Every mail leaves through mailpit, addressed to exactly one recipient with no copies.
// Nothing beyond the four acts sends mail.
export async function sendMail({ to, subject, text }) {
  if (!host) throw new Error('SMTP_HOST is not set');
  if (Array.isArray(to)) throw new Error('one recipient, no copies');
  const info = await transport.sendMail({
    from: 'Ravel Materials SAS <no-reply@ravel.example.com>',
    to,
    subject,
    text,
  });
  return { message_id: info.messageId, to, subject };
}
