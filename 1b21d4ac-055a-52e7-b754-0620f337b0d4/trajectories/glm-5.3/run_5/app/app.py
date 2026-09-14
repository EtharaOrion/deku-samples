"""Cirrus: the public site and the studio behind it."""
import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import timedelta

from flask import (Flask, abort, g, jsonify, make_response, redirect,
                   render_template, request, send_file)
from werkzeug.exceptions import HTTPException

import config
import images
import records
from db import (db, ensure_schema, hash_password, hex32, ident, iso, seed as seed_db,
                slugify, token_hash, utcnow, verify_password)

app = Flask(__name__)
app.url_map.strict_slashes = False

READY = {"ok": False}


# ---------------------------------------------------------------- app lifecycle
def init_db() -> None:
    conn = db()
    try:
        ensure_schema(conn)
        seed_db(conn)
        READY["ok"] = True
    finally:
        conn.close()


def public_house(conn) -> dict:
    row = conn.execute(
        "SELECT id, slug, name, tagline_upper, tagline_lower, street, city, district, "
        "contact_email FROM houses WHERE slug=%s", (config.PUBLIC_HOUSE,)).fetchone()
    if not row:
        abort(500)
    return {"id": row[0], "slug": row[1], "name": row[2], "tagline_upper": row[3],
            "tagline_lower": row[4], "street": row[5], "city": row[6],
            "district": row[7], "contact_email": row[8]}


@app.before_request
def open_db():
    if not READY["ok"]:
        init_db()
    g.conn = db()
    g.house = public_house(g.conn)


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("conn", None)
    if conn is not None:
        conn.close()


@app.after_request
def one_line_log(response):
    proto = request.environ.get("SERVER_PROTOCOL", "HTTP/1.1").split("/")[-1]
    print(f'{request.remote_addr} - "{request.method} {request.path} '
          f'{request.scheme.upper()}/{proto}" {response.status_code}', flush=True)
    return response


# ---------------------------------------------------------------- errors
def api_error(status: int, message: str):
    resp = jsonify({"error": message})
    resp.status_code = status
    return resp


@app.errorhandler(HTTPException)
def handle_http_exception(exc):
    if request.path.startswith("/api/"):
        return api_error(exc.code, exc.description)
    if exc.code in (401, 403, 404, 405, 410):
        try:
            house = g.get("house")
        except Exception:
            house = None
        resp = make_response(render_template(
            "notfound.html", house=house, status=exc.code))
        resp.status_code = exc.code
        return resp
    return exc


def not_found_api(message="Not found."):
    return api_error(404, message)


# ---------------------------------------------------------------- bearer tokens
def _secret() -> bytes:
    return hashlib.sha256(("cirrus:" + config.DATABASE_URL).encode("utf-8")).digest()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def mint_token(account_id: str) -> str:
    """Self-contained signed bearer token; no store, no third party."""
    payload = json.dumps({"id": account_id, "exp": int(time.time()) + config.TOKEN_TTL_HOURS * 3600},
                         separators=(",", ":"), sort_keys=True).encode("utf-8")
    body = _b64(payload)
    sig = hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).hexdigest()[:32]
    return f"{body}.{sig}"


def account_for_token(token: str):
    parts = (token or "").split(".")
    if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{32}", parts[1]):
        return None
    body, sig = parts
    expect = hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(expect, sig):
        return None
    try:
        claims = json.loads(_unb64(body))
    except Exception:
        return None
    if not isinstance(claims, dict) or int(claims.get("exp", 0)) < time.time():
        return None
    row = g.conn.execute(
        "SELECT id, email, role, house_id FROM accounts WHERE id=%s",
        (claims.get("id"),)).fetchone()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "role": row[2], "house_id": row[3]}


def bearer_from_request() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.cookies.get("cirrus_token") or None


def current_account():
    token = bearer_from_request()
    if not token:
        return None
    return account_for_token(token)


def set_session_cookie(resp, token: str):
    """The same bearer token, carried as a cookie so a document navigation can
    present it. The token stays the app's own; nothing is bought in."""
    resp.set_cookie("cirrus_token", token, max_age=config.TOKEN_TTL_HOURS * 3600,
                    httponly=True, samesite="Lax", path="/")


def require_producer():
    """Returns (account, error_response). Never trusts role or house from a body."""
    account = current_account()
    if not account:
        return None, api_error(401, "Sign in to the studio first.")
    if account["role"] != "producer" or not account["house_id"]:
        return None, api_error(403, "This studio route is for a house producer.")
    return account, None


# ---------------------------------------------------------------- api: health
@app.get("/api/health")
def api_health():
    if not READY["ok"]:
        init_db()
    g.conn.execute("SELECT 1 FROM houses WHERE slug=%s", (config.PUBLIC_HOUSE,)).fetchone()
    g.conn.execute("SELECT count(*) FROM items WHERE house_id=%s AND published",
                   (g.house["id"],)).fetchone()
    return jsonify({"ok": True, "house": g.house["slug"]})


# ---------------------------------------------------------------- api: auth
@app.post("/api/auth/signup")
def api_signup():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return api_error(400, "Enter an email address we can reply to.")
    if len(password) < 8:
        return api_error(400, "A password of at least 8 characters is needed.")
    try:
        account_id = ident("acc")
        g.conn.execute(
            "INSERT INTO accounts (id, email, password_hash, role, house_id) VALUES (%s,%s,%s,'viewer',NULL)",
            (account_id, email, hash_password(password)))
    except Exception:
        return api_error(409, "That email is already registered. Sign in instead.")
    token = mint_token(account_id)
    resp = jsonify({"account": {"id": account_id, "email": email, "role": "viewer"},
                    "token": token})
    set_session_cookie(resp, token)
    return resp, 201


@app.post("/api/auth/login")
def api_login():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    row = g.conn.execute(
        "SELECT id, password_hash, role, house_id FROM accounts WHERE email=%s",
        (email,)).fetchone()
    if not row or not verify_password(password, row[1]):
        return api_error(401, "That email and password do not match.")
    account = {"id": row[0], "email": email, "role": row[2], "house_id": row[3]}
    token = mint_token(row[0])
    resp = jsonify({"token": token, "account": account})
    set_session_cookie(resp, token)
    return resp


@app.post("/api/auth/signout")
def api_signout():
    resp = jsonify({"ok": True})
    resp.delete_cookie("cirrus_token", path="/")
    return resp

@app.get("/api/auth/me")
def api_me():
    account = current_account()
    if not account:
        return api_error(401, "Sign in to the studio first.")
    return jsonify({"account": account})


# ---------------------------------------------------------------- api: public reads
@app.get("/api/works")
def api_works():
    return jsonify(records.published_works(g.conn, g.house["id"]))


@app.get("/api/works/<slug>")
def api_work(slug):
    work = records.work_by_slug(g.conn, g.house["id"], slug)
    if not work:
        return not_found_api("That work is not here.")
    return jsonify(work)


@app.get("/api/talents")
def api_talents():
    discipline = request.args.get("discipline")
    return jsonify(records.published_talents(g.conn, g.house["id"], discipline))


@app.get("/api/talents/<slug>")
def api_talent(slug):
    talent = records.talent_by_slug(g.conn, g.house["id"], slug)
    if not talent:
        return not_found_api("That name is not on the roster.")
    return jsonify(talent)


@app.get("/api/disciplines")
def api_disciplines():
    return jsonify(records.disciplines(g.conn, g.house["id"]))


@app.get("/api/media/<media_id>")
def api_media(media_id):
    row = records.media_row(g.conn, media_id)
    if not row:
        return not_found_api("That media address does not resolve.")
    published = row[9]
    if not published:
        return not_found_api("That media address does not resolve.")
    try:
        payload = images.still_bytes(row[4], row[5], row[6])
    except Exception:
        return api_error(500, "That still could not be drawn.")
    resp = make_response(payload)
    resp.headers["Content-Type"] = "image/webp"
    resp.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=60"
    return resp


@app.get("/api/reel/<media_id>")
def api_reel(media_id):
    """A reel's poster still: same visibility rules as the still."""
    row = records.media_row(g.conn, media_id)
    if not row or not row[9]:
        return not_found_api("That media address does not resolve.")
    payload = images.still_bytes(row[4] + "reel", row[5], row[6])
    resp = make_response(payload)
    resp.headers["Content-Type"] = "image/webp"
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------------------------------------------------------------- api: preview
@app.get("/api/preview/<token>")
def api_preview(token):
    """One unlisted record, for its own house's producer and nobody else."""
    account = current_account()
    if not account or account["role"] != "producer":
        return not_found_api("That preview does not resolve.")
    row = g.conn.execute(
        """SELECT t.token, t.item_id, t.expires_at, i.house_id
             FROM preview_tokens t JOIN items i ON i.id = t.item_id
            WHERE t.token=%s""", (token,)).fetchone()
    if not row or row[2] < utcnow():
        return not_found_api("That preview does not resolve.")
    if row[3] != account["house_id"]:
        return not_found_api("That preview does not resolve.")
    item = records.studio_item(g.conn, row[1])
    if not item or item["published"]:
        return not_found_api("That preview does not resolve.")
    return jsonify(item)


# ---------------------------------------------------------------- api: studio
def house_item(item_id: str, conn=None):
    """A record of the caller's own house, or None. Foreign answers as missing."""
    conn = conn or g.conn
    return conn.execute(
        f"SELECT {records.ITEM_COLUMNS} FROM items WHERE id=%s",
        (item_id,)).fetchone()


def owned_row_or_none(item_id: str, house_id: str):
    row = house_item(item_id)
    if not row or row[1] != house_id:
        return None
    return row


@app.get("/api/studio/items")
def api_studio_items():
    account, err = require_producer()
    if err:
        return err
    kind = request.args.get("kind")
    if kind not in (None, "work", "talent"):
        return api_error(400, "Kind must be work or talent.")
    return jsonify(records.studio_items(g.conn, account["house_id"], kind))


@app.get("/api/studio/items/<item_id>")
def api_studio_item(item_id):
    account, err = require_producer()
    if err:
        return err
    row = owned_row_or_none(item_id, account["house_id"])
    if not row:
        return not_found_api("No such record in your house.")
    item = records.studio_item(g.conn, item_id)
    item["ordinal"] = records.ordinal_of(g.conn, account["house_id"], item_id)
    return jsonify(item)


@app.post("/api/studio/items")
def api_studio_create():
    account, err = require_producer()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    kind = body.get("kind")
    if kind not in ("work", "talent"):
        return api_error(400, "Choose whether this is a work or a talent.")
    title = str(body.get("title") or "").strip()
    if not title:
        return api_error(400, "Give the record a title.")
    slug = slugify(str(body.get("slug") or title))
    if not slug:
        return api_error(400, "Give the record a slug made of letters and numbers.")
    discipline = body.get("discipline") if kind == "talent" else None
    if kind == "talent" and discipline not in ("director", "photographer", "stylist"):
        return api_error(400, "A talent needs a discipline: director, photographer or stylist.")
    variant = body.get("variant") if kind == "work" else None
    if kind == "work" and variant not in ("left", "right", "centre"):
        return api_error(400, "A work needs a variant: left, right or centre.")
    position = int(g.conn.execute(
        "SELECT coalesce(max(position),-1)+1 FROM items WHERE house_id=%s AND kind=%s",
        (account["house_id"], kind)).fetchone()[0])
    item_id = ident(kind)
    with g.conn.transaction():
        try:
            g.conn.execute(
                """INSERT INTO items (id, house_id, kind, slug, title, position, discipline, variant, published)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,FALSE)""",
                (item_id, account["house_id"], kind, slug, title, position, discipline, variant))
        except Exception:
            return api_error(409, "That slug is already used in this house. Choose another.")
    item = records.studio_item(g.conn, item_id)
    return jsonify(item), 201


@app.patch("/api/studio/items/<item_id>")
def api_studio_patch(item_id):
    account, err = require_producer()
    if err:
        return err
    row = owned_row_or_none(item_id, account["house_id"])
    if not row:
        return not_found_api("No such record in your house.")
    body = request.get_json(silent=True) or {}
    updates, args = [], []
    if "title" in body:
        title = str(body.get("title") or "").strip()
        if not title:
            return api_error(400, "Give the record a title.")
        updates.append("title=%s")
        args.append(title)
    if "position" in body:
        try:
            updates.append("position=%s")
            args.append(int(body["position"]))
        except (TypeError, ValueError):
            return api_error(400, "Position must be a whole number.")
    if "discipline" in body:
        if row[2] != "talent":
            return api_error(400, "Only a talent carries a discipline.")
        if body["discipline"] not in ("director", "photographer", "stylist"):
            return api_error(400, "A talent needs a discipline: director, photographer or stylist.")
        updates.append("discipline=%s")
        args.append(body["discipline"])
    if "variant" in body:
        if row[2] != "work":
            return api_error(400, "Only a work carries a variant.")
        if body["variant"] not in ("left", "right", "centre"):
            return api_error(400, "A work needs a variant: left, right or centre.")
        updates.append("variant=%s")
        args.append(body["variant"])
    if "published" in body or "published_at" in body:
        return api_error(400, "Use the publish endpoint to change a record's visibility.")
    if not updates:
        return api_error(400, "Nothing to change was sent.")
    args.append(item_id)
    with g.conn.transaction():
        g.conn.execute(f"UPDATE items SET {', '.join(updates)} WHERE id=%s", args)
    return jsonify(records.studio_item(g.conn, item_id))


@app.post("/api/studio/items/<item_id>/publish")
def api_studio_publish(item_id):
    account, err = require_producer()
    if err:
        return err
    row = owned_row_or_none(item_id, account["house_id"])
    if not row:
        return not_found_api("No such record in your house.")
    body = request.get_json(silent=True) or {}
    published = body.get("published")
    if not isinstance(published, bool):
        return api_error(400, "Say whether the record is published: true or false.")
    if published:
        poster = g.conn.execute(
            "SELECT alt FROM media WHERE item_id=%s AND role='poster' ORDER BY position LIMIT 1",
            (item_id,)).fetchone()
        if not poster or not (poster[0] or "").strip():
            return api_error(400, "A published record needs a poster with a written alternative.")
        g.conn.execute("UPDATE items SET published=TRUE, published_at=%s WHERE id=%s",
                       (utcnow(), item_id))
    else:
        g.conn.execute("UPDATE items SET published=FALSE, published_at=NULL WHERE id=%s",
                       (item_id,))
    item = records.studio_item(g.conn, item_id)
    item["ordinal"] = records.ordinal_of(g.conn, account["house_id"], item_id)
    return jsonify(item)


@app.post("/api/studio/items/<item_id>/media")
def api_studio_media(item_id):
    account, err = require_producer()
    if err:
        return err
    row = owned_row_or_none(item_id, account["house_id"])
    if not row:
        return not_found_api("No such record in your house.")
    body = request.get_json(silent=True) or {}
    role = body.get("role")
    if role not in ("poster", "reel", "gallery"):
        return api_error(400, "Role must be poster, reel or gallery.")
    try:
        width, height = int(body.get("width")), int(body.get("height"))
    except (TypeError, ValueError):
        return api_error(400, "Width and height must be whole numbers.")
    if not (16 <= width <= 4000 and 16 <= height <= 4000):
        return api_error(400, "Width and height must be between 16 and 4000.")
    alt = str(body.get("alt") or "").strip()
    if not alt:
        return api_error(400, "Every still needs a written alternative.")
    seed = str(body.get("seed") or secrets.token_hex(8))
    position = int(g.conn.execute(
        "SELECT coalesce(max(position),-1)+1 FROM media WHERE item_id=%s AND role=%s",
        (item_id, role)).fetchone()[0])
    media_id = hex32()
    g.conn.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (media_id, item_id, role, position, seed, width, height, alt))
    return jsonify({"media_id": media_id, "role": role, "width": width, "height": height,
                    "alt": alt, "url": f"/api/media/{media_id}"}), 201


@app.post("/api/studio/items/<item_id>/credits")
def api_studio_credits(item_id):
    account, err = require_producer()
    if err:
        return err
    row = owned_row_or_none(item_id, account["house_id"])
    if not row:
        return not_found_api("No such record in your house.")
    if row[2] != "work":
        return api_error(400, "Credits belong to a work.")
    body = request.get_json(silent=True) or {}
    role = str(body.get("role") or "").strip()
    name = str(body.get("name") or "").strip()
    if not role or not name:
        return api_error(400, "A credit names a role and a name.")
    talent_id = body.get("talent_id") or body.get("talent_item_id")
    if talent_id:
        talent = owned_row_or_none(talent_id, account["house_id"])
        if not talent or talent[2] != "talent":
            return not_found_api("No such talent in your house.")
    else:
        talent_id = None
    position = int(g.conn.execute(
        "SELECT coalesce(max(position),-1)+1 FROM credits WHERE item_id=%s",
        (item_id,)).fetchone()[0])
    credit_id = ident("credit")
    g.conn.execute(
        """INSERT INTO credits (id, item_id, position, role, name, talent_item_id)
           VALUES (%s,%s,%s,%s,%s,%s)""",
        (credit_id, item_id, position, role, name, talent_id))
    return jsonify(records.credits_for(g.conn, item_id)[-1]), 201


@app.post("/api/studio/items/<item_id>/slug")
def api_studio_slug(item_id):
    account, err = require_producer()
    if err:
        return err
    row = owned_row_or_none(item_id, account["house_id"])
    if not row:
        return not_found_api("No such record in your house.")
    body = request.get_json(silent=True) or {}
    new_slug = slugify(str(body.get("slug") or ""))
    if not new_slug:
        return api_error(400, "Give the record a slug made of letters and numbers.")
    old_slug = row[3]
    if new_slug.lower() == old_slug.lower():
        return jsonify(records.studio_item(g.conn, item_id))
    with g.conn.transaction():
        try:
            g.conn.execute(
                """INSERT INTO slug_redirects (id, house_id, kind, old_slug, item_id)
                   VALUES (%s,%s,%s,%s,%s)
                   ON CONFLICT (house_id, kind, old_slug) DO UPDATE SET item_id=EXCLUDED.item_id""",
                (ident("red"), account["house_id"], row[2], old_slug, item_id))
            g.conn.execute("UPDATE items SET slug=%s WHERE id=%s", (new_slug, item_id))
        except Exception:
            return api_error(409, "That slug is already used in this house. Choose another.")
    return jsonify(records.studio_item(g.conn, item_id))


@app.post("/api/studio/works/order")
def api_studio_order():
    account, err = require_producer()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    ordered = body.get("ordered_ids")
    if not isinstance(ordered, list) or not all(isinstance(i, str) for i in ordered):
        return api_error(400, "Send the works in their new order as ordered_ids.")
    with g.conn.transaction():
        for index, item_id in enumerate(ordered):
            row = owned_row_or_none(item_id, account["house_id"])
            if not row or row[2] != "work":
                return api_error(404, "No such work in your house.")
            g.conn.execute("UPDATE items SET position=%s WHERE id=%s", (index, item_id))
    return jsonify(records.studio_items(g.conn, account["house_id"], "work"))


@app.post("/api/studio/preview-tokens")
def api_studio_preview_tokens():
    account, err = require_producer()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    item_id = body.get("item_id")
    row = owned_row_or_none(item_id, account["house_id"]) if item_id else None
    if not row:
        return not_found_api("No such record in your house.")
    token = hex32()
    expires = utcnow() + timedelta(minutes=config.PREVIEW_TTL_MINUTES)
    g.conn.execute(
        """INSERT INTO preview_tokens (id, token, item_id, expires_at, created_by)
           VALUES (%s,%s,%s,%s,%s)""",
        (ident("prev"), token, item_id, expires, account["id"]))
    return jsonify({"token": token, "expires_at": iso(expires), "item_id": item_id}), 201


# ---------------------------------------------------------------- page helpers
def page_context(**extra):
    ctx = {
        "house": g.house,
        "contact": g.house["contact_email"],
        "public_url": config.APP_PUBLIC_URL,
    }
    ctx.update(extra)
    return ctx


def talent_credit_map(conn, house_id):
    rows = conn.execute(
        """SELECT c.item_id, t.slug, t.title
             FROM credits c JOIN items t ON t.id = c.talent_item_id
            WHERE t.house_id=%s AND t.kind='talent' AND t.published""",
        (house_id,)).fetchall()
    return {(r[0], r[1]): r[2] for r in rows}


def credits_with_links(conn, house_id, item_id):
    out = []
    for credit in records.credits_for(conn, item_id):
        entry = dict(credit)
        entry["talent"] = None
        if credit["talent_item_id"]:
            row = conn.execute(
                "SELECT slug, title, published FROM items WHERE id=%s",
                (credit["talent_item_id"],)).fetchone()
            if row and row[2]:
                entry["talent"] = {"slug": row[0], "title": row[1]}
        out.append(entry)
    return out


def work_page(conn, house_id, work, for_preview=False):
    media = records.media_for(conn, work["id"])
    poster = next((m for m in media if m["role"] == "poster"), None)
    reel = next((m for m in media if m["role"] == "reel"), None)
    gallery = [m for m in media if m["role"] == "gallery"]
    return {
        "id": work["id"], "slug": work["slug"], "title": work["title"],
        "ordinal": work.get("ordinal"), "variant": work["variant"],
        "poster": poster, "reel": reel, "gallery": gallery,
        "credits": credits_with_links(conn, house_id, work["id"]),
        "neighbours": work.get("neighbours"),
    }


def talent_page(conn, house_id, talent, for_preview=False):
    media = records.media_for(conn, talent["id"])
    poster = next((m for m in media if m["role"] == "poster"), None)
    reel = next((m for m in media if m["role"] == "reel"), None)
    selected = records.selected_work(conn, house_id, talent["id"])
    for work in selected:
        work["poster"] = records.first_poster(conn, work["id"]) or work.get("poster")
    return {
        "id": talent["id"], "slug": talent["slug"], "title": talent["title"],
        "discipline": talent["discipline"], "poster": poster, "reel": reel,
        "selected_work": selected,
    }


# ---------------------------------------------------------------- pages: public
@app.get("/")
def page_entry():
    works = records.published_works(g.conn, g.house["id"])
    # Authored positions: dense toward the centre, thinning to empty corners,
    # the exact centre clear for the mark. Stable across loads.
    layout = [
        (140, 120, 190, 3), (770, 105, 240, 2), (1130, 150, 180, 4),
        (205, 300, 250, 6), (545, 205, 300, 5), (960, 300, 260, 3),
        (1215, 330, 205, 5), (95, 545, 165, 4), (330, 470, 320, 7),
        (700, 445, 330, 2), (1075, 520, 300, 6), (1290, 585, 175, 3),
        (180, 700, 225, 5), (470, 745, 275, 4), (835, 725, 320, 6),
        (1160, 740, 240, 2), (60, 690, 150, 2), (640, 130, 200, 4),
        (1000, 175, 175, 5), (400, 145, 165, 3),
    ]
    cluster = []
    for i, work in enumerate(works):
        poster = records.first_poster(g.conn, work["id"])
        x, y, w, z = layout[i % len(layout)]
        ratio = (poster["height"] / poster["width"]) if poster else 0.56
        cluster.append({
            "slug": work["slug"], "title": work["title"], "ordinal": work["ordinal"],
            "poster": poster, "alt": (poster or {}).get("alt") or work["title"],
            "x": x, "y": y, "w": w, "z": z, "ratio": ratio,
        })
    return render_template("entry.html", **page_context(cluster=cluster))


@app.get("/works")
def page_works():
    works = records.published_works(g.conn, g.house["id"])
    entries = []
    for work in works:
        media = records.media_for(g.conn, work["id"])
        poster = next((m for m in media if m["role"] == "poster"), None)
        gallery = [m for m in media if m["role"] == "gallery"]
        entries.append({
            "id": work["id"], "slug": work["slug"], "title": work["title"],
            "ordinal": work["ordinal"], "variant": work["variant"],
            "poster": poster, "gallery": gallery,
        })
    return render_template("works.html", **page_context(entries=entries))


@app.get("/works/<slug>")
def page_work(slug):
    work = records.work_by_slug(g.conn, g.house["id"], slug)
    if not work:
        redirect_row = g.conn.execute(
            "SELECT item_id FROM slug_redirects WHERE house_id=%s AND kind='work' AND old_slug=%s",
            (g.house["id"], slug)).fetchone()
        if redirect_row:
            target = g.conn.execute(
                "SELECT slug FROM items WHERE id=%s", (redirect_row[0],)).fetchone()
            if target:
                return redirect(f"/works/{target[0]}", code=301)
        abort(404)
    return render_template("work.html", **page_context(
        work=work_page(g.conn, g.house["id"], work)))


@app.get("/talents")
def page_talents():
    talents = records.published_talents(g.conn, g.house["id"])
    disciplines = records.disciplines(g.conn, g.house["id"])
    roster = []
    for talent in talents:
        roster.append({
            "id": talent["id"], "slug": talent["slug"], "title": talent["title"],
            "discipline": talent["discipline"],
            "poster": records.first_poster(g.conn, talent["id"]),
        })
    return render_template("talents.html", **page_context(roster=roster,
                                                           disciplines=disciplines))


@app.get("/talents/<slug>")
def page_talent(slug):
    talent = records.talent_by_slug(g.conn, g.house["id"], slug)
    if not talent:
        redirect_row = g.conn.execute(
            "SELECT item_id FROM slug_redirects WHERE house_id=%s AND kind='talent' AND old_slug=%s",
            (g.house["id"], slug)).fetchone()
        if redirect_row:
            target = g.conn.execute(
                "SELECT slug FROM items WHERE id=%s", (redirect_row[0],)).fetchone()
            if target:
                return redirect(f"/talents/{target[0]}", code=301)
        abort(404)
    return render_template("talent.html", **page_context(
        talent=talent_page(g.conn, g.house["id"], talent)))


@app.get("/about")
def page_about():
    return render_template("about.html", **page_context())


@app.get("/preview/<token>")
def page_preview(token):
    account = current_account()
    row = None
    if account and account["role"] == "producer":
        row = g.conn.execute(
            """SELECT t.item_id, t.expires_at, i.house_id
                 FROM preview_tokens t JOIN items i ON i.id = t.item_id WHERE t.token=%s""",
            (token,)).fetchone()
        if row and (row[1] < utcnow() or row[2] != account["house_id"]):
            row = None
    if not row:
        abort(404)
    item = g.conn.execute(
        f"SELECT {records.ITEM_COLUMNS} FROM items WHERE id=%s", (row[0],)).fetchone()
    if not item:
        abort(404)
    rendered = None
    kind = item[2]
    if kind == "work":
        fake = {"id": item[0], "slug": item[3], "title": item[4], "variant": item[7],
                "ordinal": None}
        rendered = work_page(g.conn, g.house["id"], fake, for_preview=True)
    else:
        fake = {"id": item[0], "slug": item[3], "title": item[4], "discipline": item[6]}
        rendered = talent_page(g.conn, g.house["id"], fake, for_preview=True)
    resp = make_response(render_template(
        "preview.html", **page_context(kind=kind, record=rendered, token=token)))
    resp.headers["Cache-Control"] = "no-store, max-age=0"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp


# ---------------------------------------------------------------- pages: studio
@app.get("/studio/login")
def page_studio_login():
    return render_template("studio_login.html", **page_context())


@app.get("/signup")
def page_signup():
    return render_template("signup.html", **page_context())


def studio_account():
    account = current_account()
    if account and account["role"] == "producer" and account["house_id"]:
        return account
    return None


@app.get("/studio")
def page_studio():
    account = studio_account()
    if not account:
        return redirect("/studio/login")
    items = records.studio_items(g.conn, account["house_id"])
    return render_template("studio.html", **page_context(account=account, items=items))


@app.get("/studio/talents/new")
def page_studio_new_talent():
    account = studio_account()
    if not account:
        return redirect("/studio/login")
    return render_template("studio_new.html", **page_context(account=account, kind="talent"))


@app.get("/studio/works/new")
def page_studio_new_work():
    account = studio_account()
    if not account:
        return redirect("/studio/login")
    return render_template("studio_new.html", **page_context(account=account, kind="work"))


@app.get("/studio/items/<item_id>")
def page_studio_item(item_id):
    account = studio_account()
    if not account:
        return redirect("/studio/login")
    row = owned_row_or_none(item_id, account["house_id"])
    if not row:
        abort(404)
    item = records.studio_item(g.conn, item_id)
    item["ordinal"] = records.ordinal_of(g.conn, account["house_id"], item_id)
    item["ordinal_next"] = len(records.published_works(g.conn, account["house_id"]))
    return render_template("studio_item.html", **page_context(account=account, item=item))


@app.get("/studio/items/<item_id>/published")
def page_studio_published(item_id):
    account = studio_account()
    if not account:
        return redirect("/studio/login")
    row = owned_row_or_none(item_id, account["house_id"])
    if not row:
        abort(404)
    item = records.studio_item(g.conn, item_id)
    item["ordinal"] = records.ordinal_of(g.conn, account["house_id"], item_id)
    public_path = (f"/works/{item['slug']}" if item["kind"] == "work"
                   else f"/talents/{item['slug']}")
    return render_template("studio_published.html", **page_context(
        account=account, item=item, public_path=public_path))


# ---------------------------------------------------------------- static assets
@app.get("/assets/grain.png")
def asset_grain():
    resp = make_response(images.grain_bytes())
    resp.headers["Content-Type"] = "image/png"
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


@app.get("/assets/share.png")
def asset_share():
    resp = make_response(images.share_bytes())
    resp.headers["Content-Type"] = "image/png"
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.get("/robots.txt")
def robots():
    body = "User-agent: *\nAllow: /\nDisallow: /studio\nDisallow: /preview\n"
    resp = make_response(body)
    resp.headers["Content-Type"] = "text/plain; charset=utf-8"
    return resp


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=4173, threaded=True)


