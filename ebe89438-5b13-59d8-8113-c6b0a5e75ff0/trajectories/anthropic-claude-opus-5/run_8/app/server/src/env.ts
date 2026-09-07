export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? '1025'),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'Deku Events <events@deku.local>',
  port: Number(process.env.PORT ?? '4173'),
  host: process.env.HOST ?? '0.0.0.0',
  publicUrl: process.env.APP_PUBLIC_URL ?? '',
  tokenSecret: process.env.TOKEN_SECRET ?? 'deku-token-secret-v1',
  staticDir: process.env.STATIC_DIR ?? 'public',
  seedPassword: process.env.SEED_PASSWORD ?? 'deku-demo-pw-2026',
};

export function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  process.stdout.write(JSON.stringify(line) + '\n');
}
