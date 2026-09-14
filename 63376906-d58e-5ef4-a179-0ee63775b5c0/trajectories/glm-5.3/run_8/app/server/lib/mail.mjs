import nodemailer from "nodemailer";

let transporter = null;
function mailer() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 1025),
      secure: false,
      pool: false,
    });
  }
  return transporter;
}

export async function sendMail(to, subject, body) {
  const t = mailer();
  await t.sendMail({
    from: "ravel@example.com",
    to,
    subject,
    text: body,
  });
  return { to, subject };
}
