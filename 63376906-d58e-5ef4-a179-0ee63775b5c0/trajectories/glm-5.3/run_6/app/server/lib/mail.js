import net from 'node:net';

function line(sock, text) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString('utf8');
      const i = buf.indexOf('\r\n');
      if (i >= 0) {
        sock.removeListener('data', onData);
        resolve(buf.slice(0, i));
        if (buf.length > i + 2) sock.unshift(Buffer.from(buf.slice(i + 2), 'utf8'));
      }
    };
    sock.on('data', onData);
    sock.on('error', reject);
    sock.write(text);
  });
}

async function readResponse(sock) {
  return await line(sock, '');
}

export async function sendMail(to, subject, body) {
  const host = process.env.SMTP_HOST || 'mailpit';
  const port = Number(process.env.SMTP_PORT || 1025);
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, () => {
      (async () => {
        await readResponse(sock);
        await line(sock, 'HELO ravel.internal\r\n');
        await line(sock, `MAIL FROM:<ravel@example.com>\r\n`);
        await line(sock, `RCPT TO:<${to}>\r\n`);
        await line(sock, `DATA\r\n`);
        const msg = [
          `From: Ravel <ravel@example.com>`,
          `To: <${to}>`,
          `Subject: ${subject}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/plain; charset=utf-8`,
          ``,
          body.replace(/^\./gm, '..'),
          `.`
        ].join('\r\n');
        await line(sock, msg + '\r\n');
        await line(sock, 'QUIT\r\n');
        sock.end();
        resolve(true);
      })().catch(reject);
    });
    sock.on('error', reject);
  });
}

export const mailCertificateIssued = (to, n, claim_type, content_bp, permitted) =>
  sendMail(to, `Certificate ${n} issued`,
`Certificate ${n} issued.

Claim type: ${claim_type}
Recycled content: ${content_bp / 100} per cent
Permitted statement:

${permitted}

Verify this certificate at ravel.example.com/verify/${n}.
`);

export const mailCertificateWithdrawn = (to, n, reason, voidStatements) =>
  sendMail(to, `Certificate ${n} withdrawn`,
`Certificate ${n} withdrawn.

Reason: ${reason}

Every statement the recipient was permitted to make is now void:

${voidStatements.map((s) => '- ' + s).join('\n')}
`);

export const mailChangeNotice = (to, id, change, specs, days) =>
  sendMail(to, `Change notice ${id} requires acknowledgement`,
`Change notice ${id} requires acknowledgement.

The change:
${change}

Specifications affected:
${specs.map((s) => '- ' + s).join('\n')}

Notice period: ${days} days.
`);

export const mailEnquiry = (to, reference, destination, response_days) =>
  sendMail(to, `Enquiry ${reference} received`,
`Enquiry ${reference} received.

Destination: ${destination}
Stated response time: ${response_days} working days.
`);
