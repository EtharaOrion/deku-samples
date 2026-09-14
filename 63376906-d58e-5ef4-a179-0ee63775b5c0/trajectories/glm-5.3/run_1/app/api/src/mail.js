import net from 'node:net';
import { cfg } from './config.js';

// One recipient, no copies. Speaks just enough SMTP for mailpit.
export function sendMail(to, subject, body) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: cfg.smtpHost, port: cfg.smtpPort });
    let step = 0;
    let buf = '';
    const fail = () => { try { s.destroy(); } catch {} resolve(false); };
    const send = (line) => s.write(line + '\r\n');
    const wrap = (t) => {
      const lines = String(t).split(/\r?\n/);
      return lines.map((l) => (l.startsWith('.') ? '.' + l : l)).join('\r\n');
    };
    s.setTimeout(8000, fail);
    s.on('error', fail);
    s.on('close', () => resolve(step > 6));
    s.on('data', (d) => {
      buf += d.toString('utf8');
      if (!buf.endsWith('\r\n')) return;
      const code = parseInt(buf.slice(0, 3), 10);
      buf = '';
      if (code >= 500) return fail();
      step++;
      if (step === 1) return send(`HELO ravel.local`);
      if (step === 2) return send(`MAIL FROM:<ravel@ravel.example.com>`);
      if (step === 3) return send(`RCPT TO:<${to}>`);
      if (step === 4) return send(`DATA`);
      if (step === 5) {
        send(`From: Ravel <ravel@ravel.example.com>`);
        send(`To: <${to}>`);
        send(`Subject: ${subject}`);
        send(`MIME-Version: 1.0`);
        send(`Content-Type: text/plain; charset=utf-8`);
        send('');
        s.write(wrap(body).replace(/\n/g, '\r\n') + '\r\n');
        return send('.');
      }
      if (step === 6) return send('QUIT');
      s.end();
    });
  });
}
