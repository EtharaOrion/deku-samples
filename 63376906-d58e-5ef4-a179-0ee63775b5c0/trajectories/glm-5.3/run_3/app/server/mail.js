import nodemailer from 'nodemailer';

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 1025),
  ignoreTLS: true, pool: false,
});
export async function sendMail(to, subject, body) {
  return transport.sendMail({ from: 'Ravel Materials <no-reply@ravel.example.com>', to, subject, text: body });
}
