import { env } from './env.mjs';
import { minorToDecimalString } from './env.mjs';

const base = () => env.kb.url;

function headers(extra = {}) {
  const h = {
    'X-Killbill-ApiKey': env.kb.key,
    'X-Killbill-ApiSecret': env.kb.secret,
    'X-Killbill-CreatedBy': 'vela-storefront',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  return { ...h, ...extra };
}

function auth() {
  return 'Basic ' + Buffer.from(`${env.kb.user}:${env.kb.pass}`).toString('base64');
}

async function req(path, init = {}) {
  const res = await fetch(base() + path, {
    ...init,
    headers: { ...headers(init.headers || {}), Authorization: auth() },
  });
  let body = null;
  const txt = await res.text();
  try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
  return { status: res.status, body, headers: res.headers };
}

export async function health() {
  try {
    const r = await fetch(base() + '/1.0/healthcheck');
    return r.ok;
  } catch { return false; }
}

export async function findAccount(externalKey) {
  const r = await req(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (r.status === 200) return r.body;
  if (r.status === 404) return null;
  throw new Error(`killbill account lookup failed (${r.status})`);
}

export async function createAccount({ name, externalKey, email, currency = 'USD', country = 'US' }) {
  const r = await req('/1.0/kb/accounts', {
    method: 'POST',
    body: JSON.stringify({ name, externalKey, email, currency, country }),
  });
  if (r.status === 201) {
    const loc = r.headers.get('location') || '';
    const id = loc.split('/').pop();
    return { accountId: id, ...r.body };
  }
  if (r.status === 400 && /externalKey|already|exist/i.test(JSON.stringify(r.body || ''))) {
    const existing = await findAccount(externalKey);
    if (existing) return existing;
  }
  throw new Error(`killbill account create failed (${r.status}) ${JSON.stringify(r.body).slice(0, 200)}`);
}

export async function ensureAccount({ name, externalKey, email, currency, country }) {
  const existing = await findAccount(externalKey);
  if (existing) return existing;
  return createAccount({ name, externalKey, email, currency, country });
}

/** One invoice for the exact order total. Uses an external charge on a committed invoice. */
export async function createInvoice({ accountId, description, totalMinor, currency = 'USD' }) {
  const amount = minorToDecimalString(totalMinor);
  const r = await req(
    `/1.0/kb/invoices/charges/${encodeURIComponent(accountId)}?pluginProperty=__external_charge__&autoCommit=true`,
    {
      method: 'POST',
      body: JSON.stringify([
        { accountId, description, quantity: 1, itemType: 'EXTERNAL_CHARGE', amount: Number(amount), currency },
      ]),
    }
  );
  if (r.status !== 200 || !Array.isArray(r.body) || r.body.length === 0) {
    throw new Error(`killbill invoice create failed (${r.status}) ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  const item = r.body[0];
  const invoice = await getInvoice(item.invoiceId);
  return { invoiceId: item.invoiceId, amount: invoice.amount, currency: invoice.currency, status: invoice.status };
}

export async function getInvoice(invoiceId) {
  const r = await req(`/1.0/kb/invoices/${encodeURIComponent(invoiceId)}`);
  if (r.status !== 200) throw new Error(`killbill invoice get failed (${r.status})`);
  return r.body;
}

/** Exact-total invoice lookup for an account, tolerating pagination's 0.00 amount quirk. */
export async function findInvoiceWithAmount({ externalKey, amountMinor, currency = 'USD' }) {
  const acct = await findAccount(externalKey);
  if (!acct) return null;
  const want = minorToDecimalString(amountMinor);
  let offset = 0;
  for (let i = 0; i < 200; i++) {
    const r = await req(`/1.0/kb/invoices/pagination?offset=${offset}&limit=100`);
    if (r.status !== 200) throw new Error(`killbill invoice pagination failed (${r.status})`);
    const list = Array.isArray(r.body) ? r.body : [];
    for (const inv of list) {
      if (!inv.accountId || inv.accountId !== acct.accountId) continue;
      const amt = Number(inv.amount || 0);
      if (Math.abs(amt - Number(want)) < 0.005 && String(inv.currency || '').toUpperCase() === currency) return inv;
      if (amt === 0 && inv.items && inv.items.length) continue;
    }
    if (list.length < 100) break;
    offset += 100;
  }
  return null;
}

/** The invoice an order already raised, so a re-seed or a retried confirmation
 *  never raises a second one. Matches on the order's own description AND its
 *  exact amount: an invoice that carries the same order number but a different
 *  figure belongs to a different order and must not be reused.
 *  The pagination payload reports `items: []`, so each candidate is read back
 *  from its own detail endpoint, which does return the items. */
export async function findInvoiceByDescription(accountId, description, amountMinor) {
  const want = amountMinor === undefined ? null : Number(minorToDecimalString(amountMinor));
  let offset = 0;
  for (let page = 0; page < 200; page++) {
    const r = await req(`/1.0/kb/invoices/pagination?offset=${offset}&limit=100`);
    if (r.status !== 200) throw new Error(`killbill invoice pagination failed (${r.status})`);
    const list = Array.isArray(r.body) ? r.body : [];
    for (const inv of list) {
      if (inv.accountId !== accountId) continue;
      const detail = await getInvoice(inv.invoiceId);
      const items = Array.isArray(detail.items) ? detail.items : [];
      if (!items.some((it) => it.description === description)) continue;
      if (want === null) return detail;
      const amt = Number(detail.amount);
      if (Number.isFinite(amt) && Math.abs(amt - want) < 0.005) return detail;
    }
    if (list.length < 100) break;
    offset += 100;
  }
  return null;
}
