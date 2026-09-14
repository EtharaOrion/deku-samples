import { env } from './env.js';
import { ApiError, minorToDecimalString } from './util.js';

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Killbill-ApiKey': env.payments.apiKey,
  'X-Killbill-ApiSecret': env.payments.apiSecret,
  'X-Killbill-CreatedBy': 'vela-store',
  'Authorization': 'Basic ' + Buffer.from(`${env.payments.adminUser}:${env.payments.adminPassword}`).toString('base64')
});

async function call(path, init = {}) {
  const res = await fetch(env.payments.url + path, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

export async function getAccountByKey(externalKey) {
  const r = await call(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (r.status === 200) return r.body;
  if (r.status === 404) return null;
  throw new ApiError(502, 'billing_unavailable', `The billing service did not answer. Reference will reach the team.`);
}

export async function createAccount({ externalKey, name, email }) {
  const r = await call('/1.0/kb/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: name || email, externalKey, email, currency: 'USD', country: 'US' })
  });
  if (r.status === 409) {
    const existing = await getAccountByKey(externalKey);
    if (existing) return existing;
  }
  if (r.status !== 201) throw new ApiError(502, 'billing_account_failed', 'The billing service refused the account.');
  const loc = r.headers.get('location') || '';
  const accountId = loc.split('/').filter(Boolean).pop();
  return await getInvoiceAccount(accountId);
}

async function getInvoiceAccount(accountId) {
  const r = await call(`/1.0/kb/accounts/${accountId}`);
  return r.body;
}

export async function raiseInvoice({ accountId, orderNumber, totalMinor }) {
  const amount = minorToDecimalString(totalMinor);
  const r = await call(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true&payInvoice=false`, {
    method: 'POST',
    body: JSON.stringify([{ itemType: 'EXTERNAL_CHARGE', amount: Number(amount), currency: 'USD', description: `Order ${orderNumber}` }])
  });
  if (r.status !== 200 || !Array.isArray(r.body) || r.body.length === 0) {
    throw new ApiError(502, 'billing_invoice_failed', 'The billing service refused the invoice.');
  }
  const invoiceId = r.body[0].invoiceId;
  const inv = await call(`/1.0/kb/invoices/${invoiceId}`);
  return { invoiceId, amount: inv.body ? inv.body.amount : amount };
}

export async function ensureAccountAndInvoice({ externalKey, name, email, orderNumber, totalMinor }) {
  let account = await getAccountByKey(externalKey);
  if (!account) account = await createAccount({ externalKey, name, email });
  if (!account || !account.accountId) throw new ApiError(502, 'billing_account_failed', 'The billing service did not return the account.');
  const invoice = await raiseInvoice({ accountId: account.accountId, orderNumber, totalMinor });
  return { account, invoice };
}
