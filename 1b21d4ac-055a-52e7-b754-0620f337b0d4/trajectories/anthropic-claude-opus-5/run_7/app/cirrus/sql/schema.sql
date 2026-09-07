CREATE TABLE IF NOT EXISTS houses (
    id             BIGSERIAL PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    tagline_upper  TEXT NOT NULL DEFAULT '',
    tagline_lower  TEXT NOT NULL DEFAULT '',
    street         TEXT NOT NULL DEFAULT '',
    city           TEXT NOT NULL DEFAULT '',
    district       TEXT NOT NULL DEFAULT '',
    contact_email  TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS accounts (
    id             BIGSERIAL PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('producer','viewer')),
    house_id       BIGINT REFERENCES houses(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    CONSTRAINT accounts_viewer_no_house CHECK (
        (role = 'viewer' AND house_id IS NULL) OR (role = 'producer' AND house_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS items (
    id             BIGSERIAL PRIMARY KEY,
    house_id       BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL CHECK (kind IN ('work','talent')),
    slug           TEXT NOT NULL,
    title          TEXT NOT NULL,
    position       INTEGER NOT NULL DEFAULT 0,
    discipline     TEXT CHECK (discipline IN ('director','photographer','stylist')),
    variant        TEXT CHECK (variant IN ('left','right','centre')),
    published      BOOLEAN NOT NULL DEFAULT FALSE,
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    CONSTRAINT items_slug_lower CHECK (slug = lower(slug))
);

-- Slug uniqueness per house per kind, decided after lowercasing, held at the database.
CREATE UNIQUE INDEX IF NOT EXISTS items_house_kind_slug_key
    ON items (house_id, kind, lower(slug));
CREATE INDEX IF NOT EXISTS items_house_kind_pos_idx ON items (house_id, kind, position, id);

CREATE TABLE IF NOT EXISTS media (
    id             TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
    item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role           TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
    position       INTEGER NOT NULL DEFAULT 0,
    seed           TEXT NOT NULL,
    width          INTEGER NOT NULL CHECK (width > 0),
    height         INTEGER NOT NULL CHECK (height > 0),
    alt            TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id, role, position, id);

CREATE TABLE IF NOT EXISTS credits (
    id             BIGSERIAL PRIMARY KEY,
    item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL DEFAULT 0,
    role           TEXT NOT NULL,
    name           TEXT NOT NULL,
    talent_item_id BIGINT REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id, position, id);
CREATE INDEX IF NOT EXISTS credits_talent_idx ON credits (talent_item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id             BIGSERIAL PRIMARY KEY,
    token          TEXT NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
    item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_by     BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id             BIGSERIAL PRIMARY KEY,
    house_id       BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL CHECK (kind IN ('work','talent')),
    old_slug       TEXT NOT NULL,
    item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE UNIQUE INDEX IF NOT EXISTS slug_redirects_house_kind_old_key
    ON slug_redirects (house_id, kind, old_slug);
