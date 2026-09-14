export const env = {
  get port() { return Number(process.env.PORT || process.env.APP_PUBLIC_PORT || 4173); },
  get publicUrl() { return process.env.APP_PUBLIC_URL || ''; },
  databaseUrl: process.env.DATABASE_URL,
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT || 25),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  kb: {
    url: (process.env.PAYMENTS_API_URL || 'http://localhost:8080').replace(/\/$/, ''),
    apiKey: process.env.PAYMENTS_API_KEY,
    apiSecret: process.env.PAYMENTS_API_SECRET,
    adminUser: process.env.PAYMENTS_ADMIN_USER,
    adminPass: process.env.PAYMENTS_ADMIN_PASSWORD,
  },
};
