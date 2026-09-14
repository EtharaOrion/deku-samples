// Mail leaves through mailpit over SMTP. Nothing else sends mail.
import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || '';
const port = Number(process.env.SMTP_PORT || 1025);

let transport: any = null;
function getTransport() {
  if (!transport) transport = nodemailer.createTransport({ host, port, pool: false });
  return transport;
}

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<{ delivered: boolean; messageId?: string }> {
  try {
    const info = await getTransport().sendMail({
      from: 'Ravel <certificates@ravel.example.com>',
      to: opts.to,
      subject: opts.subject,
      text: opts.text
    });
    return { delivered: true, messageId: info.messageId };
  } catch (e: any) {
    console.error('mail_failed', e.message);
    return { delivered: false };
  }
}
