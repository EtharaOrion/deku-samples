export function readEnv(): {
  databaseUrl: string;
  smtp: { host: string; port: number; user: string; pass: string };
  port: number;
  publicUrl: string;
  mailFrom: string;
} {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const port = Number(process.env.PORT || 4173);
  const publicUrl = (
    process.env.APP_PUBLIC_URL ||
    `http://localhost:${port}`
  ).replace(/\/+$/, '');
  return {
    databaseUrl,
    smtp: {
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 1025),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    port,
    publicUrl,
    mailFrom: process.env.MAIL_FROM || 'notifications@deku.events',
  };
}

export const ENV = readEnv();
