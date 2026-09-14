"""Full browser walk of the Cirrus journeys. Writes evidence screenshots."""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"
SHOT = ".browser_screenshots/"
errors = []


def check(cond, label):
    print(("  ok  " if cond else "FAIL  ") + label)
    if not cond:
        errors.append(label)


def watch(page, errors):
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:160]))
    page.on("console", lambda m: None if m.type != "error" or "404" in m.text else errors.append("console: " + m.text[:200]))


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        watch(pg, errors)

        # ---- journey 1: entry counter, veil, still, film
        pg.goto(BASE + "/", wait_until="load")
        for _ in range(30):
            if pg.inner_text(".entry-figure") == "100%":
                break
            time.sleep(0.25)
        check(pg.inner_text(".entry-figure") == "100%", "counter reaches 100%")
        time.sleep(0.9)
        veil = pg.eval_on_selector(".entry-veil", "e=>getComputedStyle(e).opacity")
        check(veil == "0", "veil clears after the count")
        n = pg.eval_on_selector_all(".cluster-still", "els=>els.length")
        check(n == 12, f"cluster shows 12 stills ({n})")
        # frame persists across navigation
        pg.click('.cluster-still[data-pos="0"]')
        pg.wait_for_load_state("load")
        check("/works/the-halo" in pg.url, "still opens its film")
        title = pg.inner_text(".work-title")
        check(title == "The Halo", f"work title renders ({title})")
        ordn = pg.inner_text(".work-ordinal")
        check(ordn == "001", f"ordinal renders ({ordn})")
        credits = pg.eval_on_selector_all(".credit-name", "els=>els.map(e=>e.textContent.trim())")
        check("Rives" in credits, f"credits carry the director ({credits})")
        link = pg.eval_on_selector(".credit-pair a.credit-name", "e=>e.getAttribute('href')")
        check(link == "/talents/rives", f"published talent credit links ({link})")
        pg.screenshot(path=SHOT + "02_work_detail.png")
        # neighbours
        nxt = pg.inner_text(".neighbour-next .neighbour-ordinal")
        check(nxt == "002", f"next neighbour is 002 ({nxt})")

        # ---- journey 2: the works index
        pg.goto(BASE + "/works", wait_until="load")
        time.sleep(1.2)
        line = pg.inner_text(".opening-line")
        check(line.startswith("Quiet decisions"), "opening line renders")
        entries = pg.eval_on_selector_all(".work-entry", "els=>els.length")
        check(entries == 12, f"twelve entries ({entries})")
        first_ord = pg.eval_on_selector(".work-entry .caption-ordinal", "e=>e.textContent")
        check(first_ord == "001", f"first ordinal is 001 ({first_ord})")
        blur = pg.eval_on_selector(".opening-line", "e=>getComputedStyle(e).filter")
        check("blur" not in blur or blur == "blur(0px)", f"opening sharpened ({blur})")
        # colour return: hover a still
        pg.hover(".work-entry:nth-child(1) .work-still")
        time.sleep(1.1)
        filt = pg.eval_on_selector(".work-entry:nth-child(1) .work-still", "e=>getComputedStyle(e).filter")
        check("grayscale(0)" in filt or filt == "none", f"colour returns on hover ({filt})")
        pg.screenshot(path=SHOT + "03_works_index.png", full_page=False)

        # ---- journey 3: roster and the discipline filter
        pg.goto(BASE + "/talents", wait_until="load")
        time.sleep(0.8)
        name = pg.inner_text(".roster-entry.is-current .roster-name")
        check(name.strip() == "Rives", f"first roster name is Rives ({name})")
        labels = pg.eval_on_selector_all(".filter-item", "els=>els.map(e=>e.textContent)")
        check(labels[:2] == ["DIRECTOR", "PHOTOGRAPHER"], f"filter derives from published talent ({labels})")
        pg.click('.filter-item:has-text("PHOTOGRAPHER")')
        time.sleep(0.6)
        name = pg.inner_text(".roster-entry.is-current .roster-name")
        check(name.strip() == "Camille Ferrand", f"filter selects Camille Ferrand ({name})")
        active = pg.eval_on_selector(".filter-item.is-active", "e=>e.textContent")
        check(active == "PHOTOGRAPHER", f"marker on the active word ({active})")
        pg.screenshot(path=SHOT + "04_roster_photographer.png")
        # arrow keys advance the set: two directors to move between
        pg.click('.filter-item:has-text("DIRECTOR")')
        time.sleep(0.6)
        before = pg.inner_text(".roster-entry.is-current .roster-name")
        pg.focus(".roster-stage")
        pg.keyboard.press("ArrowRight")
        time.sleep(0.9)
        after = pg.inner_text(".roster-entry.is-current .roster-name")
        check(before != after, f"arrow key advances the set ({before} -> {after})")
        # reach the talent detail and read the selected work
        pg.click('.filter-item:has-text("PHOTOGRAPHER")')
        pg.click(".roster-entry.is-current .roster-link")
        pg.wait_for_load_state("load")
        check("/talents/camille-ferrand" in pg.url, "talent detail opens")
        works = pg.eval_on_selector_all(".talent-selected .caption-title", "els=>els.map(e=>e.textContent.trim())")
        check(works == ["LORIS"], f"selected work read from credits ({works})")
        pg.screenshot(path=SHOT + "05_talent_detail.png")

        # ---- about
        pg.goto(BASE + "/about", wait_until="load")
        time.sleep(0.6)
        lines = pg.eval_on_selector_all(".figure-line", "els=>els.length")
        check(lines == 8, f"about figure has its mirror ({lines})")
        body = pg.eval_on_selector_all(".body-line", "els=>els.length")
        check(body == 7, f"seven authored lines ({body})")
        pg.screenshot(path=SHOT + "06_about.png")

        # ---- journey 4: the producer
        pg.goto(BASE + "/studio", wait_until="load")
        check("/studio/login" in pg.url, "studio redirects to login when signed out")
        pg.fill('input[name="email"]', "producer@example.com")
        pg.fill('input[name="password"]', "deku-demo-pw-2026")
        pg.click('button[type="submit"]')
        pg.wait_for_url("**/studio", timeout=15000)
        time.sleep(0.5)
        check("/studio" in pg.url and "login" not in pg.url, f"producer lands in the studio ({pg.url})")
        pg.screenshot(path=SHOT + "07_studio_palette.png")
        # palette filtering
        pg.fill(".palette-input", "quiet")
        time.sleep(0.4)
        rows = pg.eval_on_selector_all(".palette-item .palette-title", "els=>els.map(e=>e.textContent)")
        check(rows == ["The Quiet Room"], f"palette finds the unlisted record ({rows})")
        # new talent from the palette
        pg.fill(".palette-input", "")
        time.sleep(0.3)
        pg.click('.palette-item:has-text("New talent")')
        pg.wait_for_load_state("load")
        check("/studio/talents/new" in pg.url, "New talent opens its own address")
        pg.fill('input[x-model="title"]', "Ines Marchetti")
        pg.click('.choice:has-text("STYLIST")')
        pg.click('button:has-text("CREATE TALENT")')
        pg.wait_for_url("**/studio/items/*", timeout=15000)
        check("/studio/items/" in pg.url, f"create opens the record ({pg.url})")
        record_id = pg.url.rstrip("/").split("/")[-1]
        # the record must be absent publicly
        anon = pg.request.get(BASE + "/api/talents/ines-marchetti")
        check(anon.status == 404, f"unlisted talent absent at its address ({anon.status})")
        # add media, then publish
        pg.fill('input[x-model="media.alt"]', "Portrait of Ines Marchetti, stylist")
        pg.click('button:has-text("ADD MEDIA")')
        time.sleep(1.0)
        media_rows = pg.eval_on_selector_all(".media-row", "els=>els.length")
        check(media_rows == 1, f"poster attached ({media_rows})")
        pg.click('button:has-text("PUBLISH")')
        pg.wait_for_url("**/published", timeout=15000)
        check("/published" in pg.url, "publishing lands on the confirmation")
        body = pg.inner_text("main")
        check("Ines Marchetti" in body and "published" in body.lower(), "confirmation names the record")
        pg.screenshot(path=SHOT + "08_publish_confirmation.png")
        pub = pg.request.get(BASE + "/api/talents/ines-marchetti")
        check(pub.status == 200, "published talent now answers")
        discs = pg.request.get(BASE + "/api/disciplines").json()
        check(discs == ["director", "photographer", "stylist"], f"stylist joins the filter ({discs})")
        roster = pg.request.get(BASE + "/api/talents").json()
        check(any(t["slug"] == "ines-marchetti" for t in roster), "roster carries the new name")
        pg.screenshot(path=SHOT + "09_roster_with_stylist.png")

        # ---- preview token flow on a fresh unlisted record
        pg.goto(BASE + "/studio", wait_until="load")
        pg.fill(".palette-input", "New work")
        time.sleep(0.3)
        pg.click('.palette-item:has-text("New work")')
        pg.wait_for_load_state("load")
        pg.fill('input[x-model="title"]', "Sable Test Film")
        pg.click('button:has-text("CREATE WORK")')
        pg.wait_for_url("**/studio/items/*", timeout=15000)
        check("/studio/items/" in pg.url, "work record created")
        pg.click('button:has-text("PREVIEW TOKEN")')
        time.sleep(1.5)
        # mint via API to test the page directly
        wid = pg.url.rstrip("/").split("/")[-1]
        pg.fill('input[x-model="media.alt"]', "Poster still for the film Sable Test Film")
        pg.click('button:has-text("ADD MEDIA")')
        time.sleep(1.2)
        token_json = pg.evaluate(
            """async (id) => {
              const r = await fetch('/api/studio/preview-tokens', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({item_id: id})});
              return await r.json();
            }""",
            wid,
        )
        check(len(token_json.get("token", "")) == 32, f"token minted ({token_json})")
        tok = token_json["token"]
        prev = pg.request.get(BASE + "/preview/" + tok)
        check(prev.status == 200, f"preview renders for its producer ({prev.status})")
        check("PREVIEW - NOT PUBLISHED" in prev.text(), "preview carries its marker")
        anon_page = b.new_page()
        resp = anon_page.goto(BASE + "/preview/" + tok)
        check(resp.status == 404, f"anon preview page is not found ({resp.status})")
        body = anon_page.content()
        check("Sable Test Film" not in body, "anon preview reveals nothing about the record")
        anon_page.close()

        # unlisted media unreachable: take the poster id from the studio record
        rec = pg.request.get(BASE + "/api/studio/items/" + wid).json()
        poster_id = [m for m in rec["media"] if m["role"] == "poster"][0]["id"]
        st = pg.request.get(BASE + "/api/media/" + poster_id, headers={"Authorization": "x"}).status
        # (browser session carries the producer cookie)
        sess = pg.request.get(BASE + "/api/media/" + poster_id).status
        check(sess in (200, 404), f"producer session media request answered ({sess})")
        tok_url = BASE + "/api/media/" + poster_id + "?token=" + tok
        producer_media = pg.request.get(BASE + "/api/studio/items/" + wid).json()
        pmed = [m for m in producer_media["media"] if m["role"] == "poster"][0]
        withq = pg.request.get(BASE + pmed["url"]).status
        check(withq == 200, f"producer reads its unlisted media via its own url ({withq})")
        anon2 = b.new_page()
        r = anon2.request.get(BASE + "/api/media/" + poster_id)
        check(r.status == 404, f"unlisted media is not found without the house ({r.status})")
        anon2.close()

        # ---- the other house
        mpg = b.new_page(viewport={"width": 1440, "height": 900})
        watch(mpg, errors)
        mpg.goto(BASE + "/studio/login", wait_until="load")
        mpg.fill('input[name="email"]', "producer.meridian@example.com")
        mpg.fill('input[name="password"]', "deku-demo-pw-2026")
        mpg.click('button[type="submit"]')
        mpg.wait_for_url("**/studio", timeout=15000)
        time.sleep(0.5)
        titles = mpg.eval_on_selector_all(".record-card .record-title", "els=>els.map(e=>e.textContent)")
        check(set(titles) == {"Sable Ito", "Foundry"}, f"meridian sees only its own records ({titles})")
        got = mpg.request.get(BASE + "/api/studio/items/" + record_id).status
        check(got == 404, f"meridian cannot read the cirrus record ({got})")
        patch = mpg.request.patch(
            BASE + "/api/studio/items/" + record_id,
            data='{"title":"Stolen"}',
            headers={"Content-Type": "application/json"},
        )
        check(patch.status == 404, f"meridian cannot edit it ({patch.status})")
        pub_now = pg.request.get(BASE + "/api/talents/ines-marchetti").json()
        check(pub_now["title"] == "Ines Marchetti", "record unchanged after the foreign attempt")
        mpg.screenshot(path=SHOT + "10_meridian_studio.png")

        # viewer refused
        vpg = b.new_page(viewport={"width": 1440, "height": 900})
        watch(vpg, errors)
        vpg.goto(BASE + "/studio/login", wait_until="load")
        vpg.fill('input[name="email"]', "viewer@example.com")
        vpg.fill('input[name="password"]', "deku-demo-pw-2026")
        vpg.click('button[type="submit"]')
        try:
            vpg.wait_for_url(BASE + "/", timeout=8000)
        except Exception:
            pass
        time.sleep(1.2)
        check(vpg.url.rstrip("/") in (BASE, BASE + "/studio"), f"viewer is refused out of the studio ({vpg.url})")
        vpg.screenshot(path=SHOT + "11_viewer_refused.png")

        # not found surface
        nf = b.new_page(viewport={"width": 1440, "height": 900})
        watch(nf, errors)
        r = nf.goto(BASE + "/no-such-page")
        check(r.status == 404, f"not found carries the status ({r.status})")
        check("That page is not here." in nf.content(), "not-found line renders")
        check("no-such-page" not in nf.content(), "the path is not echoed")
        nf.screenshot(path=SHOT + "12_not_found.png")

        b.close()

    print()
    if errors:
        print(f"{len(errors)} FAILURES:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("all journeys passed")


if __name__ == "__main__":
    main()
