"""The JSON API blueprint: public reads, generated media, preview, studio.

Authorization is enforced server-side on every studio endpoint, reads included:
a viewer token or no token is denied, and a producer of another house naming a
cirrus record is answered exactly as a producer naming a record that does not
exist.
"""
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone

from flask import (Blueprint, abort, jsonify, make_response, render_template,
                   request)

from . import auth, db, media, repo
from .renderers import public_payload, studio_payload

log = logging.getLogger("cirrus")

api = Blueprint("api", __name__)

PUBLIC_CACHE_SECONDS = 60
PREVIEW_TOKEN_TTL_MINUTES = 15
META_DESCRIPTION = "A production house for picture and its makers."


class ApiError(Exception):
    def __init__(self, status, reason):
        self.status = status
        self.reason = reason


def render_not_found():
    return render_template("404.html", title="Cirrus", description=META_DESCRIPTION,
                           share_image="/share.jpg", account=None, house=None,
                           route_name="entry"), 404


@api.errorhandler(ApiError)
def _api_error(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": err.reason}), err.status
    abort(err.status)


@api.errorhandler(404)
def _nf(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return render_not_found()


@api.errorhandler(405)
def _nm(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return render_not_found()


@api.errorhandler(400)
@api.errorhandler(401)
@api.errorhandler(403)
def _client_error(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": err.description or "That request was refused"}), err.code
    return render_not_found()


@api.errorhandler(Exception)
def _boom(err):
    from werkzeug.exceptions import HTTPException

    if isinstance(err, HTTPException):
        if request.path.startswith("/api/"):
            return jsonify({"error": err.description or "Error"}), err.code
        if err.code in (400, 401, 403, 404, 405):
            return render_not_found()
        return err
    log.exception("unhandled error at %s", request.path)
    if request.path.startswith("/api/"):
        return jsonify({"error": "The server could not answer that"}), 500
    return render_not_found()


def require_house():
    acct = auth.current_account()
    if not acct or acct["role"] != "producer" or not acct["house_id"]:
        raise ApiError(404, "Not found")
    return acct["house_id"]


def own_item(item_id: str):
    house_id = require_house()
    row = repo.item_by_id(item_id, house_id)
    if not row:
        raise ApiError(404, "Not found")
    return row


# --- health ------------------------------------------------------------------

@api.get("/api/health")
def health():
    try:
        repo.published_talents()
    except Exception:
        return jsonify({"error": "not ready"}), 503
    return jsonify({"ok": True})


# --- auth --------------------------------------------------------------------

@api.post("/api/auth/signup")
def api_signup():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if not email or "@" not in email or len(email) > 254:
        raise ApiError(400, "A valid email address is required")
    if len(password) < 8:
        raise ApiError(400, "A password of at least 8 characters is required")
    acct_id = db.new_id()
    try:
        with db.pool.tx() as conn:
            conn.execute(
                """
                INSERT INTO accounts (id, email, password_hash, role, house_id)
                VALUES (%s,%s,%s,'viewer',NULL)
                """,
                (acct_id, email, auth.hash_password(password)),
            )
    except Exception:
        raise ApiError(409, "That email is already registered")
    token = auth.mint_token(acct_id)
    out = {"account": {"id": acct_id, "email": email, "role": "viewer", "house_id": None},
           "token": token}
    resp = jsonify(out)
    resp.set_cookie("cirrus_token", token, httponly=True, samesite="Lax",
                    max_age=30 * 86400, path="/")
    return resp


@api.post("/api/auth/login")
def api_login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    row = db.pool.query_one(
        """
        SELECT a.id, a.email, a.password_hash, a.role, a.house_id, h.slug AS house_slug, h.name AS house_name
        FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
        WHERE a.email = %s
        """,
        (email,),
    )
    if not row or not auth.verify_password(password, row["password_hash"]):
        raise ApiError(401, "Email or password is not correct")
    token = auth.mint_token(row["id"])
    out = {"account": {"id": row["id"], "email": row["email"], "role": row["role"],
                       "house_id": row["house_id"]},
           "token": token}
    if row["role"] == "producer":
        out["house"] = {"slug": row["house_slug"], "name": row["house_name"], "id": row["house_id"]}
    resp = jsonify(out)
    resp.set_cookie("cirrus_token", token, httponly=True, samesite="Lax",
                    max_age=30 * 86400, path="/")
    return resp


@api.post("/api/auth/logout")
def api_logout():
    """Signing out clears the cookie; /studio is unreachable at once after."""
    resp = jsonify({"ok": True})
    resp.delete_cookie("cirrus_token", path="/")
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


# --- public reads ------------------------------------------------------------

@api.get("/api/works")
def api_works():
    rows = [public_payload(r, repo.media_for(r["id"]), repo.credits_for(r["id"]))
            for r in repo.published_works()]
    resp = jsonify(rows)
    resp.headers["Cache-Control"] = "public, max-age=%d" % PUBLIC_CACHE_SECONDS
    return resp


@api.get("/api/works/<slug>")
def api_work(slug):
    row = repo.work_by_slug(slug)
    if not row:
        raise ApiError(404, "Not found")
    prev, nxt = row.pop("prev"), row.pop("next")
    payload = public_payload(row, repo.media_for(row["id"]), repo.credits_for(row["id"]))
    payload["neighbours"] = {"prev": _neighbour(prev), "next": _neighbour(nxt)}
    resp = jsonify(payload)
    resp.headers["Cache-Control"] = "public, max-age=%d" % PUBLIC_CACHE_SECONDS
    return resp


def _neighbour(row):
    if not row:
        return None
    return {"slug": row["slug"], "title": row["title"], "ordinal": row.get("ordinal")}


@api.get("/api/talents")
def api_talents():
    discipline = request.args.get("discipline")
    rows = repo.published_talents(discipline=discipline)
    out = [public_payload(r, repo.media_for(r["id"]), []) for r in rows]
    resp = jsonify(out)
    resp.headers["Cache-Control"] = "public, max-age=%d" % PUBLIC_CACHE_SECONDS
    return resp


@api.get("/api/talents/<slug>")
def api_talent(slug):
    row = repo.talent_by_slug(slug)
    if not row:
        raise ApiError(404, "Not found")
    payload = public_payload(row, repo.media_for(row["id"]), [])
    payload["selected_works"] = [public_payload(w, repo.media_for(w["id"]), [])
                                 for w in repo.selected_works(row["id"])]
    resp = jsonify(payload)
    resp.headers["Cache-Control"] = "public, max-age=%d" % PUBLIC_CACHE_SECONDS
    return resp


@api.get("/api/disciplines")
def api_disciplines():
    resp = jsonify(repo.discipline_set())
    resp.headers["Cache-Control"] = "public, max-age=%d" % PUBLIC_CACHE_SECONDS
    return resp


HEX = set("0123456789abcdef")


@api.get("/api/media/<media_id>")
def api_media(media_id):
    """Generated pixels: rendered while the record is published; while it is
    unlisted, found only by that record's own house producer, however the
    caller got the id."""
    if len(media_id) != 32 or not set(media_id) <= HEX:
        raise ApiError(404, "Not found")
    row = db.pool.query_one(
        """
        SELECT m.id, m.item_id, m.role, m.seed, m.width, m.height, m.alt,
               i.house_id, i.published, i.title
        FROM media m JOIN items i ON i.id = m.item_id
        WHERE m.id = %s
        """,
        (media_id,),
    )
    if not row:
        raise ApiError(404, "Not found")
    if not row["published"]:
        acct = auth.current_account()
        if not acct or acct["role"] != "producer" or acct.get("house_id") != row["house_id"]:
            raise ApiError(404, "Not found")
    try:
        data = media.render_still(row["seed"], row["width"], row["height"])
    except Exception:
        log.exception("media render failed for %s", media_id)
        raise ApiError(404, "Not found")
    resp = make_response(data, 200)
    resp.headers["Content-Type"] = "image/jpeg"
    resp.headers["Cache-Control"] = ("public, max-age=%d" % PUBLIC_CACHE_SECONDS) if row["published"] \
        else "private, no-store"
    return resp


# --- preview -----------------------------------------------------------------

@api.get("/api/preview/<token>")
def api_preview(token):
    row = db.pool.query_one(
        """
        SELECT p.item_id, p.expires_at, i.house_id
        FROM preview_tokens p JOIN items i ON i.id = p.item_id
        WHERE p.token = %s
        """,
        (token,),
    )
    if not row:
        raise ApiError(404, "Not found")
    if row["expires_at"] < datetime.now(timezone.utc):
        db.pool.run("DELETE FROM preview_tokens WHERE token = %s", (token,))
        raise ApiError(404, "Not found")
    acct = auth.current_account()
    if not acct or acct["role"] != "producer" or acct.get("house_id") != row["house_id"]:
        raise ApiError(404, "Not found")
    item = repo.item_by_id(row["item_id"], row["house_id"])
    if not item:
        raise ApiError(404, "Not found")
    return jsonify(studio_payload(item, repo.media_for(item["id"]), repo.credits_for(item["id"])))


# --- studio ------------------------------------------------------------------

@api.get("/api/studio/items")
def studio_items():
    house_id = require_house()
    kind = request.args.get("kind")
    if kind not in (None, "work", "talent"):
        raise ApiError(400, "kind must be work or talent")
    sql = """
        SELECT id, house_id, kind, slug, title, position, discipline, variant,
               published, published_at, created_at
        FROM items WHERE house_id = %s
    """
    params = [house_id]
    if kind:
        sql += " AND kind = %s"
        params.append(kind)
    sql += " ORDER BY kind ASC, position ASC, created_at ASC, id ASC"
    resp = jsonify([studio_payload(r) for r in db.pool.query(sql, params)])
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


@api.get("/api/studio/items/<item_id>")
def studio_item(item_id):
    row = own_item(item_id)
    resp = jsonify(studio_payload(row, repo.media_for(row["id"]), repo.credits_for(row["id"])))
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


SLUG_MIN = 2


def _clean_slug(raw: str):
    s = (raw or "").strip().lower()
    s = "-".join(p for p in s.split() if p)
    out = []
    for ch in s:
        if (ch.isascii() and ch.isalnum()) or ch == "-":
            out.append(ch)
        else:
            out.append("-")
    return "-".join(p for p in "".join(out).split("-") if p)


@api.post("/api/studio/items")
def studio_create():
    house_id = require_house()
    body = request.get_json(silent=True) or {}
    kind = body.get("kind")
    if kind not in ("work", "talent"):
        raise ApiError(400, "kind must be work or talent")
    title = (body.get("title") or "").strip()
    if not title:
        raise ApiError(400, "A title is required")
    slug = _clean_slug(body.get("slug") or title)
    if len(slug) < SLUG_MIN:
        raise ApiError(400, "A slug of at least 2 characters is required")
    discipline = body.get("discipline")
    variant = body.get("variant")
    if kind == "talent":
        if discipline not in ("director", "photographer", "stylist"):
            raise ApiError(400, "A talent needs a discipline of director, photographer or stylist")
        variant = None
    else:
        if variant not in (None, "", "left", "right", "centre"):
            raise ApiError(400, "variant must be left, right or centre")
        variant = variant or "left"
        discipline = None
    item_id = db.new_id()
    nxt = (db.pool.query_one(
        "SELECT COALESCE(MAX(position)+1, 0) AS p FROM items WHERE house_id=%s AND kind=%s",
        (house_id, kind)) or {"p": 0})["p"]
    try:
        with db.pool.tx() as conn:
            conn.execute(
                """
                INSERT INTO items (id, house_id, kind, slug, title, position, discipline, variant, published, published_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,FALSE,NULL)
                """,
                (item_id, house_id, kind, slug, title, nxt, discipline, variant),
            )
    except Exception:
        raise ApiError(409, "That slug is already used in this house for a %s" % kind)
    row = repo.item_by_id(item_id, house_id)
    resp = jsonify(studio_payload(row))
    resp.status_code = 201
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


@api.patch("/api/studio/items/<item_id>")
def studio_patch(item_id):
    row = own_item(item_id)
    body = request.get_json(silent=True) or {}
    fields = {}
    if "title" in body:
        title = (body.get("title") or "").strip()
        if not title:
            raise ApiError(400, "A title is required")
        fields["title"] = title
    if "discipline" in body and row["kind"] == "talent":
        if body["discipline"] not in ("director", "photographer", "stylist"):
            raise ApiError(400, "A discipline must be director, photographer or stylist")
        fields["discipline"] = body["discipline"]
    if "variant" in body and row["kind"] == "work":
        if body["variant"] not in ("left", "right", "centre"):
            raise ApiError(400, "variant must be left, right or centre")
        fields["variant"] = body["variant"]
    if not fields:
        raise ApiError(400, "Nothing to change was given")
    sets = ", ".join("%s = %%s" % k for k in fields)
    db.pool.run(
        "UPDATE items SET %s WHERE id = %%s AND house_id = %%s" % sets,
        tuple(list(fields.values()) + [row["id"], row["house_id"]]),
    )
    row = repo.item_by_id(row["id"], row["house_id"])
    resp = jsonify(studio_payload(row, repo.media_for(row["id"]), repo.credits_for(row["id"])))
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


@api.post("/api/studio/items/<item_id>/publish")
def studio_publish(item_id):
    row = own_item(item_id)
    body = request.get_json(silent=True) or {}
    if "published" not in body:
        raise ApiError(400, "published is required")
    want = bool(body["published"])
    if want:
        poster = db.pool.query_one(
            "SELECT id, alt FROM media WHERE item_id = %s AND role = 'poster' ORDER BY position, created_at LIMIT 1",
            (row["id"],),
        )
        if not poster:
            raise ApiError(400, "A record needs a poster before it can be published")
        if not (poster["alt"] or "").strip():
            raise ApiError(400, "The poster needs a written alternative before this record can be published")
    if want and not row["published"]:
        db.pool.run("UPDATE items SET published = TRUE, published_at = now() WHERE id = %s", (row["id"],))
    elif not want and row["published"]:
        db.pool.run("UPDATE items SET published = FALSE, published_at = NULL WHERE id = %s", (row["id"],))
    row = repo.item_by_id(row["id"], row["house_id"])
    resp = jsonify(studio_payload(row, repo.media_for(row["id"]), repo.credits_for(row["id"])))
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


@api.post("/api/studio/items/<item_id>/media")
def studio_media(item_id):
    row = own_item(item_id)
    body = request.get_json(silent=True) or {}
    role = body.get("role")
    if role not in ("poster", "reel", "gallery"):
        raise ApiError(400, "role must be poster, reel or gallery")
    try:
        width = int(body.get("width") or 0)
        height = int(body.get("height") or 0)
    except (TypeError, ValueError):
        raise ApiError(400, "width and height must be numbers")
    if width < 8 or height < 8 or width > 2400 or height > 2400:
        raise ApiError(400, "width and height must be between 8 and 2400")
    alt = (body.get("alt") or "").strip()
    if not alt:
        raise ApiError(400, "A written alternative is required for every media row")
    seed = (body.get("seed") or "").strip() or secrets.token_hex(8)
    nxt = (db.pool.query_one(
        "SELECT COALESCE(MAX(position)+1, 0) AS p FROM media WHERE item_id = %s", (row["id"],))
        or {"p": 0})["p"]
    media_id = db.new_id()
    db.pool.run(
        """
        INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (media_id, row["id"], role, nxt, seed, width, height, alt),
    )
    resp = jsonify({"media_id": media_id, "role": role, "width": width, "height": height,
                    "alt": alt, "seed": seed})
    resp.status_code = 201
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


@api.post("/api/studio/items/<item_id>/credits")
def studio_credit(item_id):
    row = own_item(item_id)
    if row["kind"] != "work":
        raise ApiError(400, "Credits are attached to works")
    body = request.get_json(silent=True) or {}
    role = (body.get("role") or "").strip()
    name = (body.get("name") or "").strip()
    if not role or not name:
        raise ApiError(400, "A credit needs a role and a name")
    talent_id = body.get("talent_id") or None
    if talent_id:
        t = repo.item_by_id(talent_id, row["house_id"])
        if not t or t["kind"] != "talent":
            raise ApiError(400, "That talent is not in the house")
    nxt = (db.pool.query_one(
        "SELECT COALESCE(MAX(position)+1, 0) AS p FROM credits WHERE item_id = %s", (row["id"],))
        or {"p": 0})["p"]
    credit_id = db.new_id()
    db.pool.run(
        """
        INSERT INTO credits (id, item_id, position, role, name, talent_item_id)
        VALUES (%s,%s,%s,%s,%s,%s)
        """,
        (credit_id, row["id"], nxt, role, name, talent_id),
    )
    c = db.pool.query_one(
        """
        SELECT c.id, c.position, c.role, c.name, c.talent_item_id, t.slug AS talent_slug
        FROM credits c LEFT JOIN items t ON t.id = c.talent_item_id WHERE c.id = %s
        """,
        (credit_id,),
    )
    resp = jsonify(dict(c))
    resp.status_code = 201
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


@api.post("/api/studio/items/<item_id>/slug")
def studio_slug(item_id):
    row = own_item(item_id)
    body = request.get_json(silent=True) or {}
    new_slug = _clean_slug(body.get("slug") or "")
    if len(new_slug) < SLUG_MIN:
        raise ApiError(400, "A slug of at least 2 characters is required")
    if new_slug == row["slug"]:
        resp = jsonify(studio_payload(row, repo.media_for(row["id"]), repo.credits_for(row["id"])))
        resp.headers["Cache-Control"] = "private, no-store"
        return resp
    try:
        with db.pool.tx() as conn:
            conn.execute("UPDATE items SET slug = %s WHERE id = %s", (new_slug, row["id"]))
            conn.execute(
                """
                INSERT INTO slug_redirects (id, house_id, kind, old_slug, item_id)
                VALUES (%s,%s,%s,%s,%s)
                """,
                (db.new_id(), row["house_id"], row["kind"], row["slug"], row["id"]),
            )
    except Exception:
        raise ApiError(409, "That slug is already used in this house for a %s" % row["kind"])
    row = repo.item_by_id(row["id"], row["house_id"])
    resp = jsonify(studio_payload(row, repo.media_for(row["id"]), repo.credits_for(row["id"])))
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


@api.post("/api/studio/works/order")
def studio_order():
    house_id = require_house()
    body = request.get_json(silent=True) or {}
    ids = body.get("ordered_ids")
    if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
        raise ApiError(400, "ordered_ids must be a list of record ids")
    known = db.pool.query(
        "SELECT id FROM items WHERE house_id = %s AND kind = 'work' AND id = ANY(%s)",
        (house_id, ids),
    )
    if len({r["id"] for r in known}) != len(set(ids)):
        # a foreign or missing record is answered exactly as a missing one
        raise ApiError(404, "Not found")
    with db.pool.tx() as conn:
        for pos, iid in enumerate(ids):
            conn.execute(
                "UPDATE items SET position = %s WHERE id = %s AND house_id = %s AND kind = 'work'",
                (pos, iid, house_id),
            )
    rows = db.pool.query(
        """
        SELECT id, house_id, kind, slug, title, position, discipline, variant, published, published_at, created_at
        FROM items WHERE house_id = %s AND kind = 'work' ORDER BY position ASC, created_at ASC
        """,
        (house_id,),
    )
    resp = jsonify([studio_payload(r) for r in rows])
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


@api.post("/api/studio/preview-tokens")
def studio_preview_tokens():
    house_id = require_house()
    body = request.get_json(silent=True) or {}
    row = repo.item_by_id(body.get("item_id") or "", house_id)
    if not row:
        raise ApiError(404, "Not found")
    token = secrets.token_hex(16)
    expires = datetime.now(timezone.utc) + timedelta(minutes=PREVIEW_TOKEN_TTL_MINUTES)
    db.pool.run(
        """
        INSERT INTO preview_tokens (id, token, item_id, expires_at, created_by)
        VALUES (%s,%s,%s,%s,%s)
        """,
        (db.new_id(), token, row["id"], expires, auth.current_account()["id"]),
    )
    resp = jsonify({"token": token, "expires_at": expires.isoformat()})
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


# --- generated share image ---------------------------------------------------

@api.get("/share.jpg")
def share_image():
    resp = make_response(media.share_image(), 200)
    resp.headers["Content-Type"] = "image/jpeg"
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp
