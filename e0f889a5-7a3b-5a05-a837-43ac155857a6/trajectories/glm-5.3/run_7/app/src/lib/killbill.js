// killbill client. Auth is basic admin credentials plus the api key and secret
// headers. Accounts are keyed by externalKey; invoices are raised as external
// charges committed at once.

import { minorToDecimalString } from './money.js';

function baseUrl() {
  return (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');
}

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY || '',
    'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET || '',
    'X-Killbill-CreatedBy': process.env.PAYMENTS_ADMIN_USER || 'vela-store',
    ...extra,
  };
}

function authHeader() {
  const user = process.env.PAYMENTS_ADMIN_USER || '';
  const pass = process.env.PAYMENTS_ADMIN_PASSWORD || '';
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

async function call(method, path, { body, query } = {}) {
  let url = baseUrl() + path;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const res = await fetch(url, {
    method,
    headers: { ...headers(), Authorization: authHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  let json = null;
  const text = await res.text();
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  const location = res.headers.get('location') || '';
  return { status: res.status, json, location };
}

export async function healthcheck() {
  try {
    const res = await fetch(baseUrl() + '/1.0/healthcheck', { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAccountByExternalKey(externalKey) {
  const out = await call('GET', '/1.0/kb/accounts', { query: { externalKey } });
  if (out.status === 200) return { found: true, account: out.json };
  if (out.status === 404) return { found: false, account: null };
  throw new Error(`killbill account lookup failed: ${out.status}`);
}

export async function createAccount({ externalKey, name, email, currency = 'USD', country = 'US' }) {
  const out = await call('POST', '/1.0/kb/accounts', {
    body: { name, externalKey, email, currency, country },
  });
  if (out.status === 201) {
    // killbill answers 201 with an empty body and the accountId in Location.
    const fromLocation = out.location.split('/').filter(Boolean).pop() || '';
    if (fromLocation) return { created: true, accountId: fromLocation };
    const again = await getAccountByExternalKey(externalKey);
    if (again.found) return { created: false, accountId: again.account.accountId };
  }
  if (out.status === 409 || (out.json && String(out.json.message || '').match(/already exists|unique/i))) {
    // A second create with a used key is refused; treat as existing.
    const again = await getAccountByExternalKey(externalKey);
    if (again.found) return { created: false, accountId: again.account.accountId };
  }
  throw new Error(`killbill account create failed: ${out.status} ${JSON.stringify(out.json).slice(0, 200)}`);
}

export async function ensureAccount({ externalKey, name, email, currency, country }) {
  const existing = await getAccountByExternalKey(externalKey);
  if (existing.found) return { accountId: existing.account.accountId, created: false };
  const made = await createAccount({ externalKey, name, email, currency, country });
  return { accountId: made.accountId, created: made.created };
}

export async function addInvoiceCustomField(invoiceId, name, value) {
  try {
    await call('POST', `/1.0/kb/invoices/${encodeURIComponent(invoiceId)}/customFields`, { body: [{ name, value }] });
  } catch { /* best effort */ }
}

export async function raiseInvoice({ accountId, externalKey, amountMinor, currency = 'USD', description }) {
  const out = await call('POST', `/1.0/kb/invoices/charges/${encodeURIComponent(accountId)}`, {
    query: { autoCommit: 'true' },
    body: [
      {
        accountId,
        amount: Number(minorToDecimalString(amountMinor)),
        currency,
        description,
      },
    ],
  });
  if (out.status === 200 || out.status === 201) {
    const item = Array.isArray(out.json) ? out.json[0] : out.json;
    await addInvoiceCustomField(item.invoiceId, 'order_total', minorToDecimalString(amountMinor));
    return { invoiceId: item.invoiceId, amount: item.amount };
  }
  throw new Error(`killbill invoice failed: ${out.status} ${JSON.stringify(out.json).slice(0, 200)}`);
}

export async function listInvoicesForAccount(accountId) {
  const out = await call('GET', `/1.0/kb/accounts/${encodeURIComponent(accountId)}/invoices`, {
    query: { withItems: 'true', unpaidInvoicesOnly: 'false' },
  });
  if (out.status !== 200) throw new Error(`killbill invoice list failed: ${out.status}`);
  return out.json || [];
}
