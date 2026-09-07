import { minorToDecimalString } from './money.mjs';

/**
 * The billing platform is killbill. It is a billing platform, not a card
 * processor: there is no card, no token and no decline. Every host is read from
 * the environment.
 */
const baseUrl = () => (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');

function headers(extra = {}) {
  const user = process.env.PAYMENTS_ADMIN_USER || '';
  const pass = process.env.PAYMENTS_ADMIN_PASSWORD || '';
  return {
    'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY || '',
    'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET || '',
    Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
    'X-Killbill-CreatedBy': 'vela-storefront',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

async function kb(path, init = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl()}${path}`, { ...init, headers: headers(init.headers), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function healthy() {
  try {
    const res = await fetch(`${baseUrl()}/1.0/healthcheck`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function findAccount(externalKey) {
  const res = await kb(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`killbill account lookup failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * One account per order email lowercased. externalKey is unique per tenant, so a
 * second create with a used key is refused by the store rather than by app code;
 * we treat that refusal as "already there" and read it back.
 */
export async function ensureAccount({ externalKey, name, email }) {
  const existing = await findAccount(externalKey);
  if (existing) return existing;

  const res = await kb('/1.0/kb/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: name || externalKey,
      externalKey,
      email,
      currency: 'USD',
      country: 'US',
    }),
  });

  if (res.status === 201) {
    const location = res.headers.get('location');
    if (location) {
      const byId = await kb(`/1.0/kb/accounts/${location.split('/').pop()}`);
      if (byId.ok) return byId.json();
    }
    return findAccount(externalKey);
  }
  if (res.status === 409) {
    // The store refused the duplicate key. Read the winner back.
    const found = await findAccount(externalKey);
    if (found) return found;
  }
  throw new Error(`killbill account create failed: ${res.status} ${await res.text()}`);
}

/**
 * Raise one invoice for the order total in USD as an external charge, committed
 * so it is a real posted invoice rather than a draft.
 */
export async function createInvoice({ accountId, totalMinor, description }) {
  const amount = minorToDecimalString(totalMinor);
  const res = await kb(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: 'POST',
    body: JSON.stringify([
      { accountId, amount: Number(amount), currency: 'USD', description },
    ]),
  });
  if (!res.ok) throw new Error(`killbill invoice create failed: ${res.status} ${await res.text()}`);
  const items = await res.json();
  const invoiceId = Array.isArray(items) && items[0] ? items[0].invoiceId : null;
  return { invoiceId, amount };
}

/**
 * Read an invoice back from the store. The list projections in this killbill
 * version report amount 0 because they do not hydrate items, so the invoice
 * itself is the honest read.
 */
export async function getInvoice(invoiceId) {
  const res = await kb(`/1.0/kb/invoices/${invoiceId}?withItems=true`);
  if (!res.ok) return null;
  return res.json();
}

export async function accountInvoices(accountId) {
  const res = await kb(`/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true&withItems=true`);
  if (!res.ok) return [];
  return res.json();
}
