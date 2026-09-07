"""Server-rendered routes. The browser receives a complete document on first paint."""
from flask import (Blueprint, Response, abort, g, make_response, redirect,
                   render_template, request, url_for)

from . import auth, config, media as media_gen, repo

bp = Blueprint("site", __name__)

DESCRIPTION = "A production house for picture and its makers."

# The four centre marks, one per route. Each is decorative and hidden from
# assistive technology; each is filled with its own route's contrast token.
CENTRE_MARKS = ("entry", "works", "talents", "about")


def house():
    if "house" not in g:
        g.house = repo.served_house()
        if not g.house:
            abort(503)
    return g.house


def base_context(route, title, mark="entry", **extra):
    ctx = {
        "house": house(),
        "route": route,
        "centre_mark": mark if mark in CENTRE_MARKS else "entry",
        "page_title": title,
        "description": DESCRIPTION,
        "account": auth.current_account(),
        "share_image": url_for("site.share_image", _external=False),
    }
    ctx.update(extra)
    return ctx


def render(template, **ctx):
    return render_template(template, **ctx)


# --------------------------------------------------------------------------
# public routes
# --------------------------------------------------------------------------

@bp.get("/")
def entry():
    works = repo.works_list(house()["id"])
    return render("entry.html", **base_context(
        "entry", "Cirrus", "entry", works=works,
        cluster=cluster_positions(works),
    ))


def cluster_positions(works):
    """Authored positions, stable across loads: dense toward the centre, thinning
    toward the edges, four corners empty and the exact centre clear for the mark."""
    layout = [
        # (left%, top%, long-edge px, z)
        (30.5, 17.0, 232, 3), (55.0, 12.5, 198, 2), (43.0, 27.0, 168, 6),
        (17.5, 30.0, 262, 1), (67.5, 25.5, 246, 4), (36.0, 41.0, 186, 7),
        (58.0, 39.5, 208, 5), (24.0, 49.5, 214, 8), (72.5, 47.0, 176, 3),
        (12.0, 63.0, 190, 2), (33.5, 62.5, 254, 9), (60.5, 60.0, 288, 6),
        (46.5, 74.0, 200, 4), (21.0, 78.5, 172, 5), (69.0, 76.0, 226, 7),
        (49.0, 8.0, 156, 1), (79.0, 62.0, 164, 2), (8.5, 45.0, 178, 4),
        (41.0, 88.0, 150, 3), (63.0, 88.5, 158, 2),
    ]
    out = []
    if not works:
        return out
    for i, (left, top, size, z) in enumerate(layout):
        w = works[i % len(works)]
        out.append({"work": w, "left": left, "top": top, "size": size, "z": z})
    return out


@bp.get("/works")
@bp.get("/works/")
def works_index():
    works = repo.works_list(house()["id"])
    return render("works.html", **base_context(
        "works", "Cirrus - Works", "works", works=works,
        opening_line="Quiet decisions, made early, are the ones you notice last.",
    ))


@bp.get("/works/<slug>")
def work_detail(slug):
    row, redirect_to = repo.resolve_slug(house()["id"], "work", slug)
    if not row or not row["published"]:
        abort(404)
    if redirect_to:
        return redirect(url_for("site.work_detail", slug=redirect_to), code=301)
    work = repo.work_detail(house()["id"], row)
    return render("work_detail.html", **base_context(
        "works", "Cirrus - " + work["title"], "works", work=work,
    ))


@bp.get("/talents")
@bp.get("/talents/")
def talents_index():
    hid = house()["id"]
    talents = repo.talents_list(hid)
    return render("talents.html", **base_context(
        "talents", "Cirrus - Talents", "talents",
        talents=talents, disciplines=repo.disciplines(hid),
    ))


@bp.get("/talents/<slug>")
def talent_detail(slug):
    row, redirect_to = repo.resolve_slug(house()["id"], "talent", slug)
    if not row or not row["published"]:
        abort(404)
    if redirect_to:
        return redirect(url_for("site.talent_detail", slug=redirect_to), code=301)
    talent = repo.talent_detail(house()["id"], row)
    return render("talent_detail.html", **base_context(
        "talents", "Cirrus - " + talent["title"], "talents", talent=talent,
    ))


@bp.get("/about")
def about():
    return render("about.html", **base_context("about", "Cirrus - About", "about"))


@bp.get("/signup")
def signup():
    return render("signup.html", **base_context("", "Cirrus - Sign up", "entry"))


@bp.get("/studio/login")
def studio_login():
    nxt = request.args.get("next") or "/studio"
    if not nxt.startswith("/"):
        nxt = "/studio"
    return render("studio/login.html", **base_context(
        "", "Cirrus - Studio", "entry", next_url=nxt))


# --------------------------------------------------------------------------
# preview
# --------------------------------------------------------------------------

@bp.get("/preview/<token>")
def preview(token):
    """Renders the unlisted record through the published route's own components.
    Without a producer session it renders nothing and reveals nothing."""
    account = auth.current_account()
    row = repo.preview_row(token)
    ok = bool(row and account and account["role"] == "producer"
              and account["house_id"] == row["house_id"])
    if not ok:
        # Answered exactly as a record that does not exist.
        if not account or account["role"] != "producer":
            resp = make_response(render(
                "studio/preview_denied.html",
                **base_context("", "Cirrus - Preview", "entry")), 404)
        else:
            resp = make_response(render(
                "not_found.html", **base_context("", "Cirrus", "entry")), 404)
        resp.headers["X-Robots-Tag"] = "noindex, nofollow"
        resp.headers["Cache-Control"] = "private, no-store"
        return resp
    item = repo.studio_item(account["house_id"], row["item_id"])
    data = repo.item_detail(account["house_id"], item)
    ctx = base_context("", "Cirrus - Preview", "works" if item["kind"] == "work" else "talents",
                       preview=True, kind=item["kind"])
    if item["kind"] == "work":
        ctx["work"] = data
    else:
        ctx["talent"] = data
    resp = make_response(render("preview.html", **ctx))
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


# --------------------------------------------------------------------------
# studio documents
# --------------------------------------------------------------------------

def producer_gate():
    """A visitor asking for /studio lands on /studio/login. A signed-in viewer is
    refused and sees the entry route."""
    account = auth.current_account()
    if not account:
        return None, redirect(url_for("site.studio_login", next=request.path))
    if account["role"] != "producer" or not account["house_id"]:
        return None, redirect(url_for("site.entry"))
    return account, None


@bp.get("/studio")
def studio():
    account, bounce = producer_gate()
    if bounce:
        return bounce
    return render("studio/palette.html", **base_context(
        "", "Cirrus - Studio", "entry",
        items=repo.studio_items(account["house_id"]),
    ))


@bp.get("/studio/talents/new")
def studio_new_talent():
    account, bounce = producer_gate()
    if bounce:
        return bounce
    return render("studio/edit.html", **base_context(
        "", "Cirrus - New talent", "entry", kind="talent", item=None,
        talents=[], disciplines=list(repo.DISCIPLINES),
    ))


@bp.get("/studio/works/new")
def studio_new_work():
    account, bounce = producer_gate()
    if bounce:
        return bounce
    return render("studio/edit.html", **base_context(
        "", "Cirrus - New work", "entry", kind="work", item=None,
        talents=repo.studio_items(account["house_id"], "talent"),
        variants=list(repo.VARIANTS),
    ))


@bp.get("/studio/items/<item_id>")
def studio_edit(item_id):
    account, bounce = producer_gate()
    if bounce:
        return bounce
    row = repo.studio_item(account["house_id"], item_id)
    if not row:
        abort(404)
    return render("studio/edit.html", **base_context(
        "", "Cirrus - " + row["title"], "entry", kind=row["kind"],
        item=repo.studio_item_public(row),
        talents=repo.studio_items(account["house_id"], "talent"),
        disciplines=list(repo.DISCIPLINES), variants=list(repo.VARIANTS),
    ))


@bp.get("/studio/items/<item_id>/published")
def studio_published(item_id):
    account, bounce = producer_gate()
    if bounce:
        return bounce
    row = repo.studio_item(account["house_id"], item_id)
    if not row:
        abort(404)
    data = repo.studio_item_public(row)
    ordinal = None
    if row["kind"] == "work" and row["published"]:
        for w in repo.works_list(account["house_id"]):
            if w["id"] == row["id"]:
                ordinal = w["ordinal"]
                break
    return render("studio/published.html", **base_context(
        "", "Cirrus - Published", "entry", item=data, ordinal=ordinal,
        public_url=(config.PUBLIC_URL or "") + data["url"],
    ))


@bp.get("/studio/reorder")
def studio_reorder():
    account, bounce = producer_gate()
    if bounce:
        return bounce
    return render("studio/reorder.html", **base_context(
        "", "Cirrus - Reorder", "entry",
        items=repo.studio_items(account["house_id"], "work"),
    ))


# --------------------------------------------------------------------------
# generated assets
# --------------------------------------------------------------------------

@bp.get("/share.svg")
def share_image():
    svg = media_gen.share_image_svg(house()["slug"])
    resp = Response(svg, mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@bp.get("/grain.svg")
def grain():
    resp = Response(media_gen.grain_tile_svg(), mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@bp.get("/favicon.ico")
@bp.get("/favicon.svg")
def favicon():
    """Drawn, like every other pixel on this site."""
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" '
        'viewBox="0 0 32 32">'
        '<rect width="32" height="32" fill="#060403"/>'
        '<ellipse cx="16" cy="16" rx="11" ry="5" fill="none" stroke="#e9eae4" '
        'stroke-width="1.5"/>'
        '</svg>'
    )
    resp = Response(svg, mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@bp.get("/robots.txt")
def robots():
    body = "User-agent: *\nDisallow: /preview/\nDisallow: /studio\n"
    return Response(body, mimetype="text/plain")
