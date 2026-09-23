"""The studio half of the JSON API.

Authorisation is enforced here, on every endpoint, reads included.  A producer
asking for another house's record is answered exactly as a record that does not
exist: the same status, the same body, no hint that the record is real.
"""

from __future__ import annotations

import re
from typing import Any

from flask import Blueprint, Response, g, jsonify, request
from psycopg import errors as pg_errors

from . import db, repo
from .api_public import mint_preview
from .auth import hex_token, producer_only
from .config import now_utc, slug_of
from .repo import DISCIPLINES, KINDS, MEDIA_ROLES, VARIANTS

bp = Blueprint("api_studio", __name__, url_prefix="/api/studio")

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MAX_TITLE = 200
MAX_DIMENSION = 8000


class Refused(Exception):
    """A client error that leaves the store exactly as it was found."""

    def __init__(self, reason: str, status: int = 422) -> None:
        super().__init__(reason)
        self.status = status
        self.reason = reason


def _body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise Refused("Send a JSON object.", 400)
    return payload


def _text(payload: dict[str, Any], key: str, *, limit: int = MAX_TITLE) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if len(value) > limit:
        raise Refused(f"{key} is longer than {limit} characters.")
    return value


def _integer(value: Any, field: str, *, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise Refused(f"{field} must be a whole number.")
    if value < low or value > high:
        raise Refused(f"{field} must be between {low} and {high}.")
    return value


def _slug(payload: dict[str, Any], key: str = "slug") -> str:
    raw = payload.get(key)
    if not isinstance(raw, str) or not raw.strip():
        raise Refused("A slug is required.")
    slug = slug_of(raw)
    if not SLUG_RE.match(slug):
        raise Refused("A slug is lowercase words joined by single hyphens.")
    if len(slug) > 120:
        raise Refused("That slug is too long.")
    return slug


def _absent() -> tuple[Response, int]:
    return jsonify({"error": "not_found", "reason": "No record at that address."}), 404


def _own(item_id: Any) -> dict[str, Any] | None:
    """The caller's own record, or None for anything that must read as absent."""
    try:
        numeric = int(item_id)
    except (TypeError, ValueError):
        return None
    return repo.item_in_house(numeric, g.producer["house_id"])


def _unique_violation(error: pg_errors.UniqueViolation) -> Refused:
    constraint = getattr(getattr(error, "diag", None), "constraint_name", "") or ""
    if "slug" in constraint:
        return Refused("That slug is already taken in this house.", 409)
    return Refused("That record already exists.", 409)


@bp.get("/items")
@producer_only
def list_items() -> Response:
    kind = request.args.get("kind") or None
    if kind is not None and kind not in KINDS:
        raise Refused("A record is either a work or a talent.")
    rows = repo.house_items(g.producer["house_id"], kind)
    return jsonify([repo.studio_payload(row) for row in rows])


@bp.get("/items/<item_id>")
@producer_only
def read_item(item_id: str):
    item = _own(item_id)
    if item is None:
        return _absent()
    return jsonify(repo.studio_payload(item))


@bp.post("/items")
@producer_only
def create_item():
    payload = _body()
    kind = _text(payload, "kind", limit=32).lower()
    if kind not in KINDS:
        raise Refused("A record is either a work or a talent.")
    title = _text(payload, "title")
    if not title:
        raise Refused("A title is required.")
    slug = _slug(payload)
    discipline = _text(payload, "discipline", limit=32).lower() or None
    variant = _text(payload, "variant", limit=32).lower() or None

    if kind == "talent":
        variant = None
        if discipline is None:
            raise Refused("A talent carries a discipline.")
        if discipline not in DISCIPLINES:
            raise Refused(f"A discipline is one of {', '.join(DISCIPLINES)}.")
    else:
        discipline = None
        variant = variant or "left"
        if variant not in VARIANTS:
            raise Refused(f"A variant is one of {', '.join(VARIANTS)}.")

    house_id = g.producer["house_id"]
    try:
        # The unique index decides the winner, so two simultaneous creates
        # carrying the same slug cannot both land and the loser writes nothing.
        row = db.one(
            """
            INSERT INTO items (house_id, kind, slug, title, position, discipline, variant)
            VALUES (%s, %s, %s, %s,
                    COALESCE((SELECT max(position) + 1 FROM items
                              WHERE house_id = %s AND kind = %s), 1),
                    %s, %s)
            RETURNING id
            """,
            (house_id, kind, slug, title, house_id, kind, discipline, variant),
        )
    except pg_errors.UniqueViolation as error:
        raise _unique_violation(error) from error
    if row is None:  # pragma: no cover - RETURNING always yields on success
        raise Refused("That slug is already taken in this house.", 409)
    created = repo.item_by_id(int(row["id"]))
    return jsonify(repo.studio_payload(created)), 201


@bp.patch("/items/<item_id>")
@producer_only
def update_item(item_id: str):
    item = _own(item_id)
    if item is None:
        return _absent()
    payload = _body()
    # A slug is assigned once and never changes with the title.
    if "slug" in payload:
        raise Refused("Change a slug at /api/studio/items/{id}/slug.", 400)

    updates: list[str] = []
    params: list[Any] = []
    if "title" in payload:
        title = _text(payload, "title")
        if not title:
            raise Refused("A title is required.")
        updates.append("title = %s")
        params.append(title)
    if "discipline" in payload:
        if item["kind"] != "talent":
            raise Refused("Only a talent carries a discipline.")
        discipline = _text(payload, "discipline", limit=32).lower()
        if discipline not in DISCIPLINES:
            raise Refused(f"A discipline is one of {', '.join(DISCIPLINES)}.")
        updates.append("discipline = %s")
        params.append(discipline)
    if "variant" in payload:
        if item["kind"] != "work":
            raise Refused("Only a work carries a variant.")
        variant = _text(payload, "variant", limit=32).lower()
        if variant not in VARIANTS:
            raise Refused(f"A variant is one of {', '.join(VARIANTS)}.")
        updates.append("variant = %s")
        params.append(variant)
    if not updates:
        raise Refused("Nothing to change.", 400)

    params.append(item["id"])
    db.execute(f"UPDATE items SET {', '.join(updates)} WHERE id = %s", tuple(params))
    return jsonify(repo.studio_payload(repo.item_by_id(int(item["id"]))))


@bp.post("/items/<item_id>/publish")
@producer_only
def publish_item(item_id: str):
    item = _own(item_id)
    if item is None:
        return _absent()
    payload = _body()
    wanted = payload.get("published", True)
    if not isinstance(wanted, bool):
        raise Refused("published is true or false.")

    if wanted:
        posters = [
            row
            for row in repo.media_for(int(item["id"]))
            if row["role"] == "poster"
        ]
        if any(not (row["alt"] or "").strip() for row in posters):
            raise Refused("A poster needs a written alternative before publishing.")
        db.execute(
            """
            UPDATE items SET published = TRUE,
                             published_at = COALESCE(published_at, %s)
            WHERE id = %s
            """,
            (now_utc(), item["id"]),
        )
    else:
        db.execute(
            "UPDATE items SET published = FALSE, published_at = NULL WHERE id = %s",
            (item["id"],),
        )
    return jsonify(repo.studio_payload(repo.item_by_id(int(item["id"]))))


@bp.post("/items/<item_id>/media")
@producer_only
def attach_media(item_id: str):
    item = _own(item_id)
    if item is None:
        return _absent()
    payload = _body()
    role = _text(payload, "role", limit=32).lower() or "poster"
    if role not in MEDIA_ROLES:
        raise Refused(f"A media role is one of {', '.join(MEDIA_ROLES)}.")
    seed = payload.get("seed")
    if isinstance(seed, (int, float)) and not isinstance(seed, bool):
        seed = str(seed)
    if not isinstance(seed, str) or not seed.strip():
        raise Refused("A seed is required.")
    seed = seed.strip()[:120]
    width = _integer(payload.get("width", 598), "width", low=1, high=MAX_DIMENSION)
    height = _integer(payload.get("height", 320), "height", low=1, high=MAX_DIMENSION)
    alt = payload.get("alt")
    if not isinstance(alt, str):
        raise Refused("An alternative is required.")

    media_id = hex_token()
    position = db.one(
        "SELECT COALESCE(max(position) + 1, 0) AS next FROM media WHERE item_id = %s AND role = %s",
        (item["id"], role),
    )
    db.execute(
        """
        INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            media_id,
            item["id"],
            role,
            int(position["next"]) if position else 0,
            seed,
            width,
            height,
            alt.strip(),
        ),
    )
    return (
        jsonify(
            {
                "media_id": media_id,
                "id": media_id,
                "item_id": int(item["id"]),
                "role": role,
                "seed": seed,
                "width": width,
                "height": height,
                "alt": alt.strip(),
                "src": f"/api/media/{media_id}",
            }
        ),
        201,
    )


@bp.post("/items/<item_id>/credits")
@producer_only
def attach_credit(item_id: str):
    item = _own(item_id)
    if item is None:
        return _absent()
    if item["kind"] != "work":
        raise Refused("Credits belong to a work.")
    payload = _body()
    role = _text(payload, "role", limit=80)
    name = _text(payload, "name")
    if not role or not name:
        raise Refused("A credit names a role and a name.")

    talent_id: int | None = None
    raw_talent = payload.get("talent_id", payload.get("talent_item_id"))
    if raw_talent not in (None, ""):
        named = _own(raw_talent)
        if named is None or named["kind"] != "talent":
            raise Refused("No talent at that address.", 404)
        talent_id = int(named["id"])

    position = db.one(
        "SELECT COALESCE(max(position) + 1, 0) AS next FROM credits WHERE item_id = %s",
        (item["id"],),
    )
    row = db.one(
        """
        INSERT INTO credits (item_id, position, role, name, talent_item_id)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (item["id"], int(position["next"]) if position else 0, role, name, talent_id),
    )
    return (
        jsonify(
            {
                "id": int(row["id"]),
                "item_id": int(item["id"]),
                "role": role,
                "name": name,
                "talent_id": talent_id,
                "talent_item_id": talent_id,
            }
        ),
        201,
    )


@bp.post("/items/<item_id>/slug")
@producer_only
def change_slug(item_id: str):
    item = _own(item_id)
    if item is None:
        return _absent()
    payload = _body()
    slug = _slug(payload)
    old_slug = item["slug"]
    if slug == old_slug:
        return jsonify(repo.studio_payload(item))

    try:
        with db.transaction():
            db.execute("UPDATE items SET slug = %s WHERE id = %s", (slug, item["id"]))
            # The old address keeps resolving forever.
            db.execute(
                """
                INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (house_id, kind, old_slug) DO UPDATE SET item_id = EXCLUDED.item_id
                """,
                (item["house_id"], item["kind"], old_slug, item["id"]),
            )
    except pg_errors.UniqueViolation as error:
        raise _unique_violation(error) from error

    payload_out = repo.studio_payload(repo.item_by_id(int(item["id"])))
    payload_out["old_slug"] = old_slug
    return jsonify(payload_out)


@bp.post("/works/order")
@producer_only
def reorder_works():
    payload = _body()
    ordered = payload.get("ordered_ids")
    if not isinstance(ordered, list) or not ordered:
        raise Refused("Send ordered_ids as a list of record ids.")

    house_id = g.producer["house_id"]
    resolved: list[int] = []
    for raw in ordered:
        item = _own(raw)
        if item is None or item["kind"] != "work":
            return _absent()
        resolved.append(int(item["id"]))
    if len(set(resolved)) != len(resolved):
        raise Refused("A record may appear once in the order.")

    with db.transaction():
        for index, resolved_id in enumerate(resolved):
            db.execute(
                "UPDATE items SET position = %s WHERE id = %s", (index + 1, resolved_id)
            )
        remainder = db.query(
            """
            SELECT id FROM items
            WHERE house_id = %s AND kind = 'work' AND NOT (id = ANY(%s))
            ORDER BY position ASC, id ASC
            """,
            (house_id, resolved),
        )
        for offset, row in enumerate(remainder):
            db.execute(
                "UPDATE items SET position = %s WHERE id = %s",
                (len(resolved) + offset + 1, row["id"]),
            )

    rows = repo.house_items(house_id, "work")
    return jsonify([repo.studio_payload(row) for row in rows])


@bp.post("/preview-tokens")
@producer_only
def create_preview_token():
    payload = _body()
    item = _own(payload.get("item_id"))
    if item is None:
        return _absent()
    return jsonify(mint_preview(int(item["id"]), g.producer)), 201
