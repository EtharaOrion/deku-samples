// Environment access. Every host, port and credential is read from the
// environment; nothing is hardcoded.
function req(name, fallback) {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
}

function paymentsBase() {
  let base = req('PAYMENTS_API_URL', 'http://killbill:8080');
  if (base.endsWith('/')) base = base.slice(0, -1);
  return base;
}

export const env = {
  get databaseUrl() { return req('DATABASE_URL'); },
  get payments() {
    return {
      baseUrl: paymentsBase(),
      apiKey: req('PAYMENTS_API_KEY'),
      apiSecret: req('PAYMENTS_API_SECRET'),
      adminUser: req('PAYMENTS_ADMIN_USER'),
      adminPassword: req('PAYMENTS_ADMIN_PASSWORD')
    };
  },
  get smtp() {
    return {
      host: req('SMTP_HOST', 'mailpit'),
      port: num('SMTP_PORT', 1025),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    };
  },
  get publicUrl() { return process.env.APP_PUBLIC_URL || `http://localhost:${env.port}`; },
  get port() { return num('PORT', num('APP_PUBLIC_PORT', 4173)); },
  get internalPort() { return 4173; },
  get isProd() { return process.env.NODE_ENV === 'production'; }
};
