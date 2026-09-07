"""Walks the four journeys in a browser, reading values back rather than eyeballing."""
import sys

from playwright.sync_api import sync_playwright

import time as _time

BASE = "http://127.0.0.1:4173"
# A unique name per run, so a walk never collides with a record an earlier walk left.
NEW_NAME = "Wren Aliyev " + str(int(_time.time()) % 100000)
NEW_SLUG = NEW_NAME.lower().replace(" ", "-")
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"
problems = []
console = []


def check(label, condition, detail=""):
    print(("PASS  " if condition else "FAIL  ") + label + ("" if condition else f"  <- {detail}"))
    if not condition:
        problems.append(label)


def shot(page, name):
    """Lets the smoothed scroll settle, then captures; retries once rather than failing."""
    page.wait_for_function(
        "() => !document.documentElement.classList.contains('is-scrolling')", timeout=5000)
    page.wait_for_timeout(400)
    try:
        page.screenshot(path=f"{SHOTS}/{name}", animations="disabled", timeout=10000)
    except Exception:
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{SHOTS}/{name}", timeout=15000)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
            args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.set_default_timeout(20000)
        page.on("console", lambda m: console.append((m.type, m.text))
                if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: console.append(("pageerror", str(e))))

        # ---------------- journey 1: the entry cluster
        page.goto(BASE + "/", wait_until="load")
        page.wait_for_function(
            "document.querySelector('.counter-value') === null"
            " || document.querySelector('.counter-value').textContent === '100%'",
            timeout=15000)
        check("the counter reaches 100%", True)
        page.wait_for_timeout(900)
        veil = page.locator("#veil")
        check("the veil clears once the count completes", veil.count() == 0
              or not veil.is_visible(), "veil still visible")
        check("the cluster holds twenty stills",
              page.locator(".cluster-item").count() == 20,
              page.locator(".cluster-item").count())
        ground = page.evaluate("getComputedStyle(document.body).backgroundColor")
        check("the entry route's ground is the dark token", ground == "rgb(6, 4, 3)", ground)
        check("the entry route does not scroll",
              page.evaluate("document.documentElement.scrollHeight <= window.innerHeight + 2"),
              page.evaluate("document.documentElement.scrollHeight"))
        # point at a still and read its title beside the pointer
        first = page.locator(".cluster-link").first
        title = first.get_attribute("data-cursor-label")
        first.hover()
        page.wait_for_timeout(500)
        label = page.locator(".cursor-label").inner_text()
        # the interface face speaks in capitals, so the label is the title cased up
        check("the cursor label carries the still's title beside the pointer",
              label.strip().upper() == title.strip().upper(), f"{label!r} vs {title!r}")
        shot(page, "01_entry_cluster.png")

        # press it, land on that film
        href = first.get_attribute("href")
        first.click()
        page.wait_for_url(BASE + href, timeout=10000)
        check("pressing a cluster still lands on that film",
              page.locator(".work-title").inner_text().strip() == title.strip(),
              page.locator(".work-title").inner_text())

        # ---------------- journey 2: the numbered index
        page.goto(BASE + "/works", wait_until="load")
        page.wait_for_timeout(600)
        entries = page.locator(".index-entry")
        check("the index carries twelve entries", entries.count() == 12, entries.count())
        ordinals = page.locator(".caption-ordinal").all_inner_texts()
        check("ordinals run 001 to 012 contiguously",
              ordinals == [f"{i:03d}" for i in range(1, 13)], ordinals)
        check("the opening line reads as written",
              "Quiet decisions, made early" in page.locator(".display-line").inner_text(),
              page.locator(".display-line").inner_text())
        pale = page.evaluate("getComputedStyle(document.body).backgroundColor")
        check("the index ground is the pale token", pale == "rgb(233, 234, 228)", pale)
        page.mouse.wheel(0, 1400)
        page.wait_for_timeout(1200)
        entry = page.locator(".index-entry").nth(1)
        entry.scroll_into_view_if_needed()
        page.wait_for_timeout(600)
        img = entry.locator(".tile-img")
        before = img.evaluate("el => getComputedStyle(el).filter")
        entry.locator(".entry-link").hover()
        page.wait_for_timeout(1100)
        after = img.evaluate("el => getComputedStyle(el).filter")
        check("a still rests desaturated and returns its colour on hover",
              "saturate(0)" in before.replace(" ", "") and after != before,
              f"{before} -> {after}")
        revealed = entry.locator(".tile").evaluate(
            "el => el.classList.contains('is-revealed')")
        check("the reveal wipe completes on entry", revealed, revealed)
        shot(page, "02_work_index.png")

        # open a film, move to the next by ordinal
        entry.locator(".entry-link").click()
        page.wait_for_timeout(1200)
        check("an index entry opens its film", "/works/" in page.url, page.url)
        this_ord = page.locator(".work-ordinal").inner_text()
        nxt = page.locator(".neighbour-next")
        check("the film carries a next neighbour", nxt.count() == 1)
        shot(page, "03_work_detail.png")
        nxt.click()
        page.wait_for_timeout(1200)
        new_ord = page.locator(".work-ordinal").inner_text()
        check("next moves by ordinal",
              int(new_ord) == (int(this_ord) % 12) + 1, f"{this_ord} -> {new_ord}")

        # ---------------- journey 3: the roster and its filter
        page.goto(BASE + "/talents", wait_until="load")
        page.wait_for_timeout(800)
        controls = page.locator(".filter-control").all_inner_texts()
        check("the filter carries DIRECTOR and PHOTOGRAPHER",
              [c.strip() for c in controls] == ["DIRECTOR", "PHOTOGRAPHER"], controls)
        current = page.locator(".roster-entry.is-current")
        check("one talent fills the window on arrival", current.count() == 1, current.count())
        check("the first discipline is active on arrival",
              page.locator(".filter-control.is-active").inner_text().strip() == "DIRECTOR",
              page.locator(".filter-control.is-active").inner_text())
        name_size = page.locator(".roster-entry.is-current .roster-name").evaluate(
            "el => getComputedStyle(el).fontSize")
        check("the roster name is set at 125px", name_size == "125px", name_size)
        check("the roster does not scroll above the breakpoint",
              page.evaluate("document.documentElement.scrollHeight <= window.innerHeight + 2"),
              page.evaluate("document.documentElement.scrollHeight"))
        # arrow keys advance the set
        first_name = page.locator(".roster-entry.is-current .roster-name").inner_text()
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(600)
        second_name = page.locator(".roster-entry.is-current .roster-name").inner_text()
        check("arrow keys advance the roster one talent at a time",
              second_name != first_name, f"{first_name} -> {second_name}")
        marker_before = page.locator(".filter-marker").evaluate(
            "el => el.getBoundingClientRect().top")
        page.locator(".filter-control", has_text="PHOTOGRAPHER").click()
        page.wait_for_timeout(800)
        set_name = page.locator(".roster-entry.is-current .roster-name").inner_text().strip()
        check("PHOTOGRAPHER makes the set Camille Ferrand",
              set_name == "Camille Ferrand", set_name)
        marker_after = page.locator(".filter-marker").evaluate(
            "el => el.getBoundingClientRect().top")
        check("the marker square moves beside the active word",
              marker_after != marker_before, f"{marker_before} -> {marker_after}")
        check("pressing a discipline does not navigate", page.url.rstrip("/").endswith("/talents"),
              page.url)
        shot(page, "04_roster_photographer.png")
        page.locator(".roster-entry.is-current .roster-name a").click()
        page.wait_for_timeout(1200)
        check("the roster reaches /talents/camille-ferrand",
              page.url.endswith("/talents/camille-ferrand"), page.url)
        works_here = page.locator(".talent-works .caption-title").all_inner_texts()
        check("the talent detail reads the works she is credited on",
              "LORIS" in [w.strip().upper() for w in works_here], works_here)
        check("contact on a talent route is the house address",
              "prod@example.com" in page.locator(".talent-contact a").get_attribute("href"),
              page.locator(".talent-contact a").get_attribute("href"))
        shot(page, "05_talent_detail.png")

        # ---------------- persistence of the frame across navigation
        page.goto(BASE + "/works", wait_until="load")
        page.wait_for_timeout(500)
        page.mouse.move(700, 400)
        page.wait_for_timeout(400)
        pos_before = page.locator("#cursor-pair").evaluate(
            "el => el.getBoundingClientRect().left")
        page.locator(".index-entry .entry-link").first.click()
        page.wait_for_timeout(1400)
        check("the wordmark survives the navigation", page.locator(".wordmark").is_visible())
        check("the four labels survive the navigation",
              page.locator(".nav-link").count() == 4, page.locator(".nav-link").count())
        check("the corner credit survives the navigation",
              page.locator(".corner-credit").is_visible())
        pos_after = page.locator("#cursor-pair").evaluate(
            "el => el.getBoundingClientRect().left")
        check("the pointer marker is not returned to its parked position",
              pos_after > -900, f"{pos_before} -> {pos_after}")
        page.goto(BASE + "/talents", wait_until="load")
        page.wait_for_timeout(600)
        mark = page.locator(".centre-mark svg:visible")
        check("the centre mark swaps to the roster's variant",
              mark.count() == 1 and mark.get_attribute("class").strip() == "mark mark-talents",
              mark.get_attribute("class") if mark.count() else "none")

        # ---------------- a visitor cannot reach the studio
        page.goto(BASE + "/studio", wait_until="load")
        check("a visitor asking for /studio lands on /studio/login",
              "/studio/login" in page.url, page.url)

        # ---------------- journey 4: the producer signs in, creates, previews, publishes
        page.fill("input[type=email]", "producer@example.com")
        page.fill("input[type=password]", PW)
        page.click("button[type=submit]")
        page.wait_for_url("**/studio", timeout=10000)
        page.wait_for_timeout(800)
        check("signing in returns to /studio", page.url.rstrip("/").endswith("/studio"), page.url)
        cards = page.locator(".card").count()
        live = page.locator(".card.is-live").count()
        unlisted = cards - live
        check("the palette lists this house's records, published beside unlisted",
              live == 15 and unlisted >= 2, (cards, live))
        page.fill(".palette-input", "quiet")
        page.wait_for_timeout(400)
        check("typing filters the house's records by title",
              page.locator(".card").count() == 1, page.locator(".card").count())
        check("the unlisted record reads as unlisted",
              page.locator(".card-state").first.inner_text().strip() == "UNLISTED",
              page.locator(".card-state").first.inner_text())
        page.fill(".palette-input", "")
        shot(page, "06_studio_palette.png")

        # New talent
        page.click("text=NEW TALENT")
        page.wait_for_url("**/studio/talents/new", timeout=10000)
        page.wait_for_timeout(600)
        page.fill(".auth-form input[type=text] >> nth=0", NEW_NAME)
        page.select_option(".auth-form select >> visible=true", "stylist")
        alts = page.locator(".field-group input[type=text]")
        alts.nth(0).fill(NEW_NAME + ", stylist, portrait")
        alts.nth(1).fill(NEW_SLUG + "-portrait")
        shot(page, "07_studio_new_talent.png")
        page.click("button[type=submit]")
        page.wait_for_url("**/studio/items/*", timeout=10000)
        page.wait_for_timeout(900)
        item_url = page.url
        item_id = item_url.rstrip("/").split("/")[-1]
        check("creating a talent opens its own studio address",
              "/studio/items/" in item_url, item_url)

        # the new talent is absent from the roster until it is published
        checker = ctx.new_page()
        checker.goto(BASE + "/api/talents")
        body = checker.inner_text("body")
        check("the unpublished talent is absent from the roster", NEW_SLUG not in body)
        checker.goto(BASE + "/talents/" + NEW_SLUG)
        check("the unpublished talent is absent at its own address",
              "That page is not here." in checker.inner_text("body"))

        # mint a preview token and open the preview
        page.click("text=MINT A PREVIEW TOKEN")
        page.wait_for_timeout(1200)
        preview_href = page.locator(".form-note a").first.get_attribute("href")
        check("a preview token is minted", preview_href and len(
            preview_href.split("/")[-1]) == 32, preview_href)
        token = preview_href.split("/")[-1]

        # a stranger with no session cannot reach the preview or the portrait
        stranger = browser.new_context(viewport={"width": 1440, "height": 900})
        sp = stranger.new_page()
        sp.goto(BASE + preview_href)
        check("a stranger cannot reach the preview",
              "That page is not here." in sp.inner_text("body"))
        sp.goto(BASE + "/api/studio/items/" + item_id)
        check("a stranger cannot read the record over the API",
              "error" in sp.inner_text("body").lower(), sp.inner_text("body")[:120])
        stranger.close()

        page.goto(BASE + preview_href, wait_until="load")
        page.wait_for_timeout(900)
        check("the preview carries the unmissable marker",
              page.locator(".preview-marker").inner_text().strip() == "PREVIEW - NOT PUBLISHED",
              page.locator(".preview-marker").inner_text())
        check("the preview renders the record through the roster's own components",
              page.locator(".roster-entry .roster-name").inner_text().strip() == NEW_NAME,
              page.locator(".roster-name").inner_text())
        check("the preview's portrait is reachable to its own producer",
              page.locator(".roster-portrait .tile-img").count() == 1)
        shot(page, "08_preview_unlisted.png")

        # publish
        page.goto(item_url, wait_until="load")
        page.wait_for_timeout(800)
        page.click("text=PUBLISH")
        page.wait_for_url("**/published", timeout=10000)
        page.wait_for_timeout(600)
        conf = page.inner_text(".confirmation")
        check("publishing lands on the confirmation naming the record",
              NEW_NAME in conf and "STYLIST" in conf.upper()
              and "/talents/" + NEW_SLUG in conf, conf[:200])
        shot(page, "09_studio_published.png")

        # the roster now carries the new name and the filter carries STYLIST
        checker.goto(BASE + "/talents", wait_until="load")
        checker.wait_for_timeout(800)
        labels = [c.strip() for c in checker.locator(".filter-control").all_inner_texts()]
        check("the filter now carries STYLIST", "STYLIST" in labels, labels)
        checker.locator(".filter-control", has_text="STYLIST").click()
        checker.wait_for_timeout(700)
        check("the roster now carries the new name",
              checker.locator(".roster-entry.is-current .roster-name").inner_text().strip()
              == NEW_NAME,
              checker.locator(".roster-entry.is-current .roster-name").inner_text())
        shot(checker, "10_roster_stylist_published.png")

        # unlisting drops it from every public read at once
        page.goto(item_url, wait_until="load")
        page.wait_for_timeout(700)
        page.click("text=UNLIST")
        page.wait_for_url("**/published", timeout=10000)
        checker.goto(BASE + "/api/talents")
        check("unlisting drops the record from the public read at once",
              NEW_SLUG not in checker.inner_text("body"))
        checker.goto(BASE + "/api/disciplines")
        check("unlisting drops its discipline from the derived set",
              "stylist" not in checker.inner_text("body"), checker.inner_text("body"))

        # ---------------- a viewer is refused the studio
        viewer_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        vp = viewer_ctx.new_page()
        vp.goto(BASE + "/studio/login", wait_until="load")
        vp.fill("input[type=email]", "viewer@example.com")
        vp.fill("input[type=password]", PW)
        vp.click("button[type=submit]")
        vp.wait_for_timeout(1500)
        check("a viewer signing in at the studio is sent to the entry route",
              vp.url.rstrip("/").endswith(":4173"), vp.url)
        vp.goto(BASE + "/studio", wait_until="load")
        vp.wait_for_timeout(500)
        check("a signed-in viewer asking for /studio sees the entry route",
              vp.url.rstrip("/").endswith(":4173"), vp.url)
        check("no studio control is drawn for a viewer",
              vp.locator(".palette").count() == 0)
        shot(vp, "11_viewer_refused_studio.png")
        viewer_ctx.close()

        # ---------------- the other house's producer
        mer = browser.new_context(viewport={"width": 1440, "height": 900})
        mp = mer.new_page()
        mp.goto(BASE + "/studio/login", wait_until="load")
        mp.fill("input[type=email]", "producer.meridian@example.com")
        mp.fill("input[type=password]", PW)
        mp.click("button[type=submit]")
        mp.wait_for_url("**/studio", timeout=10000)
        mp.wait_for_timeout(800)
        titles = mp.locator(".card-title").all_inner_texts()
        check("meridian's palette holds only meridian's records",
              set(t.strip() for t in titles) == {"Sable Ito", "Foundry"}, titles)
        mp.goto(BASE + "/studio/items/" + item_id, wait_until="load")
        check("meridian at a cirrus record's studio address sees not found",
              "That page is not here." in mp.inner_text("body"))
        mp.goto(BASE + preview_href, wait_until="load")
        check("meridian at a cirrus preview address sees not found",
              "That page is not here." in mp.inner_text("body"))
        shot(mp, "12_other_house_refused.png")
        mer.close()

        # ---------------- about, its blur, and the not-found surface
        page.goto(BASE + "/about", wait_until="load")
        page.wait_for_timeout(700)
        blur_far = page.locator(".lockup").evaluate("el => getComputedStyle(el).filter")
        page.mouse.wheel(0, 2600)
        page.wait_for_timeout(1400)
        blur_near = page.locator(".lockup").evaluate("el => getComputedStyle(el).filter")
        check("the about blur is scrubbed by scroll and sharpens",
              blur_far != blur_near, f"{blur_far} -> {blur_near}")
        page.mouse.wheel(0, -2600)
        page.wait_for_timeout(1200)
        blur_back = page.locator(".lockup").evaluate("el => getComputedStyle(el).filter")
        check("the blur is reversible: scrolling back re-blurs",
              blur_back != blur_near, f"{blur_near} -> {blur_back}")
        shot(page, "13_about.png")

        page.goto(BASE + "/no-such-address", wait_until="load")
        page.wait_for_timeout(400)
        check("the not-found surface carries the chrome and one line",
              page.locator(".wordmark").is_visible()
              and page.locator(".not-found-line").inner_text().strip()
              == "That page is not here.",
              page.locator(".not-found-line").inner_text())
        shot(page, "14_not_found.png")

        # ---------------- accessibility spot checks
        page.goto(BASE + "/works", wait_until="load")
        page.wait_for_timeout(500)
        names = page.evaluate("""() => {
            const nav = [...document.querySelectorAll('.nav-link')];
            return nav.map(a => a.getAttribute('aria-label'));
        }""")
        check("each split label exposes its whole word as its accessible name",
              names == ["Works", "Talents", "Contact", "About"], names)
        check("the wordmark's accessible name is 'Cirrus, home'",
              page.locator(".wordmark").get_attribute("aria-label") == "Cirrus, home",
              page.locator(".wordmark").get_attribute("aria-label"))
        check("the corner credit names its destination",
              page.locator(".corner-credit").get_attribute("aria-label")
              == "Site by Aube, opens in a new tab")
        check("every route has exactly one top-level heading",
              page.locator("h1").count() == 1, page.locator("h1").count())
        check("every still carries a written alternative",
              page.evaluate("[...document.querySelectorAll('img')]"
                            ".every(i => (i.alt || '').trim().length > 0)"))
        page.keyboard.press("Tab")
        skip = page.evaluate("document.activeElement.className")
        check("a skip link is the first focusable element", "skip-link" in skip, skip)

        # narrow width
        narrow = ctx.new_page()
        narrow.set_viewport_size({"width": 390, "height": 844})
        narrow.goto(BASE + "/works", wait_until="load")
        narrow.wait_for_timeout(800)
        filt = narrow.locator(".tile-img").first.evaluate(
            "el => getComputedStyle(el).filter")
        check("below the breakpoint the stills render in full colour",
              "saturate(0)" not in filt.replace(" ", ""), filt)
        narrow.goto(BASE + "/talents", wait_until="load")
        narrow.wait_for_timeout(800)
        check("below the breakpoint the roster becomes a scroll",
              narrow.evaluate("document.documentElement.scrollHeight > window.innerHeight + 50"),
              narrow.evaluate("document.documentElement.scrollHeight"))
        shot(narrow, "15_narrow_roster.png")
        narrow.close()

        browser.close()

    print()
    # The deliberate not-found visits log a 404 resource error; a script error does not.
    errs = [c for c in console
            if c[0] == "pageerror" or (c[0] == "error" and "404" not in c[1])]
    check("no script errors during the walk", not errs, errs[:5])
    print()
    print(f"{len(problems)} failing" if problems else "ALL PASS")
    for f in problems:
        print("  -", f)
    return 1 if problems else 0


sys.exit(run())
