"""Page routes.

Every one of these returns a complete document on first paint.  Alpine only
enhances what the server already delivered; there is no client render pass that
produces the page.
"""

from __future__ import annotations

from typing import Any

from flask import (
    Blueprint,
    Response,
    abort,
    make_response,
    redirect,
    render_template,
    request,
    url_for,
)

from . import config, media, repo, seed
from .api_public import resolve_preview
from .auth import (
    Denied,
    authenticate,
    bearer_from_request,
    create_viewer,
    current_account,
    mint_token,
)

bp = Blueprint("views", __name__)

DESCRIPTION = "A production house for picture and its makers."
OPENING_LINE = "Quiet decisions, made early, are the ones you notice last."

STUDIO_REFUSAL = ("THE STUDIO BELONGS TO THE HOUSE.", "THE WORK IS YOURS TO SEE.")

ABOUT_FIGURE = (
    "PICTURES PATIENTLY MADE",
    "PRACTISED HANDS, PLAIN PURPOSE",
    "PEOPLE WORTH PUTTING FORWARD",
    "PICTURE AND ITS MAKERS",
)

ABOUT_BODY_LINES = (
    "We build, we bend,",
    "we break and rebuild,",
    "making things that last",
    "while asking what",
    "comes next. Cirrus is a",
    "production house working",
    "between the settled and the untried.",
)

ABOUT_BODY_SECOND = (
    "Founded in Paris, working wider. We support brands, agencies and artists "
    "with picture, from first idea to final delivery: production, casting, "
    "studio and post."
)

LOCKUP = {
    "large": ("CIRRUS", "PICTURE", "MAKERS"),
    "small": ("PROD", "FOR", "AND"),
    "smallest": "ITS",
}


def _house() -> dict[str, Any]:
    house = repo.public_house()
    if house is None:
        abort(503)
    return house


def _chrome(house: dict[str, Any], route: str, **extra: Any) -> dict[str, Any]:
    context = {
        "house": house,
        "route": route,
        "wordmark": house["name"].lower(),
        "nav": (
            {"label": "WORKS", "href": "/works", "route": "works"},
            {"label": "TALENTS", "href": "/talents", "route": "talents"},
            {
                "label": "CONTACT",
                "href": f"mailto:{house['contact_email']}",
                "route": None,
            },
            {"label": "ABOUT", "href": "/about", "route": "about"},
        ),
        "footer": {
            "street": house["street"],
            "city": house["city"],
            "district": house["district"],
            "tagline_upper": house["tagline_upper"],
            "tagline_lower": house["tagline_lower"],
            "contact_email": house["contact_email"],
        },
        "description": DESCRIPTION,
        "public_url": config.public_url(),
        "account": current_account(),
    }
    context.update(extra)
    return context


@bp.get("/")
def entry() -> str:
    house = _house()
    ring = repo.published_items(house["id"], "work")
    ordinals = {row["id"]: repo.ordinal_of(index) for index, row in enumerate(ring)}
    cluster = [media.descriptor(row) | {
        "title": row["title"],
        "href": f"/works/{row['slug']}",
        "ordinal": ordinals[row["item_id"]],
    } for row in seed.cluster_media(house["id"])]
    refusal = STUDIO_REFUSAL if request.args.get("refused") == "studio" else None
    return render_template(
        "entry.html",
        **_chrome(house, "entry", cluster=cluster, refusal=refusal, title="Cirrus"),
    )


@bp.get("/works")
@bp.get("/works/")
def works_index() -> str:
    house = _house()
    works = repo.public_works(house)
    return render_template(
        "works.html",
        **_chrome(
            house,
            "works",
            works=works,
            opening_line=OPENING_LINE,
            title="Cirrus - Works",
        ),
    )


@bp.get("/works/<slug>")
def work_detail(slug: str):
    house = _house()
    payload = repo.public_work(house, slug)
    if payload is None:
        moved = repo.redirect_target(house["id"], "work", slug)
        if moved is not None and moved["published"]:
            return redirect(url_for("views.work_detail", slug=moved["slug"]), code=301)
        abort(404)
    return render_template(
        "work_detail.html",
        **_chrome(
            house,
            "works",
            work=payload,
            title=f"Cirrus - {payload['title']}",
        ),
    )


@bp.get("/talents")
@bp.get("/talents/")
def talents_roster() -> str:
    house = _house()
    talents = repo.public_talents(house)
    disciplines = repo.discipline_set(house["id"])
    requested = (request.args.get("discipline") or "").strip().lower()
    active = requested if requested in disciplines else (disciplines[0] if disciplines else None)
    return render_template(
        "talents.html",
        **_chrome(
            house,
            "talents",
            talents=talents,
            disciplines=disciplines,
            active_discipline=active,
            title="Cirrus - Talents",
        ),
    )


@bp.get("/talents/<slug>")
def talent_detail(slug: str):
    house = _house()
    payload = repo.public_talent(house, slug)
    if payload is None:
        moved = repo.redirect_target(house["id"], "talent", slug)
        if moved is not None and moved["published"]:
            return redirect(url_for("views.talent_detail", slug=moved["slug"]), code=301)
        abort(404)
    return render_template(
        "talent_detail.html",
        **_chrome(
            house,
            "talents",
            talent=payload,
            title=f"Cirrus - {payload['title']}",
        ),
    )


@bp.get("/about")
def about() -> str:
    house = _house()
    return render_template(
        "about.html",
        **_chrome(
            house,
            "about",
            figure_lines=ABOUT_FIGURE,
            body_lines=ABOUT_BODY_LINES,
            body_second=ABOUT_BODY_SECOND,
            lockup=LOCKUP,
            title="Cirrus - About",
        ),
    )


def _carry_session(response: Response, token: str) -> Response:
    """The studio pages read the same bearer the API reads, from a cookie."""
    response.set_cookie(
        config.SESSION_COOKIE,
        token,
        max_age=config.SESSION_HOURS * 3600,
        httponly=True,
        samesite="Lax",
        secure=config.public_url().startswith("https://"),
        path="/",
    )
    return response


@bp.get("/signup")
def signup_page() -> str:
    house = _house()
    return render_template(
        "signup.html", **_chrome(house, "signup", title="Cirrus - Sign up")
    )


@bp.post("/signup")
def signup_submit():
    house = _house()
    email = (request.form.get("email") or "").strip()
    password = request.form.get("password") or ""
    try:
        account = create_viewer(email, password)
    except Denied as denied:
        return (
            render_template(
                "signup.html",
                **_chrome(
                    house,
                    "signup",
                    title="Cirrus - Sign up",
                    reason=denied.reason,
                    email=email,
                ),
            ),
            denied.status,
        )
    response = redirect(url_for("views.entry"), code=303)
    return _carry_session(make_response(response), mint_token(int(account["id"])))


@bp.get("/studio/login")
def studio_login() -> str:
    house = _house()
    reason = (
        "Your session ended. Sign in to continue."
        if request.args.get("expired") is not None
        else None
    )
    return render_template(
        "studio_login.html",
        **_chrome(house, "studio", title="Cirrus - Studio", reason=reason),
    )


@bp.post("/studio/login")
def studio_login_submit():
    house = _house()
    email = (request.form.get("email") or "").strip()
    password = request.form.get("password") or ""
    try:
        account = authenticate(email, password)
    except Denied as denied:
        return (
            render_template(
                "studio_login.html",
                **_chrome(
                    house,
                    "studio",
                    title="Cirrus - Studio",
                    reason=denied.reason,
                    email=email,
                ),
            ),
            denied.status,
        )
    destination = "views.studio_palette" if account["role"] == "producer" else "views.entry"
    response = redirect(url_for(destination), code=303)
    return _carry_session(make_response(response), mint_token(int(account["id"])))


@bp.post("/studio/logout")
def studio_logout():
    """Signing out makes the studio unreachable at once."""
    response = make_response(redirect(url_for("views.entry"), code=303))
    response.delete_cookie(config.SESSION_COOKIE, path="/")
    return response


def _producer_or_redirect():
    """A visitor lands on the sign-in route; a viewer is refused to the entry route."""
    account = current_account()
    if account is None:
        return None, redirect(url_for("views.studio_login"), code=303)
    if account["role"] != "producer":
        return None, redirect(url_for("views.entry", refused="studio"), code=303)
    return account, None


def _studio_context(house: dict[str, Any], account: dict[str, Any], **extra: Any):
    own_house = repo.house_by_id(int(account["house_id"])) if account["house_id"] else house
    rows = repo.house_items(int(account["house_id"]))
    context = _chrome(
        house,
        "studio",
        title="Cirrus - Studio",
        studio_house=own_house,
        records=[repo.studio_payload(row) for row in rows],
        bearer=bearer_from_request() or "",
        disciplines=list(repo.DISCIPLINES),
        variants=list(repo.VARIANTS),
    )
    context.update(extra)
    return context


@bp.get("/studio")
def studio_palette():
    account, bounce = _producer_or_redirect()
    if bounce is not None:
        return bounce
    house = _house()
    return render_template("studio_palette.html", **_studio_context(house, account))


@bp.get("/studio/talents/new")
@bp.get("/studio/works/new")
def studio_create():
    account, bounce = _producer_or_redirect()
    if bounce is not None:
        return bounce
    house = _house()
    kind = "talent" if request.path.startswith("/studio/talents") else "work"
    return render_template(
        "studio_form.html",
        **_studio_context(house, account, kind=kind, record=None),
    )


@bp.get("/studio/items/<item_id>")
def studio_edit(item_id: str):
    account, bounce = _producer_or_redirect()
    if bounce is not None:
        return bounce
    house = _house()
    item = _own_record(item_id, account)
    return render_template(
        "studio_form.html",
        **_studio_context(
            house, account, kind=item["kind"], record=repo.studio_payload(item)
        ),
    )


@bp.get("/studio/items/<item_id>/published")
def studio_published(item_id: str):
    account, bounce = _producer_or_redirect()
    if bounce is not None:
        return bounce
    house = _house()
    item = _own_record(item_id, account)
    payload = repo.studio_payload(item)
    return render_template(
        "studio_published.html",
        **_studio_context(house, account, record=payload, kind=item["kind"]),
    )


def _own_record(item_id: str, account: dict[str, Any]) -> dict[str, Any]:
    try:
        numeric = int(item_id)
    except (TypeError, ValueError):
        abort(404)
    item = repo.item_in_house(numeric, int(account["house_id"]))
    if item is None:
        abort(404)
    return item


@bp.get("/preview/<token>")
def preview_page(token: str):
    account, bounce = _producer_or_redirect()
    if bounce is not None:
        return bounce
    house = _house()
    item = resolve_preview(token, account)
    if item is None:
        abort(404)
    payload = repo.preview_payload(item)
    response = make_response(
        render_template(
            "preview.html",
            **_chrome(
                house,
                "preview",
                record=payload,
                token=token,
                title="Cirrus - Preview",
            ),
        )
    )
    # Kept out of every shared cache and out of every index.
    response.headers["Cache-Control"] = "private, no-store, max-age=0"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@bp.get("/share.svg")
def share_image() -> Response:
    house = _house()
    response = Response(media.share_svg(house["name"].lower()), mimetype=media.SVG_MIME)
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@bp.get("/robots.txt")
def robots() -> Response:
    body = "User-agent: *\nDisallow: /studio\nDisallow: /preview\nAllow: /\n"
    return Response(body, mimetype="text/plain; charset=utf-8")
