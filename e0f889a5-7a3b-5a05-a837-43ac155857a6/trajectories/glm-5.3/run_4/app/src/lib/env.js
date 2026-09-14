/**
 * Environment is read at container start, never hardcoded. The object is built
 * lazily on first access so importing a module that names it never throws.
 */
let cached = null;

function required(name, fallback = undefined) {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

function build() {
  return {
    get databaseUrl() { return required('DATABASE_URL'); },
    get paymentsUrl() { return required('PAYMENTS_API_URL', 'http://killbill:8080'); },
    get paymentsApiKey() { return required('PAYMENTS_API_KEY'); },
    get paymentsApiSecret() { return required('PAYMENTS_API_SECRET'); },
    get paymentsAdminUser() { return required('PAYMENTS_ADMIN_USER'); },
    get paymentsAdminPassword() { return required('PAYMENTS_ADMIN_PASSWORD'); },
    get smtpHost() { return required('SMTP_HOST', 'mailpit'); },
    get smtpPort() { return Number(required('SMTP_PORT', '1025')); },
    get smtpUser() { return process.env.SMTP_USER || ''; },
    get smtpPass() { return process.env.SMTP_PASS || ''; },
    get appUrl() { return required('APP_PUBLIC_URL', 'http://localhost:4173'); },
    get appPort() { return Number(required('APP_PUBLIC_PORT', '4173')); },
  };
}

export const env = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!cached) cached = build();
      return cached[prop];
    },
  }
);
