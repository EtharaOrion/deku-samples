"""A second stranger: no session, and the other house's producer.

Nothing unlisted may be reachable, and nothing of cirrus may be reachable by
meridian, at any address.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("CIRRUS_BASE", "http://localhost:4173")
SHOTS = "/app/.browser_screenshots"
PASSWORD = "deku-demo-pw-2026"

results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(("PASS " if condition else "FAIL ") + name + (" :: " + str(detail) if detail else ""))


def main():
    noor_media = os.environ["NOOR_MEDIA"]
    quiet_media = os.environ["QUIET_MEDIA"]
    quiet_id = os.environ["QUIET_ID"]
    noor_id = os.environ["NOOR_ID"]
    halo_id = os.environ["HALO_ID"]
    sable_id = os.environ["SABLE_ID"]

    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # ---------------- a stranger with no session at all
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(BASE + "/")
        page.wait_for_timeout(400)

        probes = [
            ("/api/talents/noor-vasquez", 404, "the unlisted talent's api address"),
            ("/api/works/the-quiet-room", 404, "the unlisted work's api address"),
            ("/api/media/" + noor_media, 404, "the unlisted talent's portrait"),
            ("/api/media/" + quiet_media, 404, "the unlisted work's poster"),
            ("/api/works/foundry", 404, "the other house's work"),
            ("/api/talents/sable-ito", 404, "the other house's talent"),
            ("/api/studio/items", 401, "the studio list with no token"),
            ("/nope-nothing-here", 404, "an address matching nothing"),
        ]
        for path, expected, label in probes:
            resp = page.request.get(BASE + path)
            check("no session: %s answers %d" % (label, expected),
                  resp.status == expected, resp.status)

        # the media address copied out of the studio must not render pixels
        resp = page.request.get(BASE + "/api/media/" + noor_media)
        check("no session: the copied media address returns no image",
              resp.status == 404 and not resp.headers.get("content-type", "").startswith("image"),
              resp.status)

        # the studio door turns a stranger away
        resp = page.request.get(BASE + "/studio", max_redirects=0)
        check("no session: /studio redirects to the door", resp.status in (302, 303), resp.status)
        page.goto(BASE + "/studio")
        page.wait_for_timeout(600)
        check("no session: the browser lands on the door", page.url.endswith("/studio/login"), page.url)

        # an unknown preview token reveals nothing
        resp = page.request.get(BASE + "/preview/" + "0" * 32)
        check("no session: an unknown preview answers not found", resp.status == 404, resp.status)
        page.goto(BASE + "/preview/" + "0" * 32)
        page.wait_for_timeout(600)
        check("no session: the unknown preview page is the not-found surface",
              "That page is not here." in page.content(), page.url)
        page.screenshot(path=os.path.join(SHOTS, "17_stranger_notfound.png"))
        print("shot 17_stranger_notfound.png")

        # a viewer account can read everything public and nothing else
        viewer = page.request.post(BASE + "/api/auth/login", data={
            "email": "viewer@example.com", "password": PASSWORD})
        vtok = viewer.json()["token"]
        auth = {"Authorization": "Bearer " + vtok}
        resp = page.request.get(BASE + "/api/studio/items", headers=auth)
        check("a viewer is refused at the studio", resp.status == 403, resp.status)
        resp = page.request.post(BASE + "/api/studio/items", headers=auth,
                                 data={"kind": "talent", "title": "Nope", "discipline": "stylist"})
        check("a viewer cannot create a record", resp.status == 403, resp.status)
        resp = page.request.post(BASE + "/api/studio/items/" + noor_id + "/publish", headers=auth,
                                 data={"published": True})
        check("a viewer cannot publish a record", resp.status in (403, 404), resp.status)
        resp = page.request.get(BASE + "/api/media/" + noor_media, headers=auth)
        check("a viewer cannot fetch the unlisted pixels", resp.status == 404, resp.status)

        # the viewer's studio page is refused and shows the entry route
        page.request.post(BASE + "/api/auth/login", data={
            "email": "viewer@example.com", "password": PASSWORD})
        page.goto(BASE + "/studio")
        page.wait_for_timeout(900)
        check("a signed-in viewer asking for /studio is moved off it",
              not page.url.endswith("/studio"), page.url)

        # ---------------- the producer of the other house
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
        mer = ctx2.new_page()
        mer.request.post(BASE + "/api/auth/login", data={
            "email": "producer.meridian@example.com", "password": PASSWORD})
        mer.goto(BASE + "/studio")
        mer.wait_for_timeout(1200)
        check("meridian's producer reaches their own palette",
              mer.url.endswith("/studio"), mer.url)
        cards = mer.eval_on_selector_all(".card__slug", "els => els.map(e => e.textContent.trim())")
        check("meridian's palette lists only meridian records",
              all(s in ("sable-ito", "foundry") for s in cards), cards)
        mer.screenshot(path=os.path.join(SHOTS, "18_meridian_palette.png"))
        print("shot 18_meridian_palette.png")

        mauth = {"Authorization": "Bearer " + mer.request.post(
            BASE + "/api/auth/login", data={"email": "producer.meridian@example.com",
                                            "password": PASSWORD}).json()["token"]}

        cross = [
            ("GET", "/api/studio/items/" + halo_id, 404, "read a cirrus work"),
            ("GET", "/api/studio/items/" + noor_id, 404, "read a cirrus talent"),
            ("PATCH", "/api/studio/items/" + halo_id, 404, "edit a cirrus work"),
            ("POST", "/api/studio/items/" + noor_id + "/publish", 404, "publish a cirrus talent"),
            ("POST", "/api/studio/items/" + halo_id + "/media", 404, "attach media to a cirrus work"),
            ("POST", "/api/studio/items/" + halo_id + "/credits", 404, "credit a cirrus work"),
            ("POST", "/api/studio/items/" + halo_id + "/slug", 404, "rename a cirrus work"),
            ("POST", "/api/studio/works/order", 404, "reorder with cirrus ids"),
            ("POST", "/api/studio/preview-tokens", 404, "mint a token for a cirrus record"),
        ]
        for method, path, expected, label in cross:
            body = {}
            if path.endswith("/publish"):
                body = {"published": True}
            elif path.endswith("/media"):
                body = {"role": "poster", "width": 100, "height": 100, "alt": "x"}
            elif path.endswith("/credits"):
                body = {"role": "Director", "name": "X"}
            elif path.endswith("/slug"):
                body = {"slug": "stolen"}
            elif path.endswith("/preview-tokens"):
                body = {"item_id": noor_id}
            elif path.endswith("/works/order"):
                body = {"ordered_ids": [halo_id]}
            elif method == "PATCH":
                body = {"title": "Stolen"}
            resp = mer.request.fetch(BASE + path, method=method, headers=mauth, data=body)
            check("meridian cannot %s (%d)" % (label, expected),
                  resp.status == expected, resp.status)

        # the store is unchanged after every refusal
        state = mer.request.get(BASE + "/api/works").json()
        check("the cirrus index still numbers twelve",
              len(state) == 12 and state[0]["slug"] == "the-halo", len(state))
        check("the cirrus roster still numbers three",
              len(mer.request.get(BASE + "/api/talents").json()) == 3, "")
        check("the unlisted talent is still absent",
              all(t["slug"] != "noor-vasquez"
                  for t in mer.request.get(BASE + "/api/talents").json()), "")
        check("no stylist joined the filter",
              mer.request.get(BASE + "/api/disciplines").json() == ["director", "photographer"], "")

        # meridian cannot open cirrus record pages, media, or previews
        for path, label in [
            ("/api/media/" + noor_media, "the unlisted portrait"),
            ("/api/media/" + quiet_media, "the unlisted poster"),
            ("/api/talents/noor-vasquez", "the unlisted talent"),
            ("/api/works/the-quiet-room", "the unlisted work"),
        ]:
            resp = mer.request.get(BASE + path, headers=mauth)
            check("meridian cannot fetch %s" % label, resp.status == 404, resp.status)

        # a preview minted by cirrus is invisible to meridian
        ctoken = mer.request.post(BASE + "/api/auth/login", data={
            "email": "producer@example.com", "password": PASSWORD}).json()["token"]
        cauth = {"Authorization": "Bearer " + ctoken}
        minted = mer.request.post(BASE + "/api/studio/preview-tokens", headers=cauth,
                                  data={"item_id": quiet_id}).json()
        resp = mer.request.get(BASE + "/api/preview/" + minted["token"], headers=mauth)
        check("meridian cannot read a cirrus preview token", resp.status == 404, resp.status)
        resp = mer.request.get(BASE + "/preview/" + minted["token"], headers=mauth,
                               max_redirects=0)
        check("meridian cannot open a cirrus preview page", resp.status == 404, resp.status)
        resp = mer.request.get(BASE + "/api/preview/" + minted["token"], headers=cauth)
        check("cirrus's own producer can read that preview", resp.status == 200, resp.status)

        # a viewer token in the studio page renders no studio control
        check("no page errors in the stranger's walk", not errors, errors[:3])
        browser.close()

    failures = [r for r in results if not r[1]]
    print("\n%d checks, %d failed" % (len(results), len(failures)))
    for name, _, detail in failures:
        print("  FAILED:", name, detail)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
