import { minorToDecimalString } from '../lib/money.js';
import { info, warn } from '../lib/log.js';

// The billing platform is the fact. Nothing here is synthesised locally: an
// account and an invoice are created in killbill and read back from it.

const base = () => {
  const url = process.env.PAYMENTS_API_URL;
  if (!url) throw new Error('PAYMENTS_API_URL is not set');
  return url.replace(/\/+$/, '');
};

function headers(extra = {}) {
  const user = process.env.PAYMENTS_ADMIN_USER || '';
  const pass = process.env.PAYMENTS_ADMIN_PASSWORD || '';
  return {
    Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
    'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY || '',
    'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET || '',
    'X-Killbill-CreatedBy': 'vela-storefront',
    Accept: 'application/json',
    ...extra,
  };
}

async function kb(path, { method = 'GET', body, timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: headers(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    return { status: res.status, json, text, location: res.headers.get('location') };
  } finally {
    clearTimeout(timer);
  }
}

export async function healthy() {
  try {
    const res = await fetch(`${base()}/1.0/healthcheck`, { signal: AbortSignal.timeout(5000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function findAccountByExternalKey(externalKey) {
  const res = await kb(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 200 && res.json) return res.json;
  if (res.status === 404) return null;
  throw new Error(`killbill account lookup failed: ${res.status} ${res.text?.slice(0, 200)}`);
}

// externalKey is unique per tenant, so a second create with a used key is
// refused by the store rather than by app code; that refusal is handled by
// reading the existing account back.
export async function ensureAccount({ externalKey, email, name }) {
  const existing = await findAccountByExternalKey(externalKey);
  if (existing) return existing;

  const res = await kb('/1.0/kb/accounts', {
    method: 'POST',
    body: { name: name || externalKey, externalKey, email, currency: 'USD', country: 'US' },
  });

  if (res.status === 201) {
    const created = await findAccountByExternalKey(externalKey);
    if (created) return created;
    if (res.location) {
      const byId = await kb(`/1.0/kb/accounts/${res.location.split('/').pop()}`);
      if (byId.status === 200 && byId.json) return byId.json;
    }
    throw new Error('killbill created an account that cannot be read back');
  }

  // The store refused a duplicate external key. Read the winner back.
  const raced = await findAccountByExternalKey(externalKey);
  if (raced) return raced;
  throw new Error(`killbill account create failed: ${res.status} ${res.text?.slice(0, 300)}`);
}

export async function createInvoice({ accountId, totalMinor, description }) {
  const amount = minorToDecimalString(totalMinor); // decimal derived from integer minor units
  const res = await kb(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: 'POST',
    body: [{ accountId, amount, currency: 'USD', description }],
    timeout: 30000,
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`killbill invoice create failed: ${res.status} ${res.text?.slice(0, 300)}`);
  }
  const item = Array.isArray(res.json) ? res.json[0] : res.json;
  if (!item || !item.invoiceId) throw new Error('killbill returned no invoice id');
  return { invoiceId: item.invoiceId, amount: String(item.amount) };
}

export async function getInvoice(invoiceId) {
  const res = await kb(`/1.0/kb/invoices/${invoiceId}`);
  if (res.status !== 200) return null;
  return res.json;
}

export async function accountInvoices(accountId) {
  const res = await kb(`/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true`);
  if (res.status !== 200 || !Array.isArray(res.json)) return [];
  return res.json;
}

// Raise exactly one invoice for this order on the account keyed by the order
// email lowercased, then read it back from killbill and return what it says.
export async function invoiceOrder({ email, name, orderNumber, totalMinor }) {
  const externalKey = String(email).trim().toLowerCase();
  const account = await ensureAccount({ externalKey, email: externalKey, name: name || externalKey });

  // If this order was already invoiced on this account, reuse it rather than
  // raising a second one.
  const wanted = minorToDecimalString(totalMinor);
  const existing = await accountInvoices(account.accountId);
  for (const inv of existing) {
    const items = inv.items || [];
    if (items.some((it) => it.description === `Order ${orderNumber}`)) {
      info('killbill_invoice_reused', { order: orderNumber, invoice_id: inv.invoiceId });
      return { accountId: account.accountId, externalKey, invoiceId: inv.invoiceId, amount: String(inv.amount) };
    }
  }

  const created = await createInvoice({
    accountId: account.accountId,
    totalMinor,
    description: `Order ${orderNumber}`,
  });

  const readBack = await getInvoice(created.invoiceId);
  const amount = readBack ? String(readBack.amount) : created.amount;
  if (Number(amount) !== Number(wanted)) {
    warn('killbill_invoice_amount_mismatch', { order: orderNumber, wanted, amount });
  }
  info('killbill_invoice_created', { order: orderNumber, invoice_id: created.invoiceId, amount, external_key: externalKey });
  return { accountId: account.accountId, externalKey, invoiceId: created.invoiceId, amount };
}
