import { SCHEMA_SQL } from './schema.js';

export const EXTRA_SCHEMA = `
CREATE TABLE IF NOT EXISTS tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens (token_hash);
`;
export const ALL_SCHEMA = SCHEMA_SQL + '\n' + EXTRA_SCHEMA;
