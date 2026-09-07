"""Server-rendered routes. The browser receives a complete document on first paint."""
from flask import (Blueprint, abort, current_app, make_response, redirect,
                   render_template, request, url_for)

from . import auth, generator, repo
from .repo import NotFound

pages = Blueprint("pages", __name__)

DESCRIPTION = "A production house for picture and its makers."


def house():
    return current_app.served_house()


def base_context(route, title, mark="entry", **extra):
    h = house()
    ctx = {
        "house": h,
        "route": route,
        "page_title": title,
        "description": DESCRIPTION,
        "centre_mark": mark,
        "disciplines": repo.disciplines(h["id"]),
        "account": auth.current_account(),
        "share_image": url_for("pages.share_image", _external=False),
    }
    ctx.update(extra)
    return ctx


def not_found():
    """A real not-found status on the site's own surface, without echoing the path."""
    ctx = base_context("not-found", f"{house()['name']} - Not found", "entry",
                       noindex=True)
    return make_response(render_template("not_found.html", **ctx), 404)


@pages.app_errorhandler(404)
def handle_404(_exc):
    if request.path.startswith("/api/"):
        return {"error": "That address is not here."}, 404
    return not_found()


@pages.app_errorhandler(405)
def handle_405(_exc):
    if request.path.startswith("/api/"):
        return {"error": "That method is not allowed here."}, 405
    return not_found()


# ------------------------------------------------------------------ public --

@pages.get("/")
def entry():
    h = house()
    works = repo.works_index(h["id"])
    ctx = base_context("entry", h["name"], "entry", works=works,
                       cluster=cluster_layout(works))
    return render_template("entry.html", **ctx)


CLUSTER_POSITIONS = [
    # Authored, not random: x%, y%, long edge in px, depth order.
    (12.0, 18.0, 210, 1), (25.5, 9.5, 168, 2), (37.0, 24.0, 264, 5),
    (50.0, 12.0, 190, 3), (63.5, 21.0, 246, 4), (76.0, 12.5, 172, 2),
    (86.5, 26.0, 200, 1), (9.5, 44.0, 236, 3), (22.0, 58.5, 178, 2),
    (33.5, 44.5, 300, 6), (44.0, 68.0, 224, 5), (56.5, 62.0, 330, 7),
    (66.5, 45.0, 258, 4), (79.5, 55.5, 196, 3), (90.0, 42.0, 156, 1),
    (17.0, 76.0, 204, 2), (30.0, 88.0, 162, 1), (49.5, 86.5, 240, 4),
    (69.0, 82.0, 214, 3), (84.0, 72.5, 150, 2),
]


def cluster_layout(works):
    """Roughly twenty stills, dense toward the centre, corners empty, exact
    centre clear for the mark. Positions are authored and the overlap order is
    stable across loads."""
    if not works:
        return []
    out = []
    for i, (x, y, size, depth) in enumerate(CLUSTER_POSITIONS):
        work = works[i % len(works)]
        poster = work.get("poster")
        ratio = (poster["width"] / poster["height"]) if poster else 1.5
        width = size if ratio >= 1 else round(size * ratio)
        height = round(width / ratio) if ratio else size
        out.append({"work": work, "x": x, "y": y, "width": width, "height": height,
                    "depth": depth, "ordinal": work["ordinal"]})
    return out


@pages.get("/works")
@pages.get("/works/")
def works_index():
    h = house()
    works = repo.works_index(h["id"])
    ctx = base_context("works", f"{h['name']} - Works", "works", works=works)
    return render_template("works.html", **ctx)


@pages.get("/works/<slug>")
def work_detail(slug):
    h = house()
    data, canonical = repo.work_detail(h["id"], slug)
    if not data:
        return not_found()
    if canonical:
        return redirect(f"/works/{canonical}", code=301)
    ctx = base_context("works", f"{h['name']} - {data['title']}", "works", work=data)
    return render_template("work_detail.html", **ctx)


@pages.get("/talents")
@pages.get("/talents/")
def talents_roster():
    h = house()
    roster = repo.talents_roster(h["id"])
    ctx = base_context("talents", f"{h['name']} - Talents", "talents", roster=roster)
    return render_template("talents.html", **ctx)


@pages.get("/talents/<slug>")
def talent_detail(slug):
    h = house()
    data, canonical = repo.talent_detail(h["id"], slug)
    if not data:
        return not_found()
    if canonical:
        return redirect(f"/talents/{canonical}", code=301)
    ctx = base_context("talents", f"{h['name']} - {data['title']}", "talents",
                       talent=data)
    return render_template("talent_detail.html", **ctx)


@pages.get("/about")
def about():
    h = house()
    ctx = base_context("about", f"{h['name']} - About", "about")
    return render_template("about.html", **ctx)


# ------------------------------------------------------------- account ------

@pages.get("/signup")
def signup():
    ctx = base_context("signup", f"{house()['name']} - Sign up", "entry")
    return render_template("signup.html", **ctx)


@pages.get("/studio/login")
def studio_login():
    ctx = base_context("studio", f"{house()['name']} - Studio", "entry",
                       next_path=request.args.get("next") or "/studio")
    return render_template("studio_login.html", **ctx)


# ------------------------------------------------------------- preview ------

@pages.get("/preview/<token>")
def preview(token):
    """Kept out of every shared cache and out of every index. Without a producer
    session it renders nothing and reveals nothing about what exists."""
    account = auth.current_account()
    ctx = base_context("preview", f"{house()['name']} - Preview", "entry",
                       noindex=True, token=token)
    try:
        row = repo.resolve_preview(account, token)
    except NotFound:
        if not account or account["role"] != "producer":
            # An unsigned caller is sent to sign in, learning nothing.
            return redirect(f"/studio/login?next=/preview/{token}")
        response = make_response(render_template("not_found.html", **ctx), 404)
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response
    h = house()
    medias = repo.media_for([row["id"]]).get(row["id"], [])
    if row["kind"] == "work":
        record = repo.work_json(row, medias, ordinal=None,
                                credits=repo.credits_for_work(row["id"], row["house_id"]))
    else:
        record = repo.talent_json(
            row, medias, selected_work=repo.selected_work_for_talent(row["id"], h["id"]))
    ctx["record"] = record
    ctx["page_title"] = f"{h['name']} - Preview - {record['title']}"
    response = make_response(render_template("preview.html", **ctx))
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


# -------------------------------------------------------------- studio ------

def studio_guard():
    """A visitor lands on the login route; a signed-in viewer is refused and sees
    the entry route."""
    account = auth.current_account()
    if not account:
        return None, redirect(f"/studio/login?next={request.path}")
    if account["role"] != "producer" or not account["house_id"]:
        return account, redirect("/")
    return account, None


@pages.get("/studio")
@pages.get("/studio/")
def studio():
    account, bounce = studio_guard()
    if bounce:
        return bounce
    ctx = base_context("studio", f"{house()['name']} - Studio", "entry",
                       noindex=True)
    return render_template("studio.html", **ctx)


@pages.get("/studio/talents/new")
@pages.get("/studio/works/new")
def studio_new():
    account, bounce = studio_guard()
    if bounce:
        return bounce
    kind = "talent" if "/talents/" in request.path else "work"
    ctx = base_context("studio", f"{house()['name']} - New {kind}", "entry",
                       noindex=True, kind=kind, item=None)
    return render_template("studio_form.html", **ctx)


@pages.get("/studio/items/<item_id>")
def studio_item(item_id):
    account, bounce = studio_guard()
    if bounce:
        return bounce
    try:
        row = repo.studio_item(account, item_id)
    except NotFound:
        return not_found()
    ctx = base_context("studio", f"{house()['name']} - {row['title']}", "entry",
                       noindex=True, kind=row["kind"],
                       item=repo.studio_item_json(row))
    return render_template("studio_form.html", **ctx)


@pages.get("/studio/items/<item_id>/published")
def studio_published(item_id):
    account, bounce = studio_guard()
    if bounce:
        return bounce
    try:
        row = repo.studio_item(account, item_id)
    except NotFound:
        return not_found()
    data = repo.studio_item_json(row)
    ordinal = None
    if row["kind"] == "work" and row["published"]:
        for w in repo.works_index(row["house_id"]):
            if w["id"] == row["id"]:
                ordinal = w["ordinal"]
    ctx = base_context("studio", f"{house()['name']} - Published", "entry",
                       noindex=True, item=data, ordinal=ordinal)
    return render_template("studio_published.html", **ctx)


# ------------------------------------------------------------- generated ----

@pages.get("/share.svg")
def share_image():
    svg = generator.share_svg(house()["name"])
    response = current_app.response_class(svg, mimetype="image/svg+xml")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@pages.get("/grain.svg")
def grain_tile():
    response = current_app.response_class(generator.GRAIN_TILE,
                                          mimetype="image/svg+xml")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@pages.get("/robots.txt")
def robots():
    body = "User-agent: *\nDisallow: /preview/\nDisallow: /studio\n"
    return current_app.response_class(body, mimetype="text/plain")
