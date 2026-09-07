"""Drives the running app through the brief's journeys as a stranger would."""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TEST_BASE", "http://127.0.0.1:4173")
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"

results = []
console_errors = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + name +
          ("" if cond else "  <- " + str(detail)[:300]))


def attach(page):
    def note(msg):
        # A 404 that the walk deliberately provokes is the expected answer.
        if "404" in msg and ("/studio/items/" in page.url or "not-a-route" in page.url):
            return
        console_errors.append(page.url + " :: " + msg)
    page.on("console", lambda m: note(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(page.url + " :: " + str(e)))


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get("CHROME_BIN") or None,
            args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        attach(page)

        # ---------------------------------------------- journey 1: the entry
        page.goto(BASE + "/", wait_until="load")
        page.wait_for_function(
            "() => document.getElementById('counter-value') && "
            "document.getElementById('counter-value').textContent.trim() === '100%'",
            timeout=20000)
        check("entry counter reaches 100%",
              page.inner_text("#counter-value").strip() == "100%")
        page.wait_for_timeout(700)
        veil_opacity = page.evaluate(
            "getComputedStyle(document.getElementById('entry-veil')).opacity")
        check("the veil clears once the count completes", float(veil_opacity) < 0.05,
              veil_opacity)
        stills = page.locator(".cluster-item").count()
        check("the cluster holds about twenty stills", stills == 20, stills)
        ground = page.evaluate("getComputedStyle(document.body).backgroundColor")
        check("entry ground is the near-black token", ground == "rgb(6, 4, 3)", ground)
        # every still is a real link with a written name
        named = page.evaluate(
            "Array.from(document.querySelectorAll('.cluster-item a'))"
            ".every(a => (a.getAttribute('aria-label')||'').length > 3 && "
            "a.getAttribute('href').startsWith('/works/'))")
        check("every cluster still is a link named by its title and ordinal", named)
        # the cursor label follows the pointer and carries the title
        first = page.locator(".cluster-item a").first
        box = first.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.wait_for_timeout(500)
        label = page.inner_text("#cursor-label").strip()
        check("the title appears beside the pointer", len(label) > 0, label)
        page.screenshot(path=SHOTS + "/01_entry_counter_complete.png")

        target = first.get_attribute("href")
        first.click()
        page.wait_for_url(BASE + target, timeout=15000)
        check("pressing a still lands on that film", page.url.endswith(target), page.url)

        # ------------------------------------------- journey 2: the index
        page.goto(BASE + "/works", wait_until="load")
        page.wait_for_timeout(600)
        entries = page.locator(".work-entry").count()
        check("the index shows twelve entries", entries == 12, entries)
        ordinals = page.eval_on_selector_all(
            ".work-entry .caption-ordinal", "els => els.map(e => e.textContent.trim())")
        check("ordinals read 001 to 012",
              ordinals == [str(i).zfill(3) for i in range(1, 13)], ordinals)
        opening = page.inner_text(".works-opening-line").strip()
        check("the opening line is the authored one",
              opening == "Quiet decisions, made early, are the ones you notice last.",
              opening)
        page.wait_for_timeout(1200)
        blur = page.evaluate(
            "getComputedStyle(document.querySelector('.works-opening-line')).filter")
        check("the opening line sharpens on entry",
              blur in ("none", "blur(0px)"), blur)
        pale = page.evaluate("getComputedStyle(document.body).backgroundColor")
        check("the index ground is the warm off-white", pale == "rgb(233, 234, 228)", pale)

        # the colour return
        page.mouse.wheel(0, 1000)
        page.wait_for_timeout(900)
        tile = page.locator(".work-entry .tile").first
        tile.scroll_into_view_if_needed()
        page.mouse.move(1430, 20)   # park the pointer clear of every still
        page.wait_for_timeout(1200)
        rest = page.evaluate(
            "getComputedStyle(document.querySelector('.work-entry .tile-media')).filter")
        check("a still rests fully desaturated", "grayscale(1)" in rest, rest)
        tb = tile.bounding_box()
        page.mouse.move(tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2)
        page.wait_for_timeout(1200)
        hovered = page.evaluate(
            "getComputedStyle(document.querySelector('.work-entry .tile-media')).filter")
        check("its colour returns on hover",
              hovered in ("none", "grayscale(0)"), hovered)
        page.screenshot(path=SHOTS + "/02_works_index_colour_return.png")

        # ------------------------------------------ journey 2b: one film
        page.goto(BASE + "/works/the-halo", wait_until="load")
        page.wait_for_timeout(500)
        check("the film shows its title",
              page.inner_text("h1").strip().lower() == "the halo",
              page.inner_text("h1"))
        check("the film shows its ordinal",
              page.inner_text(".work-ordinal").strip() == "001")
        nxt = page.locator(".neighbours a").nth(1)
        check("next is labelled with the neighbouring title",
              "Sonder" in nxt.inner_text(), nxt.inner_text())
        credits = page.inner_text(".credits")
        check("credits name a role and a name",
              "director" in credits.lower() and "rives" in credits.lower(),
              credits[:120])
        talent_link = page.locator('.credits a[href="/talents/rives"]')
        check("a credit matching a published talent links to that talent",
              talent_link.count() == 1)
        page.screenshot(path=SHOTS + "/03_work_detail_the_halo.png")
        nxt.click()
        page.wait_for_url(re.compile(r".*/works/sonder"), timeout=15000)
        check("moving to the next film by ordinal works", page.url.endswith("/works/sonder"))

        # ------------------------------------------- journey 3: the roster
        page.goto(BASE + "/talents", wait_until="load")
        page.wait_for_timeout(700)
        name = page.inner_text(".roster-block:not([hidden]) .roster-name").strip()
        check("the roster opens on the first director", name.lower() == "rives", name)
        labels = page.eval_on_selector_all(
            ".filter-btn", "els => els.map(e => e.textContent.trim())")
        check("the filter carries DIRECTOR and PHOTOGRAPHER",
              labels == ["DIRECTOR", "PHOTOGRAPHER"], labels)
        check("no unlisted stylist reaches the filter", "STYLIST" not in labels)
        # arrow keys advance the set
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(400)
        second = page.inner_text(".roster-block:not([hidden]) .roster-name").strip()
        check("an arrow key advances the roster", second.lower() == "halcyon", second)
        announced = page.inner_text("[data-roster-announce]").strip()
        check("the current name is announced on change",
              announced.lower() == "halcyon", announced)
        # the filter
        page.click('.filter-btn[data-discipline="photographer"]')
        page.wait_for_timeout(500)
        filtered = page.inner_text(".roster-block:not([hidden]) .roster-name").strip()
        check("PHOTOGRAPHER makes the set Camille Ferrand",
              filtered.lower() == "camille ferrand", filtered)
        pressed = page.get_attribute('.filter-btn[data-discipline="photographer"]',
                                     "aria-pressed")
        check("the selected state is exposed, not only drawn", pressed == "true", pressed)
        check("the filter did not navigate", page.url.rstrip("/").endswith("/talents"),
              page.url)
        marker = page.evaluate(
            "getComputedStyle(document.querySelectorAll('.filter-item')[1]"
            ".querySelector('.filter-marker')).opacity")
        check("the marker square sits beside the active word", float(marker) > 0.9, marker)
        page.screenshot(path=SHOTS + "/04_roster_photographer.png")

        page.click(".roster-block:not([hidden]) .roster-portrait")
        page.wait_for_url(re.compile(r".*/talents/camille-ferrand"), timeout=15000)
        page.wait_for_timeout(600)
        works_on = page.inner_text(".talent-detail")
        check("the talent detail reads the works she is credited on",
              "LORIS" in works_on.upper(), works_on[:200])
        check("contact on a talent route is the house address",
              page.locator('a[href^="mailto:prod@example.com"]').count() >= 1)
        page.screenshot(path=SHOTS + "/05_talent_camille_ferrand.png")

        # --------------------------------------- the frame persists on nav
        page.goto(BASE + "/works", wait_until="load")
        page.wait_for_timeout(900)
        # Tag the persistent tree: if these nodes survive, the frame did not
        # remount. This is the observable form of the requirement.
        page.evaluate("""() => {
          document.querySelector('.wordmark').dataset.tag = 'w1';
          document.querySelector('.nav').dataset.tag = 'n1';
          document.querySelector('.corner-credit').dataset.tag = 'c1';
          document.getElementById('cursor-pair').dataset.tag = 'p1';
        }""")
        page.mouse.move(700, 500)
        page.wait_for_timeout(400)
        page.click('.work-entry a')
        page.wait_for_url(re.compile(r".*/works/.+"), timeout=15000)
        page.wait_for_timeout(1200)
        kept = page.evaluate("""() => ({
          wordmark: document.querySelector('.wordmark').dataset.tag,
          nav: document.querySelector('.nav').dataset.tag,
          credit: document.querySelector('.corner-credit').dataset.tag,
          cursor: document.getElementById('cursor-pair').dataset.tag
        })""")
        check("moving from /works to a film leaves the frame on screen throughout",
              kept == {"wordmark": "w1", "nav": "n1", "credit": "c1",
                       "cursor": "p1"}, kept)
        before = page.evaluate(
            "getComputedStyle(document.getElementById('cursor-pair')).transform")
        page.click('.nav a[href="/talents"]')
        page.wait_for_url(re.compile(r".*/talents"), timeout=15000)
        page.wait_for_timeout(900)
        kept2 = page.evaluate("""() => ({
          wordmark: document.querySelector('.wordmark').dataset.tag,
          nav: document.querySelector('.nav').dataset.tag,
          credit: document.querySelector('.corner-credit').dataset.tag,
          cursor: document.getElementById('cursor-pair').dataset.tag
        })""")
        check("and from there to /talents it is the same frame, never remounted",
              kept2 == {"wordmark": "w1", "nav": "n1", "credit": "c1",
                        "cursor": "p1"}, kept2)
        after = page.evaluate(
            "getComputedStyle(document.getElementById('cursor-pair')).transform")
        check("the cursor pair is not returned to its parked position",
              "-999" not in after, after)
        check("the frame is still on screen after navigating",
              page.locator(".wordmark").is_visible() and
              page.locator(".nav a[href='/works']").is_visible() and
              page.locator(".corner-credit").is_visible())
        mark = page.evaluate(
            "document.querySelector('#centre-mark svg').getAttribute('viewBox')")
        check("the centre mark swapped to the roster's variant", mark == "0 0 18 18", mark)

        # ------------------------------------------- not found and studio gate
        page.goto(BASE + "/definitely-not-a-route", wait_until="load")
        check("an unknown address shows the site's own not-found",
              "That page is not here." in page.content())
        check("the not-found keeps the chrome", page.locator(".wordmark").is_visible())
        check("the not-found does not echo the path",
              "definitely-not-a-route" not in page.inner_text("body"))

        page.goto(BASE + "/studio", wait_until="load")
        check("a visitor asking for /studio lands on the sign-in route",
              page.url.endswith("/studio/login") or "/studio/login" in page.url, page.url)

        # ------------------------------------- journey 4: the producer
        page.fill("#email", "producer@example.com")
        page.fill("#password", PW)
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r".*/studio$"), timeout=20000)
        page.wait_for_timeout(700)
        check("signing in returns to the studio", page.url.rstrip("/").endswith("/studio"),
              page.url)
        cards = page.locator(".card").count()
        expected = page.evaluate(
            "fetch('/api/studio/items', {headers: {Authorization: 'Bearer ' + "
            "(localStorage.getItem('cirrus_token')||'')}}).then(r => r.json())"
            ".then(a => a.length)")
        check("the palette lists the house's own records",
              cards == expected and cards > 0, (cards, expected))
        page.fill("#palette", "quiet")
        page.wait_for_timeout(400)
        shown = page.locator(".card").count()
        check("typing filters the house's records by title and slug", shown == 1, shown)
        card_text = page.inner_text(".card")
        check("published sits beside unlisted", "UNLISTED" in card_text, card_text)
        page.fill("#palette", "")
        page.wait_for_timeout(300)
        page.screenshot(path=SHOTS + "/06_studio_palette.png")

        # create a talent
        page.click('a[href="/studio/talents/new"]')
        page.wait_for_url(re.compile(r".*/studio/talents/new"), timeout=15000)
        page.wait_for_timeout(500)
        page.fill("#title", "Wren Adalie")
        page.fill("#slug", "wren-adalie")
        page.select_option("#discipline", "stylist")
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r".*/studio/items/\d+$"), timeout=20000)
        page.wait_for_timeout(700)
        item_url = page.url
        check("creating a record opens its own address", "/studio/items/" in item_url)
        check("a new record is created unlisted", "UNLISTED" in page.inner_text("body"))

        # it is absent from the roster before it is published
        stranger_ctx = browser.new_context()
        probe = stranger_ctx.new_page()
        probe.goto(BASE + "/api/talents")
        check("the new talent is absent from the roster before publishing",
              "wren-adalie" not in probe.content())
        probe.goto(BASE + "/talents/wren-adalie")
        check("the new talent is absent at its own address before publishing",
              "That page is not here." in probe.content())

        # attach a poster and mint a preview
        page.fill("#alt", "Wren Adalie, stylist, portrait")
        page.fill("#seed", "wren-adalie-poster")
        page.click("button:has-text('ATTACH POSTER')")
        page.wait_for_timeout(1500)
        check("the poster is attached",
              "poster attached" in page.inner_text("body").lower())
        poster_src = page.get_attribute(".studio-wrap img", "src")

        probe.goto(BASE + poster_src)
        check("the unlisted record's pixels are unreachable to a stranger",
              "not here" in probe.content().lower(), probe.content()[:200])

        page.click("button:has-text('MINT PREVIEW TOKEN')")
        page.wait_for_timeout(1200)
        preview_href = page.get_attribute("a:has-text('OPEN PREVIEW')", "href")
        check("a preview token is minted",
              bool(preview_href and re.fullmatch(r"/preview/[0-9a-f]{32}", preview_href)),
              preview_href)

        probe.goto(BASE + preview_href)
        check("the preview reveals nothing without a producer session",
              "wren adalie" not in probe.content().lower(), probe.content()[:200])
        probe.close()
        stranger_ctx.close()

        page.goto(BASE + preview_href, wait_until="load")
        page.wait_for_timeout(700)
        check("the producer's preview renders the unlisted record",
              "wren adalie" in page.content().lower())
        check("the preview carries its marker",
              "PREVIEW - NOT PUBLISHED" in page.inner_text("body"))
        page.screenshot(path=SHOTS + "/07_preview_before_publish.png")

        # publish
        page.goto(item_url, wait_until="load")
        page.wait_for_timeout(700)
        page.click("button:has-text('PUBLISH')")
        page.wait_for_url(re.compile(r".*/studio/items/\d+/published"), timeout=20000)
        page.wait_for_timeout(600)
        body = page.inner_text("body")
        check("publishing lands on the confirmation", "/published" in page.url, page.url)
        check("the confirmation names the record", "wren adalie" in body.lower(), body[:200])
        check("the confirmation names its public address",
              "/talents/wren-adalie" in body.lower(), body[:300])
        check("the confirmation names the discipline it now carries", "STYLIST" in body)
        page.screenshot(path=SHOTS + "/08_studio_published_confirmation.png")

        # the roster now carries the name and the filter carries STYLIST
        page.goto(BASE + "/talents", wait_until="load")
        page.wait_for_timeout(700)
        labels = page.eval_on_selector_all(
            ".filter-btn", "els => els.map(e => e.textContent.trim())")
        check("the filter now carries STYLIST", "STYLIST" in labels, labels)
        page.click('.filter-btn[data-discipline="stylist"]')
        page.wait_for_timeout(500)
        now = page.inner_text(".roster-block:not([hidden]) .roster-name").strip()
        check("the roster now carries the new name", now.lower() == "wren adalie", now)
        page.screenshot(path=SHOTS + "/09_roster_carries_new_stylist.png")

        # ---------------------------------- a viewer is refused the studio
        v = ctx.new_page()
        attach(v)
        v.goto(BASE + "/studio/login", wait_until="load")
        v.fill("#email", "viewer@example.com")
        v.fill("#password", PW)
        v.click("button[type=submit]")
        v.wait_for_timeout(2500)
        check("a signed-in viewer asking for /studio sees the entry route",
              v.url.rstrip("/").endswith(BASE.rstrip("/")) or v.url.rstrip("/") == BASE,
              v.url)
        v.goto(BASE + "/studio", wait_until="load")
        v.wait_for_timeout(800)
        check("a viewer cannot reach a studio route",
              not v.url.rstrip("/").endswith("/studio") or
              "palette" not in v.content().lower(), v.url)
        check("no studio control is drawn for a viewer",
              v.locator("#palette").count() == 0)
        v.screenshot(path=SHOTS + "/10_viewer_refused_studio.png")
        v.close()

        # ------------------- the other house's producer reaches none of it
        m = ctx.new_page()
        attach(m)
        m.goto(BASE + "/studio/login", wait_until="load")
        m.fill("#email", "producer.meridian@example.com")
        m.fill("#password", PW)
        m.click("button[type=submit]")
        m.wait_for_url(re.compile(r".*/studio$"), timeout=20000)
        m.wait_for_timeout(800)
        mcards = m.locator(".card").count()
        check("meridian's palette shows only its own two records", mcards == 2, mcards)
        check("no cirrus record appears in meridian's studio",
              "wren adalie" not in m.content().lower()
              and "noor vasquez" not in m.content().lower())
        cirrus_item = item_url.split("/studio/items/")[1]
        m.goto(BASE + "/studio/items/" + cirrus_item, wait_until="load")
        m.wait_for_timeout(500)
        check("meridian at a cirrus studio address is answered not found",
              "That page is not here." in m.content(), m.content()[:200])
        m.screenshot(path=SHOTS + "/11_meridian_cannot_reach_cirrus.png")
        m.close()

        # --------------------------------------------------- signing out
        page.goto(BASE + "/studio", wait_until="load")
        page.wait_for_timeout(600)
        page.click("button:has-text('SIGN OUT')")
        page.wait_for_timeout(1500)
        page.goto(BASE + "/studio", wait_until="load")
        page.wait_for_timeout(600)
        check("signing out makes /studio unreachable at once",
              "/studio/login" in page.url, page.url)

        # ------------------------------------------------ narrow viewport
        n = ctx.new_page()
        attach(n)
        n.set_viewport_size({"width": 390, "height": 844})
        n.goto(BASE + "/works", wait_until="load")
        n.wait_for_timeout(900)
        n.mouse.wheel(0, 1400)
        n.wait_for_timeout(900)
        filt = n.evaluate(
            "getComputedStyle(document.querySelector('.work-entry .tile-media')).filter")
        check("below the breakpoint the stills render in full colour",
              filt in ("none", "grayscale(0)"), filt)
        cursor_shown = n.evaluate(
            "getComputedStyle(document.getElementById('cursor-pair')).display")
        check("the cursor pair is hidden on a narrow, coarse layout",
              cursor_shown == "none", cursor_shown)
        n.goto(BASE + "/talents", wait_until="load")
        n.wait_for_timeout(800)
        visible_blocks = n.evaluate(
            "document.querySelectorAll('.roster-block:not([hidden])').length")
        check("below the breakpoint the roster becomes a scroll of every talent",
              visible_blocks >= 2, visible_blocks)
        n.screenshot(path=SHOTS + "/12_narrow_works.png", full_page=False)
        n.close()

        # The walk leaves the store as it found it.
        cleanup = ctx.new_page()
        cleanup.goto(BASE + "/studio/login", wait_until="load")
        cleanup.fill("#email", "producer@example.com")
        cleanup.fill("#password", PW)
        cleanup.click("button[type=submit]")
        cleanup.wait_for_url(re.compile(r".*/studio$"), timeout=20000)
        cleanup.wait_for_timeout(600)
        cleanup.evaluate(
            "(id) => fetch('/api/studio/items/' + id + '/publish', {method:'POST',"
            "headers:{'Content-Type':'application/json','Authorization':'Bearer ' + "
            "(localStorage.getItem('cirrus_token')||'')},"
            "body: JSON.stringify({published:false})})", cirrus_item)
        cleanup.wait_for_timeout(600)
        cleanup.close()

        browser.close()

    print()
    if console_errors:
        print("CONSOLE ERRORS:")
        for e in console_errors[:20]:
            print("  " + e)
    else:
        print("No console errors.")
    failed = [r for r in results if not r[1]]
    print("%d checks, %d failed" % (len(results), len(failed)))
    return 1 if (failed or console_errors) else 0


if __name__ == "__main__":
    sys.exit(run())
