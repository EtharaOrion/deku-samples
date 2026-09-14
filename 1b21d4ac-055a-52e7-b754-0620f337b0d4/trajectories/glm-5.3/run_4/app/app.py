"""Cirrus — a production house's public site and private studio."""
import logging
import os
import re
import secrets
import sys
from datetime import timedelta, timezone

from flask import (Flask, Response, abort, g, jsonify, redirect, render_template,
                   request, send_file, url_for)
from markupsafe import Markup
import psycopg
from werkzeug.exceptions import HTTPException

import auth
import media
import seed
import studio_api

HOUSE_SLUG = os.environ.get("HOUSE_SLUG", "cirrus")
HEX32 = re.compile(r"^[0-9a-f]{32}$")

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(asctime)s %(levelname)s cirrus %(message)s",
)
log = logging.getLogger("cirrus")

app = Flask(__name__)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000
ASSET_VERSION = "7"
app.json.sort_keys = False




def db():
    if "pg" not in g:
        conn = psycopg.connect(os.environ["DATABASE_URL"])
        conn.autocommit = True
        g.pg = conn
    return g.pg


@app.teardown_appcontext
def _close_db(exc):
    conn = g.pop("pg", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass


@app.before_request
def open_db():
    request.pg = db()



@app.after_request
def one_line_log(resp):
    if request.path.startswith("/api/media/") or request.path.startswith("/static/"):
        return resp
    log.info("%s %s %s", request.method, request.path, resp.status_code)
    return resp


# ---------------------------------------------------------------- house

def get_house():
    row = request.pg.execute(
        "select id,slug,name,tagline_upper,tagline_lower,street,city,district,contact_email"
        " from houses where slug=%s", (HOUSE_SLUG,)).fetchone()
    if not row:
        abort(500)
    keys = "id slug name tagline_upper tagline_lower street city district contact_email".split()
    return dict(zip(keys, row))


def house_id():
    return get_house()["id"]


# ---------------------------------------------------------------- public reads

def published_items(kind, discipline=None):
    sql = ("select id,slug,title,position,discipline,variant,published,published_at,created_at"
           " from items where house_id=%s and kind=%s and published order by position, id")
    rows = request.pg.execute(sql, (house_id(), kind)).fetchall()
    keys = "id slug title position discipline variant published published_at created_at".split()
    out = [dict(zip(keys, r)) for r in rows]
    if kind == "work":
        for i, it in enumerate(out, 1):
            it["ordinal"] = ordinal_of(i)
    if discipline:
        out = [it for it in out if it["discipline"] == discipline]
    return out


def ordinal_of(i):
    return f"{i:03d}"


def media_for(item_id):
    rows = request.pg.execute(
        "select id,role,position,seed,width,height,alt,created_at from media"
        " where item_id=%s order by position, created_at, id", (item_id,)).fetchall()
    keys = "id role position seed width height alt created_at".split()
    return [dict(zip(keys, r)) for r in rows]


def credits_for(item_id):
    rows = request.pg.execute(
        "select c.id,c.position,c.role,c.name,c.talent_item_id,t.slug as talent_slug,t.title as talent_title"
        " from credits c left join items t on t.id=c.talent_item_id"
        " where c.item_id=%s order by c.position, c.id", (item_id,)).fetchall()
    out = []
    for r in rows:
        out.append({"id": r[0], "position": r[1], "role": r[2], "name": r[3],
                    "talent_item_id": r[4], "talent_slug": r[5], "talent_title": r[6]})
    return out


def neighbours(work, works):
    idx = next((i for i, w in enumerate(works) if w["id"] == work["id"]), 0)
    n = len(works)
    prev = works[(idx - 1) % n] if n else None
    nxt = works[(idx + 1) % n] if n else None
    return prev, nxt


def item_by_slug(kind, slug):
    row = request.pg.execute(
        "select id,slug,title,position,discipline,variant,published,published_at,created_at"
        " from items where house_id=%s and kind=%s and slug=%s and published",
        (house_id(), kind, slug)).fetchone()
    if not row:
        return None
    keys = "id slug title position discipline variant published published_at created_at".split()
    return dict(zip(keys, row))


def work_payload(w, works=None, full=True):
    if works is None:
        works = published_items("work")
    prev, nxt = neighbours(w, works)
    out = dict(w)
    out["ordinal"] = ordinal_of(works.index(w) + 1 if w in works else 1)
    if full:
        out["media"] = media_for(w["id"])
        out["credits"] = credits_for(w["id"])
    out["previous"] = {"slug": prev["slug"], "title": prev["title"], "ordinal": prev["ordinal"]} if prev else None
    out["next"] = {"slug": nxt["slug"], "title": nxt["title"], "ordinal": nxt["ordinal"]} if nxt else None
    return out


def talent_payload(t, full=True):
    out = dict(t)
    if full:
        out["media"] = media_for(t["id"])
        out["selected_work"] = selected_work(t["id"])
    return out


def selected_work(talent_id):
    rows = request.pg.execute(
        "select w.id, w.position, w.id as tie from credits c join items w on w.id=c.item_id"
        " where c.talent_item_id=%s and w.published and w.kind='work'"
        " group by w.id, w.position order by w.position, w.id", (talent_id,)).fetchall()
    works = published_items("work")
    by_id = {w["id"]: w for w in works}
    out = []
    for row in rows:
        wid = row[0]
        w = by_id.get(wid)
        if w:
            ww = dict(w)
            ww["media"] = media_for(wid)
            out.append(ww)
    return out


def disciplines():
    rows = request.pg.execute(
        "select discipline from items where house_id=%s and kind='talent' and published"
        " order by position, id", (house_id(),)).fetchall()
    seen = []
    for (d,) in rows:
        if d and d not in seen:
            seen.append(d)
    return seen


# ---------------------------------------------------------------- refusals

def bad_request(reason, code=400):
    resp = jsonify({"error": reason})
    resp.status_code = code
    return resp


def not_found(reason="That page is not here."):
    resp = jsonify({"error": reason})
    resp.status_code = 404
    return resp


# ---------------------------------------------------------------- api

@app.get("/api/health")
def api_health():
    try:
        request.pg.execute("select count(*) from items where house_id=%s and published", (house_id(),))
    except Exception:
        return jsonify({"status": "error"}), 503
    return jsonify({"status": "ok"})


@app.post("/api/auth/signup")
def api_signup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return bad_request("Enter a valid email address.")
    if len(password) < 8:
        return bad_request("A password needs at least eight characters.")
    token, err = auth.create_viewer(request.pg, email, password)
    if err:
        return bad_request(err, 409)
    acct = auth.account_by_email(request.pg, email)
    return jsonify({"token": token, "account": {
        "id": acct["id"], "email": acct["email"], "role": acct["role"], "house_id": acct["house_id"]}}), 201


@app.post("/api/auth/login")
def api_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    acct = auth.account_by_email(request.pg, email)
    if not acct or not auth.check_password(acct["password_hash"], password):
        return bad_request("That email and password do not match.", 401)
    token = auth.mint_token(acct["id"], acct["password_hash"])
    return jsonify({"token": token, "account": {
        "id": acct["id"], "email": acct["email"], "role": acct["role"], "house_id": acct["house_id"]}})


@app.get("/api/works")
def api_works():
    return jsonify([work_payload(w, full=False) for w in published_items("work")])


@app.get("/api/works/<slug>")
def api_work(slug):
    w = item_by_slug("work", slug)
    if not w:
        return not_found()
    return jsonify(work_payload(w))


@app.get("/api/talents")
def api_talents():
    disc = request.args.get("discipline")
    return jsonify([talent_payload(t, full=False) for t in published_items("talent", disc)])


@app.get("/api/talents/<slug>")
def api_talent(slug):
    t = item_by_slug("talent", slug)
    if not t:
        return not_found()
    return jsonify(talent_payload(t))


@app.get("/api/disciplines")
def api_disciplines():
    return jsonify(disciplines())


@app.get("/api/media/<media_id>")
def api_media(media_id):
    if not HEX32.match(media_id):
        return not_found()
    m = media_row_for_public(media_id)
    if not m:
        return not_found()
    return media.serve_still(request.pg, m)


def media_row_for_public(media_id):
    row = request.pg.execute(
        "select m.id,m.item_id,m.role,m.seed,m.width,m.height,m.alt,i.published,i.house_id"
        " from media m join items i on i.id=m.item_id where m.id=%s", (media_id,)).fetchone()
    if not row:
        return None
    d = dict(zip("id item_id role seed width height alt published house_id".split(), row))
    if d["published"]:
        return d
    # unlisted: only the record's own house producer
    acct = auth.account_from_request(request)
    if acct and acct["role"] == "producer" and acct["house_id"] == d["house_id"]:
        return d
    return None


@app.get("/api/preview/<token>")
def api_preview(token):
    if not HEX32.match(token):
        return not_found()
    acct = auth.account_from_request(request)
    if not acct or acct["role"] != "producer":
        return not_found()
    row = request.pg.execute(
        "select item_id from preview_tokens where token=%s and expires_at > now()", (token,)).fetchone()
    if not row:
        return not_found()
    it = studio_api.item_for_producer(request.pg, acct, row[0])
    if not it:
        return not_found()
    payload = talent_payload(it) if it["kind"] == "talent" else work_payload_preview(it)
    return jsonify(payload)


def work_payload_preview(it):
    works = published_items("work")
    out = dict(it)
    out["ordinal"] = "000"
    prev, nxt = None, None
    idx = next((i for i, w in enumerate(works) if w["id"] == it["id"]), None)
    if idx is not None:
        n = len(works)
        prev = works[(idx - 1) % n]
        nxt = works[(idx + 1) % n]
    out["previous"] = {"slug": prev["slug"], "title": prev["title"]} if prev else None
    out["next"] = {"slug": nxt["slug"], "title": nxt["title"]} if nxt else None
    out["media"] = media_for(it["id"])
    out["credits"] = credits_for(it["id"])
    return out


# ---------------------------------------------------------------- studio api

app.register_blueprint(studio_api.bp, url_prefix="/api/studio")


# ---------------------------------------------------------------- pages

PAGE_META = {
    "home": ("Cirrus", "home"),
    "works": ("Cirrus - Works", "works"),
    "talents": ("Cirrus - Talents", "talents"),
    "about": ("Cirrus - About", "about"),
}

# The entry cluster's twenty stills: authored positions, dense toward the centre,
# thinning toward the edges, four corners empty, the exact centre clear.
CLUSTER_POSITIONS = [
    [150, 120, 210, 1], [520, 96, 180, 2], [880, 118, 240, 3], [1210, 104, 190, 4],
    [172, 300, 330, 5], [560, 268, 150, 6], [830, 286, 300, 7], [1180, 262, 220, 8],
    [214, 520, 240, 9], [508, 496, 200, 10], [1090, 480, 320, 11], [1360, 524, 190, 12],
    [120, 690, 180, 13], [520, 672, 260, 14], [900, 664, 170, 15], [1240, 700, 250, 16],
    [300, 800, 200, 17], [700, 790, 150, 18], [1060, 812, 210, 19], [1330, 782, 170, 20],
]


def page_ctx(**kw):
    h = get_house()
    ctx = {"house": h, "discipline_set": disciplines()}
    ctx.update(kw)
    return ctx


def public_works():
    return published_items("work")


def public_talents():
    return published_items("talent")


@app.get("/")
def page_home():
    works = public_works()
    tiles = []
    for w in works:
        for m in media_for(w["id"]):
            if m["role"] in ("poster", "gallery"):
                tiles.append({"slug": w["slug"], "title": w["title"], "media": m,
                              "ordinal": w["ordinal"]})
    ctx = page_ctx(route="home", title="Cirrus", tiles=tiles[:20], works=works,
                   cluster_positions=CLUSTER_POSITIONS)
    # the cluster shows stills only: every tile is a published work's still
    return render_template("home.html", **ctx)


@app.get("/works")
@app.get("/works/")
def page_works():
    works = public_works()
    entries = []
    for w in works:
        posters = [m for m in media_for(w["id"]) if m["role"] == "poster"]
        entries.append({"work": w, "poster": posters[0] if posters else None})
    ctx = page_ctx(route="works", title="Cirrus - Works", works=works, entries=entries)
    return render_template("works.html", **ctx)


# ---------------------------------------------------------------- redirects

REDIRECT_SQL = """
select i.slug, i.kind from slug_redirects r join items i on i.id=r.item_id
where r.house_id=%s and r.kind=%s and r.old_slug=%s
"""


@app.get("/works/<slug>")
def page_work(slug):
    w = item_by_slug("work", slug)
    if not w:
        row = request.pg.execute(REDIRECT_SQL, (house_id(), "work", slug)).fetchone()
        if row and row[1] == "work":
            return redirect(f"/works/{row[0]}", code=301)
        return render_not_found()
    payload = work_payload(w)
    ctx = page_ctx(route="work", title=f"Cirrus - {w['title']}", work=payload)
    return render_template("work.html", **ctx)


@app.get("/talents")
@app.get("/talents/")
def page_talents():
    talents = public_talents()
    entries = []
    for t in talents:
        posters = [m for m in media_for(t["id"]) if m["role"] == "poster"]
        entries.append({"id": t["id"], "slug": t["slug"], "title": t["title"],
                        "discipline": t["discipline"],
                        "portrait": posters[0] if posters else None})
    ctx = page_ctx(route="talents", title="Cirrus - Talents", talents=entries,
                   total=len(entries))
    return render_template("talents.html", **ctx)


@app.get("/talents/<slug>")
def page_talent(slug):
    t = item_by_slug("talent", slug)
    if not t:
        row = request.pg.execute(REDIRECT_SQL, (house_id(), "talent", slug)).fetchone()
        if row and row[1] == "talent":
            return redirect(f"/talents/{row[0]}", code=301)
        return render_not_found()
    payload = talent_payload(t)
    ctx = page_ctx(route="talent", title=f"Cirrus - {t['title']}", talent=payload)
    return render_template("talent.html", **ctx)


@app.get("/about")
def page_about():
    return render_template("about.html", **page_ctx(route="about", title="Cirrus - About"))


@app.get("/signup")
def page_signup():
    return render_template("signup.html", **page_ctx(route="signup", title="Cirrus - Sign up"))


@app.get("/studio/login")
def page_studio_login():
    return render_template("studio_login.html", **page_ctx(route="studio-login", title="Cirrus - Studio"))


@app.get("/preview/<token>")
def page_preview(token):
    if not HEX32.match(token):
        return render_not_found()
    acct = auth.account_from_request(request)
    if not acct or acct["role"] != "producer":
        return Response(render_template("preview_gate.html",
                                        **page_ctx(route="preview", title="Cirrus")), status=404)
    row = request.pg.execute(
        "select item_id from preview_tokens where token=%s and expires_at > now()", (token,)).fetchone()
    item = studio_api.item_for_producer(request.pg, acct, row[0]) if row else None
    if not item:
        return render_not_found()
    if item["kind"] == "talent":
        payload = talent_payload(item)
        ctx = page_ctx(route="preview", title=f"Cirrus - {item['title']}", item=payload,
                       kind="talent", preview_token=token)
        return render_template("talent.html", **ctx, preview=True)
    payload = work_payload_preview(item)
    ctx = page_ctx(route="preview", title=f"Cirrus - {item['title']}", item=payload,
                   kind="work", preview_token=token)
    return render_template("work.html", **ctx, preview=True)


@app.get("/studio")
def page_studio():
    acct = auth.account_from_request(request)
    if not acct:
        return redirect("/studio/login?next=/studio")
    if acct["role"] != "producer":
        return redirect("/")
    items = request.pg.execute(
        "select id,kind,slug,title,position,discipline,variant,published,published_at,created_at"
        " from items where house_id=%s order by kind, position, id", (acct["house_id"],)).fetchall()
    keys = "id kind slug title position discipline variant published published_at created_at".split()
    records = [dict(zip(keys, r)) for r in items]
    house = request.pg.execute(
        "select slug,name from houses where id=%s", (acct["house_id"],)).fetchone()
    return render_template("studio.html", **page_ctx(route="studio", title="Cirrus - Studio",
                                                     records=records, account=acct,
                                                     house_slug=house[0]))


@app.get("/studio/items/new")
def page_studio_new():
    acct = auth.account_from_request(request)
    if not acct:
        return redirect("/studio/login?next=/studio/items/new")
    if acct["role"] != "producer":
        return redirect("/")
    kind = request.args.get("kind", "talent")
    kind = kind if kind in ("work", "talent") else "talent"
    return _studio_form(kind)


@app.get("/studio/talents/new")
def page_studio_talent_new():
    return _studio_form("talent")


@app.get("/studio/works/new")
def page_studio_work_new():
    return _studio_form("work")


def _studio_form(kind):
    acct = auth.account_from_request(request)
    if not acct:
        return redirect(f"/studio/login?next=/studio/{'talents' if kind == 'talent' else 'works'}/new")
    if acct["role"] != "producer":
        return redirect("/")
    return render_template("studio_form.html", **page_ctx(route="studio", title="Cirrus - Studio",
                                                          kind=kind))


@app.get("/studio/items/<int:item_id>")
def page_studio_item(item_id):
    acct = auth.account_from_request(request)
    if not acct:
        return redirect(f"/studio/login?next=/studio/items/{item_id}")
    if acct["role"] != "producer":
        return redirect("/")
    item = studio_api.item_for_producer(request.pg, acct, item_id)
    if not item:
        return render_not_found()
    payload = studio_api.with_details(request.pg, item)
    ordinal = None
    if item["kind"] == "work" and item["published"]:
        works = published_items("work")
        idx = next((i for i, w in enumerate(works) if w["id"] == item["id"]), None)
        if idx is not None:
            ordinal = works[idx]["ordinal"]
    talents = [t for t in published_items("talent")] if item["kind"] == "work" else []
    return render_template("studio_edit.html", **page_ctx(
        route="studio", title="Cirrus - Studio", item=payload, account=acct,
        ordinal=ordinal, talents=talents))


@app.get("/studio/items/<int:item_id>/published")
def page_studio_item_published(item_id):
    acct = auth.account_from_request(request)
    if not acct:
        return redirect(f"/studio/login?next=/studio/items/{item_id}/published")
    if acct["role"] != "producer":
        return redirect("/")
    item = studio_api.item_for_producer(request.pg, acct, item_id)
    if not item:
        return render_not_found()
    ordinal = None
    if item["kind"] == "work" and item["published"]:
        works = published_items("work")
        idx = next((i for i, w in enumerate(works) if w["id"] == item["id"]), None)
        if idx is not None:
            ordinal = works[idx]["ordinal"]
    return render_template("studio_published.html", **page_ctx(
        route="studio", title="Cirrus - Studio", item=item, ordinal=ordinal))


def render_not_found():
    resp = render_template("not_found.html", **page_ctx(route="notfound", title="Cirrus"))
    return Response(resp, status=404)


# ---------------------------------------------------------------- static assets

@app.get("/share-image.png")
def share_image():
    return media.share_image()


@app.get("/grain.png")
def grain_tile():
    return media.grain_tile()


def serve_asset(path, mimetype, cache=True):
    full = os.path.join(app.static_folder, path)
    if not os.path.exists(full):
        abort(404)
    resp = send_file(full, mimetype=mimetype, conditional=True)
    if not cache:
        resp.cache_control.no_store = True
    return resp


# ---------------------------------------------------------------- errors

@app.errorhandler(HTTPException)
def http_error(exc):
    if request.path.startswith("/api/"):
        return jsonify({"error": exc.description or exc.name}), exc.code
    if exc.code == 404:
        return render_not_found()
    return render_template("error.html", **page_ctx(route="error", title="Cirrus")), exc.code


@app.errorhandler(Exception)
def unhandled(exc):
    log.exception("unhandled %s", exc)
    if request.path.startswith("/api/"):
        return jsonify({"error": "Something went wrong."}), 500
    return render_template("error.html", **page_ctx(route="error", title="Cirrus")), 500


if __name__ == "__main__":
    import psycopg
    c = psycopg.connect(os.environ["DATABASE_URL"])
    c.autocommit = True
    try:
        seed.run(c, HOUSE_SLUG)
    finally:
        c.close()
    media.build_static_assets()
    port = int(os.environ.get("PORT", "4173"))
    app.run(host="0.0.0.0", port=port)
