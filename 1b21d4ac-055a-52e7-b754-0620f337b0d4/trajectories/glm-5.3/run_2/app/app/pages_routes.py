"""Server-rendered pages. The browser receives a complete document."""
from datetime import datetime, timezone

from flask import (Blueprint, abort, jsonify, make_response, redirect,
                    render_template, request)

from . import db, pages, reads
from .routes import caller, house

bp = Blueprint("pages", __name__)


def view(template, route, **ctx):
    h = house()
    ctx.setdefault("public_url", request.host_url.rstrip("/"))
    ctx.setdefault("house_name", h["name"])
    ctx.setdefault("contact_email", h["contact_email"])
    ctx.setdefault("route_name", route)
    return render_template(template, **ctx)


@bp.get("/")
def index():
    """The entry cluster: roughly twenty stills, authored positions, no reels."""
    house_id = reads.house_id()
    works = reads.published_works(house_id)
    tiles = []
    for w in works:
        media = reads.media_for(w["id"], roles=["poster"])
        if media:
            tiles.append({"work": w, "m": media[0]})
    for w in works:
        if len(tiles) >= 20:
            break
        gallery = reads.media_for(w["id"], roles=["gallery"])
        if gallery:
            tiles.append({"work": w, "m": gallery[len(gallery) % max(1, len(gallery) - 1)]})
    specs = _cluster_specs(len(tiles))
    stills = []
    for i, tile in enumerate(tiles[:20]):
        w, m = tile["work"], tile["m"]
        (x, y), size = specs[i]
        long_edge = max(size)
        ratio = (m["height"] or 1) / (m["width"] or 1)
        stills.append({
            "slug": w["slug"], "title": w["title"], "ordinal": w["ordinal"],
            "poster": m, "alt": m["alt"] or f"Still from {w['title']}",
            "x": x, "y": y, "w": long_edge, "h": int(long_edge * ratio),
        })
    return view("index.html", "index", stills=stills)


def _cluster_specs(count):
    """Twenty authored positions: dense toward the centre, corners clear."""
    base = [
        ((120, 120), (300, 180)), ((430, 90), (200, 260)), ((760, 60), (330, 200)), ((1090, 110), (240, 160)),
        ((170, 330), (210, 280)), ((470, 300), (330, 200)), ((820, 320), (200, 260)), ((1120, 300), (300, 180)),
        ((90, 560), (260, 160)), ((390, 600), (200, 250)), ((700, 620), (320, 190)), ((1060, 590), (220, 280)),
        ((200, 750), (300, 180)), ((520, 800), (240, 160)), ((830, 810), (200, 250)), ((1150, 780), (260, 170)),
        ((620, 180), (150, 190)), ((980, 740), (160, 210)), ((300, 470), (160, 200)), ((1200, 470), (170, 220)),
    ]
    out = list(base)
    while len(out) < count:
        s = base[len(out) % len(base)]
        out.append(((s[0][0] + 37, s[0][1] + 53), s[1]))
    return out[:max(count, 0)]


@bp.get("/works")
def works():
    rows = pages.page_works()
    for r in rows:
        r["alt"] = (r["poster"] or {}).get("alt", r["title"])
    return view("works.html", "works", works=rows,
                gallery_variants=["right", "centre", "left"])


@bp.get("/works/<slug>")
def work(slug):
    w = pages.page_work(slug)
    if not w:
        abort(404)
    return view("work_detail.html", "work-detail", work=w,
                gallery_variants=["right", "centre", "left"])


@bp.get("/talents")
def talents():
    rows = pages.page_talents()
    for r in rows:
        r["alt"] = (r["poster"] or {}).get("alt", r["title"])
    return view("talents.html", "talents", talents=rows,
                disciplines=reads.disciplines(house()["id"]))


@bp.get("/talents/<slug>")
def talent(slug):
    t = pages.page_talent(slug)
    if not t:
        abort(404)
    return view("talent_detail.html", "talent-detail", talent=t)


@bp.get("/about")
def about():
    return view("about.html", "about")


@bp.get("/signup")
def signup():
    return view("signup.html", "signup")


@bp.get("/studio/login")
def studio_login():
    return view("studio_login.html", "studio-login")


@bp.get("/studio/logout")
def studio_logout():
    """Signing out makes /studio unreachable at once."""
    resp = redirect("/studio/login")
    resp.delete_cookie("cirrus_session", path="/")
    return resp


def producer_account():
    acc = caller()
    if acc and acc["role"] == "producer" and acc["house_id"]:
        return acc
    return None


@bp.get("/studio")
def studio():
    acc = producer_account()
    if not acc:
        return redirect("/studio/login")
    rows = db.query(
        "SELECT * FROM items WHERE house_id = %s ORDER BY kind, position, created_at",
        (acc["house_id"],))
    from .routes import item_shape
    items = [item_shape(r) for r in rows]
    return view("studio.html", "studio", items=items)


@bp.get("/studio/talents/new")
@bp.get("/studio/works/new")
def studio_new():
    acc = producer_account()
    if not acc:
        return redirect("/studio/login")
    kind = "talent" if request.path.endswith("talents/new") else "work"
    return view("studio_new.html", "studio-new", kind=kind)


@bp.get("/studio/items/<item_id>")
def studio_item(item_id):
    acc = producer_account()
    if not acc:
        return redirect("/studio/login")
    row = db.query("SELECT * FROM items WHERE id=%s AND house_id=%s",
                   (item_id, acc["house_id"]), one=True)
    if not row:
        abort(404)
    from .routes import item_shape
    media = reads.media_for(item_id)
    credits = reads.credits_for(item_id)
    return view("studio_item.html", "studio-item", item=item_shape(row),
                media=media, credits=credits)


@bp.get("/studio/items/<item_id>/published")
def studio_published(item_id):
    acc = producer_account()
    if not acc:
        return redirect("/studio/login")
    row = db.query("SELECT * FROM items WHERE id=%s AND house_id=%s",
                   (item_id, acc["house_id"]), one=True)
    if not row:
        abort(404)
    if row["kind"] == "work":
        rows = db.query(
            """SELECT id FROM items WHERE house_id=%s AND kind='work' AND published
               ORDER BY position""", (acc["house_id"],))
        ordinal = None
        for i, r in enumerate(rows):
            if r["id"] == item_id:
                ordinal = f"{i + 1:03d}"
        carrying = f"ORDINAL {ordinal}" if ordinal else "NOT ON THE INDEX"
    else:
        carrying = row["discipline"].upper() if row["discipline"] else ""
    addr = f"/works/{row['slug']}" if row["kind"] == "work" else f"/talents/{row['slug']}"
    from .routes import item_shape
    return view("studio_published.html", "studio-published",
                item=item_shape(row), addr=addr, carrying=carrying)


@bp.get("/preview/<token>")
def preview(token):
    """An unlisted record rendered through the published route's own components.

    A token that is missing, expired, foreign, or asked at without the owning
    producer's session answers exactly as an address that matches nothing."""
    acc = producer_account()
    row = db.query(
        """SELECT p.item_id, p.expires_at, i.house_id FROM preview_tokens p
           JOIN items i ON i.id = p.item_id WHERE p.token=%s""",
        (token.lower(),), one=True) if acc else None
    if not acc or not row or row["expires_at"] < datetime.now(timezone.utc) \
            or row["house_id"] != acc["house_id"]:
        abort(404)
    item = db.query("SELECT * FROM items WHERE id=%s", (row["item_id"],), one=True)
    record = {
        "kind": item["kind"], "title": item["title"], "slug": item["slug"],
        "discipline": item["discipline"], "variant": item["variant"],
        "ordinal": None, "media": reads.media_for(item["id"]),
        "credits": reads.credits_for(item["id"]),
    }
    resp = make_response(render_template("preview.html", record=record, route_name="preview",
                           public_url=request.host_url.rstrip("/"),
                           house_name="Cirrus", contact_email="prod@example.com"))
    resp.headers["Cache-Control"] = "no-store"
    return resp
