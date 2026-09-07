"""Asserts the publish and ownership boundary against a running server.

Run: .venv/bin/python verify_boundary.py [base_url]
"""
import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
PW = "deku-demo-pw-2026"

results = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=20) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw)
            except Exception:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else "  -> " + str(detail)))


def login(email):
    s, d = call("POST", "/api/auth/login", body={"email": email, "password": PW})
    assert s == 200, (s, d)
    return d["token"]


cirrus = login("producer@example.com")
meridian = login("producer.meridian@example.com")
viewer = login("viewer@example.com")

# --- what each surface holds -------------------------------------------------
s, works = call("GET", "/api/works")
check("GET /api/works returns 12 in a top-level array",
      s == 200 and isinstance(works, list) and len(works) == 12, (s, len(works)))
check("ordinals are contiguous 001..012",
      [w["ordinal_label"] for w in works] == [f"{i:03d}" for i in range(1, 13)],
      [w["ordinal_label"] for w in works])
s, talents = call("GET", "/api/talents")
check("GET /api/talents returns 3", s == 200 and len(talents) == 3, (s, len(talents)))
s, disc = call("GET", "/api/disciplines")
check("disciplines are director then photographer", disc == ["director", "photographer"], disc)
s, halo = call("GET", "/api/works/the-halo")
check("012 wraps to 001",
      halo["prev"]["ordinal_label"] == "012" and halo["next"]["ordinal_label"] == "002",
      (halo["prev"], halo["next"]))

# --- 1 & 2: unlisted is absent, not merely unlinked --------------------------
check("unlisted work absent from the index",
      all(w["slug"] != "the-quiet-room" for w in works))
check("unlisted talent absent from the roster",
      all(t["slug"] != "noor-vasquez" for t in talents))
check("stylist absent from the discipline set while unlisted", "stylist" not in disc, disc)
s, _ = call("GET", "/api/talents/noor-vasquez")
check("GET /api/talents/noor-vasquez is 404 for a visitor", s == 404, s)
s, _ = call("GET", "/api/works/the-quiet-room")
check("GET /api/works/the-quiet-room is 404 for a visitor", s == 404, s)
s, _ = call("GET", "/api/talents/rives")
check("GET /api/talents/rives answers", s == 200, s)

# --- 4: the generated pixels of an unlisted record ---------------------------
s, items = call("GET", "/api/studio/items", cirrus)
noor = next(i for i in items if i["slug"] == "noor-vasquez")
quiet = next(i for i in items if i["slug"] == "the-quiet-room")
noor_media = noor["poster"]["media_id"]
quiet_media = quiet["poster"]["media_id"]
published_media = works[0]["poster"]["media_id"]

s, _ = call("GET", f"/api/media/{published_media}")
check("published media renders for a visitor", s == 200, s)
s, _ = call("GET", f"/api/media/{noor_media}")
check("unlisted talent's pixels 404 to an anonymous caller holding the id", s == 404, s)
s, _ = call("GET", f"/api/media/{quiet_media}")
check("unlisted work's pixels 404 to an anonymous caller holding the id", s == 404, s)
s, _ = call("GET", f"/api/media/{noor_media}", viewer)
check("unlisted media 404 to a signed-in viewer", s == 404, s)
s, _ = call("GET", f"/api/media/{noor_media}", meridian)
check("unlisted media 404 to the other house's producer", s == 404, s)
s, _ = call("GET", f"/api/media/{noor_media}", cirrus)
check("unlisted media renders for its own house's producer", s == 200, s)

# --- 6: viewer and anonymous on /api/studio/ ---------------------------------
for name, tok in [("no token", None), ("a viewer token", viewer)]:
    s, _ = call("GET", "/api/studio/items", tok)
    check(f"GET /api/studio/items denied with {name}", s in (401, 403), s)
    s, _ = call("GET", f"/api/studio/items/{noor['id']}", tok)
    check(f"studio read denied with {name}", s in (401, 403), s)
    s, _ = call("POST", f"/api/studio/items/{noor['id']}/publish", tok, {"published": True})
    check(f"publish denied with {name}", s in (401, 403), s)
    s, _ = call("POST", "/api/studio/items", tok,
                {"kind": "talent", "slug": "x-intruder", "title": "X", "discipline": "stylist"})
    check(f"create denied with {name}", s in (401, 403), s)

s, after = call("GET", "/api/talents")
check("the protected record is unchanged after refusals", len(after) == 3, len(after))

# --- 7: the other house's producer at every studio address -------------------
nid = noor["id"]
cases = [
    ("read", "GET", f"/api/studio/items/{nid}", None),
    ("edit", "PATCH", f"/api/studio/items/{nid}", {"title": "Seized"}),
    ("attach media", "POST", f"/api/studio/items/{nid}/media",
     {"role": "gallery", "seed": 5, "width": 100, "height": 100, "alt": "x"}),
    ("publish", "POST", f"/api/studio/items/{nid}/publish", {"published": True}),
    ("unlist", "POST", f"/api/studio/items/{nid}/publish", {"published": False}),
    ("change slug", "POST", f"/api/studio/items/{nid}/slug", {"slug": "seized"}),
    ("mint a token", "POST", "/api/studio/preview-tokens", {"item_id": nid}),
    ("reorder", "POST", "/api/studio/works/order", {"ordered_ids": [quiet["id"]]}),
]
for label, method, path, body in cases:
    s, d = call(method, path, meridian, body)
    check(f"meridian cannot {label} a cirrus record (404, not 403)", s == 404, (s, d))

s, still = call("GET", f"/api/studio/items/{nid}", cirrus)
check("the cirrus record is unchanged after every foreign attempt",
      still["title"] == "Noor Vasquez" and still["slug"] == "noor-vasquez"
      and still["published"] is False, still)

# meridian's own records still work, so the refusal is scoping and not breakage
s, mine = call("GET", "/api/studio/items", meridian)
check("meridian can read its own two records", s == 200 and len(mine) == 2, (s, mine))

# --- 5: preview tokens -------------------------------------------------------
s, minted = call("POST", "/api/studio/preview-tokens", cirrus, {"item_id": nid})
check("a token is 32 lowercase hex characters",
      s == 201 and len(minted["token"]) == 32
      and all(c in "0123456789abcdef" for c in minted["token"]), minted)
tok = minted["token"]
s, d = call("GET", f"/api/preview/{tok}", cirrus)
check("the owning producer resolves the preview",
      s == 200 and d["record"]["slug"] == "noor-vasquez", s)
s, _ = call("GET", f"/api/preview/{tok}", meridian)
check("the other house's producer gets 404 on the preview", s == 404, s)
s, _ = call("GET", f"/api/preview/{tok}", viewer)
check("a viewer gets 404 on the preview", s == 404, s)
s, _ = call("GET", f"/api/preview/{tok}")
check("an anonymous caller gets 404 on the preview", s == 404, s)
s, _ = call("GET", "/api/preview/" + "f" * 32, cirrus)
check("an unknown token is 404", s == 404, s)

# --- 3: publish refuses an empty poster alt, and nothing changes -------------
s, made = call("POST", "/api/studio/items", cirrus,
               {"kind": "talent", "slug": "alt-test-talent", "title": "Alt Test",
                "discipline": "stylist"})
check("a studio record is created unlisted with published_at null",
      s == 201 and made["published"] is False and made["published_at"] is None, made)
mid = made["id"]
s, d = call("POST", f"/api/studio/items/{mid}/media", cirrus,
            {"role": "poster", "seed": 7, "width": 246, "height": 328, "alt": "   "})
check("an empty poster alt is refused at attach time", s == 422, (s, d))
s, d = call("POST", f"/api/studio/items/{mid}/publish", cirrus, {"published": True})
check("publishing a record with no valid poster is refused", s == 422, (s, d))
s, d = call("GET", f"/api/studio/items/{mid}", cirrus)
check("nothing changed after the refusal", d["published"] is False, d)

# --- slug uniqueness held at the database -----------------------------------
s, d = call("POST", "/api/studio/items", cirrus,
            {"kind": "talent", "slug": "rives", "title": "Duplicate", "discipline": "director"})
check("a duplicate slug is rejected with a reason", s == 409 and "error" in d, (s, d))
s, d = call("POST", "/api/studio/items", cirrus,
            {"kind": "talent", "slug": "RIVES", "title": "Duplicate", "discipline": "director"})
check("uniqueness is decided after lowercasing", s in (409, 422), (s, d))
s, d = call("POST", "/api/studio/items", meridian,
            {"kind": "talent", "slug": "rives", "title": "Rives", "discipline": "director"})
check("the same slug is free in the other house", s == 201, (s, d))
if s == 201:
    call("PATCH", f"/api/studio/items/{d['id']}", meridian, {"title": "Rives"})

# --- signup always issues a viewer with no house ----------------------------
import time
addr = f"stranger{int(time.time())}@example.com"
s, d = call("POST", "/api/auth/signup",
            body={"email": addr, "password": "a-long-enough-pw",
                  "role": "producer", "house_id": 1, "house": "cirrus"})
check("signup ignores role and house in the body and issues a viewer",
      s == 201 and d["account"]["role"] == "viewer" and d["account"]["house"] is None, d)
s, _ = call("GET", "/api/studio/items", d["token"])
check("the new account cannot reach the studio", s in (401, 403), s)

print()
failed = [r for r in results if not r[1]]
print(f"{len(results) - len(failed)} / {len(results)} passed")
sys.exit(1 if failed else 0)
