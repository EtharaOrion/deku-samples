"""Server-rendered routes. The browser receives a complete document on first paint.

Every studio surface is guarded here as well as at the API, and the guard is the
server's, not the template's.
"""
from flask import (Blueprint, redirect, render_template, request, url_for)

from . import repo
from .auth import current_account

pages = Blueprint("pages", __name__)

DESCRIPTION = "A production house for picture and its makers."


def public_origin():
    """The house's own address, from the environment and never from the source."""
    import os
    return (os.environ.get("APP_PUBLIC_URL") or "").rstrip("/")


CENTRE_MARKS = {"entry": "entry", "works": "works", "talents": "talents", "about": "about"}


def house():
    return repo.public_house()


def base_context(route, title, mark="entry", indexable=True):
    account = current_account()
    h = house()
    return {
        "house": h,
        "route": route,
        "page_title": title,
        "description": DESCRIPTION,
        "centre_mark": mark,
        "indexable": indexable,
        "share_image_url": public_origin() + "/share.png",
        "account": account,
        "is_producer": bool(account and account["role"] == "producer" and account["house_id"]),
        "contact_email": h["contact_email"] if h else "prod@example.com",
    }


def render_not_found(message="That page is not here."):
    """A real not-found status on the site's own surface, without echoing the path."""
    ctx = base_context("not-found", "Cirrus", "entry", indexable=False)
    ctx["message"] = message
    return render_template("not_found.html", **ctx), 404


@pages.app_errorhandler(404)
def handle_404(_exc):
    if request.path.startswith("/api/"):
        from flask import jsonify
        return jsonify({"error": "Not found."}), 404
    return render_not_found()


@pages.app_errorhandler(405)
def handle_405(_exc):
    if request.path.startswith("/api/"):
        from flask import jsonify
        return jsonify({"error": "That method is not allowed here."}), 405
    return render_not_found()


# --------------------------------------------------------------------- public

@pages.get("/")
def entry():
    h = house()
    works = repo.published_works(h["id"])
    ctx = base_context("entry", "Cirrus", "entry")
    ctx["works"] = works
    ctx["cluster"] = build_cluster(works)
    return render_template("entry.html", **ctx)


CLUSTER_LAYOUT = [
    # Authored positions, not random: x%, y%, long edge px, depth. The four corners
    # stay empty and the exact centre is clear for the mark.
    (14.0, 17.0, 214, 1), (30.5, 9.5, 168, 2), (47.0, 15.0, 262, 3),
    (63.0, 8.5, 190, 2), (78.5, 18.0, 230, 1), (8.5, 37.0, 246, 2),
    (25.0, 30.0, 300, 4), (41.0, 34.0, 176, 5), (58.0, 29.0, 288, 4),
    (74.0, 36.5, 202, 3), (88.5, 30.0, 158, 1), (12.0, 58.0, 190, 2),
    (27.5, 63.5, 262, 3), (44.0, 57.0, 330, 5), (61.5, 62.0, 222, 4),
    (77.0, 56.5, 274, 2), (90.0, 62.0, 150, 1), (20.0, 82.0, 206, 2),
    (39.0, 86.0, 168, 1), (56.0, 81.0, 238, 3), (72.5, 85.5, 184, 2),
]


def build_cluster(works):
    """Roughly twenty stills, overlapping freely, dense toward the centre. The
    overlap order is stable across loads because the layout is authored."""
    if not works:
        return []
    out = []
    for i, (x, y, edge, depth) in enumerate(CLUSTER_LAYOUT):
        w = works[i % len(works)]
        poster = w.get("poster")
        if not poster:
            continue
        ratio = (poster["height"] / poster["width"]) if poster["width"] else 0.66
        width = edge
        height = round(edge * ratio)
        out.append({"work": w, "x": x, "y": y, "width": width, "height": height,
                    "depth": depth, "poster": poster})
    return out


@pages.get("/works")
def works_index():
    h = house()
    ctx = base_context("works", "Cirrus - Works", "works")
    ctx["works"] = repo.published_works(h["id"])
    ctx["opening_line"] = "Quiet decisions, made early, are the ones you notice last."
    return render_template("works.html", **ctx)


@pages.get("/works/<slug>")
def work_detail(slug):
    h = house()
    detail = repo.work_detail(h["id"], slug)
    if not detail:
        target = repo.resolve_redirect(h["id"], "work", slug)
        if target:
            return redirect(url_for("pages.work_detail", slug=target), code=301)
        return render_not_found()
    ctx = base_context("works", f"Cirrus - {detail['title']}", "works")
    ctx["work"] = detail
    return render_template("work_detail.html", **ctx)


@pages.get("/talents")
def talents_index():
    h = house()
    ctx = base_context("talents", "Cirrus - Talents", "talents")
    ctx["talents"] = repo.published_talents(h["id"])
    ctx["disciplines"] = repo.disciplines(h["id"])
    return render_template("talents.html", **ctx)


@pages.get("/talents/<slug>")
def talent_detail(slug):
    h = house()
    detail = repo.talent_detail(h["id"], slug)
    if not detail:
        target = repo.resolve_redirect(h["id"], "talent", slug)
        if target:
            return redirect(url_for("pages.talent_detail", slug=target), code=301)
        return render_not_found()
    ctx = base_context("talents", f"Cirrus - {detail['title']}", "talents")
    ctx["talent"] = detail
    return render_template("talent_detail.html", **ctx)


@pages.get("/about")
def about():
    ctx = base_context("about", "Cirrus - About", "about")
    ctx["figure_lines"] = ["PICTURES PATIENTLY MADE", "PRACTISED HANDS, PLAIN PURPOSE",
                           "PEOPLE WORTH PUTTING FORWARD", "PICTURE AND ITS MAKERS"]
    ctx["body_lines"] = ["We build, we bend,", "we break and rebuild,",
                         "making things that last", "while asking what",
                         "comes next. Cirrus is a", "production house working",
                         "between the settled and the untried."]
    ctx["body_second"] = ("Founded in Paris, working wider. We support brands, agencies "
                          "and artists with picture, from first idea to final delivery: "
                          "production, casting, studio and post.")
    return render_template("about.html", **ctx)


@pages.get("/signup")
def signup():
    ctx = base_context("signup", "Cirrus - Sign up", "entry", indexable=False)
    return render_template("signup.html", **ctx)


@pages.get("/studio/login")
def studio_login():
    ctx = base_context("studio", "Cirrus - Studio", "entry", indexable=False)
    ctx["next_url"] = request.args.get("next", "/studio")
    return render_template("login.html", **ctx)


# -------------------------------------------------------------------- preview

@pages.get("/preview/<token>")
def preview(token):
    """Without a producer session it renders nothing and reveals nothing about
    what exists."""
    account = current_account()
    if not account or account["role"] != "producer" or not account["house_id"]:
        return render_not_found()
    resolved = repo.resolve_preview(token, account["house_id"])
    if not resolved:
        return render_not_found()
    record = resolved["record"]
    mark = "works" if resolved["kind"] == "work" else "talents"
    ctx = base_context("preview", f"Cirrus - Preview", mark, indexable=False)
    ctx["record"] = record
    ctx["kind"] = resolved["kind"]
    ctx["expires_at"] = resolved["expires_at"]
    resp = render_template("preview.html", **ctx)
    from flask import make_response
    out = make_response(resp)
    # Kept out of every shared cache and out of every index.
    out.headers["Cache-Control"] = "no-store, private, max-age=0"
    out.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    return out


# --------------------------------------------------------------------- studio

def studio_guard():
    """A visitor asking for /studio lands on /studio/login. A signed-in viewer is
    refused and sees the entry route."""
    account = current_account()
    if not account:
        return redirect(url_for("pages.studio_login", next=request.path)), None
    if account["role"] != "producer" or not account["house_id"]:
        return redirect(url_for("pages.entry")), None
    return None, account


@pages.get("/studio")
def studio():
    redirect_to, account = studio_guard()
    if redirect_to:
        return redirect_to
    h = repo.house_by_id(account["house_id"])
    ctx = base_context("studio", "Cirrus - Studio", "entry", indexable=False)
    ctx["studio_house"] = h
    ctx["items"] = repo.studio_items(account["house_id"])
    return render_template("studio.html", **ctx)


@pages.get("/studio/talents/new")
def studio_new_talent():
    redirect_to, account = studio_guard()
    if redirect_to:
        return redirect_to
    ctx = base_context("studio", "Cirrus - New talent", "entry", indexable=False)
    ctx["kind"] = "talent"
    return render_template("studio_new.html", **ctx)


@pages.get("/studio/works/new")
def studio_new_work():
    redirect_to, account = studio_guard()
    if redirect_to:
        return redirect_to
    ctx = base_context("studio", "Cirrus - New work", "entry", indexable=False)
    ctx["kind"] = "work"
    return render_template("studio_new.html", **ctx)


@pages.get("/studio/items/<item_id>")
def studio_edit(item_id):
    redirect_to, account = studio_guard()
    if redirect_to:
        return redirect_to
    item = repo.studio_item(account["house_id"], item_id)
    if not item:
        # A record of another house is answered exactly as a missing one.
        return render_not_found()
    ctx = base_context("studio", f"Cirrus - {item['title']}", "entry", indexable=False)
    ctx["item"] = item
    ctx["talents"] = [t for t in repo.studio_items(account["house_id"], "talent")]
    return render_template("studio_edit.html", **ctx)


@pages.get("/studio/items/<item_id>/published")
def studio_published(item_id):
    redirect_to, account = studio_guard()
    if redirect_to:
        return redirect_to
    item = repo.studio_item(account["house_id"], item_id)
    if not item:
        return render_not_found()
    house_id = account["house_id"]
    ctx = base_context("studio", "Cirrus - Published", "entry", indexable=False)
    ctx["item"] = item
    ctx["public_href"] = (f"/works/{item['slug']}" if item["kind"] == "work"
                          else f"/talents/{item['slug']}")
    ctx["is_public_house"] = (house_id == house()["id"])
    return render_template("studio_published.html", **ctx)
