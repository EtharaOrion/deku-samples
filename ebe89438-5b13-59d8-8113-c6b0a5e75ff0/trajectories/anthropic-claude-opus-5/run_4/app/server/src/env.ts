function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  smtpHost: process.env['SMTP_HOST'] ?? '',
  smtpPort: Number(process.env['SMTP_PORT'] ?? '1025'),
  smtpUser: process.env['SMTP_USER'] ?? '',
  smtpPass: process.env['SMTP_PASS'] ?? '',
  mailFrom: process.env['MAIL_FROM'] ?? 'Community Calendar <no-reply@community-calendar.example>',
  port: Number(process.env['PORT'] ?? '4173'),
  host: process.env['BIND_HOST'] ?? '0.0.0.0',
  publicUrl: (process.env['APP_PUBLIC_URL'] ?? '').replace(/\/$/, ''),
  secret: process.env['APP_SECRET'] ?? 'community-calendar-signing-key',
  staticDir: process.env['STATIC_DIR'] ?? '',
  seedPassword: process.env['SEED_PASSWORD'] ?? 'deku-demo-pw-2026',
};

export type Env = typeof env;
