import { createConnection } from 'node:net';
import { config } from './config.ts';
import { logger } from './log.ts';
import type { Tx } from './db.ts';

/**
 * Minimal synchronous SMTP client (RFC 5321 subset: EHLO, AUTH PLAIN, MAIL,
 * RCPT, DATA, QUIT). No vendor SDK, no queue: the send happens inside the
 * request that causes the transition.
 */
function encodeAuthPlain(user: string, pass: string): string {
  return Buffer.from(`\u0000${user}\u0000${pass}`, 'utf8').toString('base64');
}

function dotStuff(line: string): string {
  return line.replace(/(^|\r\n)\./g, '$1..');
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const { host, port, user, pass } = config.smtp;
  const socket = await new Promise<any>((resolve, reject) => {
    const s = createConnection({ host, port }, () => resolve(s));
    s.setTimeout(10_000, () => { s.destroy(); reject(new Error('smtp connect timeout')); });
    s.on('error', reject);
  });

  try {
    let buf = '';
    const readUntil = async (codes: number[], timeoutMs = 10_000): Promise<number> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const idx = buf.indexOf('\r\n');
        if (idx >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const code = Number(line.slice(0, 3));
          const isLast = line[3] !== '-';
          if (codes.includes(code) && isLast) {
            return { code, lines: [line] };
          }
          if (!codes.includes(code) && isLast) {
            throw new Error(`smtp unexpected ${line}`);
          }
          continue;
        }
        if (Date.now() > deadline) throw new Error('smtp read timeout');
        await new Promise<void>((res, rej) => {
          const t = setTimeout(() => rej(new Error('smtp read timeout')), Math.max(1, deadline - Date.now()));
          socket.once('data', (d: Buffer) => { clearTimeout(t); buf += d.toString('utf8'); res(); });
          socket.once('error', (e: Error) => { clearTimeout(t); rej(e); });
        }).catch((e) => { throw e; });
      }
    };
    const cmd = async (expect: number[], line: string) => {
      socket.write(line + '\r\n');
      return readUntil(expect);
    };

    await readUntil([220]);
    await cmd([250], `EHLO community-calendar`);
    if (user) {
      await cmd([250], `AUTH PLAIN ${encodeAuthPlain(user, pass)}`);
    }
    await cmd([250], `MAIL FROM:<${config.publicFromAddress}>`);
    await cmd([250], `RCPT TO:<${opts.to}>`);
    await cmd([354], `DATA`);
    const headers = [
      `From: ${config.publicName} <${config.publicFromAddress}>`,
      `To: <${opts.to}>`,
      `Subject: ${opts.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
    ].join('\r\n');
    socket.write(headers + '\r\n' + dotStuff(opts.body) + '\r\n.\r\n');
    await readUntil([250]);
    socket.write('QUIT\r\n');
    await new Promise<void>((r) => { socket.end(); socket.once('close', () => r()); });
  } finally {
    socket.destroy();
  }
  logger.info('smtp sent', { to: opts.to, subject: opts.subject });
}

/** Sends and records in email_log inside the caller's transaction. */
export async function sendAndLog(tx: Tx, args: {
  registration_id: number | null; event_id: number | null; recipient: string; subject: string; body: string;
}): Promise<void> {
  await sendMail({ to: args.recipient, subject: args.subject, body: args.body });
  await tx.query(
    `insert into email_log (registration_id, event_id, recipient, subject) values ($1,$2,$3,$4)`,
    [args.registration_id, args.event_id, args.recipient, args.subject]
  );
}
