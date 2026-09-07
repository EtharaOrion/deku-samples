"""The JSON API under /api. Authorization lives here, on every studio endpoint,
reads included, and a foreign record is answered exactly as a missing one."""
from __future__ import annotations

import re

import psycopg
from flask import Blueprint, Response, g, jsonify, request

from . import repo
from .auth import (account_from_request, current_producer, error,
                   not_found_json, require_producer)
from .db import execute, get_conn, query_one
from .pixels import still_svg
from .security import (COOKIE_NAME, hash_password, mint_token, verify_password)

bp = Blueprint("api", __name__, url_prefix="/api")

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def public_house():
    house = repo.served_house()
    if not house:
        raise RuntimeError("served house is missing")
    return house


# --------------------------------------------------------------------------
# health and auth

@bp.get("/health")
def health():
    try:
        house = repo.served_house()
        if not house:
            return jsonify({"status": "starting"}), 503
        repo.public_talents(house["id"])
    except Exception as exc:  # pragma: no cover - liveness path
        return jsonify({"status": "unhealthy", "detail": str(exc)}), 503
    return jsonify({"status": "ok"}), 200


def _account_shape(account: dict) -> dict:
    return {
        "id": account["id"],
        "email": account["email"],
        "role": account["role"],
        "house_id": account["house_id"],
        "house_slug": account.get("house_slug"),
    }


@bp.post("/auth/signup")
def signup():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not EMAIL_RE.match(email):
        return error(422, "Enter a valid email address.")
    if len(password) < 8:
        return error(422, "Password must be at least 8 characters.")
    if query_one("SELECT id FROM accounts WHERE email = %s", (email,)):
        return error(409, "An account with that address already exists.")
    # Signup is open and always issues a viewer with no house.
    rows = execute(
        "INSERT INTO accounts (email, password_hash, role, house_id) "
        "VALUES (%s, %s, 'viewer', NULL) RETURNING *",
        (email, hash_password(password)),
    )
    get_conn().commit()
    account = rows[0]
    token = mint_token(account["id"])
    resp = jsonify({"account": _account_shape(account | {"house_slug": None}),
                    "token": token})
    _set_cookie(resp, token)
    return resp, 201


@bp.post("/auth/login")
def login():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    account = query_one(
        "SELECT a.*, h.slug AS house_slug FROM accounts a "
        "LEFT JOIN houses h ON h.id = a.house_id WHERE a.email = %s", (email,)
    )
    if not account or not verify_password(password, account["password_hash"]):
        return error(401, "That email and password do not match.")
    token = mint_token(account["id"])
    resp = jsonify({"token": token, "account": _account_shape(account)})
    _set_cookie(resp, token)
    return resp, 200


def _set_cookie(resp, token: str) -> None:
    resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Lax",
                    secure=request.is_secure, path="/", max_age=12 * 60 * 60)


@bp.post("/auth/logout")
def logout():
    resp = jsonify({"ok": True})
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp, 200


@bp.get("/auth/me")
def me():
    account = account_from_request()
    if not account:
        return jsonify({"account": None}), 200
    return jsonify({"account": _account_shape(account)}), 200


# --------------------------------------------------------------------------
# public reads

def _public_cache(resp):
    resp.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
    return resp


@bp.get("/works")
def works_index():
    house = public_house()
    return _public_cache(jsonify(repo.public_works(house["id"])))


@bp.get("/works/<slug>")
def work_detail(slug):
    house = public_house()
    detail, redirected = repo.work_detail(house["id"], slug)
    if not detail:
        return not_found_json()
    if redirected:
        detail["canonical_slug"] = redirected
    return _public_cache(jsonify(detail))


@bp.get("/talents")
def talents_index():
    house = public_house()
    discipline = request.args.get("discipline") or None
    if discipline and discipline not in repo.DISCIPLINES:
        return error(422, "Unknown discipline.")
    return _public_cache(jsonify(repo.public_talents(house["id"], discipline)))


@bp.get("/talents/<slug>")
def talent_detail(slug):
    house = public_house()
    detail, redirected = repo.talent_detail(house["id"], slug)
    if not detail:
        return not_found_json()
    if redirected:
        detail["canonical_slug"] = redirected
    return _public_cache(jsonify(detail))


@bp.get("/disciplines")
def disciplines():
    house = public_house()
    return _public_cache(jsonify(repo.disciplines(house["id"])))


@bp.get("/media/<media_id>")
def media(media_id):
    """Rendered while its record is published. While the record is unlisted it
    is not found to anyone but that record's own house producer."""
    row = repo.media_row(media_id)
    if not row:
        return not_found_json()
    producer = current_producer()
    owns = bool(producer and producer["house_id"] == row["house_id"])
    if not row["published"] and not owns:
        return not_found_json()
    if row["published"]:
        house = public_house()
        if row["house_id"] != house["id"] and not owns:
            return not_found_json()
    svg = still_svg(row["seed"], row["width"], row["height"])
    resp = Response(svg, mimetype="image/svg+xml")
    if row["published"]:
        resp.headers["Cache-Control"] = "public, max-age=300"
    else:
        resp.headers["Cache-Control"] = "private, no-store"
    return resp


@bp.get("/preview/<token>")
def preview(token):
    """One unlisted record in full, for its own house's producer."""
    producer = current_producer()
    if not producer:
        return not_found_json()
    row = repo.preview_token_row(token)
    if not row or row["house_id"] != producer["house_id"]:
        return not_found_json()
    item = repo.item_row(producer["house_id"], row["item_id"])
    if not item:
        return not_found_json()
    if item["kind"] == "work":
        detail, _ = repo.work_detail(producer["house_id"], item["slug"], published_only=False)
    else:
        detail, _ = repo.talent_detail(producer["house_id"], item["slug"], published_only=False)
    resp = jsonify(detail)
    resp.headers["Cache-Control"] = "no-store, private"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp, 200


# --------------------------------------------------------------------------
# studio: bearer auth on every endpoint, reads included

@bp.get("/studio/items")
@require_producer
def studio_items():
    kind = request.args.get("kind") or None
    if kind and kind not in repo.KINDS:
        return error(422, "Unknown kind.")
    return jsonify(repo.studio_items(g.producer["house_id"], kind)), 200


@bp.get("/studio/items/<int:item_id>")
@require_producer
def studio_item(item_id):
    item = repo.studio_item(g.producer["house_id"], item_id)
    if not item:
        return not_found_json()
    return jsonify(item), 200


@bp.post("/studio/items")
@require_producer
def studio_create_item():
    data = body()
    kind = (data.get("kind") or "").strip()
    if kind not in repo.KINDS:
        return error(422, "Kind must be work or talent.")
    title = (data.get("title") or "").strip()
    if not title:
        return error(422, "Title is required.")
    slug = slugify(data.get("slug") or title)
    if not SLUG_RE.match(slug):
        return error(422, "Slug must be lowercase words joined by hyphens.")
    discipline = (data.get("discipline") or "").strip() or None
    variant = (data.get("variant") or "").strip() or None
    if kind == "talent":
        if discipline not in repo.DISCIPLINES:
            return error(422, "Choose a discipline: director, photographer or stylist.")
        variant = None
    else:
        if variant not in repo.VARIANTS:
            return error(422, "Choose a width: left, right or centre.")
        discipline = None
    conn = get_conn()
    try:
        item = repo.create_item(g.producer["house_id"], kind, slug, title,
                                discipline, variant)
        conn.commit()
    except psycopg.errors.UniqueViolation:
        # The database, not an application check, decides the race. The loser
        # leaves no partial record.
        conn.rollback()
        return error(409, f"The slug '{slug}' is already used by another {kind}.")
    return jsonify(repo.studio_item(g.producer["house_id"], item["id"])), 201


@bp.patch("/studio/items/<int:item_id>")
@require_producer
def studio_update_item(item_id):
    house_id = g.producer["house_id"]
    item = repo.item_row(house_id, item_id)
    if not item:
        return not_found_json()
    data = body()
    fields, params = [], []
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return error(422, "Title is required.")
        fields.append("title = %s")
        params.append(title)
    if "discipline" in data and item["kind"] == "talent":
        discipline = (data.get("discipline") or "").strip()
        if discipline not in repo.DISCIPLINES:
            return error(422, "Choose a discipline: director, photographer or stylist.")
        fields.append("discipline = %s")
        params.append(discipline)
    if "variant" in data and item["kind"] == "work":
        variant = (data.get("variant") or "").strip()
        if variant not in repo.VARIANTS:
            return error(422, "Choose a width: left, right or centre.")
        fields.append("variant = %s")
        params.append(variant)
    if not fields:
        return error(422, "Nothing to change.")
    params.extend([item_id, house_id])
    execute(
        f"UPDATE items SET {', '.join(fields)} WHERE id = %s AND house_id = %s",
        tuple(params),
    )
    get_conn().commit()
    return jsonify(repo.studio_item(house_id, item_id)), 200


@bp.post("/studio/items/<int:item_id>/publish")
@require_producer
def studio_publish(item_id):
    house_id = g.producer["house_id"]
    item = repo.item_row(house_id, item_id)
    if not item:
        return not_found_json()
    data = body()
    published = data.get("published")
    if not isinstance(published, bool):
        return error(422, "Send published as true or false.")
    if published:
        poster = query_one(
            "SELECT alt FROM media WHERE item_id = %s AND role = 'poster' "
            "ORDER BY position, created_at LIMIT 1",
            (item_id,),
        )
        if not poster:
            return error(422, "Attach a poster with a written alternative before publishing.")
        if not (poster["alt"] or "").strip():
            return error(422, "The poster needs a written alternative before this can be published.")
    execute(
        "UPDATE items SET published = %s, published_at = CASE WHEN %s THEN now() ELSE NULL END "
        "WHERE id = %s AND house_id = %s",
        (published, published, item_id, house_id),
    )
    get_conn().commit()
    return jsonify(repo.studio_item(house_id, item_id)), 200


@bp.post("/studio/items/<int:item_id>/media")
@require_producer
def studio_add_media(item_id):
    house_id = g.producer["house_id"]
    item = repo.item_row(house_id, item_id)
    if not item:
        return not_found_json()
    data = body()
    role = (data.get("role") or "poster").strip()
    if role not in repo.MEDIA_ROLES:
        return error(422, "Role must be poster, reel or gallery.")
    alt = (data.get("alt") or "").strip()
    if not alt:
        return error(422, "A written alternative is required.")
    try:
        width = int(data.get("width") or 0)
        height = int(data.get("height") or 0)
    except (TypeError, ValueError):
        return error(422, "Width and height must be whole numbers.")
    if width <= 0 or height <= 0 or width > 8000 or height > 8000:
        return error(422, "Width and height must be between 1 and 8000.")
    seed = (data.get("seed") or "").strip() or f"{item['slug']}-{role}"
    row = repo.create_media(item_id, role, seed, width, height, alt)
    get_conn().commit()
    return jsonify({"media_id": row["id"], "role": row["role"],
                    "width": row["width"], "height": row["height"],
                    "alt": row["alt"], "url": f"/api/media/{row['id']}"}), 201


@bp.post("/studio/items/<int:item_id>/credits")
@require_producer
def studio_add_credit(item_id):
    house_id = g.producer["house_id"]
    item = repo.item_row(house_id, item_id)
    if not item or item["kind"] != "work":
        return not_found_json()
    data = body()
    role = (data.get("role") or "").strip()
    name = (data.get("name") or "").strip()
    if not role or not name:
        return error(422, "A credit needs a role and a name.")
    talent_id = data.get("talent_id")
    if talent_id not in (None, ""):
        try:
            talent_id = int(talent_id)
        except (TypeError, ValueError):
            return error(422, "talent_id must be a record id.")
        talent = repo.item_row(house_id, talent_id)
        if not talent or talent["kind"] != "talent":
            return not_found_json()
    else:
        talent_id = None
    pos = query_one(
        "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM credits WHERE item_id = %s",
        (item_id,),
    )["n"]
    rows = execute(
        "INSERT INTO credits (item_id, position, role, name, talent_item_id) "
        "VALUES (%s, %s, %s, %s, %s) RETURNING *",
        (item_id, int(pos), role, name, talent_id),
    )
    get_conn().commit()
    row = rows[0]
    return jsonify({"id": row["id"], "role": row["role"], "name": row["name"],
                    "talent_id": row["talent_item_id"], "position": row["position"]}), 201


@bp.post("/studio/items/<int:item_id>/slug")
@require_producer
def studio_change_slug(item_id):
    house_id = g.producer["house_id"]
    item = repo.item_row(house_id, item_id)
    if not item:
        return not_found_json()
    new_slug = slugify(body().get("slug") or "")
    if not SLUG_RE.match(new_slug):
        return error(422, "Slug must be lowercase words joined by hyphens.")
    if new_slug == item["slug"]:
        return jsonify(repo.studio_item(house_id, item_id)), 200
    conn = get_conn()
    old_slug = item["slug"]
    try:
        execute("UPDATE items SET slug = %s WHERE id = %s AND house_id = %s",
                (new_slug, item_id, house_id))
        execute(
            """
            INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (house_id, kind, old_slug) DO UPDATE SET item_id = EXCLUDED.item_id
            """,
            (house_id, item["kind"], old_slug, item_id),
        )
        # a record reclaiming an address it once redirected from
        execute(
            "DELETE FROM slug_redirects WHERE house_id = %s AND kind = %s AND old_slug = %s",
            (house_id, item["kind"], new_slug),
        )
        conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        return error(409, f"The slug '{new_slug}' is already used by another {item['kind']}.")
    return jsonify(repo.studio_item(house_id, item_id)), 200


@bp.post("/studio/works/order")
@require_producer
def studio_order_works():
    house_id = g.producer["house_id"]
    ordered = body().get("ordered_ids")
    if not isinstance(ordered, list) or not ordered:
        return error(422, "Send ordered_ids as an array of record ids.")
    try:
        ordered = [int(i) for i in ordered]
    except (TypeError, ValueError):
        return error(422, "ordered_ids must be record ids.")
    own = repo.studio_items(house_id, "work")
    own_ids = {i["id"] for i in own}
    if set(ordered) - own_ids:
        # naming a record of another house is answered as a missing one
        return not_found_json()
    if len(set(ordered)) != len(ordered):
        return error(422, "ordered_ids must not repeat a record.")
    conn = get_conn()
    for pos, item_id in enumerate(ordered):
        execute("UPDATE items SET position = %s WHERE id = %s AND house_id = %s AND kind = 'work'",
                (pos, item_id, house_id))
    rest = [i["id"] for i in own if i["id"] not in set(ordered)]
    for offset, item_id in enumerate(rest, start=len(ordered)):
        execute("UPDATE items SET position = %s WHERE id = %s AND house_id = %s AND kind = 'work'",
                (offset, item_id, house_id))
    conn.commit()
    return jsonify(repo.studio_items(house_id, "work")), 200


@bp.post("/studio/preview-tokens")
@require_producer
def studio_preview_token():
    house_id = g.producer["house_id"]
    data = body()
    try:
        item_id = int(data.get("item_id"))
    except (TypeError, ValueError):
        return error(422, "Send item_id as a record id.")
    if not repo.item_row(house_id, item_id):
        return not_found_json()
    row = repo.mint_preview_token(item_id, g.producer["id"])
    get_conn().commit()
    expires = row["expires_at"]
    return jsonify({
        "token": row["token"],
        "expires_at": expires.isoformat() if hasattr(expires, "isoformat") else str(expires),
        "url": f"/preview/{row['token']}",
    }), 201
