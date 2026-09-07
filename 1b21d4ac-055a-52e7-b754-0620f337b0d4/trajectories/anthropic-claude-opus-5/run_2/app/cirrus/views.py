"""The Jinja routes. The browser receives a complete document on first paint."""
from __future__ import annotations

import os

from flask import (Blueprint, Response, abort, g, redirect, render_template,
                   request, url_for)

from . import repo
from .auth import account_from_request, current_producer
from .pixels import grain_tile_png, share_image_svg, still_stops

bp = Blueprint("views", __name__)

DESCRIPTION = "A production house for picture and its makers."

# The entry cluster's positions are authored, not random, and stable across
# loads: percentages of the window, dense toward the centre, four corners empty
# and the exact centre clear for the mark.
CLUSTER = [
    (12.0, 20.0, 214), (25.5, 11.0, 168), (39.0, 24.0, 262), (55.0, 13.0, 196),
    (70.0, 21.0, 238), (83.0, 32.0, 172), (17.0, 42.0, 286), (31.5, 55.0, 230),
    (46.0, 45.0, 330), (62.0, 57.0, 246), (76.5, 47.0, 300), (88.0, 62.0, 158),
    (9.5, 66.0, 190), (23.0, 79.0, 252), (37.5, 71.0, 176), (52.0, 82.0, 222),
    (66.0, 74.0, 268), (80.0, 84.0, 184), (44.0, 33.0, 152), (58.5, 68.0, 164),
]

CLUSTER_DEPTH = [3, 1, 5, 2, 4, 1, 5, 3, 5, 4, 5, 1, 2, 4, 2, 3, 4, 2, 3, 3]


def house():
    h = repo.served_house()
    if not h:
        abort(503)
    return h


_GRAIN_CACHE: dict[str, bytes] = {}


def _grain_png() -> bytes:
    """Generated once per process and reused, never per element."""
    if "png" not in _GRAIN_CACHE:
        _GRAIN_CACHE["png"] = grain_tile_png()
    return _GRAIN_CACHE["png"]


@bp.app_context_processor
def inject_globals():
    h = repo.served_house()
    account = account_from_request()
    return {
        "house": h,
        "site_description": DESCRIPTION,
        "account": account,
        "is_producer": bool(account and account["role"] == "producer" and account["house_id"]),
        "public_url": os.environ.get("APP_PUBLIC_URL", ""),
        "still_stops": still_stops,
    }


def render_route(template: str, *, mark: str, title: str, **ctx):
    return render_template(template, mark=mark, page_title=title, **ctx)


# --------------------------------------------------------------------------
# public routes

@bp.get("/")
def entry():
    h = house()
    works = repo.public_works(h["id"])
    stills = []
    for i, (left, top, size) in enumerate(CLUSTER):
        if not works:
            break
        work = works[i % len(works)]
        stills.append({
            "work": work,
            "left": left,
            "top": top,
            "size": size,
            "depth": CLUSTER_DEPTH[i],
        })
    return render_route("entry.html", mark="entry", title=h["name"],
                        stills=stills, works=works)


@bp.get("/works")
def works_index():
    h = house()
    works = repo.public_works(h["id"])
    return render_route("works.html", mark="works",
                        title=f"{h['name']} - Works", works=works)


@bp.get("/works/<slug>")
def work_detail(slug):
    h = house()
    detail, redirected = repo.work_detail(h["id"], slug)
    if not detail:
        abort(404)
    if redirected and redirected != slug:
        return redirect(url_for("views.work_detail", slug=redirected), code=301)
    return render_route("work_detail.html", mark="works",
                        title=f"{h['name']} - {detail['title']}", work=detail)


@bp.get("/talents")
def talents_index():
    h = house()
    talents = repo.public_talents(h["id"])
    disciplines = repo.disciplines(h["id"])
    return render_route("talents.html", mark="talents",
                        title=f"{h['name']} - Talents",
                        talents=talents, disciplines=disciplines)


@bp.get("/talents/<slug>")
def talent_detail(slug):
    h = house()
    detail, redirected = repo.talent_detail(h["id"], slug)
    if not detail:
        abort(404)
    if redirected and redirected != slug:
        return redirect(url_for("views.talent_detail", slug=redirected), code=301)
    return render_route("talent_detail.html", mark="talents",
                        title=f"{h['name']} - {detail['title']}", talent=detail)


@bp.get("/about")
def about():
    h = house()
    return render_route("about.html", mark="about", title=f"{h['name']} - About")


@bp.get("/signup")
def signup():
    h = house()
    return render_route("signup.html", mark="entry", title=f"{h['name']} - Sign up")


@bp.get("/grain.png")
def grain():
    """One tile, generated once and repeated, rather than inlined into every
    document or drawn per element."""
    resp = Response(_grain_png(), mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=86400, immutable"
    return resp


@bp.get("/share-image.svg")
def share_image():
    h = house()
    resp = Response(share_image_svg(h["name"]), mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp


@bp.get("/robots.txt")
def robots():
    return Response("User-agent: *\nDisallow: /preview/\nDisallow: /studio\n",
                    mimetype="text/plain")


# --------------------------------------------------------------------------
# studio routes

@bp.get("/studio/login")
def studio_login():
    h = house()
    return render_route("studio/login.html", mark="entry",
                        title=f"{h['name']} - Studio", next_url=request.args.get("next", "/studio"))


def _producer_or_redirect():
    """A visitor lands on the login route; a signed-in viewer is refused and
    sees the entry route, with no studio control drawn for them."""
    account = account_from_request()
    if account is None:
        return None, redirect(url_for("views.studio_login", next=request.path))
    if account["role"] != "producer" or not account["house_id"]:
        return None, redirect(url_for("views.entry"))
    return account, None


@bp.get("/studio")
def studio():
    h = house()
    producer, bounce = _producer_or_redirect()
    if bounce:
        return bounce
    items = repo.studio_items(producer["house_id"])
    return render_route("studio/palette.html", mark="entry",
                        title=f"{h['name']} - Studio", items=items,
                        producer=producer)


@bp.get("/studio/<kind>/new")
def studio_new(kind):
    if kind not in ("talents", "works"):
        abort(404)
    h = house()
    producer, bounce = _producer_or_redirect()
    if bounce:
        return bounce
    return render_route("studio/edit.html", mark="entry",
                        title=f"{h['name']} - New {kind[:-1]}",
                        item=None, kind=kind[:-1], producer=producer,
                        talents=repo.studio_items(producer["house_id"], "talent"))


@bp.get("/studio/items/<int:item_id>")
def studio_edit(item_id):
    h = house()
    producer, bounce = _producer_or_redirect()
    if bounce:
        return bounce
    item = repo.studio_item(producer["house_id"], item_id)
    if not item:
        abort(404)
    return render_route("studio/edit.html", mark="entry",
                        title=f"{h['name']} - {item['title']}",
                        item=item, kind=item["kind"], producer=producer,
                        talents=repo.studio_items(producer["house_id"], "talent"))


@bp.get("/studio/items/<int:item_id>/published")
def studio_published(item_id):
    h = house()
    producer, bounce = _producer_or_redirect()
    if bounce:
        return bounce
    item = repo.studio_item(producer["house_id"], item_id)
    if not item:
        abort(404)
    public_path = ("/works/" if item["kind"] == "work" else "/talents/") + item["slug"]
    return render_route("studio/published.html", mark="entry",
                        title=f"{h['name']} - Published", item=item,
                        public_path=public_path, producer=producer)


@bp.get("/preview/<token>")
def preview(token):
    """Renders an unlisted record through the published route's own components.
    Without a producer session it renders nothing and reveals nothing."""
    h = house()
    producer = current_producer()
    row = repo.preview_token_row(token) if producer else None
    if not producer or not row or row["house_id"] != producer["house_id"]:
        resp = Response(render_template("not_found.html", mark="entry",
                                        page_title=f"{h['name']}"), status=404)
        resp.headers["X-Robots-Tag"] = "noindex, nofollow"
        resp.headers["Cache-Control"] = "no-store, private"
        return resp
    item = repo.item_row(producer["house_id"], row["item_id"])
    if item["kind"] == "work":
        detail, _ = repo.work_detail(producer["house_id"], item["slug"], published_only=False)
        template = "preview.html"
    else:
        detail, _ = repo.talent_detail(producer["house_id"], item["slug"], published_only=False)
        template = "preview.html"
    resp = Response(render_template(
        template, mark="works" if item["kind"] == "work" else "talents",
        page_title=f"{h['name']} - Preview", record=detail, kind=item["kind"]))
    resp.headers["Cache-Control"] = "no-store, private, max-age=0"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp


# --------------------------------------------------------------------------
# not found: the site's own surface, the path never echoed back

@bp.app_errorhandler(404)
def not_found(_err):
    h = repo.served_house()
    resp = Response(render_template("not_found.html", mark="entry",
                                    page_title=f"{h['name'] if h else 'Cirrus'}"),
                    status=404)
    resp.headers["X-Robots-Tag"] = "noindex"
    return resp


@bp.app_errorhandler(405)
def method_not_allowed(_err):
    return not_found(_err)
