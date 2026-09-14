export const cfg = {
  port: Number(process.env.PORT || 4173),
  publicUrl: process.env.APP_PUBLIC_URL || '',
  publicPort: process.env.APP_PUBLIC_PORT || '4173',
  databaseUrl: process.env.DATABASE_URL || process.env.DB_URL || '',
  authIssuerUrl: process.env.AUTH_ISSUER_URL || '',
  authClientId: process.env.AUTH_CLIENT_ID || '',
  authClientSecret: process.env.AUTH_CLIENT_SECRET || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 25),
  schemeMonths: 120,
  statutoryMonths: 84,
  sessionHours: 12,
  verifyBase: 'https://ravel.example.com/verify/'
};
