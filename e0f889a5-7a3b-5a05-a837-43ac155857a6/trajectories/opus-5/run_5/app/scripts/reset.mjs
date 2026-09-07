// Returns the database to its seeded state so the graded journey allocates
// VE-2026-0002. Voids any invoice this app raised on the seeded accounts too,
// so the billing platform matches.
import { pool } from '../server/lib/db.js';
import { migrateAndSeed } from '../server/db/seed.js';

const KB = process.env.PAYMENTS_API_URL;
const headers = {
  Authorization: `Basic ${Buffer.from(`${process.env.PAYMENTS_ADMIN_USER}:${process.env.PAYMENTS_ADMIN_PASSWORD}`).toString('base64')}`,
  'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY,
  'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET,
  'X-Killbill-CreatedBy': 'reset',
  'Content-Type': 'application/json',
};

async function voidInvoicesFor(externalKey) {
  const acc = await fetch(`${KB}/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`, { headers });
  if (acc.status !== 200) return 0;
  const account = await acc.json();
  const res = await fetch(
    `${KB}/1.0/kb/accounts/${account.accountId}/invoices?includeInvoiceComponents=true`,
    { headers },
  );
  if (res.status !== 200) return 0;
  const invoices = await res.json();
  let voided = 0;
  for (const inv of invoices) {
    if (inv.status === 'VOID') continue;
    const r = await fetch(`${KB}/1.0/kb/invoices/${inv.invoiceId}/voidInvoice`, { method: 'PUT', headers });
    if (r.status === 204) voided += 1;
  }
  return voided;
}

console.log('dropping app tables');
await pool.query(`
  DROP TABLE IF EXISTS account_seen_release, flash_session, device_ownership, device,
    idempotency_key, order_line, "order", order_number_seq, cart_line, cart,
    product_block, inventory_level, variant, product, firmware, app_release,
    auth_token, customer CASCADE;
`);

await migrateAndSeed();

const KEYS = [
  'customer@example.com', 'customer2@example.com',
  'race-a@example.com', 'race-b@example.com', 'twice@example.com',
];
for (const key of KEYS) {
  const n = await voidInvoicesFor(key);
  if (n) console.log(`voided ${n} invoice(s) on ${key}`);
}

// Clear the mailbox too, so a count after a walk is a count of that walk.
try {
  const r = await fetch('http://mailpit:8025/api/v1/messages', { method: 'DELETE' });
  console.log(`mailbox cleared: ${r.status}`);
} catch {
  console.log('mailbox not reachable');
}

const { rows } = await pool.query(`SELECT number FROM "order" ORDER BY id`);
console.log('orders now:', rows.map((r) => r.number).join(', ') || 'none');
await pool.end();
