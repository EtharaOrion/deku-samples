"""
Walks the five journeys from the brief in a real browser, judging each step
against the page rather than by eye, and leaves one screenshot per journey.
Not shipped in the image.
"""
import os
import re
import sys
import time
import json
import urllib.request

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("APP_URL", "http://127.0.0.1:4173")
MAILPIT = os.environ.get("MAILPIT_URL", "http://mailpit:8025")
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"

failures = []
console_problems = []


def check(name, cond, detail=""):
    if cond:
        print(f"  ok   {name}")
    else:
        failures.append(f"{name} {detail}")
        print(f"  FAIL {name} {detail}")


def mail_search(subject):
    q = urllib.parse.quote(f'subject:"{subject}"')
    try:
        with urllib.request.urlopen(f"{MAILPIT}/api/v1/search?query={q}") as r:
            return json.load(r).get("messages", [])
    except Exception:
        return []


def mail_body(msg_id):
    with urllib.request.urlopen(f"{MAILPIT}/api/v1/message/{msg_id}") as r:
        return json.load(r)


def reset_mail():
    req = urllib.request.Request(f"{MAILPIT}/api/v1/messages", method="DELETE")
    try:
        urllib.request.urlopen(req)
    except Exception:
        pass


def attach_console(page, label):
    def on_msg(m):
        if m.type in ("error", "warning"):
            text = m.text
            # A 4xx from an intentional probe is not a console defect.
            if "Failed to load resource" in text and "404" in text:
                return
            console_problems.append(f"[{label}] {m.type}: {text}")
    page.on("console", on_msg)
    page.on("pageerror", lambda e: console_problems.append(f"[{label}] pageerror: {e}"))


def sign_in(page, email, password=PW):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_url(re.compile(r"/(home|calendars)"), timeout=15000)


def sign_out(page):
    page.evaluate("() => localStorage.clear()")


def main():
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=["--no-sandbox"],
            executable_path=os.environ.get("CHROMIUM_PATH") or None,
        )

        # ---------------------------------------------------------------
        # Journey 1: a guest opens an event and registers, sees the ticket
        # code, and the confirmation reaches that inbox.
        # ---------------------------------------------------------------
        print("\nJourney 1 — register for /thursday-night-5k")
        reset_mail()
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        attach_console(page, "j1")

        # A fresh guest, signed up through the UI as a stranger would.
        stamp = str(int(time.time()))
        email1 = f"walker-{stamp}@example.com"
        page.goto(f"{BASE}/signup", wait_until="networkidle")
        page.fill('input[name="name"]', "Walker One")
        page.fill('input[name="email"]', email1)
        page.fill('input[name="password"]', PW)
        page.click('button[type="submit"]')
        page.wait_for_url(re.compile(r"/home"), timeout=15000)
        check("signup lands a guest on /home", "/home" in page.url, page.url)

        page.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
        title = page.locator("h1").first.inner_text()
        check("event page shows its title", "Thursday Night 5K" in title, title)

        # The page must arrive already wearing its colours.
        ground = page.evaluate(
            "() => getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()"
        )
        check("theme ground is present, not default", ground not in ("", "#ffffff"), ground)

        page.click('button:has-text("Register")')
        page.wait_for_selector("text=/TKT-[A-Z0-9]{8}/", timeout=15000)
        code = page.locator("a.code").first.inner_text().strip()
        check("panel shows a ticket code", re.match(r"^TKT-[A-Z0-9]{8}$", code) is not None, code)
        panel_state = page.locator("#reg-h").inner_text()
        check("panel flips to a held seat", "going" in panel_state.lower(), panel_state)
        page.screenshot(path=f"{SHOTS}/01_register_ticket.png", full_page=True)

        time.sleep(1.2)
        msgs = mail_search("You’re going to Thursday Night 5K") or \
            mail_search("You're going to Thursday Night 5K")
        check("confirmation email was sent", len(msgs) >= 1, f"found {len(msgs)}")
        if msgs:
            body = mail_body(msgs[0]["ID"])
            check("email went to that guest alone", len(body["To"]) == 1, str(body["To"]))
            check("email names the event", "Thursday Night 5K" in body.get("Text", ""))
            check("email carries the ticket code", code in body.get("Text", ""), code)
            check("no cc", len(body.get("Cc") or []) == 0)
            check("no bcc", len(body.get("Bcc") or []) == 0)

        # The ticket is presentable at its own address without an account.
        anon = browser.new_context()
        anon_page = anon.new_page()
        anon_page.goto(f"{BASE}/t/{code}", wait_until="networkidle")
        check("ticket readable signed out", code in anon_page.content(), "code missing")
        anon.close()
        ctx.close()

        # ---------------------------------------------------------------
        # Journey 2: two guests take the last seat at the same instant.
        # ---------------------------------------------------------------
        print("\nJourney 2 — two guests, one last seat")
        reset_mail()
        # riverside-track-session is seeded with capacity 2 and one seat taken.
        ctxA = browser.new_context(viewport={"width": 1280, "height": 900})
        ctxB = browser.new_context(viewport={"width": 1280, "height": 900})
        pA, pB = ctxA.new_page(), ctxB.new_page()
        attach_console(pA, "j2a")
        attach_console(pB, "j2b")

        for pg, tag in ((pA, "racer-a"), (pB, "racer-b")):
            pg.goto(f"{BASE}/signup", wait_until="networkidle")
            pg.fill('input[name="name"]', f"Racer {tag[-1].upper()}")
            pg.fill('input[name="email"]', f"{tag}-{stamp}@example.com")
            pg.fill('input[name="password"]', PW)
            pg.click('button[type="submit"]')
            pg.wait_for_url(re.compile(r"/home"), timeout=15000)

        for pg in (pA, pB):
            pg.goto(f"{BASE}/riverside-track-session", wait_until="networkidle")
            pg.wait_for_selector('button:has-text("Register")', timeout=10000)

        # Both submit at the same instant.
        pA.click('button:has-text("Register")', no_wait_after=True)
        pB.click('button:has-text("Register")', no_wait_after=True)
        time.sleep(3)

        outcomes = []
        for pg in (pA, pB):
            pg.wait_for_selector("#reg-h", timeout=10000)
            outcomes.append(pg.locator("#reg-h").inner_text().lower())

        seated = [o for o in outcomes if "going" in o]
        waiting = [o for o in outcomes if "waiting list" in o]
        check("exactly one seat", len(seated) == 1, str(outcomes))
        check("exactly one waiting-list place", len(waiting) == 1, str(outcomes))

        # The database is the fact: confirmed must never exceed capacity.
        with urllib.request.urlopen(f"{BASE}/api/events/riverside-track-session") as r:
            ev = json.load(r)
        check("confirmed_count never exceeds capacity",
              ev["confirmed_count"] <= ev["capacity"],
              f'{ev["confirmed_count"]}/{ev["capacity"]}')
        check("the event is exactly full", ev["confirmed_count"] == 2, str(ev["confirmed_count"]))

        winner = pA if "going" in outcomes[0] else pB
        loser = pB if winner is pA else pA
        winner.screenshot(path=f"{SHOTS}/02a_last_seat_ticket.png", full_page=True)
        loser.screenshot(path=f"{SHOTS}/02b_last_seat_waitlist.png", full_page=True)
        ctxA.close()
        ctxB.close()

        # ---------------------------------------------------------------
        # Journey 3: the host approves the pending request.
        # ---------------------------------------------------------------
        print("\nJourney 3 — host approves at /event/sunrise-long-run/manage/guests")
        reset_mail()
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        attach_console(page, "j3")
        sign_in(page, "host@example.com")
        check("host lands on /calendars", "/calendars" in page.url, page.url)

        page.goto(f"{BASE}/event/sunrise-long-run/manage/guests", wait_until="networkidle")
        page.wait_for_selector("#queue-h", timeout=15000)
        queue_before = page.locator("li.queue-row").count()
        check("the queue shows the pending request", queue_before >= 1, str(queue_before))

        guest_name = page.locator("li.queue-row .name").first.inner_text()
        page.click('li.queue-row button:has-text("Approve")')
        page.wait_for_timeout(2500)

        # The row must flip to confirmed in the guest list.
        rows = page.locator("table.guests tbody tr")
        found_confirmed = False
        for i in range(rows.count()):
            text = rows.nth(i).inner_text()
            if guest_name in text and "Confirmed" in text:
                found_confirmed = True
                break
        check("the approved row reads confirmed", found_confirmed, guest_name)
        check("the queue shrank", page.locator("li.queue-row").count() == queue_before - 1)
        page.screenshot(path=f"{SHOTS}/03_host_approves.png", full_page=True)

        time.sleep(1.2)
        approved = mail_search("You’re in: Sunrise Long Run") or \
            mail_search("You're in: Sunrise Long Run")
        check("approval email was sent", len(approved) >= 1, f"found {len(approved)}")
        ctx.close()

        # ---------------------------------------------------------------
        # Journey 4: a confirmed guest cancels; the head of the waiting list
        # is confirmed in the same breath and mailed.
        # ---------------------------------------------------------------
        print("\nJourney 4 — cancel frees the seat and promotes the head of the list")
        reset_mail()
        # thursday-night-5k: seeded guest3 waits at position 1 and journey 1
        # took the last seat, so cancelling must promote that waiting guest.
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        attach_console(page, "j4")
        sign_in(page, "guest@example.com")  # Amina holds a seeded seat

        page.goto(f"{BASE}/home", wait_until="networkidle")
        page.wait_for_selector("ol.rows li", timeout=15000)
        row = page.locator("li.row", has_text="Thursday Night 5K").first
        check("the guest sees the seat on /home", row.count() > 0)

        row.locator('button:has-text("Cancel")').click()
        page.wait_for_selector('.dialog', timeout=8000)
        page.click('.dialog button:has-text("Cancel Registration")')
        page.wait_for_timeout(2500)

        # The row moves to its new status in place rather than vanishing.
        moved = page.locator("li.row", has_text="Thursday Night 5K").first
        check("the row stays and shows its new status",
              "Cancelled" in moved.inner_text(), moved.inner_text())
        page.screenshot(path=f"{SHOTS}/04_cancel_promotes.png", full_page=True)

        time.sleep(1.5)
        promo = mail_search("A spot opened up for Thursday Night 5K")
        check("the waiting guest was mailed a seat", len(promo) >= 1, f"found {len(promo)}")
        if promo:
            b = mail_body(promo[0]["ID"])
            check("promotion carries a ticket code",
                  re.search(r"TKT-[A-Z0-9]{8}", b.get("Text", "")) is not None)
            check("promotion went to one guest", len(b["To"]) == 1)

        with urllib.request.urlopen(f"{BASE}/api/events/thursday-night-5k") as r:
            ev = json.load(r)
        check("the seat was passed on, not lost", ev["confirmed_count"] == ev["capacity"],
              f'{ev["confirmed_count"]}/{ev["capacity"]}')
        ctx.close()

        # ---------------------------------------------------------------
        # Journey 5: host2 cancels Winter Reading Night with a typed reason.
        # ---------------------------------------------------------------
        print("\nJourney 5 — host cancels Winter Reading Night with a reason")
        reset_mail()
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        attach_console(page, "j5")

        # Give the event a guest first, so there is somebody to mail.
        gctx = browser.new_context()
        gp = gctx.new_page()
        gp.goto(f"{BASE}/signup", wait_until="networkidle")
        gp.fill('input[name="name"]', "Reader Nine")
        gp.fill('input[name="email"]', f"reader-{stamp}@example.com")
        gp.fill('input[name="password"]', PW)
        gp.click('button[type="submit"]')
        gp.wait_for_url(re.compile(r"/home"), timeout=15000)
        gp.goto(f"{BASE}/winter-reading-night", wait_until="networkidle")
        gp.click('button:has-text("Register")')
        gp.wait_for_selector("text=/TKT-[A-Z0-9]{8}/", timeout=15000)
        gctx.close()
        reset_mail()

        sign_in(page, "host2@example.com")
        page.goto(f"{BASE}/event/winter-reading-night/manage/registration",
                  wait_until="networkidle")
        page.wait_for_selector('button:has-text("Cancel Event")', timeout=15000)
        page.click('button:has-text("Cancel Event")')
        page.wait_for_selector(".dialog", timeout=8000)

        # The action becomes available only once a reason is typed.
        confirm = page.locator('.dialog button:has-text("Cancel Event")')
        check("the cancel action waits for a reason", confirm.is_disabled())
        reason = "The venue lost its lease."
        page.fill(".dialog textarea", reason)
        check("the action unlocks once a reason is typed", confirm.is_enabled())
        confirm.click()
        page.wait_for_timeout(2500)
        page.screenshot(path=f"{SHOTS}/05_host_cancels.png", full_page=True)

        # The page keeps its address and shows the notice, not the panel.
        pub = browser.new_context()
        pub_page = pub.new_page()
        pub_page.goto(f"{BASE}/winter-reading-night", wait_until="networkidle")
        content = pub_page.content()
        check("the cancelled page keeps its address",
              pub_page.url.rstrip("/").endswith("/winter-reading-night"), pub_page.url)
        check("the notice replaces the panel", "cancelled" in content.lower())
        check("the notice carries the host's words", reason in content)
        check("no register control remains",
              pub_page.locator('button:has-text("Register")').count() == 0)
        pub_page.screenshot(path=f"{SHOTS}/06_cancelled_public_page.png", full_page=True)
        pub.close()

        time.sleep(1.5)
        cancelled = mail_search("Winter Reading Night has been cancelled")
        check("every guest holding a place was mailed", len(cancelled) >= 1,
              f"found {len(cancelled)}")
        if cancelled:
            b = mail_body(cancelled[0]["ID"])
            check("the reason travels word for word", reason in b.get("Text", ""))
        ctx.close()

        # ---------------------------------------------------------------
        # Authorization, as seen from a browser session.
        # ---------------------------------------------------------------
        print("\nGuardrails — a guest may not reach host screens")
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        attach_console(page, "guard")
        sign_in(page, "guest@example.com")
        page.goto(f"{BASE}/calendars", wait_until="networkidle")
        check("a guest at /calendars gets the not-found page",
              "Page Not Found" in page.content(), page.url)
        page.goto(f"{BASE}/event/thursday-night-5k/manage/guests", wait_until="networkidle")
        check("a guest at a manage route gets the not-found page",
              "Page Not Found" in page.content(), page.url)
        page.goto(f"{BASE}/harbour-loop-recovery-jog", wait_until="networkidle")
        check("a draft event is not found to a guest", "Page Not Found" in page.content())
        page.screenshot(path=f"{SHOTS}/07_guest_denied.png", full_page=True)
        ctx.close()

        # ---------------------------------------------------------------
        # Discover: the address is the state.
        # ---------------------------------------------------------------
        print("\nDiscover — filters live in the query string")
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        attach_console(page, "discover")
        page.goto(f"{BASE}/discover", wait_until="networkidle")
        page.select_option('select[name="category"]', "running")
        page.wait_for_timeout(1200)
        check("the category writes into the address", "category=running" in page.url, page.url)
        cards_running = page.locator("li app-event-card").count()

        page.fill('input[name="q"]', "track")
        page.wait_for_timeout(1500)
        check("the search term writes into the address", "q=track" in page.url, page.url)
        narrowed = page.locator("li app-event-card").count()
        check("q narrows rather than widens", narrowed <= cards_running,
              f"{narrowed} vs {cards_running}")

        page.go_back()
        page.wait_for_timeout(1500)
        check("the back button restores the previous list", "q=track" not in page.url, page.url)

        # A shared link shows a second visitor the same list.
        shared = browser.new_context()
        sp = shared.new_page()
        sp.goto(f"{BASE}/discover?category=running&q=track", wait_until="networkidle")
        sp.wait_for_timeout(800)
        check("a shared link restores the same filters",
              sp.locator('input[name="q"]').input_value() == "track")
        shared.close()
        page.goto(f"{BASE}/discover", wait_until="networkidle")
        page.screenshot(path=f"{SHOTS}/08_discover.png", full_page=True)
        ctx.close()

        # ---------------------------------------------------------------
        # The phone layout: the panel becomes a foot bar.
        # ---------------------------------------------------------------
        print("\nResponsive — the registration panel becomes a foot bar on a phone")
        ctx = browser.new_context(viewport={"width": 390, "height": 780})
        page = ctx.new_page()
        attach_console(page, "phone")
        page.goto(f"{BASE}/sunrise-long-run", wait_until="networkidle")
        bar = page.locator(".foot-bar")
        check("the foot bar is shown below 484px", bar.is_visible())
        box = bar.bounding_box()
        check("the foot bar is 72px tall", box and abs(box["height"] - 72) < 2,
              str(box["height"] if box else None))
        page.screenshot(path=f"{SHOTS}/09_phone_footbar.png", full_page=True)
        ctx.close()

        browser.close()

    print("\n=== console ===")
    if console_problems:
        for c in console_problems[:20]:
            print(f"  {c}")
    else:
        print("  clean")

    print(f"\n=== {len(failures)} failed ===")
    for f in failures:
        print(f"  - {f}")
    return 1 if failures or console_problems else 0


if __name__ == "__main__":
    sys.exit(main())
