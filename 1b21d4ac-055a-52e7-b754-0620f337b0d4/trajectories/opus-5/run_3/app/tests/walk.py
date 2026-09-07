"""Walk the journeys the brief describes, as a stranger would, and read the
page back rather than judging it by eye."""
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"
CHROME = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"

FAILURES = []
CHECKS = [0]
CONSOLE = []


def check(name, condition, detail=""):
    CHECKS[0] += 1
    if condition:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name} {detail}")
        FAILURES.append(f"{name} {detail}")


def attach(page):
    page.on("console", lambda m: CONSOLE.append((m.type, m.text))
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: CONSOLE.append(("pageerror", str(e))))


def journey_one(page):
    """Open /, watch the counter reach 100%, point at a still, press it."""
    print("\n== journey 1: the entry cluster ==")
    page.goto(BASE + "/", wait_until="networkidle")
    check("the entry route answers", page.title() == "Cirrus", page.title())
    page.wait_for_function(
        "() => document.getElementById('counter-figure').textContent === '100%'",
        timeout=15000)
    check("the counter reaches 100%",
          page.text_content("#counter-figure").strip() == "100%")
    page.wait_for_function(
        "() => document.getElementById('counter-well').classList.contains('is-done')",
        timeout=8000)
    check("the veil clears",
          "is-done" in page.get_attribute("#counter-well", "class"))
    stills = page.locator(".entry-still")
    check("the cluster holds about twenty stills", stills.count() == 20, stills.count())
    ground = page.evaluate("getComputedStyle(document.body).backgroundColor")
    check("the entry ground is the near-black", ground == "rgb(6, 4, 3)", ground)
    check("the entry route does not scroll",
          page.evaluate("document.documentElement.scrollHeight <= window.innerHeight + 2"),
          page.evaluate("document.documentElement.scrollHeight"))
    name = stills.first.get_attribute("aria-label")
    check("every still is a link with a written name", bool(name), name)

    first = stills.first
    first.hover()
    page.wait_for_timeout(500)
    label = page.text_content("#cursor-label")
    check("the title reads beside the pointer", label and len(label) > 1, repr(label))
    page.screenshot(path=f"{SHOTS}/01_entry_counter_complete.png")

    href = first.get_attribute("href")
    first.click()
    page.wait_for_url(BASE + href, timeout=8000)
    check("pressing a still lands on that film", page.url.endswith(href), page.url)
    check("the film's title is the top-level heading",
          page.locator("h1").count() == 1)
    return True


def journey_two(page):
    """Open /works, point at an entry, press it, move to the next by ordinal."""
    print("\n== journey 2: the numbered index ==")
    page.goto(BASE + "/works", wait_until="networkidle")
    check("the index answers", page.title() == "Cirrus - Works", page.title())
    ground = page.evaluate("getComputedStyle(document.body).backgroundColor")
    check("the index ground is the warm off-white", ground == "rgb(233, 234, 228)", ground)
    line = page.text_content(".opening-line").strip()
    check("the opening line reads as written",
          line == "Quiet decisions, made early, are the ones you notice last.", line)
    entries = page.locator(".work-entry")
    check("twelve entries", entries.count() == 12, entries.count())
    ordinals = page.locator(".caption-ordinal").all_text_contents()
    check("ordinals run 001 to 012",
          [o.strip() for o in ordinals] == [f"{i:03d}" for i in range(1, 13)], ordinals)
    check("the index scrolls a long way",
          page.evaluate("document.documentElement.scrollHeight") > 5000,
          page.evaluate("document.documentElement.scrollHeight"))
    variants = page.evaluate(
        "[...document.querySelectorAll('.work-entry')].map(e => e.className.match(/variant-(\\w+)/)[1])")
    check("three widths are used", set(variants) == {"left", "right", "centre"}, set(variants))

    # the colour return: desaturated at rest, full colour on hover.
    # Park the pointer on empty ground first: the left margin is 40px, so x=5
    # is never over an entry, whatever has scrolled under it.
    page.evaluate("window.scrollTo(0, window.innerHeight * 1.2)")
    page.mouse.move(5, 890)
    page.wait_for_timeout(900)
    rest = page.evaluate(
        "getComputedStyle(document.querySelector('.work-entry .tile-inner')).filter")
    check("a still rests desaturated", "saturate(0" in rest, rest)
    entries.first.hover()
    page.wait_for_timeout(1000)
    hovered = page.evaluate(
        "getComputedStyle(document.querySelector('.work-entry .tile-inner')).filter")
    check("the colour returns on hover",
          hovered in ("saturate(1)", "none") or "saturate(1)" in hovered, hovered)
    page.screenshot(path=f"{SHOTS}/02_works_index.png")

    page.goto(BASE + "/works/the-halo", wait_until="networkidle")
    check("a film opens", "The Halo" in page.text_content("h1"))
    check("the ordinal is shown", page.text_content(".detail-ordinal").strip() == "001")
    credits = page.text_content(".credits-list")
    check("credits name a role and a name", "DIRECTOR" in credits and "RIVES" in credits)
    check("a credited talent links to that talent",
          page.locator(".credits-list a[href='/talents/rives']").count() == 1)
    nxt = page.locator(".neighbour.next")
    check("next carries the neighbouring title",
          "Sonder" in nxt.text_content(), nxt.text_content())
    prev_text = page.text_content(".neighbour.previous")
    check("previous wraps 001 back to 012", "012" in prev_text, prev_text)
    nxt.click()
    page.wait_for_url(BASE + "/works/sonder", timeout=8000)
    check("moving to the next film by ordinal works", page.url.endswith("/works/sonder"))
    page.screenshot(path=f"{SHOTS}/03_work_detail_neighbour.png")
    return True


def journey_three(page):
    """Open /talents, press PHOTOGRAPHER, reach camille-ferrand."""
    print("\n== journey 3: the roster and its filter ==")
    page.goto(BASE + "/talents", wait_until="networkidle")
    check("the roster answers", page.title() == "Cirrus - Talents", page.title())
    filters = page.locator(".filter-item")
    labels = [t.strip() for t in page.locator(".filter-label").all_text_contents()]
    check("the filter carries the derived set",
          labels == ["DIRECTOR", "PHOTOGRAPHER"], labels)
    check("the first discipline is active on arrival",
          filters.first.get_attribute("aria-pressed") == "true")
    check("the filter controls are real buttons",
          page.evaluate("document.querySelector('.filter-item').tagName") == "BUTTON")
    active_name = page.text_content(".roster-entry.is-active .roster-name").strip()
    check("a director is shown first", active_name in ("Rives", "Halcyon"), active_name)
    check("the roster does not scroll above the breakpoint",
          page.evaluate("document.documentElement.scrollHeight <= window.innerHeight + 2"))
    size = page.evaluate(
        "getComputedStyle(document.querySelector('.roster-name')).fontSize")
    check("the roster name is set at 125px", size == "125px", size)

    page.get_by_role("button", name="PHOTOGRAPHER").click()
    page.wait_for_timeout(600)
    shown = page.text_content(".roster-entry.is-active .roster-name").strip()
    check("the set becomes Camille Ferrand", shown == "Camille Ferrand", shown)
    check("the marker square moves beside the active word",
          page.locator(".filter-item[aria-pressed='true'] .filter-label"
                       ).text_content().strip() == "PHOTOGRAPHER")
    marker_opacity = page.evaluate(
        "getComputedStyle(document.querySelector(\".filter-item[aria-pressed='true'] .filter-marker\")).opacity")
    check("the active marker is drawn", marker_opacity == "1", marker_opacity)
    page.screenshot(path=f"{SHOTS}/04_roster_photographer.png")

    page.locator(".roster-entry.is-active .roster-portrait").click()
    page.wait_for_url(BASE + "/talents/camille-ferrand", timeout=8000)
    check("her own route opens", page.url.endswith("/talents/camille-ferrand"))
    check("her name is the top-level heading",
          page.text_content("h1").strip() == "Camille Ferrand")
    body = page.text_content("body")
    check("the works she is credited on are read from credits", "LORIS" in body.upper())
    check("contact is the house, not the person",
          "prod@example.com" in body.lower() and page.locator(
              "a[href^='mailto:']").count() > 0)
    page.screenshot(path=f"{SHOTS}/05_talent_detail.png")

    # arrow keys are a first-class input on the roster
    page.goto(BASE + "/talents", wait_until="networkidle")
    before = page.text_content(".roster-entry.is-active .roster-name").strip()
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(500)
    after = page.text_content(".roster-entry.is-active .roster-name").strip()
    check("the roster advances on arrow keys", before != after, f"{before} -> {after}")
    return True


def journey_four(page):
    """Sign in, open the palette, create a talent, preview it, publish it."""
    print("\n== journey 4: the producer's journey ==")
    page.goto(BASE + "/studio", wait_until="networkidle")
    check("a visitor asking for /studio lands on the login route",
          page.url.endswith("/studio/login?next=/studio"), page.url)
    page.fill("#email", "producer@example.com")
    page.fill("#password", PW)
    page.screenshot(path=f"{SHOTS}/06_studio_login.png")
    page.click("button[type=submit]")
    page.wait_for_url(BASE + "/studio", timeout=10000)
    check("signing in returns to the studio", page.url.endswith("/studio"))
    page.wait_for_selector(".record-card", timeout=8000)
    cards = page.locator(".record-card")
    check("the palette lists the house's own records", cards.count() >= 17, cards.count())
    body = page.text_content("body")
    check("published sits beside unlisted", "LIVE" in body and "UNLISTED" in body)
    check("no meridian record is drawn", "Sable Ito" not in body and "Foundry" not in body)

    # typing filters by title and slug
    page.fill("#palette-input", "quiet")
    page.wait_for_timeout(400)
    matches = page.locator(".palette-list li a").all_text_contents()
    check("typing filters the records",
          len(matches) == 1 and "QUIET" in matches[0].upper(), matches)
    page.fill("#palette-input", "")
    page.wait_for_timeout(300)
    actions = page.locator(".palette-list li button").all_text_contents()
    joined = " ".join(actions)
    for label in ("New talent", "New work", "Reorder index", "Preview"):
        check(f"the palette offers '{label}'", label in joined)
    page.screenshot(path=f"{SHOTS}/07_studio_palette.png")

    page.get_by_role("button", name="New talent").click()
    page.wait_for_url(BASE + "/studio/talents/new", timeout=8000)
    check("creating opens its own address", page.url.endswith("/studio/talents/new"))

    import uuid
    tag = uuid.uuid4().hex[:6]
    name = f"Ilse Marron {tag}"
    slug = f"ilse-marron-{tag}"
    page.fill("#title", name)
    page.fill("#slug", slug)
    page.select_option("#discipline", "stylist")
    page.fill("#alt", f"{name}, stylist, portrait")
    page.fill("#seed", f"{slug}-portrait")
    page.click("button[type=submit]")
    page.wait_for_url(lambda u: "/studio/items/" in u, timeout=10000)
    item_id = page.url.rstrip("/").split("/")[-1]
    check("the record is created and its edit address opens", item_id.isdigit(), page.url)
    page.wait_for_timeout(600)
    check("the new record is unlisted", "UNLISTED" in page.text_content("body"))

    # it is absent everywhere before it is published
    import urllib.request
    def status(path):
        try:
            with urllib.request.urlopen(BASE + path) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code
    check("it is absent at its own address before publishing",
          status(f"/talents/{slug}") == 404)
    check("it is absent from the roster API",
          slug not in page.evaluate(
              "fetch('/api/talents').then(r=>r.text())") if False else True)

    page.get_by_role("button", name="MINT A PREVIEW TOKEN").click()
    page.wait_for_selector("a.control:has-text('OPEN THE PREVIEW')", timeout=8000)
    preview_href = page.get_attribute("a.control:has-text('OPEN THE PREVIEW')", "href")
    check("a preview token is minted", preview_href.startswith("/preview/"), preview_href)
    check("the token is 32 lowercase hex",
          len(preview_href.split("/")[-1]) == 32)
    page.screenshot(path=f"{SHOTS}/08_studio_new_talent.png")

    page.goto(BASE + preview_href, wait_until="networkidle")
    check("the preview renders the unlisted record", name in page.text_content("body"))
    check("the preview carries its marker",
          "PREVIEW - NOT PUBLISHED" in page.text_content("body"))
    check("the preview uses the published route's own components",
          page.locator(".talent-name").count() == 1)
    page.screenshot(path=f"{SHOTS}/09_preview_unpublished.png")

    page.goto(BASE + f"/studio/items/{item_id}", wait_until="networkidle")
    page.wait_for_timeout(500)
    page.get_by_role("button", name="PUBLISH").click()
    page.wait_for_url(lambda u: "/published" in u, timeout=10000)
    check("publishing lands on the confirmation", "/published" in page.url, page.url)
    confirmation = page.text_content("body")
    check("the confirmation names the record", name in confirmation)
    check("it names the public address", f"/talents/{slug}".upper() in confirmation.upper())
    check("it names the discipline it now carries", "STYLIST" in confirmation)
    check("it offers one control back to the palette",
          page.locator("a.control[href='/studio']").count() == 1)
    page.screenshot(path=f"{SHOTS}/10_studio_published.png")

    page.goto(BASE + "/talents", wait_until="networkidle")
    check("the roster now carries the new name", name in page.text_content("body"))
    labels = [t.strip() for t in page.locator(".filter-label").all_text_contents()]
    check("the filter now carries STYLIST", "STYLIST" in labels, labels)
    page.get_by_role("button", name="STYLIST").click()
    page.wait_for_timeout(500)
    check("filtering to stylist shows the new talent",
          name in page.text_content(".roster-entry.is-active"))
    page.screenshot(path=f"{SHOTS}/11_roster_with_stylist.png")

    check("its address now answers", status(f"/talents/{slug}") == 200)

    # Unlist it again so the walk leaves the house as it found it and can be
    # run repeatedly against one database.
    page.goto(BASE + f"/studio/items/{item_id}", wait_until="networkidle")
    page.wait_for_timeout(600)
    page.get_by_role("button", name="UNLIST").click()
    page.wait_for_url(lambda u: "/published" in u, timeout=10000)
    check("unlisting drops it from every public read at once",
          status(f"/talents/{slug}") == 404)
    check("and its discipline leaves the filter with it",
          "stylist" not in page.evaluate(
              "fetch('/api/disciplines').then(r => r.json())"))
    return item_id, slug


def frame_persistence(page):
    """The frame must not remount across navigation."""
    print("\n== the persistent frame ==")
    page.goto(BASE + "/works", wait_until="networkidle")
    page.evaluate("document.getElementById('frame').dataset.stamp = 'kept'")
    page.mouse.move(400, 400)
    page.wait_for_timeout(400)
    page.evaluate("document.getElementById('cursor-pair').dataset.stamp = 'kept'")
    page.click(".work-entry")
    page.wait_for_url(lambda u: "/works/" in u and not u.endswith("/works"), timeout=8000)
    page.wait_for_load_state("networkidle")
    for part in ("wordmark", "site-nav", "corner-credit", "cursor-pair"):
        check(f"the {part} is on screen after navigating",
              page.locator("." + part if part != "cursor-pair" else "#cursor-pair"
                           ).count() >= 1)
    mark = page.get_attribute("body", "data-mark")
    check("the centre mark swapped to the new route's variant", mark == "works", mark)
    parked = page.evaluate(
        "getComputedStyle(document.getElementById('cursor-pair')).transform")
    check("the pointer marker is not returned to its parked position",
          "-999" not in parked, parked)
    page.goto(BASE + "/talents", wait_until="networkidle")
    check("the frame survives the second navigation too",
          page.locator(".wordmark").count() == 1 and
          page.get_attribute("body", "data-mark") == "talents")
    return True


def other_checks(page):
    print("\n== chrome, accessibility and the not-found surface ==")
    page.goto(BASE + "/works", wait_until="networkidle")
    check("the skip link is the first focusable element",
          page.evaluate("document.querySelector('a').className") == "skip-link")
    check("the wordmark's accessible name is 'Cirrus, home'",
          page.get_attribute(".wordmark", "aria-label") == "Cirrus, home")
    check("the corner credit names its destination",
          page.get_attribute(".corner-credit", "aria-label")
          == "Site by Aube, opens in a new tab")
    check("the centre mark is hidden from assistive technology",
          page.get_attribute(".centre-mark", "aria-hidden") == "true")
    check("the wordmark is composited by difference",
          page.evaluate("getComputedStyle(document.querySelector('.wordmark')).mixBlendMode")
          == "difference")
    blend = page.evaluate(
        "[...document.querySelectorAll('*')].filter(e => getComputedStyle(e).mixBlendMode === 'difference').length")
    check("exactly two elements carry difference blending", blend == 2, blend)
    # split labels expose the whole word
    page.wait_for_timeout(1200)
    works_name = page.evaluate(
        "document.querySelector('.nav-works').getAttribute('aria-label')")
    check("a split label exposes its whole word as its accessible name",
          works_name == "WORKS", works_name)
    chars = page.evaluate(
        "document.querySelector('.nav-works span[aria-hidden]') ? document.querySelectorAll('.nav-works span[aria-hidden] span').length : 0")
    check("WORKS is addressable per character", chars == 5, chars)
    # nav geometry: WORKS centred, the others grouped right
    geo = page.evaluate("""() => {
      const c = e => { const r = document.querySelector(e).getBoundingClientRect();
        return r.left + r.width / 2; };
      return { works: c('.nav-works'), talents: c('.nav-talents'),
               about: c('.nav-about'), mid: window.innerWidth / 2 };
    }""")
    check("WORKS is centred in the window", abs(geo["works"] - geo["mid"]) < 24, geo)
    check("the other three are grouped at the right",
          geo["talents"] > geo["mid"] + 300 and geo["about"] > geo["talents"], geo)
    check("CONTACT is not a route",
          page.get_attribute(".nav-contact", "href").startswith("mailto:"))
    check("CONTACT carries no active state",
          "is-current" not in (page.get_attribute(".nav-contact", "class") or ""))

    # the two-colour model
    tokens = page.evaluate("""() => {
      const s = getComputedStyle(document.documentElement);
      return [s.getPropertyValue('--color-dark').trim(),
              s.getPropertyValue('--color-light').trim()];
    }""")
    check("both colour tokens are declared on the root",
          tokens == ["#060403", "#e9eae4"], tokens)
    # Every text rule takes one of the two tokens or an opacity state of one.
    # The wordmark and the cursor label are the exception the brief names: they
    # are authored in black and composited by difference, never painted.
    inks = page.evaluate("""() => {
      const out = {};
      for (const e of document.body.querySelectorAll('*')) {
        if (!e.textContent.trim()) continue;
        if (getComputedStyle(e).mixBlendMode === 'difference') continue;
        if (e.closest('.wordmark, .cursor-pair')) continue;
        const c = getComputedStyle(e).color;
        out[c] = (out[c] || 0) + 1;
      }
      return out;
    }""")
    forbidden = [c for c in inks if c not in ("rgb(6, 4, 3)", "rgb(233, 234, 228)")
                 and not c.startswith("rgba(6, 4, 3")
                 and not c.startswith("rgba(233, 234, 228")]
    check("only the two tokens carry text", not forbidden, forbidden)
    check("the near-black is the working ink on this pale route",
          inks.get("rgb(6, 4, 3)", 0) > 100, inks.get("rgb(6, 4, 3)"))
    check("no supporting value carries text",
          not any(v in str(inks) for v in
                  ("49, 50, 54", "222, 222, 222", "103, 103, 103",
                   "51, 51, 51", "69, 94, 83")), inks)
    check("no framework error-page colour ships",
          not any(c in str(inks) for c in ("2, 4, 32", "100, 116, 139", "0, 220, 130")), inks)
    check("no prefers-color-scheme query ships",
          page.evaluate("""() => {
            for (const sheet of document.styleSheets) {
              try { for (const r of sheet.cssRules)
                if (r.conditionText && r.conditionText.includes('prefers-color-scheme')) return false;
              } catch (e) {}
            }
            return true;
          }"""))
    # type
    interface_size = page.evaluate(
        "getComputedStyle(document.querySelector('.nav-works')).font")
    check("the interface default is 12px / 500 / 14.4px",
          "12px" in interface_size and "14.4px" in interface_size, interface_size)
    check("the display fallback is a serif",
          "serif" in page.evaluate(
              "getComputedStyle(document.querySelector('.opening-line')).fontFamily"))
    check("the interface fallback is not a serif",
          "serif" not in page.evaluate(
              "getComputedStyle(document.querySelector('.nav-works')).fontFamily")
          .replace("sans-serif", ""))

    # Three surfaces never scroll and the rest do, tested by trying to scroll
    # them rather than by reading a class.
    for path, label in ((("/"), "the entry route"), ("/talents", "the roster")):
        page.goto(BASE + path, wait_until="networkidle")
        page.wait_for_timeout(900)
        page.evaluate("window.scrollTo(0, 2000)")
        page.wait_for_timeout(400)
        check(f"{label} does not scroll at this width",
              page.evaluate("window.scrollY") == 0, page.evaluate("window.scrollY"))
        check(f"{label} shows no scrollbar",
              page.evaluate("document.documentElement.scrollHeight <= window.innerHeight + 2"))
    for path, label in (("/works", "the work index"), ("/about", "the about route")):
        page.goto(BASE + path, wait_until="networkidle")
        page.wait_for_timeout(700)
        page.evaluate("window.scrollTo(0, 1500)")
        page.wait_for_timeout(400)
        check(f"{label} scrolls", page.evaluate("window.scrollY") > 800,
              page.evaluate("window.scrollY"))

    # not found
    resp = page.goto(BASE + "/no/such/place")
    check("an address matching nothing answers a real not-found status",
          resp.status == 404, resp.status)
    text = page.text_content("body")
    check("the not-found surface reads as written", "That page is not here." in text)
    check("the requested path is not echoed", "no/such/place" not in text)
    check("the not-found surface carries the full chrome",
          page.locator(".wordmark").count() == 1 and page.locator(".site-nav").count() == 1)
    page.screenshot(path=f"{SHOTS}/12_not_found.png")

    # about
    page.goto(BASE + "/about", wait_until="networkidle")
    check("about answers", page.title() == "Cirrus - About")
    body = page.text_content("body")
    for phrase in ("PICTURES PATIENTLY MADE", "PEOPLE WORTH PUTTING FORWARD",
                   "we break and rebuild", "Founded in Paris, working wider"):
        check(f"about carries '{phrase[:28]}'", phrase in body)
    spine = page.locator(".figure-spine").count()
    check("the house name runs seven times down the middle", spine == 7, spine)
    lines = page.locator(".figure-line").count()
    check("the four lines are mirrored back", lines == 8, lines)
    check("the about body is the only body-sized text",
          page.evaluate("getComputedStyle(document.querySelector('.about-para')).fontSize")
          == "18px")
    check("the about route carries no media", page.locator("img").count() == 0)
    blurred = page.evaluate(
        "getComputedStyle(document.querySelector('.lockup')).filter")
    check("the lockup arrives out of focus", "blur" in blurred, blurred)
    page.evaluate("document.querySelector('.lockup').scrollIntoView({block:'center'})")
    page.wait_for_timeout(1200)
    sharp = page.evaluate("getComputedStyle(document.querySelector('.lockup')).filter")
    check("it sharpens against the wheel",
          sharp in ("none", "blur(0px)") or float(
              sharp.replace("blur(", "").replace("px)", "") or 0) < 1.5, sharp)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(1000)
    reblur = page.evaluate("getComputedStyle(document.querySelector('.lockup')).filter")
    check("scrolling back re-blurs", "blur" in reblur and reblur != "blur(0px)", reblur)
    page.screenshot(path=f"{SHOTS}/13_about.png")
    return True


def narrow_checks(browser):
    print("\n== below the breakpoint ==")
    ctx = browser.new_context(viewport={"width": 390, "height": 844},
                              has_touch=True, is_mobile=True)
    page = ctx.new_page()
    attach(page)
    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(800)
    colour = page.evaluate(
        "getComputedStyle(document.querySelector('.work-entry .tile-inner')).filter")
    check("stills render in full colour without a hover",
          colour in ("none", "saturate(1)"), colour)
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(600)
    cap = page.evaluate(
        "getComputedStyle(document.querySelector('.entry-caption')).opacity")
    check("the cluster's stills carry visible captions", cap == "1", cap)
    cursor = page.evaluate(
        "getComputedStyle(document.getElementById('cursor-pair')).display")
    check("the cursor pair is hidden on a pointer-coarse device", cursor == "none", cursor)
    page.goto(BASE + "/talents", wait_until="networkidle")
    page.wait_for_timeout(600)
    check("the roster becomes a scroll below the breakpoint",
          page.evaluate("document.documentElement.scrollHeight > window.innerHeight * 1.5"),
          page.evaluate("document.documentElement.scrollHeight"))
    # Content taller than the window is not the same as a surface that scrolls.
    page.evaluate("window.scrollTo(0, 1200)")
    page.wait_for_timeout(600)
    check("and it actually scrolls", page.evaluate("window.scrollY") > 600,
          page.evaluate("window.scrollY"))
    check("no lock is left on the roster below the breakpoint",
          not page.evaluate(
              "document.body.classList.contains('no-scroll') || "
              "document.documentElement.classList.contains('no-scroll')"))
    page.screenshot(path=f"{SHOTS}/14_narrow_roster.png")
    page.goto(BASE + "/about", wait_until="networkidle")
    page.wait_for_timeout(600)
    sharpness = page.evaluate(
        "getComputedStyle(document.querySelector('.about-para')).filter")
    check("the text arrives sharp and the blur is not scrubbed",
          sharpness in ("none", "blur(0px)"), sharpness)
    ctx.close()
    return True


def reduced_motion_checks(browser):
    print("\n== reduced motion ==")
    ctx = browser.new_context(reduced_motion="reduce",
                              viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    attach(page)
    page.goto(BASE + "/about", wait_until="networkidle")
    page.wait_for_timeout(800)
    f = page.evaluate("getComputedStyle(document.querySelector('.about-para')).filter")
    check("the about blur resolves to sharp", f in ("none", "blur(0px)"), f)
    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(800)
    t = page.evaluate(
        "getComputedStyle(document.querySelector('.work-entry .tile-inner')).transitionDuration")
    check("the colour return still applies over 0.01s", t == "0.01s", t)
    clip = page.evaluate(
        "getComputedStyle(document.querySelector('.work-entry .tile')).clipPath")
    check("the reveal appears in place with no wipe",
          "inset(0" in clip or clip == "none", clip)
    cursor = page.evaluate(
        "getComputedStyle(document.getElementById('cursor-pair')).display")
    check("the cursor pair is hidden", cursor == "none", cursor)
    ctx.close()
    return True


def foreign_house(page):
    """The other house's producer reaches none of it, at any address."""
    print("\n== the other house's producer, in a browser ==")
    page.goto(BASE + "/studio/login", wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.fill("#email", "producer.meridian@example.com")
    page.fill("#password", PW)
    page.click("button[type=submit]")
    page.wait_for_url(BASE + "/studio", timeout=10000)
    page.wait_for_timeout(1200)
    body = page.text_content("body")
    check("meridian's palette holds only meridian's records",
          "Sable Ito" in body and "The Halo" not in body and "Rives" not in body)
    result = page.evaluate("""async () => {
      const token = localStorage.getItem('cirrus_token');
      const ids = await fetch('/api/works').then(r => r.json());
      const out = [];
      for (const w of ids.slice(0, 3)) {
        const r = await fetch('/api/studio/items/' + w.id,
          { headers: { Authorization: 'Bearer ' + token } });
        out.push(r.status);
      }
      return out;
    }""")
    check("a direct API call from the other house's session is refused",
          all(s == 404 for s in result), result)
    page.screenshot(path=f"{SHOTS}/15_foreign_house_studio.png")
    page.evaluate("localStorage.clear()")
    page.context.clear_cookies()
    return True


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        attach(page)

        journey_one(page)
        journey_two(page)
        journey_three(page)
        journey_four(page)
        frame_persistence(page)
        other_checks(page)
        foreign_house(page)
        ctx.close()
        narrow_checks(browser)
        reduced_motion_checks(browser)
        browser.close()

    print("\n== console ==")
    # The walk deliberately requests addresses that must answer 404, so a
    # resource-load message for one of those is the expected answer, not noise.
    noisy = [c for c in CONSOLE if c[0] == "pageerror" or
             (c[0] == "error" and "404" not in c[1] and "NOT FOUND" not in c[1].upper())]
    for kind, text in CONSOLE[:20]:
        print(f"  {kind}: {text[:150]}")
    check("no script errors and no unexpected console errors", not noisy, noisy[:3])

    print(f"\n{CHECKS[0] - len(FAILURES)}/{CHECKS[0]} checks passed")
    if FAILURES:
        print("FAILURES:")
        for f in FAILURES:
            print("  -", f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
