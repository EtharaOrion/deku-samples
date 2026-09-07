import { minorToDecimalString } from './money.mjs';
import { log } from './log.mjs';

// Every host and credential is read from the environment at call time, never
// captured at module load, so the container start decides them.
function config() {
  const base = process.env.PAYMENTS_API_URL;
  if (!base) throw new Error('PAYMENTS_API_URL is not set');
  return {
    base: base.replace(/\/+$/, ''),
    apiKey: process.env.PAYMENTS_API_KEY || '',
    apiSecret: process.env.PAYMENTS_API_SECRET || '',
    user: process.env.PAYMENTS_ADMIN_USER || '',
    pass: process.env.PAYMENTS_ADMIN_PASSWORD || '',
  };
}

function headers(cfg, extra = {}) {
  return {
    'X-Killbill-ApiKey': cfg.apiKey,
    'X-Killbill-ApiSecret': cfg.apiSecret,
    'X-Killbill-CreatedBy': 'vela-storefront',
    Authorization: `Basic ${Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64')}`,
    Accept: 'application/json',
    ...extra,
  };
}

async function kbFetch(path, init = {}, timeoutMs = 20000) {
  const cfg = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${cfg.base}${path}`, {
      ...init,
      headers: headers(cfg, init.headers || {}),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function healthy() {
  try {
    const cfg = config();
    const res = await fetch(`${cfg.base}/1.0/healthcheck`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAccountByExternalKey(externalKey) {
  const res = await kbFetch(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`killbill account lookup failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Create or reuse exactly one account for this external key. externalKey is
 * unique per tenant, so a race is settled by the store: the loser's create is
 * refused and it reads the winner's account back.
 */
export async function ensureAccount({ externalKey, email, name }) {
  const existing = await getAccountByExternalKey(externalKey);
  if (existing) return existing;

  const res = await kbFetch('/1.0/kb/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || externalKey, externalKey, email, currency: 'USD', country: 'US' }),
  });

  if (res.status === 201) {
    const location = res.headers.get('location');
    if (location) {
      const byId = await kbFetch(`/1.0/kb/accounts/${location.split('/').pop()}`);
      if (byId.ok) return byId.json();
    }
    return getAccountByExternalKey(externalKey);
  }

  // A duplicate external key is refused by the store rather than by app code.
  const again = await getAccountByExternalKey(externalKey);
  if (again) return again;
  throw new Error(`killbill account create failed: ${res.status} ${await res.text()}`);
}

/** Raise one committed external charge for the order total, in USD. */
export async function createInvoice({ accountId, amountMinor, description }) {
  const amount = minorToDecimalString(amountMinor);
  const res = await kbFetch(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ accountId, amount: Number(amount), currency: 'USD', description }]),
  });
  if (!res.ok) throw new Error(`killbill invoice create failed: ${res.status} ${await res.text()}`);
  const items = await res.json();
  const invoiceId = Array.isArray(items) && items.length ? items[0].invoiceId : null;
  return { invoiceId, amount };
}

/** Read an invoice back so the app reports what the provider actually holds. */
export async function getInvoice(invoiceId) {
  const res = await kbFetch(`/1.0/kb/invoices/${invoiceId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function listAccountInvoices(accountId) {
  const res = await kbFetch(`/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true`);
  if (!res.ok) return [];
  return res.json();
}

/**
 * The whole billing side of confirming an order: one account keyed by the
 * lowercased order email, one invoice on it for the order total in USD.
 */
export async function billOrder({ email, name, number, totalMinor, requestId }) {
  const externalKey = String(email).toLowerCase();
  const account = await ensureAccount({ externalKey, email: externalKey, name });
  const invoice = await createInvoice({
    accountId: account.accountId,
    amountMinor: totalMinor,
    description: `Vela order ${number}`,
  });
  log({
    level: 'info', msg: 'killbill.invoiced', request_id: requestId, order: number,
    external_key: externalKey, account_id: account.accountId,
    invoice_id: invoice.invoiceId, amount: invoice.amount, currency: 'USD',
  });
  return { externalKey, accountId: account.accountId, invoiceId: invoice.invoiceId, amount: invoice.amount };
}
