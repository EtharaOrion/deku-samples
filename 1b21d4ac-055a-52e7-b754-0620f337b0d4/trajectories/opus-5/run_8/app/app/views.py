"""Server-rendered routes. The browser receives a complete document on first
paint; Alpine enhances the delivered HTML in place."""
import os
import re

from flask import (Blueprint, Response, current_app, g, redirect, render_template,
                   request)

from . import repo
from .auth import current_account
from .db import SERVED_HOUSE, connection
from .generate import grain_tile_svg, share_image_svg, still_svg

bp = Blueprint("site", __name__)

DESCRIPTION = "A production house for picture and its makers."

NAV = [
    {"label": "WORKS", "href": "/works", "route": "works"},
    {"label": "TALENTS", "href": "/talents", "route": "talents"},
    {"label": "CONTACT", "href": None, "route": None},
    {"label": "ABOUT", "href": "/about", "route": "about"},
]


def house():
    if "house" not in g:
        with connection(commit=False) as cur:
            g.house = repo.house_by_slug(cur, SERVED_HOUSE)
    return g.house


def public_base():
    """The house's own address, from the environment and never from the source."""
    return (os.environ.get("APP_PUBLIC_URL") or "").rstrip("/")


def base_context(route, title, **extra):
    account = current_account()
    ctx = {
        "route": route,
        "page_title": title,
        "description": DESCRIPTION,
        "share_image": public_base() + "/share.svg",
        "house": house(),
        "nav": NAV,
        "account": account,
        "is_producer": bool(account and account["role"] == "producer"
                            and account["house_id"]),
        "indexable": True,
        "preview": False,
    }
    ctx.update(extra)
    return ctx


def not_found():
    """A real not-found status on the site's own surface, path never echoed."""
    ctx = base_context("notfound", "Cirrus", indexable=False)
    return render_template("not_found.html", **ctx), 404


@bp.app_errorhandler(404)
def handle_404(_err):
    if request.path.startswith("/api/"):
        return {"error": "Not found."}, 404
    return not_found()


@bp.app_errorhandler(405)
def handle_405(_err):
    if request.path.startswith("/api/"):
        return {"error": "Method not allowed."}, 405
    return not_found()


# ---------------------------------------------------------------- public

@bp.get("/")
def entry():
    with connection(commit=False) as cur:
        works = repo.works_list(cur, house()["id"])
    return render_template(
        "entry.html",
        **base_context("entry", "Cirrus", works=works,
                       cluster=cluster_positions(works)))


CLUSTER = [
    # authored positions: dense toward the centre, corners empty, centre clear
    (12.0, 20.0, 214), (26.5, 11.0, 168), (41.0, 17.5, 236), (58.5, 12.5, 190),
    (73.5, 19.0, 258), (86.0, 30.0, 176), (8.0, 41.0, 246), (22.0, 34.0, 300),
    (36.0, 44.0, 330), (63.0, 40.0, 318), (77.0, 34.5, 288), (90.5, 48.0, 198),
    (14.5, 63.0, 260), (29.0, 71.5, 222), (44.0, 68.0, 306), (60.5, 72.0, 274),
    (74.5, 64.0, 240), (88.0, 70.0, 160), (49.5, 27.0, 204), (50.5, 84.0, 186),
]


def cluster_positions(works):
    """Authored, not random, and stable across loads."""
    out = []
    for i, (x, y, size) in enumerate(CLUSTER):
        if not works:
            break
        work = works[i % len(works)]
        out.append({"work": work, "x": x, "y": y, "size": size, "z": i % 6})
    return out


@bp.get("/works", strict_slashes=False)
def works_index():
    with connection(commit=False) as cur:
        works = repo.works_list(cur, house()["id"])
    return render_template(
        "works.html", **base_context("works", "Cirrus - Works", works=works))


@bp.get("/works/<slug>")
def work_detail(slug):
    with connection(commit=False) as cur:
        row, canonical = repo.resolve_slug(cur, house()["id"], "work", slug)
        if not row or not row["published"]:
            return not_found()
        if canonical:
            return redirect("/works/%s" % canonical, code=301)
        work = repo.work_detail(cur, house()["id"], row)
    return render_template(
        "work_detail.html",
        **base_context("works", "Cirrus - %s" % work["title"], work=work))


@bp.get("/talents", strict_slashes=False)
def talents_roster():
    with connection(commit=False) as cur:
        talents = repo.talents_list(cur, house()["id"])
        disciplines = repo.disciplines_list(cur, house()["id"])
    return render_template(
        "talents.html",
        **base_context("talents", "Cirrus - Talents", talents=talents,
                       disciplines=disciplines))


@bp.get("/talents/<slug>")
def talent_detail(slug):
    with connection(commit=False) as cur:
        row, canonical = repo.resolve_slug(cur, house()["id"], "talent", slug)
        if not row or not row["published"]:
            return not_found()
        if canonical:
            return redirect("/talents/%s" % canonical, code=301)
        talent = repo.talent_detail(cur, house()["id"], row)
    return render_template(
        "talent_detail.html",
        **base_context("talents", "Cirrus - %s" % talent["title"],
                       talent=talent))


@bp.get("/about")
def about():
    return render_template("about.html", **base_context("about", "Cirrus - About"))


@bp.get("/signup")
def signup():
    return render_template("signup.html",
                           **base_context("entry", "Cirrus - Sign up"))


# ---------------------------------------------------------------- generated

@bp.get("/share.svg")
def share_image():
    resp = Response(share_image_svg(house()["name"]), mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@bp.get("/grain.svg")
def grain():
    resp = Response(grain_tile_svg(), mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@bp.get("/favicon.svg")
def favicon():
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
           '<rect width="32" height="32" fill="#060403"/>'
           '<ellipse cx="16" cy="16" rx="11" ry="5" fill="none"'
           ' stroke="#e9eae4" stroke-width="1.5"/></svg>')
    return Response(svg, mimetype="image/svg+xml")


@bp.get("/robots.txt")
def robots():
    return Response("User-agent: *\nDisallow: /preview/\nDisallow: /studio\n",
                    mimetype="text/plain")


# ---------------------------------------------------------------- studio

def studio_gate():
    """A visitor lands on the login route; a viewer is refused and sees the
    entry route. Returns a response to send, or None to continue."""
    account = current_account()
    if not account:
        return redirect("/studio/login?next=" + request.path)
    if account["role"] != "producer" or not account["house_id"]:
        return redirect("/")
    return None


@bp.get("/studio/login")
def studio_login():
    return render_template(
        "studio_login.html",
        **base_context("studio", "Cirrus - Studio", indexable=False,
                       next_path=request.args.get("next") or "/studio"))


@bp.get("/studio", strict_slashes=False)
def studio():
    gate = studio_gate()
    if gate:
        return gate
    account = current_account()
    with connection(commit=False) as cur:
        cur.execute(
            """SELECT * FROM items WHERE house_id=%s
               ORDER BY kind, position, id""", (account["house_id"],))
        items = [repo.studio_item(cur, row) for row in cur.fetchall()]
    return render_template("studio.html",
                           **base_context("studio", "Cirrus - Studio",
                                          indexable=False, items=items))


@bp.get("/studio/<kind>/new")
def studio_new(kind):
    if kind not in ("talents", "works"):
        return not_found()
    gate = studio_gate()
    if gate:
        return gate
    return render_template(
        "studio_edit.html",
        **base_context("studio", "Cirrus - Studio", indexable=False,
                       item=None, item_kind="talent" if kind == "talents" else "work"))


@bp.get("/studio/items/<item_id>")
def studio_edit(item_id):
    gate = studio_gate()
    if gate:
        return gate
    account = current_account()
    with connection(commit=False) as cur:
        row = repo.owned_item(cur, account["house_id"], item_id)
        if not row:
            return not_found()
        item = repo.studio_item(cur, row)
        item["credits"] = repo.credits_for(cur, row["id"], account["house_id"])
    return render_template(
        "studio_edit.html",
        **base_context("studio", "Cirrus - Studio", indexable=False,
                       item=item, item_kind=item["kind"]))


@bp.get("/studio/items/<item_id>/published")
def studio_published(item_id):
    gate = studio_gate()
    if gate:
        return gate
    account = current_account()
    with connection(commit=False) as cur:
        row = repo.owned_item(cur, account["house_id"], item_id)
        if not row:
            return not_found()
        item = repo.studio_item(cur, row)
        item["ordinal"] = repo.public_ordinal_of(cur, account["house_id"], row["id"])
    return render_template(
        "studio_published.html",
        **base_context("studio", "Cirrus - Studio", indexable=False, item=item))


@bp.get("/preview/<token>")
def preview(token):
    """Without a producer session it renders nothing and reveals nothing about
    what exists."""
    account = current_account()
    if not account or account["role"] != "producer" or not account["house_id"]:
        return not_found()
    if not re.fullmatch(r"[0-9a-f]{32}", token or ""):
        return not_found()
    with connection(commit=False) as cur:
        cur.execute(
            """SELECT i.* FROM preview_tokens p JOIN items i ON i.id = p.item_id
               WHERE p.token=%s AND p.expires_at > now() AND i.house_id=%s""",
            (token, account["house_id"]))
        row = cur.fetchone()
        if not row:
            return not_found()
        record = repo.item_detail(cur, row["house_id"], row)
    ctx = base_context("preview", "Cirrus - Preview", indexable=False,
                       preview=True)
    template = "work_detail.html" if row["kind"] == "work" else "talent_detail.html"
    ctx["work" if row["kind"] == "work" else "talent"] = record
    ctx["route"] = "works" if row["kind"] == "work" else "talents"
    resp = Response(render_template(template, **ctx))
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp
