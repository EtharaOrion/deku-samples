import { minorToDecimalString } from './money.js';

// Billing is killbill: a billing platform, not a card processor. There is no
// card, no token and no decline. Every host and credential comes from the
// environment; nothing here is hardcoded.
function config() {
  const base = (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');
  return {
    base,
    apiKey: process.env.PAYMENTS_API_KEY || '',
    apiSecret: process.env.PAYMENTS_API_SECRET || '',
    user: process.env.PAYMENTS_ADMIN_USER || '',
    password: process.env.PAYMENTS_ADMIN_PASSWORD || '',
  };
}

function headers(cfg, extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: 'Basic ' + Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64'),
    'X-Killbill-ApiKey': cfg.apiKey,
    'X-Killbill-ApiSecret': cfg.apiSecret,
    'X-Killbill-CreatedBy': 'vela-storefront',
    ...extra,
  };
}

async function kbFetch(path, init = {}, timeoutMs = 20000) {
  const cfg = config();
  if (!cfg.base) throw new Error('PAYMENTS_API_URL is not set');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${cfg.base}${path}`, {
      ...init,
      headers: headers(cfg, init.headers),
      signal: ctl.signal,
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

/** 200 when the account exists, 404 when it does not. */
export async function findAccountByExternalKey(externalKey) {
  const res = await kbFetch(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`killbill account lookup failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Create or reuse one account keyed by the order email lowercased. externalKey
 * is unique per tenant, so a second create with a used key is refused by the
 * store rather than by app code; we treat that refusal as "already there".
 */
export async function ensureAccount({ externalKey, email, name }) {
  const existing = await findAccountByExternalKey(externalKey);
  if (existing) return existing;

  const res = await kbFetch('/1.0/kb/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: name || email,
      externalKey,
      email,
      currency: 'USD',
      country: 'US',
    }),
  });

  if (res.status === 201) {
    const location = res.headers.get('location');
    if (location) {
      const byId = await kbFetch(`/1.0/kb/accounts/${location.split('/').pop()}`);
      if (byId.ok) return byId.json();
    }
    const after = await findAccountByExternalKey(externalKey);
    if (after) return after;
  }

  // The store refused the duplicate key: read back the winner.
  const after = await findAccountByExternalKey(externalKey);
  if (after) return after;
  throw new Error(`killbill account create failed: ${res.status} ${await res.text()}`);
}

/**
 * Raise one invoice on the account for the order total in USD. The amount is
 * the app's integer minor units expressed as a decimal string; no float is ever
 * constructed on the way out.
 */
export async function createInvoiceCharge({ accountId, totalMinor, description }) {
  const amount = minorToDecimalString(totalMinor);
  const body = JSON.stringify([
    { accountId, amount: Number(amount), currency: 'USD', description },
  ]);
  const res = await kbFetch(
    `/1.0/kb/invoices/charges/${accountId}?autoCommit=true`,
    { method: 'POST', body },
    30000,
  );
  if (!res.ok) {
    throw new Error(`killbill invoice create failed: ${res.status} ${await res.text()}`);
  }
  const items = await res.json();
  const item = Array.isArray(items) ? items[0] : items;
  return {
    invoiceId: item?.invoiceId ?? null,
    invoiceItemId: item?.invoiceItemId ?? null,
    amount,
  };
}

/** Read one invoice back, with its items, so the figure is confirmed at source. */
export async function getInvoice(invoiceId) {
  const res = await kbFetch(`/1.0/kb/invoices/${invoiceId}?withItems=true`);
  if (!res.ok) return null;
  return res.json();
}

export async function accountInvoices(accountId) {
  const res = await kbFetch(
    `/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true`,
  );
  if (!res.ok) return [];
  return res.json();
}
