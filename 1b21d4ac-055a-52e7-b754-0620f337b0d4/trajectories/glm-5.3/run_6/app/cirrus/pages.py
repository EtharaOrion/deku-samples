"""Server-rendered routes. The browser receives a complete document on first
paint; Alpine.js enhances the delivered HTML in place."""
import datetime as dt

from flask import Blueprint, abort, redirect, render_template, request

from . import auth, db, media, queries, serialisers
from .api_public import current_account, served_house

bp = Blueprint("pages", __name__)

DESCRIPTION = "A production house for picture and its makers."


@bp.get("/favicon.ico")
def favicon():
    return redirect("/static/build/share.png", code=302)


def _meta(title, route, indexable=True, description=DESCRIPTION):
    return {
        "title": title,
        "description": description,
        "route": route,
        "indexable": indexable,
    }


def _studio_view(cur):
    """Read the producer whose token the browser carries, if any."""
    return current_account(cur)


@bp.get("/")
def entry():
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        rows = queries.published_works(cur, house["id"])
        cards = [serialisers.work_card(r) for r in rows]
        for r, c in zip(rows, cards):
            poster = db.one(
                cur,
                """select id, role, position, seed, width, height, alt from media
                    where item_id = %s and role = 'poster' order by position, id limit 1""",
                (r["id"],),
            )
            c["poster"] = serialisers.media_json(poster) if poster else None
    return render_template(
        "entry.html",
        meta=_meta("Cirrus", "entry"),
        house=house,
        works=cards,
    )


@bp.get("/works")
@bp.get("/works/")
def works_index():
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        rows = queries.published_works(cur, house["id"])
        entries = []
        for r in rows:
            poster = db.one(
                cur,
                """select id, role, position, seed, width, height, alt from media
                    where item_id = %s and role = 'poster' order by position, id limit 1""",
                (r["id"],),
            )
            entries.append(
                {
                    **serialisers.work_card(r),
                    "poster": serialisers.media_json(poster) if poster else None,
                }
            )
    return render_template(
        "works.html", meta=_meta("Cirrus - Works", "works"), house=house, works=entries
    )


@bp.get("/works/<slug>")
def work_detail(slug):
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        row = db.one(
            cur,
            """select * from items
              where house_id = %s and kind = 'work' and lower(slug) = lower(%s) and published""",
            (house["id"], slug),
        )
        if row is None:
            red = db.one(
                cur,
                """select i.slug from slug_redirects r join items i on i.id = r.item_id
                    where r.house_id = %s and r.kind = 'work'
                      and lower(r.old_slug) = lower(%s)""",
                (house["id"], slug),
            )
            if red:
                return redirect("/works/" + red["slug"], code=301)
            abort(404)
        payload = serialisers.work_full(cur, row, house["id"])
        for m in payload["media"]:
            m["reel_params"] = media.reel_params(m["seed"]) if m["role"] == "reel" else None
    return render_template(
        "work.html",
        meta=_meta(f"Cirrus - {payload['title']}", "works"),
        house=house,
        work=payload,
    )


@bp.get("/talents")
@bp.get("/talents/")
def talents_index():
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        rows = queries.published_talents(cur, house["id"])
        disciplines = queries.discipline_set(cur, house["id"])
        talents = []
        for r in rows:
            poster = db.one(
                cur,
                """select id, role, position, seed, width, height, alt from media
                    where item_id = %s and role = 'poster' order by position, id limit 1""",
                (r["id"],),
            )
            talents.append(
                {
                    **serialisers.talent_card(r),
                    "poster": serialisers.media_json(poster) if poster else None,
                }
            )
    return render_template(
        "talents.html",
        meta=_meta("Cirrus - Talents", "talents"),
        house=house,
        talents=talents,
        disciplines=disciplines,
    )


@bp.get("/talents/<slug>")
def talent_detail(slug):
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
        row = db.one(
            cur,
            """select * from items
              where house_id = %s and kind = 'talent' and lower(slug) = lower(%s) and published""",
            (house["id"], slug),
        )
        if row is None:
            red = db.one(
                cur,
                """select i.slug from slug_redirects r join items i on i.id = r.item_id
                    where r.house_id = %s and r.kind = 'talent'
                      and lower(r.old_slug) = lower(%s)""",
                (house["id"], slug),
            )
            if red:
                return redirect("/talents/" + red["slug"], code=301)
            abort(404)
        payload = serialisers.talent_full(cur, row, house["id"])
        selected = []
        for w in payload["selected_work"]:
            poster = db.one(
                cur,
                """select id, role, position, seed, width, height, alt from media
                    where item_id = %s and role = 'poster' order by position, id limit 1""",
                (w["id"],),
            )
            entry = {
                **w,
                "poster": serialisers.media_json(poster) if poster else None,
            }
            selected.append(entry)
        reel = next((m for m in payload["media"] if m["role"] == "reel"), None)
        if reel:
            reel["reel_params"] = media.reel_params(reel["seed"])
        portrait = next((m for m in payload["media"] if m["role"] == "poster"), None)
    return render_template(
        "talent.html",
        meta=_meta(f"Cirrus - {payload['title']}", "talents"),
        house=house,
        talent=payload,
        selected=selected,
        reel=reel,
        portrait=portrait,
    )


@bp.get("/about")
def about():
    with db.tx(readonly=True) as cur:
        house = served_house(cur)
    return render_template("about.html", meta=_meta("Cirrus - About", "about"), house=house)


@bp.get("/signup")
def signup():
    return render_template("signup.html", meta=_meta("Cirrus - Sign up", "entry"))


@bp.get("/studio/login")
def studio_login():
    return render_template("studio_login.html", meta=_meta("Cirrus - Studio", "studio"))


@bp.get("/studio")
def studio():
    with db.tx(readonly=True) as cur:
        account = _studio_view(cur)
        house = (
            db.one(cur, "select * from houses where id = %s", (account["house_id"],))
            if account and account["house_id"]
            else None
        )
    if account is None:
        return redirect("/studio/login", code=302)
    if account["role"] != "producer":
        return redirect("/", code=302)
    return render_template(
        "studio.html",
        meta=_meta("Cirrus - Studio", "studio"),
        account=account,
        house=house,
    )


@bp.get("/studio/talents/new")
@bp.get("/studio/works/new")
def studio_new():
    with db.tx(readonly=True) as cur:
        account = current_account(cur)
        house = (
            db.one(cur, "select * from houses where id = %s", (account["house_id"],))
            if account and account["house_id"]
            else None
        )
    if account is None:
        return redirect("/studio/login", code=302)
    if account["role"] != "producer":
        return redirect("/", code=302)
    kind = "talent" if request.path.endswith("talents/new") else "work"
    return render_template(
        "studio_form.html",
        meta=_meta("Cirrus - Studio", "studio"),
        account=account,
        house=house,
        kind=kind,
        item=None,
    )


@bp.get("/studio/items/<int:item_id>")
def studio_edit(item_id):
    with db.tx(readonly=True) as cur:
        account = current_account(cur)
        if account is None:
            return redirect("/studio/login", code=302)
        if account["role"] != "producer":
            return redirect("/", code=302)
        row = db.one(
            cur,
            "select * from items where id = %s and house_id = %s",
            (item_id, account["house_id"]),
        )
        if row is None:
            abort(404)
        house = db.one(cur, "select * from houses where id = %s", (account["house_id"],))
        payload = serialisers.item_studio(row)
        media_rows = queries.item_media(cur, row["id"])
        credit_rows = queries.item_credits(cur, row["id"])
        payload["media"] = [serialisers.media_json(m) for m in media_rows]
        payload["credits"] = [serialisers.credit_json(c) for c in credit_rows]
    return render_template(
        "studio_form.html",
        meta=_meta("Cirrus - Studio", "studio"),
        account=account,
        house=house,
        kind=row["kind"],
        item=payload,
    )


@bp.get("/studio/items/<int:item_id>/published")
def studio_published(item_id):
    with db.tx(readonly=True) as cur:
        account = current_account(cur)
        if account is None:
            return redirect("/studio/login", code=302)
        if account["role"] != "producer":
            return redirect("/", code=302)
        row = db.one(
            cur,
            "select * from items where id = %s and house_id = %s and published",
            (item_id, account["house_id"]),
        )
        if row is None:
            abort(404)
        house = db.one(cur, "select * from houses where id = %s", (account["house_id"],))
    if row["kind"] == "work":
        ordinals = queries.published_works(cur, account["house_id"])
        ordinal = next((w["ordinal"] for w in ordinals if w["id"] == row["id"]), None)
        suffix = f"ordinal {ordinal}"
        public = f"/works/{row['slug']}"
    else:
        suffix = f"discipline {row['discipline']}"
        public = f"/talents/{row['slug']}"
    return render_template(
        "studio_published.html",
        meta=_meta("Cirrus - Studio", "studio"),
        account=account,
        house=house,
        item=serialisers.item_studio(row),
        ordinal_or_discipline=suffix,
        public_path=public,
    )



@bp.get("/preview/<token>")
def preview(token):
    token = (token or "").lower()
    if len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        abort(404)
    with db.tx(readonly=True) as cur:
        account = current_account(cur)
        tok = db.one(
            cur,
            """select t.*, i.house_id from preview_tokens t join items i on i.id = t.item_id
                where t.token = %s""",
            (token,),
        )
        allowed = (
            tok is not None
            and account is not None
            and account["role"] == "producer"
            and account["house_id"] == tok["house_id"]
            and tok["expires_at"] > dt.datetime.now(dt.timezone.utc)
        )
        if not allowed:
            abort(404)
        row = db.one(cur, "select * from items where id = %s", (tok["item_id"],))
        if row is None:
            abort(404)
        if row["kind"] == "work":
            published = queries.published_works(cur, account["house_id"])
            ordinal = next(
                (w["ordinal"] for w in published if w["id"] == row["id"]), None
            )
            row["ordinal"] = ordinal
            payload = serialisers.work_full(cur, row, account["house_id"])
            payload["ordinal"] = ordinal
            template = "work.html"
        else:
            payload = serialisers.talent_full(cur, row, account["house_id"])
            template = "talent.html"
        selected = []
        for w in payload.get("selected_work", []):
            poster = db.one(
                cur,
                """select id, role, position, seed, width, height, alt from media
                    where item_id = %s and role = 'poster' order by position, id limit 1""",
                (w["id"],),
            )
            selected.append({**w, "poster": serialisers.media_json(poster) if poster else None})
        for m in payload["media"]:
            m["reel_params"] = media.reel_params(m["seed"]) if m["role"] == "reel" else None
        portrait = next((m for m in payload["media"] if m["role"] == "poster"), None)
        reel = next((m for m in payload["media"] if m["role"] == "reel"), None)
        house = served_house(cur)
    return render_template(
        template,
        meta=_meta("Cirrus - Preview", "preview", indexable=False),
        house=house,
        work=payload if row["kind"] == "work" else None,
        talent=payload if row["kind"] == "talent" else None,
        selected=selected,
        reel=reel,
        portrait=portrait,
        preview=True,
    )
