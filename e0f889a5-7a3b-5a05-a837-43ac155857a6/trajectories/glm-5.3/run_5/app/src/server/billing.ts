import { env } from './env.js';
import { logEvent } from './log.js';

/**
 * Thin client for the billing platform. It is a billing platform, not a card
 * processor: there is no card, no token and no decline.
 */
function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization:
      'Basic ' + Buffer.from(`${env.paymentsAdminUser}:${env.paymentsAdminPassword}`).toString('base64'),
    'X-Killbill-ApiKey': env.paymentsKey,
    'X-Killbill-ApiSecret': env.paymentsSecret,
    'X-Killbill-CreatedBy': env.paymentsAdminUser,
    ...extra,
  };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const started = Date.now();
  const res = await fetch(`${env.paymentsUrl}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...headers() },
    signal: AbortSignal.timeout(20_000),
  });
  logEvent('billing.request', { path, status: res.status, ms: Date.now() - started });
  return res;
}

export type BillingAccount = { accountId: string; externalKey: string; email: string; currency: string };

/** 200 when the account exists, 404 when it does not. */
export async function findAccount(externalKey: string): Promise<BillingAccount | null> {
  const res = await request(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`billing account lookup failed: ${res.status}`);
  return (await res.json()) as BillingAccount;
}

export async function createAccount(input: {
  name: string; externalKey: string; email: string;
}): Promise<BillingAccount> {
  const res = await request('/1.0/kb/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      externalKey: input.externalKey,
      email: input.email,
      currency: 'USD',
      country: 'US',
    }),
  });
  // A second create with a used externalKey is refused by the platform.
  if (res.status === 409 || res.status === 400) {
    const existing = await findAccount(input.externalKey);
    if (existing) return existing;
  }
  if (!res.ok && res.status !== 201) throw new Error(`billing account create failed: ${res.status}`);
  const location = res.headers.get('Location') || '';
  const accountId = location.split('/').filter(Boolean).pop() || '';
  if (accountId) return { accountId, externalKey: input.externalKey, email: input.email, currency: 'USD' };
  const found = await findAccount(input.externalKey);
  if (!found) throw new Error('billing account create returned no account');
  return found;
}

/** Fetch the account for a key, creating it exactly once when it is missing. */
export async function ensureAccount(externalKey: string, email: string, name: string): Promise<BillingAccount> {
  const existing = await findAccount(externalKey);
  if (existing) return existing;
  return createAccount({ externalKey, email, name });
}

export type RaisedInvoice = {
  invoiceId: string;
  amount: number;
  currency: string;
  status: string;
};

/** Raise one invoice for an exact total. autoCommit is required for the total to read back. */
export async function raiseInvoice(
  accountId: string,
  totalMinor: number,
  description: string,
): Promise<RaisedInvoice> {
  const amount = (Math.trunc(totalMinor) / 100).toFixed(2);
  const res = await request(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { amount: Number(amount), currency: 'USD', itemType: 'EXTERNAL_CHARGE', description, quantity: 1 },
    ]),
  });
  if (!res.ok) throw new Error(`billing invoice create failed: ${res.status}`);
  const items = (await res.json()) as Array<{ invoiceId: string }>;
  const invoiceId = items?.[0]?.invoiceId;
  if (!invoiceId) throw new Error('billing invoice create returned no invoice');
  return { invoiceId, amount: Number(amount), currency: 'USD', status: 'COMMITTED' };
}

export async function listInvoices(): Promise<Array<{ amount: number; currency: string; accountId: string; invoiceId: string }>> {
  const out: Array<{ amount: number; currency: string; accountId: string; invoiceId: string }> = [];
  let offset = 0;
  for (;;) {
    const res = await request(`/1.0/kb/invoices/pagination?offset=${offset}&limit=100`);
    if (!res.ok) throw new Error(`billing invoice list failed: ${res.status}`);
    const page = (await res.json()) as typeof out;
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 100) break;
    offset += 100;
  }
  return out;
}
