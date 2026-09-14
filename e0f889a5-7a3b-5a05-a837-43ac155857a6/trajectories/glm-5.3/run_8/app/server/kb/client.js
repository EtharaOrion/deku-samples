import { env } from '../env.js';

function headers(extra = {}) {
  const h = {
    Authorization: 'Basic ' + Buffer.from(`${env.kb.adminUser}:${env.kb.adminPass}`).toString('base64'),
    'X-Killbill-ApiKey': env.kb.apiKey,
    'X-Killbill-ApiSecret': env.kb.apiSecret,
    'X-Killbill-CreatedBy': 'vela-storefront',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  return Object.assign(h, extra);
}

export async function kbFetch(path, init = {}) {
  const url = `${env.kb.url}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: headers(init.headers || {}),
  });
  return res;
}

export async function kbHealth() {
  try {
    const res = await fetch(`${env.kb.url}/1.0/healthcheck`, { headers: { Accept: 'application/json' } });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAccountByExternalKey(externalKey) {
  const res = await kbFetch(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`killbill account lookup failed: ${res.status}`);
  return await res.json();
}

export async function createAccount({ name, externalKey, email, currency = 'USD', country = 'US' }) {
  const res = await kbFetch(`/1.0/kb/accounts`, {
    method: 'POST',
    body: JSON.stringify({ name, externalKey, email, currency, country }),
  });
  if (!res.ok && res.status !== 201) {
    const text = await res.text().catch(() => '');
    // 409 or similar: fetch and return the existing account.
    if (res.status === 409 || /already exist/i.test(text)) {
      const existing = await getAccountByExternalKey(externalKey);
      if (existing) return existing;
    }
    throw new Error(`killbill account create failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const loc = res.headers.get('location') || '';
  const accountId = res.headers.get('x-killbill-accountid') || (loc.match(/[0-9a-f-]{36}/) || [])[0] || null;
  if (accountId) return { accountId, externalKey };
  return await getAccountByExternalKey(externalKey);
}

export async function createInvoice({ accountId, amountDecimal, description }) {
  const today = new Date().toISOString().slice(0, 10);
  const res = await kbFetch(`/1.0/kb/invoices/charges/${encodeURIComponent(accountId)}?autoCommit=true`, {
    method: 'POST',
    body: JSON.stringify([{ amount: amountDecimal, currency: 'USD', description, quantity: 1, itemDetails: description, startDate: today }]),
  });
  if (!(res.ok || res.status === 201)) {
    const text = await res.text().catch(() => '');
    throw new Error(`killbill invoice create failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const body = await res.json().catch(() => null);
  return { invoiceId: body?.[0]?.invoiceId || null, amount: body?.[0]?.amount ?? amountDecimal };
}

export async function listInvoices({ pageSize = 100, offset = 0 } = {}) {
  const res = await kbFetch(`/1.0/kb/invoices/pagination?offset=${offset}&limit=${pageSize}`);
  if (!res.ok) throw new Error(`killbill invoice pagination failed: ${res.status}`);
  return await res.json();
}
