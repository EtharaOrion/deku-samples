import { minorToDecimalString } from './money.js';
import { log } from './log.js';

// Every host is read from the environment; none is hardcoded.
const BASE = () => (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');
const API_KEY = () => process.env.PAYMENTS_API_KEY || '';
const API_SECRET = () => process.env.PAYMENTS_API_SECRET || '';
const ADMIN_USER = () => process.env.PAYMENTS_ADMIN_USER || '';
const ADMIN_PASSWORD = () => process.env.PAYMENTS_ADMIN_PASSWORD || '';

function headers(extra = {}) {
  const basic = Buffer.from(`${ADMIN_USER()}:${ADMIN_PASSWORD()}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'X-Killbill-ApiKey': API_KEY(),
    'X-Killbill-ApiSecret': API_SECRET(),
    'X-Killbill-CreatedBy': 'vela-storefront',
    Accept: 'application/json',
    ...extra,
  };
}

async function kb(path, { method = 'GET', body, timeoutMs = 20_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method,
      headers: headers(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch { json = null; } }
    return { status: res.status, json, text, location: res.headers.get('location') };
  } finally {
    clearTimeout(timer);
  }
}

export async function healthy() {
  try {
    const res = await fetch(`${BASE()}/1.0/healthcheck`, { signal: AbortSignal.timeout(5000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** 200 when the account exists, 404 when it does not. externalKey is unique per tenant. */
export async function getAccountByExternalKey(externalKey) {
  const res = await kb(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 200 && res.json) return res.json;
  if (res.status === 404) return null;
  throw new Error(`killbill account lookup failed: ${res.status} ${res.text?.slice(0, 300)}`);
}

/**
 * One account per order email lowercased, created or reused.
 * A second create with a used key is refused by the store rather than by app code,
 * so the 409 is caught and the existing account read back.
 */
export async function ensureAccount({ externalKey, email, name, currency = 'USD', country = 'US' }) {
  const existing = await getAccountByExternalKey(externalKey);
  if (existing) return { account: existing, created: false };

  const res = await kb('/1.0/kb/accounts', {
    method: 'POST',
    body: { name: name || externalKey, externalKey, email, currency, country },
  });

  if (res.status === 201) {
    const account = await getAccountByExternalKey(externalKey);
    if (!account) throw new Error('killbill created an account that cannot be read back');
    return { account, created: true };
  }
  if (res.status === 409) {
    // The store refused the duplicate key. Read the winner back.
    const account = await getAccountByExternalKey(externalKey);
    if (!account) throw new Error('killbill refused a duplicate key with no account behind it');
    return { account, created: false };
  }
  throw new Error(`killbill account create failed: ${res.status} ${res.text?.slice(0, 300)}`);
}

/** Raise one committed invoice on the account for the order total in USD. */
export async function createInvoice({ accountId, totalMinor, currency = 'USD', description }) {
  const amount = minorToDecimalString(totalMinor);
  const res = await kb(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: 'POST',
    body: [{ accountId, amount: Number(amount), currency, description }],
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`killbill invoice create failed: ${res.status} ${res.text?.slice(0, 300)}`);
  }
  const item = Array.isArray(res.json) ? res.json[0] : null;
  if (!item?.invoiceId) throw new Error('killbill returned no invoice item');
  return { invoiceId: item.invoiceId, amount, currency };
}

/**
 * Read an invoice back from the store. This is how the app proves the money is
 * where it says it is: the provider is the fact, not the app's own tables.
 */
export async function getInvoice(invoiceId) {
  const res = await kb(`/1.0/kb/invoices/${invoiceId}?withItems=true`);
  if (res.status === 200) return res.json;
  if (res.status === 404) return null;
  throw new Error(`killbill invoice read failed: ${res.status}`);
}

/** Every invoice on an account, with items, so amounts are real rather than shallow. */
export async function getAccountInvoices(accountId) {
  const res = await kb(
    `/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true&includeVoidedInvoices=false`,
  );
  if (res.status === 200 && Array.isArray(res.json)) return res.json;
  if (res.status === 404) return [];
  throw new Error(`killbill account invoices read failed: ${res.status}`);
}

/**
 * The invoice this order raised, read from killbill rather than from our own row.
 * Returns null when the store holds nothing for it.
 */
export async function findOrderInvoice({ externalKey, invoiceId }) {
  if (invoiceId) {
    const inv = await getInvoice(invoiceId);
    if (inv) return inv;
  }
  if (!externalKey) return null;
  const account = await getAccountByExternalKey(externalKey);
  if (!account) return null;
  const invoices = await getAccountInvoices(account.accountId);
  return invoices.length ? invoices[invoices.length - 1] : null;
}

export { log };
