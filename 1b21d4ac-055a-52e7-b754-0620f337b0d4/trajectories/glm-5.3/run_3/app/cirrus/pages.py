"""Server-rendered pages. The browser receives a complete document on first
paint; Alpine.js enhances it in place."""
import os
from datetime import datetime, timezone

from flask import (Blueprint, abort, make_response, redirect, render_template,
                   request, url_for)

from . import auth, db, repo

pages = Blueprint("pages", __name__)

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

META_DESCRIPTION = "A production house for picture and its makers."
SHARE_IMAGE = "/share.jpg"


def _view(template, title, **ctx):
    acct = auth.current_account()
    house = None
    if acct and acct["role"] == "producer":
        house = db.pool.query_one("SELECT id, slug, name FROM houses WHERE id = %s", (acct["house_id"],))
    resp = make_response(render_template(
        template,
        title=title,
        description=META_DESCRIPTION,
        share_image=SHARE_IMAGE,
        account=acct,
        house=house,
        route_name=ctx.pop("route_name", ""),
        **ctx,
    ))
    if template.startswith("studio/") or template == "preview.html":
        resp.headers["Cache-Control"] = "private, no-store"
    else:
        resp.headers["Cache-Control"] = "public, max-age=60"
    return resp


def _producer():
    """The signed-in producer, or None."""
    acct = auth.current_account()
    if acct and acct["role"] == "producer" and acct["house_id"]:
        return acct
    return None


@pages.get("/")
def entry():
    works = repo.published_works()
    stills = []
    for w in works:
        for m in repo.media_for(w["id"]):
            if m["role"] in ("poster", "gallery"):
                stills.append({"id": m["id"], "width": m["width"], "height": m["height"],
                               "alt": m["alt"], "slug": w["slug"], "title": w["title"],
                               "ordinal": w.get("ordinal")})
    stills = stills[:20]
    return _view("entry.html", "Cirrus", route_name="entry", works=works, stills=stills)


@pages.get("/works")
@pages.get("/works/")
def works_index():
    works = repo.published_works()
    posters = {w["id"]: next((m for m in repo.media_for(w["id"]) if m["role"] == "poster"), None) for w in works}
    for w in works:
        w["poster_media"] = [posters[w["id"]]] if posters[w["id"]] else []
    return _view("works.html", "Cirrus - Works", route_name="works", works=works)


@pages.get("/works/<slug>")
def work_detail(slug):
    row, new_slug = repo.resolve_slug(repo.SERVED_HOUSE, "work", slug)
    if not row:
        abort(404)
    if new_slug and new_slug != slug:
        return redirect("/works/%s" % new_slug, code=301)
    rows = repo.published_works()
    idx = next(i for i, r in enumerate(rows) if r["id"] == row["id"])
    prev = rows[idx - 1]
    nxt = rows[(idx + 1) % len(rows)]
    media_rows = repo.media_for(row["id"])
    credits = repo.credits_for(row["id"])
    gallery = [m for m in media_rows if m["role"] == "gallery"] or [m for m in media_rows if m["role"] == "poster"]
    reel = next((m for m in media_rows if m["role"] == "reel"), None)
    poster = next((m for m in media_rows if m["role"] == "poster"), None)
    ordinal = "%03d" % (idx + 1)
    return _view("work.html", "Cirrus - %s" % row["title"], route_name="work", work=row,
                 ordinal=ordinal, media=media_rows, gallery=gallery, reel=reel, poster=poster,
                 credits=credits, prev=prev, nxt=nxt)


@pages.get("/talents")
@pages.get("/talents/")
def talents():
    talents = repo.published_talents()
    disciplines = repo.discipline_set()
    if disciplines and not request.args.get("discipline"):
        active = disciplines[0]
    else:
        active = request.args.get("discipline") or (disciplines[0] if disciplines else "")
    poster_by_id = {}
    for t in talents:
        m = next((x for x in repo.media_for(t["id"]) if x["role"] == "poster"), None)
        poster_by_id[t["id"]] = m
    payload = [{
        "id": t["id"], "slug": t["slug"], "title": t["title"], "discipline": t["discipline"],
        "ordinal": t.get("ordinal"),
        "poster_id": poster_by_id[t["id"]]["id"] if poster_by_id[t["id"]] else "",
        "alt": poster_by_id[t["id"]]["alt"] if poster_by_id[t["id"]] else t["title"],
    } for t in talents]
    import json as _json
    return _view("talents.html", "Cirrus - Talents", route_name="talents", talents=talents,
                 disciplines=disciplines, active_discipline=active,
                 talents_json=_json.dumps(payload), disciplines_json=_json.dumps(disciplines),
                 poster_by_slug={t["slug"]: (poster_by_id[t["id"]]["id"] if poster_by_id[t["id"]] else "") for t in talents})


@pages.get("/talents/<slug>")
def talent_detail(slug):
    row, new_slug = repo.resolve_slug(repo.SERVED_HOUSE, "talent", slug)
    if not row:
        abort(404)
    if new_slug and new_slug != slug:
        return redirect("/talents/%s" % new_slug, code=301)
    media_rows = repo.media_for(row["id"])
    selected = repo.selected_works(row["id"])
    selected_media = {w["id"]: [m for m in repo.media_for(w["id"]) if m["role"] == "poster"] for w in selected}
    return _view("talent.html", "Cirrus - %s" % row["title"], route_name="talent", talent=row,
                 media=media_rows, selected=selected, selected_media=selected_media)


@pages.get("/about")
def about():
    return _view("about.html", "Cirrus - About", route_name="about")


@pages.get("/signup")
def signup():
    return _view("signup.html", "Cirrus - Sign up", route_name="signup")


@pages.get("/studio/login")
def studio_login():
    acct = auth.current_account()
    if acct and acct["role"] == "producer":
        return redirect("/studio")
    if acct and acct["role"] == "viewer":
        return redirect("/")
    return _view("studio/login.html", "Cirrus - Studio", route_name="studio")


def _guard():
    """Studio pages: a producer of the house proceeds, a viewer is refused to
    the entry route, a stranger is sent to sign in."""
    acct = auth.current_account()
    if not acct:
        return None, redirect("/studio/login")
    if acct["role"] != "producer" or not acct["house_id"]:
        return None, redirect("/")
    return acct, None


@pages.get("/studio")
def studio():
    acct, bounce = _guard()
    if bounce:
        return bounce
    items = db.pool.query(
        """
        SELECT id, kind, slug, title, position, discipline, variant, published, published_at, created_at
        FROM items WHERE house_id = %s
        ORDER BY kind ASC, position ASC, created_at ASC, id ASC
        """,
        (acct["house_id"],),
    )
    return _view("studio/palette.html", "Cirrus - Studio", route_name="studio", items=items)


@pages.get("/studio/talents/new")
@pages.get("/studio/works/new")
def studio_new():
    acct, bounce = _guard()
    if bounce:
        return bounce
    kind = "talent" if request.path.endswith("/talents/new") else "work"
    talents = db.pool.query(
        "SELECT id, slug, title FROM items WHERE house_id = %s AND kind = 'talent' ORDER BY position",
        (acct["house_id"],),
    )
    return _view("studio/new.html", "Cirrus - Studio", route_name="studio", kind=kind, item=None,
                 talents=talents, item_json="null")


@pages.get("/studio/items/<item_id>")
def studio_edit(item_id):
    acct, bounce = _guard()
    if bounce:
        return bounce
    row = repo.item_by_id(item_id, acct["house_id"])
    if not row:
        abort(404)
    from .renderers import studio_payload
    payload = studio_payload(row, repo.media_for(row["id"]), repo.credits_for(row["id"]))
    import json as _json
    talents = db.pool.query(
        "SELECT id, slug, title FROM items WHERE house_id = %s AND kind = 'talent' ORDER BY position",
        (acct["house_id"],),
    )
    return _view("studio/edit.html", "Cirrus - Studio", route_name="studio", kind=row["kind"],
                 item=row, item_json=_json.dumps(payload), talents=talents)


@pages.get("/studio/items/<item_id>/published")
def studio_published(item_id):
    acct, bounce = _guard()
    if bounce:
        return bounce
    row = repo.item_by_id(item_id, acct["house_id"])
    if not row or not row["published"]:
        abort(404)
    ordinal = None
    if row["kind"] == "work":
        rows = repo.published_works(acct["house_id"])
        for i, r in enumerate(rows):
            if r["id"] == row["id"]:
                ordinal = "%03d" % (i + 1)
                break
    public_path = ("/works/%s" if row["kind"] == "work" else "/talents/%s") % row["slug"]
    return _view("studio/published.html", "Cirrus - Studio", route_name="studio", item=row,
                 ordinal=ordinal, public_path=public_path)


@pages.get("/preview/<token>")
def preview(token):
    """One unlisted record, seen through the published route's own components,
    by that record's own house producer and nobody else."""
    row = db.pool.query_one(
        """
        SELECT p.item_id, p.expires_at, i.house_id
        FROM preview_tokens p JOIN items i ON i.id = p.item_id
        WHERE p.token = %s
        """,
        (token,),
    )
    now = datetime.now(timezone.utc)
    if not row or row["expires_at"] < now:
        abort(404)
    acct = auth.current_account()
    if not acct or acct["role"] != "producer" or acct.get("house_id") != row["house_id"]:
        abort(404)
    item = repo.item_by_id(row["item_id"], row["house_id"])
    if not item:
        abort(404)
    media_rows = repo.media_for(item["id"])
    credits = repo.credits_for(item["id"])
    if item["kind"] == "work":
        rows = [r for r in repo.published_works(row["house_id"])] or []
        idx = None
        for i, r in enumerate(rows):
            if r["id"] == item["id"]:
                idx = i
        # An unlisted work previews with the ordinal it would carry if published.
        ordinal = "%03d" % ((idx + 1) if idx is not None else len(rows) + 1)
        gallery = [m for m in media_rows if m["role"] == "gallery"] or [m for m in media_rows if m["role"] == "poster"]
        reel = next((m for m in media_rows if m["role"] == "reel"), None)
        poster = next((m for m in media_rows if m["role"] == "poster"), None)
        prev = rows[idx - 1] if idx is not None and rows else None
        nxt = rows[(idx + 1) % len(rows)] if idx is not None and rows else None
        return _view("preview.html", "Cirrus - Preview", route_name="preview", item=item,
                     body_template="partials/_work_body.html", ordinal=ordinal, work=item,
                     media=media_rows, gallery=gallery, reel=reel, poster=poster,
                     credits=credits, prev=prev, nxt=nxt, selected=[], selected_media={})
    talents = repo.published_talents(row["house_id"])
    selected = repo.selected_works(item["id"], row["house_id"])
    selected_media = {w["id"]: [m for m in repo.media_for(w["id"]) if m["role"] == "poster"] for w in selected}
    return _view("preview.html", "Cirrus - Preview", route_name="preview", item=item,
                 body_template="partials/_talent_body.html", ordinal=None, talent=item,
                 media=media_rows, selected=selected, selected_media=selected_media,
                 credits=[], prev=None, nxt=None)
