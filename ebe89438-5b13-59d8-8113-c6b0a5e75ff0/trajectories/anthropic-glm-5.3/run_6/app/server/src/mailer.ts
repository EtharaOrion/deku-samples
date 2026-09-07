export type Mailer = (to: string, subject: string, body: string) => Promise<void>;

export function makeMailer(): Mailer {
  const host = process.env.SMTP_HOST || 'localhost';
  const port = parseInt(process.env.SMTP_PORT || '1025', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  let transport: any = null;
  const opts = { host, port, secure: false, ...(user ? { auth: { user, pass } } : {}) };
  return async (to, subject, body) => {
    const nodemailer = (await import('nodemailer')).default;
    if (!transport) transport = nodemailer.createTransport(opts);
    await transport.sendMail({
      from: process.env.MAIL_FROM || 'Community Calendar <no-reply@communitycalendar.app>',
      to,
      subject,
      text: body,
      html:
        '<html><body style="font-family:Georgia,\'Times New Roman\',serif;color:#151515">' +
        `<h2 style="font-weight:400">${subject}</h2>` +
        `<p style="font-family:Inter,-apple-system,Arial,sans-serif;font-size:16px;line-height:24px">${body.replace(/\n/g, '<br>')}</p>` +
        '</body></html>',
    });
  };
}
