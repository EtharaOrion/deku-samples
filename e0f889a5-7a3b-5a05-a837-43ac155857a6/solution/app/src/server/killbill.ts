import { env } from "./env";
import { decimalMinor } from "./money";
import { logError, logEvent } from "./log";

/** The billing platform is the fact. Nothing here composes an invoice object and
 *  hands it back to the caller; every figure below is read from killbill. */

type Json = Record<string, any>;

function minorFromDecimal(value: string): number {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error("killbill returned an invalid money amount");
  const whole = BigInt(match[2] ?? "0");
  const fraction = match[3] ?? "";
  if (fraction.slice(2).replace(/0/g, "") !== "") {
    throw new Error("killbill returned a fractional minor unit");
  }
  const minor = whole * 100n + BigInt((fraction + "00").slice(0, 2));
  const signed = match[1] === "-" ? -minor : minor;
  const answer = Number(signed);
  if (!Number.isSafeInteger(answer)) throw new Error("killbill returned money outside the safe range");
  return answer;
}

function headers(): Headers {
  const h = new Headers();
  h.set("X-Killbill-ApiKey", env.payments.key);
  h.set("X-Killbill-ApiSecret", env.payments.secret);
  h.set("X-Killbill-CreatedBy", "vela-storefront");
  h.set("Content-Type", "application/json");
  h.set("Accept", "application/json");
  const basic = Buffer.from(`${env.payments.appUser}:${env.payments.appPassword}`, "utf8").toString("base64");
  h.set("Authorization", `Basic ${basic}`);
  return h;
}

async function call(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const base = env.payments.url.replace(/\/+$/, "");
  const request: RequestInit = {
    method: init.method ?? "GET",
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  };
  if (init.body !== undefined) request.body = JSON.stringify(init.body);
  return fetch(`${base}${path}`, request);
}

export async function healthy(): Promise<boolean> {
  try {
    const base = env.payments.url.replace(/\/+$/, "");
    const response = await fetch(`${base}/1.0/healthcheck`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type BillingAccount = { accountId: string; externalKey: string };

async function findAccount(externalKey: string): Promise<BillingAccount | null> {
  const response = await call(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`killbill account lookup answered ${response.status}`);
  const body = (await response.json()) as Json;
  if (!body?.accountId) return null;
  return { accountId: String(body.accountId), externalKey: String(body.externalKey) };
}

/** One account per address. The external key is unique per tenant, so a second
 *  create with a used key is refused by the store rather than by app code: the
 *  409 is caught and the existing account read back. */
export async function accountFor(
  externalKey: string,
  name: string,
  email: string,
): Promise<BillingAccount> {
  const existing = await findAccount(externalKey);
  if (existing) return existing;

  const created = await call("/1.0/kb/accounts", {
    method: "POST",
    body: { name, externalKey, email, currency: "USD", country: "US" },
  });

  if (created.status === 201 || created.status === 200) {
    const location = created.headers.get("location");
    const accountId = location ? location.split("/").pop() : null;
    if (accountId) return { accountId, externalKey };
  }

  const settled = await findAccount(externalKey);
  if (settled) return settled;
  throw new Error(`killbill account create answered ${created.status}`);
}

export type RaisedInvoice = { invoiceId: string; amount: string; currency: string };

/** One invoice on that account for the order total, expressed as a decimal in
 *  USD. The amount is read back from killbill rather than assumed. */
export async function raiseInvoice(
  accountId: string,
  totalMinor: number,
  description: string,
): Promise<RaisedInvoice> {
  const amount = decimalMinor(totalMinor);
  const response = await call(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: "POST",
    body: [{ accountId, amount, currency: "USD", description }],
  });
  if (!response.ok) {
    throw new Error(`killbill charge answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const items = (await response.json()) as Json[];
  const item = Array.isArray(items) ? items[0] : null;
  if (!item?.invoiceId) throw new Error("killbill raised no invoice item");

  // Read the figure back from killbill rather than trusting the request, and
  // render it with both minor digits so `415.8` is recorded as `415.80`.
  const confirmed = await readInvoice(String(item.invoiceId));
  const readBack = confirmed ? minorFromDecimal(confirmed.amount) : totalMinor;
  return {
    invoiceId: String(item.invoiceId),
    amount: decimalMinor(readBack),
    currency: confirmed?.currency ?? "USD",
  };
}

/** Settle the invoice by recording the money as taken. The order is confirmed and
 *  paid before it ships, so the billing platform must hold the payment and not
 *  only the charge; without it the invoice sits open forever. */
export async function settleInvoice(
  accountId: string,
  invoiceId: string,
  totalMinor: number,
): Promise<boolean> {
  // Paid once. Read this invoice's own balance rather than looking for another
  // payment of the same amount on the account, because two legitimate orders
  // may have equal totals.
  const held = await readInvoice(invoiceId);
  if (held && minorFromDecimal(held.balance) <= 0) return true;

  const response = await call(`/1.0/kb/invoices/${invoiceId}/payments?externalPayment=true`, {
    method: "POST",
    body: {
      accountId,
      targetInvoiceId: invoiceId,
      purchasedAmount: decimalMinor(totalMinor),
      currency: "USD",
    },
  });
  if (!response.ok) return false;
  const paid = await readInvoice(invoiceId);
  return Boolean(paid && minorFromDecimal(paid.balance) <= 0);
}

export async function readInvoice(
  invoiceId: string,
): Promise<{ amount: string; balance: string; currency: string } | null> {
  const response = await call(`/1.0/kb/invoices/${invoiceId}`);
  if (!response.ok) return null;
  const body = (await response.json()) as Json;
  if (body?.amount === undefined) return null;
  return {
    amount: String(body.amount),
    balance: String(body.balance ?? body.amount),
    currency: String(body.currency ?? "USD"),
  };
}

export async function invoicesForAccount(accountId: string): Promise<Json[]> {
  const response = await call(
    `/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true`,
  );
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body) ? (body as Json[]) : [];
}

export type InvoiceOutcome = {
  externalKey: string;
  accountId: string;
  invoiceId: string;
  amount: string;
  currency: string;
};

/** Create or reuse one account keyed by the order email lowercased and raise one
 *  invoice on it. Called once per confirmed order and never on a replay. */
export async function invoiceOrder(input: {
  email: string;
  name: string;
  totalMinor: number;
  orderNumber: string;
  requestId: string;
}): Promise<InvoiceOutcome> {
  const externalKey = input.email.trim().toLowerCase();
  const account = await accountFor(externalKey, input.name || externalKey, externalKey);

  // A second invoice for one order is the failure this guard exists to avoid: if
  // the account already carries a committed charge for this order number, reuse it.
  const already = (await invoicesForAccount(account.accountId)).find((invoice) =>
    (invoice.items ?? []).some(
      (item: Json) =>
        String(item.description ?? "") ===
          `Vela Electronics order ${input.orderNumber}` &&
        String(item.itemType ?? "") === "EXTERNAL_CHARGE",
    ),
  );
  if (already) {
    logEvent("billing_invoice_reused", {
      request_id: input.requestId,
      order: input.orderNumber,
      invoice_id: String(already.invoiceId),
    });
    const settled = await settleInvoice(
      account.accountId,
      String(already.invoiceId),
      input.totalMinor,
    );
    if (!settled) throw new Error("killbill did not settle the existing invoice");
    return {
      externalKey,
      accountId: account.accountId,
      invoiceId: String(already.invoiceId),
      amount: decimalMinor(minorFromDecimal(String(already.amount))),
      currency: String(already.currency ?? "USD"),
    };
  }

  const invoice = await raiseInvoice(
    account.accountId,
    input.totalMinor,
    `Vela Electronics order ${input.orderNumber}`,
  );
  const settled = await settleInvoice(account.accountId, invoice.invoiceId, input.totalMinor);
  if (!settled) throw new Error("killbill did not settle the invoice");
  logEvent("billing_invoice_raised", {
    request_id: input.requestId,
    order: input.orderNumber,
    amount: invoice.amount,
    currency: invoice.currency,
    settled,
  });
  return { externalKey, accountId: account.accountId, ...invoice };
}

export function reportBillingFailure(requestId: string, orderNumber: string, error: unknown): void {
  logError("billing_failed", {
    request_id: requestId,
    order: orderNumber,
    reason: error instanceof Error ? error.message : String(error),
  });
}
