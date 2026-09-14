"""The public JSON API and the generated media endpoint."""
import datetime as dt

from flask import Blueprint, Response, current_app, g, jsonify, redirect, request

from . import auth, db, media, queries, serialisers

bp = Blueprint("api_public", __name__, url_prefix="/api")


def served_house(cur):
    from .app import SERVED_HOUSE

    row = db.one(cur, "select * from houses where slug = %s", (SERVED_HOUSE,))
    if row is None:
        raise RuntimeError("served house missing")
    return row


def ok(payload, cache=True):
    resp = jsonify(payload)
    if cache:
        resp.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=30"
    else:
        resp.headers["Cache-Control"] = "no-store"
    return resp


def not_found(msg="Not found"):
    return jsonify({"error": msg}), 404


@bp.get("/health")
def health():
    try:
        with db.tx(readonly=True) as cur:
            db.one(cur, "select count(*) as n from houses where slug = %s", (_served_slug(),))
    except Exception:
        return jsonify({"status": "unavailable"}), 503
    if not current_app.ready:
        return jsonify({"status": "starting"}), 503
    return jsonify({"status": "ok"})


def _served_slug():
    from .app import SERVED_HOUSE

    return SERVED_HOUSE


@bp.get("/works")
def works():
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        rows = queries.published_works(cur, house["id"])
        out = []
        for r in rows:
            out.append(serialisers.work_card(r))
    return ok(out)


@bp.get("/talents")
def talents():
    discipline = request.args.get("discipline")
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        rows = queries.published_talents(cur, house["id"], discipline)
        out = [serialisers.talent_card(r) for r in rows]
    return ok(out)


@bp.get("/disciplines")
def disciplines():
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        rows = queries.discipline_set(cur, house["id"])
    return ok(rows)


def _redirect_for(cur, house_id, kind, slug):
    """A renamed slug redirects forever, at the API as on the page."""
    return db.one(
        cur,
        """select i.slug from slug_redirects r join items i on i.id = r.item_id
            where r.house_id = %s and r.kind = %s
              and lower(r.old_slug) = lower(%s) and i.published""",
        (house_id, kind, slug),
    )


@bp.get("/works/<slug>")
def work_detail(slug):
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        row = db.one(
            cur,
            """select id, slug, title, position, variant, published, published_at, discipline
               from items
              where house_id = %s and kind = 'work' and lower(slug) = lower(%s)
                and published""",
            (house["id"], slug),
        )
        if row is None:
            red = _redirect_for(cur, house["id"], "work", slug)
            if red:
                return redirect("/api/works/" + red["slug"], code=301)
            return not_found("Work not found")
        rows = queries.published_works(cur, house["id"])
        for r in rows:
            if r["id"] == row["id"]:
                row["ordinal"] = r["ordinal"]
        payload = serialisers.work_full(cur, row, house["id"])
    return ok(payload)


@bp.get("/talents/<slug>")
def talent_detail(slug):
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        row = db.one(
            cur,
            """select id, slug, title, position, discipline, published, published_at
               from items
              where house_id = %s and kind = 'talent' and lower(slug) = lower(%s)
                and published""",
            (house["id"], slug),
        )
        if row is None:
            red = _redirect_for(cur, house["id"], "talent", slug)
            if red:
                return redirect("/api/talents/" + red["slug"], code=301)
            return not_found("Talent not found")
        payload = serialisers.talent_full(cur, row, house["id"])
    return ok(payload)


@bp.get("/media/<media_id>")
def media_endpoint(media_id):
    media_id = (media_id or "").lower()
    if len(media_id) != 32 or any(c not in "0123456789abcdef" for c in media_id):
        return not_found("Media not found")
    with db.tx(readonly=True) as cur:
        row = db.one(
            cur,
            """select m.id, m.seed, m.width, m.height, m.alt, i.house_id, i.published
                 from media m join items i on i.id = m.item_id
                where m.id = %s""",
            (media_id,),
        )
        if row is None:
            return not_found("Media not found")
        house = served_house(cur)
        account = current_account(cur)
        own_producer = (
            account
            and account["role"] == "producer"
            and account["house_id"] == row["house_id"]
        )
        if own_producer:
            # The record's own house producer may always see its generated pixels.
            pass
        elif row["house_id"] != house["id"] or not row["published"]:
            # Everything else is the served house's published set, or nothing.
            return not_found("Media not found")
    body = media.render_still(row["seed"], row["width"], row["height"])
    resp = Response(body, mimetype="image/webp")
    if row["published"]:
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    else:
        resp.headers["Cache-Control"] = "private, no-store"
    return resp


def current_account(cur):
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    token = token or request.cookies.get("cirrus_token", "")
    if not token:
        return None
    return auth.account_for_token(cur, token)


# ---- auth: open to any caller, always issues a viewer or verifies a producer ----

@bp.get("/preview/<token>")
def api_preview(token):
    """One unlisted record in full, for its own house's producer and nobody else."""
    token = (token or "").lower()
    if len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        return not_found("Preview not found")
    with db.tx(readonly=True) as cur:
        tok = db.one(
            cur,
            """select t.*, i.house_id from preview_tokens t join items i on i.id = t.item_id
                where t.token = %s""",
            (token,),
        )
        account = current_account(cur)
        allowed = (
            tok is not None
            and account is not None
            and account["role"] == "producer"
            and account["house_id"] == tok["house_id"]
            and tok["expires_at"] > dt.datetime.now(dt.timezone.utc)
        )
        if not allowed:
            return not_found("Preview not found")
        row = db.one(cur, "select * from items where id = %s", (tok["item_id"],))
        if row is None:
            return not_found("Preview not found")
        if row["kind"] == "work":
            published = queries.published_works(cur, account["house_id"])
            row["ordinal"] = next(
                (w["ordinal"] for w in published if w["id"] == row["id"]), None
            )
            payload = serialisers.work_full(cur, row, account["house_id"])
        else:
            payload = serialisers.talent_full(cur, row, account["house_id"])
    return ok(payload, cache=False)


@bp.post("/analytics/view")
def analytics_view():
    """Counts a page view and nothing else. No body is stored."""
    return jsonify({"ok": True}), 204


@bp.post("/auth/signup")
def signup():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if "@" not in email or len(email) > 200:
        return err("Send an email address and a password.")
    if len(password) < 8:
        return err("Choose a password of eight characters or more.")
    with db.tx() as cur:
        row = auth.create_account(cur, email, password, role="viewer", house_id=None)
        if row is None:
            return err("That email already has an account.", 409)
        token = auth.issue_token(cur, row["id"])
    return (
        jsonify(
            {
                "account": {
                    "id": row["id"],
                    "email": row["email"],
                    "role": row["role"],
                    "house_id": None,
                },
                "token": token,
            }
        ),
        201,
    )


@bp.post("/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    with db.tx(readonly=True) as cur:
        row = db.one(cur, "select * from accounts where email = %s", (email,))
    if row is None or not auth.verify_password(password, row["password_hash"]):
        return err("That email and password do not match.", 401)
    with db.tx() as cur:
        token = auth.issue_token(cur, row["id"])
    return jsonify(
        {
            "token": token,
            "role": row["role"],
            "house_id": row["house_id"],
            "email": row["email"],
        }
    )


@bp.post("/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    token = token or request.cookies.get("cirrus_token", "")
    if token:
        with db.tx() as cur:
            cur.execute("delete from auth_tokens where token = %s", (token,))
    resp = jsonify({"ok": True})
    resp.set_cookie("cirrus_token", "", max_age=0, path="/")
    return resp


def err(message, status=400):
    return jsonify({"error": message}), status
