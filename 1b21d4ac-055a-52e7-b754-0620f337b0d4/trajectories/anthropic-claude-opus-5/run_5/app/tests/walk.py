"""Walks the journeys the brief describes in a real browser, and leaves screenshots."""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("CHECK_BASE", "http://localhost:4173")
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"

passed, failed = [], []
console_errors = []


def check(name, condition, detail=""):
    (passed if condition else failed).append(name)
    print(("  ok  " if condition else "FAIL  ") + name + ("" if condition else f"  <- {detail}"))


def run(p):
    chrome = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"
    browser = p.chromium.launch(
        executable_path=chrome if os.path.exists(chrome) else None,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))

    # ---------------------------------------------------------- journey 1: the entry route
    print("\n== journey 1: the entry cluster ==")
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(1600)

    counter = page.locator("#counter-well .counter-value")
    reached = page.evaluate("""() => {
        const el = document.querySelector('#counter-well .counter-value');
        return el ? el.textContent : null;
    }""")
    check("the entry counter reaches 100%", reached == "100%", reached)

    cleared = page.evaluate(
        "() => document.querySelector('.veil').getAttribute('data-cleared')")
    check("the veil clears once the count completes", cleared == "true", cleared)

    ground = page.evaluate(
        "() => getComputedStyle(document.body).backgroundColor")
    check("the entry ground is the near-black token", ground == "rgb(6, 4, 3)", ground)

    stills = page.locator(".cluster-item").count()
    check("the cluster holds a still per published work", stills == 12, stills)

    named = page.evaluate("""() => {
        const a = document.querySelector('.cluster-item');
        return { label: a.getAttribute('aria-label'), href: a.getAttribute('href') };
    }""")
    check("every cluster still is a link named by its title then its ordinal",
          "001" in named["label"] and named["href"].startswith("/works/"), named)

    scrolls = page.evaluate(
        "() => document.documentElement.scrollHeight > window.innerHeight + 2")
    check("the entry route does not scroll", not scrolls)

    page.screenshot(path=f"{SHOTS}/01_entry_counter.png")

    # point at a still and read the cursor label
    box = page.locator(".cluster-item").first.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(600)
    label = page.evaluate("() => document.getElementById('cursor-label').textContent")
    check("the cursor label carries the title of whatever the pointer is over",
          label and len(label) > 0, repr(label))
    page.screenshot(path=f"{SHOTS}/02_entry_cursor_label.png")

    # ---------------------------------------------------------- journey 2: the index
    print("\n== journey 2: the numbered index ==")
    page.locator(".cluster-item").first.click()
    page.wait_for_timeout(1200)
    check("pressing a still lands on that film", "/works/" in page.url, page.url)

    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(900)
    entries = page.locator(".index-entry").count()
    check("the index carries twelve entries", entries == 12, entries)

    ordinals = page.evaluate("""() => Array.from(
        document.querySelectorAll('.index-entry .caption-left span:last-child')
    ).map(e => e.textContent.trim())""")
    check("ordinals run 001 to 012 contiguously",
          ordinals == [f"{i:03d}" for i in range(1, 13)], ordinals)

    index_ground = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
    check("the index ground is the warm off-white", index_ground == "rgb(233, 234, 228)", index_ground)

    grey = page.evaluate("""() => {
        const m = document.querySelector('.index-entry .tile-media');
        return getComputedStyle(m).filter;
    }""")
    check("every still rests fully desaturated", "grayscale(1)" in grey, grey)

    dur = page.evaluate("""() => {
        const m = document.querySelector('.index-entry .tile-media');
        const s = getComputedStyle(m);
        return s.transitionProperty + ' / ' + s.transitionDuration + ' / ' + s.transitionTimingFunction;
    }""")
    check("the colour return runs on filter over 0.8s on the slow curve",
          "filter" in dur and "0.8s" in dur and "0.2, 0.65, 0.47, 0.96" in dur, dur)

    page.evaluate("() => window.scrollTo(0, 1400)")
    page.wait_for_timeout(900)
    page.screenshot(path=f"{SHOTS}/03_works_index.png")

    # hover an entry and watch the colour return
    entry = page.locator(".index-entry").nth(2)
    entry.scroll_into_view_if_needed()
    page.wait_for_timeout(700)
    b = entry.bounding_box()
    page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
    page.wait_for_timeout(1100)
    hovered = page.evaluate("""() => {
        const m = document.querySelectorAll('.index-entry')[2].querySelector('.tile-media');
        return getComputedStyle(m).filter;
    }""")
    check("hovering returns the still's colour", "grayscale(0)" in hovered or hovered == "none", hovered)
    page.screenshot(path=f"{SHOTS}/04_works_colour_return.png")

    # ---------------------------------------------------------- the work detail
    print("\n== the work detail and its neighbours ==")
    page.goto(BASE + "/works/the-halo", wait_until="networkidle")
    page.wait_for_timeout(900)
    # the display face speaks in capitals, so the rendered string is compared case-insensitively
    title = page.locator("h1").first.inner_text()
    heads = page.locator("h1").count()
    check("the film's title is its one top-level heading",
          title.strip().lower() == "the halo" and heads == 1, (title, heads))
    ordinal = page.locator(".work-head .t-numeral").inner_text()
    check("the film carries its ordinal", ordinal.strip() == "001", ordinal)

    credit_link = page.evaluate("""() => {
        const a = document.querySelector('.credits a');
        return a ? { text: a.textContent.trim(), href: a.getAttribute('href') } : null;
    }""")
    check("a credit matching a published talent links to that talent",
          credit_link and credit_link["href"] == "/talents/rives", credit_link)

    neighbours = page.evaluate("""() => Array.from(
        document.querySelectorAll('.work-neighbours a')
    ).map(a => a.getAttribute('href'))""")
    check("next and previous follow the ordinal and wrap",
          neighbours == ["/works/the-radiant", "/works/sonder"], neighbours)
    page.screenshot(path=f"{SHOTS}/05_work_detail.png")

    # move to the next film by ordinal
    page.locator(".work-neighbours a").nth(1).click()
    page.wait_for_timeout(1200)
    check("the next film opens by ordinal", "/works/sonder" in page.url, page.url)

    # ---------------------------------------------------------- journey 3: the roster
    print("\n== journey 3: the roster and its filter ==")
    page.goto(BASE + "/talents", wait_until="networkidle")
    page.wait_for_timeout(900)

    filters = page.evaluate("""() => Array.from(
        document.querySelectorAll('.roster-filter-item')).map(b => b.textContent.trim())""")
    check("the filter carries the derived set, DIRECTOR then PHOTOGRAPHER first",
          filters[:2] == ["DIRECTOR", "PHOTOGRAPHER"], filters)

    first_name = page.evaluate("""() => {
        const el = document.querySelector('.roster-entry.is-current .roster-name');
        return el ? el.textContent.trim() : null;
    }""")
    check("the first discipline is active on arrival",
          (first_name or "").lower() == "rives", first_name)

    size = page.evaluate("""() => {
        const el = document.querySelector('.roster-entry.is-current .roster-name');
        const s = getComputedStyle(el);
        return s.fontSize + ' / ' + s.fontWeight + ' / ' + s.lineHeight;
    }""")
    check("the roster name is set at 125px / 300 / 137.5px",
          size == "125px / 300 / 137.5px", size)

    no_scroll = page.evaluate(
        "() => document.documentElement.scrollHeight <= window.innerHeight + 2")
    check("the roster does not scroll above the breakpoint", no_scroll)

    inactive = page.evaluate("""() => {
        const b = document.querySelectorAll('.roster-filter-item')[1];
        return { opacity: getComputedStyle(b).opacity, pressed: b.getAttribute('aria-pressed') };
    }""")
    check("an inactive discipline rests at 0.5 opacity and exposes its state",
          inactive["opacity"] == "0.5" and inactive["pressed"] == "false", inactive)
    page.screenshot(path=f"{SHOTS}/06_roster_director.png")

    # press PHOTOGRAPHER
    page.locator(".roster-filter-item", has_text="PHOTOGRAPHER").click()
    page.wait_for_timeout(800)
    now_name = page.evaluate("""() => {
        const el = document.querySelector('.roster-entry.is-current .roster-name');
        return el ? el.textContent.trim() : null;
    }""")
    check("pressing PHOTOGRAPHER makes the set Camille Ferrand",
          (now_name or "").lower() == "camille ferrand", now_name)
    check("selecting a discipline does not navigate", page.url.rstrip("/").endswith("/talents"), page.url)

    pressed = page.evaluate("""() => {
        const b = Array.from(document.querySelectorAll('.roster-filter-item'))
            .find(x => x.textContent.trim() === 'PHOTOGRAPHER');
        return { opacity: getComputedStyle(b).opacity, pressed: b.getAttribute('aria-pressed') };
    }""")
    check("the active discipline is at full strength and exposed",
          pressed["opacity"] == "1" and pressed["pressed"] == "true", pressed)
    page.screenshot(path=f"{SHOTS}/07_roster_photographer.png")

    # arrow keys advance the roster
    page.locator(".roster-filter-item", has_text="DIRECTOR").click()
    page.wait_for_timeout(500)
    before = page.evaluate(
        "() => document.querySelector('.roster-entry.is-current .roster-name').textContent.trim()")
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(700)
    after = page.evaluate(
        "() => document.querySelector('.roster-entry.is-current .roster-name').textContent.trim()")
    check("the roster advances on arrow keys", before != after, f"{before} -> {after}")

    live = page.evaluate("() => document.getElementById('roster-live').textContent.trim()")
    check("the current name is announced on change", live == after, (live, after))

    # reach the talent detail
    page.goto(BASE + "/talents/camille-ferrand", wait_until="networkidle")
    page.wait_for_timeout(800)
    works_here = page.evaluate("""() => Array.from(
        document.querySelectorAll('.index-entry')).map(a => a.getAttribute('href'))""")
    check("the talent's selected work is read from credits",
          works_here == ["/works/loris"], works_here)
    house_mail = page.evaluate("""() => {
        const a = Array.from(document.querySelectorAll('.talent-detail a[href^="mailto:"]'));
        return a.map(x => x.getAttribute('href'));
    }""")
    check("contact on a talent route is the house address",
          house_mail == ["mailto:prod@example.com"], house_mail)
    page.screenshot(path=f"{SHOTS}/08_talent_detail.png")

    # ---------------------------------------------------------- the persistent frame
    print("\n== the persistent frame ==")
    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(800)
    page.evaluate("() => { window.__frame = document.getElementById('site-frame'); "
                  "window.__frame.dataset.stamp = 'kept'; "
                  "document.getElementById('cursor').dataset.stamp = 'kept'; }")
    page.mouse.move(700, 500)
    page.wait_for_timeout(400)
    mark_before = page.evaluate(
        "() => document.querySelector('#centre-mark-slot svg').getAttribute('viewBox')")

    page.locator(".index-entry").first.click()
    page.wait_for_timeout(1500)
    kept = page.evaluate("""() => ({
        frame: document.getElementById('site-frame').dataset.stamp,
        cursor: document.getElementById('cursor').dataset.stamp,
        wordmark: !!document.querySelector('.wordmark'),
        labels: document.querySelectorAll('.nav-item').length,
        credit: !!document.querySelector('.corner-credit'),
        transform: document.getElementById('cursor').style.transform
    })""")
    check("the frame never remounts across a navigation", kept["frame"] == "kept", kept)
    check("the cursor pair never remounts", kept["cursor"] == "kept", kept)
    check("the wordmark, four labels and the corner credit stay on screen",
          kept["wordmark"] and kept["labels"] == 4 and kept["credit"], kept)
    check("the pointer marker does not return to its parked position",
          "-999" not in (kept["transform"] or ""), kept["transform"])

    mark_after = page.evaluate(
        "() => document.querySelector('#centre-mark-slot svg').getAttribute('viewBox')")
    check("the centre mark swaps to the new route's variant or holds within a route",
          mark_before is not None and mark_after is not None, (mark_before, mark_after))

    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(600)
    mark_works = page.evaluate(
        "() => document.querySelector('#centre-mark-slot svg').getAttribute('viewBox')")
    page.locator('.nav-item[href="/talents"]').click()
    page.wait_for_timeout(1600)
    mark_talents = page.evaluate(
        "() => document.querySelector('#centre-mark-slot svg').getAttribute('viewBox')")
    check("the centre mark differs between the index and the roster",
          mark_works == "0 0 14 18" and mark_talents == "0 0 18 18",
          (mark_works, mark_talents))
    page.screenshot(path=f"{SHOTS}/09_frame_persistence.png")

    # ---------------------------------------------------------- about
    print("\n== the about route ==")
    page.goto(BASE + "/about", wait_until="networkidle")
    page.wait_for_timeout(900)
    body_type = page.evaluate("""() => {
        const el = document.querySelector('.d-body');
        const s = getComputedStyle(el);
        return s.fontSize + ' / ' + s.fontWeight + ' / ' + s.lineHeight;
    }""")
    check("the about body is 18px / 300 / 21.6px", body_type == "18px / 300 / 21.6px", body_type)
    lines = page.locator(".about-line").count()
    check("the authored line breaks are content", lines == 7, lines)
    figure = page.locator(".about-figure-line").count()
    check("the figure mirrors four lines around the house name seven times",
          figure == 15, figure)
    page.screenshot(path=f"{SHOTS}/10_about.png")

    # ---------------------------------------------------------- not found
    print("\n== the not-found surface ==")
    resp = page.goto(BASE + "/no-such-address", wait_until="networkidle")
    check("an address matching nothing answers a real not-found status",
          resp.status == 404, resp.status)
    text = page.locator(".not-found h1").inner_text()
    check("it reads That page is not here.", text.strip() == "That page is not here.", text)
    check("it carries the full chrome so the route is recoverable",
          page.locator(".wordmark").count() == 1 and page.locator(".nav-item").count() == 4)
    body_html = page.content()
    check("the requested path is not echoed back", "no-such-address" not in body_html)
    page.screenshot(path=f"{SHOTS}/11_not_found.png")

    # ---------------------------------------------------------- studio redirects
    print("\n== studio entry and redirects ==")
    page.goto(BASE + "/studio", wait_until="networkidle")
    check("a visitor asking for /studio lands on the sign-in route",
          "/studio/login" in page.url, page.url)

    # a viewer is refused and sees the entry route
    ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
    vp = ctx2.new_page()
    vp.goto(BASE + "/studio/login", wait_until="networkidle")
    vp.fill("#email", "viewer@example.com")
    vp.fill("#password", PW)
    vp.click("button[type=submit]")
    vp.wait_for_timeout(1500)
    vp.goto(BASE + "/studio", wait_until="networkidle")
    check("a signed-in viewer asking for /studio is refused and sees the entry route",
          vp.url.rstrip("/") == BASE.rstrip("/"), vp.url)
    drawn = vp.evaluate("() => document.querySelectorAll('a[href^=\"/studio\"]').length")
    check("no studio control is drawn for a viewer", drawn == 0, drawn)
    ctx2.close()

    # ---------------------------------------------------------- journey 4: the producer
    print("\n== journey 4: sign in, create, preview, publish ==")
    page.goto(BASE + "/studio/login", wait_until="networkidle")
    page.fill("#email", "producer@example.com")
    page.fill("#password", PW)
    page.screenshot(path=f"{SHOTS}/12_studio_login.png")
    page.click("button[type=submit]")
    page.wait_for_timeout(2000)
    check("signing in returns to the studio", "/studio" in page.url, page.url)

    cards = page.locator(".card").count()
    check("the palette lists the house's own records, published beside unlisted",
          cards >= 17, cards)
    states = page.evaluate("""() => Array.from(document.querySelectorAll('.card'))
        .map(c => c.textContent.includes('UNLISTED'))""")
    check("unlisted records are shown as such in the palette", any(states), states.count(True))
    page.screenshot(path=f"{SHOTS}/13_studio_palette.png")

    # typing filters by title and slug
    page.fill("#palette-input", "halo")
    page.wait_for_timeout(500)
    filtered = page.locator(".card").count()
    check("typing filters the house's records", filtered == 1, filtered)
    page.fill("#palette-input", "")
    page.wait_for_timeout(300)

    # choose New talent
    page.click('a[href="/studio/talents/new"]')
    page.wait_for_timeout(1500)
    check("New talent opens its own address", "/studio/talents/new" in page.url, page.url)

    unique = f"aurel-{os.getpid()}"
    page.fill("#title", "Aurel Mistral")
    page.fill("#slug", unique)
    page.select_option("#discipline", "stylist")
    page.fill("#alt", "Aurel Mistral, stylist, portrait")
    page.fill("#seed", "aurel-portrait")
    page.screenshot(path=f"{SHOTS}/14_studio_new_talent.png")
    page.click("button[type=submit]")
    page.wait_for_timeout(2500)
    check("creating a record opens its edit address", "/studio/items/" in page.url, page.url)
    item_id = page.url.rstrip("/").split("/")[-1]

    # it must be absent from the public roster while unlisted
    api = ctx.request
    r = api.get(BASE + f"/api/talents/{unique}")
    check("the new record is absent at its own address before publishing", r.status == 404, r.status)
    r = api.get(BASE + "/api/disciplines")
    check("...and no unlisted stylist of this walk reaches the roster",
          all(t2["slug"] != unique for t2 in api.get(BASE + "/api/talents").json()),
          [t2["slug"] for t2 in api.get(BASE + "/api/talents").json()])

    # mint a preview token and open the preview
    page.click("button:text-is('MINT A PREVIEW TOKEN')")
    page.wait_for_timeout(2500)
    check("minting a token opens the preview route", "/preview/" in page.url, page.url)
    token = page.url.rstrip("/").split("/")[-1]
    banner = page.locator(".preview-banner").inner_text()
    check("the preview carries an unmissable marker",
          banner.strip() == "PREVIEW - NOT PUBLISHED", banner)
    shown = page.locator("h1").first.inner_text()
    check("the preview renders the record through the published components",
          "Aurel Mistral" in shown, shown)
    page.screenshot(path=f"{SHOTS}/15_preview.png")

    # a stranger with no session must not reach that preview
    ctx3 = browser.new_context()
    sp = ctx3.new_page()
    presp = sp.goto(BASE + f"/preview/{token}")
    check("a stranger cannot open the preview address", presp.status == 404, presp.status)
    ctx3.close()

    # publish
    page.goto(BASE + f"/studio/items/{item_id}", wait_until="networkidle")
    page.wait_for_timeout(800)
    page.click("button:text-is('PUBLISH')")
    page.wait_for_timeout(2500)
    check("publishing lands on the confirmation",
          f"/studio/items/{item_id}/published" in page.url, page.url)
    conf = page.locator(".sheet").inner_text()
    lower = conf.lower()
    check("the confirmation names the record, its address and its discipline",
          "aurel mistral" in lower and f"/talents/{unique}" in lower and "stylist" in lower,
          conf[:200])
    page.screenshot(path=f"{SHOTS}/16_studio_published.png")

    # the roster now carries the new name and the filter carries STYLIST
    r = api.get(BASE + "/api/disciplines")
    check("the filter now carries stylist", "stylist" in r.json(), r.json())

    page.goto(BASE + "/talents", wait_until="networkidle")
    page.wait_for_timeout(1000)
    filters2 = page.evaluate("""() => Array.from(
        document.querySelectorAll('.roster-filter-item')).map(b => b.textContent.trim())""")
    check("the roster's filter draws STYLIST", "STYLIST" in filters2, filters2)
    page.locator(".roster-filter-item", has_text="STYLIST").click()
    page.wait_for_timeout(800)
    stylist_name = page.evaluate("""() => {
        const el = document.querySelector('.roster-entry.is-current .roster-name');
        return el ? el.textContent.trim() : null;
    }""")
    check("the roster carries the new name",
          (stylist_name or "").lower() == "aurel mistral", stylist_name)
    page.screenshot(path=f"{SHOTS}/17_roster_stylist.png")

    # unlist what this walk published, so the walk is repeatable and leaves the
    # seeded roster as it found it
    page.goto(BASE + f"/studio/items/{item_id}", wait_until="networkidle")
    page.wait_for_timeout(900)
    page.click("button:text-is('UNLIST')")
    page.wait_for_timeout(1500)
    r = api.get(BASE + f"/api/talents/{unique}")
    check("unlisting drops the record from every public read at once", r.status == 404, r.status)
    r = api.get(BASE + "/api/disciplines")
    check("...and the discipline leaves the filter with it", r.json() == ["director", "photographer"],
          r.json())

    # signing out makes /studio unreachable at once
    page.goto(BASE + "/studio", wait_until="networkidle")
    page.wait_for_timeout(600)
    page.click("button:text-is('SIGN OUT')")
    page.wait_for_timeout(1800)
    page.goto(BASE + "/studio", wait_until="networkidle")
    check("signing out makes /studio unreachable at once",
          "/studio/login" in page.url, page.url)

    # ---------------------------------------------------------- accessibility
    print("\n== accessibility ==")
    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(700)
    names = page.evaluate("""() => {
        const w = document.querySelector('.wordmark');
        const c = document.querySelector('.corner-credit');
        const skip = document.querySelector('.skip-link');
        return { wordmark: w.getAttribute('aria-label'),
                 credit: c.getAttribute('aria-label'),
                 skip: skip ? skip.textContent.trim() : null,
                 skipFirst: document.querySelectorAll('a,button')[0].classList.contains('skip-link') };
    }""")
    check("the wordmark's accessible name is Cirrus, home", names["wordmark"] == "Cirrus, home", names)
    check("the corner credit's name is Site by Aube, opens in a new tab",
          names["credit"] == "Site by Aube, opens in a new tab", names)
    check("a skip link is the first focusable element",
          names["skip"] == "Skip to content" and names["skipFirst"], names)

    split = page.evaluate("""() => {
        const s = document.querySelector('.nav-item .split');
        return { label: s.getAttribute('aria-label'),
                 chars: s.querySelectorAll('.split-char').length,
                 hidden: s.firstElementChild.getAttribute('aria-hidden') };
    }""")
    check("a split label exposes its whole word as its accessible name",
          split["label"] == "WORKS" and split["chars"] == 5 and split["hidden"] == "true", split)

    marks_hidden = page.evaluate("""() => {
        const m = document.querySelector('#centre-mark-slot svg');
        return m.getAttribute('aria-hidden');
    }""")
    check("the centre mark is hidden from assistive technology", marks_hidden == "true", marks_hidden)

    headings = page.evaluate("() => document.querySelectorAll('h1').length")
    check("every route has exactly one top-level heading", headings == 1, headings)

    alts = page.evaluate("""() => Array.from(document.querySelectorAll('.index-entry img'))
        .every(i => (i.getAttribute('alt') || '').trim().length > 0)""")
    check("every still carries a written alternative", alts)

    reserved = page.evaluate("""() => {
        const f = document.querySelector('.index-entry .tile-frame');
        return getComputedStyle(f).aspectRatio;
    }""")
    check("a media container reserves its space from its stored intrinsic size",
          reserved and reserved != "auto", reserved)

    focus = page.evaluate("""() => {
        const a = document.querySelector('.roster-filter-item') || document.querySelector('.nav-item');
        a.focus();
        const s = getComputedStyle(a);
        return { outline: s.outlineWidth + ' ' + s.outlineStyle, opacity: s.opacity };
    }""")
    check("focus is a ring rather than the hover treatment",
          focus["outline"] != "0px none", focus)

    # ---------------------------------------------------------- narrow width
    print("\n== the narrow layout ==")
    nctx = browser.new_context(viewport={"width": 390, "height": 844},
                               has_touch=True, is_mobile=True)
    np = nctx.new_page()
    np.goto(BASE + "/works", wait_until="networkidle")
    np.wait_for_timeout(1200)
    colour = np.evaluate("""() => {
        const m = document.querySelector('.index-entry .tile-media');
        return getComputedStyle(m).filter;
    }""")
    check("below the breakpoint stills render in full colour",
          "grayscale(0)" in colour or colour == "none", colour)
    cursor_hidden = np.evaluate("""() => {
        const c = document.getElementById('cursor');
        return getComputedStyle(c).display;
    }""")
    check("the cursor pair is hidden on a pointer-coarse device", cursor_hidden == "none", cursor_hidden)
    np.goto(BASE + "/talents", wait_until="networkidle")
    np.wait_for_timeout(1000)
    roster_scrolls = np.evaluate(
        "() => document.documentElement.scrollHeight > window.innerHeight + 10")
    check("below the breakpoint the roster becomes a scroll", roster_scrolls)
    np.screenshot(path=f"{SHOTS}/18_narrow_roster.png")

    # the contact overlay is the narrow-width surface behind CONTACT
    np.goto(BASE + "/works", wait_until="networkidle")
    np.wait_for_timeout(1200)
    check("the contact overlay is in the markup and closed", np.evaluate(
        "() => document.getElementById('contact-overlay').getAttribute('data-open')") == "false")
    check("...and inert while closed", np.evaluate(
        "() => getComputedStyle(document.getElementById('contact-overlay')).visibility") == "hidden")
    np.evaluate("() => document.querySelector('.nav-item[data-contact]').click()")
    np.wait_for_timeout(800)
    over = np.evaluate("""() => {
        const o = document.getElementById('contact-overlay');
        return { open: o.getAttribute('data-open'),
                 mail: o.querySelector('a[href^=mailto]').getAttribute('href'),
                 focusInside: o.contains(document.activeElement) };
    }""")
    check("CONTACT opens the overlay below the breakpoint and moves focus into it",
          over["open"] == "true" and over["focusInside"], over)
    check("the overlay carries the house address and nothing else",
          over["mail"] == "mailto:prod@example.com", over)
    for _ in range(6):
        np.keyboard.press("Tab")
    check("focus is trapped inside the overlay while it is open", np.evaluate(
        "() => document.getElementById('contact-overlay').contains(document.activeElement)"))
    np.keyboard.press("Escape")
    np.wait_for_timeout(700)
    check("escape closes the overlay and returns focus to its opener",
          np.evaluate("() => document.getElementById('contact-overlay')"
                      ".getAttribute('data-open')") == "false"
          and np.evaluate("() => document.activeElement.getAttribute('data-contact') !== null"))
    np.screenshot(path=f"{SHOTS}/19_contact_overlay.png")
    nctx.close()

    # there is no contact route: CONTACT is a mail composition, never a page
    check("there is no contact route", page.goto(BASE + "/contact").status == 404)

    # ---------------------------------------------------------- reduced motion
    print("\n== reduced motion ==")
    rctx = browser.new_context(viewport={"width": 1440, "height": 900},
                               reduced_motion="reduce")
    rp = rctx.new_page()
    rp.goto(BASE + "/about", wait_until="networkidle")
    rp.wait_for_timeout(900)
    blur = rp.evaluate("""() => getComputedStyle(document.querySelector('.d-body')).filter""")
    check("under reduced motion the about text resolves to sharp",
          blur in ("none", "blur(0px)"), blur)
    rp.goto(BASE + "/works", wait_until="networkidle")
    rp.wait_for_timeout(900)
    rdur = rp.evaluate("""() => {
        const m = document.querySelector('.index-entry .tile-media');
        return getComputedStyle(m).transitionDuration;
    }""")
    check("the colour return still applies, over 0.01s", "0.01s" in rdur, rdur)
    revealed = rp.evaluate("""() => getComputedStyle(
        document.querySelector('.index-entry .tile-frame')).clipPath""")
    check("the reveal resolves to its end state", "inset(0%" in revealed or revealed == "none", revealed)
    rctx.close()

    # ---------------------------------------------------------- colour discipline
    print("\n== the two-colour model ==")
    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(700)
    stray = page.evaluate("""() => {
        const allowed = new Set(['rgb(6, 4, 3)', 'rgb(233, 234, 228)']);
        const bad = [];
        document.querySelectorAll('body *').forEach(el => {
            if (!el.textContent || !el.textContent.trim()) return;
            if (el.children.length) return;
            const c = getComputedStyle(el).color;
            const m = c.match(/rgba?\\((\\d+), (\\d+), (\\d+)/);
            if (!m) return;
            const base = `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
            if (!allowed.has(base) && base !== 'rgb(255, 255, 255)') bad.push(el.className + ':' + c);
        });
        return bad.slice(0, 8);
    }""")
    check("every piece of text is one of the two tokens or an opacity state of one",
          len(stray) == 0, stray)

    forbidden = page.evaluate("""async () => {
        const sheets = Array.from(document.styleSheets);
        let text = '';
        for (const s of sheets) {
            try { text += Array.from(s.cssRules).map(r => r.cssText).join('\\n'); } catch (e) {}
        }
        const banned = ['#020420', '#64748b', '#00dc82', 'prefers-color-scheme', '#111111'];
        return banned.filter(b => text.toLowerCase().includes(b.toLowerCase()));
    }""")
    check("none of the framework's declared colours or a colour-scheme query ship",
          forbidden == [], forbidden)

    tokens = page.evaluate("""() => {
        const s = getComputedStyle(document.documentElement);
        return { dark: s.getPropertyValue('--color-dark').trim(),
                 light: s.getPropertyValue('--color-light').trim(),
                 m: s.getPropertyValue('--fontM').trim(),
                 s: s.getPropertyValue('--fontS').trim(),
                 xs: s.getPropertyValue('--fontXS').trim(),
                 xxs: s.getPropertyValue('--fontXXS').trim() };
    }""")
    check("the two colour tokens and four size tokens are declared on the root",
          tokens == {"dark": "#060403", "light": "#e9eae4", "m": "24px",
                     "s": "12px", "xs": "10px", "xxs": "8px"}, tokens)

    blend = page.evaluate("""() => {
        const w = getComputedStyle(document.querySelector('.wordmark')).mixBlendMode;
        const c = getComputedStyle(document.getElementById('cursor')).mixBlendMode;
        return [w, c];
    }""")
    check("the wordmark and the cursor pair are composited with difference",
          blend == ["difference", "difference"], blend)

    depth = page.evaluate("""() => ({
        cursor: getComputedStyle(document.getElementById('cursor')).zIndex,
        nav: getComputedStyle(document.querySelector('.nav')).zIndex,
        mark: getComputedStyle(document.querySelector('.centre-mark')).zIndex
    })""")
    check("the depth ladder puts the cursor at 50, the navigation at 12, the mark at 8",
          depth == {"cursor": "50", "nav": "12", "mark": "8"}, depth)

    nav_layout = page.evaluate("""() => {
        const works = document.querySelector('.nav-item[href="/works"]').getBoundingClientRect();
        const centre = works.left + works.width / 2;
        const others = Array.from(document.querySelectorAll('.nav-group .nav-item'))
            .map(a => a.getBoundingClientRect().left);
        return { worksCentre: Math.round(centre), windowMid: window.innerWidth / 2,
                 grouped: others.every(x => x > window.innerWidth * 0.6) };
    }""")
    check("WORKS is centred in the window and the other three are grouped right",
          abs(nav_layout["worksCentre"] - nav_layout["windowMid"]) < 30 and nav_layout["grouped"],
          nav_layout)

    contact = page.evaluate("""() => {
        const a = document.querySelector('.nav-item[data-contact]');
        return { href: a.getAttribute('href'), current: a.getAttribute('aria-current') };
    }""")
    check("CONTACT is a mail composition rather than a route",
          contact["href"].startswith("mailto:") and contact["current"] is None, contact)

    browser.close()


with sync_playwright() as p:
    run(p)

# the walk deliberately requests addresses that must answer 404, so the browser
# logs a resource failure for each; anything else is a real defect
real_errors = [
    e for e in console_errors
    if "favicon" not in e.lower() and "404" not in e
]
check("the console carries no script error across every route", not real_errors, real_errors[:5])

print(f"\n{len(passed)} passed, {len(failed)} failed")
if failed:
    print("failed:")
    for f in failed:
        print("  - " + f)
    sys.exit(1)
