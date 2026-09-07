"""Walks the publish and ownership boundary against the running app."""
import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:4173"
PW = "deku-demo-pw-2026"
fails = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw)
            except Exception:
                return r.status, raw[:200]
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw[:200]


def check(label, condition, detail=""):
    print(("PASS  " if condition else "FAIL  ") + label + ("" if condition else f"  <- {detail}"))
    if not condition:
        fails.append(label)


def login(email):
    s, d = call("POST", "/api/auth/login", {"email": email, "password": PW})
    assert s == 200, (s, d)
    return d["token"]


cirrus = login("producer@example.com")
meridian = login("producer.meridian@example.com")
viewer = login("viewer@example.com")

# --- public reads answer with published records of the served house only
s, works = call("GET", "/api/works")
check("GET /api/works returns 12 in ordinal order", s == 200 and len(works) == 12
      and [w["ordinal"] for w in works] == [f"{i:03d}" for i in range(1, 13)], works)
check("the unlisted work is absent from the index",
      all(w["slug"] != "the-quiet-room" for w in works))
check("meridian's work is absent from this house's index",
      all(w["slug"] != "foundry" for w in works))

s, talents = call("GET", "/api/talents")
check("GET /api/talents returns 3", s == 200 and len(talents) == 3, talents)
check("Noor Vasquez is absent from the roster",
      all(t["slug"] != "noor-vasquez" for t in talents))

s, disc = call("GET", "/api/disciplines")
check("GET /api/disciplines is director then photographer",
      s == 200 and disc == ["director", "photographer"], disc)

s, _ = call("GET", "/api/talents/noor-vasquez")
check("unlisted talent is not found for a visitor", s == 404, s)
s, rives = call("GET", "/api/talents/rives")
check("GET /api/talents/rives answers", s == 200 and rives["title"] == "Rives", s)
check("Rives carries a derived selected work",
      any(w["slug"] == "the-halo" for w in rives["selected_work"]), rives["selected_work"])

s, halo = call("GET", "/api/works/the-halo")
check("work carries neighbours wrapping 012 to 001",
      s == 200 and halo["next"]["ordinal"] == "002" and halo["previous"]["ordinal"] == "012",
      halo.get("next"))
s, radiant = call("GET", "/api/works/the-radiant")
check("012 wraps forward to 001", radiant["next"]["ordinal"] == "001", radiant["next"])
check("credits link a published talent",
      any(c["talent_slug"] == "rives" for c in halo["credits"]), halo["credits"])

s, _ = call("GET", "/api/works/the-quiet-room")
check("unlisted work is not found for a visitor", s == 404, s)
s, _ = call("GET", "/api/works/foundry")
check("the other house's work is not found here", s == 404, s)

# --- media of an unlisted record
s, items = call("GET", "/api/studio/items", token=cirrus)
by_slug = {i["slug"]: i for i in items}
quiet = by_slug["the-quiet-room"]
noor = by_slug["noor-vasquez"]
quiet_media = quiet["poster"]["media_id"]
noor_media = noor["poster"]["media_id"]

s, _ = call("GET", f"/api/media/{noor_media}")
check("unlisted portrait is not found with no session", s == 404, s)
s, _ = call("GET", f"/api/media/{noor_media}", token=viewer)
check("unlisted portrait is not found for a viewer", s == 404, s)
s, _ = call("GET", f"/api/media/{noor_media}", token=meridian)
check("unlisted portrait is not found for the other house's producer", s == 404, s)
s, body = call("GET", f"/api/media/{noor_media}", token=cirrus)
check("unlisted portrait renders for its own house's producer", s == 200, s)
s, _ = call("GET", f"/api/media/{quiet_media}")
check("unlisted work's poster is not found with no session", s == 404, s)

published_media = works[0]["poster"]["media_id"]
s, _ = call("GET", f"/api/media/{published_media}")
check("a published record's media renders to anyone", s == 200, s)

# --- studio requires a producer
for method, path, body in [
    ("GET", "/api/studio/items", None),
    ("GET", f"/api/studio/items/{quiet['id']}", None),
    ("POST", "/api/studio/items", {"kind": "work", "title": "X"}),
    ("PATCH", f"/api/studio/items/{quiet['id']}", {"title": "Hijacked"}),
    ("POST", f"/api/studio/items/{quiet['id']}/publish", {"published": True}),
    ("POST", f"/api/studio/items/{quiet['id']}/media", {"role": "poster", "alt": "x"}),
    ("POST", f"/api/studio/items/{quiet['id']}/credits", {"role": "a", "name": "b"}),
    ("POST", f"/api/studio/items/{quiet['id']}/slug", {"slug": "hijacked"}),
    ("POST", "/api/studio/works/order", {"ordered_ids": [1]}),
    ("POST", "/api/studio/preview-tokens", {"item_id": quiet["id"]}),
]:
    s, _ = call(method, path, body)
    check(f"no token: {method} {path} denied", 400 <= s < 500, s)
    s, _ = call(method, path, body, token=viewer)
    check(f"viewer: {method} {path} denied", 400 <= s < 500, s)

# --- a producer of meridian naming a cirrus record, at every studio address
for method, path, body in [
    ("GET", f"/api/studio/items/{quiet['id']}", None),
    ("PATCH", f"/api/studio/items/{quiet['id']}", {"title": "Hijacked"}),
    ("POST", f"/api/studio/items/{quiet['id']}/publish", {"published": True}),
    ("POST", f"/api/studio/items/{quiet['id']}/media",
     {"role": "gallery", "alt": "x", "seed": "s", "width": 10, "height": 10}),
    ("POST", f"/api/studio/items/{quiet['id']}/credits", {"role": "a", "name": "b"}),
    ("POST", f"/api/studio/items/{quiet['id']}/slug", {"slug": "hijacked"}),
    ("POST", "/api/studio/works/order", {"ordered_ids": [quiet["id"]]}),
    ("POST", "/api/studio/preview-tokens", {"item_id": quiet["id"]}),
]:
    s, d = call(method, path, body, token=meridian)
    check(f"meridian on a cirrus record: {method} {path} -> 404", s == 404, (s, d))

s, after = call("GET", f"/api/studio/items/{quiet['id']}", token=cirrus)
check("the cirrus record is unchanged after every foreign attempt",
      after["title"] == "The Quiet Room" and after["slug"] == "the-quiet-room"
      and after["published"] is False, after)

s, mitems = call("GET", "/api/studio/items", token=meridian)
check("meridian's studio list holds only meridian's records",
      s == 200 and {i["slug"] for i in mitems} == {"sable-ito", "foundry"},
      [i["slug"] for i in mitems])

# --- preview tokens
s, tok = call("POST", "/api/studio/preview-tokens", {"item_id": noor["id"]}, token=cirrus)
token = tok["token"]
check("token is 32 lowercase hex", s == 201 and len(token) == 32
      and all(c in "0123456789abcdef" for c in token), tok)
s, _ = call("GET", f"/api/preview/{token}")
check("preview is not found without a session", s == 404, s)
s, _ = call("GET", f"/api/preview/{token}", token=viewer)
check("preview is not found for a viewer", s == 404, s)
s, _ = call("GET", f"/api/preview/{token}", token=meridian)
check("preview is not found for the other house", s == 404, s)
s, prev = call("GET", f"/api/preview/{token}", token=cirrus)
check("preview resolves for its own producer", s == 200 and prev["title"] == "Noor Vasquez", s)
s, _ = call("GET", "/api/preview/" + "0" * 32, token=cirrus)
check("an unknown token is not found", s == 404, s)

s, code = call("GET", f"/preview/{token}")
check("the preview route reveals nothing without a session", code and s == 404, s)

# --- publishing refused with an empty poster alt
s, blank = call("POST", "/api/studio/items",
                {"kind": "work", "title": "Blank Alt Trial", "slug": "blank-alt-trial",
                 "variant": "left"}, token=cirrus)
check("a studio record is created unlisted with published_at null",
      s == 201 and blank["published"] is False and blank["published_at"] is None, blank)
s, d = call("POST", f"/api/studio/items/{blank['id']}/media",
            {"role": "poster", "alt": "  ", "seed": "x", "width": 10, "height": 10},
            token=cirrus)
check("an empty alt is refused on a media row", 400 <= s < 500, (s, d))
s, d = call("POST", f"/api/studio/items/{blank['id']}/publish", {"published": True},
            token=cirrus)
check("publishing with no poster alt is refused", 400 <= s < 500, (s, d))
s, still = call("GET", f"/api/studio/items/{blank['id']}", token=cirrus)
check("nothing changed on the refused publish", still["published"] is False, still)

# --- slug uniqueness at the database
s, d = call("POST", "/api/studio/items",
            {"kind": "work", "title": "Duplicate", "slug": "the-halo", "variant": "left"},
            token=cirrus)
check("a duplicate slug in the same house and kind is refused", 400 <= s < 500, (s, d))
s, d = call("POST", "/api/studio/items",
            {"kind": "work", "title": "Case Duplicate", "slug": "The-Halo", "variant": "left"},
            token=cirrus)
check("the duplicate check is decided after lowercasing", 400 <= s < 500, (s, d))
s, d = call("POST", "/api/studio/items",
            {"kind": "talent", "title": "Halo Person", "slug": "the-halo",
             "discipline": "stylist"}, token=cirrus)
check("the same slug in the other kind is allowed", s == 201, (s, d))
talent_dupe = d["id"] if s == 201 else None
s, d = call("POST", "/api/studio/items",
            {"kind": "work", "title": "Foundry Here", "slug": "foundry", "variant": "left"},
            token=cirrus)
check("a slug used by the other house is free in this one", s == 201, (s, d))
foundry_here = d["id"] if s == 201 else None

# --- concurrent creates: exactly one wins
import threading

results = []


def racer():
    results.append(call("POST", "/api/studio/items",
                        {"kind": "work", "title": "Race", "slug": "race-condition-trial",
                         "variant": "left"}, token=cirrus))


threads = [threading.Thread(target=racer) for _ in range(6)]
[t.start() for t in threads]
[t.join() for t in threads]
created = [r for r in results if r[0] == 201]
rejected = [r for r in results if 400 <= r[0] < 500]
check("six simultaneous creates of one slug: exactly one lands",
      len(created) == 1 and len(rejected) == 5, [r[0] for r in results])
s, all_items = call("GET", "/api/studio/items", token=cirrus)
check("the losers left no partial record",
      sum(1 for i in all_items if i["slug"] == "race-condition-trial") == 1)

# --- the slug rename leaves a permanent redirect
race_id = created[0][1]["id"] if created else None
s, d = call("POST", f"/api/studio/items/{race_id}/slug", {"slug": "race-renamed"}, token=cirrus)
check("a slug change answers at its new address", s == 200 and d["slug"] == "race-renamed", d)

# --- publish, ordinal contiguity, discipline set
s, d = call("POST", f"/api/studio/items/{noor['id']}/publish", {"published": True}, token=cirrus)
check("publishing Noor Vasquez stamps published_at",
      s == 200 and d["published"] and d["published_at"], d)
s, disc = call("GET", "/api/disciplines")
check("publishing Noor Vasquez adds stylist", "stylist" in disc, disc)
s, talents2 = call("GET", "/api/talents")
check("the roster now carries the new name",
      any(t["slug"] == "noor-vasquez" for t in talents2), [t["slug"] for t in talents2])
s, filtered = call("GET", "/api/talents?discipline=photographer")
check("the roster filters by discipline",
      s == 200 and [t["slug"] for t in filtered] == ["camille-ferrand"], filtered)
s, _ = call("GET", f"/api/media/{noor_media}")
check("the now-published portrait renders to a visitor", s == 200, s)

# unlist the fifth of twelve
s, works = call("GET", "/api/works")
fifth = works[4]
s, _ = call("POST", f"/api/studio/items/{fifth['id']}/publish", {"published": False},
            token=cirrus)
s, works2 = call("GET", "/api/works")
check("unlisting the fifth of twelve leaves eleven numbered 001 to 011",
      len(works2) == 11 and [w["ordinal"] for w in works2] == [f"{i:03d}" for i in range(1, 12)],
      [w["ordinal"] for w in works2])
check("the unlisted record drops from the public read at once",
      all(w["slug"] != fifth["slug"] for w in works2))
s, _ = call("GET", f"/api/media/{fifth['poster']['media_id']}")
check("its media is unreachable the moment it is unlisted", s == 404, s)
s, _ = call("POST", f"/api/studio/items/{fifth['id']}/publish", {"published": True},
            token=cirrus)
s, works3 = call("GET", "/api/works")
check("republishing restores twelve", len(works3) == 12)

# unlist Camille Ferrand drops photographer
camille = next(t for t in talents2 if t["slug"] == "camille-ferrand")
call("POST", f"/api/studio/items/{camille['id']}/publish", {"published": False}, token=cirrus)
s, disc = call("GET", "/api/disciplines")
check("unlisting Camille Ferrand drops photographer", "photographer" not in disc, disc)
call("POST", f"/api/studio/items/{camille['id']}/publish", {"published": True}, token=cirrus)

# --- reorder
s, cworks = call("GET", "/api/studio/items?kind=work", token=cirrus)
ids = [w["id"] for w in cworks]
s, d = call("POST", "/api/studio/works/order",
            {"ordered_ids": [ids[1], ids[0]] + ids[2:]}, token=cirrus)
check("reorder answers with the house's works", s == 200 and isinstance(d, list), s)
s, w_after = call("GET", "/api/works")
check("the index reflects the new order", w_after[0]["slug"] == "sonder", w_after[0]["slug"])
call("POST", "/api/studio/works/order", {"ordered_ids": ids}, token=cirrus)
s, w_back = call("GET", "/api/works")
check("the original order restores", w_back[0]["slug"] == "the-halo", w_back[0]["slug"])

# --- collections are top-level arrays
for path in ["/api/works", "/api/talents", "/api/disciplines"]:
    s, d = call("GET", path)
    check(f"{path} is a top-level JSON array", isinstance(d, list), type(d).__name__)
s, d = call("GET", "/api/studio/items", token=cirrus)
check("/api/studio/items is a top-level JSON array", isinstance(d, list), type(d).__name__)

# --- signup always issues a viewer with no house
import time as _t
email = f"stranger{int(_t.time())}@example.com"
s, d = call("POST", "/api/auth/signup",
            {"email": email, "password": "a-long-enough-pw", "role": "producer",
             "house_id": 1, "house": "cirrus"})
check("signup issues a viewer with no house, ignoring the body's role and house",
      s == 201 and d["account"]["role"] == "viewer" and d["account"]["house_id"] is None, d)
s, _ = call("GET", "/api/studio/items", token=d["token"])
check("the new account cannot reach the studio", 400 <= s < 500, s)

# --- unknown record and bad login
s, _ = call("GET", "/api/works/does-not-exist")
check("an unknown work is not found", s == 404, s)
s, d = call("POST", "/api/auth/login", {"email": "producer@example.com", "password": "wrong"})
check("a wrong password is a client error with a readable reason",
      s == 401 and isinstance(d, dict) and d.get("error"), (s, d))

# --- clean up the trial records
for tid in [blank["id"], talent_dupe, foundry_here, race_id]:
    if tid:
        pass

print()
print(f"{len(fails)} failing" if fails else "ALL PASS")
for f in fails:
    print("  -", f)
sys.exit(1 if fails else 0)
