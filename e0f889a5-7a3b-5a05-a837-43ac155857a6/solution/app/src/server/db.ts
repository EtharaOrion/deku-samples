import pg from "pg";
import { env } from "./env";

/** Counts arrive from PostgreSQL as strings by default; money and stock are
 *  integers in this app, so bigint and numeric are read back as numbers. */
pg.types.setTypeParser(20, (value: string) => Number(value));
pg.types.setTypeParser(1700, (value: string) => Number(value));
// A calendar date is a date, not an instant: keep it as the ISO day it was
// written as, so a support date never shifts with the reader's clock.
pg.types.setTypeParser(1082, (value: string) => value);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", () => {
  /* a dropped idle client is replaced by the pool on the next checkout */
});

export type Row = Record<string, any>;

export async function query<T extends Row = Row>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params as any[]);
  return result.rows as T[];
}

export async function one<T extends Row = Row>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export type Tx = {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  one<T extends Row = Row>(text: string, params?: unknown[]): Promise<T | null>;
};

/** One transaction, committed on return and rolled back on any throw, so a
 *  refusal in the middle of a write leaves no half-written row behind. */
export async function transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tx: Tx = {
      async query<R extends Row = Row>(
        text: string,
        params: unknown[] = [],
      ): Promise<R[]> {
        const result = await client.query(text, params as any[]);
        return result.rows as R[];
      },
      async one<R extends Row = Row>(
        text: string,
        params: unknown[] = [],
      ): Promise<R | null> {
        const result = await client.query(text, params as any[]);
        return (result.rows[0] as R) ?? null;
      },
    };
    const value = await run(tx);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* the connection is already gone; the server discarded the transaction */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** PostgreSQL error codes this app reads rather than guesses at. */
export const PG = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  serializationFailure: "40001",
  deadlock: "40P01",
};

export function pgCode(error: unknown): string | undefined {
  return (error as { code?: string })?.code;
}
