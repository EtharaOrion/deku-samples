"""Browser journeys through Cirrus, as a stranger would take them."""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("CIRRUS_BASE", "http://localhost:4173")
STAMP = os.environ.get("CIRRUS_STAMP", "walk")
STAMP_NAME = "Ines Marchetti " + STAMP
STAMP_SLUG = ("ines-marchetti-" + STAMP)
SHOTS = "/app/.browser_screenshots"
os.makedirs(SHOTS, exist_ok=True)

results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(("PASS " if condition else "FAIL ") + name + (" :: " + str(detail) if detail else ""))


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name), full_page=False)
    print("shot", name)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        console = []
        page.on("console", lambda m: console.append((m.type, m.text)))
        page.on("pageerror", lambda e: console.append(("pageerror", str(e))))

        # ---------------------------------------------------------- journey 1: the entry
        page.goto(BASE + "/")
        page.wait_for_timeout(600)
        counter = page.locator(".counterwell__num")
        counter_text = counter.inner_text() if counter.count() else ""
        print("counter now:", counter_text)
        deadline = time.time() + 25
        final = ""
        while time.time() < deadline:
            if counter.count():
                final = counter.inner_text()
            if final.strip() == "100%":
                break
            page.wait_for_timeout(250)
        check("entry counter reaches 100%", final.strip() == "100%", final)
        page.wait_for_timeout(900)
        veil = page.locator(".veil")
        check("veil clears", veil.count() == 0 or "is-clear" in (veil.get_attribute("class") or ""),
              veil.get_attribute("class") if veil.count() else "gone")
        stills = page.locator(".cluster")
        check("entry cluster holds stills", stills.count() >= 12, stills.count())
        shot(page, "01_entry_counter_done.png")
        first = stills.first
        first.hover()
        page.wait_for_timeout(500)
        label = page.locator(".cursor__label").inner_text()
        check("cursor label carries the title beside the pointer", label.strip() != "", label)
        shot(page, "02_entry_cursor_label.png")
        first.click()
        page.wait_for_timeout(1600)
        check("entry still lands on its film", "/works/" in page.url, page.url)

        # ---------------------------------------------------------- journey 2: the index
        page.goto(BASE + "/works")
        page.wait_for_timeout(800)
        shot(page, "03_works_index.png")
        rows = page.locator(".works__list .entryrow")
        check("the index numbers twelve entries", rows.count() == 12, rows.count())
        ordinals = page.eval_on_selector_all(".caption__ordinal", "els => els.map(e => e.textContent.trim())")
        check("ordinals run 001 to 012", ordinals == ["%03d" % i for i in range(1, 13)], ordinals[:4])
        opening = page.locator(".works__line").inner_text()
        check("the opening line is present", "Quiet decisions" in opening, opening[:40])
        rows.nth(3).scroll_into_view_if_needed()
        page.wait_for_timeout(900)
        shot(page, "04_works_entry_colour_return.png")
        rows.nth(3).locator("a.tile").click()
        page.wait_for_timeout(1400)
        check("an entry opens its film", "/works/" in page.url, page.url)

        # ---------------------------------------------------------- journey 3: a film
        title = page.locator(".work__title").inner_text()
        check("the film page carries its title", title.strip() != "", title)
        next_link = page.locator(".work__next")
        check("next and previous are present", next_link.count() == 1, next_link.count())
        nxt = next_link.locator(".work__ntitle").inner_text()
        next_link.click()
        page.wait_for_timeout(1400)
        check("next follows the ordinal", page.locator(".work__title").inner_text() == nxt,
              page.locator(".work__title").inner_text())
        shot(page, "05_work_detail.png")

        # ---------------------------------------------------------- journey 4: the roster
        page.goto(BASE + "/talents")
        page.wait_for_timeout(900)
        shot(page, "06_roster.png")
        filters = page.locator(".filter")
        labels = page.eval_on_selector_all(".filter", "els => els.map(e => e.textContent.trim().replace(/\\s+/g,' '))")
        check("the filter offers director then photographer", labels == ["DIRECTOR", "PHOTOGRAPHER"], labels)
        name = page.evaluate("Array.from(document.querySelectorAll('.talentcard__name')).filter(n => n.offsetParent !== null).map(n => n.textContent.trim()).join(', ')")
        check("a director fills the window", name.strip() != "", name)
        page.locator(".filter", has_text="PHOTOGRAPHER").click()
        page.wait_for_timeout(700)
        photo_name = page.evaluate("Array.from(document.querySelectorAll('.talentcard__name')).filter(n => n.offsetParent !== null)[0].textContent")
        check("the photographer filter leaves Camille Ferrand",
              "Camille Ferrand" in photo_name, photo_name)
        marker = page.locator(".filter.is-active .filter__mark")
        check("the marker square sits beside the active word", marker.count() == 1, marker.count())
        shot(page, "07_roster_photographer.png")
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(600)
        count = page.locator(".roster__count").inner_text()
        check("arrow keys advance the set", count.replace("\n", "").strip() in ("1/1", "1 / 1"), count)
        page.evaluate("document.querySelector('[data-slug=camille-ferrand] .talentcard__portrait').click()")
        page.wait_for_timeout(1400)
        check("the portrait reaches the talent page", "/talents/" in page.url, page.url)
        credited = page.locator(".talent__entries .entryrow")
        check("her credited work is listed from credits", credited.count() >= 1, credited.count())
        shot(page, "08_talent_detail.png")

        # ---------------------------------------------------------- journey 5: about
        page.goto(BASE + "/about")
        page.wait_for_timeout(700)
        shot(page, "09_about.png")
        about = page.locator(".about__figureline").first.inner_text()
        check("the about figure opens with its four lines", "PICTURES PATIENTLY MADE" in about, about)

        # ---------------------------------------------------------- journey 6: the studio
        page.goto(BASE + "/studio/login")
        page.wait_for_timeout(500)
        page.fill("input[type=email]", "producer@example.com")
        page.fill("input[type=password]", "deku-demo-pw-2026")
        shot(page, "10_studio_login.png")
        page.click("button[type=submit]")
        page.wait_for_timeout(1800)
        check("signing in opens the palette", page.url.endswith("/studio"), page.url)
        shot(page, "11_studio_palette.png")
        cards = page.locator(".card")
        check("the record list carries the house's records", cards.count() >= 12, cards.count())
        page.fill(".palette__input", "new talent")
        page.wait_for_timeout(400)
        options = page.eval_on_selector_all(".palette__opt", "els => els.map(e => e.textContent.trim())")
        check("typing filters to the actions", any("New talent" in o for o in options), options[:2])
        page.keyboard.press("Enter")
        page.wait_for_timeout(1200)
        check("the palette opens the new talent address", page.url.endswith("/studio/talents/new"), page.url)
        shot(page, "12_studio_new_talent.png")
        page.fill("input[type=text]", STAMP_NAME)
        page.locator(".radio input[value=stylist]").check()
        page.click("button[type=submit]")
        page.wait_for_timeout(1800)
        check("creating lands on the record", "/studio/items/" in page.url, page.url)
        shot(page, "13_studio_item_unlisted.png")
        roster_before = page.request.get(BASE + "/api/talents").json()
        check("the new name is absent from the roster before publishing",
              all(t["slug"] != STAMP_SLUG for t in roster_before), len(roster_before))

        # attach a poster, then mint a preview
        page.fill(".form--inline input[type=text]", "Portrait of " + STAMP_NAME + ", stylist")
        page.click(".form--inline button[type=submit]")
        page.wait_for_timeout(1200)
        page.click("text=MINT A PREVIEW")
        page.wait_for_timeout(1400)
        preview = page.locator(".studioform__preview a")
        check("a preview link is minted", preview.count() == 1 and "/preview/" in preview.get_attribute("href"),
              preview.get_attribute("href") if preview.count() else "none")
        href = preview.get_attribute("href")
        with page.context.expect_page() as _:
            page.evaluate("href => window.open(href, '_blank')", href)
        newpage = page.context.pages[-1]
        newpage.wait_for_timeout(1500)
        marker_text = newpage.locator(".preview__marker").inner_text()
        check("the preview carries its marker", "NOT PUBLISHED" in marker_text, marker_text)
        check("the preview renders the record", STAMP_NAME in newpage.content(), "")
        newpage.screenshot(path=os.path.join(SHOTS, "14_preview.png"))
        print("shot 14_preview.png")
        newpage.close()

        page.locator(".studioform__actions button", has_text="PUBLISH").click()
        page.wait_for_timeout(1800)
        check("publishing lands on the confirmation", "/published" in page.url, page.url)
        confirm = page.locator(".confirm").inner_text()
        check("the confirmation names the record", STAMP_NAME in confirm, confirm[:60])
        shot(page, "15_published_confirmation.png")
        roster_after = page.request.get(BASE + "/api/talents").json()
        check("the roster now carries the new name",
              any(t["slug"] == STAMP_SLUG for t in roster_after), len(roster_after))
        disciplines = page.request.get(BASE + "/api/disciplines").json()
        check("the filter now carries STYLIST", disciplines == ["director", "photographer", "stylist"], disciplines)

        # the new name is public and reachable
        pub = page.request.get(BASE + "/talents/" + STAMP_SLUG)
        check("the new talent is live at its own address", pub.status == 200, pub.status)
        shot(page, "16_new_talent_live.png")

        # ---------------------------------------------------------- journey 7: sign out
        page.goto(BASE + "/studio")
        page.wait_for_timeout(1500)
        page.locator(".studio__bar button", has_text="SIGN OUT").click()
        page.wait_for_timeout(1500)
        check("signing out returns to the studio door", page.url.endswith("/studio/login"), page.url)
        pub = page.request.get(BASE + "/studio", max_redirects=0)
        check("the studio is unreachable once signed out", pub.status in (302, 303), pub.status)

        errors = [c for c in console if c[0] in ("error", "pageerror")]
        check("no console errors on the journey", not errors, errors[:3])

        browser.close()

    failures = [r for r in results if not r[1]]
    print("\n%d checks, %d failed" % (len(results), len(failures)))
    for name, _, detail in failures:
        print("  FAILED:", name, detail)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
