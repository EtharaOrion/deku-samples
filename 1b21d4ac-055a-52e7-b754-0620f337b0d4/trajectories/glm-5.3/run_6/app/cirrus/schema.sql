CREATE TABLE IF NOT EXISTS houses (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  tagline_upper TEXT NOT NULL DEFAULT '',
  tagline_lower TEXT NOT NULL DEFAULT '',
  street       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  district     TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('producer','viewer')),
  house_id      BIGINT REFERENCES houses(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role <> 'producer' OR house_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS items (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  house_id     BIGINT NOT NULL REFERENCES houses(id),
  kind         TEXT NOT NULL CHECK (kind IN ('work','talent')),
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0,
  discipline   TEXT CHECK (discipline IN ('director','photographer','stylist')),
  variant      TEXT CHECK (variant IN ('left','right','centre')),
  published    BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind <> 'work' OR variant IS NOT NULL),
  CHECK (kind <> 'talent' OR discipline IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS items_slug_unique
  ON items (house_id, kind, lower(slug));
CREATE INDEX IF NOT EXISTS items_roster_idx
  ON items (house_id, kind, published, position);

CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
  item_id    BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
  position   INTEGER NOT NULL DEFAULT 0,
  seed       TEXT NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id);

CREATE TABLE IF NOT EXISTS credits (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL DEFAULT 0,
  role           TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL DEFAULT '',
  talent_item_id BIGINT REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token      TEXT NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
  item_id    BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by BIGINT NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  house_id   BIGINT NOT NULL REFERENCES houses(id),
  kind       TEXT NOT NULL CHECK (kind IN ('work','talent')),
  old_slug   TEXT NOT NULL,
  item_id    BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS slug_redirects_unique
  ON slug_redirects (house_id, kind, lower(old_slug));

CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_account_idx ON auth_tokens (account_id);
