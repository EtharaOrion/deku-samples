import { createHash } from 'node:crypto';

function num(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  get databaseUrl(): string {
    const u = process.env.DATABASE_URL || process.env.DB_URL || '';
    if (!u) throw new Error('DATABASE_URL is not set');
    return u;
  },
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: num('SMTP_PORT', 1025),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  port: num('PORT', 4173),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: (process.env.APP_PUBLIC_URL || `http://localhost:${num('APP_PUBLIC_PORT', 4173)}`).replace(/\/$/, ''),
  publicName: process.env.MAIL_FROM_NAME || 'Community Calendar',
  publicFromAddress: process.env.MAIL_FROM_ADDRESS || 'notifications@community-calendar.local',
  get authSecret(): string {
    if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
    return createHash('sha256')
      .update(`cc:${process.env.DATABASE_URL || ''}:${process.env.SMTP_HOST || ''}`)
      .digest('hex');
  },
  tokenTtlSeconds: 60 * 60 * 24 * 14,
};

export type Config = typeof config;
