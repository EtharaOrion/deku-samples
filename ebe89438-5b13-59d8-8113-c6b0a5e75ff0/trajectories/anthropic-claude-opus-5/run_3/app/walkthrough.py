"""
Walks the five journeys the brief describes, as a stranger would, judging each
step against the page rather than by eye. Saves one screenshot per journey.
"""
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"
PW = "deku-demo-pw-2026"
SHOTS = "/app/.browser_screenshots"

failures = []
console_errors = []


def check(name, cond, detail=""):
    mark = "ok  " if cond else "FAIL"
    print(f"  {mark} {name} {detail if not cond else ''}".rstrip())
    if not cond:
        failures.append(f"{name} {detail}")


def attach_console(page):
    def on_console(msg):
        if msg.type == "error":
            text = msg.text
            # A favicon or font 404 is noise, not a fault in the app.
            if "favicon" in text.lower():
                return
            console_errors.append(f"{page.url}: {text}")

    page.on("console", on_console)
    page.on("pageerror", lambda e: console_errors.append(f"{page.url}: {e}"))


def sign_in(page, email):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill("#email", email)
    page.fill("#password", PW)
    page.click("button[type=submit]")
    page.wait_for_url(re.compile(r"/(home|calendars)$"), timeout=15000)
    page.wait_for_load_state("networkidle")


def sign_out(page):
    page.evaluate("localStorage.removeItem('deku.token')")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )

        # ---------------------------------------------------------------- 1 --
        print("\n== Journey 1: a guest registers and gets a ticket ==")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        attach_console(page)

        page.goto(f"{BASE}/", wait_until="networkidle")
        check("the landing route paints its headline", "start here" in page.inner_text("h1"))
        check("the poster wall is drawn", page.locator(".poster").count() > 0)

        sign_in(page, "guest@example.com")
        check("a guest lands on /home", page.url.endswith("/home"))

        page.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
        ground = page.evaluate(
            "getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()"
        )
        check("the event page arrives already wearing its colours", ground not in ("", "#ffffff"), ground)
        check("the title is on the page", "Thursday Night 5K" in page.inner_text("h1"))

        panel = page.locator("section.panel")
        panel_text = panel.inner_text()
        if "You're going" in panel_text:
            # The seed already seats this guest; free the seat so the journey is real.
            page.click("text=Cancel Registration")
            page.wait_for_timeout(1500)
            panel_text = page.locator("section.panel").inner_text()

        register = page.locator("section.panel button", has_text=re.compile("Register|Join the Waiting List"))
        register.first.click()
        page.wait_for_timeout(2500)

        answer = page.locator(".panel-answer").inner_text()
        check("the panel answers the submission", answer != "", answer)
        got_seat = "ticket code" in answer.lower()
        check(
            "the answer is a seat or a waiting-list place",
            got_seat or "waiting list" in answer.lower(),
            answer,
        )
        if got_seat:
            code = re.search(r"TKT-[A-Z0-9]{8}", answer)
            check("the ticket code is well formed", code is not None, answer)

        page.screenshot(path=f"{SHOTS}/01_guest_registers.png", full_page=True)

        # ---------------------------------------------------------------- 2 --
        print("\n== Journey 2: two guests take the last seat at the same instant ==")
        # Reset the track session to exactly one free seat, then race two guests.
        import subprocess

        import os

        subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-q", "-c",
             "DELETE FROM registrations WHERE event_id=(SELECT id FROM events WHERE slug='riverside-track-session');"],
            capture_output=True,
        )
        subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-q", "-c",
             "INSERT INTO registrations (event_id, account_id, status, seat_no, ticket_code) "
             "SELECT e.id, a.id, 'confirmed', 1, 'TKT-WALK0001' FROM events e, accounts a "
             "WHERE e.slug='riverside-track-session' AND a.email='guest2@example.com';"],
            capture_output=True,
        )

        ctx_a = browser.new_context(viewport={"width": 1280, "height": 900})
        ctx_b = browser.new_context(viewport={"width": 1280, "height": 900})
        page_a, page_b = ctx_a.new_page(), ctx_b.new_page()
        attach_console(page_a)
        attach_console(page_b)
        sign_in(page_a, "guest@example.com")
        sign_in(page_b, "guest3@example.com")

        page_a.goto(f"{BASE}/riverside-track-session", wait_until="networkidle")
        page_b.goto(f"{BASE}/riverside-track-session", wait_until="networkidle")

        # Both press at the same instant.
        page_a.evaluate(
            """() => { const b=[...document.querySelectorAll('section.panel button')]
                 .find(x=>/Register|Waiting List/.test(x.textContent)); window.__go=()=>b.click(); }"""
        )
        page_b.evaluate(
            """() => { const b=[...document.querySelectorAll('section.panel button')]
                 .find(x=>/Register|Waiting List/.test(x.textContent)); window.__go=()=>b.click(); }"""
        )
        page_a.evaluate("window.__go()")
        page_b.evaluate("window.__go()")
        page_a.wait_for_timeout(3000)
        page_b.wait_for_timeout(3000)

        answer_a = page_a.locator(".panel-answer").inner_text()
        answer_b = page_b.locator(".panel-answer").inner_text()
        print(f"    A: {answer_a}")
        print(f"    B: {answer_b}")
        seats = sum(1 for a in (answer_a, answer_b) if "ticket code" in a.lower())
        waits = sum(1 for a in (answer_a, answer_b) if "waiting list" in a.lower())
        check("one guest sees a ticket and the other a waiting-list place", seats == 1 and waits == 1,
              f"seats={seats} waits={waits}")

        # The database is the fact.
        out = subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-tAc",
             "SELECT count(*) FROM registrations WHERE event_id=(SELECT id FROM events "
             "WHERE slug='riverside-track-session') AND status IN ('confirmed','checked_in');"],
            capture_output=True, text=True,
        ).stdout.strip()
        check("the database holds exactly capacity seats, never two", out == "2", f"seated={out}")

        page_a.screenshot(path=f"{SHOTS}/02_last_seat_race.png", full_page=True)
        ctx_a.close()
        ctx_b.close()

        # ---------------------------------------------------------------- 3 --
        print("\n== Journey 3: the host approves a pending request ==")
        subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-q", "-c",
             "DELETE FROM registrations WHERE event_id=(SELECT id FROM events WHERE slug='sunrise-long-run');"
             "INSERT INTO registrations (event_id, account_id, status) "
             "SELECT e.id, a.id, 'pending_approval' FROM events e, accounts a "
             "WHERE e.slug='sunrise-long-run' AND a.email='guest3@example.com';"],
            capture_output=True,
        )

        ctx_h = browser.new_context(viewport={"width": 1440, "height": 1000})
        host = ctx_h.new_page()
        attach_console(host)
        sign_in(host, "host@example.com")
        check("a host lands on /calendars", host.url.endswith("/calendars"))

        host.goto(f"{BASE}/event/sunrise-long-run/manage/guests", wait_until="networkidle")
        host.wait_for_timeout(1200)
        check("the approval queue shows the pending row", "Ines Duarte" in host.inner_text("body"))

        host.click("button:has-text('Approve')")
        host.wait_for_timeout(2500)
        body = host.inner_text("body")
        check("the row flips to confirmed", "Confirmed" in body, body[:200])

        status = subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-tAc",
             "SELECT status FROM registrations WHERE event_id=(SELECT id FROM events "
             "WHERE slug='sunrise-long-run');"],
            capture_output=True, text=True,
        ).stdout.strip()
        check("and the database agrees", status == "confirmed", status)

        host.screenshot(path=f"{SHOTS}/03_host_approves.png", full_page=True)

        # ---------------------------------------------------------------- 4 --
        print("\n== Journey 4: a cancel passes the seat to the head of the waiting list ==")
        # Thursday Night 5K: capacity 3. Seat two, wait one, then cancel a seat.
        subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-q", "-c",
             "DELETE FROM registrations WHERE event_id=(SELECT id FROM events WHERE slug='thursday-night-5k');"
             "INSERT INTO registrations (event_id, account_id, status, seat_no, ticket_code) "
             "SELECT e.id, a.id, 'confirmed', 1, 'TKT-WALK0002' FROM events e, accounts a "
             "WHERE e.slug='thursday-night-5k' AND a.email='guest@example.com';"
             "INSERT INTO registrations (event_id, account_id, status, seat_no, ticket_code) "
             "SELECT e.id, a.id, 'confirmed', 2, 'TKT-WALK0003' FROM events e, accounts a "
             "WHERE e.slug='thursday-night-5k' AND a.email='guest2@example.com';"
             "INSERT INTO registrations (event_id, account_id, status, waitlist_position) "
             "SELECT e.id, a.id, 'waitlisted', 1 FROM events e, accounts a "
             "WHERE e.slug='thursday-night-5k' AND a.email='guest3@example.com';"],
            capture_output=True,
        )

        ctx_g = browser.new_context(viewport={"width": 1280, "height": 900})
        guest = ctx_g.new_page()
        attach_console(guest)
        sign_in(guest, "guest@example.com")
        guest.goto(f"{BASE}/home", wait_until="networkidle")
        guest.wait_for_timeout(1000)
        check("the guest's registrations are listed", "Thursday Night 5K" in guest.inner_text("body"))

        # The confirmed row's cancel control opens the confirmation dialog.
        guest.locator("li.row", has_text="Thursday Night 5K").locator("button", has_text="Cancel").click()
        guest.wait_for_timeout(600)
        check("a confirmation dialog opens", guest.locator("[role=dialog]").count() == 1)
        guest.click("[role=dialog] button:has-text('Cancel Registration')")
        guest.wait_for_timeout(2500)

        promoted = subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-tAc",
             "SELECT r.status || '|' || coalesce(r.ticket_code,'-') FROM registrations r "
             "JOIN accounts a ON a.id=r.account_id WHERE r.event_id=(SELECT id FROM events "
             "WHERE slug='thursday-night-5k') AND a.email='guest3@example.com';"],
            capture_output=True, text=True,
        ).stdout.strip()
        check("the head of the waiting list is confirmed in the same breath",
              promoted.startswith("confirmed|TKT-"), promoted)

        row_text = guest.locator("li.row", has_text="Thursday Night 5K").inner_text()
        check("the row moves to its new status in place rather than vanishing",
              "Cancelled" in row_text, row_text.replace("\n", " ")[:160])

        guest.screenshot(path=f"{SHOTS}/04_cancel_promotes_waitlist.png", full_page=True)
        ctx_g.close()

        # ---------------------------------------------------------------- 5 --
        print("\n== Journey 5: a host calls an event off with a typed reason ==")
        subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-q", "-c",
             "UPDATE events SET state='published', cancelled_at=NULL, cancel_reason=NULL "
             "WHERE slug='winter-reading-night';"],
            capture_output=True,
        )

        ctx_h2 = browser.new_context(viewport={"width": 1440, "height": 1000})
        host2 = ctx_h2.new_page()
        attach_console(host2)
        sign_in(host2, "host2@example.com")

        host2.goto(f"{BASE}/event/winter-reading-night/manage/overview", wait_until="networkidle")
        host2.wait_for_timeout(1000)
        host2.click("button:has-text('Cancel this event')")
        host2.wait_for_timeout(600)

        action = host2.locator("[role=dialog] button:has-text('Cancel Event')")
        check("the action is unavailable until the reason is typed", action.is_disabled())

        REASON = "The bookshop lost its heating, so we are moving this to the spring."
        host2.fill("#cancel-reason", REASON)
        host2.wait_for_timeout(300)
        check("and becomes available once it is", action.is_enabled())
        action.click()
        host2.wait_for_timeout(2500)

        stored = subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-tAc",
             "SELECT state || '|' || cancel_reason FROM events WHERE slug='winter-reading-night';"],
            capture_output=True, text=True,
        ).stdout.strip()
        check("the event is cancelled carrying the host's own words",
              stored == f"cancelled|{REASON}", stored)

        # That page keeps its address and shows the notice, not the panel.
        host2.goto(f"{BASE}/winter-reading-night", wait_until="networkidle")
        host2.wait_for_timeout(800)
        check("the public page keeps its address", host2.url.endswith("/winter-reading-night"))
        panel_text = host2.locator("section.panel").inner_text()
        check("and shows the notice, not the panel", "cancelled" in panel_text.lower(), panel_text[:160])
        check("carrying the reason word for word", REASON in panel_text)

        host2.screenshot(path=f"{SHOTS}/05_host_cancels_event.png", full_page=True)

        # --------------------------------------------------------- extras ---
        print("\n== The rest of the surface ==")
        host2.goto(f"{BASE}/discover?category=running&q=track", wait_until="networkidle")
        host2.wait_for_timeout(1200)
        check("discover reads its filters back from the address",
              host2.input_value("#q") == "track" and host2.input_value("#category") == "running")
        cards = host2.locator("app-event-card").count()
        check("and shows the narrowed list", cards >= 1, f"cards={cards}")
        check("the page control names the totals", "Showing" in host2.inner_text("body"))
        host2.screenshot(path=f"{SHOTS}/06_discover_filters.png", full_page=True)

        host2.goto(f"{BASE}/discover?category=crypto", wait_until="networkidle")
        host2.wait_for_timeout(1000)
        check("the empty state is the pinned wording", "No Events Found" in host2.inner_text("body"))

        host2.goto(f"{BASE}/running", wait_until="networkidle")
        host2.wait_for_timeout(1000)
        check("a category name resolves to its page", "Running" in host2.inner_text("h1"))
        host2.screenshot(path=f"{SHOTS}/07_category.png", full_page=True)

        # A ticket is presentable without an account.
        code = subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-tAc",
             "SELECT ticket_code FROM registrations WHERE ticket_code IS NOT NULL LIMIT 1;"],
            capture_output=True, text=True,
        ).stdout.strip()
        anon = browser.new_context(viewport={"width": 1024, "height": 900})
        anon_page = anon.new_page()
        attach_console(anon_page)
        anon_page.goto(f"{BASE}/t/{code}", wait_until="networkidle")
        anon_page.wait_for_timeout(1200)
        check("a stranger presenting a real code reads the ticket",
              code in anon_page.inner_text("body"), anon_page.inner_text("body")[:160])
        check("the scan code is drawn", anon_page.locator("app-scan-code svg").count() == 1)
        anon_page.screenshot(path=f"{SHOTS}/08_ticket.png", full_page=True)

        # A guest may not reach a host surface.
        anon_page.goto(f"{BASE}/calendars", wait_until="networkidle")
        anon_page.wait_for_timeout(1000)
        check("an unauthenticated visitor at a protected route goes to login with next",
              "/login" in anon_page.url and "next=" in anon_page.url, anon_page.url)

        guest_ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        gp = guest_ctx.new_page()
        attach_console(gp)
        sign_in(gp, "guest@example.com")
        gp.goto(f"{BASE}/calendars", wait_until="networkidle")
        gp.wait_for_timeout(1200)
        check("a guest at /calendars gets the not-found page",
              "Page Not Found" in gp.inner_text("body"), gp.inner_text("body")[:160])
        gp.screenshot(path=f"{SHOTS}/09_guest_refused_host_route.png", full_page=True)

        # A draft answers a stranger as a slug that never existed does.
        gp.goto(f"{BASE}/harbour-loop-recovery-jog", wait_until="networkidle")
        gp.wait_for_timeout(1200)
        check("a draft event is not found for a guest", "Page Not Found" in gp.inner_text("body"))

        # The closed panel is reachable from the first run.
        gp.goto(f"{BASE}/riverside-winter-time-trial", wait_until="networkidle")
        gp.wait_for_timeout(1200)
        closed_panel = gp.locator("section.panel").inner_text()
        check("the closed panel reads its pinned copy",
              "Registration Is Closed" in closed_panel
              and "The host has stopped taking registrations for this event." in closed_panel,
              closed_panel[:160])
        gp.screenshot(path=f"{SHOTS}/10_registration_closed.png", full_page=True)

        # The phone layout puts the panel in a foot bar.
        phone = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pp = phone.new_page()
        attach_console(pp)
        pp.goto(f"{BASE}/sunrise-long-run", wait_until="networkidle")
        pp.wait_for_timeout(1200)
        foot = pp.locator(".foot-bar")
        check("on a phone the registration panel becomes a foot bar",
              foot.count() == 1 and foot.is_visible())
        pp.screenshot(path=f"{SHOTS}/11_phone_event.png", full_page=False)
        phone.close()

        # The composer.
        hp = ctx_h.new_page()
        attach_console(hp)
        hp.goto(f"{BASE}/create", wait_until="networkidle")
        hp.wait_for_timeout(1200)
        body = hp.inner_text("body")
        for pinned in ["Capacity", "Unlimited", "Waitlist Enabled", "Theme", "Seasonal", "Create Event"]:
            check(f"the composer pins the copy '{pinned}'", pinned in body)
        check("the title placeholder reads Event Name",
              hp.get_attribute("#title", "placeholder") == "Event Name")
        hp.screenshot(path=f"{SHOTS}/12_composer.png", full_page=True)

        # Settings.
        hp.goto(f"{BASE}/settings/profile", wait_until="networkidle")
        hp.wait_for_timeout(1000)
        check("the save control is disabled until something differs",
              hp.locator("button:has-text('Save Changes')").is_disabled())
        hp.fill("#handle", "priya-raman")  # unchanged, still disabled
        hp.fill("#handle", "marcus-bell")  # taken by the other host
        hp.click("button:has-text('Save Changes')")
        hp.wait_for_timeout(1500)
        check("a taken handle is refused with the pinned sentence",
              "That handle is already taken." in hp.inner_text("body"))
        hp.screenshot(path=f"{SHOTS}/13_settings_handle_refused.png", full_page=True)
        stored_handle = subprocess.run(
            ["psql", os.environ["DATABASE_URL"], "-tAc",
             "SELECT handle FROM accounts WHERE email='host@example.com';"],
            capture_output=True, text=True,
        ).stdout.strip()
        check("the account keeps the handle it had when a change is refused",
              stored_handle == "priya-raman", stored_handle)

        # The get-the-app page.
        hp.goto(f"{BASE}/app", wait_until="networkidle")
        hp.wait_for_timeout(800)
        check("the get-the-app page reads Get the App", "Get the App" in hp.inner_text("h1"))
        check("and draws its scan code", hp.locator("app-scan-code svg").count() == 1)

        browser.close()

    print("\n== console ==")
    if console_errors:
        for e in console_errors[:12]:
            print(f"  console: {e}")
        # A console error is a fault worth naming, but does not by itself fail a journey.
    else:
        print("  no console errors")

    print(f"\n{'FAILURES' if failures else 'All journey checks passed'}")
    for f in failures:
        print(f"  - {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
