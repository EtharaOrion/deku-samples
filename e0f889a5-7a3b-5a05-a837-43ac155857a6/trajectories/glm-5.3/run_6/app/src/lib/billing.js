import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { logEvent, logError } from './log.js';

// The billing platform is killbill. It is a billing platform, not a card
// processor: there is no card, no token and no decline. A confirmed order
// creates or reuses one account keyed by the order email lowercased, and
// raises one invoice on it for the order total in USD.

function authHeaders() {
  const p = env.payments;
  const basic = Buffer.from(`${p.adminUser}:${p.adminPassword}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'X-Killbill-ApiKey': p.apiKey,
    'X-Killbill-ApiSecret': p.apiSecret,
    'X-Killbill-CreatedBy': 'vela-storefront'
  };
}

async function kb(path, { method = 'GET', body, headers = {}, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.payments.baseUrl}${path}`, {
      method,
      headers: { ...authHeaders(), ...headers, Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

export async function paymentsHealthy() {
  try {
    const res = await fetch(`${env.payments.baseUrl}/1.0/healthcheck`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function findAccountByExternalKey(externalKey) {
  const res = await kb(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 200 && res.json) return res.json;
  return null;
}

export async function ensureAccount({ externalKey, name, email }) {
  const existing = await findAccountByExternalKey(externalKey);
  if (existing) return { accountId: existing.accountId, created: false };

  const res = await kb('/1.0/kb/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { name, externalKey, email, currency: 'USD', country: 'US' }
  });
  if (res.status === 201) {
    const location = res.json && res.json.accountId ? res.json.accountId : null;
    if (location) return { accountId: location, created: true };
    const again = await findAccountByExternalKey(externalKey);
    if (again) return { accountId: again.accountId, created: true };
  }
  // A second create with a used key is refused by the platform; treat that as
  // success by reading the account back.
  if (res.status === 400 || res.status === 409 || res.status === 422) {
    const again = await findAccountByExternalKey(externalKey);
    if (again) return { accountId: again.accountId, created: false };
  }
  throw new Error(`killbill account create failed (${res.status}) ${res.text ? res.text.slice(0, 300) : ''}`);
}

// One invoice for the order total, in USD, expressed as a decimal.
export async function raiseInvoice({ accountId, orderNumber, amountMinor, currency = 'USD' }) {
  const amount = (Number(amountMinor) / 100).toFixed(2);
  const res = await kb(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true&payInvoice=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: [{ amount: Number(amount), currency, description: `Vela order ${orderNumber}` }]
  });
  if (res.status !== 200 || !Array.isArray(res.json) || res.json.length === 0) {
    throw new Error(`killbill invoice failed (${res.status}) ${res.text ? res.text.slice(0, 300) : ''}`);
  }
  const item = res.json[0];
  logEvent('billing.invoice_created', {
    account_id: accountId,
    order_number: orderNumber,
    amount,
    currency,
    invoice_id: item.invoiceId
  });
  return { invoiceId: item.invoiceId, amount };
}

// True when the account already carries an invoice for this order, so a fresh
// database seeding against an existing billing platform never raises a second
// one for the same order number.
export async function hasInvoiceForOrder(accountId, orderNumber) {
  const res = await kb(`/1.0/kb/accounts/${accountId}/invoices`);
  if (!Array.isArray(res)) return false;
  const description = `Vela order ${orderNumber}`;
  for (const invoice of res) {
    const one = await kb(`/1.0/kb/invoices/${invoice.invoiceId}`);
    if (!one || !Array.isArray(one.items)) continue;
    if (one.items.some((item) => item.description === description)) return true;
  }
  return false;
}

export async function listInvoices({ limit = 100 } = {}) {
  const res = await kb(`/1.0/kb/invoices/pagination?limit=${limit}`);
  if (res.status !== 200 || !Array.isArray(res.json)) {
    throw new Error(`killbill invoice list failed (${res.status})`);
  }
  return res.json;
}

export function externalKeyForEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}
