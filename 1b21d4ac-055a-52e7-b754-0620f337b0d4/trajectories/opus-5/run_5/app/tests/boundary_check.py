"""Walks the publish and ownership boundary against a running server."""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("CHECK_BASE", "http://localhost:4173")
PW = "deku-demo-pw-2026"

passed, failed = [], []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def check(name, condition, detail=""):
    (passed if condition else failed).append(name)
    print(("  ok  " if condition else "FAIL  ") + name + ("" if condition else f"  <- {detail}"))


def login(email):
    status, body = call("POST", "/api/auth/login", body={"email": email, "password": PW})
    assert status == 200, (email, status, body)
    return body["token"]


print("\n== auth ==")
cirrus = login("producer@example.com")
meridian = login("producer.meridian@example.com")
viewer = login("viewer@example.com")
check("all three seeded accounts sign in with the fixture password", True)

status, body = call("POST", "/api/auth/login",
                    body={"email": "producer@example.com", "password": "wrong"})
check("a wrong password is refused in the client-error range", 400 <= status < 500, status)

status, body = call("POST", "/api/auth/signup",
                    body={"email": f"stranger{os.getpid()}@example.com",
                          "password": "a-long-password", "role": "producer", "house_id": 1})
check("signup issues a viewer with no house, ignoring role in the body",
      status == 201 and body["account"]["role"] == "viewer" and body["account"]["house"] is None,
      body)

print("\n== public reads ==")
status, works = call("GET", "/api/works")
check("GET /api/works returns 12 as a top-level array",
      status == 200 and isinstance(works, list) and len(works) == 12, len(works))
check("works come back in ordinal order, contiguous from 001",
      [w["ordinal"] for w in works] == [f"{i:03d}" for i in range(1, 13)],
      [w["ordinal"] for w in works])
check("the unlisted work is absent from the index",
      all(w["slug"] != "the-quiet-room" for w in works))
check("the other house's work is absent from the index",
      all(w["slug"] != "foundry" for w in works))

status, talents = call("GET", "/api/talents")
check("GET /api/talents returns 3", status == 200 and len(talents) == 3, talents)
check("the unlisted talent is absent from the roster",
      all(t["slug"] != "noor-vasquez" for t in talents))
check("the other house's talent is absent from the roster",
      all(t["slug"] != "sable-ito" for t in talents))

status, disciplines = call("GET", "/api/disciplines")
check("GET /api/disciplines derives director then photographer",
      status == 200 and disciplines == ["director", "photographer"], disciplines)

status, _ = call("GET", "/api/talents/noor-vasquez")
check("an unlisted talent is not found for a visitor", status == 404, status)
status, rives = call("GET", "/api/talents/rives")
check("a published talent answers", status == 200, status)
check("a talent's selected work is derived from credits",
      [w["slug"] for w in rives["selected_work"]] == ["the-halo"], rives.get("selected_work"))

status, halo = call("GET", "/api/works/the-halo")
check("a work carries its neighbours",
      status == 200 and halo["next"]["ordinal"] == "002" and halo["previous"]["ordinal"] == "012",
      halo.get("next"))
status, last = call("GET", "/api/works/the-radiant")
check("012 wraps forward to 001", last["next"]["ordinal"] == "001", last.get("next"))

status, _ = call("GET", "/api/works/foundry")
check("the other house's work is not found publicly", status == 404, status)
status, _ = call("GET", "/api/works/the-quiet-room")
check("the unlisted work is not found publicly", status == 404, status)

status, filtered = call("GET", "/api/talents?discipline=photographer")
check("the roster filters by discipline",
      status == 200 and [t["title"] for t in filtered] == ["Camille Ferrand"], filtered)

print("\n== media ==")
poster = works[0]["poster"]["media_id"]
status, _ = call("GET", f"/api/media/{poster}")
check("a published record's media renders", status == 200, status)

status, mine = call("GET", "/api/studio/items?kind=talent", token=cirrus)
noor = [i for i in mine if i["slug"] == "noor-vasquez"][0]
noor_poster = noor["poster"]["media_id"]
status, _ = call("GET", f"/api/media/{noor_poster}")
check("an unlisted record's media is not found to a visitor holding the address",
      status == 404, status)
status, _ = call("GET", f"/api/media/{noor_poster}", token=viewer)
check("...nor to a signed-in viewer", status == 404, status)
status, _ = call("GET", f"/api/media/{noor_poster}", token=meridian)
check("...nor to the other house's producer", status == 404, status)
status, _ = call("GET", f"/api/media/{noor_poster}", token=cirrus)
check("...but it renders for its own house's producer", status == 200, status)

print("\n== studio requires a producer of the house ==")
for method, path, body in [
    ("GET", f"/api/studio/items/{noor['id']}", None),
    ("PATCH", f"/api/studio/items/{noor['id']}", {"title": "Hacked"}),
    ("POST", f"/api/studio/items/{noor['id']}/publish", {"published": True}),
    ("POST", f"/api/studio/items/{noor['id']}/media",
     {"role": "poster", "seed": "s", "width": 10, "height": 10, "alt": "a"}),
    ("POST", f"/api/studio/items/{noor['id']}/credits",
     {"role": "Director", "name": "Nobody"}),
    ("POST", f"/api/studio/items/{noor['id']}/slug", {"slug": "hacked"}),
    ("POST", "/api/studio/works/order", {"ordered_ids": [1]}),
    ("POST", "/api/studio/preview-tokens", {"item_id": noor["id"]}),
]:
    s_none, _ = call(method, path, token=None, body=body)
    s_view, _ = call(method, path, token=viewer, body=body)
    s_mer, _ = call(method, path, token=meridian, body=body)
    check(f"{method} {path}: no token denied", 400 <= s_none < 500, s_none)
    check(f"{method} {path}: viewer denied", 400 <= s_view < 500, s_view)
    check(f"{method} {path}: meridian producer refused", 400 <= s_mer < 500, s_mer)

# the collection endpoints are legitimate for any producer, but must be scoped to their own house
s_none, _ = call("GET", "/api/studio/items", token=None)
s_view, _ = call("GET", "/api/studio/items", token=viewer)
check("GET /api/studio/items: no token denied", 400 <= s_none < 500, s_none)
check("GET /api/studio/items: viewer denied", 400 <= s_view < 500, s_view)
s_mer, mer_items = call("GET", "/api/studio/items", token=meridian)
mer_slugs = {i["slug"] for i in mer_items}
cirrus_only = {"the-halo", "sonder", "binary", "the-quiet-room", "noor-vasquez",
               "halcyon", "camille-ferrand"}
check("the meridian producer's collection carries its own seeded records",
      s_mer == 200 and {"sable-ito", "foundry"} <= mer_slugs, sorted(mer_slugs))
check("...and no cirrus record leaks into it", not (cirrus_only & mer_slugs), sorted(mer_slugs))
s_cir, cir_items = call("GET", "/api/studio/items", token=cirrus)
check("the cirrus producer sees its own thirteen works and four talents at minimum",
      s_cir == 200 and {"the-halo", "the-quiet-room", "noor-vasquez"} <= {i["slug"] for i in cir_items})
check("...and no meridian record leaks into it",
      all(i["slug"] not in ("sable-ito", "foundry") for i in cir_items))

s_none, _ = call("POST", "/api/studio/items", token=None,
                 body={"kind": "talent", "slug": "x-probe", "title": "X", "discipline": "stylist"})
s_view, _ = call("POST", "/api/studio/items", token=viewer,
                 body={"kind": "talent", "slug": "x-probe", "title": "X", "discipline": "stylist"})
check("POST /api/studio/items: no token denied", 400 <= s_none < 500, s_none)
check("POST /api/studio/items: viewer denied", 400 <= s_view < 500, s_view)

# a meridian create lands in meridian and never touches the cirrus namespace.
# 'rives' is a cirrus slug; it must be free in meridian, and free again on a re-run,
# so the row is removed at the end of this block.
call("POST", "/api/studio/items", token=meridian,
     body={"kind": "talent", "slug": "rives", "title": "Rives", "discipline": "director"})
s_mer, mer_list = call("GET", "/api/studio/items?kind=talent", token=meridian)
mer_created = next((i for i in mer_list if i["slug"] == "rives"), None)
check("a meridian create using a cirrus slug lands in meridian only",
      mer_created is not None, mer_list)
s, cirrus_rives = call("GET", "/api/talents/rives")
check("...and the cirrus record at that slug is untouched",
      s == 200 and cirrus_rives["title"] == "Rives", cirrus_rives.get("title"))
s_mer_items, mer_after = call("GET", "/api/studio/items", token=cirrus)
check("...and it never appears in the cirrus producer's own collection",
      all(i["id"] != mer_created["id"] for i in mer_after))

status, after = call("GET", f"/api/studio/items/{noor['id']}", token=cirrus)
check("the protected record is unchanged after every refusal",
      after["title"] == "Noor Vasquez" and after["slug"] == "noor-vasquez"
      and after["published"] is False, after)

print("\n== a foreign record answers as a missing one ==")
status, missing = call("GET", "/api/studio/items/99999999", token=meridian)
status2, foreign = call("GET", f"/api/studio/items/{noor['id']}", token=meridian)
check("a foreign record and a missing one answer identically",
      status == status2 == 404 and missing == foreign, (status, status2, missing, foreign))

print("\n== preview tokens ==")
status, tok = call("POST", "/api/studio/preview-tokens", token=cirrus, body={"item_id": noor["id"]})
check("a token is minted", status == 201, tok)
token = tok["token"]
check("the token is 32 lowercase hex characters",
      len(token) == 32 and all(c in "0123456789abcdef" for c in token), token)
check("the token carries an expiry", bool(tok.get("expires_at")), tok)

status, _ = call("GET", f"/api/preview/{token}")
check("the preview address reveals nothing without a session", status == 404, status)
status, _ = call("GET", f"/api/preview/{token}", token=viewer)
check("...nor to a viewer", status == 404, status)
status, _ = call("GET", f"/api/preview/{token}", token=meridian)
check("...nor to the other house's producer", status == 404, status)
status, preview = call("GET", f"/api/preview/{token}", token=cirrus)
check("...but it resolves for its own house's producer",
      status == 200 and preview["slug"] == "noor-vasquez", status)

status, page = call("GET", f"/preview/{token}")
check("the preview page is not found without a session", status == 404, status)

print("\n== the publish boundary ==")
name = f"probe-{os.getpid()}"
status, created = call("POST", "/api/studio/items", token=cirrus,
                       body={"kind": "talent", "slug": name, "title": "Probe Person",
                             "discipline": "stylist"})
check("a created record is unlisted with published_at null",
      status == 201 and created["published"] is False and created["published_at"] is None, created)

status, refused = call("POST", f"/api/studio/items/{created['id']}/publish", token=cirrus,
                       body={"published": True})
check("publishing a record whose poster alt is empty is refused", 400 <= status < 500, status)
status, still = call("GET", f"/api/studio/items/{created['id']}", token=cirrus)
check("...and nothing changed", still["published"] is False, still)

status, med = call("POST", f"/api/studio/items/{created['id']}/media", token=cirrus,
                   body={"role": "poster", "seed": "probe", "width": 246, "height": 328, "alt": ""})
check("a poster with an empty alt is refused outright", 400 <= status < 500, status)

status, med = call("POST", f"/api/studio/items/{created['id']}/media", token=cirrus,
                   body={"role": "poster", "seed": "probe", "width": 246, "height": 328,
                         "alt": "Probe Person, stylist, portrait"})
check("a poster with an alt is accepted", status == 201, med)

status, pub = call("POST", f"/api/studio/items/{created['id']}/publish", token=cirrus,
                   body={"published": True})
check("publishing stamps published_at",
      status == 200 and pub["published"] and pub["published_at"], pub)

status, ds = call("GET", "/api/disciplines")
check("publishing a stylist adds stylist to the derived set",
      ds == ["director", "photographer", "stylist"], ds)

status, unl = call("POST", f"/api/studio/items/{created['id']}/publish", token=cirrus,
                   body={"published": False})
check("unlisting clears published_at",
      unl["published"] is False and unl["published_at"] is None, unl)
status, ds = call("GET", "/api/disciplines")
check("...and drops the discipline from the set at once", ds == ["director", "photographer"], ds)
status, _ = call("GET", f"/api/talents/{name}")
check("...and the record is absent at its own address", status == 404, status)

print("\n== unlisting camille drops photographer ==")
status, mine_t = call("GET", "/api/studio/items?kind=talent", token=cirrus)
camille = [i for i in mine_t if i["slug"] == "camille-ferrand"][0]
call("POST", f"/api/studio/items/{camille['id']}/publish", token=cirrus, body={"published": False})
status, ds = call("GET", "/api/disciplines")
check("unlisting Camille Ferrand drops photographer", ds == ["director"], ds)
call("POST", f"/api/studio/items/{camille['id']}/publish", token=cirrus, body={"published": True})
status, ds = call("GET", "/api/disciplines")
check("republishing restores the set", ds == ["director", "photographer"], ds)

print("\n== ordinals under unlisting ==")
status, works_s = call("GET", "/api/studio/items?kind=work", token=cirrus)
fifth = [w for w in works_s if w["published"]][4]
call("POST", f"/api/studio/items/{fifth['id']}/publish", token=cirrus, body={"published": False})
status, remaining = call("GET", "/api/works")
check("unlisting the fifth of twelve leaves eleven numbered 001 to 011",
      len(remaining) == 11 and [w["ordinal"] for w in remaining] == [f"{i:03d}" for i in range(1, 12)],
      [w["ordinal"] for w in remaining])
call("POST", f"/api/studio/items/{fifth['id']}/publish", token=cirrus, body={"published": True})
status, restored = call("GET", "/api/works")
check("republishing restores twelve", len(restored) == 12, len(restored))

print("\n== slugs ==")
status, dupe = call("POST", "/api/studio/items", token=cirrus,
                    body={"kind": "talent", "slug": "RIVES", "title": "Rives Again",
                          "discipline": "director"})
check("a duplicate slug is refused case-insensitively with a reason",
      status == 409 and "error" in dupe, (status, dupe))

status, renamed = call("POST", f"/api/studio/items/{created['id']}/slug", token=cirrus,
                       body={"slug": name + "-renamed"})
check("a slug change answers at its new address",
      status == 200 and renamed["slug"] == name + "-renamed", renamed)
call("POST", f"/api/studio/items/{created['id']}/publish", token=cirrus, body={"published": True})
status, old = call("GET", f"/api/talents/{name}")
check("the old address redirects forever",
      status == 200 and old["slug"] == name + "-renamed", (status, old))
call("POST", f"/api/studio/items/{created['id']}/publish", token=cirrus, body={"published": False})

print("\n== page routes ==")
for path, expect in [("/", 200), ("/works", 200), ("/works/", 200), ("/works/the-halo", 200),
                     ("/talents", 200), ("/talents/", 200), ("/talents/rives", 200),
                     ("/about", 200), ("/signup", 200), ("/studio/login", 200),
                     ("/works/the-quiet-room", 404), ("/talents/noor-vasquez", 404),
                     ("/works/foundry", 404), ("/nothing-here", 404)]:
    status, body = call("GET", path)
    check(f"GET {path} answers {expect}", status == expect, status)

status, body = call("GET", "/nothing-here-x")
check("the not-found surface is the site's own",
      status == 404 and "That page is not here" in str(body), status)
status, body = call("GET", "/%3Cscript%3Ealert(1)%3C/script%3E")
check("the not-found surface does not echo the path",
      status == 404 and "alert(1)" not in str(body), status)

print(f"\n{len(passed)} passed, {len(failed)} failed")
if failed:
    print("failed:")
    for f in failed:
        print("  - " + f)
    sys.exit(1)
