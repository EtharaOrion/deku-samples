"""The JSON API under /api.

Authorization is enforced here, on every /api/studio/ endpoint, reads included.
A record of a house that is not the caller's is answered exactly as a record
that does not exist, so the answer never confirms that the record is real.
"""
import datetime
import re
import secrets

import psycopg2
from flask import Blueprint, Response, current_app, jsonify, request

from . import repo
from .auth import (COOKIE_NAME, bearer_account, current_account, hash_password,
                   mint_token, account_by_email, verify_password)
from .db import SERVED_HOUSE, connection, new_hex_id
from .generate import still_svg

bp = Blueprint("api", __name__, url_prefix="/api")

NOT_FOUND = ("Not found.", 404)


def fail(message, code=400):
    return jsonify({"error": message}), code


def served_house(cur):
    return repo.house_by_slug(cur, SERVED_HOUSE)


def body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


# ---------------------------------------------------------------- auth

@bp.post("/auth/signup")
def signup():
    data = body()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return fail("Enter a valid email address.")
    if len(password) < 8:
        return fail("Use a password of at least 8 characters.")
    with connection() as cur:
        cur.execute("SELECT id FROM accounts WHERE lower(email)=lower(%s)", (email,))
        if cur.fetchone():
            return fail("That address is already registered.", 409)
        # role and house are never read from the request body
        cur.execute(
            """INSERT INTO accounts (email, password_hash, role, house_id)
               VALUES (%s,%s,'viewer',NULL) RETURNING id, email, role, house_id""",
            (email, hash_password(password)))
        account = cur.fetchone()
    token = mint_token(account["id"])
    resp = jsonify({
        "account": {"id": account["id"], "email": account["email"],
                    "role": "viewer", "house": None},
        "token": token,
    })
    resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Lax", path="/")
    return resp, 201


@bp.post("/auth/login")
def login():
    data = body()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    account = account_by_email(email)
    if not account or not verify_password(password, account["password_hash"]):
        return fail("Those details do not match an account.", 401)
    token = mint_token(account["id"])
    resp = jsonify({
        "token": token,
        "account": {"id": account["id"], "email": account["email"],
                    "role": account["role"], "house": account["house_slug"]},
    })
    resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Lax", path="/")
    return resp


@bp.post("/auth/logout")
def logout():
    resp = jsonify({"ok": True})
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


@bp.get("/auth/me")
def me():
    account = current_account()
    if not account:
        return fail("No session.", 401)
    return jsonify({"id": account["id"], "email": account["email"],
                    "role": account["role"], "house": account["house_slug"]})


# ---------------------------------------------------------------- public

@bp.get("/health")
def health():
    try:
        with connection(commit=False) as cur:
            house = served_house(cur)
            if not house:
                return fail("Not seeded.", 503)
            repo.talents_list(cur, house["id"])
    except Exception as exc:  # pragma: no cover
        current_app.logger.warning("health: %s", exc)
        return jsonify({"status": "unready"}), 503
    return jsonify({"status": "ok"})


def _public_cache(resp):
    resp.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
    return resp


@bp.get("/works")
def works():
    with connection(commit=False) as cur:
        house = served_house(cur)
        return _public_cache(jsonify(repo.works_list(cur, house["id"])))


@bp.get("/works/<slug>")
def work(slug):
    with connection(commit=False) as cur:
        house = served_house(cur)
        row, canonical = repo.resolve_slug(cur, house["id"], "work", slug)
        if not row or not row["published"]:
            return fail(*NOT_FOUND)
        data = repo.work_detail(cur, house["id"], row)
        if canonical:
            data["canonical_slug"] = canonical
        return _public_cache(jsonify(data))


@bp.get("/talents")
def talents():
    discipline = request.args.get("discipline") or None
    if discipline and discipline not in repo.DISCIPLINES:
        return fail("Unknown discipline.")
    with connection(commit=False) as cur:
        house = served_house(cur)
        return _public_cache(
            jsonify(repo.talents_list(cur, house["id"], discipline)))


@bp.get("/talents/<slug>")
def talent(slug):
    with connection(commit=False) as cur:
        house = served_house(cur)
        row, canonical = repo.resolve_slug(cur, house["id"], "talent", slug)
        if not row or not row["published"]:
            return fail(*NOT_FOUND)
        data = repo.talent_detail(cur, house["id"], row)
        if canonical:
            data["canonical_slug"] = canonical
        return _public_cache(jsonify(data))


@bp.get("/disciplines")
def disciplines():
    with connection(commit=False) as cur:
        house = served_house(cur)
        return _public_cache(jsonify(repo.disciplines_list(cur, house["id"])))


@bp.get("/media/<media_id>")
def media(media_id):
    with connection(commit=False) as cur:
        row = repo.media_visible(cur, media_id, current_account())
        if not row:
            return fail(*NOT_FOUND)
        svg = still_svg(row["seed"], row["width"], row["height"], row["alt"])
    resp = Response(svg, mimetype="image/svg+xml")
    if row["published"]:
        resp.headers["Cache-Control"] = "public, max-age=300"
    else:
        resp.headers["Cache-Control"] = "private, no-store"
    return resp


@bp.get("/preview/<token>")
def preview(token):
    account = current_account()
    if not account or account["role"] != "producer":
        return fail(*NOT_FOUND)
    with connection(commit=False) as cur:
        row = _preview_item(cur, token, account)
        if not row:
            return fail(*NOT_FOUND)
        data = repo.item_detail(cur, row["house_id"], row)
    resp = jsonify(data)
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp


def _preview_item(cur, token, account):
    if not re.fullmatch(r"[0-9a-f]{32}", token or ""):
        return None
    cur.execute(
        """SELECT i.* FROM preview_tokens p JOIN items i ON i.id = p.item_id
           WHERE p.token = %s AND p.expires_at > now() AND i.house_id = %s""",
        (token, account["house_id"]))
    return cur.fetchone()


# ---------------------------------------------------------------- studio

def producer():
    """The bearer- or cookie-borne producer, or None. A viewer is never one."""
    account = bearer_account() or current_account()
    if not account or account["role"] != "producer" or not account["house_id"]:
        return None
    return account


@bp.before_request
def guard_studio():
    if request.path.startswith("/api/studio/"):
        if producer() is None:
            return fail("A producer session is required.", 401)
    return None


@bp.get("/studio/items")
def studio_items():
    account = producer()
    kind = request.args.get("kind")
    if kind and kind not in repo.KINDS:
        return fail("Unknown kind.")
    with connection(commit=False) as cur:
        if kind:
            cur.execute(
                """SELECT * FROM items WHERE house_id=%s AND kind=%s
                   ORDER BY kind, position, id""", (account["house_id"], kind))
        else:
            cur.execute(
                """SELECT * FROM items WHERE house_id=%s
                   ORDER BY kind, position, id""", (account["house_id"],))
        return jsonify([repo.studio_item(cur, r) for r in cur.fetchall()])


@bp.get("/studio/items/<item_id>")
def studio_item_read(item_id):
    account = producer()
    with connection(commit=False) as cur:
        row = repo.owned_item(cur, account["house_id"], item_id)
        if not row:
            return fail(*NOT_FOUND)
        data = repo.studio_item(cur, row)
        data["credits"] = repo.credits_for(cur, row["id"], account["house_id"])
        return jsonify(data)


@bp.post("/studio/items")
def studio_create():
    account = producer()
    data = body()
    kind = data.get("kind")
    title = (data.get("title") or "").strip()
    if kind not in repo.KINDS:
        return fail("Choose a kind of work or talent.")
    if not title:
        return fail("A title is required.")
    slug = repo.slugify(data.get("slug") or title)
    if not repo.valid_slug(slug):
        return fail("A slug is lowercase letters, numbers and hyphens.")
    discipline = data.get("discipline") or None
    variant = data.get("variant") or None
    if kind == "talent":
        if discipline not in repo.DISCIPLINES:
            return fail("Choose a discipline.")
        variant = None
    else:
        if variant not in repo.VARIANTS:
            return fail("Choose a width variant.")
        discipline = None
    try:
        with connection() as cur:
            cur.execute(
                "SELECT coalesce(max(position), -1) + 1 AS p FROM items "
                "WHERE house_id=%s AND kind=%s", (account["house_id"], kind))
            position = cur.fetchone()["p"]
            # uniqueness is the database's; a loser leaves no partial record
            cur.execute(
                """INSERT INTO items (house_id, kind, slug, title, position,
                                      discipline, variant, published, published_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,FALSE,NULL) RETURNING *""",
                (account["house_id"], kind, slug, title, position, discipline,
                 variant))
            row = cur.fetchone()
            return jsonify(repo.studio_item(cur, row)), 201
    except psycopg2.errors.UniqueViolation:
        return fail("That slug is already used by another %s." % kind, 409)


@bp.patch("/studio/items/<item_id>")
def studio_update(item_id):
    account = producer()
    data = body()
    fields, values = [], []
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return fail("A title is required.")
        fields.append("title = %s")
        values.append(title)
    if "discipline" in data and data["discipline"] is not None:
        if data["discipline"] not in repo.DISCIPLINES:
            return fail("Choose a discipline.")
        fields.append("discipline = %s")
        values.append(data["discipline"])
    if "variant" in data and data["variant"] is not None:
        if data["variant"] not in repo.VARIANTS:
            return fail("Choose a width variant.")
        fields.append("variant = %s")
        values.append(data["variant"])
    with connection() as cur:
        row = repo.owned_item(cur, account["house_id"], item_id)
        if not row:
            return fail(*NOT_FOUND)
        if not fields:
            return fail("Nothing to change.")
        values.append(row["id"])
        cur.execute(
            "UPDATE items SET %s WHERE id = %%s RETURNING *" % ", ".join(fields),
            values)
        return jsonify(repo.studio_item(cur, cur.fetchone()))


@bp.post("/studio/items/<item_id>/publish")
def studio_publish(item_id):
    account = producer()
    data = body()
    want = data.get("published")
    if not isinstance(want, bool):
        return fail("Say whether the record is published.")
    with connection() as cur:
        row = repo.owned_item(cur, account["house_id"], item_id)
        if not row:
            return fail(*NOT_FOUND)
        if want:
            cur.execute(
                """SELECT alt FROM media WHERE item_id=%s AND role='poster'
                   ORDER BY position LIMIT 1""", (row["id"],))
            poster = cur.fetchone()
            if not poster:
                return fail("Attach a poster before publishing.", 422)
            if not (poster["alt"] or "").strip():
                return fail(
                    "The poster needs a written alternative before publishing.", 422)
        cur.execute(
            """UPDATE items SET published = %s,
                   published_at = CASE WHEN %s THEN now() ELSE NULL END
               WHERE id = %s RETURNING *""", (want, want, row["id"]))
        updated = cur.fetchone()
        data = repo.studio_item(cur, updated)
        if updated["kind"] == "work":
            data["ordinal"] = repo.public_ordinal_of(cur, account["house_id"],
                                                     updated["id"])
    resp = jsonify(data)
    # publishing or unlisting revalidates the public reads
    resp.headers["Cache-Control"] = "no-store"
    return resp


@bp.post("/studio/items/<item_id>/media")
def studio_media(item_id):
    account = producer()
    data = body()
    role = data.get("role")
    if role not in ("poster", "reel", "gallery"):
        return fail("Choose a media role.")
    alt = (data.get("alt") or "").strip()
    if role == "poster" and not alt:
        return fail("A poster needs a written alternative.")
    try:
        width = int(data.get("width") or 0)
        height = int(data.get("height") or 0)
        seed = int(data.get("seed") or 0)
    except (TypeError, ValueError):
        return fail("Seed, width and height are whole numbers.")
    if not (0 < width <= 4000 and 0 < height <= 4000):
        return fail("Width and height must be between 1 and 4000.")
    with connection() as cur:
        row = repo.owned_item(cur, account["house_id"], item_id)
        if not row:
            return fail(*NOT_FOUND)
        cur.execute(
            "SELECT coalesce(max(position), -1) + 1 AS p FROM media "
            "WHERE item_id=%s AND role=%s", (row["id"], role))
        position = cur.fetchone()["p"]
        media_id = new_hex_id()
        cur.execute(
            """INSERT INTO media (id, item_id, role, position, seed, width,
                                  height, alt)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (media_id, row["id"], role, position, seed, width, height, alt))
        created = cur.fetchone()
    return jsonify({"media_id": created["id"], "role": created["role"],
                    "width": created["width"], "height": created["height"],
                    "alt": created["alt"],
                    "url": "/api/media/%s" % created["id"]}), 201


@bp.post("/studio/items/<item_id>/credits")
def studio_credits(item_id):
    account = producer()
    data = body()
    role = (data.get("role") or "").strip()
    name = (data.get("name") or "").strip()
    if not role or not name:
        return fail("A credit names a role and a name.")
    talent_id = data.get("talent_id")
    with connection() as cur:
        row = repo.owned_item(cur, account["house_id"], item_id)
        if not row or row["kind"] != "work":
            return fail(*NOT_FOUND)
        if talent_id not in (None, "", 0):
            talent = repo.owned_item(cur, account["house_id"], talent_id)
            if not talent or talent["kind"] != "talent":
                return fail(*NOT_FOUND)
            talent_id = talent["id"]
        else:
            talent_id = None
        cur.execute(
            "SELECT coalesce(max(position), -1) + 1 AS p FROM credits "
            "WHERE item_id=%s", (row["id"],))
        position = cur.fetchone()["p"]
        cur.execute(
            """INSERT INTO credits (item_id, position, role, name, talent_item_id)
               VALUES (%s,%s,%s,%s,%s) RETURNING *""",
            (row["id"], position, role, name, talent_id))
        credit = cur.fetchone()
    return jsonify({"id": credit["id"], "role": credit["role"],
                    "name": credit["name"], "position": credit["position"],
                    "talent_id": credit["talent_item_id"]}), 201


@bp.post("/studio/items/<item_id>/slug")
def studio_slug(item_id):
    account = producer()
    slug = repo.slugify(body().get("slug") or "")
    if not repo.valid_slug(slug):
        return fail("A slug is lowercase letters, numbers and hyphens.")
    try:
        with connection() as cur:
            row = repo.owned_item(cur, account["house_id"], item_id)
            if not row:
                return fail(*NOT_FOUND)
            old = row["slug"]
            if old.lower() == slug:
                return jsonify(repo.studio_item(cur, row))
            cur.execute("UPDATE items SET slug=%s WHERE id=%s RETURNING *",
                        (slug, row["id"]))
            updated = cur.fetchone()
            # the old address serves permanently
            cur.execute(
                """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                   VALUES (%s,%s,%s,%s)
                   ON CONFLICT (house_id, kind, old_slug) DO UPDATE
                     SET item_id = EXCLUDED.item_id""",
                (row["house_id"], row["kind"], old, row["id"]))
            data = repo.studio_item(cur, updated)
            data["previous_slug"] = old
            return jsonify(data)
    except psycopg2.errors.UniqueViolation:
        return fail("That slug is already used by another record.", 409)


@bp.post("/studio/works/order")
def studio_order():
    account = producer()
    ordered = body().get("ordered_ids")
    if not isinstance(ordered, list) or not ordered:
        return fail("Send the works in their new order.")
    with connection() as cur:
        cur.execute(
            "SELECT id FROM items WHERE house_id=%s AND kind='work'",
            (account["house_id"],))
        owned = {r["id"] for r in cur.fetchall()}
        try:
            ids = [int(i) for i in ordered]
        except (TypeError, ValueError):
            return fail("Send whole-number identifiers.")
        if set(ids) != owned or len(ids) != len(owned):
            # a foreign or missing id is answered as a missing record
            return fail(*NOT_FOUND)
        for position, item_id in enumerate(ids):
            cur.execute("UPDATE items SET position=%s WHERE id=%s AND house_id=%s",
                        (position, item_id, account["house_id"]))
        return jsonify(repo.works_list(cur, account["house_id"]))


@bp.post("/studio/preview-tokens")
def studio_preview_token():
    account = producer()
    item_id = body().get("item_id")
    with connection() as cur:
        row = repo.owned_item(cur, account["house_id"], item_id)
        if not row:
            return fail(*NOT_FOUND)
        token = secrets.token_hex(16)
        expires = datetime.datetime.now(datetime.timezone.utc) + \
            datetime.timedelta(minutes=15)
        cur.execute(
            """INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
               VALUES (%s,%s,%s,%s) RETURNING token, expires_at""",
            (token, row["id"], expires, account["id"]))
        created = cur.fetchone()
    resp = jsonify({"token": created["token"],
                    "expires_at": created["expires_at"].isoformat(),
                    "preview_path": "/preview/%s" % created["token"]})
    resp.headers["Cache-Control"] = "no-store"
    return resp, 201
