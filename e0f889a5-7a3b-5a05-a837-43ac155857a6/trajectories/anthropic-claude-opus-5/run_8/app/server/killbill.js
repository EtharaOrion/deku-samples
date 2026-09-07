import { minorToDecimalString } from './money.js';
import { logLine } from './log.js';

const base = () => (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');

function headers(extra = {}) {
  const user = process.env.PAYMENTS_ADMIN_USER || '';
  const pass = process.env.PAYMENTS_ADMIN_PASSWORD || '';
  return {
    'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY || '',
    'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET || '',
    'X-Killbill-CreatedBy': 'vela-storefront',
    Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    Accept: 'application/json',
    ...extra,
  };
}

async function kb(path, { method = 'GET', body, timeoutMs = 20_000 } = {}) {
  const url = `${base()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: headers(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
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

export async function health() {
  const res = await kb('/1.0/healthcheck', { timeoutMs: 5000 });
  return res.status === 200;
}

export async function getAccountByExternalKey(externalKey) {
  const res = await kb(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 200 && res.json && res.json.accountId) return res.json;
  if (res.status === 404) return null;
  if (res.status >= 400) throw new Error(`killbill account lookup failed: ${res.status} ${res.text?.slice(0, 300)}`);
  return null;
}

// One account per order email lowercased, created or reused. externalKey is unique
// per tenant, so a second create with a used key is refused by the store itself.
export async function ensureAccount({ externalKey, email, name }) {
  const existing = await getAccountByExternalKey(externalKey);
  if (existing) return existing;

  const res = await kb('/1.0/kb/accounts', {
    method: 'POST',
    body: { name: name || email, externalKey, email, currency: 'USD', country: 'US' },
  });

  if (res.status === 201 || res.status === 200) {
    const again = await getAccountByExternalKey(externalKey);
    if (again) return again;
    if (res.location) {
      const id = res.location.split('/').pop();
      return { accountId: id, externalKey };
    }
  }
  // The store refused the key because somebody else created it in the same instant.
  if (res.status === 409 || res.status === 400 || res.status === 500) {
    const again = await getAccountByExternalKey(externalKey);
    if (again) return again;
  }
  throw new Error(`killbill account create failed: ${res.status} ${res.text?.slice(0, 300)}`);
}

export async function getInvoice(invoiceId) {
  const res = await kb(`/1.0/kb/invoices/${encodeURIComponent(invoiceId)}?withItems=true`);
  if (res.status === 200) return res.json;
  return null;
}

export async function listAccountInvoices(accountId) {
  const res = await kb(`/1.0/kb/accounts/${encodeURIComponent(accountId)}/invoices?includeInvoiceComponents=true&includeVoidedInvoices=false`);
  if (res.status === 200 && Array.isArray(res.json)) return res.json;
  return [];
}

// Raise one invoice on the account for the order total in USD.
export async function raiseInvoice({ accountId, totalMinor, description, chargeKey }) {
  const amount = minorToDecimalString(totalMinor);
  const res = await kb(`/1.0/kb/invoices/charges/${encodeURIComponent(accountId)}?autoCommit=true`, {
    method: 'POST',
    body: [{
      accountId,
      amount: Number(amount),
      currency: 'USD',
      description,
      ...(chargeKey ? { itemDetails: chargeKey } : {}),
    }],
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`killbill invoice create failed: ${res.status} ${res.text?.slice(0, 300)}`);
  }
  const items = Array.isArray(res.json) ? res.json : [];
  const invoiceId = items[0]?.invoiceId ?? null;
  logLine({ level: 'info', msg: 'killbill invoice raised', invoice_id: invoiceId, amount, currency: 'USD', account_id: accountId });
  return { invoiceId, amount };
}

// Find the invoice already raised for this exact order row, so a retry after a
// crash between the charge and the commit does not raise a second one.
export async function findInvoiceByChargeKey(accountId, chargeKey) {
  if (!chargeKey) return null;
  const invoices = await listAccountInvoices(accountId);
  for (const inv of invoices) {
    if (inv.status === 'VOID') continue;
    for (const item of inv.items || []) {
      if (item.itemDetails === chargeKey) {
        return { invoiceId: inv.invoiceId, amount: String(inv.amount) };
      }
    }
  }
  return null;
}
