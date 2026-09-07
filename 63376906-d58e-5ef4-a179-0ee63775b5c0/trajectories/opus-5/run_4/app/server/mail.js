import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 1025);

let transport = null;
function tx() {
  if (!transport) {
    if (!host) throw new Error('SMTP_HOST is not set');
    transport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      tls: { rejectUnauthorized: false },
      ignoreTLS: true,
    });
  }
  return transport;
}

/**
 * Every mail leaves through mailpit, addressed to exactly one recipient with
 * no copies. Only four acts send mail and nothing else does.
 */
export async function send({ to, subject, text }) {
  if (Array.isArray(to)) throw new Error('one recipient, no copies');
  const info = await tx().sendMail({
    from: 'Ravel Materials SAS <no-reply@ravel.example.com>',
    to,
    subject,
    text,
  });
  return { messageId: info.messageId, to, subject };
}
