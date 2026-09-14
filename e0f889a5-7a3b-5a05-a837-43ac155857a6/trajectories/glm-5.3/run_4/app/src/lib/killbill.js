import { env } from './env.js';

/** Credentials are read per call, never at import, so a build with no
 *  service addresses still succeeds. */
function authHeader() {
  return 'Basic ' + Buffer.from(`${env.paymentsAdminUser}:${env.paymentsAdminPassword}`).toString('base64');
}

async function kb(path, { method = 'GET', body, query } = {}) {
  const url = new URL(String(env.paymentsUrl).replace(/\/$/, '') + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      'X-Killbill-Apikey': env.paymentsApiKey,
      'X-Killbill-ApiSecret': env.paymentsApiSecret,
      'X-Killbill-CreatedBy': 'vela-storefront',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, ok: res.ok, json, text, headers: res.headers };
}

export async function healthcheck() {
  try {
    const r = await kb('/1.0/healthcheck');
    return r.ok;
  } catch {
    return false;
  }
}

/** 200 with the account, 404 when it does not exist. */
export async function findAccount(externalKey) {
  const r = await kb('/1.0/kb/accounts', { query: { externalKey } });
  if (r.status === 200) return r.json;
  if (r.status === 404) return null;
  throw Object.assign(new Error(`killbill account lookup ${r.status}`), { status: r.status });
}

export async function createAccount({ externalKey, name, email, currency = 'USD', country = 'US' }) {
  const r = await kb('/1.0/kb/accounts', {
    method: 'POST',
    query: { createdBy: 'vela-storefront' },
    body: { name, externalKey, email, currency, country },
  });
  if (r.status !== 201) {
    const existing = await findAccount(externalKey);
    if (existing) return existing;
    throw Object.assign(new Error(`killbill account create ${r.status}: ${r.text}`), { status: r.status });
  }
  return await findAccount(externalKey);
}

/** Create an external charge invoice for the exact amount. */
export async function createExternalCharge({ accountId, amount, currency = 'USD', description }) {
  const r = await kb(`/1.0/kb/invoices/charges/${accountId}`, {
    method: 'POST',
    query: { createdBy: 'vela-storefront', autoCommit: 'true', payInvoice: 'false' },
    body: [
      {
        accountId,
        itemType: 'EXTERNAL_CHARGE',
        amount,
        currency,
        description,
        startDate: new Date().toISOString().slice(0, 10),
      },
    ],
  });
  if (!r.ok) {
    throw Object.assign(new Error(`killbill charge ${r.status}: ${r.text}`), { status: r.status });
  }
  const items = Array.isArray(r.json) ? r.json : [];
  return { invoiceId: items[0]?.invoiceId || null, items };
}

export async function invoicesForAccount(accountId) {
  const r = await kb(`/1.0/kb/accounts/${accountId}/invoices`, { query: { withItems: false } });
  if (!r.ok) return [];
  return Array.isArray(r.json) ? r.json : [];
}

/** Every invoice, with the real amount read from each invoice document. */
export async function listInvoices({ limit = 100 } = {}) {
  const r = await kb('/1.0/kb/invoices/pagination', { query: { limit } });
  if (!r.ok) throw new Error(`killbill invoice pagination ${r.status}`);
  const list = Array.isArray(r.json) ? r.json : [];
  const out = [];
  for (const inv of list) {
    const d = await kb(`/1.0/kb/invoices/${inv.invoiceId}`);
    out.push(d.ok ? d.json : inv);
  }
  return out;
}

export async function findInvoiceFor({ externalKey, amount, currency = 'USD' }) {
  const account = await findAccount(externalKey);
  if (!account) return null;
  const target = Number(amount).toFixed(2);
  for (const inv of await invoicesForAccount(account.accountId)) {
    const d = inv.amount === undefined ? await kb(`/1.0/kb/invoices/${inv.invoiceId}`).then((x) => x.json) : inv;
    const amt = Number(d.amount ?? 0).toFixed(2);
    if (amt === target && String(d.currency || '').toUpperCase() === String(currency).toUpperCase()) return d;
  }
  return null;
}
