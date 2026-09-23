"""The public half of the JSON API.

Everything here answers for the served house only, and only for published
records.  An unlisted record is absent rather than merely unlinked: it is not
in a collection, its own address is not found, and its generated pixels are
not found either, however the caller came by the media id.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from flask import Blueprint, Response, jsonify, request

from . import config, db, media, repo
from .auth import Denied, authenticate, create_viewer, current_account, hex_token, mint_token
from .config import now_utc

bp = Blueprint("api_public", __name__, url_prefix="/api")


def _body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def _text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    return value.strip() if isinstance(value, str) else ""


def _missing(reason: str = "No record at that address.") -> tuple[Response, int]:
    return jsonify({"error": "not_found", "reason": reason}), 404


@bp.get("/health")
def health() -> tuple[Response, int]:
    house = repo.public_house()
    if house is None:
        return jsonify({"status": "starting", "reason": "The house is not seeded yet."}), 503
    roster = db.one(
        """
        SELECT count(*) AS total FROM items
        WHERE house_id = %s AND kind = 'talent' AND published = TRUE
        """,
        (house["id"],),
    )
    return (
        jsonify(
            {
                "status": "ok",
                "house": house["slug"],
                "roster": int(roster["total"]) if roster else 0,
            }
        ),
        200,
    )


@bp.post("/analytics")
def analytics() -> Response:
    """Count one page view by answering it.

    Nothing is written: no row, no column, no cookie. The single stdout line
    every request already leaves is the whole of the count, which is why this
    surface can honour "page views and nothing else" without a store.
    """
    response = Response(status=204)
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.post("/auth/signup")
def signup() -> tuple[Response, int]:
    payload = _body()
    # Neither role nor house is ever read from the request body.
    account = create_viewer(_text(payload, "email"), payload.get("password") or "")
    return (
        jsonify(
            {
                "id": account["id"],
                "email": account["email"],
                "role": account["role"],
                "house_id": account["house_id"],
                "access_token": mint_token(account["id"]),
                "token_type": "bearer",
            }
        ),
        201,
    )


@bp.post("/auth/login")
def login() -> tuple[Response, int]:
    payload = _body()
    account = authenticate(_text(payload, "email"), payload.get("password") or "")
    return (
        jsonify(
            {
                "id": account["id"],
                "email": account["email"],
                "role": account["role"],
                "house_id": account["house_id"],
                "access_token": mint_token(account["id"]),
                "token_type": "bearer",
            }
        ),
        200,
    )


def _public_read(payload: Any) -> Response:
    """A public read a shared cache may store but must revalidate before reuse.

    The entity tag is computed from the body, so publishing or unlisting a
    record changes it and every cached copy revalidates on its next use.
    """
    response = jsonify(payload)
    response.headers["Cache-Control"] = "public, no-cache"
    response.add_etag()
    return response


@bp.get("/works")
@bp.get("/works/")
def works() -> Response:
    house = repo.public_house()
    return _public_read(repo.public_works(house) if house else [])


@bp.get("/works/<slug>")
def work(slug: str):
    house = repo.public_house()
    if house is None:
        return _missing()
    payload = repo.public_work(house, slug)
    if payload is None:
        moved = repo.redirect_target(house["id"], "work", slug)
        if moved is not None and moved["published"]:
            return _public_read(repo.public_work(house, moved["slug"]))
        return _missing()
    return _public_read(payload)


@bp.get("/talents")
@bp.get("/talents/")
def talents() -> Response:
    house = repo.public_house()
    discipline = request.args.get("discipline") or None
    return _public_read(repo.public_talents(house, discipline) if house else [])


@bp.get("/talents/<slug>")
def talent(slug: str):
    house = repo.public_house()
    if house is None:
        return _missing()
    payload = repo.public_talent(house, slug)
    if payload is None:
        moved = repo.redirect_target(house["id"], "talent", slug)
        if moved is not None and moved["published"]:
            return _public_read(repo.public_talent(house, moved["slug"]))
        return _missing()
    return _public_read(payload)


@bp.get("/disciplines")
def disciplines() -> Response:
    house = repo.public_house()
    return _public_read(repo.discipline_set(house["id"]) if house else [])


@bp.get("/media/<media_id>")
def media_object(media_id: str):
    row = repo.media_by_id(media_id)
    if row is None:
        return _missing("No media at that address.")
    item = repo.item_by_id(int(row["item_id"]))
    if item is None:
        return _missing("No media at that address.")
    if not _may_read_media(item):
        return _missing("No media at that address.")
    body, content_type = media.render(row)
    response = Response(body, mimetype=content_type)
    response.headers["Cache-Control"] = (
        "public, max-age=31536000, immutable" if item["published"] else "private, no-store"
    )
    return response


def _may_read_media(item: dict[str, Any]) -> bool:
    house = repo.public_house()
    if item["published"] and house is not None and item["house_id"] == house["id"]:
        return True
    account = current_account()
    if account is None or account["role"] != "producer":
        return False
    return account["house_id"] == item["house_id"]


@bp.get("/preview/<token>")
def preview(token: str):
    account = current_account()
    if account is None:
        raise Denied(401, "Sign in to open a preview.")
    if account["role"] != "producer":
        raise Denied(403, "Only a producer may open a preview.")
    item = resolve_preview(token, account)
    if item is None:
        return _missing("That preview is not here.")
    response = jsonify(repo.preview_payload(item))
    response.headers["Cache-Control"] = "private, no-store, max-age=0"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


def resolve_preview(token: str, account: dict[str, Any]) -> dict[str, Any] | None:
    """Return the previewed record, or None for anything that must read as absent."""
    if not isinstance(token, str) or len(token) != config.TOKEN_HEX_LENGTH:
        return None
    row = db.one(
        "SELECT item_id, expires_at FROM preview_tokens WHERE token = %s", (token,)
    )
    if row is None:
        return None
    expires_at = row["expires_at"]
    if expires_at is None or expires_at <= now_utc():
        return None
    item = repo.item_by_id(int(row["item_id"]))
    if item is None or item["house_id"] != account["house_id"]:
        return None
    return item


def mint_preview(item_id: int, account: dict[str, Any]) -> dict[str, Any]:
    token = hex_token()
    expires_at = now_utc() + timedelta(minutes=config.PREVIEW_TOKEN_MINUTES)
    db.execute(
        """
        INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
        VALUES (%s, %s, %s, %s)
        """,
        (token, item_id, expires_at, account["id"]),
    )
    return {
        "token": token,
        "item_id": item_id,
        "expires_at": expires_at.isoformat(),
        "href": f"/preview/{token}",
    }
