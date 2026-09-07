import { log } from './log.js';
import { minorToDecimalString } from './money.js';
import { AppError } from './errors.js';

function config() {
  const base = process.env.PAYMENTS_API_URL;
  if (!base) throw new Error('PAYMENTS_API_URL is not set');
  return {
    base: base.replace(/\/+$/, ''),
    apiKey: process.env.PAYMENTS_API_KEY || '',
    apiSecret: process.env.PAYMENTS_API_SECRET || '',
    user: process.env.PAYMENTS_ADMIN_USER || '',
    password: process.env.PAYMENTS_ADMIN_PASSWORD || '',
  };
}

function headers(cfg, withBody) {
  const h = {
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`,
    'X-Killbill-ApiKey': cfg.apiKey,
    'X-Killbill-ApiSecret': cfg.apiSecret,
    'X-Killbill-CreatedBy': 'vela-storefront',
  };
  if (withBody) h['Content-Type'] = 'application/json';
  return h;
}

async function call(pathname, { method = 'GET', body, requestId } = {}) {
  const cfg = config();
  const url = `${cfg.base}${pathname}`;
  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: headers(cfg, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  log({
    level: res.ok ? 'info' : 'warn',
    request_id: requestId,
    msg: 'killbill call',
    method,
    path: pathname,
    status: res.status,
    elapsed_ms: Date.now() - started,
  });
  return { status: res.status, body: parsed, location: res.headers.get('location') };
}

export async function healthy() {
  const cfg = config();
  try {
    const res = await fetch(`${cfg.base}/1.0/healthcheck`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function findAccountByExternalKey(externalKey, requestId) {
  const res = await call(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`, { requestId });
  if (res.status === 200 && res.body) return res.body;
  if (res.status === 404) return null;
  throw new AppError(502, 'billing_unavailable', 'The billing platform did not answer.');
}

// One account per key. externalKey is unique per tenant, so a racing second create
// is refused by the store; we then read the winner back.
export async function ensureAccount({ externalKey, email, name }, requestId) {
  const existing = await findAccountByExternalKey(externalKey, requestId);
  if (existing) return existing;

  const created = await call('/1.0/kb/accounts', {
    method: 'POST',
    requestId,
    body: { name: name || email, externalKey, email, currency: 'USD', country: 'US' },
  });
  if (created.status === 201) {
    const account = await findAccountByExternalKey(externalKey, requestId);
    if (account) return account;
  }
  // 409 / duplicate-key: somebody else won the create, read theirs.
  const after = await findAccountByExternalKey(externalKey, requestId);
  if (after) return after;
  throw new AppError(502, 'billing_unavailable', 'The billing platform did not create the account.');
}

export async function createInvoice({ accountId, totalMinor, description }, requestId) {
  const amount = minorToDecimalString(totalMinor);
  const res = await call(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: 'POST',
    requestId,
    body: [{ accountId, amount: Number(amount), currency: 'USD', description }],
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new AppError(502, 'billing_unavailable', 'The billing platform did not raise the invoice.');
  }
  const item = Array.isArray(res.body) ? res.body[0] : res.body;
  return { invoiceId: item ? item.invoiceId : null, amount };
}

export async function listAccountInvoices(accountId, requestId) {
  const res = await call(`/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true`, { requestId });
  return Array.isArray(res.body) ? res.body : [];
}
