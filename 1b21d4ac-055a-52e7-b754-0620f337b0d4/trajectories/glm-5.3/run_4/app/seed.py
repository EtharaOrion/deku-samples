"""The seed runs once and is idempotent."""
import hashlib
import secrets

import auth

WORKS = [
    ("the-halo", "The Halo", "left"),
    ("sonder", "Sonder", "right"),
    ("binary", "BINARY", "centre"),
    ("common-ground", "Common Ground", "left"),
    ("nve", "NVE", "right"),
    ("the-absolute-shelter", "The Absolute Shelter", "centre"),
    ("maison-de-lumiere", "MAISON DE LUMIERE", "left"),
    ("loris", "LORIS", "right"),
    ("mdl-serie-extreme", "MDL Serie Extreme", "centre"),
    ("ak", "AK", "left"),
    ("loris-shoot-studio", "Loris Shoot Studio", "right"),
    ("the-radiant", "The Radiant", "centre"),
]

ASPECT = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}

TALENTS = [
    ("rives", "Rives", "director"),
    ("halcyon", "Halcyon", "director"),
    ("camille-ferrand", "Camille Ferrand", "photographer"),
]

UNLISTED_WORK = ("the-quiet-room", "The Quiet Room", "left")
UNLISTED_TALENT = ("noor-vasquez", "Noor Vasquez", "stylist")

MERIDIAN_TALENT = ("sable-ito", "Sable Ito", "director")
MERIDIAN_WORK = ("foundry", "Foundry", "left")

PASSWORD = "deku-demo-pw-2026"

VARIANTS_W = {"left": 598, "right": 300, "centre": 1006}
VARIANTS_H = {"left": 320, "right": 300, "centre": 617}


def _hex32(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _media_id(seed: str) -> str:
    return _hex32("media:" + seed)[:32]


def _one(conn, sql, args):
    return conn.execute(sql, args).fetchone()


def run(conn, house_slug="cirrus"):
    conn.execute("""
create table if not exists houses (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  tagline_upper text not null,
  tagline_lower text not null,
  street text not null,
  city text not null,
  district text not null,
  contact_email text not null,
  created_at timestamptz not null default now()
)""")
    conn.execute("""
create table if not exists accounts (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('producer','viewer')),
  house_id bigint references houses(id),
  created_at timestamptz not null default now()
)""")
    conn.execute("""
create table if not exists items (
  id bigserial primary key,
  house_id bigint not null references houses(id),
  kind text not null check (kind in ('work','talent')),
  slug text not null,
  title text not null,
  position integer not null default 0,
  discipline text check (discipline in ('director','photographer','stylist')),
  variant text check (variant in ('left','right','centre')),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (house_id, kind, slug),
  check (kind <> 'work' or variant is not null),
  check (kind <> 'talent' or discipline is not null)
)""")
    conn.execute("""
create table if not exists media (
  id text primary key,
  item_id bigint not null references items(id) on delete cascade,
  role text not null check (role in ('poster','reel','gallery')),
  position integer not null default 0,
  seed text not null,
  width integer not null,
  height integer not null,
  alt text not null default '',
  created_at timestamptz not null default now()
)""")
    conn.execute("""
create table if not exists credits (
  id bigserial primary key,
  item_id bigint not null references items(id) on delete cascade,
  position integer not null default 0,
  role text not null,
  name text not null,
  talent_item_id bigint references items(id)
)""")
    conn.execute("""
create table if not exists preview_tokens (
  id bigserial primary key,
  token text not null unique,
  item_id bigint not null references items(id) on delete cascade,
  expires_at timestamptz not null,
  created_by bigint references accounts(id),
  created_at timestamptz not null default now()
)""")
    conn.execute("""
create table if not exists slug_redirects (
  id bigserial primary key,
  house_id bigint not null references houses(id),
  kind text not null,
  old_slug text not null,
  item_id bigint not null references items(id),
  created_at timestamptz not null default now(),
  unique (house_id, kind, old_slug)
)""")
    conn.execute("create index if not exists items_house_kind_pos on items (house_id, kind, position)")
    conn.execute("create index if not exists media_item_idx on media (item_id)")
    conn.execute("create index if not exists credits_item_idx on credits (item_id)")
    conn.execute("create index if not exists credits_talent_idx on credits (talent_item_id)")
    conn.execute("create index if not exists preview_tokens_item_idx on preview_tokens (item_id)")
    conn.execute("create index if not exists accounts_house_idx on accounts (house_id)")

    houses = {
        "cirrus": ("cirrus", "Cirrus", "FOR PICTURE", "AND ITS MAKERS", "9 PASSAGE BELLEVUE",
                   "PARIS", "11", "prod@example.com"),
        "meridian": ("meridian", "Meridian", "FOR PICTURE", "AND ITS MAKERS", "12 RUE DES ARCHES",
                     "PARIS", "11", "prod@example.com"),
    }
    house_ids = {}
    for slug, row in houses.items():
        got = _one(conn, "select id from houses where slug=%s", (slug,))
        if got:
            house_ids[slug] = got[0]
        else:
            house_ids[slug] = conn.execute(
                "insert into houses (slug,name,tagline_upper,tagline_lower,street,city,district,contact_email)"
                " values (%s,%s,%s,%s,%s,%s,%s,%s) returning id", row).fetchone()[0]

    accounts = [
        ("producer@example.com", "producer", "cirrus"),
        ("producer.meridian@example.com", "producer", "meridian"),
        ("viewer@example.com", "viewer", None),
    ]
    for email, role, house in accounts:
        got = _one(conn, "select id from accounts where email=%s", (email,))
        if not got:
            conn.execute(
                "insert into accounts (email,password_hash,role,house_id) values (%s,%s,%s,%s)",
                (email, auth.hash_password(PASSWORD), role,
                 house_ids[house] if house else None))

    def ensure_item(house, kind, slug, title, position, discipline=None, variant=None, published=True):
        got = _one(conn, "select id from items where house_id=%s and kind=%s and slug=%s",
                   (house_ids[house], kind, slug))
        if got:
            return got[0]
        return conn.execute(
            "insert into items (house_id,kind,slug,title,position,discipline,variant,published,published_at)"
            " values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
            (house_ids[house], kind, slug, title, position, discipline, variant, published,
             "now()" if published else None)).fetchone()[0]

    def ensure_media(item_id, role, position, seed, w, h, alt):
        mid = _media_id(f"{item_id}:{role}:{position}:{seed}")
        conn.execute(
            "insert into media (id,item_id,role,position,seed,width,height,alt) values (%s,%s,%s,%s,%s,%s,%s,%s)"
            " on conflict (id) do nothing",
            (mid, item_id, role, position, seed, w, h, alt))

    def ensure_credit(item_id, position, role, name, talent_item_id=None):
        got = _one(conn, "select id from credits where item_id=%s and position=%s and role=%s and name=%s",
                   (item_id, position, role, name))
        if not got:
            conn.execute(
                "insert into credits (item_id,position,role,name,talent_item_id) values (%s,%s,%s,%s,%s)",
                (item_id, position, role, name, talent_item_id))

    for i, (slug, title, variant) in enumerate(WORKS, 1):
        iid = ensure_item("cirrus", "work", slug, title, i, variant=variant, published=True)
        w, h = VARIANTS_W[variant], VARIANTS_H[variant]
        ensure_media(iid, "poster", 0, f"poster:{slug}", w, h, f"{title}, still {i:02d}")
        ensure_media(iid, "reel", 1, f"reel:{slug}", w, h, f"{title}, moving image")
        for g in range(3):
            vw = VARIANTS_W[["left", "right", "centre"][g % 3]]
            vh = VARIANTS_H[["left", "right", "centre"][g % 3]]
            ensure_media(iid, "gallery", 2 + g, f"gallery:{slug}:{g}", vw, vh,
                         f"{title}, frame {g + 1}")

    iid = ensure_item("cirrus", "work", UNLISTED_WORK[0], UNLISTED_WORK[1], 90,
                      variant=UNLISTED_WORK[2], published=False)
    ensure_media(iid, "poster", 0, "poster:the-quiet-room", 598, 320,
                 "The Quiet Room, still")

    for i, (slug, title, disc) in enumerate(TALENTS, 1):
        iid = ensure_item("cirrus", "talent", slug, title, i, discipline=disc, published=True)
        ensure_media(iid, "poster", 0, f"portrait:{slug}", 246, 330,
                     f"{title}, {disc}")
        ensure_media(iid, "reel", 1, f"portrait-reel:{slug}", 246, 330,
                     f"{title}, moving portrait")

    iid = ensure_item("cirrus", "talent", UNLISTED_TALENT[0], UNLISTED_TALENT[1], 90,
                      discipline=UNLISTED_TALENT[2], published=False)
    ensure_media(iid, "poster", 0, "portrait:noor-vasquez", 246, 330,
                 "Noor Vasquez, stylist")

    rives = _one(conn, "select id from items where house_id=%s and kind='talent' and slug='rives'",
                 (house_ids["cirrus"],))[0]
    halcyon = _one(conn, "select id from items where house_id=%s and kind='talent' and slug='halcyon'",
                   (house_ids["cirrus"],))[0]
    camille = _one(conn, "select id from items where house_id=%s and kind='talent' and slug='camille-ferrand'",
                   (house_ids["cirrus"],))[0]
    halo = _one(conn, "select id from items where house_id=%s and kind='work' and slug='the-halo'",
                (house_ids["cirrus"],))[0]
    sonder = _one(conn, "select id from items where house_id=%s and kind='work' and slug='sonder'",
                  (house_ids["cirrus"],))[0]
    loris = _one(conn, "select id from items where house_id=%s and kind='work' and slug='loris'",
                 (house_ids["cirrus"],))[0]

    ensure_credit(halo, 0, "Director", "Rives", rives)
    ensure_credit(sonder, 0, "Director", "Halcyon", halcyon)
    ensure_credit(loris, 0, "Photographer", "Camille Ferrand", camille)

    iid = ensure_item("meridian", "talent", MERIDIAN_TALENT[0], MERIDIAN_TALENT[1], 1,
                      discipline=MERIDIAN_TALENT[2], published=True)
    ensure_media(iid, "poster", 0, "portrait:sable-ito", 246, 330, "Sable Ito, director")
    iid = ensure_item("meridian", "work", MERIDIAN_WORK[0], MERIDIAN_WORK[1], 1,
                      variant=MERIDIAN_WORK[2], published=True)
    ensure_media(iid, "poster", 0, "poster:foundry", 598, 320, "Foundry, still")
    ensure_media(iid, "reel", 1, "reel:foundry", 598, 320, "Foundry, moving image")
