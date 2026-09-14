"""Security and behaviour checks against the running app. Not part of the app."""
import json
import random
import urllib.request
import urllib.error
import sys

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
SUF = "%04d" % random.randint(0, 9999)
results = {"pass": 0, "fail": 0}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = urllib.request.build_opener(NoRedirect)


def call(method, path, body=None, token=None, headers=None, follow=False):
    req = urllib.request.Request(BASE + path, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    else:
        data = None
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    op = urllib.request.urlopen if follow else opener.open
    try:
        with op(req, data=data) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def check(desc, want, got):
    if want == got:
        results["pass"] += 1
    else:
        results["fail"] += 1
        print("FAIL %-40s want %r got %r" % (desc, want, got))


PW = "deku-demo-pw-2026"
st, producer = call("POST", "/api/auth/login", {"email": "producer@example.com", "password": PW})
PTOK = producer["token"]
check("producer login", 200, st)
check("producer house", "cirrus", producer["account"]["house"])
st, meridian = call("POST", "/api/auth/login", {"email": "producer.meridian@example.com", "password": PW})
MTOK = meridian["token"]
check("meridian house", "meridian", meridian["account"]["house"])
st, viewer = call("POST", "/api/auth/login", {"email": "viewer@example.com", "password": PW})
VTOK = viewer["token"]
check("viewer house", None, viewer["account"]["house"])
check("login bad password", 401, call("POST", "/api/auth/login", {"email": "producer@example.com", "password": "nope"})[0])

# public reads
st, works = call("GET", "/api/works")
check("works count", 12, len(works))
check("works are ordinal ordered", list(range(1, 13)), [w["ordinal"] for w in works])
st, talents = call("GET", "/api/talents")
check("talents count", 3, len(talents))
st, discs = call("GET", "/api/disciplines")
check("disciplines", ["director", "photographer"], discs)
st, bydisc = call("GET", "/api/talents?discipline=photographer")
check("filter by discipline", ["camille-ferrand"], [t["slug"] for t in bydisc])
check("unlisted talent 404", 404, call("GET", "/api/talents/noor-vasquez")[0])
check("unlisted work 404", 404, call("GET", "/api/works/the-quiet-room")[0])
check("published talent ok", 200, call("GET", "/api/talents/rives")[0])
st, halo = call("GET", "/api/works/the-halo")
check("halo ordinal", 1, halo["ordinal"])
check("halo prev wraps", 12, halo["prev"]["ordinal"])
check("halo next", 2, halo["next"]["ordinal"])
check("halo credits", "Rives", [c["name"] for c in halo["credits"]][0])
st, radiant = call("GET", "/api/works/the-radiant")
check("radiant next wraps to 001", 1, radiant["next"]["ordinal"])
st, rives = call("GET", "/api/talents/rives")
check("rives selected work", ["the-halo"], [w["slug"] for w in rives["selected_work"]])
check("health", 200, call("GET", "/api/health")[0])

# pages
for path, want in [("/", 200), ("/works", 200), ("/works/", 200), ("/works/the-halo", 200),
                   ("/talents", 200), ("/talents/", 200), ("/talents/rives", 200),
                   ("/about", 200), ("/signup", 200), ("/studio/login", 200),
                   ("/nope", 404), ("/works/nope", 404), ("/talents/nope", 404),
                   ("/works/the-quiet-room", 404), ("/talents/noor-vasquez", 404)]:
    check("page %s" % path, want, call("GET", path)[0])

# studio boundary
check("studio no token", 401, call("GET", "/api/studio/items")[0])
check("studio viewer", 403, call("GET", "/api/studio/items", token=VTOK)[0])
check("studio bogus token", 401, call("GET", "/api/studio/items", token="deadbeef")[0])
st, own = call("GET", "/api/studio/items", token=PTOK)
check("own studio list", 200, st)
check("own studio holds at least the seed", True, len(own) >= 17)
st, mlist = call("GET", "/api/studio/items", token=MTOK)
check("meridian studio list", 200, st)
check("meridian holds 2", 2, len(mlist))

noor = [i for i in own if i["slug"] == "noor-vasquez"][0]
quiet = [i for i in own if i["slug"] == "the-quiet-room"][0]
halo_id = [i for i in own if i["slug"] == "the-halo"][0]["id"]

# unlisted media stays dark
st, noor_full = call("GET", "/api/studio/items/%s" % noor["id"], token=PTOK)
noor_media = noor_full["media"][0]["id"]
check("held media anon 404", 404, call("GET", "/api/media/" + noor_media)[0])
check("held media viewer 404", 404, call("GET", "/api/media/" + noor_media, token=VTOK)[0])
check("held media meridian 404", 404, call("GET", "/api/media/" + noor_media, token=MTOK)[0])
check("held media own house 200", 200, call("GET", "/api/media/" + noor_media, token=PTOK)[0])

# a foreign record reads as absent, every studio verb
for verb, path, body in [
    ("GET", "/api/studio/items/%s" % halo_id, None),
    ("PATCH", "/api/studio/items/%s" % halo_id, {"title": "STOLEN"}),
    ("POST", "/api/studio/items/%s/publish" % halo_id, {"published": False}),
    ("POST", "/api/studio/items/%s/media" % halo_id, {"role": "poster", "alt": "x", "width": 100, "height": 100}),
    ("POST", "/api/studio/items/%s/credits" % halo_id, {"role": "Director", "name": "X"}),
    ("POST", "/api/studio/items/%s/slug" % halo_id, {"slug": "stolen"}),
    ("POST", "/api/studio/preview-tokens", {"item_id": halo_id}),
    ("POST", "/api/studio/works/order", {"ordered_ids": [halo_id]}),
]:
    check("meridian %s cirrus" % verb, 404, call(verb, path, body, token=MTOK)[0])
st, works = call("GET", "/api/works")
check("halo untouched", "The Halo", works[0]["title"])
check("halo still published", True, works[0]["published"])

# viewer cannot write
check("viewer publish", 403, call("POST", "/api/studio/items/%s/publish" % halo_id, {"published": False}, token=VTOK)[0])
check("viewer create", 403, call("POST", "/api/studio/items", {"kind": "talent", "title": "X", "discipline": "director"}, token=VTOK)[0])

# publish rules
st, blank = call("POST", "/api/studio/items",
                 {"kind": "talent", "title": "Blank Poster", "slug": "blank-poster-" + SUF, "discipline": "director"}, token=PTOK)
call("POST", "/api/studio/items/%s/media" % blank["id"],
     {"role": "poster", "alt": "", "width": 246, "height": 192}, token=PTOK)
check("publish without alt refused", 400,
      call("POST", "/api/studio/items/%s/publish" % blank["id"], {"published": True}, token=PTOK)[0])
st, blank_after = call("GET", "/api/studio/items/%s" % blank["id"], token=PTOK)
check("refusal left it unlisted", False, blank_after["published"])

# create, hold, preview, publish
st, made = call("POST", "/api/studio/items",
                {"kind": "talent", "title": "Test Person", "slug": "test-person-" + SUF, "discipline": "stylist"}, token=PTOK)
check("create 201", 201, st)
check("created unlisted", False, made["published"])
NEW = made["id"]
check("held record absent", 404, call("GET", "/api/talents/test-person-" + SUF)[0])
check("stylist not yet in filter", ["director", "photographer"], call("GET", "/api/disciplines")[1])
check("held page 404", 404, call("GET", "/talents/test-person-" + SUF)[0])

st, media = call("POST", "/api/studio/items/%s/media" % NEW,
                 {"role": "poster", "alt": "A portrait of Test Person", "width": 246, "height": 192}, token=PTOK)
check("media 201", 201, st)
check("media id is 32 hex", 32, len(media["media_id"]))
check("held media 404", 404, call("GET", "/api/media/" + media["media_id"])[0])

st, tok = call("POST", "/api/studio/preview-tokens", {"item_id": NEW}, token=PTOK)
check("token 201", 201, st)
check("token 32 hex", 32, len(tok["token"]))
check("preview api own", 200, call("GET", "/api/preview/" + tok["token"], token=PTOK)[0])
check("preview api meridian", 404, call("GET", "/api/preview/" + tok["token"], token=MTOK)[0])
check("preview api anon", 404, call("GET", "/api/preview/" + tok["token"])[0])
check("preview api viewer", 404, call("GET", "/api/preview/" + tok["token"], token=VTOK)[0])
check("preview page anon 404", 404, call("GET", "/preview/" + tok["token"])[0])
check("preview page own 200", 200, call("GET", "/preview/" + tok["token"], token=PTOK)[0])
check("preview page meridian 404", 404, call("GET", "/preview/" + tok["token"], token=MTOK)[0])

check("publish with alt", 200, call("POST", "/api/studio/items/%s/publish" % NEW, {"published": True}, token=PTOK)[0])
check("now public", 200, call("GET", "/api/talents/test-person-" + SUF)[0])
check("stylist joins filter", ["director", "photographer", "stylist"], call("GET", "/api/disciplines")[1])
check("media now public", 200, call("GET", "/api/media/" + media["media_id"])[0])
check("published page 200", 200, call("GET", "/talents/test-person-" + SUF)[0])

# unlist drops it everywhere at once
check("unlist", 200, call("POST", "/api/studio/items/%s/publish" % NEW, {"published": False}, token=PTOK)[0])
check("absent after unlist", 404, call("GET", "/api/talents/test-person-" + SUF)[0])
check("filter drops stylist", ["director", "photographer"], call("GET", "/api/disciplines")[1])
check("media gone after unlist", 404, call("GET", "/api/media/" + media["media_id"])[0])
check("page gone after unlist", 404, call("GET", "/talents/test-person-" + SUF)[0])

# rename leaves a redirect
st, ren = call("POST", "/api/studio/items/%s/slug" % NEW, {"slug": "Renamed " + SUF}, token=PTOK)
check("rename lowercases", "renamed-" + SUF, ren["slug"])
check("new slug held", 404, call("GET", "/api/talents/renamed-" + SUF)[0])

# unlist the fifth of twelve leaves eleven numbered 001..011
st, items = call("GET", "/api/studio/items?kind=work", token=PTOK)
fifth = [i for i in items if i.get("ordinal") == 5][0]
check("unlist fifth", 200, call("POST", "/api/studio/items/%s/publish" % fifth["id"], {"published": False}, token=PTOK)[0])
st, works = call("GET", "/api/works")
check("eleven remain", 11, len(works))
check("contiguous 001..011", list(range(1, 12)), [w["ordinal"] for w in works])
check("fifth restored", 200, call("POST", "/api/studio/items/%s/publish" % fifth["id"], {"published": True}, token=PTOK)[0])
check("twelve again", 12, len(call("GET", "/api/works")[1]))

# duplicate slug under concurrency: one wins
import threading
codes = []


def create_same():
    st, _ = call("POST", "/api/studio/items",
                 {"kind": "talent", "title": "Clash", "discipline": "director", "slug": "clash-me"}, token=PTOK)
    codes.append(st)


threads = [threading.Thread(target=create_same) for _ in range(4)]
[t.start() for t in threads]
[t.join() for t in threads]
check("one create wins", 1, codes.count(201))
check("others refused", 3, codes.count(409))

# signup always viewer
st, su = call("POST", "/api/auth/signup", {"email": "stranger-" + SUF + "@example.com", "password": "alongpassword1"})
check("signup 201", 201, st)
check("signup role viewer", "viewer", su["account"]["role"])
check("signup house none", None, su["account"]["house"])
check("signup duplicate", 409, call("POST", "/api/auth/signup", {"email": "stranger-" + SUF + "@example.com", "password": "alongpassword1"})[0])
check("signup short password", 400, call("POST", "/api/auth/signup", {"email": "x@y.zz", "password": "short"})[0])
check("new viewer denied studio", 403, call("GET", "/api/studio/items", token=su["token"])[0])

# role or house in the body is ignored
st, _ = call("POST", "/api/auth/signup", {"email": "sneaky-" + SUF + "@example.com", "password": "alongpassword1",
                                          "role": "producer", "house": "cirrus"})
check("role not read from body", "viewer", _["account"]["role"])
check("sneaky still denied", 403, call("GET", "/api/studio/items", token=_["token"])[0])

# media of a meridian record never serves here
st, ml = call("GET", "/api/studio/items?kind=work", token=MTOK)
foundry = ml[0]
st, ff = call("GET", "/api/studio/items/%s" % foundry["id"], token=MTOK)
check("meridian foundry media 404 here", 404, call("GET", "/api/media/" + ff["media"][0]["id"])[0])
check("meridian media 404 for cirrus producer", 404,
      call("GET", "/api/media/" + ff["media"][0]["id"], token=PTOK)[0])

# studio pages gate
check("studio page redirects anon", 302, call("GET", "/studio")[0])
check("studio page redirects viewer", 302, call("GET", "/studio", headers={"Cookie": "cirrus_token=" + VTOK})[0])
check("edit page redirects anon", 302, call("GET", "/studio/items/%s" % halo_id)[0])

print("PASS=%d FAIL=%d" % (results["pass"], results["fail"]))
sys.exit(1 if results["fail"] else 0)
