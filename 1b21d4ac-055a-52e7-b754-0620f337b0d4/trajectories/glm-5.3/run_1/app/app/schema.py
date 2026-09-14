"""SQL DDL for the seven tables. Slug uniqueness is held by the database."""
from psycopg import sql

DDL = [
    """CREATE TABLE IF NOT EXISTS houses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        tagline_upper TEXT NOT NULL,
        tagline_lower TEXT NOT NULL,
        street TEXT NOT NULL,
        city TEXT NOT NULL,
        district TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('producer','viewer')),
        house_id UUID REFERENCES houses(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('work','talent')),
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        position INTEGER NOT NULL,
        discipline TEXT CHECK (discipline IN ('director','photographer','stylist')),
        variant TEXT CHECK (variant IN ('left','right','centre')),
        published BOOLEAN NOT NULL DEFAULT FALSE,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (house_id, kind, slug)
    )""",
    """CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
        position INTEGER NOT NULL DEFAULT 0,
        seed TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        alt TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS credits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        talent_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS preview_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT NOT NULL UNIQUE,
        item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS slug_redirects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        old_slug TEXT NOT NULL,
        item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (house_id, kind, old_slug)
    )""",
    """CREATE TABLE IF NOT EXISTS bearer_tokens (
        token TEXT PRIMARY KEY,
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    "CREATE INDEX IF NOT EXISTS items_house_kind_pos ON items (house_id, kind, position)",
    "CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id)",
    "CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS items_slug_lower_idx ON items (house_id, kind, lower(slug))",
]


def apply_schema(conn):
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        for stmt in DDL:
            cur.execute(stmt)
    conn.commit()
