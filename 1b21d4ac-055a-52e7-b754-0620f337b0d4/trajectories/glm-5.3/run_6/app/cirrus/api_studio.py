"""The studio API. Bearer auth is required on every endpoint here, reads
included, and every record lookup is scoped to the caller's own house: a
producer of one house naming another house's record is answered exactly as a
producer naming a record that does not exist."""
import datetime as dt
import re
import secrets
from psycopg import errors as pgerrors

from flask import Blueprint, current_app, g, jsonify, request

from . import auth, db, queries, serialisers

bp = Blueprint("api_studio", __name__, url_prefix="/api/studio")

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KINDS = {"work", "talent"}
VARIANTS = {"left", "right", "centre"}
DISCIPLINES = {"director", "photographer", "stylist"}
ROLES = {"poster", "reel", "gallery"}


def err(message, status=400, **extra):
    payload = {"error": message}
    payload.update(extra)
    return jsonify(payload), status


def producer():
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    token = token or request.cookies.get("cirrus_token", "")
    if not token:
        return None, err("Sign in to use the studio.", 401)
    with db.tx(readonly=True) as cur:
        account = auth.account_for_token(cur, token)
    if account is None:
        return None, err("This session has expired. Sign in again.", 401)
    if account["role"] != "producer" or account["house_id"] is None:
        return None, err("The studio is for producers only.", 403)
    return account, None


def owned_item(cur, account, item_id):
    """Scoped read: a foreign record is indistinguishable from a missing one."""
    return db.one(
        cur,
        """select * from items
            where id = %s and house_id = %s""",
        (item_id, account["house_id"]),
    )


def _require(cond, message):
    if not cond:
        raise ValueError(message)


def slugify(value):
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


@bp.get("/items")
def list_items():
    account, denial = producer()
    if denial:
        return denial
    kind = request.args.get("kind")
    with db.tx(readonly=True) as cur:
        sql = """select * from items where house_id = %s"""
        args = [account["house_id"]]
        if kind in KINDS:
            sql += " and kind = %s"
            args.append(kind)
        sql += " order by kind, position, id"
        rows = db.all_(cur, sql, args)
        for row in rows:
            if row["kind"] == "work" and row["published"]:
                row["ordinal"] = None
        out = [serialisers.item_studio(r) for r in rows]
    return jsonify(out)


def _ordinal_map(cur, house_id):
    works = queries.published_works(cur, house_id)
    return {w["id"]: w["ordinal"] for w in works}


@bp.get("/items/<int:item_id>")
def get_item(item_id):
    account, denial = producer()
    if denial:
        return denial
    with db.tx(readonly=True) as cur:
        row = owned_item(cur, account, item_id)
        if row is None:
            return err("No such record.", 404)
        if row["kind"] == "work":
            detail = serialisers.work_full(cur, row, account["house_id"])
        else:
            detail = serialisers.talent_full(cur, row, account["house_id"])
        detail["studio"] = serialisers.item_studio(row)
    return jsonify(detail)


@bp.post("/items")
def create_item():
    account, denial = producer()
    if denial:
        return denial
    body = request.get_json(silent=True) or {}
    try:
        kind = body.get("kind")
        _require(kind in KINDS, "Choose a kind: talent or work.")
        title = (body.get("title") or "").strip()
        _require(title, "A title is required.")
        slug = slugify(body.get("slug") or title)
        _require(slug, "A slug is required.")
        _require(len(slug) <= 120, "That slug is too long.")
        variant = body.get("variant")
        discipline = body.get("discipline")
        if kind == "work":
            _require(variant in VARIANTS, "Choose a width: left, right or centre.")
        else:
            _require(discipline in DISCIPLINES, "Choose a discipline.")
            variant = None
    except ValueError as e:
        return err(str(e), 422)
    try:
        with db.tx() as cur:
            pos_row = db.one(
                cur,
                """select coalesce(max(position), 0) + 1 as next from items
                    where house_id = %s and kind = %s""",
                (account["house_id"], kind),
            )
            row = db.one(
                cur,
                """insert into items (house_id, kind, slug, title, position, discipline,
                                      variant, published, published_at)
                   values (%s,%s,%s,%s,%s,%s,%s,false,null) returning *""",
                (
                    account["house_id"], kind, slug, title, pos_row["next"],
                    discipline if kind == "talent" else None,
                    variant if kind == "work" else None,
                ),
            )
    except pgerrors.UniqueViolation as e:
        constraint = getattr(e.diag, "constraint_name", "") or ""
        if "slug_redirects" in constraint:
            return err("That slug was used before and its old address still redirects.", 409)
        return err("That slug is taken.", 409)
    except ValueError as e:
        return err(str(e), 422)
    return jsonify(serialisers.item_studio(row)), 201


@bp.patch("/items/<int:item_id>")
def patch_item(item_id):
    account, denial = producer()
    if denial:
        return denial
    body = request.get_json(silent=True) or {}
    with db.tx(readonly=True) as cur:
        existing = owned_item(cur, account, item_id)
    if existing is None:
        return err("No such record.", 404)
    fields = {}
    if "title" in body:
        title = (body.get("title") or "").strip()
        if not title:
            return err("A title is required.", 422)
        fields["title"] = title
    if "variant" in body and existing["kind"] == "work":
        if body["variant"] not in VARIANTS:
            return err("Choose a width: left, right or centre.", 422)
        fields["variant"] = body["variant"]
    if "discipline" in body and existing["kind"] == "talent":
        if body["discipline"] not in DISCIPLINES:
            return err("Choose a discipline.", 422)
        fields["discipline"] = body["discipline"]
    if "position" in body:
        try:
            fields["position"] = int(body["position"])
        except (TypeError, ValueError):
            return err("Position must be a number.", 422)
    if not fields:
        return jsonify(serialisers.item_studio(existing))
    sets = ", ".join(f"{k} = %s" for k in fields)
    try:
        with db.tx() as cur:
            row = db.one(
                cur,
                f"update items set {sets} where id = %s and house_id = %s returning *",
                (*fields.values(), item_id, account["house_id"]),
            )
    except Exception:
        return err("Could not update the record.", 400)
    if row is None:
        return err("No such record.", 404)
    return jsonify(serialisers.item_studio(row))


@bp.post("/items/<int:item_id>/publish")
def publish_item(item_id):
    account, denial = producer()
    if denial:
        return denial
    body = request.get_json(silent=True) or {}
    published = bool(body.get("published", True))
    with db.tx() as cur:
        row = owned_item(cur, account, item_id)
        if row is None:
            return err("No such record.", 404)
        if published:
            poster = db.one(
                cur,
                """select alt from media where item_id = %s and role = 'poster'
                 order by position, id limit 1""",
                (item_id,),
            )
            if poster is None or not (poster["alt"] or "").strip():
                return err(
                    "The poster needs a written alternative before this record can be published.",
                    422,
                )
        row = db.one(
            cur,
            """update items
                  set published = %s,
                      published_at = case when %s then now() else null end
                where id = %s and house_id = %s returning *""",
            (published, published, item_id, account["house_id"]),
        )
        if row is None:
            return err("No such record.", 404)
        out = serialisers.item_studio(row)
        if published:
            if row["kind"] == "work":
                ordinals = _ordinal_map(cur, account["house_id"])
                out["ordinal"] = ordinals.get(row["id"])
            else:
                out["ordinal"] = None
    return jsonify(out)


@bp.post("/items/<int:item_id>/media")
def add_media(item_id):
    account, denial = producer()
    if denial:
        return denial
    body = request.get_json(silent=True) or {}
    with db.tx(readonly=True) as cur:
        existing = owned_item(cur, account, item_id)
    if existing is None:
        return err("No such record.", 404)
    try:
        role = body.get("role")
        _require(role in ROLES, "Choose a role: poster, reel or gallery.")
        seed = (body.get("seed") or "").strip()
        _require(seed, "A seed is required.")
        width = int(body.get("width") or 0)
        height = int(body.get("height") or 0)
        _require(width > 0 and height > 0, "Width and height must be positive.")
        _require(width <= 3840 and height <= 3840, "That size is too large.")
        alt = (body.get("alt") or "").strip()
    except ValueError as e:
        return err(str(e), 422)
    media_id = secrets.token_hex(16)
    try:
        with db.tx() as cur:
            row = owned_item(cur, account, item_id)
            if row is None:
                return err("No such record.", 404)
            pos = db.one(
                cur,
                """select coalesce(max(position), -1) + 1 as next from media
                    where item_id = %s""",
                (item_id,),
            )
            created = db.one(
                cur,
                """insert into media (id, item_id, role, position, seed, width, height, alt)
                   values (%s,%s,%s,%s,%s,%s,%s,%s) returning id, role, width, height, seed, alt, position""",
                (media_id, item_id, role, pos["next"], seed, width, height, alt),
            )
    except Exception:
        return err("Could not attach that media.", 400)
    return (
        jsonify(
            {
                "id": created["id"],
                "media_id": created["id"],
                "role": created["role"],
                "width": created["width"],
                "height": created["height"],
                "seed": created["seed"],
                "alt": created["alt"],
                "position": created["position"],
            }
        ),
        201,
    )


@bp.delete("/items/<int:item_id>/media/<media_id>")
def remove_media(item_id, media_id):
    account, denial = producer()
    if denial:
        return denial
    with db.tx() as cur:
        row = db.one(
            cur,
            """delete from media m using items i
                where m.id = %s and m.item_id = %s and i.id = m.item_id and i.house_id = %s
                returning m.id""",
            (media_id, item_id, account["house_id"]),
        )
    if row is None:
        return err("No such media.", 404)
    return jsonify({"deleted": media_id})


@bp.post("/items/<int:item_id>/credits")
def add_credit(item_id):
    account, denial = producer()
    if denial:
        return denial
    body = request.get_json(silent=True) or {}
    with db.tx(readonly=True) as cur:
        existing = owned_item(cur, account, item_id)
    if existing is None:
        return err("No such record.", 404)
    if existing["kind"] != "work":
        return err("Credits belong to works.", 422)
    role = (body.get("role") or "").strip()
    name = (body.get("name") or "").strip()
    if not role or not name:
        return err("A credit needs a role and a name.", 422)
    talent_id = body.get("talent_id")
    if talent_id is not None:
        talent = owned_item(cur, account, talent_id)
        if talent is None or talent["kind"] != "talent":
            return err("No such talent in your house.", 422)
    try:
        with db.tx() as cur:
            pos = db.one(
                cur,
                "select coalesce(max(position), -1) + 1 as next from credits where item_id = %s",
                (item_id,),
            )
            row = db.one(
                cur,
                """insert into credits (item_id, position, role, name, talent_item_id)
                   values (%s,%s,%s,%s,%s) returning id, position, role, name, talent_item_id""",
                (item_id, pos["next"], role, name, talent_id),
            )
    except Exception:
        return err("Could not add that credit.", 400)
    return (
        jsonify(
            {
                "id": row["id"],
                "role": row["role"],
                "name": row["name"],
                "talent_id": row["talent_item_id"],
            }
        ),
        201,
    )


@bp.delete("/items/<int:item_id>/credits/<int:credit_id>")
def remove_credit(item_id, credit_id):
    account, denial = producer()
    if denial:
        return denial
    with db.tx() as cur:
        row = db.one(
            cur,
            """delete from credits c using items i
                where c.id = %s and c.item_id = %s and i.id = c.item_id and i.house_id = %s
                returning c.id""",
            (credit_id, item_id, account["house_id"]),
        )
    if row is None:
        return err("No such credit.", 404)
    return jsonify({"deleted": credit_id})


@bp.post("/items/<int:item_id>/slug")
def change_slug(item_id):
    account, denial = producer()
    if denial:
        return denial
    body = request.get_json(silent=True) or {}
    new_slug = slugify(body.get("slug"))
    if not new_slug or len(new_slug) > 120:
        return err("A slug is required.", 422)
    try:
        with db.tx() as cur:
            row = owned_item(cur, account, item_id)
            if row is None:
                return err("No such record.", 404)
            if new_slug == row["slug"].lower():
                return jsonify(serialisers.item_studio(row))
            db.one(
                cur,
                """insert into slug_redirects (house_id, kind, old_slug, item_id)
                   values (%s,%s,%s,%s)
                   on conflict (house_id, kind, lower(old_slug)) do update
                     set item_id = excluded.item_id returning id""",
                (account["house_id"], row["kind"], row["slug"], item_id),
            )
            updated = db.one(
                cur,
                """update items set slug = %s
                    where id = %s and house_id = %s returning *""",
                (new_slug, item_id, account["house_id"]),
            )
    except Exception as e:
        constraint = getattr(getattr(e, "diag", None), "constraint_name", "") or ""
        if "items_slug_unique" in constraint:
            return err("That slug is taken.", 409)
        if "slug_redirects" in constraint:
            return err("That slug was used before and its old address still redirects.", 409)
        return err("Could not change the slug.", 400)
    return jsonify(serialisers.item_studio(updated))


@bp.post("/works/order")
def reorder():
    account, denial = producer()
    if denial:
        return denial
    body = request.get_json(silent=True) or {}
    ids = body.get("ordered_ids")
    if not isinstance(ids, list) or not ids:
        return err("Send the ids in their new order.", 422)
    try:
        with db.tx() as cur:
            owned = {
                r["id"]: r
                for r in db.all_(
                    cur,
                    "select id, kind from items where house_id = %s and kind = 'work'",
                    (account["house_id"],),
                )
            }
            clean = []
            for i in ids:
                try:
                    i = int(i)
                except (TypeError, ValueError):
                    return err("Send the ids in their new order.", 422)
                if i not in owned:
                    continue
                if i not in clean:
                    clean.append(i)
            missing = [i for i in owned if i not in clean]
            clean = clean + missing
            for position, item_id in enumerate(clean, start=1):
                db.one(
                    cur,
                    """update items set position = %s
                        where id = %s and house_id = %s returning id""",
                    (position, item_id, account["house_id"]),
                )
            rows = db.all_(
                cur,
                """select * from items where house_id = %s and kind = 'work'
                    order by position, id""",
                (account["house_id"],),
            )
            ordinals = _ordinal_map(cur, account["house_id"])
            out = []
            for r in rows:
                s = serialisers.item_studio(r)
                s["ordinal"] = ordinals.get(r["id"])
                out.append(s)
    except Exception:
        return err("Could not reorder the index.", 400)
    return jsonify(out)


@bp.post("/preview-tokens")
def mint_preview():
    account, denial = producer()
    if denial:
        return denial
    body = request.get_json(silent=True) or {}
    try:
        item_id = int(body.get("item_id"))
    except (TypeError, ValueError):
        return err("Name the record to preview.", 422)
    token = secrets.token_hex(16)
    try:
        with db.tx() as cur:
            row = owned_item(cur, account, item_id)
            if row is None:
                return err("No such record.", 404)
            tok = db.one(
                cur,
                """insert into preview_tokens (token, item_id, expires_at, created_by)
                   values (%s,%s, now() + interval '15 minutes', %s) returning expires_at""",
                (token, item_id, account["id"]),
            )
    except Exception:
        return err("Could not mint a preview token.", 400)
    return (
        jsonify(
            {
                "token": token,
                "expires_at": tok["expires_at"].isoformat(),
            }
        ),
        201,
    )
