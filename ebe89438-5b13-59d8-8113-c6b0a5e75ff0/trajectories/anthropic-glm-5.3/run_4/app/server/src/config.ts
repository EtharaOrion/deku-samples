import 'dotenv/config';

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const databaseUrl = process.env.DATABASE_URL || process.env.DB_URL || '';
if (!databaseUrl) {
  console.error(JSON.stringify({ level: 'fatal', msg: 'DATABASE_URL is not set' }));
  process.exit(1);
}

export const config = {
  port: envInt('PORT', 4173),
  host: '0.0.0.0',
  publicUrl: process.env.APP_PUBLIC_URL || '',
  databaseUrl,
  smtp: {
    host: process.env.SMTP_HOST || 'mailpit',
    port: envInt('SMTP_PORT', 1025),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  seedPassword: 'deku-demo-pw-2026',
  rateLimit: { windowMs: 60000, max: 10 },
};
