function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing required environment variable ${name}`);
  return v;
}

export const env = {
  databaseUrl: req('DATABASE_URL', process.env.DB_URL),
  smtpHost: req('SMTP_HOST', 'mailpit'),
  smtpPort: Number(req('SMTP_PORT', '1025')),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || 'Deku Events <no-reply@deku.events>',
  port: Number(process.env.PORT || '4173'),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: process.env.APP_PUBLIC_URL || '',
  authSecret: process.env.AUTH_SECRET || 'deku-community-calendar-auth-secret',
  staticDir: process.env.STATIC_DIR || 'public',
  seedPassword: process.env.SEED_PASSWORD || 'deku-demo-pw-2026',
};

export type Env = typeof env;
