"""Cirrus — the public site of a production house. Flask + Jinja + PostgreSQL."""
import hashlib
import os
import re
import secrets
import time
import unicodedata
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras
import psycopg2.pool
from flask import (Flask, abort, jsonify, redirect, render_template, request,
                   Response)

import gen

DATABASE_URL = os.environ["DATABASE_URL"]
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "")
SERVED_HOUSE = "cirrus"
SEED_PASSWORD = "deku-demo-pw-2026"
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
MEDIA_ROLES = ("poster", "reel", "gallery")
ASPECTS = {"left": 1.87, "right": 1.0, "centre": 1.63}
WIDTHS = {"left": 598, "right": 300, "centre": 1006}

app = Flask(__name__)
app.url_map.strict_slashes = False


def split_letters(word):
    """Per-character spans, hidden from AT and from selection; the word keeps its name."""
    out = ['<span class="split" aria-hidden="true">']
    for ch in word or "":
        out.append('<span class="split-ch">%s</span>' % ("&nbsp;" if ch == " " else ch))
    out.append("</span>")
    return Markup("".join(out))


from markupsafe import Markup  # noqa: E402

app.jinja_env.globals["split"] = split_letters

# authored, not random: the entry cluster's twenty-ish stills, dense toward the
# centre, thinning to the edges, four corners empty, exact centre clear.
CLUSTER_POSITIONS = [
    {"x": 96, "y": 208, "w": 196}, {"x": 336, "y": 96, "w": 158}, {"x": 566, "y": 214, "w": 330},
    {"x": 906, "y": 88, "w": 176}, {"x": 1112, "y": 190, "w": 206}, {"x": 60, "y": 430, "w": 152},
    {"x": 268, "y": 388, "w": 240}, {"x": 552, "y": 470, "w": 168}, {"x": 760, "y": 396, "w": 252},
    {"x": 1044, "y": 434, "w": 184}, {"x": 1218, "y": 344, "w": 158}, {"x": 128, "y": 640, "w": 178},
    {"x": 348, "y": 606, "w": 226}, {"x": 626, "y": 660, "w": 298}, {"x": 964, "y": 618, "w": 214},
    {"x": 1186, "y": 596, "w": 168}, {"x": 214, "y": 806, "w": 244}, {"x": 520, "y": 826, "w": 186},
    {"x": 800, "y": 812, "w": 232}, {"x": 1096, "y": 788, "w": 178},
]
app.jinja_env.globals["CLUSTER_POSITIONS"] = CLUSTER_POSITIONS

# ------------------------------------------------------------------ database

_pool = None


def db():
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(2, 20, dsn=DATABASE_URL)
    conn = _pool.getconn()
    conn.autocommit = False
    return conn


def putdb(conn):
    global _pool
    try:
        if _pool is not None:
            _pool.putconn(conn)
    except Exception:
        pass


class Tx:
    """A committed-or-rolled-back transaction with dict cursors."""

    def __init__(self):
        self.conn = db()
        self.c = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def execute(self, sql, args=()):
        self.c.execute(sql, args)
        if self.c.description is None:
            return None
        rows = self.c.fetchall()
        return rows[0] if rows else None

    def all(self, sql, args=()):
        self.c.execute(sql, args)
        return self.c.fetchall()

    def run(self, sql, args=()):
        self.c.execute(sql, args)
        return None

    def __enter__(self):
        return self

    def __exit__(self, et, ev, tb):
        try:
            if et is None:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            try:
                self.c.close()
            except Exception:
                pass
            putdb(self.conn)
        return False


def query(sql, args=(), one=False, fetch=True):
    with Tx() as tx:
        if one:
            return tx.execute(sql, args) if fetch else tx.run(sql, args)
        return tx.all(sql, args) if fetch else tx.run(sql, args)


def run(sql, args=()):
    """A write with nothing to return."""
    with Tx() as tx:
        return tx.run(sql, args)


# ------------------------------------------------------------------- helpers

def token_hex(n=32):
    return secrets.token_hex(n // 2)


def hash_password(pw):
    return hashlib.scrypt((pw or "").encode(), salt=b"cirrus-house-salt", n=2 ** 14, r=8, p=1).hex()


def verify_password(pw, ph):
    try:
        return secrets.compare_digest(hash_password(pw), ph or "")
    except Exception:
        return False


def slugify(text):
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def now():
    return datetime.now(timezone.utc)


def api_error(msg, code):
    return jsonify({"error": {"code": code, "reason": msg}}), code


def bad_request(msg):
    return api_error(msg, 400)


def api_not_found(msg="Not found"):
    return api_error(msg, 404)


def unauthorized(msg="Sign in as a producer to use the studio."):
    resp = jsonify({"error": {"code": 401, "reason": msg}})
    resp.headers["WWW-Authenticate"] = 'Bearer realm="studio"'
    return resp, 401


def forbidden(msg="The studio is for a house producer."):
    return api_error(msg, 403)


# ------------------------------------------------------------------ request

@app.before_request
def _stamp():
    request.started = time.time()


@app.after_request
def _log(resp):
    print("%s %s %s %.1fms" % (request.method, request.path, resp.status_code,
                               (time.time() - getattr(request, "started", time.time())) * 1000),
          flush=True)
    p = request.path
    if p.startswith("/preview") or p.startswith("/api/preview") or p.startswith("/api/studio"):
        resp.headers["Cache-Control"] = "no-store, private"
        resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    elif resp.status_code == 200 and request.method == "GET":
        if p.startswith("/api/media/") or p.startswith("/static/") or p == "/share-card.png":
            resp.headers["Cache-Control"] = "public, max-age=600, must-revalidate"
        else:
            resp.headers["Cache-Control"] = "public, max-age=15, must-revalidate"
    return resp


def bearer_account():
    h = request.headers.get("Authorization", "")
    if h.lower().startswith("bearer "):
        tok = h[7:].strip()
        if tok:
            return query("SELECT * FROM accounts WHERE token=%s", (tok,), one=True)
    return None


def page_account():
    """For page routing only: the bearer header, else the session cookie the
    login sets.  API auth stays bearer-only."""
    acc = bearer_account()
    if acc is not None:
        return acc
    tok = request.cookies.get("cirrus_token", "")
    if not tok:
        return None
    return query("SELECT * FROM accounts WHERE token=%s", (tok,), one=True)


def producer_account():
    acc = bearer_account()
    if acc and acc["role"] == "producer" and acc["house_id"] is not None:
        return acc
    return None


def require_producer():
    acc = bearer_account()
    if acc is None:
        return None, unauthorized()
    if acc["role"] != "producer" or acc["house_id"] is None:
        return None, forbidden()
    return acc, None


def scoped(item_id, house_id):
    """One of this house's records, or None.  A foreign record reads as absent."""
    try:
        item_id = int(str(item_id).strip())
    except (TypeError, ValueError):
        return None
    return query("SELECT * FROM items WHERE id=%s AND house_id=%s", (item_id, house_id), one=True)


# --------------------------------------------------------------------- reads

def published(kind, house_id):
    return query("SELECT * FROM items WHERE house_id=%s AND kind=%s AND published=true "
                 "ORDER BY position, created_at, id", (house_id, kind))


def ordinals(rows):
    out = []
    for i, r in enumerate(rows):
        d = dict(r)
        d["ordinal"] = i + 1
        out.append(d)
    return out


def media_of(item_id):
    return query("SELECT * FROM media WHERE item_id=%s ORDER BY role, position, created_at, id", (item_id,))


def credits_of(item_id):
    return query(
        "SELECT c.*, i.slug AS talent_slug, i.title AS talent_title FROM credits c "
        "LEFT JOIN items i ON i.id=c.talent_item_id WHERE c.item_id=%s ORDER BY c.position, c.id",
        (item_id,))


def selected_work(talent_id, house_id):
    return query(
        "SELECT i.* FROM credits c JOIN items i ON i.id=c.item_id "
        "WHERE c.talent_item_id=%s AND i.kind='work' AND i.published=true AND i.house_id=%s "
        "ORDER BY i.position, i.created_at, i.id", (talent_id, house_id))


def media_public(m):
    return {"id": m["id"], "media_id": m["id"], "role": m["role"], "seed": m["seed"],
            "width": m["width"], "height": m["height"], "alt": m["alt"],
            "url": "/api/media/" + m["id"]}


def credit_public(c):
    d = {"id": str(c["id"]), "role": c["role"], "name": c["name"]}
    if c["talent_item_id"] is not None:
        d["talent_id"] = str(c["talent_item_id"])
        if c.get("talent_slug"):
            d["talent_slug"] = c["talent_slug"]
    return d


def item_public(it, ordinal=None):
    d = {"id": str(it["id"]), "kind": it["kind"], "slug": it["slug"], "title": it["title"],
         "published": bool(it["published"])}
    if it["kind"] == "work":
        d["variant"] = it["variant"]
    else:
        d["discipline"] = it["discipline"]
    if ordinal is not None:
        d["ordinal"] = ordinal
    return d


def item_full(it, ordinal=None, house_id=None):
    d = item_public(it, ordinal)
    d["position"] = it["position"]
    d["media"] = [media_public(m) for m in media_of(it["id"])]
    if it["kind"] == "work":
        d["credits"] = [credit_public(c) for c in credits_of(it["id"])]
    else:
        sw = selected_work(it["id"], house_id or HOUSE["id"])
        d["selected_work"] = [item_public(w) for w in sw]
    d["created_at"] = it["created_at"].isoformat(timespec="seconds") if it["created_at"] else None
    d["published_at"] = it["published_at"].isoformat(timespec="seconds") if it["published_at"] else None
    return d


HOUSE = {}


def load_house():
    row = query("SELECT * FROM houses WHERE slug=%s", (SERVED_HOUSE,), one=True)
    HOUSE["row"], HOUSE["id"] = row, row["id"]
    return row


# -------------------------------------------------------------------- schema

SCHEMA = """
CREATE TABLE IF NOT EXISTS houses (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline_upper text NOT NULL DEFAULT '',
  tagline_lower text NOT NULL DEFAULT '',
  street text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS accounts (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('producer','viewer')),
  house_id bigint REFERENCES houses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  token text UNIQUE,
  token_issued_at timestamptz
);
CREATE TABLE IF NOT EXISTS items (
  id bigserial PRIMARY KEY,
  house_id bigint NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('work','talent')),
  slug text NOT NULL,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  discipline text CHECK (discipline IN ('director','photographer','stylist')),
  variant text CHECK (variant IN ('left','right','centre')),
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_slug_uk UNIQUE (house_id, kind, slug),
  CONSTRAINT items_shape CHECK (
    (kind = 'work' AND variant IS NOT NULL AND discipline IS NULL) OR
    (kind = 'talent' AND discipline IS NOT NULL AND variant IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS items_slug_ci ON items (house_id, kind, lower(slug));
CREATE INDEX IF NOT EXISTS items_list_idx ON items (house_id, kind, published, position);
CREATE TABLE IF NOT EXISTS media (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('poster','reel','gallery')),
  position integer NOT NULL DEFAULT 0,
  seed integer NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  alt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id);
CREATE TABLE IF NOT EXISTS credits (
  id bigserial PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  role text NOT NULL,
  name text NOT NULL,
  talent_item_id bigint REFERENCES items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id);
CREATE INDEX IF NOT EXISTS credits_talent_idx ON credits (talent_item_id);
CREATE TABLE IF NOT EXISTS preview_tokens (
  id bigserial PRIMARY KEY,
  token text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_by bigint REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preview_item_idx ON preview_tokens (item_id);
CREATE TABLE IF NOT EXISTS slug_redirects (
  id bigserial PRIMARY KEY,
  house_id bigint NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('work','talent')),
  old_slug text NOT NULL,
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slug_redirects_uk UNIQUE (house_id, kind, old_slug)
);
"""


def init_db():
    with Tx() as tx:
        tx.c.execute(SCHEMA)


# ---------------------------------------------------------------------- seed

CIRRUS_WORKS = [
    ("The Halo", "the-halo", "left"),
    ("Sonder", "sonder", "right"),
    ("BINARY", "binary", "centre"),
    ("Common Ground", "common-ground", "left"),
    ("NVE", "nve", "right"),
    ("The Absolute Shelter", "the-absolute-shelter", "centre"),
    ("MAISON DE LUMIERE", "maison-de-lumiere", "left"),
    ("LORIS", "loris", "right"),
    ("MDL Serie Extreme", "mdl-serie-extreme", "centre"),
    ("AK", "ak", "left"),
    ("Loris Shoot Studio", "loris-shoot-studio", "right"),
    ("The Radiant", "the-radiant", "centre"),
]
CIRRUS_TALENTS = [
    ("Rives", "rives", "director"),
    ("Halcyon", "halcyon", "director"),
    ("Camille Ferrand", "camille-ferrand", "photographer"),
]


def _ensure_house(tx, slug, name, tag_u, tag_l, street, city, district, email):
    row = tx.execute(
        "INSERT INTO houses (slug,name,tagline_upper,tagline_lower,street,city,district,contact_email)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (slug) DO NOTHING RETURNING *",
        (slug, name, tag_u, tag_l, street, city, district, email))
    if row is None:
        row = tx.execute("SELECT * FROM houses WHERE slug=%s", (slug,))
    return row


def _ensure_item(tx, house_id, kind, slug, title, position, extra_col, extra_val, published):
    return tx.execute(
        "INSERT INTO items (house_id,kind,slug,title,position,%s,published,published_at)"
        " VALUES (%%s,%%s,%%s,%%s,%%s,%%s,%%s,%%s) ON CONFLICT (house_id,kind,slug) DO NOTHING RETURNING *" % extra_col,
        (house_id, kind, slug, title, position, extra_val, published,
         now() - timedelta(days=30) if published else None))


def _ensure_media(tx, item_id, role, position, seed, width, height, alt):
    got = tx.execute("SELECT id FROM media WHERE item_id=%s AND role=%s AND position=%s AND seed=%s",
                     (item_id, role, position, seed))
    if got:
        return
    tx.execute("INSERT INTO media (id,item_id,role,position,seed,width,height,alt) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
               (token_hex(32), item_id, role, position, seed, width, height, alt))


def seed():
    with Tx() as tx:
        cirrus = _ensure_house(tx, "cirrus", "Cirrus", "FOR PICTURE", "AND ITS MAKERS",
                               "9 Passage Bellevue", "Paris", "11", "prod@example.com")
        meridian = _ensure_house(tx, "meridian", "Meridian", "FOR PICTURE", "AND ITS MAKERS",
                                 "4 Rue Fond", "Lyon", "3", "prod@meridian.example")
        ph = hash_password(SEED_PASSWORD)
        for email, role, hid in (("producer@example.com", "producer", cirrus["id"]),
                                 ("producer.meridian@example.com", "producer", meridian["id"]),
                                 ("viewer@example.com", "viewer", None)):
            tx.execute("INSERT INTO accounts (email,password_hash,role,house_id) VALUES (%s,%s,%s,%s)"
                       " ON CONFLICT (email) DO NOTHING", (email, ph, role, hid))

        works = [(t, s, v, True) for t, s, v in CIRRUS_WORKS] + [
            ("The Quiet Room", "the-quiet-room", "left", False)]
        for pos, (title, slug, variant, pub) in enumerate(works):
            row = _ensure_item(tx, cirrus["id"], "work", slug, title, pos, "variant", variant, pub)
            if row is None:
                continue
            w = WIDTHS[variant]
            h = gen.intrinsic_height(w, ASPECTS[variant])
            _ensure_media(tx, row["id"], "poster", 0, gen.seed_for(slug + "/poster"), w, h,
                          "%s — main still" % title)
            _ensure_media(tx, row["id"], "reel", 0, gen.seed_for(slug + "/reel"), w, h,
                          "%s — film" % title)
            for k in range(3):
                vw = WIDTHS[("left", "centre", "right")[k % 3]]
                vh = gen.intrinsic_height(vw, ASPECTS[("left", "centre", "right")[k % 3]])
                _ensure_media(tx, row["id"], "gallery", k, gen.seed_for("%s/gallery/%d" % (slug, k)),
                              vw, vh, "%s — still %d" % (title, k + 1))

        talents = [(t, s, d, True) for t, s, d in CIRRUS_TALENTS] + [
            ("Noor Vasquez", "noor-vasquez", "stylist", False)]
        for pos, (title, slug, disc, pub) in enumerate(talents):
            row = _ensure_item(tx, cirrus["id"], "talent", slug, title, pos, "discipline", disc, pub)
            if row is None:
                continue
            _ensure_media(tx, row["id"], "poster", 0, gen.seed_for(slug + "/portrait"), 246, 192,
                          "%s, %s — portrait" % (title, disc))
            _ensure_media(tx, row["id"], "reel", 0, gen.seed_for(slug + "/reel"), 598, 320,
                          "%s — reel" % title)

        for tslug, wslug, role in (("rives", "the-halo", "Director"),
                                   ("halcyon", "sonder", "Director"),
                                   ("camille-ferrand", "loris", "Photographer")):
            t = tx.execute("SELECT * FROM items WHERE house_id=%s AND kind='talent' AND slug=%s",
                           (cirrus["id"], tslug))
            w = tx.execute("SELECT * FROM items WHERE house_id=%s AND kind='work' AND slug=%s",
                           (cirrus["id"], wslug))
            if t and w:
                have = tx.execute("SELECT id FROM credits WHERE item_id=%s AND talent_item_id=%s",
                                  (w["id"], t["id"]))
                if not have:
                    tx.execute("INSERT INTO credits (item_id,position,role,name,talent_item_id)"
                               " VALUES (%s,0,%s,%s,%s)", (w["id"], role, t["title"], t["id"]))

        m = _ensure_item(tx, meridian["id"], "work", "foundry", "Foundry", 0, "variant", "left", True)
        if m:
            w = WIDTHS["left"]
            h = gen.intrinsic_height(w, ASPECTS["left"])
            _ensure_media(tx, m["id"], "poster", 0, gen.seed_for("foundry/poster"), w, h, "Foundry — main still")
            _ensure_media(tx, m["id"], "reel", 0, gen.seed_for("foundry/reel"), w, h, "Foundry — film")
        mt = _ensure_item(tx, meridian["id"], "talent", "sable-ito", "Sable Ito", 0, "discipline",
                          "director", True)
        if mt:
            _ensure_media(tx, mt["id"], "poster", 0, gen.seed_for("sable-ito/portrait"), 246, 192,
                          "Sable Ito, director — portrait")


# ---------------------------------------------------------------------- auth

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.route("/api/auth/signup", methods=["POST"])
def api_signup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not EMAIL_RE.match(email):
        return bad_request("Enter an email address.")
    if len(password) < 8:
        return bad_request("Choose a password of at least 8 characters.")
    tok = token_hex(32)
    try:
        with Tx() as tx:
            row = tx.execute(
                "INSERT INTO accounts (email,password_hash,role,house_id,token,token_issued_at)"
                " VALUES (%s,%s,'viewer',NULL,%s,%s) RETURNING *",
                (email, hash_password(password), tok, now()))
    except psycopg2.errors.UniqueViolation:
        return api_error("That address already has an account.", 409)
    resp = jsonify({"token": tok, "account": {"email": row["email"], "role": "viewer",
                                              "house": None}})
    resp.set_cookie("cirrus_token", tok, httponly=True, samesite="Lax", max_age=60 * 60 * 12)
    return resp, 201


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    acc = query("SELECT * FROM accounts WHERE email=%s", (email,), one=True)
    if acc is None or not verify_password(password, acc["password_hash"]):
        return api_error("That address and password do not match.", 401)
    tok = token_hex(32)
    run("UPDATE accounts SET token=%s, token_issued_at=%s WHERE id=%s", (tok, now(), acc["id"]))
    house = None
    if acc["house_id"]:
        h = query("SELECT slug FROM houses WHERE id=%s", (acc["house_id"],), one=True)
        house = h["slug"] if h else None
    resp = jsonify({"token": tok, "account": {"email": acc["email"], "role": acc["role"],
                                              "house": house}})
    resp.set_cookie("cirrus_token", tok, httponly=True, samesite="Lax", max_age=60 * 60 * 12)
    return resp


# ------------------------------------------------------------- public JSON API

@app.route("/api/health")
def api_health():
    try:
        row = query("SELECT count(*) AS n FROM items WHERE house_id=%s AND published=true",
                    (HOUSE["id"],), one=True)
        return jsonify({"status": "ok", "house": SERVED_HOUSE, "published": row["n"]})
    except Exception as exc:
        return jsonify({"status": "error", "detail": str(exc)}), 503


@app.route("/api/works")
def api_works():
    rows = ordinals(published("work", HOUSE["id"]))
    return jsonify([item_public(r, r["ordinal"]) for r in rows])


@app.route("/api/talents")
def api_talents():
    disc = (request.args.get("discipline") or "").strip().lower()
    rows = published("talent", HOUSE["id"])
    if disc:
        rows = [r for r in rows if r["discipline"] == disc]
    return jsonify([item_public(r) for r in rows])


@app.route("/api/disciplines")
def api_disciplines():
    seen = []
    for r in published("talent", HOUSE["id"]):
        if r["discipline"] and r["discipline"] not in seen:
            seen.append(r["discipline"])
    return jsonify(seen)


@app.route("/api/works/<slug>")
def api_work(slug):
    rows = ordinals(published("work", HOUSE["id"]))
    for i, r in enumerate(rows):
        if r["slug"] == slug:
            prev, nxt = rows[(i - 1) % len(rows)], rows[(i + 1) % len(rows)]
            d = item_full(r, r["ordinal"], HOUSE["id"])
            d["prev"] = item_public(prev, prev["ordinal"])
            d["next"] = item_public(nxt, nxt["ordinal"])
            return jsonify(d)
    return api_not_found()


@app.route("/api/talents/<slug>")
def api_talent(slug):
    for r in published("talent", HOUSE["id"]):
        if r["slug"] == slug:
            return jsonify(item_full(r, None, HOUSE["id"]))
    return api_not_found()


@app.route("/api/media/<media_id>")
def api_media(media_id):
    mid = (media_id or "").strip().lower()
    if not re.match(r"^[0-9a-f]{32}$", mid):
        return api_not_found()
    m = query("SELECT m.*, i.published AS item_published, i.house_id AS item_house "
              "FROM media m JOIN items i ON i.id=m.item_id WHERE m.id=%s", (mid,), one=True)
    if m is None:
        return api_not_found()
    if not (m["item_published"] and m["item_house"] == HOUSE["id"]):
        acc = producer_account()
        if acc is None or acc["house_id"] != m["item_house"]:
            return api_not_found()
    resp = Response(gen.render_still(m["seed"], m["width"], m["height"]), mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=600, must-revalidate"
    return resp


# -------------------------------------------------------------------- studio

@app.route("/api/studio/items", methods=["GET"])
def studio_items():
    acc, err = require_producer()
    if err:
        return err
    kind = request.args.get("kind")
    sql = "SELECT * FROM items WHERE house_id=%s"
    args = [acc["house_id"]]
    if kind in ("work", "talent"):
        sql += " AND kind=%s"
        args.append(kind)
    sql += " ORDER BY kind, position, created_at, id"
    counts, out = {}, []
    for r in query(sql, args):
        ordinal = None
        if r["published"]:
            counts[r["kind"]] = counts.get(r["kind"], 0) + 1
            ordinal = counts[r["kind"]]
        d = item_public(r, ordinal)
        d["position"] = r["position"]
        d["created_at"] = r["created_at"].isoformat(timespec="seconds")
        d["published_at"] = r["published_at"].isoformat(timespec="seconds") if r["published_at"] else None
        out.append(d)
    return jsonify(out)


@app.route("/api/studio/items", methods=["POST"])
def studio_create():
    acc, err = require_producer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    if kind not in ("work", "talent"):
        return bad_request("Say whether the record is a work or a talent.")
    title = (data.get("title") or "").strip()
    if not title:
        return bad_request("Give the record a title.")
    slug = slugify(data.get("slug") or title)
    if not slug:
        return bad_request("Write a slug; one cannot be made from that title.")
    discipline = variant = None
    if kind == "talent":
        if data.get("discipline") not in DISCIPLINES:
            return bad_request("Choose a discipline: director, photographer or stylist.")
        discipline = data["discipline"]
    else:
        variant = data.get("variant") or "left"
        if variant not in VARIANTS:
            return bad_request("Choose a variant: left, right or centre.")
    try:
        with Tx() as tx:
            nxt = tx.execute("SELECT coalesce(max(position),0)+1 AS p FROM items WHERE house_id=%s AND kind=%s",
                             (acc["house_id"], kind))
            row = tx.execute(
                "INSERT INTO items (house_id,kind,slug,title,position,discipline,variant,published)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,false) RETURNING *",
                (acc["house_id"], kind, slug, title, nxt["p"], discipline, variant))
    except psycopg2.errors.UniqueViolation:
        return api_error("That slug is already used in this house.", 409)
    return jsonify(item_full(row, None, acc["house_id"])), 201


@app.route("/api/studio/items/<item_id>", methods=["GET", "PATCH"])
def studio_item(item_id):
    acc, err = require_producer()
    if err:
        return err
    item = scoped(item_id, acc["house_id"])
    if item is None:
        return api_not_found()
    if request.method == "GET":
        return jsonify(item_full(item, None, acc["house_id"]))
    data = request.get_json(silent=True) or {}
    fields = {}
    if "title" in data:
        t = (data.get("title") or "").strip()
        if not t:
            return bad_request("A title cannot be empty.")
        fields["title"] = t
    if "discipline" in data and item["kind"] == "talent":
        if data["discipline"] not in DISCIPLINES:
            return bad_request("Choose a discipline from the set.")
        fields["discipline"] = data["discipline"]
    if "variant" in data and item["kind"] == "work":
        if data["variant"] not in VARIANTS:
            return bad_request("Choose a variant: left, right or centre.")
        fields["variant"] = data["variant"]
    if not fields:
        return bad_request("Nothing in that request can be changed.")
    sets = ", ".join("%s=%%s" % f for f in fields)
    args = list(fields.values()) + [item["id"], acc["house_id"]]
    row = query("UPDATE items SET %s WHERE id=%%s AND house_id=%%s RETURNING *" % sets, args, one=True)
    return jsonify(item_full(row, None, acc["house_id"]))


@app.route("/api/studio/items/<item_id>/publish", methods=["POST"])
def studio_publish(item_id):
    acc, err = require_producer()
    if err:
        return err
    item = scoped(item_id, acc["house_id"])
    if item is None:
        return api_not_found()
    data = request.get_json(silent=True) or {}
    if "published" not in data:
        return bad_request("Say whether the record is published.")
    want = bool(data["published"])
    if want:
        poster = query("SELECT count(*) AS n FROM media WHERE item_id=%s AND role='poster' AND alt <> ''",
                       (item["id"],), one=True)
        if poster["n"] == 0:
            return bad_request("Give the poster a written alternative before publishing.")
    row = query("UPDATE items SET published=%s, published_at=%s WHERE id=%s RETURNING *",
                (want, now() if want else None, item["id"]), one=True)
    return jsonify(item_full(row, None, acc["house_id"]))


@app.route("/api/studio/items/<item_id>/media", methods=["POST"])
def studio_media(item_id):
    acc, err = require_producer()
    if err:
        return err
    item = scoped(item_id, acc["house_id"])
    if item is None:
        return api_not_found()
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    if role not in MEDIA_ROLES:
        return bad_request("A media row is a poster, a reel or a gallery still.")
    seed = data.get("seed")
    if seed is None or seed == "":
        seed = gen.seed_for("%s/%s/%s" % (item["slug"], role, token_hex(4)))
    try:
        seed = int(seed)
    except (TypeError, ValueError):
        return bad_request("The seed must be a whole number.")
    seed = abs(seed) % 1000000
    try:
        width = int(data.get("width") or 0)
        height = int(data.get("height") or 0)
    except (TypeError, ValueError):
        return bad_request("Width and height must be whole numbers.")
    if not (40 <= width <= 4096 and 40 <= height <= 4096):
        return bad_request("Width and height must each be between 40 and 4096.")
    alt = (data.get("alt") or "").strip()
    nxt = query("SELECT coalesce(max(position),0)+1 AS p FROM media WHERE item_id=%s", (item["id"],), one=True)
    mid = token_hex(32)
    row = query("INSERT INTO media (id,item_id,role,position,seed,width,height,alt)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (mid, item["id"], role, nxt["p"], seed, width, height, alt), one=True)
    return jsonify({"media_id": row["id"], "role": row["role"], "width": row["width"],
                    "height": row["height"], "seed": row["seed"], "alt": row["alt"],
                    "url": "/api/media/" + row["id"]}), 201


@app.route("/api/studio/items/<item_id>/credits", methods=["POST"])
def studio_credits(item_id):
    acc, err = require_producer()
    if err:
        return err
    item = scoped(item_id, acc["house_id"])
    if item is None:
        return api_not_found()
    if item["kind"] != "work":
        return bad_request("Credits are attached to a work.")
    data = request.get_json(silent=True) or {}
    role = (data.get("role") or "").strip()
    name = (data.get("name") or "").strip()
    if not role or not name:
        return bad_request("A credit names a role and a name.")
    talent_item_id = None
    if data.get("talent_id"):
        t = scoped(data["talent_id"], acc["house_id"])
        if t is None or t["kind"] != "talent":
            return bad_request("That talent is not in this house.")
        talent_item_id = t["id"]
    nxt = query("SELECT coalesce(max(position),0)+1 AS p FROM credits WHERE item_id=%s", (item["id"],), one=True)
    row = query("INSERT INTO credits (item_id,position,role,name,talent_item_id)"
                " VALUES (%s,%s,%s,%s,%s) RETURNING *",
                (item["id"], nxt["p"], role, name, talent_item_id), one=True)
    return jsonify(credit_public(row)), 201


@app.route("/api/studio/items/<item_id>/slug", methods=["POST"])
def studio_slug(item_id):
    acc, err = require_producer()
    if err:
        return err
    item = scoped(item_id, acc["house_id"])
    if item is None:
        return api_not_found()
    data = request.get_json(silent=True) or {}
    new = slugify(data.get("slug") or "")
    if not new:
        return bad_request("Write a slug.")
    if new == item["slug"]:
        return jsonify(item_full(item, None, acc["house_id"]))
    try:
        with Tx() as tx:
            row = tx.execute("UPDATE items SET slug=%s WHERE id=%s AND house_id=%s RETURNING *",
                             (new, item["id"], acc["house_id"]))
            tx.execute("INSERT INTO slug_redirects (house_id,kind,old_slug,item_id) VALUES (%s,%s,%s,%s)"
                       " ON CONFLICT (house_id,kind,old_slug) DO UPDATE SET item_id=EXCLUDED.item_id",
                       (acc["house_id"], item["kind"], item["slug"], item["id"]))
    except psycopg2.errors.UniqueViolation:
        return api_error("That slug is already used in this house.", 409)
    return jsonify(item_full(row, None, acc["house_id"]))


@app.route("/api/studio/works/order", methods=["POST"])
def studio_order():
    acc, err = require_producer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    ids = data.get("ordered_ids")
    if not isinstance(ids, list) or not ids:
        return bad_request("ordered_ids must be a list of record ids.")
    clean = []
    try:
        with Tx() as tx:
            for raw in ids:
                try:
                    iid = int(str(raw).strip())
                except (TypeError, ValueError):
                    return bad_request("ordered_ids must be record ids.")
                it = tx.execute("SELECT id FROM items WHERE id=%s AND house_id=%s AND kind='work'",
                                (iid, acc["house_id"]))
                if it is None:
                    raise LookupError()
                clean.append(iid)
            for pos, iid in enumerate(clean):
                tx.execute("UPDATE items SET position=%s WHERE id=%s AND house_id=%s",
                           (pos, iid, acc["house_id"]))
    except LookupError:
        return api_not_found()
    counts, out = {}, []
    for r in query("SELECT * FROM items WHERE house_id=%s AND kind='work' ORDER BY position, created_at, id",
                   (acc["house_id"],)):
        ordinal = None
        if r["published"]:
            counts["work"] = counts.get("work", 0) + 1
            ordinal = counts["work"]
        out.append(item_public(r, ordinal))
    return jsonify(out)


@app.route("/api/studio/preview-tokens", methods=["POST"])
def studio_preview_tokens():
    acc, err = require_producer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    item = scoped(data.get("item_id"), acc["house_id"])
    if item is None:
        return api_not_found()
    tok = token_hex(32)
    exp = now() + timedelta(minutes=15)
    run("INSERT INTO preview_tokens (token,item_id,expires_at,created_by) VALUES (%s,%s,%s,%s)",
        (tok, item["id"], exp, acc["id"]))
    return jsonify({"token": tok, "expires_at": exp.isoformat(timespec="seconds"),
                    "item_id": str(item["id"]), "kind": item["kind"]}), 201


@app.route("/api/preview/<token>")
def api_preview(token):
    acc = producer_account()
    t = query("SELECT t.*, i.house_id AS item_house, i.published AS item_published "
              "FROM preview_tokens t JOIN items i ON i.id=t.item_id WHERE t.token=%s",
              ((token or "").strip().lower(),), one=True)
    if t is None or acc is None or t["item_house"] != acc["house_id"] or t["expires_at"] < now():
        return api_not_found()
    if t["item_published"]:
        return api_not_found()
    item = query("SELECT * FROM items WHERE id=%s", (t["item_id"],), one=True)
    return jsonify(item_full(item, None, acc["house_id"]))


@app.route("/api/auth/signout", methods=["POST"])
def api_signout():
    tok = request.cookies.get("cirrus_token", "")
    if tok:
        run("UPDATE accounts SET token=NULL WHERE token=%s", (tok,))
    resp = jsonify({"ok": True})
    resp.delete_cookie("cirrus_token")
    return resp


# --------------------------------------------------------------- page routes

def page_ctx(route, title="Cirrus", description="A production house for picture and its makers.",
             **kw):
    works = ordinals(published("work", HOUSE["id"]))
    talents = published("talent", HOUSE["id"])
    discs = []
    for t in talents:
        if t["discipline"] and t["discipline"] not in discs:
            discs.append(t["discipline"])
    ctx = {
        "route": route,
        "title": title,
        "description": description,
        "house": HOUSE["row"],
        "works": works,
        "talents": talents,
        "disciplines": discs,
        "contact_email": HOUSE["row"]["contact_email"],
        "share_url": "/share-card.png",
    }
    ctx.update(kw)
    return ctx


def resolve_public(kind, slug):
    rows = published(kind, HOUSE["id"])
    for i, r in enumerate(rows):
        if r["slug"] == slug:
            if kind == "work":
                ordered = ordinals(rows)
                return ordered[i], (ordered[(i - 1) % len(rows)], ordered[(i + 1) % len(rows)])
            return r, None
    red = query("SELECT r.item_id FROM slug_redirects r JOIN items i ON i.id=r.item_id "
                "WHERE r.house_id=%s AND r.kind=%s AND r.old_slug=%s AND i.published=true",
                (HOUSE["id"], kind, slug), one=True)
    if red:
        return ("redirect", red["item_id"]), None
    return None, None


@app.errorhandler(404)
def page_not_found(_e):
    if request.path.startswith("/api/"):
        return api_not_found()
    return render_template("404.html", **page_ctx("notfound", title="Cirrus - Not found")), 404


@app.route("/")
def route_entry():
    stills = query(
        "SELECT m.*, i.slug AS item_slug, i.title AS item_title FROM media m "
        "JOIN items i ON i.id=m.item_id WHERE i.house_id=%s AND i.published=true "
        "AND i.kind='work' AND m.role='poster' ORDER BY i.position", (HOUSE["id"],))
    return render_template("entry.html", **page_ctx("entry", title="Cirrus", stills=stills))


@app.route("/works")
def route_works():
    works = ordinals(published("work", HOUSE["id"]))
    media = {}
    for r in query("SELECT m.*, i.slug AS item_slug FROM media m JOIN items i ON i.id=m.item_id "
                   "WHERE i.house_id=%s AND i.published=true AND i.kind='work' AND m.role='poster' "
                   "ORDER BY i.position", (HOUSE["id"],)):
        media[r["item_slug"]] = r
    return render_template("works.html", **page_ctx("works", title="Cirrus - Works",
                                                    works=works, poster_by_slug=media))


def grouped_media(item_id):
    out = {"poster": None, "reel": None, "gallery": []}
    for r in media_of(item_id):
        if r["role"] == "poster":
            out["poster"] = r
        elif r["role"] == "reel":
            out["reel"] = r
        else:
            out["gallery"].append(r)
    return out


@app.route("/works/<slug>")
def route_work(slug):
    me, extra = resolve_public("work", slug)
    if me == "redirect":
        new = query("SELECT slug FROM items WHERE id=%s", (extra,), one=True)
        return redirect("/works/" + new["slug"], code=301) if new else abort(404)
    if me is None:
        abort(404)
    prev, nxt = extra
    return render_template("work.html", **page_ctx(
        "work", title="Cirrus - %s" % me["title"], work=me, prev=prev, nxt=nxt,
        media=grouped_media(me["id"]), credits=credits_of(me["id"])))


@app.route("/talents")
def route_talents():
    talents = published("talent", HOUSE["id"])
    portraits = {}
    for r in query("SELECT m.*, i.slug AS item_slug FROM media m JOIN items i ON i.id=m.item_id "
                   "WHERE i.house_id=%s AND i.published=true AND i.kind='talent' AND m.role='poster'",
                   (HOUSE["id"],)):
        portraits[r["item_slug"]] = r
    return render_template("talents.html", **page_ctx("talents", title="Cirrus - Talents",
                                                      talents=talents, portraits=portraits))


@app.route("/talents/<slug>")
def route_talent(slug):
    me, extra = resolve_public("talent", slug)
    if me == "redirect":
        new = query("SELECT slug FROM items WHERE id=%s", (extra,), one=True)
        return redirect("/talents/" + new["slug"], code=301) if new else abort(404)
    if me is None:
        abort(404)
    works = published("work", HOUSE["id"])
    pos = {w["id"]: i + 1 for i, w in enumerate(works)}
    selected = [dict(w, ordinal=pos.get(w["id"])) for w in selected_work(me["id"], HOUSE["id"])]
    posters = {r["item_slug"]: r for r in query(
        "SELECT m.*, i.slug AS item_slug FROM media m JOIN items i ON i.id=m.item_id "
        "WHERE i.house_id=%s AND i.kind='work' AND i.published=true AND m.role='poster'", (HOUSE["id"],))}
    selected = [dict(w, poster=posters.get(w["slug"])) for w in selected]
    return render_template("talent.html", **page_ctx(
        "talent", title="Cirrus - %s" % me["title"], talent=me,
        media=grouped_media(me["id"]), selected=selected))


@app.route("/about")
def route_about():
    return render_template("about.html", **page_ctx("about", title="Cirrus - About"))


@app.route("/signup")
def route_signup():
    return render_template("signup.html", **page_ctx("signup", title="Cirrus - Sign up"))


@app.route("/studio/login")
def route_studio_login():
    return render_template("studio_login.html", **page_ctx("studio-login", title="Cirrus - Studio"))


def gate_producer():
    """A studio page is reachable only to a signed-in producer; a viewer or a
    stranger is turned away before any template renders."""
    acc = page_account()
    if acc is None:
        return None
    if acc["role"] != "producer" or acc["house_id"] is None:
        return False
    return acc


@app.route("/studio")
def route_studio():
    acc = gate_producer()
    if acc is None:
        return redirect("/studio/login")
    if acc is False:
        return redirect("/")
    return render_template("studio.html", **page_ctx("studio", title="Cirrus - Studio"))


@app.route("/studio/talents/new")
def route_studio_new_talent():
    acc = gate_producer()
    if acc is None:
        return redirect("/studio/login")
    if acc is False:
        return redirect("/")
    return render_template("studio_new.html", kind="talent",
                           **page_ctx("studio-new", title="Cirrus - New talent"))


@app.route("/studio/works/new")
def route_studio_new_work():
    acc = gate_producer()
    if acc is None:
        return redirect("/studio/login")
    if acc is False:
        return redirect("/")
    return render_template("studio_new.html", kind="work",
                           **page_ctx("studio-new", title="Cirrus - New work"))


@app.route("/studio/items/<item_id>")
def route_studio_item(item_id):
    acc = gate_producer()
    if acc is None:
        return redirect("/studio/login")
    if acc is False:
        return redirect("/")
    item = scoped(item_id, acc["house_id"])
    if item is None:
        abort(404)
    return render_template("studio_edit.html", **page_ctx(
        "studio", title="Cirrus - Studio", item=item,
        media=media_of(item["id"]), credits=credits_of(item["id"])))


@app.route("/studio/items/<item_id>/published")
def route_studio_published(item_id):
    acc = gate_producer()
    if acc is None:
        return redirect("/studio/login")
    if acc is False:
        return redirect("/")
    item = scoped(item_id, acc["house_id"])
    if item is None:
        abort(404)
    ordinal = None
    if item["published"] and item["kind"] == "work":
        rows = ordinals(published("work", acc["house_id"]))
        ordinal = next((r["ordinal"] for r in rows if r["id"] == item["id"]), None)
    return render_template("studio_published.html", **page_ctx(
        "studio", title="Cirrus - Published", item=item, ordinal=ordinal))


@app.route("/preview/<token>")
def route_preview(token):
    acc = page_account()
    if acc is None or acc["role"] != "producer" or acc["house_id"] is None:
        abort(404)
    t = query("SELECT t.*, i.house_id AS item_house FROM preview_tokens t "
              "JOIN items i ON i.id=t.item_id WHERE t.token=%s",
              ((token or "").strip().lower(),), one=True)
    if t is None or t["item_house"] != acc["house_id"] or t["expires_at"] < now():
        abort(404)
    item = query("SELECT * FROM items WHERE id=%s", (t["item_id"],), one=True)
    if item is None or item["published"]:
        abort(404)
    media = grouped_media(item["id"])
    ctx = page_ctx("preview", title="Cirrus - Preview", preview=True, token=token, item=item)
    if item["kind"] == "work":
        ctx.update(work=item, prev=None, nxt=None, media=media, credits=credits_of(item["id"]))
        return render_template("work.html", **ctx)
    ctx.update(talent=item, media=media, selected=[])
    return render_template("talent.html", **ctx)


@app.route("/share-card.png")
def share_card():
    resp = Response(gen.share_card(), mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


# --------------------------------------------------------------------- start

def prepare():
    init_db()
    seed()
    load_house()
    gen.build_assets()


if __name__ == "__main__":
    prepare()
    seed()
    load_house()
    port = int(os.environ.get("PORT", os.environ.get("APP_PUBLIC_PORT", "4173")))
    from werkzeug.serving import run_simple
    run_simple("0.0.0.0", port, app, threaded=True, use_reloader=False)
