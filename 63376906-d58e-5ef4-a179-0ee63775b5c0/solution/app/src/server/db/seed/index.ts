import { one, transaction } from '../pool.js';
import { seedLedger } from './ledger.js';
import { seedOperations } from './operations.js';
import { seedPublic } from './public.js';
import { Seeder } from './seeder.js';

/** Inserts the pinned rows once, in a single transaction, recording one entry per seeded act. */
export async function seedIfEmpty(): Promise<boolean> {
  const existing = await one<{ count: number }>('SELECT count(*) AS count FROM site');
  if (existing && existing.count > 0) return false;
  await transaction(async (client) => {
    const seeder = new Seeder(client);
    await seedOperations(seeder);
    await seedLedger(seeder);
    await seedPublic(seeder);
  });
  return true;
}
