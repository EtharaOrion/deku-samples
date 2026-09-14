export const env = {
  databaseUrl: process.env.DATABASE_URL || process.env.DB_URL || '',
  port: Number(process.env.PORT || 4173),
  appPublicUrl: process.env.APP_PUBLIC_URL || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 25),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  payments: {
    url: (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.PAYMENTS_API_KEY || '',
    apiSecret: process.env.PAYMENTS_API_SECRET || '',
    adminUser: process.env.PAYMENTS_ADMIN_USER || '',
    adminPassword: process.env.PAYMENTS_ADMIN_PASSWORD || ''
  }
};
