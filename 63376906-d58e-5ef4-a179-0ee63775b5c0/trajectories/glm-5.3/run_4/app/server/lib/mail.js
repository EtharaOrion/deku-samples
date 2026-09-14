import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || 'localhost';
const port = Number(process.env.SMTP_PORT || 1025);

let transporter = null;
function getTransport() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 5000
    });
  }
  return transporter;
}

// One recipient, no copies.
export async function sendMail(to, subject, text) {
  const t = getTransport();
  const info = await t.sendMail({
    from: 'Ravel <no-reply@ravel.example.com>',
    to,
    subject,
    text,
    html: null
  });
  return { to, subject, messageId: info?.messageId || null };
}
