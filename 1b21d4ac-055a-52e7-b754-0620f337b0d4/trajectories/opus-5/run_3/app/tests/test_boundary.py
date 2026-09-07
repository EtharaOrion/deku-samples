"""The publish and ownership boundary, exercised against the real database."""
import sys

sys.path.insert(0, "/app")

from cirrus import create_app  # noqa: E402
from cirrus.db import execute, init_db, query_one  # noqa: E402

PW = "deku-demo-pw-2026"
FAILURES = []
CHECKS = [0]


def check(name, condition, detail=""):
    CHECKS[0] += 1
    if condition:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name} {detail}")
        FAILURES.append(name)


def token_for(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.data
    return r.get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    init_db()
    app = create_app()
    app.testing = True
    c = app.test_client()

    cirrus_t = token_for(c, "producer@example.com")
    meridian_t = token_for(c, "producer.meridian@example.com")
    viewer_t = token_for(c, "viewer@example.com")

    print("\n== public surface ==")
    works = c.get("/api/works").get_json()
    check("GET /api/works returns 12", len(works) == 12, len(works))
    check("works is a top-level array", isinstance(works, list))
    check("ordinals contiguous 001..012",
          [w["ordinal"] for w in works] == [f"{i:03d}" for i in range(1, 13)])
    talents = c.get("/api/talents").get_json()
    check("GET /api/talents returns 3", len(talents) == 3, len(talents))
    disc = c.get("/api/disciplines").get_json()
    check("disciplines are director then photographer",
          disc == ["director", "photographer"], disc)
    check("no unlisted work in the index",
          not any(w["slug"] == "the-quiet-room" for w in works))
    check("no unlisted talent in the roster",
          not any(t["slug"] == "noor-vasquez" for t in talents))
    check("meridian's work is absent from this house",
          not any(w["slug"] == "foundry" for w in works))
    check("meridian's talent is absent from this house",
          not any(t["slug"] == "sable-ito" for t in talents))

    check("GET /api/talents/noor-vasquez is 404 for a visitor",
          c.get("/api/talents/noor-vasquez").status_code == 404)
    check("GET /api/talents/rives answers", c.get("/api/talents/rives").status_code == 200)
    check("GET /api/works/the-quiet-room is 404",
          c.get("/api/works/the-quiet-room").status_code == 404)
    check("GET /api/works/foundry (other house) is 404",
          c.get("/api/works/foundry").status_code == 404)
    check("page /talents/noor-vasquez is 404",
          c.get("/talents/noor-vasquez").status_code == 404)
    check("page /works/the-quiet-room is 404",
          c.get("/works/the-quiet-room").status_code == 404)

    halo = c.get("/api/works/the-halo").get_json()
    check("work carries neighbours", "neighbours" in halo)
    check("001 previous wraps to 012", halo["neighbours"]["previous"]["ordinal"] == "012")
    check("001 next is 002", halo["neighbours"]["next"]["ordinal"] == "002")
    radiant = c.get("/api/works/the-radiant").get_json()
    check("012 next wraps to 001", radiant["neighbours"]["next"]["ordinal"] == "001")
    check("credits name a role and a name",
          any(cr["role"] == "Director" and cr["name"] == "Rives" for cr in halo["credits"]))
    rives = c.get("/api/talents/rives").get_json()
    check("talent's selected work is derived from credits",
          [w["slug"] for w in rives["selected_work"]] == ["the-halo"],
          [w["slug"] for w in rives["selected_work"]])
    check("/works/ resolves like /works", c.get("/works/").status_code == 200)
    check("/talents/ resolves like /talents", c.get("/talents/").status_code == 200)

    print("\n== unlisted media is unreachable, however the id was got ==")
    noor_media = query_one(
        """SELECT m.id FROM media m JOIN items i ON i.id = m.item_id
            WHERE i.slug = 'noor-vasquez'""")["id"]
    quiet_media = query_one(
        """SELECT m.id FROM media m JOIN items i ON i.id = m.item_id
            WHERE i.slug = 'the-quiet-room'""")["id"]
    halo_media = query_one(
        """SELECT m.id FROM media m JOIN items i ON i.id = m.item_id
            WHERE i.slug = 'the-halo' AND m.role='poster'""")["id"]

    check("published media renders", c.get(f"/api/media/{halo_media}").status_code == 200)
    check("unlisted talent's pixels are 404 to a visitor",
          c.get(f"/api/media/{noor_media}").status_code == 404)
    check("unlisted work's pixels are 404 to a visitor",
          c.get(f"/api/media/{quiet_media}").status_code == 404)
    check("unlisted media is 404 to a viewer",
          c.get(f"/api/media/{noor_media}", headers=auth(viewer_t)).status_code == 404)
    check("unlisted media is 404 to the other house's producer",
          c.get(f"/api/media/{noor_media}", headers=auth(meridian_t)).status_code == 404)
    check("unlisted media renders for its own house's producer",
          c.get(f"/api/media/{noor_media}", headers=auth(cirrus_t)).status_code == 200)
    check("same media id draws the same pixels",
          c.get(f"/api/media/{halo_media}").data == c.get(f"/api/media/{halo_media}").data)

    print("\n== studio requires a producer of the record's own house ==")
    noor_id = query_one("SELECT id FROM items WHERE slug='noor-vasquez'")["id"]
    quiet_id = query_one("SELECT id FROM items WHERE slug='the-quiet-room'")["id"]
    halo_id = query_one("SELECT id FROM items WHERE slug='the-halo'")["id"]

    for label, headers in (("no token", {}), ("viewer token", auth(viewer_t))):
        check(f"GET /api/studio/items denied with {label}",
              c.get("/api/studio/items", headers=headers).status_code in (401, 403))
        check(f"GET one record denied with {label}",
              c.get(f"/api/studio/items/{noor_id}", headers=headers).status_code in (401, 403))
        check(f"publish denied with {label}",
              c.post(f"/api/studio/items/{noor_id}/publish", json={"published": True},
                     headers=headers).status_code in (401, 403))
        check(f"create denied with {label}",
              c.post("/api/studio/items", json={"kind": "talent", "title": "X",
                                                "slug": "x", "discipline": "stylist"},
                     headers=headers).status_code in (401, 403))
        check(f"mint a token denied with {label}",
              c.post("/api/studio/preview-tokens", json={"item_id": noor_id},
                     headers=headers).status_code in (401, 403))
    check("the record was left unchanged by every refusal",
          query_one("SELECT published FROM items WHERE id=%s", (noor_id,))["published"] is False)

    print("\n== meridian cannot touch a cirrus record at any studio address ==")
    m = auth(meridian_t)
    cases = [
        ("read", lambda: c.get(f"/api/studio/items/{noor_id}", headers=m)),
        ("edit", lambda: c.patch(f"/api/studio/items/{noor_id}", json={"title": "Stolen"}, headers=m)),
        ("attach media", lambda: c.post(f"/api/studio/items/{noor_id}/media",
                                        json={"role": "poster", "seed": "s", "width": 10,
                                              "height": 10, "alt": "a"}, headers=m)),
        ("publish", lambda: c.post(f"/api/studio/items/{noor_id}/publish",
                                   json={"published": True}, headers=m)),
        ("unlist a live record", lambda: c.post(f"/api/studio/items/{halo_id}/publish",
                                                json={"published": False}, headers=m)),
        ("change the slug", lambda: c.post(f"/api/studio/items/{noor_id}/slug",
                                           json={"slug": "taken"}, headers=m)),
        ("add a credit", lambda: c.post(f"/api/studio/items/{quiet_id}/credits",
                                        json={"role": "Director", "name": "X"}, headers=m)),
        ("reorder", lambda: c.post("/api/studio/works/order",
                                   json={"ordered_ids": [halo_id]}, headers=m)),
        ("mint a preview token", lambda: c.post("/api/studio/preview-tokens",
                                                json={"item_id": noor_id}, headers=m)),
    ]
    for label, call in cases:
        r = call()
        check(f"meridian {label} answers 404", r.status_code == 404, r.status_code)
    check("a foreign record answers exactly as a missing one",
          c.get("/api/studio/items/99999999", headers=m).status_code == 404)
    check("cirrus's records were left unchanged",
          query_one("SELECT title FROM items WHERE id=%s", (noor_id,))["title"] == "Noor Vasquez"
          and query_one("SELECT published FROM items WHERE id=%s", (halo_id,))["published"] is True)
    check("meridian sees only its own records",
          all(r["slug"] in ("sable-ito", "foundry")
              for r in c.get("/api/studio/items", headers=m).get_json()))

    print("\n== preview tokens ==")
    r = c.post("/api/studio/preview-tokens", json={"item_id": noor_id},
               headers=auth(cirrus_t))
    check("a producer mints a token for their own record", r.status_code == 201, r.data)
    token = r.get_json()["token"]
    check("the token is 32 lowercase hex",
          len(token) == 32 and all(ch in "0123456789abcdef" for ch in token), token)
    exp = c.get(f"/api/preview/{token}", headers=auth(cirrus_t))
    check("its own house's producer resolves it", exp.status_code == 200, exp.status_code)
    check("the preview carries the record in full", exp.get_json()["title"] == "Noor Vasquez")
    check("another house cannot resolve it",
          c.get(f"/api/preview/{token}", headers=m).status_code == 404)
    check("a viewer cannot resolve it",
          c.get(f"/api/preview/{token}", headers=auth(viewer_t)).status_code == 404)
    check("no session cannot resolve it", c.get(f"/api/preview/{token}").status_code == 404)
    check("a bogus token answers 404",
          c.get("/api/preview/" + "0" * 32, headers=auth(cirrus_t)).status_code == 404)
    page = c.get(f"/preview/{token}", headers=auth(cirrus_t))
    check("the preview page renders the record",
          page.status_code == 200 and b"Noor Vasquez" in page.data)
    check("the preview page carries the marker", b"PREVIEW - NOT PUBLISHED" in page.data)
    check("the preview is kept out of every shared cache",
          "no-store" in page.headers.get("Cache-Control", ""))
    check("the preview is not indexable", "noindex" in page.headers.get("X-Robots-Tag", ""))
    other = c.post("/api/studio/preview-tokens", json={"item_id": halo_id},
                   headers=auth(cirrus_t)).get_json()
    check("a token is scoped to exactly one record",
          c.get(f"/api/preview/{other['token']}",
                headers=auth(cirrus_t)).get_json()["title"] == "The Halo")

    print("\n== publish, unlist and the derived sets ==")
    r = c.post(f"/api/studio/items/{noor_id}/publish", json={"published": True},
               headers=auth(cirrus_t))
    check("publishing a complete record works", r.status_code == 200, r.data)
    check("published_at is stamped", r.get_json()["published_at"] is not None)
    check("the roster now carries the new name",
          any(t["slug"] == "noor-vasquez" for t in c.get("/api/talents").get_json()))
    check("publishing Noor Vasquez adds stylist",
          c.get("/api/disciplines").get_json() == ["director", "photographer", "stylist"],
          c.get("/api/disciplines").get_json())
    check("her pixels are now public", c.get(f"/api/media/{noor_media}").status_code == 200)

    camille_id = query_one("SELECT id FROM items WHERE slug='camille-ferrand'")["id"]
    c.post(f"/api/studio/items/{camille_id}/publish", json={"published": False},
           headers=auth(cirrus_t))
    check("unlisting Camille Ferrand drops photographer",
          c.get("/api/disciplines").get_json() == ["director", "stylist"],
          c.get("/api/disciplines").get_json())
    check("she is absent from the roster at once",
          not any(t["slug"] == "camille-ferrand" for t in c.get("/api/talents").get_json()))
    check("she is absent at her own address",
          c.get("/api/talents/camille-ferrand").status_code == 404)
    loris = c.get("/api/works/loris").get_json()
    check("her credit no longer links to an unlisted talent",
          all(cr["href"] is None for cr in loris["credits"] if cr["name"] == "Camille Ferrand"))
    c.post(f"/api/studio/items/{camille_id}/publish", json={"published": True},
           headers=auth(cirrus_t))
    c.post(f"/api/studio/items/{noor_id}/publish", json={"published": False},
           headers=auth(cirrus_t))
    check("unlisting restores the seeded state",
          c.get("/api/disciplines").get_json() == ["director", "photographer"])
    check("her pixels are unreachable again",
          c.get(f"/api/media/{noor_media}").status_code == 404)

    print("\n== unlisting the fifth of twelve renumbers to 001..011 ==")
    nve_id = query_one("SELECT id FROM items WHERE slug='nve'")["id"]
    c.post(f"/api/studio/items/{nve_id}/publish", json={"published": False},
           headers=auth(cirrus_t))
    after = c.get("/api/works").get_json()
    check("eleven works remain", len(after) == 11, len(after))
    check("numbered 001 to 011 contiguously",
          [w["ordinal"] for w in after] == [f"{i:03d}" for i in range(1, 12)])
    check("the sixth is now 005", after[4]["slug"] == "the-absolute-shelter", after[4]["slug"])
    c.post(f"/api/studio/items/{nve_id}/publish", json={"published": True},
           headers=auth(cirrus_t))
    check("republishing restores twelve", len(c.get("/api/works").get_json()) == 12)

    print("\n== publishing without an alt is refused ==")
    r = c.post("/api/studio/items", json={"kind": "talent", "title": "Alt Test",
                                          "slug": "alt-test", "discipline": "stylist"},
               headers=auth(cirrus_t))
    check("a record is created unlisted",
          r.status_code == 201 and r.get_json()["published"] is False)
    alt_id = r.get_json()["id"]
    check("published_at is null on creation", r.get_json()["published_at"] is None)
    r = c.post(f"/api/studio/items/{alt_id}/publish", json={"published": True},
               headers=auth(cirrus_t))
    check("publishing with no poster is refused", 400 <= r.status_code < 500, r.status_code)
    check("the refusal carries a readable reason",
          isinstance(r.get_json().get("error"), str) and len(r.get_json()["error"]) > 10)
    check("nothing changed",
          query_one("SELECT published FROM items WHERE id=%s", (alt_id,))["published"] is False)
    r = c.post(f"/api/studio/items/{alt_id}/media",
               json={"role": "poster", "seed": "alt-test", "width": 246, "height": 328,
                     "alt": "   "}, headers=auth(cirrus_t))
    check("an empty alt is refused on a media row", 400 <= r.status_code < 500)
    r = c.post(f"/api/studio/items/{alt_id}/media",
               json={"role": "poster", "seed": "alt-test", "width": 246, "height": 328,
                     "alt": "Alt Test, stylist, portrait"}, headers=auth(cirrus_t))
    check("a media row mints a 32-char lowercase hex id", len(r.get_json()["media_id"]) == 32)
    check("publishing now works",
          c.post(f"/api/studio/items/{alt_id}/publish", json={"published": True},
                 headers=auth(cirrus_t)).status_code == 200)
    c.post(f"/api/studio/items/{alt_id}/publish", json={"published": False},
           headers=auth(cirrus_t))

    print("\n== slugs: unique per house per kind, held at the database ==")
    r = c.post("/api/studio/items", json={"kind": "talent", "title": "Rives Again",
                                          "slug": "RIVES", "discipline": "director"},
               headers=auth(cirrus_t))
    check("Rives and rives are the same slug", r.status_code == 409, r.status_code)
    check("the loser carries a reason", "error" in r.get_json())
    r = c.post("/api/studio/items", json={"kind": "work", "title": "Rives The Film",
                                          "slug": "rives", "variant": "left"},
               headers=auth(cirrus_t))
    check("the same slug in another kind is allowed", r.status_code == 201, r.data)
    dup_work = r.get_json()["id"]
    r = c.post("/api/studio/items", json={"kind": "talent", "title": "Rives Elsewhere",
                                          "slug": "rives", "discipline": "director"},
               headers=auth(meridian_t))
    check("the same slug in another house is allowed", r.status_code == 201, r.data)
    other_house_item = r.get_json()["id"]

    print("\n== a rename leaves the old address redirecting forever ==")
    r = c.post(f"/api/studio/items/{dup_work}/slug", json={"slug": "rives-the-film"},
               headers=auth(cirrus_t))
    check("the slug changes",
          r.status_code == 200 and r.get_json()["slug"] == "rives-the-film")
    c.post(f"/api/studio/items/{dup_work}/media",
           json={"role": "poster", "seed": "rives-film", "width": 598, "height": 320,
                 "alt": "Rives The Film, still"}, headers=auth(cirrus_t))
    c.post(f"/api/studio/items/{dup_work}/publish", json={"published": True},
           headers=auth(cirrus_t))
    red = c.get("/works/rives", follow_redirects=False)
    check("the old address redirects permanently", red.status_code == 301, red.status_code)
    check("it redirects to the new one",
          red.headers.get("Location", "").endswith("/works/rives-the-film"))
    check("the record answers at its new address",
          c.get("/api/works/rives-the-film").status_code == 200)

    print("\n== reordering ==")
    ids = [w["id"] for w in c.get("/api/studio/items?kind=work",
                                  headers=auth(cirrus_t)).get_json()]
    r = c.post("/api/studio/works/order", json={"ordered_ids": list(reversed(ids))},
               headers=auth(cirrus_t))
    check("reorder answers with the house's works",
          r.status_code == 200 and isinstance(r.get_json(), list))
    check("the index reflects the new order",
          c.get("/api/works").get_json()[0]["ordinal"] == "001")
    check("reordering a foreign id answers 404",
          c.post("/api/studio/works/order", json={"ordered_ids": [other_house_item]},
                 headers=auth(cirrus_t)).status_code == 404)
    c.post("/api/studio/works/order", json={"ordered_ids": ids}, headers=auth(cirrus_t))

    print("\n== signup always issues a viewer with no house ==")
    import uuid
    email = f"stranger-{uuid.uuid4().hex[:8]}@example.com"
    r = c.post("/api/auth/signup", json={"email": email, "password": "a-long-password",
                                         "role": "producer", "house_id": 1})
    check("signup answers 201", r.status_code == 201, r.data)
    new = r.get_json()
    check("the role is viewer", new["account"]["role"] == "viewer", new["account"])
    check("the house is null", new["account"]["house_id"] is None)
    check("a token is issued", isinstance(new["token"], str) and len(new["token"]) > 20)
    check("the new viewer cannot enter the studio",
          c.get("/api/studio/items", headers=auth(new["token"])).status_code == 403)
    check("a duplicate address is refused",
          c.post("/api/auth/signup",
                 json={"email": email, "password": "a-long-password"}).status_code == 409)
    check("a wrong password is refused",
          c.post("/api/auth/login", json={"email": "producer@example.com",
                                          "password": "wrong"}).status_code == 401)
    check("a garbage bearer token is refused",
          c.get("/api/studio/items", headers=auth("nonsense.token")).status_code == 401)

    print("\n== page-level entry and redirects ==")
    check("a visitor asking for /studio lands on the login route",
          c.get("/studio").headers.get("Location", "").startswith("/studio/login"))
    # The studio's document requests carry the same bearer token in a cookie.
    c.set_cookie("cirrus_token", viewer_t, domain="localhost")
    r = c.get("/studio")
    check("a signed-in viewer is refused and sees the entry route",
          r.status_code == 302 and r.headers.get("Location") == "/",
          (r.status_code, r.headers.get("Location")))
    c.set_cookie("cirrus_token", cirrus_t, domain="localhost")
    r = c.get("/studio")
    check("a producer reaches the palette", r.status_code == 200 and b"palette" in r.data,
          r.status_code)
    check("a foreign record's studio page is a real 404",
          c.get(f"/studio/items/{other_house_item}").status_code == 404)
    check("signing out makes /studio unreachable at once",
          (c.delete_cookie("cirrus_token", domain="localhost") or
           c.get("/studio").headers.get("Location", "")).startswith("/studio/login"))
    check("the not-found surface does not echo the path",
          b"That page is not here." in c.get("/definitely/not/a/route").data)
    weird = c.get("/<script>alert(1)</script>")
    check("a hostile path is not echoed",
          b"<script>alert(1)</script>" not in weird.data and weird.status_code == 404)
    check("the not-found surface carries the full chrome",
          b"wordmark" in weird.data and b"site-nav" in weird.data)
    r = c.get(f"/preview/{token}")
    check("an unsigned preview reveals nothing",
          r.status_code in (302, 404) and b"Noor Vasquez" not in r.data)

    print("\n== health and shapes ==")
    check("health answers 200", c.get("/api/health").status_code == 200)
    for path in ["/api/works", "/api/talents", "/api/disciplines"]:
        check(f"{path} is a top-level array", isinstance(c.get(path).get_json(), list))
    check("studio items is a top-level array",
          isinstance(c.get("/api/studio/items", headers=auth(cirrus_t)).get_json(), list))
    check("filtering the roster by discipline works",
          all(t["discipline"] == "photographer"
              for t in c.get("/api/talents?discipline=photographer").get_json()))
    check("a discipline filter that is not a discipline is a client error",
          c.get("/api/talents?discipline=nonsense").status_code == 400)

    print("\n== cleanup ==")
    execute("DELETE FROM items WHERE id = ANY(%s)",
            ([alt_id, dup_work, other_house_item],))
    execute("DELETE FROM accounts WHERE email=%s", (email,))
    execute("DELETE FROM slug_redirects WHERE lower(old_slug)='rives' AND kind='work'")
    print("  ok   test records removed")

    print(f"\n{CHECKS[0] - len(FAILURES)}/{CHECKS[0]} checks passed")
    if FAILURES:
        print("FAILURES:")
        for f in FAILURES:
            print("  -", f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
