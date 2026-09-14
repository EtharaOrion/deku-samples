-- Cirrus schema. Seven tables, timestamps UTC.
CREATE TABLE IF NOT EXISTS houses (
    id          text PRIMARY KEY,
    slug        text NOT NULL UNIQUE,
    name        text NOT NULL,
    tagline_upper text NOT NULL,
    tagline_lower text NOT NULL,
    street      text NOT NULL,
    city        text NOT NULL,
    district    text NOT NULL,
    contact_email text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    id            text PRIMARY KEY,
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role          text NOT NULL CHECK (role IN ('producer','viewer')),
    house_id      text REFERENCES houses(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
    id           text PRIMARY KEY,
    house_id     text NOT NULL REFERENCES houses(id),
    kind         text NOT NULL CHECK (kind IN ('work','talent')),
    slug         text NOT NULL,
    title        text NOT NULL,
    position     integer NOT NULL,
    discipline   text CHECK (discipline IN ('director','photographer','stylist')),
    variant      text NOT NULL DEFAULT 'left' CHECK (variant IN ('left','right','centre')),
    published    boolean NOT NULL DEFAULT false,
    published_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    -- slug uniqueness per house per kind; application always writes lowercased slugs
    CONSTRAINT items_slug_unique UNIQUE (house_id, kind, slug),
    CONSTRAINT items_discipline_shape CHECK (
        (kind = 'talent' AND discipline IS NOT NULL AND variant IS NOT NULL)
        OR (kind = 'work' AND variant IS NOT NULL AND discipline IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS items_house_kind_pub ON items (house_id, kind, published, position);

CREATE TABLE IF NOT EXISTS media (
    id         text PRIMARY KEY,
    item_id    text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role       text NOT NULL CHECK (role IN ('poster','reel','gallery')),
    position   integer NOT NULL DEFAULT 0,
    seed       bigint NOT NULL,
    width      integer NOT NULL,
    height     integer NOT NULL,
    alt        text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item ON media (item_id, position);

CREATE TABLE IF NOT EXISTS credits (
    id             text PRIMARY KEY,
    item_id        text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position       integer NOT NULL DEFAULT 0,
    role           text NOT NULL,
    name           text NOT NULL,
    talent_item_id text REFERENCES items(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credits_item ON credits (item_id, position);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id         text PRIMARY KEY,
    token      text NOT NULL UNIQUE,
    item_id    text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_by text REFERENCES accounts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id         text PRIMARY KEY,
    house_id   text NOT NULL REFERENCES houses(id),
    kind       text NOT NULL,
    old_slug   text NOT NULL,
    item_id    text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT slug_redirects_unique UNIQUE (house_id, kind, old_slug)
);
