import nodemailer from 'nodemailer';

let transporter = null;
function getTransport() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 1025),
      pool: false
    });
  }
  return transporter;
}

// Exactly one recipient, no copies. Only the four acts named in the brief use this.
export async function sendMail(to, subject, text) {
  const t = getTransport();
  await t.sendMail({
    from: 'Ravel <no-reply@ravel.example.com>',
    to,
    subject,
    text
  });
}
