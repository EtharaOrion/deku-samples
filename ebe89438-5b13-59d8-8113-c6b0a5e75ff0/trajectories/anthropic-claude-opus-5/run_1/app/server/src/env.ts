function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required environment variable ${name}`);
  return v;
}

export const env = {
  databaseUrl: process.env.DATABASE_URL || process.env.DB_URL || required('DATABASE_URL'),
  smtpHost: process.env.SMTP_HOST || required('SMTP_HOST'),
  smtpPort: Number(process.env.SMTP_PORT || required('SMTP_PORT')),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || 'Deku Events <no-reply@deku.events>',
  port: Number(process.env.PORT || 4173),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: process.env.APP_PUBLIC_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'deku-dev-token-secret',
  staticDir: process.env.STATIC_DIR || 'public',
};

export function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + '\n'
  );
}
