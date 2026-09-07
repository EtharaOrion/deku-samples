"""The Jinja routes. Every one arrives at the browser as a complete document."""
from __future__ import annotations

from flask import (
    Blueprint,
    Response,
    current_app,
    make_response,
    redirect,
    render_template,
    request,
)

from . import api, auth, db, media as media_gen, repo

bp = Blueprint("pages", __name__)

DESCRIPTION = "A production house for picture and its makers."


def house():
    return api.served_house()


def base_context(route: str, title: str, mark: str = "entry", **extra):
    h = house()
    ctx = {
        "house": h,
        "route": route,
        "page_title": title,
        "description": DESCRIPTION,
        "mark": mark,
        "disciplines": repo.disciplines(h["id"]),
        "account": auth.current_account(),
        "public_url": current_app.config.get("PUBLIC_URL", ""),
    }
    ctx.update(extra)
    return ctx


def not_found_page():
    ctx = base_context("not-found", "Cirrus - Not found", "entry", indexable=False)
    return make_response(render_template("not_found.html", **ctx), 404)


@bp.app_errorhandler(404)
def handle_404(_err):
    if request.path.startswith("/api/"):
        return api.not_found()
    return not_found_page()


@bp.app_errorhandler(405)
def handle_405(_err):
    if request.path.startswith("/api/"):
        return api.fail(405, "That method is not allowed here.")
    return not_found_page()


# --------------------------------------------------------------------------- public


@bp.get("/")
def entry():
    h = house()
    works = repo.works_index(h["id"])
    cluster = build_cluster(works)
    ctx = base_context("entry", "Cirrus", "entry", works=works, cluster=cluster)
    return render_template("entry.html", **ctx)


CLUSTER_POSITIONS = [
    # Authored, never random: x%, y%, long edge in px, depth. Corners empty, centre clear.
    (8.0, 12.0, 210, 1), (20.5, 30.0, 260, 2), (14.0, 58.0, 190, 1),
    (26.0, 71.0, 230, 3), (33.5, 16.0, 180, 2), (37.0, 47.0, 300, 4),
    (44.0, 76.0, 250, 3), (52.0, 20.0, 330, 5), (58.0, 62.0, 275, 4),
    (66.5, 34.0, 205, 2), (72.0, 68.0, 240, 3), (79.0, 22.0, 185, 1),
    (85.0, 52.0, 215, 2), (30.5, 41.0, 165, 1), (48.5, 58.5, 195, 2),
    (62.0, 12.5, 175, 1), (76.5, 44.0, 155, 1), (41.0, 30.0, 150, 1),
    (55.5, 41.0, 160, 1), (69.0, 55.0, 170, 2),
]


def build_cluster(works: list[dict]) -> list[dict]:
    """Roughly twenty stills, overlapping freely, stable across loads."""
    if not works:
        return []
    out = []
    for n, (x, y, size, depth) in enumerate(CLUSTER_POSITIONS):
        work = works[n % len(works)]
        poster = work.get("poster") or (work.get("media") or [None])[0]
        if not poster:
            continue
        ratio = poster["height"] / poster["width"] if poster["width"] else 0.66
        width = size
        height = round(size * ratio)
        out.append(
            {
                "work": work,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
                "depth": depth,
                "poster": poster,
            }
        )
    return out


@bp.get("/works")
def works_index():
    h = house()
    works = repo.works_index(h["id"])
    ctx = base_context("works", "Cirrus - Works", "works", works=works)
    return render_template("works.html", **ctx)


@bp.get("/works/<slug>")
def work_detail(slug: str):
    h = house()
    item = repo.item_by_slug(h["id"], "work", slug)
    if not item or not item["published"]:
        target = repo.redirect_for(h["id"], "work", slug)
        if target and target.lower() != slug.lower():
            return redirect(f"/works/{target}", code=301)
        return not_found_page()
    work = repo.work_detail(h["id"], item)
    ctx = base_context("works", f"Cirrus - {work['title']}", "works", work=work)
    return render_template("work_detail.html", **ctx)


@bp.get("/talents")
def talents_roster():
    h = house()
    talents = repo.talents_roster(h["id"])
    ctx = base_context("talents", "Cirrus - Talents", "talents", talents=talents)
    return render_template("talents.html", **ctx)


@bp.get("/talents/<slug>")
def talent_detail(slug: str):
    h = house()
    item = repo.item_by_slug(h["id"], "talent", slug)
    if not item or not item["published"]:
        target = repo.redirect_for(h["id"], "talent", slug)
        if target and target.lower() != slug.lower():
            return redirect(f"/talents/{target}", code=301)
        return not_found_page()
    talent = repo.talent_detail(h["id"], item)
    ctx = base_context("talents", f"Cirrus - {talent['title']}", "talents", talent=talent)
    return render_template("talent_detail.html", **ctx)


@bp.get("/about")
def about():
    ctx = base_context("about", "Cirrus - About", "about")
    return render_template("about.html", **ctx)


@bp.get("/signup")
def signup():
    ctx = base_context("signup", "Cirrus - Sign up", "entry")
    return render_template("signup.html", **ctx)


# --------------------------------------------------------------------------- preview


@bp.get("/preview/<token>")
def preview(token: str):
    item, house_id = api.resolve_preview(token)
    if not item:
        return not_found_page()
    if item["kind"] == "work":
        record = repo.work_detail(house_id, item)
        template = "work_detail.html"
        key = "work"
        mark = "works"
    else:
        record = repo.talent_detail(house_id, item)
        template = "talent_detail.html"
        key = "talent"
        mark = "talents"
    ctx = base_context(
        mark, f"Cirrus - Preview", mark, preview=True, preview_token=token, indexable=False
    )
    ctx[key] = record
    resp = make_response(render_template(template, **ctx))
    resp.headers["Cache-Control"] = "private, no-store, max-age=0"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    return resp


# --------------------------------------------------------------------------- studio


def studio_guard():
    """A visitor lands on the login route; a viewer is refused and sees the entry route."""
    account = auth.current_account()
    if not account:
        return None, redirect("/studio/login?next=" + request.path)
    if not auth.is_producer(account):
        return None, redirect("/")
    return account, None


@bp.get("/studio/login")
def studio_login():
    ctx = base_context("studio", "Cirrus - Studio", "entry", next_path=request.args.get("next", "/studio"))
    return render_template("studio_login.html", **ctx)


@bp.get("/studio")
def studio():
    account, refusal = studio_guard()
    if refusal:
        return refusal
    items = db.query(
        "SELECT * FROM items WHERE house_id=%s ORDER BY kind, position, id",
        (account["house_id"],),
    )
    index = repo.works_index(account["house_id"])
    ordinals = {w["id"]: w["ordinal"] for w in index}
    records = []
    for item in items:
        shaped = repo.shape_item(item, repo.item_media(item["id"]))
        shaped["ordinal_label"] = (
            f"{ordinals[item['id']]:03d}" if item["id"] in ordinals else None
        )
        records.append(shaped)
    ctx = base_context("studio", "Cirrus - Studio", "entry", records=records, account=account)
    return render_template("studio.html", **ctx)


@bp.get("/studio/<kind>/new")
def studio_new(kind: str):
    if kind not in ("talents", "works"):
        return not_found_page()
    account, refusal = studio_guard()
    if refusal:
        return refusal
    ctx = base_context(
        "studio",
        f"Cirrus - New {'talent' if kind == 'talents' else 'work'}",
        "entry",
        kind="talent" if kind == "talents" else "work",
        account=account,
        record=None,
    )
    return render_template("studio_form.html", **ctx)


@bp.get("/studio/items/<item_id>")
def studio_edit(item_id):
    account, refusal = studio_guard()
    if refusal:
        return refusal
    item = api.own_item(account, item_id)
    if not item:
        return not_found_page()
    record = api.studio_shape(item, account["house_id"])
    talents = db.query(
        "SELECT id, title, slug FROM items WHERE house_id=%s AND kind='talent' ORDER BY position",
        (account["house_id"],),
    )
    ctx = base_context(
        "studio",
        f"Cirrus - {record['title']}",
        "entry",
        kind=item["kind"],
        record=record,
        account=account,
        house_talents=talents,
    )
    return render_template("studio_form.html", **ctx)


@bp.get("/studio/items/<item_id>/published")
def studio_published(item_id):
    account, refusal = studio_guard()
    if refusal:
        return refusal
    item = api.own_item(account, item_id)
    if not item:
        return not_found_page()
    record = api.studio_shape(item, account["house_id"])
    ctx = base_context(
        "studio", f"Cirrus - {record['title']}", "entry", record=record, account=account
    )
    return render_template("studio_published.html", **ctx)


# --------------------------------------------------------------------------- assets


@bp.get("/share.png")
def share_image():
    png = media_gen.share_png()
    resp = Response(png, mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@bp.get("/grain.svg")
def grain():
    resp = Response(media_gen.grain_tile_svg(), mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@bp.get("/robots.txt")
def robots():
    body = "User-agent: *\nDisallow: /preview/\nDisallow: /studio\nDisallow: /api/preview/\n"
    return Response(body, mimetype="text/plain")
