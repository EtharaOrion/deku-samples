"""Browser walkthrough of the four journeys, saving evidence as screenshots."""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"
notes = []


def note(msg):
    print("  " + msg, flush=True)
    notes.append(msg)


def shot(page, name):
    page.screenshot(path="%s/%s" % (OUT, name), full_page=False)
    print("  shot %s" % name, flush=True)


def errors(page):
    out = []
    page.on("console", lambda m: out.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: out.append(str(e)))
    return out


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome", args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        console = errors(page)

        # ---------- journey 1: the entry, the counter, the cluster
        note("J1 entry")
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_selector(".entry-counter", state="attached")
        for _ in range(120):
            txt = page.locator(".entry-count").inner_text()
            if txt.strip() == "100":
                break
            page.wait_for_timeout(250)
        note("counter reached %s%%" % page.locator(".entry-count").inner_text())
        page.wait_for_timeout(900)
        shot(page, "01_entry_counter_done.png")
        val = page.eval_on_selector(".entry-cluster", "el => getComputedStyle(el).opacity")
        note("cluster opacity after the count: %s" % val)
        page.hover(".cluster-still >> nth=2")
        page.wait_for_timeout(700)
        label = page.locator(".cursor-label").inner_text()
        note("cursor label over a still: %r" % label)
        shot(page, "02_entry_cluster_hover.png")
        page.click(".cluster-still >> nth=2")
        page.wait_for_load_state("domcontentloaded")
        note("landed on %s" % page.url)
        assert "/works/" in page.url, "cluster still should open a film"
        shot(page, "03_work_detail_from_cluster.png")

        # ---------- journey 2: the numbered index
        note("J2 works index")
        page.goto(BASE + "/works", wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        ords = page.eval_on_selector_all(".caption-ordinal", "els => els.map(e => e.textContent.trim())")
        note("ordinals: %s .. %s (%d entries)" % (ords[0], ords[-1], len(ords)))
        assert len(ords) == 12 and ords[0] == "001" and ords[-1] == "012", ords
        first = page.locator(".work-entry").nth(0)
        first.scroll_into_view_if_needed()
        page.wait_for_timeout(1400)
        sat_before = page.eval_on_selector(".work-entry >> nth=0 >> .work-still",
                                           "el => getComputedStyle(el).filter")
        page.hover(".work-entry >> nth=0 >> .work-link")
        page.wait_for_timeout(1000)
        sat_after = page.eval_on_selector(".work-entry >> nth=0 >> .work-still",
                                          "el => getComputedStyle(el).filter")
        note("colour return: %s -> %s" % (sat_before, sat_after))
        shot(page, "04_works_index.png")
        page.click(".work-entry >> nth=0 >> .work-link")
        page.wait_for_load_state("domcontentloaded")
        title = page.locator(".work-title").inner_text()
        note("opened %r" % title)
        nxt = page.locator(".neighbour.next .neighbour-title").inner_text()
        note("next by ordinal: %r" % nxt)
        assert nxt.strip(), "next neighbour carries a title"
        page.click(".neighbour.next")
        page.wait_for_load_state("domcontentloaded")
        note("moved to %r" % page.locator(".work-title").inner_text())
        shot(page, "05_work_next_by_ordinal.png")

        # ---------- journey 3: the roster and the filter
        note("J3 roster")
        page.goto(BASE + "/talents", wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        name = page.locator(".roster-entry.current .roster-name").inner_text()
        note("first name: %r" % name)
        btns = page.eval_on_selector_all(".filter-btn", "els => els.map(e => e.textContent.trim())")
        note("filter: %s" % btns)
        assert btns == ["DIRECTOR", "PHOTOGRAPHER"], btns  # stylist joins after J4 publishes one
        page.click(".filter-btn >> text=PHOTOGRAPHER")
        page.wait_for_timeout(900)
        who = page.locator(".roster-entry.current .roster-name").inner_text()
        note("after PHOTOGRAPHER: %r" % who)
        assert who.strip() == "Camille Ferrand", who
        shot(page, "06_roster_photographer.png")
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(900)
        who2 = page.locator(".roster-entry.current .roster-name").inner_text()
        note("arrow key wraps within the filter: %r" % who2)
        assert who2.strip() == "Camille Ferrand", who2
        page.click(".roster-entry.current .roster-open")
        page.wait_for_load_state("domcontentloaded")
        note("talent detail: %s" % page.url)
        works = page.eval_on_selector_all(".talent-work .caption-title", "els => els.map(e => e.textContent.trim())")
        note("selected work read from credits: %s" % works)
        assert works == ["LORIS"], works
        shot(page, "07_talent_detail_selected_work.png")

        # ---------- journey 4: the producer
        note("J4 studio")
        page.goto(BASE + "/studio", wait_until="domcontentloaded")
        page.wait_for_timeout(400)
        note("anon /studio lands on %s" % page.url)
        assert page.url.endswith("/studio/login"), page.url
        page.fill("input[type=email]", "producer@example.com")
        page.fill("input[type=password]", PW)
        shot(page, "08_studio_login.png")
        page.click("button[type=submit]")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(1400)
        note("after sign in: %s" % page.url)
        assert page.url.endswith("/studio"), page.url
        rows = page.eval_on_selector_all(".pr-title", "els => els.map(e => e.textContent.trim())")
        note("palette holds %d records, e.g. %s" % (len(rows), rows[:3]))
        shot(page, "09_studio_palette.png")

        # create a talent from the palette
        page.fill(".palette-input", "Mira Vane")
        page.wait_for_timeout(300)
        page.fill(".palette-input", "Halo")
        page.wait_for_timeout(300)
        hits = page.eval_on_selector_all(".pr-title", "els => els.map(e => e.textContent.trim())")
        note("typing Halo filters to: %s" % hits)
        assert hits == ["The Halo"], hits
        page.click(".palette-action >> text=New talent")
        page.wait_for_load_state("domcontentloaded")
        note("new talent form: %s" % page.url)
        assert page.url.endswith("/studio/talents/new"), page.url
        page.fill("input[name=title]", "Mira Vane")
        page.check("input[value=stylist]")
        page.fill("input[name=slug]", "")
        shot(page, "10_studio_new_talent.png")
        page.click("button[type=submit]")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(1200)
        note("edit page: %s" % page.url)

        # attach a poster, mint a preview, open it, publish
        page.fill("form.media-form input[placeholder*=What]", "A portrait of Mira Vane")
        page.click("form.media-form button[type=submit]")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(1200)
        note("media attached")
        with page.expect_popup() as pop:
            page.click("button:has-text('Mint a preview token')")
        prev = pop.value
        prev.wait_for_load_state("domcontentloaded")
        prev.wait_for_timeout(1200)
        note("preview opened: %s" % prev.url)
        banner = prev.locator(".preview-banner").inner_text()
        note("preview banner: %r" % banner)
        assert "PREVIEW" in banner.upper()
        shot(prev, "11_preview_unlisted.png")
        prev.close()

        # the held record is absent publicly
        page2 = ctx.new_page()
        page2.goto(BASE + "/talents/mira-vane", wait_until="domcontentloaded")
        note("held talent public status: %d (%s)" % (page2.response().status if False else 0, page2.url))
        nf = page2.locator(".nf-line").count()
        note("held talent shows the not-found line: %d" % nf)
        assert nf == 1
        shot(page2, "12_held_talent_not_found.png")
        page2.close()

        page.click("button:has-text('Publish')")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(800)
        note("published confirmation: %s" % page.url)
        assert page.url.endswith("/published"), page.url
        shot(page, "13_publish_confirmation.png")

        page3 = ctx.new_page()
        page3.goto(BASE + "/talents", wait_until="domcontentloaded")
        for _ in range(20):
            btns = page3.eval_on_selector_all(".filter-btn", "els => els.map(e => e.textContent.trim())")
            if "STYLIST" in btns:
                break
            page3.reload(wait_until="domcontentloaded")
            page3.wait_for_timeout(400)
        note("filter now carries: %s" % btns)
        assert "STYLIST" in btns, btns
        page3.goto(BASE + "/talents/mira-vane", wait_until="domcontentloaded")
        page3.wait_for_timeout(800)
        nm = page3.locator(".talent-name").inner_text()
        note("roster carries %r" % nm)
        assert nm.strip() == "Mira Vane"
        shot(page3, "14_published_talent_on_roster.png")
        page3.close()

        # ---------- the 404 surface
        page.goto(BASE + "/nothing-here-at-all", wait_until="domcontentloaded")
        page.wait_for_timeout(600)
        line = page.locator(".nf-line").inner_text()
        note("not-found line: %r" % line)
        assert line.strip() == "That page is not here."
        shot(page, "15_not_found.png")

        # ---------- about
        page.goto(BASE + "/about", wait_until="domcontentloaded")
        page.wait_for_timeout(800)
        shot(page, "16_about.png")

        print("CONSOLE ERRORS: %d" % len(console))
        for e in console[:10]:
            print("  ! %s" % e)

        browser.close()
    with open(OUT + "/walkthrough.txt", "w") as fh:
        fh.write("\n".join(notes) + "\n")
    print("OK")


if __name__ == "__main__":
    main()
