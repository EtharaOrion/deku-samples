function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`${name} is not set`);
  return value;
}

export const config = {
  port: Number(required('APP_PUBLIC_PORT', '4173')),
  publicUrl: required('APP_PUBLIC_URL', 'http://localhost:4173'),
  databaseUrl: required('DATABASE_URL', process.env.DB_URL),
  authIssuerUrl: required('AUTH_ISSUER_URL'),
  authClientId: required('AUTH_CLIENT_ID'),
  authClientSecret: required('AUTH_CLIENT_SECRET'),
  smtpHost: required('SMTP_HOST'),
  smtpPort: Number(required('SMTP_PORT', '1025')),
  sessionHours: 12,
};
