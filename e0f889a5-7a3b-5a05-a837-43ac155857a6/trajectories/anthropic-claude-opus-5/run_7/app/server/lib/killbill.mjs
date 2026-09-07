// Billing lives in killbill and nowhere else. A confirmation this app returns to
// itself does not count: every order raises a real invoice on a real account.
import { minorToDecimalString } from './money.mjs';

const BASE = (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.PAYMENTS_API_KEY || '';
const API_SECRET = process.env.PAYMENTS_API_SECRET || '';
const ADMIN_USER = process.env.PAYMENTS_ADMIN_USER || '';
const ADMIN_PASS = process.env.PAYMENTS_ADMIN_PASSWORD || '';

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64'),
    'X-Killbill-ApiKey': API_KEY,
    'X-Killbill-ApiSecret': API_SECRET,
    'X-Killbill-CreatedBy': 'vela-storefront',
    ...extra,
  };
}

async function kb(path, { method = 'GET', body, timeout = 20_000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch { /* not json */ } }
    return { status: res.status, json, text, location: res.headers.get('location') };
  } finally {
    clearTimeout(timer);
  }
}

export async function healthy() {
  try {
    const res = await fetch(`${BASE}/1.0/healthcheck`, { signal: AbortSignal.timeout(5000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** 200 when the account exists, 404 when it does not. externalKey is unique per tenant. */
export async function findAccountByExternalKey(externalKey) {
  const r = await kb(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (r.status === 200 && r.json) return r.json;
  if (r.status === 404) return null;
  throw new Error(`killbill account lookup failed: ${r.status} ${r.text?.slice(0, 300)}`);
}

/**
 * One account per order email lowercased, created or reused. A second create with
 * a used key is refused by the store rather than by app code, so we treat that
 * refusal as "somebody else won the race" and read the winner back.
 */
export async function ensureAccount({ externalKey, name, email }) {
  const existing = await findAccountByExternalKey(externalKey);
  if (existing) return existing;

  const r = await kb('/1.0/kb/accounts', {
    method: 'POST',
    body: { name: name || externalKey, externalKey, email, currency: 'USD', country: 'US' },
  });

  if (r.status === 201) {
    const created = await findAccountByExternalKey(externalKey);
    if (created) return created;
    if (r.location) {
      const byId = await kb(`/1.0/kb/accounts/${r.location.split('/').pop()}`);
      if (byId.status === 200 && byId.json) return byId.json;
    }
  }

  // The store refused the duplicate key: read back the account that won.
  const after = await findAccountByExternalKey(externalKey);
  if (after) return after;
  throw new Error(`killbill account create failed: ${r.status} ${r.text?.slice(0, 300)}`);
}

/**
 * Raise one invoice on the account for the order total in USD. The amount is
 * derived from the integer minor units the order actually holds.
 */
export async function createInvoice({ accountId, totalMinor, description }) {
  const amount = minorToDecimalString(totalMinor);
  const r = await kb(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: 'POST',
    body: [{ accountId, amount: Number(amount), currency: 'USD', description }],
  });
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`killbill invoice create failed: ${r.status} ${r.text?.slice(0, 300)}`);
  }
  const item = Array.isArray(r.json) ? r.json[0] : r.json;
  return { invoiceId: item?.invoiceId || null, amount };
}

/** Read an invoice back from the store so the app never trusts its own figure. */
export async function getInvoice(invoiceId) {
  const r = await kb(`/1.0/kb/invoices/${invoiceId}`);
  if (r.status === 200 && r.json) return r.json;
  return null;
}

export async function listAccountInvoices(accountId) {
  const r = await kb(`/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true`);
  if (r.status === 200 && Array.isArray(r.json)) return r.json;
  return [];
}
