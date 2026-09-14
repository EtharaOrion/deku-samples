"""Every route. Authorization is server-side on every studio endpoint, reads included."""
import io
import secrets
from datetime import datetime, timedelta, timezone

from flask import (Blueprint, jsonify, redirect, render_template, request,
                   send_file)

from . import auth, db, pixels, reads
from .config import Config

bp = Blueprint("routes", __name__)

HEX32 = "0123456789abcdef"


def house():
    row = db.query("SELECT * FROM houses WHERE slug=%s", (Config.SERVED_HOUSE_SLUG,), one=True)
    if not row:
        abort(500)
    return row


def new_id(prefix):
    return f"{prefix}_{secrets.token_hex(10)}"


def bad(message, code=400):
    return jsonify({"error": message}), code


def gone():
    return jsonify({"error": "not found"}), 404


# ---------------------------------------------------------------- caching

def cacheable(resp, seconds=60):
    """Public reads may be cached; publishing or unlisting revalidates them
    because the published answer changes and the max-age is short."""
    resp.headers["Cache-Control"] = f"public, max-age={seconds}"
    return resp


def never_cached(resp):
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------------------------------------------------------------- analytics

_page_views = {"count": 0}


@bp.post("/api/analytics/pageview")
def analytics_pageview():
    """Counts page views and nothing else. No store, no cookie, no identifier."""
    _page_views["count"] += 1
    return jsonify({"ok": True})


@bp.get("/api/analytics/count")
def analytics_count():
    return jsonify({"page_views": _page_views["count"]})


# ---------------------------------------------------------------- health

@bp.get("/api/health")
def health():
    house()
    db.query("SELECT 1")
    reads.published_talents(house()["id"])
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------- auth api

@bp.post("/api/auth/signup")
def signup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or "@" not in email:
        return bad("An email address is required.")
    if len(password) < 8:
        return bad("A password of at least eight characters is required.")
    existing = db.query("SELECT id FROM accounts WHERE email=%s", (email,), one=True)
    if existing:
        return bad("That address already has an account.", 409)
    aid = new_id("acc")
    try:
        db.query_commit(
            """INSERT INTO accounts (id, email, password_hash, role, house_id)
               VALUES (%s,%s,%s,'viewer',NULL)""",
            (aid, email, auth.hash_password(password)))
    except Exception:
        return bad("That address already has an account.", 409)
    row = db.query("SELECT id, email, role, house_id FROM accounts WHERE email=%s", (email,), one=True)
    # the bearer carries the account id, signed; role and house are never read from a body
    token = auth.sign_token(row["id"])
    resp = jsonify({"token": token, "account": account_shape(row)})
    # the same signed value rides a cookie so the server-rendered studio pages can
    # authenticate a document request; the API itself only ever reads the header
    resp.set_cookie("cirrus_session", token, httponly=True, samesite="Lax",
                    max_age=60 * 60 * 12, path="/")
    return resp, 201


def account_shape(row):
    return {"id": row["id"], "email": row["email"], "role": row["role"], "house_id": row["house_id"]}


@bp.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    row = db.query("SELECT * FROM accounts WHERE email=%s", (email,), one=True)
    if not row or not auth.verify_password(password, row["password_hash"]):
        return bad("That address and password did not match.", 401)
    token = auth.sign_token(row["id"])
    resp = jsonify({"token": token, "account": account_shape(row)})
    resp.set_cookie("cirrus_session", token, httponly=True, samesite="Lax",
                    max_age=60 * 60 * 12, path="/")
    return resp


def caller():
    """The account behind the bearer token, or None."""
    header = request.headers.get("Authorization") or ""
    token = ""
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
    if not token:
        # document requests cannot carry a header; the studio pages ride the cookie
        token = request.cookies.get("cirrus_session") or ""
    if not token:
        return None
    raw = auth.verify_token(token)
    if not raw:
        return None
    return db.query(
        """SELECT a.id, a.email, a.role, a.house_id, h.slug AS house_slug
           FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
           WHERE a.id = %s""", (raw,), one=True)


def require_producer():
    """Returns (account, error_response). A viewer or no token is denied."""
    acc = caller()
    if not acc:
        return None, (jsonify({"error": "A producer session is required."}), 401)
    if acc["role"] != "producer" or not acc["house_id"]:
        return None, (jsonify({"error": "This studio is for the house's producer."}), 403)
    return acc, None


# ---------------------------------------------------------------- public api

def work_shape(w, full=False):
    out = {"id": w["id"], "slug": w["slug"], "title": w["title"],
           "variant": w["variant"], "ordinal": w.get("ordinal"), "published": True}
    if full:
        out["media"] = reads.media_for(w["id"])
        out["credits"] = reads.credits_for(w["id"])
        out["next"] = neighbour_shape(w.get("next"))
        out["prev"] = neighbour_shape(w.get("prev"))
    return out


def neighbour_shape(n):
    if not n:
        return None
    return {"slug": n["slug"], "title": n["title"], "ordinal": n.get("ordinal")}


def talent_shape(t, house_id=None, full=False):
    out = {"id": t["id"], "slug": t["slug"], "title": t["title"],
           "discipline": t["discipline"], "published": True}
    if full:
        out["media"] = reads.media_for(t["id"])
        out["selected_work"] = []
        if house_id:
            for w in reads.selected_works(house_id, t["id"]):
                out["selected_work"].append({
                    "id": w["id"], "slug": w["slug"], "title": w["title"],
                    "variant": w["variant"], "published": True})
    return out


@bp.get("/api/works")
def api_works():
    h = house()["id"]
    return cacheable(jsonify([work_shape(w) for w in reads.published_works(h)]))


@bp.get("/api/works/<slug>")
def api_work(slug):
    h = house()["id"]
    item_id, _ = reads.resolve_slug(h, "work", slug)
    if not item_id:
        return gone()
    rows = reads.published_works(h)
    target = next((w for w in rows if w["id"] == item_id), None)
    if not target:
        return gone()
    idx = rows.index(target)
    target = dict(target)
    target["next"] = rows[(idx + 1) % len(rows)] if len(rows) > 1 else None
    target["prev"] = rows[(idx - 1) % len(rows)] if len(rows) > 1 else None
    return cacheable(jsonify(work_shape(target, full=True)))


@bp.get("/api/talents")
def api_talents():
    h = house()["id"]
    d = request.args.get("discipline")
    return cacheable(jsonify([talent_shape(t) for t in reads.published_talents(h, d)]))


@bp.get("/api/talents/<slug>")
def api_talent(slug):
    h = house()["id"]
    item_id, _ = reads.resolve_slug(h, "talent", slug)
    if not item_id:
        return gone()
    t = next((x for x in reads.published_talents(h) if x["id"] == item_id), None)
    if not t:
        return gone()
    return cacheable(jsonify(talent_shape(t, h, full=True)))


@bp.get("/api/disciplines")
def api_disciplines():
    return cacheable(jsonify(reads.disciplines(house()["id"])))


@bp.get("/api/media/<media_id>")
def api_media(media_id):
    h = house()["id"]
    row = db.query(
        """SELECT m.seed, m.width, m.height, m.alt, i.published, i.house_id
           FROM media m JOIN items i ON i.id = m.item_id
           WHERE m.id = %s""", (media_id.lower(),), one=True)
    if not row:
        return gone()
    if row["house_id"] == h and row["published"]:
        # a public read of a published record of the served house
        png = pixels.make_still(row["seed"], row["width"], row["height"], row["alt"])
        return send_file(io.BytesIO(png), mimetype="image/png",
                         max_age=3600, download_name=f"{media_id}.png")
    # while its record is unlisted, its pixels are found by that record's own
    # house producer only, however the caller got the id
    acc = caller()
    if acc and acc["role"] == "producer" and acc["house_id"] == row["house_id"]:
        png = pixels.make_still(row["seed"], row["width"], row["height"], row["alt"])
        resp = send_file(io.BytesIO(png), mimetype="image/png",
                         download_name=f"{media_id}.png")
        resp.headers["Cache-Control"] = "no-store"
        return resp
    return gone()


# ---------------------------------------------------------------- studio api

def owned_item(acc, item_id):
    """An item of the caller's own house, or None. A foreign record answers
    exactly as a missing one."""
    return db.query(
        "SELECT * FROM items WHERE id = %s AND house_id = %s",
        (item_id, acc["house_id"]), one=True)


@bp.get("/api/studio/items")
def studio_items():
    acc, err = require_producer()
    if err:
        return err
    kind = request.args.get("kind")
    sql = "SELECT * FROM items WHERE house_id = %s"
    params = [acc["house_id"]]
    if kind in ("work", "talent"):
        sql += " AND kind = %s"
        params.append(kind)
    sql += " ORDER BY kind, position, created_at"
    rows = db.query(sql, tuple(params))
    return jsonify([item_shape(r) for r in rows])


def item_shape(r):
    return {"id": r["id"], "kind": r["kind"], "slug": r["slug"], "title": r["title"],
            "position": r["position"], "discipline": r["discipline"], "variant": r["variant"],
            "published": r["published"], "published_at": r["published_at"].isoformat() if r["published_at"] else None}


@bp.get("/api/studio/items/<item_id>")
def studio_item(item_id):
    acc, err = require_producer()
    if err:
        return err
    row = owned_item(acc, item_id)
    if not row:
        return gone()
    out = item_shape(row)
    out["media"] = reads.media_for(item_id)
    out["credits"] = reads.credits_for(item_id)
    return jsonify(out)


def kebab(value):
    import re
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value


@bp.post("/api/studio/items")
def studio_create():
    acc, err = require_producer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    if kind not in ("work", "talent"):
        return bad("A record is either a work or a talent.")
    title = (data.get("title") or "").strip()
    if not title:
        return bad("A title is required.")
    slug = kebab(data.get("slug") or title)
    if not slug:
        return bad("A slug is required.")
    discipline = data.get("discipline") if kind == "talent" else None
    variant = data.get("variant") if kind == "work" else "left"
    if kind == "talent" and discipline not in ("director", "photographer", "stylist"):
        return bad("A talent carries one of director, photographer or stylist.")
    if kind == "work" and variant not in ("left", "right", "centre"):
        return bad("A work carries one of left, right or centre.")
    item_id = new_id("itm")
    pos = db.query(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM items WHERE house_id=%s AND kind=%s",
        (acc["house_id"], kind), one=True)["next"]
    try:
        row = db.query_commit(
            """INSERT INTO items (id, house_id, kind, slug, title, position, discipline, variant)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (item_id, acc["house_id"], kind, slug, title, pos, discipline, variant))
    except Exception:
        return bad(f"That slug is already used in this house for a {kind}.", 409)
    return jsonify(item_shape(row)), 201


@bp.patch("/api/studio/items/<item_id>")
def studio_patch(item_id):
    acc, err = require_producer()
    if err:
        return err
    row = owned_item(acc, item_id)
    if not row:
        return gone()
    data = request.get_json(silent=True) or {}
    fields, params = [], []
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            return bad("A title cannot be empty.")
        fields.append("title = %s"); params.append(title)
    if "discipline" in data and row["kind"] == "talent":
        if data["discipline"] not in ("director", "photographer", "stylist"):
            return bad("A talent carries one of director, photographer or stylist.")
        fields.append("discipline = %s"); params.append(data["discipline"])
    if "variant" in data and row["kind"] == "work":
        if data["variant"] not in ("left", "right", "centre"):
            return bad("A work carries one of left, right or centre.")
        fields.append("variant = %s"); params.append(data["variant"])
    if "slug" in data and kebab(data["slug"]) != row["slug"]:
        return bad("A slug is changed through its own action so the old address keeps redirecting.", 409)
    if not fields:
        return jsonify(item_shape(row))
    params.append(item_id)
    try:
        out = db.query_commit(f"UPDATE items SET {', '.join(fields)} WHERE id = %s RETURNING *", tuple(params))
    except Exception:
        return bad("That change was refused.", 409)
    return jsonify(item_shape(out))


@bp.post("/api/studio/items/<item_id>/slug")
def studio_slug(item_id):
    acc, err = require_producer()
    if err:
        return err
    row = owned_item(acc, item_id)
    if not row:
        return gone()
    data = request.get_json(silent=True) or {}
    new_slug = kebab(data.get("slug") or "")
    if not new_slug:
        return bad("A slug is required.")
    if new_slug == row["slug"]:
        return jsonify(item_shape(row))
    try:
        out = db.query_commit(
            """UPDATE items SET slug = %s WHERE id = %s RETURNING *""",
            (new_slug, item_id))
    except Exception:
        return bad("That slug is already used in this house.", 409)
    try:
        db.query_commit(
            """INSERT INTO slug_redirects (id, house_id, kind, old_slug, item_id)
               VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (new_id("srd"), acc["house_id"], row["kind"], row["slug"], item_id))
    except Exception:
        pass
    return jsonify(item_shape(out))


@bp.post("/api/studio/items/<item_id>/publish")
def studio_publish(item_id):
    acc, err = require_producer()
    if err:
        return err
    row = owned_item(acc, item_id)
    if not row:
        return gone()
    data = request.get_json(silent=True) or {}
    published = bool(data.get("published"))
    if published and not row["published"]:
        poster = db.query(
            "SELECT alt FROM media WHERE item_id=%s AND role='poster' ORDER BY position LIMIT 1",
            (item_id,), one=True)
        if not poster or not (poster["alt"] or "").strip():
            return bad("A published record needs a poster whose written alternative is not empty.")
        out = db.query_commit(
            "UPDATE items SET published = true, published_at = now() WHERE id = %s RETURNING *",
            (item_id,))
    elif not published:
        out = db.query_commit(
            "UPDATE items SET published = false, published_at = NULL WHERE id = %s RETURNING *",
            (item_id,))
    else:
        out = row
    return jsonify(item_shape(out))


@bp.post("/api/studio/items/<item_id>/media")
def studio_media(item_id):
    acc, err = require_producer()
    if err:
        return err
    row = owned_item(acc, item_id)
    if not row:
        return gone()
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    if role not in ("poster", "reel", "gallery"):
        return bad("Media is a poster, a reel or a gallery still.")
    try:
        width = int(data.get("width") or 0)
        height = int(data.get("height") or 0)
        seed = int(data.get("seed") or secrets.randbelow(1_000_000_000))
    except (TypeError, ValueError):
        return bad("Width, height and seed are numbers.")
    if not (8 <= width <= 2400 and 8 <= height <= 2400):
        return bad("Width and height sit between 8 and 2400.")
    alt = (data.get("alt") or "").strip()
    if role == "poster" and not alt:
        return bad("A poster carries a written alternative and it cannot be empty.")
    media_id = secrets.token_hex(16)
    pos = db.query("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM media WHERE item_id=%s",
                   (item_id,), one=True)["next"]
    db.query_commit(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (media_id, item_id, role, pos, seed, width, height, alt))
    return jsonify({"media_id": media_id, "role": role, "width": width, "height": height,
                    "alt": alt, "position": pos}), 201


@bp.post("/api/studio/items/<item_id>/credits")
def studio_credit(item_id):
    acc, err = require_producer()
    if err:
        return err
    row = owned_item(acc, item_id)
    if not row:
        return gone()
    if row["kind"] != "work":
        return bad("Credits sit on a work.")
    data = request.get_json(silent=True) or {}
    role = (data.get("role") or "").strip()
    name = (data.get("name") or "").strip()
    if not role or not name:
        return bad("A credit names a role and a name.")
    talent_id = data.get("talent_id") or data.get("talent_item_id")
    if talent_id:
        t = owned_item(acc, talent_id)
        if not t or t["kind"] != "talent":
            return bad("A credit may point only at this house's own talent.")
    else:
        talent_id = None
    pos = db.query("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM credits WHERE item_id=%s",
                   (item_id,), one=True)["next"]
    credit_id = new_id("crd")
    db.query_commit(
        """INSERT INTO credits (id, item_id, position, role, name, talent_item_id)
           VALUES (%s,%s,%s,%s,%s,%s)""",
        (credit_id, item_id, pos, role, name, talent_id))
    out = db.query(
        """SELECT c.*, t.slug AS talent_slug, t.title AS talent_title
           FROM credits c LEFT JOIN items t ON t.id = c.talent_item_id WHERE c.id=%s""",
        (credit_id,), one=True)
    return jsonify({"id": out["id"], "role": out["role"], "name": out["name"],
                    "talent_id": out["talent_item_id"], "talent_slug": out["talent_slug"],
                    "talent_title": out["talent_title"]}), 201


@bp.post("/api/studio/works/order")
def studio_order():
    acc, err = require_producer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    ids = data.get("ordered_ids")
    if not isinstance(ids, list):
        return bad("ordered_ids is a list of the house's work ids in their new order.")
    own = {r["id"] for r in db.query(
        "SELECT id FROM items WHERE house_id=%s AND kind='work'", (acc["house_id"],))}
    if set(ids) != own or len(ids) != len(own):
        return bad("ordered_ids must name exactly this house's works once each.")
    with db.transaction() as cur:
        for pos, item_id in enumerate(ids):
            cur.execute("UPDATE items SET position = %s WHERE id = %s AND house_id = %s",
                        (pos, item_id, acc["house_id"]))
    rows = db.query(
        "SELECT * FROM items WHERE house_id=%s AND kind='work' ORDER BY position", (acc["house_id"],))
    return jsonify([item_shape(r) for r in rows])


@bp.post("/api/studio/preview-tokens")
def studio_preview_token():
    acc, err = require_producer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    item_id = data.get("item_id")
    row = owned_item(acc, item_id) if item_id else None
    if not row:
        return gone()
    token = secrets.token_hex(16)
    expires = datetime.now(timezone.utc) + timedelta(seconds=Config.PREVIEW_TOKEN_TTL)
    db.query_commit(
        """INSERT INTO preview_tokens (id, token, item_id, expires_at, created_by)
           VALUES (%s,%s,%s,%s,%s)""",
        (new_id("pv"), token, item_id, expires, acc["id"]))
    return jsonify({"token": token, "expires_at": expires.isoformat()}), 201


@bp.get("/api/preview/<token>")
def api_preview(token):
    """One unlisted record, for its own house's producer only."""
    acc = caller()
    if not acc or acc["role"] != "producer":
        return gone()
    row = db.query(
        """SELECT p.item_id, p.expires_at, i.house_id FROM preview_tokens p
           JOIN items i ON i.id = p.item_id WHERE p.token = %s""",
        (token.lower(),), one=True)
    if not row or row["expires_at"] < datetime.now(timezone.utc):
        return gone()
    if row["house_id"] != acc["house_id"]:
        return gone()
    item = db.query("SELECT * FROM items WHERE id = %s", (row["item_id"],), one=True)
    if not item:
        return gone()
    out = item_shape(item)
    out["media"] = reads.media_for(item["id"])
    out["credits"] = reads.credits_for(item["id"])
    return never_cached(jsonify(out))
