import { findAccount, createAccount, createExternalCharge } from './killbill.js';
import { centsToDecimalString } from './money.js';

/**
 * One killbill account keyed by the order email lowercased, one invoice for the
 * order total in USD. Returns the externalKey and the decimal amount.
 */
export async function raiseInvoiceForOrder(order) {
  const externalKey = String(order.email).toLowerCase();
  let account = await findAccount(externalKey);
  if (!account) {
    await createAccount({
      externalKey,
      name: order.shipping_address?.name || externalKey,
      email: order.email,
      currency: 'USD',
      country: order.shipping_address?.country || 'US',
    });
    account = await findAccount(externalKey);
  }
  if (!account) throw new Error('killbill account unavailable');

  const amount = Number(centsToDecimalString(order.total_minor));
  const charge = await createExternalCharge({
    accountId: account.accountId,
    amount,
    currency: 'USD',
    description: `Vela store order ${order.number}`,
  });
  return {
    externalKey,
    amount: centsToDecimalString(order.total_minor),
    invoice_id: charge.invoiceId,
  };
}

/** Used by seeding when an order must exist against a pre-created account. */
export async function createAccountIfMissing({ externalKey, name, email }) {
  const existing = await findAccount(externalKey);
  if (existing) return existing;
  await createAccount({ externalKey, name, email, currency: 'USD', country: 'US' });
  return findAccount(externalKey);
}
