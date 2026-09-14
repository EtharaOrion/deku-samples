function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return need('DATABASE_URL'); },
  get smtpHost() { return need('SMTP_HOST'); },
  get smtpPort() { return Number(process.env.SMTP_PORT || 587); },
  get smtpUser() { return process.env.SMTP_USER || ''; },
  get smtpPass() { return process.env.SMTP_PASS || ''; },
  get paymentsUrl() { return need('PAYMENTS_API_URL').replace(/\/+$/, ''); },
  get paymentsKey() { return need('PAYMENTS_API_KEY'); },
  get paymentsSecret() { return need('PAYMENTS_API_SECRET'); },
  get paymentsAdminUser() { return need('PAYMENTS_ADMIN_USER'); },
  get paymentsAdminPassword() { return need('PAYMENTS_ADMIN_PASSWORD'); },
  get publicUrl() { return (process.env.APP_PUBLIC_URL || `http://localhost:${process.env.APP_PUBLIC_PORT || 4173}`).replace(/\/+$/, ''); },
  get port() { return Number(process.env.PORT || process.env.APP_PUBLIC_PORT || 4173); },
  get tokenSecret() { return process.env.TOKEN_SECRET || process.env.DATABASE_URL || 'vela-dev-token-secret'; },
};

export type Env = typeof env;
