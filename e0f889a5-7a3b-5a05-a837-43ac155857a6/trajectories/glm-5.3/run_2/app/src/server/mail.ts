import nodemailer from 'nodemailer';

let cached: ReturnType<typeof nodemailer.createTransport> | null = null;

function transport() {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT || 2525);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const auth = user || pass ? { user, pass } : undefined;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth,
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return cached;
}

export function sendMail(message: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = transport();
    t.sendMail(
      {
        from: process.env.MAIL_FROM || 'Vela <orders@vela.example>',
        to: message.to,
        cc: undefined,
        bcc: undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}
