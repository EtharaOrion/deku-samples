"""Authorization is enforced server-side on every studio endpoint, reads included."""
import re
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

import auth
import app as cirrus

bp = Blueprint("studio", __name__)

KINDS = ("work", "talent")
VARIANTS = ("left", "right", "centre")
DISCIPLINES = ("director", "photographer", "stylist")


def now():
    return datetime.now(timezone.utc)


def slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return s


def producer():
    acct = auth.account_from_request(request)
    if not acct or acct["role"] != "producer" or not acct["house_id"]:
        return None
    return acct


def deny(reason, code=401):
    return jsonify({"error": reason}), code


def item_for_producer(conn, acct, item_id):
    """A foreign record is answered exactly as a missing one."""
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None
    row = conn.execute(
        "select id,house_id,kind,slug,title,position,discipline,variant,published,published_at,created_at"
        " from items where id=%s", (item_id,)).fetchone()
    if not row or row[1] != acct["house_id"]:
        return None
    keys = "id house_id kind slug title position discipline variant published published_at created_at".split()
    return dict(zip(keys, row))


def with_details(conn, item):
    item = dict(item)
    item["media"] = cirrus.media_for(item["id"])
    item["credits"] = cirrus.credits_for(item["id"])
    return item


@bp.before_request
def gate():
    acct = producer()
    if not acct:
        return deny("A producer session is required.", 401)
    request.producer = acct


@bp.get("/items")
def items_list():
    kind = request.args.get("kind")
    sql = ("select id,house_id,kind,slug,title,position,discipline,variant,published,published_at,created_at"
           " from items where house_id=%s")
    args = [request.producer["house_id"]]
    if kind in KINDS:
        sql += " and kind=%s"
        args.append(kind)
    sql += " order by kind, position, id"
    rows = request.pg.execute(sql, args).fetchall()
    keys = "id house_id kind slug title position discipline variant published published_at created_at".split()
    return jsonify([dict(zip(keys, r)) for r in rows])


@bp.get("/items/<int:item_id>")
def items_get(item_id):
    item = item_for_producer(request.pg, request.producer, item_id)
    if not item:
        return deny("No such record.", 404)
    return jsonify(with_details(request.pg, item))


def _validate_payload(data, kind):
    errors = []
    title = (data.get("title") or "").strip()
    slug = slugify(data.get("slug") or title)
    if not title:
        errors.append("A title is required.")
    if not slug:
        errors.append("A slug is required.")
    discipline = data.get("discipline")
    variant = data.get("variant")
    if kind == "talent" and discipline not in DISCIPLINES:
        errors.append("A talent needs a discipline of director, photographer or stylist.")
    if kind == "work" and variant not in VARIANTS:
        errors.append("A work needs a variant of left, right or centre.")
    return errors, title, slug, discipline, variant


@bp.post("/items")
def items_create():
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    if kind not in KINDS:
        return deny("A record is either a work or a talent.", 400)
    errors, title, slug, discipline, variant = _validate_payload(data, kind)
    if errors:
        return deny(" ".join(errors), 400)
    hid = request.producer["house_id"]
    position = request.pg.execute(
        "select coalesce(max(position),0)+1 from items where house_id=%s and kind=%s",
        (hid, kind)).fetchone()[0]
    try:
        row = request.pg.execute(
            "insert into items (house_id,kind,slug,title,position,discipline,variant,published,published_at)"
            " values (%s,%s,%s,%s,%s,%s,%s,false,null) returning"
            " id,house_id,kind,slug,title,position,discipline,variant,published,published_at,created_at",
            (hid, kind, slug, title, position, discipline, variant)).fetchone()
    except Exception:
        return deny("That slug is already taken for this kind in your house.", 409)
    keys = "id house_id kind slug title position discipline variant published published_at created_at".split()
    return jsonify(dict(zip(keys, row))), 201


@bp.patch("/items/<int:item_id>")
def items_patch(item_id):
    item = item_for_producer(request.pg, request.producer, item_id)
    if not item:
        return deny("No such record.", 404)
    data = request.get_json(silent=True) or {}
    fields = {}
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            return deny("A title is required.", 400)
        fields["title"] = title
    if "discipline" in data and item["kind"] == "talent":
        if data["discipline"] not in DISCIPLINES:
            return deny("A discipline is director, photographer or stylist.", 400)
        fields["discipline"] = data["discipline"]
    if "variant" in data and item["kind"] == "work":
        if data["variant"] not in VARIANTS:
            return deny("A variant is left, right or centre.", 400)
        fields["variant"] = data["variant"]
    if "position" in data:
        try:
            fields["position"] = int(data["position"])
        except (TypeError, ValueError):
            return deny("A position is a whole number.", 400)
    if not fields:
        return deny("Nothing to change.", 400)
    sets = ", ".join(f"{k}=%s" for k in fields)
    try:
        row = request.pg.execute(
            f"update items set {sets} where id=%s returning"
            " id,house_id,kind,slug,title,position,discipline,variant,published,published_at,created_at",
            (*fields.values(), item_id)).fetchone()
    except Exception:
        return deny("That change was refused by the store.", 409)
    keys = "id house_id kind slug title position discipline variant published published_at created_at".split()
    return jsonify(dict(zip(keys, row)))


@bp.post("/items/<int:item_id>/publish")
def items_publish(item_id):
    item = item_for_producer(request.pg, request.producer, item_id)
    if not item:
        return deny("No such record.", 404)
    data = request.get_json(silent=True) or {}
    published = bool(data.get("published", True))
    if published:
        poster = request.pg.execute(
            "select alt from media where item_id=%s and role='poster' order by position, id limit 1",
            (item_id,)).fetchone()
        if not poster or not (poster[0] or "").strip():
            return deny("A published record needs a poster with a written alternative.", 400)
    row = request.pg.execute(
        "update items set published=%s, published_at=%s where id=%s returning"
        " id,house_id,kind,slug,title,position,discipline,variant,published,published_at,created_at",
        (published, now() if published else None, item_id)).fetchone()
    keys = "id house_id kind slug title position discipline variant published published_at created_at".split()
    return jsonify(dict(zip(keys, row)))


@bp.post("/items/<int:item_id>/media")
def items_media(item_id):
    item = item_for_producer(request.pg, request.producer, item_id)
    if not item:
        return deny("No such record.", 404)
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    if role not in ("poster", "reel", "gallery"):
        return deny("A media row is a poster, a reel or a gallery still.", 400)
    try:
        width, height = int(data.get("width") or 0), int(data.get("height") or 0)
    except (TypeError, ValueError):
        return deny("Width and height are whole numbers.", 400)
    if width < 1 or height < 1 or width > 4096 or height > 4096:
        return deny("Width and height are between 1 and 4096.", 400)
    alt = (data.get("alt") or "").strip()
    if not alt:
        return deny("A media row needs a written alternative.", 400)
    seed = (data.get("seed") or "").strip() or secrets.token_hex(8)
    position = request.pg.execute(
        "select coalesce(max(position),-1)+1 from media where item_id=%s", (item_id,)).fetchone()[0]
    mid = secrets.token_hex(16)
    try:
        request.pg.execute(
            "insert into media (id,item_id,role,position,seed,width,height,alt) values (%s,%s,%s,%s,%s,%s,%s,%s)",
            (mid, item_id, role, position, seed, width, height, alt))
    except Exception:
        return deny("That media row was refused by the store.", 409)
    return jsonify({"media_id": mid, "role": role, "width": width, "height": height}), 201


@bp.delete("/media/<media_id>")
def media_delete(media_id):
    row = request.pg.execute(
        "select m.id from media m join items i on i.id=m.item_id where m.id=%s and i.house_id=%s",
        (media_id, request.producer["house_id"])).fetchone()
    if not row:
        return deny("No such media row.", 404)
    request.pg.execute("delete from media where id=%s", (media_id,))
    return jsonify({"deleted": media_id})


@bp.post("/items/<int:item_id>/credits")
def items_credits(item_id):
    item = item_for_producer(request.pg, request.producer, item_id)
    if not item:
        return deny("No such record.", 404)
    if item["kind"] != "work":
        return deny("Credits belong to a work.", 400)
    data = request.get_json(silent=True) or {}
    role = (data.get("role") or "").strip()
    name = (data.get("name") or "").strip()
    if not role or not name:
        return deny("A credit names a role and a name.", 400)
    talent_id = data.get("talent_id") or data.get("talent_item_id")
    if talent_id is not None:
        got = request.pg.execute(
            "select id from items where id=%s and house_id=%s and kind='talent'",
            (talent_id, request.producer["house_id"])).fetchone()
        if not got:
            return deny("No such talent in your house.", 404)
    position = request.pg.execute(
        "select coalesce(max(position),-1)+1 from credits where item_id=%s", (item_id,)).fetchone()[0]
    row = request.pg.execute(
        "insert into credits (item_id,position,role,name,talent_item_id) values (%s,%s,%s,%s,%s)"
        " returning id,item_id,position,role,name,talent_item_id",
        (item_id, position, role, name, talent_id)).fetchone()
    return jsonify(dict(zip("id item_id position role name talent_item_id".split(), row))), 201


@bp.post("/items/<int:item_id>/slug")
def items_slug(item_id):
    item = item_for_producer(request.pg, request.producer, item_id)
    if not item:
        return deny("No such record.", 404)
    data = request.get_json(silent=True) or {}
    slug = slugify(data.get("slug") or "")
    if not slug:
        return deny("A slug is required.", 400)
    if slug == item["slug"]:
        return jsonify(item)
    hid = request.producer["house_id"]
    try:
        row = request.pg.execute(
            "update items set slug=%s where id=%s returning"
            " id,house_id,kind,slug,title,position,discipline,variant,published,published_at,created_at",
            (slug, item_id)).fetchone()
        request.pg.execute(
            "insert into slug_redirects (house_id,kind,old_slug,item_id) values (%s,%s,%s,%s)"
            " on conflict (house_id,kind,old_slug) do update set item_id=excluded.item_id",
            (hid, item["kind"], item["slug"], item_id))
    except Exception:
        return deny("That slug is already taken for this kind in your house.", 409)
    keys = "id house_id kind slug title position discipline variant published published_at created_at".split()
    return jsonify(dict(zip(keys, row)))


@bp.post("/works/order")
def works_order():
    data = request.get_json(silent=True) or {}
    ids = data.get("ordered_ids")
    if not isinstance(ids, list) or not ids:
        return deny("Give the ids in their new order.", 400)
    hid = request.producer["house_id"]
    rows = request.pg.execute(
        "select id from items where house_id=%s and kind='work'", (hid,)).fetchall()
    own = {r[0] for r in rows}
    if any(i not in own for i in ids):
        return deny("One of those works is not yours.", 404)
    if set(ids) != own:
        return deny("Give every work exactly once.", 400)
    for pos, iid in enumerate(ids, 1):
        request.pg.execute("update items set position=%s where id=%s and house_id=%s", (pos, iid, hid))
    rows = request.pg.execute(
        "select id,house_id,kind,slug,title,position,discipline,variant,published,published_at,created_at"
        " from items where house_id=%s and kind='work' order by position, id", (hid,)).fetchall()
    keys = "id house_id kind slug title position discipline variant published published_at created_at".split()
    return jsonify([dict(zip(keys, r)) for r in rows])


@bp.post("/preview-tokens")
def preview_tokens():
    data = request.get_json(silent=True) or {}
    item_id = data.get("item_id")
    item = item_for_producer(request.pg, request.producer, item_id)
    if not item:
        return deny("No such record.", 404)
    token = secrets.token_hex(16)
    expires = now() + timedelta(minutes=15)
    row = request.pg.execute(
        "insert into preview_tokens (token,item_id,expires_at,created_by) values (%s,%s,%s,%s)"
        " returning token,expires_at",
        (token, item["id"], expires, request.producer["id"])).fetchone()
    return jsonify({"token": row[0], "expires_at": row[1].isoformat()}), 201
