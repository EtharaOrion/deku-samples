"""Every route: public pages, JSON API, studio API and studio pages."""
import os
import re
import secrets

from flask import Blueprint, Response, g, jsonify, redirect, render_template, request

from . import queries as q
from .auth import bearer_from_request, hash_password, issue_token, verify_password
from .factory import SERVED_HOUSE
from .queries import (
    discipline_set,
    item_by_id,
    item_by_slug,
    item_credits,
    item_media,
    media_with_item,
    neighbours,
    ordinal_of,
    published_items,
    slug_redirect,
    works_for_talent,
)

bp = Blueprint("routes", __name__)

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
PREVIEW_TOKEN_TTL_MINUTES = 15
PUBLIC_CACHE = "public, max-age=30, stale-while-revalidate=60"


class ClientError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def conn():
    return g.conn


def house():
    h = getattr(g, "_served_house", None)
    if h is None and not getattr(g, "_served_house_loaded", False):
        g._served_house_loaded = True
        g._served_house = q.house_by_slug(conn(), SERVED_HOUSE)
    return g._served_house


def _iso(value):
    return value.isoformat().replace("+00:00", "Z") if value else None


def media_json(m, token=None):
    url = f"/api/media/{m['id']}"
    if token:
        url += f"?token={token}"
    return {
        "id": m["id"],
        "role": m["role"],
        "position": m["position"],
        "seed": m["seed"],
        "width": m["width"],
        "height": m["height"],
        "alt": m["alt"],
        "url": url,
    }


def credits_json(credits):
    out = []
    for c in credits:
        entry = {
            "id": str(c["id"]),
            "role": c["role"],
            "name": c["name"],
            "position": c["position"],
        }
        if c.get("talent_item_id") and c.get("talent_slug") and c.get("talent_published"):
            entry["talent"] = {
                "id": str(c["talent_item_id"]),
                "slug": c["talent_slug"],
                "title": c["talent_title"],
            }
        elif c.get("talent_item_id"):
            entry["talent_id"] = str(c["talent_item_id"])
        out.append(entry)
    return out


def item_json(item, with_detail=False, token=None):
    works = published_items(conn(), item["house_id"], item["kind"])
    ordinal = ordinal_of(item, works)
    data = {
        "id": str(item["id"]),
        "kind": item["kind"],
        "slug": item["slug"],
        "title": item["title"],
        "discipline": item["discipline"],
        "variant": item["variant"],
        "published": item["published"],
        "published_at": _iso(item["published_at"]),
        "ordinal": ordinal,
        "ordinal_label": f"{ordinal:03d}" if ordinal else None,
        "created_at": _iso(item["created_at"]),
    }
    if with_detail:
        data["media"] = [media_json(m, token) for m in item_media(conn(), item["id"])]
        data["credits"] = credits_json(item_credits(conn(), item["id"]))
        if item["kind"] == "work":
            prev, nxt = neighbours(item, works)
            data["previous"] = work_neighbour_json(prev, len(works), ordinal_of(prev, works) if prev else None)
            data["next"] = work_neighbour_json(nxt, len(works), ordinal_of(nxt, works) if nxt else None)
        else:
            selected = works_for_talent(conn(), item["id"])
            sel_ords = []
            for w in selected:
                o = ordinal_of(w, published_items(conn(), item["house_id"], "work"))
                sel_ords.append(entry_json(w, o))
            data["selected_work"] = sel_ords
    return data


def work_neighbour_json(item, total, ordinal):
    if item is None:
        return None
    return {
        "slug": item["slug"],
        "title": item["title"],
        "ordinal": ordinal,
        "ordinal_label": f"{ordinal:03d}" if ordinal else None,
    }


def entry_json(work, ordinal):
    poster = None
    for m in item_media(conn(), work["id"]):
        if m["role"] == "poster":
            poster = media_json(m)
            break
    return {
        "id": str(work["id"]),
        "slug": work["slug"],
        "title": work["title"],
        "variant": work["variant"],
        "ordinal": ordinal,
        "ordinal_label": f"{ordinal:03d}" if ordinal else None,
        "poster": poster,
    }


@bp.get("/api/health")
def api_health():
    """200 once the roster can be read."""
    try:
        h = house()
        if h is None:
            return jsonify(error="starting"), 503
        published_items(conn(), h["id"], "talent")
        discipline_set(conn(), h["id"])
    except Exception:
        return jsonify(error="starting"), 503
    return jsonify(ok=True, house=h["slug"])


# ---------------------------------------------------------------- auth


def _token_row(cur, token):
    cur.execute(
        """SELECT a.*, t.expires_at FROM bearer_tokens t
           JOIN accounts a ON a.id = t.account_id
           WHERE t.token = %s AND t.expires_at > now()""",
        (token,),
    )
    return cur.fetchone()


def account_for_token(token):
    if not token or not re.fullmatch(r"[0-9a-f]{32}", token):
        return None
    with conn().cursor() as cur:
        row = _token_row(cur, token)
    return dict(row) if row is not None else None


def page_token():
    """Studio pages are HTML: they read the token from the session cookie."""
    return request.cookies.get("cirrus_session") or bearer_from_request()


def query_token():
    return request.args.get("token") or page_token()


def producer_or_none():
    """Returns (account, house) for a valid producer session, else (None, None)."""
    token = bearer_from_request() or request.cookies.get("cirrus_session")
    acc = account_for_token(token)
    if acc is None or acc["role"] != "producer" or acc["house_id"] is None:
        return (None, None)
    return (acc, q.house_by_id(conn(), acc["house_id"]))


@bp.post("/api/auth/signup")
def api_signup():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ClientError("That email address does not look right.")
    if len(password) < 8:
        raise ClientError("A password needs at least 8 characters.")
    with conn().cursor() as cur:
        cur.execute("SELECT 1 FROM accounts WHERE email = %s", (email,))
        if cur.fetchone():
            raise ClientError("That email is already signed up.", 409)
        cur.execute(
            "INSERT INTO accounts (email, password_hash, role, house_id) VALUES (%s,%s,'viewer',NULL) RETURNING *",
            (email, hash_password(password)),
        )
        acc = dict(cur.fetchone())
    token = issue_token(conn(), acc["id"])
    conn().commit()
    return jsonify(
        {
            "account": {"id": str(acc["id"]), "email": acc["email"], "role": acc["role"], "house_id": None},
            "token": token,
            "role": "viewer",
        }
    )


@bp.post("/api/auth/login")
def api_login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    with conn().cursor() as cur:
        cur.execute("SELECT * FROM accounts WHERE email = %s", (email,))
        acc = cur.fetchone()
    acc = dict(acc) if acc is not None else None
    if acc is None or not verify_password(password, acc["password_hash"]):
        conn().rollback()
        raise ClientError("That email and password do not match.", 401)
    token = issue_token(conn(), acc["id"])
    conn().commit()
    house = q.house_by_id(conn(), acc["house_id"]) if acc["house_id"] else None
    resp = jsonify(
        {
            "token": token,
            "role": acc["role"],
            "account": {
                "id": str(acc["id"]),
                "email": acc["email"],
                "role": acc["role"],
                "house_id": str(acc["house_id"]) if acc["house_id"] else None,
            },
            "house": {"slug": house["slug"], "name": house["name"]} if house else None,
        }
    )
    resp.set_cookie(
        "cirrus_session", token, max_age=7 * 24 * 3600, httponly=False, samesite="Lax", path="/"
    )
    return resp


@bp.post("/api/auth/logout")
def api_logout():
    token = bearer_from_request() or request.cookies.get("cirrus_session")
    if token:
        with conn().cursor() as cur:
            cur.execute("DELETE FROM bearer_tokens WHERE token = %s", (token,))
        conn().commit()
    resp = jsonify(ok=True)
    resp.delete_cookie("cirrus_session", path="/")
    return resp


@bp.get("/api/auth/me")
def api_me():
    acc = account_for_token(bearer_from_request() or request.cookies.get("cirrus_session"))
    if acc is None:
        return jsonify(error="No session"), 401
    house = q.house_by_id(conn(), acc["house_id"]) if acc["house_id"] else None
    return jsonify(
        {
            "account": {
                "id": str(acc["id"]),
                "email": acc["email"],
                "role": acc["role"],
                "house_id": str(acc["house_id"]) if acc["house_id"] else None,
            },
            "house": {"slug": house["slug"], "name": house["name"]} if house else None,
        }
    )


# ---------------------------------------------------------------- public reads


@bp.get("/api/works")
def api_works():
    works = published_items(conn(), house()["id"], "work")
    return jsonify([entry_json(w, i + 1) for i, w in enumerate(works)])


@bp.get("/api/talents")
def api_talents():
    disc = request.args.get("discipline")
    talents = published_items(conn(), house()["id"], "talent")
    out = []
    n = 0
    for t in talents:
        if disc and t["discipline"] != disc.lower():
            continue
        n += 1
        out.append(
            {
                "id": str(t["id"]),
                "slug": t["slug"],
                "title": t["title"],
                "discipline": t["discipline"],
                "ordinal": n,
                "poster": _poster(t),
            }
        )
    return jsonify(out)


def _poster(item):
    for m in item_media(conn(), item["id"]):
        if m["role"] == "poster":
            return media_json(m)
    return None


@bp.get("/api/disciplines")
def api_disciplines():
    return jsonify(discipline_set(conn(), house()["id"]))


def _published_item_or_404(kind, slug):
    item = item_by_slug(conn(), house()["id"], kind, slug)
    if item is None or not item["published"]:
        rd = slug_redirect(conn(), house()["id"], kind, slug)
        if rd is not None:
            return None, rd
        return None, None
    return item, None


@bp.get("/api/works/<slug>")
def api_work(slug):
    item, rd = _published_item_or_404("work", slug)
    if item is None:
        if rd is not None:
            return jsonify(error="Moved", location=f"/api/works/{rd['item_id']}"), 301
        raise ClientError("Not found", 404)
    return jsonify(item_json(item, with_detail=True))


@bp.get("/api/talents/<slug>")
def api_talent(slug):
    item, rd = _published_item_or_404("talent", slug)
    if item is None:
        raise ClientError("Not found", 404)
    return jsonify(item_json(item, with_detail=True))


# ---------------------------------------------------------------- media


@bp.get("/api/media/<media_id>")
def api_media(media_id):
    m = media_with_item(conn(), media_id)
    if m is None:
        raise ClientError("Not found", 404)
    token = query_token()
    if m["item_published"]:
        resp = _media_response(m)
        resp.headers["Cache-Control"] = PUBLIC_CACHE
        return resp
    acc = account_for_token(token)
    if acc is None or acc["role"] != "producer" or acc["house_id"] != m["item_house_id"]:
        raise ClientError("Not found", 404)
    resp = _media_response(m)
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


def _media_response(m):
    renderer = current_app_media()
    accept = request.headers.get("Accept", "")
    fmt = request.args.get("format")
    if fmt == "png":
        data = renderer.still_png(m["seed"], m["width"], m["height"])
        ctype = "image/png"
    elif fmt == "webp" or (fmt is None and "image/webp" in accept):
        data = renderer.still_webp(m["seed"], m["width"], m["height"])
        ctype = "image/webp"
    else:
        data = renderer.still_png(m["seed"], m["width"], m["height"])
        ctype = "image/png"
    resp = Response(data, mimetype=ctype)
    resp.headers["ETag"] = f'"{m["id"]}-{m["seed"]}-{m["width"]}x{m["height"]}"'
    return resp


def current_app_media():
    from flask import current_app

    return current_app.extensions["media"]


# ---------------------------------------------------------------- preview


def _resolve_preview(token):
    with conn().cursor() as cur:
        cur.execute(
            """SELECT t.*, i.house_id AS item_house FROM preview_tokens t
               JOIN items i ON i.id = t.item_id
               WHERE t.token = %s AND t.expires_at > now()""",
            (token,),
        )
        row = cur.fetchone()
    return dict(row) if row is not None else None


@bp.get("/api/preview/<token>")
def api_preview(token):
    row = _resolve_preview(token)
    if row is None:
        raise ClientError("Not found", 404)
    acc, acc_house = producer_or_none()
    if acc_house is None or acc_house["id"] != row["item_house"]:
        raise ClientError("Not found", 404)
    item = item_by_id(conn(), row["item_id"])
    token_str = bearer_from_request() or request.cookies.get("cirrus_session")
    data = item_json(item, with_detail=True, token=token_str)
    data["preview"] = {"expires_at": _iso(row["expires_at"])}
    resp = jsonify(data)
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


# ---------------------------------------------------------------- studio API


def _require_producer():
    acc = account_for_token(bearer_from_request() or request.cookies.get("cirrus_session"))
    if acc is None:
        raise ClientError("Sign in to the studio first.", 401)
    if acc["role"] != "producer" or acc["house_id"] is None:
        raise ClientError("The studio is for a house producer.", 403)
    return acc, q.house_by_id(conn(), acc["house_id"])


def _uuid(value):
    import uuid as _uuid_mod

    try:
        return _uuid_mod.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def _own_item_or_none(acc_house, item_id):
    value = _uuid(item_id)
    if value is None:
        return None
    item = item_by_id(conn(), value)
    if item is None or item["house_id"] != acc_house["id"]:
        return None
    return item
    if item is None or item["house_id"] != acc_house["id"]:
        return None
    return item


def _slugify(value):
    value = str(value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def _validate_slug_slug(value):
    if not value or not SLUG_RE.fullmatch(value):
        return False
    return True


@bp.get("/api/studio/items")
def studio_items():
    acc, acc_house = _require_producer()
    kind = request.args.get("kind")
    with conn().cursor() as cur:
        if kind in ("work", "talent"):
            cur.execute(
                "SELECT * FROM items WHERE house_id = %s AND kind = %s ORDER BY position, created_at",
                (acc_house["id"], kind),
            )
        else:
            cur.execute(
                "SELECT * FROM items WHERE house_id = %s ORDER BY kind, position, created_at",
                (acc_house["id"],),
            )
        items = [dict(r) for r in cur.fetchall()]
    return jsonify([_studio_item(i) for i in items])


def _studio_item(item):
    media = item_media(conn(), item["id"])
    credits = item_credits(conn(), item["id"])
    published_set = published_items(conn(), item["house_id"], item["kind"])
    ordinal = ordinal_of(item, published_set)
    return {
        "id": str(item["id"]),
        "kind": item["kind"],
        "slug": item["slug"],
        "title": item["title"],
        "discipline": item["discipline"],
        "variant": item["variant"],
        "position": item["position"],
        "published": item["published"],
        "published_at": _iso(item["published_at"]),
        "ordinal": ordinal,
        "ordinal_label": f"{ordinal:03d}" if ordinal else None,
        "media_count": len(media),
        "credits_count": len(credits),
        "has_poster_alt": any(m["role"] == "poster" and m["alt"].strip() for m in media),
        "public_address": f"/{item['kind']}s/{item['slug']}",
    }


@bp.get("/api/studio/items/<item_id>")
def studio_item(item_id):
    acc, acc_house = _require_producer()
    item = _own_item_or_none(acc_house, item_id)
    if item is None:
        raise ClientError("Not found", 404)
    token = bearer_from_request() or request.cookies.get("cirrus_session")
    data = item_json(item, with_detail=True, token=token)
    data.update(_studio_item(item))
    return jsonify(data)


@bp.post("/api/studio/items")
def studio_create_item():
    acc, acc_house = _require_producer()
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    if kind not in ("work", "talent"):
        raise ClientError("A record is either a work or a talent.")
    title = str(data.get("title", "")).strip()
    if not title:
        raise ClientError("A title is needed.")
    slug = _slugify(data.get("slug") or title)
    if not _validate_slug_slug(slug):
        raise ClientError("That title cannot become an address. Try words and dashes.")
    discipline = data.get("discipline")
    variant = data.get("variant")
    if kind == "talent" and discipline not in DISCIPLINES:
        raise ClientError("A talent needs a discipline: director, photographer or stylist.")
    if kind == "work":
        discipline = None
        if variant not in VARIANTS:
            variant = "left"
    else:
        variant = None
    with conn().cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM items WHERE house_id = %s AND kind = %s", (acc_house["id"], kind))
        pos = cur.fetchone()["p"]
        try:
            cur.execute(
                """INSERT INTO items (house_id, kind, slug, title, position, discipline, variant, published, published_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,FALSE,NULL) RETURNING *""",
                (acc_house["id"], kind, slug, title, pos, discipline, variant),
            )
        except Exception:
            conn().rollback()
            raise ClientError("That address is taken in this house. Choose another.", 409)
        item = dict(cur.fetchone())
    conn().commit()
    return jsonify(_studio_item(item)), 201


@bp.patch("/api/studio/items/<item_id>")
def studio_update_item(item_id):
    acc, acc_house = _require_producer()
    item = _own_item_or_none(acc_house, item_id)
    if item is None:
        raise ClientError("Not found", 404)
    data = request.get_json(silent=True) or {}
    fields = {}
    if "title" in data:
        title = str(data["title"]).strip()
        if not title:
            raise ClientError("A title is needed.")
        fields["title"] = title
    if "discipline" in data and item["kind"] == "talent":
        if data["discipline"] not in DISCIPLINES:
            raise ClientError("A discipline is director, photographer or stylist.")
        fields["discipline"] = data["discipline"]
    if "variant" in data and item["kind"] == "work":
        if data["variant"] not in VARIANTS:
            raise ClientError("A variant is left, right or centre.")
        fields["variant"] = data["variant"]
    if "position" in data:
        try:
            fields["position"] = int(data["position"])
        except (TypeError, ValueError):
            raise ClientError("A position is a whole number.")
    if fields:
        sets = ", ".join(f"{k} = %s" for k in fields)
        with conn().cursor() as cur:
            try:
                cur.execute(
                    f"UPDATE items SET {sets} WHERE id = %s RETURNING *",
                    (*fields.values(), item["id"]),
                )
                item = dict(cur.fetchone())
            except Exception:
                conn().rollback()
                raise ClientError("That change was refused. Nothing was saved.", 409)
        conn().commit()
    token = bearer_from_request() or request.cookies.get("cirrus_session")
    data_out = item_json(item, with_detail=True, token=token)
    data_out.update(_studio_item(item))
    return jsonify(data_out)


@bp.post("/api/studio/items/<item_id>/publish")
def studio_publish(item_id):
    acc, acc_house = _require_producer()
    item = _own_item_or_none(acc_house, item_id)
    if item is None:
        raise ClientError("Not found", 404)
    data = request.get_json(silent=True) or {}
    published = bool(data.get("published", True))
    if published:
        media = item_media(conn(), item["id"])
        poster = next((m for m in media if m["role"] == "poster"), None)
        if poster is None or not poster["alt"].strip():
            raise ClientError("A published record needs a poster with a written alternative.")
        with conn().cursor() as cur:
            cur.execute(
                "UPDATE items SET published = TRUE, published_at = COALESCE(published_at, now()) WHERE id = %s RETURNING *",
                (item["id"],),
            )
            item = dict(cur.fetchone())
    else:
        with conn().cursor() as cur:
            cur.execute(
                "UPDATE items SET published = FALSE, published_at = NULL WHERE id = %s RETURNING *",
                (item["id"],),
            )
            item = dict(cur.fetchone())
    conn().commit()
    out = _studio_item(item)
    token = bearer_from_request() or request.cookies.get("cirrus_session")
    out["media"] = [media_json(m, token) for m in item_media(conn(), item["id"])]
    resp = jsonify(out)
    resp.headers["Cache-Control"] = "no-store"
    return resp


@bp.post("/api/studio/items/<item_id>/media")
def studio_add_media(item_id):
    acc, acc_house = _require_producer()
    item = _own_item_or_none(acc_house, item_id)
    if item is None:
        raise ClientError("Not found", 404)
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    if role not in ("poster", "reel", "gallery"):
        raise ClientError("A media row is a poster, a reel or a gallery still.")
    alt = str(data.get("alt", "")).strip()
    if not alt:
        raise ClientError("Every still needs a written alternative.")
    try:
        width = int(data.get("width", 0))
        height = int(data.get("height", 0))
    except (TypeError, ValueError):
        raise ClientError("Width and height are whole numbers.")
    if not (16 <= width <= 6000 and 16 <= height <= 6000):
        raise ClientError("Width and height sit between 16 and 6000.")
    seed = str(data.get("seed") or secrets.token_hex(8))
    with conn().cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM media WHERE item_id = %s", (item["id"],))
        pos = cur.fetchone()["p"]
        cur.execute(
            """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (secrets.token_hex(16), item["id"], role, pos, seed, width, height, alt),
        )
        m = dict(cur.fetchone())
    conn().commit()
    return (
        jsonify(
            {
                "media_id": m["id"],
                "role": m["role"],
                "width": m["width"],
                "height": m["height"],
                "alt": m["alt"],
                "url": f"/api/media/{m['id']}",
            }
        ),
        201,
    )


@bp.delete("/api/studio/media/<media_id>")
def studio_remove_media(media_id):
    acc, acc_house = _require_producer()
    m = media_with_item(conn(), media_id)
    if m is None or m["item_house_id"] != acc_house["id"]:
        raise ClientError("Not found", 404)
    with conn().cursor() as cur:
        cur.execute("DELETE FROM media WHERE id = %s", (media_id,))
    conn().commit()
    return jsonify(ok=True)


@bp.post("/api/studio/items/<item_id>/credits")
def studio_add_credit(item_id):
    acc, acc_house = _require_producer()
    item = _own_item_or_none(acc_house, item_id)
    if item is None:
        raise ClientError("Not found", 404)
    if item["kind"] != "work":
        raise ClientError("Credits belong to a work.")
    data = request.get_json(silent=True) or {}
    role = str(data.get("role", "")).strip()
    name = str(data.get("name", "")).strip()
    if not role or not name:
        raise ClientError("A credit names a role and a name.")
    talent_id = data.get("talent_id") or data.get("talent_item_id")
    talent_uuid = None
    if talent_id:
        talent = _own_item_or_none(acc_house, talent_id)
        if talent is None or talent["kind"] != "talent":
            raise ClientError("That talent is not in this house.")
        talent_uuid = talent["id"]
    with conn().cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM credits WHERE item_id = %s", (item["id"],))
        pos = cur.fetchone()["p"]
        cur.execute(
            "INSERT INTO credits (item_id, position, role, name, talent_item_id) VALUES (%s,%s,%s,%s,%s) RETURNING *",
            (item["id"], pos, role, name, talent_uuid),
        )
        c = dict(cur.fetchone())
    conn().commit()
    return (
        jsonify(
            {
                "id": str(c["id"]),
                "role": c["role"],
                "name": c["name"],
                "position": c["position"],
                "talent_id": str(c["talent_item_id"]) if c["talent_item_id"] else None,
            }
        ),
        201,
    )


@bp.delete("/api/studio/credits/<credit_id>")
def studio_remove_credit(credit_id):
    acc, acc_house = _require_producer()
    with conn().cursor() as cur:
        cur.execute(
            """SELECT c.* FROM credits c JOIN items i ON i.id = c.item_id
               WHERE c.id = %s AND i.house_id = %s""",
            (credit_id, acc_house["id"]),
        )
        row = cur.fetchone()
        if row is None:
            raise ClientError("Not found", 404)
        cur.execute("DELETE FROM credits WHERE id = %s", (credit_id,))
    conn().commit()
    return jsonify(ok=True)


@bp.post("/api/studio/items/<item_id>/slug")
def studio_rename(item_id):
    acc, acc_house = _require_producer()
    item = _own_item_or_none(acc_house, item_id)
    if item is None:
        raise ClientError("Not found", 404)
    data = request.get_json(silent=True) or {}
    new_slug = _slugify(data.get("slug"))
    if not _validate_slug_slug(new_slug):
        raise ClientError("An address is lowercase words joined by dashes.")
    if new_slug == item["slug"].lower():
        out = _studio_item(item)
        out["slug"] = item["slug"]
        return jsonify(out)
    old_slug = item["slug"]
    with conn().cursor() as cur:
        try:
            cur.execute(
                "UPDATE items SET slug = %s WHERE id = %s RETURNING *", (new_slug, item["id"])
            )
            item = dict(cur.fetchone())
        except Exception:
            conn().rollback()
            raise ClientError("That address is taken in this house.", 409)
        try:
            cur.execute(
                """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                   VALUES (%s,%s,%s,%s)
                   ON CONFLICT (house_id, kind, old_slug) DO UPDATE
                     SET item_id = EXCLUDED.item_id, created_at = now()""",
                (acc_house["id"], item["kind"], old_slug, item["id"]),
            )
        except Exception:
            conn().rollback()
            raise ClientError("The rename could not be recorded. Nothing was saved.", 409)
    conn().commit()
    return jsonify(_studio_item(item))


@bp.post("/api/studio/works/order")
def studio_reorder():
    acc, acc_house = _require_producer()
    data = request.get_json(silent=True) or {}
    ordered = data.get("ordered_ids") or []
    if not isinstance(ordered, list):
        raise ClientError("ordered_ids is a list of record ids.")
    with conn().cursor() as cur:
        cur.execute("SELECT id FROM items WHERE house_id = %s AND kind = 'work'", (acc_house["id"],))
        own = {str(r["id"]) for r in cur.fetchall()}
        given = [str(i) for i in ordered]
        if len(set(given)) != len(given):
            raise ClientError("A record appears twice in that order.")
        # a foreign id is answered exactly as a missing one
        cur.execute("SELECT id FROM items WHERE id = ANY(%s::uuid[])", (given,))
        named = {str(r["id"]) for r in cur.fetchall()}
        if named - own:
            raise ClientError("Not found", 404)
        if set(given) != own:
            raise ClientError("That order must carry every work of this house and no other.")
        for pos, iid in enumerate(given, start=1):
            cur.execute("UPDATE items SET position = %s WHERE id = %s AND house_id = %s", (pos, iid, acc_house["id"]))
    conn().commit()
    works = published_items(conn(), acc_house["id"], "work")
    return jsonify([entry_json(w, i + 1) for i, w in enumerate(works)])


@bp.post("/api/studio/preview-tokens")
def studio_preview_token():
    acc, acc_house = _require_producer()
    data = request.get_json(silent=True) or {}
    item = _own_item_or_none(acc_house, data.get("item_id") or "")
    if item is None:
        raise ClientError("Not found", 404)
    token = secrets.token_hex(16)
    with conn().cursor() as cur:
        cur.execute(
            """INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
               VALUES (%s,%s, now() + interval '15 minutes', %s) RETURNING *""",
            (token, item["id"], acc["id"]),
        )
        row = dict(cur.fetchone())
    conn().commit()
    resp = jsonify({"token": row["token"], "expires_at": _iso(row["expires_at"])})
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


# ---------------------------------------------------------------- analytics beacon


@bp.post("/api/analytics/view")
def analytics_view():
    """Counts page views and nothing else. Nothing is written to the store."""
    return Response(status=204)


# ---------------------------------------------------------------- public pages


def public_origin():
    """The house's own address, from the environment, never hardcoded."""
    return (current_app().config.get("APP_PUBLIC_URL") or "").rstrip("/")


def current_app():
    from flask import current_app as _ca

    return _ca


def _page_ctx(**kwargs):
    h = house()
    ctx = {
        "house": h,
        "origin": public_origin(),
        "disciplines": discipline_set(conn(), h["id"]),
        "nav": [("WORKS", "/works"), ("TALENTS", "/talents"), ("CONTACT", h["contact_email"]), ("ABOUT", "/about")],
    }
    ctx.update(kwargs)
    return ctx


@bp.get("/")
def page_entry():
    works = published_items(conn(), house()["id"], "work")
    entries = [entry_json(w, i + 1) for i, w in enumerate(works)]
    return render_template(
        "entry.html",
        **_page_ctx(
            works=entries,
            page_title="Cirrus",
            frame_mark="entry",
            meta_description="A production house for picture and its makers.",
        ),
    )


@bp.get("/works")
@bp.get("/works/")
def page_works():
    works = published_items(conn(), house()["id"], "work")
    entries = [entry_json(w, i + 1) for i, w in enumerate(works)]
    return render_template(
        "works.html",
        **_page_ctx(
            works=entries,
            page_title="Cirrus - Works",
            frame_mark="works",
            meta_description="A production house for picture and its makers.",
        ),
    )


@bp.get("/works/<slug>")
def page_work(slug):
    item, rd = _published_item_or_404("work", slug)
    if item is None:
        if rd is not None:
            target = item_by_id(conn(), rd["item_id"])
            if target is not None:
                return redirect(f"/works/{target['slug']}", code=301)
        raise ClientError("Not found", 404)
    data = item_json(item, with_detail=True)
    return render_template(
        "work.html",
        **_page_ctx(
            work=data,
            page_title=f"Cirrus - {item['title']}",
            frame_mark="works",
            meta_description="A production house for picture and its makers.",
        ),
    )


@bp.get("/talents")
@bp.get("/talents/")
def page_talents():
    talents = published_items(conn(), house()["id"], "talent")
    discs = discipline_set(conn(), house()["id"])
    out = []
    for n, t in enumerate(talents, start=1):
        out.append(
            {
                "id": str(t["id"]),
                "slug": t["slug"],
                "title": t["title"],
                "discipline": t["discipline"],
                "ordinal": n,
                "poster": _poster(t),
                "reel": _reel_of(t),
            }
        )
    return render_template(
        "talents.html",
        **_page_ctx(
            talents=out,
            disciplines=discs,
            page_title="Cirrus - Talents",
            frame_mark="talents",
            meta_description="A production house for picture and its makers.",
        ),
    )


def _reel_of(item):
    for m in item_media(conn(), item["id"]):
        if m["role"] == "reel":
            return media_json(m)
    return None


@bp.get("/talents/<slug>")
def page_talent(slug):
    item, rd = _published_item_or_404("talent", slug)
    if item is None:
        if rd is not None:
            target = item_by_id(conn(), rd["item_id"])
            if target is not None:
                return redirect(f"/talents/{target['slug']}", code=301)
        raise ClientError("Not found", 404)
    data = item_json(item, with_detail=True)
    return render_template(
        "talent.html",
        **_page_ctx(
            talent=data,
            page_title=f"Cirrus - {item['title']}",
            frame_mark="talents",
            meta_description="A production house for picture and its makers.",
        ),
    )


@bp.get("/about")
def page_about():
    return render_template(
        "about.html",
        **_page_ctx(
            page_title="Cirrus - About",
            frame_mark="about",
            meta_description="A production house for picture and its makers.",
        ),
    )


@bp.get("/signup")
def page_signup():
    return render_template(
        "signup.html",
        **_page_ctx(
            page_title="Cirrus - Sign up",
            frame_mark="entry",
            meta_description="A production house for picture and its makers.",
        ),
    )


@bp.get("/share-image.png")
def share_image():
    data = current_app_media().share_image(wordmark=house()["name"])
    return Response(data, mimetype="image/png", headers={"Cache-Control": PUBLIC_CACHE})


@bp.get("/robots.txt")
def robots():
    body = "User-agent: *\nAllow: /\nDisallow: /studio\nDisallow: /preview\n"
    return Response(body, mimetype="text/plain")


# ---------------------------------------------------------------- preview and studio pages


@bp.get("/preview/<token>")
def page_preview(token):
    row = _resolve_preview(token)
    acc, acc_house = producer_or_none()
    if row is None or acc_house is None or acc_house["id"] != row["item_house"]:
        from .factory import not_found_response

        return not_found_response(status=404)
    item = item_by_id(conn(), row["item_id"])
    token_str = request.cookies.get("cirrus_session") or bearer_from_request()
    data = item_json(item, with_detail=True, token=token_str)
    data["preview"] = {"expires_at": _iso(row["expires_at"]), "token": token}
    template = "work.html" if item["kind"] == "work" else "talent.html"
    return render_template(
        template,
        **_page_ctx(
            work=data,
            talent=data,
            page_title="Cirrus - Preview",
            frame_mark="works" if item["kind"] == "work" else "talents",
            meta_noindex=True,
            is_preview=True,
            preview=data["preview"],
            meta_description="A production house for picture and its makers.",
        ),
    )


def _studio_guard():
    """Studio HTML routes need a session. A viewer is refused to the entry route;
    no session at all lands on the login page."""
    token = bearer_from_request() or request.cookies.get("cirrus_session")
    acc = account_for_token(token)
    if acc is None:
        return (None, None)
    if acc["role"] != "producer" or acc["house_id"] is None:
        return (acc, None)
    return (acc, q.house_by_id(conn(), acc["house_id"]))


@bp.get("/studio")
def page_studio():
    acc, acc_house = _studio_guard()
    if acc is None:
        return redirect("/studio/login")
    if acc["role"] != "producer" or acc_house is None:
        return redirect("/")
    items = [_studio_item(i) for i in _house_items(acc_house)]
    return _studio_page("studio.html", acc, acc_house, items=items)


def _house_items(acc_house):
    with conn().cursor() as cur:
        cur.execute(
            "SELECT * FROM items WHERE house_id = %s ORDER BY kind, position, created_at",
            (acc_house["id"],),
        )
        return [dict(r) for r in cur.fetchall()]


def studio_talents_list(acc_house):
    with conn().cursor() as cur:
        cur.execute(
            "SELECT id, title, slug, published FROM items WHERE house_id = %s AND kind = 'talent' ORDER BY position, created_at",
            (acc_house["id"],),
        )
        return [
            {"id": str(r["id"]), "title": r["title"], "slug": r["slug"], "published": r["published"]}
            for r in cur.fetchall()
        ]


def _studio_page(template, acc, acc_house, **extra):
    return render_template(
        template,
        **_page_ctx(
            studio_account=acc,
            studio_house=acc_house,
            studio_talents=studio_talents_list(acc_house),
            studio_items=[_studio_item(i) for i in _house_items(acc_house)],
            page_title="Cirrus - Studio",
            frame_mark="works",
            meta_noindex=True,
            meta_description="A production house for picture and its makers.",
            **extra,
        ),
    )


@bp.get("/studio/login")
def page_studio_login():
    acc, acc_house = _studio_guard()
    if acc_house is not None:
        return redirect("/studio")
    return render_template(
        "studio_login.html",
        **_page_ctx(
            page_title="Cirrus - Studio",
            frame_mark="works",
            meta_noindex=True,
            meta_description="A production house for picture and its makers.",
        ),
    )


@bp.get("/studio/talents/new")
def page_studio_new_talent():
    acc, acc_house = _studio_guard()
    if acc_house is None or acc["role"] != "producer":
        return redirect("/studio/login")
    return _studio_page("studio_new_talent.html", acc, acc_house)


@bp.get("/studio/works/new")
def page_studio_new_work():
    acc, acc_house = _studio_guard()
    if acc_house is None or acc["role"] != "producer":
        return redirect("/studio/login")
    return _studio_page("studio_new_work.html", acc, acc_house)


@bp.get("/studio/items/<item_id>")
def page_studio_item(item_id):
    acc, acc_house = _studio_guard()
    if acc is None:
        return redirect("/studio/login")
    if acc["role"] != "producer" or acc_house is None:
        return redirect("/")
    item = _own_item_or_none(acc_house, item_id)
    if item is None:
        from .factory import not_found_response

        return not_found_response(status=404)
    token_str = request.cookies.get("cirrus_session") or bearer_from_request()
    data = item_json(item, with_detail=True, token=token_str)
    data.update(_studio_item(item))
    data["credits"] = credits_json(item_credits(conn(), item["id"]))
    return _studio_page("studio_item.html", acc, acc_house, record=data)


@bp.get("/studio/items/<item_id>/published")
def page_studio_published(item_id):
    acc, acc_house = _studio_guard()
    if acc is None:
        return redirect("/studio/login")
    if acc["role"] != "producer" or acc_house is None:
        return redirect("/")
    item = _own_item_or_none(acc_house, item_id)
    if item is None:
        from .factory import not_found_response

        return not_found_response(status=404)
    return _studio_page("studio_published.html", acc, acc_house, record=_studio_item(item))


# ---------------------------------------------------------------- errors


@bp.errorhandler(ClientError)
def handle_client_error(e):
    conn().rollback()
    if request.path.startswith("/api/") or request.path.startswith("/preview/"):
        return jsonify(error=e.message), e.status
    return jsonify(error=e.message), e.status
