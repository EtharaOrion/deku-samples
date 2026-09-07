"""Checks the brief's stated contracts against a running server."""
import json
import os
import re
import secrets as _s
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("TEST_BASE", "http://127.0.0.1:4173")
PW = "deku-demo-pw-2026"

results = []


def call(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            payload = json.loads(raw) if "json" in ctype else raw
            return resp.status, payload, dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw
        return e.code, payload, dict(e.headers)


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(("PASS  " if condition else "FAIL  ") + name +
          ("" if condition else "  <- " + str(detail)[:300]))


def login(email):
    s, b, _ = call("POST", "/api/auth/login", {"email": email, "password": PW})
    assert s == 200, (email, s, b)
    return b["token"]


def main():
    s, works, _ = call("GET", "/api/works")
    check("GET /api/works returns 12 works", s == 200 and isinstance(works, list)
          and len(works) == 12, (s, works))
    check("ordinals are contiguous from 001",
          [w["ordinal"] for w in works] == [str(i).zfill(3) for i in range(1, 13)],
          [w["ordinal"] for w in works])
    check("first work is The Halo", works[0]["slug"] == "the-halo", works[0]["slug"])

    s, talents, _ = call("GET", "/api/talents")
    check("GET /api/talents returns 3", s == 200 and len(talents) == 3, talents)

    s, disc, _ = call("GET", "/api/disciplines")
    check("disciplines derive as director then photographer",
          s == 200 and disc == ["director", "photographer"], disc)

    s, halo, _ = call("GET", "/api/works/the-halo")
    check("work carries neighbours", s == 200 and halo["prev"] and halo["next"], s)
    check("001 wraps back to 012", halo["prev"]["ordinal"] == "012", halo["prev"])
    check("neighbour of 001 forward is 002", halo["next"]["ordinal"] == "002")
    s, last, _ = call("GET", "/api/works/the-radiant")
    check("012 wraps forward to 001", last["next"]["ordinal"] == "001", last["next"])

    s, rives, _ = call("GET", "/api/talents/rives")
    check("GET /api/talents/rives answers", s == 200, s)
    check("talent's selected work derives from credits",
          any(w["slug"] == "the-halo" for w in rives["selected_work"]),
          rives.get("selected_work"))

    s, _, _ = call("GET", "/api/talents/noor-vasquez")
    check("unlisted talent is not found for a visitor", s == 404, s)
    s, _, _ = call("GET", "/api/works/the-quiet-room")
    check("unlisted work is not found for a visitor", s == 404, s)
    check("unlisted talent absent from the roster",
          all(t["slug"] != "noor-vasquez" for t in talents))
    check("stylist absent from the discipline set", "stylist" not in disc)
    s, _, _ = call("GET", "/talents/noor-vasquez")
    check("unlisted talent's public route is 404", s == 404, s)

    s, _, _ = call("GET", "/api/works/foundry")
    check("another house's work is not on this public surface", s == 404, s)
    s, _, _ = call("GET", "/api/talents/sable-ito")
    check("another house's talent is not on this public surface", s == 404, s)

    prod = login("producer@example.com")
    other = login("producer.meridian@example.com")
    viewer = login("viewer@example.com")

    s, items, _ = call("GET", "/api/studio/items", token=prod)
    check("producer reads own house records", s == 200 and isinstance(items, list), s)
    by_slug = {i["slug"]: i for i in items}
    noor = by_slug["noor-vasquez"]
    quiet = by_slug["the-quiet-room"]
    check("unlisted record has published_at null",
          noor["published"] is False and noor["published_at"] is None, noor)

    noor_poster = noor["poster"]["media_id"]
    s, _, _ = call("GET", "/api/media/" + noor_poster)
    check("unlisted media not found to a visitor holding the address", s == 404, s)
    s, _, _ = call("GET", "/api/media/" + noor_poster, token=viewer)
    check("unlisted media not found to a viewer", s == 404, s)
    s, _, _ = call("GET", "/api/media/" + noor_poster, token=other)
    check("unlisted media not found to another house's producer", s == 404, s)
    s, _, _ = call("GET", "/api/media/" + noor_poster, token=prod)
    check("unlisted media renders for its own house producer", s == 200, s)

    pub_media = works[0]["poster"]["media_id"]
    s, body1, _ = call("GET", "/api/media/" + pub_media)
    check("published media renders for a visitor", s == 200, s)
    s, body2, _ = call("GET", "/api/media/" + pub_media)
    check("the same media id returns the same image", body1 == body2)

    for method, path, payload in [
        ("GET", "/api/studio/items", None),
        ("GET", "/api/studio/items/%s" % noor["id"], None),
        ("POST", "/api/studio/items", {"kind": "talent", "title": "X", "slug": "x",
                                       "discipline": "director"}),
        ("PATCH", "/api/studio/items/%s" % noor["id"], {"title": "Hacked"}),
        ("POST", "/api/studio/items/%s/publish" % noor["id"], {"published": True}),
        ("POST", "/api/studio/items/%s/media" % noor["id"],
         {"role": "poster", "seed": "s", "width": 10, "height": 10, "alt": "a"}),
        ("POST", "/api/studio/items/%s/slug" % noor["id"], {"slug": "hacked"}),
        ("POST", "/api/studio/works/order", {"ordered_ids": [1]}),
        ("POST", "/api/studio/preview-tokens", {"item_id": noor["id"]}),
    ]:
        s, b, _ = call(method, path, payload, token=viewer)
        check("viewer refused: %s %s" % (method, path), 400 <= s < 500, s)
        s, b, _ = call(method, path, payload, token=None)
        check("no token refused: %s %s" % (method, path), 400 <= s < 500, s)

    s, after, _ = call("GET", "/api/studio/items/%s" % noor["id"], token=prod)
    check("protected record unchanged after refusals",
          after["title"] == "Noor Vasquez" and after["published"] is False
          and after["slug"] == "noor-vasquez", after)

    for method, path, payload in [
        ("GET", "/api/studio/items/%s" % noor["id"], None),
        ("PATCH", "/api/studio/items/%s" % noor["id"], {"title": "Meridian was here"}),
        ("POST", "/api/studio/items/%s/publish" % noor["id"], {"published": True}),
        ("POST", "/api/studio/items/%s/media" % noor["id"],
         {"role": "poster", "seed": "s", "width": 10, "height": 10, "alt": "a"}),
        ("POST", "/api/studio/items/%s/credits" % quiet["id"],
         {"role": "Director", "name": "X"}),
        ("POST", "/api/studio/items/%s/slug" % noor["id"], {"slug": "taken-over"}),
        ("POST", "/api/studio/preview-tokens", {"item_id": noor["id"]}),
    ]:
        s, b, _ = call(method, path, payload, token=other)
        check("meridian answered not found: %s %s" % (method, path), s == 404, s)

    s, b, _ = call("POST", "/api/studio/works/order",
                   {"ordered_ids": [i["id"] for i in items if i["kind"] == "work"]},
                   token=other)
    check("meridian cannot reorder cirrus works", s == 404, s)

    s, after, _ = call("GET", "/api/studio/items/%s" % noor["id"], token=prod)
    check("cirrus record unchanged after cross-house attempts",
          after["title"] == "Noor Vasquez" and after["published"] is False
          and after["slug"] == "noor-vasquez", after)

    s, mitems, _ = call("GET", "/api/studio/items", token=other)
    check("meridian's studio shows only meridian records",
          s == 200 and {i["slug"] for i in mitems} == {"foundry", "sable-ito"},
          [i["slug"] for i in mitems])

    s, tok, _ = call("POST", "/api/studio/preview-tokens",
                     {"item_id": noor["id"]}, token=prod)
    check("preview token minted", s in (200, 201), (s, tok))
    check("token is 32 lowercase hex", bool(re.fullmatch(r"[0-9a-f]{32}", tok["token"])),
          tok.get("token"))
    s, prev, _ = call("GET", "/api/preview/" + tok["token"], token=prod)
    check("preview resolves for its own producer",
          s == 200 and prev["slug"] == "noor-vasquez", s)
    s, _, _ = call("GET", "/api/preview/" + tok["token"], token=other)
    check("preview not found for another house", s == 404, s)
    s, _, _ = call("GET", "/api/preview/" + tok["token"], token=viewer)
    check("preview not found for a viewer", s == 404, s)
    s, _, _ = call("GET", "/api/preview/" + tok["token"])
    check("preview not found without a session", s == 404, s)
    s, _, h = call("GET", "/preview/" + tok["token"], token=prod)
    check("preview route renders for its producer", s == 200, s)
    check("preview kept out of shared caches",
          "no-store" in h.get("Cache-Control", ""), h.get("Cache-Control"))
    check("preview is not indexable", "noindex" in h.get("X-Robots-Tag", ""),
          h.get("X-Robots-Tag"))
    s, _, _ = call("GET", "/preview/" + "0" * 32, token=prod)
    check("preview of an unknown token is not found", s == 404, s)

    s, created, _ = call("POST", "/api/studio/items",
                         {"kind": "talent", "title": "Test Stylist",
                          "slug": "test-stylist", "discipline": "stylist"}, token=prod)
    check("record created unlisted with published_at null",
          s == 201 and created["published"] is False and created["published_at"] is None,
          (s, created))
    cid = created["id"]

    s, b, _ = call("POST", "/api/studio/items/%s/publish" % cid,
                   {"published": True}, token=prod)
    check("publishing without a poster is refused", 400 <= s < 500, (s, b))

    s, b, _ = call("POST", "/api/studio/items/%s/media" % cid,
                   {"role": "poster", "seed": "abc", "width": 246, "height": 320,
                    "alt": ""}, token=prod)
    check("a poster with an empty alt is refused", 400 <= s < 500, (s, b))
    s, item_now, _ = call("GET", "/api/studio/items/%s" % cid, token=prod)
    check("nothing changed after the refusal", item_now["published"] is False)

    s, m, _ = call("POST", "/api/studio/items/%s/media" % cid,
                   {"role": "poster", "seed": "abc", "width": 246, "height": 320,
                    "alt": "Test Stylist, portrait"}, token=prod)
    check("poster attached with a 32 hex id",
          s == 201 and bool(re.fullmatch(r"[0-9a-f]{32}", m["media_id"])), (s, m))
    new_media = m["media_id"]
    s, _, _ = call("GET", "/api/media/" + new_media)
    check("new record's media unreachable while unlisted", s == 404, s)

    s, pub, _ = call("POST", "/api/studio/items/%s/publish" % cid,
                     {"published": True}, token=prod)
    check("publishing stamps published_at",
          s == 200 and pub["published"] and pub["published_at"], (s, pub))
    s, _, _ = call("GET", "/api/media/" + new_media)
    check("media reachable once published", s == 200, s)

    s, disc2, _ = call("GET", "/api/disciplines")
    check("publishing a stylist adds stylist to the derived set",
          disc2 == ["director", "photographer", "stylist"], disc2)
    s, roster, _ = call("GET", "/api/talents")
    check("roster carries the new name", len(roster) == 4, len(roster))
    s, filtered, _ = call("GET", "/api/talents?discipline=stylist")
    check("roster filters by discipline",
          len(filtered) == 1 and filtered[0]["slug"] == "test-stylist", filtered)

    s, _, _ = call("POST", "/api/studio/items/%s/publish" % cid,
                   {"published": False}, token=prod)
    s, disc3, _ = call("GET", "/api/disciplines")
    check("unlisting drops the discipline again",
          disc3 == ["director", "photographer"], disc3)
    s, _, _ = call("GET", "/api/talents/test-stylist")
    check("unlisted record absent at its own address", s == 404, s)
    s, _, _ = call("GET", "/api/media/" + new_media)
    check("unlisting makes its pixels unreachable again", s == 404, s)

    fifth = works[4]
    call("POST", "/api/studio/items/%s/publish" % fifth["id"],
         {"published": False}, token=prod)
    s, w2, _ = call("GET", "/api/works")
    check("unlisting the fifth of twelve leaves eleven", len(w2) == 11, len(w2))
    check("the eleven are numbered 001 to 011",
          [w["ordinal"] for w in w2] == [str(i).zfill(3) for i in range(1, 12)],
          [w["ordinal"] for w in w2])
    call("POST", "/api/studio/items/%s/publish" % fifth["id"],
         {"published": True}, token=prod)
    s, w3, _ = call("GET", "/api/works")
    check("republishing restores twelve in order",
          len(w3) == 12 and w3[4]["slug"] == fifth["slug"], len(w3))

    s, b, _ = call("POST", "/api/studio/items",
                   {"kind": "talent", "title": "Dup", "slug": "RIVES",
                    "discipline": "director"}, token=prod)
    check("slug uniqueness is case-insensitive per house per kind", s == 409, (s, b))
    check("the refusal carries a readable reason",
          isinstance(b, dict) and isinstance(b.get("error"), str) and b["error"], b)

    s, b, _ = call("POST", "/api/studio/items",
                   {"kind": "work", "title": "Rives Work", "slug": "rives",
                    "variant": "left"}, token=prod)
    check("the same slug is allowed for a different kind", s == 201, (s, b))

    s, renamed, _ = call("POST", "/api/studio/items/%s/slug" % cid,
                         {"slug": "test-stylist-two"}, token=prod)
    check("slug changed", s == 200 and renamed["slug"] == "test-stylist-two", (s, renamed))
    call("POST", "/api/studio/items/%s/publish" % cid, {"published": True}, token=prod)
    s, _, _ = call("GET", "/talents/test-stylist")
    check("the old slug redirects forever", s == 200, s)
    s, _, _ = call("GET", "/talents/test-stylist-two")
    check("the new slug serves", s == 200, s)
    call("POST", "/api/studio/items/%s/publish" % cid, {"published": False}, token=prod)

    for path, needle in [
        ("/", b"cirrus"),
        ("/works", b"Quiet decisions"),
        ("/works/", b"Quiet decisions"),
        ("/works/the-halo", b"The Halo"),
        ("/talents", b"Rives"),
        ("/talents/", b"Rives"),
        ("/talents/rives", b"Rives"),
        ("/about", b"PICTURES PATIENTLY MADE"),
        ("/signup", b"SIGN UP"),
        ("/studio/login", b"SIGN IN"),
    ]:
        s, body, _ = call("GET", path)
        raw = body if isinstance(body, bytes) else b""
        check("public route %s renders" % path, s == 200 and needle in raw, s)

    s, body, _ = call("GET", "/no-such-address-here")
    raw = body if isinstance(body, bytes) else b""
    check("unknown address answers a real 404", s == 404, s)
    check("not-found carries the site's own line", b"That page is not here." in raw)
    check("not-found does not echo the path", b"no-such-address-here" not in raw)

    email = "stranger-%s@example.com" % _s.token_hex(4)
    s, acct, _ = call("POST", "/api/auth/signup",
                      {"email": email, "password": "a-good-pw-12"})
    check("signup issues a viewer with no house",
          s == 201 and acct["account"]["role"] == "viewer"
          and not acct["account"]["house"], (s, acct))
    s, b, _ = call("POST", "/api/studio/items",
                   {"kind": "work", "title": "N", "slug": "n", "variant": "left"},
                   token=acct["token"])
    check("a fresh signup cannot reach the studio", 400 <= s < 500, s)

    s, b, _ = call("POST", "/api/auth/signup",
                   {"email": "role-%s@example.com" % _s.token_hex(3),
                    "password": "a-good-pw-12", "role": "producer",
                    "house_id": 1, "house": "cirrus"})
    check("role and house in a signup body are ignored",
          s == 201 and b["account"]["role"] == "viewer" and not b["account"]["house"], b)

    s, b, _ = call("POST", "/api/auth/login",
                   {"email": "producer@example.com", "password": "wrong"})
    check("a wrong password is refused in the client-error range", s == 401, s)

    print()
    failed = [r for r in results if not r[1]]
    print("%d checks, %d failed" % (len(results), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
