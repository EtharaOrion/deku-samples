const BASE = (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.PAYMENTS_API_KEY || '';
const API_SECRET = process.env.PAYMENTS_API_SECRET || '';
const ADMIN_USER = process.env.PAYMENTS_ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.PAYMENTS_ADMIN_PASSWORD || '';

function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64');
}

export function killbillConfigured(): boolean {
  return Boolean(BASE);
}

export async function kbFetch<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T | any; headers: Record<string, string> }> {
  const headers: Record<string, string> = {
    Authorization: basicAuth(),
    'X-Killbill-ApiKey': API_KEY,
    'X-Killbill-ApiSecret': API_SECRET,
    'X-Killbill-CreatedBy': ADMIN_USER,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const location = res.headers.get('location') || '';
  let body: any = null;
  const text = await res.text();
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  return { status: res.status, body, headers: { location } };
}

export function accountIdFromLocation(location: string): string | null {
  if (!location) return null;
  const m = location.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

export async function getAccountByExternalKey(externalKey: string) {
  return kbFetch(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
}

export async function createAccount(input: { name: string; externalKey: string; email: string; currency: string; country: string }) {
  return kbFetch('/1.0/kb/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      externalKey: input.externalKey,
      email: input.email,
      currency: input.currency,
      country: input.country,
    }),
  });
}

export async function createInvoiceItem(accountId: string, item: {
  description: string; amount: number; currency: string; startDate: string;
}) {
  // External charge: a bare array of items, auto-committed so it is a real invoice.
  return kbFetch(`/1.0/kb/invoices/charges/${encodeURIComponent(accountId)}?autoCommit=true`, {
    method: 'POST',
    body: JSON.stringify([{
      description: item.description,
      amount: item.amount,
      currency: item.currency,
      startDate: item.startDate,
    }]),
  });
}
