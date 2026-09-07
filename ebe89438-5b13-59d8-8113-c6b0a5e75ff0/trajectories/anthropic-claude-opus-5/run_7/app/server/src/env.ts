function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`missing required environment variable ${name}`);
  }
  return v;
}

export const env = {
  databaseUrl: req('DATABASE_URL'),
  smtpHost: req('SMTP_HOST'),
  smtpPort: Number(req('SMTP_PORT')),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'Deku Events <no-reply@deku.events>',
  port: Number(process.env.PORT ?? 4173),
  host: process.env.HOST ?? '0.0.0.0',
  publicUrl: process.env.APP_PUBLIC_URL ?? '',
  tokenSecret: process.env.TOKEN_SECRET ?? 'deku-dev-token-secret',
  staticDir: process.env.STATIC_DIR ?? '',
  seedPassword: process.env.SEED_PASSWORD ?? 'deku-demo-pw-2026',
};

export function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  process.stdout.write(JSON.stringify(line) + '\n');
}
