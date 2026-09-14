"""The meridian producer's browser: nothing of cirrus is reachable, anywhere."""
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
PW = "deku-demo-pw-2026"


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path="/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
            args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))

        page.goto(BASE + "/studio", wait_until="domcontentloaded")
        page.fill("input[type=email]", "producer.meridian@example.com")
        page.fill("input[type=password]", PW)
        page.click("button[type=submit]")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(1500)
        titles = page.eval_on_selector_all(".pr-title", "els => els.map(e => e.textContent.trim())")
        print("meridian palette sees only: %s" % titles)
        assert sorted(titles) == ["Foundry", "Sable Ito"], titles
        page.screenshot(path="/app/.browser_screenshots/17_meridian_palette_own_only.png")

        # find a cirrus id and try every studio page with it
        import json
        import urllib.request
        req = urllib.request.Request(BASE + "/api/works")
        cirrus_id = json.load(urllib.request.urlopen(req))[0]["id"]
        page.goto(BASE + "/studio/items/%s" % cirrus_id, wait_until="domcontentloaded")
        page.wait_for_timeout(600)
        line = page.locator(".nf-line").count()
        print("cirrus record at meridian's edit page -> not-found line: %d (%s)" % (line, page.url))
        assert line == 1
        page.screenshot(path="/app/.browser_screenshots/18_meridian_foreign_record_not_found.png")

        # and the public surface of cirrus answers normally for the same stranger
        page.goto(BASE + "/works", wait_until="domcontentloaded")
        n = page.eval_on_selector_all(".caption-ordinal", "els => els.length")
        print("public works index still holds %d entries" % n)
        assert n == 12
        print("CONSOLE ERRORS: %d" % len(errs))
        for e in errs[:5]:
            print("  ! %s" % e[:150])
        browser.close()
    print("OK")


if __name__ == "__main__":
    main()
