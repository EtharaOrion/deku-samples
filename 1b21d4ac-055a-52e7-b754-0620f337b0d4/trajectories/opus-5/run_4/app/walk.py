"""Drive the four journeys in a real browser and read the values back."""
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
SHOT = "/app/.browser_screenshots/"
PW = "deku-demo-pw-2026"

fails = []
console = []


def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f"  -> {detail}"))
    if not cond:
        fails.append(name)


CHROME = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"


def run(p):
    import os
    kw = {"executable_path": CHROME} if os.path.exists(CHROME) else {}
    browser = p.chromium.launch(**kw)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: console.append((m.type, m.text))
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: console.append(("pageerror", str(e))))

    # ---------------------------------------------- journey 1: the entry cluster
    page.goto(BASE + "/", wait_until="networkidle")
    counter = page.locator(".counter-well__value")
    page.wait_for_function(
        "() => document.querySelector('.counter-well__value')?.textContent === '100%'",
        timeout=20000)
    check("the counter reaches 100%", counter.inner_text().strip() == "100%",
          counter.inner_text())
    page.wait_for_timeout(900)
    veil_gone = page.evaluate(
        "() => { const w = document.querySelector('.counter-well');"
        " return !w || getComputedStyle(w).opacity === '0' || w.offsetParent === null; }")
    check("the veil clears once the count completes", veil_gone)
    stills = page.locator(".cluster__still")
    check("the cluster carries roughly twenty stills", stills.count() >= 18, stills.count())
    ground = page.evaluate("getComputedStyle(document.body).backgroundColor")
    check("the entry ground is the dark token", ground == "rgb(6, 4, 3)", ground)
    no_scroll = page.evaluate(
        "() => { const w = document.querySelector('.well');"
        " return w.scrollHeight <= w.clientHeight + 1; }")
    check("the entry route does not scroll", no_scroll)
    first_name = stills.first.get_attribute("aria-label")
    check("every cluster still is a link named by title then ordinal",
          first_name and "," in first_name, first_name)
    page.screenshot(path=SHOT + "01_entry_counter_complete.png")

    # point at a still and read its title beside the pointer
    box = stills.first.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(500)
    label = page.locator(".cursor__label").inner_text()
    check("the cursor label carries the title of the still under the pointer",
          label.strip() != "", repr(label))
    page.screenshot(path=SHOT + "02_entry_cursor_label.png")

    # press it and land on that film
    stills.first.click()
    page.wait_for_timeout(1200)
    check("pressing a still lands on that film", "/works/" in page.url, page.url)

    # ---------------------------------------------- journey 2: the numbered index
    page.goto(BASE + "/works", wait_until="networkidle")
    entries = page.locator(".work-entry")
    check("the index carries twelve entries", entries.count() == 12, entries.count())
    ords = page.locator(".caption-row__ordinal").all_inner_texts()
    check("the ordinals read 001 to 012",
          [o.strip() for o in ords] == [f"{i:03d}" for i in range(1, 13)], ords)
    ground = page.evaluate("getComputedStyle(document.body).backgroundColor")
    check("the index ground is the pale token", ground == "rgb(233, 234, 228)", ground)
    opening = page.locator(".works-opening__line").inner_text()
    check("the opening line is the authored one",
          "Quiet decisions, made early" in opening, opening[:60])
    # the colour return
    page.mouse.wheel(0, 1200)
    page.wait_for_timeout(1200)
    first_img = page.locator(".work-entry .tile__img").first
    rest_filter = first_img.evaluate("e => getComputedStyle(e).filter")
    check("a still rests fully desaturated", "grayscale(1)" in rest_filter, rest_filter)
    dur = first_img.evaluate("e => getComputedStyle(e).transitionDuration")
    check("the colour return takes 0.8s", "0.8s" in dur, dur)
    link = page.locator(".work-entry .tile-link").first
    link.hover()
    page.wait_for_timeout(1100)
    hov = first_img.evaluate("e => getComputedStyle(e).filter")
    check("the still returns to full colour on hover",
          hov in ("none", "grayscale(0)"), hov)
    page.screenshot(path=SHOT + "03_works_index_colour_return.png")

    # open a film, move to the next by ordinal
    page.locator(".work-entry .tile-link").first.click()
    page.wait_for_timeout(1200)
    check("a film opens from the index", "/works/" in page.url, page.url)
    title = page.locator(".detail__title").inner_text()
    ordv = page.locator(".detail__ordinal").inner_text()
    check("the film carries its title and ordinal", title and ordv.strip() == "001",
          (title, ordv))
    nxt = page.locator(".detail__nav-item--next")
    check("the film carries its neighbour", nxt.count() == 1)
    page.screenshot(path=SHOT + "04_work_detail.png")
    nxt.click()
    page.wait_for_timeout(1200)
    check("next moves by ordinal",
          page.locator(".detail__ordinal").inner_text().strip() == "002",
          page.locator(".detail__ordinal").inner_text())

    # -------------------------------------------------- journey 3: the roster
    page.goto(BASE + "/talents", wait_until="networkidle")
    page.wait_for_timeout(600)
    name = page.locator(".roster__entry.is-active .roster__name").first.inner_text()
    check("the roster opens on the first talent", name.strip() == "Rives", name)
    fs = page.locator(".roster__filter-item")
    check("the filter carries the derived set",
          [t.strip() for t in fs.all_inner_texts()] == ["DIRECTOR", "PHOTOGRAPHER"],
          fs.all_inner_texts())
    size = page.locator(".roster__entry.is-active .roster__name").first.evaluate(
        "e => getComputedStyle(e).fontSize")
    check("the roster name is set at 125px", size == "125px", size)
    h1s = page.locator("h1").count()
    check("the route has exactly one top-level heading", h1s == 1, h1s)
    # arrow keys advance the set
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(700)
    name2 = page.locator(".roster__entry.is-active .roster__name").first.inner_text()
    check("arrow keys advance the roster", name2.strip() == "Halcyon", name2)
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(600)

    # press PHOTOGRAPHER
    page.locator('.roster__filter-item[data-discipline="photographer"]').click()
    page.wait_for_timeout(800)
    name3 = page.locator(".roster__entry.is-active .roster__name").first.inner_text()
    check("PHOTOGRAPHER filters the set to Camille Ferrand",
          name3.strip() == "Camille Ferrand", name3)
    pressed = page.locator(
        '.roster__filter-item[data-discipline="photographer"]').get_attribute("aria-pressed")
    check("the selected state is exposed rather than only drawn", pressed == "true", pressed)
    marker = page.locator(".roster__marker").evaluate("e => getComputedStyle(e).transform")
    check("the marker square moved beside the active word",
          marker != "none" and "matrix" in marker, marker)
    check("selecting a discipline does not navigate", page.url.rstrip("/").endswith("/talents"),
          page.url)
    page.screenshot(path=SHOT + "05_roster_photographer.png")

    page.locator(".roster__entry.is-active .roster__portrait").click()
    page.wait_for_timeout(1200)
    check("the portrait reaches the talent detail",
          "camille-ferrand" in page.url, page.url)
    works_on = page.locator(".detail__sequence, .work-entry").count()
    credited = page.locator(".work-entry .caption-row__title").all_inner_texts()
    check("the talent detail reads the works she is credited on",
          any("LORIS" in w.upper() for w in credited), credited)
    page.screenshot(path=SHOT + "06_talent_detail.png")

    # ------------------------------------------- the frame persists across routes
    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(500)
    page.mouse.move(700, 500)
    page.wait_for_timeout(400)
    before_id = page.evaluate(
        "() => { const w = document.querySelector('.wordmark');"
        " w.__mark = (w.__mark || Math.random()); return w.__mark; }")
    before_cursor = page.evaluate(
        "() => document.querySelector('.cursor__square').style.transform")
    page.locator(".work-entry .tile-link").first.click()
    page.wait_for_timeout(1400)
    after_id = page.evaluate(
        "() => { const w = document.querySelector('.wordmark'); return w.__mark; }")
    check("the wordmark element never remounts across a navigation",
          after_id == before_id, (before_id, after_id))
    after_cursor = page.evaluate(
        "() => document.querySelector('.cursor__square').style.transform")
    check("the cursor pair does not return to its parked position",
          "-999" not in after_cursor, after_cursor)
    check("the four labels and the corner credit stay on screen",
          page.locator(".nav__link").count() == 4
          and page.locator(".credit").is_visible())
    mark_before = page.locator("#centre-mark").inner_html()
    page.locator('.nav__link[href="/talents"]').click()
    page.wait_for_timeout(1400)
    mark_after = page.locator("#centre-mark").inner_html()
    check("the centre mark swaps to the new route's variant",
          mark_before != mark_after)
    check("crossing to the roster kept the frame", page.locator(".wordmark").is_visible()
          and page.evaluate("() => document.querySelector('.wordmark').__mark") == before_id)

    # ------------------------------------------------------- unlisted is absent
    page.goto(BASE + "/talents/noor-vasquez")
    check("an unlisted talent's address is a real not-found",
          page.locator(".not-found__line").count() == 1)
    body_text = page.locator("body").inner_text()
    check("the not-found surface does not echo the path",
          "noor-vasquez" not in body_text, body_text[:120])
    check("the not-found surface carries the full chrome",
          page.locator(".nav__link").count() == 4)
    page.screenshot(path=SHOT + "07_not_found.png")

    # -------------------------------------- a viewer is refused the studio
    vctx = browser.new_context(viewport={"width": 1440, "height": 900})
    vp = vctx.new_page()
    vp.goto(BASE + "/studio/login", wait_until="networkidle")
    vp.fill("#email", "viewer@example.com")
    vp.fill("#password", PW)
    vp.click("button[type=submit]")
    vp.wait_for_timeout(1500)
    vp.goto(BASE + "/studio", wait_until="networkidle")
    check("a signed-in viewer asking for /studio is refused and sees the entry route",
          vp.url.rstrip("/") == BASE.rstrip("/"), vp.url)
    check("no studio control is drawn for a viewer",
          vp.locator(".palette").count() == 0)
    vctx.close()

    # a visitor with no session lands on the login
    actx = browser.new_context()
    ap = actx.new_page()
    ap.goto(BASE + "/studio", wait_until="networkidle")
    check("a visitor asking for /studio lands on /studio/login",
          "/studio/login" in ap.url, ap.url)
    actx.close()

    # ------------------------------------------- journey 4: the producer
    page.goto(BASE + "/studio/login", wait_until="networkidle")
    page.fill("#email", "producer@example.com")
    page.fill("#password", PW)
    page.screenshot(path=SHOT + "08_studio_login.png")
    page.click("button[type=submit]")
    page.wait_for_url("**/studio", timeout=15000)
    page.wait_for_timeout(800)
    check("signing in returns to the studio", page.url.endswith("/studio"), page.url)
    cards = page.locator("[data-record]")
    check("the palette lists the house's own records, published beside unlisted",
          cards.count() >= 17, cards.count())
    states = page.locator(".card__state").all_inner_texts()
    check("unlisted records are named in words, not by colour alone",
          any("UNLISTED" in s for s in states) and any("LIVE" in s for s in states))
    page.screenshot(path=SHOT + "09_studio_palette.png")

    # typing filters the house's own records
    page.fill("#palette-input", "halo")
    page.wait_for_timeout(600)
    visible = page.evaluate(
        "() => Array.from(document.querySelectorAll('[data-record]'))"
        ".filter(e => e.offsetParent !== null).length")
    check("typing filters the records by title and slug", visible == 1, visible)
    page.fill("#palette-input", "")
    page.wait_for_timeout(400)

    # choose New talent
    page.click('a[href="/studio/talents/new"]')
    page.wait_for_timeout(1200)
    check("New talent opens its own address",
          "/studio/talents/new" in page.url, page.url)
    import time
    slug = f"iris-mont-{int(time.time()) % 100000}"
    page.fill("#title", "Iris Montrose")
    page.fill("#slug", slug)
    page.select_option("#discipline", "stylist")
    page.fill("#alt", "Iris Montrose, stylist, portrait")
    page.screenshot(path=SHOT + "10_studio_new_talent.png")
    page.click("button[type=submit]")
    page.wait_for_url("**/studio/items/*", timeout=15000)
    page.wait_for_timeout(800)
    item_url = page.url
    item_id = item_url.rstrip("/").split("/")[-1]
    check("the record was created and opens its edit route",
          "/studio/items/" in item_url, item_url)
    check("a new record is created unlisted",
          "UNLISTED" in page.locator("body").inner_text())

    # the new talent is absent from the roster until it is published
    anon = browser.new_context()
    anp = anon.new_page()
    anp.goto(BASE + "/talents", wait_until="networkidle")
    anp.wait_for_timeout(400)
    check("the unlisted talent is absent from the roster before publishing",
          "Iris Montrose" not in anp.locator("body").inner_text())
    anp.goto(BASE + f"/talents/{slug}")
    check("the unlisted talent is absent at its own address",
          anp.locator(".not-found__line").count() == 1)
    anon.close()

    # mint a preview token and open the preview
    page.click("button:has-text('MINT PREVIEW TOKEN')")
    page.wait_for_timeout(1500)
    check("minting a token reports its 15 minute life",
          "15 MINUTES" in page.locator("body").inner_text().upper())
    page.click("a:has-text('OPEN PREVIEW')")
    page.wait_for_timeout(1500)
    check("the preview opens at /preview/{token}", "/preview/" in page.url, page.url)
    marker = page.locator(".preview-marker")
    check("the preview carries its unmissable marker",
          marker.count() == 1 and marker.inner_text().strip() == "PREVIEW - NOT PUBLISHED",
          marker.inner_text() if marker.count() else None)
    check("the preview renders the record through the published components",
          "Iris Montrose" in page.locator("body").inner_text()
          and page.locator(".roster__name").count() == 1)
    page.screenshot(path=SHOT + "11_preview_unlisted.png")
    preview_url = page.url

    # a stranger with no session reaches nothing at that same address
    anon = browser.new_context()
    anp = anon.new_page()
    anp.goto(preview_url)
    check("the preview address reveals nothing without a producer session",
          anp.locator(".not-found__line").count() == 1
          and "Iris Montrose" not in anp.locator("body").inner_text())
    anon.close()

    # publish, and land on the confirmation
    page.goto(item_url, wait_until="networkidle")
    page.wait_for_timeout(600)
    page.click("button:has-text('PUBLISH')")
    page.wait_for_url("**/published", timeout=15000)
    page.wait_for_timeout(600)
    text = page.locator("body").inner_text()
    check("publishing lands on the confirmation", "/published" in page.url, page.url)
    check("the confirmation names the record, its address and its discipline",
          "Iris Montrose" in text and f"/talents/{slug}" in text and "STYLIST" in text,
          text[:300])
    page.screenshot(path=SHOT + "12_studio_published.png")

    # the roster now carries the new name and the filter carries STYLIST
    anon = browser.new_context(viewport={"width": 1440, "height": 900})
    anp = anon.new_page()
    anp.goto(BASE + "/talents", wait_until="networkidle")
    anp.wait_for_timeout(600)
    labels = [t.strip() for t in anp.locator(".roster__filter-item").all_inner_texts()]
    check("the filter now carries STYLIST", "STYLIST" in labels, labels)
    anp.locator('.roster__filter-item[data-discipline="stylist"]').click()
    anp.wait_for_timeout(800)
    check("the roster now carries the new name",
          "Iris Montrose" in anp.locator(".roster__entry.is-active").inner_text(),
          anp.locator(".roster__entry.is-active").inner_text()[:80])
    anp.screenshot(path=SHOT + "13_roster_new_stylist.png")
    anon.close()

    # unlisting drops it from every public read at once
    page.goto(item_url, wait_until="networkidle")
    page.wait_for_timeout(600)
    page.click("button:has-text('UNLIST')")
    page.wait_for_timeout(2000)
    anon = browser.new_context()
    anp = anon.new_page()
    anp.goto(BASE + "/talents", wait_until="networkidle")
    anp.wait_for_timeout(400)
    check("unlisting drops the record from the roster at once",
          "Iris Montrose" not in anp.locator("body").inner_text())
    labels = [t.strip() for t in anp.locator(".roster__filter-item").all_inner_texts()]
    check("unlisting drops its discipline from the filter", "STYLIST" not in labels, labels)
    anon.close()

    # signing out makes /studio unreachable at once
    page.goto(BASE + "/studio", wait_until="networkidle")
    page.wait_for_timeout(500)
    page.click("button:has-text('SIGN OUT')")
    page.wait_for_timeout(1500)
    page.goto(BASE + "/studio", wait_until="networkidle")
    check("signing out makes /studio unreachable at once",
          "/studio/login" in page.url, page.url)

    # ------------------------------------------------------- narrow viewport
    m = browser.new_context(viewport={"width": 390, "height": 844},
                            has_touch=True, is_mobile=True)
    mp = m.new_page()
    mp.goto(BASE + "/works", wait_until="networkidle")
    mp.wait_for_timeout(800)
    filt = mp.locator(".work-entry .tile__img").first.evaluate(
        "e => getComputedStyle(e).filter")
    check("below the breakpoint the stills render in full colour",
          filt in ("none", "grayscale(0)"), filt)
    cur = mp.locator(".cursor__square").evaluate("e => getComputedStyle(e).display")
    check("the cursor pair is hidden on a pointer-coarse device", cur == "none", cur)
    mp.screenshot(path=SHOT + "14_narrow_works.png")
    mp.goto(BASE + "/talents", wait_until="networkidle")
    mp.wait_for_timeout(600)
    scrolls = mp.evaluate(
        "() => { const w = document.querySelector('.well');"
        " return w.scrollHeight > w.clientHeight + 10; }")
    check("below the breakpoint the roster becomes a scroll", scrolls)
    mp.screenshot(path=SHOT + "15_narrow_roster.png")
    m.close()

    browser.close()


with sync_playwright() as p:
    run(p)

print()
errs = [c for c in console if c[0] in ("error", "pageerror")
        and "404" not in c[1]]
for c in errs:
    print("CONSOLE", c)
check("the console is clean of errors", not errs, errs[:5])
print()
print("FAILURES:", fails if fails else "none")
sys.exit(1 if fails else 0)
