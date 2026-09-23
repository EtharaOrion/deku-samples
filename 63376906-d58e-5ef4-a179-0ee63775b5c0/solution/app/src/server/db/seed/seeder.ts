import type pg from 'pg';
import { appendEntry, type RecordEntry } from '../../record/entries.js';

interface SeedAct {
  person: string;
  at: string;
  act: string;
  object: string;
  content?: unknown;
}

const isJsonValue = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !(value instanceof Date);

/** Inserts pinned rows and records the act that produced each of them. */
export class Seeder {
  constructor(readonly client: pg.PoolClient) {}

  async insert(table: string, row: Record<string, unknown>): Promise<void> {
    const columns = Object.keys(row);
    const params = columns.map((column) => {
      const value = row[column];
      return isJsonValue(value) ? JSON.stringify(value) : value;
    });
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    await this.client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      params,
    );
  }

  act(input: SeedAct): Promise<RecordEntry> {
    return appendEntry(this.client, { ...input, outcome: 'recorded' });
  }
}

/** Builds an ISO instant from a date and a clock time, both in UTC. */
export const instant = (date: string, time = '09:00:00'): string => `${date}T${time}Z`;
